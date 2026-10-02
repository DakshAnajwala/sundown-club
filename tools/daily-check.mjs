/** Pure-logic check: streak rules, quest pool and picking, progress, rerolls, claims. node tools/daily-check.mjs */
import assert from 'node:assert/strict';
import * as D from '../packages/shared/daily.js';
import * as S from '../packages/shared/streak.js';
import * as SD from '../packages/shared/seed.js';
import { deck } from '../packages/shared/cards.js';

let n = 0;
const ok = (fn) => { fn(); n++; };

// ------------------------------------------------------------ the quest pool
ok(() => {
  assert.ok(D.QUESTS.length >= 60, `pool has ${D.QUESTS.length}`);
  const ids = new Set();
  for (const q of D.QUESTS) {
    assert.ok(!ids.has(q.id), `dup ${q.id}`); ids.add(q.id);
    assert.ok([1, 2, 3].includes(q.tier), q.id);
    assert.ok(typeof q.text === 'string' && q.text.length > 8 && q.text.length < 70, q.id);
    assert.ok(q.event === '*' || D.EVENT_FIELDS[q.event], `${q.id} event ${q.event}`);
    if (q.event !== '*') assert.equal(q.event.split(':')[0], q.game, `${q.id} game/event mismatch`);
    const fields = q.event === '*' ? [] : D.EVENT_FIELDS[q.event];
    for (const f of [...Object.keys(q.where || {}), ...Object.keys(q.gte || {}), ...(q.sum ? [q.sum] : [])]) assert.ok(fields.includes(f), `${q.id} uses unknown field ${f}`);
    assert.ok(D.targetOf(q) >= 1 && Number.isFinite(D.targetOf(q)), q.id);
    if (q.distinct) assert.equal(q.distinct, 'game');
  }
  for (const g of D.GAME_IDS) {
    assert.ok(D.QUESTS.some((q) => q.game === g && q.tier === 1), `${g} has no easy quest`);
    assert.ok(D.QUESTS.filter((q) => q.game === g).length >= 6, `${g} has too few`);
  }
});

// ------------------------------------------------------------ picking
ok(() => {
  const a = D.pickQuests({ seed: 42, tier: 2, now: 1e12 }), b = D.pickQuests({ seed: 42, tier: 2, now: 1e12 });
  assert.deepEqual(a, b);
  assert.equal(new Set(a).size, 3);
});
ok(() => { // thousands of seeds: slots honoured, no repeats, never an unknown id, every game gets offered
  const seen = new Set();
  for (let seed = 1; seed <= 3000; seed++) {
    for (const tier of [1, 2, 3]) {
      const ids = D.pickQuests({ seed, tier, now: 1e12, lastPlayed: seed % 2 ? { holdem: 1e12 - 1000 } : {} });
      assert.equal(ids.length, 3); assert.equal(new Set(ids).size, 3);
      const t = ids.map((i) => D.QUEST_BY_ID[i]);
      assert.ok(['blackjack', 'holdem', 'videopoker'].includes(t[0].game), 'slot 0 is cards');
      assert.ok(['parking', 'racing'].includes(t[1].game), 'slot 1 is driving');
      assert.ok(t[2].tier <= Math.max(2, 1), 'wild stays easy');
      t.forEach((x) => seen.add(x.game));
    }
  }
  for (const g of D.GAME_IDS) assert.ok(seen.has(g), `${g} never offered`);
  assert.ok(seen.has('any'));
});
ok(() => { // recent games are favoured
  let hd = 0, bj = 0;
  for (let seed = 1; seed <= 2000; seed++) {
    const g = D.QUEST_BY_ID[D.pickQuests({ seed, tier: 1, now: 1e12, lastPlayed: { holdem: 1e12 - 5 } })[0]].game;
    if (g === 'holdem') hd++; if (g === 'blackjack') bj++;
  }
  assert.ok(hd > bj * 2, `${hd} vs ${bj}`);
});

