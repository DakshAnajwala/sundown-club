/**
 * Chapter 1 — "Low Tide" (Harbour, Tidewater) — design/SPEC-scenes.md §3.
 * Scene data only (see prologue.js for the conventions).
 */
const PI = Math.PI;

/** Mara's garage, the night after the escape. Unlocks the tuning screen. */
export const maras = {
  id: 'maras',
  title: "Mara's",
  chapter: 'Chapter 1: Low Tide',
  when: 'Start of chapter 1, after P1 is won. Unlocks the tuning screen.',
  summary: 'You bring Jax’s car to a small garage in the rain. Mara takes you in, for a cut.',
  env: 'rain',
  shadow: { center: [0, 0], size: 12 },
  sets: {
    garage: { kind: 'maraGarage', at: [0, 0], door: 0.72 },
  },
  rain: { center: [0, 0, -11.5], size: [26, 9, 13] },
  cars: {
    red: { id: 'starter', at: [0, 0.2], heading: 0 },
    tow: { id: 'tow', at: [3.8, -9.6], heading: PI / 2 },
  },
  cast: {
    mara: { at: [-1.3, -1.1], heading: -PI / 2, pose: 'kneel' },
    you: { who: 'youStreet', at: [2.6, -11], face: [0.9, -6.0] },
  },
  shots: [
    // 1. Outside in the rain: the half-raised door, light spilling out, you walking in.
    { dur: 6, from: [-5.5, 1.7, -14.5], to: [-4.8, 1.75, -13.2], look: [0.3, 1.6, -4.5], fov: 42 },
    // 2. Inside: Jax's car on the lift, Mara at a wheel.
    { dur: 6, from: [4.4, 2.6, 3.5], to: [4.2, 2.5, 3.3], look: [-0.6, 0.9, -1.6], fov: 46 },
    // 3. Low, on Mara at the wheel; she stands and turns to you.
    { dur: 7, from: [-2.9, 0.85, -2.6], to: [-2.75, 1.1, -2.7], look: [-1.0, 0.75, -1.1], lookTo: [-1.15, 1.45, -1.3], fov: 40 },
    // 4. The two of you.
    { dur: 9, from: [-3.9, 1.55, -3.4], to: [-3.7, 1.55, -3.2], look: [-0.95, 1.4, -2.0], fov: 40 },
    // 5. Mara walks to her bench.
    { dur: 9, from: [0.7, 1.75, -2.4], track: 'mara', fov: 40 },
    // 6. From behind the car: Mara at the bench, you by the wheel.
    { dur: 9, from: [-0.6, 1.75, 3.0], to: [-0.8, 1.72, 2.8], look: [-3.4, 1.35, 0.4], fov: 42 },
    // 7. The car under the work lamp.
    { dur: 7, from: [2.0, 0.75, -3.8], to: [1.6, 0.8, -3.3], look: [0, 0.75, 0.0], fov: 40 },
    // 8. Mara, close.
    { dur: 5, from: [-2.6, 1.6, -0.7], to: [-2.7, 1.6, -0.5], track: 'mara', fov: 34 },
  ],
  cues: [
    { t: 0.8, walk: 'you', path: [[0.9, -6.0], [-0.2, -3.4], [-0.6, -2.9]], face: [-1.3, -1.1] },
    { t: 8.0, say: 'mara', text: "Jax's car." },
    { t: 12.4, say: 'mara', text: "Jax's debts." },
    { t: 14.6, pose: 'mara', to: 'stand', blend: 0.9 },
    { t: 15.4, turn: 'mara', to: [-0.6, -2.9], dur: 0.8 },
    { t: 16.6, say: 'mara', text: "You've got both now." },
    { t: 19.2, pose: 'mara', to: 'talk' },
    { t: 19.4, say: 'mara', text: 'Tidewater came to your booth.' },
    { t: 22.3, say: 'mara', text: "They'll come to mine by Friday." },
    { t: 25.2, turn: 'mara', to: [0, 0.2], dur: 0.6 },
    { t: 25.3, pose: 'mara', to: 'point', blend: 0.4 },
    { t: 25.4, say: 'mara', text: 'Not because of you. Because of that.' },
    { t: 28.4, pose: 'mara', to: 'stand', blend: 0.3 },
    { t: 28.6, walk: 'mara', path: [[-2.6, -0.4], [-3.9, 0.9]], face: [-0.6, -2.9] },
    { t: 29.0, say: 'mara', text: 'So. You get a bay, a lift, and my tools.' },
    { t: 32.5, say: 'mara', text: 'I get a cut of whatever you win.' },
    { t: 34.6, pose: 'mara', to: 'armsCrossed', blend: 0.5 },
    { t: 35.6, say: 'mara', text: "Twenty percent. Don't argue. You can't." },
    { t: 36.4, walk: 'you', path: [[-0.5, -2.3]], face: [-3.9, 0.9] },
    { t: 39.2, say: 'mara', text: 'The tyres are finished.' },
    { t: 41.8, say: 'mara', text: "The gearing's for a shopping run." },
    { t: 44.9, say: 'mara', text: 'We fix that first.' },
    { t: 47.3, say: 'mara', text: "Tuning's on the bench. Learn it." },
    { t: 50.2, pose: 'mara', to: 'talk' },
    { t: 50.6, say: 'mara', text: 'And next time someone asks you for a key...' },
    { t: 54.3, say: 'mara', text: '...you call me first.' },
    { t: 56.6, fade: 1, dur: 1.3 },
  ],
};

