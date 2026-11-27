const { test } = require('node:test');
const assert = require('node:assert/strict');
const { browser, offlinePortfolio, until } = require('./browser.cjs');
require('../extension/locales.js');
require('../extension/money.js');
const { locales, money } = globalThis.goylarpet;

test('localized chart labels and signed USD amounts', () => {
  for (const [locale, token, id] of [
    ['fr','1J','1d'], ['es','1A','1y'], ['ru','1Н','1w'], ['de','1T','1d'],
    ['ja','1か月','1m'], ['ko','1개월','1m'], ['zh-Hant','1週','1w'], ['ar','١٢ ساعة','12h'],
    ['tr','Tümü','all'], ['pt','Desde o início do ano','ytd'], ['en','6H','6h'], ['en','90D','90d'],
    ['ru','30 дней','30d'], ['hi','१२ दिन','12d'], ['en','15 minutes','15min']
  ]) assert.equal(locales.rangeKey(token, locale), id);
  for (const [text, lang, value] of [
    ['−1.234,56 $','de',-123456], ['+1 234,56 $US','fr',123456], ['+١٢٫٥٠ US$','ar',1250],
    ['-$1,23,456.78','hi',-12345678], ['$0.13','ru',13], ['+$123','en',12300],
    ["$-1’234.56",'de-CH',-123456], ['(1 234,56 $ US)','fr-CA',-123456], ['−\u200b$24.18','ru',-2418],
    ['$1 234.56','ru',123456], ['1.234,56 USD','en',123456]
  ]) assert.equal(money.readSite(text, lang), value);
  assert.equal(money.readInput('-15,25','fr'), -1525);
  for (const s of ['$1.2K','$5.00.','$25 (2%)','$--8']) assert.equal(money.readSite(s,'en'), null);
  for (const lang of ['en','fr','ru','ja','hi','ar']) {
    const parsed = { style:lang, decimalMark:new Intl.NumberFormat(lang).formatToParts(1.5).find(p => p.type === 'decimal').value, currency:'$', suffix:true };
    const compact = new Intl.NumberFormat(lang, { notation:'compact' }).format(100000000);
    assert.equal(money.format(10000000000, parsed, false, false, 'compact'), compact + ' $');
    assert.equal(money.format(10000000001, parsed, false, false, 'compact'), null);
    assert.equal(money.format(10000000100, parsed, false, false, 'compact'), null);
  }
});

test('each of the six Russian chart periods gets its own amount when four real totals are identical', {timeout: 35000}, async t => {
  const ctx = await browser();
  t.after(() => ctx.close());
  const app = await offlinePortfolio(ctx);
  const page = ctx.pages()[0];
  await page.goto('https://polymarket.com/ru/portfolio');
  const chart = page.locator('.pnl');
  await chart.evaluate(el => {
    const buttons = [...el.querySelectorAll('button')];
    const real = ['$0', '-$9.40', '-$24.18', '-$24.18', '-$24.18', '-$24.18'];
    let shown = real[0];
    const heading = el.querySelector('[data-pnl]');
    buttons[4].textContent = 'YTD';
    buttons.forEach((button, i) => {
      button.removeAttribute('aria-pressed');
      button.style.backgroundColor = i === 0 ? '#303136' : 'transparent';
      button.onclick = () => {
        for (const other of buttons) other.style.backgroundColor = other === button ? '#303136' : 'transparent';
        if (real[i] === shown) return; // React reuses the same number and text node.
        if (i === 1) heading.replaceChildren(document.createTextNode('$0'));
        shown = real[i];
        setTimeout(() => { heading.firstChild.data = real[i]; }, 180);
      };
    });
  });
  let popup = await app.open(page);
  const inputs = { '1d':'1000', '1w':'10000', '1m':'10', '1y':'1000', ytd:'200', all:'1000000' };
  for (const [id, amount] of Object.entries(inputs)) await popup.fill('#amount-pnl_' + id, amount);
  await popup.fill('#amount-portfolio','1000');
  await popup.fill('#amount-cash','10000');
  await popup.click('button[type=submit]');
  const expect = s => until(() => chart.locator('[data-pnl]').textContent().then(v => v === s), 'Expected ' + s);
  await expect('$1,000');
  await popup.close();
  for (const [index, expected] of [[1,'$9,990.60'], [2,'-$14.18'], [3,'$975.82'], [4,'$175.82'], [5,'$999,975.82'], [2,'-$14.18']]) {
    await chart.locator('button').nth(index).click();
    await expect(expected);
  }
  await chart.locator('[data-pnl]').evaluate(el => { el.firstChild.data = '-$22.18'; });
  await expect('-$12.18');
  popup = await app.open(page);
  assert.equal(await popup.text('#status'), '');
  const examples = await popup.evaluate(`[...document.querySelectorAll('.help')].map(label => {
    const range = document.createRange();
    range.selectNodeContents(label);
    const rows = [...range.getClientRects()].filter(rect => rect.width > 0).map(rect => rect.top);
    return { text: label.innerText, lines: new Set(rows).size };
  })`);
  assert.deepEqual(examples, [
    { text: 'Add your amount to the real Portfolio or Cash balance\n$100 (real) + $900 (added) = $1,000 (total)', lines: 2 },
    { text: 'Add your amount to the period’s real profit or loss\n$100 (real) + $900 (added) = $1,000 (total)', lines: 2 }
  ]);
  assert.equal(await popup.text('footer .author-link'), 'Support the author ↗');
  const rects = await popup.evaluate('[...document.querySelectorAll("#ranges input")].map(el=>{const r=el.getBoundingClientRect();return [r.x,r.top,r.bottom,r.width]})');
  assert.equal(rects.length, 6);
  assert.ok(rects.every(([x,top,,width],i) => x === rects[0][0] && width === rects[0][3] && (!i || top >= rects[i-1][2])), 'Each period needs its own row');
  assert.ok(await popup.evaluate('document.body.offsetHeight <= 600 && document.body.scrollWidth === document.body.offsetWidth'), 'The six fields and actions should fit in the Chrome popup');
  await popup.click('#disable');
  await expect('-$22.18');
  assert.equal(await page.locator('[data-day]').textContent(), '$0.00 (0.00%) за день');
  await popup.close();
});

