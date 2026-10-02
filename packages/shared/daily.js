/**
 * daily.js — the Daily Table: three quests a day, picked from a template pool,
 * with progress, rerolls, difficulty that follows the player, and the daily
 * reward. Pure functions over a plain `daily` object (stored in the profile),
 * so everything is checked in node (tools/daily-check.mjs).
 * Spec: docs/retention/SPEC-daily.md. Templates: data/quests.js.
 *
 * Quests follow the player's local calendar day. Each game reports a finished
 * round as an event like `blackjack:hand` with a small data object (fields in
 * SPEC-daily.md §4); a template says which events and fields count.
 */
import data from './data/quests.js';

export const QUESTS = data.quests;
export const QUEST_BY_ID = Object.fromEntries(QUESTS.map((q) => [q.id, q]));
export const GAME_IDS = ['blackjack', 'holdem', 'videopoker', 'parking', 'racing'];
const FAMILY = { blackjack: 'cards', holdem: 'cards', videopoker: 'cards', parking: 'driving', racing: 'driving' };
const RECENT_MS = 14 * 86400000;

/** Fields each game puts in its round event. A quest template may only name these (checked by tools/daily-check.mjs). */
export const EVENT_FIELDS = {
  'blackjack:hand': ['result', 'total', 'cards', 'doubled', 'bust', 'net', 'bet'],           // result: natural | win | lose | push
  'holdem:hand': ['won', 'pot', 'showdown', 'cat', 'folded'],                                 // cat: 0 high card .. 8 straight flush
  'videopoker:hand': ['hand', 'rank', 'win', 'won', 'bet'],                                   // rank: 1 jacks or better .. 9 royal flush; won = chips
  'parking:park': ['stars', 'score', 'level', 'timeSec', 'underPar', 'clean'],
  'racing:run': ['topKmh', 'driftSec', 'car'],
};

export const REWARD = {
  claim: { xp: 100, chips: 250, tokens: 1 },   // the daily reward, one click on the hub
  quest: { 1: 40, 2: 70, 3: 110 },              // XP per finished quest, by tier
  all: { xp: 60, tokens: 1 },                   // all three done
  roundXpSoftCap: 400,                          // XP from plain rounds per day, then half rate
};

// ------------------------------------------------------------------ seeded random
export function hash32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pickWeighted = (rand, items, weight) => {
  const total = items.reduce((n, it) => n + weight(it), 0);
  let r = rand() * total;
  for (const it of items) { r -= weight(it); if (r < 0) return it; }
  return items[items.length - 1];
};

// ------------------------------------------------------------------ picking quests
/** Templates for a game at a tier (nearest tier if that one is empty), minus any in `avoid`. */
function templatesFor(game, tier, avoid) {
  const all = QUESTS.filter((q) => q.game === game && !avoid.includes(q.id));
  for (const t of [tier, tier - 1, tier + 1, tier - 2, tier + 2]) {
    const hit = all.filter((q) => q.tier === t);
    if (hit.length) return hit;
  }
  return all;
}

/**
 * Three quest ids for one day: a cards quest, a driving quest and a wild card
 * (any-game, or the game the player has touched least, kept easy).
 * lastPlayed: { game: epoch ms }. Same seed + inputs = same quests.
 */
export function pickQuests({ seed, tier = 1, lastPlayed = {}, now = Date.now(), avoid = [], slots = ['cards', 'driving', 'wild'] }) {
  const rand = mulberry32(seed);
  const chosen = [];
  const recent = (g) => now - (lastPlayed[g] || 0) < RECENT_MS && lastPlayed[g];
  const weight = (g) => (recent(g) ? 3 : 1) * (g === 'racing' ? 0.5 : 1);
  const used = () => [...avoid, ...chosen];
  const usedGames = () => chosen.map((id) => QUEST_BY_ID[id].game);
  for (const slot of slots) {
    let tpl;
    if (slot === 'wild') {
      if (rand() < 0.5) tpl = templatesFor('any', Math.min(tier, 2), used());
      else {
        const rest = GAME_IDS.filter((g) => !usedGames().includes(g));
        const pool = rest.length ? rest : GAME_IDS;
        const least = [...pool].sort((a, b) => (lastPlayed[a] || 0) - (lastPlayed[b] || 0) || a.localeCompare(b));
        const g = least[Math.floor(rand() * Math.min(2, least.length))];
        tpl = templatesFor(g, 1, used());
      }
    } else {
      const games = GAME_IDS.filter((g) => FAMILY[g] === slot);
      const g = pickWeighted(rand, games, weight);
      tpl = templatesFor(g, tier, used());
    }
    if (!tpl.length) tpl = QUESTS.filter((q) => !used().includes(q.id));
    chosen.push(tpl[Math.floor(rand() * tpl.length)].id);
  }
  return chosen;
}

