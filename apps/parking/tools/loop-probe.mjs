/**
 * loop-probe.mjs — measures the "one more try" loop (prompt-retention.md §5
 * Phase A): how long, and how many keys, it takes to get from a finished or
 * failed attempt back to driving, and what the results card tells the player.
 *
 * Runs on the GPU harness (Metal ANGLE, AO on, ~60 fps on the M1 Pro) because
 * A1-A4 are WALL-CLOCK numbers: under swiftshader a frame takes long enough
 * that they would measure the software rasteriser, not the game. Everything
 * that is a simulation outcome (parking, failing, scoring) is still driven
 * with debugTick/debugTeleport, never with sleeps.
 *
 * Keys are dispatched as KeyboardEvents from inside the page and timed with
 * performance.now() in the same frame loop the game runs in, so the numbers
 * carry no DevTools-protocol latency. A4 (cold load) uses real CDP key
 * presses because it has to drive the focused menu button.
 *
 * Levels are resolved by name/id via debug().levelNames/levelIds, never by
 * index (CLAUDE.md §7.7).
 *
 *   node tools/loop-probe.mjs [--json out.json] [--quick] [url]
 *
 * --quick measures A1 on four levels instead of all seventeen.
 */
import puppeteer from 'puppeteer-core';
import { writeFileSync, mkdirSync } from 'node:fs';

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  if (i < 0) return null;
  const v = argv[i + 1];
  argv.splice(i, 2);
  return v;
};
const JSON_OUT = flag('--json');
const QUICK = argv.includes('--quick');
if (QUICK) argv.splice(argv.indexOf('--quick'), 1);
const URL = argv[0] ?? 'http://localhost:5175/play/';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VIEW = { width: 1440, height: 900 };
const SHOTS = 'tools/shots/retention';
mkdirSync(SHOTS, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  protocolTimeout: 300000,
  args: [
    '--no-sandbox',
    `--window-size=${VIEW.width},${VIEW.height}`,
    '--use-angle=metal',
    '--enable-gpu',
    '--ignore-gpu-blocklist',
    '--mute-audio',
  ],
  defaultViewport: VIEW,
});

const errors = [];
function watch(page) {
  page.on('console', (m) => {
    const t = m.type();
    if (t === 'error') errors.push(m.text());
    else if ((t === 'warn' || t === 'warning') && /GL_INVALID/.test(m.text())) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`UNCAUGHT: ${e.message}`));
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2)] : NaN;
};
const r0 = (x) => (Number.isFinite(x) ? Math.round(x) : x);

async function openGame(seed = null) {
  const page = await browser.newPage();
  watch(page);
  if (seed) {
    await page.evaluateOnNewDocument((s) => {
      for (const [k, v] of Object.entries(s)) localStorage.setItem(k, JSON.stringify(v));
    }, seed);
  }
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 90000 });
  await page.waitForFunction(() => typeof window.__game?.debug === 'function', { timeout: 60000 });
  // Warm-up: a few real frames so the first measurement isn't paying for
  // shader compiles that every later one skips.
  await new Promise((r) => setTimeout(r, 1500));
  return page;
}

/**
 * In-page helpers, installed once per page. `window.__loop.until(fn, opts)`
 * polls fn() once per animation frame; `press(code)` taps a key the way
 * Input.js and Hud.js receive it; `hold(code, down)` holds one.
 */