test('a site write immediately after Enable uses the visible range’s original offset', async t => {
  const ctx = await browser();
  t.after(() => ctx.close());
  const app = await offlinePortfolio(ctx);
  const page = ctx.pages()[0];
  await page.goto('https://polymarket.com/ru/portfolio');
  const headline = page.locator('[data-pnl]');
  await headline.evaluate(el => { el.firstChild.data = '-$24.18'; });
  const popup = await app.open(page);
  await popup.fill('#amount-pnl_1d','10');
  await popup.click('button[type=submit]');
  await until(() => popup.text('#mode').then(v => v === 'On in tab'), 'Could not enable');
  await headline.evaluate(el => { el.firstChild.data = '-$22.18'; });
  await until(() => headline.textContent().then(v => v === '-$12.18'), 'The first genuine gain after Enable was lost');
  await popup.disable();
  assert.equal(await headline.textContent(),'-$22.18');
  await popup.close();
});

test('a localized range strip and split negative amount survive delayed initialization and unchanged values', async t => {
  const ctx = await browser();
  t.after(() => ctx.close());
  const app = await offlinePortfolio(ctx);
  const page = ctx.pages()[0];
  await page.goto('https://polymarket.com/ru/portfolio');
  await page.locator('.pnl').evaluate(chart => {
    chart.setAttribute('aria-busy', 'true');
    chart.querySelector('[data-pnl]').replaceChildren();
    const row = chart.querySelector('[role="group"]');
    row.replaceChildren();
    for (const label of ['6Ч','12Ч','1Д','30 дней','ВСЕ']) {
      const control = document.createElement('span');
      control.textContent = label;
      if (label === '1Д') control.classList.add('selected');
      row.append(control);
    }
  });
  let popup = await app.open(page);
  assert.equal(await popup.evaluate('document.querySelectorAll("#ranges input").length'), 5);
  await popup.fill('#amount-pnl_1d','100');
  await popup.fill('#amount-pnl_6h','-10');
  await popup.click('button[type=submit]');
  await until(() => popup.text('#mode').then(v => v === 'On in tab'), 'Could not enable while chart was loading');
  await popup.close();
  const value = page.locator('[data-pnl]');
  await value.evaluate(el => {
    el.innerHTML = '<i>−</i><b>12,50</b><span> $</span>';
    el.closest('.pnl').setAttribute('aria-busy', 'false');
  });
  const expect = s => until(() => value.textContent().then(v => v === s), 'Expected ' + s);
  await expect('87,50 $');
  await value.locator('b').evaluate(el => { el.firstChild.data = '19,50'; });
  await expect('80,50 $');
  await page.locator('.pnl').evaluate(chart => {
    chart.querySelector('.selected').classList.remove('selected');
    chart.setAttribute('aria-busy','true');
    chart.querySelector('[role="group"]').firstElementChild.click();
  });
  await expect('—');
  await page.locator('.pnl').evaluate(el => el.setAttribute('aria-busy', 'false'));
  await expect('-29,50 $');
  popup = await app.open(page);
  await popup.click('#disable');
  await expect('−19,50 $');
  await popup.close();
});

