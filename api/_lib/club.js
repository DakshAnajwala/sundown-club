/**
 * Club telemetry core: validation, the commands each batch turns into, and the
 * metrics read-out. Pure functions plus a small store (Upstash REST when
 * configured, memory otherwise). Spec: docs/retention/SPEC-telemetry.md.
 */
import { createHash, timingSafeEqual } from 'node:crypto';

export const GAMES = ['hub', 'blackjack', 'holdem', 'videopoker', 'parking', 'racing'];
export const EVENTS = [
  'session_start', 'session_end', 'game_open', 'game_leave', 'round_end', 'onboarding_step',
  'quest_seen', 'quest_started', 'quest_completed', 'daily_claimed',
  'streak_extended', 'streak_saved', 'streak_broken', 'reward_claimed', 'level_up', 'unlock',
  'share_click', 'invite_open', 'challenge_sent', 'challenge_accepted', 'board_view',
  'install_prompt_shown', 'install_prompt_accepted', 'notif_prompt_shown', 'notif_prompt_accepted',
];
const PROP_KEYS = ['game', 'ref', 'day_index', 'is_new', 'dur', 'games_played', 'result', 'step', 'id', 'tier', 'level', 'kind'];
const REFS = ['direct', 'internal', 'search', 'social', 'other'];
export const BUCKETS = ['0-1', '1-3', '3-10', '10-20', '20-45', '45+'];
export const FUNNEL = ['landing', 'game_open', 'round_end', 'second_game'];
export const TTL = 180 * 24 * 3600;
export const MAX_BODY = 8 * 1024;
export const MAX_BATCH = 20;
export const RATE_PER_MIN = 240;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHORT = /^[\w .:\-]{0,32}$/;

export const dayOf = (ms = Date.now()) => new Date(ms).toISOString().slice(0, 10);
export function addDays(day, n) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function cleanProps(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const k of PROP_KEYS) {
    const v = raw[k];
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.max(-1e6, Math.min(1e6, v));
    else if (typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'string' && SHORT.test(v)) out[k] = v;
  }
  if (out.game !== undefined && !GAMES.includes(out.game)) delete out.game;
  if (out.ref !== undefined && !REFS.includes(out.ref)) delete out.ref;
  return out;
}

/** Returns { player, events } or null when the body is malformed. */
export function validateBatch(body) {
  if (!body || typeof body !== 'object') return null;
  if (typeof body.player !== 'string' || !UUID.test(body.player)) return null;
  if (!Array.isArray(body.events) || body.events.length === 0) return null;
  const events = [];
  for (const e of body.events.slice(0, MAX_BATCH)) {
    if (!e || typeof e.name !== 'string' || !EVENTS.includes(e.name)) continue;
    events.push({ name: e.name, props: cleanProps(e.props) });
  }
  return events.length ? { player: body.player.toLowerCase(), events } : null;
}

export function bucketFor(seconds) {
  const m = seconds / 60;
  if (m < 1) return '0-1';
  if (m < 3) return '1-3';
  if (m < 10) return '3-10';
  if (m < 20) return '10-20';
  if (m < 45) return '20-45';
  return '45+';
}

/** The store commands one validated batch needs (first pipeline). */
export function commandsFor({ player, events }, day) {
  const c = [];
  const keys = new Set();
  const touch = (k) => keys.add(k);
  c.push(['SADD', `t:act:${day}`, player]); touch(`t:act:${day}`);
  c.push(['HSETNX', 't:first', player, day]);
  touch('t:first');
  for (const { name, props } of events) {
    c.push(['HINCRBY', `t:ev:${day}`, name, 1]); touch(`t:ev:${day}`);
    if (props.game) c.push(['HINCRBY', `t:ev:${day}`, `${name}|${props.game}`, 1]);
    if (name === 'session_start') {
      c.push(['SADD', `t:fun:${day}:landing`, player]); touch(`t:fun:${day}:landing`);
    }
    if (name === 'game_open' && props.game) {
      c.push(['SADD', `t:act:${props.game}:${day}`, player]); touch(`t:act:${props.game}:${day}`);
      if (props.game !== 'hub') {
        c.push(['SADD', `t:fun:${day}:game_open`, player]); touch(`t:fun:${day}:game_open`);
        c.push(['SADD', `t:games:${day}:${player}`, props.game]); touch(`t:games:${day}:${player}`);
      }
    }
    if (name === 'round_end') { c.push(['SADD', `t:fun:${day}:round_end`, player]); touch(`t:fun:${day}:round_end`); }
    if (name === 'session_end' && typeof props.dur === 'number' && props.dur >= 0) {
      c.push(['HINCRBY', `t:sess:${day}`, bucketFor(Math.min(props.dur, 6 * 3600)), 1]); touch(`t:sess:${day}`);
    }
  }
  for (const k of keys) c.push(['EXPIRE', k, TTL]);
  return c;
}