async function installHelpers(page) {
  await page.evaluate(() => {
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    const ev = (type, code) =>
      window.dispatchEvent(new KeyboardEvent(type, { code, key: code === 'Enter' ? 'Enter' : code, bubbles: true }));
    window.__loop = {
      frame,
      press(code) {
        ev('keydown', code);
        ev('keyup', code);
      },
      hold(code, down) {
        ev(down ? 'keydown' : 'keyup', code);
      },
      /** Resolves with performance.now() of the first frame fn() is true, or null. */
      async until(fn, { timeoutMs = 5000, every = null } = {}) {
        const t0 = performance.now();
        for (;;) {
          await frame();
          const now = performance.now();
          if (fn()) return now;
          if (now - t0 > timeoutMs) return null;
          every?.(now - t0);
        }
      },
      restartCode() {
        return window.__game.settings.get('bindings')?.restart?.[0] ?? 'KeyB';
      },
      gearDCode() {
        return window.__game.settings.get('bindings')?.gearD?.[0] ?? 'KeyF';
      },
      throttleCode() {
        return window.__game.settings.get('bindings')?.throttle?.[0] ?? 'KeyW';
      },
      cardText() {
        const c = document.querySelector('.hud-review-card');
        return c && !c.hidden ? c.innerText : '';
      },
      cardVisible() {
        const c = document.querySelector('.hud-review-card');
        return Boolean(c && !c.hidden && c.innerText.trim());
      },
      /**
       * After a restart has happened: how long until throttle moves the car,
       * and which keys that took. Presses the throttle first; if the car
       * doesn't move within `graceMs` (it is in P), shifts to Drive and tries
       * again — i.e. what a player does.
       */
      async throttleAccept() {
        const g = window.__game;
        const keys = [];
        const t0 = performance.now();
        // What a player who knows the game does: out of P/N first, then throttle.
        const gear = g.debug().car.gear;
        if (gear === 'P' || gear === 'N') {
          const F = this.gearDCode();
          this.press(F);
          keys.push(F);
        }
        const W = this.throttleCode();
        this.hold(W, true);
        const t = await this.until(() => g.debug().car.speedMs > 0.05, { timeoutMs: 3000 });
        this.hold(W, false);
        return { ms: t === null ? null : t - t0, keys, gearAtStart: gear };
      },
    };
  });
}

/** Levels by name and id, in play order. */
async function levelTable(page) {
  return page.evaluate(() => {
    const d = window.__game.debug();
    return d.levelNames.map((name, index) => ({ index, name, id: d.levelIds[index] }));
  });
}

const out = { when: new Date().toISOString(), url: URL, harness: 'metal', A1: [], A2: [], A3: [], A4: null, A5: [], A6: null, leak: null, errors };

// --------------------------------------------------------------------------
// A1 — mid-run restart: restart key -> reloaded frame -> throttle moves the car
// --------------------------------------------------------------------------
{
  const page = await openGame({ 'parking-precision:settings:v4': { tutorialDone: true } });
  await installHelpers(page);
  const levels = await levelTable(page);
  const sample = QUICK ? levels.filter((l) => ['Deck One', 'Level B4', 'Roof Three', 'City Drive'].includes(l.name)) : levels;
  console.log('\n[A1] restart key -> driving again (median of 5, worst)');
  for (const lv of sample) {
    const runs = await page.evaluate(async (index) => {
      const g = window.__game;
      const L = window.__loop;
      g.debugPlay(index);
      await L.until(() => false, { timeoutMs: 400 }); // let the load's first frames draw
      const res = [];
      for (let k = 0; k < 5; k++) {
        // Some driving time on the clock, so a reload is visible as a reset.
        await L.until(() => g.debug().scoring.timeSec > 0.15, { timeoutMs: 3000 });
        const before = g.debug().scoring.timeSec;
        const t0 = performance.now();
        L.press(L.restartCode());
        const tReload = await L.until(() => g.debug().scoring.timeSec < before && g.debug().state === 'driving', { timeoutMs: 5000 });
        // One more frame: the reloaded level has now been drawn once.
        await L.frame();
        const tDrawn = performance.now();
        const gear = g.debug().car.gear;
        const thr = await L.throttleAccept();
        res.push({
          reloadMs: tReload === null ? null : tReload - t0,
          drawnMs: tDrawn - t0,
          gearAfter: gear,
          throttleMs: thr.ms === null ? null : tDrawn - t0 + thr.ms,
          keys: [L.restartCode(), ...thr.keys],
        });
      }
      return res;
    }, lv.index);
    const drawn = runs.map((r) => r.drawnMs);
    const thr = runs.map((r) => r.throttleMs).filter((x) => x != null);
    const row = {
      level: lv.name,
      id: lv.id,
      reloadMedianMs: r0(median(drawn)),
      reloadWorstMs: r0(Math.max(...drawn)),
      toThrottleMedianMs: r0(median(thr)),
      toThrottleWorstMs: r0(Math.max(...thr)),
      gearAfterRestart: runs[0].gearAfter,
      keysToThrottle: runs[0].keys.length,
      keys: runs[0].keys,
    };
    out.A1.push(row);
    console.log(
      `  ${lv.name.padEnd(12)} id ${String(lv.id).padStart(2)}  reload ${row.reloadMedianMs} ms (worst ${row.reloadWorstMs})` +
        `  -> throttle ${row.toThrottleMedianMs} ms (worst ${row.toThrottleWorstMs}), gear after ${row.gearAfterRestart}, keys ${row.keys.join('+')}`
    );
  }

  // Leak check: 20 restarts on one level, resource counts equal the first load.
  const leak = await page.evaluate(async () => {
    const g = window.__game;
    const L = window.__loop;
    const i = g.debug().levelNames.indexOf('Level B4');
    g.debugPlay(i);
    await L.until(() => false, { timeoutMs: 300 });
    const first = { ...g.debugBenchmark(30), ...(g.debugResources?.() ?? {}) };
    for (let k = 0; k < 20; k++) {
      L.press(L.restartCode());
      await L.frame();
      await L.frame();
    }
    await L.until(() => false, { timeoutMs: 300 });
    const after = { ...g.debugBenchmark(30), ...(g.debugResources?.() ?? {}) };
    return { first, after };
  });
  out.leak = leak;
  console.log(`\n[leak] after first load ${JSON.stringify(leak.first)}\n       after 20 restarts ${JSON.stringify(leak.after)}`);
  await page.close();
}

