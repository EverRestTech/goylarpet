// Fill these in when the public listing, demo file and official X profile are available.
const listing = null;
const demoVideo = null;
const xProfile = null;

if (listing) {
  for (const link of document.querySelectorAll('[data-install]')) {
    link.href = listing;
    link.hidden = false;
    if (link.hasAttribute('data-install-label')) link.textContent = 'Install for Chrome';
  }
  const status = document.querySelector('#store-status');
  if (status) {
    status.hidden = true;
    document.querySelector('.doc-card h2').textContent = 'Getting started';
  }
}

const walkthrough = document.querySelector('#walkthrough');
if (demoVideo && walkthrough) {
  walkthrough.querySelector('video').src = demoVideo;
  walkthrough.hidden = false;
}

if (xProfile) {
  for (const link of document.querySelectorAll('[data-x]')) {
    link.href = xProfile;
    link.hidden = false;
  }
}
