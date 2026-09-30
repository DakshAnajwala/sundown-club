/**
 * car-view.mjs — photograph the car from outside, so the bodywork can actually
 * be judged.
 *
 * The game itself has no third-person camera (the spec locks the player to the
 * driver's seat), which means the one thing you cannot normally see is the
 * thing being designed. This drives the verification-only external camera and
 * captures a turntable plus the driver's view.
 *
 *   node tools/car-view.mjs [url]
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const URL = process.argv[2] ?? 'http://localhost:5175/play/';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SHOTS = 'tools/shots';
const VIEW = { width: 900, height: 560 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  protocolTimeout: 180000,
  args: [
    '--no-sandbox',
    `--window-size=${VIEW.width},${VIEW.height}`,
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--mute-audio',
  ],
  defaultViewport: VIEW,
});

const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`UNCAUGHT: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto(URL + '?lowfx=1', { waitUntil: 'networkidle2', timeout: 60000 });
await sleep(3000);
mkdirSync(SHOTS, { recursive: true });

// Level 1 is the brightest lot, so it shows the body's surfacing best.
await page.evaluate(() => {
  window.__game.debugPlay(0);
  window.__game.debugTick(0.8);
});

// Turntable. Angle 0 looks at the car from straight ahead (+Z side is behind
// it), 90 is the driver's flank, 180 the tail.
const angles = [
  [180, 'front'],
  [135, 'front-three-quarter'],
  [90, 'side'],
  [35, 'rear-three-quarter'],
  [0, 'rear'],
];

for (const [deg, name] of angles) {
  await page.evaluate(
    (d) => {
      window.__game.debugExternalView(d, 7.5, 2.0);
      window.__game.debugTick(0.05);
    },
    deg
  );
  await sleep(1400);
  try {
    await page.screenshot({ path: `${SHOTS}/car-${name}.png` });
    console.log(`captured car-${name}.png`);
  } catch (e) {
    console.log(`FAILED car-${name}: ${String(e.message).slice(0, 90)}`);
  }
}

// A close low three-quarter, which is the angle that shows a car's stance.
await page.evaluate(() => {
  window.__game.debugExternalView(145, 5.2, 1.15);
  window.__game.debugTick(0.05);
});
await sleep(1400);
await page.screenshot({ path: `${SHOTS}/car-hero.png` });
console.log('captured car-hero.png');

// Back to the driver's seat.
await page.evaluate(() => {
  window.__game.debugExternalView(null);
  window.__game.debugTick(0.3);
});
await sleep(1400);
await page.screenshot({ path: `${SHOTS}/driver-view.png` });
console.log('captured driver-view.png');

// And the reversing camera, with the wheel wound on so the guidelines bend.
await page.evaluate(() => {
  const g = window.__game;
  g.debugSetGear('R');
  g.debugTick(1.2);
});
await page.keyboard.down('a');
await page.evaluate(() => window.__game.debugTick(0.35));
await page.keyboard.up('a');
await sleep(1400);
await page.screenshot({ path: `${SHOTS}/driver-reverse.png` });
console.log('captured driver-reverse.png');

console.log(`\nerrors: ${errors.length}`);
errors.slice(0, 8).forEach((e) => console.log(`  ! ${e.slice(0, 200)}`));

await browser.close();