// --------------------------------------------------------------------------
// A2 — fail card -> driving (timed levels only)
// A3 — park -> card keys usable
// --------------------------------------------------------------------------
{
  const page = await openGame({ 'parking-precision:settings:v4': { tutorialDone: true } });
  await installHelpers(page);
  const levels = await levelTable(page);
  // Which levels are timed, read the way a player reads it: level select.
  const limits = await page.evaluate(async () => {
    const L = window.__loop;
    window.__game.debugPlay(0);
    L.press('Escape');
    await L.until(() => [...document.querySelectorAll('.hud-btn')].some((b) => b.textContent === 'Level select' && b.offsetParent), { timeoutMs: 2000 });
    [...document.querySelectorAll('.hud-btn')].find((b) => b.textContent === 'Level select' && b.offsetParent).click();
    await L.frame();
    const res = [...document.querySelectorAll('.hud-lv')].map((c) => +(c.querySelector('.s')?.textContent.match(/(\d+)s limit/)?.[1] ?? 0) || null);
    L.press('Escape');
    return res;
  });

  console.log('\n[A2] "Not parked" card visible -> throttle moves the car (timed levels)');
  for (const lv of levels) {
    const r = await page.evaluate(async (index, limit) => {
      const g = window.__game;
      const L = window.__loop;
      g.debugPlay(index);
      await L.until(() => false, { timeoutMs: 300 });
      if (!limit) return { untimed: true };
      // Out of the bay, in N, and run the clock past the limit.
      g.debugSetGear('N');
      g.debugTick(limit + 0.2, 1 / 30);
      if (g.debug().state !== 'results') return { error: 'did not fail' };
      const tCard = await L.until(() => L.cardVisible() && /not parked/i.test(L.cardText()), { timeoutMs: 3000 });
      if (tCard === null) return { error: 'no fail card' };
      const cardText = L.cardText();
      // A player who has learned the in-play restart key tries it first.
      const R = L.restartCode();
      L.press(R);
      const tAfterRestartKey = await L.until(() => g.debug().state === 'driving', { timeoutMs: 250 });
      const restartKeyWorks = tAfterRestartKey !== null;
      // Otherwise: the card's own key, Enter, pressed at once and every 100 ms.
      let presses = 1;
      let tDrive = tAfterRestartKey;
      if (!restartKeyWorks) {
        L.press('Enter');
        presses++;
        let last = 0;
        tDrive = await L.until(() => g.debug().state === 'driving', {
          timeoutMs: 6000,
          every: (el) => {
            if (el - last >= 100) {
              last = el;
              L.press('Enter');
              presses++;
            }
          },
        });
      }
      await L.frame();
      const tDrawn = performance.now();
      const gear = g.debug().car.gear;
      const thr = await L.throttleAccept();
      const shiftKeys = thr.keys.length;
      return {
        limit,
        cardText,
        restartKeyWorksOnCard: restartKeyWorks,
        toDrivingMs: tDrive === null ? null : tDrive - tCard,
        toThrottleMs: thr.ms === null ? null : tDrawn - tCard + thr.ms,
        pressesIncludingDead: presses + shiftKeys,
        effectiveKeys: 1 + shiftKeys,
        gearAfter: gear,
      };
    }, lv.index, limits[lv.index]);
    if (r.untimed) {
      out.A2.push({ level: lv.name, id: lv.id, untimed: true });
      continue;
    }
    out.A2.push({ level: lv.name, id: lv.id, ...r, cardText: undefined });
    console.log(
      `  ${lv.name.padEnd(12)} limit ${r.limit?.toFixed(0)} s  card->driving ${r0(r.toDrivingMs)} ms, ->throttle ${r0(r.toThrottleMs)} ms, ` +
        `restart key on card: ${r.restartKeyWorksOnCard ? 'works' : 'dead'}, presses ${r.pressesIncludingDead} (effective ${r.effectiveKeys}), gear after ${r.gearAfter}`
    );
  }
  console.log(`  untimed: ${out.A2.filter((a) => a.untimed).map((a) => a.level).join(', ')}`);

  console.log('\n[A3] park completes -> first card key that works (Enter pressed at once, then every 100 ms)');
  for (const lv of levels) {
    const r = await page.evaluate(async (index) => {
      const g = window.__game;
      const L = window.__loop;
      g.debugPlay(index);
      await L.until(() => false, { timeoutMs: 200 });
      const d = g.debug();
      g.debugTeleport(d.target.pos[0], d.target.pos[1], d.target.heading, d.target.y);
      g.debugTick(1.0);
      g.debugSetGear('P');
      // Step the dwell frame by frame so the completion instant is known.
      let k = 0;
      while (g.debug().state === 'driving' && k++ < 120) g.debugTick(1 / 60);
      if (g.debug().state !== 'results') return { error: `did not park (${g.debug().park?.prompt})` };
      const t0 = performance.now();
      const tCard = await L.until(() => L.cardVisible(), { timeoutMs: 3000 });
      const phase0 = g.debug().review?.phase ?? null;
      let presses = 1;
      L.press('Enter');
      let last = 0;
      const tKey = await L.until(() => g.debug().state === 'driving', {
        timeoutMs: 6000,
        every: (el) => {
          if (el - last >= 100) {
            last = el;
            L.press('Enter');
            presses++;
          }
        },
      });
      return {
        cardMs: tCard === null ? null : tCard - t0,
        keyUsableMs: tKey === null ? null : tKey - t0,
        deadPresses: presses - 1,
        phaseAtCompletion: phase0,
        review: phase0 !== null,
      };
    }, lv.index);
    out.A3.push({ level: lv.name, id: lv.id, ...r });
    console.log(
      `  ${lv.name.padEnd(12)} card ${r0(r.cardMs)} ms, keys usable ${r0(r.keyUsableMs)} ms, dead presses ${r.deadPresses}, flight ${r.review ? 'yes' : 'no'}${r.error ? ' ERROR ' + r.error : ''}`
    );
  }
  await page.close();
}

