/**
 * Tuning.js — the setup a player chooses for a car (design/SPEC-game.md §7),
 * its validation, and the resolved numbers RaceCar.js actually uses.
 *
 * A setup is plain data a player owns and a save file stores, so it is
 * untrusted: every field is clamped or checked on the way in, and anything
 * missing falls back to the stock value. The same FIELDS table drives the
 * tuning screen, so the range a slider offers and the range the car accepts
 * can never disagree.
 */

export const DAMPING = {
  soft: { relaxation: 2.0, compression: 3.4 },
  medium: { relaxation: 2.6, compression: 4.4 },
  hard: { relaxation: 3.4, compression: 5.6 },
};

/** Grip multipliers per compound, [front, rear]. */
export const COMPOUNDS = {
  street: [1.0, 1.0],
  sport: [1.12, 1.12],
  drift: [1.0, 0.85],
};

/**
 * Every tunable field: group, label, kind, range/options, stock value (a
 * function of the car where it depends on one), and a one-line effect.
 */
export const FIELDS = [
  { key: 'powerStage', upgrade: true, group: 'Engine', label: 'Power stage', kind: 'int', min: 0, max: 3, step: 1, stock: () => 0, unit: '', effect: '+8% power per stage.' },
  { key: 'shiftRpm', group: 'Gearbox', label: 'Auto shift point', kind: 'num', min: 4500, max: 7800, step: 50, stock: (c) => c.shiftRpm, unit: 'rpm', effect: 'Higher: longer in each gear, near the limiter.' },
  { key: 'finalDrive', group: 'Gearbox', label: 'Final drive', kind: 'num', min: 2.6, max: 4.8, step: 0.05, stock: (c) => c.finalDrive, unit: ':1', effect: 'Higher: quicker launch, lower top speed.' },
  ...[0, 1, 2, 3, 4, 5].map((i) => ({
    key: `gear${i + 1}`, group: 'Gearbox', label: `Gear ${i + 1}`, kind: 'num', min: 0.75, max: 1.25, step: 0.01, stock: () => 1, unit: '×', effect: 'Scales this ratio: higher pulls harder, runs out sooner.',
  })),
  { key: 'compound', upgrade: true, group: 'Tyres', label: 'Compound', kind: 'enum', options: Object.keys(COMPOUNDS), stock: () => 'street', effect: 'Sport grips more; drift lets the rear slide.' },
  { key: 'gripBias', group: 'Tyres', label: 'Grip bias', kind: 'num', min: -0.1, max: 0.1, step: 0.01, stock: () => 0, unit: '', effect: 'More front: turns in harder, can snap oversteer.' },
  { key: 'slideSustain', group: 'Tyres', label: 'Slide under power', kind: 'num', min: 0, max: 0.6, step: 0.01, stock: (c) => c.slideSustain, unit: '', effect: 'More: throttle keeps a slide going. Less: the rear grips up.' },
  { key: 'stiffnessFront', group: 'Suspension', label: 'Stiffness front', kind: 'num', min: 35, max: 90, step: 1, stock: (c) => c.chassis.suspensionStiffness, unit: '', effect: 'Stiffer: sharper turn-in, less front grip over bumps.' },
  { key: 'stiffnessRear', group: 'Suspension', label: 'Stiffness rear', kind: 'num', min: 35, max: 90, step: 1, stock: (c) => c.chassis.suspensionStiffness, unit: '', effect: 'Stiffer rear: more rotation, easier to slide.' },
  { key: 'damping', group: 'Suspension', label: 'Damping', kind: 'enum', options: Object.keys(DAMPING), stock: () => 'medium', effect: 'Harder: settles faster, skips over bumps.' },
  { key: 'rideHeight', group: 'Suspension', label: 'Ride height', kind: 'num', min: -0.04, max: 0.02, step: 0.005, stock: () => 0, unit: 'm', effect: 'Lower: slightly more stable (visual in the slice).' },
  { key: 'rollInfluence', group: 'Suspension', label: 'Body roll', kind: 'num', min: 0.01, max: 0.12, step: 0.005, stock: () => 0.04, unit: '', effect: 'More: the car leans and loads its outside tyres.' },
  { key: 'brakeForce', upgrade: true, group: 'Brakes', label: 'Brake force', kind: 'num', min: 0.8, max: 1.3, step: 0.01, stock: () => 1, unit: '×', effect: 'More: shorter stops, easier to lock up.' },
  { key: 'brakeBias', group: 'Brakes', label: 'Brake bias', kind: 'num', min: 0.4, max: 0.7, step: 0.01, stock: () => 0.6, unit: 'front', effect: 'More rear: the car rotates under braking.' },
  { key: 'diff', upgrade: true, group: 'Diff', label: 'Differential', kind: 'enum', options: ['open', 'lsd'], stock: () => 'open', effect: 'LSD: both driven wheels push, better exits and drifts.' },
  { key: 'nitroBottles', upgrade: true, group: 'Nitrous', label: 'Bottles', kind: 'int', min: 0, max: 2, step: 1, stock: () => 1, unit: '', effect: '5 s at +25% force each.' },
  { key: 'maxLockDeg', group: 'Steering', label: 'Max lock', kind: 'num', min: 30, max: 45, step: 0.5, stock: (c) => c.maxLockDeg, unit: '°', effect: 'More: tighter turns and bigger drift angles.' },
  { key: 'lockFadeKmh', group: 'Steering', label: 'Speed sensitivity', kind: 'num', min: 80, max: 220, step: 5, stock: () => 160, unit: 'km/h', effect: 'Speed at which lock has faded to its minimum.' },
];

