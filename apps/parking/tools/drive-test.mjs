/**
 * drive-test.mjs — scripted browser verification.
 *
 * Loads the running dev server in a real Chrome, captures every console error
 * and uncaught exception, then proves two things static checks cannot:
 *
 *   1. the game boots and renders without throwing
 *   2. EVERY level can actually be completed
 *
 * (2) works by teleporting the car onto each level's exact target pose and
 * confirming the park detector fires. v1 shipped a level that no input could
 * ever complete — two parked cars left a 3.4 m gap for a 4.2 m car — and only
 * this technique found it. v1 and v3 both also only ever tested level 1.
 *
 * Timing note: everything that needs game time uses game.debugTick(), which
 * steps the simulation at a fixed dt with no rendering. Wall-clock sleeps are
 * useless here — headless Chrome has no GPU, SwiftShader renders single-digit
 * fps, and the loop's MAX_DT clamp then makes game time crawl relative to real
 * time. debugTick gives the same answer a player would get, instantly.
 *
 * Uses puppeteer-core against the system Chrome (installed with --no-save, not
 * a project dependency — same practice recorded in NOTES.md).
 *
 *   node tools/drive-test.mjs [url]
 */
import puppeteer from 'puppeteer-core';
import { writeFileSync, mkdirSync } from 'node:fs';

const URL = process.argv[2] ?? 'http://localhost:5175/play/';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SHOTS = 'tools/shots';
// Small viewport + ?lowfx: software rasterising 1440x900 with an AO pass takes
// seconds per frame and times out the screenshot RPC.
const VIEW = { width: 900, height: 560 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  protocolTimeout: 180000,
  args: [
    '--no-sandbox',
    `--window-size=${VIEW.width},${VIEW.height}`,
    // Headless Chrome has no GPU; force a software GL implementation so WebGL
    // initialises instead of silently failing to get a context.
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--mute-audio',
  ],
  defaultViewport: VIEW,
});

const page = await browser.newPage();
const errors = [];
const warnings = [];

page.on('console', (m) => {
  const t = m.type();
  if (t === 'error') errors.push(m.text());
  // Puppeteer reports console.warn as 'warn'; older versions said 'warning'.
  // Matching only 'warning' made this report "0 warnings" unconditionally.
  // A GL_INVALID_* driver message arrives as a warning but means WebGL
  // rejected a draw call, so it fails the run like an error. This is how the
  // shadow-map-before-first-frame bug in the off-screen passes was found.
  else if ((t === 'warn' || t === 'warning') && /GL_INVALID/.test(m.text())) errors.push(m.text());
  else if (t === 'warn' || t === 'warning') warnings.push(m.text());
});
page.on('pageerror', (e) => errors.push(`UNCAUGHT: ${e.message}`));
page.on('requestfailed', (r) => errors.push(`REQUEST FAILED: ${r.url()}`));

const target = URL + (URL.includes('?') ? '&' : '?') + 'lowfx=1';
console.log(`\nloading ${target}`);
await page.goto(target, { waitUntil: 'networkidle2', timeout: 60000 });
await sleep(3000);

mkdirSync(SHOTS, { recursive: true });

async function shoot(name) {
  try {
    await page.screenshot({ path: `${SHOTS}/${name}.png` });
    return true;
  } catch (e) {
    console.log(`    (screenshot ${name} failed: ${String(e.message).slice(0, 80)})`);
    return false;
  }
}

// --- boot --------------------------------------------------------------------
const booted = await page.evaluate(() => typeof window.__game?.debug === 'function');
console.log(`\n[1] BOOT: ${booted ? 'ok' : 'FAILED — no window.__game'}`);
if (!booted) {
  console.log('\nerrors:\n' + (errors.join('\n') || '(none)'));
  await browser.close();
  process.exit(1);
}
const canvas = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  if (!c) return null;
  return { w: c.width, h: c.height, gl: !!(c.getContext('webgl2') || c.getContext('webgl')) };
});
console.log(`    canvas ${canvas?.w}x${canvas?.h}, webgl: ${canvas?.gl}`);

// --- every level completable? --------------------------------------------------
const LEVEL_COUNT = await page.evaluate(async () => {
  const m = await import('/src/world/Levels.js');
  return m.LEVELS.length;
});
console.log(`\n[2] LEVELS (${LEVEL_COUNT} defined)\n`);

const results = [];
for (let i = 0; i < LEVEL_COUNT; i++) {
  const r = await page.evaluate((n) => {
    const g = window.__game;
    g.debugPlay(n);
    g.debugTick(0.5); // let the car settle on its suspension at the spawn
    const spawn = g.debug();

    const d = g.debug();
    // d.target.y is only set on a multi-floor level (Level 13's roof); every
    // other level leaves it undefined and debugTeleport falls back to y=0.
    g.debugTeleport(d.target.pos[0], d.target.pos[1], d.target.heading, d.target.y);
    g.debugTick(2.5); // settle again at the target pose — a teleported car
    // needs long enough for any suspension bounce to damp out, or it is still
    // moving faster than the 0.25 m/s "stopped" threshold when sampled
    g.debugSetGear('P');
    g.debugTick(1.5); // comfortably clears the 0.5 s dwell
    const after = g.debug();

    return {
      name: spawn.levelName,
      spawnPos: spawn.pos,
      state: after.state,
      park: after.park,
      speed: after.car.speedKmh,
      y: after.pos.y,
    };
  }, i);

  const p = r.park ?? {};
  const completable = r.state === 'results' || p.complete === true;
  results.push({ level: i + 1, name: r.name, completable, park: p });

  console.log(
    `  L${i + 1} ${String(r.name).padEnd(11)} ${completable ? 'PASS' : 'FAIL'}` +
      `  inBay=${p.inBay} aligned=${p.aligned} stopped=${p.stopped}` +
      ` lat=${fmt(p.lateral)} lon=${fmt(p.longitudinal)} hdg=${fmt(p.headingErrDeg)}` +
      ` restY=${r.y?.toFixed(3)}`
  );
  if (!completable) console.log(`       prompt: "${p.prompt}"  state=${r.state}`);
}