// --------------------------------------------------------------------------
// A4 — returning player: cold /play/ load -> first driving input accepted
// --------------------------------------------------------------------------
{
  console.log('\n[A4] returning player, cold load -> car moving under throttle');
  const runs = [];
  for (let k = 0; k < 3; k++) {
    const page = await browser.newPage();
    watch(page);
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('parking-precision:settings:v4', JSON.stringify({ tutorialDone: true }));
      localStorage.setItem(
        'parking-precision:progress:v4',
        JSON.stringify({ 1: { stars: 3, timeSec: 30, bumps: 0, score: 92 }, 2: { stars: 2, timeSec: 70, bumps: 1, score: 75 } })
      );
    });
    const tNav = Date.now();
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
    const keys = [];
    // Menu ready: the primary button exists and has focus (Enter works).
    await page.waitForFunction(() => document.activeElement?.classList?.contains('is-on'), { timeout: 60000, polling: 'raf' });
    const menuReady = await page.evaluate(() => performance.now());
    const primary = await page.evaluate(() => document.activeElement.textContent);
    await page.keyboard.press('Enter');
    keys.push('Enter');
    await page.waitForFunction(() => window.__game?.debug().state === 'driving', { timeout: 10000, polling: 'raf' });
    await page.keyboard.down('KeyW');
    keys.push('W');
    let moved = await page
      .waitForFunction(() => window.__game.debug().car.speedMs > 0.05, { timeout: 600, polling: 'raf' })
      .then(() => true)
      .catch(() => false);
    if (!moved) {
      await page.keyboard.press('KeyF');
      keys.push('F');
      await page.waitForFunction(() => window.__game.debug().car.speedMs > 0.05, { timeout: 5000, polling: 'raf' });
    }
    const tMove = await page.evaluate(() => performance.now());
    await page.keyboard.up('KeyW');
    runs.push({ menuReadyMs: menuReady, movingMs: tMove, primary, keys, wallMs: Date.now() - tNav });
    await page.close();
  }
  out.A4 = {
    runs,
    menuReadyMedianMs: r0(median(runs.map((r) => r.menuReadyMs))),
    movingMedianMs: r0(median(runs.map((r) => r.movingMs))),
    keysBeforeThrottle: runs[0].keys.filter((k) => k !== 'W'),
  };
  console.log(
    `  menu ready ${out.A4.menuReadyMedianMs} ms after navigation ("${runs[0].primary}" focused); car moving at ${out.A4.movingMedianMs} ms` +
      ` (machine time, no human reaction); keys ${runs[0].keys.join(' -> ')}`
  );
}

