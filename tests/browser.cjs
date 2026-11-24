const { chromium } = require('playwright-core');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');

async function browser() {
  return chromium.launchPersistentContext('', {
    channel: 'chromium', executablePath: process.env.CHROME_FOR_TESTING || undefined,
    headless: true, ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--enable-unsafe-extension-debugging', '--disable-background-networking', '--host-resolver-rules=MAP * ~NOTFOUND']
  });
}

async function until(read, message) {
  const deadline = Date.now() + 7000;
  do {
    const value = await read();
    if (value) return value;
    await delay(30);
  } while (Date.now() < deadline);
  throw new Error(message);
}

// Chrome exposes action popups as "other" targets. Attach to this actual
// popup through CDP so the packaged manifest and activeTab grant are exercised.
async function openPopup(root, id, page) {
  await page.bringToFront();
  const { targetInfos } = await root.send('Target.getTargets', { filter: [{ type: 'tab' }] });
  const tab = targetInfos.find(info => info.url === page.url());
  await root.send('Extensions.triggerAction', { id, targetId: tab.targetId });
  const popup = await until(async () => {
    const targets = await root.send('Target.getTargets');
    return targets.targetInfos.find(info => info.url === 'chrome-extension://' + id + '/popup.html');
  }, 'Chrome did not open the action popup');
  const { sessionId } = await root.send('Target.attachToTarget', { targetId: popup.targetId });
  let sequence = 0;
  const pending = new Map();
  const receive = event => {
    if (event.sessionId !== sessionId) return;
    const message = JSON.parse(event.message);
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message));
    else waiter.resolve(message.result);
  };
  root.on('Target.receivedMessageFromTarget', receive);

  async function send(method, params = {}) {
    const id = ++sequence;
    const reply = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    await root.send('Target.sendMessageToTarget', {
      sessionId, message: JSON.stringify({ id, method, params })
    });
    return reply;
  }
  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
  await until(() => evaluate('document.querySelector("#status")?.textContent !== "Checking this tab…" && !!document.querySelector("#status")'), 'Popup initialization timed out');
  // The page can repaint before the worker finishes saving and unlocks the form.
  const waitForEnabled = selector => until(
    () => evaluate('document.querySelector(' + JSON.stringify(selector) + ')?.matches(":enabled")'),
    'Popup control did not become available: ' + selector
  );
  async function click(selector) {
    await waitForEnabled(selector);
    await evaluate('document.querySelector(' + JSON.stringify(selector) + ').click()');
  }
  return {
    evaluate, send, click,
    disable: async () => {
      await click('#disable');
      await until(() => evaluate('document.querySelector("#mode").textContent === "Off"'), 'Disable did not finish');
    },
    fill: async (selector, value, event = 'input') => {
      await waitForEnabled(selector);
      await evaluate('(()=>{const el=document.querySelector(' + JSON.stringify(selector) + ');el.value=' + JSON.stringify(value) +
        ';el.dispatchEvent(new Event(' + JSON.stringify(event) + ',{bubbles:true}));})()');
    },
    text: selector => evaluate('document.querySelector(' + JSON.stringify(selector) + ').textContent'),
    close: async () => {
      root.off('Target.receivedMessageFromTarget', receive);
      await root.send('Target.closeTarget', { targetId: popup.targetId });
    }
  };
}

async function offlinePortfolio(context) {
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === 'https://polymarket.com' && route.request().isNavigationRequest()) {
      const fixture = url.pathname.startsWith('/ru/') ? 'portfolio-ru.html' : 'portfolio.html';
      return route.fulfill({ path: path.join(__dirname, 'fixtures', fixture), contentType: 'text/html' });
    }
    return route.abort();
  });
  const root = await context.browser().newBrowserCDPSession();
  const { id } = await root.send('Extensions.loadUnpacked', { path: path.resolve(__dirname, '../extension') });
  return { root, id, open: page => openPopup(root, id, page) };
}

module.exports = { browser, offlinePortfolio, until };
