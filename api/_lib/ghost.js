/**
 * Shared Parking ghosts: one run's driving trace (the same compact format as
 * apps/parking/src/game/Ghost.js: int16 x4 per sample, base64) stored under a
 * short random id so a friend can race it from a link. No name, no account;
 * the trace and the level id, the sender's made-up board name, 30 days.
 */
import { randomBytes } from 'node:crypto';

export const GHOST_TTL = 30 * 86400;
export const GHOST_MAX_CHARS = 30_000;
export const GHOSTS_PER_DAY = 10;
const HZ = [10, 20];

/** Decode and sanity-check a trace. Returns an Int16Array or null. */
export function checkTrace(level, hz, d) {
  if (!Number.isInteger(level) || level < 1 || level > 99 || !HZ.includes(hz)) return null;
  if (typeof d !== 'string' || d.length < 40 || d.length > GHOST_MAX_CHARS || !/^[A-Za-z0-9+/]+={0,2}$/.test(d)) return null;
  const bytes = Buffer.from(d, 'base64');
  if (bytes.length % 8 !== 0 || bytes.length < 8 * 8) return null;   // whole samples, at least eight
  const v = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.length / 2);
  for (let i = 0; i < v.length; i += 4) {
    if (Math.abs(v[i]) > 20000 || Math.abs(v[i + 1]) > 20000 || Math.abs(v[i + 2]) > 5000 || Math.abs(v[i + 3]) > 1800) return null;   // cm, cm, cm, 0.1 degrees
  }
  return v;
}

export async function putGhost(store, player, name, { level, hz, d }, now = Date.now()) {
  if (!checkTrace(level, hz, d)) return { ok: false, error: 'bad ghost' };
  const day = new Date(now).toISOString().slice(0, 10);
  const lim = `b:gp:${player}:${day}`;
  const [n] = await store.run([['INCR', lim], ['EXPIRE', lim, 2 * 86400]]);
  if (Number(n) > GHOSTS_PER_DAY) return { ok: false, error: 'too many' };
  for (let i = 0; i < 10; i++) {
    const id = randomBytes(6).toString('base64url').replace(/[-_]/g, 'x').slice(0, 8);
    const [had] = await store.run([['GET', `b:ghost:${id}`]]);
    if (had) continue;
    await store.run([['SET', `b:ghost:${id}`, JSON.stringify({ level, hz, d, n: String(name).slice(0, 40) })], ['EXPIRE', `b:ghost:${id}`, GHOST_TTL]]);
    return { ok: true, id };
  }
  return { ok: false, error: 'busy' };
}

export async function getGhost(store, id) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9]{8}$/.test(id)) return null;
  const [raw] = await store.run([['GET', `b:ghost:${id}`]]);
  if (!raw) return null;
  try {
    const g = JSON.parse(raw);
    return checkTrace(g.level, g.hz, g.d) ? { level: g.level, hz: g.hz, d: g.d, name: g.n || 'A friend' } : null;
  } catch { return null; }
}
