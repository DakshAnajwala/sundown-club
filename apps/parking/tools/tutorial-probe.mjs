/**
 * tutorial-probe.mjs — proves the tutorial can be finished with real input.
 *
 * No teleports. An autopilot running inside the page dispatches genuine
 * KeyboardEvents (the same events Input.js listens for) and a real right-mouse
 * press on the canvas, and advances game time with debugRig so camera blends
 * and step confirmations run exactly as they would for a player. v1 shipped a
 * level no input could complete; a tutorial nobody can finish would be worse.
 *
 *   node tools/tutorial-probe.mjs
 */
import puppeteer from 'puppeteer-core';

const URL = 'http://localhost:5175/play/?lowfx=1';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  protocolTimeout: 300000,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
  defaultViewport: { width: 800, height: 500 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
await sleep(2500);

await page.evaluate(() => window.__game.debugTutorial());
const step = () => page.evaluate(() => window.__game.debug().tutorial);
console.log('start:', JSON.stringify(await step()));

// Step 1: look back with a real right-mouse press on the canvas.
await page.mouse.move(400, 250);
await page.mouse.down({ button: 'right' });
await page.evaluate(() => window.__game.debugRig(0.6));
await page.mouse.up({ button: 'right' });
await page.evaluate(() => window.__game.debugRig(1.2));
console.log('after look-back:', JSON.stringify(await step()));

// Everything else: an in-page autopilot.
const result = await page.evaluate(() => {
  const g = window.__game;
  const held = new Set();
  const key = (code, down) => {
    if (down === held.has(code)) return;
    window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code }));
    if (down) held.add(code);
    else held.delete(code);
  };
  const tap = (code) => {
    key(code, true);
    key(code, false);
  };
  const releaseAll = () => [...held].forEach((c) => key(c, false));
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

  const log = [];
  let lastIndex = -1;
  let t = 0;
  const TARGETS = { 2: [0, 0], 3: [0, 0], 4: [4, -11.5], 5: [4, -11.5], 6: [4, -4], 7: [4, -4] };

  while (t < 90) {
    const d = g.debug();
    if (d.state !== 'driving') break;
    const tut = d.tutorial;
    if (tut.index !== lastIndex) {
      log.push(`t=${t.toFixed(1)}s step ${tut.index + 1}: ${tut.title}`);
      lastIndex = tut.index;
      releaseAll();
    }
    const i = tut.index;
    const speed = d.car.speedMs;
    const target = TARGETS[i];

    if (tut.confirming) {
      // hold still-ish while the tick shows
      key('KeyW', false);
      key('KeyS', speed > 0.3);
    } else if (i === 1) {
      tap('KeyF');
    } else if (i === 5) {
      // Select reverse: stop first, then R.
      key('KeyW', false);
      key('KeyS', speed > 0.05);
      if (speed < 0.3) tap('KeyR');
    } else if (i === 7) {
      key('KeyW', false);
      key('KeyS', true);
      if (speed < 0.2) tap('KeyP');
    } else if (target) {
      const reversing = d.car.gear === 'R';
      const dx = target[0] - d.pos.x;
      const dz = target[1] - d.pos.z;
      const dist = Math.hypot(dx, dz);
      // Heading convention: 0 = nose -Z, +PI/2 = nose -X.
      const desired = Math.atan2(-dx, -dz);
      const facing = reversing ? d.heading + Math.PI : d.heading;
      const err = wrap(desired - facing);
      // Forward: err > 0 means turn left (A). Reversing inverts the yaw a
      // steering input produces, so the keys swap.
      const left = reversing ? err < -0.05 : err > 0.05;
      const right = reversing ? err > 0.05 : err < -0.05;
      key('KeyA', left && dist > 0.8);
      key('KeyD', right && dist > 0.8);
      const stopping = i === 3 || dist < 0.9; // inside every step's check radius
      key('KeyW', !stopping && speed < 2.2);
      key('KeyS', (stopping && speed > 0.05) || speed > 3.2);
    }

    g.debugRig(1 / 20, 1 / 60);
    t += 1 / 20;
  }
  releaseAll();
  const end = g.debug();
  return { log, state: end.state, tutorial: end.tutorial, pos: end.pos, t };
});

result.log.forEach((l) => console.log('  ' + l));
const doneOk = result.state === 'results';
const tutorialDone = await page.evaluate(() => window.__game.settings.get('tutorialDone'));
console.log(`\nfinal state=${result.state} after ${result.t.toFixed(1)}s game time; tutorialDone=${tutorialDone}`);
console.log(doneOk && tutorialDone ? 'PASS: tutorial completed by input' : `FAIL: stuck at ${JSON.stringify(result.tutorial)} pos ${JSON.stringify(result.pos)}`);
await sleep(1500);
await page.screenshot({ path: 'tools/shots/tutorial-done.png' });
console.log(`errors: ${errors.length}`);
errors.slice(0, 5).forEach((e) => console.log('  ! ' + e.slice(0, 200)));
await browser.close();
process.exit(doneOk && tutorialDone && !errors.length ? 0 : 1);
