/**
 * RaceCar.js — the racing vehicle: cannon-es RaycastVehicle, an engine with a
 * torque curve, a gearbox that actually drives the wheels, aerodynamic drag,
 * brakes, handbrake drift, nitrous and every tuning setting in
 * design/SPEC-game.md §7.
 *
 * THIS IS NOT PARKING PRECISION'S Car.js. That car is tuned to be precise at
 * 5 km/h: gear never touches wheel force, speed is hard-capped at 100 km/h,
 * the brake is deliberately soft, and P is a pawl. Here:
 *
 *   wheel force = torque(rpm) x gear x final drive x efficiency / wheel radius
 *   drag        = 0.5 x rho x CdA x v²  +  Crr x m x g   (applied every substep)
 *
 * so acceleration falls off through the gears and top speed is where drag
 * meets power, not a cut-off. Numbers per car live in cars.js; what they
 * actually produce is measured by tools/race-physics-probe.mjs.
 *
 * KEPT FROM Car.js, because each was a real bug there:
 *   - Forward is local -Z, a POSITIVE engine force drives forward, and a
 *     POSITIVE cannon steering value turns LEFT (negated once, below).
 *   - wheelInfo.isInContact reads false after a step, so wheel friction alone
 *     cannot hold a stopped car: a held brake below 0.3 m/s zeroes velocity.
 *   - Wheel meshes are children of the car group, so wheel world transforms
 *     are converted to chassis-local before they are copied in.
 *
 * CANNON'S FRICTION MODEL, which the tuning numbers are written against:
 * per wheel and per step the tyre can deliver an impulse of at most
 * suspensionForce x dt x frictionSlip, shared between side and forward
 * (a friction circle, with forward counted at half weight). Exceed it and the
 * wheel slides, which scales both down. So frictionSlip is grip, brakeImpulse
 * is the most a brake can take off per step, and a handbrake that cuts rear
 * frictionSlip is what lets the back step out.
 */
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { createEmitter } from '../core/Events.js';
import { createSedanShell, createWheelMesh } from './CarModel.js';
import { BODIES } from './bodies.js';
import { torqueAt } from './cars.js';
import { defaultTuning, resolveTuning } from './Tuning.js';

const G = 9.82;
const AIR_DENSITY = 1.2;
const FIXED_STEP = 1 / 120; // must match PhysicsWorld.js
/** Below this a held brake (or handbrake) locks the car. See header. */
const BRAKE_HOLD_MS = 0.3;
/** Holding brake below this forward speed selects reverse (arcade gearbox). */
const REVERSE_ENGAGE_MS = 0.8;
/** Torque is cut for this long while the auto gearbox changes gear. */
const SHIFT_TIME = 0.22;
/** Clutch slip: at a launch the engine may run above road speed up to here. */
const LAUNCH_RPM = 3200;
/** Handbrake: rear grip falls to this fraction while it is held. */
const HANDBRAKE_GRIP = 0.5;
/** Slide under power: throttle starts bleeding rear grip past this slip angle... */
const SUSTAIN_FROM_DEG = 8;
/** ...reaching the full tuned amount this many degrees later. */
const SUSTAIN_RAMP_DEG = 12;
/** Grip-limited lock is this much past the kinematic grip limit (see update). */
const GRIP_LOCK_MARGIN = 1.3;
/** Counter-steer may turn the front wheels to the slip angle plus this. */
const COUNTER_MARGIN_DEG = 6;
/** Rear brake impulse while the handbrake is held (N·s per step). */
const HANDBRAKE_IMPULSE = 40;
/** Keyboard steering: seconds to full lock at a standstill... */
const STEER_RAMP_SLOW = 0.4;
/** ...and at STEER_RAMP_SPEED, where a tap must not become a swerve. */
const STEER_RAMP_FAST = 0.6;
const STEER_RAMP_SPEED = 55; // m/s (~200 km/h)
const STEER_RETURN = 0.3;
/** Nitrous: extra force fraction and seconds per bottle. */
const NITRO_BOOST = 0.25;
const NITRO_SECONDS = 5;

