/**
 * names.js — the evening-name word lists ("Amber Heron"), shared by the
 * browser (profile.js, a random name per browser) and the board server
 * (api/_lib/board.js, a name made from the player's id so nobody can type one).
 * No DOM, no side effects.
 */
export const NAME_A = ['Amber', 'Copper', 'Dusky', 'Ember', 'Golden', 'Hazy', 'Indigo', 'Late', 'Low', 'Mellow',
  'Quiet', 'Rosy', 'Russet', 'Saffron', 'Silver', 'Slow', 'Tawny', 'Velvet', 'Violet', 'Warm'];
export const NAME_B = ['Badger', 'Curlew', 'Finch', 'Fox', 'Hare', 'Heron', 'Kestrel', 'Lark', 'Lynx', 'Marten',
  'Moth', 'Nightjar', 'Otter', 'Owl', 'Plover', 'Raven', 'Starling', 'Swift', 'Tern', 'Wren'];

/** A board name from a 32-bit seed: "Amber Heron 42". Same seed, same name. */
export function boardNameFor(seed) {
  let s = seed >>> 0;
  const next = () => { s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0; s ^= s >>> 13; return s >>> 0; };
  return `${NAME_A[next() % NAME_A.length]} ${NAME_B[next() % NAME_B.length]} ${2 + (next() % 98)}`;
}
