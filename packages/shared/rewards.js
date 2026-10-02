/**
 * rewards.js — applies the content layer to a profile object (the `p` that
 * retention.js edits inside updateProfile): lifetime stats, mastery, the weekly
 * goal, achievements, the season track, the Vault. Rules live in progression.js
 * and data/*.js; this file only edits `p` and says what happened.
 * Spec: docs/retention/SPEC-content.md.
 */
import { ITEMS } from './catalog.js';
import { levelFor, MAX_TOKENS } from './profile.js';
import { roundXp } from './daily.js';
import { ACHIEVEMENTS, ACHIEVEMENT_BY_ID } from './data/achievements.js';
import { TRACKS } from './data/mastery.js';
import { SEASONS, SEASON_BY_ID, TIERS, TIER_XP, VAULT_PRICE, seasonAt, pastSeasons, endMs } from './data/seasons.js';
import * as P from './progression.js';

const DUP_TOKENS = 2;   // a reward you already own pays tokens instead

/** Put an item in the collection. A duplicate pays DUP_TOKENS. Returns { item, dup, tokens }. */
export function giveItem(p, id, now = Date.now()) {
  if (!ITEMS[id]) return null;
  if (p.inv.owned.includes(id)) { p.tokens = Math.min(MAX_TOKENS, p.tokens + DUP_TOKENS); return { item: id, dup: true, tokens: DUP_TOKENS }; }
  p.inv.owned.push(id); p.found[id] = now;
  return { item: id, dup: false, tokens: 0 };
}

/** Pay a { xp?, tokens?, item? } reward. Returns what was given. */
export function giveReward(p, r = {}, now = Date.now()) {
  const out = { xp: 0, tokens: 0, item: null, dup: false };
  if (r.xp) { p.xp += r.xp; out.xp = r.xp; }
  if (r.tokens) { const t = Math.min(MAX_TOKENS, p.tokens + r.tokens); out.tokens += t - p.tokens; p.tokens = t; }
  if (r.item) { const g = giveItem(p, r.item, now); if (g) { out.item = g.item; out.dup = g.dup; out.tokens += g.tokens; } }
  return out;
}

export const bumpStat = (p, key, n = 1) => { p.stats[key] = (Number(p.stats[key]) || 0) + n; };

/**
 * A new season has started: pay every unclaimed tier of the last one (rewards are
 * never lost), say so in a notice, and start the new track at zero.
 */
export function rollSeason(p, now = Date.now()) {
  const s = seasonAt(now);
  if (!s || (p.season && p.season.id === s.id)) return null;
  let paid = null;
  const old = p.season && SEASON_BY_ID[p.season.id];
  if (old) {
    const tiers = P.claimableTiers(old, p.season.xp, p.season.claimed);
    if (tiers.length) {
      const xpBefore = p.xp;
      for (const t of tiers) giveReward(p, old.rewards[t], now);
      p.season.claimed = [...p.season.claimed, ...tiers];
      if (tiers.includes(TIERS)) bumpStat(p, 'seasons.done');
      paid = { name: old.name, n: tiers.length };
      p.notices = [...(Array.isArray(p.notices) ? p.notices : []), { t: 'season', name: old.name, n: tiers.length }].slice(-3);
      runAchievements(p, {}, now);
      void xpBefore;
    }
  }
  p.season = { id: s.id, xp: 0, claimed: [] };
  return paid;
}

/** Season XP: everything the profile gained since `xpBefore` counts towards the running season. */
export function seasonSync(p, now, xpBefore) {
  const s = seasonAt(now);
  if (!s) return 0;
  rollSeason(p, now);
  if (!p.season || p.season.id !== s.id) p.season = { id: s.id, xp: 0, claimed: [] };
  const gain = Math.max(0, p.xp - xpBefore);
  p.season.xp += gain;
  return gain;
}

/** Unlock whatever is newly earned (a few passes, since rewards can unlock more). Returns [{ id, name, rarity, xp, reward }]. */
export function runAchievements(p, ev, now = Date.now()) {
  const out = [];
  for (let pass = 0; pass < 4; pass++) {
    const ids = P.checkAchievements(P.statView(p, (xp) => levelFor(xp).level), p.achv, pass === 0 ? ev : {});
    if (!ids.length) break;
    for (const id of ids) {
      const a = ACHIEVEMENT_BY_ID[id];
      p.achv[id] = now;
      const xp = P.XP_BY_RARITY[a.rarity];
      const reward = giveReward(p, { xp, ...(a.reward || {}) }, now);
      out.push({ id, name: a.name, rarity: a.rarity, xp, reward });
    }
  }
  return out;
}

