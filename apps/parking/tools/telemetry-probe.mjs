/**
 * telemetry-probe.mjs — proves the chase-camera telemetry pill agrees with the
 * car, appears only where it should, and costs nothing on an idle frame.
 *
 *   node tools/telemetry-probe.mjs
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
  defaultViewport: { width: 1000, height: 700 },
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

const read = () =>
  page.evaluate(() => {
    const el = document.querySelector('.hud-tel');
    const txt = (sel) => el?.querySelector(sel)?.textContent ?? null;
    return {
      shown: !!el && !el.hidden,
      gear: txt('[data-gear]'),
      speed: txt('[data-speed]'),
      unit: txt('[data-unit]'),
      rpm: txt('[data-rpm]'),
      lit: [...(el?.querySelectorAll('.hud-tel-dots i') ?? [])].filter(
        (d) => !d.style.background.includes('150,170,170')
      ).length,
      car: window.__game.debug().car,
    };
  });

// --- 1. visibility follows the camera ----------------------------------------
await page.evaluate(() => {
  const g = window.__game;
  g.settings.set('hudTelemetry', 'auto');
  g.settings.set('cameraMode', 'seat');
  g.debugPlay(0);
  g.debugRig(0.5);
});
check('hidden in the driver\'s seat on "auto"', !(await read()).shown);

await page.evaluate(() => {
  window.__game.settings.set('cameraMode', 'chase');
  window.__game.debugRig(0.2);
});
check('shown in chase on "auto"', (await read()).shown);

await page.evaluate(() => {
  const g = window.__game;
  g.settings.set('cameraMode', 'seat');
  g.settings.set('hudTelemetry', 'always');
  g.debugRig(0.2);
});
check('"always" shows it in the seat too', (await read()).shown);

await page.evaluate(() => {
  window.__game.settings.set('hudTelemetry', 'off');
  window.__game.debugRig(0.2);
});
check('"off" hides it everywhere', !(await read()).shown);

// --- 2. the numbers match the car -------------------------------------------
const cityIndex = await levelIndexNamed('City Drive');
await page.evaluate((idx) => {
  const g = window.__game;
  g.settings.set('hudTelemetry', 'always');
  g.settings.set('units', 'kmh');
  g.debugPlay(idx);
  g.debugRig(0.5);
  g.debugTeleport(-90, 107.2, -Math.PI / 2);
  g.debugRig(0.3);
  g.debugSetGear('D');
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
  for (let i = 0; i < 240; i++) g.debugRig(1 / 60);
}, cityIndex);
const kmh = await read();
check('speed matches the car, in km/h',
  Math.abs(Number(kmh.speed) - Math.round(kmh.car.speedKmh)) <= 1,
  `hud ${kmh.speed}, car ${kmh.car.speedKmh.toFixed(1)}`);
// Quantised to 10 rpm and held with a 20 rpm deadband, by design.
check('revs match the car', Math.abs(Number(kmh.rpm) - Math.round(kmh.car.rpm)) <= 25,
  `hud ${kmh.rpm}, car ${Math.round(kmh.car.rpm)}`);
check('gear shows the automatic\'s ratio', /^D[1-6]$/.test(kmh.gear ?? ''), kmh.gear ?? 'null');
check('unit label says KMH', kmh.unit === 'KMH');
check('shift dots light above the shift-up point', kmh.lit > 0, `${kmh.lit}/14 lit`);

await page.evaluate(() => {
  window.__game.settings.set('units', 'mph');
  window.__game.debugRig(1 / 60);
});
const mph = await read();
check('speed converts with the units setting',
  mph.unit === 'MPH' && Math.abs(Number(mph.speed) - kmh.car.speedKmh * 0.621371) <= 1.5,
  `hud ${mph.speed} mph, car ${(kmh.car.speedKmh * 0.621371).toFixed(1)}`);

// --- 3. an idle frame writes nothing ----------------------------------------
const idle = await page.evaluate(() => {
  const g = window.__game;
  g.debugSetGear('P');
  for (let i = 0; i < 120; i++) g.debugRig(1 / 60); // let everything settle
  const before = g.debugTelemetryWrites();
  for (let i = 0; i < 60; i++) g.debugRig(1 / 60);
  return g.debugTelemetryWrites() - before;
});
// 60 frames is one second of game time, and the elapsed-time field genuinely
// ticks ten times a second, so ~10 writes is the floor. Anything much above
// that means a field is churning on values the player cannot see.
check('a still car only writes the ticking clock', idle <= 12, `${idle} writes over 60 frames`);

check('no page errors', errors.length === 0, errors[0]?.slice(0, 120) ?? '');

await browser.close();
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} checks pass`);
process.exit(failed ? 1 : 0);
