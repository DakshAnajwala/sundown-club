/**
 * retention.js — the glue between a finished round and the club's daily loop.
 * Games call one function:
 *
 *   const r = reportRound('blackjack', 'hand', { result: 'win', total: 20, ... });
 *   // r = { xp, level, quests, allDone, streak, ... } for the after-round panel
 *
 * The hub calls openDay() to draw the Daily Table, claim() for the daily
 * reward, reroll(i), restoreRun() and chooseRestDay(). Pure rules live in
 * daily.js and streak.js; this file only reads and writes the profile (and
 * the club bankroll for the daily reward) and sends telemetry.
 * Spec: docs/retention/SPEC-daily.md.
 */
import { today, updateProfile, readProfile, levelFor, titleFor, MAX_TOKENS } from './profile.js';
import { ensureDay, progress, claimDaily, rerollQuest, describe, REWARD, GAME_IDS } from './daily.js';
import { rollStreak, earnDay, canRestore, restoreStreak, setRestDay, runLength, weeklyCount, MAX_FREEZES } from './streak.js';
import { give } from './chips.js';
import { track } from './telemetry.js';
import { dayNumber } from './seed.js';

export const SEED_XP = 50;

const lastPlayedOf = (p) => Object.fromEntries(Object.entries(p.games).map(([g, s]) => [g, Number(s?.lastPlayed) || 0]));
const ctxOf = (p, now) => ({ player: p.id, lastPlayed: lastPlayedOf(p), now });

/** Roll the streak over missed days and make sure today's quests exist. Notes what happened for the hub. */
function settle(p, now = Date.now()) {
  const t = today(new Date(now));
  const rs = rollStreak(p.streak, t);
  p.streak = rs.streak;
  const notes = Array.isArray(p.notices) ? p.notices : [];
  for (const e of rs.events) {
    if (e.type === 'saved') { notes.push({ t: 'saved', day: e.day }); track('streak_saved'); }
    if (e.type === 'broken') { notes.push({ t: 'broken', days: e.days }); track('streak_broken', { level: e.days }); }
  }
  p.notices = notes.slice(-3);
  const fresh = p.daily.day !== t;
  p.daily = ensureDay(p.daily, t, ctxOf(p, now));
  if (fresh) for (const q of p.daily.quests) track('quest_seen', { id: q.id.slice(0, 24), tier: describe(q).tier });
  return t;
}

function view(p, t) {
  const lvl = levelFor(p.xp);
  const rest = canRestore(p.streak, t, p.tokens);
  return {
    today: t,
    tier: p.daily.tier,
    quests: p.daily.quests.map(describe),
    rerolled: p.daily.rerolled,
    canClaim: !p.daily.claimed,
    reward: { ...REWARD.claim },
    allDone: p.daily.quests.length > 0 && p.daily.quests.every((q) => q.done),
    streak: {
      days: runLength(p.streak, t), best: p.streak.best, freezes: p.streak.freezes, maxFreezes: MAX_FREEZES,
      rest: p.streak.rest, weeks: weeklyCount(p.streak, t), covered: p.streak.covered, broke: p.streak.broke, restore: rest,
      earnedToday: p.streak.last === t, playMs: p.daily.playMs,
    },
    tokens: p.tokens,
    level: { ...lvl, title: titleFor(lvl.level) },
  };
}

/** Draw the Daily Table: settle the day, return the view and any one-time notices (they are cleared). */
export function openDay(now = Date.now()) {
  return updateProfile((p) => {
    const t = settle(p, now);
    const notices = p.notices || [];
    p.notices = [];
    return { ...view(p, t), notices };
  });
}

/** Peek without writing (for a panel that must not change anything). */
export function peekDay(now = Date.now()) {
  const p = readProfile();
  const t = today(new Date(now));
  const copy = { ...p, streak: rollStreak(p.streak, t).streak, daily: ensureDay(p.daily, t, ctxOf(p, now)) };
  return view(copy, t);
}

/**
 * A round finished. `kind` is the event kind ('hand', 'park', 'run'); `data`
 * holds the fields from daily.js EVENT_FIELDS. Never throws; returns a summary
 * for the after-round panel (or null when storage is blocked).
 */
