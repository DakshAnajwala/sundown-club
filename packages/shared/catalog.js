/**
 * catalog.js — every collectable item and its display name, in one place.
 * Ids are what the profile stores (`inv.owned`, `badges`, `inv.equipped`);
 * names, blurbs, how-to-get hints and how an item looks are only ever read from
 * here. Everything is cosmetic: no item changes odds, physics or payouts.
 * No DOM, no side effects. Spec: docs/retention/SPEC-content.md.
 *
 * Slots with a visible effect: cardBack (Blackjack, Hold'em, Video Poker),
 * felt (Blackjack, Hold'em), frame (the hub chip), backdrop (the hub sky).
 */
const item = (kind, name, blurb, rarity, extra = {}) => ({ kind, name, blurb, rarity, ...extra });

export const SLOTS = {
  cardBack: 'Card back', felt: 'Table felt', frame: 'Profile frame', backdrop: 'Hub backdrop',
};

export const ITEMS = {
  // badges (shown beside your name; pick up to three)
  'badge.night-owl': item('badge', 'Night Owl', 'Best after dark.', 'common'),
  'badge.early-bird': item('badge', 'Early Bird', 'First in, last to leave the morning light.', 'common'),
  'badge.regular': item('badge', 'Regular', 'Same seat, most nights.', 'common'),
  'badge.sharp': item('badge', 'Sharp', 'Counts cards in your head. Not in the casino sense.', 'uncommon'),
  'badge.valet': item('badge', 'Valet', 'Parks anything, anywhere.', 'uncommon'),
  'badge.heel-toe': item('badge', 'Heel and Toe', 'Smooth on the pedals.', 'uncommon'),
  'badge.card-room': item('badge', 'Card Room', 'Knows every game in the house.', 'rare'),
  'badge.lamp': item('badge', 'Lamp Keeper', 'The lamp is still on because of you.', 'epic'),
  'badge.first-light': item('badge', 'First Light', 'Season 1 finisher.', 'rare', { limited: 's1' }),
  'badge.long-shadows': item('badge', 'Long Shadows', 'Season 2 finisher.', 'rare', { limited: 's2' }),
  'badge.lamp-oil': item('badge', 'Lamp Oil', 'Season 3 finisher.', 'rare', { limited: 's3' }),
  'badge.last-call': item('badge', 'Last Call', 'Season 4 finisher.', 'rare', { limited: 's4' }),
  'badge.reader': item('badge', 'Reads the Table', 'Knows who is bluffing.', 'uncommon'),
  'badge.hopper': item('badge', 'Full Pay', 'Always plays the full-pay machine.', 'uncommon'),
  'badge.friend': item('badge', 'Good Company', 'Brought a friend to the club.', 'uncommon'),
  'badge.streaker': item('badge', 'Streaker', 'A month of evenings.', 'rare'),
  // card backs
  'cardback.default': item('cardBack', 'Copper stripe', 'The club standard.', 'common', { palette: { base: '#d6a27c', a: '#e6bf98', b: '#c98d68', line: '#f3ede2' } }),
  'cardback.dusk': item('cardBack', 'Dusk', 'Indigo after sunset.', 'uncommon', { palette: { base: '#3b3f73', a: '#4c5190', b: '#2e3260', line: '#e9d6a8' } }),
  'cardback.ember': item('cardBack', 'Ember', 'Banked coals.', 'uncommon', { palette: { base: '#b5473a', a: '#cd6a52', b: '#933a30', line: '#f3e2c4' } }),
  'cardback.moss': item('cardBack', 'Moss', 'Quiet green.', 'rare', { palette: { base: '#58765f', a: '#6f8f75', b: '#47604d', line: '#e9e3c8' } }),
  'cardback.ink': item('cardBack', 'Ink', 'Nearly black, nearly gold.', 'epic', { palette: { base: '#26242c', a: '#34313b', b: '#1d1b22', line: '#d9b25f' } }),
  // table felt
  'felt.default': item('felt', 'Room default', 'Whatever the room comes with.', 'common', { color: null }),
  'felt.midnight': item('felt', 'Midnight', 'Deep blue cloth.', 'uncommon', { color: '#2f3b5c' }),
  'felt.wine': item('felt', 'Wine', 'Burgundy cloth.', 'uncommon', { color: '#6b2f3d' }),
  'felt.slate': item('felt', 'Slate', 'Cool grey cloth.', 'rare', { color: '#4a5560' }),
  'felt.sand': item('felt', 'Sand', 'Warm linen.', 'rare', { color: '#a58d63' }),
  // hub chip frame
  'frame.none': item('frame', 'No frame', 'Plain.', 'common', { ring: null }),
  'frame.amber': item('frame', 'Amber ring', 'A thin amber line.', 'uncommon', { ring: '#f0a868' }),
  'frame.mint': item('frame', 'Mint ring', 'A thin mint line.', 'uncommon', { ring: '#8fe3cf' }),
  'frame.rose': item('frame', 'Rose ring', 'A thin rose line.', 'rare', { ring: '#d98a93' }),
  // hub backdrop (the sky colours the hub paints)
  'backdrop.default': item('backdrop', 'Golden hour', 'The club standard.', 'common', { vars: null }),
  'backdrop.violet': item('backdrop', 'Violet hour', 'A cooler dusk.', 'uncommon', { vars: { '--top': '#14102a', '--mid': '#2d2150', '--bot': '#6a4a7a', '--sun-a': '#ffd0e6', '--sun-b': '#d98aa8' } }),
  'backdrop.ember': item('backdrop', 'Ember hour', 'A red sunset.', 'rare', { vars: { '--top': '#1a0e0e', '--mid': '#4a1e18', '--bot': '#9a3d24', '--sun-a': '#ffc9a0', '--sun-b': '#e8683f' } }),
  'backdrop.mist': item('backdrop', 'Mist', 'A grey, soft evening.', 'rare', { vars: { '--top': '#10141c', '--mid': '#28323f', '--bot': '#5f6f7f', '--sun-a': '#e8eef5', '--sun-b': '#9db4c8' } }),
};

/** Items every player owns from the start. */
export const STARTER_ITEMS = ['cardback.default', 'felt.default', 'frame.none', 'backdrop.default'];
export const STARTER_BADGES = ['badge.night-owl', 'badge.early-bird', 'badge.regular'];
export const itemName = (id) => ITEMS[id]?.name || id;
export const itemsOfSlot = (slot) => Object.entries(ITEMS).filter(([, v]) => v.kind === slot).map(([id]) => id);
export const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic'];
