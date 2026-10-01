// Plays thousands of Hold'em hands with six bots and checks the engine's books:
// chips are never created or destroyed, nobody goes negative, every hand ends,
// and side pots pay out exactly what was put in.
//   node tools/holdem-sim.mjs [hands]
import { createHoldem } from '../apps/holdem/engine.js';
import { decide } from '../apps/holdem/bots.js';
import { rng } from '../packages/shared/lounge/util.js';

const HANDS = +(process.argv[2] || 3000);
const rand = rng(1234);
const styles = ['shark', 'rock', 'maniac', 'station', 'pro', 'shark'];
const seats = styles.map((style, i) => ({ name: `Bot ${i}`, stack: 300 + i * 150, style }));
const T = createHoldem({ seats, sb: 5, bb: 10, rand });
const total0 = T.players.reduce((n, p) => n + p.stack, 0);
let hands = 0, showdowns = 0, sidePots = 0, allins = 0, rebuys = 0, problems = 0;
const t0 = Date.now();
for (let h = 0; h < HANDS; h++) {
  for (const p of T.players) if (p.stack <= 0) { p.stack = 500; rebuys += 1; }
  const bank = T.players.reduce((n, p) => n + p.stack, 0);
  let ev = T.startHand();
  if (!ev) break;
  let guard = 0;
  while (T.state.street !== 'done') {
    if (guard++ > 200) { problems++; console.log('stuck hand', h, T.state); break; }
    const seat = T.state.toAct;
    ev = T.act(seat, decide(T, seat, rand));
    for (const e of ev) { if (e.type === 'show') showdowns += 0.0; if (e.type === 'win' && e.pot > 0) sidePots++; if (e.type === 'act' && e.action === 'allin') allins++; }
    if (ev.some((e) => e.type === 'show')) showdowns++;
  }
  const after = T.players.reduce((n, p) => n + p.stack, 0);
  if (after !== bank) { problems++; console.log('chips changed in hand', h, bank, '->', after); }
  if (T.players.some((p) => p.stack < 0)) { problems++; console.log('negative stack', h); }
  hands++;
}
const ms = Date.now() - t0;
console.log(`${hands} hands, ${showdowns} with a showdown, ${allins} all-ins, ${sidePots} side-pot payouts, ${rebuys} rebuys, ${(ms / hands).toFixed(1)} ms/hand`);
console.log('stacks:', T.players.map((p) => `${p.style} ${p.stack}`).join(' · '));
console.log(problems ? `FAIL: ${problems} problems` : 'PASS: chips conserved, no negative stacks, every hand finished');
process.exit(problems ? 1 : 0);
