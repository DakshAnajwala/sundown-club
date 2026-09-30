/**
 * radar-probe.mjs — proves the proximity radar agrees with the level geometry.
 *
 * The radar is a driving aid: if it disagrees with where things actually are,
 * it is worse than not having one. So this asserts against numbers taken from
 * Levels.js, not against a screenshot.
 *
 *   node tools/radar-probe.mjs
 *
 * Needs the dev server: npx vite --port 5175 --strictPort
 */
import puppeteer from 'puppeteer-core';

const URL = 'http://localhost:5175/play/';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  protocolTimeout: 180000,
  args: ['--no-sandbox', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'],
  defaultViewport: { width: 900, height: 620 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
await sleep(2800);

/**
 * Index of a level by name. Probes must never hard-code a level index: levels
 * get inserted, and an index that was right when the probe was written then
 * silently points at a different level and asserts nothing useful.
 */
async function levelIndexNamed(name) {
  const i = await page.evaluate((n) => window.__game.debug().levelNames?.indexOf(n) ?? -1, name);
  if (i < 0) throw new Error(`level not found: ${name}`);
  return i;
}


// --- 1. a known parked car, at a known distance ------------------------------
// Level 1 (index 0) parks a car at (1, -13.8) heading 0, and the car is
// 4.20 x 1.78 m. Sitting at (1, -7.8) heading 0 puts it 6 m directly ahead:
// near face at 3.9 m from our centre, and 1.8 m from our own bumper.
const ahead = await page.evaluate(() => {
  const g = window.__game;
  g.debugPlay(0);
  g.debugRig(0.4);
  g.debugTeleport(1, -7.8, 0);
  g.debugRig(0.4);
  return g.debugRadar().filter((b) => b.kind === 'parkedCar');
});

// The whole bay row sits at z = -13.8, so several cars share that near face.
// The one directly ahead is the nearest of them.
const nearest = (list) => list.reduce((a, b) => (b.distance < a.distance ? b : a), list[0]);
const front = ahead.length ? nearest(ahead) : null;
check('parked car 6 m ahead appears ahead, at the right range',
  !!front && front.corners.every(([, z]) => z > 0) && near(Math.min(...front.corners.map((c) => c[1])), 3.9, 0.05),
  front ? `near face ${Math.min(...front.corners.map((c) => c[1])).toFixed(2)} m` : 'not found');
check('its bumper-to-bumper distance matches the geometry', !!front && near(front.distance, 1.8, 0.05),
  front ? `${front.distance.toFixed(2)} m (expect 1.80)` : '');
check('its footprint is the car\'s real width', !!front &&
  near(Math.max(...front.corners.map((c) => c[0])) - Math.min(...front.corners.map((c) => c[0])), 1.78, 0.05));

// --- 2. heading-up: turn the car, the blip must rotate with it ---------------
const turned = await page.evaluate(() => {
  const g = window.__game;
  g.debugTeleport(1, -7.8, Math.PI / 2); // nose west (-X)
  g.debugRig(0.4);
  return g.debugRadar().filter((b) => b.kind === 'parkedCar');
});
// Nose is now west, so the row that was straight ahead lies off to one side:
// the nearest car's footprint must be displaced mostly in x, not in z.
const side = turned.length ? nearest(turned) : null;
const spanX = side ? Math.abs(side.corners.reduce((a, c) => a + c[0], 0) / 4) : 0;
const spanZ = side ? Math.abs(side.corners.reduce((a, c) => a + c[1], 0) / 4) : 0;
check('the display is heading-up (blips rotate with the car)',
  !!side && spanX > spanZ,
  side ? `centre (${spanX.toFixed(1)}, ${spanZ.toFixed(1)})` : 'not found');

// --- 3. the floor filter, on the only level with floors ----------------------
// Level 13's roof is 12.8 m above the street. Parked on the roof, nothing from
// the decks below may appear — without the vertical test the radar shows the
// structure underneath as a wall in every direction.
const cityIndex = await levelIndexNamed('City Drive');
const roof = await page.evaluate((idx) => {
  const g = window.__game;
  g.debugPlay(idx);
  g.debugRig(0.5);
  g.debugTeleport(-10, -14, Math.PI / 2, 12.8);
  g.debugRig(0.5);
  const d = g.debug();
  return { y: d.pos?.y ?? null, blips: g.debugRadar() };
}, cityIndex);
const strays = roof.blips.filter((b) => b.kind === 'slab' || b.kind === 'ramp');
check('on the roof, no blips from the decks below', strays.length === 0,
  `${roof.blips.length} blips, ${strays.length} from other floors`);
check('the ground plane is never an obstacle',
  !roof.blips.some((b) => b.kind === 'ground'));

// --- 4. it costs nothing when there is nothing to see ------------------------
const ranged = await page.evaluate((range) => {
  const g = window.__game;
  g.debugPlay(0);
  g.debugRig(0.4);
  g.debugTeleport(-14, 6, 0);
  g.debugRig(0.4);
  const blips = g.debugRadar();
  return {
    count: blips.length,
    overRange: blips.filter((b) => b.distance > range).length,
    negative: blips.filter((b) => b.distance < 0).length,
  };
}, 12);
check('nothing beyond the radar\'s range is reported', ranged.overRange === 0,
  `${ranged.count} blips, ${ranged.overRange} over range`);
check('no negative distances', ranged.negative === 0);

check('no page errors', errors.length === 0, errors[0]?.slice(0, 120) ?? '');

await browser.close();
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} checks pass`);
process.exit(failed ? 1 : 0);
