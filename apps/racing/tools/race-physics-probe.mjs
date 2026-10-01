/**
 * race-physics-probe.mjs — headless handling measurements for every car.
 *
 * No browser, no renderer: the real RaceCar.js on a real cannon-es world, run
 * at a fixed 60 Hz frame (physics substeps at 120 Hz, as in the game). This is
 * where the numbers in design/SPEC-game.md §6 are checked, in the same spirit
 * as Parking Precision's tools/physics-probe.mjs: measure, don't guess.
 *
 *   node tools/race-physics-probe.mjs [carId ...] [--json out.json] [--setup setup.json]
 *
 * --setup takes what the Handling Lab's "Copy setup" button produces
 * ({ car, setup }) and measures that car with that setup instead of stock.
 *
 * Exits 1 when a measured value is outside its target band.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import * as CANNON from 'cannon-es';
import { createPhysicsWorld } from '../src/physics/PhysicsWorld.js';
import { createRaceCar } from '../src/vehicle/RaceCar.js';
import { CARS, peakPower } from '../src/vehicle/cars.js';
import { defaultTuning, applyPreset, PRESETS } from '../src/vehicle/Tuning.js';

const DT = 1 / 60;
const args = process.argv.slice(2);
const flag = (name) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : null;
};
const jsonOut = flag('--json');
const setupFile = flag('--setup');
const valueAt = new Set(['--json', '--setup'].map((n) => args.indexOf(n) + 1).filter((i) => i > 0));
const ids = args.filter((a, i) => !a.startsWith('--') && !valueAt.has(i));
/** { [carId]: setup } from --setup, else empty (stock). */
const SETUPS = {};
if (setupFile) {
  const { car, setup } = JSON.parse(readFileSync(setupFile, 'utf8'));
  SETUPS[car] = { ...defaultTuning(CARS[car]), ...setup };
  if (!ids.length) ids.push(car);
}
const cars = (ids.length ? ids : Object.keys(CARS)).map((id) => CARS[id]);

/**
 * Target bands (SPEC §6 and §2). [min, max]; null = report only.
 */
const TARGETS = {
  starter: { zeroTo100: [7.6, 9.4], topKmh: [180, 210], brake100: [30, 44], latG: [1.1, 1.4], radius60: [18, 28], quarter: null },
  coupe: { zeroTo100: [4.9, 6.1], topKmh: [230, 260], brake100: [28, 42], latG: [1.2, 1.5], radius60: [16, 26], quarter: null },
};

function rig(car, setup = SETUPS[car.id] ?? defaultTuning(car)) {
  const physics = createPhysicsWorld();
  physics.addGround({ width: 400, depth: 24000 });
  const rc = createRaceCar({ physics, car, tuning: setup, visual: false, spawn: { pos: [0, undefined, 0], heading: 0 } });
  const input = { throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false, analogSteer: true };
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) {
      physics.step(DT); // same order as the game: step, then set next forces
      rc.update(DT, input);
    }
  };
  step(60); // settle on the springs
  return { physics, rc, input, step, body: rc.chassisBody };
}

const kmh = (rc) => rc.state.forwardSpeedMs * 3.6;
const up = (body) => {
  const v = new CANNON.Vec3();
  body.vectorToWorldFrame(new CANNON.Vec3(0, 1, 0), v);
  return v.y;
};

function accelRun(car) {
  const { rc, input, step, body } = rig(car);
  input.throttle = 1;
  let t = 0;
  let t60 = null;
  let t100 = null;
  let quarter = null;
  let top = 0;
  let lastTopT = 0;
  const z0 = body.position.z;
  const shifts = [];
  rc.on('gear', (g) => shifts.push({ gear: g.gear, t: +t.toFixed(2), kmh: +kmh(rc).toFixed(1) }));
  while (t < 90) {
    step();
    t += DT;
    const s = kmh(rc);
    if (t60 === null && s >= 96.56) t60 = t;
    if (t100 === null && s >= 100) t100 = t;
    if (quarter === null && z0 - body.position.z >= 402.3) quarter = { t, trapKmh: s };
    if (s > top + 0.05) {
      top = s;
      lastTopT = t;
    }
    if (t - lastTopT > 6) break; // no longer gaining
  }
  return { t60, t100, quarter, topKmh: top, shifts, upright: up(body) };
}

function brakeRun(car) {
  const { rc, input, step, body } = rig(car);
  input.throttle = 1;
  let guard = 0;
  while (kmh(rc) < 100 && guard++ < 3000) step();
  input.throttle = 0;
  input.brake = 1;
  const z0 = body.position.z;
  let t = 0;
  while (rc.state.speedMs > 0.3 && t < 20) {
    step();
    t += DT;
  }
  return { distM: z0 - body.position.z, timeS: t, upright: up(body) };
}

