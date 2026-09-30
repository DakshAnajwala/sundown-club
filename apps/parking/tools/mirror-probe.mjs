/**
 * mirror-probe.mjs — mirrors: what each one sees, whether the driver can see
 * them, and what they cost.
 *
 *   node tools/mirror-probe.mjs [level]
 *
 * Writes tools/shots/mirror-{rear,left,right}.png (each render target, read
 * back with readRenderTargetPixels, which is how v2 proved its RTT pipeline
 * worked when the glass was the problem), mirror-seat.png and
 * mirror-lean-right.png. Then benchmarks full frames with mirrors live vs
 * static. Software GL: only the RATIO between the two numbers means anything.
 */
import puppeteer from 'puppeteer-core';
import { writeFileSync, mkdirSync } from 'node:fs';

const [, , lvl = '1'] = process.argv;
const URL = 'http://localhost:5175/play/?lowfx=1';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  protocolTimeout: 300000,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
  defaultViewport: { width: 1200, height: 750 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
await sleep(2500);
mkdirSync('tools/shots', { recursive: true });

await page.evaluate((l) => {
  window.__game.debugPlay(Number(l));
  window.__game.debugRig(0.8);
}, lvl);
// Let the real loop draw a few frames first. Read back straight after a level
// load, before anything had rendered, the targets came out as flat grey.
await sleep(2500);
const imgs = await page.evaluate(() => window.__game.debugMirrorImages());
for (const [name, url] of Object.entries(imgs)) {
  writeFileSync(`tools/shots/mirror-${name}.png`, Buffer.from(url.split(',')[1], 'base64'));
}

const vis = await page.evaluate(() => window.__game.debug().mirrors.visible);
console.log('visible from the seat:', JSON.stringify(vis));
await sleep(2000);
await page.screenshot({ path: 'tools/shots/mirror-seat.png' });

await page.keyboard.down('e');
const leanVis = await page.evaluate(() => {
  window.__game.debugRig(0.8);
  return window.__game.debug().mirrors.visible;
});
console.log('visible leaning right:', JSON.stringify(leanVis));
await sleep(2000);
await page.screenshot({ path: 'tools/shots/mirror-lean-right.png' });
await page.keyboard.up('e');
await page.evaluate(() => window.__game.debugRig(0.8));

// Alternate the modes so neither one systematically gets the warmer caches.
const runs = { live: [], static: [] };
for (let round = 0; round < 3; round++) {
  for (const mode of ['static', 'live']) {
    runs[mode].push(await page.evaluate((m) => window.__game.debugBenchmark(10, m), mode));
  }
}
const median = (xs) => xs.map((r) => r.msPerFrame).sort((a, b) => a - b)[1];
const live = { ms: median(runs.live), calls: runs.live[0].drawCallsPerFrame };
const stat = { ms: median(runs.static), calls: runs.static[0].drawCallsPerFrame };
console.log(`live:   ${live.ms} ms/frame (median of 3), ${live.calls} draw calls`);
console.log(`static: ${stat.ms} ms/frame (median of 3), ${stat.calls} draw calls`);
console.log(`mirror overhead: ${(((live.ms - stat.ms) / stat.ms) * 100).toFixed(0)}% time, ` +
  `${(((live.calls - stat.calls) / stat.calls) * 100).toFixed(0)}% draw calls (software GL)`);
console.log(`errors: ${errors.length}`);
errors.slice(0, 5).forEach((e) => console.log('  ! ' + e.slice(0, 200)));
await browser.close();