const BY_KEY = new Map(FIELDS.map((f) => [f.key, f]));

/** Fields that are parts bought in the career, not free tuning. Presets never touch them. */
export const UPGRADE_KEYS = FIELDS.filter((f) => f.upgrade).map((f) => f.key);

/**
 * Preset tunes (owner, 30 Sep 2026): starting points a player picks, then
 * adjusts. They change FREE tuning only; parts (UPGRADE_KEYS: power stage,
 * tyre compound, brakes, diff, nitrous) stay whatever the player owns.
 * A value may be a function of the car, so one preset fits every car.
 * 'race' is every car's out-of-the-box setup, derived from the owner's Lab
 * setup of 30 Sep (design/handling/setups/owner-starter-2026-09-30.json) with
 * grip bias cut from +0.05 to +0.03, the highest value that does not snap
 * into a spin at 80 km/h (NOTES.md). Every preset is checked on every car by
 * tools/race-physics-probe.mjs.
 */
export const PRESETS = {
  race: {
    label: 'Race',
    about: 'Grip and turn-in. Stiff rear, low, quick steering; slides only when forced.',
    tune: {
      shiftRpm: (c) => c.shiftRpm,
      finalDrive: (c) => c.finalDrive,
      gripBias: 0.03,
      slideSustain: 0.1,
      stiffnessFront: 44,
      stiffnessRear: 60,
      damping: 'hard',
      rideHeight: -0.04,
      rollInfluence: 0.01,
      brakeBias: 0.62,
      maxLockDeg: 45,
      lockFadeKmh: 195,
    },
  },
  street: {
    label: 'Street',
    about: 'Forgiving. Softer, a little understeer, easy to catch.',
    tune: {
      shiftRpm: (c) => c.shiftRpm,
      finalDrive: (c) => c.finalDrive,
      gripBias: -0.02,
      slideSustain: (c) => c.slideSustain,
      stiffnessFront: (c) => c.chassis.suspensionStiffness,
      stiffnessRear: (c) => c.chassis.suspensionStiffness,
      damping: 'medium',
      rideHeight: 0,
      rollInfluence: 0.04,
      brakeBias: 0.6,
      maxLockDeg: (c) => c.maxLockDeg,
      lockFadeKmh: 160,
    },
  },
  drift: {
    label: 'Drift',
    about: 'Rear steps out on the throttle and stays out. Shorter gearing, full lock.',
    tune: {
      shiftRpm: (c) => c.shiftRpm,
      finalDrive: (c) => +(c.finalDrive * 1.12).toFixed(2),
      gripBias: 0.02,
      slideSustain: 0.5,
      stiffnessFront: 48,
      stiffnessRear: 72,
      damping: 'medium',
      rideHeight: -0.02,
      rollInfluence: 0.03,
      brakeBias: 0.55,
      maxLockDeg: 45,
      lockFadeKmh: 220,
    },
  },
  drag: {
    label: 'Drag',
    about: 'Straight line: short gearing, late shifts, soft rear to squat, calm steering.',
    tune: {
      shiftRpm: (c) => c.shiftRpm + 200,
      finalDrive: (c) => +(c.finalDrive * 1.18).toFixed(2),
      gripBias: -0.05,
      slideSustain: 0,
      stiffnessFront: 42,
      stiffnessRear: 38,
      damping: 'soft',
      rideHeight: -0.02,
      rollInfluence: 0.02,
      brakeBias: 0.6,
      maxLockDeg: 32,
      lockFadeKmh: 110,
    },
  },
};

