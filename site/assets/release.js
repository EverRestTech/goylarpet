// Set this URL after the Chrome Web Store listing is published.
const listing = null;

const install = document.querySelector('#store-link');
if (listing && install) {
  install.href = listing;
  install.hidden = false;
  document.querySelector('#store-status').hidden = true;
  document.querySelector('.doc-card h2').textContent = 'Getting started';
}