// ------------------------------------------------------------ progress
const inst = (...ids) => ids.map((id) => ({ id, p: 0, done: false, g: [] }));
ok(() => {
  let { quests, justDone } = D.applyEvent(inst('bj-win2', 'bj-natural1', 'bj-net300'), 'blackjack:hand', { result: 'win', net: 100, bet: 100 });
  assert.equal(quests[0].p, 1); assert.equal(quests[1].p, 0); assert.equal(quests[2].p, 100); assert.deepEqual(justDone, []);
  ({ quests, justDone } = D.applyEvent(quests, 'blackjack:hand', { result: 'natural', net: 250 }));
  assert.deepEqual(justDone.sort(), ['bj-natural1', 'bj-net300', 'bj-win2'].sort());
  assert.equal(quests[2].p, 300); assert.ok(quests[2].done, 'sum reached 300 (100 + 250 capped)');
  assert.equal(D.applyEvent(quests, 'blackjack:hand', { result: 'win' }).justDone.length, 0, 'done quests do not fire twice');
});
ok(() => { // where/gte and wrong game
  let r = D.applyEvent(inst('hd-straight', 'hd-nofold', 'hd-pot100'), 'holdem:hand', { won: true, showdown: true, cat: 4, pot: 150 });
  assert.deepEqual(r.justDone.sort(), ['hd-pot100', 'hd-straight']);
  r = D.applyEvent(inst('hd-win1'), 'blackjack:hand', { won: true }); assert.equal(r.justDone.length, 0);
  r = D.applyEvent(inst('bj-20'), 'blackjack:hand', { total: 21, bust: false, result: 'win' }); assert.equal(r.justDone.length, 1);
  r = D.applyEvent(inst('bj-20'), 'blackjack:hand', { total: 22, bust: true }); assert.equal(r.justDone.length, 0);
  r = D.applyEvent(inst('bj-20'), 'blackjack:hand', { result: 'win' }); assert.equal(r.justDone.length, 0, 'missing field never matches');
});
ok(() => { // any-game and distinct games
  let r = D.applyEvent(inst('any-rounds6', 'any-games2'), 'holdem:hand', {});
  r = D.applyEvent(r.quests, 'holdem:hand', {});
  assert.equal(r.quests[0].p, 2); assert.equal(r.quests[1].p, 1, 'same game twice counts once');
  r = D.applyEvent(r.quests, 'parking:park', { stars: 1 });
  assert.ok(r.quests[1].done); assert.deepEqual(r.justDone, ['any-games2']);
});
ok(() => { // video poker ranks, parking flags
  assert.equal(D.applyEvent(inst('vp-flush'), 'videopoker:hand', { win: true, rank: 5 }).justDone.length, 1);
  assert.equal(D.applyEvent(inst('vp-flush'), 'videopoker:hand', { win: true, rank: 4 }).justDone.length, 0);
  assert.equal(D.applyEvent(inst('pk-fast'), 'parking:park', { underPar: true }).justDone.length, 1);
  assert.equal(D.applyEvent(inst('rc-150'), 'racing:run', { topKmh: 151 }).justDone.length, 1);
});

