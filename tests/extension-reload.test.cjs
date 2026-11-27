const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const { browser, offlinePortfolio, until } = require('./browser.cjs');

async function suspendWorker(devtools, url) {
  let version;
  devtools.on('ServiceWorker.workerVersionUpdated', ({ versions }) => {
    version = versions.find(v => v.scriptURL === url) || version;
  });
  await devtools.send('ServiceWorker.enable');
  await until(() => version?.runningStatus === 'running', 'Missing running navigation worker');
  await devtools.send('ServiceWorker.stopWorker', { versionId: version.versionId });
  await until(() => version.runningStatus === 'stopped', 'Navigation worker did not stop');
  return () => version.runningStatus;
}

test('first frames on a new document use this tab’s profile even when the worker is asleep', async t => {
  const context = await browser();
  t.after(() => context.close());
  const app = await offlinePortfolio(context);
  await context.addInitScript(() => {
    addEventListener('pagehide', () => {
      sessionStorage.setItem('fixture:departure', sessionStorage.getItem('goylarpet:next') || '');
    });
    const coldStart = location.search === '?cold';
    window.firstBalances = new Promise(resolve => {
      const frames = [];
      function sample() {
        const portfolio = document.querySelector('header [data-copy="portfolio"]');
        const pnl = document.querySelector('[data-pnl]');
        if (portfolio && pnl) frames.push([portfolio.textContent, pnl.textContent]);
        const ready = !coldStart || (portfolio?.textContent === '$1,100' && pnl?.textContent === '+$205');
        if ((frames.length >= 3 && ready) || frames.length === 180) resolve(frames);
        else requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    });
  });
  const page = context.pages()[0];
  const url = 'https://polymarket.com/portfolio';
  await page.goto(url);
  const popup = await app.open(page);
  await popup.fill('#amount-portfolio', '1000');
  await popup.fill('#amount-pnl_1d', '200');
  await popup.click('button[type=submit]');
  await until(() => popup.text('#mode').then(v => v === 'On in tab'), 'Enable did not finish');
  await popup.close();
  const adjusted = ['$1,100', '+$205'], site = ['$100', '+$5.00'];
  const expectFrames = async (tab, expected) => {
    const frames = await tab.evaluate(() => window.firstBalances);
    for (const frame of frames) {
      frame.forEach((value, i) => assert.ok(value === expected[i] || (expected === adjusted && value === '—'),
        tab.url() + ' showed ' + value + ' in its opening frames'));
    }
    assert.deepEqual(frames.at(-1), expected, tab.url());
  };
  await page.goto(url + '?warm');
  await expectFrames(page, adjusted);
  // The document changes its history entry before following another link.
  await page.evaluate(() => history.pushState(null, '', '?positions'));
  const entryId = await page.evaluate(() => navigation.currentEntry.id);
  const worker = context.serviceWorkers().find(w => w.url().includes(app.id));
  // Only the worker can read the saved tab profile. Stop it before navigating.
  const cd = await context.newCDPSession(page);
  await suspendWorker(cd, worker.url());
  await page.goto(url + '?cold');
  await expectFrames(page, adjusted);
  const hint = await page.evaluate(() => sessionStorage.getItem('fixture:departure'));
  assert.deepEqual(hint.split(',').sort(), [entryId, 'portfolio', 'pnl_1d'].sort());
  assert.equal(await page.evaluate(() => sessionStorage.getItem('goylarpet:next')), null);

  const other = await context.newPage();
  await other.goto(url + '?other');
  const off = await app.open(other);  // activeTab grant, no Enable.
  assert.equal(await off.text('#mode'), 'Off');
  await off.close();
  await other.goto(url + '?still-off');
  await expectFrames(other, site);
  await other.close();
  await page.bringToFront();
  await suspendWorker(await context.newCDPSession(page), worker.url());
  await page.reload();
  await expectFrames(page, adjusted);
  await Promise.all([
    page.waitForNavigation(),
    cd.send('Page.reload', { ignoreCache: true })
  ]);
  await expectFrames(page, adjusted);
  await page.goto(url + '?after-reload');
  await expectFrames(page, adjusted);
  const enabled = await app.open(page);
  await enabled.disable();
  await enabled.close();
  await page.reload();
  await expectFrames(page, site);
});

async function enabledPortfolio(t) {
  const context = await browser();
  t.after(() => context.close());
  const app = await offlinePortfolio(context);
  const page = context.pages()[0];
  await page.goto('https://polymarket.com/ru/portfolio?tab=positions');
  const devtools = await context.newCDPSession(page);
  const errors = [];
  devtools.on('Runtime.exceptionThrown', ({ exceptionDetails }) => {
    errors.push(exceptionDetails.exception?.description || exceptionDetails.text);
  });
  await devtools.send('Runtime.enable');
  const headline = page.locator('[data-pnl]');
  const portfolio = page.locator('[data-copy="portfolio"]');
  await page.locator('.pnl').evaluate(card => {
    const buttons = card.querySelectorAll('button');
    buttons[0].setAttribute('aria-pressed', 'false');
    buttons[4].setAttribute('aria-pressed', 'true');
    buttons[4].textContent = 'YTD';
    card.querySelector('[data-pnl]').textContent = '-$24.18';
  });
  const popup = await app.open(page);
  await popup.fill('#amount-portfolio', '1000');
  await popup.fill('#amount-pnl_ytd', '200');
  await popup.fill('#amount-pnl_all', '100000000');
  await popup.click('button[type=submit]');
  await until(() => popup.text('#mode').then(text => text === 'On in tab'), 'Enable failed');
  assert.equal(await headline.textContent(), '$175.82');
  await popup.close();
  await portfolio.evaluateAll(els => els.forEach(el => { el.firstChild.data = '$0.23'; }));
  await until(() => portfolio.allTextContents().then(texts => texts.every(s => s === '$1,000.23')), 'Site update was lost');
  const worker = context.serviceWorkers().find(w => w.url() === 'chrome-extension://' + app.id + '/navigation.js');
  return { app, page, portfolio, headline, worker, devtools, errors };
}

test('reloading the extension restores an idle portfolio and retains later site writes', { timeout: 20000 }, async t => {
  const { page, portfolio, headline, worker, errors } = await enabledPortfolio(t);
  const closed = worker.waitForEvent('close');
  await worker.evaluate(() => { setTimeout(() => chrome.runtime.reload(), 20); });
  await closed;
  await until(() => portfolio.allTextContents().then(texts => texts.every(s => s === '$0.23')), 'The unloaded extension still owns the idle portfolio');
  assert.equal(await headline.textContent(), '-$24.18');
  // Ordinary site events still reach this document after the extension is gone.
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    const buttons = document.querySelectorAll('.pnl button');
    buttons[4].setAttribute('aria-pressed', 'false');
    buttons[5].setAttribute('aria-pressed', 'true');
    document.querySelector('[data-pnl]').firstChild.data = '-$10.00';
  });
  await delay(1300);
  assert.equal(await headline.textContent(), '-$10.00');
  assert.deepEqual(errors, []);
});

