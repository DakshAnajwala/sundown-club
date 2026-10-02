/**
 * profile.js — the shared Sundown Club profile in localStorage ("hub.v2.profile").
 *
 * Every game writes its own entry under `games[<id>]`; the hub reads them and
 * owns the identity (`id`, `handle`). Shape, level curve, migration:
 * apps/hub/SPEC.md §8 and docs/retention/SPEC-profile-v2.md.
 *
 *   { v: 2, id, handle, xp, title, badges: [id x3], tokens,
 *     streak: { days, last, best },
 *     inv: { owned: [id], equipped: { <slot>: id } }, found: { <id>: time },
 *     games: { <id>: { lastPlayed, timeMs, resume, facts, ledger } } }
 *
 * "hub.v1.profile" (the old shape) is read once and copied forward; the old
 * key is left untouched as a backup. Unknown top-level keys written by newer
 * code survive a read-modify-write.
 *
 * The identity is made in this browser on the first visit and never leaves it:
 * another browser or device gets its own.
 *
 * Every read and write is wrapped: private windows, blocked storage and bad
 * JSON all fall back to an empty profile, and a failed write is ignored.
 */

export const KEY = 'hub.v2.profile';
export const OLD_KEY = 'hub.v1.profile';
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ITEM_RE = /^[a-z0-9][a-z0-9._-]{0,47}$/;
export const HANDLE_MAX = 24;
export const MAX_LEVEL = 100;
export const MAX_BADGES = 3;
export const MAX_TOKENS = 99;

function empty() {
  return { v: 2, xp: 0, tokens: 0, badges: [], inv: { owned: [], equipped: {} }, found: {}, streak: { days: 0, last: null, best: 0 }, games: {} };
}

const num = (x, d = 0) => (Number.isFinite(x) ? x : d);
const SLOT_RE = /^[a-zA-Z][a-zA-Z0-9_-]{0,23}$/;
const slotId = (x) => (typeof x === 'string' && SLOT_RE.test(x) ? x : null);
const itemId = (x) => (typeof x === 'string' && ITEM_RE.test(x) ? x : null);

/** Trim, drop control characters, squash runs of spaces, cap the length. Empty means "no name". */
export function cleanHandle(s) {
  return String(s ?? '').replace(/[\u0000-\u001f\u007f-\u009f]/g, '').replace(/\s+/g, ' ').trim().slice(0, HANDLE_MAX).trim();
}

/** Turn anything found in storage (v1, v2 or junk) into a valid v2 profile. Never throws. */
export function normalize(p) {
  const out = empty();
  if (!p || typeof p !== 'object') return out;
  // Carry over keys newer code may have added; known keys are rebuilt below.
  for (const k of Object.keys(p)) if (!(k in out) && k !== 'id' && k !== 'handle' && k !== 'title' && k !== 'createdAt') out[k] = p[k];
  out.xp = Math.max(0, num(p.xp));
  out.tokens = Math.min(MAX_TOKENS, Math.max(0, Math.round(num(p.tokens))));
  const st = p.streak && typeof p.streak === 'object' ? p.streak : {};
  const days = Math.max(0, num(Number(st.days)));
  out.streak = { days, last: typeof st.last === 'string' ? st.last : null, best: Math.max(days, num(Number(st.best))) };
  out.games = p.games && typeof p.games === 'object' && !Array.isArray(p.games) ? p.games : {};
  out.badges = (Array.isArray(p.badges) ? p.badges : []).map(itemId).filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).slice(0, MAX_BADGES);
  const inv = p.inv && typeof p.inv === 'object' ? p.inv : {};
  out.inv.owned = (Array.isArray(inv.owned) ? inv.owned : []).map(itemId).filter(Boolean).filter((x, i, a) => a.indexOf(x) === i);
  if (inv.equipped && typeof inv.equipped === 'object') for (const [slot, id] of Object.entries(inv.equipped)) if (slotId(slot) && itemId(id)) out.inv.equipped[slot] = id;
  if (p.found && typeof p.found === 'object') for (const [id, t] of Object.entries(p.found)) if (itemId(id)) out.found[id] = num(t, 0);
  if (typeof p.id === 'string' && ID_RE.test(p.id)) out.id = p.id;
  if (typeof p.handle === 'string' && cleanHandle(p.handle)) out.handle = cleanHandle(p.handle);
  if (typeof p.createdAt === 'number') out.createdAt = p.createdAt;
  if (typeof p.title === 'string' && itemId(p.title)) out.title = p.title;
  return out;
}

