/**
 * Prologue — "The Valet" (design/SPEC-scenes.md §3).
 *
 * Scene data only: no imports, so tools/scene-script.mjs can print the
 * screenplay (design/SCRIPT.md) straight from it. Coordinates are metres in
 * the scene's frame; headings are radians (0 faces -Z, PI/2 faces -X,
 * -PI/2 faces +X); `face: [x, z]` turns to face a point instead.
 */
const PI = Math.PI;

/**
 * Scene 1 "Keys". Plays after the prologue's drive-and-park tutorial; the
 * escape sprint P1 starts as it fades out. The multi-storey front, the valet
 * booth in front of its entrance, Jax's red car parked just inside.
 */
export const keys = {
  id: 'keys',
  title: 'Keys',
  chapter: 'Prologue: The Valet',
  when: 'After the prologue tutorial (drive, park in a bay). P1 "Out of the car park" starts as it ends.',
  summary: 'Two Tidewater cars pull up at your booth after midnight and ask for the car Jax left with you. You run for it instead.',
  env: 'night',
  shadow: { center: [0, 2], size: 22 },
  sets: {
    building: { kind: 'multiStorey', at: [0, 0] },
    booth: { kind: 'valetBooth', at: [0, 2.5], barrier: 0 },
  },
  lights: [{ pos: [0.2, 2.1, 2.6], color: 0xffd9a0, intensity: 7, distance: 7 }],
  cars: {
    red: { id: 'starter', at: [-4.4, 9.6], heading: 0 },
    p1: { parked: 0, at: [-11, 13], heading: PI / 2 },
    p2: { parked: 3, at: [-11, 19], heading: PI / 2 },
    p3: { parked: 4, at: [11, 16], heading: -PI / 2 },
    sedan: { id: 'tidewaterSedan', at: [44, -8.5], heading: PI / 2, headlights: true },
    hatch: { id: 'tidewaterHatch', at: [54, -9], heading: PI / 2, headlights: true, driver: 'tidewaterB' },
  },
  cast: {
    you: { at: [0.15, 2.25, 0.12], heading: 0, pose: 'holdKey' },
    tidewaterA: { at: [2.0, -2.7], face: [0.3, 1.0], hidden: true },
  },
  props: {
    key: { kind: 'carKey', opts: { tagNumber: '47' }, attach: ['you', 'handR'] },
  },
  shots: [
    // 1. Harbour Street after midnight: the multi-storey, the lit booth.
    { dur: 5, from: [-9, 3.0, -15.0], to: [-7, 2.6, -14.5], look: [0, 3.0, 5], fov: 42 },
    // 2. In the booth: you, Jax's key, the board behind with one hook empty.
    { dur: 4.5, from: [1.1, 1.5, 0.6], to: [0.85, 1.48, 0.95], look: [0.1, 1.45, 2.7], fov: 34 },
    // 3. Headlights: two cars turn in off the street.
    { dur: 6.5, from: [-3.6, 1.5, 0.8], to: [-3.2, 1.5, 0.9], track: 'sedan', trackOffset: [0, 0.4, 0], fov: 38 },
    // 4. Over your shoulder: a Tidewater driver walks up to the counter.
    { dur: 7, from: [0.55, 1.78, 2.95], look: [0.3, 1.45, -0.6], fov: 40 },
    // 5. From outside, over the driver's shoulder: you behind the glass.
    { dur: 6, from: [-0.55, 1.78, -0.15], to: [-0.45, 1.75, 0.05], look: [0.15, 1.6, 2.25], fov: 34 },
    // 6. The key in your hand.
    { dur: 4, from: [0.55, -0.16, -0.5], to: [0.5, -0.15, -0.44], follow: 'you:handR', track: 'you:handR', trackOffset: [0, -0.08, 0], fov: 36 },
    // 7. Wide: the cars waiting, the barrier, the red car inside.
    { dur: 4, from: [5.5, 2.2, -5.5], look: [-1.5, 1.4, 5], fov: 44 },
    // 8. You run for it.
    { dur: 5, from: [-8.4, 1.5, 12.8], to: [-8.0, 1.5, 12.2], track: 'you', trackOffset: [0, 1.1, 0], fov: 46 },
  ],
  cues: [
    { t: 9.5, drive: 'sedan', path: [[20, -8], [6, -5.2], [1.5, -4.2]], dur: 6.3, ease: 'out' },
    { t: 10.0, drive: 'hatch', path: [[28, -8.5], [12, -5.6], [9, -4.6]], dur: 6.6, ease: 'out' },
    { t: 16.2, show: 'tidewaterA' },
    { t: 16.3, walk: 'tidewaterA', path: [[1.2, -1.0], [0.3, 1.0]], face: [0.15, 2.25] },
    { t: 19.6, pose: 'tidewaterA', to: 'talk' },
    { t: 19.8, say: 'tidewaterA', text: 'Evening.' },
    { t: 21.7, say: 'tidewaterA', text: 'Forty-seven. The red one.' },
    { t: 24.1, say: 'tidewaterA', text: "Jax said he'd leave it with you." },
    { t: 27.0, say: 'tidewaterA', text: "He's not coming back for it." },
    { t: 29.0, pose: 'tidewaterA', to: 'handsOnHips', blend: 0.6 },
    { t: 29.8, say: 'tidewaterA', text: 'Keys, valet.' },
    { t: 33.0, say: 'tidewaterA', text: "Don't make this a thing." },
    { t: 35.3, turn: 'you', to: [0.9, 2.75], dur: 0.4 },
    { t: 37.0, walk: 'you', run: true, y: 0, path: [[0.6, 2.75], [1.45, 2.75], [1.45, 3.9], [-3.2, 5.7], [-5.35, 8.9]] },
    { t: 37.3, pose: 'tidewaterA', to: 'point', blend: 0.25 },
    { t: 37.4, say: 'tidewaterA', text: 'Hey!' },
    { t: 40.4, headlights: 'red', on: true },
    { t: 40.8, fade: 1, dur: 1.2 },
  ],
};

export default [keys];