export function reportRound(game, kind, data = {}) {
  try {
    const ev = `${game}:${kind}`;
    const out = updateProfile((p) => {
      const t = settle(p);
      const before = levelFor(p.xp);
      const r = progress(p.daily, ev, data, t);
      p.daily = r.daily;
      p.xp = Math.max(0, p.xp + r.xp);
      p.tokens = Math.min(MAX_TOKENS, p.tokens + r.tokens);
      let events = [];
      if (r.justDone.length) { const e = earnDay(p.streak, t); p.streak = e.streak; events = e.events; }
      const after = levelFor(p.xp);
      const v = view(p, t);
      return { ...r, level: { ...v.level, from: before.level, leveled: after.level > before.level }, quests: v.quests.map((q) => ({ ...q, justDone: r.justDone.includes(q.id) })), streak: v.streak, streakEvents: events, tokens: p.tokens, xpTotal: p.xp };
    });
    track('round_end', { game, result: String(data.result ?? (data.won === true ? 'win' : data.won === false ? 'lose' : data.win === true ? 'win' : data.stars != null ? `stars${data.stars}` : 'done')).slice(0, 16) });
    for (const id of out.justDone) track('quest_completed', { id: id.slice(0, 24) });
    if (out.level.leveled) track('level_up', { level: out.level.level });
    for (const e of out.streakEvents) { if (e.type === 'extended' || e.type === 'started') track('streak_extended', { level: e.days }); }
    return out;
  } catch {
    return null;
  }
}

/** The one-click daily reward: XP, tokens and chips into the club bankroll. Returns the reward or null if already claimed. */
export function claim() {
  const out = updateProfile((p) => {
    const t = settle(p);
    const c = claimDaily(p.daily, t);
    if (!c.reward) return { reward: null, view: view(p, t) };
    p.daily = c.daily;
    p.xp += c.reward.xp;
    p.tokens = Math.min(MAX_TOKENS, p.tokens + c.reward.tokens);
    // Claiming is a day well spent: it never needs a round, so it also counts for the streak.
    p.streak = earnDay(p.streak, t).streak;
    return { reward: c.reward, view: view(p, t) };
  });
  if (out.reward) { give(out.reward.chips); track('daily_claimed'); track('reward_claimed', { kind: 'daily' }); }
  return out;
}

/** One free reroll a day for an unfinished quest. */
export function reroll(index) {
  return updateProfile((p) => {
    const t = settle(p);
    const r = rerollQuest(p.daily, index, ctxOf(p, Date.now()));
    if (r.ok) p.daily = r.daily;
    return { ok: r.ok, view: view(p, t) };
  });
}

/** Spend one token to restore a run broken in the last two days (once a month). */
export function restoreRun() {
  return updateProfile((p) => {
    const t = settle(p);
    const r = restoreStreak(p.streak, t, p.tokens);
    if (r.ok) { p.streak = r.streak; p.tokens -= 1; track('streak_saved', { kind: 'restore' }); }
    return { ok: r.ok, reason: r.reason, view: view(p, t) };
  });
}

/** Today's seed results as { game: result } (the profile keeps only today's). */
export function seedResults(now = Date.now()) {
  const s = readProfile().seeds;
  return s && s.n === dayNumber(new Date(now)) && s.results && typeof s.results === 'object' ? s.results : {};
}

/**
 * A Daily Seed attempt finished. The first result of the day per game is kept
 * (one attempt), pays SEED_XP and counts the day for the streak. Returns
 * { first, xp, result } where result is the kept one.
 */
export function reportSeed(game, result) {
  try {
    const n = dayNumber();
    const out = updateProfile((p) => {
      const t = settle(p);
      if (!p.seeds || p.seeds.n !== n) p.seeds = { n, results: {} };
      const kept = p.seeds.results[game];
      if (kept) return { first: false, xp: 0, result: kept };
      const clean = {};
      for (const [k, v] of Object.entries(result || {})) if (typeof v === 'number' && Number.isFinite(v)) clean[k] = v; else if (typeof v === 'string') clean[k] = v.slice(0, 40);
      p.seeds.results[game] = clean;
      p.xp += SEED_XP;
      p.streak = earnDay(p.streak, t).streak;
      return { first: true, xp: SEED_XP, result: clean };
    });
    if (out.first) track('reward_claimed', { kind: 'seed', game });
    return out;
  } catch {
    return { first: false, xp: 0, result: null };
  }
}

/** Pick the weekday (0 Sunday .. 6 Saturday) that never breaks the run, or null for none. */
export function chooseRestDay(weekday) {
  return updateProfile((p) => {
    const t = settle(p);
    p.streak = setRestDay(p.streak, weekday);
    return view(p, t);
  });
}

export { GAME_IDS };
