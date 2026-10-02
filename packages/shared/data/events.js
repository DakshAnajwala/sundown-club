/**
 * Weekly goals and the weekend boost (data). A weekly goal is one long quest,
 * picked by the UTC week (Monday to Sunday), with a reward when done. Matching
 * is the same as daily quests (`event` list, `where`, `gte`, `sum`, `count`).
 * Spec: docs/retention/SPEC-content.md §5.
 */
export const WEEKLY = [
  { id: 'w-holdem', name: "Hold'em week", text: "Win 10 pots at Hold'em", events: ['holdem:hand'], where: { won: [true] }, count: 10, reward: { xp: 300, tokens: 2 } },
  { id: 'w-valet', name: 'Valet week', text: 'Earn 15 stars while parking', events: ['parking:park'], sum: 'stars', target: 15, reward: { xp: 300, tokens: 2 } },
  { id: 'w-drive', name: 'Night Drive week', text: 'Make 8 runs in the Night Drive test drive', events: ['racing:run'], count: 8, reward: { xp: 300, tokens: 2 } },
  { id: 'w-cards', name: 'Card night week', text: 'Finish 60 rounds across the card games', events: ['blackjack:hand', 'holdem:hand', 'videopoker:hand'], count: 60, reward: { xp: 300, tokens: 2 } },
];

/** Round XP is multiplied by this on Saturday and Sunday (UTC). Quest and bonus XP are not. */
export const WEEKEND_BOOST = 1.5;
