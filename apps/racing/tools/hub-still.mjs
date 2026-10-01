/**
 * hub-still.mjs — the Night Drive picture for the Sundown Club hub
 * (apps/hub/media/nightdrive.jpg): a real frame of the test drive at speed,
 * with every panel hidden (hub media are in-game frames with no HUD).
 *
 *   node apps/racing/tools/hub-still.mjs     (dev server: npm run dev:racing)
 */
import puppeteer from 'puppeteer-core';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = 'apps/racing/tools/shots';
mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio', '--window-size=1600,1000'],
  defaultViewport: { width: 1600, height: 1000 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto('http://localhost:5177/index.html', { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__lab, { timeout: 30000 });
await page.addStyleTag({ content: '.panel { display: none !important; }' });
await page.evaluate(() => __lab.drive(18, { throttle: 1 }));
await page.evaluate(() => __lab.drive(0.6, { throttle: 1, steer: 0.25 }));
await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
await page.screenshot({ path: `${OUT}/nightdrive.png` });
await browser.close();
execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '80', `${OUT}/nightdrive.png`, '--out', 'apps/hub/media/nightdrive.jpg']);
console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'apps/hub/media/nightdrive.jpg written, 0 console errors');
process.exit(errors.length ? 1 : 0);
