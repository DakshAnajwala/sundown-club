/**
 * cast.js — every person and crew in the story, as data (design/SPEC-models.md §2).
 *
 * Figure.js turns an `outfit` into a faceless mannequin (SPEC-game §1 #6:
 * faceless stylised characters, recognised by their car and their colour).
 * Story scenes read `subtitle` for the speaker's name colour (SPEC-game §11).
 * Heights are to the top of the head, without hair or headwear, in metres.
 *
 * Colours are chosen for the night palette: every crew colour must still read
 * under sodium street light, and every subtitle colour on the dark letterbox.
 */

/** The four crews, Voss's people and the police. `car` is a StoryCars.js id. */
export const CREWS = {
  tidewater: { name: 'Tidewater', district: 'Harbour', color: 0x3fa7a0, dark: 0x1f5f63, light: 0x8fd6cf },
  lantern: { name: 'Lantern', district: 'Old Town', color: 0xe0a043, dark: 0x5a2a2a, light: 0xf2cf8a },
  ironside: { name: 'Ironside', district: 'Rail yards', color: 0xa5573a, dark: 0x3c3f44, light: 0xd9a27f },
  summit: { name: 'Summit', district: 'Calder Ridge', color: 0xc9d6e3, dark: 0x5b6b80, light: 0xeef3f8 },
  voss: { name: 'Voss', district: 'Waterfront', color: 0x2a2d33, dark: 0x17181c, light: 0xe6dfcf },
  police: { name: 'Port Calder Police', district: 'City', color: 0x23324a, dark: 0x161f2e, light: 0xe8e6df },
};

/** Shared tones. Faceless mannequins: one matte tone for heads and hands. */
export const TONES = {
  mannequin: 0xbdb5aa,
  black: 0x222428,
  charcoal: 0x34373d,
  white: 0xe6e2da,
  denim: 0x3b4a63,
  denimLight: 0x7f95b5,
  khaki: 0x6f6a58,
  brown: 0x4a3a2e,
  hairDark: 0x231f1d,
  hairBrown: 0x4a3a30,
  hairGrey: 0x8a8885,
  hairSilver: 0xd2d3d8,
};

/**
 * Outfit fields (all optional except colours used):
 *   height, shoulders, hips, girth   body (multipliers on an average build)
 *   hair      { style: 'none'|'short'|'bun'|'ponytail'|'long', color }
 *   headwear  { style: 'cap'|'capBack'|'beanie'|'peaked'|'hood', color, accent }
 *   top       { style: 'tee'|'shirt'|'jacket'|'bomber'|'hoodie'|'suit'|'uniform', color, accent }
 *   coat      { color } long coat to the knee, over the top
 *   vest      { style: 'valet'|'hivis', color }
 *   overalls  { color } bib and legs; sleeves tied round the waist in the same colour
 *   legs      { color, style: 'trousers'|'cargo' }
 *   shoes     { color, style: 'shoes'|'boots'|'trainers' }
 *   extras    ['gloves', 'scarf', 'tie', 'badge', 'belt', 'nameBadge']
 *   gloves, scarf, tie, accent   colours for those extras
 */
