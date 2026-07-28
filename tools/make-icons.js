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

  await browser.close();
})();
