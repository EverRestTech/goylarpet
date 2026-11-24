const canvas = document.querySelector('#chart');
const loss = document.querySelector('#loss');
const gain = document.querySelector('#gain');
const history = [70, 76, 74, 85, 82, 91, 86, 93, 92, 106, 99, 104, 100];
const offset = 900;
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

function draw() {
  // Use layout dimensions, independent of the paper's small CSS rotation.
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  const pad = 5;
  const low = Math.min(...history) - 5;
  const high = Math.max(...history) + 5;
  ctx.strokeStyle = '#786c873e';
  ctx.lineWidth = 1;
  for (let x = pad; x < width; x += 24) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
  }
  for (let y = pad; y < height; y += 16) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
  }
  // The two strips have independent vertical origins so small moves remain legible.
  function trace(bottom, dashed) {
    ctx.beginPath();
    ctx.lineWidth = dashed ? 1.6 : 2.8;
    ctx.setLineDash(dashed ? [4, 4] : []);
    ctx.strokeStyle = dashed ? '#766882' : '#3c2f46';
    let lastY = bottom;
    history.forEach((value, i) => {
      const x = pad + (width - 2 * pad) * i / (history.length - 1);
      lastY = bottom - (value - low) / (high - low) * height * .48;
      if (!i) ctx.moveTo(x, lastY);
      else ctx.lineTo(x, lastY);
    });
    ctx.stroke();
    if (!dashed) {
      ctx.fillStyle = '#3c2f46';
      ctx.beginPath(); ctx.arc(width - pad, lastY, 3.5, 0, 2 * Math.PI); ctx.fill();
    }
  }
  trace(height - 2, true);
  trace(height * .55, false);
}

function trade(delta) {
  const balance = history.at(-1) + delta;
  history.push(balance);
  if (history.length > 18) history.shift();
  document.querySelector('#real').textContent = usd.format(balance);
  document.querySelector('#fiction').firstChild.data = usd.format(balance + offset);
  document.querySelector('#trade-status').textContent = 'Simulated balance ' + usd.format(balance) +
    ', fictional balance ' + usd.format(balance + offset);
  loss.disabled = balance < 15;
  draw();
}
loss.addEventListener('click', () => trade(-15));
gain.addEventListener('click', () => trade(25));
new ResizeObserver(draw).observe(canvas);
