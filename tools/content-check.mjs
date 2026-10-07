/** Pure-logic check for the content layer: achievements, items, mastery, seasons, weekly goals. node tools/content-check.mjs */
import assert from 'node:assert/strict';
import { ACHIEVEMENTS, ACHIEVEMENT_BY_ID } from '../packages/shared/data/achievements.js';
import { ITEMS, SLOTS, STARTER_ITEMS, STARTER_BADGES, itemsOfSlot } from '../packages/shared/catalog.js';
import { TRACKS, MASTERY_MAX, masteryNeed } from '../packages/shared/data/mastery.js';
import { SEASONS, TIERS, TIER_XP, SEASON_DAYS, seasonAt, nextSeason, pastSeasons, startMs, endMs } from '../packages/shared/data/seasons.js';
import { WEEKLY } from '../packages/shared/data/events.js';
import { EVENT_FIELDS, GAME_IDS } from '../packages/shared/daily.js';
import * as P from '../packages/shared/progression.js';

let n = 0;
const ok = (fn) => { fn(); n++; };
const KNOWN_STATS = new Set([
  'rounds', 'wins.any', 'games.seen', 'families.seen', 'day.games', 'level', 'streak.best', 'weekly.best', 'items.owned', 'mastery.best', 'welcomed',
  'invites', 'shares', 'daily.claims', 'quests.done', 'allclears', 'seeds.done', 'club.joined', 'seasons.done', 'weekly.done',
  ...GAME_IDS.flatMap((g) => { const { sum, max } = P.statDeltas(g, {}); return [...Object.keys(sum), ...Object.keys(max)]; }),
  'bj.bestStreak',
]);