/**
 * Second step of a batch: the server decides who is new. HSETNX in the first
 * pipeline fixed the player's first day, so cohort membership and the
 * "second game today" funnel step are read back here (clients cannot claim either).
 */
export async function followUp(store, { player, events }, day) {
  const opened = events.some((e) => e.name === 'game_open' && e.props.game && e.props.game !== 'hub');
  const cmds = [['HGET', 't:first', player]];
  if (opened) cmds.push(['SCARD', `t:games:${day}:${player}`]);
  const [first, games] = await store.run(cmds);
  const out = [];
  if (opened && Number(games) >= 2) out.push(['SADD', `t:fun:${day}:second_game`, player], ['EXPIRE', `t:fun:${day}:second_game`, TTL]);
  if (first === day) out.push(['SADD', `t:cohort:${day}`, player], ['EXPIRE', `t:cohort:${day}`, TTL]);
  if (out.length) await store.run(out);
}

export async function ingest(store, batch, day = dayOf()) {
  await store.run(commandsFor(batch, day));
  await followUp(store, batch, day);
}

/** Per-IP rate limit. The IP is hashed with the day, so it cannot be tied across days; the counter lives 120 s. */
export async function rateLimit(store, ip, count, now = Date.now()) {
  const h = createHash('sha256').update(`${dayOf(now)}|${ip || 'unknown'}`).digest('hex').slice(0, 20);
  const k = `rl:${h}:${Math.floor(now / 60000)}`;
  const [n] = await store.run([['INCRBY', k, count], ['EXPIRE', k, 120]]);
  return Number(n) <= RATE_PER_MIN;
}

function hashObj(flat) {
  const o = {};
  if (Array.isArray(flat)) for (let i = 0; i < flat.length; i += 2) o[flat[i]] = Number(flat[i + 1]);
  return o;
}

/** Everything the metrics page shows, from the store as of `today`. */
export async function metrics(store, today = dayOf()) {
  const days30 = Array.from({ length: 30 }, (_, i) => addDays(today, i - 29));
  const days7 = days30.slice(-7);
  const days14 = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));

  const dauRes = await store.run(days30.map((d) => ['SCARD', `t:act:${d}`]));
  const dau = days30.map((d, i) => ({ day: d, n: Number(dauRes[i]) || 0 }));
  const uniq = async (days) => {
    const tmp = `t:tmp:${days.length}`;
    const r = await store.run([['SUNIONSTORE', tmp, ...days.map((d) => `t:act:${d}`)], ['SCARD', tmp], ['EXPIRE', tmp, 60]]);
    return Number(r[1]) || 0;
  };
  const wau = await uniq(days7);
  const mau = await uniq(days30);

  // Cohorts: size, then SINTERCARD with the active set N days later (only when that day has happened).
  const cq = [];
  for (const c of days14) cq.push(['SCARD', `t:cohort:${c}`]);
  const sizes = await store.run(cq);
  const retQ = [];
  const slots = [];
  days14.forEach((c, i) => {
    for (const n of [1, 7, 30]) {
      const target = addDays(c, n);
      if (target <= today && Number(sizes[i]) > 0) { retQ.push(['SINTERCARD', 2, `t:cohort:${c}`, `t:act:${target}`]); slots.push([i, n]); }
    }
  });
  const retRes = retQ.length ? await store.run(retQ) : [];
  const cohorts = days14.map((c, i) => ({ day: c, size: Number(sizes[i]) || 0, d1: null, d7: null, d30: null }));
  slots.forEach(([i, n], j) => { cohorts[i][`d${n}`] = Number(retRes[j]) || 0; });

  const sessRes = await store.run(days7.map((d) => ['HGETALL', `t:sess:${d}`]));
  const sessions = Object.fromEntries(BUCKETS.map((b) => [b, 0]));
  for (const r of sessRes) for (const [b, n] of Object.entries(hashObj(r))) if (b in sessions) sessions[b] += n;

  const funRes = await store.run(days7.flatMap((d) => FUNNEL.map((s) => ['SCARD', `t:fun:${d}:${s}`])));
  const funnel = Object.fromEntries(FUNNEL.map((s) => [s, 0]));
  funRes.forEach((n, i) => { funnel[FUNNEL[i % FUNNEL.length]] += Number(n) || 0; });

  const gameRes = await store.run(GAMES.flatMap((g) => days7.map((d) => ['SCARD', `t:act:${g}:${d}`])));
  const perGame = GAMES.map((g, gi) => ({ game: g, days: days7.map((_, di) => Number(gameRes[gi * 7 + di]) || 0) }));

  const evRes = await store.run(days7.map((d) => ['HGETALL', `t:ev:${d}`]));
  const events = {};
  for (const r of evRes) for (const [k, n] of Object.entries(hashObj(r))) events[k] = (events[k] || 0) + n;

  return {
    today, dau, wau, mau, stickiness: mau ? Math.round((dau[29].n / mau) * 1000) / 10 : 0,
    cohorts, sessions, funnel, perGame, events,
  };
}

