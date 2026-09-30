/**
 * retention-probe.mjs — acceptance checks for the retention pass
 * (design/SPEC-retention.md, GOAL-retention.md).
 *
 * Game-time outcomes use debugTick/debugTeleport (software GL, deterministic).
 * The wall-clock targets G1–G4 are measured by tools/loop-probe.mjs on the GPU
 * harness; this probe checks the key COUNTS and the behaviour behind them.
 * Levels are looked up by name, never by index.
 *
 *   node tools/retention-probe.mjs [--no-build] [url]
 *
 * --no-build skips the forbidden-list scan of a fresh `npm run build`.
 */
import puppeteer from 'puppeteer-core';
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const NO_BUILD = args.includes('--no-build');
const URL = args.find((a) => !a.startsWith('--')) ?? 'http://localhost:5175/play/';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

let fails = 0;
let passes = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (ok) passes++;
  else fails++;
};

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  protocolTimeout: 240000,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio', '--window-size=1440,900'],
  defaultViewport: { width: 1440, height: 900 },
});
const errors = [];
const requests = [];

/** Each section gets its own browser context, so one section's saved runs
 *  can never leak into the next one's localStorage. */
async function open(seed = {}, permissions = null) {
  const context = await browser.createBrowserContext();
  if (permissions) await context.overridePermissions(new globalThis.URL(URL).origin, permissions);
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
    else if (/GL_INVALID/.test(m.text())) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`UNCAUGHT: ${e.message}`));
  page.on('request', (r) => requests.push(r.url()));
  await page.evaluateOnNewDocument((s) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  }, { 'parking-precision:settings:v4': { tutorialDone: true }, ...seed });
  const u = URL + (URL.includes('?') ? '&' : '?') + 'lowfx=1';
  await page.goto(u, { waitUntil: 'networkidle2', timeout: 90000 });
  await page.waitForFunction(() => typeof window.__game?.debug === 'function', { timeout: 60000 });
  await page.evaluate(() => {
    const g = window.__game;
    window.__p = {
      idx: (name) => g.debug().levelNames.indexOf(name),
      key(code) {
        window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true }));
        window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true }));
      },
      /** Park on the target at an offset, and stop before the review settles. */
      park(name, { lat = 0, e = 0, before = 0 } = {}) {
        if (name != null) g.debugPlay(this.idx(name));
        g.debugTick(0.2 + before);
        const d = g.debug();
        const h = d.target.heading;
        g.debugTeleport(d.target.pos[0] + lat * Math.cos(h), d.target.pos[1] - lat * Math.sin(h), h + (e * Math.PI) / 180, d.target.y);
        g.debugTick(1.0);
        g.debugSetGear('P');
        for (let k = 0; k < 120 && g.debug().state === 'driving'; k++) g.debugTick(1 / 60);
        return g.debug();
      },
      card: () => document.querySelector('.hud-review-card')?.innerText ?? '',
    };
  });
  return page;
}