ok(() => { // achievements: shape
  assert.ok(ACHIEVEMENTS.length >= 120, `${ACHIEVEMENTS.length} achievements`);
  const ids = new Set(), rarities = new Set();
  for (const a of ACHIEVEMENTS) {
    assert.ok(!ids.has(a.id), `dup ${a.id}`); ids.add(a.id); rarities.add(a.rarity);
    assert.match(a.id, /^[a-z0-9.-]{1,32}$/, a.id);
    assert.ok(P.XP_BY_RARITY[a.rarity], `${a.id} rarity`);
    assert.ok(a.name.length >= 3 && a.name.length <= 40, `${a.id} name`); assert.ok(a.text.length >= 8 && a.text.length <= 90, `${a.id} text`);
    const kinds = ['stat', 'on', 'hour'].filter((k) => a[k] !== undefined);
    assert.equal(kinds.length, 1, `${a.id}: one rule kind`);
    if (a.stat) { assert.ok(KNOWN_STATS.has(a.stat), `${a.id} unknown stat ${a.stat}`); assert.ok(Number.isFinite(a.gte) && a.gte >= 1); }
    if (a.on) {
      assert.ok(EVENT_FIELDS[a.on], `${a.id} unknown event ${a.on}`);
      for (const f of [...Object.keys(a.where || {}), ...Object.keys(a.gte || {})]) assert.ok(EVENT_FIELDS[a.on].includes(f), `${a.id} uses unknown field ${f}`);
    }
    if (a.hour) assert.ok(a.hour.every((h) => Number.isInteger(h) && h >= 0 && h < 24));
    if (a.reward?.item) assert.ok(ITEMS[a.reward.item], `${a.id} rewards unknown item`);
  }
  assert.deepEqual([...rarities].sort(), ['common', 'epic', 'rare', 'uncommon']);
  assert.ok(ACHIEVEMENTS.filter((a) => a.hidden).length >= 8, 'some are hidden');
  assert.ok(ACHIEVEMENTS.filter((a) => a.rarity === 'common').length > ACHIEVEMENTS.filter((a) => a.rarity === 'epic').length * 2, 'mostly reachable');
});
ok(() => { // ladders rise
  const by = {};
  for (const a of ACHIEVEMENTS) if (a.stat) (by[a.stat] ||= []).push(a);
  for (const [stat, list] of Object.entries(by)) {
    const order = ['common', 'uncommon', 'rare', 'epic'];
    const sorted = [...list].sort((x, y) => x.gte - y.gte);
    for (let i = 1; i < sorted.length; i++) assert.ok(order.indexOf(sorted[i].rarity) >= order.indexOf(sorted[i - 1].rarity), `${stat}: a harder step is not rarer`);
  }
});
ok(() => { // items
  for (const [id, it] of Object.entries(ITEMS)) {
    assert.match(id, /^[a-z0-9][a-z0-9._-]{0,47}$/); assert.ok(it.name && it.blurb, id);
    assert.ok(it.kind === 'badge' || SLOTS[it.kind], `${id} kind`);
    if (it.kind === 'cardBack') for (const k of ['base', 'a', 'b', 'line']) assert.match(it.palette[k], /^#[0-9a-f]{6}$/i, `${id} palette`);
    if (it.kind === 'felt') assert.ok(it.color === null || /^#[0-9a-f]{6}$/i.test(it.color));
    if (it.kind === 'frame') assert.ok(it.ring === null || /^#[0-9a-f]{6}$/i.test(it.ring));
    if (it.kind === 'backdrop') assert.ok(it.vars === null || ['--top', '--mid', '--bot'].every((k) => /^#[0-9a-f]{6}$/i.test(it.vars[k])));
  }
  for (const id of [...STARTER_ITEMS, ...STARTER_BADGES]) assert.ok(ITEMS[id], id);
  for (const slot of Object.keys(SLOTS)) assert.ok(itemsOfSlot(slot).length >= 4, `${slot} has choices`);
  assert.ok(STARTER_ITEMS.every((id) => ITEMS[id].kind !== 'badge'));
});
ok(() => { // every non-starter item can be earned somewhere
  const reachable = new Set([...STARTER_ITEMS, ...STARTER_BADGES]);
  for (const a of ACHIEVEMENTS) if (a.reward?.item) reachable.add(a.reward.item);
  for (const t of Object.values(TRACKS)) for (const m of Object.values(t.milestones)) if (m.item) reachable.add(m.item);
  for (const s of SEASONS) for (const r of Object.values(s.rewards)) if (r.item) reachable.add(r.item);
  for (const w of WEEKLY) if (w.reward.item) reachable.add(w.reward.item);
  const missing = Object.keys(ITEMS).filter((id) => !reachable.has(id));
  assert.deepEqual(missing, [], `unreachable items: ${missing}`);
});
ok(() => { // mastery
  assert.deepEqual(Object.keys(TRACKS).sort(), [...GAME_IDS].sort());
  let total = 0; for (let l = 1; l < MASTERY_MAX; l++) total += masteryNeed(l);
  assert.equal(total, 9120);
  assert.deepEqual(P.masteryLevel(0), { level: 1, into: 0, next: 120 }); assert.equal(P.masteryLevel(119).level, 1); assert.equal(P.masteryLevel(120).level, 2);
  assert.deepEqual(P.masteryLevel(total), { level: 20, into: 0, next: 0 }); assert.equal(P.masteryLevel(total + 99999).level, 20); assert.equal(P.masteryLevel(-4).level, 1);
  const a = P.addMastery({ blackjack: 0 }, 'blackjack', 2000);
  assert.ok(a.level >= 8); assert.deepEqual(a.milestones.map((m) => m.level), [5]);
  const b = P.addMastery({ blackjack: a.xp }, 'blackjack', 20000);
  assert.deepEqual(b.milestones.map((m) => m.level), [10, 15, 20]); assert.equal(b.level, 20);
  assert.equal(P.addMastery({}, 'blackjack', 5).milestones.length, 0);
  for (const t of Object.values(TRACKS)) assert.deepEqual(Object.keys(t.milestones).map(Number), [5, 10, 15, 20]);
});
ok(() => { // seasons
  assert.ok(SEASONS.length >= 4);
  SEASONS.forEach((s, i) => {
    assert.equal(Object.keys(s.rewards).map(Number).every((t) => t >= 1 && t <= TIERS), true, s.id);
    const top = s.rewards[TIERS]; assert.ok(top.item && ITEMS[top.item].limited === s.id, `${s.id} top tier is its limited badge`);
    for (const r of Object.values(s.rewards)) { assert.ok(r.item || r.tokens, s.id); if (r.item) assert.ok(ITEMS[r.item], r.item); }
    assert.ok(ITEMS[s.palette], `${s.id} palette item`);
    assert.ok(Object.keys(s.rewards).length >= 10, `${s.id} has a full track`);
    if (i) assert.equal(startMs(s), endMs(SEASONS[i - 1]), `${s.id} starts when the last ends`);
  });
  assert.equal(SEASON_DAYS, 28); assert.equal(TIERS * TIER_XP, 7500);
  assert.equal(seasonAt(Date.parse('2026-10-05T00:00:00Z')).id, 's1'); assert.equal(seasonAt(Date.parse('2026-11-01T23:59:59Z')).id, 's1');
  assert.equal(seasonAt(Date.parse('2026-11-02T00:00:00Z')).id, 's2'); assert.equal(seasonAt(Date.parse('2026-10-04T23:59:59Z')), null);
  assert.equal(seasonAt(Date.parse('2030-01-01T00:00:00Z')), null);
  assert.equal(nextSeason(Date.parse('2026-10-02T00:00:00Z')).id, 's1'); assert.equal(nextSeason(Date.parse('2030-01-01T00:00:00Z')), null);
  assert.deepEqual(pastSeasons(Date.parse('2026-11-10T00:00:00Z')).map((s) => s.id), ['s1']);
  assert.equal(P.tiersFor(0), 0); assert.equal(P.tiersFor(249), 0); assert.equal(P.tiersFor(250), 1); assert.equal(P.tiersFor(7499), 29); assert.equal(P.tiersFor(7500), 30); assert.equal(P.tiersFor(1e9), 30); assert.equal(P.tiersFor(-1), 0);
  const s1 = SEASONS[0];
  assert.deepEqual(P.claimableTiers(s1, 500, []), [2]); assert.deepEqual(P.claimableTiers(s1, 1500, [2]), [5]); assert.deepEqual(P.claimableTiers(s1, 1500, [2, 5]), []);
  assert.deepEqual(P.claimableTiers(s1, 1e6, []).length, Object.keys(s1.rewards).length); assert.deepEqual(P.claimableTiers(null, 1e6, []), []);
});
ok(() => { // weekly goals
  for (const w of WEEKLY) { assert.ok(w.events.length && w.text && P.weeklyTarget(w) >= 1); for (const e of w.events) assert.ok(EVENT_FIELDS[e], e); assert.ok(w.reward.xp && w.reward.tokens); }
  const mon = Date.UTC(2026, 9, 5, 0, 0, 0), sun = Date.UTC(2026, 9, 11, 23, 59, 59);
  assert.equal(P.weekStartUtc(mon), '2026-10-05'); assert.equal(P.weekStartUtc(sun), '2026-10-05'); assert.equal(P.weekStartUtc(sun + 2000), '2026-10-12');
  assert.equal(P.weeklyFor(mon).goal.id, WEEKLY[0].id); assert.equal(P.weeklyFor(mon + 7 * 86400000).goal.id, WEEKLY[1].id); assert.equal(P.weeklyFor(mon + 4 * 7 * 86400000).goal.id, WEEKLY[0].id);
  assert.equal(P.weeklyFor(sun).week, P.weeklyFor(mon).week);
  const g = WEEKLY[0]; let st = { week: 'x', id: g.id, p: 0, done: false };
  for (let i = 0; i < 9; i++) { const r = P.weeklyProgress(st, g, 'holdem:hand', { won: true }); assert.equal(r.justDone, false); st = r.state; }
  assert.equal(P.weeklyProgress(st, g, 'holdem:hand', { won: false }).state.p, 9, 'a loss does not count');
  assert.equal(P.weeklyProgress(st, g, 'blackjack:hand', { won: true }).state.p, 9, 'wrong game');
  const last = P.weeklyProgress(st, g, 'holdem:hand', { won: true }); assert.ok(last.justDone && last.state.done);
  assert.equal(P.weeklyProgress(last.state, g, 'holdem:hand', { won: true }).justDone, false, 'done once');
  const v = WEEKLY[1]; const vs = P.weeklyProgress({ week: 'x', id: v.id, p: 14, done: false }, v, 'parking:park', { stars: 3 }); assert.ok(vs.justDone); assert.equal(vs.state.p, 15, 'sum is capped at the target');
  assert.equal(P.xpMultiplier(Date.UTC(2026, 9, 3, 12)), 1.5); assert.equal(P.xpMultiplier(Date.UTC(2026, 9, 4, 12)), 1.5); assert.equal(P.xpMultiplier(Date.UTC(2026, 9, 5, 12)), 1);
});
ok(() => { // stats from rounds
  let s = {};
  s = P.applyStats(s, 'blackjack', { result: 'win', total: 20, cards: 5, doubled: true, bust: false, net: 100, bet: 50 }, { dayGames: ['blackjack'] });
  assert.deepEqual([s['bj.hands'], s['bj.wins'], s['bj.doubleWins'], s['bj.fiveCard'], s['bj.chipsWon'], s['bj.streak'], s['wins.any'], s['rounds']], [1, 1, 1, 1, 100, 1, 1, 1]);
  s = P.applyStats(s, 'blackjack', { result: 'natural', net: 75 }, {}); assert.equal(s['bj.bestStreak'], 2); assert.equal(s['bj.naturals'], 1);
  s = P.applyStats(s, 'blackjack', { result: 'push' }, {}); assert.equal(s['bj.streak'], 2, 'a push keeps the streak');
  s = P.applyStats(s, 'blackjack', { result: 'lose', bust: true, net: -50 }, {}); assert.equal(s['bj.streak'], 0); assert.equal(s['bj.bestStreak'], 2); assert.equal(s['bj.busts'], 1); assert.equal(s['bj.bestNet'], 100);
  s = P.applyStats(s, 'holdem', { won: true, pot: 600, showdown: true, cat: 5 }, {}); assert.deepEqual([s['hd.wins'], s['hd.showdownWins'], s['hd.straightPlus'], s['hd.biggestPot']], [1, 1, 1, 600]);
  s = P.applyStats(s, 'holdem', { won: true, pot: 100, showdown: false }, {}); assert.equal(s['hd.noFoldWins'], 1); assert.equal(s['hd.biggestPot'], 600, 'max keeps the best');
  s = P.applyStats(s, 'videopoker', { win: true, rank: 4, won: 20, bet: 5 }, {}); assert.deepEqual([s['vp.wins'], s['vp.maxBets'], s['vp.chipsWon']], [1, 1, 20]);
  s = P.applyStats(s, 'parking', { stars: 3, score: 99, clean: true, underPar: true }, {}); assert.deepEqual([s['pk.stars'], s['pk.threeStars'], s['pk.perfect'], s['pk.clean'], s['pk.bestScore']], [3, 1, 1, 1, 99]);
  s = P.applyStats(s, 'racing', { topKmh: 188, driftSec: 9 }, { dayGames: ['blackjack', 'holdem', 'racing'] });
  assert.deepEqual([s['rc.runs'], s['rc.topKmh'], s['rc.drift'], s['games.seen'], s['families.seen'], s['day.games']], [1, 188, 9, 5, 2, 3]);
  assert.deepEqual(P.applyStats(null, 'blackjack', {}, {})['bj.hands'], 1);
  const before = JSON.stringify(s); P.applyStats(s, 'blackjack', { result: 'win' }, {}); assert.equal(JSON.stringify(s), before, 'never mutates');
});
ok(() => { // unlocking
  const lvl = (xp) => P.masteryLevel(xp).level;   // any function; level is not what is under test here
  const view = (stats, extra = {}) => P.statView({ stats, xp: 0, streak: { best: 0, weekly: { count: 0 } }, inv: { owned: [] }, onb: {}, mastery: {}, ...extra }, () => 1);
  assert.deepEqual(P.checkAchievements(view({}), {}, {}), []);
  const ids = P.checkAchievements(view({ 'bj.hands': 60, 'bj.wins': 5, rounds: 30 }), {}, {});
  for (const want of ['bj.hands.10', 'bj.hands.50', 'bj.wins.5', 'club.rounds.25']) assert.ok(ids.includes(want), want);
  assert.ok(!ids.includes('bj.hands.250'));
  assert.deepEqual(P.checkAchievements(view({ 'bj.hands': 60 }), { 'bj.hands.10': 1, 'bj.hands.50': 1 }, {}), [], 'already unlocked ones stay quiet');
  assert.ok(P.checkAchievements(view({}), {}, { type: 'blackjack:hand', data: { doubled: true, result: 'win' } }).includes('bj.double'));
  assert.ok(!P.checkAchievements(view({}), {}, { type: 'blackjack:hand', data: { doubled: true, result: 'lose' } }).includes('bj.double'));
  assert.ok(P.checkAchievements(view({}), {}, { type: 'videopoker:hand', data: { win: true, rank: 9 } }).includes('vp.royal'));
  assert.ok(P.checkAchievements(view({}), {}, { type: 'videopoker:hand', data: { win: true, rank: 9 } }).includes('vp.flush'), 'a royal is also a flush or better');
  assert.ok(P.checkAchievements(view({}), {}, { type: 'holdem:hand', data: { won: true, showdown: true, cat: 6, pot: 2500 } }).includes('hd.pot2000'));
  assert.ok(P.checkAchievements(view({}), {}, { type: 'blackjack:hand', data: {}, hour: 2 }).includes('club.owl'));
  assert.ok(!P.checkAchievements(view({}), {}, { type: 'blackjack:hand', data: {}, hour: 12 }).includes('club.owl'));
  assert.ok(!P.checkAchievements(view({}), {}, {}).includes('club.owl'), 'hour needs a round');
  const lv = P.checkAchievements(P.statView({ stats: {}, xp: 0, streak: { best: 9, weekly: { count: 2 } }, inv: { owned: new Array(12).fill('x') }, onb: { welcomed: true }, mastery: { parking: 400 * 20 } }, () => 26), {}, {});
  for (const want of ['club.level.25', 'club.streak.7', 'club.weeks.2', 'club.items', 'club.welcome', 'club.mastery']) assert.ok(lv.includes(want), want);
  assert.ok(!lv.includes('club.level.50') && !lv.includes('club.streak.14'));
});

console.log(`content-check: ${n} groups passed (${ACHIEVEMENTS.length} achievements, ${Object.keys(ITEMS).length} items, ${SEASONS.length} seasons)`);
