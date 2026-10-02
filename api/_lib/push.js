/**
 * Web Push without a library: VAPID (RFC 8292) signing with Node's crypto and
 * payload-less pushes (the service worker writes the words itself, so nothing
 * needs encrypting). Off until the owner sets VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY
 * and VAPID_SUBJECT in the Vercel project (docs/retention/OWNER-TODO.md).
 *
 * The push service is run by the browser's maker (Google, Mozilla, Apple), not
 * by us; the privacy page says so. At most one reminder per player a day.
 */
import { createHash, createPrivateKey, createSign } from 'node:crypto';

const b64u = (b) => Buffer.from(b).toString('base64url');
export const pushConfigured = (env = process.env) => !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT);

/** The JWT a push service wants in the Authorization header. `key` is { pub, priv } base64url, `aud` the endpoint's origin. */
export function vapidJwt(aud, subject, key, now = Date.now()) {
  const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const body = b64u(JSON.stringify({ aud, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject }));
  const pub = Buffer.from(key.pub, 'base64url');   // 0x04 || x || y
  const jwk = { kty: 'EC', crv: 'P-256', x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)), d: key.priv };
  const sig = createSign('SHA256').update(`${head}.${body}`).sign({ key: createPrivateKey({ key: jwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363' });
  return `${head}.${body}.${b64u(sig)}`;
}

export const validEndpoint = (e) => { try { const u = new URL(e); return u.protocol === 'https:' && e.length <= 600; } catch { return false; } };
export const subId = (endpoint) => createHash('sha256').update(endpoint).digest('hex').slice(0, 24);

/** Send one empty push. Returns 'sent' | 'gone' | 'failed'. fetchImpl is injectable for tests. */
export async function sendPush(endpoint, env = process.env, fetchImpl = fetch, now = Date.now()) {
  try {
    const jwt = vapidJwt(new URL(endpoint).origin, env.VAPID_SUBJECT, { pub: env.VAPID_PUBLIC_KEY, priv: env.VAPID_PRIVATE_KEY }, now);
    const r = await fetchImpl(endpoint, { method: 'POST', headers: { TTL: '43200', Urgency: 'low', Authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`, 'Content-Length': '0' } });
    if (r.status === 404 || r.status === 410) return 'gone';
    return r.ok ? 'sent' : 'failed';
  } catch { return 'failed'; }
}

const dayOf = (now) => new Date(now).toISOString().slice(0, 10);

/** Store a subscription (just its endpoint; no keys are needed for empty pushes). */
export async function subscribe(store, player, endpoint) {
  if (!validEndpoint(endpoint)) return { ok: false };
  const id = subId(endpoint);
  await store.run([['HSET', `b:push:${id}`, 'endpoint', endpoint, 'player', player, 'last', ''], ['SADD', 'b:pushset', id]]);
  return { ok: true };
}
export async function unsubscribe(store, endpoint) {
  if (typeof endpoint !== 'string') return { ok: true };
  const id = subId(endpoint);
  await store.run([['DEL', `b:push:${id}`], ['SREM', 'b:pushset', id]]);
  return { ok: true };
}

/** The daily run (cron): one reminder per subscription per UTC day. Returns counts. */
export async function runPush(store, env = process.env, fetchImpl = fetch, now = Date.now()) {
  const [ids] = await store.run([['SMEMBERS', 'b:pushset']]);
  const out = { sent: 0, gone: 0, failed: 0, skipped: 0 };
  for (const id of ids) {
    const [endpoint, last] = await store.run([['HGET', `b:push:${id}`, 'endpoint'], ['HGET', `b:push:${id}`, 'last']]);
    if (!endpoint) { await store.run([['SREM', 'b:pushset', id]]); continue; }
    if (last === dayOf(now)) { out.skipped++; continue; }
    const r = await sendPush(endpoint, env, fetchImpl, now);
    if (r === 'gone') { await store.run([['DEL', `b:push:${id}`], ['SREM', 'b:pushset', id]]); out.gone++; }
    else if (r === 'sent') { await store.run([['HSET', `b:push:${id}`, 'last', dayOf(now)]]); out.sent++; }
    else out.failed++;
  }
  return out;
}
