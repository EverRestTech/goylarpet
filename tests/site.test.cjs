const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { browser } = require('./browser.cjs');

const origin = 'https://goylarpet.pages.dev';
const repository = 'https://github.com/EverRestTech/goylarpet';
const directory = path.resolve(__dirname, '../site');
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.xml': 'application/xml', '.txt': 'text/plain', '.mp4': 'video/mp4', '.jpg': 'image/jpeg' };

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
          if (url.href === repository || url.href === repository + '/issues') continue;
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

  await t.test('mobile layouts fit and the preview, donation link and store status are available', async () => {
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      for (const route of Object.keys(pages)) {
        await page.goto(origin + route);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), width + ' ' + route);
      }
    }
    await page.goto(origin);
    const screenshots = page.locator('.preview img, #before-and-after img');
    assert.equal(await screenshots.count(), 4);
    for (const img of await screenshots.all()) {
      await img.scrollIntoViewIfNeeded();
      assert.ok(await img.evaluate(async el => {
        await el.decode();
        return el.naturalWidth === Number(el.getAttribute('width')) &&
          el.naturalHeight === Number(el.getAttribute('height'));
      }));
    }
    assert.equal(await page.locator('canvas, #mechanics').count(), 0);
    const demo = page.locator('#walkthrough video');
    assert.ok(await demo.isVisible());
    await demo.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelector('#walkthrough video').src.startsWith('blob:'));
    assert.ok(await demo.evaluate(async video => {
      const poster = new Image();
      poster.src = video.poster;
      await poster.decode();
      await video.play();
      video.pause();
      const target = video.duration * 0.75;
      const seeked = new Promise(resolve => video.addEventListener('seeked', resolve, { once: true }));
      video.currentTime = target;
      await seeked;
      return video.controls && video.playsInline && video.videoWidth > 0 &&
        target > 0 && Math.abs(video.currentTime - target) < 0.1;
    }));
    await page.getByRole('link', { name: 'Support the author' }).click();
    assert.equal(new URL(page.url()).hash, '#support');
    assert.equal(await page.locator('#donations').isVisible(), false);
    assert.equal(await page.locator('#no-address').isVisible(), true);
    const install = page.getByRole('link', { name: 'Install', exact: true });
    assert.equal(await install.count(), 2);
    assert.deepEqual(await install.evaluateAll(links => links.map(a => a.getAttribute('href'))), ['/download/', '/download/']);
    await page.locator('.hero').getByRole('link', { name: 'Install', exact: true }).click();
    assert.equal(new URL(page.url()).pathname, '/download/');
    assert.equal(await page.locator('#store-link').isVisible(), false);
    assert.equal(await page.locator('#store-link').getAttribute('href'), null);
    assert.match(await page.locator('#store-status').textContent(), /listing pending/);
    assert.equal(await page.locator('a[href$=".zip"]').count(), 0);
  });

  await t.test('Before and After sit above their screenshots and all-time profit stays on the right', async () => {
    await page.goto(origin);
    assert.equal(await page.locator('.preview figcaption').count(), 0);
    const before = page.getByRole('region', { name: 'Before', exact: true });
    const after = page.getByRole('region', { name: 'After', exact: true });
    assert.equal(await before.locator('figcaption').count(), 1);
    assert.equal(await after.locator('figcaption').count(), 1);
    assert.equal(await after.locator('.all-time figcaption').innerText(),
      'Now I’m the richest larper alive\nSuck it, bitches');
    assert.doesNotMatch(await page.locator('#before-and-after').innerText(), /All-time P&L|PARODY · NO REAL MONEY/);
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      const left = await before.locator('.portfolio-shot').boundingBox();
      const right = await after.locator('.portfolio-shot').boundingBox();
      const profit = await after.locator('.all-time a').boundingBox();
      const leftTitle = await before.getByRole('heading').boundingBox();
      const rightTitle = await after.getByRole('heading').boundingBox();
      assert.ok(leftTitle.y + leftTitle.height <= left.y && rightTitle.y + rightTitle.height <= right.y);
      assert.ok(left.x + left.width < right.x && left.y === right.y);
      assert.ok(profit.x === right.x && profit.y >= right.y + right.height);
      assert.ok(await after.evaluate(el => parseFloat(getComputedStyle(el).borderInlineStartWidth) > 0));
    }
    for (const shot of await page.locator('#before-and-after figure > a').all()) {
      await shot.hover();
      assert.equal(await shot.evaluate(el => getComputedStyle(el).borderTop), '1px solid rgb(220, 255, 0)');
    }
  });

  await t.test('install links go directly to the listing when a public URL is configured', async () => {
    const mock = 'https://chromewebstore.google.com/detail/test-only/' + 'a'.repeat(32);
    const source = await fs.readFile(path.join(directory, 'assets/release.js'), 'utf8');
    await page.route('**/assets/release.js', route => route.fulfill({
      contentType: 'application/javascript',
      body: source.replace('const listing = null;', 'const listing = ' + JSON.stringify(mock) + ';')
    }));
    for (const route of Object.keys(pages)) {
      await page.goto(origin + route);
      const destinations = await page.locator('[data-install]').evaluateAll(links => links.map(link => link.href));
      assert.ok(destinations.length && destinations.every(href => href === mock));
      if (route === '/download/') {
        assert.equal(await page.locator('#store-status').isVisible(), false);
        assert.equal(await page.locator('#store-link').isVisible(), true);
      }
    }
    await page.unroute('**/assets/release.js');
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
      assert.equal(await page.locator('#token-logo').getAttribute('src'), '/assets/tokens/' + token.toLowerCase() + '.png');
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