test('mixed-language cards, split cents and a cloned header keep their real source values', async t => {
  const ctx = await browser();
  t.after(() => ctx.close());
  const app = await offlinePortfolio(ctx);
  const page = ctx.pages()[0];
  await page.goto('https://polymarket.com/ru/portfolio');
  await page.evaluate(() => {
    history.replaceState(null, '', '/portfolio');
    document.documentElement.lang = 'en';
    document.querySelector('.pnl h2').textContent = 'Profit/Loss';
    document.querySelectorAll('.pnl button')[4].textContent = 'YTD';
    for (const el of document.querySelectorAll('[data-copy="portfolio"]')) el.innerHTML = '<span>$</span><b>0</b><small>.13</small>';
    for (const el of document.querySelectorAll('[data-copy="cash"]')) el.innerHTML = '<b>0</b><i>,</i><small>13</small><span> $</span>';
    document.querySelector('nav').insertAdjacentHTML('beforeend',
      '<a href="/portfolio"><span>Портфель</span><small>Открыть раздел</small></a><a href="/portfolio"><span>Наличные</span><small>Подробнее</small></a>');
  });
  const popup = await app.open(page);
  assert.deepEqual(await popup.evaluate('[...document.querySelectorAll("#ranges label")].map(l=>l.textContent)'),
    ['1 day','1 week','1 month','1 year','Year to date','All time']);
  await popup.fill('#amount-portfolio','1,000');
  await popup.fill('#amount-cash','10 000,75');
  await popup.click('button[type=submit]');
  const all = async (name, expected) => until(async () =>
    (await page.locator('[data-copy="' + name + '"]').allTextContents()).every(v => v === expected), 'Expected all copies of ' + name + ' to show ' + expected);
  await all('portfolio','$1,000.13');
  await all('cash','10 000,88 $');
  await page.locator('nav').evaluate(nav => nav.replaceWith(nav.cloneNode(true)));
  await page.locator('nav').evaluate(nav => {
    const parent = nav.parentElement;
    const copy = nav.cloneNode(true);
    copy.classList.add('hydrated');
    nav.remove();
    parent.append(copy);
  });
  await page.locator('[data-copy="portfolio"] small').evaluateAll(nodes => nodes.forEach(node => { node.firstChild.data = '.23'; }));
  await all('portfolio','$1,000.23');
  await all('cash','10 000,88 $');
  assert.doesNotMatch(await popup.text('#status'), /format|marked|possible|[А-Яа-я]/);
  await popup.click('#disable');
  await all('portfolio','$0.23');
  await all('cash','0,13 $');
  await popup.close();
});