// --------------------------------------------------------------------------
// A5 — card clarity at three deliberate poses; A6 — the 3-star dead end
// --------------------------------------------------------------------------
{
  // Every level seeded with a 3-star, score-95 record (A6).
  const page0 = await openGame({ 'parking-precision:settings:v4': { tutorialDone: true } });
  const levels = await levelTable(page0);
  await page0.close();
  const seeded = {};
  for (const lv of levels) seeded[lv.id] = { stars: 3, timeSec: 20, bumps: 0, score: 95 };
  const page = await openGame({ 'parking-precision:settings:v4': { tutorialDone: true }, 'parking-precision:progress:v4': seeded });
  await installHelpers(page);

  // A6 first half: level select with the seeded records, before any run below
  // overwrites them. Opened the way a player opens it.
  const lsel = await page.evaluate(async () => {
    const L = window.__loop;
    window.__game.debugPlay(0);
    L.press('Escape');
    await L.until(() => [...document.querySelectorAll('.hud-btn')].some((b) => b.textContent === 'Level select' && b.offsetParent), { timeoutMs: 2000 });
    [...document.querySelectorAll('.hud-btn')].find((b) => b.textContent === 'Level select' && b.offsetParent).click();
    await L.frame();
    return [...document.querySelectorAll('.hud-lv')].map((c) => c.innerText.replace(/\n+/g, ' | '));
  });
  await page.screenshot({ path: `${SHOTS}/loop-levelselect.png` });
  console.log('\n[A5] results card at three poses: names the biggest loss? points recoverable? a concrete fix?');
  const POSES = [
    { name: 'centre', lat: 0, e: 0 },
    { name: '30 cm lateral', lat: 0.3, e: 0 },
    { name: '8 deg heading', lat: 0, e: 8 },
  ];
  for (const lv of levels) {
    for (const pose of POSES) {
      const r = await page.evaluate(
        async (index, pose) => {
          const g = window.__game;
          const L = window.__loop;
          g.debugPlay(index);
          g.debugTick(0.2);
          const d = g.debug();
          const h = d.target.heading;
          const tol = g.debug().park?.lateralTol ?? 0.5;
          // Stay inside every level's heading tolerance (Final Exam's is 8 deg).
          const eDeg = Math.min(pose.e, 7.5);
          const x = d.target.pos[0] + pose.lat * Math.cos(h);
          const z = d.target.pos[1] - pose.lat * Math.sin(h);
          g.debugTeleport(x, z, h + (eDeg * Math.PI) / 180, d.target.y);
          g.debugTick(1.0);
          g.debugSetGear('P');
          g.debugTick(1.0);
          if (g.debug().state !== 'results') return { error: `not parked: ${g.debug().park?.prompt}`, tol };
          g.debugReviewSkip();
          await L.frame();
          const text = L.cardText();
          const p = g.debug().park;
          return { text, lateral: p?.lateral, heading: p?.headingErrDeg };
        },
        lv.index,
        pose
      );
      const t = r.text ?? '';
      const score = +(t.match(/Score\s*(\d+)\s*\/\s*100/)?.[1] ?? NaN);
      const row = {
        level: lv.name,
        id: lv.id,
        pose: pose.name,
        score,
        namesBiggestLoss: /biggest|cost you|lost the most|most points/i.test(t),
        pointsRecoverable: /(worth|recover|win back|get back)\s*\+?\d+|\+\d+\s*(points|pts)|\d+\s*(points|pts)\s*to\s*★/i.test(t),
        concreteFix: /(straighten|steer|stop|aim|brake|centre it|pull|back up|reverse).{0,60}(before|earlier|sooner|when|until)/i.test(t),
        nextTier: /to ★|to gold|to platinum|next tier|platinum:|beat your/i.test(t),
        error: r.error,
        text: t,
        par: +(t.match(/par (\d+) ?s/)?.[1] ?? NaN),
      };
      out.A5.push(row);
      if (pose.name === 'centre' || r.error) {
        // One line per level is enough in the console; the JSON has all three.
      }
    }
    const rows = out.A5.filter((a) => a.id === lv.id);
    console.log(
      `  ${lv.name.padEnd(12)} scores ${rows.map((a) => (a.error ? 'ERR' : a.score)).join('/')}  biggest-loss ${rows.filter((a) => a.namesBiggestLoss).length}/3` +
        `  recoverable ${rows.filter((a) => a.pointsRecoverable).length}/3  fix ${rows.filter((a) => a.concreteFix).length}/3${rows.some((a) => a.error) ? '  ' + rows.find((a) => a.error).error : ''}`
    );
  }

  console.log('\n[A6] every level seeded 3 stars / 95: is there a next goal on the card and in level select?');
  // Card: the A5 centre-pose runs above were made with this same seed.
  const cardGoal = out.A5.filter((a) => a.pose === 'centre' && a.nextTier).length;
  const goalRe = /\b(to beat|next goal|to gold|to platinum|author|daily|beat \d)|→/i;
  out.A6 = {
    cardWithNextGoal: cardGoal,
    levelSelectWithNextGoal: lsel.filter((t) => goalRe.test(t)).length,
    levelSelectSample: lsel.slice(0, 3),
    of: levels.length,
  };
  console.log(`  results card with a next goal: ${cardGoal}/${levels.length}`);
  console.log(`  level-select cards with a next goal: ${out.A6.levelSelectWithNextGoal}/${lsel.length}`);
  console.log(`  e.g. ${lsel.slice(0, 2).join('   ||   ')}`);
  await page.close();
}

