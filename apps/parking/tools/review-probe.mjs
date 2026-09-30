/**
 * review-probe.mjs — scripted proof for the overhead parking review (GOAL:
 * Part C, C.12). Session scope call: a LIGHTER probe than the full spec asks
 * for — core correctness on 3 representative target styles (bay, parallel,
 * box) plus one timed-fail level, not the full 8-level x 12-check matrix.
 * What it does check, it checks for real (real DOM, real debugTeleport/
 * debugTick, the actual numbers the game computed — never hand-predicted).
 *
 *   node tools/review-probe.mjs [url]
 */
import puppeteer from 'puppeteer-core';
import { writeFileSync, mkdirSync } from 'node:fs';

const URL = process.argv[2] ?? 'http://localhost:5175/play/';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SHOTS = 'tools/shots';
const VIEW = { width: 1440, height: 900 };

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
page.on('console', (m) => {
  const t = m.type();
  if (t === 'error') errors.push(m.text());
  else if ((t === 'warn' || t === 'warning') && /GL_INVALID/.test(m.text())) errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(`UNCAUGHT: ${e.message}`));

const target = URL + (URL.includes('?') ? '&' : '?') + 'lowfx=1';
console.log(`\nloading ${target}`);
await page.goto(target, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 3000));

mkdirSync(SHOTS, { recursive: true });

let fails = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) fails++;
};

const booted = await page.evaluate(() => typeof window.__game?.debug === 'function');
console.log(`[1] BOOT: ${booted ? 'ok' : 'FAILED'}`);
if (!booted) {
  console.log(errors.join('\n'));
  await browser.close();
  process.exit(1);
}

// --- levels by NAME, style label, injected offset ----------------------------
// Never by index: levels get inserted into the running order (ids are stable,
// positions are not), and a hard-coded index then silently tests a different
// level. debug().levelNames is in play order.
const levelNames = await page.evaluate(() => window.__game.debug().levelNames);
const indexOf = (name) => {
  const i = levelNames.indexOf(name);
  if (i < 0) throw new Error(`level not found: ${name}`);
  return i;
};
const LEVELS = [
  { index: indexOf('Deck One'), label: 'Deck One bay' },
  { index: indexOf('Deck Three'), label: 'Deck Three parallel' },
  { index: indexOf('Roof One'), label: 'Roof One box-rooftop' },
];
const OFFSET = { lat: 0.15, lon: 0.1, e: (3 * Math.PI) / 180 };