export function createRaceCar({ physics, car, tuning = defaultTuning(car), spawn, visual = true }) {
  const events = createEmitter();
  const ch = car.chassis;

  // --- chassis ---------------------------------------------------------------
  const chassisBody = new CANNON.Body({ mass: car.mass });
  chassisBody.addShape(new CANNON.Box(new CANNON.Vec3(ch.size[0] / 2, ch.size[1] / 2, ch.size[2] / 2)));
  // Same reasoning as Car.js: without generous angular damping, driven-wheel
  // reaction torque lets pitch/roll oscillation build until the car noses in.
  chassisBody.angularDamping = 0.35;
  chassisBody.linearDamping = 0; // drag is modelled explicitly below
  chassisBody.userData = { kind: 'player' };

  const vehicle = new CANNON.RaycastVehicle({
    chassisBody,
    indexRightAxis: 0,
    indexUpAxis: 1,
    indexForwardAxis: 2,
  });

  const axleZ = ch.wheelbase / 2;
  const hx = ch.track / 2;
  // Wheel order 0 FL, 1 FR, 2 RL, 3 RR. Front wheels at NEGATIVE z (forward is -Z).
  for (const [x, z] of [
    [-hx, -axleZ],
    [hx, -axleZ],
    [-hx, axleZ],
    [hx, axleZ],
  ]) {
    vehicle.addWheel({
      radius: ch.wheelRadius,
      directionLocal: new CANNON.Vec3(0, -1, 0),
      axleLocal: new CANNON.Vec3(1, 0, 0),
      suspensionStiffness: ch.suspensionStiffness,
      suspensionRestLength: ch.suspensionRest,
      frictionSlip: 2,
      dampingRelaxation: 2.6,
      dampingCompression: 4.4,
      maxSuspensionForce: 1e6,
      rollInfluence: 0.04,
      maxSuspensionTravel: 0.2,
      customSlidingRotationalSpeed: -30,
      useCustomSlidingRotationalSpeed: true,
      chassisConnectionPointLocal: new CANNON.Vec3(x, ch.connectY, z),
    });
  }
  vehicle.addToWorld(physics.world);
  physics.registerChassis?.(chassisBody);

  const FRONT = [0, 1];
  const REAR = [2, 3];
  const DRIVEN = car.drive === 'FWD' ? FRONT : car.drive === 'AWD' ? [0, 1, 2, 3] : REAR;

  // --- tuning ------------------------------------------------------------------
  let t = resolveTuning(car, tuning);
  function applyTuning(next) {
    t = resolveTuning(car, next);
    for (let i = 0; i < 4; i++) {
      const w = vehicle.wheelInfos[i];
      const front = i < 2;
      w.suspensionStiffness = front ? t.stiffnessFront : t.stiffnessRear;
      w.dampingRelaxation = t.damping.relaxation;
      w.dampingCompression = t.damping.compression;
      w.rollInfluence = t.rollInfluence;
      w.chassisConnectionPointLocal.y = ch.connectY + t.rideHeightOffset;
    }
    nitroLeft = t.nitroBottles * NITRO_SECONDS;
  }

  // --- visuals -------------------------------------------------------------------
  const mesh = new THREE.Group();
  mesh.name = `car:${car.id}`;
  let wheelMeshes = [];
  if (visual) {
    const { group: shell } = createSedanShell({ paint: t.paint ?? car.paint, interior: true, spec: BODIES[car.body] });
    mesh.add(shell);
    wheelMeshes = vehicle.wheelInfos.map(() => {
      const m = createWheelMesh(t.rimStyle ?? 0);
      mesh.add(m);
      return m;
    });
  }

  // --- state -------------------------------------------------------------------------
  let gearIndex = 0; // 0-based forward gear
  let reverse = false;
  let rpm = car.idleRpm;
  let shiftT = 0;
  let steer = 0; // -1 left .. +1 right (the steering wheel)
  let nitroLeft = 0;
  let nitroOn = false;
  let limiter = false;
  let wheelForce = 0; // total drive force this step, N (for telemetry)
  let dragForce = 0;
  let manual = false;
  /** Front-wheel angle at full steer right now, before counter-steer authority. */
  let normalLockDeg = 0;
  const controls = { throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false, analogSteer: false };

  const scratch = {
    fwd: new CANNON.Vec3(),
    localPos: new CANNON.Vec3(),
    localQuat: new CANNON.Quaternion(),
    invQuat: new CANNON.Quaternion(),
    drag: new CANNON.Vec3(),
    right: new CANNON.Vec3(),
    forwardLocal: new CANNON.Vec3(0, 0, -1),
    rearAxleLocal: new CANNON.Vec3(0, 0, ch.wheelbase / 2),
    rearAxle: new CANNON.Vec3(),
    rearVel: new CANNON.Vec3(),
  };

  applyTuning(tuning);

  function forwardSpeed() {
    chassisBody.vectorToWorldFrame(new CANNON.Vec3(0, 0, -1), scratch.fwd);
    return chassisBody.velocity.dot(scratch.fwd);
  }
  const speed = () => chassisBody.velocity.length();

  function ratio(i) {
    return car.gears[i] * t.gearScale[i] * t.finalDrive;
  }
  /** Engine rpm the road speed implies in gear i (no clutch slip). */
  function roadRpm(vFwd, i) {
    const wheelRpm = (Math.abs(vFwd) / (2 * Math.PI * ch.wheelRadius)) * 60;
    return wheelRpm * (reverse ? car.reverseRatio * t.finalDrive : ratio(i));
  }

  function respawn(s) {
    chassisBody.position.set(s.pos[0], s.pos[1] ?? ch.rideHeight, s.pos[2]);
    chassisBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), s.heading ?? 0);
    chassisBody.velocity.setZero();
    chassisBody.angularVelocity.setZero();
    chassisBody.force.setZero();
    chassisBody.torque.setZero();
    gearIndex = 0;
    reverse = false;
    rpm = car.idleRpm;
    shiftT = 0;
    steer = 0;
    nitroLeft = t.nitroBottles * NITRO_SECONDS;
    for (let i = 0; i < 4; i++) {
      vehicle.setSteeringValue(0, i);
      vehicle.applyEngineForce(0, i);
      vehicle.setBrake(0, i);
    }
  }
  if (spawn) respawn(spawn);

  // --- drag, every physics substep ---------------------------------------------------
  // A force applied once per frame would only act on the first of several
  // substeps (cannon clears forces after each), so drag rides on preStep like
  // the vehicle's own update does.
  function onPreStep() {
    const v = chassisBody.velocity;
    const s = v.length();
    if (s < 0.05) {
      dragForce = 0;
      return;
    }
    const aero = 0.5 * AIR_DENSITY * car.CdA * s * s;
    const roll = car.Crr * car.mass * G;
    dragForce = aero + roll;
    v.scale(-dragForce / s, scratch.drag);
    chassisBody.applyForce(scratch.drag);
  }
  physics.world.addEventListener('preStep', onPreStep);

  /**
   * @param {number} dt frame time
   * @param {{throttle:number, brake:number, steer:number, handbrake:boolean,
   *          nitro:boolean, analogSteer?:boolean, shiftUp?:boolean, shiftDown?:boolean}} input
   *   throttle/brake 0..1, steer -1..1 (keyboard sends -1/0/1).
   */
  function update(dt, input) {
    Object.assign(controls, input);
    const v = speed();
    const vFwd = forwardSpeed();

    // --- steering -----------------------------------------------------------
    // Analog (gamepad): the stick IS the wheel position, lightly smoothed.
    // Keyboard: ramp toward the key, slower at speed so a tap stays a tap.
    if (controls.analogSteer) {
      steer += (controls.steer - steer) * Math.min(1, dt * 14);
    } else if (controls.steer === 0) {
      const r = dt / STEER_RETURN;
      steer = steer > 0 ? Math.max(0, steer - r) : Math.min(0, steer + r);
    } else {
      const ramp = THREE.MathUtils.lerp(STEER_RAMP_SLOW, STEER_RAMP_FAST, Math.min(1, v / STEER_RAMP_SPEED));
      // Counter-steer (key opposite to the wheel) snaps back twice as fast.
      const counter = Math.sign(controls.steer) !== Math.sign(steer) && steer !== 0;
      steer = THREE.MathUtils.clamp(steer + Math.sign(controls.steer - steer) * (dt / ramp) * (counter ? 2 : 1), -1, 1);
    }
    const fade = Math.min(1, v / (t.lockFadeKmh / 3.6));
    let lockDeg = THREE.MathUtils.lerp(t.maxLockDeg, car.minLockDeg, fade);
    // Grip-limited lock. Past the angle the front tyres can use at this speed,
    // more lock only makes them slide: measured at full keyboard steer, 40 km/h
    // circled 18 m wide at 0.68 g instead of ~1 g (the owner's "turning radius
    // is really bad"). So full steer asks for the tightest circle the grip
    // allows, a little past it so the limit still reads as gentle understeer.
    // Kinematic: tan(lock) = wheelbase / radius, radius = v² / (grip x g).
    // Only while gripping: in a slide (or on the handbrake) the driver needs
    // the full lock both ways, so the cap fades out from 4 to 12 degrees of
    // rear slip.
    const slipAbs = Math.abs(slipAngleDeg());
    const gripping = controls.handbrake ? 0 : 1 - THREE.MathUtils.clamp((slipAbs - 4) / 8, 0, 1);
    if (v > 1 && gripping > 0) {
      const gripLock = THREE.MathUtils.radToDeg(Math.atan((ch.wheelbase * t.gripFront * G) / (v * v))) * GRIP_LOCK_MARGIN;
      const capped = Math.min(lockDeg, Math.max(car.minLockDeg, gripLock));
      lockDeg = THREE.MathUtils.lerp(lockDeg, capped, gripping);
    }
    normalLockDeg = lockDeg;
    // Counter-steer authority. Speed-faded lock stops a key tap at 200 km/h
    // becoming a swerve, but it also stopped the front wheels pointing where a
    // sliding car is actually going, so every slide past ~20° became a spin
    // (measured, tools/race-physics-probe.mjs). While sliding, steering INTO
    // the direction of travel may turn the wheels up to the slip angle plus a
    // margin, capped at full lock. (slip > 0: nose left of travel, so
    // counter-steer is steer > 0.)
    const slipNow = slipAngleDeg();
    if (Math.abs(slipNow) > 6 && Math.sign(steer) === Math.sign(slipNow)) {
      lockDeg = Math.max(lockDeg, Math.min(t.maxLockDeg, Math.abs(slipNow) + COUNTER_MARGIN_DEG));
    }
    const lock = THREE.MathUtils.degToRad(lockDeg);
    const roadWheel = -steer * lock; // negated: +steer is right, +cannon is left
    for (const i of FRONT) vehicle.setSteeringValue(roadWheel, i);

    // --- direction: brake held at a standstill selects reverse ---------------
    if (!reverse && controls.brake > 0 && controls.throttle === 0 && vFwd < REVERSE_ENGAGE_MS && vFwd > -0.5) {
      if (v < REVERSE_ENGAGE_MS) {
        reverse = true;
        events.emit('gear', { gear: 'R' });
      }
    } else if (reverse && controls.throttle > 0 && vFwd > -REVERSE_ENGAGE_MS) {
      reverse = false;
      gearIndex = 0;
      events.emit('gear', { gear: 1 });
    }
    // In reverse, S is the accelerator and W the brake.
    const accel = reverse ? controls.brake : controls.throttle;
    const brakeIn = reverse ? controls.throttle : controls.brake;

    // --- gearbox ---------------------------------------------------------------
    if (shiftT > 0) shiftT -= dt;
    // Hold the gear through a slide: road rpm comes from FORWARD speed, which
    // collapses at a big drift angle, and the auto box then hunted down to 1st
    // and bounced off the limiter mid-drift (seen in the Handling Lab).
    const holdGear = Math.abs(slipAngleDeg()) > 12;
    if (!reverse) {
      if (manual) {
        if (controls.shiftUp && gearIndex < car.gears.length - 1) shiftTo(gearIndex + 1);
        if (controls.shiftDown && gearIndex > 0) shiftTo(gearIndex - 1);
      } else if (shiftT <= 0 && !holdGear) {
        const r = roadRpm(vFwd, gearIndex);
        if (r > t.shiftRpm && gearIndex < car.gears.length - 1 && accel > 0) shiftTo(gearIndex + 1);
        else if (gearIndex > 0) {
          // Down when the gear below would still sit safely under the shift point.
          const below = roadRpm(vFwd, gearIndex - 1);
          if (below < t.shiftRpm * 0.72) shiftTo(gearIndex - 1);
        }
      }
    }

    // --- engine ---------------------------------------------------------------
    const road = roadRpm(vFwd, gearIndex);
    // Clutch slip in first (and reverse): the engine can sit above road speed
    // at a launch; above LAUNCH_RPM road speed has caught up.
    const slipping = (gearIndex === 0 || reverse) && accel > 0;
    const targetRpm = Math.max(car.idleRpm, slipping ? Math.max(road, THREE.MathUtils.lerp(car.idleRpm, LAUNCH_RPM, accel)) : road);
    rpm += (Math.min(targetRpm, car.limiterRpm + 150) - rpm) * Math.min(1, dt * 12);
    limiter = rpm >= car.limiterRpm;

    let force = 0;
    if (accel > 0 && shiftT <= 0 && !limiter) {
      const tq = torqueAt(car.torque, rpm) * t.powerScale * accel;
      const r = reverse ? car.reverseRatio * t.finalDrive : ratio(gearIndex);
      force = (tq * r * car.driveEfficiency) / ch.wheelRadius;
      if (reverse && Math.abs(vFwd) > car.reverseTopKmh / 3.6) force = 0;
    }
    nitroOn = controls.nitro && nitroLeft > 0 && accel > 0 && !reverse;
    if (nitroOn) {
      force *= 1 + NITRO_BOOST;
      nitroLeft = Math.max(0, nitroLeft - dt);
    }
    wheelForce = force;
    const signed = reverse ? -force : force;

    // Split between the driven wheels. An open diff can only push as hard as
    // its lighter-loaded wheel can grip; a limited-slip diff splits evenly.
    let perWheel = signed / DRIVEN.length;
    if (t.diff === 'open' && DRIVEN.length === 2) {
      const [a, b] = DRIVEN.map((i) => vehicle.wheelInfos[i].suspensionForce);
      const lighter = Math.max(0, Math.min(a, b));
      const cap = lighter * t.gripRear * 2; // forward counts at half weight (see header)
      if (lighter > 0 && Math.abs(perWheel) > cap) perWheel = Math.sign(perWheel) * cap;
    }
    for (let i = 0; i < 4; i++) vehicle.applyEngineForce(DRIVEN.includes(i) ? perWheel : 0, i);

    // --- grip, brakes, handbrake -------------------------------------------------
    // Slide under power. Cannon counts forward force at half weight in its
    // friction circle, so no road car here can break the rear loose on the
    // throttle alone (measured: the starter uses ~40% of its rear grip in
    // 2nd). Real drifting is exactly that, so it is modelled directly: once
    // the car is already sliding, throttle bleeds rear grip. Lift and it grips
    // up again. Only for a driven rear axle.
    let rearMult = controls.handbrake ? HANDBRAKE_GRIP : 1;
    const slip = Math.abs(slipAngleDeg());
    if (car.drive !== 'FWD' && slip > SUSTAIN_FROM_DEG && accel > 0.2) {
      const depth = Math.min(1, (slip - SUSTAIN_FROM_DEG) / SUSTAIN_RAMP_DEG);
      rearMult *= 1 - t.slideSustain * accel * depth;
    }
    for (const i of FRONT) vehicle.wheelInfos[i].frictionSlip = t.gripFront;
    for (const i of REAR) vehicle.wheelInfos[i].frictionSlip = t.gripRear * rearMult;

    const brakeTotal = car.brakeImpulse * t.brakeScale * brakeIn;
    const bf = brakeTotal * t.brakeBias * 2; // per front wheel (x2: bias 0.5 = equal)
    const br = brakeTotal * (1 - t.brakeBias) * 2;
    for (const i of FRONT) vehicle.setBrake(bf, i);
    for (const i of REAR) vehicle.setBrake(controls.handbrake ? Math.max(br, HANDBRAKE_IMPULSE) : br, i);
    // Engine braking when off the throttle, a small drag on the driven wheels.
    if (accel === 0 && brakeIn === 0 && !controls.handbrake) {
      for (const i of DRIVEN) vehicle.setBrake(0.6 + 0.4 * (gearIndex === 0 ? 1 : 1 / (gearIndex + 1)), i);
    }

    if ((brakeIn > 0 || controls.handbrake) && v < BRAKE_HOLD_MS && accel === 0) {
      chassisBody.velocity.setZero();
      chassisBody.angularVelocity.setZero();
    }

    syncMeshes();
  }

  function shiftTo(i) {
    if (i === gearIndex) return;
    gearIndex = i;
    shiftT = SHIFT_TIME;
    events.emit('gear', { gear: i + 1 });
  }

  function syncMeshes() {
    mesh.position.copy(chassisBody.position);
    mesh.quaternion.copy(chassisBody.quaternion);
    for (let i = 0; i < wheelMeshes.length; i++) {
      vehicle.updateWheelTransform(i);
      const wt = vehicle.wheelInfos[i].worldTransform;
      chassisBody.pointToLocalFrame(wt.position, scratch.localPos);
      chassisBody.quaternion.conjugate(scratch.invQuat);
      scratch.invQuat.mult(wt.quaternion, scratch.localQuat);
      wheelMeshes[i].position.copy(scratch.localPos);
      wheelMeshes[i].quaternion.copy(scratch.localQuat);
    }
  }

  /**
   * Drift angle, degrees: how far the REAR AXLE's velocity points away from
   * the car's heading. Measured at the rear axle, not the chassis centre: a
   * car turning tightly with no slide at all has a centre velocity well off
   * its heading (about 20 degrees at full lock and walking pace, pure
   * geometry), and reading that as a drift switched on slide-under-power,
   * counter-steer authority and the gear hold in every tight turn. The rear
   * axle does not steer, so in a turn without sliding it tracks its heading.
   * Positive: nose left of travel (counter-steer is steer > 0).
   */
  function slipAngleDeg() {
    chassisBody.pointToWorldFrame(scratch.rearAxleLocal, scratch.rearAxle);
    chassisBody.getVelocityAtWorldPoint(scratch.rearAxle, scratch.rearVel);
    const vx = scratch.rearVel.x;
    const vz = scratch.rearVel.z;
    const s = Math.hypot(vx, vz);
    if (s < 2) return 0;
    chassisBody.vectorToWorldFrame(scratch.forwardLocal, scratch.fwd);
    const fx = scratch.fwd.x;
    const fz = scratch.fwd.z;
    const fl = Math.hypot(fx, fz) || 1;
    const dot = (vx * fx + vz * fz) / (s * fl);
    const cross = (fx * vz - fz * vx) / (s * fl);
    return (Math.atan2(cross, dot) * 180) / Math.PI;
  }

  function dispose() {
    physics.world.removeEventListener('preStep', onPreStep);
    vehicle.removeFromWorld(physics.world);
  }

  return {
    car,
    mesh,
    chassisBody,
    vehicle,
    on: events.on,
    update,
    respawn,
    applyTuning,
    dispose,
    setManual(v) {
      manual = Boolean(v);
    },
    get tuning() {
      return t;
    },
    get state() {
      const v = speed();
      return {
        speedMs: v,
        speedKmh: v * 3.6,
        forwardSpeedMs: forwardSpeed(),
        gear: reverse ? 'R' : gearIndex + 1,
        rpm,
        limiter,
        shifting: shiftT > 0,
        steer,
        lockDeg: normalLockDeg,
        wheelForce,
        dragForce,
        nitroLeft,
        nitroOn,
        slipDeg: slipAngleDeg(),
        sliding: vehicle.wheelInfos.map((w) => w.sliding),
        manual,
      };
    },
  };
}

export { FIXED_STEP };
