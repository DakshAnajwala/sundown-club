/**
 * cluster-shot.mjs — the instruments, seen two ways.
 *
 *   node tools/cluster-shot.mjs [name] [throttleSec] [gear] [level x z heading]
 *
 * Writes tools/shots/<name>-canvas.png (the cluster canvas at full resolution,
 * for judging the dial artwork) and <name>-seat.png (the driver's view, for
 * judging whether it can actually be read and isn't occluded).
 *
 * Throttle is held via real key events while game time is advanced with
 * debugRig, so the needles' springs are in the state a player would see.
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const [, , name = 'cluster', throttleSec = '1.6', gear = 'D', lvl = '0', tx, tz, th] = process.argv;
const pose = tx != null ? [Number(tx), Number(tz), Number(th ?? 0)] : null;
const URL = 'http://localhost:5175/play/?lowfx=1';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  protocolTimeout: 180000,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
  defaultViewport: { width: 1200, height: 750 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
await sleep(2500);

await page.evaluate(
  (g, l, p) => {
    window.__game.debugPlay(Number(l));
    if (p) window.__game.debugTeleport(p[0], p[1], p[2]);
    window.__game.debugRig(0.6);
    window.__game.debugSetGear(g);
    window.__game.debugRig(0.3);
  },
  gear,
  lvl,
  pose
);

let info = null;
if (Number(throttleSec) > 0) {
  await page.keyboard.down('w');
  info = await page.evaluate((s) => window.__game.debugRig(Number(s)), throttleSec);
  await page.keyboard.up('w');
} else {
  info = await page.evaluate(() => window.__game.debugRig(0.5));
}

const dataUrl = await page.evaluate(() => window.__game.debugClusterImage());
mkdirSync('tools/shots', { recursive: true });
writeFileSync(`tools/shots/${name}-canvas.png`, Buffer.from(dataUrl.split(',')[1], 'base64'));
await sleep(1500);
await page.screenshot({ path: `tools/shots/${name}-seat.png` });

console.log(
  `${name}: gear=${info.car.gear} ${info.car.speedKmh.toFixed(1)} km/h rpm=${Math.round(info.car.rpm)} errors=${errors.length}`
);
errors.slice(0, 5).forEach((e) => console.log('  ! ' + e.slice(0, 160)));
await browser.close();
