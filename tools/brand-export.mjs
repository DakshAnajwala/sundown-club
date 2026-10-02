/**
 * brand-export.mjs — renders the Sundown Club logo files from the master SVGs
 * in brand/logo/ (the pendant lamp, chosen by the owner on 2 Oct 2026).
 *
 *   node tools/brand-export.mjs
 *
 * Writes into brand/logo/:
 *   mark-400.png, mark-1024.png        square logo (LinkedIn company page: 400 × 400)
 *   cover-1128x191.png, cover-2256x382.png   LinkedIn cover banner (1× and 2×)
 *   lockup-dark.png, lockup-light.png  logo + name on a transparent background
 * and the site's icons: apps/hub/favicon.svg, apps/hub/apple-touch-icon.png.
 *
 * Needs puppeteer-core (npm install --no-save puppeteer-core) and Google Chrome.
 * Fonts come from node_modules/@fontsource, the same files the site serves.
 */
import { copyFileSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = resolve('.');
const OUT = join(ROOT, 'brand/logo');
const mark = readFileSync(join(OUT, 'mark.svg'), 'utf8');
const markLight = readFileSync(join(OUT, 'mark-light.svg'), 'utf8');
const font = (pkg, file) => pathToFileURL(join(ROOT, 'node_modules/@fontsource', pkg, 'files', file)).href;
const FONTS = `
@font-face { font-family: "Young Serif"; src: url("${font('young-serif', 'young-serif-latin-400-normal.woff2')}") format("woff2"); }
@font-face { font-family: "Schibsted Grotesk"; font-weight: 400; src: url("${font('schibsted-grotesk', 'schibsted-grotesk-latin-400-normal.woff2')}") format("woff2"); }
@font-face { font-family: "IBM Plex Mono"; font-weight: 500; src: url("${font('ibm-plex-mono', 'ibm-plex-mono-latin-500-normal.woff2')}") format("woff2"); }
html, body { margin: 0; background: transparent; }
svg { display: block; }`;

// The evening behind the name: the hub's dusk sky, stars, and two lines of hills.
const cover = `<div style="position:relative;width:1128px;height:191px;overflow:hidden;background:linear-gradient(180deg,#101230 0%,#231a3c 48%,#4a2230 82%,#7a3a2c 100%)">
  <svg width="1128" height="191" viewBox="0 0 1128 191" style="position:absolute;inset:0">
    ${[[402, 26, 1.4], [520, 52, 1], [611, 18, 1.2], [748, 40, 0.9], [866, 22, 1.3], [958, 58, 1], [1046, 30, 1.2], [690, 70, 0.8], [1090, 84, 0.9]]
      .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#e9ecff" opacity=".8"/>`).join('')}
    <circle cx="1072" cy="160" r="40" fill="#ffb26b" opacity=".9"/>
    <path d="M0 150 C120 128 230 136 340 148 S560 160 680 142 S900 124 1010 140 S1100 150 1128 146 V191 H0Z" fill="#2b1824"/>
    <path d="M0 172 C140 160 260 166 400 174 S640 182 760 170 S980 160 1128 170 V191 H0Z" fill="#160d14"/>
  </svg>
  <!-- LinkedIn lays the square logo over the bottom-left corner, so the cover carries only the name. -->
  <div style="position:absolute;left:330px;top:44px">
    <div>
      <div style="font:400 50px/1 'Young Serif';color:#f3e7d8;letter-spacing:-.01em">sundown club</div>
      <div style="margin-top:10px;font:400 17px 'Schibsted Grotesk';color:#e2d5c5">Small 3D browser games, set in one long evening.<span style="font:500 13px 'IBM Plex Mono';color:#d8c8b6;margin-left:14px">sundown-club.vercel.app</span></div>
    </div>
  </div>
</div>`;

const lockup = (svg, ink) => `<div style="display:inline-flex;align-items:center;gap:28px;padding:24px">
  <div style="width:120px;height:120px;border-radius:26px;overflow:hidden">${svg.replace('<svg ', '<svg width="120" height="120" ')}</div>
  <div style="font:400 84px/1 'Young Serif';color:${ink};letter-spacing:-.01em;white-space:nowrap">sundown club</div>
</div>`;

const shots = [
  { file: 'mark-400.png', w: 400, h: 400, html: mark.replace('<svg ', '<svg width="400" height="400" ') },
  { file: 'mark-1024.png', w: 1024, h: 1024, html: mark.replace('<svg ', '<svg width="1024" height="1024" ') },
  { file: 'cover-1128x191.png', w: 1128, h: 191, html: cover },
  { file: 'cover-2256x382.png', w: 1128, h: 191, scale: 2, html: cover },
  { file: 'lockup-dark.png', w: 760, h: 168, html: lockup(mark, '#f3e7d8'), transparent: true },
  { file: 'lockup-light.png', w: 760, h: 168, html: lockup(markLight, '#1b1411'), transparent: true },
  { file: '../../apps/hub/apple-touch-icon.png', w: 180, h: 180, html: mark.replace('<svg ', '<svg width="180" height="180" ') },
];

const dir = mkdtempSync(join(tmpdir(), 'brand-'));
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
const page = await browser.newPage();
for (const s of shots) {
  await page.setViewport({ width: s.w, height: s.h, deviceScaleFactor: s.scale ?? 1 });
  const htmlFile = join(dir, 'page.html');
  writeFileSync(htmlFile, `<!doctype html><meta charset="utf-8"><style>${FONTS}</style>${s.html}`);
  await page.goto(pathToFileURL(htmlFile).href, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(OUT, s.file), omitBackground: !!s.transparent, clip: { x: 0, y: 0, width: s.w, height: s.h } });
  console.log('wrote', s.file.replace('../../', ''));
}
await browser.close();
copyFileSync(join(OUT, 'mark.svg'), join(ROOT, 'apps/hub/favicon.svg'));
console.log('wrote apps/hub/favicon.svg');