test('an upgrade adds the original Portfolio, Cash and YTD entries and discards calculated legacy offsets', async t => {
  const ctx = await browser();
  t.after(() => ctx.close());
  const app = await offlinePortfolio(ctx);
  const page = ctx.pages()[0];
  await page.goto('https://polymarket.com/portfolio');
  let popup = await app.open(page);
  const old = {
    amounts: { portfolio:100000, cash:0, pnl_ytd:20000, pnl_all:-1000 },
    offsets: { portfolio:90000, cash:-4000, pnl_ytd:22418, pnl_all:1418 }, settledRanges: true
  };
  await popup.evaluate('chrome.storage.local.set({last:' + JSON.stringify(old) + '})');
  await popup.close();
  async function ytd(real) {
    await page.locator('.pnl').evaluate((el,real) => {
      for (const button of el.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.textContent === 'YTD'));
      el.querySelector('[data-pnl]').firstChild.data = real;
    }, real);
  }
  const expect = s => until(() => page.locator('[data-pnl]').textContent().then(v => v === s), 'Expected ' + s);
  await page.locator('[data-copy="portfolio"]').evaluateAll(els => els.forEach(el => { el.firstChild.data = '$85'; }));
  await ytd('-$24.18');
  popup = await app.open(page);
  assert.deepEqual(await popup.evaluate('(async()=>(await chrome.storage.local.get("last")).last)()'), old);
  assert.equal(await popup.evaluate('document.querySelector("#amount-portfolio").value'), '1000');
  assert.equal(await popup.evaluate('document.querySelector("#amount-cash").value'), '0');
  assert.equal(await popup.evaluate('document.querySelector("#amount-pnl_ytd").value'), '200');
  await popup.click('button[type=submit]');
  await expect('$175.82');
  assert.equal(await page.locator('header [data-copy="portfolio"]').textContent(), '$1,085');
  assert.equal(await page.locator('header [data-copy="cash"]').textContent(), '$40');
  await until(() => popup.text('#mode').then(v => v === 'On in tab'), 'Enable did not finish');
  const saved = await popup.evaluate('(async()=>(await chrome.storage.local.get("last")).last)()');
  assert.deepEqual(saved.amounts, old.amounts);
  assert.deepEqual(saved.offsets, old.amounts);
  await ytd('-$25.18');
  await expect('$174.82');
  await popup.close();
  await page.reload();
  await ytd('-$23.18');
  await expect('$176.82');
  popup = await app.open(page);
  assert.equal(await popup.text('#mode'), 'On in tab');
  await popup.fill('#amount-pnl_ytd', '-25');
  await popup.click('button[type=submit]');
  await expect('-$48.18');
  await popup.disable();
  await expect('-$23.18');
  await popup.close();
});

test('a slow panel and a quick range change apply the adjustment only to the matching period', async t => {
  const ctx = await browser();
  t.after(() => ctx.close());
  const app = await offlinePortfolio(ctx);
  const page = ctx.pages()[0];
  await page.goto('https://polymarket.com/portfolio');
  const chart = page.locator('.pnl');
  await chart.locator('[data-pnl]').evaluate(el => el.setAttribute('data-period','1D'));
  let popup = await app.open(page);
  await popup.fill('#amount-pnl_1w','100');
  await popup.fill('#amount-pnl_1m','20');
  await popup.click('button[type=submit]');
  await until(() => popup.text('#mode').then(v => v === 'On in tab'), 'Could not enable');
  await popup.close();
  // The old visible panel remains mounted beyond the value-settling window.
  const oldText = await chart.evaluate(async el => {
    const buttons = el.querySelectorAll('button');
    buttons[0].setAttribute('aria-pressed','false');
    buttons[1].setAttribute('aria-pressed','true');
    await new Promise(resolve => setTimeout(resolve, 1250));
    const amount = el.querySelector('[data-pnl]');
    const text = amount.textContent;
    buttons[1].setAttribute('aria-pressed','false');
    buttons[2].setAttribute('aria-pressed','true');
    amount.setAttribute('data-period','1M');
    amount.firstChild.data = '-$24.18';
    return text;
  });
  assert.equal(oldText,'—');
  await until(() => chart.locator('[data-pnl]').textContent().then(v => v === '-$4.18'), 'Month never settled');
  popup = await app.open(page);
  const offsets = await popup.evaluate('(async()=>(await chrome.storage.local.get("last")).last.offsets)()');
  assert.deepEqual(offsets, { pnl_1w:10000, pnl_1m:2000 });
  await popup.disable();
  assert.equal(await chart.locator('[data-pnl]').textContent(), '-$24.18');
  await popup.close();
});

test('switching ranges in one tab preserves the last adjustments chosen in another', async t => {
  const ctx = await browser();
  t.after(() => ctx.close());
  const app = await offlinePortfolio(ctx);
  const first = ctx.pages()[0];
  await first.goto('https://polymarket.com/portfolio?tab=a');
  let popup = await app.open(first);
  await popup.fill('#amount-pnl_1w','-25');
  await popup.click('button[type=submit]');
  await until(() => popup.text('#mode').then(v => v === 'On in tab'), 'First tab did not enable');
  await popup.close();
  const second = await ctx.newPage();
  await second.goto('https://polymarket.com/portfolio?tab=b');
  popup = await app.open(second);
  await popup.fill('#amount-pnl_1w','');
  await popup.fill('#amount-pnl_1d','50');
  await popup.click('button[type=submit]');
  await until(() => second.locator('[data-pnl]').textContent().then(v => v === '+$55'), 'Second tab did not enable');
  await popup.close();
  await first.locator('.pnl').evaluate(chart => {
    for (const el of chart.querySelectorAll('button')) el.setAttribute('aria-pressed', String(el.textContent === '1W'));
    chart.querySelector('[data-pnl]').firstChild.data = '$8';
  });
  await until(() => first.locator('[data-pnl]').textContent().then(v => v === '-$17'), 'First tab lost its own adjustment');
  popup = await app.open(first);
  assert.ok(await popup.evaluate('(async()=>Object.values(await chrome.storage.session.get(null)).some(s=>s.profile?.offsets.pnl_1w===-2500))()'));
  const last = await popup.evaluate('(async()=>(await chrome.storage.local.get("last")).last)()');
  assert.deepEqual(last.amounts, { pnl_1d:5000 });
  assert.deepEqual(last.offsets, { pnl_1d:5000 });
  await popup.close();
});