// ------------------------------------------------------------------ progress
const inList = (list, v) => Array.isArray(list) && list.includes(v);

export function matches(tpl, evType, d) {
  if (tpl.event !== '*' && tpl.event !== evType) return false;
  if (tpl.where) for (const [f, list] of Object.entries(tpl.where)) if (!inList(list, d?.[f])) return false;
  if (tpl.gte) for (const [f, n] of Object.entries(tpl.gte)) if (!(Number(d?.[f]) >= n)) return false;
  return true;
}
export const targetOf = (tpl) => tpl.target ?? tpl.count ?? 1;

/** Apply one finished round to a list of quest instances. Returns { quests, justDone: [ids] }. */
export function applyEvent(quests, evType, d) {
  const game = String(evType).split(':')[0];
  const justDone = [];
  const out = quests.map((q) => {
    const tpl = QUEST_BY_ID[q.id];
    if (!tpl || q.done || !matches(tpl, evType, d)) return q;
    const n = { ...q, g: [...(q.g || [])] };
    if (tpl.distinct) { if (!n.g.includes(game)) n.g.push(game); n.p = n.g.length; }
    else if (tpl.sum) n.p = q.p + Math.max(0, Number(d?.[tpl.sum]) || 0);
    else n.p = q.p + 1;
    n.p = Math.min(n.p, targetOf(tpl));
    if (n.p >= targetOf(tpl)) { n.done = true; justDone.push(q.id); }
    return n;
  });
  return { quests: out, justDone };
}

// ------------------------------------------------------------------ the day's state
export function emptyDaily() {
  return { day: null, tier: 1, quests: [], rerolled: false, claimed: false, bonus: false, playMs: 0, roundXp: 0, rounds: 0, games: [], hist: [] };
}

export function normalizeDaily(d) {
  const o = d && typeof d === 'object' ? d : {};
  const quests = (Array.isArray(o.quests) ? o.quests : [])
    .filter((q) => q && QUEST_BY_ID[q.id])
    .map((q) => ({ id: q.id, p: Math.max(0, Number(q.p) || 0), done: !!q.done, g: Array.isArray(q.g) ? q.g.filter((x) => GAME_IDS.includes(x)) : [] }));
  return {
    day: typeof o.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.day) ? o.day : null,
    tier: [1, 2, 3].includes(o.tier) ? o.tier : 1,
    quests,
    rerolled: !!o.rerolled, claimed: !!o.claimed, bonus: !!o.bonus,
    games: (Array.isArray(o.games) ? o.games : []).filter((g) => GAME_IDS.includes(g)),
    playMs: Math.max(0, Number(o.playMs) || 0), roundXp: Math.max(0, Number(o.roundXp) || 0), rounds: Math.max(0, Number(o.rounds) || 0),
    hist: (Array.isArray(o.hist) ? o.hist : []).filter((h) => h && typeof h.d === 'string').map((h) => ({ d: h.d, n: Number(h.n) || 0 })).slice(-7),
  };
}

/** Difficulty follows the last days: three clean sweeps raise it, two empty days lower it. */
export function nextTier(tier, hist) {
  const last3 = hist.slice(-3), last2 = hist.slice(-2);
  if (last3.length === 3 && last3.every((h) => h.n >= 3)) return Math.min(3, tier + 1);
  if (last2.length === 2 && last2.every((h) => h.n === 0)) return Math.max(1, tier - 1);
  return tier;
}

/**
 * Make sure `daily` is for `today` (a local YYYY-MM-DD). On a new day the old
 * day is logged, difficulty adjusted and three fresh quests picked.
 * ctx: { player: id string, lastPlayed, now }.
 */