/** Every car's out-of-the-box preset. */
export const STOCK_PRESET = 'race';

/**
 * `setup` with a preset's tuning applied. Gear ratio scales reset to 1 (a
 * preset is a clean starting point); parts are left exactly as they were.
 */
export function applyPreset(car, setup, name) {
  const preset = PRESETS[name];
  if (!preset) return setup;
  const out = { ...setup };
  for (let n = 1; n <= 6; n++) out[`gear${n}`] = 1;
  for (const [k, v] of Object.entries(preset.tune)) out[k] = cleanField(car, k, typeof v === 'function' ? v(car) : v);
  return out;
}

/** The field defaults alone, before any preset (parts at their base level). */
function baseTuning(car) {
  const out = {};
  for (const f of FIELDS) out[f.key] = f.stock(car);
  return out;
}

/** Out-of-the-box setup for a car: base parts + the stock preset. */
export function defaultTuning(car) {
  return applyPreset(car, baseTuning(car), STOCK_PRESET);
}

/** One clean value, or the stock value when `v` is not acceptable. */
export function cleanField(car, key, v) {
  const f = BY_KEY.get(key);
  if (!f) return undefined;
  if (f.kind === 'enum') return f.options.includes(v) ? v : f.stock(car);
  const n = Number(v);
  if (!Number.isFinite(n)) return f.stock(car);
  const c = Math.min(f.max, Math.max(f.min, n));
  return f.kind === 'int' ? Math.round(c) : c;
}

/** Validated setup -> the numbers RaceCar uses. */
export function resolveTuning(car, setup = {}) {
  const s = {};
  for (const f of FIELDS) s[f.key] = cleanField(car, f.key, setup[f.key]);
  const [cf, cr] = COMPOUNDS[s.compound];
  return {
    setup: s,
    powerScale: 1 + 0.08 * s.powerStage,
    shiftRpm: Math.min(s.shiftRpm, car.limiterRpm - 100),
    finalDrive: s.finalDrive,
    gearScale: [1, 2, 3, 4, 5, 6].map((n) => s[`gear${n}`]),
    gripFront: car.frictionSlip.front * cf * (1 + s.gripBias),
    gripRear: car.frictionSlip.rear * cr * (1 - s.gripBias),
    slideSustain: s.slideSustain,
    stiffnessFront: s.stiffnessFront,
    stiffnessRear: s.stiffnessRear,
    damping: DAMPING[s.damping],
    // A higher car means a LOWER spring mount (more negative connectY).
    rideHeightOffset: -s.rideHeight,
    rollInfluence: s.rollInfluence,
    brakeScale: s.brakeForce,
    brakeBias: s.brakeBias,
    diff: s.diff,
    nitroBottles: s.nitroBottles,
    maxLockDeg: s.maxLockDeg,
    lockFadeKmh: s.lockFadeKmh,
    paint: setup.paint,
    rimStyle: setup.rimStyle,
  };
}
