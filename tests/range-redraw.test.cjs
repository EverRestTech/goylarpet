const { test } = require('node:test');
const assert = require('node:assert/strict');
const { browser, offlinePortfolio, until } = require('./browser.cjs');

const ids = ['1d', '1w', '1m', '1y', 'ytd', 'all'];
const labels = ['1Д', '1Н', '1М', '1Г', 'YTD', 'ВСЕ'];
const adjustments = [1000, 10000, 10, 1000, 200, 100000000];
const real = [0, -940, -2418, -2418, -2418, -2418];
const usd = cents => (cents < 0 ? '-' : '') + '$' + (Math.abs(cents) / 100).toLocaleString('en-US', {
  minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2
});

async function start(t) {
  const context = await browser();
  t.after(() => context.close());
  const app = await offlinePortfolio(context);
  const page = context.pages()[0];
  await page.goto('https://polymarket.com/ru/portfolio');
  const chart = page.locator('.pnl');
  await chart.evaluate((card, labels) => {
    const buttons = card.querySelectorAll('button');
    buttons.forEach((b, i) => {
      b.textContent = labels[i];
      b.setAttribute('aria-pressed', String(labels[i] === 'YTD'));
    });
    card.querySelector('[data-pnl]').firstChild.data = '-$24.18';
  }, labels);
  const popup = await app.open(page);
  for (const [i, id] of ids.entries()) await popup.fill('#amount-pnl_' + id, String(adjustments[i]));
  await popup.fill('#amount-portfolio', '1000');
  await popup.fill('#amount-cash', '10000');
  await popup.click('button[type=submit]');
  const headline = chart.locator('[data-pnl]');
  const expect = amount => until(() => headline.textContent().then(text => text === amount), 'Expected P&L ' + amount);
  await expect('$175.82');
  await popup.close();
  return { page, chart, headline, expect, open: () => app.open(page) };
}

test('the first frame of each range contains its adjusted amount, including reused text and a real zero', async t => {
  const { chart } = await start(t);
  for (const i of [5, 3, 2, 1, 0, 4]) {
    const firstFrame = await chart.evaluate((card, { index, price, reuse }) => {
      card.querySelectorAll('button').forEach((b, n) => b.setAttribute('aria-pressed', String(n === index)));
      const el = card.querySelector('[data-pnl]');
      if (!reuse) el.firstChild.data = price;
      return new Promise(resolve => requestAnimationFrame(() => resolve(el.textContent)));
    }, { index: i, price: usd(real[i]), reuse: i === 3 || i === 2 });
    assert.equal(firstFrame, usd(real[i] + adjustments[i] * 100), labels[i]);
  }
});

test('a newly mounted portfolio paints the saved adjustments in its first frame', async t => {
  const { page } = await start(t);
  const firstFrame = await page.evaluate(async () => {
    const portfolio = document.querySelector('main');
    const fresh = portfolio.cloneNode(true);
    for (const balance of fresh.querySelectorAll('[data-copy="portfolio"]')) balance.textContent = '$0.23';
    fresh.querySelector('[data-pnl]').textContent = '-$25.18';
    history.pushState(null, '', '/ru/event/sample');
    portfolio.remove();
    await new Promise(resolve => requestAnimationFrame(resolve));
    history.pushState(null, '', '/ru/portfolio?tab=positions');
    document.body.append(fresh);
    return new Promise(resolve => requestAnimationFrame(() => resolve([
      fresh.querySelector('[data-copy="portfolio"]').textContent, fresh.querySelector('[data-pnl]').textContent
    ])));
  });
  assert.deepEqual(firstFrame, ['$1,000.23', '$174.82']);
});

test('a cold loading headline conceals split site text until the matching period is ready', async t => {
  const { chart, headline, open } = await start(t);
  const frames = await chart.evaluate(async card => {
    const el = card.querySelector('[data-pnl]');
    const frame = () => new Promise(resolve => requestAnimationFrame(() => resolve(el.textContent)));
    const buttons = card.querySelectorAll('button');
    buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(i === 2)));
    el.setAttribute('data-period', 'YTD');
    el.innerHTML = '<b>−$</b><span>24</span><small>.18</small>';
    const pending = await frame();
    card.setAttribute('aria-busy', 'true');
    el.setAttribute('data-period', '1M');
    el.querySelector('span').firstChild.data = '32';
    const loading = await frame();
    card.removeAttribute('aria-busy');
    return [pending, loading, await frame()];
  });
  assert.deepEqual(frames, ['—', '—', '-$22.18']);
  const popup = await open();
  await popup.disable();
  assert.deepEqual(await headline.locator(':scope > *').allTextContents(), ['−$', '32', '.18']);
  await popup.close();
});

