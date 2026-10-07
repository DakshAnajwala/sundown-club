/**
 * cosmetics.js — what the player has equipped, ready for the games to paint.
 * Reads the profile each call (cheap), never writes. Anything missing or
 * unknown falls back to the club default, so a page never breaks on a bad save.
 */
import { readProfile } from './profile.js';
import { ITEMS } from './catalog.js';

export function equippedId(slot) {
  try { const id = readProfile().inv.equipped[slot]; return ITEMS[id]?.kind === slot ? id : null; } catch { return null; }
}
const spec = (slot) => ITEMS[equippedId(slot)] || null;

/** Palette for the back of a card: { base, a, b, line }. */
export function cardBackPalette() { return (spec('cardBack') || ITEMS['cardback.default']).palette; }
/** The table felt colour, or `fallback` (the room's own) when none is chosen. */
export function feltColor(fallback) { return spec('felt')?.color || fallback; }
/** The ring colour for the hub chip, or null. */
export function frameRing() { return spec('frame')?.ring || null; }
/** CSS variables for the hub sky, or null for the default. */
export function backdropVars() { return spec('backdrop')?.vars || null; }
