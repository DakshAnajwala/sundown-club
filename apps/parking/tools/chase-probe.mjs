/**
 * chase-probe.mjs — proves the third-person camera behaves while the car is
 * actually driven, on a flat deck, under a roof, and on a multi-floor level.
 *
 *   node tools/chase-probe.mjs
 *
 * Needs the dev server: npx vite --port 5175 --strictPort
 */
import puppeteer from 'puppeteer-core';

const URL = 'http://localhost:5175/play/';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
};

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  protocolTimeout: 240000,
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

/** Drive for `frames` with the given keys held, sampling the rig every frame. */
async function drive(levelIndex, keys, frames, ceiling) {
  return page.evaluate(
    (l, ks, n) => {
      const g = window.__game;
      g.debugPlay(Number(l));
      g.debugRig(0.5);
      g.debugCameraMode('chase');
      g.debugSetGear('D');
      for (const k of ks) window.dispatchEvent(new KeyboardEvent('keydown', { code: k }));
      const samples = [];
      for (let i = 0; i < n; i++) {
        g.debugRig(1 / 60);
        samples.push(g.debugCameraMode());
      }
      for (const k of ks) window.dispatchEvent(new KeyboardEvent('keyup', { code: k }));
      return samples;
    },
    levelIndex,
    keys,
    frames,
    ceiling
  );
}

// --- 1. flat deck, driving and turning ---------------------------------------
const deck = await drive(0, ['KeyW', 'KeyD'], 200);
check('chase mode reports itself', deck.every((s) => s.mode === 'chase'));
check('the lens always points at the car', deck.every((s) => s.facingCar > 0.7),
  `worst ${Math.min(...deck.map((s) => s.facingCar)).toFixed(2)}`);
check('the boom never collapses onto the car', deck.every((s) => s.boom >= 2.1),
  `min ${Math.min(...deck.map((s) => s.boom)).toFixed(2)} m`);
check('the boom never stretches past its length', deck.every((s) => s.boom <= 7.0),
  `max ${Math.max(...deck.map((s) => s.boom)).toFixed(2)} m`);
check('the lens never drops through the floor', deck.every((s) => s.pos.y > s.car.y - 0.72 + 0.3),
  `min ${Math.min(...deck.map((s) => s.pos.y)).toFixed(2)} m`);
// Level 1's deck has a 3.3 m roof. Above it there is nothing to see but slab.
check('the lens stays under the deck roof', deck.every((s) => s.pos.y < s.car.y - 0.72 + 3.3),
  `max ${Math.max(...deck.map((s) => s.pos.y)).toFixed(2)} m`);

// Smoothness: no frame may teleport the camera.
let worstJump = 0;
for (let i = 1; i < deck.length; i++) {
  const a = deck[i - 1].pos;
  const b = deck[i].pos;
  worstJump = Math.max(worstJump, Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
}
check('the camera never jumps between frames', worstJump < 0.5, `worst ${worstJump.toFixed(3)} m/frame`);

// --- 2. the city: ramps, decks and the roof ----------------------------------
const city = await drive(await levelIndexNamed('City Drive'), ['KeyW'], 200);
check('city: the lens still points at the car', city.every((s) => s.facingCar > 0.7),
  `worst ${Math.min(...city.map((s) => s.facingCar)).toFixed(2)}`);
check('city: the lens never drops through the road', city.every((s) => s.pos.y > s.car.y - 1.2));

// --- 3. reverse raises the camera rather than spinning it --------------------
// A rooftop level: open sky, so the reversing pose is not capped by a deck
// roof the way it is on an enclosed deck.
const roofIndex = await levelIndexNamed('Roof One');
const rev = await page.evaluate((idx) => {
  const g = window.__game;
  g.debugPlay(idx);
  g.debugRig(0.5);
  g.debugCameraMode('chase');
  g.debugSetGear('D');
  for (let i = 0; i < 60; i++) g.debugRig(1 / 60);
  const forward = g.debugCameraMode();
  g.debugSetGear('R');
  for (let i = 0; i < 90; i++) g.debugRig(1 / 60);
  return { forward, reversing: g.debugCameraMode() };
}, roofIndex);
check('reverse raises the camera (open sky)', rev.reversing.pos.y > rev.forward.pos.y + 0.2,
  `${rev.forward.pos.y.toFixed(2)} -> ${rev.reversing.pos.y.toFixed(2)} m`);
check('reverse does NOT swing the boom round the front',
  rev.reversing.facingCar > 0.7,
  `facing ${rev.reversing.facingCar.toFixed(2)}`);

// --- 4. switching modes does not move the car --------------------------------
const swap = await page.evaluate(() => {
  const g = window.__game;
  g.debugPlay(0);
  g.debugRig(0.5);
  g.debugCameraMode('seat');
  for (let i = 0; i < 30; i++) g.debugRig(1 / 60);
  const before = g.debugCameraMode().car;
  g.debugCameraMode('chase');
  g.debugRig(1 / 60);
  const after = g.debugCameraMode().car;
  g.debugCameraMode('seat');
  g.debugRig(1 / 60);
  return { before, after, back: g.debugCameraMode() };
});
check('switching view leaves the car where it was',
  Math.hypot(swap.after.x - swap.before.x, swap.after.z - swap.before.z) < 0.02);
check('switching back restores the seat view', swap.back.mode === 'seat' && swap.back.boom < 2.0,
  `boom ${swap.back.boom.toFixed(2)} m`);

check('no page errors', errors.length === 0, errors[0]?.slice(0, 120) ?? '');

await browser.close();
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} checks pass`);
process.exit(failed ? 1 : 0);