export const CAST = {
  you: {
    id: 'you',
    name: 'You',
    role: 'The valet. Never speaks on screen.',
    crew: null,
    car: 'starter',
    subtitle: null,
    outfit: {
      height: 1.76,
      hair: { style: 'short', color: TONES.hairDark },
      top: { style: 'shirt', color: TONES.white },
      vest: { style: 'valet', color: 0x8e2f2f },
      legs: { color: TONES.black },
      shoes: { color: TONES.black, style: 'shoes' },
      extras: ['nameBadge'],
    },
  },
  // After the prologue the valet waistcoat goes; the red stays (the car is red).
  youStreet: {
    id: 'youStreet',
    name: 'You',
    role: 'The player from chapter 1 on.',
    crew: null,
    car: 'starter',
    subtitle: null,
    outfit: {
      height: 1.76,
      hair: { style: 'short', color: TONES.hairDark },
      top: { style: 'jacket', color: TONES.charcoal, accent: 0xa13a34 },
      legs: { color: TONES.denim },
      shoes: { color: TONES.white, style: 'trainers' },
      extras: [],
    },
  },
  mara: {
    id: 'mara',
    name: 'Mara',
    role: 'Runs a small garage in Harbour. Mentor. Used to race for Voss.',
    crew: null,
    car: 'tow',
    subtitle: 0xf0a060,
    outfit: {
      height: 1.68,
      shoulders: 0.96,
      hips: 1.04,
      hair: { style: 'bun', color: TONES.hairGrey },
      top: { style: 'tee', color: TONES.charcoal },
      overalls: { color: 0xd9773a },
      legs: { color: 0xd9773a },
      shoes: { color: TONES.brown, style: 'boots' },
      extras: ['gloves'],
      gloves: 0x3a3330,
    },
  },
  jax: {
    id: 'jax',
    name: 'Jax',
    role: 'The racer whose car you took. Talks too much.',
    crew: null,
    car: null,
    subtitle: 0xe6c85a,
    outfit: {
      height: 1.8,
      shoulders: 0.94,
      girth: 0.92,
      hair: { style: 'short', color: TONES.hairBrown },
      headwear: { style: 'capBack', color: 0x5b3f8c },
      top: { style: 'bomber', color: 0xd9b43c, accent: 0x5b3f8c },
      legs: { color: TONES.denimLight },
      shoes: { color: TONES.white, style: 'trainers' },
      extras: [],
    },
  },
  juno: {
    id: 'juno',
    name: 'Juno',
    role: 'Leader of Tidewater (Harbour). Chapter 1 boss. Confident, fair.',
    crew: 'tidewater',
    car: 'juno',
    subtitle: 0x5fd0c8,
    outfit: {
      height: 1.72,
      shoulders: 0.98,
      hips: 1.02,
      hair: { style: 'ponytail', color: TONES.hairDark },
      top: { style: 'bomber', color: 0x3fa7a0, accent: TONES.white },
      legs: { color: 0x2b2f36 },
      shoes: { color: 0x1f5f63, style: 'trainers' },
      extras: ['gloves'],
      gloves: TONES.black,
    },
  },
  pike: {
    id: 'pike',
    name: 'Pike',
    role: "Tidewater's drag racer (event 3, Pier Quarter).",
    crew: 'tidewater',
    car: 'pike',
    subtitle: 0x8fd6cf,
    outfit: {
      height: 1.82,
      shoulders: 1.1,
      girth: 1.08,
      hair: { style: 'short', color: TONES.hairBrown },
      headwear: { style: 'beanie', color: 0x1f5f63, accent: 0x3fa7a0 },
      top: { style: 'hoodie', color: 0x6b7078, accent: 0x3fa7a0 },
      legs: { color: 0x4a4d45, style: 'cargo' },
      shoes: { color: TONES.black, style: 'boots' },
      extras: [],
    },
  },
  tidewaterA: {
    id: 'tidewaterA',
    name: 'Tidewater driver',
    role: 'Crew. The one who asks for Jax’s car (scene "Keys").',
    crew: 'tidewater',
    car: 'tidewaterSedan',
    subtitle: 0x8fd6cf,
    outfit: {
      height: 1.78,
      hair: { style: 'short', color: TONES.hairDark },
      headwear: { style: 'cap', color: 0x1f5f63, accent: 0x3fa7a0 },
      top: { style: 'jacket', color: 0x1f5f63, accent: 0x3fa7a0 },
      legs: { color: TONES.charcoal },
      shoes: { color: TONES.white, style: 'trainers' },
      extras: [],
    },
  },
  tidewaterB: {
    id: 'tidewaterB',
    name: 'Tidewater driver',
    role: 'Crew. Stays by the cars.',
    crew: 'tidewater',
    car: 'tidewaterHatch',
    subtitle: 0x8fd6cf,
    outfit: {
      height: 1.7,
      shoulders: 0.95,
      hips: 1.03,
      hair: { style: 'long', color: TONES.hairBrown },
      headwear: { style: 'hood', color: 0x2f8a85 },
      top: { style: 'hoodie', color: 0x2f8a85, accent: 0x1f5f63 },
      legs: { color: TONES.denim },
      shoes: { color: TONES.black, style: 'trainers' },
      extras: [],
    },
  },
  kai: {
    id: 'kai',
    name: 'Kai',
    role: 'Leader of Lantern (Old Town). Drift crew. Calm, philosophical.',
    crew: 'lantern',
    car: 'kai',
    subtitle: 0xf0b860,
    outfit: {
      height: 1.75,
      shoulders: 0.95,
      girth: 0.92,
      hair: { style: 'long', color: TONES.hairDark },
      top: { style: 'shirt', color: 0x2c2a2e },
      coat: { color: 0x5a2a2a },
      legs: { color: 0x2c2a2e },
      shoes: { color: TONES.black, style: 'boots' },
      extras: ['scarf'],
      scarf: 0xe0a043,
    },
  },
  brandt: {
    id: 'brandt',
    name: 'Brandt',
    role: 'Leader of Ironside (rail yards). Drag crew. Blunt.',
    crew: 'ironside',
    car: 'brandt',
    subtitle: 0xe08a6a,
    outfit: {
      height: 1.92,
      shoulders: 1.18,
      hips: 1.06,
      girth: 1.15,
      hair: { style: 'none', color: TONES.hairDark },
      top: { style: 'jacket', color: 0xa5573a, accent: 0x3c3f44 },
      legs: { color: 0x3c3f44, style: 'cargo' },
      shoes: { color: TONES.brown, style: 'boots' },
      extras: ['gloves'],
      gloves: 0x3c3f44,
    },
  },
  selene: {
    id: 'selene',
    name: 'Selene',
    role: 'Leader of Summit (Calder Ridge). Hill runs. Quiet, precise.',
    crew: 'summit',
    car: 'selene',
    subtitle: 0xc9d9ec,
    outfit: {
      height: 1.7,
      shoulders: 0.94,
      girth: 0.9,
      hair: { style: 'long', color: TONES.hairSilver },
      top: { style: 'jacket', color: 0xd8e0ea, accent: 0x5b6b80 },
      legs: { color: 0x3a4250 },
      shoes: { color: TONES.white, style: 'trainers' },
      extras: ['scarf', 'gloves'],
      scarf: 0x5b6b80,
      gloves: 0x3a4250,
    },
  },
  voss: {
    id: 'voss',
    name: 'Voss',
    role: 'Runs the scene and half the waterfront. Final boss. Polite, cold.',
    crew: 'voss',
    car: 'voss',
    subtitle: 0xe6dfcf,
    outfit: {
      height: 1.86,
      shoulders: 1.02,
      girth: 0.96,
      hair: { style: 'short', color: TONES.hairGrey },
      top: { style: 'suit', color: 0x2a2d33, accent: 0xe6dfcf },
      coat: { color: 0x1f2126 },
      legs: { color: 0x2a2d33 },
      shoes: { color: 0x17181c, style: 'shoes' },
      extras: ['tie'],
      tie: 0x17181c,
    },
  },
  hale: {
    id: 'hale',
    name: 'Lt. Hale',
    role: 'Police. Wants Voss, settles for you. Official, tired.',
    crew: 'police',
    car: 'unmarked',
    subtitle: 0x8fb4e6,
    outfit: {
      height: 1.78,
      girth: 1.08,
      hips: 1.04,
      hair: { style: 'short', color: TONES.hairGrey },
      headwear: { style: 'peaked', color: 0x23324a, accent: TONES.black },
      top: { style: 'uniform', color: 0x23324a, accent: 0xc9a95a },
      coat: { color: 0x3a4250 },
      legs: { color: 0x23324a },
      shoes: { color: TONES.black, style: 'shoes' },
      extras: ['badge'],
    },
  },
  officer: {
    id: 'officer',
    name: 'Officer',
    role: 'Patrol officer: chases, roadblocks, "Busted".',
    crew: 'police',
    car: 'police',
    subtitle: 0x8fb4e6,
    outfit: {
      height: 1.8,
      hair: { style: 'short', color: TONES.hairBrown },
      headwear: { style: 'peaked', color: 0x23324a, accent: TONES.black },
      top: { style: 'uniform', color: 0x23324a, accent: 0xc9a95a },
      vest: { style: 'hivis', color: 0xc6d64a },
      legs: { color: 0x23324a },
      shoes: { color: TONES.black, style: 'boots' },
      extras: ['belt', 'badge'],
    },
  },
};

