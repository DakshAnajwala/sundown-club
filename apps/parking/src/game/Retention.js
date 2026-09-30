/**
 * Retention.js — the numbers and the pure logic behind the "one more try"
 * loop: medals above three stars, the next goal on every level, where a
 * run's points went, the daily challenge, and the share line.
 *
 * Pure on purpose: no DOM, no three.js, no storage. Hud.js renders what this
 * returns, Game.js decides when to call it, and tools/level-lint.mjs,
 * tools/drive-test.mjs and tools/retention-probe.mjs import it directly.
 * Design, copy and acceptance criteria: design/SPEC-retention.md.
 *
 * NOTHING HERE CHANGES A SCORE. Scoring.js still owns the maths; this module
 * reads its output. Medals are additive above STAR_CUTOFFS, and every "cost
 * you N points" is the exact gain from re-summing the parts, never an
 * estimate — the card must never promise more than a fix would give.
 *
 * NO STREAKS. The daily challenge's only persistent number is a cumulative
 * count that can go up and never down (ui/daily.js). There is deliberately
 * no notion of consecutive days anywhere in this file.
 */
import { STAR_CUTOFFS } from './Scoring.js';
import { LEVELS } from '../world/Levels.js';

export const MEDALS = {
  gold: { minScore: 95 }, // on top of ★★★ (88)
  platinum: { minScore: 98 }, // AND timeSec <= AUTHOR_TIMES[id].sec
};

/**
 * Author times, seconds of game time. Provenance is load-bearing: levels 1, 2
 * and 6 are real driven runs (tools/autodrive.mjs, re-run 29 Sep 2026 after creep was removed; it cruises
 * at a deliberately slow 2 m/s); every other value is round(par x 0.8) and is
 * PROVISIONAL until a human run replaces it (design/SPEC-retention.md §4.3).
 * City Drive's autodrive run (241.3 s) was slower than its par, so it is not used.
 */
export const AUTHOR_TIMES = {
  1: { sec: 21.3, source: 'autodrive' }, // Deck One
  2: { sec: 29.0, source: 'autodrive' }, // Deck Two
  6: { sec: 15.7, source: 'autodrive' }, // Deck Four
  3: { sec: 64, source: 'provisional' }, // Deck Three, par 80
  4: { sec: 68, source: 'provisional' }, // Level B1, par 85
  5: { sec: 80, source: 'provisional' }, // Level B2, par 100
  14: { sec: 52, source: 'provisional' }, // Deck Five, par 65
  7: { sec: 60, source: 'provisional' }, // Level B3, par 75
  15: { sec: 40, source: 'provisional' }, // Level B5, par 50
  8: { sec: 72, source: 'provisional' }, // Level B4, par 90
  17: { sec: 56, source: 'provisional' }, // Level B6, par 70
  9: { sec: 48, source: 'provisional' }, // Roof One, par 60
  10: { sec: 68, source: 'provisional' }, // Roof Two, par 85
  16: { sec: 76, source: 'provisional' }, // Roof Four, par 95
  11: { sec: 24, source: 'provisional' }, // Roof Three, par 30
  12: { sec: 56, source: 'provisional' }, // Final Exam, par 70
  13: { sec: 192, source: 'provisional' }, // City Drive, par 240
};

/** Share cells: a part's points over its maximum. */
export const SHARE_CELL = { green: 0.9, yellow: 0.6 };
/** 28 Sep 2026 00:00 UTC is Daily #1. */
export const DAILY_EPOCH_UTC = Date.UTC(2026, 8, 28);
/** Perfect-park bay pulse: one pulse, 600 ms (1.7 Hz, under the 3 Hz flash limit). */
export const JUICE = { pulseMs: 600, pulseMinScore: STAR_CUTOFFS[0] };
/** Live driving ghost (design/SPEC-retention.md §8.2). */
export const GHOST = {
  hz: 20,
  maxBytesPerLevel: 30_000,
  maxBytesTotal: 400_000,
  opacity: 0.35,
  /** Fully transparent within the first distance of your car, full opacity past the second. */
  fadeNearM: [2.0, 5.0],
};

const MS_PER_DAY = 86_400_000;
const PART_ORDER = ['placement', 'depth', 'alignment', 'time', 'finesse'];
/** Tie-break for "biggest loss": the parts a player controls most come first. */
const LOSS_ORDER = ['placement', 'alignment', 'depth', 'finesse', 'time'];
const MEDAL_RANK = { platinum: 2, gold: 1 };

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const starsText = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);

// --- medals and goals ---------------------------------------------------------

/** 'platinum' | 'gold' | null for one run. */
export function medalFor(score, timeSec, levelId) {
  const author = AUTHOR_TIMES[levelId]?.sec;
  if (score >= MEDALS.platinum.minScore && author != null && timeSec <= author) return 'platinum';
  if (score >= MEDALS.gold.minScore) return 'gold';
  return null;
}

