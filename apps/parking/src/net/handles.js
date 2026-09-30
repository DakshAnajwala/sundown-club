/**
 * handles.js — the display names on the leaderboard.
 *
 * Names are GENERATED, never typed. That is a deliberate product decision, not
 * a shortcut: a free-text field on a public board that anyone can post to is a
 * moderation duty that never ends, and this is a site run by one person. A
 * curated wordlist cannot produce a slur, so there is nothing to filter, no
 * report queue, and no takedown process to staff.
 *
 * Both lists are ordinary, neutral English words, checked by hand. Nothing in
 * them is a body part, an insult, a group of people, a political or religious
 * term, or a word that turns rude next to another word in the other list.
 * KEEP IT THAT WAY when adding words: the pairing is what needs checking, not
 * the single word.
 *
 * The number on the end makes collisions harmless, so no uniqueness check and
 * no account are needed.
 */

const ADJECTIVES = [
  'Amber', 'Brisk', 'Calm', 'Clever', 'Copper', 'Crimson', 'Curious', 'Dapper',
  'Eager', 'Electric', 'Fearless', 'Frosty', 'Gentle', 'Gilded', 'Glacial',
  'Golden', 'Handy', 'Hasty', 'Hazel', 'Humble', 'Ivory', 'Jolly', 'Keen',
  'Lively', 'Lucky', 'Mellow', 'Merry', 'Midnight', 'Nimble', 'Noble',
  'Olive', 'Patient', 'Placid', 'Plucky', 'Polished', 'Prompt', 'Quiet',
  'Rapid', 'Royal', 'Rusty', 'Sandy', 'Scarlet', 'Silver', 'Sleepy', 'Smooth',
  'Snowy', 'Solar', 'Spry', 'Steady', 'Sterling', 'Sunny', 'Swift', 'Teal',
  'Tidy', 'Timber', 'Tranquil', 'Trusty', 'Velvet', 'Vivid', 'Wandering',
];

const NOUNS = [
  'Alder', 'Anchor', 'Aspen', 'Badger', 'Beacon', 'Birch', 'Bison', 'Boulder',
  'Brook', 'Camber', 'Canyon', 'Cedar', 'Comet', 'Compass', 'Coral', 'Cricket',
  'Dahlia', 'Delta', 'Dune', 'Ember', 'Falcon', 'Fennel', 'Fjord', 'Garnet',
  'Glacier', 'Harbour', 'Heron', 'Ibis', 'Juniper', 'Kestrel', 'Lantern',
  'Lark', 'Lupin', 'Magpie', 'Maple', 'Marble', 'Meadow', 'Mesa', 'Otter',
  'Pebble', 'Pelican', 'Pine', 'Plover', 'Quartz', 'Rapid', 'Ridge', 'Rowan',
  'Sable', 'Sequoia', 'Sparrow', 'Spruce', 'Summit', 'Thistle', 'Topaz',
  'Vector', 'Willow', 'Wren', 'Zephyr',
];

/** The shape a valid handle must have — the server checks against this too. */
export const HANDLE_RE = /^[A-Z][a-z]+ [A-Z][a-z]+ \d{3}$/;

const pick = (list) => list[Math.floor(Math.random() * list.length)];

/** A fresh handle, e.g. "Swift Otter 412". */
export function generateHandle() {
  const n = 100 + Math.floor(Math.random() * 900);
  return `${pick(ADJECTIVES)} ${pick(NOUNS)} ${n}`;
}

/**
 * True when `value` could have come out of generateHandle(). Used on both
 * sides: the client will not send anything else, and the server will not
 * store anything else, so a hand-crafted POST cannot put arbitrary text on a
 * public page.
 */
export function isValidHandle(value) {
  if (typeof value !== 'string' || !HANDLE_RE.test(value)) return false;
  const [adj, noun] = value.split(' ');
  return ADJECTIVES.includes(adj) && NOUNS.includes(noun);
}
