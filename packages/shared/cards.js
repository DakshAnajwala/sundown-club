/**
 * cards.js — decks, shuffling and poker hand ranking. Pure: no DOM, no
 * three.js, runs in node (tools/cards-check.mjs).
 *
 * A card is { rank, suit }: rank one of '23456789TJQKA', suit one of 'SHDC'.
 */

export const RANKS = '23456789TJQKA';
export const SUITS = 'SHDC';
export const value = (rank) => RANKS.indexOf(rank) + 2;           // 2..14
const NAME = { 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six', 7: 'Seven', 8: 'Eight', 9: 'Nine', 10: 'Ten', 11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace' };
const PLURAL = (v) => (v === 6 ? 'Sixes' : `${NAME[v]}s`);

export function deck(n = 1) {
  const d = [];
  for (let k = 0; k < n; k++) for (const s of SUITS) for (const r of RANKS) d.push({ rank: r, suit: s });
  return d;
}

/** Uniform random integer in [0, n). Crypto by default; pass `rand` (0..1) for seeded runs. */
function pick(n, rand) {
  if (rand) return Math.floor(rand() * n);
  const u = new Uint32Array(1); globalThis.crypto.getRandomValues(u); return u[0] % n;
}
export function shuffle(cards, rand) {
  for (let i = cards.length - 1; i > 0; i--) { const j = pick(i + 1, rand); [cards[i], cards[j]] = [cards[j], cards[i]]; }
  return cards;
}

export const CATEGORY = ['High card', 'Pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush'];

/**
 * Score exactly five cards. Higher is better; equal scores tie.
 * score = category · 15^5 + tiebreak ranks in base 15.
 */
export function score5(cs) {
  const vals = cs.map((c) => value(c.rank)).sort((a, b) => b - a);
  const flush = cs.every((c) => c.suit === cs[0].suit);
  const uniq = [...new Set(vals)];
  let straightHigh = 0;
  if (uniq.length === 5) {
    if (vals[0] - vals[4] === 4) straightHigh = vals[0];
    else if (vals[0] === 14 && vals[1] === 5) straightHigh = 5;   // wheel A-2-3-4-5
  }
  const counts = {};
  for (const v of vals) counts[v] = (counts[v] || 0) + 1;
  const groups = Object.entries(counts).map(([v, n]) => [n, +v]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  let cat, kick;
  if (straightHigh && flush) { cat = 8; kick = [straightHigh]; }
  else if (groups[0][0] === 4) { cat = 7; kick = [groups[0][1], groups[1][1]]; }
  else if (groups[0][0] === 3 && groups[1][0] === 2) { cat = 6; kick = [groups[0][1], groups[1][1]]; }
  else if (flush) { cat = 5; kick = vals; }
  else if (straightHigh) { cat = 4; kick = [straightHigh]; }
  else if (groups[0][0] === 3) { cat = 3; kick = groups.map((g) => g[1]); }
  else if (groups[0][0] === 2 && groups[1][0] === 2) { cat = 2; kick = groups.map((g) => g[1]); }
  else if (groups[0][0] === 2) { cat = 1; kick = groups.map((g) => g[1]); }
  else { cat = 0; kick = vals; }
  let s = cat;
  for (let i = 0; i < 5; i++) s = s * 15 + (kick[i] || 0);
  return s;
}

export const categoryOf = (score) => Math.floor(score / 15 ** 5);

/** Best five of 5–7 cards: { score, cards }. */
export function best(cards) {
  let top = { score: -1, cards: null };
  const n = cards.length, pick5 = [];
  (function rec(start) {
    if (pick5.length === 5) { const five = pick5.map((i) => cards[i]); const s = score5(five); if (s > top.score) top = { score: s, cards: five }; return; }
    for (let i = start; i <= n - (5 - pick5.length); i++) { pick5.push(i); rec(i + 1); pick5.pop(); }
  })(0);
  return top;
}

/** "Two pair, Kings and Sevens" etc. */
export function describe(score) {
  const cat = categoryOf(score);
  const k = []; let s = score; for (let i = 0; i < 5; i++) { k.unshift(s % 15); s = Math.floor(s / 15); }
  switch (cat) {
    case 8: return k[0] === 14 ? 'Royal flush' : `Straight flush, ${NAME[k[0]]} high`;
    case 7: return `Four ${PLURAL(k[0])}`;
    case 6: return `Full house, ${PLURAL(k[0])} over ${PLURAL(k[1])}`;
    case 5: return `Flush, ${NAME[k[0]]} high`;
    case 4: return `Straight, ${NAME[k[0]]} high`;
    case 3: return `Three ${PLURAL(k[0])}`;
    case 2: return `Two pair, ${PLURAL(k[0])} and ${PLURAL(k[1])}`;
    case 1: return `Pair of ${PLURAL(k[0])}`;
    default: return `${NAME[k[0]]} high`;
  }
}