/** The better of two medals (either may be null). */
export function betterMedal(a, b) {
  return (MEDAL_RANK[a] ?? 0) >= (MEDAL_RANK[b] ?? 0) ? a ?? null : b ?? null;
}

/** 0 below three stars, 1 three stars, 2 gold, 3 platinum — for the juice. */
export function tierLevel(score, medal) {
  if (medal === 'platinum') return 3;
  if (medal === 'gold') return 2;
  return score >= STAR_CUTOFFS[0] ? 1 : 0;
}

const fmtSec = (s) => `${(Math.round(s * 10) / 10).toFixed(1)} s`;
const fmtAuthor = (id) => {
  const s = AUTHOR_TIMES[id]?.sec;
  return s == null ? null : Number.isInteger(s) ? `${s} s` : `${s.toFixed(1)} s`;
};

/**
 * The one next goal for a level, from its saved record (level select).
 * Every state from three stars up has a concrete target (G6).
 * @param {{score:number|null, medal?:string|null, fastestSec?:number|null}|null} rec
 */
export function nextGoal(rec, levelId) {
  if (!rec || rec.score == null) return rec ? 'Park it again to get a score' : 'Not parked yet';
  const score = rec.score;
  const medal = rec.medal ?? null;
  const author = fmtAuthor(levelId);
  if (medal === 'platinum') return rec.fastestSec != null ? `Beat your ${fmtSec(rec.fastestSec)}` : 'Platinum earned';
  if (medal === 'gold' || score >= MEDALS.gold.minScore) {
    if (score >= MEDALS.platinum.minScore && rec.fastestSec != null) {
      return `Platinum: beat ${author} (your fastest ${fmtSec(rec.fastestSec)})`;
    }
    return `Platinum: 98+ in under ${author}`;
  }
  if (score < STAR_CUTOFFS[0]) return `${plural(STAR_CUTOFFS[0] - score, 'point')} to ★★★`;
  return `${plural(MEDALS.gold.minScore - score, 'point')} to Gold`;
}

/**
 * The next-tier line for THIS run's card, from this run's own score and time.
 * @returns {{ text: string, earned: boolean }}
 */
export function nextTier({ score, timeSec, levelId, fastestSec = null }) {
  const medal = medalFor(score, timeSec, levelId);
  const author = fmtAuthor(levelId);
  if (medal === 'platinum') {
    return { earned: true, lead: 'Platinum earned.', text: `Next: beat your ${fmtSec(fastestSec ?? timeSec)}.` };
  }
  if (score < STAR_CUTOFFS[0]) return { earned: false, lead: `${plural(STAR_CUTOFFS[0] - score, 'point')} to ★★★`, text: '' };
  if (score < MEDALS.gold.minScore) return { earned: false, lead: `${plural(MEDALS.gold.minScore - score, 'point')} to Gold`, text: '' };
  if (score < MEDALS.platinum.minScore) return { earned: false, lead: `Platinum: 98+ in under ${author}`, text: '' };
  return { earned: false, lead: `Platinum: beat ${author}`, text: `This run took ${fmtSec(timeSec)}.` };
}

// --- where the points went ------------------------------------------------------

/**
 * Per-part rows, the biggest loss, the fix sentence and its exact value.
 *
 * @param {object} result  Scoring.finish() output (needs parts, max, score, timeSec, par, bumps, cones, kerbHits)
 * @param {object|null} w  stopWords() output for the parked pose
 * @param {object} target  level.target (for its style)
 */
