/**
 * physics-probe.mjs — headless tuning rig for the v4 arcade vehicle.
 *
 * cannon-es is pure JS with no DOM dependency, so the whole vehicle can be
 * simulated in Node with no browser and no renderer. That makes questions
 * like "which way does positive engine force actually push?" and "what is
 * the turning circle at full lock?" answerable in a second, deterministically,
 * instead of by squinting at a running game.
 *
 * v1..v3 got the engine-force sign wrong twice and only caught it by driving
 * the car in a browser (see NOTES.md). This script exists so v4 never has to
 * guess: run it, read the numbers, hardcode what it prints.
 *
 *   node tools/physics-probe.mjs
 */
import * as CANNON from 'cannon-es';

// --- Candidate v4 tuning ("snappy arcade": light, responsive, tight) -------
const CHASSIS_MASS = 900; // kg — lighter than v1's 1200 for a livelier feel
const CHASSIS_SIZE = [1.78, 1.18, 4.2]; // w, h, l (m)
const WHEEL_RADIUS = 0.33;
const WHEELBASE = 2.62; // front axle to rear axle
const TRACK = 1.5; // left wheel to right wheel
const MAX_STEER_DEG = 42; // generous lock for tight 3-point turns

const OPTS = {
  suspensionStiffness: 55,
  suspensionRestLength: 0.28,
  frictionSlip: 4.2,
  dampingRelaxation: 2.6,
  dampingCompression: 4.6,
  maxSuspensionForce: 1e5,
  rollInfluence: 0.02,
  maxSuspensionTravel: 0.2,
  customSlidingRotationalSpeed: -30,
  useCustomSlidingRotationalSpeed: true,
};

const DT = 1 / 60;

function buildWorld() {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.solver.iterations = 10;
  world.defaultContactMaterial.friction = 0.9;

  // The floor MUST be a finite Box, not an infinite CANNON.Plane.
  // Measured here: with a Plane floor, only the two front wheel raycasts ever
  // report a hit — the rear pair returns distance -1 forever, the car settles
  // nose-down at 7.8 deg resting on the chassis box, and 3 s of full throttle
  // moves it 0.4 m. Swapping in a Box floor with identical everything else:
  // all four wheels contact, and the same throttle gives 35.5 km/h.
  // A parking garage has a finite slab anyway, so this costs nothing.
  const ground = new CANNON.Body({ mass: 0 });
  ground.addShape(new CANNON.Box(new CANNON.Vec3(120, 0.5, 120)));
  ground.position.set(0, -0.5, 0);
  world.addBody(ground);
  return world;
}

function buildVehicle(world) {
  const chassisBody = new CANNON.Body({ mass: CHASSIS_MASS });
  chassisBody.addShape(
    new CANNON.Box(new CANNON.Vec3(CHASSIS_SIZE[0] / 2, CHASSIS_SIZE[1] / 2, CHASSIS_SIZE[2] / 2))
  );
  chassisBody.position.set(0, 0.9, 0);
  chassisBody.angularDamping = 0.4;

  const vehicle = new CANNON.RaycastVehicle({
    chassisBody,
    indexRightAxis: 0,
    indexUpAxis: 1,
    indexForwardAxis: 2,
  });

  const hx = TRACK / 2;
  const hz = WHEELBASE / 2;
  const cy = -CHASSIS_SIZE[1] / 2 + 0.1;
  // Wheel order: 0 FL, 1 FR, 2 RL, 3 RR — with local -Z treated as FORWARD,
  // so the "front" wheels sit at negative z.
  for (const [x, z] of [
    [-hx, -hz],
    [hx, -hz],
    [-hx, hz],
    [hx, hz],
  ]) {
    vehicle.addWheel({
      ...OPTS,
      radius: WHEEL_RADIUS,
      directionLocal: new CANNON.Vec3(0, -1, 0),
      axleLocal: new CANNON.Vec3(1, 0, 0),
      chassisConnectionPointLocal: new CANNON.Vec3(x, cy, z),
    });
  }
  vehicle.addToWorld(world);
  return vehicle;
}

function settle(world, steps = 90) {
  for (let i = 0; i < steps; i++) world.step(DT);
}

function yawOf(body) {
  const q = body.quaternion;
  // Yaw around Y from a quaternion (YXZ order, matching THREE's convention).
  return Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z));
}