// --- every daily-challenge variant completable? ---------------------------------
// Same teleport proof for each DAILY_POOL entry (retention pass), so a daily
// can never be impossible. A variant that fails comes out of the pool.
const POOL_SIZE = await page.evaluate(async () => (await import('/src/game/Retention.js')).DAILY_POOL.length);
console.log(`\n[2b] DAILY VARIANTS (${POOL_SIZE} in the pool)\n`);
const dailyResults = [];
for (let i = 0; i < POOL_SIZE; i++) {
  const r = await page.evaluate((n) => {
    const g = window.__game;
    g.debugPlayDaily(n);
    g.debugTick(0.5);
    const d = g.debug();
    g.debugTeleport(d.target.pos[0], d.target.pos[1], d.target.heading, d.target.y);
    g.debugTick(2.5);
    g.debugSetGear('P');
    g.debugTick(1.5);
    const after = g.debug();
    return {
      title: document.querySelector('.hud-name')?.textContent,
      state: after.state,
      variant: after.review?.variant ?? null,
      park: after.park,
    };
  }, i);
  const completable = r.park?.complete === true && r.variant !== 'failed';
  dailyResults.push({ index: i, title: r.title, completable });
  console.log(`  pool ${String(i).padStart(2)} ${String(r.title).padEnd(46)} ${completable ? 'PASS' : `FAIL (${r.park?.prompt}, ${r.variant})`}`);
}

// --- controls -------------------------------------------------------------------
console.log('\n[3] CONTROLS');
await page.evaluate(() => {
  window.__game.debugPlay(0);
  window.__game.debugTick(0.5);
  window.__game.debugSetGear('D');
});

await page.keyboard.down('w');
const accel = await page.evaluate(() => window.__game.debugTick(2.5));
await page.keyboard.up('w');
console.log(
  `    2.5 s throttle in D -> ${accel.car.speedKmh.toFixed(1)} km/h,` +
    ` rpm ${Math.round(accel.car.rpm)}, autoGear ${accel.car.autoGear}`
);

await page.keyboard.down('a');
const steerL = await page.evaluate(() => window.__game.debugTick(0.6));
await page.keyboard.up('a');
console.log(
  `    0.6 s left steer -> steerNorm ${steerL.car.steerNorm.toFixed(2)},` +
    ` wheel ${deg(steerL.car.wheelAngleRad)}deg (720 lock-to-lock => +/-360)`
);

const center = await page.evaluate(() => window.__game.debugTick(0.6));
console.log(`    released -> auto-centred to steerNorm ${center.car.steerNorm.toFixed(2)}`);

await page.keyboard.down('s');
const braked = await page.evaluate(() => window.__game.debugTick(2.0));
await page.keyboard.up('s');
console.log(`    2.0 s brake -> ${braked.car.speedKmh.toFixed(2)} km/h`);

// --- reverse camera ---------------------------------------------------------------
console.log('\n[4] REVERSE CAMERA');
const rev = await page.evaluate(() => {
  const g = window.__game;
  g.debugSetGear('R');
  g.debugTick(1.2);
  return g.debug();
});
console.log(`    gear ${rev.car.gear}; dash screen fading up`);
await shoot('reverse-camera');

// --- visual capture per level ------------------------------------------------------
console.log('\n[5] SCREENSHOTS');
for (let i = 0; i < LEVEL_COUNT; i++) {
  await page.evaluate((n) => {
    window.__game.debugPlay(n);
    window.__game.debugTick(0.6);
  }, i);
  await sleep(1200); // give the renderer a chance to actually paint a frame
  const ok = await shoot(`level-${i + 1}`);
  if (ok) console.log(`    level ${i + 1} captured`);
}

// --- report -------------------------------------------------------------------------
console.log('\n[6] CONSOLE');
const realErrors = errors.filter((e) => !/favicon/i.test(e));
console.log(`    errors: ${realErrors.length}`);
realErrors.slice(0, 12).forEach((e) => console.log(`      ! ${e.slice(0, 240)}`));
console.log(`    warnings: ${warnings.length}`);
warnings.slice(0, 8).forEach((w) => console.log(`      ~ ${w.slice(0, 180)}`));

writeFileSync(`${SHOTS}/report.json`, JSON.stringify({ results, errors: realErrors, warnings }, null, 2));

const bad = results.filter((r) => !r.completable);
const badDaily = dailyResults.filter((r) => !r.completable);
console.log(
  `\n=== ${results.length - bad.length}/${results.length} levels completable, ` +
    `${dailyResults.length - badDaily.length}/${dailyResults.length} daily variants completable, ` +
    `${realErrors.length} console errors. Shots in ${SHOTS}/ ===\n`
);

await browser.close();
process.exit(bad.length || badDaily.length || realErrors.length ? 1 : 0);

function fmt(v) {
  return typeof v === 'number' ? v.toFixed(2) : String(v);
}
function deg(rad) {
  return typeof rad === 'number' ? ((rad * 180) / Math.PI).toFixed(0) : '?';
}
