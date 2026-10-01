/**
 * Sundown Club design tokens: the one source of truth for colour, type, space,
 * shape, depth and motion (proposal: docs/design/SYSTEM.md).
 *
 * - The DOM reads tokens.css, which tools/build-tokens.mjs generates from this
 *   file. Never edit tokens.css by hand.
 * - three.js / React Three Fiber and any JS reads this module directly.
 * - Tailwind (later) maps its theme onto the CSS variables, so classes and
 *   scenes can never drift apart.
 *
 * Pure data: no DOM, no three.js, runs in node (tools/design-check.mjs checks
 * every contrast pair below and that tokens.css is up to date).
 */

// ---------------------------------------------------------------- type
export const fonts = {
  display: '"Young Serif", Georgia, "Times New Roman", serif',
  ui: '"Schibsted Grotesk", system-ui, -apple-system, "Segoe UI", sans-serif',
  mono: '"IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace',
};

/**
 * Type roles. Sizes in rem so they follow the player's text-size setting
 * (1rem = 16px). Tracking is per size: tight on large serif, open on small
 * mono caps, zero on body.
 */
export const type = {
  display:  { font: 'display', size: 'clamp(2.75rem, 6.4vw, 5.75rem)', weight: 400, leading: 1, tracking: '-0.015em' },   // 44 → 92px: game names, hub hero
  headline: { font: 'display', size: 'clamp(1.625rem, 1.4vw + 1rem, 2.125rem)', weight: 400, leading: 1.1, tracking: '-0.01em' }, // 26 → 34px: section titles, dialog questions
  title:    { font: 'display', size: '1.25rem', weight: 400, leading: 1.2, tracking: '0' },       // 20px: card and tile names, coach titles
  lead:     { font: 'ui', size: '1.125rem', weight: 400, leading: 1.55, tracking: '0' },        // 18px: hero blurb, one per screen
  body:     { font: 'ui', size: '0.9375rem', weight: 400, leading: 1.5, tracking: '0' },        // 15px: UI text, buttons (600)
  caption:  { font: 'ui', size: '0.8125rem', weight: 400, leading: 1.4, tracking: '0.005em' }, // 13px: help lines, small print
  label:    { font: 'mono', size: '0.75rem', weight: 500, leading: 1.2, tracking: '0.12em', upper: true }, // 12px: eyebrows, room names (never smaller)
  key:      { font: 'mono', size: '0.75rem', weight: 600, leading: 1, tracking: '0' },          // 12px: keycaps
  number:   { font: 'mono', size: '1.25rem', weight: 500, leading: 1.1, tracking: '0', tabular: true },  // 20px: chips, bets, scores
  figure:   { font: 'mono', size: 'clamp(1.75rem, 2.4vw, 2.5rem)', weight: 600, leading: 1, tracking: '-0.01em', tabular: true }, // 28 → 40px: a result worth a moment (a win, a score)
};

// ---------------------------------------------------------------- colour
/**
 * Ink: the same on every surface and in every sky phase, so contrast is
 * checked once per surface, not per game.
 */
export const ink = {
  primary: '#f3e7d8',    // Club Cream: text, icons, focus ring
  secondary: '#cdbcaa',  // Warm Taupe: supporting text, labels on glass
  tertiary: '#a8988a',   // Dim Taupe: captions on solid surfaces only, never on glass
};

/**
 * The surface family shifts with the sky (North Star: the last hour of
 * daylight). Every page and game sets data-sky="golden" | "dusk" | "night";
 * games with a day cycle switch it as their sun sets. Four solid steps per
 * phase, plus `sun`: the club's own accent for screens that belong to no game.
 */
export const sky = {
  golden: { s0: '#120d0b', s1: '#1b1411', s2: '#261c18', s3: '#33261f', sun: '#f4ad6e', onSun: '#1b1109' },
  dusk:   { s0: '#130c10', s1: '#1c1318', s2: '#281b22', s3: '#35242d', sun: '#ec9a80', onSun: '#1d0f0c' },
  night:  { s0: '#0c0b13', s1: '#14121d', s2: '#1e1a29', s3: '#292436', sun: '#c8d0f4', onSun: '#11121f' },
};

/** Glass: s1 at this alpha with blur, for panels that float over a 3D scene. */
export const glass = { alpha: 0.8, blur: '14px', saturate: 1.15 };