// ------------------------------------------------------------ the day
const ctx = { player: 'p1', now: 1e12 };
ok(() => {
  const d1 = D.ensureDay(null, '2026-10-02', ctx);
  assert.equal(d1.day, '2026-10-02'); assert.equal(d1.quests.length, 3); assert.equal(d1.tier, 1);
  assert.deepEqual(D.ensureDay(d1, '2026-10-02', ctx), d1, 'same day keeps the quests');
  const d2 = D.ensureDay(d1, '2026-10-03', ctx);
  assert.equal(d2.day, '2026-10-03'); assert.deepEqual(d2.hist, [{ d: '2026-10-02', n: 0 }]);
  assert.notEqual(D.ensureDay(null, '2026-10-02', { player: 'p2', now: 1e12 }).quests.map((q) => q.id).join(), d1.quests.map((q) => q.id).join(), 'players differ (or this seed collided; pick other ids)');
});
ok(() => { // difficulty
  const sweep = (d) => ({ d, n: 3 });
  assert.equal(D.nextTier(1, [sweep('a'), sweep('b'), sweep('c')]), 2);
  assert.equal(D.nextTier(3, [sweep('a'), sweep('b'), sweep('c')]), 3);
  assert.equal(D.nextTier(2, [sweep('a'), { d: 'b', n: 2 }, sweep('c')]), 2);
  assert.equal(D.nextTier(2, [{ d: 'a', n: 0 }, { d: 'b', n: 0 }]), 1);
  assert.equal(D.nextTier(1, [{ d: 'a', n: 0 }, { d: 'b', n: 0 }]), 1);
  assert.equal(D.nextTier(2, [{ d: 'a', n: 1 }, { d: 'b', n: 0 }]), 2);
});
ok(() => { // reroll: once, only unfinished, different quest
  let d = D.ensureDay(null, '2026-10-02', ctx);
  const before = d.quests.map((q) => q.id);
  const r = D.rerollQuest(d, 1, ctx);
  assert.ok(r.ok); assert.ok(!before.includes(r.daily.quests[1].id)); assert.equal(r.daily.quests[0].id, before[0]);
  assert.equal(D.rerollQuest(r.daily, 0, ctx).ok, false, 'one free reroll a day');
  d = { ...d, quests: d.quests.map((q, i) => (i === 0 ? { ...q, done: true } : q)) };
  assert.equal(D.rerollQuest(d, 0, ctx).ok, false, 'finished quests stay');
  assert.equal(D.rerollQuest(d, 9, ctx).ok, false);
});
ok(() => { // progress: quest xp, round xp, soft cap, all-done bonus once
  let d = D.ensureDay(null, '2026-10-02', ctx);
  d = { ...d, quests: inst('bj-play5', 'pk-park1', 'any-rounds6') };
  let r = D.progress(d, 'blackjack:hand', { result: 'win' }, '2026-10-02');
  assert.equal(r.xp, 5 + 5); assert.equal(r.tokens, 0); assert.equal(r.daily.rounds, 1);
  r = D.progress(r.daily, 'parking:park', { stars: 2 }, '2026-10-02');
  assert.equal(r.xp, D.REWARD.quest[1] + 10 + 10, 'quest xp + round xp'); assert.deepEqual(r.justDone, ['pk-park1']);
  let day = r.daily, tokens = 0, bonus = 0;
  for (let i = 0; i < 6; i++) { r = D.progress(day, 'blackjack:hand', { result: 'lose' }, '2026-10-02'); day = r.daily; tokens += r.tokens; if (r.allDone) bonus++; }
  assert.equal(bonus, 1, 'bonus once'); assert.equal(tokens, 1);
  assert.ok(day.quests.every((q) => q.done)); r = D.progress(day, 'blackjack:hand', { result: 'win' }, '2026-10-02'); assert.equal(r.tokens, 0);
  // soft cap: past 400 round xp a round pays half
  const capped = { ...D.ensureDay(null, '2026-10-02', ctx), quests: inst('rc-run1'), roundXp: 400 };
  assert.equal(D.progress(capped, 'holdem:hand', { won: true }, '2026-10-02').xp, 8);
});
ok(() => { // daily claim once
  const d = D.ensureDay(null, '2026-10-02', ctx);
  assert.ok(D.canClaim(d, '2026-10-02')); assert.ok(!D.canClaim(d, '2026-10-03'));
  const c = D.claimDaily(d, '2026-10-02');
  assert.deepEqual(c.reward, { xp: 100, chips: 250, tokens: 1 });
  assert.equal(D.claimDaily(c.daily, '2026-10-02').reward, null); assert.ok(!D.canClaim(c.daily, '2026-10-02'));
  assert.equal(D.claimDaily(d, '2026-10-03').reward, null);
});
ok(() => { // junk daily never throws, unknown quest ids dropped
  for (const j of [null, 5, 'x', [], { quests: 'no' }, { quests: [{ id: 'gone' }, { id: 'bj-win2', p: 'x' }], tier: 9, hist: 4 }]) {
    const d = D.normalizeDaily(j);
    assert.ok(d.quests.every((q) => D.QUEST_BY_ID[q.id])); assert.equal(d.tier, 1);
  }
});

