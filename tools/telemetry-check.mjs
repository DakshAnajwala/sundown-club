/** Pure-logic check for the telemetry server core: node tools/telemetry-check.mjs */
import assert from 'node:assert/strict';
import { addDays, bucketFor, commandsFor, ingest, memoryStore, metrics, passwordOk, rateLimit, validateBatch, RATE_PER_MIN } from '../api/_lib/club.js';

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

// rate limit
const rl = memoryStore();
assert.ok(await rateLimit(rl, '1.2.3.4', RATE_PER_MIN));
assert.ok(!(await rateLimit(rl, '1.2.3.4', 1)));
assert.ok(await rateLimit(rl, '5.6.7.8', 1));
n += 3;

console.log(`telemetry-check: ${n} passed`);