// ---------------------------------------------------------------------------
// Probe 1: which local axis does POSITIVE applyEngineForce drive toward?
// ---------------------------------------------------------------------------
function probeForceSign() {
  const world = buildWorld();
  const v = buildVehicle(world);
  settle(world);
  const start = v.chassisBody.position.clone();
  for (let i = 0; i < 120; i++) {
    v.applyEngineForce(1500, 2);
    v.applyEngineForce(1500, 3);
    world.step(DT);
  }
  const dz = v.chassisBody.position.z - start.z;
  console.log('\n[1] ENGINE FORCE SIGN');
  console.log(`    +1500N on rear wheels for 2s -> world dz = ${dz.toFixed(2)} m`);
  console.log(`    wheels in contact = ${v.wheelInfos.filter((w) => w.isInContact).length}/4`);
  console.log(
    `    => POSITIVE engine force drives toward local ${dz > 0 ? '+Z' : '-Z'}. ` +
      `With -Z as "forward", DRIVE needs a ${dz > 0 ? 'NEGATIVE' : 'POSITIVE'} value.`
  );
  return dz > 0 ? -1 : 1; // multiplier that makes the car go toward local -Z
}

// ---------------------------------------------------------------------------
// Probe 2: which steering sign turns the car left (yaw increasing)?
// ---------------------------------------------------------------------------
function probeSteerSign(driveSign) {
  const world = buildWorld();
  const v = buildVehicle(world);
  settle(world);
  const steer = 0.4;
  for (let i = 0; i < 180; i++) {
    v.setSteeringValue(steer, 0);
    v.setSteeringValue(steer, 1);
    v.applyEngineForce(1200 * driveSign, 2);
    v.applyEngineForce(1200 * driveSign, 3);
    world.step(DT);
  }
  const yaw = yawOf(v.chassisBody);
  console.log('\n[2] STEERING SIGN');
  console.log(`    steer=+0.4 while driving forward -> yaw = ${((yaw * 180) / Math.PI).toFixed(1)} deg`);
  console.log(
    `    => POSITIVE steering value turns ${yaw > 0 ? 'LEFT (CCW seen from above)' : 'RIGHT (CW)'}.`
  );
  return yaw > 0 ? 1 : -1; // multiplier so that +1 input = right turn
}

// ---------------------------------------------------------------------------
// Probe 3: acceleration curve + top speed for a given per-wheel force/cap.
// ---------------------------------------------------------------------------
/**
 * @param {(speedMs:number)=>number} forceOf  TOTAL engine force (both driven
 *   wheels) at a given speed — Car.js's real curve, not a flat/taper stand-in,
 *   so this probe measures what the game actually does.
 */
function probeAccel(driveSign, forceOf, capKmh, label) {
  const world = buildWorld();
  const v = buildVehicle(world);
  settle(world);
  const cap = capKmh / 3.6;
  let t = 0;
  let tTo30 = null;
  let tTo100 = null;
  let peak = 0;
  for (let i = 0; i < 60 * 20; i++) {
    const speed = v.chassisBody.velocity.length();
    const total = speed < cap ? forceOf(speed) * driveSign : 0;
    v.applyEngineForce(total / 2, 2);
    v.applyEngineForce(total / 2, 3);
    world.step(DT);
    t += DT;
    const kmh = v.chassisBody.velocity.length() * 3.6;
    peak = Math.max(peak, kmh);
    if (tTo30 === null && kmh >= 30) tTo30 = t;
    if (tTo100 === null && kmh >= 100) tTo100 = t;
  }
  console.log(
    `\n[3] ACCEL ${label}: cap ${capKmh} km/h -> ` +
      `0-30 km/h in ${tTo30 ? tTo30.toFixed(2) + 's' : 'never'}` +
      (tTo100 ? `, 0-100 km/h in ${tTo100.toFixed(2)}s` : '') +
      `, peak ${peak.toFixed(1)} km/h`
  );
}