/**
 * One accent per game (owner's binding identity). `accent` fills the primary
 * button, the selection ring, eyebrows and the XP bar; `onAccent` is text
 * placed on it. On dark surfaces an accent may also be used as text.
 */
export const games = {
  blackjack:  { name: 'Blackjack',         accent: '#f0a868', onAccent: '#1b1109' }, // Apricot
  holdem:     { name: "Hold'em",           accent: '#d98a93', onAccent: '#1d0d10' }, // Rose
  videopoker: { name: 'Video Poker',       accent: '#e8b860', onAccent: '#1b1306' }, // Brass
  parking:    { name: 'Parking Precision', accent: '#8fe3cf', onAccent: '#08201a' }, // Mint (the one mint: the bay's #76d6a8 stays a scene colour)
  nightdrive: { name: 'Night Drive',       accent: '#9aa6ff', onAccent: '#0e1030' }, // Periwinkle
};

/**
 * Results. Quiet colours that read on every surface: never neon, never
 * casino green. A natural or a jackpot uses the game's accent instead.
 */
export const result = {
  win: '#a3d4b0',   // Sage
  lose: '#eda08f',  // Clay
  push: '#c9beb1',  // Ash
};

// ---------------------------------------------------------------- space and shape
/** 4px rhythm, in rem. HUD panels sit `hudInset` from the window edge. */
export const space = {
  1: '0.25rem', 2: '0.5rem', 3: '0.75rem', 4: '1rem', 5: '1.25rem', 6: '1.5rem',
  8: '2rem', 10: '2.5rem', 14: '3.5rem', 20: '5rem',
};
export const layout = {
  gutter: 'clamp(16px, 4.5vw, 64px)',
  hudInset: '16px',
  hudBand: '112px',       // bottom band games reserve for the action bar: cameras frame cards above it
  measure: '44ch',        // longest line of running copy
  minWidth: '400px',      // must not scroll sideways at this width
};

/** Four radii and a pill. A nested corner = outer radius minus the padding between. */
export const radius = {
  key: '4px',       // keycaps, tiny tags
  control: '10px',  // buttons, inputs, chips
  surface: '14px',  // panels, tiles, cards
  sheet: '20px',    // dialogs, sheets, the leave card
  pill: '999px',
};

// ---------------------------------------------------------------- depth
/**
 * Depth is shadow and light, never a hard border. Edges are a faint inner ring
 * plus a brighter top edge (light catching the material). Lift is a soft,
 * semi-transparent cast shadow that grows with the surface.
 */
export const shadow = {
  edge: 'inset 0 0 0 1px rgb(243 231 216 / 0.07), inset 0 1px 0 rgb(255 248 238 / 0.06)',
  lift1: '0 1px 2px rgb(0 0 0 / 0.28), 0 2px 8px -2px rgb(0 0 0 / 0.22)',          // controls
  lift2: '0 10px 28px -10px rgb(0 0 0 / 0.5), 0 2px 6px rgb(0 0 0 / 0.18)',         // panels over 3D, tiles
  lift3: '0 28px 72px -20px rgb(0 0 0 / 0.62), 0 8px 22px -10px rgb(0 0 0 / 0.36)', // dialogs, sheets
  selected: '0 0 0 2px var(--accent), 0 10px 28px -10px rgb(0 0 0 / 0.5)',          // the selected thing: an accent ring and a neutral lift, never a coloured glow
  focus: '0 0 0 2px var(--s0), 0 0 0 4px var(--ink-1)',                            // two-tone ring: visible on any fill
  scrim: 'rgb(8 6 8 / 0.58)',                                                      // dims the world behind a modal
};

// ---------------------------------------------------------------- motion
/**
 * Emil Kowalski's rules, as tokens:
 * - entering and responding: ease-out; moving on screen: ease-in-out; colour: ease.
 * - UI motion stays under 300 ms; exits are faster than enters.
 * - Never animate what the keyboard repeats (game hotkeys, rail arrows):
 *   state changes there are instant, with press feedback only.
 * - Only transform, opacity, filter and clip-path move. Never layout.
 * Springs (Apple): critically damped by default; bounce only after a flick.
 */