/**
 * Lateral grip: hold ~80 km/h with a throttle controller while the steering
 * is ramped slowly. Lateral acceleration = v x the turn rate of the velocity
 * vector (not the body's yaw rate, which a spinning car inflates). Only
 * samples with the rear axle under 6 degrees of slip count as grip; the steer
 * value where the rear first passes 8 degrees is reported as `slidesAt`
 * (null = the car only ever understeers, the safe way to run out of grip).
 */
function latRun(car) {
  const { rc, input, step, body } = rig(car);
  input.throttle = 1;
  let guard = 0;
  while (kmh(rc) < 80 && guard++ < 3000) step();
  let steer = 0;
  let peak = 0;
  let peakAt = 0;
  let slidesAt = null;
  let maxSlip = 0;
  let prevDir = Math.atan2(body.velocity.x, body.velocity.z);
  for (let t = 0; t < 12; t += DT) {
    steer = Math.min(1, steer + DT / 10);
    input.steer = steer;
    input.throttle = kmh(rc) < 80 ? 1 : 0;
    step();
    const dir = Math.atan2(body.velocity.x, body.velocity.z);
    let d = dir - prevDir;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    prevDir = dir;
    const slip = Math.abs(rc.state.slipDeg);
    maxSlip = Math.max(maxSlip, slip);
    if (slidesAt === null && slip > 8) slidesAt = steer;
    if (slip < 6) {
      const lat = Math.abs((rc.state.speedMs * d) / DT) / 9.82;
      if (lat > peak) {
        peak = lat;
        peakAt = steer;
      }
    }
  }
  return { latG: peak, atSteer: peakAt, slidesAt, maxSlip, upright: up(body) };
}

/**
 * Full KEYBOARD steer held at 60 km/h: the circle the player actually gets.
 * (Owner, 30 Sep: "the turning radius of the car is really bad" — it was
 * 38.6 m here, plowing on over-lock at 0.72 g.)
 */
function radius60Run(car) {
  const { rc, input, step, body } = rig(car);
  input.analogSteer = false;
  input.throttle = 1;
  let guard = 0;
  while (kmh(rc) < 60 && guard++ < 3000) step();
  input.steer = 1;
  let dist = 0;
  let turned = 0;
  let prev = Math.atan2(body.velocity.x, body.velocity.z);
  for (let i = 0; i < 240; i++) {
    input.throttle = kmh(rc) < 60 ? 1 : 0;
    step();
    const d = Math.atan2(body.velocity.x, body.velocity.z);
    const dd = Math.atan2(Math.sin(d - prev), Math.cos(d - prev));
    prev = d;
    if (i > 90) {
      dist += Math.hypot(body.velocity.x, body.velocity.z) * DT;
      turned += Math.abs(dd);
    }
  }
  return { radiusM: dist / turned };
}

/** Full lock at 60 km/h for 3 s: the car must stay on its wheels. */
function flipRun(car) {
  const { rc, input, step, body } = rig(car);
  input.throttle = 1;
  let guard = 0;
  while (kmh(rc) < 60 && guard++ < 3000) step();
  input.throttle = 0.5;
  input.steer = 1;
  let minUp = 1;
  for (let i = 0; i < 180; i++) {
    step();
    minUp = Math.min(minUp, up(body));
  }
  return { minUp };
}

/**
 * Turning radius of the chassis centre at walking pace and full lock:
 * distance travelled / heading turned, over the steady part of the circle.
 * (Measuring the extent of the path under-reads when the car is slow enough
 * not to finish a full circle in the time.)
 */
function turnRun(car) {
  const { rc, input, step, body } = rig(car);
  input.steer = 1;
  const yaw = () => {
    const q = body.quaternion;
    return Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x));
  };
  let dist = 0;
  let turned = 0;
  let prevYaw = yaw();
  for (let i = 0; i < 1200; i++) {
    input.throttle = rc.state.speedMs < 2.5 ? 0.25 : 0;
    const x0 = body.position.x;
    const z0 = body.position.z;
    step();
    const y = yaw();
    if (i > 240) {
      dist += Math.hypot(body.position.x - x0, body.position.z - z0);
      turned += Math.abs(Math.atan2(Math.sin(y - prevYaw), Math.cos(y - prevYaw)));
    }
    prevYaw = y;
  }
  return { radiusM: turned > 0.1 ? dist / turned : null };
}

/** Handbrake turn: 70 km/h, steer and pull for 0.6 s. Must rotate the car. */
function handbrakeRun(car) {
  const { rc, input, step } = rig(car);
  input.throttle = 1;
  let guard = 0;
  while (kmh(rc) < 70 && guard++ < 3000) step();
  input.throttle = 0.3;
  input.steer = 0.6;
  input.handbrake = true;
  let maxSlip = 0;
  for (let i = 0; i < 36; i++) {
    step();
    maxSlip = Math.max(maxSlip, Math.abs(rc.state.slipDeg));
  }
  input.handbrake = false;
  for (let i = 0; i < 60; i++) {
    step();
    maxSlip = Math.max(maxSlip, Math.abs(rc.state.slipDeg));
  }
  return { maxSlipDeg: maxSlip };
}