export function ensureDay(daily, today, ctx = {}) {
  const d = normalizeDaily(daily);
  if (d.day === today && d.quests.length) return d;
  const hist = d.day && d.quests.length ? [...d.hist, { d: d.day, n: d.quests.filter((q) => q.done).length }].slice(-7) : d.hist;
  const tier = d.day ? nextTier(d.tier, hist) : 1;
  const ids = pickQuests({ seed: hash32(`${ctx.player || 'anon'}|${today}`), tier, lastPlayed: ctx.lastPlayed, now: ctx.now, slots: ctx.slots });
  return { ...emptyDaily(), day: today, tier, quests: ids.map((id) => ({ id, p: 0, done: false, g: [] })), hist };
}

/** Swap one unfinished quest for another of the same kind. One free reroll a day. */
export function rerollQuest(daily, index, ctx = {}) {
  const d = normalizeDaily(daily);
  const q = d.quests[index];
  if (!q || q.done || d.rerolled) return { daily: d, ok: false };
  const slots = ['cards', 'driving', 'wild'];
  const ids = pickQuests({ seed: hash32(`${ctx.player || 'anon'}|${d.day}|reroll|${index}`), tier: d.tier, lastPlayed: ctx.lastPlayed, now: ctx.now, avoid: d.quests.map((x) => x.id), slots: [slots[index] || 'wild'] });
  const quests = d.quests.map((x, i) => (i === index ? { id: ids[0], p: 0, done: false, g: [] } : x));
  return { daily: { ...d, quests, rerolled: true }, ok: true };
}

/** Round XP for a finished round, with the per-day soft cap. */
export function roundXp(game, d = {}) {
  const x = { blackjack: 5 + (d.result === 'win' || d.result === 'natural' ? 5 : 0) + (d.result === 'natural' ? 10 : 0),
    holdem: 8 + (d.won ? 8 : 0),
    videopoker: 4 + (d.win ? Math.min((Number(d.rank) || 0) * 2, 18) : 0),
    parking: 10 + 5 * Math.max(0, Math.min(3, Number(d.stars) || 0)),
    racing: 8 + (Number(d.topKmh) >= 150 ? 4 : 0) }[game];
  return x || 0;
}

/**
 * Apply one finished round: quest progress, round XP (soft capped), bonus for
 * clearing all three. Returns { daily, xp, tokens, justDone: [ids], allDone }.
 * The caller adds xp/tokens to the profile.
 */
export function progress(daily, evType, d, today) {
  let day = normalizeDaily(daily);
  if (day.day !== today) day = { ...day, day: today };   // callers run ensureDay first; this is only a guard
  const game = String(evType).split(':')[0];
  const r = applyEvent(day.quests, evType, d);
  let xp = 0, tokens = 0;
  for (const id of r.justDone) xp += REWARD.quest[QUEST_BY_ID[id].tier] || 0;
  const base = roundXp(game, d);
  const room = Math.max(0, REWARD.roundXpSoftCap - day.roundXp);
  const xpRound = Math.round(Math.min(base, room) + Math.max(0, base - room) * 0.5);
  xp += xpRound;
  const quests = r.quests;
  const allDone = !day.bonus && quests.length > 0 && quests.every((q) => q.done);
  if (allDone) { xp += REWARD.all.xp; tokens += REWARD.all.tokens; }
  return { daily: { ...day, quests, bonus: day.bonus || allDone, roundXp: day.roundXp + base, rounds: day.rounds + 1, games: day.games.includes(game) ? day.games : [...day.games, game] }, xp, xpRound, tokens, justDone: r.justDone, allDone };
}

export function canClaim(daily, today) {
  const d = normalizeDaily(daily);
  return d.day === today && !d.claimed;
}
/** The one-click daily reward. Returns { daily, reward } (reward null when already claimed). */
export function claimDaily(daily, today) {
  const d = normalizeDaily(daily);
  if (d.day !== today || d.claimed) return { daily: d, reward: null };
  return { daily: { ...d, claimed: true }, reward: { ...REWARD.claim } };
}

/** A line for the UI: "Win 3 hands of Blackjack", progress 1 of 3. */
export function describe(q) {
  const tpl = QUEST_BY_ID[q.id];
  return { id: q.id, text: tpl.text, game: tpl.game, tier: tpl.tier, p: q.p, target: targetOf(tpl), done: q.done, xp: REWARD.quest[tpl.tier] };
}
