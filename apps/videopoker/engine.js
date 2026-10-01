/**
 * engine.js — Jacks or Better video poker, full-pay 9/6 (apps/videopoker/SPEC.md §3).
 * Pure: runs in node (tools/videopoker-check.mjs).
 *
 *   const m = createMachine();
 *   m.deal(5)           -> { hand }             (bet 1–5 coins)
 *   m.toggle(i)         -> held flags
 *   m.draw()            -> { hand, result: { name, coins } | null }
 */
import { deck, shuffle, best, categoryOf, value } from '@sundown/shared/cards.js';

/** Coins paid per coin bet, for 1..5 coins. The royal jumps to 800 per coin at max bet. */
export const PAYTABLE = [
  { name: 'Royal flush', pays: [250, 500, 750, 1000, 4000] },
  { name: 'Straight flush', pays: [50, 100, 150, 200, 250] },
  { name: 'Four of a kind', pays: [25, 50, 75, 100, 125] },
  { name: 'Full house', pays: [9, 18, 27, 36, 45] },
  { name: 'Flush', pays: [6, 12, 18, 24, 30] },
  { name: 'Straight', pays: [4, 8, 12, 16, 20] },
  { name: 'Three of a kind', pays: [3, 6, 9, 12, 15] },
  { name: 'Two pair', pays: [2, 4, 6, 8, 10] },
  { name: 'Jacks or better', pays: [1, 2, 3, 4, 5] },
];

/** Which pay line a five-card hand hits, or null. */
export function classify(hand) {
  const score = best(hand).score, cat = categoryOf(score);
  if (cat === 8) return hand.some((c) => c.rank === 'A') && hand.some((c) => c.rank === 'K') ? 'Royal flush' : 'Straight flush';
  if (cat === 7) return 'Four of a kind';
  if (cat === 6) return 'Full house';
  if (cat === 5) return 'Flush';
  if (cat === 4) return 'Straight';
  if (cat === 3) return 'Three of a kind';
  if (cat === 2) return 'Two pair';
  if (cat === 1) {
    const counts = {};
    for (const c of hand) counts[c.rank] = (counts[c.rank] || 0) + 1;
    const pair = Object.keys(counts).find((r) => counts[r] === 2);
    return value(pair) >= 11 ? 'Jacks or better' : null;
  }
  return null;
}

export function payFor(hand, coins) {
  const name = classify(hand);
  if (!name) return null;
  const line = PAYTABLE.find((l) => l.name === name);
  return { name, coins: line.pays[coins - 1] };
}

export function createMachine({ rand } = {}) {
  let stack = [], hand = [], held = [false, false, false, false, false], bet = 0, phase = 'idle';
  return {
    get hand() { return hand.slice(); },
    get held() { return held.slice(); },
    get phase() { return phase; },     // 'idle' | 'dealt'
    get bet() { return bet; },
    /** opts.deck: cards in dealing order (first five are dealt, the rest are drawn in order); for tutorials and tests. */
    deal(coins, opts = {}) {
      if (phase === 'dealt') throw new Error('draw first');
      bet = Math.max(1, Math.min(5, coins | 0));
      stack = opts.deck ? opts.deck.slice() : shuffle(deck(), rand);
      hand = stack.splice(0, 5);
      held = [false, false, false, false, false];
      phase = 'dealt';
      return { hand: hand.slice(), result: payFor(hand, bet) };   // result here is only "what you hold now"
    },
    toggle(i) { if (phase === 'dealt' && i >= 0 && i < 5) held[i] = !held[i]; return held.slice(); },
    setHeld(flags) { if (phase === 'dealt') held = flags.slice(0, 5).map(Boolean); return held.slice(); },
    draw() {
      if (phase !== 'dealt') throw new Error('deal first');
      const replaced = [];
      hand = hand.map((c, i) => { if (held[i]) return c; replaced.push(i); return stack.shift(); });
      phase = 'idle';
      return { hand: hand.slice(), replaced, result: payFor(hand, bet) };
    },
  };
}