/**
 * Drift control: handbrake entry at 70 km/h, then 4 s at 85% throttle with a
 * counter-steering driver that aims the FRONT WHEELS (an angle, not a stick
 * position, so setups with more lock are not favoured or punished).
 *   'hold'  a skilled driver aiming for a 30-degree drift: wheels at half the
 *           slip angle plus 1.2 x the error from 30. Measures time in the
 *           drift-score band (15-60) and near the target (25-45).
 *   'catch' a driver straightening up: wheels along the slide. Must bring the
 *           rear back under 5 degrees within 2 s.
 */
function driftRun(car, mode, overrides = {}) {
  const { rc, input, step } = rig(car, { ...(SETUPS[car.id] ?? defaultTuning(car)), ...overrides });
  input.throttle = 1;
  let guard = 0;
  while (kmh(rc) < 70 && guard++ < 3000) step();
  input.throttle = 0.6;
  input.steer = -1;
  input.handbrake = true;
  for (let i = 0; i < 30; i++) step();
  input.handbrake = false;
  let held = 0;
  let near = 0;
  let maxSlip = 0;
  let caughtAt = null;
  for (let i = 0; i < 240; i++) {
    const st = rc.state;
    const a0 = Math.abs(st.slipDeg);
    const wheelDeg = mode === 'hold' ? Math.max(0, a0 * 0.5 + 1.2 * (a0 - 30)) : a0;
    input.throttle = 0.85;
    input.steer = Math.max(-1, Math.min(1, (Math.sign(st.slipDeg) * wheelDeg) / Math.max(1, st.lockDeg)));
    step();
    const a = Math.abs(rc.state.slipDeg);
    maxSlip = Math.max(maxSlip, a);
    if (a >= 15 && a <= 60 && rc.state.speedKmh > 15) held += DT;
    if (a >= 25 && a <= 45 && rc.state.speedKmh > 15) near += DT;
    if (caughtAt === null && i > 10 && a < 5) caughtAt = i * DT;
  }
  return { heldS: held, nearS: near, maxSlipDeg: maxSlip, spun: maxSlip > 100, caughtAt };
}

/** Rows that must pass for ANY setup; the rest describe the stock car only. */
const SAFETY = new Set(['snap oversteer @80', 'full lock @60, min up', 'drift caught']);
const within = (v, band) => !band || (v != null && v >= band[0] && v <= band[1]);
const f = (v, d = 2) => (v == null ? '—' : v.toFixed(d));

let failed = 0;
const report = {};
for (const car of cars) {
  const pk = peakPower(car.torque, car.limiterRpm);
  const a = accelRun(car);
  const b = brakeRun(car);
  const l = latRun(car);
  const fl = flipRun(car);
  const tr = turnRun(car);
  const r60 = radius60Run(car);
  const hb = handbrakeRun(car);
  const dr = driftRun(car, 'hold');
  const dc = driftRun(car, 'catch');
  const tg = TARGETS[car.id] ?? {};
  const rows = [
    ['peak power', `${(pk.watts / 1000).toFixed(0)} kW @ ${pk.rpm} rpm`, null],
    ['0–100 km/h', `${f(a.t100)} s`, within(a.t100, tg.zeroTo100), tg.zeroTo100],
    ['0–60 mph', `${f(a.t60)} s`, null],
    ['top speed', `${f(a.topKmh, 1)} km/h`, within(a.topKmh, tg.topKmh), tg.topKmh],
    ['quarter mile', a.quarter ? `${f(a.quarter.t)} s @ ${f(a.quarter.trapKmh, 1)} km/h` : '—', null],
    ['100–0 braking', `${f(b.distM, 1)} m in ${f(b.timeS)} s`, within(b.distM, tg.brake100), tg.brake100],
    ['lateral grip @80', `${f(l.latG)} g (steer ${f(l.atSteer)})`, within(l.latG, tg.latG), tg.latG],
    ['snap oversteer @80', l.slidesAt == null ? 'none (understeers at the limit)' : `rear lets go at steer ${f(l.slidesAt)}, max ${f(l.maxSlip, 0)}°`, l.slidesAt == null || l.slidesAt >= 0.6, [0.6, 1]],
    ['full lock @60, min up', f(fl.minUp), fl.minUp > 0.6, [0.6, 1]],
    ['turning radius', `${f(tr.radiusM)} m`, null],
    ['full steer @60 radius', `${f(r60.radiusM, 1)} m`, within(r60.radiusM, tg.radius60), tg.radius60],
    ['handbrake max slip', `${f(hb.maxSlipDeg, 1)}°`, hb.maxSlipDeg >= 20 && hb.maxSlipDeg <= 90, [20, 90]],
    ['drift held (15–60°)', `${f(dr.heldS)} s of 4, ${f(dr.nearS)} s at 25–45°, max ${f(dr.maxSlipDeg, 0)}°${dr.spun ? ' SPUN' : ''}`, dr.spun ? false : null],
    ['drift caught', dc.caughtAt == null ? 'never' : `in ${f(dc.caughtAt)} s`, dc.caughtAt != null && dc.caughtAt <= 2 && !dc.spun, [0, 2]],
  ];
  console.log(`\n${car.name} (${car.id}) — ${car.mass} kg, ${car.drive}${SETUPS[car.id] ? `, setup from ${setupFile}` : ', stock setup'}`);
  for (let [label, val, ok, band] of rows) {
    // A player's own setup is allowed to be quicker, grippier or less slidey
    // than stock; only the safety rows judge it.
    if (SETUPS[car.id] && !SAFETY.has(label) && ok !== null) ok = ok ? true : null;
    const mark = ok === null ? (band ? ' · ' : '   ') : ok ? 'ok ' : 'OUT';
    if (ok === false) failed++;
    console.log(`  ${mark} ${label.padEnd(22)} ${val}${band ? `   target ${band[0]}–${band[1]}` : ''}`);
  }
  console.log(`      shifts: ${a.shifts.map((s) => `${s.gear}@${s.kmh}`).join(' ')}`);
  report[car.id] = { peakKw: pk.watts / 1000, accel: a, brake: b, lat: l, flip: fl, turn: tr, handbrake: hb, drift: dr, driftCatch: dc };
}

