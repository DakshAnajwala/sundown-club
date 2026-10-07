/**
 * seed.js — the Daily Seed: one challenge per game that is the same for every
 * player on the same UTC day, with no server. Numbering matches Parking's own
 * daily (28 Sep 2026 is #1). Pure; runs in node. Spec: docs/retention/SPEC-daily.md §7.
 */
import { hash32, mulberry32 } from './daily.js';

export const EPOCH_UTC = Date.UTC(2026, 8, 28);
const DAY_MS = 86400000;

export const utcDayOf = (date = new Date()) => date.toISOString().slice(0, 10);
export function dayNumber(date = new Date()) {
  const m = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.floor((m - EPOCH_UTC) / DAY_MS) + 1;
}
/** The 32-bit seed for one game on one day. */
export const seedFor = (game, date = new Date()) => hash32(`sundown-daily|${utcDayOf(date)}|${game}`);

/** Fisher-Yates with a seeded generator. Same list + seed = same order, in every browser. */
export function seededShuffle(list, seed) {
  const a = list.slice(), rand = mulberry32(seed);
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Milliseconds until the next seed (UTC midnight). */
export function msToNextSeed(now = Date.now()) {
  return DAY_MS - (now % DAY_MS);
}
