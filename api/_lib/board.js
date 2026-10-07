/**
 * The club boards: server-measured play time, generated names, honest
 * client-reported boards with sanity limits. Pure functions over a store
 * (see club.js memoryStore / upstashStore). Spec: apps/hub/SPEC-leaderboard.md.
 *
 * Keys (all prefixed b:, expire where noted):
 *   b:p:<id>        hash  name, salt, rolls, rollday, sday, sdays, sbest
 *   b:names         hash  name -> id (a name is held by one player)
 *   b:pg:<id>       hash  game -> credited seconds
 *   b:s:<token>     hash  player, game, last, total           (7 h)
 *   b:day:<utcday>  hash  id -> credited seconds that day     (3 days)
 *   b:time:w:<mon>  zset  id -> seconds this week             (60 days)
 *   b:time:all      zset  id -> seconds
 *   b:bj            zset  id -> peak chips
 *   b:pk            zset  id -> stars * 1000 + best park
 *   b:streak        zset  id -> best run of UTC days with 5+ minutes
 *   b:bt:w:<mon>    zset  id -> best final stack in the Daily Blackjack tournament this week (60 days)
 */
import { createHash, randomBytes } from 'node:crypto';
import { hash32 } from '../../packages/shared/daily.js';
import { boardNameFor } from '../../packages/shared/names.js';

