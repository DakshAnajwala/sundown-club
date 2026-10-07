/**
 * save.js — export and import the whole club save (no account needed).
 *
 *   const text = exportSave(localStorage);        // "SC1.<base64url json>.<checksum>"
 *   const r = parseSave(text);                    // { ok, keys, error }
 *   if (r.ok) importSave(localStorage, r.keys);   // replaces the club's keys
 *
 * Only keys the club owns are exported or imported (PREFIXES), values must be
 * strings, and the whole text is capped, so a pasted code cannot write
 * anything else into this site's storage. The checksum catches typos and
 * truncated pastes; it is not security (the save is the player's own data).
 * No DOM, no network: runs in node for the checks.
 */

export const PREFIXES = ['hub.v', 'club.v1.', 'tut.v1.', 'bj.v1.', 'holdem.v1', 'vp.v1', 'handling-lab:', 'parking-precision:'];
const SKIP = ['hub.v1.tele.session'];
export const MAX_SAVE_BYTES = 2 * 1024 * 1024;
const MAGIC = 'SC1';

export const ownsKey = (k) => typeof k === 'string' && k.length <= 200 && PREFIXES.some((p) => k.startsWith(p)) && !SKIP.includes(k);

function checksum(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

const toB64 = (s) => {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64 = (b) => {
  const bin = atob(b.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

/** Every club key in `storage` (localStorage or anything with length/key/getItem) as one text. */
export function exportSave(storage, now = Date.now()) {
  const keys = {};
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (!ownsKey(k)) continue;
    const v = storage.getItem(k);
    if (typeof v === 'string') keys[k] = v;
  }
  const body = toB64(JSON.stringify({ v: 1, t: now, keys }));
  return `${MAGIC}.${body}.${checksum(body)}`;
}

/** Check a pasted or loaded text. Never throws. */
export function parseSave(text) {
  try {
    const t = String(text ?? '').replace(/\s+/g, '');
    if (t.length > MAX_SAVE_BYTES * 1.4) return { ok: false, error: 'That is too big to be a club save.' };
    const [magic, body, sum, extra] = t.split('.');
    if (magic !== MAGIC || !body || !sum || extra !== undefined) return { ok: false, error: 'That does not look like a club save.' };
    if (checksum(body) !== sum) return { ok: false, error: 'The save is damaged or cut short. Copy it again.' };
    const data = JSON.parse(fromB64(body));
    if (!data || data.v !== 1 || !data.keys || typeof data.keys !== 'object') return { ok: false, error: 'That save is from a different version.' };
    const keys = {};
    let bytes = 0;
    for (const [k, v] of Object.entries(data.keys)) {
      if (!ownsKey(k) || typeof v !== 'string') continue;
      bytes += k.length + v.length;
      if (bytes > MAX_SAVE_BYTES) return { ok: false, error: 'That is too big to be a club save.' };
      keys[k] = v;
    }
    if (!Object.keys(keys).length) return { ok: false, error: 'That save is empty.' };
    return { ok: true, keys, time: Number(data.t) || 0 };
  } catch {
    return { ok: false, error: 'That does not look like a club save.' };
  }
}

/** Replace the club's keys in `storage` with `keys`. Returns how many were written. Other keys are untouched. */
export function importSave(storage, keys) {
  const old = [];
  for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (ownsKey(k)) old.push(k); }
  for (const k of old) storage.removeItem(k);
  let n = 0;
  for (const [k, v] of Object.entries(keys)) if (ownsKey(k)) { storage.setItem(k, v); n++; }
  return n;
}

/** Delete every club key (a fresh start). Returns how many were removed. */
export function resetSave(storage) {
  const old = [];
  for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (ownsKey(k)) old.push(k); }
  for (const k of old) storage.removeItem(k);
  return old.length;
}
