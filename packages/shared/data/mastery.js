/**
 * Mastery: a 20-level track per game, filled by the XP a game's rounds earn.
 * Level L to L+1 costs 80 + 40 L mastery XP (9,120 in all). Milestones at 5,
 * 10, 15 and 20 give tokens, a badge or XP. Spec: docs/retention/SPEC-content.md §3.
 */
export const MASTERY_MAX = 20;
export const masteryNeed = (level) => 80 + 40 * level;

const M = (name, a, b, c, d) => ({ name, milestones: { 5: a, 10: b, 15: c, 20: d } });
export const TRACKS = {
  blackjack: M('Blackjack', { name: 'Learner', tokens: 1 }, { name: 'Sharp', item: 'badge.sharp', tokens: 1 }, { name: 'Steady hand', tokens: 2 }, { name: 'Pit boss', tokens: 3, xp: 300 }),
  holdem: M("Hold'em", { name: 'Rounder', tokens: 1 }, { name: 'Reader', item: 'badge.reader', tokens: 1 }, { name: 'Grinder', tokens: 2 }, { name: 'Table captain', tokens: 3, xp: 300 }),
  videopoker: M('Video Poker', { name: 'Puller', tokens: 1 }, { name: 'Full pay', item: 'badge.hopper', tokens: 1 }, { name: 'Hold master', tokens: 2 }, { name: 'Royal attendant', tokens: 3, xp: 300 }),
  parking: M('Parking', { name: 'Learner', tokens: 1 }, { name: 'Valet', item: 'badge.valet', tokens: 1 }, { name: 'Tidy', tokens: 2 }, { name: "Maître d'", tokens: 3, xp: 300 }),
  racing: M('Night Drive', { name: 'Cold tyres', tokens: 1 }, { name: 'Heel and toe', item: 'badge.heel-toe', tokens: 1 }, { name: 'Smooth', tokens: 2 }, { name: 'Ghost', tokens: 3, xp: 300 }),
};
