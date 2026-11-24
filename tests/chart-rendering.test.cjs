const { test } = require('node:test');
const assert = require('node:assert/strict');
const { browser, offlinePortfolio, until } = require('./browser.cjs');

async function allTime(t) {
  const context = await browser();
  t.after(() => context.close());
  const app = await offlinePortfolio(context);
  const page = context.pages()[0];
  await page.goto('https://polymarket.com/ru/portfolio');
  await page.locator('.pnl').evaluate(card => {
    for (const b of card.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.textContent === 'ВСЕ'));
    const amount = card.querySelector('[data-pnl]');
    amount.firstChild.data = '-$24.18';
    const header = document.createElement('div');
    header.append(card.firstElementChild, amount);
    const plot = document.createElement('div');
    plot.className = 'plot';
    plot.style.cssText = 'position:relative;width:360px;height:100px';
    plot.innerHTML = '<svg width="360" height="100"><path d="M0 10 L360 80"/></svg><div class="overlay" style="position:absolute;inset:0"></div>';
    card.append(header, plot);
  });
  const headline = page.locator('[data-pnl]');
  const open = () => app.open(page);
  const expect = expected => until(() => headline.textContent().then(value => value === expected), 'Expected ' + expected);
  const write = value => headline.evaluate((el,text) => { el.firstChild.data = text; }, value);
  async function enable(adjustment = '100000000') {
    const popup = await open();
    await popup.fill('#amount-pnl_all', adjustment);
    await popup.click('button[type=submit]');
    await until(() => popup.text('#mode').then(value => value === 'On in tab'), 'Could not enable');
    await popup.close();
  }
  async function recordFrames() {
    await headline.evaluate(el => {
      const values = new Set();
      let frame;
      function sample() { values.add(el.textContent); frame = requestAnimationFrame(sample); }
      sample();
      window.endSamples = () => { cancelAnimationFrame(frame); return [...values]; };
    });
  }
  return { page, headline, open, write, expect, enable, recordFrames };
}

test('an active All time headline holds its amount through a transient zero, a loading state and a rerender', async t => {
  const { page, headline, open, write, expect, enable, recordFrames } = await allTime(t);
  await enable();
  await expect('$99,999,975.82');
  await recordFrames();
  await headline.evaluate(async el => {
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    el.firstChild.data = '$0';
    await delay(450);
    el.firstChild.data = '-$24.18';
    await delay(80);
    const card = el.closest('.pnl');
    card.setAttribute('aria-busy', 'true');
    el.replaceChildren(document.createTextNode('$0.00'));
    await delay(1500);
    el.firstChild.data = '-$24.18';
    card.removeAttribute('aria-busy');
    await delay(300);
  });
  assert.deepEqual(await page.evaluate(() => window.endSamples()), ['$99,999,975.82']);
  await write('-$25.18');
  await expect('$99,999,974.82');
  await write('-$22.18');
  await expect('$99,999,977.82');
  await write('$0.00'); // A genuine settled zero is a valid site value.
  await expect('$100,000,000');
  const popup = await open();
  await write(' -$24.50 ');
  await popup.click('#disable');
  await expect(' -$24.50 ');
  await popup.close();
});

test('a historical point under a chart overlay cannot be used as the real period total', async t => {
  const { page, headline, open, write, expect, enable, recordFrames } = await allTime(t);
  const plot = page.locator('.plot');
  await plot.evaluate(el => {
    const tooltip = document.createElement('div');
    tooltip.setAttribute('role','tooltip');
    tooltip.textContent = '$0.00';
    el.append(tooltip);
    el.closest('.pnl').querySelector('[data-pnl]').firstChild.data = '$0.00';
  });
  await enable();
  let popup = await open();
  assert.equal(await popup.evaluate('(async()=>(await chrome.storage.local.get("last")).last.offsets.pnl_all)()'), 10000000000);
  assert.equal(await headline.textContent(), '—');
  await popup.close();
  await plot.locator('[role="tooltip"]').evaluate(el => el.remove());
  await write('-$24.18');
  await expect('$99,999,975.82');
  await recordFrames();
  await plot.locator('.overlay').hover();
  await headline.evaluate(async el => {
    el.firstChild.data = '$0.00';
    await new Promise(resolve => setTimeout(resolve, 1550));
    el.replaceChildren(document.createTextNode('-$8.00'));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await page.locator('.pnl h2').hover();
  // Mouseout can precede the chart rewriting its headline. The final
  // historical point is still on screen well after the normal quiet window.
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 1400)));
  assert.deepEqual(await page.evaluate(() => window.endSamples()), ['$99,999,975.82']);
  await write('-$25.18');
  await expect('$99,999,974.82');
  popup = await open();
  await popup.click('#disable');
  await expect('-$25.18');
  await popup.close();
});

test('Enable immediately adjusts a visible first zero and follows the next site write', async t => {
  const { page, headline, write, expect, enable } = await allTime(t);
  await write('$0.00');
  await enable();
  const worker = page.context().serviceWorkers()[0];
  assert.equal(await worker.evaluate(async () => (await chrome.storage.local.get('last')).last.offsets.pnl_all), 10000000000);
  assert.equal(await headline.textContent(), '$100,000,000');
  await write('-$24.18');
  await expect('$99,999,975.82');
});

test('a continuous stream of real P&L updates advances the headline while ticks are arriving', async t => {
  const { headline, enable, expect } = await allTime(t);
  await enable();
  await expect('$99,999,975.82');
  const frames = await headline.evaluate(async el => {
    const seen = new Set();
    for (let i = 1; i <= 14; i++) {
      el.firstChild.data = '-$' + (24 + i) + '.18';
      await new Promise(resolve => setTimeout(resolve, 100));
      seen.add(el.textContent);
    }
    return [...seen];
  });
  assert.ok(frames.some(text => text !== '$99,999,975.82' && /^\$99,999,9\d{2}\.82$/.test(text)), 'The headline stopped updating during the stream');
  await expect('$99,999,961.82');
});

test('a large P&L fits alongside the native controls and expands again when the card widens', async t => {
  const { page, headline, open, write, expect, enable } = await allTime(t);
  const chart = page.locator('.pnl');
  await headline.evaluate(el => {
    el.closest('.pnl').style.width = '235px';
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;white-space:nowrap';
    el.style.cssText = 'font:30px monospace;margin:0';
    el.replaceWith(row);
    row.append(el);
    row.insertAdjacentHTML('beforeend','<button aria-label="Share" style="width:28px;flex:none">↑</button><span style="width:84px;flex:none">Polymarket</span>');
  });
  const fits = () => headline.evaluate(el => {
    const button = el.nextElementSibling;
    return el.getBoundingClientRect().right <= button.getBoundingClientRect().left &&
      button.nextElementSibling.getBoundingClientRect().right <= el.parentElement.getBoundingClientRect().right + 1;
  });
  await enable('100000024.18');
  await expect('$100M');
  assert.ok(await fits());
  await chart.evaluate(el => { el.style.width = '650px'; });
  await expect('$100,000,000');
  await write('-$24.17');
  await expect('$100,000,000.01');
  await chart.evaluate(el => { el.style.width = '380px'; });
  await expect('$100000000.01');
  assert.ok(await fits());
  const popup = await open();
  await popup.click('#disable');
  await expect('-$24.17');
  await popup.close();
});
