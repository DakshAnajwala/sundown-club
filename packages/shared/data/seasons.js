/**
 * Seasons: four weeks each, a free reward track of 30 tiers driven by XP
 * earned during the season, and one limited badge at the top. After a season
 * ends its limited badge goes in the Vault, where tokens buy it, so nobody is
 * locked out and nothing is sold on a countdown. Dates are UTC. Spec:
 * docs/retention/SPEC-content.md §4.
 */
export const SEASON_DAYS = 28;
export const TIER_XP = 250;          // season XP per tier
export const TIERS = 30;
export const VAULT_PRICE = 12;       // tokens

const S = (id, name, start, palette, rewards) => ({ id, name, start, palette, rewards });
export const SEASONS = [
  S('s1', 'First Light', '2026-10-05', 'backdrop.default', { 2: { tokens: 1 }, 5: { item: 'frame.amber' }, 8: { tokens: 1 }, 10: { item: 'cardback.dusk' }, 13: { tokens: 1 }, 15: { item: 'felt.midnight' }, 18: { tokens: 1 }, 20: { item: 'backdrop.violet' }, 23: { tokens: 2 }, 25: { item: 'felt.wine' }, 28: { tokens: 2 }, 30: { item: 'badge.first-light', tokens: 3 } }),
  S('s2', 'Long Shadows', '2026-11-02', 'backdrop.violet', { 2: { tokens: 1 }, 5: { item: 'frame.mint' }, 8: { tokens: 1 }, 10: { item: 'cardback.ember' }, 13: { tokens: 1 }, 15: { item: 'felt.slate' }, 18: { tokens: 1 }, 20: { item: 'backdrop.ember' }, 23: { tokens: 2 }, 25: { item: 'frame.rose' }, 28: { tokens: 2 }, 30: { item: 'badge.long-shadows', tokens: 3 } }),
  S('s3', 'Lamp Oil', '2026-11-30', 'backdrop.ember', { 2: { tokens: 1 }, 5: { item: 'cardback.moss' }, 8: { tokens: 1 }, 10: { item: 'felt.sand' }, 13: { tokens: 1 }, 15: { item: 'backdrop.mist' }, 18: { tokens: 1 }, 20: { tokens: 2 }, 23: { tokens: 2 }, 25: { tokens: 2 }, 28: { tokens: 2 }, 30: { item: 'badge.lamp-oil', tokens: 3 } }),
  S('s4', 'Last Call', '2026-12-28', 'backdrop.mist', { 2: { tokens: 1 }, 5: { tokens: 1 }, 8: { tokens: 1 }, 10: { tokens: 2 }, 13: { tokens: 1 }, 15: { tokens: 2 }, 18: { tokens: 1 }, 20: { tokens: 2 }, 23: { tokens: 2 }, 25: { tokens: 2 }, 28: { tokens: 2 }, 30: { item: 'badge.last-call', tokens: 3 } }),
];
export const SEASON_BY_ID = Object.fromEntries(SEASONS.map((s) => [s.id, s]));

const DAY = 86400000;
export const startMs = (s) => Date.parse(`${s.start}T00:00:00Z`);
export const endMs = (s) => startMs(s) + SEASON_DAYS * DAY;

/** The season running at `now`, or null between seasons. */
export function seasonAt(now = Date.now()) {
  return SEASONS.find((s) => now >= startMs(s) && now < endMs(s)) || null;
}
/** The next season to start after `now`, or null. */
export function nextSeason(now = Date.now()) {
  return SEASONS.find((s) => startMs(s) > now) || null;
}
/** Seasons that have ended (their limited badge is in the Vault). */
export const pastSeasons = (now = Date.now()) => SEASONS.filter((s) => endMs(s) <= now);
