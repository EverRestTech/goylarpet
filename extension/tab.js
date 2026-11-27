// This state belongs to one top-level document in Chrome's isolated world.
(function installTab() {
  const app = globalThis.goylarpet;
  if (location.origin !== 'https://polymarket.com' || window !== top) return;
  if (app.earlyProfile) {
    const pending = app.earlyProfile;
    const fields = app.startingFields;
    delete app.earlyProfile;
    delete app.startingFields;
    if (fields?.length && !app.tab) {
      installTab();
      app.tab({ action: 'prepare', fields });
    }
    void pending.then(profile => {
      if (fields?.length && app.tab) { app.tab({ action: 'finish-start', profile }); return; }
      if (!profile || app.tab) return;
      installTab();
      app.tab({ action: 'resume', profile });
    });
    return;
  }
  // A reloaded extension gets a new isolated world in the same document.
  // Give the previous one a chance to restore its text before we read it.
  const contextCheckEvent = 'goylarpet:check-context';
  document.dispatchEvent(new Event(contextCheckEvent));
  if (app.tab) return;
  const runtime = chrome.runtime;
  const { balances, headlineLayout, mightChangeRegions, plotAt, scan, visible } = app.balances;
  const reusedValueMs = 900;
  const zeroQuietMs = 1200;
  let tracked = new Map();
  const chartTotals = new Map();
  let profile = null;
  let preparing = false;
  let scene = null;
  let periods = [];
  let formats = [];
  let notes = [];
  let info = '';
  let selection = null;
  let pointerCard = null;
  let range = null;
  let rangeTimer = null;
  let contextTimer = null;
  const revealing = new Set();
  let revealFrame = null;
  let retired = false;
  let copies = 0;

  function source(node) {
    const record = tracked.get(node);
    return record && node.data === record.painted ? record.raw : node.data;
  }
  function restore(node, record) {
    if (node.data === record.painted) node.data = record.raw;
  }
  function sameSubtree(a, b) {
    if (a.isEqualNode(b)) return true;
    if (a.nodeType !== Node.ELEMENT_NODE || b.nodeType !== Node.ELEMENT_NODE || a.nodeName !== b.nodeName ||
        a.namespaceURI !== b.namespaceURI || a.childNodes.length !== b.childNodes.length) return false;
    const attrs = new Set([...a.getAttributeNames(), ...b.getAttributeNames()]);
    for (const key of attrs) {
      if (key !== 'class' && key !== 'style' && a.getAttribute(key) !== b.getAttribute(key)) return false;
    }
    return [...a.childNodes].every((child,i) => sameSubtree(child, b.childNodes[i]));
  }
  function inheritPaint(old, replacement) {
    // Replacing bare Text (including via textContent) is a fresh site write,
    // even if it happens to equal the number we last displayed.
    if (old.nodeType !== Node.ELEMENT_NODE || old.isConnected || !replacement.isConnected) return;
    const owned = [...tracked.keys()].filter(node => old.contains(node) && node.data === tracked.get(node).painted);
    if (!owned.length || !sameSubtree(old, replacement)) return;
    // A cloned header can carry our displayed number into new Text nodes. Match the
    // removed subtree and child positions before transferring the raw strings.
    for (const node of owned) {
      const path = [];
      for (let part = node; part !== old; part = part.parentNode) {
        path.push(Array.prototype.indexOf.call(part.parentNode.childNodes, part));
      }
      let copy = replacement;
      for (const index of path.reverse()) copy = copy.childNodes[index];
      tracked.set(copy, { ...tracked.get(node) });
    }
  }
  function absorb(records) {
    const removed = [];
    for (const change of records) {
      const record = change.type === 'characterData' && tracked.get(change.target);
      if (record) {
        record.raw = change.target.data;
        record.painted = null;
      } else if (change.type === 'childList') {
        if (change.removedNodes.length === change.addedNodes.length) {
          change.removedNodes.forEach((old, i) => inheritPaint(old, change.addedNodes[i]));
        } else if (change.removedNodes.length === 1 && !change.addedNodes.length) {
          removed.push(change);
        } else if (!change.removedNodes.length && change.addedNodes.length === 1) {
          // remove() and insertBefore()/append() emit separate records for
          // the same child position when a framework remounts a component.
          const i = removed.findIndex(prior => prior.target === change.target &&
            prior.previousSibling === change.previousSibling && prior.nextSibling === change.nextSibling);
          if (i >= 0) inheritPaint(removed.splice(i, 1)[0].removedNodes[0], change.addedNodes[0]);
        }
      }
    }
  }
  function relevant(change) {
    const roots = scene?.roots || [];
    if (roots.some(root => root.contains(change.target))) return true;
    if (change.type === 'characterData') return mightChangeRegions(change.target);
    if (change.type === 'attributes') return roots.some(root => change.target.contains(root)) || mightChangeRegions(change.target);
    return [...change.removedNodes].some(node => roots.some(root => node.contains(root))) ||
      [...change.addedNodes].some(mightChangeRegions);
  }
  const observer = new MutationObserver(records => {
    if (records.some(relevant)) refresh(records);
  });
  const discovery = {
    subtree: true, childList: true, attributes: true,
    attributeFilter: ['role','lang','aria-label','aria-labelledby','aria-controls','aria-hidden','aria-selected','aria-pressed','aria-current','aria-checked','aria-busy',
      'data-testid','data-range','data-period','data-state','data-loading','data-status','data-slot','data-selected','data-active','hidden','class','style','contenteditable','checked']
  };

  const caption = id => (id.startsWith('pnl_') ? 'Profit/Loss · ' : '') + app.locales.englishName(id);
  function issueText(id, issue) {
    const text = {
      missing: 'waiting for a labelled balance', format: 'unrecognized USD format', ambiguous: 'multiple possible amounts',
      marked: 'already marked by an extension — disable any other copy of goylarpet and reload the tab'
    };
    return caption(id) + ' — ' + text[issue];
  }
  function cancelHold() {
    clearTimeout(rangeTimer);
    rangeTimer = null;
    if (range) range.pending = null;
  }
  function clearRange() {
    cancelHold();
    range = null;
  }
  function chartSample(match) {
    const field = match.found[match.activePeriod];
    if (field && field.nodes.size === 1 && !field.issues.size) return field.nodes.values().next().value;
    return null;
  }
  function holdValue(real, duration) {
    if (range.pending !== real) {
      clearTimeout(rangeTimer);
      range.pending = real;
      rangeTimer = setTimeout(() => { rangeTimer = null; refresh(); }, duration);
    }
    return rangeTimer !== null;
  }
  function chartTotal(match, changes) {
    const id = match.activePeriod;
    if (!id || !(id in profile.amounts)) { clearRange(); return null; }
    if (range?.id !== id) {
      const previous = range?.sample;
      clearRange();
      range = { id, previous };
    }
    const value = chartSample(match);
    const last = chartTotals.get(id);
    range.ready = false;
    range.sample = value && { node: value.node, real: value.real };
    if (match.chartBusy || match.chartPreview || !value) {
      cancelHold();
      range.previous = null;
      range.preview = match.chartPreview ? range.sample : null;
      return last;
    }
    const { real, parsed } = value;
    const written = changes.some(m => m.type === 'characterData' && value.parts.includes(m.target));
    // Leaving the plot can precede the site's write restoring the current total.
    if (range.preview?.node === value.node && range.preview.real === real && last?.real !== real && !written) return last;
    range.preview = null;
    // On a revisit the toolbar can switch before its reused Text node does.
    // Only hold a known total when the site supplies evidence of a transition.
    const reused = range.previous?.node === value.node && range.previous.real === real && !written && !match.currentPanel;
    if (!reused) range.previous = null;
    const current = { real, plus: parsed.plus };
    const delay = real === 0 && last && last.real !== 0 ? zeroQuietMs : reused ? reusedValueMs : 0;
    if (last?.real !== real && delay && holdValue(real, delay)) return last || current;
    cancelHold();
    range.previous = null;
    range.ready = true;
    chartTotals.set(id, current);
    return current;
  }
  function conceal(amount, next) {
    for (const part of amount.parts) next.set(part, { raw: source(part), painted: part === amount.node ? '—' : '' });
  }
  function refresh(records = []) {
    if (!profile || !checkContext(records)) return;
    const changes = [...records, ...observer.takeRecords()];
    absorb(changes);
    const sameRegions = scene && changes.length && changes.every(m =>
      (m.type === 'characterData' && tracked.has(m.target)) ||
      scene.charts.some(chart => chart.plots.some(plot => plot.contains(m.target))));
    const match = scan(source, sameRegions ? scene : undefined, selection, pointerCard);
    const { activePeriod } = match;
    if (activePeriod) selection = { key: match.scene.charts[0].key, id: activePeriod };
    else if (!app.balances.onPortfolio() || match.scene.charts.length > 1) selection = null;
    const pnl = chartTotal(match, changes);
    scene = match.scene;
    periods = match.periods;
    formats = match.formats;
    notes = [];
    info = '';
    copies = 0;
    const next = new Map();
    const ids = Object.keys(profile.amounts);
    const hasPnl = ids.some(id => id.startsWith('pnl_'));
    if (hasPnl && match.unselectedAmount) conceal(match.unselectedAmount, next);
    for (const id of ids) {
      const isPeriod = id.startsWith('pnl_');
      if (isPeriod && activePeriod !== id) continue;
      const { nodes, issues } = match.found[id] || { nodes: new Map(), issues: new Set() };
      if (!nodes.size && !issues.size && !isPeriod) issues.add('missing');
      for (const issue of issues) notes.push(issueText(id, issue));
      if (issues.has('ambiguous')) continue;
      if (isPeriod && !range?.ready) {
        info = nodes.size ? 'Reading ' + caption(id) + ' from the chart' : 'Waiting for a visible USD amount for ' + caption(id);
      }
      for (const [node, value] of nodes) {
        if (preparing || (isPeriod && !pnl)) {
          // A uniquely identified headline can be mounted before its data.
          // Keep every raw fragment so a site update or Disable can restore it.
          conceal(value, next);
          continue;
        }
        const total = (isPeriod ? pnl.real : value.real) + profile.amounts[id];
        const parsed = isPeriod ? { ...value.parsed, plus: pnl.plus } : value.parsed;
        const layout = isPeriod ? headlineLayout(scene.charts[0], value, total, parsed) : 'grouped';
        const signPart = value.sign || (!parsed.suffix && value.currency);
        const printed = app.money.format(total, parsed, Boolean(value.currency), Boolean(signPart), layout);
        const decimalMark = value.fraction && total % 100 ? parsed.decimalMark : '';
        const cut = decimalMark ? printed.lastIndexOf(decimalMark) : printed.length;
        for (const part of value.parts) {
          const raw = source(part);
          let fragment = raw.trim();
          if (part === node) fragment = printed.slice(0, cut);
          if (part === value.separator) fragment = decimalMark;
          if (part === value.fraction) fragment = printed.slice(cut + (value.separator ? decimalMark.length : 0));
          if (part === signPart) {
            const sign = app.money.signFor(total, parsed);
            if (part !== value.currency) fragment = sign;
            else if (value.sign) fragment = fragment.replace(/[+−-]/u, sign).trim();
            else fragment = sign + fragment;
          }
          const painted = raw.replace(/\S[\s\S]*\S|\S/, () => fragment);
          next.set(part, { raw, painted });
        }
        copies++;
      }
    }
    if (hasPnl) {
      if (match.chartIssue) info = match.chartIssue;
      else if (!activePeriod && app.balances.onPortfolio()) info = 'Waiting for the Profit/Loss chart and its selected range';
    }
    // Finish reading the entire chart before pausing observation for our own writes.
    observer.disconnect();
    try {
      for (const [node, record] of tracked) if (!next.has(node)) restore(node, record);
      tracked = next;
      for (const [node, { painted }] of next) if (node.data !== painted) node.data = painted;
    } finally {
      observer.observe(document, discovery);
      const withText = { ...discovery, characterData: true };
      if (scene.portfolioScope) observer.observe(scene.portfolioScope, withText);
      for (const root of scene.roots) observer.observe(root, withText);
    }
  }
  function routeChanged() { refresh(); }
  function rememberFields(entry) {
    if (preparing || !profile || !entry?.id || !checkContext()) return;
    try { sessionStorage.setItem('goylarpet:next', [entry.id, ...Object.keys(profile.amounts)].join(',')); }
    catch { /* The document_start lookup also works without the one-use hint. */ }
  }
  function pageSwap(event) {
    const next = event.activation;
    if (next?.entry?.url && new URL(next.entry.url).origin === location.origin) {
      rememberFields(next.from);
    }
  }
  function checkReveals() {
    revealFrame = null;
    let changed = false;
    for (const el of revealing) {
      if (visible(el)) { revealing.delete(el); changed = true; }
      else if (!el.isConnected || !el.getAnimations().some(a => a.playState === 'running' && a.effect?.getComputedTiming().endTime < Infinity)) revealing.delete(el);
    }
    if (changed) refresh();
    if (revealing.size) revealFrame = requestAnimationFrame(checkReveals);
  }
  function chartVisualChange(event) {
    if (!scene || !(event.target instanceof Element)) return;
    const el = event.target;
    if (!scene.roots.some(root => root.contains(el) || el.contains(root)) && !mightChangeRegions(el)) return;
    if (['animationstart','transitionrun','transitionstart'].includes(event.type) && !visible(el) && app.money.isCurrency(el.textContent)) {
      revealing.add(el);
      if (revealFrame === null) revealFrame = requestAnimationFrame(checkReveals);
    }
    refresh();
  }
  function chartPointer(event) {
    const target = event.type === 'pointerout' ? event.relatedTarget : event.target;
    const card = event.type === 'pointercancel' ? null : plotAt(scene?.charts || [], target, event.clientX, event.clientY);
    if (card === pointerCard) return;
    pointerCard = card;
    refresh();
  }
  function chartFocus(event) {
    if (scene?.charts.some(chart => chart.card.contains(event.target))) queueMicrotask(routeChanged);
  }
  function chartClick(event) {
    if (scene?.charts.length !== 1) return;
    const chart = scene.charts[0];
    const option = chart.options.find(item => item.button.contains(event.target));
    if (!option) return;
    selection = { key: chart.key, id: option.id };
    // Let the site's event handler and its mutations be observed together.
    requestAnimationFrame(routeChanged);
  }
  function listen(add) {
    const method = add ? 'addEventListener' : 'removeEventListener';
    for (const event of ['popstate','hashchange','pageshow','resize','focus']) window[method](event, routeChanged);
    window[method]('pageswap', pageSwap);
    document[method]('visibilitychange', routeChanged);
    window.navigation?.[method]('currententrychange', routeChanged);
    window[method]('click', chartClick, true);
    for (const event of ['change','transitionrun','transitionstart','transitionend','transitioncancel','animationstart','animationend','animationcancel']) window[method](event, chartVisualChange, true);
    for (const event of ['pointerover','pointermove','pointerout','pointercancel']) window[method](event, chartPointer, true);
    for (const event of ['focusin','focusout']) window[method](event, chartFocus, true);
  }
  function stop(records = [], restoreText = true) {
    absorb([...records, ...observer.takeRecords()]);
    observer.disconnect();
    listen(false);
    clearInterval(contextTimer);
    contextTimer = null;
    cancelAnimationFrame(revealFrame);
    revealFrame = null;
    revealing.clear();
    if (restoreText) for (const [node, record] of tracked) restore(node, record);
    tracked.clear();
    profile = scene = selection = pointerCard = null;
    preparing = false;
    chartTotals.clear();
    clearRange();
    copies = 0;
    info = '';
    notes = [];
  }
  function retire(records) {
    if (retired) return;
    retired = true;
    stop(records);
    document.removeEventListener(contextCheckEvent, onContextCheck);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('pageshow', onPageShow);
    delete app.tab;
  }
  function checkContext(records) {
    if (retired) return false;
    try {
      if (globalThis.chrome?.runtime === runtime && runtime?.id) return true;
    } catch {
      // Some Chrome versions throw when a property of the old runtime is read.
    }
    retire(records);
    return false;
  }
  function onContextCheck() { checkContext(); }
  async function onPageShow(event) {
    if (!event.persisted || !checkContext()) return;
    try { sessionStorage.removeItem('goylarpet:next'); } catch { /* Optional handoff. */ }
    const cached = profile;
    try {
      const active = await runtime.sendMessage({ action: 'page-returned' });
      if (!active && profile === cached) stop();
    } catch (error) {
      // A reload may invalidate the binding before it can return a Promise.
      if (error?.message?.includes('Extension context invalidated')) retire();
      else if (checkContext() && profile === cached) stop();
    }
  }
  function status() {
    if (!profile) {
      const match = scan(source);
      ({ periods, formats } = match);
    }
    return { enabled: Boolean(profile) && !preparing, profile: preparing ? null : profile, notes, info, periods, formats, copies,
      activeRange: range?.ready ? range.id : null, onPortfolio: app.balances.onPortfolio() };
  }
  function activate(amounts, pending = false) {
    preparing = pending;
    if (!profile) {
      listen(true);
      // Also release a quiet tab when Chrome unloads the extension. Reading
      // the local binding does not wake the service worker.
      contextTimer = setInterval(onContextCheck, 1000);
    }
    // Preserve the saved profile shape. Each entered amount is now its own
    // offset, including when resuming profiles from the starting-balance UI.
    profile = { amounts, offsets: amounts };
    refresh();
  }
  // Chrome freezes a cached document with its current text. Keep its adjusted
  // frame available for Back/Forward until onPageShow rechecks the tab session.
  function onPageHide(event) {
    if (!('onpageswap' in window)) rememberFields(window.navigation?.currentEntry);
    if (!event.persisted) stop([], false);
  }
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);
  document.addEventListener(contextCheckEvent, onContextCheck);

  function enable(amounts) {
    if (!Object.keys(amounts).length) throw new Error('Enter at least one adjustment');
    absorb(observer.takeRecords());
    const match = scan(source, undefined, selection, pointerCard);
    for (const [id, amount] of Object.entries(amounts)) {
      const isPeriod = /^pnl_(?:\d{1,3}(?:[hdwmy]|min)|[ymqw]td|all)$/.test(id);
      if (!balances.includes(id) && !isPeriod) throw new Error('Unknown portfolio field');
      if (!Number.isSafeInteger(amount) || Math.abs(amount) > app.money.limit) {
        throw new Error('Enter a valid amount for ' + caption(id));
      }
      if (isPeriod && (match.activePeriod !== id || match.chartBusy || match.chartPreview)) continue;
      const issue = match.found[id].issues.values().next().value;
      if (issue) throw new Error(issueText(id, issue));
    }
    clearRange();
    activate(amounts);
  }
  app.tab = request => {
    if (!checkContext()) return { enabled: false, error: 'The extension was reloaded — reopen goylarpet in this tab' };
    try {
      if (request.action === 'prepare') {
        const amounts = Object.fromEntries(request.fields.map(id => [id, 0]));
        activate(amounts, true);
      }
      if (request.action === 'finish-start' && preparing) {
        if (request.profile) activate(request.profile.amounts);
        else stop();
      }
      if (request.action === 'enable') enable(request.amounts);
      if (request.action === 'disable') stop();
      if (request.action === 'resume') activate(request.profile.amounts);
      if (request.action === 'status' && request.recheck && profile) refresh();
      return status();
    } catch (error) {
      refresh();
      return { ...status(), error: error.message };
    }
  };
})();
