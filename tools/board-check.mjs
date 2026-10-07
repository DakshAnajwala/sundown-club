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
await ok(async () => { // the Daily Blackjack tournament board
  const s = memoryStore(), p = id(1);
  assert.equal((await B.submit(s, p, 'bt', { stack: 1500 }, T0)).status, 422, 'no play time yet');
  await play(s, p, 'blackjack', T0, 5);
  assert.ok((await B.submit(s, p, 'bt', { stack: 1500 }, T0 + 6 * MIN)).ok);
  assert.ok((await B.submit(s, p, 'bt', { stack: 900 }, T0 + 6 * MIN)).ok);
  const b = await B.readBoard(s, { tab: 'tour', win: 'week', player: p }, T0 + 6 * MIN);
  assert.deepEqual([b.rows.length, b.rows[0].value, b.you.rank], [1, 1500, 1], 'the best stack of the week stays');
  for (const bad of [{ stack: 21001 }, { stack: -1 }, { stack: 10.5 }, { stack: '5' }, {}, null]) assert.equal((await B.submit(s, p, 'bt', bad, T0 + 6 * MIN)).status, 422);
  assert.equal((await B.readBoard(s, { tab: 'tour', win: 'week' }, T0 + 7 * DAY)).rows.length, 0, 'resets on Monday');
  await B.leave(s, p, T0 + 7 * MIN);
  assert.equal((await B.readBoard(s, { tab: 'tour', win: 'week' }, T0 + 7 * MIN)).rows.length, 0, 'leaving removes it');
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

await ok(async () => { // presence: hidden below three players
  const s = memoryStore();
  await play(s, id(1), 'blackjack', T0, 5); await play(s, id(2), 'blackjack', T0, 5);
  assert.equal(await B.onlineCount(s, T0 + 5 * MIN + 1000), null, 'two players: not shown');
  await play(s, id(3), 'holdem', T0, 5);
  assert.equal(await B.onlineCount(s, T0 + 5 * MIN + 1000), 3);
  assert.equal(await B.onlineCount(s, T0 + 5 * MIN + 3 * MIN), null, 'two minutes after the last beat they are gone');
  assert.equal((await B.readBoard(s, { tab: 'time', win: 'week' }, T0 + 5 * MIN + 1000)).online, 3);
});
await ok(async () => { // friends board by code
  const s = memoryStore();
  for (let i = 1; i <= 4; i++) await play(s, id(i), 'blackjack', T0, i * 3);
  const c = await B.clubCreate(s, id(1)); assert.ok(c.ok && B.validClubCode(c.code), c.code);
  assert.equal((await B.clubCreate(s, id(1))).code, c.code, 'one club per player');
  assert.deepEqual(await B.clubJoin(s, id(2), 'zzzzzz'), { ok: false, error: 'unknown' });
  assert.deepEqual(await B.clubJoin(s, id(2), 'a1'), { ok: false, error: 'code' });
  assert.ok((await B.clubJoin(s, id(2), c.code.toLowerCase() + ' ')).ok, 'case and spaces are forgiven');
  assert.ok((await B.clubJoin(s, id(4), c.code)).ok);
  const b = await B.readClub(s, id(2), 'week', T0 + 30 * MIN);
  assert.equal(b.code, c.code); assert.equal(b.total, 3); assert.deepEqual(b.rows.map((r) => r.value), [720, 360, 180]);
  assert.ok(b.you && b.you.you && b.you.rank === 2); assert.ok(b.rows.every((r) => !('id' in r)));
  assert.equal((await B.readClub(s, id(3), 'week', T0)).code, null, 'not in a club: nothing about anyone else');
  const other = await B.clubCreate(s, id(3)); assert.ok((await B.clubJoin(s, id(2), other.code)).ok, 'joining another club leaves the first');
  assert.equal((await B.readClub(s, id(1), 'week', T0 + 30 * MIN)).total, 2);
  await B.clubLeave(s, id(2)); assert.equal((await B.readClub(s, id(2), 'week', T0)).code, null);
  const full = await B.clubCreate(s, id(10));
  for (let i = 11; i < 11 + B.CLUB_MAX; i++) await B.clubJoin(s, id(i), full.code);
  assert.deepEqual(await B.clubJoin(s, id(500), full.code), { ok: false, error: 'full' });
});
await ok(async () => { // invites: once per friend, five a month, never the id
  const s = memoryStore();
  const code = await B.inviteCode(s, id(1)); assert.match(code, /^[a-z2-9]{8}$/); assert.equal(await B.inviteCode(s, id(1)), code);
  assert.ok(!code.includes('0000'), 'not the player id');
  assert.deepEqual(await B.inviteClaim(s, id(2), 'bad!', T0), { ok: false, error: 'code' });
  assert.deepEqual(await B.inviteClaim(s, id(2), 'abcdefgh', T0), { ok: false, error: 'unknown' });
  assert.deepEqual(await B.inviteClaim(s, id(1), code, T0), { ok: false, error: 'unknown' }, 'cannot invite yourself');
  assert.deepEqual(await B.inviteClaim(s, id(2), code, T0), { ok: true, tokens: 1, inviterRewarded: true });
  assert.deepEqual(await B.inviteClaim(s, id(2), code, T0), { ok: false, error: 'already' }, 'once per friend');
  for (let i = 3; i <= 6; i++) assert.equal((await B.inviteClaim(s, id(i), code, T0)).inviterRewarded, true);
  assert.deepEqual(await B.inviteClaim(s, id(7), code, T0), { ok: true, tokens: 1, inviterRewarded: false }, 'sixth this month: the friend still gets theirs');
  assert.deepEqual(await B.inviteStatus(s, id(1)), { pending: 5 }); assert.deepEqual(await B.inviteStatus(s, id(1)), { pending: 0 }, 'cleared once read');
  assert.equal((await B.inviteClaim(s, id(8), code, T0 + 32 * DAY)).inviterRewarded, true, 'a new month');
});
await ok(async () => { // signed challenges
  const C = await import('../api/_lib/challenge.js');
  const { code } = C.signChallenge({ g: 'videopoker', s: 123456, v: 10, l: 'Two pair' }, 'Amber Heron 42', T0);
  assert.match(code, /^C1\.[A-Za-z0-9_-]+\.[0-9a-f]{16}$/);
  const v = C.verifyChallenge(code); assert.ok(v.ok); assert.deepEqual([v.data.g, v.data.s, v.data.v, v.data.l, v.data.n], ['videopoker', 123456, 10, 'Two pair', 'Amber Heron 42']);
  const [m, body, sig] = code.split('.');
  const forged = Buffer.from(JSON.stringify({ g: 'videopoker', s: 123456, v: 4000, l: 'Royal flush', n: 'Amber Heron 42', t: 1 })).toString('base64url');
  assert.equal(C.verifyChallenge(`${m}.${forged}.${sig}`).ok, false, 'edited numbers fail');
  assert.equal(C.verifyChallenge(`${m}.${body}.${'0'.repeat(16)}`).ok, false); assert.equal(C.verifyChallenge(code + '.x').ok, false);
  for (const bad of [null, '', 'x', 5, 'C1..']) assert.equal(C.verifyChallenge(bad).ok, false);
  for (const bad of [{ g: 'chess', s: 1, v: 1, l: 'x' }, { g: 'videopoker', s: -1, v: 1, l: 'x' }, { g: 'videopoker', s: 1.5, v: 1, l: 'x' }, { g: 'videopoker', s: 1, v: 1e9, l: 'x' }, { g: 'videopoker', s: 1, v: 1, l: '<script>' }, null]) assert.ok(C.signChallenge(bad, 'n', T0).error);
  process.env.NODE_ENV = 'production'; delete process.env.CLUB_SECRET;
  assert.equal(C.signChallenge({ g: 'videopoker', s: 1, v: 1, l: 'x' }, 'n', T0).error, 'not configured', 'production without a secret signs nothing');
  assert.equal(C.verifyChallenge(code).ok, false);
  process.env.CLUB_SECRET = 'real'; const real = C.signChallenge({ g: 'videopoker', s: 1, v: 1, l: 'x' }, 'n', T0).code; assert.ok(C.verifyChallenge(real).ok);
  process.env.CLUB_SECRET = 'other'; assert.equal(C.verifyChallenge(real).ok, false, 'another secret rejects it');
  delete process.env.CLUB_SECRET; process.env.NODE_ENV = 'test';
});

await ok(async () => { // shared ghosts
  const G = await import('../api/_lib/ghost.js');
  const trace = (n, f) => { const a = new Int16Array(n * 4); for (let i = 0; i < n; i++) { a[i * 4] = f(i, 0); a[i * 4 + 1] = f(i, 1); a[i * 4 + 2] = 0; a[i * 4 + 3] = (i * 7) % 1800; } return Buffer.from(a.buffer).toString('base64'); };
  const good = trace(200, (i, k) => (k ? i * 3 : -i * 5));
  const s = memoryStore();
  const put = await G.putGhost(s, id(1), 'Amber Heron 42', { level: 7, hz: 20, d: good }, T0);
  assert.ok(put.ok && /^[A-Za-z0-9]{8}$/.test(put.id));
  const got = await G.getGhost(s, put.id); assert.deepEqual([got.level, got.hz, got.d, got.name], [7, 20, good, 'Amber Heron 42']);
  assert.equal(await G.getGhost(s, 'nope'), null); assert.equal(await G.getGhost(s, 'abcdefgh'), null); assert.equal(await G.getGhost(s, 12), null);
  for (const bad of [{ level: 0, hz: 20, d: good }, { level: 7, hz: 7, d: good }, { level: 7, hz: 20, d: 'AAAA' }, { level: 7, hz: 20, d: 'not base64 !!'.repeat(5) }, { level: 7, hz: 20, d: trace(200, () => 30000) }, { level: 7, hz: 20, d: trace(4, () => 1) }, { level: 7, hz: 20, d: 'A'.repeat(40000) }, {}])
    assert.equal((await G.putGhost(s, id(2), 'n', bad, T0)).ok, false);
  for (let i = 0; i < 9; i++) assert.ok((await G.putGhost(s, id(1), 'n', { level: 7, hz: 20, d: good }, T0)).ok);
  assert.equal((await G.putGhost(s, id(1), 'n', { level: 7, hz: 20, d: good }, T0)).error, 'too many', 'ten a day');
  assert.ok((await G.putGhost(s, id(1), 'n', { level: 7, hz: 20, d: good }, T0 + 2 * DAY)).ok, 'a new day');
});

await ok(async () => { // web push: signing, endpoints, one a day, dead subscriptions dropped
  const { generateKeyPairSync, createPublicKey, createVerify } = await import('node:crypto');
  const Pu = await import('../api/_lib/push.js');
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = privateKey.export({ format: 'jwk' }), pubJwk = publicKey.export({ format: 'jwk' });
  const pub = Buffer.concat([Buffer.from([4]), Buffer.from(pubJwk.x, 'base64url'), Buffer.from(pubJwk.y, 'base64url')]).toString('base64url');
  const env = { VAPID_PUBLIC_KEY: pub, VAPID_PRIVATE_KEY: jwk.d, VAPID_SUBJECT: 'mailto:owner@example.com' };
  assert.ok(Pu.pushConfigured(env)); assert.ok(!Pu.pushConfigured({})); assert.ok(!Pu.pushConfigured({ VAPID_PUBLIC_KEY: 'x' }));
  const jwt = Pu.vapidJwt('https://push.example.com', env.VAPID_SUBJECT, { pub, priv: jwk.d }, T0);
  const [h, b, sig] = jwt.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url')), { typ: 'JWT', alg: 'ES256' });
  const claims = JSON.parse(Buffer.from(b, 'base64url')); assert.equal(claims.aud, 'https://push.example.com'); assert.equal(claims.sub, env.VAPID_SUBJECT); assert.equal(claims.exp, Math.floor(T0 / 1000) + 43200);
  assert.ok(createVerify('SHA256').update(`${h}.${b}`).verify({ key: createPublicKey({ key: pubJwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url')), 'a push service can verify the signature');
  assert.ok(Pu.validEndpoint('https://fcm.googleapis.com/fcm/send/abc')); for (const bad of ['http://x.com/a', 'javascript:alert(1)', 'nope', '', 'https://' + 'a'.repeat(700)]) assert.ok(!Pu.validEndpoint(bad));
  const s = memoryStore();
  assert.deepEqual(await Pu.subscribe(s, id(1), 'http://insecure.example/x'), { ok: false });
  for (const e of ['https://push.example.com/a', 'https://push.example.com/b', 'https://push.example.com/c']) assert.ok((await Pu.subscribe(s, id(1), e)).ok);
  const sent = [];
  const fake = async (url, init) => { sent.push([url, init.headers.Authorization.slice(0, 11), init.headers['Content-Length']]); return { ok: !url.endsWith('/b') && !url.endsWith('/c'), status: url.endsWith('/c') ? 410 : url.endsWith('/b') ? 500 : 201 }; };
  let r = await Pu.runPush(s, env, fake, T0);
  assert.deepEqual(r, { sent: 1, gone: 1, failed: 1, skipped: 0 }); assert.equal(sent.length, 3); assert.ok(sent.every((x) => x[1] === 'vapid t=eyJ' && x[2] === '0'), 'empty push with a VAPID header');
  r = await Pu.runPush(s, env, fake, T0 + 3600000);
  assert.deepEqual(r, { sent: 0, gone: 0, failed: 1, skipped: 1 }, 'the one that was sent today is not sent again; the failed one is retried; the gone one is dropped');
  r = await Pu.runPush(s, env, async () => ({ ok: true, status: 201 }), T0 + DAY);
  assert.equal(r.sent, 2); assert.equal((await Pu.runPush(s, env, async () => ({ ok: true, status: 201 }), T0 + DAY + 1000)).sent, 0, 'one a day');
  await Pu.unsubscribe(s, 'https://push.example.com/a');
  assert.equal((await Pu.runPush(s, env, async () => ({ ok: true, status: 201 }), T0 + 2 * DAY)).sent, 1);
  assert.equal(await Pu.sendPush('https://push.example.com/z', env, async () => { throw new Error('offline'); }), 'failed');
});

console.log(`board-check: ${n} groups passed`);
