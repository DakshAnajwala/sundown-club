/**
 * profile.js — the shared Sundown Club profile in localStorage ("hub.v1.profile").
 *
 * Every game writes its own entry under `games[<id>]`; the hub only reads.
 * Shape and level curve: apps/hub/SPEC.md §8.
 *
 *   { xp, streak: { days, last }, games: { <id>: { lastPlayed, timeMs, resume, facts, ledger } } }
 *
 * Every read and write is wrapped: private windows, blocked storage and bad
 * JSON all fall back to an empty profile, and a failed write is ignored.
 */

const KEY = 'hub.v1.profile';

function empty() {
  return { xp: 0, streak: { days: 0, last: null }, games: {} };
}

export function readProfile() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const p = JSON.parse(raw);
    if (!p || typeof p !== 'object') return empty();
    return {
      xp: Number.isFinite(p.xp) ? p.xp : 0,
      streak: p.streak && typeof p.streak === 'object' ? { days: Number(p.streak.days) || 0, last: p.streak.last ?? null } : { days: 0, last: null },
      games: p.games && typeof p.games === 'object' ? p.games : {},
    };
  } catch {
    return empty();
  }
}

function write(p) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage full or blocked: progress for this session only */
  }
}

/** Local calendar day as YYYY-MM-DD. */
function today(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Merge `patch` into games[id], stamp lastPlayed, and count the day towards the streak. */
export function updateGame(id, patch = {}) {
  const p = readProfile();
  const now = new Date();
  p.games[id] = { ...(p.games[id] || {}), ...patch, lastPlayed: now.getTime() };
  const t = today(now);
  if (p.streak.last !== t) {
    const y = new Date(now); y.setDate(y.getDate() - 1);
    p.streak = { days: p.streak.last === today(y) ? p.streak.days + 1 : 1, last: t };
  }
  write(p);
  return p;
}

export function addXp(amount) {
  const p = readProfile();
  p.xp = Math.max(0, p.xp + Math.round(amount));
  write(p);
  return p.xp;
}

/** Level from total XP: going from level L to L+1 costs 250 × L. */
export function levelFor(xp) {
  let level = 1, need = 250, left = xp;
  while (left >= need) { left -= need; level += 1; need = 250 * level; }
  return { level, into: left, next: need };
}

/**
 * Counts play time for one game while its page is visible. Time is added to
 * games[id].timeMs whenever the tab is hidden, the page is left, or flush()
 * is called (e.g. just before leaving to the hub).
 */
export function trackPlaytime(id) {
  let since = document.visibilityState === 'visible' ? performance.now() : null;
  function flush() {
    if (since == null) return;
    const ms = performance.now() - since;
    since = document.visibilityState === 'visible' ? performance.now() : null;
    if (ms < 1000) return;
    const prev = readProfile().games[id]?.timeMs || 0;
    updateGame(id, { timeMs: prev + Math.round(ms) });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
    else since = performance.now();
  });
  addEventListener('pagehide', flush);
  return { flush };
}