/** The weekly goal state for this week (a fresh one when the week or goal changed). */
export function weeklyState(p, now) {
  const { week, goal } = P.weeklyFor(now);
  if (!p.weekly || p.weekly.week !== week || p.weekly.id !== goal.id) p.weekly = { week, id: goal.id, p: 0, done: false };
  return { state: p.weekly, goal };
}

/**
 * Everything a finished round adds beyond the daily table: stats, weekend boost,
 * mastery, the weekly goal, achievements, season XP. `ctx`: { game, kind, data,
 * now, xpBefore, xpRound (round XP the daily table paid), justDone, allDone }.
 * Returns what the after-round note and telemetry need.
 */
export function afterRound(p, ctx) {
  const { game, kind, data, now, xpBefore } = ctx;
  const evType = `${game}:${kind}`;
  p.stats = P.applyStats(p.stats, game, data, { dayGames: p.daily.games });
  if (ctx.justDone?.length) bumpStat(p, 'quests.done', ctx.justDone.length);
  if (ctx.allDone) bumpStat(p, 'allclears');
  // weekend boost on round XP only
  const mult = P.xpMultiplier(now);
  const boost = mult > 1 ? Math.floor((ctx.xpRound || 0) * (mult - 1)) : 0;
  if (boost) p.xp += boost;
  // mastery
  const m = P.addMastery(p.mastery, game, roundXp(game, data));
  p.mastery = { ...p.mastery, [game]: m.xp };
  const milestones = m.milestones.map((ms) => ({ ...ms, given: giveReward(p, { xp: ms.xp, tokens: ms.tokens, item: ms.item }, now) }));
  // the weekly goal
  const { state, goal } = weeklyState(p, now);
  const w = P.weeklyProgress(state, goal, evType, data);
  p.weekly = w.state;
  let weekly = { name: goal.name, text: goal.text, p: p.weekly.p, target: P.weeklyTarget(goal), done: p.weekly.done, justDone: w.justDone };
  if (w.justDone) { bumpStat(p, 'weekly.done'); weekly.reward = giveReward(p, goal.reward, now); }
  const unlocked = runAchievements(p, { type: evType, data, hour: new Date(now).getHours() }, now);
  const seasonGain = seasonSync(p, now, xpBefore);
  return { unlocked, boost, mastery: { game, level: m.level, from: m.from, leveled: m.level > m.from, milestones }, weekly, seasonGain };
}

/** After a non-round gain (claim, seed, welcome, invite): count a stat, run achievements, add season XP. Returns the unlocked list. */
export function afterEvent(p, { stat, n = 1, now = Date.now(), xpBefore = p.xp } = {}) {
  if (stat) bumpStat(p, stat, n);
  const unlocked = runAchievements(p, {}, now);
  seasonSync(p, now, xpBefore);
  return unlocked;
}

// ------------------------------------------------------------------ season track and Vault
/** Claim one tier of the season the profile is on (rewards are never lost when a season ends). Returns { ok, reward?, reason? }. */
export function claimSeasonTier(p, tier, now = Date.now()) {
  const s = p.season && SEASON_BY_ID[p.season.id];
  if (!s) return { ok: false, reason: 'no season' };
  if (!P.claimableTiers(s, p.season.xp, p.season.claimed).includes(tier)) return { ok: false, reason: 'not ready' };
  const xpBefore = p.xp;
  const reward = giveReward(p, s.rewards[tier], now);
  p.season.claimed = [...p.season.claimed, tier];
  const top = tier === TIERS ? afterEvent(p, { stat: 'seasons.done', now, xpBefore }) : afterEvent(p, { now, xpBefore });
  return { ok: true, reward, tier, unlocked: top };
}