export function explain(result, w, target) {
  const { parts, max, score } = result;
  const lost = {};
  for (const k of PART_ORDER) lost[k] = Math.max(0, max[k] - parts[k]);

  let biggest = null;
  for (const k of LOSS_ORDER) if (lost[k] >= 0.5 && (!biggest || lost[k] > lost[biggest])) biggest = k;

  let worth = 0;
  if (biggest) {
    const fixed = PART_ORDER.reduce((a, k) => a + (k === biggest ? max[k] : parts[k]), 0);
    worth = Math.max(0, Math.round(fixed)) - score;
    // A loss of >= 0.5 can still round to no change in the total (e.g. 84.2
    // -> 84.7). Then there is honestly nothing to promise.
    if (worth < 1) biggest = null;
  }

  const contacts = [];
  if (result.bumps) contacts.push(plural(result.bumps, 'bump'));
  if (result.cones) contacts.push(plural(result.cones, 'cone'));
  if (result.kerbHits) contacts.push(plural(result.kerbHits, 'kerb strike'));
  const contactText = contacts.length > 1 ? `${contacts.slice(0, -1).join(', ')} and ${contacts.at(-1)}` : contacts[0];

  const lateral = w?.latCm ? `${w.latCm} cm ${w.latSide} of centre` : '0 cm off centre';
  let depth = '0 cm off';
  if (w?.lonCm) depth = w.depthDir ? `${w.lonCm} cm ${w.depthDir === 'deep' ? 'too deep' : 'short'}` : `${w.lonCm} cm ${w.fwdDir}`;
  const heading = w && w.headDeg >= 0.05 ? `${w.headDeg.toFixed(1)}° nose ${w.headSide}` : '0.0° out';

  const rows = [
    { key: 'placement', label: 'Placement in bay', detail: lateral },
    { key: 'depth', label: 'Depth', detail: depth },
    { key: 'alignment', label: 'Alignment', detail: heading },
    { key: 'time', label: 'Time', detail: `${result.timeSec.toFixed(1)} s (par ${result.par} s)` },
    { key: 'finesse', label: 'Clean run', detail: contactText ?? 'no contact' },
  ].map((r) => ({
    ...r,
    earned: Math.round(parts[r.key]),
    max: max[r.key],
    lost: Math.round(lost[r.key]),
    big: r.key === biggest,
  }));

  const pts = plural(worth, 'point');
  let fix;
  switch (biggest) {
    case 'placement':
      fix = { lead: `${w.latCm} cm ${w.latSide} of centre cost you ${pts}.`, text: 'Aim for equal gaps both sides before you stop.' };
      break;
    case 'depth':
      if (w.depthDir) {
        fix = {
          lead: `${w.lonCm} cm ${w.depthDir === 'deep' ? 'too deep' : 'short'} cost you ${pts}.`,
          text: `Finish ${w.lonCm} cm further ${w.depthDir === 'deep' ? 'out' : 'in'}.`,
        };
      } else {
        fix = {
          lead: `${w.lonCm} cm too far ${w.fwdDir} cost you ${pts}.`,
          text: `Finish ${w.lonCm} cm further ${w.fwdDir === 'forward' ? 'back' : 'forward'}.`,
        };
      }
      break;
    case 'alignment':
      fix = { lead: `${w.headDeg.toFixed(1)}° nose ${w.headSide} cost you ${pts}.`, text: 'Straighten the wheel a car length before you stop.' };
      break;
    case 'time':
      fix = { lead: `${(result.timeSec - result.par).toFixed(1)} s over par cost you ${pts}.`, text: `Par here is ${result.par} s.` };
      break;
    case 'finesse':
      fix = { lead: `${contactText[0].toUpperCase()}${contactText.slice(1)} cost you ${pts}.`, text: 'A clean run is worth 10.' };
      break;
    default:
      fix = null;
  }
  if (!fix) {
    const perfect = PART_ORDER.every((k) => lost[k] < 0.5);
    fix = perfect
      ? { lead: 'Nothing to fix.', text: 'Every part scored full marks.', clean: true }
      : { lead: 'Nothing big to fix.', text: 'Every loss on this run is under a point.', clean: true };
  }
  void target;
  return { rows, biggest, worth: biggest ? worth : 0, fix };
}

// --- share ------------------------------------------------------------------------

/** 🟩/🟨/⬛ per part, in PART_ORDER. */
export function shareCells(parts, max) {
  return PART_ORDER.map((k) => {
    const f = max[k] ? parts[k] / max[k] : 0;
    return f >= SHARE_CELL.green ? '🟩' : f >= SHARE_CELL.yellow ? '🟨' : '⬛';
  }).join('');
}

/**
 * The text handed to share(); share() appends the site URL after it.
 * No name, handle or identifier, ever.
 */
export function shareText({ levelName, daily = null, score, stars, medal, timeSec, parts, max }) {
  const head = daily ? [`Parking Precision · Daily #${daily.day}`, daily.title] : [`Parking Precision · ${levelName}`];
  const medalWord = medal ? ` ${medal.toUpperCase()}` : '';
  return [
    ...head,
    `${score}/100 ${starsText(stars)}${medalWord} · ${timeSec.toFixed(1)} s`,
    shareCells(parts, max),
    'Free in your browser:',
  ].join('\n');
}

// --- daily challenge ----------------------------------------------------------------

/**
 * The pool. APPEND-ONLY: appending changes future dailies, so deploy pool
 * changes just after 00:00 UTC. Every entry is a variant of an existing lot:
 *   bay         the glowing target moves to another empty painted bay in the
 *               same row (same heading, bay, tolerance, par and limit)
 *   no-contact  any bump, cone or kerb strike fails the run
 *   under-par   par becomes a hard limit — only on levels a real driven run
 *               beat par (1, 2, 6), so it is known to be possible
 * tools/level-lint.mjs and tools/drive-test.mjs check every entry.
 */