export const GAMES = ['blackjack', 'holdem', 'videopoker', 'parking', 'racing'];
export const BEAT_MAX_S = 75;
export const BEAT_MIN_GAP_S = 30;
export const SESSION_MAX_S = 6 * 3600;
export const DAY_MAX_S = 16 * 3600;
export const STREAK_DAY_S = 300;
export const BJ_MAX = 10_000_000;
export const TOUR_MAX = 21_000;   // 1,000 start + 20 hands of at most 1,000 won each (a doubled 500 bet)
export const STARS_MAX = 51;
export const ROLLS_PER_DAY = 3;
export const LIMITS = { submit: [12, 600], beat: [90, 600], session: [30, 600], name: [10, 600], read: [240, 60], club: [20, 600], invite: [20, 600] };
export const CLUB_MAX = 50;
export const INVITES_PER_MONTH = 5;
export const ONLINE_MS = 120000;
export const ONLINE_SHOW_MIN = 3;
const DAY_MS = 86400000;
const WEEK_TTL = 60 * 86400;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const validPlayer = (p) => typeof p === 'string' && UUID.test(p);
const utcDay = (now) => new Date(now).toISOString().slice(0, 10);
export function weekKey(now) {   // Monday (UTC) of the week
  const d = new Date(Math.floor(now / DAY_MS) * DAY_MS);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
const yesterday = (now) => utcDay(now - DAY_MS);

/** Per-IP, per-kind limit. The IP is hashed with the day and the counter expires with its window. */
export async function limit(store, ip, kind, now = Date.now()) {
  const [max, win] = LIMITS[kind];
  const h = createHash('sha256').update(`${utcDay(now)}|${ip || 'unknown'}`).digest('hex').slice(0, 20);
  const k = `rl:${kind}:${h}:${Math.floor(now / 1000 / win)}`;
  const [n] = await store.run([['INCR', k], ['EXPIRE', k, win * 2]]);
  return Number(n) <= max;
}

// ------------------------------------------------------------------ names
/** The player's board name; made from the id the first time (never typed). */
export async function nameOf(store, player) {
  const [have] = await store.run([['HGET', `b:p:${player}`, 'name']]);
  if (have) return have;
  for (let salt = 0; salt < 30; salt++) {
    const name = boardNameFor(hash32(`${player}:${salt}`));
    const [got] = await store.run([['HSETNX', 'b:names', name, player]]);
    if (Number(got) === 1) { await store.run([['HSET', `b:p:${player}`, 'name', name, 'salt', salt]]); return name; }
  }
  const name = `Guest ${player.slice(0, 4)}`;
  await store.run([['HSET', `b:p:${player}`, 'name', name]]);
  return name;
}

/** Roll another name, at most ROLLS_PER_DAY a UTC day. Returns { ok, name, left }. */
export async function reroll(store, player, now = Date.now()) {
  const day = utcDay(now);
  const [name, salt, rolls, rollday] = await store.run([['HGET', `b:p:${player}`, 'name'], ['HGET', `b:p:${player}`, 'salt'], ['HGET', `b:p:${player}`, 'rolls'], ['HGET', `b:p:${player}`, 'rollday']]);
  if (!name) { const n = await nameOf(store, player); return { ok: true, name: n, left: ROLLS_PER_DAY }; }
  const used = rollday === day ? Number(rolls) || 0 : 0;
  if (used >= ROLLS_PER_DAY) return { ok: false, name, left: 0 };
  let next = (Number(salt) || 0) + 1;
  for (let i = 0; i < 30; i++, next++) {
    const cand = boardNameFor(hash32(`${player}:${next}`));
    const [got] = await store.run([['HSETNX', 'b:names', cand, player]]);
    if (Number(got) === 1) {
      await store.run([['HDEL', 'b:names', name], ['HSET', `b:p:${player}`, 'name', cand, 'salt', next, 'rolls', used + 1, 'rollday', day]]);
      return { ok: true, name: cand, left: ROLLS_PER_DAY - used - 1 };
    }
  }
  return { ok: false, name, left: ROLLS_PER_DAY - used };
}

// ------------------------------------------------------------------ play time
export async function startSession(store, player, game, now = Date.now()) {
  if (!GAMES.includes(game) && game !== 'hub') return null;
  const token = randomBytes(16).toString('hex');
  const name = await nameOf(store, player);
  await store.run([['HSET', `b:s:${token}`, 'player', player, 'game', game, 'last', now, 'total', 0], ['EXPIRE', `b:s:${token}`, SESSION_MAX_S + 900]]);
  return { token, name };
}

/** Credit one heartbeat. Returns { credited } seconds (0 when ignored). */
export async function beat(store, token, now = Date.now()) {
  if (typeof token !== 'string' || !/^[0-9a-f]{32}$/.test(token)) return { credited: 0 };
  const [player, game, last, total] = await store.run([['HGET', `b:s:${token}`, 'player'], ['HGET', `b:s:${token}`, 'game'], ['HGET', `b:s:${token}`, 'last'], ['HGET', `b:s:${token}`, 'total']]);
  if (!player) return { credited: 0 };
  const gap = (now - Number(last)) / 1000;
  if (!(gap >= BEAT_MIN_GAP_S)) return { credited: 0 };            // too soon (or a clock that went backwards): ignored, nothing moves
  let credit = Math.min(gap, BEAT_MAX_S);
  credit = Math.min(credit, SESSION_MAX_S - Number(total));
  const day = utcDay(now);
  const [dayNow] = await store.run([['HGET', `b:day:${day}`, player]]);
  credit = Math.min(credit, DAY_MAX_S - (Number(dayNow) || 0));
  await store.run([['HSET', `b:s:${token}`, 'last', now]]);          // the clock moves even when nothing is credited
  if (!(credit >= 1)) return { credited: 0 };
  credit = Math.floor(credit);
  const wk = `b:time:w:${weekKey(now)}`;
  const [dayTotal] = await store.run([
    ['HINCRBY', `b:day:${day}`, player, credit], ['EXPIRE', `b:day:${day}`, 3 * 86400],
    ['HINCRBY', `b:s:${token}`, 'total', credit],
    ['ZINCRBY', wk, credit, player], ['EXPIRE', wk, WEEK_TTL], ['ZINCRBY', 'b:time:all', credit, player],
    ['HINCRBY', `b:pg:${player}`, game, credit],
    ['ZADD', 'b:now', now, player], ['EXPIRE', 'b:now', 86400],
  ]);
  if (Number(dayTotal) >= STREAK_DAY_S && Number(dayTotal) - credit < STREAK_DAY_S) await bumpStreak(store, player, now);
  return { credited: credit };
}

async function bumpStreak(store, player, now) {
  const day = utcDay(now);
  const [sday, sdays, sbest] = await store.run([['HGET', `b:p:${player}`, 'sday'], ['HGET', `b:p:${player}`, 'sdays'], ['HGET', `b:p:${player}`, 'sbest']]);
  if (sday === day) return;
  const days = sday === yesterday(now) ? (Number(sdays) || 0) + 1 : 1;
  const best = Math.max(days, Number(sbest) || 0);
  await store.run([['HSET', `b:p:${player}`, 'sday', day, 'sdays', days, 'sbest', best], ['ZADD', 'b:streak', 'GT', best, player]]);
}

// ------------------------------------------------------------------ client-reported boards (unverified, so only sanity)
/** data: bj { peak }, pk { stars, best }. Returns { ok, status? } (422 = impossible numbers). */
export async function submit(store, player, board, data, now = Date.now()) {
  const int = (x, lo, hi) => (Number.isInteger(x) && x >= lo && x <= hi ? x : null);
  if (board === 'bj') {
    const peak = int(data?.peak, 0, BJ_MAX);
    if (peak === null) return { ok: false, status: 422 };
    const [secs] = await store.run([['HGET', `b:pg:${player}`, 'blackjack']]);
    if (peak > 1000 + (Number(secs) || 0) * 400) return { ok: false, status: 422 };   // chips cannot grow faster than the time played allows
    await nameOf(store, player);
    await store.run([['ZADD', 'b:bj', 'GT', peak, player]]);
    return { ok: true };
  }
  if (board === 'bt') {
    const stack = int(data?.stack, 0, TOUR_MAX);
    if (stack === null) return { ok: false, status: 422 };
    const [secs] = await store.run([['HGET', `b:pg:${player}`, 'blackjack']]);
    if ((Number(secs) || 0) < 90) return { ok: false, status: 422 };   // twenty hands take more than a minute and a half of play
    await nameOf(store, player);
    const key = `b:bt:w:${weekKey(now)}`;
    await store.run([['ZADD', key, 'GT', stack, player], ['EXPIRE', key, WEEK_TTL]]);
    return { ok: true };
  }
  if (board === 'pk') {
    const stars = int(data?.stars, 0, STARS_MAX), best = int(data?.best, 0, 100);
    if (stars === null || best === null) return { ok: false, status: 422 };
    const [secs] = await store.run([['HGET', `b:pg:${player}`, 'parking']]);
    if (stars > Math.floor((Number(secs) || 0) / 20)) return { ok: false, status: 422 };   // a star takes at least 20 s of play
    if (stars === 0) return { ok: true };
    await nameOf(store, player);
    await store.run([['ZADD', 'b:pk', 'GT', stars * 1000 + best, player]]);
    return { ok: true };
  }
  return { ok: false, status: 400 };
}

// ------------------------------------------------------------------ reading
export function boardKey(tab, win, now) {
  if (tab === 'time') return win === 'all' ? 'b:time:all' : `b:time:w:${weekKey(now)}`;
  if (tab === 'bj') return 'b:bj';
  if (tab === 'tour') return `b:bt:w:${weekKey(now)}`;
  if (tab === 'pk') return 'b:pk';
  if (tab === 'streak') return 'b:streak';
  return null;
}

const decode = (tab, score) => (tab === 'pk' ? { value: Math.floor(score / 1000), extra: score % 1000 } : { value: score });

/** Top 10 plus the player's own place. Ties share a rank. */
export async function readBoard(store, { tab, win = 'week', player = null }, now = Date.now()) {
  const key = boardKey(tab, win, now);
  if (!key) return null;
  const [flat, total] = await store.run([['ZREVRANGE', key, 0, 9, 'WITHSCORES'], ['ZCARD', key]]);
  const top = [];
  for (let i = 0; i < flat.length; i += 2) top.push({ id: flat[i], score: Number(flat[i + 1]) });
  const ids = [...top.map((t) => t.id)];
  const mine = validPlayer(player) ? player.toLowerCase() : null;
  const [myScore] = mine ? await store.run([['ZSCORE', key, mine]]) : [null];
  if (mine && myScore != null && !ids.includes(mine)) ids.push(mine);
  const scoreOf = (id) => (top.find((t) => t.id === id)?.score ?? Number(myScore));
  const cmds = ids.flatMap((id) => [['ZCOUNT', key, `(${scoreOf(id)}`, '+inf'], ['HGET', `b:p:${id}`, 'name'], ['HGETALL', `b:pg:${id}`]]);
  const res = cmds.length ? await store.run(cmds) : [];
  const rows = ids.map((id, i) => {
    const pg = res[i * 3 + 2], games = [];
    if (Array.isArray(pg)) for (let k = 0; k < pg.length; k += 2) if (Number(pg[k + 1]) > 0 && GAMES.includes(pg[k])) games.push(pg[k]);
    return { id, rank: Number(res[i * 3]) + 1, name: res[i * 3 + 1] || 'Someone', games, you: id === mine, ...decode(tab, scoreOf(id)) };
  });
  const strip = (r) => { const { id, ...rest } = r; return rest; };
  const topRows = rows.slice(0, top.length).map(strip);
  const you = mine && myScore != null ? strip(rows.find((r) => r.id === mine)) : null;
  return { tab, win, total: Number(total), rows: topRows, you, online: await onlineCount(store, now) };
}

/** "Show me on the boards" off: take the player off every board and free the name. */
export async function leave(store, player, now = Date.now()) {
  const [name] = await store.run([['HGET', `b:p:${player}`, 'name']]);
  const cmds = [['ZREM', 'b:time:all', player], ['ZREM', 'b:bj', player], ['ZREM', 'b:pk', player], ['ZREM', 'b:streak', player]];
  for (let w = 0; w < 9; w++) cmds.push(['ZREM', `b:time:w:${weekKey(now - w * 7 * DAY_MS)}`, player], ['ZREM', `b:bt:w:${weekKey(now - w * 7 * DAY_MS)}`, player]);
  if (name) cmds.push(['HDEL', 'b:names', name]);
  const club = await clubOf(store, player);
  if (club) cmds.push(['SREM', `b:club:${club}`, player]);
  cmds.push(['ZREM', 'b:now', player], ['DEL', `b:p:${player}`], ['DEL', `b:pg:${player}`]);
  await store.run(cmds);
  return { ok: true };
}

// ------------------------------------------------------------------ who is here now
/** Players with a counted heartbeat in the last two minutes, or null below ONLINE_SHOW_MIN (an empty room does not advertise itself). */
export async function onlineCount(store, now = Date.now()) {
  const [n] = await store.run([['ZCOUNT', 'b:now', now - ONLINE_MS, '+inf']]);
  return Number(n) >= ONLINE_SHOW_MIN ? Number(n) : null;
}

// ------------------------------------------------------------------ friends: a private board by code
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';   // no 0/O/1/I/L
const randomCode = (len, alphabet) => { const b = randomBytes(len); return [...b].map((x) => alphabet[x % alphabet.length]).join(''); };
export const validClubCode = (c) => typeof c === 'string' && /^[2-9A-HJKMNP-Z]{6}$/.test(c);

export async function clubOf(store, player) {
  const [code] = await store.run([['HGET', `b:p:${player}`, 'club']]);
  return code || null;
}
/** Make a club (or return the one the player is in). The code is six characters to share. */
export async function clubCreate(store, player) {
  const have = await clubOf(store, player);
  if (have) return { ok: true, code: have };
  await nameOf(store, player);
  for (let i = 0; i < 20; i++) {
    const code = randomCode(6, CODE_ALPHABET);
    const [got] = await store.run([['HSETNX', 'b:clubs', code, player]]);
    if (Number(got) === 1) { await store.run([['SADD', `b:club:${code}`, player], ['HSET', `b:p:${player}`, 'club', code]]); return { ok: true, code }; }
  }
  return { ok: false, error: 'busy' };
}
export async function clubJoin(store, player, code) {
  code = String(code || '').toUpperCase().replace(/\s+/g, '');
  if (!validClubCode(code)) return { ok: false, error: 'code' };
  const [exists, size] = await store.run([['HGET', 'b:clubs', code], ['SCARD', `b:club:${code}`]]);
  if (!exists) return { ok: false, error: 'unknown' };
  const have = await clubOf(store, player);
  if (have === code) return { ok: true, code };
  if (Number(size) >= CLUB_MAX) return { ok: false, error: 'full' };
  await nameOf(store, player);
  if (have) await store.run([['SREM', `b:club:${have}`, player]]);
  await store.run([['SADD', `b:club:${code}`, player], ['HSET', `b:p:${player}`, 'club', code]]);
  return { ok: true, code };
}
export async function clubLeave(store, player) {
  const have = await clubOf(store, player);
  if (have) await store.run([['SREM', `b:club:${have}`, player], ['HDEL', `b:p:${player}`, 'club']]);
  return { ok: true };
}
/** The friends board: same shape as readBoard (play time), among club members only. */
export async function readClub(store, player, win = 'week', now = Date.now()) {
  const code = player && validPlayer(player) ? await clubOf(store, player.toLowerCase()) : null;
  if (!code) return { tab: 'friends', win, code: null, rows: [], you: null, total: 0, online: await onlineCount(store, now) };
  const me = player.toLowerCase();
  const [members] = await store.run([['SMEMBERS', `b:club:${code}`]]);
  const key = boardKey('time', win, now);
  const res = members.length ? await store.run(members.flatMap((id) => [['ZSCORE', key, id], ['HGET', `b:p:${id}`, 'name'], ['HGETALL', `b:pg:${id}`]])) : [];
  const list = members.map((id, i) => {
    const pg = res[i * 3 + 2], games = [];
    if (Array.isArray(pg)) for (let k = 0; k < pg.length; k += 2) if (Number(pg[k + 1]) > 0 && GAMES.includes(pg[k])) games.push(pg[k]);
    return { id, value: Number(res[i * 3]) || 0, name: res[i * 3 + 1] || 'Someone', games, you: id === me };
  }).sort((a, b) => b.value - a.value || (a.name < b.name ? -1 : 1));
  let rank = 0, prev = null;
  list.forEach((r, i) => { if (r.value !== prev) { rank = i + 1; prev = r.value; } r.rank = rank; });
  const strip = ({ id, ...rest }) => rest;
  const rows = list.map(strip);
  return { tab: 'friends', win, code, rows, you: rows.find((r) => r.you) || null, total: rows.length, online: await onlineCount(store, now) };
}

// ------------------------------------------------------------------ invites
/** A short code that stands for the player (the player id itself is never put in a link). */
export async function inviteCode(store, player) {
  const [have] = await store.run([['HGET', `b:p:${player}`, 'invite']]);
  if (have) return have;
  await nameOf(store, player);
  for (let i = 0; i < 20; i++) {
    const code = randomCode(8, 'abcdefghjkmnpqrstuvwxyz23456789');
    const [got] = await store.run([['HSETNX', 'b:inv', code, player]]);
    if (Number(got) === 1) { await store.run([['HSET', `b:p:${player}`, 'invite', code]]); return code; }
  }
  return null;
}
/** A friend finished their first round from an invite link: both sides get a token (once per friend, five a month for the inviter). */
export async function inviteClaim(store, friend, code, now = Date.now()) {
  if (typeof code !== 'string' || !/^[a-z2-9]{8}$/.test(code)) return { ok: false, error: 'code' };
  const [inviter] = await store.run([['HGET', 'b:inv', code]]);
  if (!inviter || inviter === friend) return { ok: false, error: 'unknown' };
  const [first] = await store.run([['HSETNX', 'b:invited', friend, inviter]]);
  if (Number(first) !== 1) return { ok: false, error: 'already' };
  const month = new Date(now).toISOString().slice(0, 7);
  const k = `b:invm:${month}:${inviter}`;
  const [n] = await store.run([['INCR', k], ['EXPIRE', k, 40 * 86400]]);
  if (Number(n) > INVITES_PER_MONTH) return { ok: true, tokens: 1, inviterRewarded: false };   // the friend still gets theirs
  await store.run([['HINCRBY', `b:p:${inviter}`, 'pending', 1]]);
  return { ok: true, tokens: 1, inviterRewarded: true };
}
/** Tokens waiting for the inviter (and clears them). */
export async function inviteStatus(store, player) {
  const [n] = await store.run([['HGET', `b:p:${player}`, 'pending']]);
  const pending = Math.max(0, Math.floor(Number(n) || 0));
  if (pending) await store.run([['HINCRBY', `b:p:${player}`, 'pending', -pending]]);
  return { pending };
}
