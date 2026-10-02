/** Pure-logic check for the telemetry server core: node tools/telemetry-check.mjs */
import assert from 'node:assert/strict';
import { addDays, bucketFor, commandsFor, ingest, memoryStore, metrics, passwordOk, rateLimit, unlockStats, validateBatch, RATE_PER_MIN } from '../api/_lib/club.js';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
let n = 0;
const ok = (name, fn) => { fn(); n++; };

// validation
ok('rejects bad shapes', () => {
  assert.equal(validateBatch(null), null);
  assert.equal(validateBatch({ player: 'nope', events: [{ name: 'session_start' }] }), null);
  assert.equal(validateBatch({ player: A, events: [] }), null);
  assert.equal(validateBatch({ player: A, events: [{ name: 'drop_table' }] }), null);
});
ok('filters props', () => {
  const b = validateBatch({ player: A, events: [{ name: 'game_open', props: { game: 'holdem', typed: 'hello', ref: 'x'.repeat(40), n: 1, dur: 5 } }] });
  assert.deepEqual(b.events[0].props, { game: 'holdem', dur: 5 });
  const c = validateBatch({ player: A, events: [{ name: 'game_open', props: { game: 'evil<script>' } }] });
  assert.deepEqual(c.events[0].props, {});
});
ok('caps the batch', () => {
  const events = Array.from({ length: 50 }, () => ({ name: 'round_end' }));
  assert.equal(validateBatch({ player: A, events }).events.length, 20);
});
ok('buckets', () => {
  assert.deepEqual([0, 59, 60, 179, 600, 1199, 2699, 9999].map(bucketFor), ['0-1', '0-1', '1-3', '1-3', '10-20', '10-20', '20-45', '45+']);
});
ok('dates', () => assert.equal(addDays('2026-10-31', 1), '2026-11-01'));
ok('password', () => { assert.ok(passwordOk('x', 'x')); assert.ok(!passwordOk('x', 'y')); assert.ok(!passwordOk('x', '')); assert.ok(!passwordOk(undefined, 'x')); });
ok('commands carry an expiry', () => {
  const c = commandsFor(validateBatch({ player: A, events: [{ name: 'session_start', props: { game: 'hub' } }] }), '2026-10-01');
  assert.ok(c.some((x) => x[0] === 'EXPIRE'));
});

// cohorts, retention, funnel
const store = memoryStore();
const D0 = '2026-10-01';
const batch = (player, ...events) => validateBatch({ player, events: events.map((e) => (typeof e === 'string' ? { name: e } : e)) });
await ingest(store, batch(A, { name: 'session_start', props: { game: 'hub' } }, { name: 'game_open', props: { game: 'holdem' } }, { name: 'game_open', props: { game: 'blackjack' } }, 'round_end', { name: 'session_end', props: { dur: 700 } }), D0);
await ingest(store, batch(B, { name: 'session_start', props: { game: 'hub' } }), D0);
await ingest(store, batch(A, { name: 'session_start', props: { game: 'hub' } }), addDays(D0, 1));
await ingest(store, batch(A, { name: 'session_start', props: { game: 'hub' } }), addDays(D0, 7));
const m = await metrics(store, addDays(D0, 7));
ok('dau', () => { assert.equal(m.dau[29].n, 1); assert.equal(m.dau[22].n, 2); });
ok('wau/mau', () => { assert.equal(m.wau, 1); assert.equal(m.mau, 2); assert.equal(m.stickiness, 50); });
ok('cohort', () => {
  const c = m.cohorts.find((x) => x.day === D0);
  assert.equal(c.size, 2); assert.equal(c.d1, 1); assert.equal(c.d7, 1); assert.equal(c.d30, null);
});
ok('a later session never joins a cohort', () => assert.equal(m.cohorts.find((x) => x.day === addDays(D0, 1)).size, 0));
const m2 = await metrics(store, addDays(D0, 2));
ok('funnel numbers', () => { assert.equal(m2.funnel.game_open, 1); assert.equal(m2.funnel.round_end, 1); assert.equal(m2.funnel.second_game, 1); });
ok('sessions', () => assert.equal(m2.sessions['10-20'], 1));
ok('per game', () => assert.equal(m2.perGame.find((g) => g.game === 'holdem').days.reduce((a, b) => a + b, 0), 1));
ok('event totals', () => assert.equal(m2.events['game_open|holdem'], 1));

// achievements: global unlock percentages
{
  const us = memoryStore(), day = '2026-10-01';
  for (let i = 1; i <= 4; i++) {
    const pid = `${String(i).repeat(8)}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`;
    await ingest(us, validateBatch({ player: pid, events: [{ name: 'session_start', props: { game: 'hub' } }, ...(i <= 1 ? [{ name: 'unlock', props: { id: 'bj.double' } }] : []), ...(i <= 3 ? [{ name: 'unlock', props: { id: 'club.first' } }] : []), { name: 'unlock', props: { id: 'made.up' } }] }), day);
  }
  const u = await unlockStats(us);
  ok('unlock percentages', () => { assert.equal(u.n, 4); assert.equal(u.pct['bj.double'], 25); assert.equal(u.pct['club.first'], 75); assert.ok(!('made.up' in u.pct) && !('bj.hands.10' in u.pct)); });
}

// experiments: players per variant and who was active this week
{
  const es = memoryStore(), d1 = '2026-10-03', d2 = '2026-10-04';
  const mk = (i) => `${String(i).repeat(8)}-bbbb-4bbb-8bbb-bbbbbbbbbbbb`;
  for (let i = 1; i <= 6; i++) await ingest(es, validateBatch({ player: mk(i), events: [{ name: 'session_start', props: { game: 'hub', exp: i <= 4 ? 'round_panel:on' : 'round_panel:off,freeze_rate:5' } }] }), d1);
  await ingest(es, validateBatch({ player: mk(1), events: [{ name: 'session_start', props: { game: 'hub', exp: 'round_panel:on' } }] }), d2);
  const em = await metrics(es, d2);
  ok('experiments in metrics', () => {
    const by = Object.fromEntries(em.experiments.map((x) => [x.tag, x]));
    assert.deepEqual(Object.keys(by).sort(), ['freeze_rate:5', 'round_panel:off', 'round_panel:on']);
    assert.deepEqual([by['round_panel:on'].players, by['round_panel:on'].activeWeek], [4, 4]); assert.equal(by['round_panel:off'].players, 2);
    assert.ok(!('exp' in validateBatch({ player: mk(1), events: [{ name: 'game_open', props: { exp: 'x'.repeat(80) } }] }).events[0].props), 'a long tag is dropped');
  });
}

// rate limit
const rl = memoryStore();
assert.ok(await rateLimit(rl, '1.2.3.4', RATE_PER_MIN));
assert.ok(!(await rateLimit(rl, '1.2.3.4', 1)));
assert.ok(await rateLimit(rl, '5.6.7.8', 1));
n += 3;

console.log(`telemetry-check: ${n} passed`);
