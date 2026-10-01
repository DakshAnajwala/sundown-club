/**
 * handling-shot.mjs — boots the Handling Lab in Chrome on the GPU, fails on
 * any console error, drives a few scripted manoeuvres through window.__lab and
 * saves screenshots to tools/shots/handling/.
 *
 *   node tools/handling-shot.mjs [baseUrl]
 *
 * Needs the dev server (npm run dev, port 5177) and puppeteer-core
 * (npm install --no-save puppeteer-core). Game time is stepped with
 * __lab.drive(), never with wall-clock sleeps.
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:5177';
const URL = `${BASE}/design/handling/index.html`;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = 'tools/shots/handling';
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  protocolTimeout: 120000,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio', '--window-size=1440,900'],
  defaultViewport: { width: 1440, height: 900 },
});
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' || /GL_INVALID/.test(m.text())) errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__lab, { timeout: 30000 });
const shot = async (name) => {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`  shot ${name}.png`);
};

const results = {};
await shot('01-start-chase');

let s = await page.evaluate(() => __lab.drive(9, { throttle: 1 }));
results.launch9s = { kmh: +s.speedKmh.toFixed(1), gear: s.gear, t100: s.runs.t100 };
await shot('02-straight-9s');

s = await page.evaluate(() => __lab.drive(13, { throttle: 1 }));
results.chase20s = { kmh: +s.speedKmh.toFixed(1), gear: s.gear };
await shot('02b-chase-fast');
s = await page.evaluate(() => __lab.drive(1.5, { throttle: 1, nitro: true }));
results.nitro = { kmh: +s.speedKmh.toFixed(1) };
await shot('02c-chase-nitro');
await page.evaluate(() => __lab.setCamera('cockpit'));
s = await page.evaluate(() => __lab.drive(1, { throttle: 1 }));
await shot('03-cockpit-speed');

s = await page.evaluate(() => __lab.drive(6, { throttle: 0, brake: 1 }));
results.brake = { kmh: +s.speedKmh.toFixed(1), brake100: s.runs.brake100 };

// Handbrake entry on the plaza, then a counter-steered drift (steer = slip / 40,
// the same driver model tools/race-physics-probe.mjs uses).
await page.evaluate(() => {
  __lab.setCamera('chase');
  __lab.teleport(-200, -480, Math.PI / 2);
});
await page.evaluate(() => __lab.drive(5, { throttle: 1, steer: 0 }));
await page.evaluate(() => __lab.drive(0.5, { throttle: 0.6, steer: -1, handbrake: true }));
await shot('04-handbrake');
let maxSlip = 0;
for (let part = 0; part < 2; part++) {
  // Per-frame counter-steer inside the page: a controller that only updates
  // every few frames lags the slide and spins the car.
  s = await page.evaluate(() => {
    let m = 0;
    let st;
    for (let i = 0; i < 60; i++) {
      const slip = __lab.state.slipDeg;
      st = __lab.drive(1 / 60, { throttle: 0.85, handbrake: false, steer: Math.max(-1, Math.min(1, slip / 40)) });
      m = Math.max(m, Math.abs(st.slipDeg));
    }
    return { ...st, maxSlip: m };
  });
  maxSlip = Math.max(maxSlip, s.maxSlip);
  if (part === 0) await shot('05-drift');
}
results.drift = { maxSlipDeg: +maxSlip.toFixed(1), score: Math.round(s.runs.driftBest) };

await page.evaluate(() => __lab.setCar('coupe'));
await page.evaluate(() => __lab.drive(0.5, {}));
await shot('06-coupe-start');

console.log(JSON.stringify(results, null, 2));
console.log(errors.length ? `ERRORS (${errors.length}):\n${errors.slice(0, 10).join('\n')}` : '0 console errors');
await browser.close();
process.exit(errors.length ? 1 : 0);