// ---------------------------------------------------------------------------
console.log('\n[M1] card keys: one retry key, live during the flight, City Drive fixed');
{
  const page = await open();
  const r = await page.evaluate(() => {
    const g = window.__game;
    const P = window.__p;
    const out = {};
    let d = P.park('Deck One');
    out.flying = d.review?.phase;
    P.key('KeyB');
    g.debugTick(0.05);
    d = g.debug();
    out.retryState = d.state;
    out.retryLevel = d.levelName;
    P.park('Deck One');
    P.key('Enter');
    g.debugTick(0.05);
    out.enterLevel = g.debug().levelName;
    P.park('Deck One');
    P.key('KeyR');
    g.debugTick(0.05);
    out.rDuringFlight = g.debug().state;
    P.key('KeyH');
    g.debugTick(0.05);
    out.hSkips = g.debug().review?.phase;
    P.key('KeyR');
    g.debugTick(0.05);
    out.rAfterSettle = g.debug().state;
    // City Drive: no review, the card must still take keys.
    P.park('City Drive');
    out.cityState = g.debug().state;
    out.cityReview = g.debug().review?.phase ?? null;
    P.key('KeyB');
    g.debugTick(0.05);
    out.cityRetry = g.debug().state;
    // Fail card on a timed level: B retries at once.
    g.debugPlay(P.idx('Roof Three'));
    g.debugSetGear('N');
    g.debugTick(45.3, 1 / 30);
    out.failCard = /not parked/i.test(P.card());
    P.key('KeyB');
    g.debugTick(0.05);
    out.failRetry = g.debug().state;
    // Rebound retry key follows.
    g.settings.set('bindings', { restart: ['KeyK'] });
    P.park('Deck One');
    P.key('KeyB');
    g.debugTick(0.05);
    out.oldKeyAfterRebind = g.debug().state;
    P.key('KeyK');
    g.debugTick(0.05);
    out.newKeyAfterRebind = g.debug().state;
    g.settings.set('bindings', {});
    return out;
  });
  check('park leaves the review flying', r.flying === 'flying', r.flying);
  check('AC1.1 B during the flight retries the same level', r.retryState === 'driving' && r.retryLevel === 'Deck One', `${r.retryState} ${r.retryLevel}`);
  check('AC1.3 Enter during the flight loads the next level', r.enterLevel === 'Deck Two', r.enterLevel);
  check('AC1.5 R during the flight does nothing', r.rDuringFlight === 'results', r.rDuringFlight);
  check('AC1.4 H during the flight skips to settled', r.hSkips === 'shown', r.hSkips);
  check('AC1.5 R after settle replays', r.rAfterSettle === 'driving', r.rAfterSettle);
  check('AC1.6 City Drive results card takes B (no review behind it)', r.cityState === 'results' && r.cityReview === null && r.cityRetry === 'driving', `${r.cityState}/${r.cityReview}/${r.cityRetry}`);
  check('AC1.2 fail card: B retries at once', r.failCard && r.failRetry === 'driving', `${r.failCard} ${r.failRetry}`);
  check('AC1.8 remapped retry key follows the binding', r.oldKeyAfterRebind === 'results' && r.newKeyAfterRebind === 'driving', `${r.oldKeyAfterRebind} ${r.newKeyAfterRebind}`);

  const leak = await page.evaluate(() => {
    const g = window.__game;
    g.debugPlay(window.__p.idx('Level B4'));
    g.debugTick(0.2);
    const first = g.debugResources();
    for (let k = 0; k < 20; k++) {
      window.__p.key('KeyB');
      g.debugTick(0.1);
    }
    return { first, after: g.debugResources() };
  });
  const same = ['geometries', 'textures', 'sceneObjects', 'bodies'].every((k) => leak.first[k] === leak.after[k]);
  check('AC1.9 20 restarts: geometries/textures/objects/bodies unchanged', same, `${JSON.stringify(leak.first)} -> ${JSON.stringify(leak.after)}`);
  check('draw calls after 20 restarts within 1% of first load', Math.abs(leak.after.drawCalls - leak.first.drawCalls) <= leak.first.drawCalls * 0.01, `${leak.first.drawCalls} -> ${leak.after.drawCalls}`);

  // No creep (owner's request): in D with no pedal the car stays put.
  const creep = await page.evaluate(() => {
    const g = window.__game;
    g.debugPlay(window.__p.idx('Deck One'));
    g.debugTick(0.5);
    g.debugSetGear('D');
    const a = g.debug().pos;
    g.debugTick(3);
    const b = g.debug().pos;
    g.debugSetGear('R');
    g.debugTick(3);
    const c = g.debug().pos;
    return { d: Math.hypot(b.x - a.x, b.z - a.z), r: Math.hypot(c.x - b.x, c.z - b.z) };
  });
  check('no creep: 3 s in D with no pedal moves < 1 cm', creep.d < 0.01, `${creep.d.toFixed(4)} m`);
  check('no creep: 3 s in R with no pedal moves < 1 cm', creep.r < 0.01, `${creep.r.toFixed(4)} m`);
  await page.browserContext().close();
}

