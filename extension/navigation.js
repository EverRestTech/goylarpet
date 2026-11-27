// Each enabled tab keeps its own settings across same-origin document changes.
const origin = 'https://polymarket.com';
const key = tabId => 'active:' + tabId;
const queues = new Map();
const files = ['locales.js', 'money.js', 'balances.js', 'tab.js'];
const sessions = new Map();
let earlyLoader;

async function readSession(tabId) {
  if (sessions.has(tabId)) return sessions.get(tabId);
  const session = (await chrome.storage.session.get(key(tabId)))[key(tabId)];
  if (session) sessions.set(tabId, session);
  return session;
}

async function saveSession(tabId, profile, documentId) {
  const session = { profile, documentId };
  await chrome.storage.session.set({ [key(tabId)]: session });
  sessions.set(tabId, session);
}

function endSession(tabId) {
  sessions.delete(tabId);
  return chrome.storage.session.remove(key(tabId));
}

function prepareEarlyLoader() {
  const id = 'goylarpet-document-start';
  earlyLoader ??= chrome.scripting.getRegisteredContentScripts({ ids: [id] }).then(scripts => {
    if (!scripts.length) return chrome.scripting.registerContentScripts([{
      id, matches: [origin + '/*'], js: ['document-start.js', ...files], runAt: 'document_start', persistAcrossSessions: false
    }]);
  }).catch(error => { earlyLoader = null; throw error; });
  return earlyLoader;
}

function inOrder(tabId, operation) {
  const previous = queues.get(tabId) || Promise.resolve();
  const current = previous.catch(() => {}).then(operation);
  queues.set(tabId, current);
  const clear = () => { if (queues.get(tabId) === current) queues.delete(tabId); };
  current.then(clear, clear);
  return current;
}

async function invoke(target, request) {
  const [frame] = await chrome.scripting.executeScript({
    target, injectImmediately: true, func: input => globalThis.goylarpet.tab(input), args: [request]
  });
  if (!frame?.result) throw new Error('The document changed — reopen goylarpet in this tab');
  return frame.result;
}

async function changeMode(target, request) {
  const { tabId } = target;
  if (request.action === 'disable') await endSession(tabId);
  const result = await invoke(target, request);
  if (request.action === 'enable' && result.enabled && !result.error) {
    try {
      await prepareEarlyLoader().catch(() => {}); // onUpdated can still attach on navigation.
      await saveSession(tabId, result.profile, target.documentIds[0]);
      await chrome.storage.local.set({ last: result.profile });
    } catch {
      await endSession(tabId);
      const off = await invoke(target, { action: 'disable' });
      return { ...off, error: 'Chrome could not save the settings — try enabling this tab again' };
    }
  }
  return result;
}

async function follow(tabId, returningDocumentId) {
  const session = await readSession(tabId);
  if (!session) return false;
  let frame;
  try {
    [frame] = await chrome.scripting.executeScript({
      target: { tabId }, injectImmediately: true,
      func: async () => ({
        origin: location.origin,
        loaded: Boolean(globalThis.goylarpet?.tab),
        active: (await globalThis.goylarpet?.tab?.({ action: 'status' }))?.enabled
      })
    });
  } catch {
    // A mid-navigation document may already be gone. The completion event
    // retries when the grant still exists. Losing the grant ends the session.
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab?.url || new URL(tab.url).origin !== origin) await endSession(tabId);
    return false;
  }
  if (!frame?.result || (returningDocumentId && frame.documentId !== returningDocumentId)) return false;
  const { documentId, result } = frame;
  const sameDocument = session.documentId === documentId;
  if (result.origin !== origin) {
    await endSession(tabId);
    return false;
  }
  if (sameDocument && result.active) return true;
  const target = { tabId, documentIds: [documentId] };
  if (!result.loaded) await chrome.scripting.executeScript({ target, injectImmediately: true, files });
  const resumed = await invoke(target, { action: 'resume', profile: session.profile });
  if (resumed.enabled) await saveSession(tabId, resumed.profile, documentId);
  return resumed.enabled;
}

chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.status === 'loading' && (!tab.url || new URL(tab.url).origin !== origin)) {
    void inOrder(tabId, () => endSession(tabId));
  }
  // At document_start the top frame asks for its profile directly. Keep the
  // completion event as a fallback without queuing extra injections ahead of it.
  if (change.status !== 'complete') return;
  void inOrder(tabId, () => follow(tabId)).catch(() => {});
});
chrome.tabs.onRemoved.addListener(tabId => {
  void inOrder(tabId, () => endSession(tabId));
});
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message.action === 'document-start' && sender.origin === origin && sender.frameId === 0) {
    const tabId = sender.tab.id;
    void inOrder(tabId, async () => (await readSession(tabId))?.profile || null)
      .then(reply, () => reply(null));
    return true;
  }
  if (message.action === 'page-returned' && sender.origin === origin && sender.frameId === 0) {
    void inOrder(sender.tab.id, () => follow(sender.tab.id, sender.documentId)).then(reply, () => reply(false));
    return true;
  }
  if (sender.url !== chrome.runtime.getURL('popup.html') || !message.target) return;
  const { target, request } = message;
  void inOrder(target.tabId, () => changeMode(target, request)).then(reply, () => reply(null));
  return true;
});
