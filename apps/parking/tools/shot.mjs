/**
 * shot.mjs — one screenshot, fast. For iterating on the car model.
 *
 *   node tools/shot.mjs <name> [angleDeg|driver] [distance] [height] [levelIndex]
 *
 * angle 180 = head on, 90 = driver's flank, 0 = tail, "driver" = the seat.
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const [, , name = 'shot', angle = '145', dist = '6', height = '2.2', lvl = '0'] = process.argv;
const URL = 'http://localhost:5175/play/?lowfx=1';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  protocolTimeout: 180000,
  args: [
    '--no-sandbox',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--mute-audio',
  ],
  defaultViewport: { width: 900, height: 560 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
await sleep(2600);

const info = await page.evaluate(
  (l, a, d, h) => {
    const g = window.__game;
    g.debugPlay(Number(l));
    g.debugTick(0.8);
    if (a !== 'driver') g.debugExternalView(Number(a), Number(d), Number(h));
    g.debugTick(0.05);
    // Report what the car group actually contains, so a missing panel shows up
    // as a number rather than as a guess about the picture.
    const car = g.debug();
    return { pos: car.pos, level: car.levelName };
  },
  lvl,
  angle,
  dist,
  height
);

await sleep(1500);
mkdirSync('tools/shots', { recursive: true });
await page.screenshot({ path: `tools/shots/${name}.png` });
console.log(`${name}.png  level=${info.level}  errors=${errors.length}`);
errors.slice(0, 5).forEach((e) => console.log('  ! ' + e.slice(0, 160)));
await browser.close();