export function readProfile() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalize(JSON.parse(raw));
    // First run on v2: copy the old profile forward (the v1 key stays as a backup).
    const old = localStorage.getItem(OLD_KEY);
    if (old) {
      const p = normalize(JSON.parse(old));
      write(p);
      return p;
    }
    return empty();
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
  p.createdAt ||= Date.now();
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
    const days = p.streak.last === today(y) ? p.streak.days + 1 : 1;
    p.streak = { days, last: t, best: Math.max(p.streak.best || 0, days) };
  }
  write(p);
  return p;
}

export function addXp(amount) {
  return grantXp(amount).xp;
}

/** XP needed to go from level L to L+1. Level 1 to 2 costs 250 (as before); level 99 to 100 costs 5,150. */
export function xpToNext(level) {
  return 200 + 50 * level;
}

/** Level from total XP, capped at MAX_LEVEL. `into`/`next` are progress inside the level (next = 0 at the cap). */
export function levelFor(xp) {
  let level = 1, left = Math.max(0, xp);
  while (level < MAX_LEVEL && left >= xpToNext(level)) { left -= xpToNext(level); level += 1; }
  return level >= MAX_LEVEL ? { level: MAX_LEVEL, into: left, next: 0 } : { level, into: left, next: xpToNext(level) };
}

const TITLES = [[1, 'Newcomer'], [5, 'Regular'], [10, 'Night Owl'], [20, 'Insider'], [30, 'Fixture'], [45, 'Old Hand'], [60, 'Club Legend'], [100, 'Keeper of the Lamp']];
/** The title a level earns: the highest tier at or below it. */
export function titleFor(level) {
  let t = TITLES[0][1];
  for (const [l, name] of TITLES) if (level >= l) t = name;
  return t;
}

/** Add (or remove) XP. Returns { xp, level, from, leveled } so callers can celebrate a level-up. */
export function grantXp(amount) {
  const p = readProfile();
  const from = levelFor(p.xp).level;
  p.xp = Math.max(0, p.xp + Math.round(num(amount)));
  write(p);
  const level = levelFor(p.xp).level;
  return { xp: p.xp, level, from, leveled: level > from };
}

/** Evening Tokens: clamp to 0..MAX_TOKENS. Returns the new balance. */
export function addTokens(amount) {
  const p = readProfile();
  p.tokens = Math.min(MAX_TOKENS, Math.max(0, p.tokens + Math.round(num(amount))));
  write(p);
  return p.tokens;
}

/** Give the player a cosmetic or badge and log it in the collection. Returns true when it is new. */
export function grantItem(id) {
  if (!itemId(id)) return false;
  const p = readProfile();
  if (p.inv.owned.includes(id)) return false;
  p.inv.owned.push(id);
  p.found[id] = Date.now();
  write(p);
  return true;
}

/** Put an owned item in a slot (e.g. slot 'cardBack'). Passing null clears the slot. Returns the equipped map. */
export function equip(slot, id) {
  if (!slotId(slot)) return null;
  const p = readProfile();
  if (id == null) delete p.inv.equipped[slot];
  else if (itemId(id) && p.inv.owned.includes(id)) p.inv.equipped[slot] = id;
  write(p);
  return p.inv.equipped;
}

/** Pick up to three owned badges to show. Unknown or unowned ids are dropped. */
export function setBadges(ids) {
  const p = readProfile();
  p.badges = (Array.isArray(ids) ? ids : []).filter((x, i, a) => itemId(x) && p.inv.owned.includes(x) && a.indexOf(x) === i).slice(0, MAX_BADGES);
  write(p);
  return p.badges;
}

/** Mark a collection entry as seen (for achievements that are not items). */
export function markFound(id) {
  if (!itemId(id)) return false;
  const p = readProfile();
  if (id in p.found) return false;
  p.found[id] = Date.now();
  write(p);
  return true;
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
