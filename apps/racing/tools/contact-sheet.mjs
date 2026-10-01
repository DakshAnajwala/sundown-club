/**
 * contact-sheet.mjs — tiles screenshots into one image, for reviewing a
 * scene's shots at a glance.
 *
 *   node tools/contact-sheet.mjs <out.png> <cols> <img> [img ...]
 *
 * Uses puppeteer-core's Chrome (no image libraries needed).
 */
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';

const [out, colsArg, ...files] = process.argv.slice(2);
const cols = +colsArg || 2;
const W = 720;
const H = 450;
const rows = Math.ceil(files.length / cols);
const tiles = files
  .map((f) => `<div><img src="data:image/png;base64,${readFileSync(f).toString('base64')}"><span>${f.split('/').pop()}</span></div>`)
  .join('');
const html = `<html><body style="margin:0;background:#000;display:grid;grid-template-columns:repeat(${cols},${W}px)">
<style>div{position:relative;width:${W}px;height:${H}px}img{width:${W}px;height:${H}px;display:block}span{position:absolute;left:6px;top:4px;color:#fff;font:12px monospace;text-shadow:0 0 3px #000}</style>${tiles}</body></html>`;
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: W * cols, height: H * rows });
await page.setContent(html, { waitUntil: 'load' });
await page.screenshot({ path: out });
await browser.close();
