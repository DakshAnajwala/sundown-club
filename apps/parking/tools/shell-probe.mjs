/**
 * shell-probe.mjs — the menus, driven by clicking the real DOM.
 *
 * Start screen -> level select -> play a level -> Esc pause -> settings ->
 * preset + individual switches -> back to pause -> main menu. Every setting is
 * checked against what the subsystem actually reports (debug().applied), not
 * against the settings store, so a switch that saves but never takes effect
 * fails. Screenshots of each panel land in tools/shots/menu-*.png.
 *
 *   node tools/shell-probe.mjs
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
  defaultViewport: { width: 1100, height: 720 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
await sleep(3000);

let fails = 0;
const check = (label, ok, detail = '') => {
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`);
};
const dbg = () => page.evaluate(() => window.__game.debug());
const panelText = () => page.evaluate(() => document.querySelector('.hud-veil:not([hidden]) .hud-panel')?.innerText ?? null);

/** Click the first visible button whose text matches. */
async function click(text, scope = '.hud') {
  const ok = await page.evaluate(
    (t, s) => {
      const btn = [...document.querySelectorAll(`${s} button`)].find(
        // includes, not startsWith: a level card's text begins "Level 12".
        (b) => b.offsetParent !== null && b.textContent.trim().includes(t)
      );
      if (!btn) return false;
      btn.click();
      return true;
    },
    text,
    scope
  );
  if (!ok) {
    fails++;
    console.log(`FAIL  no visible button "${text}"`);
  }
  await sleep(250);
  return ok;
}
const shot = async (name) => {
  await sleep(1200);
  await page.screenshot({ path: `tools/shots/menu-${name}.png` });
};

// --- first run: fresh profile, so the tutorial is offered ------------------------
const start = await panelText();
check('start screen offers the tutorial on first run', /Start the tutorial/.test(start ?? ''));
await shot('start');

await click('Settings');
check('settings opens from start', /Settings/.test((await panelText()) ?? ''));
await click('Low');
let d = await dbg();
check('Low preset reaches the renderer', d.applied.shadows === false && d.mirrors.mode === 'static' && d.applied.pixelRatio === 1, JSON.stringify(d.applied));
await click('High');
d = await dbg();
check('High preset restores shadows + live mirrors', d.applied.shadows === true && d.mirrors.mode === 'live', JSON.stringify(d.applied));

// individual switch demotes the preset label
await page.evaluate(() => {
  const box = [...document.querySelectorAll('.hud-form label')].find((l) => l.textContent.startsWith('Shadows'))
    .nextElementSibling;
  box.click();
});
await sleep(250);
d = await dbg();
check('Shadows checkbox turns shadows off', d.applied.shadows === false);
check('touching a switch labels the preset Custom', /Custom/.test((await panelText()) ?? ''));

// FOV slider
await page.evaluate(() => {
  const input = [...document.querySelectorAll('.hud-form input[type=range]')][0];
  input.value = 80;
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
d = await dbg();
check('FOV slider reaches the camera', d.applied.fov === 80, `fov=${d.applied.fov}`);
await click('mph');
const clusterMph = await page.evaluate(() => {
  const g = window.__game;
  g.debugRig(0.2);
  return g.debugClusterImage().length;
});
check('units switch redraws the cluster', clusterMph > 1000);
await shot('settings');
await click('Done');
check('Done returns to the start screen', /Start the tutorial/.test((await panelText()) ?? ''));

// --- level select from the start screen (tutorial skipped path) -------------------
await click('Skip to level 1');
d = await dbg();
check('Skip to level 1 starts driving level 1', d.state === 'driving' && d.levelIndex === 0, `${d.state} L${d.levelIndex + 1}`);
check('skipping marks the tutorial done', await page.evaluate(() => window.__game.settings.get('tutorialDone')));

// Esc pauses (Input handles it during driving)
await page.keyboard.press('Escape');
await page.evaluate(() => window.__game.debugTick(0.05));
await sleep(200);
d = await dbg();
check('Esc pauses', d.state === 'paused' && /Paused/.test((await panelText()) ?? ''), d.state);
await shot('pause');

await click('Level select');
const lvText = await panelText();
// Case-insensitive: the card label is CSS-uppercased, and innerText honours that.
const levelTotal = await page.evaluate(() => window.__game.debug().levelTotal ?? null);
check(
  `level select lists every level${levelTotal ? ` (${levelTotal})` : ''}`,
  (lvText.match(/level \d+/gi) ?? []).length >= (levelTotal ?? 12)
);
await shot('levels');
// Looked up rather than hard-coded: levels get inserted, and an index that
// was right when this was written silently becomes a different level.
const finalExamIndex = await page.evaluate(
  () => window.__game.debug().levelNames?.indexOf('Final Exam') ?? -1
);
await click('Final Exam', '.hud-levels');
d = await dbg();
check(
  'clicking a level card plays it',
  d.state === 'driving' && finalExamIndex >= 0 && d.levelIndex === finalExamIndex,
  `L${d.levelIndex + 1}, expected L${finalExamIndex + 1}`
);

// Esc then Esc: pause, then leave to Sundown Club (packages/shared/leave-guard.js).
// On the dev server the site root is this game's own homepage.
await page.keyboard.press('Escape');
await page.evaluate(() => window.__game.debugTick(0.05));
await sleep(200);
check('pause menu offers leaving to Sundown Club', /Esc again/.test((await panelText()) ?? ''));
await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), page.keyboard.press('Escape')]);
check('Esc in the pause menu leaves to the site root', new globalThis.URL(page.url()).pathname === '/', page.url());
check('leaving saved the club profile', await page.evaluate(() => Boolean(JSON.parse((localStorage.getItem('hub.v2.profile') || localStorage.getItem('hub.v1.profile')) || '{}').games?.parking?.lastPlayed)));
// Come back and drive again so the rest of the probe starts from the same place.
await page.goto(new globalThis.URL('/play/', page.url()).href, { waitUntil: 'load' });
await page.waitForFunction(() => window.__game?.debug, { timeout: 60000 });
await sleep(1500);
await click('Start driving');
await page.evaluate(() => window.__game.debugTick(0.05));
d = await dbg();
check('Start driving resumes play after coming back', d.state === 'driving', d.state);