// ------------------------------------------------------------ streak
const day = (s, n) => S.addDaysStr(s, n);
const T0 = '2026-10-05'; // a Monday
const run = (days, start = T0) => { let s = null; for (let i = 0; i < days; i++) s = S.earnDay(s, day(start, i)).streak; return s; };
ok(() => {
  assert.equal(S.weekdayOf(T0), 1); assert.equal(S.weekStart('2026-10-11'), T0); assert.equal(S.weekStart(T0), T0);
  assert.equal(S.daysBetween('2026-10-31', '2026-11-02'), 2); assert.equal(S.addDaysStr('2026-12-31', 1), '2027-01-01');
  assert.equal(S.addDaysStr('2026-03-28', 2), '2026-03-30', 'dst-safe');
});
ok(() => { // a plain run
  const s = run(10);
  assert.equal(s.days, 10); assert.equal(s.best, 10); assert.equal(s.freezes, 1, 'one freeze at day 7');
  assert.equal(S.earnDay(s, day(T0, 9)).events.length, 0, 'counting twice is a no-op');
  assert.equal(S.earnDay(null, T0).events[0].type, 'started');
});
ok(() => { // freezes: cap 3, spent on a missed day, then broken when none
  let s = run(21); assert.equal(s.freezes, 3); assert.equal(S.earnDay(run(28), day(T0, 28)).streak.freezes, 3, 'cap of 3');
  let r = S.rollStreak(s, day(T0, 22));   // missed day 21
  assert.deepEqual(r.events, [{ type: 'saved', day: day(T0, 21) }]); assert.equal(r.streak.freezes, 2); assert.equal(r.streak.days, 21);
  assert.equal(r.streak.last, day(T0, 21), 'the run carries to yesterday');
  r = S.earnDay(s, day(T0, 22));
  assert.equal(r.streak.days, 22, 'covered day does not add a day but the run continues'); assert.equal(r.streak.freezes, 2);
  r = S.rollStreak(s, day(T0, 25));       // missed 21, 22, 23, 24 : three freezes then break
  assert.deepEqual(r.events.map((e) => e.type), ['saved', 'saved', 'saved', 'broken']); assert.equal(r.streak.days, 0); assert.equal(r.streak.broke.days, 21);
  assert.equal(r.streak.broke.on, day(T0, 24));
});
ok(() => { // no freeze: one missed day ends the run, best stays, next day starts over
  const s = run(5);
  const r = S.earnDay(s, day(T0, 6));
  assert.equal(r.streak.days, 1); assert.equal(r.streak.best, 5); assert.deepEqual(r.events.map((e) => e.type), ['broken', 'started']);
  assert.equal(S.runLength(s, day(T0, 5)), 5, 'alive until the day ends'); assert.equal(S.runLength(s, day(T0, 6)), 0);
});
ok(() => { // rest day: neutral, no freeze spent
  let s = S.setRestDay(run(3), 4);        // run Mon-Wed, rest Thursday
  const r = S.earnDay(s, day(T0, 4));     // Friday; Thursday skipped
  assert.equal(r.streak.days, 4); assert.equal(r.streak.freezes, 0); assert.equal(r.events.filter((e) => e.type === 'broken').length, 0);
  assert.equal(S.earnDay(S.setRestDay(run(3), 4), day(T0, 5)).streak.days, 1, 'rest day only covers its own weekday');
  assert.equal(S.setRestDay(run(1), 9).rest, null);
});
ok(() => { // restore: once a month, with a token, inside two days
  const broken = S.rollStreak(run(5), day(T0, 7)).streak;   // missed 5, 6: broke on day 5
  assert.equal(broken.days, 0);
  assert.deepEqual(S.canRestore(broken, day(T0, 7), 0), { ok: false, reason: 'tokens' });
  assert.deepEqual(S.canRestore(broken, day(T0, 12), 5), { ok: false, reason: 'late' });
  assert.deepEqual(S.canRestore(run(5), day(T0, 4), 5), { ok: false, reason: 'nothing' });
  const r = S.restoreStreak(broken, day(T0, 7), 1);
  assert.ok(r.ok); assert.equal(r.streak.days, 5); assert.equal(r.streak.last, day(T0, 6)); assert.equal(r.streak.broke, null);
  assert.equal(S.earnDay(r.streak, day(T0, 7)).streak.days, 6);
  const again = { ...S.rollStreak(S.earnDay(r.streak, day(T0, 7)).streak, day(T0, 10)).streak };   // broke on day 8, restored already this month
  assert.equal(again.broke.days, 6);
  assert.deepEqual(S.canRestore(again, day(T0, 10), 3), { ok: false, reason: 'month' });
  // already counted today: restoring adds today on top
  const t = S.earnDay(broken, day(T0, 7)).streak;   // new run of 1 today
  assert.equal(t.days, 1);
  const r2 = S.restoreStreak(t, day(T0, 7), 1);
  assert.equal(r2.streak.days, 6);
});
ok(() => { // weekly streak: 4 active days a week, consecutive weeks
  let s = null;
  const play = (d) => { s = S.earnDay(s, d).streak; };
  [0, 1, 2, 3].forEach((i) => play(day(T0, i)));                   // week 1: four days
  assert.equal(s.weekly.count, 1);
  [7, 8, 9, 10].forEach((i) => play(day(T0, i)));                  // week 2
  assert.equal(s.weekly.count, 2);
  assert.equal(S.weeklyCount(s, day(T0, 14)), 2, 'last week still counts');
  assert.equal(S.weeklyCount(s, day(T0, 21)), 0, 'a skipped week resets it');
  [21, 22, 23, 24].forEach((i) => play(day(T0, i)));               // week 4 after a gap
  assert.equal(s.weekly.count, 1);
});
ok(() => { // junk streak
  for (const j of [null, 3, 'x', { days: 'a', last: 5, freezes: 99, rest: 'x', covered: 'no', weekly: 3, broke: 1 }]) {
    const s = S.normalizeStreak(j);
    assert.ok(s.freezes <= 3 && s.days >= 0 && s.last === null && s.rest === null && s.broke === null);
  }
});