// --------------------------------------------------------------------------
// A7 — dead time per attempt, from the numbers above
// --------------------------------------------------------------------------
{
  console.log('\n[A7] seconds per attempt NOT driving (park dwell + card dead time + reload + gear key) vs par');
  out.A7 = [];
  for (const a1 of out.A1) {
    const a3 = out.A3.find((a) => a.id === a1.id);
    const par = out.A5.find((a) => a.id === a1.id && Number.isFinite(a.par))?.par ?? null;
    const dwell = 0.5;
    const card = a3?.keyUsableMs != null ? a3.keyUsableMs / 1000 : null;
    const reload = a1.toThrottleMedianMs / 1000;
    const dead = card == null ? null : dwell + card + reload;
    out.A7.push({ level: a1.level, id: a1.id, dwell, cardDeadS: card, reloadToThrottleS: reload, deadS: dead, par, deadPctOfPar: dead != null && par ? +(100 * dead / par).toFixed(1) : null });
    console.log(`  ${a1.level.padEnd(12)} dwell 0.5 + card ${card?.toFixed(2) ?? 'n/a (keyboard never works)'} + restart ${reload.toFixed(2)} = ${dead?.toFixed(2) ?? 'n/a'} s dead, par ${par} s${dead != null && par ? ` (${(100 * dead / par).toFixed(1)}% of a par run)` : ''}`);
  }
}

console.log(`\nconsole errors: ${errors.length}`);
errors.slice(0, 10).forEach((e) => console.log('  ' + e));
if (JSON_OUT) {
  writeFileSync(JSON_OUT, JSON.stringify(out, null, 2));
  console.log(`wrote ${JSON_OUT}`);
}
await browser.close();
process.exit(errors.length ? 1 : 0);