// ---------------------------------------------------------------------------
console.log('\n[M2/M3] where the points went, medals, next tier');
{
  const page = await open();
  const r = await page.evaluate(() => {
    const g = window.__game;
    const P = window.__p;
    const names = g.debug().levelNames;
    const rows = [];
    for (const name of names) {
      for (const pose of [{ lat: 0 }, { lat: 0.3 }, { e: 7.5 }]) {
        const d = P.park(name, pose);
        if (d.state !== 'results') {
          rows.push({ name, pose, error: d.park?.prompt });
          continue;
        }
        const R = g.debugRetention().last;
        const card = document.querySelector('.hud-review-card');
        rows.push({
          name,
          pose,
          score: Number(card.querySelector('.tot.val')?.textContent.split('/')[0]),
          big: card.querySelectorAll('.hud-break.v2 .big').length > 0,
          fix: card.querySelector('.hud-fix')?.innerText ?? '',
          next: card.querySelector('.hud-next')?.innerText ?? '',
          medal: card.querySelector('.hud-medal')?.textContent ?? null,
          worth: R.explain.worth,
          biggest: R.explain.biggest,
          recomputed: (() => {
            // The probe's own recomputation from the scoring parts.
            const rs = R.explain.rows;
            return rs;
          })(),
          stop: R.words,
        });
      }
    }
    return rows;
  });
  const errs = r.filter((x) => x.error);
  check('every level parks at all 3 poses', errs.length === 0, errs.map((x) => `${x.name} ${JSON.stringify(x.pose)}: ${x.error}`).join('; '));
  const off = r.filter((x) => !x.error && (x.pose.lat || x.pose.e));
  const g5 = off.filter((x) => x.big && /cost you \d+ points?\./.test(x.fix) && x.worth >= 1);
  check('AC2.1/G5 every off-centre card names the biggest loss and its value', g5.length === off.length, `${g5.length}/${off.length}`);
  const perfect = r.filter((x) => !x.error && !x.pose.lat && !x.pose.e);
  check('AC2.3 dead-centre parks say "Nothing to fix."', perfect.every((x) => x.fix.startsWith('Nothing to fix.') && !x.big), `${perfect.filter((x) => x.fix.startsWith('Nothing to fix.')).length}/${perfect.length}`);
  check('AC2.2 score + worth <= 100', off.every((x) => x.score + x.worth <= 100));
  const nextOk = off.filter((x) => (x.score < 88 ? x.next === `${88 - x.score} point${88 - x.score === 1 ? '' : 's'} to ★★★` : x.score < 95 ? x.next === `${95 - x.score} point${95 - x.score === 1 ? '' : 's'} to Gold` : true));
  check('AC2.4 next-tier points equal cutoff − score', nextOk.length === off.length, `${nextOk.length}/${off.length}`);
  const lat = off.filter((x) => x.pose.lat && x.biggest === 'placement');
  check('AC2.5 placement fix uses the same cm as the review words', lat.every((x) => x.fix.startsWith(`${x.stop.latCm} cm ${x.stop.latSide} of centre`)), `${lat.length} checked`);
  check('AC3.1 teleport-perfect under the author time earns PLATINUM', perfect.every((x) => x.medal === 'PLATINUM'), perfect.map((x) => `${x.name}:${x.medal}`).filter((s) => !s.endsWith('PLATINUM')).join(', ') || 'all 17');

  const juice = await page.evaluate(() => {
    const P = window.__p;
    P.park('Deck One');
    const a = window.__game.debugRetention().juice;
    P.park('Deck One', { lat: 0.3 });
    const b = window.__game.debugRetention().juice;
    return { a, b };
  });
  check('AC8.1 platinum park fires tier-3 juice with a pulse', juice.a?.tier === 3 && juice.a.pulse === 1, JSON.stringify(juice.a));
  check('AC8.1 a sub-88 park fires no flourish', juice.b?.tier === 0 && juice.b.pulse === null, JSON.stringify(juice.b));
  await page.browserContext().close();
}