test('English intervals on a localized page keep their meaning and ambiguous chart amounts stay intact', async t => {
  const ctx = await browser();
  t.after(() => ctx.close());
  const app = await offlinePortfolio(ctx);
  const page = ctx.pages()[0];
  await page.goto('https://polymarket.com/id/portfolio');
  await page.locator('.pnl').evaluate(chart => {
    chart.querySelector('h2').textContent = 'Laba/Rugi';
    chart.querySelectorAll('button').forEach((b, i) => { b.textContent = ['6H','1D','1W','1M','YTD','ALL'][i]; });
    const extra = document.createElement('p');
    extra.textContent = '$10';
    chart.append(extra);
  });
  const popup = await app.open(page);
  assert.equal(await popup.text('#pnl-title'), 'Profit/Loss adjustments');
  assert.deepEqual(await popup.evaluate('[...document.querySelectorAll("#ranges input")].map(el=>el.id)'),
    ['amount-pnl_6h','amount-pnl_1d','amount-pnl_1w','amount-pnl_1m','amount-pnl_ytd','amount-pnl_all']);
  await popup.fill('#amount-pnl_6h','60');
  await popup.click('button[type=submit]');
  await until(() => popup.text('#status').then(v => v.includes('multiple possible amounts')), 'Missing ambiguous chart status');
  assert.equal(await popup.text('#mode'), 'Off');
  assert.deepEqual(await page.locator('.pnl p').allTextContents(), ['+$5.00','$10']);
  await popup.close();
});

test('P&L adjustments follow the selected timeframe through async changes and navigation', { timeout: 60000 }, async t => {
  const ctx = await browser();
  t.after(() => ctx.close());
  const app = await offlinePortfolio(ctx);
  const page = ctx.pages()[0];
  await page.goto('https://polymarket.com/portfolio');
  let popup = await app.open(page);
  const values = { '1d':'-100', '1w':'250', '1m':'0', '1y':'-400', ytd:'500', all:'600' };
  assert.equal(await popup.evaluate('document.querySelectorAll("#ranges input").length'), 6);
  assert.equal(await popup.evaluate('Boolean(document.querySelector("#saved,#name,[data-quick]"))'), false);
  for (const [id, value] of Object.entries(values)) await popup.fill('#amount-pnl_' + id, value);
  await popup.click('button[type=submit]');
  const expect = text => until(async () => (await page.locator('[data-pnl]').textContent()) === text, 'Expected P&L ' + text);
  await expect('-$95');
  await popup.close();

  async function select(label) {
    await page.locator('.pnl button').evaluateAll((buttons, label) => {
      for (const b of buttons) b.setAttribute('aria-pressed', String(b.textContent === label));
    }, label);
  }
  async function price(value, replace = false) {
    await page.locator('[data-pnl]').evaluate((el, input) => {
      if (input.replace) el.replaceChildren(document.createTextNode(input.value));
      else el.firstChild.data = input.value;
    }, { value, replace });
  }
  await select('1W');
  await expect('+$255'); // The unlabelled headline still reads +$5.00 when the 1W adjustment becomes active.
  await price('-$20.00');
  await expect('$230');
  await price('+$1.50');
  await expect('+$251.50');
  await select('1M');
  await price('$40', true);
  await expect('$40');
  await price('$40.25');
  await expect('$40.25');
  await select('1Y');
  await price('$2');
  await expect('-$398');
  await select('YTD');
  await price('$4');
  await expect('$504');
  await select('ALL');
  await price('$5');
  await expect('$605');
  await select('1D');
  await price('+$7');
  await expect('-$93');
  assert.equal(await page.locator('table td').textContent(), '$12.00');
  await page.goto('https://polymarket.com/event/sample');
  await page.goto('https://polymarket.com/portfolio');
  await expect('-$95');
  await select('1W');
  await price('$0');
  await expect('$250');
  popup = await app.open(page);
  const last = await popup.evaluate('(async()=> (await chrome.storage.local.get("last")).last)()');
  assert.deepEqual(last.offsets, { pnl_1d:-10000, pnl_1w:25000, pnl_1m:0, pnl_1y:-40000, pnl_ytd:50000, pnl_all:60000 });
  await popup.click('#disable');
  await expect('$0');
  await popup.close();
  await page.reload();
  popup = await app.open(page);
  assert.equal(await popup.text('#mode'), 'Off');
  assert.equal(await popup.evaluate('document.querySelector("#amount-pnl_1d").value'), '-100');
  await popup.close();
});

