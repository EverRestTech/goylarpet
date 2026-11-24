// Start the tab-scoped lookup while Chrome loads the bundled DOM reader.
// A document with no active session never installs the tab controller.
(() => {
  if (location.origin !== 'https://polymarket.com' || window !== top) return;
  const app = globalThis.goylarpet ??= {};
  const type = performance.getEntriesByType('navigation')[0]?.type;
  const history = window.navigation;
  const from = history && 'activation' in history ? history.activation?.from?.id :
    type === 'navigate' && history?.currentEntry && history.entries()[history.currentEntry.index - 1]?.id;
  // The outgoing, enabled document leaves only the names of the fields it
  // was displaying. Consume that one-navigation hint before the parser runs.
  // All numbers and the authority to resume come from extension storage.
  try {
    const hint = sessionStorage.getItem('goylarpet:next');
    if (hint !== null) {
      sessionStorage.removeItem('goylarpet:next');
      const [entry, ...fields] = hint.split(',');
      if (from && entry === from && type && type !== 'reload') {
        app.startingFields = fields.filter(id => /^(?:portfolio|cash|pnl_(?:\d{1,3}(?:[hdwmy]|min)|[ymqw]td|all))$/.test(id));
      }
    }
  } catch { /* Origin storage can be disabled by the user. */ }
  async function profileForDocument() {
    if (!type) return null;
    return chrome.runtime.sendMessage({ action: 'document-start', reload: type === 'reload' });
  }
  app.earlyProfile = profileForDocument().catch(() => null);
})();
