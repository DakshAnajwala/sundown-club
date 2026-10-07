/** Draws the PWA icons (the sun on the horizon) with headless Chrome into apps/hub/icons/. Run by hand when the logo changes: node tools/make-icons.mjs */
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';

const svg = (size, pad) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#171a36"/><stop offset=".6" stop-color="#3a2218"/><stop offset="1" stop-color="#7a4424"/></linearGradient><clipPath id="c"><rect x="0" y="0" width="100" height="62"/></clipPath></defs><rect width="100" height="100" fill="url(#g)"/><g transform="translate(50 50) scale(${pad}) translate(-50 -50)"><circle cx="50" cy="62" r="26" fill="#f0a868" clip-path="url(#c)"/><line x1="14" y1="64" x2="86" y2="64" stroke="#f3e7d8" stroke-width="3" stroke-linecap="round"/><line x1="30" y1="73" x2="70" y2="73" stroke="#f3e7d8" stroke-width="3" stroke-linecap="round" opacity=".5"/></g></svg>`;
const b = await puppeteer.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
const p = await b.newPage();
for (const [name, size, pad] of [['icon-192.png', 192, 1], ['icon-512.png', 512, 1], ['icon-maskable-512.png', 512, 0.7], ['apple-touch-icon.png', 180, 1]]) {
  await p.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
  await p.setContent(`<body style="margin:0">${svg(size, pad)}</body>`);
  writeFileSync(`apps/hub/icons/${name}`, await p.screenshot({ type: 'png', clip: { x: 0, y: 0, width: size, height: size } }));
}
await b.close();
console.log('icons written');
