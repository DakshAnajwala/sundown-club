/**
 * Signed challenge links: "I got Two pair on this deal, beat it". The code
 * carries the seeded deal, the sender's result and the sender's made-up board
 * name, and an HMAC so the numbers cannot be edited into a fake record.
 *   C1.<base64url json>.<first 16 hex of HMAC-SHA256>
 * Needs CLUB_SECRET in production (the owner sets it; never read from .env here).
 * Without it, production signs nothing; development uses a fixed, public secret.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const GAMES = ['videopoker'];
const LABEL = /^[A-Za-z0-9 '.\-]{1,24}$/;
const DEV_SECRET = 'sundown-dev-secret-not-for-production';

const secret = () => process.env.CLUB_SECRET || (process.env.NODE_ENV === 'production' ? null : DEV_SECRET);
const mac = (body, key) => createHmac('sha256', key).update(body).digest('hex').slice(0, 16);
const b64 = (s) => Buffer.from(s).toString('base64url');

/** data: { g, s (seed), v (result number), l (result label) }. Returns { code } or { error }. */
export function signChallenge(data, name, now = Date.now()) {
  const key = secret();
  if (!key) return { error: 'not configured' };
  const d = data || {};
  if (!GAMES.includes(d.g) || !Number.isInteger(d.s) || d.s < 0 || d.s > 4294967295 || !Number.isInteger(d.v) || d.v < 0 || d.v > 100000 || typeof d.l !== 'string' || !LABEL.test(d.l)) return { error: 'bad data' };
  const body = b64(JSON.stringify({ g: d.g, s: d.s, v: d.v, l: d.l, n: String(name).slice(0, 40), t: Math.floor(now / 86400000) }));
  return { code: `C1.${body}.${mac(body, key)}` };
}

/** { ok: true, data } for a code this server signed, else { ok: false }. */
export function verifyChallenge(code) {
  try {
    const key = secret();
    if (!key || typeof code !== 'string' || code.length > 600) return { ok: false };
    const [magic, body, sig, extra] = code.split('.');
    if (magic !== 'C1' || !body || !sig || extra !== undefined) return { ok: false };
    const want = Buffer.from(mac(body, key)), got = Buffer.from(sig);
    if (want.length !== got.length || !timingSafeEqual(want, got)) return { ok: false };
    const d = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!GAMES.includes(d.g) || !Number.isInteger(d.s) || !Number.isInteger(d.v) || typeof d.l !== 'string' || !LABEL.test(d.l)) return { ok: false };
    return { ok: true, data: { g: d.g, s: d.s, v: d.v, l: d.l, n: String(d.n || ''), t: d.t } };
  } catch { return { ok: false }; }
}
