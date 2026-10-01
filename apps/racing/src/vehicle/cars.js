/**
 * cars.js — every hard number about each racing car, as data.
 *
 * Targets come from design/SPEC-game.md §6. The measured values (what the car
 * actually does in cannon-es) come from tools/race-physics-probe.mjs; when a
 * number here changes, re-run the probe and update the "measured" comment.
 *
 * Units: kg, m, N·m, rpm, m², W. Torque curves are [rpm, N·m] pairs, linearly
 * interpolated; peak power falls out of them, it is not a separate input.
 *
 * Shared geometry (chassis box, wheel radius, suspension mounts) is Parking
 * Precision's sedan, from Dimensions.js, so both cars sit on the same wheels
 * and the copied bodywork fits. A car with its own proportions gets its own
 * `chassis` block.
 */
import {
  CHASSIS_SIZE,
  WHEEL_RADIUS,
  WHEELBASE,
  TRACK,
  SUSPENSION_REST,
  SUSPENSION_STIFFNESS,
  WHEEL_CONNECT_Y,
  RIDE_HEIGHT,
} from './Dimensions.js';

const SEDAN_CHASSIS = {
  size: CHASSIS_SIZE, // [w, h, l]
  wheelRadius: WHEEL_RADIUS,
  wheelbase: WHEELBASE,
  track: TRACK,
  suspensionRest: SUSPENSION_REST,
  suspensionStiffness: SUSPENSION_STIFFNESS,
  connectY: WHEEL_CONNECT_Y,
  rideHeight: RIDE_HEIGHT,
};

export const CARS = {
  starter: {
    id: 'starter',
    name: 'Starter saloon',
    body: 'sedan',
    paint: 0xcf6f5d, // Parking Precision's red
    chassis: SEDAN_CHASSIS,
    mass: 1150,
    drive: 'RWD',
    // Peak ~110 kW at 6,000 rpm.
    torque: [
      [800, 110],
      [2500, 168],
      [4000, 192],
      [5000, 188],
      [6000, 175],
      [6800, 148],
      [7200, 120],
    ],
    idleRpm: 850,
    shiftRpm: 6500,
    redlineRpm: 6800,
    limiterRpm: 7000,
    // Long gearing (owner, 30 Sep: "a lot looser"): 1st to ~77 km/h, 2nd ~117,
    // 3rd ~157, 4th ~198 at the 6,500 rpm shift point; 5th and 6th are for the
    // top end and nitrous.
    gears: [2.95, 1.95, 1.45, 1.15, 0.94, 0.78],
    reverseRatio: 3.2,
    finalDrive: 3.55,
    driveEfficiency: 0.8,
    CdA: 0.76, // drag coefficient x frontal area, m²
    Crr: 0.013, // rolling resistance
    frictionSlip: { front: 1.25, rear: 1.22 }, // ~1.25 g (owner: turning was 'really bad')
    slideSustain: 0.22, // RaceCar: rear grip bled by throttle once sliding
    brakeImpulse: 26, // N·s per wheel per 120 Hz step at 100% (see RaceCar)
    maxLockDeg: 36,
    minLockDeg: 5,
    reverseTopKmh: 40,
  },

  coupe: {
    id: 'coupe',
    name: 'Tide coupe',
    body: 'coupe', // bodies.js COUPE (design/SPEC-models.md §3)
    paint: 0x3fa7a0, // Tidewater teal
    chassis: SEDAN_CHASSIS,
    mass: 1250,
    drive: 'RWD',
    // Peak ~190 kW at 6,800 rpm.
    torque: [
      [900, 190],
      [3000, 285],
      [4500, 318],
      [6000, 300],
      [6800, 268],
      [7500, 225],
      [7800, 190],
    ],
    idleRpm: 900,
    shiftRpm: 7200,
    redlineRpm: 7500,
    limiterRpm: 7700,
    // Loosened with the starter: 1st to ~80 km/h, 4th ~207 at 7,200 rpm.
    gears: [3.1, 2.05, 1.52, 1.2, 0.98, 0.82],
    reverseRatio: 3.1,
    finalDrive: 3.6,
    driveEfficiency: 0.8,
    CdA: 0.64,
    Crr: 0.012,
    frictionSlip: { front: 1.38, rear: 1.35 },
    slideSustain: 0.2, // more power already keeps it sliding
    brakeImpulse: 30,
    maxLockDeg: 35,
    minLockDeg: 4.5,
    reverseTopKmh: 40,
  },
};

/** Interpolated engine torque (N·m) at an rpm. */
export function torqueAt(curve, rpm) {
  if (rpm <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i++) {
    const [r1, t1] = curve[i];
    if (rpm <= r1) {
      const [r0, t0] = curve[i - 1];
      return t0 + ((t1 - t0) * (rpm - r0)) / (r1 - r0);
    }
  }
  return curve[curve.length - 1][1];
}

/** Peak power (W) and the rpm it occurs at, scanned from the curve. */
export function peakPower(curve, maxRpm) {
  let best = { watts: 0, rpm: 0 };
  for (let rpm = 1000; rpm <= maxRpm; rpm += 50) {
    const w = (torqueAt(curve, rpm) * rpm * Math.PI) / 30;
    if (w > best.watts) best = { watts: w, rpm };
  }
  return best;
}