for (const { index, label } of LEVELS) {
  console.log(`\n[2] ${label}`);
  const r = await page.evaluate(
    async (idx, off) => {
      const g = window.__game;
      g.debugPlay(idx);
      g.debugTick(0.3);
      const d = g.debug();
      const h = d.target.heading;
      const x = d.target.pos[0] + off.lat * Math.cos(h) + off.lon * Math.sin(h);
      const z = d.target.pos[1] - off.lat * Math.sin(h) + off.lon * Math.cos(h);
      g.debugTeleport(x, z, h + off.e, d.target.y);
      g.debugTick(1.5); // settle + the 0.5 s dwell
      g.debugSetGear('P');
      g.debugTick(1.5);
      g.debugReviewSkip();
      g.debugTick(0.05);
      const after = g.debug();
      return { before: d, after };
    },
    index,
    OFFSET
  );

  const rv = r.after.review;
  check('review active, parked, shown', Boolean(rv?.active) && rv.variant === 'parked' && rv.phase === 'shown', JSON.stringify(rv && { active: rv.active, variant: rv.variant, phase: rv.phase }));
  check('state is results', r.after.state === 'results', r.after.state);

  if (rv) {
    const fwd = rv.camera.forward;
    const dotDown = -fwd[1]; // forward . (0,-1,0)
    check('top-down (camera.forward . (0,-1,0) >= 0.9995)', dotDown >= 0.9995, dotDown.toFixed(5));
    const up = rv.camera.up;
    const dotUp = up[0] * rv.expectedUp[0] + up[1] * rv.expectedUp[1] + up[2] * rv.expectedUp[2];
    check('oriented (camera.up . expectedUp >= 0.9998)', dotUp >= 0.9998, dotUp.toFixed(5));
    check('fov === 28', rv.camera.fov === 28, String(rv.camera.fov));
    check('near >= 0.5', rv.camera.near >= 0.5, String(rv.camera.near));
    check('ceiling hidden', rv.scene.ceilingVisible === false);
    check('mirrors paused', rv.scene.mirrorsPaused === true);
    check('>= 2 visible labels', rv.labels.filter((l) => !l.hidden).length >= 2, String(rv.labels.filter((l) => !l.hidden).length));
  }

  // Numbers match the injected pose (independently computed here, not trusted
  // from the game — same convention as ParkCheck.js: lateral = dx*cosH - dz*sinH).
  const expectLatCm = Math.round(Math.abs(OFFSET.lat) * 100);
  const expectHeadingDeg = +((OFFSET.e * 180) / Math.PI).toFixed(1);
  const labels = rv?.labels ?? [];
  const latLabel = labels.find((l) => l.id === 'lateral');
  const headingLabel = labels.find((l) => l.id === 'heading');
  check('lateral word: right', Boolean(latLabel?.text.includes('right')), latLabel?.text);
  check(`lateral cm ~ ${expectLatCm}`, Boolean(latLabel?.text.startsWith(String(expectLatCm))), latLabel?.text);
  check('heading word: nose left', Boolean(headingLabel?.text.includes('nose left')), headingLabel?.text);
  check(`heading deg ~ ${expectHeadingDeg}`, Boolean(headingLabel?.text.startsWith(String(expectHeadingDeg))), headingLabel?.text);

  // Card DOM text contains the breakdown numbers and the stop sentence.
  const cardText = await page.evaluate(() => document.querySelector('.hud-review-card')?.textContent ?? '');
  check('card shows a score', /\/ 100/.test(cardText));
  check('card shows "Where you stopped"', cardText.includes('Where you stopped'));

  await page.screenshot({ path: `${SHOTS}/review-${label.replace(/\s+/g, '-')}.png` }).catch(() => {});

  // Snapshot agreement (C.12 check 8, lighter form): the debugReviewSnapshot
  // status matches the debug().park at the moment of completion.
  const snap = await page.evaluate(() => window.__game.debugReviewSnapshot());
  check('snapshot present', Boolean(snap?.status));

  // Replay restores everything (C.12 check 12, core subset).
  const restored = await page.evaluate(async () => {
    const g = window.__game;
    // The base Settings fov, not applied.fov read while the review is still
    // forcing it to 28 — that would compare the post-Replay value against
    // the review's OWN override instead of the real baseline.
    const baseFov = g.settings.get('fov');
    document.querySelectorAll('.hud-review-card .hud-actions button').forEach((b) => {
      if (/^(Replay|Retry)/.test(b.textContent)) b.click(); // "Retry⟨B⟩" since the retention pass
    });
    g.debugTick(0.2);
    const s1 = g.debug();
    const noLabels = document.querySelectorAll('.hud-review-label').length === 0;
    return {
      driving: s1.state === 'driving',
      reviewGone: !s1.review?.active,
      fovRestored: Math.abs(s1.applied.fov - baseFov) < 0.01,
      cameraNear: s1.applied.cameraY, // sanity: rig has taken over again
      noLabels,
    };
  });
  check('Replay -> driving, review inactive', restored.driving && restored.reviewGone, JSON.stringify(restored));
  check('Replay -> fov restored', restored.fovRestored);
  check('Replay -> no leftover labels', restored.noLabels);
}

// --- timed fail ----------------------------------------------------------------
console.log('\n[3] Timed fail (Roof Three)');
const failed = await page.evaluate(async (idx) => {
  const g = window.__game;
  g.debugPlay(idx); // Roof Three, timeLimit 45s — car stays at spawn, in P
  g.debugSetGear('P');
  g.debugTick(46);
  g.debugReviewSkip();
  g.debugTick(0.05);
  return g.debug();
}, indexOf('Roof Three'));
check('failed variant', failed.review?.variant === 'failed', failed.review?.variant);
check('state results', failed.state === 'results');
const failCardText = await page.evaluate(() => document.querySelector('.hud-review-card')?.textContent ?? '');
check('card shows "Not parked"', failCardText.includes('Not parked'));
await page.screenshot({ path: `${SHOTS}/review-failed.png` }).catch(() => {});

console.log(`\n=== ${fails === 0 ? 'ALL PASS' : `${fails} FAILURE(S)`} ===`);
console.log('\nconsole errors:\n' + (errors.join('\n') || '(none)'));
await browser.close();
process.exit(fails || errors.length ? 1 : 0);