/**
 * Presets (Tuning.js PRESETS) on every car, with the car's base parts. All
 * must pass the safety rows; each must also do the job it is named for.
 */
if (!setupFile) {
  console.log('\nPresets (base parts: street tyres, 1 bottle, stock brakes, open diff)');
  console.log('  car      preset   0–100   ¼ mile  top     100–0   grip   rear lets go   drift 15–60 / 25–45   caught');
  for (const car of cars) {
    const base = defaultTuning(car);
    for (const name of Object.keys(PRESETS)) {
      SETUPS[car.id] = applyPreset(car, base, name);
      const a = accelRun(car);
      const b = brakeRun(car);
      const l = latRun(car);
      const fl = flipRun(car);
      const dr = driftRun(car, 'hold');
      const dc = driftRun(car, 'catch');
      const problems = [];
      if (l.slidesAt != null && l.slidesAt < 0.6) problems.push('snaps into oversteer');
      if (fl.minUp <= 0.6) problems.push('rolls');
      if (dc.caughtAt == null || dc.caughtAt > 2 || dc.spun) problems.push('drift cannot be caught');
      if (name === 'drift' && (dr.heldS < 3.5 || dr.nearS < 2.5 || dr.spun)) problems.push('drift preset does not hold a drift');
      if (name === 'race' && l.slidesAt != null) problems.push('race preset slides at the limit');
      failed += problems.length;
      console.log(
        `  ${car.id.padEnd(8)} ${name.padEnd(8)} ${f(a.t100).padStart(5)} s ${f(a.quarter?.t).padStart(5)} s ${f(a.topKmh, 0).padStart(4)} km/h ${f(b.distM, 1).padStart(5)} m ${f(l.latG).padStart(5)} g ${(l.slidesAt == null ? '—' : `steer ${f(l.slidesAt)}`).padStart(12)} ${f(dr.heldS).padStart(8)} s / ${f(dr.nearS)} s ${(dc.caughtAt == null ? 'never' : `${f(dc.caughtAt)} s`).padStart(8)}${problems.length ? `   OUT: ${problems.join(', ')}` : ''}`
      );
    }
    // The drag preset must be the quickest of the presets over the quarter mile.
    const quarters = Object.fromEntries(
      Object.keys(PRESETS).map((n) => {
        SETUPS[car.id] = applyPreset(car, base, n);
        return [n, accelRun(car).quarter?.t ?? Infinity];
      })
    );
    const quickest = Object.entries(quarters).sort((a, b) => a[1] - b[1])[0][0];
    if (quickest !== 'drag') {
      failed++;
      console.log(`  OUT ${car.id}: quickest quarter mile is ${quickest}, not drag`);
    }
    delete SETUPS[car.id];
  }
}

if (jsonOut) writeFileSync(jsonOut, JSON.stringify(report, null, 2));
console.log(failed ? `\n${failed} measurement(s) outside target` : '\nall measurements inside target');
process.exit(failed ? 1 : 0);
