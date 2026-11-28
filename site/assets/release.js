// Fill these in when the public listing and official X profile are available.
const listing = null;
const xProfile = null;

if (listing) {
  for (const link of document.querySelectorAll('[data-install]')) {
    link.href = listing;
    link.hidden = false;
  }
  const status = document.querySelector('#store-status');
  if (status) {
    status.hidden = true;
    document.querySelector('.doc-card h2').textContent = 'Getting started';
  }
}

if (xProfile) {
  for (const link of document.querySelectorAll('[data-x]')) {
    link.href = xProfile;
    link.hidden = false;
  }
}