export const motion = {
  ease: {
    out: 'cubic-bezier(0.23, 1, 0.32, 1)',       // enter, respond
    inOut: 'cubic-bezier(0.77, 0, 0.175, 1)',    // move on screen
    sheet: 'cubic-bezier(0.32, 0.72, 0, 1)',     // drawers and sheets
    colour: 'ease',                              // hover and colour changes
  },
  ms: {
    press: 120,    // :active scale
    quick: 160,    // hover, colour, tooltips, exits
    ui: 220,       // popovers, dialogs entering
    sheet: 320,    // drawers, the garage, level select
    moment: 600,   // a result worth a beat (win, park score); rare
    scene: 900,    // backdrop and sky crossfades; decorative, rare
  },
  pressScale: 0.97,
  enterScale: 0.97,  // dialogs grow from here (never from 0)
  enterRise: '8px',  // panels rise this far as they appear
  stagger: 40,       // ms between items entering together
  spring: {
    ui: { type: 'spring', bounce: 0, duration: 0.4 },         // default: no overshoot
    sheet: { type: 'spring', bounce: 0, duration: 0.3 },
    flick: { type: 'spring', bounce: 0.2, duration: 0.4 },    // only after a gesture with momentum
    camera: { damping: 1, response: 0.6 },                    // R3F camera rigs (critically damped)
  },
};

/** Stacking order for everything that floats over a game. */
export const z = { hud: 10, overlay: 100, coach: 900, dialog: 1000, toast: 1100 };

// ---------------------------------------------------------------- scene (three.js)
/**
 * Colours the 3D worlds use, mirrored exactly from packages/shared/lounge
 * (lounge.js, cards3d.js, chips3d.js) so the React Three Fiber kit can read
 * them from here with no visual change. Hex strings: three.js Color accepts them.
 */
export const scene = {
  /** Day keys (Blackjack SPEC §8.5): t, sun elevation°, sky top, horizon/fog, sun colour, sun, hemi, lamp intensity. */
  day: [
    [0.00, -30, '#0e1324', '#252c45', '#8fa6d6', 0.25, 0.25, 1.00],
    [0.22, -4, '#27305a', '#b98a8a', '#ffb38a', 0.30, 0.35, 0.85],
    [0.27, 6, '#6d86b8', '#f0c39a', '#ffc58f', 1.40, 0.60, 0.30],
    [0.35, 30, '#7fa9d6', '#d7e2e4', '#fff1dc', 2.20, 0.90, 0.00],
    [0.50, 55, '#6f9fd2', '#dfe8ea', '#ffffff', 2.50, 1.00, 0.00],
    [0.68, 30, '#7fa4cf', '#e4dccb', '#fff0d6', 2.00, 0.90, 0.00],
    [0.755, 6, '#6f7fb2', '#f4ad6e', '#ffb068', 1.70, 0.60, 0.35],
    [0.80, -3, '#3f4a78', '#d98f6f', '#ff9a6a', 0.40, 0.40, 0.80],
    [0.86, -12, '#1d2544', '#4d5078', '#8fa6d6', 0.25, 0.30, 1.00],
    [1.00, -30, '#0e1324', '#252c45', '#8fa6d6', 0.25, 0.25, 1.00],
  ],
  /** Where each sky phase begins on the day clock: data-sky follows the scene. */
  phaseAt: { golden: 0.70, dusk: 0.78, night: 0.84 },
  rooms: {
    lounge: { plaster: '#d9ccb8', trim: '#b8a58a' },
    salon: { plaster: '#c9c0b3', trim: '#a89a86' },
    upper: { plaster: '#b7b2ac', trim: '#9a938b' },
  },
  light: { hemiSky: '#cfe0ff', hemiGround: '#8a6a52', ambient: '#ffe8d0', frontFill: '#ffe2c4', lamp: '#ffd7a1', stars: '#dfe6ff' },
  material: {
    ceiling: '#e6dccb', frame: '#3b3431', wood: '#7a5a43', woodDark: '#4a3a30', rail: '#3b2d27',
    brass: '#c9a36a', pot: '#b9876a', leaf: '#5f7f55', leaf2: '#74905f', shade: '#2f3a36', bulb: '#fff2dc',
  },
  felt: '#4f7f73',  // sage-teal felt, deliberately muted (Blackjack SPEC §2)
  card: { stock: '#f3ede2', red: '#c0594b', ink: '#2e2d35', back: '#d6a27c', backBands: ['#e6bf98', '#c98d68'] },
  chips: { 1: '#cfc6b8', 5: '#e8e1d3', 25: '#86ad8f', 100: '#4a5568', 500: '#9d86b5', 1000: '#dcb45e', 5000: '#c7735e', 25000: '#6e9fb4' },
};
