import { pairs } from './pairs.js';

const available = pairs.filter(pair => pair.confirmed === true && typeof pair.address === 'string' && pair.address.trim());
if (available.length) {
  const token = document.querySelector('#token');
  const network = document.querySelector('#network');
  const feedback = document.querySelector('#copy-status');
  const current = () => available.find(item => item.token === token.value && item.network === network.value);

  function showAddress() {
    const pair = current();
    document.querySelector('#token-logo').src = '/assets/tokens/' + pair.token.toLowerCase() + '.png';
    document.querySelector('#pair').textContent = pair.asset + ' — ' + pair.network;
    document.querySelector('#address').textContent = pair.address;
    document.querySelector('#send-note').textContent = 'Send only ' + pair.token + ' on ' + pair.network + ' to this address';
    feedback.textContent = '';
  }

  function showNetworks() {
    network.replaceChildren();
    for (const pair of available.filter(pair => pair.token === token.value)) {
      network.add(new Option(pair.network, pair.network));
    }
    showAddress();
  }

  for (const value of new Set(available.map(pair => pair.token))) token.add(new Option(value, value));
  token.addEventListener('change', showNetworks);
  network.addEventListener('change', showAddress);
  document.querySelector('#copy').addEventListener('click', async () => {
    const pair = current();
    try {
      await navigator.clipboard.writeText(pair.address);
      if (current() === pair) feedback.textContent = 'Copied';
    } catch {
      if (current() === pair) feedback.textContent = 'Select the address above and copy it manually';
    }
  });
  showNetworks();
  document.querySelector('#no-address').hidden = true;
  document.querySelector('#donations').hidden = false;
}
