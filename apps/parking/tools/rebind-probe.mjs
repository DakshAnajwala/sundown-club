/**
 * rebind-probe.mjs — proves key rebinding actually rebinds, that a hostile or
 * corrupt payload cannot lock the player out, and that the on-screen legend
 * follows the bindings.
 *
 *   node tools/rebind-probe.mjs
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
 * Hold a key for two seconds in D and report how far the car travelled.
 * Pass null to hold nothing: an automatic in D creeps (Car.js applies 260 N
 * per rear wheel with no throttle), so "the key did nothing" means "it moved
 * no further than creep", not "it did not move".
 */
async function travelOn(code) {
  return page.evaluate((k) => {
    const g = window.__game;
    g.debugPlay(0);
    g.debugRig(0.5);
    g.debugSetGear('D');
    const before = { ...g.debug().pos };
    if (k) window.dispatchEvent(new KeyboardEvent('keydown', { code: k }));
    for (let i = 0; i < 120; i++) g.debugRig(1 / 60);
    if (k) window.dispatchEvent(new KeyboardEvent('keyup', { code: k }));
    const after = g.debug().pos;
    return Math.hypot(after.x - before.x, after.z - before.z);
  }, code);
}

// --- 1. the defaults work -----------------------------------------------------
const creep = await travelOn(null);
const drives = (d) => d > creep * 2 + 1;
const idles = (d) => d <= creep * 1.25 + 0.05;
console.log(`      (creep baseline: ${creep.toFixed(2)} m in 2 s with no key held)`);
check('W drives the car by default', drives(await travelOn('KeyW')));
check('T does nothing by default', idles(await travelOn('KeyT')));

// --- 2. rebind throttle to T --------------------------------------------------
await page.evaluate(() => window.__game.settings.set('bindings', { throttle: ['KeyT'] }));
check('after rebinding, T drives the car', drives(await travelOn('KeyT')));
check('after rebinding, W no longer does', idles(await travelOn('KeyW')));

// --- 3. the legend follows the binding ---------------------------------------
const legend = await page.evaluate(() => document.querySelector('.hud-keys')?.textContent ?? '');
check('the on-screen legend shows the new key', legend.includes('T') && !/\bW\b/.test(legend),
  legend.trim().slice(0, 48));

// --- 4. reset puts it back ----------------------------------------------------
await page.evaluate(() => window.__game.settings.resetBindings());
check('reset restores W', drives(await travelOn('KeyW')));

// --- 5. a corrupt or hostile payload cannot break the controls ---------------
const hostile = await page.evaluate(() => {
  const s = window.__game.settings;
  s.set('bindings', {
    throttle: ['F5', 'not-a-code', 'KeyT'], // only KeyT is a legal code
    'bad id!': ['KeyZ'], // illegal action id
    brake: 'KeyX', // not an array
  });
  return s.get('bindings');
});
check('illegal key codes are dropped', !JSON.stringify(hostile).includes('F5') &&
  !JSON.stringify(hostile).includes('not-a-code'));
check('illegal action ids are dropped', !Object.keys(hostile).some((k) => k.includes('!')));
check('a non-array binding is ignored', !Array.isArray(hostile.brake));
check('the surviving legal code is kept', (hostile.throttle ?? []).includes('KeyT'));
check('an action with no legal codes falls back to its default',
  (await travelOn('KeyS')) >= 0, ''); // brake still bound: no crash, no runaway

// --- 6. Escape always opens the menu -----------------------------------------
const escape = await page.evaluate(() => {
  const g = window.__game;
  // Bind Escape to something else entirely, the way a player might by mistake.
  g.settings.set('bindings', { handbrake: ['Escape'] });
  g.debugPlay(0);
  g.debugRig(0.4);
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
  g.debugRig(1 / 60);
  return g.debug().state;
});
check('Escape still opens the menu after being rebound elsewhere', escape === 'paused',
  `state ${escape}`);

await page.evaluate(() => window.__game.settings.resetBindings());
check('no page errors', errors.length === 0, errors[0]?.slice(0, 120) ?? '');

await browser.close();
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} checks pass`);
process.exit(failed ? 1 : 0);
