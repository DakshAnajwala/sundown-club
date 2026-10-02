/**
 * progression.js — what finished rounds add up to: lifetime stats, achievements,
 * mastery, the season track and the weekly goal. Pure functions over plain
 * objects, checked in node by tools/content-check.mjs. retention.js stores the
 * results in the profile and pays the rewards. Spec: docs/retention/SPEC-content.md.
 */
import { ACHIEVEMENTS } from './data/achievements.js';
import { TRACKS, MASTERY_MAX, masteryNeed } from './data/mastery.js';
import { SEASONS, TIER_XP, TIERS, seasonAt } from './data/seasons.js';
import { WEEKLY, WEEKEND_BOOST } from './data/events.js';
import { matches, GAME_IDS } from './daily.js';

export const XP_BY_RARITY = { common: 25, uncommon: 60, rare: 150, epic: 400 };
const FAMILY = { blackjack: 'cards', holdem: 'cards', videopoker: 'cards', parking: 'driving', racing: 'driving' };
const SHORT = { blackjack: 'bj', holdem: 'hd', videopoker: 'vp', parking: 'pk', racing: 'rc' };
const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);

// ------------------------------------------------------------------ lifetime stats
/** { sum: {key: n}, max: {key: n} } a finished round adds. Keys are the ones achievements name. */
export function statDeltas(game, d = {}) {
  const sum = { rounds: 1, [`${SHORT[game]}.rounds`]: 1 }, max = {};
  const yes = (c) => (c ? 1 : 0);
  if (game === 'blackjack') {
    const win = d.result === 'win' || d.result === 'natural';
    Object.assign(sum, { 'bj.hands': 1, 'bj.wins': yes(win), 'bj.naturals': yes(d.result === 'natural'), 'bj.pushes': yes(d.result === 'push'), 'bj.busts': yes(d.bust), 'bj.doubleWins': yes(d.doubled && win), 'bj.fiveCard': yes(win && num(d.cards) >= 5), 'bj.chipsWon': Math.max(0, num(d.net)) });
    max['bj.bestNet'] = num(d.net);
  } else if (game === 'holdem') {
    const won = !!d.won, show = !!d.showdown, cat = num(d.cat);
    Object.assign(sum, { 'hd.hands': 1, 'hd.wins': yes(won), 'hd.showdownWins': yes(won && show), 'hd.noFoldWins': yes(won && !show), 'hd.straightPlus': yes(won && show && cat >= 4), 'hd.folds': yes(d.folded) });
    if (won) max['hd.biggestPot'] = num(d.pot);
  } else if (game === 'videopoker') {
    const rank = num(d.rank), win = !!d.win;
    Object.assign(sum, { 'vp.hands': 1, 'vp.wins': yes(win), 'vp.maxBets': yes(num(d.bet) === 5), 'vp.chipsWon': Math.max(0, num(d.won)) });
    max['vp.bestRank'] = win ? rank : 0;
  } else if (game === 'parking') {
    const stars = Math.max(0, Math.min(3, num(d.stars))), score = num(d.score);
    Object.assign(sum, { 'pk.parks': 1, 'pk.stars': stars, 'pk.threeStars': yes(stars === 3), 'pk.perfect': yes(score >= 98), 'pk.clean': yes(d.clean), 'pk.underPar': yes(d.underPar) });
    max['pk.bestScore'] = score;
  } else if (game === 'racing') {
    sum['rc.runs'] = 1;
    max['rc.topKmh'] = num(d.topKmh); max['rc.drift'] = num(d.driftSec);
  }
  if (d.result === 'win' || d.result === 'natural' || d.won === true || d.win === true || num(d.stars) >= 1 || num(d.topKmh) >= 100) sum['wins.any'] = 1;
  return { sum, max };
}

/**
 * New stats after a round (a new object). Also tracks win streaks, which games and
 * families have been seen, and the games played today (ctx.dayGames, a list).
 */
export function applyStats(stats, game, d, ctx = {}) {
  const s = { ...(stats || {}) };
  const { sum, max } = statDeltas(game, d);
  for (const [k, v] of Object.entries(sum)) s[k] = num(s[k]) + v;
  for (const [k, v] of Object.entries(max)) s[k] = Math.max(num(s[k]), v);
  if (game === 'blackjack') {
    s['bj.streak'] = d.result === 'win' || d.result === 'natural' ? num(s['bj.streak']) + 1 : d.result === 'push' ? num(s['bj.streak']) : 0;
    s['bj.bestStreak'] = Math.max(num(s['bj.bestStreak']), s['bj.streak']);
  }
  s[`seen.${game}`] = 1;
  s['games.seen'] = GAME_IDS.filter((g) => s[`seen.${g}`]).length;
  s['families.seen'] = new Set(GAME_IDS.filter((g) => s[`seen.${g}`]).map((g) => FAMILY[g])).size;
  s['day.games'] = new Set(ctx.dayGames || []).size;
  return s;
}