/** Ids in the order the Model Lab lines them up. */
export const CAST_ORDER = [
  'you', 'youStreet', 'mara', 'jax', 'juno', 'pike', 'tidewaterA', 'tidewaterB',
  'kai', 'brandt', 'selene', 'voss', 'hale', 'officer',
];

// --- crowd ---------------------------------------------------------------------
// Onlookers at race starts and crew members in the background of scenes.
// Deterministic from an index (the same rule as parked cars: probes and
// screenshots need the same scene every run), tinted by a crew when given.

const CROWD_TOPS = ['tee', 'jacket', 'hoodie', 'bomber', 'jacket', 'hoodie'];
const CROWD_HAIR = ['short', 'long', 'ponytail', 'short', 'bun', 'none'];
const CROWD_HEAD = [null, 'cap', null, 'beanie', null, 'hood', 'capBack', null];
const CROWD_NEUTRAL = [0x34373d, 0x4f555e, 0x6b7078, 0x2b2f36, 0x5c5248, 0x7a6f62, 0x3b4a63];
const CROWD_LEGS = [TONES.denim, TONES.charcoal, TONES.black, TONES.khaki, TONES.denimLight];
const CROWD_HAIRC = [TONES.hairDark, TONES.hairBrown, TONES.hairDark, TONES.hairGrey, 0x6a4a35];