// ------------------------------------------------------------ the daily seed
ok(() => {
  assert.equal(SD.dayNumber(new Date('2026-09-28T00:00:00Z')), 1, 'matches Parking daily numbering');
  assert.equal(SD.dayNumber(new Date('2026-09-28T23:59:59Z')), 1); assert.equal(SD.dayNumber(new Date('2026-09-29T00:00:00Z')), 2);
  assert.equal(SD.dayNumber(new Date('2026-10-02T12:00:00Z')), 5);
  const d = new Date('2026-10-02T08:00:00Z'), d2 = new Date('2026-10-02T23:00:00Z'), d3 = new Date('2026-10-03T00:00:01Z');
  assert.equal(SD.seedFor('videopoker', d), SD.seedFor('videopoker', d2), 'same UTC day = same seed');
  assert.notEqual(SD.seedFor('videopoker', d), SD.seedFor('videopoker', d3)); assert.notEqual(SD.seedFor('videopoker', d), SD.seedFor('holdem', d));
  const a = SD.seededShuffle(deck(), SD.seedFor('videopoker', d)), b = SD.seededShuffle(deck(), SD.seedFor('videopoker', d2));
  assert.deepEqual(a, b); assert.equal(a.length, 52); assert.equal(new Set(a.map((c) => c.rank + c.suit)).size, 52, 'a permutation');
  assert.notDeepEqual(a, deck()); assert.notDeepEqual(a, SD.seededShuffle(deck(), SD.seedFor('videopoker', d3)));
  assert.equal(SD.msToNextSeed(Date.UTC(2026, 9, 2, 23, 0, 0)), 3600000);
  // fairness smoke test: over 400 days the first card is spread across many ranks and suits
  const first = new Set(); for (let i = 0; i < 400; i++) { const c = SD.seededShuffle(deck(), SD.seedFor('videopoker', new Date(Date.UTC(2026, 9, 3) + i * 86400000)))[0]; first.add(c.rank + c.suit); }
  assert.ok(first.size > 35, `${first.size} distinct first cards`);
});

console.log(`daily-check: ${n} groups passed (${D.QUESTS.length} quest templates)`);