export function passwordOk(given, expected) {
  if (!expected || typeof given !== 'string') return false;
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

// ---------------------------------------------------------------- stores

/** In-memory store speaking the same command set as Upstash. Dev and tests only. */
export function memoryStore() {
  const data = new Map();
  const set = (k) => data.get(k) ?? data.set(k, new Set()).get(k);
  const hash = (k) => data.get(k) ?? data.set(k, new Map()).get(k);
  const zset = (k) => data.get(k) ?? data.set(k, new Map()).get(k);
  const ops = {
    SADD: (k, ...m) => { const s = set(k); let n = 0; for (const x of m) if (!s.has(String(x))) { s.add(String(x)); n++; } return n; },
    SREM: (k, ...m) => { const s = set(k); let n = 0; for (const x of m) n += s.delete(String(x)) ? 1 : 0; return n; },
    SCARD: (k) => (data.get(k)?.size ?? 0),
    SUNIONSTORE: (dst, ...ks) => { const u = new Set(); for (const k of ks) for (const x of data.get(k) ?? []) u.add(x); data.set(dst, u); return u.size; },
    SINTERCARD: (n, ...ks) => { const [a, ...r] = ks.slice(0, Number(n)).map((k) => data.get(k) ?? new Set()); let c = 0; for (const x of a) if (r.every((s) => s.has(x))) c++; return c; },
    HSETNX: (k, f, v) => { const h = hash(k); if (h.has(f)) return 0; h.set(f, String(v)); return 1; },
    HGET: (k, f) => data.get(k)?.get?.(f) ?? null,
    HINCRBY: (k, f, n) => { const h = hash(k); const v = (Number(h.get(f)) || 0) + Number(n); h.set(f, String(v)); return v; },
    HGETALL: (k) => { const h = data.get(k); return h ? [...h].flat() : []; },
    INCR: (k) => { const v = (Number(data.get(k)) || 0) + 1; data.set(k, v); return v; },
    INCRBY: (k, n) => { const v = (Number(data.get(k)) || 0) + Number(n); data.set(k, v); return v; },
    EXPIRE: () => 1,
    DEL: (...ks) => { let n = 0; for (const k of ks) n += data.delete(k) ? 1 : 0; return n; },
    HSET: (k, ...fv) => { const h = hash(k); let n = 0; for (let i = 0; i < fv.length; i += 2) { if (!h.has(String(fv[i]))) n++; h.set(String(fv[i]), String(fv[i + 1])); } return n; },
    HDEL: (k, ...fs) => { const h = data.get(k); let n = 0; if (h) for (const f of fs) n += h.delete(String(f)) ? 1 : 0; return n; },
    GET: (k) => { const v = data.get(k); return v == null ? null : String(v); },
    SET: (k, v) => { data.set(k, String(v)); return 'OK'; },
    ZADD: (k, ...a) => {
      let mode = null;
      while (['NX', 'XX', 'GT', 'LT'].includes(String(a[0]).toUpperCase())) mode = String(a.shift()).toUpperCase();
      const z = zset(k); let n = 0;
      for (let i = 0; i < a.length; i += 2) {
        const score = Number(a[i]), m = String(a[i + 1]), cur = z.get(m);
        if (cur === undefined) { if (mode !== 'XX') { z.set(m, score); n++; } }
        else if (mode === 'NX') continue;
        else if (mode === 'GT' && !(score > cur)) continue;
        else if (mode === 'LT' && !(score < cur)) continue;
        else z.set(m, score);
      }
      return n;
    },
    ZINCRBY: (k, inc, m) => { const z = zset(k); const v = (z.get(String(m)) ?? 0) + Number(inc); z.set(String(m), v); return String(v); },
    ZSCORE: (k, m) => { const v = data.get(k)?.get?.(String(m)); return v === undefined ? null : String(v); },
    ZCARD: (k) => (data.get(k)?.size ?? 0),
    ZREM: (k, ...ms) => { const z = data.get(k); let n = 0; if (z) for (const m of ms) n += z.delete(String(m)) ? 1 : 0; return n; },
    ZCOUNT: (k, min, max) => {
      const z = data.get(k); if (!z) return 0;
      const lim = (x, dflt) => { x = String(x); if (x === '-inf') return [-Infinity, false]; if (x === '+inf' || x === 'inf') return [Infinity, false]; return x.startsWith('(') ? [Number(x.slice(1)), true] : [Number(x), false]; };
      const [lo, loEx] = lim(min), [hi, hiEx] = lim(max);
      let n = 0; for (const v of z.values()) if ((loEx ? v > lo : v >= lo) && (hiEx ? v < hi : v <= hi)) n++;
      return n;
    },
    ZREVRANGE: (k, start, stop, withScores) => {
      const z = data.get(k); if (!z) return [];
      const all = [...z].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? 1 : -1));
      const lo = Number(start), hi = Number(stop) < 0 ? all.length + Number(stop) : Number(stop);
      const part = all.slice(lo, hi + 1);
      return String(withScores || '').toUpperCase() === 'WITHSCORES' ? part.flatMap(([m, v]) => [m, String(v)]) : part.map(([m]) => m);
    },
  };
  return {
    kind: 'memory',
    async run(cmds) { return cmds.map(([op, ...a]) => { if (!ops[op]) throw new Error(`memory store: ${op}`); return ops[op](...a); }); },
    data,
  };
}

