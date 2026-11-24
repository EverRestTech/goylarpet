const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { browser } = require('./browser.cjs');

const origin = 'https://goylarpet.pages.dev';
const repository = 'https://github.com/EverRestTech/goylarpet';
const directory = path.resolve(__dirname, '../site');
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.png': 'image/png',
  '.xml': 'application/xml', '.txt': 'text/plain' };

test('static site, release links, SEO and donation clipboard', { timeout: 45000 }, async t => {
  const context = await browser();
  t.after(() => context.close());
  const missing = [];
  const errors = [];
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) throw new Error('Unexpected external request ' + url.origin);
    let filename = url.pathname;
    if (filename.endsWith('/')) filename += 'index.html';
    const file = path.join(directory, filename);
    try {
      const body = await fs.readFile(file);
      await route.fulfill({ body, contentType: types[path.extname(file)] });
    } catch {
      missing.push(filename);
      await route.fulfill({ status: 404, body: 'Missing file' });
    }
  });
  const page = context.pages()[0];
  page.on('pageerror', error => errors.push(error.message));
  const pages = {
    '/': 'goylarpet — Polymarket Parody Portfolio',
    '/download/': 'Download goylarpet for Chrome',
    '/privacy/': 'Privacy and permissions — goylarpet'
  };

  await t.test('titles, canonical URLs, metadata, resources and linked anchors resolve', async () => {
    const descriptions = new Set();
    for (const [route, title] of Object.entries(pages)) {
      await page.goto(origin + route);
      assert.equal(await page.title(), title);
      assert.equal(await page.locator('h1').count(), 1);
      assert.equal(await page.locator('h1').textContent(), route === '/privacy/' ? 'Privacy and permissions' : title);
      assert.equal(await page.locator('[rel=canonical]').getAttribute('href'), origin + route);
      descriptions.add(await page.locator('[name=description]').getAttribute('content'));
      assert.equal(await page.getByRole('link', { name: 'GitHub', exact: true }).getAttribute('href'), repository);
      const broken = await page.locator('a[href],link[rel=icon],meta[property="og:image"]').evaluateAll(async (links, repository) => {
        const broken = [];
        for (const link of links) {
          const url = new URL(link.href || link.content);
          if (url.href === repository) continue;
          const response = await fetch(url);
          if (!response.ok) { broken.push(url.href); continue; }
          if (url.hash) {
            const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
            if (!doc.getElementById(url.hash.slice(1))) broken.push(url.href);
          }
        }
        return broken;
      }, repository);
      assert.deepEqual(broken, []);
    }
    assert.equal(descriptions.size, 3);
    const seo = await page.evaluate(async () => {
      const robots = await (await fetch('/robots.txt')).text();
      const sitemap = await (await fetch('/sitemap.xml')).text();
      const xml = new DOMParser().parseFromString(sitemap, 'application/xml');
      return { robots, urls: [...xml.querySelectorAll('loc')].map(loc => loc.textContent) };
    });
    assert.ok(seo.robots.includes('Sitemap: ' + origin + '/sitemap.xml'));
    assert.deepEqual(seo.urls, Object.keys(pages).map(route => origin + route));
  });

  await t.test('mobile layouts fit, simulator responds and install status matches the unpublished build', async () => {
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      for (const route of Object.keys(pages)) {
        await page.goto(origin + route);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), width + ' ' + route);
      }
    }
    await page.goto(origin);
    await page.locator('#loss').click();
    assert.equal(await page.locator('#fiction').textContent(), '$985');
    await page.locator('#gain').click();
    assert.equal(await page.locator('#fiction').textContent(), '$1,010');
    assert.equal(await page.locator('#real').textContent(), '$110');
    assert.equal(await page.locator('#donations').isVisible(), false);
    assert.equal(await page.locator('#no-address').isVisible(), true);
    await page.getByRole('link', { name: 'Get goylarpet' }).click();
    assert.equal(new URL(page.url()).pathname, '/download/');
    assert.equal(await page.locator('#store-link').isVisible(), false);
    assert.equal(await page.locator('#store-link').getAttribute('href'), null);
    assert.match(await page.locator('#store-status').textContent(), /yet to be submitted/);
    assert.equal(await page.locator('a[href$=".zip"]').count(), 0);
  });

  await t.test('all ten token/network combinations copy the selected receiving address only', async () => {
    // Serve obviously non-payable strings only in this isolated browser session.
    // The site's static address list on disk stays empty.
    const source = await fs.readFile(path.join(directory, 'assets/pairs.js'), 'utf8');
    const module = source.replace('export const pairs', 'const catalog') +
      '\nexport const pairs = catalog.map((p,i) => ({...p, address:"TEST ONLY / "+i, confirmed:true}));' +
      '\npairs.push({...pairs[0],network:"Unconfirmed",confirmed:false},{...pairs[0],network:"Empty",address:null});';
    await page.route('**/assets/pairs.js', r => r.fulfill({ contentType: 'application/javascript', body: module }));
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto(origin);
    const expectedNetworks = {
      USDT: ['TRON (TRC-20)', 'BNB Smart Chain (BEP-20)', 'Ethereum (ERC-20)', 'Solana'],
      USDC: ['Base', 'Polygon PoS', 'Solana'], BTC: ['Bitcoin mainnet'], ETH: ['Ethereum mainnet', 'Base']
    };
    assert.deepEqual(await page.locator('#token option').allTextContents(), Object.keys(expectedNetworks));
    let index = 0;
    for (const [token, networks] of Object.entries(expectedNetworks)) {
      await page.locator('#token').selectOption(token);
      assert.deepEqual(await page.locator('#network option').allTextContents(), networks);
      for (const network of networks) {
        await page.locator('#network').selectOption(network);
        const expected = 'TEST ONLY / ' + index++;
        assert.equal(await page.locator('#address').textContent(), expected);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), token + ' on ' + network);
        assert.equal(await page.locator('#send-note').textContent(), 'Send only ' + token + ' on ' + network + ' to this address');
        await page.locator('#copy').click();
        await page.waitForFunction(() => document.querySelector('#copy-status').textContent === 'Copied');
        assert.equal(await page.evaluate(() => navigator.clipboard.readText()), expected);
      }
    }
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(missing, []);
});