/** After the first police chase: Hale finds you on the quay. */
export const blueLights = {
  id: 'blueLights',
  title: 'Blue Lights',
  chapter: 'Chapter 1: Low Tide',
  when: 'After event 6 "Blue Lights" (police chase) is won.',
  summary: 'Lt. Hale pulls up beside you on the harbour quay. He is not there about the chase.',
  env: 'night',
  shadow: { center: [-1, -3], size: 20 },
  sets: { pier: { kind: 'pier', at: [0, 0] } },
  cars: {
    red: { id: 'starter', at: [-1.5, -5.6], heading: -PI / 2 },
    hale: { id: 'unmarked', at: [-45, -1.8], heading: -PI / 2, driver: 'hale', headlights: true },
  },
  cast: {
    you: { who: 'youStreet', at: [-1.2, -4.35], heading: PI, pose: 'lean' },
  },
  shots: [
    { dur: 6, from: [14, 4.5, -17], to: [12, 4.0, -16], look: [-2, 1.0, -3], fov: 40 },
    { dur: 6, from: [3.5, 1.3, -7.8], track: 'hale', trackOffset: [0, 0.4, 0], fov: 40 },
    { dur: 7, from: [-2.6, 1.65, -3.6], to: [-2.45, 1.65, -3.5], look: [0.1, 1.15, -2.55], fov: 38 },
    { dur: 8, from: [0.6, 1.3, -4.2], to: [0.55, 1.28, -4.0], look: [0.05, 1.12, -2.6], fov: 34 },
    { dur: 5, from: [0.8, 1.6, -3.5], to: [0.7, 1.6, -3.55], track: 'you', fov: 34 },
    { dur: 5, from: [-9, 2.4, -9.5], look: [3, 1.0, -2.5], fov: 44 },
  ],
  cues: [
    { t: 5.6, drive: 'hale', path: [[-20, -1.8], [-6, -1.9], [0.6, -2.2]], dur: 6.2, ease: 'out' },
    { t: 11.0, pose: 'you', to: 'stand', blend: 0.8 },
    { t: 12.6, say: 'hale', text: 'Nice car.' },
    { t: 14.6, say: 'hale', text: 'Is it yours?' },
    { t: 16.6, say: 'hale', text: "Don't answer that." },
    { t: 19.2, say: 'hale', text: "Lieutenant Hale. I'm not here about tonight." },
    { t: 23.0, say: 'hale', text: 'Jax owed money to people who work for Voss.' },
    { t: 27.2, say: 'hale', text: "Now you're driving his car." },
    { t: 30.0, say: 'hale', text: "Think about who you're winning for." },
    { t: 33.0, drive: 'hale', path: [[10, -2.0], [45, -1.5]], dur: 5, ease: 'in' },
    { t: 35.5, fade: 1, dur: 1.4 },
  ],
};