/** Upstash REST pipeline. Reads KV_REST_API_URL / KV_REST_API_TOKEN (never printed). */
export function upstashStore(url, token, fetchImpl = fetch) {
  return {
    kind: 'upstash',
    async run(cmds) {
      if (!cmds.length) return [];
      const r = await fetchImpl(`${url.replace(/\/$/, '')}/pipeline`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(cmds.map((c) => c.map(String))),
      });
      if (!r.ok) throw new Error(`store ${r.status}`);
      const out = await r.json();
      return out.map((x) => { if (x.error) throw new Error(x.error); return x.result; });
    },
  };
}

let shared;
export function getStore(env = process.env) {
  if (shared) return shared;
  shared = env.KV_REST_API_URL && env.KV_REST_API_TOKEN ? upstashStore(env.KV_REST_API_URL, env.KV_REST_API_TOKEN) : memoryStore();
  return shared;
}
export function setStore(s) { shared = s; }

export async function readBody(req, max = MAX_BODY) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  let raw = typeof req.body === 'string' ? req.body : '';
  if (!raw) {
    const chunks = [];
    let size = 0;
    for await (const ch of req) {
      size += ch.length;
      if (size > max) throw new Error('too large');
      chunks.push(ch);
    }
    raw = Buffer.concat(chunks).toString('utf8');
  }
  if (raw.length > max) throw new Error('too large');
  return JSON.parse(raw);
}
