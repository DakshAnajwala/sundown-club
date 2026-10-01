// Checks apps/videopoker/engine.js: every pay line on known hands, the
// Jacks-or-better cut-off, and dealt-hand frequencies over 300,000 deals
// against the textbook five-card odds.
//   node tools/videopoker-check.mjs
import { classify, payFor, createMachine } from '../apps/videopoker/engine.js';

const c = (s) => s.split(' ').map((x) => ({ rank: x[0], suit: x[1] }));
const cases = [
  ['AS KS QS JS TS', 'Royal flush'], ['9H 8H 7H 6H 5H', 'Straight flush'], ['5D 4D 3D 2D AD', 'Straight flush'],
  ['QC QD QH QS 2C', 'Four of a kind'], ['3C 3D 3H 9S 9C', 'Full house'], ['AH 9H 7H 4H 2H', 'Flush'],
  ['AS 2D 3C 4H 5S', 'Straight'], ['TD JC QS KH AD', 'Straight'], ['7C 7D 7H KS 2C', 'Three of a kind'],
  ['8C 8D 4H 4S KC', 'Two pair'], ['JC JD 4H 9S 2C', 'Jacks or better'], ['AC AD 4H 9S 2C', 'Jacks or better'],
  ['TC TD 4H 9S 2C', null], ['2C 7D 9H JS KC', null],
];
let bad = 0;
for (const [h, want] of cases) { const got = classify(c(h)); if (got !== want) { bad++; console.log('FAIL', h, 'got', got, 'want', want); } }
console.log(payFor(c('AS KS QS JS TS'), 5).coins === 4000 && payFor(c('AS KS QS JS TS'), 4).coins === 1000 ? 'royal pays 4000 at max bet' : (bad++, 'FAIL royal pay'));

const N = 300000, freq = {};
const m = createMachine();
for (let i = 0; i < N; i++) { const { hand } = m.deal(1); const k = classify(hand) || 'nothing'; freq[k] = (freq[k] || 0) + 1; m.draw(); }
const expected = { 'Jacks or better': 13.0, 'Two pair': 4.75, 'Three of a kind': 2.11, Straight: 0.39, Flush: 0.197, 'Full house': 0.144 };
for (const [k, pct] of Object.entries(expected)) {
  const got = (100 * (freq[k] || 0)) / N;
  const ok = Math.abs(got - pct) < Math.max(0.06, pct * 0.06);
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${k.padEnd(16)} ${got.toFixed(3)}% (textbook ${pct}%)`);
}
console.log(bad ? `FAIL: ${bad} problems` : 'PASS');
process.exit(bad ? 1 : 0);