// Settings from pause returns to pause
await page.keyboard.press('Escape');
await page.evaluate(() => window.__game.debugTick(0.05));
await sleep(200);
await click('Settings');
await click('Done');
check('Settings opened from pause returns to pause', /Paused/.test((await panelText()) ?? ''));

await click('Main menu');
const menu = await panelText();
check('Main menu returns to the start screen, now without the tutorial prompt', /Start driving/.test(menu ?? ''));

// --- driving position tuner -------------------------------------------------------
await click('Settings');
await click('Adjust');
await page.evaluate(() => window.__game.debugRig(0.6));
const tuner = await page.evaluate(() => ({
  veilHidden: document.querySelector('.hud-veil').hidden,
  cardVisible: !document.querySelector('.hud-seat').hidden,
}));
d = await dbg();
check('Adjust opens the docked tuner with the view unobstructed', tuner.veilHidden && tuner.cardVisible, JSON.stringify(tuner));
check('tuner lights the reversing screen outside R', d.applied.screenLit === true && d.car.gear !== 'R', `gear ${d.car.gear}`);
const y0 = d.applied.cameraY;
await page.evaluate(() => {
  const input = document.getElementById('seat-seatY');
  input.value = 0.1;
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
d = await page.evaluate(() => window.__game.debugRig(0.1));
check('seat height slider raises the camera 10 cm', Math.abs(d.applied.cameraY - y0 - 0.1) < 0.005, `${y0} -> ${d.applied.cameraY}`);
await shot('seat-tuner');
await click('Reset to default');
d = await page.evaluate(() => window.__game.debugRig(0.1));
check('Reset puts the camera back', Math.abs(d.applied.cameraY - y0) < 0.005, `${d.applied.cameraY}`);
await page.evaluate(() => {
  const input = document.getElementById('seat-seatY');
  input.value = 0.06;
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
await page.keyboard.press('Escape');
// 1.5 s, not 0.6: the screen fades at rate 5.5/s and is still ~3% lit at 0.6 s.
await page.evaluate(() => window.__game.debugRig(1.5));
d = await dbg();
const backInSettings = /Settings/.test((await panelText()) ?? '');
check('Esc closes the tuner back to Settings and turns the screen preview off', backInSettings && !d.applied.screenLit, `settings=${backInSettings} screenLit=${d.applied.screenLit}`);
await click('Done');

// Settings persisted across a reload
await page.reload({ waitUntil: 'networkidle2' });
await sleep(3000);
d = await dbg();
check('settings survive a reload', d.applied.fov === 80 && d.applied.shadows === false, JSON.stringify(d.applied));
check('driving position survives a reload', Math.abs(d.applied.cameraY - y0 - 0.06) < 0.005, `${d.applied.cameraY}`);

// Progress reset confirms in place
await click('Settings');
await click('Reset progress');
check('reset asks for a second click', /Click again/.test((await panelText()) ?? ''));
await click('Click again');
check('reset reports done', /Progress cleared/.test((await panelText()) ?? ''));

console.log(`\n${fails} failures, ${errors.length} page errors`);
errors.slice(0, 5).forEach((e) => console.log('  ! ' + e.slice(0, 200)));
await browser.close();
process.exit(fails || errors.length ? 1 : 0);