/** Before the boss race: the rooftop, Tidewater lined up. */
export const juno = {
  id: 'juno',
  title: 'Juno',
  chapter: 'Chapter 1: Low Tide',
  when: 'Before event 7 "Low Tide" (the boss sprint).',
  summary: 'Tidewater waits on the multi-storey roof. Juno sets the stakes: her coupe against Jax’s car.',
  env: 'night',
  shadow: { center: [-1, -6], size: 16 },
  sets: {
    roof: { kind: 'rooftop', at: [0, 0] },
    city: { kind: 'skyline', opts: { rMin: 80, rMax: 220, count: 80, seed: 3, base: -10 }, lights: false },
  },
  cars: {
    t1: { id: 'tidewaterHatch', at: [-5.9, -11.4], heading: PI },
    pike: { id: 'pike', at: [-3.3, -11.4], heading: PI },
    coupe: { id: 'juno', at: [-0.7, -11.4], heading: PI },
    t2: { id: 'tidewaterSedan', at: [1.9, -11.4], heading: PI },
    red: { id: 'starter', at: [14, 10], face: [6, 4], headlights: true },
  },
  cast: {
    juno: { at: [-0.7, -7.0], heading: PI },
    pike: { at: [-2.6, -8.6], heading: PI, pose: 'lean' },
    tidewaterA: { at: [2.6, -8.3], heading: PI - 0.3, pose: 'armsCrossed' },
    c1: { who: { crowd: 2, crew: 'tidewater' }, at: [-7.5, -7.0], face: [-0.7, -4], pose: 'relaxed' },
    c2: { who: { crowd: 5 }, at: [-6.6, -6.0], face: [-0.7, -4], pose: 'armsCrossed' },
    c3: { who: { crowd: 7, crew: 'tidewater' }, at: [4.8, -7.5], face: [-0.7, -4], pose: 'handsInPockets' },
    c4: { who: { crowd: 11 }, at: [5.6, -6.4], face: [-0.7, -4], pose: 'relaxed' },
    you: { who: 'youStreet', at: [-0.45, -0.4], heading: 0, hidden: true },
  },
  shots: [
    { dur: 6, from: [15, 7.5, 10], to: [13, 6.5, 8.5], look: [-1, 0.5, -8], fov: 42 },
    { dur: 5, from: [-9.5, 0.6, -3.0], to: [-9.2, 0.62, -3.3], look: [-1.5, 0.9, -10.5], fov: 40 },
    { dur: 6, from: [0.9, 1.75, 2.6], to: [0.4, 1.75, 0.8], look: [-0.7, 1.4, -7], fov: 40 },
    { dur: 10, from: [-1.5, 1.72, -3.2], to: [-1.45, 1.72, -3.4], look: [-0.7, 1.5, -7.0], fov: 36 },
    { dur: 6, from: [-6.5, 1.55, -3.8], to: [-6.3, 1.55, -4.0], look: [-2.6, 1.3, -8.6], fov: 38 },
    { dur: 8, from: [2.4, 1.55, -4.6], to: [2.3, 1.55, -4.8], look: [-0.75, 1.5, -5.0], fov: 38 },
    { dur: 5, from: [7.5, 2.4, -1.5], look: [-1, 1.0, -8.5], fov: 44 },
  ],
  cues: [
    { t: 0.3, drive: 'red', path: [[6, 4], [0.6, -0.5]], dur: 5.4, ease: 'out' },
    { t: 6.6, say: 'pike', text: "That's the valet?" },
    { t: 8.8, say: 'tidewaterA', text: "That's the valet." },
    { t: 11.0, show: 'you' },
    { t: 11.2, walk: 'you', path: [[-0.8, -4.2]], face: [-0.7, -7.0] },
    { t: 17.2, pose: 'juno', to: 'talk' },
    { t: 17.4, say: 'juno', text: 'Low Tide. Pier to the ferry ramp. Three point eight.' },
    { t: 21.6, say: 'juno', text: 'You win, my coupe is yours.' },
    { t: 24.4, say: 'juno', text: "I win, Jax's car is mine." },
    { t: 27.2, say: 'juno', text: 'Clean race. Nobody pushes, nobody blocks.' },
    { t: 30.6, pose: 'pike', to: 'handsInPockets', blend: 0.6 },
    { t: 32.8, walk: 'juno', path: [[-0.75, -5.6]], face: [-0.8, -4.2] },
    { t: 33.4, pose: 'juno', to: 'handsOnHips', blend: 0.5 },
    { t: 33.6, say: 'juno', text: "You drive like someone who's parked a thousand cars." },
    { t: 37.8, say: 'juno', text: "Let's see if you can do the other thing." },
    { t: 41.2, walk: 'juno', path: [[-0.2, -8.0], [0.2, -9.0]] },
    { t: 44.6, fade: 1, dur: 1.3 },
  ],
};