export const DAILY_POOL = [
  { level: 1, kind: 'bay', pos: [10, -13.8] },
  { level: 1, kind: 'no-contact' },
  { level: 2, kind: 'bay', pos: [4, -13.8] },
  { level: 2, kind: 'under-par' },
  { level: 3, kind: 'no-contact' },
  { level: 4, kind: 'no-contact' },
  { level: 5, kind: 'no-contact' },
  { level: 6, kind: 'under-par' },
  { level: 14, kind: 'no-contact' },
  { level: 7, kind: 'bay', pos: [3, -11.8] },
  { level: 7, kind: 'bay', pos: [-6, -11.8] },
  { level: 15, kind: 'no-contact' },
  { level: 8, kind: 'bay', pos: [9.6, -10.8] },
  { level: 8, kind: 'bay', pos: [1.35, -10.8] },
  { level: 17, kind: 'bay', pos: [4, -13.8] },
  { level: 9, kind: 'no-contact' },
  { level: 10, kind: 'bay', pos: [11.3, -11.8] },
  { level: 10, kind: 'no-contact' },
  { level: 16, kind: 'no-contact' },
  { level: 11, kind: 'bay', pos: [14, -14.8] },
  { level: 12, kind: 'bay', pos: [9.2, -12.8] },
  { level: 12, kind: 'no-contact' },
  { level: 1, kind: 'under-par' },
];

/** Standard mulberry32. */
export function mulberry32(a) {
  return function next() {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** UTC midnight of `date`, as epoch ms. */
const utcMidnight = (date) => Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());

/** Daily number for a date: 28 Sep 2026 (UTC) is #1. */
export function dayNumber(date = new Date()) {
  return Math.floor((utcMidnight(date) - DAILY_EPOCH_UTC) / MS_PER_DAY) + 1;
}

/** YYYYMMDD integer of a daily's UTC date — its seed. */
export function daySeed(day) {
  const d = new Date(DAILY_EPOCH_UTC + (day - 1) * MS_PER_DAY);
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

/**
 * Pool index for a day. raw = floor(mulberry32(YYYYMMDD)() x n); if that is
 * yesterday's entry, take the next one. Iterates from day 1 so "yesterday" is
 * always the entry actually played, never a guess: O(days), microseconds.
 */
export function dailyIndex(day, n = DAILY_POOL.length) {
  let prev = -1;
  let idx = 0;
  for (let d = 1; d <= Math.max(1, day); d++) {
    const raw = Math.floor(mulberry32(daySeed(d))() * n);
    idx = raw === prev ? (raw + 1) % n : raw;
    prev = idx;
  }
  return idx;
}

/** "Deck Two — no contact" etc. */
export function dailyTitle(entry) {
  const base = LEVELS.find((l) => l.id === entry.level);
  if (entry.kind === 'bay') return `${base.name} — the glowing bay has moved`;
  if (entry.kind === 'no-contact') return `${base.name} — no contact`;
  return `${base.name} — beat par: park within ${base.parTime} s`;
}

/**
 * A playable level object for a pool entry, derived from its base lot.
 * Keeps the base id (so nothing ever treats it as a new level) and carries
 * `daily` so Game.js knows not to post it or record progress.
 */
export function dailyLevel(entry, day = null, index = null) {
  const base = LEVELS.find((l) => l.id === entry.level);
  if (!base) throw new Error(`daily: no level ${entry.level}`);
  const level = {
    ...base,
    name: day != null ? `Daily #${day}` : `Daily (${base.name})`,
    subtitle: dailyTitle(entry),
    daily: { day, index, kind: entry.kind, title: dailyTitle(entry), baseName: base.name },
  };
  if (entry.kind === 'bay') {
    level.target = { ...base.target, pos: [...entry.pos] };
    level.hint = 'Same deck, a different bay. Find the glow.';
  } else if (entry.kind === 'no-contact') {
    level.hint = 'Any bump, cone or kerb strike ends this run.';
  } else if (entry.kind === 'under-par') {
    level.timeLimit = base.parTime;
    level.hint = `Park within ${base.parTime} s. Par is the limit today.`;
  }
  return level;
}

/** Today's daily, or the one for an explicit date. */
export function dailyFor(date = new Date()) {
  const day = dayNumber(date);
  const index = dailyIndex(day);
  const entry = DAILY_POOL[index];
  return { day, index, seed: daySeed(Math.max(1, day)), entry, title: dailyTitle(entry) };
}

/** Whole hours to the next 00:00 UTC, for "new daily in N h". */
export function hoursToNextDaily(date = new Date()) {
  const next = utcMidnight(date) + MS_PER_DAY;
  return Math.ceil((next - date.getTime()) / 3_600_000);
}

export function nextDailyText(date = new Date()) {
  const h = hoursToNextDaily(date);
  return h <= 1 ? 'new daily within the hour' : `new daily in ${h} h`;
}