/** An outfit for the Nth crowd member. Crew members wear the crew colour. */
export function crowdOutfit(index, crewId = null) {
  const i = Math.abs(Math.round(index));
  const crew = crewId ? CREWS[crewId] : null;
  const pick = (arr, k) => arr[(i * k + (i >> 2)) % arr.length];
  const topColor = crew ? (i % 2 ? crew.color : crew.dark) : pick(CROWD_NEUTRAL, 3);
  const head = pick(CROWD_HEAD, 5);
  const hair = pick(CROWD_HAIR, 7);
  return {
    height: 1.64 + ((i * 37) % 27) / 100, // 1.64-1.90
    shoulders: 0.92 + ((i * 13) % 5) * 0.04,
    hips: 0.96 + ((i * 7) % 4) * 0.03,
    girth: 0.9 + ((i * 11) % 5) * 0.05,
    hair: { style: hair, color: pick(CROWD_HAIRC, 3) },
    headwear: head ? { style: head, color: crew ? crew.dark : pick(CROWD_NEUTRAL, 5), accent: crew ? crew.color : 0x8a8f96 } : null,
    top: { style: pick(CROWD_TOPS, 1), color: topColor, accent: crew ? crew.light : pick(CROWD_NEUTRAL, 11) },
    legs: { color: pick(CROWD_LEGS, 2), style: i % 3 === 0 ? 'cargo' : 'trousers' },
    shoes: { color: i % 2 ? TONES.white : TONES.black, style: i % 4 === 0 ? 'boots' : 'trainers' },
    extras: [],
  };
}