/** After beating Juno: the ferry ramp, the coupe's key. */
export const pinkSlip = {
  id: 'pinkSlip',
  title: 'Pink Slip',
  chapter: 'Chapter 1: Low Tide',
  when: 'After event 7 "Low Tide" is won. The coupe joins your garage. End of chapter 1.',
  summary: 'At the ferry ramp Juno hands over her keys, and points you at Old Town and at who owns your car park.',
  env: 'night',
  shadow: { center: [32, -4], size: 16 },
  sets: { pier: { kind: 'pier', at: [0, 0] } },
  cars: {
    coupe: { id: 'juno', at: [30.0, -5.6], heading: -PI / 2 },
    red: { id: 'starter', at: [34.6, -2.2], heading: -PI / 2 + 0.3 },
  },
  cast: {
    juno: { at: [29.8, -6.6], heading: PI / 2 + 0.6, hidden: true },
    you: { who: 'youStreet', at: [34.3, -3.1], heading: 0, hidden: true },
  },
  props: {
    key: { kind: 'carKey', opts: { tagNumber: '', tagColor: 0x3fa7a0 }, attach: ['juno', 'handR'] },
  },
  shots: [
    { dur: 6, from: [44, 3.2, -19.5], to: [43, 3.0, -18.5], look: [31, 1.0, -4], fov: 40 },
    { dur: 6, from: [26.5, 1.6, 0.5], to: [26.8, 1.6, 0.2], look: [32.5, 1.2, -3.8], fov: 40 },
    { dur: 9, from: [34.4, 1.7, -2.7], to: [34.3, 1.7, -2.8], look: [32.0, 1.55, -4.0], fov: 36 },
    { dur: 5, from: [31.4, 1.35, -0.9], look: [32.7, 1.25, -3.7], fov: 40 },
    { dur: 9, from: [34.2, 1.68, -2.4], to: [34.15, 1.68, -2.55], look: [32.0, 1.55, -4.0], fov: 34 },
    { dur: 5, from: [37.5, 2.0, 1.5], track: 'juno', fov: 42 },
  ],
  cues: [
    { t: 6.3, show: 'juno' },
    { t: 6.5, walk: 'juno', path: [[31.2, -5.0], [32.0, -4.0]], face: [33.5, -3.3] },
    { t: 6.8, show: 'you' },
    { t: 7.0, walk: 'you', path: [[33.5, -3.3]], face: [32.0, -4.0] },
    { t: 12.2, pose: 'juno', to: 'talk' },
    { t: 12.6, say: 'juno', text: 'Clean.' },
    { t: 14.8, say: 'juno', text: "Nobody's beaten me on that road in two years." },
    { t: 18.6, say: 'juno', text: "You didn't push once." },
    { t: 21.0, pose: 'juno', to: 'holdKey', blend: 0.4 },
    { t: 21.4, say: 'juno', text: 'Here.' },
    { t: 23.4, toss: 'key', to: ['you', 'handR'], dur: 0.8 },
    { t: 23.5, pose: 'you', to: 'holdKey', blend: 0.25 },
    { t: 24.6, pose: 'juno', to: 'stand', blend: 0.5 },
    { t: 26.0, pose: 'juno', to: 'talk' },
    { t: 26.4, say: 'juno', text: 'Kai heard about tonight. Old Town is his.' },
    { t: 30.0, say: 'juno', text: 'And the multi-storey you work in?' },
    { t: 33.1, say: 'juno', text: 'Ask who owns it.' },
    { t: 35.2, walk: 'juno', path: [[28, -4.5], [18, -4.0]] },
    { t: 38.4, fade: 1, dur: 1.4 },
  ],
};

export default [maras, blueLights, juno, pinkSlip];
