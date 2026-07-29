#!/usr/bin/env node
/* Generates the app icons.
 *
 * Kept as a script rather than checked-in artwork so the icon can be changed by
 * editing values here instead of round-tripping through an image editor.
 *
 *   node tools/make-icons.js
 *
 * Needs Playwright, which is only used to get a canvas — nothing else in the
 * project depends on it. */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT = path.join(__dirname, '..', 'icons');

/* Maskable icons get cropped to a circle on some launchers, so their artwork has
 * to sit inside the middle 80%. Plain icons can run closer to the edge. */
const TARGETS = [
  { file: 'icon-192.png', size: 192, safe: 0.72 },
  { file: 'icon-512.png', size: 512, safe: 0.72 },
  { file: 'icon-maskable-512.png', size: 512, safe: 0.54 },
  { file: 'apple-touch-icon.png', size: 180, safe: 0.72 }
];

// Runs inside the browser; takes one argument because page.evaluate passes one.
function render([size, safe]) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, 0, size);
  bg.addColorStop(0, '#3987e5');
  bg.addColorStop(1, '#1c5cab');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  // A rising but visibly jagged line — the subject is volatile growth, not a
  // smooth arrow, and the wobble is what the app is actually about.
  const heights = [0.16, 0.3, 0.22, 0.46, 0.38, 0.64, 0.56, 0.84];
  const pad = (size * (1 - safe)) / 2;
  const span = size * safe;
  const x = i => pad + (span * i) / (heights.length - 1);
  const y = h => pad + span * (1 - h);

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = size * 0.072;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  heights.forEach((h, i) => {
    if (i === 0) ctx.moveTo(x(i), y(h));
    else ctx.lineTo(x(i), y(h));
  });
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x(heights.length - 1), y(heights[heights.length - 1]), size * 0.078, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  return canvas.toDataURL('image/png');
}

/* The link preview card, at the 1200x630 every scraper expects.
 *
 * A separate function rather than another TARGETS entry, because `render` uses
 * one `size` for both axes and everything in it — the safe area, the line width,
 * the dot — is a fraction of that single number. A wide card has no safe area to
 * respect and needs room for words.
 *
 * The reason it exists at all: this app spreads by one teacher forwarding a link
 * to another, and a bare URL in an email reads as something dubious. The card is
 * the only thing standing between the link and a first impression. */
function renderCard() {
  const W = 1200;
  const H = 630;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Same gradient as the icons, on the diagonal so a wide box does not band.
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#3987e5');
  bg.addColorStop(1, '#1c5cab');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  /* The same jagged climb as the icon, drawn faintly across the full width as a
   * background. Volatile growth is the subject of the app, so it is the right
   * thing for the card to be a picture of. */
  const heights = [0.16, 0.3, 0.22, 0.46, 0.38, 0.64, 0.56, 0.84];
  const x = i => (W * i) / (heights.length - 1);
  const y = h => H - (H * 0.52 * h + H * 0.08);

  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 26;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  heights.forEach((h, i) => {
    if (i === 0) ctx.moveTo(x(i), y(h));
    else ctx.lineTo(x(i), y(h));
  });
  ctx.stroke();

  const pad = 84;
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'alphabetic';

  ctx.font = '700 108px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('Market Lab', pad, 292);

  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = '400 44px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('An investing simulator for the classroom', pad, 372);

  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.font = '400 34px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('Real NZ and world companies, funds and crypto', pad, 434);

  return canvas.toDataURL('image/png');
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('about:blank');
  fs.mkdirSync(OUT, { recursive: true });

  for (const t of TARGETS) {
    const dataUrl = await page.evaluate(render, [t.size, t.safe]);
    const b64 = dataUrl.split(',')[1];
    fs.writeFileSync(path.join(OUT, t.file), Buffer.from(b64, 'base64'));
    console.log('Wrote icons/' + t.file);
  }

  const card = await page.evaluate(renderCard);
  fs.writeFileSync(path.join(OUT, 'social-card.png'), Buffer.from(card.split(',')[1], 'base64'));
  console.log('Wrote icons/social-card.png');

  await browser.close();
})();
