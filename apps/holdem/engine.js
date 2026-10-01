/**
 * engine.js — No-Limit Texas Hold'em table (apps/holdem/SPEC.md §3). Pure:
 * no DOM, no three.js; runs in node (tools/holdem-sim.mjs).
 *
 * The engine decides; the page animates the events it returns. Every call
 * that changes state returns an array of events:
 *   { type: 'button', seat }            dealer button moved
 *   { type: 'post', seat, amount, blind } small/big blind
 *   { type: 'hole', seat, cards }       two hole cards dealt
 *   { type: 'act', seat, action, amount, to }  fold/check/call/bet/raise/allin
 *   { type: 'street', street, cards }   flop (3), turn, river
 *   { type: 'collect' }                 bets swept into the pot
 *   { type: 'show', seat, cards, score, desc }
 *   { type: 'win', seat, amount, desc, pot }   one event per pot share
 *   { type: 'end' }
 */
import { deck, shuffle, best, describe } from '@sundown/shared/cards.js';

export function createHoldem({ seats, sb = 5, bb = 10, rand } = {}) {
  const P = seats.map((s, i) => ({ seat: i, name: s.name, stack: s.stack, human: !!s.human, style: s.style, hole: [], bet: 0, total: 0, folded: true, allIn: false, acted: false, out: s.stack <= 0 }));
  const S = { hand: 0, button: -1, board: [], deck: [], street: 'idle', toAct: -1, currentBet: 0, minRaise: bb, sb, bb, players: P };

  const live = () => P.filter((p) => !p.folded);
  const canAct = (p) => !p.folded && !p.allIn && !p.out;
  const next = (i, pred) => { for (let k = 1; k <= P.length; k++) { const j = (i + k) % P.length; if (pred(P[j])) return j; } return -1; };
  const pot = () => P.reduce((n, p) => n + p.total, 0);

  function put(p, amount) {   // move chips from stack to the current bet
    const a = Math.min(amount, p.stack);
    p.stack -= a; p.bet += a; p.total += a;
    if (p.stack === 0) p.allIn = true;
    return a;
  }

  /** opts.deck: cards in pop order (last card dealt first), for tutorials and tests; opts.button: seat to hold the button. */
  function startHand(opts = {}) {
    for (const p of P) { p.out = p.stack <= 0; p.hole = []; p.bet = 0; p.total = 0; p.folded = p.out; p.allIn = false; p.acted = false; }
    if (P.filter((p) => !p.out).length < 2) { S.street = 'idle'; return null; }
    S.hand += 1; S.board = []; S.deck = opts.deck ? opts.deck.slice() : shuffle(deck(), rand); S.street = 'preflop'; S.currentBet = bb; S.minRaise = bb;
    S.button = opts.button ?? next(S.button < 0 ? P.length - 1 : S.button, (p) => !p.out);
    const ev = [{ type: 'button', seat: S.button }];
    const headsUp = P.filter((p) => !p.out).length === 2;
    const sbSeat = headsUp ? S.button : next(S.button, (p) => !p.out);
    const bbSeat = next(sbSeat, (p) => !p.out);
    ev.push({ type: 'post', seat: sbSeat, amount: put(P[sbSeat], sb), blind: 'small' });
    ev.push({ type: 'post', seat: bbSeat, amount: put(P[bbSeat], bb), blind: 'big' });
    // deal one at a time around the table, starting left of the button, twice
    const order = []; let s = S.button;
    for (let k = 0; k < P.length; k++) { s = next(s, (p) => !p.out); if (order.includes(s)) break; order.push(s); }
    for (let r = 0; r < 2; r++) for (const i of order) P[i].hole.push(S.deck.pop());
    for (const i of order) ev.push({ type: 'hole', seat: i, cards: P[i].hole.slice() });
    S.bbSeat = bbSeat;
    const first = next(bbSeat, canAct);
    if (first === -1 || roundDone()) return ev.concat(advanceIfDone(bbSeat));   // blinds put everyone all-in
    S.toAct = first;
    return ev;
  }

  /** What the player in `seat` may do now. */
  function legal(seat = S.toAct) {
    const p = P[seat];
    const toCall = Math.min(S.currentBet - p.bet, p.stack);
    const maxTo = p.bet + p.stack;
    const minTo = Math.min(maxTo, S.currentBet + S.minRaise);
    return { seat, toCall, canCheck: toCall === 0, canRaise: maxTo > S.currentBet, minTo, maxTo, pot: pot(), currentBet: S.currentBet };
  }

  /** action: { type: 'fold'|'check'|'call'|'raise', to } ('raise' with no prior bet is a bet). */
  function act(seat, action) {
    if (seat !== S.toAct) throw new Error(`not seat ${seat}'s turn`);
    const p = P[seat], L = legal(seat), ev = [];
    let type = action.type;
    if (type === 'check' && !L.canCheck) type = 'call';
    if (type === 'call' && L.toCall === 0) type = 'check';
    if (type === 'raise' && !L.canRaise) type = L.canCheck ? 'check' : 'call';
    if (type === 'fold') { p.folded = true; ev.push({ type: 'act', seat, action: 'fold' }); }
    else if (type === 'check') ev.push({ type: 'act', seat, action: 'check' });
    else if (type === 'call') { const a = put(p, L.toCall); ev.push({ type: 'act', seat, action: p.allIn ? 'allin' : 'call', amount: a, to: p.bet }); }
    else {
      const to = Math.max(L.minTo, Math.min(L.maxTo, Math.round(action.to ?? L.minTo)));
      const raiseBy = to - S.currentBet;
      const wasBet = S.currentBet === 0;
      put(p, to - p.bet);
      if (raiseBy >= S.minRaise) { S.minRaise = raiseBy; for (const o of P) if (o !== p && canAct(o)) o.acted = false; }
      else for (const o of P) if (o !== p && canAct(o) && o.bet < to) o.acted = false;  // short all-in: others must still match it
      S.currentBet = Math.max(S.currentBet, to);
      ev.push({ type: 'act', seat, action: p.allIn ? 'allin' : wasBet ? 'bet' : 'raise', amount: to, to });
    }
    p.acted = true;
    return ev.concat(advanceIfDone(seat));
  }

  function roundDone() {
    const actors = P.filter(canAct);
    return actors.every((p) => p.acted && p.bet === S.currentBet);
  }

  function advanceIfDone(from = S.toAct) {
    const ev = [];
    if (live().length === 1) return ev.concat(finish());
    if (!roundDone()) { S.toAct = next(from === -1 ? S.button : from, (p) => canAct(p) && !(p.acted && p.bet === S.currentBet)); return ev; }
    // street over
    ev.push({ type: 'collect' });
    for (const p of P) { p.bet = 0; p.acted = false; }
    S.currentBet = 0; S.minRaise = bb;
    const deal = (n) => { S.deck.pop(); const cards = []; for (let i = 0; i < n; i++) cards.push(S.deck.pop()); S.board.push(...cards); return cards; };   // burn, then deal
    const order = ['preflop', 'flop', 'turn', 'river'];
    const stillBetting = () => P.filter(canAct).length >= 2;
    while (true) {
      const i = order.indexOf(S.street);
      if (S.street === 'river') return ev.concat(finish());
      S.street = order[i + 1];
      ev.push({ type: 'street', street: S.street, cards: deal(S.street === 'flop' ? 3 : 1) });
      if (stillBetting()) { S.toAct = next(S.button, canAct); return ev; }
      // everyone (or all but one) is all-in: run the board out
    }
  }

  function finish() {
    const ev = [];
    const contenders = live();
    if (contenders.length === 1) {
      const w = contenders[0], amount = pot();
      w.stack += amount;
      ev.push({ type: 'collect' }, { type: 'win', seat: w.seat, amount, desc: null, pot: 0 });
    } else {
      const scored = new Map();
      for (const p of contenders) { const b = best([...p.hole, ...S.board]); scored.set(p.seat, b.score); ev.push({ type: 'show', seat: p.seat, cards: p.hole.slice(), score: b.score, desc: describe(b.score), best: b.cards }); }
      // side pots by contribution level
      const levels = [...new Set(P.filter((p) => p.total > 0).map((p) => p.total))].sort((a, b) => a - b);
      let prev = 0;
      levels.forEach((lvl, potIndex) => {
        const amount = P.reduce((n, p) => n + Math.max(0, Math.min(p.total, lvl) - prev), 0);
        const eligible = contenders.filter((p) => p.total >= lvl);
        prev = lvl;
        if (!amount || !eligible.length) return;
        const top = Math.max(...eligible.map((p) => scored.get(p.seat)));
        const winners = eligible.filter((p) => scored.get(p.seat) === top);
        const share = Math.floor(amount / winners.length);
        let odd = amount - share * winners.length;
        // odd chip to the first winner left of the button
        const ordered = winners.sort((a, b) => ((a.seat - S.button + P.length) % P.length) - ((b.seat - S.button + P.length) % P.length));
        for (const w of ordered) { const got = share + (odd > 0 ? 1 : 0); odd -= 1; w.stack += got; ev.push({ type: 'win', seat: w.seat, amount: got, desc: describe(top), pot: potIndex }); }
      });
    }
    for (const p of P) { p.bet = 0; p.total = 0; }
    S.street = 'done'; S.toAct = -1;
    ev.push({ type: 'end' });
    return ev;
  }

  return { state: S, players: P, startHand, legal, act, pot };
}

/**
 * Win probability of `hole` against `opponents` random hands given `board`,
 * by Monte Carlo. Ties count as a share.
 */
export function equity(hole, board, opponents, iterations = 250, rand = Math.random) {
  const known = new Set([...hole, ...board].map((c) => c.rank + c.suit));
  const rest = deck().filter((c) => !known.has(c.rank + c.suit));
  let won = 0;
  for (let it = 0; it < iterations; it++) {
    // partial Fisher-Yates: only shuffle what we need
    const need = opponents * 2 + (5 - board.length);
    for (let i = 0; i < need; i++) { const j = i + Math.floor(rand() * (rest.length - i)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
    let k = 0;
    const fullBoard = board.concat(rest.slice(k, k + 5 - board.length)); k += 5 - board.length;
    const mine = best([...hole, ...fullBoard]).score;
    let top = 0, tied = 1, lost = false;
    for (let o = 0; o < opponents; o++) {
      const s = best([rest[k], rest[k + 1], ...fullBoard]).score; k += 2;
      if (s > mine) { lost = true; break; }
      if (s === mine) tied += 1;
      top = Math.max(top, s);
    }
    if (!lost) won += 1 / tied;
  }
  return won / iterations;
}
