/**
 * sensor-probe.mjs — parking sensor readings against known geometry.
 *
 * Probed in EMPTY non-target bays clear of the wall pilasters. Two traps found
 * writing this: teleporting onto a level's target pose in P completes the level
 * (and sensors are silent outside 'driving'), and a bay next to a pilaster
 * gets a legitimate corner-ray hit on the pilaster's side face.
 *
 * Bay row centre is z = -13.8 and the north wall's inner face is z = -17
 * (lot depth 34). A 4.2 m car nose-in at the bay centre has its front
 * bumper at -15.9, so the expected front reading is ~1.1 m; stepping the car
 * back should grow it 1:1 until it leaves the 1.5 m range. Also checks the
 * gating (P silent, rear only in R) and that a car sitting correctly in a bay
 * between two neighbours does not trigger the corner rays.
 *
 *   node tools/sensor-probe.mjs
 */
import puppeteer from 'puppeteer-core';

const URL = 'http://localhost:5175/play/?lowfx=1';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  protocolTimeout: 180000,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
  defaultViewport: { width: 640, height: 400 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
await sleep(2000);

const out = await page.evaluate(() => {
  const g = window.__game;
  const fmt = (v) => (v == null ? 'clear' : v.toFixed(2));
  const lines = [];
  let fails = 0;
  const check = (label, ok, detail) => {
    if (!ok) fails++;
    lines.push(`${ok ? 'PASS' : 'FAIL'}  ${label}  ${detail}`);
  };

  // --- distance vs geometry, level 1 ------------------------------------------
  g.debugPlay(0);
  for (const back of [0, 0.3, 0.6, 1.0]) {
    g.debugTeleport(-2, -13.8 + back, 0);
    g.debugTick(0.4);
    const m = g.debugSensors();
    const expect = 1.1 + back;
    const ok = expect > 1.5 ? m.front == null : m.front != null && Math.abs(m.front - expect) < 0.08;
    check(`front, ${back.toFixed(1)} m back from bay centre`, ok, `got ${fmt(m.front)} expect ${expect > 1.5 ? 'clear' : expect.toFixed(2)}`);
  }

  // --- gating -------------------------------------------------------------------
  g.debugTeleport(-2, -13.8, 0);
  g.debugTick(0.4);
  g.debugSetGear('P');
  let d = g.debugTick(0.3);
  check('silent in P', d.sensors.front == null && d.sensors.rear == null, JSON.stringify(d.sensors));
  g.debugSetGear('D');
  d = g.debugTick(0.3);
  check('front live in D', d.sensors.front != null && d.sensors.rear == null, JSON.stringify(d.sensors));

  // --- rear, level 2 (backed-in bay) -----------------------------------------------
  g.debugPlay(1);
  g.debugTeleport(-8, -13.8, Math.PI); // empty bay, clear of pilasters
  g.debugTick(0.4);
  g.debugSetGear('R');
  d = g.debugTick(0.3);
  check('rear live in R, backed into bay', d.sensors.rear != null && Math.abs(d.sensors.rear - 1.1) < 0.08, JSON.stringify(d.sensors));

  // --- neighbours must not trigger corner rays at a correct park -------------------
  // Level 4: 2.75 m pitch, the tightest bay row. Front of the car faces the
  // aisle, so only neighbours could trip the front fan.
  g.debugPlay(3);
  g.debugTeleport(-3.25, -11.8, Math.PI);
  g.debugTick(0.4);
  const tight = g.debugSensors();
  check('tight bay: front fan clear of neighbours', tight.front == null, `front ${fmt(tight.front)}`);

  // --- a parked car dead ahead ------------------------------------------------------
  // Level 3: kerbside row, cars at x = +/-5.6 facing west (-X). Put the player
  // car in the row, nose toward the car at x = -5.6. Its rear bumper is at
  // -5.6 + 2.1 = -3.5; our front bumper at x0 - 2.1; gap 0.8 at x0 = -0.6.
  g.debugPlay(2);
  g.debugTeleport(-0.6, -10.9, Math.PI / 2);
  g.debugTick(0.4);
  const car = g.debugSensors();
  check('parked car ahead at 0.8 m', car.front != null && Math.abs(car.front - 0.8) < 0.08, `front ${fmt(car.front)}`);

  return { lines, fails };
});

out.lines.forEach((l) => console.log(l));
console.log(`\n${out.fails} failures, ${errors.length} page errors`);
errors.slice(0, 5).forEach((e) => console.log('  ! ' + e));
await browser.close();
process.exit(out.fails || errors.length ? 1 : 0);