test('hydration of text in an empty chart shell applies YTD before the first frame with a price', async t => {
  const { page } = await start(t);
  const firstFrame = await page.evaluate(async () => {
    const original = document.querySelector('.pnl');
    const chart = original.cloneNode(true);
    const heading = chart.querySelector('h2').firstChild;
    const price = chart.querySelector('[data-pnl]').firstChild;
    const label = heading.data;
    heading.data = price.data = '';
    original.replaceWith(chart);
    await new Promise(resolve => requestAnimationFrame(resolve));
    heading.data = label;
    price.data = '-$25.18';
    return new Promise(resolve => requestAnimationFrame(() => resolve(price.data)));
  });
  assert.equal(firstFrame, '$174.82');
});

test('the first visible frames of a fading-in YTD headline already show the adjusted total', async t => {
  const { page, headline } = await start(t);
  await page.addStyleTag({ content: '@keyframes reveal-price { 0%, 25% { opacity:0 } 100% { opacity:1 } } .reveal-price { animation:reveal-price 320ms linear both }' });
  const frames = await headline.evaluate(el => {
    const amount = document.createElement('span');
    amount.className = 'reveal-price';
    amount.textContent = '-$25.18';
    el.replaceChildren(amount);
    const frames = new Set();
    return new Promise(resolve => {
      function frame() {
        // Sample after the frame's rendering callbacks have all run.
        requestAnimationFrame(() => setTimeout(() => {
          const opacity = Number(getComputedStyle(amount).opacity);
          if (opacity > 0) frames.add(amount.textContent);
          if (opacity === 1) resolve([...frames]); else frame();
        }, 0));
      }
      frame();
    });
  });
  assert.deepEqual(frames, ['$174.82']);
});

test('YTD and all other selected periods survive replacement of the toolbar and price', { timeout: 45000 }, async t => {
  const { page, chart, headline, expect, open } = await start(t);
  await page.addStyleTag({ content: `
    .pnl .range { position: relative; background: #1c1e23; color: white; isolation: isolate }
    .pnl .range:hover { background: #36383b }
    .pnl .pill { position: absolute; inset: 0; background: #303238; border-radius: 16px; z-index: -1 }
  ` });
  const firstFrame = await chart.evaluate((card, data) => {
    const toolbar = card.querySelector('[role="group"]');
    const headline = card.querySelector('[data-pnl]');
    let active = 4;
    function render(i) {
      active = i;
      toolbar.replaceChildren(...data.labels.map((label, n) => {
        const button = document.createElement('button');
        button.className = 'range';
        button.textContent = label;
        if (n === i) {
          const pill = document.createElement('span');
          pill.className = 'pill';
          pill.setAttribute('aria-hidden', 'true');
          button.prepend(pill);
        }
        button.onclick = () => render(n);
        return button;
      }));
      headline.replaceChildren(document.createTextNode(data.prices[i]));
    }
    card.addEventListener('keydown', event => { if (event.key === 'ArrowRight') render((active + 1) % data.labels.length); });
    render(active);
    return new Promise(resolve => requestAnimationFrame(() => resolve(headline.textContent)));
  }, { labels, prices: real.map(usd) });
  // The very same selected YTD still has a visible pill after the remount.
  assert.equal(firstFrame, '$175.82');
  for (const i of [5, 0, 1, 2, 3, 4]) {
    const button = chart.getByRole('button', { name: labels[i], exact: true });
    // All time uses keyboard selection, which does not emit a click.
    if (i === 5) await chart.getByRole('button', { name:'YTD', exact:true }).press('ArrowRight');
    else await button.click();
    const adjusted = real[i] + adjustments[i] * 100;
    await expect(usd(adjusted));
    await chart.getByRole('button', { name: labels[(i + 1) % 6], exact: true }).hover();
    await headline.evaluate((el, value) => { el.firstChild.data = value; }, usd(real[i]));
    await expect(usd(adjusted));
    await headline.evaluate((el, value) => { el.firstChild.data = value; }, usd(real[i] + 100));
    await expect(usd(adjusted + 100));
    await headline.evaluate((el, value) => { el.textContent = value; }, usd(real[i] - 100));
    await expect(usd(adjusted - 100));
  }
  const popup = await open();
  assert.equal(await popup.text('#mode'), 'On in tab');
  assert.equal(await popup.text('#status'), '');
  const offsets = await popup.evaluate('(async() => (await chrome.storage.local.get("last")).last.offsets)()');
  for (const [i, id] of ids.entries()) assert.equal(offsets['pnl_' + id], adjustments[i] * 100, id);
  assert.deepEqual(await page.locator('[data-copy="portfolio"]').allTextContents(), ['$1,000.13', '$1,000.13']);
  assert.deepEqual(await page.locator('[data-copy="cash"]').allTextContents(), ['$10,000.13', '$10,000.13']);
  await popup.click('#disable');
  await expect('-$25.18');
  await popup.close();
});