/** Counters the profile itself answers (level, streak, items, mastery), merged over the stored stats. */
export function statView(p, levelOf) {
  const m = p.mastery || {};
  return {
    ...(p.stats || {}),
    level: levelOf(p.xp),
    'streak.best': p.streak?.best || 0,
    'weekly.best': p.streak?.weekly?.count || 0,
    'items.owned': (p.inv?.owned || []).length,
    'mastery.best': Math.max(0, ...GAME_IDS.map((g) => masteryLevel(m[g] || 0).level)),
    welcomed: p.onb?.welcomed ? 1 : 0,
  };
}

// ------------------------------------------------------------------ achievements
/** Achievement ids newly earned. `have` is an object of already unlocked ids. ev: { type, data, hour } for the round just played, if any. */
export function checkAchievements(view, have, ev = {}) {
  const out = [];
  for (const a of ACHIEVEMENTS) {
    if (have[a.id]) continue;
    let ok = false;
    if (a.stat) ok = num(view[a.stat]) >= a.gte;
    else if (a.on && ev.type) ok = matches({ event: a.on, where: a.where, gte: a.gte }, ev.type, ev.data || {});
    else if (a.hour && ev.type) ok = a.hour.includes(ev.hour);
    if (ok) out.push(a.id);
  }
  return out;
}

// ------------------------------------------------------------------ mastery
export function masteryLevel(xp) {
  let level = 1, left = Math.max(0, num(xp));
  while (level < MASTERY_MAX && left >= masteryNeed(level)) { left -= masteryNeed(level); level += 1; }
  return level >= MASTERY_MAX ? { level: MASTERY_MAX, into: left, next: 0 } : { level, into: left, next: masteryNeed(level) };
}
/** Add mastery XP for a game. Returns { xp, level, from, milestones: [{level, name, ...reward}] }. */
export function addMastery(mastery, game, gain) {
  const had = num(mastery?.[game]), xp = had + Math.max(0, gain);
  const from = masteryLevel(had).level, level = masteryLevel(xp).level, track = TRACKS[game];
  const milestones = [];
  for (let l = from + 1; l <= level; l++) if (track?.milestones[l]) milestones.push({ level: l, ...track.milestones[l] });
  return { xp, level, from, milestones };
}

// ------------------------------------------------------------------ seasons
/** How many tiers `xp` season XP unlocks (0..30). */
export const tiersFor = (xp) => Math.min(TIERS, Math.floor(Math.max(0, num(xp)) / TIER_XP));
/** Tier numbers that have a reward, are unlocked and not yet claimed. */
export function claimableTiers(season, xp, claimed = []) {
  if (!season) return [];
  const t = tiersFor(xp);
  return Object.keys(season.rewards).map(Number).filter((n) => n <= t && !claimed.includes(n)).sort((a, b) => a - b);
}

// ------------------------------------------------------------------ the weekly goal
const DAY = 86400000;
/** Monday (UTC) of the week of `now`, as YYYY-MM-DD. */
export function weekStartUtc(now = Date.now()) {
  const d = new Date(Math.floor(now / DAY) * DAY);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
/** This week's goal and its week key. The rotation is the number of weeks since 5 Oct 2026. */
export function weeklyFor(now = Date.now()) {
  const wk = weekStartUtc(now);
  const n = Math.floor((Date.parse(`${wk}T00:00:00Z`) - Date.parse('2026-10-05T00:00:00Z')) / (7 * DAY));
  return { week: wk, goal: WEEKLY[((n % WEEKLY.length) + WEEKLY.length) % WEEKLY.length] };
}
export const weeklyTarget = (g) => g.target ?? g.count ?? 1;
/** Progress one weekly goal state { week, id, p, done } by a round. Returns { state, justDone }. */
export function weeklyProgress(state, goal, evType, d) {
  if (!state || state.done || !goal.events.includes(evType)) return { state, justDone: false };
  if (!matches({ event: evType, where: goal.where, gte: goal.gte }, evType, d)) return { state, justDone: false };
  const p = Math.min(weeklyTarget(goal), state.p + (goal.sum ? Math.max(0, num(d?.[goal.sum])) : 1));
  const done = p >= weeklyTarget(goal);
  return { state: { ...state, p, done }, justDone: done };
}

/** Round XP gets +50% on Saturday and Sunday (UTC). */
export function xpMultiplier(now = Date.now()) {
  const day = new Date(now).getUTCDay();
  return day === 0 || day === 6 ? WEEKEND_BOOST : 1;
}

export { seasonAt, SEASONS };
