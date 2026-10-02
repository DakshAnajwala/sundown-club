/**
 * profile.js — the shared Sundown Club profile in localStorage ("hub.v1.profile").
 *
 * Every game writes its own entry under `games[<id>]`; the hub reads them and
 * owns the identity (`id`, `handle`). Shape and level curve: apps/hub/SPEC.md §8.
 *
 *   { id, handle, xp, streak: { days, last }, games: { <id>: { lastPlayed, timeMs, resume, facts, ledger } } }
 *
 * The identity is made in this browser on the first visit and never leaves it:
 * another browser or device gets its own.
 *
 * Every read and write is wrapped: private windows, blocked storage and bad
 * JSON all fall back to an empty profile, and a failed write is ignored.
 */

const KEY = 'hub.v1.profile';
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const HANDLE_MAX = 24;

function empty() {
  return { xp: 0, streak: { days: 0, last: null }, games: {} };
}

/** Trim, drop control characters, squash runs of spaces, cap the length. Empty means "no name". */
export function cleanHandle(s) {
  return String(s ?? '').replace(/[\u0000-\u001f\u007f-\u009f]/g, '').replace(/\s+/g, ' ').trim().slice(0, HANDLE_MAX).trim();
}

export function readProfile() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const p = JSON.parse(raw);
    if (!p || typeof p !== 'object') return empty();
    const out = {
      xp: Number.isFinite(p.xp) ? p.xp : 0,
      streak: p.streak && typeof p.streak === 'object' ? { days: Number(p.streak.days) || 0, last: p.streak.last ?? null } : { days: 0, last: null },
      games: p.games && typeof p.games === 'object' ? p.games : {},
    };
    // Keep the identity through every game's read-modify-write.
    if (typeof p.id === 'string' && ID_RE.test(p.id)) out.id = p.id;
    if (typeof p.handle === 'string' && cleanHandle(p.handle)) out.handle = cleanHandle(p.handle);
    return out;
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

// Evening names: an adjective from the sky and a night creature, e.g. "Amber Heron".
const NAME_A = ['Amber', 'Copper', 'Dusky', 'Ember', 'Golden', 'Hazy', 'Indigo', 'Late', 'Low', 'Mellow',
  'Quiet', 'Rosy', 'Russet', 'Saffron', 'Silver', 'Slow', 'Tawny', 'Velvet', 'Violet', 'Warm'];
const NAME_B = ['Badger', 'Curlew', 'Finch', 'Fox', 'Hare', 'Heron', 'Kestrel', 'Lark', 'Lynx', 'Marten',
  'Moth', 'Nightjar', 'Otter', 'Owl', 'Plover', 'Raven', 'Starling', 'Swift', 'Tern', 'Wren'];

function randomBytes(n) {
  const b = new Uint8Array(n);
  if (globalThis.crypto?.getRandomValues) crypto.getRandomValues(b);
  else for (let i = 0; i < n; i++) b[i] = Math.floor(Math.random() * 256);
  return b;
}

/** A version 4 UUID. randomUUID needs a secure context (https or localhost), so fall back to random bytes. */
function newId() {
  if (globalThis.crypto?.randomUUID) {
    try { return crypto.randomUUID(); } catch { /* insecure context */ }
  }
  const b = randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function newHandle() {
  const [a, b] = randomBytes(2);
  return `${NAME_A[a % NAME_A.length]} ${NAME_B[b % NAME_B.length]}`;
}

/**
 * This browser's identity, made on first call: a random id and a random
 * evening name. Returns { id, handle, fresh } where fresh is true the first time.
 * With storage blocked, a new identity is made for each page.
 */
export function ensureIdentity() {
  const p = readProfile();
  if (p.id && p.handle) return { id: p.id, handle: p.handle, fresh: false };
  const fresh = !p.id;
  p.id ||= newId();
  p.handle ||= newHandle();
  write(p);
  return { id: p.id, handle: p.handle, fresh };
}

/** Rename this browser's player. Returns the stored name, or null if `name` is empty after cleaning. */
export function setHandle(name) {
  const handle = cleanHandle(name);
  if (!handle) return null;
  const p = readProfile();
  p.id ||= newId();
  p.handle = handle;
  write(p);
  return handle;
}

/** Local calendar day as YYYY-MM-DD. */
export function today(d = new Date()) {
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