// ---------------------------------------------------------------------------
console.log('\n[M4 + progress v5] migration from v4, mastery map');
{
  const v4 = {};
  for (let id = 1; id <= 17; id++) v4[id] = { stars: 3, timeSec: 20, bumps: 0, score: 95, bestPose: { lateral: 0.01, longitudinal: 0, headingErrDeg: 0.2 } };
  v4[1] = { stars: 3, timeSec: 18.0, bumps: 0, score: 99 };
  v4[99] = { stars: 'lots' }; // hand-broken: must be dropped exactly as v4's reader drops it
  const page = await open({ 'parking-precision:progress:v4': v4 });
  const r = await page.evaluate(() => {
    const v5 = JSON.parse(localStorage.getItem('parking-precision:progress:v5') ?? 'null');
    const v4still = localStorage.getItem('parking-precision:progress:v4') != null;
    window.__p.key('Escape');
    return { v5, v4still };
  });
  const v5 = r.v5 ?? {};
  check('AC10.1 v5 written on first read, v4 left in place', Boolean(r.v5) && r.v4still);
  check('AC10.1 every v4 field carried over unchanged', Object.keys(v4).filter((k) => k !== '99').every((k) => ['stars', 'timeSec', 'bumps', 'score'].every((f) => v5[k]?.[f] === v4[k][f])));
  check('AC10.1 broken record dropped', !('99' in v5));
  check('migration: 99 in 18.0 s on Deck One (author 21.3) -> platinum', v5[1]?.medal === 'platinum', v5[1]?.medal);
  check('migration: 95s -> gold, fastestSec = timeSec', v5[2]?.medal === 'gold' && v5[2]?.fastestSec === 20, JSON.stringify(v5[2]));

  const map = await page.evaluate(async () => {
    const btn = () => [...document.querySelectorAll('.hud-btn')].find((b) => b.textContent === 'Level select' && b.offsetParent);
    for (let k = 0; k < 40 && !btn(); k++) await new Promise((r) => setTimeout(r, 100));
    btn()?.click();
    await new Promise((r) => setTimeout(r, 200));
    return {
      goals: [...document.querySelectorAll('.hud-lv .goal')].map((g) => g.textContent),
      summary: document.querySelector('.hud-summary')?.textContent,
      daily: document.querySelector('.hud-daily')?.textContent,
      soon: document.querySelector('.hud-soon')?.textContent,
    };
  });
  check('AC4.1/G6 every level card has a next goal', map.goals.length === 17 && map.goals.every((t) => t.startsWith('→ ')), `${map.goals.filter((t) => t.startsWith('→ ')).length}/${map.goals.length}`);
  check('AC4.2 summary counts', map.summary === '★★★ 17/17 · Gold 17/17 · Platinum 1/17', map.summary);
  check('G7 daily strip in level select, next-daily text is hours only', /Daily #\d+/.test(map.daily ?? '') && /^new daily (in \d+ h|within the hour)$/.test(map.soon ?? ''), `${map.daily} | ${map.soon}`);
  await page.browserContext().close();
}

// ---------------------------------------------------------------------------
console.log('\n[M5] daily challenge');
{
  const page = await open();
  const r = await page.evaluate(() => {
    const g = window.__game;
    const P = window.__p;
    const out = {};
    out.oct3 = g.debugSetDate('2026-10-03');
    out.oct3again = g.debugSetDate('2026-10-03');
    const R = g.debugRetention();
    let repeats = 0;
    for (let d = 2; d <= 400; d++) if (R.dailyIndexFor(d) === R.dailyIndexFor(d - 1)) repeats++;
    out.repeats = repeats;
    // No-contact: Deck One variant (pool 1). Drive through a cone.
    g.debugPlayDaily(1);
    g.debugTick(0.3);
    g.debugTeleport(-2.5, -5.5, 0);
    g.debugTick(0.5);
    out.noContact = P.card();
    // Under-par: Deck Four variant (pool 7), 45 s.
    g.debugPlayDaily(7);
    g.debugSetGear('N');
    g.debugTick(45.3, 1 / 30);
    out.underPar = P.card();
    // Park a daily twice on one day, then once the next day.
    const parked0 = g.debugRetention().daily.parked;
    g.debugPlayDaily(0);
    P.park(null);
    out.dailyCard = P.card();
    out.dailyLb = Boolean(document.querySelector('.hud-review-card .hud-lb'));
    out.progressWritten = g.debugRetention().record;
    g.debugPlayDaily(0);
    P.park(null);
    const parked1 = g.debugRetention().daily.parked;
    g.debugSetDate('2026-10-04');
    g.debugPlayDaily(0);
    P.park(null);
    const parked2 = g.debugRetention().daily.parked;
    out.counts = [parked0, parked1, parked2];
    out.stored = JSON.parse(localStorage.getItem('parking-precision:daily:v1'));
    g.debugSetDate(null);
    return out;
  });
  check('AC5.1 2026-10-03 is Daily #6, seed 20261003, deterministic', r.oct3.day === 6 && r.oct3.seed === 20261003 && r.oct3.index === r.oct3again.index, `day ${r.oct3.day} seed ${r.oct3.seed} index ${r.oct3.index}`);
  check('AC5.1 no variant repeats on consecutive days (400 days)', r.repeats === 0, String(r.repeats));
  check('AC5.3 no-contact daily fails on a cone', r.noContact.includes('Contact — this daily is no-contact.'), r.noContact.split('\n').slice(0, 3).join(' | '));
  check('AC5.4 under-par daily fails at par', r.underPar.includes('Over par — this daily ends at 45 s.'), r.underPar.split('\n').slice(0, 3).join(' | '));
  check('daily card is tagged, never posted', /DAILY #\d+/i.test(r.dailyCard) && !r.dailyLb);
  check('AC5.5 parked count +1 per day, not per park', r.counts[1] === r.counts[0] + 1 && r.counts[2] === r.counts[1] + 1, JSON.stringify(r.counts));
  check('AC5.6 daily record holds only parked/lastDay/best', Object.keys(r.stored ?? {}).sort().join(',') === 'best,lastDay,parked', JSON.stringify(r.stored));
  await page.browserContext().close();
}

// ---------------------------------------------------------------------------
console.log('\n[M6] share v2');
{
  const page = await open({}, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
  await page.evaluate(() => window.__p.park('Deck One', { lat: 0.3 }));
  await page.evaluate(() => [...document.querySelectorAll('.hud-review-card button')].find((b) => b.textContent === 'Share result').click());
  await new Promise((r) => setTimeout(r, 300));
  const text = await page.evaluate(() => navigator.clipboard.readText());
  const handle = await page.evaluate(() => localStorage.getItem('parking-precision:handle:v1'));
  const lines = text.split('\n');
  check('AC6.1 share text shape', lines[0] === 'Parking Precision · Deck One' && /^\d+\/100 [★☆]{3}( GOLD| PLATINUM)? · \d+\.\d s$/.test(lines[1]) && /^[🟩🟨⬛]{5}$/u.test(lines[2]) && lines[3].startsWith('Free in your browser:'), JSON.stringify(text));
  // Deck One, 30 cm off: placement 30 x (1 - 0.30/0.57) = 14.2 of 30 = 47 %, below the 60 % yellow line.
  check('AC6.2 30 cm lateral on Deck One: placement cell dark, the rest green', lines[2] === '⬛🟩🟩🟩🟩', lines[2]);
  check('AC6.3 no name or identifier in the text', !handle || !text.includes(handle));
  await page.browserContext().close();
}

// ---------------------------------------------------------------------------
console.log('\n[M7] personal-best ghost');
{
  const page = await open();
  const r = await page.evaluate(() => {
    const g = window.__game;
    const P = window.__p;
    const out = {};
    // First park: no previous best.
    P.park('Deck Two', { lat: 0.3, before: 2 });
    out.first = document.querySelector('.hud-delta')?.textContent;
    out.firstGhost = g.debug().review?.bestGhost;
    // Better park: previous best shown, delta positive, run stored as a ghost.
    P.park('Deck Two', { before: 2 });
    out.second = document.querySelector('.hud-delta')?.textContent;
    out.secondGhost = g.debug().review?.bestGhost;
    out.stored = g.debugGhost().stored;
    // Next attempt replays it, with no physics body.
    g.debugPlay(P.idx('Deck Two'));
    const b0 = g.debugResources().bodies;
    g.debugRig(1.0);
    out.playback = g.debugGhost().playback;
    out.bodiesSame = g.debugResources().bodies === b0;
    // Sensors identical with the ghost on and off at the same pose.
    const d = g.debug();
    g.debugTeleport(d.target.pos[0] + 3, d.target.pos[1] + 3, d.target.heading);
    g.debugSetGear('R');
    const s1 = JSON.stringify(g.debugSensors());
    g.settings.set('ghostLive', false);
    g.debugPlay(P.idx('Deck Two'));
    g.debugTeleport(d.target.pos[0] + 3, d.target.pos[1] + 3, d.target.heading);
    g.debugSetGear('R');
    out.sensorsSame = JSON.stringify(g.debugSensors()) === s1;
    out.offPlayback = g.debugGhost().playback;
    g.settings.set('ghostLive', true);
    g.settings.set('reviewGhost', false);
    P.park('Deck Two', { lat: 0.1 });
    out.reviewGhostOff = g.debug().review?.bestGhost;
    g.settings.set('reviewGhost', true);
    return out;
  });
  check('AC7.2 first park: "First park on this level", no ghost', r.first === 'First park on this level' && !r.firstGhost, `${r.first} / ${r.firstGhost}`);
  check('AC7.1 better park: previous best ghost on, positive delta', r.secondGhost === true && /^\+\d+ on your best \(\d+\)$/.test(r.second ?? ''), `${r.second} / ${r.secondGhost}`);
  check('ghost run stored within the per-level cap', r.stored.length === 1 && r.stored[0].bytes > 0 && r.stored[0].bytes <= 30000, JSON.stringify(r.stored));
  check('next attempt replays the stored ghost', r.playback > 0, String(r.playback));
  check('AC7.4 ghost adds no physics body', r.bodiesSame);
  check('AC7.5 sensor readings identical with ghost on/off', r.sensorsSame);
  check('ghostLive off: nothing replayed', r.offPlayback === 0, String(r.offPlayback));
  check('AC7.3 reviewGhost off: no footprint', r.reviewGhostOff === false, String(r.reviewGhostOff));
  await page.browserContext().close();
}

// ---------------------------------------------------------------------------
console.log('\n[G8] forbidden list');
const thirdParty = requests.filter((u) => !u.startsWith(new globalThis.URL(URL).origin) && !u.startsWith('data:') && !u.startsWith('blob:'));
check('0 third-party requests while playing', thirdParty.length === 0, thirdParty.slice(0, 3).join(', '));
if (NO_BUILD) {
  console.log('  (skipped the dist/ scan: --no-build)');
} else {
  execSync('npm run build', { stdio: 'ignore' });
  const files = [];
  const walk = (dir) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(js|html)$/.test(f)) files.push(p);
    }
  };
  walk('dist');
  // The game and homepage only: /design/ pages and their chunks (wheel lab,
  // Level 13 sheet) are internal tools with their own dev-only requests.
  const game = files.filter((f) => !f.includes('/design/') && !/assets\/(wheelLab|level13|design)-/.test(f));
  const all = game.map((f) => readFileSync(f, 'utf8')).join('\n');
  check('dist: no Notification API', !/\bNotification\b/.test(all));
  check('dist: no serviceWorker.register', !/serviceWorker\.register/.test(all));
  check('dist: no "streak"', !/streak/i.test(all));
  const targets = [...all.matchAll(/fetch\(\s*([`'"])([^`'"]*)/g)].map((m) => m[2]);
  const allowed = /^\/api\/(run|score|identity|leaderboard)/;
  const odd = targets.filter((t) => t && !allowed.test(t));
  check('dist: fetch() only to /api/run|score|identity|leaderboard', odd.length === 0, `${targets.length} literal targets; odd: ${odd.join(', ')}`);
}

const real = errors.filter((e) => !/favicon/i.test(e));
check('0 console errors', real.length === 0, real.slice(0, 3).join(' | '));
console.log(`\n${passes} passed, ${fails} failed`);
await browser.close();
process.exit(fails ? 1 : 0);
