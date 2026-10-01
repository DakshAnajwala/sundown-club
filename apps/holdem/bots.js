/**
 * bots.js — the faceless regulars at the Hold'em table (SPEC §5). Each has a
 * style; all of them decide from Monte Carlo equity, pot odds and a little
 * randomness, so they are beatable but not silly. Pure, runs in node.
 */
import { equity } from './engine.js';

/** loose: added to equity before deciding; agg: chance to bet/raise strength; bluff: chance to bet nothing; stick: extra will to call. */
export const STYLES = {
  rock: { label: 'Tight', loose: -0.06, agg: 0.3, bluff: 0.02, stick: 0 },
  shark: { label: 'Sharp', loose: 0, agg: 0.7, bluff: 0.07, stick: 0.02 },
  maniac: { label: 'Wild', loose: 0.08, agg: 0.85, bluff: 0.24, stick: 0.04 },
  station: { label: 'Sticky', loose: 0.1, agg: 0.15, bluff: 0.01, stick: 0.14 },
  pro: { label: 'Steady', loose: 0.02, agg: 0.55, bluff: 0.1, stick: 0.03 },
};

/** Returns { type, to } for engine.act(). */
export function decide(table, seat, rand = Math.random) {
  const S = table.state, me = table.players[seat], st = STYLES[me.style] || STYLES.pro;
  const L = table.legal(seat);
  const opponents = table.players.filter((p) => !p.folded && p.seat !== seat).length;
  const eq = equity(me.hole, S.board, Math.max(1, opponents), S.board.length ? 220 : 160, rand);
  const rel = eq * (opponents + 1);               // 1.0 = a fair share of the pot
  const pot = L.pot;
  const potOdds = L.toCall / (pot + L.toCall || 1);
  const size = (f) => Math.round(Math.max(L.minTo, Math.min(L.maxTo, S.currentBet + f * (pot + L.toCall))));
  const r = rand();
  if (L.toCall === 0) {
    if (rel > 1.55 && r < st.agg + 0.25) return { type: 'raise', to: size(0.55 + rand() * 0.35) };
    if (rel > 1.15 && r < st.agg * 0.6) return { type: 'raise', to: size(0.5) };
    if (r < st.bluff) return { type: 'raise', to: size(0.5) };
    return { type: 'check' };
  }
  // Pre-flop, most hands are folded to a bet: only hands better than a fair
  // share play, looser styles a bit below that.
  if (S.street === 'preflop' && rel < 1.25 - st.loose * 2.5 - st.stick * 1.5) return { type: 'fold' };
  const willing = eq + st.loose + st.stick;
  if (willing > potOdds * 1.05) {
    if (rel > 1.75 && L.canRaise && r < st.agg) return { type: 'raise', to: size(0.75 + rand() * 0.5) };
    return { type: 'call' };
  }
  if (L.canRaise && r < st.bluff * 0.5 && L.toCall < me.stack * 0.3) return { type: 'raise', to: size(0.8) };
  return { type: 'fold' };
}
