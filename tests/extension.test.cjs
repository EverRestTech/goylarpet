const { test } = require('node:test');
const assert = require('node:assert/strict');
const { browser, offlinePortfolio, until } = require('./browser.cjs');

test('action popup, live balances and saved offsets in desktop Chromium', { timeout: 90000 }, async t => {
  const context = await browser();
  t.after(() => context.close());
  const app = await offlinePortfolio(context);
  const page = context.pages()[0];
  await page.goto('https://polymarket.com/portfolio?tab=one');
  let popup = await app.open(page);
  const portfolio = '[data-copy="portfolio"]';
  const cash = '[data-copy="cash"]';

  async function expectText(tab, selector, expected) {
    await until(async () => {
      const values = await tab.locator(selector).allTextContents();
      return values.length && values.every(value => value === expected);
    }, 'Expected every ' + selector + ' to read ' + expected + ' in ' + tab.url());
  }
  async function writeAll(selector, values) {
    await page.locator(selector).evaluateAll((elements, values) => {
      for (const value of values) for (const el of elements) el.firstChild.data = value;
    }, values);
  }
  const submit = () => popup.click('button[type=submit]');
  const waitText = (selector, value) => until(async () => (await popup.text(selector)).includes(value), 'Popup should say ' + value);

  await t.test('the logo and name open the homepage and Support the author opens its section', async () => {
    const home = 'https://goylarpet.pages.dev/';
    await context.route(home, route => route.fulfill({ body: '<section id="support">Support the author</section>', contentType: 'text/html' }));
    for (const [selector, url] of [['.identity img', home], ['.identity span', home], ['.author-link', home + '#support']]) {
      const opened = context.waitForEvent('page');
      // The click closes Chrome's popup. Let the evaluation finish before navigating.
      await popup.send('Runtime.evaluate', {
        expression: `setTimeout(() => document.querySelector(${JSON.stringify(selector)}).click(), 0)`, userGesture: true
      });
      const website = await opened;
      await website.waitForURL(url);
      assert.equal(page.url(), 'https://polymarket.com/portfolio?tab=one');
      await website.close();
      popup = await app.open(page);
    }
  });

  await t.test('adds the entered adjustment to each real copy and accepts zero', async () => {
    assert.equal(await popup.text('#mode'), 'Off');
    assert.equal(await popup.text('#status'), '');
    await popup.fill('#amount-portfolio', '1e3');
    await submit();
    assert.equal(await popup.evaluate('document.querySelector("#amount-portfolio").validity.valid'), false);
    await popup.fill('#amount-portfolio', '+1,000');
    await popup.fill('#amount-cash', '0');
    await submit();
    await waitText('#mode', 'On');
    await expectText(page, portfolio, '$1,100');
    await expectText(page, cash, '$40');
    assert.equal(await page.locator(portfolio).count(), 2);
    assert.equal(await page.locator('table td').textContent(), '$12.00');
    assert.equal(await page.locator('form input').inputValue(), '$19');
  });

  await t.test('follows losses, gains and rapid successive writes without compounding', async () => {
    await writeAll(portfolio, ['$85']);
    await expectText(page, portfolio, '$1,085');
    await writeAll(portfolio, ['$86.12', '$99', '$125.05']);
    await expectText(page, portfolio, '$1,125.05');
    await submit();
    await expectText(page, portfolio, '$1,125.05');
    await writeAll(cash, ['$10.75']);
    await expectText(page, cash, '$10.75');
  });

  await t.test('rediscovers replacement text nodes, regions and same-document routes', async () => {
    await page.locator(portfolio).evaluateAll(elements => {
      for (const el of elements) el.replaceChildren(document.createTextNode('$150.90'));
    });
    await expectText(page, portfolio, '$1,150.90');
    await page.evaluate(() => {
      const old = document.querySelector('header');
      const replacement = document.createElement('header');
      replacement.innerHTML = '<a href="/portfolio"><span>Portfolio</span><b data-copy="portfolio">$150.90</b></a>';
      old.replaceWith(replacement);
      history.pushState(null, '', '/event/sample');
    });
    await expectText(page, 'header ' + portfolio, '$1,150.90');
    await expectText(page, 'main ' + portfolio, '$150.90');
    await page.evaluate(() => history.pushState(null, '', '/portfolio?tab=one'));
    await expectText(page, portfolio, '$1,150.90');
    await page.locator('header').evaluate(el => el.remove());
    await page.locator('.metrics').evaluate(el => el.hidden = true);
    await waitText('#status', 'waiting for a labelled balance');
    await page.locator('.metrics').evaluate(el => el.hidden = false);
    await expectText(page, portfolio, '$1,150.90');
  });

  await t.test('rejects ambiguous or unsupported text and restores verbatim site writes', async () => {
    await writeAll(portfolio, ['$1.2K']);
    await waitText('#status', 'unrecognized USD format');
    await expectText(page, portfolio, '$1.2K');
    await writeAll(portfolio, ['$85']);
    await expectText(page, portfolio, '$1,085');
    // The site writes a string identical to our paint. It is still a site write.
    await writeAll(portfolio, ['$1,085']);
    await expectText(page, portfolio, '$2,085');
    await writeAll(portfolio, ['$85']);
    await expectText(page, portfolio, '$1,085');
    await page.locator(portfolio).evaluate(el => { el.textContent = '$1,085'; });
    await expectText(page, portfolio, '$2,085');
    await writeAll(portfolio, ['$985.']); // An older extension left its punctuation.
    await waitText('#status', 'already marked');
    await page.locator(portfolio).evaluate(el => {
      el.replaceChildren(document.createTextNode('$85'), document.createTextNode('$75'));
    });
    await waitText('#status', 'multiple possible amounts');
    await expectText(page, portfolio, '$85$75');
    await page.locator(portfolio).evaluate(el => el.textContent = ' $085.00 ');
    await expectText(page, portfolio, ' $1,085 ');
    await popup.click('#disable');
    await waitText('#mode', 'Off');
    assert.equal(await popup.text('#status'), '');
    await expectText(page, portfolio, ' $085.00 ');
    await expectText(page, cash, '$10.75');
    await writeAll(portfolio, ['$91']);
    await expectText(page, portfolio, '$91');
  });

  await t.test('navigation, tab switching and reload keep following the latest real balance', async () => {
    await submit();
    await expectText(page, portfolio, '$1,091');
    await popup.close();
    await page.goto('https://polymarket.com/event/sample?tab=one');
    await expectText(page, 'header ' + portfolio, '$1,100');
    await expectText(page, 'main ' + portfolio, '$100');
    await page.goto('https://polymarket.com/portfolio?tab=one');
    await expectText(page, portfolio, '$1,100');
    await page.getByRole('button', { name: 'Simulate −$15' }).click();
    await expectText(page, portfolio, '$1,085');
    const other = await context.newPage();
    await other.goto('https://polymarket.com/portfolio?background-test');
    await other.bringToFront();
    await expectText(other, portfolio, '$100');
    await page.reload();
    await expectText(page, portfolio, '$1,085');
    await page.bringToFront();
    await page.getByRole('button', { name: 'Simulate +$25' }).click();
    await expectText(page, portfolio, '$1,110');
    await page.reload();
    await expectText(page, portfolio, '$1,110');
    await other.close();
    await writeAll(portfolio, ['$72']);
    await expectText(page, portfolio, '$1,072');
    popup = await app.open(page);
    assert.equal(await popup.text('#mode'), 'On');
    await popup.close();
  });

  await t.test('enables before balances appear and adds the same amount to copies that update separately', async () => {
    const fresh = await context.newPage();
    await fresh.goto('https://polymarket.com/portfolio?tab=fresh');
    await fresh.locator('header ' + portfolio).evaluate(el => el.firstChild.data = '$105');
    await fresh.locator('header, .metrics').evaluateAll(els => els.forEach(el => { el.hidden = true; el.style.display = 'none'; }));
    popup = await app.open(fresh);
    await popup.fill('#amount-cash', '');
    await popup.fill('#amount-portfolio', '500');
    await submit();
    await waitText('#mode', 'On');
    await waitText('#status', 'waiting for a labelled balance');
    await fresh.locator('.metrics').evaluate(el => { el.hidden = false; el.style.display = ''; });
    await expectText(fresh, 'main ' + portfolio, '$600');
    await expectText(fresh, 'header ' + portfolio, '$105');
    await fresh.locator('header').evaluate(el => { el.hidden = false; el.style.display = ''; });
    await expectText(fresh, 'header ' + portfolio, '$605');
    await expectText(fresh, 'main ' + portfolio, '$600');
    await popup.close();
  });

  await t.test('tabs stay independent and editing one adjustment affects only that field', async () => {
    const second = await context.newPage();
    await second.goto('https://polymarket.com/portfolio?tab=two');
    await expectText(second, portfolio, '$100');
    popup = await app.open(second);
    await popup.fill('#amount-portfolio', '1000000');
    await submit();
    await expectText(second, portfolio, '$1,000,100');
    await expectText(page, portfolio, '$1,072');
    await popup.close();
    popup = await app.open(page);
    assert.equal(await popup.evaluate('document.querySelector("#amount-portfolio").value'), '1000');
    await popup.fill('#amount-cash', '100');
    await submit();
    await expectText(page, portfolio, '$1,072');
    await expectText(page, cash, '$140');
    await popup.click('#disable');
    await expectText(page, portfolio, '$72');
    await second.reload();
    await expectText(second, portfolio, '$1,000,100');
    await popup.close();
    popup = await app.open(second);
    await popup.fill('#amount-portfolio', '10000');
    await popup.fill('#amount-cash', '0');
    await submit();
    await expectText(second, portfolio, '$10,100');
    await expectText(second, cash, '$40');
    await popup.close();
  });

  await t.test('refuses an unrelated control and drops the grant on leaving Polymarket', async () => {
    popup = await app.open(page);
    await popup.fill('#amount-portfolio', '900');
    await submit();
    await expectText(page, portfolio, '$972');
    await page.locator('header a').evaluate(el => {
      const row = document.createElement('div');
      row.innerHTML = '<span>Portfolio</span><button type="button" id="order-price">$15</button>';
      el.replaceWith(row);
    });
    await waitText('#status', 'multiple possible amounts');
    assert.equal(await page.locator('#order-price').textContent(), '$15');
    await popup.close();
    await page.goto('about:blank');
    popup = await app.open(page);
    assert.match(await popup.text('#status'), /Open polymarket.com/);
    assert.equal(await popup.evaluate('document.querySelector("fieldset").disabled'), true);
    assert.equal(await popup.evaluate('document.querySelector("#settings").getClientRects().length'), 0);
    assert.doesNotMatch(await popup.evaluate('document.body.innerText'), /adjustments|time ranges|\(added\)/i);
    await popup.close();
    await page.goto('https://polymarket.com/portfolio?tab=returned');
    popup = await app.open(page);
    assert.equal(await popup.text('#mode'), 'Off');
    assert.ok(await popup.evaluate('document.querySelector("#balance-help").getClientRects().length'));
    await expectText(page, portfolio, '$110');
    await popup.close();
  });

  await t.test('Russian portfolio and cash use distinct offsets in the card and the header', async () => {
    const ru = await context.newPage();
    await ru.goto('https://polymarket.com/ru/portfolio');
    popup = await app.open(ru);
    assert.equal(await popup.text('label[for="amount-portfolio"]'), 'Portfolio');
    assert.equal(await popup.text('label[for="amount-cash"]'), 'Cash');
    await popup.fill('#amount-cash', '');
    await popup.fill('#amount-portfolio', '1000');
    await popup.fill('#amount-cash', '10000');
    await submit();
    await expectText(ru, portfolio, '$1,000.13');
    await expectText(ru, cash, '$10,000.13');
    await ru.locator('header ' + cash).evaluate(el => { el.firstChild.data = '$0.10'; });
    await ru.locator('[data-digits]').evaluate(el => { el.firstChild.data = '0.10'; });
    await expectText(ru, cash, '$10,000.10');
    await expectText(ru, portfolio, '$1,000.13');
    await popup.fill('#amount-portfolio', '-1');
    await popup.fill('#amount-cash', '−0,25');
    await submit();
    await expectText(ru, portfolio, '-$0.87');
    await expectText(ru, cash, '-$0.15');
    await ru.locator('header ' + cash).evaluate(el => { el.firstChild.data = '$0.40'; });
    await ru.locator('[data-digits]').evaluate(el => { el.firstChild.data = '0.40'; });
    await expectText(ru, cash, '$0.15');
    await popup.fill('#amount-portfolio', '');
    await submit();
    await expectText(ru, portfolio, '$0.13');
    await expectText(ru, cash, '$0.15');
    assert.equal(await ru.locator('[data-day]').textContent(), '$0.00 (0.00%) за день');
    assert.equal(await ru.locator('[data-pnl]').textContent(), '$0');
    assert.equal(await ru.locator('[data-market]').textContent(), '$0.13');
    await popup.click('#disable');
    await expectText(ru, portfolio, '$0.13');
    await expectText(ru, cash, '$0.40');
    assert.equal(await ru.locator('[data-digits]').textContent(), '0.40');
    await popup.close();
  });
});
