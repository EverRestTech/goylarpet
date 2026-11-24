// Page-specific DOM rules. Keep translated text in locales.js.
(() => {
  const app = globalThis.goylarpet ??= {};
  const { language, rangeKey, rangeKeys, labelInfo, labelLanguage } = app.locales;
  const { isCurrency } = app.money;
  const balances = ['portfolio', 'cash'];
  const header = 'header, nav, [role="banner"], [role="navigation"]';
  const summary = 'main > header, [aria-label="Portfolio summary" i], [data-testid="portfolio-summary"]';
  const excluded = 'dialog,[role="dialog"],form,table,[role="table"],[role="grid"],article,aside,script,style,svg,canvas,template,[hidden],[aria-hidden="true"],[role="tooltip"],[contenteditable]:not([contenteditable="false"])';
  const interactive = 'a,button,[role="button"]';
  const controls = 'button,[role="tab"],[role="radio"],[role="button"],input[type="radio"]';
  const onPortfolio = () => /^\/(?:[a-z]{2,3}(?:-[a-z\d]{2,8})*\/)?portfolio\/?$/i.test(location.pathname);
  const pageLanguage = () => language(location.pathname, document.documentElement?.lang);
  const metricOf = text => labelInfo(text)?.id;
  function numberLanguages(...tags) {
    const langs = new Set();
    for (const tag of tags) {
      if (!tag || !/^[a-z]{2,3}(-[a-z\d]{2,8})*$/i.test(tag)) continue;
      try { langs.add(Intl.getCanonicalLocales(tag)[0]); } catch { /* Invalid page language tag. */ }
    }
    return [...langs];
  }
  function visible(el) {
    if (!el || el.closest(excluded) || getComputedStyle(el).visibility !== 'visible') return false;
    // display:contents has no box of its own even when its text is on screen.
    while (el && getComputedStyle(el).display === 'contents') el = el.parentElement;
    return Boolean(el?.getClientRects().length && (el.checkVisibility?.({ checkOpacity: true }) ?? true));
  }
  function texts(parent, accept = () => true, source = n => n.data) {
    if (parent.nodeType === Node.TEXT_NODE) return accept(parent) && visible(parent.parentElement) ? [parent] : [];
    const walker = document.createTreeWalker(parent, NodeFilter.SHOW_TEXT);
    const result = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (source(node).trim() && accept(node) && visible(node.parentElement)) result.push(node);
    }
    return result;
  }
  function periodOptions(root, lang, fallback) {
    function identify(buttons) {
      if (buttons.length < 2) return [];
      const items = buttons.map(button => {
        const aria = button.getAttribute('aria-label') || '';
        const label = button.textContent.trim() || aria;
        return { label: label.length < 50 ? label : '', aria,
          canonical: button.getAttribute('data-period') || button.getAttribute('data-range') || button.getAttribute('value') };
      });
      return rangeKeys(items, lang, fallback).flatMap((key,i) => key ?
        [{ button: buttons[i], id: 'pnl_' + key, dataRange: items[i].canonical }] : []);
    }
    let options = identify([...root.querySelectorAll(controls)].filter(visible));
    if (options.length < 2) {
      // Some segmented controls use plain sibling elements with click handlers.
      // Only accept a single strip made up entirely of recognized intervals.
      const strips = [];
      for (const parent of [root, ...root.querySelectorAll('div,ul,ol,[role="group"],[role="tablist"]')]) {
        if (parent.childElementCount < 2 || parent.closest('[role="img"],' + excluded)) continue;
        const children = [...parent.children].filter(visible);
        if (children.length < 2 || children.some(child => /^(?:svg|canvas|script|style)$/i.test(child.tagName))) continue;
        const strip = identify(children);
        if (strip.length === children.length) strips.push(strip);
      }
      if (strips.length === 1) options = strips[0];
    }
    return options;
  }

  const plotSelector = 'canvas,svg,[role="img"],[data-chart-plot],.recharts-wrapper,.tv-lightweight-charts';
  const tipSelector = '[role="tooltip"],[data-chart-tooltip],.recharts-tooltip-wrapper';
  function chartArea(root, heading, headings, scope) {
    const title = heading.parentElement.getBoundingClientRect();
    for (let card = root; card && card !== scope; card = card.parentElement) {
      if (headings.some(other => other !== heading && card.contains(other))) break;
      const plots = new Set();
      for (const el of card.querySelectorAll(plotSelector)) {
        if (el.closest(controls + ',a') || el.contains(heading)) continue;
        const box = el.getBoundingClientRect();
        if (box.width < 100 || box.height < 36 || box.bottom <= title.bottom) continue;
        // Chart libraries frequently put a transparent hit target over the SVG.
        const parent = el.parentElement;
        const outer = parent.getBoundingClientRect();
        const sameArea = !parent.contains(heading) && Math.abs(outer.height - box.height) < 8 && Math.abs(outer.width - box.width) < 8;
        plots.add(sameArea ? parent : el);
      }
      if (plots.size) return { card, plots: [...plots] };
    }
    return { card: root, plots: [] };
  }
  function plotAt(charts, target, x, y) {
    if (!(target instanceof Element)) return null;
    for (const { card, plots } of charts) {
      if (!card.contains(target) || target.closest(controls)) continue;
      for (const plot of plots) {
        if (plot.contains(target)) return card;
        const rect = plot.getBoundingClientRect();
        if (rect.width && rect.height && x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom) return card;
      }
    }
    return null;
  }
  function previewing(chart, pointerCard) {
    if (pointerCard === chart.card || chart.plots.some(el => el.matches(':hover,:focus-within'))) return true;
    return [...chart.card.querySelectorAll(tipSelector)].some(el => {
      const style = getComputedStyle(el);
      return isCurrency(el.textContent) && !el.closest('[hidden],[aria-hidden="true"]') &&
        el.getClientRects().length && style.visibility === 'visible' && style.opacity !== '0';
    });
  }

  let measure;
  function headlineLayout(chart, value, total, parsed) {
    if (Math.abs(total) < 100_000_000) return 'grouped';
    const { card } = chart;
    let branch = value.node.parentElement;
    while (!value.parts.every(part => branch.contains(part))) branch = branch.parentElement;
    let available = card.clientWidth;
    let sharesRow = false;
    // Reserve space for native siblings such as the share button and wordmark.
    // An inner flex group can be as narrow as its present text, so start at
    // the chart's outer width and account for siblings all the way to the card.
    for (; branch !== card; branch = branch.parentElement) {
      const parent = branch.parentElement;
      const css = getComputedStyle(parent);
      available -= parseFloat(css.paddingLeft) + parseFloat(css.paddingRight);
      if (!css.display.includes('flex') || !css.flexDirection.startsWith('row') || css.flexWrap !== 'nowrap') continue;
      for (const peer of parent.children) {
        if (peer === branch || !peer.getClientRects().length) continue;
        const other = getComputedStyle(peer);
        if (['absolute','fixed'].includes(other.position)) continue;
        sharesRow = true;
        available -= peer.getBoundingClientRect().width + (parseFloat(other.marginLeft) || 0) +
          (parseFloat(other.marginRight) || 0) + (parseFloat(css.columnGap) || 0);
      }
    }
    if (!sharesRow) return 'grouped';
    const font = getComputedStyle(value.node.parentElement);
    measure ??= document.createElement('canvas').getContext('2d');
    if (!measure) return 'grouped';
    measure.font = font.font || [font.fontWeight, font.fontSize, font.fontFamily].join(' ');
    const spacing = parseFloat(font.letterSpacing) || 0;
    let shortest = 'grouped', minWidth = Infinity;
    for (const layout of ['grouped','ungrouped','compact']) {
      const text = app.money.format(total, parsed, false, false, layout);
      if (!text || text.endsWith('.')) continue;
      const width = measure.measureText(text).width + text.length * spacing;
      if (width <= available) return layout;
      if (width < minWidth) { minWidth = width; shortest = layout; }
    }
    return shortest;
  }

  function layout(source) {
    const lang = pageLanguage();
    const portfolio = onPortfolio();
    const roots = new Set([...document.querySelectorAll(header + ',' + summary)].filter(el =>
      !el.closest(excluded) && ((el.matches(header) && !el.closest('main,[role="main"]')) || (portfolio && el.matches(summary)))));
    const charts = [], waiting = [];
    const scope = document.querySelector('main,[role="main"]') || document.body;
    if (portfolio && scope) {
      const headings = texts(scope, node => metricOf(node.data));
      const portfolioHeads = headings.filter(node => metricOf(node.data) === 'portfolio');
      for (const heading of headings) {
        const id = metricOf(heading.data);
        if (id === 'portfolio' || (id === 'cash' && [...roots].some(el => el.contains(heading)))) continue;
        let el = heading.parentElement;
        let chart = null, placeholder = null;
        for (let depth = 0; el && el !== scope && depth < 10; depth++, el = el.parentElement) {
          if (id === 'cash' && portfolioHeads.filter(node => el.contains(node)).length === 1) {
            roots.add(el);
            break;
          }
          if (id !== 'pnl') continue;
          if (headings.some(node => node !== heading && el.contains(node))) break;
          if (!placeholder || !placeholder.matches('section,[role="region"]')) placeholder = el;
          const chartLang = labelLanguage(heading.data, lang);
          const options = periodOptions(el, chartLang === 'en' ? lang : chartLang, lang);
          // A range toolbar can share a row with the heading; the amount is
          // often a sibling of that row. Use the nearest common chart card.
          if (options.length < 2) continue;
          if (!chart) chart = { root: el, options, label: heading.data.trim() };
          if (texts(el, n => isCurrency(source(n)) && !n.parentElement.closest(controls), source).length) {
            chart.root = el;
            chart.options = options;
            break;
          }
        }
        // A labelled card can render the headline before mounting its toolbar.
        if (!chart && id === 'pnl' && placeholder?.matches('section,[role="region"]')) {
          chart = { root: placeholder, options: [], label: heading.data.trim() };
        }
        if (chart) {
          const ranges = chart.options.map(option => option.id).sort().join(',');
          charts.push({ ...chart, key: location.pathname + location.search + '|' + ranges, ...chartArea(chart.root, heading, headings, scope) });
        }
        if (placeholder) waiting.push(placeholder);
      }
    }
    const formats = numberLanguages(location.pathname.split('/')[1], document.documentElement?.lang, lang);
    return { lang, formats, balanceRoots: [...roots], charts, portfolioScope: portfolio ? scope : null,
      roots: [...new Set([...roots, ...waiting, ...charts.map(c => c.card)])] };
  }

  function mightChangeRegions(node) {
    if (node.nodeType === Node.ELEMENT_NODE && (node.matches(header + ',' + summary) || node.querySelector(header + ',' + summary))) return true;
    if (!onPortfolio() || ![Node.ELEMENT_NODE, Node.TEXT_NODE].includes(node.nodeType) || !node.isConnected) return false;
    if (node.nodeType === Node.TEXT_NODE) return Boolean(metricOf(node.data));
    if (node.matches('main,[role="main"],body')) return true;
    // A shell can acquire its label before CSS reveals it. Actual amount
    // matching still checks visibility and excludes unrelated controls.
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) if (metricOf(walker.currentNode.data)) return true;
    return false;
  }

  function amountNode(nodes, source) {
    if (!nodes.length) return { issue: 'missing' };
    if (nodes.length === 1) {
      const text = source(nodes[0]).trim();
      if (/^[\s*•·…—–-]+$/u.test(text)) return { issue: 'missing' };
      return { node: nodes[0], parts: nodes };
    }
    const token = n => source(n).replace(/[\u061c\u200b-\u200f\u2066-\u2069]/gu, '').trim();
    const currency = nodes.find(n => /^[+−-]?\s*(?:US\s*\$|\$\s*US|USD|\$)\s*[+−-]?$/i.test(token(n)));
    const sign = nodes.find(n => /^[+−-]$/.test(token(n))) ||
      (currency && /[+−-]/.test(token(currency)) ? currency : null);
    const digits = nodes.filter(n => n !== sign && n !== currency);
    const [node] = digits;
    if (node && /\p{Nd}/u.test(token(node))) {
      if (digits.length === 1) return { node, sign, currency, parts: nodes };
      // Some headlines style their cents in a second span. Require an
      // explicit decimal boundary so independent whole amounts never merge.
      const fraction = digits.at(-1);
      const separator = digits.length === 3 && /^[.,٫]$/.test(token(digits[1])) ? digits[1] : null;
      const hasDecimal = digits.length === 2 && /^[.,٫]\p{Nd}{1,2}$/u.test(token(fraction));
      if (hasDecimal || (separator && /^\p{Nd}{1,2}$/u.test(token(fraction)))) {
        return { node, sign, currency, fraction, separator, parts: nodes };
      }
    }
    return { issue: 'ambiguous' };
  }

  // The daily change has its own percentage and localized caption.
  function dayChange(text) {
    const line = text.normalize('NFKC').replace(/[\u061c\u200b-\u200f\u2066-\u2069]/gu, '');
    return /\(\s*[+−-]?\s*[\p{Nd}.,'’\s٬٫]+\s*[%٪]\s*\)/u.test(line) && (line.match(/\$|USD/gi) || []).length === 1;
  }
  function pairedNode(labelText, root, source) {
    const label = labelText.parentElement;
    const term = label.closest('dt');
    if (term) {
      const value = term.nextElementSibling;
      return value?.matches('dd') && root.contains(value) ? amountNode(texts(value, undefined, source), source) : { issue: 'missing' };
    }
    let branch = labelText;
    for (let depth = 0; depth < 7 && branch !== root; depth++) {
      const group = branch.parentElement;
      if (!group || group === root || branch.matches?.(interactive)) break;
      const others = texts(group, undefined, source).filter(node => {
        if (branch.contains(node)) return false;
        for (let part = node.parentElement; part && part !== group; part = part.parentElement) {
          if (dayChange(part.textContent)) return false;
        }
        const control = node.parentElement.closest('button,[role="button"]');
        return !control || control.contains(label) || isCurrency(source(node)) || metricOf(node.data);
      });
      if (!others.length) { branch = group; continue; }
      if (others.some(node => metricOf(node.data))) break;
      // Navigation also uses the metric names on links with no balance.
      // Only associate a value with this label when its group contains money.
      if (others.some(node => isCurrency(source(node)) || /\p{Sc}/u.test(source(node)))) {
        const parts = others.filter(n => isCurrency(source(n)) || /[\p{Nd}\p{Sc}]/u.test(source(n)) || /^[+−.,٫-]$/.test(source(n).trim()));
        return amountNode(parts, source);
      }
      branch = group;
    }
    return { issue: 'missing' };
  }

  const selectionFlags = ['aria-selected','aria-pressed','aria-checked','data-selected','data-active'];
  function isSelected(button) {
    return button.checked === true || selectionFlags.some(k => button.getAttribute(k) === 'true') ||
      ['active','checked','on','selected'].includes(button.getAttribute('data-state')) ||
      button.getAttribute('aria-current') === 'true' || ['active','selected','is-active'].some(c => button.classList.contains(c));
  }
  function painted(style) {
    const color = style.backgroundColor;
    return style.visibility === 'visible' && Number(style.opacity) > 0 &&
      (style.backgroundImage !== 'none' || (color !== 'transparent' && !/^rgba\([^)]*,\s*0\s*\)$/.test(color)));
  }
  function hasSelectionPill(button) {
    const box = button.getBoundingClientRect();
    const covers = (width, height) => width >= box.width * .65 && height >= box.height * .6;
    // Native segmented controls can put the selected background on an inset
    // child or pseudo-element while every button has the same background.
    for (const el of button.querySelectorAll('span,div,i')) {
      const rect = el.getBoundingClientRect();
      if (covers(rect.width, rect.height) && painted(getComputedStyle(el))) return true;
    }
    return ['::before','::after'].some(pseudo => {
      const style = getComputedStyle(button, pseudo);
      return style.content !== 'none' && style.content !== 'normal' &&
        covers(parseFloat(style.width), parseFloat(style.height)) && painted(style);
    });
  }
  function selectedOption(options, lastId) {
    const marked = options.filter(o => isSelected(o.button));
    if (marked.length) return marked.length === 1 ? marked[0] : null;
    options = options.filter(({ button }) => button.checked !== false &&
      !selectionFlags.some(k => button.getAttribute(k) === 'false') &&
      !['inactive','off','unchecked'].includes(button.getAttribute('data-state')));
    const openPanels = options.filter(o => {
      const panel = document.getElementById(o.button.getAttribute('aria-controls') || '');
      return panel?.getAttribute('role') === 'tabpanel' && visible(panel);
    });
    if (openPanels.length === 1) return openPanels[0];
    // Flat segmented buttons sometimes expose selection only as a CSS class.
    const prior = options.find(o => o.id === lastId);
    const pills = options.filter(o => hasSelectionPill(o.button));
    if (pills.length === 1) return pills[0];
    const filled = options.filter(o => [...o.button.classList].some(c => /^bg-(?!transparent$|none$).+/.test(c)) && painted(getComputedStyle(o.button)));
    if (filled.length === 1) return filled[0];
    const backgrounds = options.map(o => {
      const style = getComputedStyle(o.button);
      return painted(style) ? style.backgroundColor + style.backgroundImage : '';
    });
    const highlighted = options.filter((o, i) => backgrounds[i] &&
      backgrounds.indexOf(backgrounds[i]) === backgrounds.lastIndexOf(backgrounds[i]));
    if (new Set(backgrounds).size === 2 && highlighted.length === 1) {
      const [option] = highlighted;
      if (!prior || prior === option || !option.button.matches(':hover')) return option;
    }
    // A transient repaint can remove the decoration and recreate every
    // button. The last known logical range still belongs to this chart.
    return prior || null;
  }
  function chartAmount(chart, source) {
    const { root, plots } = chart;
    const matches = new Map();
    // Only standalone USD text outside controls and chart artwork is eligible.
    const outsideControls = n => !n.parentElement.closest(controls + ',[role="img"],[role="table"],' + tipSelector) && !plots.some(el => el.contains(n));
    const nodes = texts(root, outsideControls, source);
    for (const node of nodes) {
      const raw = source(node).trim();
      if (!isCurrency(raw)) continue;
      let match = /\p{Nd}/u.test(raw) ? amountNode([node], source) : null;
      for (let group = node.parentElement; group && root.contains(group); group = group.parentElement) {
        const parts = texts(group, outsideControls, source);
        if (parts.length > 5) break;
        const candidate = amountNode(parts, source);
        if (candidate.node && parts.includes(node) && parts.some(n => /\p{Nd}/u.test(source(n)))) match = candidate;
        else if (parts.length > 1) break;
      }
      if (!match) return { issue: 'format' };
      matches.set(match.node, match);
    }
    return matches.size === 1 ? [...matches.values()][0] : { issue: matches.size ? 'ambiguous' : 'missing' };
  }
  function scan(source, scene = layout(source), selection, pointerCard) {
    const { lang, balanceRoots, charts } = scene;
    const found = Object.fromEntries(balances.map(id => [id, { nodes: new Map(), issues: new Set() }]));
    const owners = new Map();
    const formats = new Set(scene.formats);
    function add(id, match, label) {
      const { node, parts, issue } = match;
      if (!node) {
        if (issue !== 'missing') found[id].issues.add(issue);
        return;
      }
      const sample = parts.map(source).join('');
      const languages = numberLanguages(node.parentElement.closest('[lang]')?.lang, labelLanguage(label, lang), ...scene.formats);
      for (const language of languages) formats.add(language);
      const parsed = app.money.parse(sample, languages);
      if (!parsed) {
        found[id].issues.add(sample.trimEnd().endsWith('.') && app.money.readSite(sample.trimEnd().slice(0,-1), languages) !== null ? 'marked' : 'format');
        return;
      }
      const previous = owners.get(node);
      if (previous && previous !== id) {
        found[previous].issues.add('ambiguous');
        found[id].issues.add('ambiguous');
      }
      owners.set(node, id);
      found[id].nodes.set(node, { ...match, real: parsed.value, parsed });
    }
    for (const root of balanceRoots) {
      for (const text of texts(root, n => metricOf(n.data))) {
        const id = metricOf(text.data);
        if (!found[id] || balanceRoots.some(other => other !== root && root.contains(other) && other.contains(text))) continue;
        const match = pairedNode(text, root, source);
        if (match.node && text.parentElement.closest(interactive) !== match.node.parentElement.closest(interactive)) found[id].issues.add('ambiguous');
        else add(id, match, text.data);
      }
    }
    const periods = new Set();
    let activePeriod = null;
    let chartIssue = null;
    let chartBusy = false;
    let chartPreview = false;
    let currentPanel = false;
    let unselectedAmount = null;
    for (const chart of charts) {
      const { root, card, options, label } = chart;
      for (const { id } of options) {
        periods.add(id);
        found[id] ??= { nodes: new Map(), issues: new Set() };
      }
      const active = options.length && selectedOption(options, selection?.key === chart.key ? selection.id : null);
      const match = chartAmount(chart, source);
      if (!active || charts.length !== 1 || new Set(options.map(o => o.id)).size !== options.length) {
        chartIssue = 'Select a time range on the P&L chart';
        if (!active && charts.length === 1 && match.node && app.money.parse(match.parts.map(source).join(''), scene.formats)) {
          unselectedAmount = match;
        }
        continue;
      }
      activePeriod = active.id;
      const loading = '[aria-busy="true"],[role="progressbar"],[data-loading="true"],[data-state="loading"],[data-status="loading"],[data-slot="skeleton"],.animate-pulse';
      const panel = match.node?.parentElement.closest('[role="tabpanel"],[data-period],[data-range]');
      let previousPanel = false;
      if (panel && root.contains(panel)) {
        const period = panel.getAttribute('data-period') || panel.getAttribute('data-range');
        const keys = [rangeKey(period, 'en'), rangeKey(period, labelLanguage(label, lang)), rangeKey(period, lang)].filter(Boolean);
        const labelledBy = (panel.getAttribute('aria-labelledby') || '').split(/\s+/);
        const owners = options.filter(o => o.button.id && labelledBy.includes(o.button.id));
        const differentOwner = owners.length > 0 && (owners.length !== 1 || owners[0] !== active);
        const differentRange = keys.length > 0 && !keys.includes(active.id.slice(4)) && !keys.includes(rangeKey(active.dataRange, 'en'));
        previousPanel = differentOwner || differentRange;
        currentPanel = !previousPanel && (owners.length === 1 || keys.includes(active.id.slice(4)));
      }
      // A visible skeleton is often aria-hidden because it is decorative.
      if (previousPanel || root.closest('[aria-busy="true"],[data-loading="true"]') || card.matches(loading) ||
          [...card.querySelectorAll(loading)].some(el => el.getClientRects().length && getComputedStyle(el).visibility === 'visible')) {
        chartBusy = true;
        chartIssue = 'Waiting for the P&L chart to finish loading';
      }
      chartPreview = previewing(chart, pointerCard);
      if (chartPreview) chartIssue = 'Move off the plot to read the current P&L total';
      // Keep the location of the headline even while the old panel is on
      // screen. chartBusy prevents its value from becoming the new total.
      add(active.id, match, label);
    }
    return { scene, found, formats: [...formats], periods: [...periods], activePeriod, chartIssue, chartBusy, chartPreview, currentPanel, unselectedAmount };
  }
  app.balances = { balances, scan, mightChangeRegions, onPortfolio, plotAt, headlineLayout, visible };
})();