test('a negative YTD split into a signed currency symbol, whole dollars and cents keeps its offset', async t => {
  const { headline, expect, open } = await start(t);
  await headline.evaluate(el => { el.innerHTML = '<span>−$</span><b>24</b><small>.18</small>'; });
  await expect('$175.82');
  await headline.locator('b').evaluate(el => { el.firstChild.data = '25'; });
  await expect('$174.82');
  const popup = await open();
  assert.equal(await popup.text('#mode'), 'On in tab');
  assert.equal(await popup.text('#status'), '');
  await popup.click('#disable');
  await expect('−$25.18');
  assert.deepEqual(await headline.locator(':scope > *').allTextContents(), ['−$', '25', '.18']);
  await popup.close();
});

test('YTD is reapplied when the new headline becomes visible at the end of a CSS animation', async t => {
  const { page, headline, open } = await start(t);
  await page.addStyleTag({ content: `
    @keyframes show-total { 0%, 95% { visibility:hidden } 100% { visibility:visible } }
    .incoming-total { animation:show-total 250ms linear both }
  ` });
  // The old price is still mounted but fully transparent. No further JS
  // writes accompany the new price becoming visible.
  await headline.evaluate(el => {
    el.innerHTML = '<span style="opacity:0;position:absolute">-$8.00</span><span class="incoming-total"><span style="display:contents">-$24.18</span></span>';
  });
  const incoming = headline.locator('.incoming-total');
  await until(() => incoming.textContent().then(v => v === '$175.82'), 'The newly visible YTD still displayed the real loss');
  assert.equal(await headline.locator('span').first().textContent(), '-$8.00');
  const popup = await open();
  await popup.disable();
  assert.equal(await incoming.textContent(), '-$24.18');
  await popup.close();
});

test('the visible one-year and YTD controls remain distinct when both carry the same data range', async t => {
  const { chart, headline, expect, open } = await start(t);
  await chart.evaluate(card => {
    const buttons = card.querySelectorAll('button');
    for (const i of [3, 4]) {
      buttons[i].setAttribute('data-range', '1Y');
      buttons[i].id = 'range-' + i;
    }
    const price = card.querySelector('[data-pnl]');
    price.setAttribute('role','tabpanel');
    price.setAttribute('data-range','1Y');
    price.setAttribute('aria-labelledby', buttons[4].id);
    price.firstChild.data = '-$24.18';
  });
  await expect('$175.82');
  await chart.evaluate(card => {
    const buttons = card.querySelectorAll('button');
    buttons[4].setAttribute('aria-pressed','false');
    buttons[3].setAttribute('aria-pressed','true');
    card.querySelector('[data-pnl]').setAttribute('aria-labelledby', buttons[3].id);
  });
  await expect('$975.82');
  const popup = await open();
  await popup.disable();
  assert.equal(await headline.textContent(), '-$24.18');
  await popup.close();
});

test('only the same chart can reuse a selection while the toolbar lacks a marker', async t => {
  const { chart, page, expect, open } = await start(t);
  await chart.evaluate(card => {
    for (const button of card.querySelectorAll('button')) {
      const copy = button.cloneNode(true);
      copy.removeAttribute('aria-pressed');
      button.replaceWith(copy);
    }
    card.querySelector('[data-pnl]').textContent = '-$24.18';
  });
  await expect('$175.82');
  await page.evaluate(() => history.pushState(null, '', '/ru/portfolio?view=another'));
  await expect('—');
  const popup = await open();
  assert.match(await popup.text('#status'), /Select a time range/);
  await popup.close();
  await chart.locator('button').nth(3).evaluate(b => b.setAttribute('aria-pressed','true'));
  await expect('$975.82');
});

test('a first-visit chart with just YTD configured conceals its headline until the range controls appear', async t => {
  const { chart, open } = await start(t);
  const popup = await open();
  for (const id of ids.filter(id => id !== 'ytd')) await popup.fill('#amount-pnl_' + id, '');
  await popup.click('button[type=submit]');
  await until(() => popup.evaluate('!document.querySelector("fieldset").disabled'), 'Edited ranges were not applied');
  await popup.close();
  const frames = await chart.evaluate(async card => {
    const headline = card.querySelector('[data-pnl]');
    const toolbar = card.querySelector('[role="group"]');
    const mount = toolbar.parentElement;
    const sample = () => new Promise(resolve => requestAnimationFrame(() => resolve(headline.textContent)));
    toolbar.remove();
    headline.firstChild.data = '-$25.18';
    const withoutToolbar = await sample();
    for (const button of toolbar.querySelectorAll('button')) button.removeAttribute('aria-pressed');
    history.pushState(null, '', '?chart=opening');
    mount.append(toolbar);
    const withoutSelection = await sample();
    const buttons = toolbar.querySelectorAll('button');
    buttons[4].setAttribute('aria-pressed', 'true');
    const ytd = await sample();
    buttons[4].setAttribute('aria-pressed', 'false');
    buttons[0].setAttribute('aria-pressed', 'true');
    return [withoutToolbar, withoutSelection, ytd, await sample()];
  });
  assert.deepEqual(frames, ['—', '—', '$174.82', '-$25.18']);
});
