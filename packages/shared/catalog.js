/**
 * catalog.js — every collectable item and its display name, in one place.
 * Ids are what the profile stores (`inv.owned`, `badges`, `inv.equipped`);
 * names and blurbs are only ever read from here. Grows with Phase 4
 * (docs/retention/SPEC-content.md). No DOM, no side effects.
 */
export const ITEMS = {
  'badge.night-owl': { kind: 'badge', name: 'Night Owl', blurb: 'Best after dark.', rarity: 'common' },
  'badge.early-bird': { kind: 'badge', name: 'Early Bird', blurb: 'First in, last to leave the morning light.', rarity: 'common' },
  'badge.regular': { kind: 'badge', name: 'Regular', blurb: 'Same seat, most nights.', rarity: 'common' },
};

export const STARTER_BADGES = ['badge.night-owl', 'badge.early-bird', 'badge.regular'];
export const itemName = (id) => ITEMS[id]?.name || id;