test('replacing the unpacked extension can immediately re-enable the same document with its saved offsets', { timeout: 20000 }, async t => {
  const { app, page, portfolio, headline, worker, errors } = await enabledPortfolio(t);
  const closed = worker.waitForEvent('close');
  const reloaded = await app.root.send('Extensions.loadUnpacked', { path: path.resolve(__dirname, '../extension') });
  assert.equal(reloaded.id, app.id);
  await closed;
  const popup = await app.open(page);
  assert.equal(await popup.text('#mode'), 'Off');
  assert.deepEqual(await portfolio.allTextContents(), ['$0.23', '$0.23']);
  assert.equal(await headline.textContent(), '-$24.18');
  assert.equal(await popup.evaluate('document.querySelector("#amount-pnl_ytd").value'), '200');
  await popup.click('button[type=submit]');
  await until(() => headline.textContent().then(s => s === '$175.82'), 'Saved YTD offset was applied to a fictional value');
  assert.deepEqual(await portfolio.allTextContents(), ['$1,000.23', '$1,000.23']);
  await popup.disable();
  assert.deepEqual(await portfolio.allTextContents(), ['$0.23', '$0.23']);
  assert.equal(await headline.textContent(), '-$24.18');
  assert.deepEqual(errors, []);
  await popup.close();
});

test('a cached page return that throws synchronously releases its chart and observer', async t => {
  const { page, portfolio, headline, worker, errors } = await enabledPortfolio(t);
  // Model the binding invalidating after runtime.id was read but before
  // sendMessage could return its Promise. The site still uses actual DOM events.
  await worker.evaluate(async url => {
    const tab = (await chrome.tabs.query({})).find(tab => tab.url === url);
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        chrome.runtime.sendMessage = () => { throw new Error('Extension context invalidated.'); };
      }
    });
  }, page.url());
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await until(() => portfolio.allTextContents().then(texts => texts.every(s => s === '$0.23')), 'The failed send left the controller active');
  assert.equal(await headline.textContent(), '-$24.18');
  assert.deepEqual(errors, []);
});

test('a sleeping service worker leaves YTD active and wakes on a cached page return', async t => {
  const { page, portfolio, headline, worker, devtools, errors } = await enabledPortfolio(t);
  const workerState = await suspendWorker(devtools, worker.url());
  await delay(1200);
  assert.equal(workerState(), 'stopped');
  assert.equal(await headline.textContent(), '$175.82');
  const hidden = await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    const text = document.querySelector('[data-pnl]').textContent;
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    return text;
  });
  assert.equal(hidden, '$175.82');
  assert.equal(await headline.textContent(), '$175.82');
  assert.deepEqual(await portfolio.allTextContents(), ['$1,000.23', '$1,000.23']);
  await until(() => workerState() === 'running', 'The restored document did not recheck the tab session');
  assert.deepEqual(errors, []);
});