// ---------------------------------------------------------------------------
// Probe 4: steady-state turning radius at full lock (the number that decides
// whether a tight 3-point turn in a parking aisle is actually possible).
// ---------------------------------------------------------------------------
function probeTurnRadius(driveSign, steerSign, maxSteerDeg) {
  const world = buildWorld();
  const v = buildVehicle(world);
  settle(world);
  const steer = (maxSteerDeg * Math.PI) / 180 * steerSign;
  // Creep at parking speed — turning radius is speed-dependent under slip.
  const cap = 8 / 3.6;
  const samples = [];
  for (let i = 0; i < 60 * 14; i++) {
    v.setSteeringValue(steer, 0);
    v.setSteeringValue(steer, 1);
    const f = v.chassisBody.velocity.length() < cap ? 900 * driveSign : 0;
    v.applyEngineForce(f, 2);
    v.applyEngineForce(f, 3);
    world.step(DT);
    if (i > 60 * 4) samples.push({ x: v.chassisBody.position.x, z: v.chassisBody.position.z });
  }
  // Fit a circle to the sampled path (algebraic least squares).
  const n = samples.length;
  let sx = 0, sz = 0;
  for (const p of samples) { sx += p.x; sz += p.z; }
  const mx = sx / n, mz = sz / n;
  let suu = 0, svv = 0, suv = 0, suuu = 0, svvv = 0, suvv = 0, svuu = 0;
  for (const p of samples) {
    const u = p.x - mx, w = p.z - mz;
    suu += u * u; svv += w * w; suv += u * w;
    suuu += u * u * u; svvv += w * w * w; suvv += u * w * w; svuu += w * u * u;
  }
  const c1 = (suuu + suvv) / 2, c2 = (svvv + svuu) / 2;
  const det = suu * svv - suv * suv;
  const uc = (c1 * svv - c2 * suv) / det;
  const vc = (c2 * suu - c1 * suv) / det;
  const r = Math.sqrt(uc * uc + vc * vc + (suu + svv) / n);
  const ackermann = WHEELBASE / Math.tan((maxSteerDeg * Math.PI) / 180);
  console.log(`\n[4] TURNING CIRCLE at ${maxSteerDeg} deg lock, ~8 km/h`);
  console.log(`    measured radius (rear-axle path) = ${r.toFixed(2)} m`);
  console.log(`    ideal Ackermann radius           = ${ackermann.toFixed(2)} m`);
  console.log(`    => kerb-to-kerb diameter ~ ${(2 * r + CHASSIS_SIZE[0]).toFixed(1)} m`);
  console.log(
    `    A 3-point turn needs an aisle wider than about ` +
      `${(r * 0.75 + CHASSIS_SIZE[2] * 0.6).toFixed(1)} m; design aisles >= 9 m to be safe.`
  );
  return r;
}

// ---------------------------------------------------------------------------
// Probe 5: does the car survive a full-throttle wall hit upright?
// (v1's known "high speed impact flips the car" gap.)
// ---------------------------------------------------------------------------
function probeWallImpact(driveSign) {
  const world = buildWorld();
  const v = buildVehicle(world);
  const wall = new CANNON.Body({ mass: 0 });
  wall.addShape(new CANNON.Box(new CANNON.Vec3(10, 1.5, 0.4)));
  wall.position.set(0, 1.5, -25);
  world.addBody(wall);
  settle(world);
  for (let i = 0; i < 60 * 10; i++) {
    const f = v.chassisBody.velocity.length() < 45 / 3.6 ? 2000 * driveSign : 0;
    v.applyEngineForce(f, 2);
    v.applyEngineForce(f, 3);
    world.step(DT);
  }
  // Up-vector tilt after the crash: 0 deg = perfectly upright.
  const up = v.chassisBody.vectorToWorldFrame(new CANNON.Vec3(0, 1, 0), new CANNON.Vec3());
  const tilt = (Math.acos(Math.max(-1, Math.min(1, up.y))) * 180) / Math.PI;
  console.log(`\n[5] WALL IMPACT at full throttle -> chassis tilt after = ${tilt.toFixed(1)} deg`);
  console.log(`    ${tilt < 15 ? 'OK: stays upright.' : 'BAD: car is flipping — raise angularDamping / lower CoM.'}`);
}

console.log('=== v4 vehicle probe ===');
console.log(`mass ${CHASSIS_MASS}kg, wheelbase ${WHEELBASE}m, max steer ${MAX_STEER_DEG} deg`);
const driveSign = probeForceSign();
const steerSign = probeSteerSign(driveSign);
// Mirrors Car.js's DRIVE_FORCE_N/DRIVE_POWER_W/DRIVE_CORNER_MS exactly (kept
// in sync by hand — there's no shared import between this standalone probe
// and the game bundle).
const DRIVE_FORCE_N = 4800;
const DRIVE_POWER_W = 40000;
const DRIVE_CORNER_MS = DRIVE_POWER_W / DRIVE_FORCE_N;
probeAccel(driveSign, (v) => (v <= DRIVE_CORNER_MS ? DRIVE_FORCE_N : DRIVE_POWER_W / Math.max(v, 0.5)), 100, 'DRIVE');
probeAccel(driveSign, () => 1400, 18, 'REVERSE');
probeTurnRadius(driveSign, steerSign, MAX_STEER_DEG);
probeTurnRadius(driveSign, steerSign, 34);
probeWallImpact(driveSign);
console.log('\n=== done ===\n');
