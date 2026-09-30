// Per-level completion progress, persisted locally.
//
// localStorage, not cookies or any server: this is single-player state that
// never needs to leave the machine, and cookies would ship it on every HTTP
// request for no benefit. Same try/catch discipline as ui/settings.js —
// localStorage throws outright (not just returns null) in some privacy
// modes, so every access is guarded and the game stays playable without it.
//
// v5 (retention pass) adds two fields to each record: `medal`, the best medal
// ever earned on the level, and `fastestSec`, the fastest park at any score.
// The v4 fields keep their exact meaning (the best-by-score run). A v4 save
// is migrated on first read and LEFT IN PLACE, so rolling the build back to
// a v4-only one loses nothing.

import { medalFor, betterMedal } from '../game/Retention.js';

const STORAGE_KEY = 'parking-precision:progress:v5';
const V4_KEY = 'parking-precision:progress:v4';
const MEDAL_VALUES = ['gold', 'platinum'];

/** Rebuild one record rather than trusting the stored shape. */
function cleanRecord(rec) {
  const stars = Number(rec?.stars);
  const timeSec = Number(rec?.timeSec);
  const bumps = Number(rec?.bumps);
  const score = Number(rec?.score);
  const fastestSec = Number(rec?.fastestSec);
  if (!Number.isFinite(stars)) return null;
  return {
    stars: Math.min(3, Math.max(0, Math.round(stars))),
    timeSec: Number.isFinite(timeSec) ? timeSec : null,
    bumps: Number.isFinite(bumps) ? bumps : null,
    score: Number.isFinite(score) ? Math.min(100, Math.max(0, Math.round(score))) : null,
    // Personal-best pose (GOAL Part C §13, the review's ghost footprint): the
    // offsets needed to redraw the ghost footprint, not raw world coords
    // (which would be meaningless if a level's target ever moved). Same
    // re-validate-don't-trust discipline as every other stored field.
    bestPose: validPose(rec?.bestPose),
    medal: MEDAL_VALUES.includes(rec?.medal) ? rec.medal : null,
    fastestSec: rec?.fastestSec != null && Number.isFinite(fastestSec) && fastestSec > 0 ? fastestSec : null,
  };
}

function parse(key) {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  return parsed && typeof parsed === 'object' ? parsed : {};
}

function readAll() {
  try {
    let parsed = parse(STORAGE_KEY);
    let migrated = false;
    if (parsed === null) {
      // First run of v5: take the v4 save, if any. v4 kept one run per level
      // (the best score), so that run is the only evidence for a medal and
      // its time is the only known time.
      parsed = parse(V4_KEY);
      if (parsed === null) return {};
      migrated = true;
    }
    const clean = {};
    for (const [id, rec] of Object.entries(parsed)) {
      const c = cleanRecord(rec);
      if (!c) continue;
      if (migrated) {
        c.medal = c.score != null && c.timeSec != null ? medalFor(c.score, c.timeSec, Number(id)) : null;
        c.fastestSec = c.timeSec != null && c.timeSec > 0 ? c.timeSec : null;
      }
      clean[id] = c;
    }
    if (migrated) writeAll(clean);
    return clean;
  } catch {
    return {};
  }
}

/** lateral/longitudinal, metres; headingErrDeg, degrees. `null` if malformed. */
function validPose(p) {
  if (!p || typeof p !== 'object') return null;
  const lateral = Number(p.lateral);
  const longitudinal = Number(p.longitudinal);
  const headingErrDeg = Number(p.headingErrDeg);
  if (![lateral, longitudinal, headingErrDeg].every(Number.isFinite)) return null;
  return { lateral, longitudinal, headingErrDeg };
}

function writeAll(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Storage unavailable — progress still tracks for this session only.
  }
}

export function createProgress() {
  let data = readAll();

  return {
    all: () => ({ ...data }),
    isCompleted: (levelId) => Boolean(data[levelId]),
    get: (levelId) => (data[levelId] ? { ...data[levelId] } : null),

    // Keeps the BEST run per level rather than the most recent: more stars
    // wins, and on equal stars the faster time wins. Replaying a level can
    // only improve the record, never downgrade it.
    // v4 ranks on SCORE first, falling back to the v1 stars/time comparison
    // for records written before scoring existed. Score is the finer-grained
    // signal: two 3-star parks can differ by 20 points of placement accuracy.
    // v5: `medal` and `fastestSec` update on EVERY park, whether or not the
    // score improved — a 98 in 18 s is a Platinum even if a slower 99 is the
    // best score. Returns the record before this run as `prev`.
    record(levelId, { stars, timeSec, bumps, score, pose = null, medal = null }) {
      const prev = data[levelId] ?? null;
      const better =
        !prev ||
        (prev.score != null && score != null
          ? score > prev.score
          : stars > prev.stars ||
            (stars === prev.stars && prev.timeSec != null && timeSec < prev.timeSec));
      const base = better ? { stars, timeSec, bumps, score, bestPose: validPose(pose) } : prev;
      const next = {
        ...base,
        medal: betterMedal(prev?.medal ?? null, medal),
        fastestSec: prev?.fastestSec != null && prev.fastestSec <= timeSec ? prev.fastestSec : timeSec,
      };
      data = { ...data, [levelId]: next };
      writeAll(data);
      return { ...next, improved: better, prev: prev ? { ...prev } : null };
    },

    reset() {
      data = {};
      writeAll(data);
      try {
        localStorage.removeItem(V4_KEY);
      } catch {
        // nothing to clear
      }
    },
  };
}
