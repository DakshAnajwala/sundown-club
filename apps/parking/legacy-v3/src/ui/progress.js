// Per-level completion progress, persisted locally.
//
// localStorage, not cookies or any server: this is single-player state that
// never needs to leave the machine, and cookies would ship it on every HTTP
// request for no benefit. Same try/catch discipline as ui/settings.js —
// localStorage throws outright (not just returns null) in some privacy
// modes, so every access is guarded and the game stays playable without it.

const STORAGE_KEY = 'parking-precision:progress:v1';

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    // Rebuild rather than trusting the stored shape — a hand-edited or
    // older payload shouldn't be able to feed NaN into a star count.
    const clean = {};
    for (const [id, rec] of Object.entries(parsed)) {
      const stars = Number(rec?.stars);
      const timeSec = Number(rec?.timeSec);
      const bumps = Number(rec?.bumps);
      if (!Number.isFinite(stars)) continue;
      clean[id] = {
        stars: Math.min(3, Math.max(0, Math.round(stars))),
        timeSec: Number.isFinite(timeSec) ? timeSec : null,
        bumps: Number.isFinite(bumps) ? bumps : null,
      };
    }
    return clean;
  } catch {
    return {};
  }
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
    record(levelId, { stars, timeSec, bumps }) {
      const prev = data[levelId];
      const better =
        !prev ||
        stars > prev.stars ||
        (stars === prev.stars && prev.timeSec != null && timeSec < prev.timeSec);
      if (better) {
        data = { ...data, [levelId]: { stars, timeSec, bumps } };
        writeAll(data);
      }
      return { ...data[levelId], improved: better };
    },

    reset() {
      data = {};
      writeAll(data);
    },
  };
}
