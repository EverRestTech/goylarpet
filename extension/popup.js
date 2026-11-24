'use strict';
const { readInput, decimal, limit } = goylarpet.money;
const form = document.querySelector('#settings');
const mode = document.querySelector('#mode');
const statusLine = document.querySelector('#status');
const disable = document.querySelector('#disable');
const fields = new Map();
const adjustmentExample = '$100 (real) + $900 (added) = $1,000 (total)';
document.querySelector('#balance-help').append('\n' + adjustmentExample);
let formats = ['en'];
let target;
let busy = false;
let polling = false;
let lastError = '';

function field(id, label, container) {
  if (fields.has(id)) {
    fields.get(id).labels[0].textContent = label;
    return;
  }
  const group = document.createElement('div');
  const caption = document.createElement('label');
  caption.htmlFor = 'amount-' + id;
  caption.textContent = label;
  const wrap = document.createElement('div');
  wrap.className = 'dollar';
  const prefix = document.createElement('span');
  prefix.textContent = '$';
  prefix.setAttribute('aria-hidden', 'true');
  const input = document.createElement('input');
  input.id = caption.htmlFor;
  input.setAttribute('aria-describedby', id.startsWith('pnl_') ? 'pnl-help' : 'balance-help');
  input.inputMode = 'decimal';
  input.placeholder = '—';
  input.autocomplete = 'off';
  input.maxLength = 30;
  input.addEventListener('input', () => {
    input.setCustomValidity('');
    lastError = '';
  });
  wrap.append(prefix, input);
  group.append(caption, wrap);
  container.append(group);
  fields.set(id, input);
}

function drawFields(state, values = {}) {
  formats = state.formats || formats;
  const { englishName } = goylarpet.locales;
  for (const id of ['portfolio','cash']) field(id, englishName(id), document.querySelector('#amounts'));
  const ranges = new Set(state.periods);
  for (const id of Object.keys(values)) if (id.startsWith('pnl_')) ranges.add(id);
  const rangeFields = document.querySelector('#ranges');
  for (const id of ranges) field(id, englishName(id), rangeFields);
  const help = state.onPortfolio ? 'Check that the chart and its time ranges are visible' : 'Open your portfolio to see its time ranges';
  document.querySelector('#pnl-help').textContent = rangeFields.childElementCount
    ? 'Add your amount to the period’s real profit or loss\n' + adjustmentExample
    : help;
}
function loadSettings(profile) {
  for (const [id, input] of fields) {
    const value = profile?.amounts?.[id];
    input.value = Number.isSafeInteger(value) ? decimal(value) : '';
    input.setCustomValidity('');
  }
}
function show(result) {
  const label = result.enabled ? 'On in tab' : 'Off';
  if (mode.textContent !== label) mode.textContent = label;
  mode.classList.toggle('on', result.enabled);
  disable.disabled = !result.enabled;
  const text = lastError || result.error || result.notes?.join(' · ') || result.info || '';
  if (statusLine.textContent !== text) statusLine.textContent = text;
  statusLine.classList.toggle('problem', Boolean(lastError || result.error || result.notes?.length));
}
async function command(request) {
  let result;
  if (request.action === 'enable' || request.action === 'disable') {
    result = await chrome.runtime.sendMessage({ target, request });
  } else {
    const [frame] = await chrome.scripting.executeScript({ target, func: input => globalThis.goylarpet.tab(input), args: [request] });
    result = frame?.result;
  }
  if (!result) throw new Error('The document changed — reopen goylarpet in this tab');
  return result;
}
function unavailable(message) {
  target = null;
  form.querySelector('fieldset').disabled = true;
  show({ enabled: false, error: message });
}
async function initialize() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || new URL(tab.url).origin !== 'https://polymarket.com') {
    unavailable('Open polymarket.com in this tab, then click goylarpet');
    return;
  }
  const [frame] = await chrome.scripting.executeScript({
    target: { tabId: tab.id }, func: () => location.origin === 'https://polymarket.com'
  });
  if (!frame?.result) throw new Error('Open the extension again on Polymarket');
  target = { tabId: tab.id, documentIds: [frame.documentId] };
  await chrome.scripting.executeScript({ target, files: ['locales.js','money.js','balances.js','tab.js'] });
  const state = await command({ action: 'status', recheck: true });
  const profile = state.profile || (await chrome.storage.local.get('last')).last;
  drawFields(state, profile?.amounts);
  loadSettings(profile);
  form.querySelector('fieldset').disabled = false;
  show(state);
}
async function apply(request) {
  if (busy) return;
  busy = true;
  form.querySelector('fieldset').disabled = true;
  lastError = '';
  try {
    const result = await command(request);
    lastError = result.error || '';
    if (!lastError && request.action === 'enable') {
      drawFields(result, result.profile.amounts);
      loadSettings(result.profile);
    }
    show(result);
  } catch {
    unavailable('The document changed — reopen goylarpet in this tab');
  } finally {
    busy = false;
    form.querySelector('fieldset').disabled = !target;
  }
}
form.addEventListener('submit', event => {
  event.preventDefault();
  const amounts = {};
  for (const [id, input] of fields) {
    if (!input.value.trim()) continue;
    const amount = readInput(input.value, formats);
    if (amount === null || Math.abs(amount) > limit) {
      input.setCustomValidity('Enter a signed USD amount with up to two decimal places');
      input.reportValidity();
      return;
    }
    amounts[id] = amount;
  }
  void apply({ action: 'enable', amounts });
});
disable.addEventListener('click', () => void apply({ action: 'disable' }));
setInterval(async () => {
  if (!target || busy || polling) return;
  polling = true;
  try {
    const result = await command({ action: 'status' });
    if (!busy) {
      drawFields(result, result.profile?.amounts);
      show(result);
    }
  } catch {
    unavailable('The document changed — reopen goylarpet in this tab');
  } finally { polling = false; }
}, 1000);
initialize().catch(() => unavailable('Chrome could not access this document — open goylarpet again on Polymarket'));
