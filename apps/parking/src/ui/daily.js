// Daily challenge results, persisted locally (design/SPEC-retention.md §6.4).
//
// Same storage discipline as progress.js: every access guarded, every field
// re-validated on read, and the game plays the same without storage.
//
// WHAT IS STORED, AND WHAT IS NOT. `parked` is a cumulative count of distinct
// days on which a daily was parked: it only ever goes up. `best` is today's
// best run, replaced when the day changes. There is deliberately no field
// from which "consecutive days" could be worked out — skipping a day must
// never cost the player anything. Nothing here is sent anywhere.

const STORAGE_KEY = 'parking-precision:daily:v1';

const int = (v, min) => (Number.isInteger(v) && v >= min ? v : null);

function clean(raw) {
  const out = { parked: 0, lastDay: null, best: null };
  if (!raw || typeof raw !== 'object') return out;
  out.parked = int(raw.parked, 0) ?? 0;
  out.lastDay = int(raw.lastDay, 1);
  const b = raw.best;
  if (b && typeof b === 'object') {
    const day = int(b.day, 1);
    const score = Number(b.score);
    const stars = Number(b.stars);
    const timeSec = Number(b.timeSec);
    if (day != null && Number.isFinite(score) && Number.isFinite(stars) && Number.isFinite(timeSec)) {
      out.best = {
        day,
        score: Math.min(100, Math.max(0, Math.round(score))),
        stars: Math.min(3, Math.max(0, Math.round(stars))),
        timeSec,
      };
    }
  }
  return out;
}

function read() {
  try {
    return clean(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'));
  } catch {
    return clean(null);
  }
}

function write(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // session only
  }
}

export function createDailyStore() {
  let data = read();
  return {
    get parked() {
      return data.parked;
    },
    /** Today's best run, or null. */
    bestFor(day) {
      return data.best?.day === day ? { ...data.best } : null;
    },
    /**
     * Record a parked daily. Returns { prev, improved } where prev is the
     * best for this day before the run (null on the first park of the day).
     */
    record(day, { score, stars, timeSec }) {
      const prev = data.best?.day === day ? { ...data.best } : null;
      const improved = !prev || score > prev.score;
      data = {
        parked: data.lastDay === day ? data.parked : data.parked + 1,
        lastDay: day,
        best: improved ? { day, score, stars, timeSec } : prev,
      };
      write(data);
      return { prev, improved };
    },
    reset() {
      data = clean(null);
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // nothing to clear
      }
    },
  };
}
