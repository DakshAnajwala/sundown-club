// Checks packages/shared/cards.js: known hands, ordering, ties, and 7-card category
// frequencies over 200,000 random hands against the textbook figures.
//   node tools/cards-check.mjs
import { score5, best, describe, categoryOf, deck, shuffle } from '../packages/shared/cards.js';
const c = (s) => s.split(' ').map((x) => ({ rank: x[0], suit: x[1] }));
const t = (name, cards) => { const b = best(c(cards)); console.log(name.padEnd(16), describe(b.score)); return b.score; };
const rf = t('royal', 'AS KS QS JS TS 2D 3C');
const wheel = t('wheel', 'AS 2D 3C 4H 5S KD KC');
const fh = t('full house', 'KS KD KC 7H 7S 2D 3C');
const tp = t('two pair', 'KS KD 7C 7H 2S 9D 3C');
const fl = t('flush', 'AH 9H 7H 4H 2H KD KC');
console.log('order ok:', rf > fh && fh > fl && fl > wheel && wheel > tp);
console.log('kicker ok:', best(c('AS AD KC 7H 2S 3D 4C')).score > best(c('AS AD QC 7H 2S 3D 4C')).score);
console.log('split ok:', best(c('AS KD QC JH TS 2D 3C')).score === best(c('AD KS QH JC TD 2S 3H')).score);
// frequency sanity over 200k random 7-card hands
const freq = new Array(9).fill(0); const N = 200000;
for (let i = 0; i < N; i++) { const d = shuffle(deck()); freq[categoryOf(best(d.slice(0, 7)).score)]++; }
console.log('7-card freq %', freq.map((f) => (100 * f / N).toFixed(2)).join(' '));
console.log('expected  % 17.41 43.82 23.50 4.83 4.62 3.03 2.60 0.17 0.03');