/** The Vault: a limited item from a finished season, for tokens. Returns { ok, reason? }. */
export function buyFromVault(p, id, now = Date.now()) {
  const it = ITEMS[id];
  const past = pastSeasons(now).map((s) => s.id);
  if (!it || !it.limited || !past.includes(it.limited)) return { ok: false, reason: 'not in the vault' };
  if (p.inv.owned.includes(id)) return { ok: false, reason: 'owned' };
  if (p.tokens < VAULT_PRICE) return { ok: false, reason: 'tokens' };
  p.tokens -= VAULT_PRICE; p.inv.owned.push(id); p.found[id] = now;
  return { ok: true, item: id, unlocked: afterEvent(p, { now }) };
}

// ------------------------------------------------------------------ what the hub draws
const itemSources = (() => {
  const src = {};
  for (const s of SEASONS) for (const [t, r] of Object.entries(s.rewards)) if (r.item) (src[r.item] ||= []).push(`Season: ${s.name}, tier ${t}`);
  for (const a of ACHIEVEMENTS) if (a.reward?.item) (src[a.reward.item] ||= []).push(`Achievement: ${a.hidden ? 'a hidden one' : a.name}`);
  for (const [g, t] of Object.entries(TRACKS)) for (const [l, m] of Object.entries(t.milestones)) if (m.item) (src[m.item] ||= []).push(`${t.name} mastery ${l}`);
  return src;
})();

export function progressView(p, now = Date.now()) {
  const view = P.statView(p, (xp) => levelFor(xp).level);
  const items = Object.entries(ITEMS).map(([id, it]) => ({
    id, kind: it.kind, name: it.name, blurb: it.blurb, rarity: it.rarity, limited: it.limited || null,
    owned: p.inv.owned.includes(id), equipped: it.kind !== 'badge' ? p.inv.equipped[it.kind] === id : p.badges.includes(id),
    hint: (itemSources[id] || ['Starter']).join(' · '),
  }));
  const achievements = ACHIEVEMENTS.map((a) => {
    const have = p.achv[a.id] || 0, masked = a.hidden && !have;
    return { id: a.id, name: masked ? 'Hidden' : a.name, text: masked ? 'Keep playing to find this one.' : a.text, rarity: a.rarity, hidden: !!a.hidden, have, progress: a.stat && !have ? { cur: Math.min(Number(view[a.stat]) || 0, a.gte), target: a.gte } : null };
  });
  const mastery = Object.entries(TRACKS).map(([g, t]) => {
    const ml = P.masteryLevel(p.mastery[g] || 0);
    return { game: g, name: t.name, ...ml, milestones: Object.entries(t.milestones).map(([l, m]) => ({ level: Number(l), name: m.name, reached: ml.level >= Number(l), tokens: m.tokens || 0, item: m.item || null, xp: m.xp || 0 })) };
  });
  const s = seasonAt(now), cur = s && p.season?.id === s.id ? p.season : null, live = s ? (cur || { id: s.id, xp: 0, claimed: [] }) : p.season;
  const sSpec = (live && SEASON_BY_ID[live.id]) || null;
  const season = sSpec ? {
    id: sSpec.id, name: sSpec.name, active: !!s && s.id === sSpec.id, xp: live.xp, tier: P.tiersFor(live.xp), tiers: TIERS, tierXp: TIER_XP,
    into: live.xp % TIER_XP, msLeft: s && s.id === sSpec.id ? endMs(s) - now : 0,
    rewards: Object.entries(sSpec.rewards).map(([t, r]) => ({ tier: Number(t), ...r, unlocked: P.tiersFor(live.xp) >= Number(t), claimed: live.claimed.includes(Number(t)) })),
  } : null;
  const { state, goal } = (() => { const q = { weekly: p.weekly }; const r = weeklyState(q, now); return r; })();
  const weekly = { name: goal.name, text: goal.text, p: state.p, target: P.weeklyTarget(goal), done: state.done, reward: goal.reward };
  const vault = pastSeasons(now).flatMap((sp) => Object.values(sp.rewards).filter((r) => r.item && ITEMS[r.item]?.limited === sp.id).map((r) => ({ id: r.item, name: ITEMS[r.item].name, season: sp.name, price: VAULT_PRICE, owned: p.inv.owned.includes(r.item), canBuy: !p.inv.owned.includes(r.item) && p.tokens >= VAULT_PRICE })));
  return { items, achievements, mastery, season, weekly, vault, found: achievements.filter((a) => a.have).length, total: achievements.length, nextSeason: s ? null : (SEASONS.find((x) => Date.parse(`${x.start}T00:00:00Z`) > now) || null) };
}
