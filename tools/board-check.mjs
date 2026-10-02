/** Pure-logic check for the club boards (names, time credit, streak, limits, ranks). node tools/board-check.mjs */
import assert from 'node:assert/strict';
import { memoryStore } from '../api/_lib/club.js';
import * as B from '../api/_lib/board.js';

let n = 0;
const ok = async (fn) => { await fn(); n++; };
const id = (k) => `${String(k).padStart(8, '0')}-0000-4000-8000-000000000000`;
const T0 = Date.UTC(2026, 9, 5, 12, 0, 0);   // Monday 5 Oct 2026, noon UTC
const MIN = 60000, DAY = 86400000;
const play = async (store, player, game, start, minutes, every = 60) => {
  const s = await B.startSession(store, player, game, start);
  let total = 0;
  for (let t = every; t <= minutes * 60; t += every) total += (await B.beat(store, s.token, start + t * 1000)).credited;
  return total;
};

await ok(async () => { // names
  const s = memoryStore();
  const a = await B.nameOf(s, id(1)), a2 = await B.nameOf(s, id(1)), b = await B.nameOf(s, id(2));
  assert.equal(a, a2); assert.match(a, /^[A-Z][a-z]+ [A-Z][a-z]+ \d{1,2}$/); assert.notEqual(a, b);
  const names = new Set(); for (let i = 3; i < 400; i++) names.add(await B.nameOf(s, id(i)));
  assert.equal(names.size, 397, 'a name is held by one player');
});
await ok(async () => { // reroll: 3 a day
  const s = memoryStore(), p = id(1);
  const first = await B.nameOf(s, p), seen = new Set([first]);
  for (let i = 0; i < 3; i++) { const r = await B.reroll(s, p, T0); assert.ok(r.ok); assert.equal(r.left, 2 - i); seen.add(r.name); }
  assert.equal(seen.size, 4);
  const no = await B.reroll(s, p, T0 + MIN); assert.equal(no.ok, false); assert.equal(no.left, 0);
  assert.ok((await B.reroll(s, p, T0 + DAY)).ok, 'next day resets');
  assert.equal(await B.nameOf(s, p), (await s.run([['HGET', `b:p:${p}`, 'name']]))[0]);
  const held = (await s.run([['HGETALL', 'b:names']]))[0]; assert.equal(held.filter((x) => x === p).length, 1, 'old names are released');
});
await ok(async () => { // heartbeats
  const s = memoryStore(), p = id(1);
  const ses = await B.startSession(s, p, 'blackjack', T0);
  assert.equal((await B.beat(s, ses.token, T0 + 10000)).credited, 0, 'too soon');
  assert.equal((await B.beat(s, ses.token, T0 + 40000)).credited, 40, 'real gap');
  assert.equal((await B.beat(s, ses.token, T0 + 40000 + 600000)).credited, 75, 'one beat after a long silence earns at most 75 s');
  assert.equal((await B.beat(s, 'f'.repeat(32), T0)).credited, 0, 'unknown token');
  assert.equal((await B.beat(s, 'nope', T0)).credited, 0); assert.equal((await B.beat(s, undefined, T0)).credited, 0);
  assert.equal((await B.beat(s, ses.token, T0 - 5000)).credited, 0, 'clock going backwards');
  assert.equal((await B.startSession(s, p, 'chess', T0)), null, 'unknown game');
});
await ok(async () => { // idle earns nothing, 10 minutes of play earns 9-11 minutes
  const s = memoryStore();
  await B.startSession(s, id(1), 'holdem', T0);   // opened a tab, never beat
  assert.equal((await s.run([['ZSCORE', 'b:time:all', id(1)]]))[0], null);
  const got = await play(s, id(2), 'holdem', T0, 10);
  assert.ok(got >= 540 && got <= 660, `${got} s`);
  const board = await B.readBoard(s, { tab: 'time', win: 'week' }, T0 + 11 * MIN);
  assert.equal(board.rows.length, 1); assert.equal(board.rows[0].value, got); assert.deepEqual(board.rows[0].games, ['holdem']);
});
await ok(async () => { // caps: 6 h a session, 16 h a day
  const s = memoryStore();
  const total = await play(s, id(1), 'blackjack', T0 - 5 * 3600000, 7 * 60, 75);   // 7 h of beats every 75 s
  assert.ok(total <= B.SESSION_MAX_S, `${total} > session cap`);
  const s2 = memoryStore(); let all = 0;
  for (let k = 0; k < 4; k++) all += await play(s2, id(1), 'blackjack', Date.UTC(2026, 9, 5, 0, 0, 1) + k * 5 * 3600000 / 5, 6 * 60, 75);
  assert.ok(all <= B.DAY_MAX_S + 75, `${all} > day cap`);
});
await ok(async () => { // streak: UTC days with 5+ minutes
  const s = memoryStore(), p = id(1), bestOf = async () => Number((await s.run([['ZSCORE', 'b:streak', p]]))[0]);
  await play(s, p, 'blackjack', T0, 4);   assert.equal(await bestOf(), 0, '4 minutes is not a streak day') ;
  await play(s, p, 'blackjack', T0 + 10 * MIN, 3); assert.equal(await bestOf(), 1, 'crossing five minutes counts once');
  await play(s, p, 'parking', T0 + 20 * MIN, 10); assert.equal(await bestOf(), 1, 'same day does not double');
  await play(s, p, 'blackjack', T0 + DAY, 6); assert.equal(await bestOf(), 2);
  await play(s, p, 'blackjack', T0 + 2 * DAY, 6); assert.equal(await bestOf(), 3);
  await play(s, p, 'blackjack', T0 + 5 * DAY, 6); assert.equal(await bestOf(), 3, 'a gap restarts at 1 but the best stays');
  assert.equal(Number((await s.run([['HGET', `b:p:${p}`, 'sdays']]))[0]), 1);
});
await ok(async () => { // submit
  const s = memoryStore(), p = id(1);
  await play(s, p, 'blackjack', T0, 30);      // 1800 s of blackjack: limit 1000 + 720,000
  assert.deepEqual(await B.submit(s, p, 'bj', { peak: 5000 }), { ok: true });
  assert.deepEqual(await B.submit(s, p, 'bj', { peak: 4000 }), { ok: true });
  assert.equal(Number((await s.run([['ZSCORE', 'b:bj', p]]))[0]), 5000, 'only a higher peak replaces');
  for (const bad of [{ peak: 10_000_001 }, { peak: -1 }, { peak: 1.5 }, { peak: '9' }, { peak: NaN }, {}, null]) assert.equal((await B.submit(s, p, 'bj', bad)).status, 422);
  assert.equal((await B.submit(s, p, 'bj', { peak: 900000 })).status, 422, 'faster than 30 minutes of play allows');
  assert.equal((await B.submit(s, p, 'pk', { stars: 3, best: 90 })).status, 422, 'no parking time yet');
  await play(s, p, 'parking', T0 + 60 * MIN, 10);
  assert.ok((await B.submit(s, p, 'pk', { stars: 30, best: 94 })).ok);
  assert.equal((await B.submit(s, p, 'pk', { stars: 52, best: 94 })).status, 422); assert.equal((await B.submit(s, p, 'pk', { stars: 5, best: 101 })).status, 422);
  assert.equal((await B.submit(s, p, 'zz', {})).status, 400);
  assert.equal(Number((await s.run([['ZSCORE', 'b:pk', p]]))[0]), 30094);
});
await ok(async () => { // ranks, ties, "you" pinned, windows
  const s = memoryStore();
  for (let i = 1; i <= 14; i++) await play(s, id(i), 'blackjack', T0, i <= 3 ? 20 : 20 - i);   // 1-3 tie at 20 min, then falling
  const b = await B.readBoard(s, { tab: 'time', win: 'week', player: id(14) }, T0 + 30 * MIN);
  assert.equal(b.rows.length, 10); assert.equal(b.total, 14);
  assert.deepEqual(b.rows.slice(0, 3).map((r) => r.rank), [1, 1, 1], 'ties share a rank'); assert.equal(b.rows[3].rank, 4);
  assert.ok(b.you && b.you.you && b.you.rank === 14 && !b.rows.some((r) => r.you), 'you are pinned below the top 10');
  assert.ok(b.rows.every((r) => !('id' in r) && typeof r.name === 'string'), 'no ids leave the server');
  const inTop = await B.readBoard(s, { tab: 'time', win: 'week', player: id(1) }, T0 + 30 * MIN);
  assert.ok(inTop.rows.find((r) => r.you) && inTop.you.rank === 1);
  assert.equal((await B.readBoard(s, { tab: 'time', win: 'week', player: id(99) }, T0 + 30 * MIN)).you, null);
  const nextWeek = await B.readBoard(s, { tab: 'time', win: 'week' }, T0 + 7 * DAY);
  assert.equal(nextWeek.rows.length, 0, 'the week board resets on Monday');
  assert.equal((await B.readBoard(s, { tab: 'time', win: 'all' }, T0 + 7 * DAY)).rows.length, 10, 'all time stays');
  assert.equal(await B.readBoard(s, { tab: 'nope' }, T0), null);
  assert.equal(B.weekKey(T0), '2026-10-05'); assert.equal(B.weekKey(T0 + 6 * DAY + 11 * 3600000), '2026-10-05'); assert.equal(B.weekKey(T0 + 6 * DAY + 13 * 3600000), '2026-10-12');
  assert.equal((await B.readBoard(s, { tab: 'time', player: 'not-an-id' }, T0)).you, null);
});
await ok(async () => { // pk decode and ties go to the better park
  const s = memoryStore();
  for (const [i, stars, best] of [[1, 12, 90], [2, 12, 95], [3, 7, 99]]) { await play(s, id(i), 'parking', T0, 20); assert.ok((await B.submit(s, id(i), 'pk', { stars, best })).ok); }
  const b = await B.readBoard(s, { tab: 'pk' }, T0 + 30 * MIN);
  assert.deepEqual(b.rows.map((r) => [r.value, r.extra]), [[12, 95], [12, 90], [7, 99]]);
});
await ok(async () => { // leaving
  const s = memoryStore(), p = id(1);
  await play(s, p, 'blackjack', T0, 10); await B.submit(s, p, 'bj', { peak: 2000 });
  const name = await B.nameOf(s, p);
  await B.leave(s, p, T0 + 20 * MIN);
  for (const tab of ['time', 'bj']) assert.equal((await B.readBoard(s, { tab, win: 'all' }, T0 + 30 * MIN)).rows.length, 0);
  assert.equal((await s.run([['HGET', 'b:names', name]]))[0], null, 'the name is free again');
});
await ok(async () => { // rate limits
  const s = memoryStore();
  for (let i = 0; i < 12; i++) assert.ok(await B.limit(s, '1.1.1.1', 'submit', T0));
  assert.equal(await B.limit(s, '1.1.1.1', 'submit', T0), false);
  assert.ok(await B.limit(s, '2.2.2.2', 'submit', T0), 'per IP');
  assert.ok(await B.limit(s, '1.1.1.1', 'submit', T0 + 11 * MIN), 'window passes');
  for (let i = 0; i < 90; i++) assert.ok(await B.limit(s, '3.3.3.3', 'beat', T0)); assert.equal(await B.limit(s, '3.3.3.3', 'beat', T0), false);
});

console.log(`board-check: ${n} groups passed`);
