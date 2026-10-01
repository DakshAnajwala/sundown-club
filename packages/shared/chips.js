/**
 * chips.js — the one club bankroll shared by every casino game (owner's call,
 * 1 Oct 2026). Play money only. localStorage key "club.v1.chips":
 *
 *   { bankroll, peak, rebuys }
 *
 * Start 1,000. When the bankroll is below the smallest table minimum (10) and
 * nothing is on a table, refill() brings it back to 1,000 and counts a rebuy.
 * A game that seats chips on a table (Hold'em) takes them out with take() and
 * puts what is left back with give(); nothing is held anywhere else.
 */

const KEY = 'club.v1.chips';
export const START = 1000;
export const REFILL_BELOW = 10;

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (Number.isFinite(p?.bankroll)) return { bankroll: Math.max(0, Math.floor(p.bankroll)), peak: Number(p.peak) || 0, rebuys: Number(p.rebuys) || 0 };
    }
    // First run of the shared bankroll: adopt Blackjack's old save if there is one.
    const bj = JSON.parse(localStorage.getItem('bj.v1.main') || 'null');
    if (Number.isFinite(bj?.bankroll)) return { bankroll: Math.max(0, Math.floor(bj.bankroll)), peak: Number(bj.peak) || bj.bankroll, rebuys: 0 };
  } catch { /* fall through */ }
  return { bankroll: START, peak: START, rebuys: 0 };
}
function write(s) {
  s.peak = Math.max(s.peak, s.bankroll);
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage blocked: this session only */ }
  return s;
}

export function getChips() { return read(); }
export function setBankroll(n) { const s = read(); s.bankroll = Math.max(0, Math.floor(n)); return write(s); }
/** Remove up to `n` chips (e.g. a buy-in); returns how many were taken. */
export function take(n) { const s = read(); const got = Math.min(s.bankroll, Math.max(0, Math.floor(n))); s.bankroll -= got; write(s); return got; }
export function give(n) { const s = read(); s.bankroll += Math.max(0, Math.floor(n)); return write(s); }
export function canRefill() { return read().bankroll < REFILL_BELOW; }
export function refill() { const s = read(); if (s.bankroll >= REFILL_BELOW) return s; s.bankroll = START; s.rebuys += 1; return write(s); }