test('the English popup applies all six chart periods in each mapped site language', { timeout: 300000 }, async t => {
  const ctx = await browser();
  t.after(() => ctx.close());
  const app = await offlinePortfolio(ctx);
  const page = ctx.pages()[0];
  for (const [lang, dict] of Object.entries(locales.locales)) {
    const unit = type => [...dict.units].find(entry => entry[1] === type)[0];
    // Use a generic English fixture and localize only what a site would render.
    await page.goto('https://polymarket.com/portfolio?fixture=' + lang);
    const labels = dict.labels;
    const price = new Intl.NumberFormat(lang, { style:'currency',currency:'USD',currencyDisplay:'narrowSymbol' }).format(1250.25);
    await page.evaluate(({ lang, labels, price, periods }) => {
      document.documentElement.lang = lang;
      history.replaceState(null, '', '/' + lang + '/portfolio');
      for (const name of ['portfolio','cash']) {
        const nodes = document.querySelectorAll('[data-copy="' + name + '"]');
        for (const node of nodes) {
          node.previousElementSibling.textContent = labels[name][0];
          node.textContent = price;
        }
      }
      document.querySelector('.pnl h2').textContent = labels.pnl[0];
      document.querySelector('[data-pnl]').textContent = price;
      document.querySelectorAll('.pnl button').forEach((button,i) => { button.textContent = periods[i]; });
    }, { lang, labels, price, periods: ['1'+unit('d'), '1'+unit('w'), '1'+unit('m'), '1'+unit('y'), dict.ytd[0], dict.all[0]] });
    const popup = await app.open(page);
    assert.equal(await popup.text('#pnl-title'), 'Profit/Loss adjustments',lang);
    assert.equal(await popup.text('label[for="amount-cash"]'), 'Cash',lang);
    assert.deepEqual(await popup.evaluate('[...document.querySelectorAll("#ranges label")].map(l=>l.textContent)'),
      ['1 day','1 week','1 month','1 year','Year to date','All time'],lang);
    await popup.fill('#amount-portfolio','300');
    await popup.fill('#amount-cash','-1300.50');
    const ranges = [['1d', -1000], ['1w', 3500], ['1m', 0], ['1y', -1425], ['ytd', 20000], ['all', 12345678]];
    for (const [id, cents] of ranges) await popup.fill('#amount-pnl_' + id, money.decimal(cents));
    await popup.click('button[type=submit]');
    await until(async () => await popup.text('#mode') === 'On in tab', lang + ' failed to apply');
    for (const [id, expected] of [['portfolio', 155025], ['cash', -5025]]) {
      const copies = await page.locator('[data-copy="' + id + '"]').allTextContents();
      assert.deepEqual(copies.map(text => money.readSite(text, lang)), [expected, expected], lang + ' ' + id);
    }
    for (const [i, [id, cents]] of ranges.entries()) {
      await page.locator('.pnl button').evaluateAll((buttons, index) => {
        buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
      }, i);
      const adjusted = await until(async () => {
        const text = await page.locator('[data-pnl]').textContent();
        return money.readSite(text, lang) === 125025 + cents && text;
      }, lang + ' did not apply ' + id);
      assert.ok(!adjusted.endsWith('.'), lang + ' ' + id);
    }
    await popup.click('#disable');
    await until(async () => await page.locator('[data-pnl]').textContent() === price,lang + ' restore');
    await popup.close();
  }
});
