/**
 * Car.js — the vehicle: cannon-es RaycastVehicle, the PRND transmission, the
 * steering model, and the mapping from key presses to forces.
 *
 * HANDLING BRIEF: "snappy arcade". Light (900 kg, not 1400), immediate
 * response, high grip, no drift, no float. Everything here is tuned toward
 * feeling precise at 5 km/h in a tight bay rather than exciting at 90.
 * Numbers came out of tools/physics-probe.mjs, not out of the air:
 *
 *   0 - 30 km/h in ~1.5 s        turning radius 3.56 m at full 42-degree lock
 *   top speed 40 km/h in D       kerb-to-kerb circle ~8.9 m
 *   reverse capped at 18 km/h    survives a full-throttle wall hit upright
 *
 * SIGNS (measured, see Dimensions.js): forward is local -Z, a POSITIVE engine
 * force drives forward, and a POSITIVE cannon steering value turns LEFT.
 */
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { createEmitter } from '../core/Events.js';
import { createSedanShell, createWheelMesh } from './CarModel.js';
import {
  CHASSIS_SIZE,
  RIDE_HEIGHT,
  WHEEL_RADIUS,
  WHEELBASE,
  TRACK,
  SUSPENSION_REST,
  SUSPENSION_STIFFNESS,
  WHEEL_CONNECT_Y,
  AXLE_Z,
} from './Dimensions.js';

const CHASSIS_MASS = 900;

// --- steering ---------------------------------------------------------------
/** Road-wheel angle at full lock, parking speeds. */
const MAX_STEER_RAD = (42 * Math.PI) / 180;
/** ...falling to this by MAX_STEER_FADE_SPEED, so the car can't spin at speed. */
const MIN_STEER_RAD = (19 * Math.PI) / 180;
const STEER_FADE_SPEED_MS = 40 / 3.6;
/** Seconds from centre to full lock while a steer key is held. */
const STEER_TO_LOCK_TIME = 0.45;
/** Seconds from full lock back to centre once the key is released. */
const STEER_RETURN_TIME = 0.4;
/**
 * Steering wheel travel. 720 degrees lock-to-lock means +/-360 degrees of rim
 * rotation for +/-1 of steering input.
 */
export const WHEEL_HALF_TURNS_RAD = Math.PI * 2;

// --- powertrain -------------------------------------------------------------
// D is torque-limited (constant force) up to DRIVE_CORNER_MS, then
// power-limited (force = POWER / v) beyond it — the shape of a real engine's
// curve, not an arcade constant-then-cliff taper. User-requested change from
// the old 3-speed/40 km/h cap; see CLAUDE.md §6 (updated) for the measured
// numbers this produces. City-car power on purpose: DRIVE_POWER_W is ~54 hp,
// not a hot hatch — 0-30 km/h in ~1.5 s (same launch feel as before this
// change), 0-100 km/h in ~9.5 s, tapering visibly past 30 km/h rather than
// holding flat to the cap.
// DRIVE_FORCE_N matches the old flat 2400N/wheel exactly (4800N total) - the
// low-speed launch feel every other level's autodrive route was tuned
// against is untouched; only the top end (power-limited beyond
// DRIVE_CORNER_MS) is new. Level 13's autodrive scraped a wall with an
// initial weaker-launch attempt (4167N) - restoring the exact old low end
// fixed it without giving up the requested 100 km/h top-end taper.
const DRIVE_FORCE_N = 4800; // N total (torque-limited phase, both rear wheels)
const DRIVE_POWER_W = 40000; // W total (power-limited phase beyond DRIVE_CORNER_MS)
const DRIVE_CORNER_MS = DRIVE_POWER_W / DRIVE_FORCE_N; // ~8.3 m/s, ~30 km/h
const TOP_SPEED_D = 100 / 3.6;
const ENGINE_FORCE_R = 1400;
const TOP_SPEED_R = 18 / 3.6;
/** Reverse only: force tapers to zero over the last slice of its speed range
 *  (unlike D's power curve above), so backing up eases into its cap. */
const TAPER_BAND = 0.18;

/**
 * Left at the original 42 despite the higher top speed: doubling it (to 85)
 * regressed Level 13's autodrive (a bump, mis-tuned final heading) — braking
 * harder mid-corner on the long route was enough to perturb the pure-pursuit
 * steering into clipping something. Stopping from 100 km/h takes longer at
 * 42 than it would at a "realistic" brake force, but every level's autodrive
 * and handling probe were tuned against this exact number; not worth
 * destabilising them for a change nobody asked for. Revisit with a smaller
 * bump + re-verified autodrive if stopping distance ever becomes a
 * complaint.
 */
const BRAKE_FORCE = 42;
const HANDBRAKE_FORCE = 95;
const PARK_BRAKE_FORCE = 1e6;
/** Below this, the car counts as stopped for shift-guard purposes. */
const CREEP_SPEED_MS = 0.55;
/** Below this a held brake locks the car in place (see update()). */
const BRAKE_HOLD_SPEED_MS = 0.3;
/** No creep: a lifted-off car rolls down at this rate (m/s²) on the flat... */
const COAST_DECEL = 0.8;
/** ...and stops dead below this ground speed (m/s). */
const COAST_STOP_MS = 0.1;
/**
 * Hill-hold (SPEC-level13.md §5.6, user-confirmed): every flat level has
 * chassis pitch ~0, so this never engages outside Level 13's ramps. Creep
 * (260 N) is weaker than gravity on a 12% grade, so without this the car
 * rolls back ~1.2 m in 2 s every time the driver lifts off mid-ramp.
 */
const HILL_HOLD_MIN_PITCH = Math.atan(0.02); // 2% grade
const HILL_HOLD_SECONDS = 2.0;

/**
 * Automatic gearbox, purely for the RPM readout and the engine note — it has
 * no effect on the wheel force above (that depends only on road speed, see
 * DRIVE_FORCE_N/DRIVE_POWER_W). Six combined ratios (gearbox x final drive),
 * chosen so each upshifts at UPSHIFT_RPM at a round road speed: 1st->2nd at
 * ~20 km/h, 2nd->3rd ~35, 3rd->4th ~50, 4th->5th ~68, 5th->6th ~85, 6th
 * cruising to the 100 km/h cap at a relaxed ~3450 rpm (some redline headroom
 * left for passing power, like a real overdrive top gear).
 */
const AUTO_RATIOS = [21, 12, 8.5, 6.2, 5.0, 4.3];
const UPSHIFT_RPM = 3400;
const DOWNSHIFT_RPM = 1500;
const IDLE_RPM = 780;
const REDLINE_RPM = 6000;

export function createCar({ physics, spawn }) {
  const events = createEmitter();

  // --- chassis --------------------------------------------------------------
  const chassisBody = new CANNON.Body({ mass: CHASSIS_MASS });
  chassisBody.addShape(
    new CANNON.Box(
      new CANNON.Vec3(CHASSIS_SIZE[0] / 2, CHASSIS_SIZE[1] / 2, CHASSIS_SIZE[2] / 2)
    )
  );
  // Angular damping well above cannon's 0.01 default: without it the reaction
  // torque from the driven wheels lets pitch/roll oscillation build until the
  // chassis noses into the floor and the wheel raycasts stop finding ground.
  chassisBody.angularDamping = 0.42;
  chassisBody.linearDamping = 0.02;

  const vehicle = new CANNON.RaycastVehicle({
    chassisBody,
    indexRightAxis: 0,
    indexUpAxis: 1,
    indexForwardAxis: 2,
  });

  const wheelOptions = {
    radius: WHEEL_RADIUS,
    directionLocal: new CANNON.Vec3(0, -1, 0),
    axleLocal: new CANNON.Vec3(1, 0, 0),
    suspensionStiffness: SUSPENSION_STIFFNESS,
    suspensionRestLength: SUSPENSION_REST,
    // High grip on purpose: this car should go exactly where it is pointed.
    frictionSlip: 4.2,
    dampingRelaxation: 2.6,
    dampingCompression: 4.6,
    maxSuspensionForce: 1e5,
    rollInfluence: 0.02,
    maxSuspensionTravel: 0.2,
    customSlidingRotationalSpeed: -30,
    useCustomSlidingRotationalSpeed: true,
    chassisConnectionPointLocal: new CANNON.Vec3(),
  };

  // Wheel order 0 FL, 1 FR, 2 RL, 3 RR. Front wheels are at NEGATIVE z
  // because forward is -Z.
  const hx = TRACK / 2;
  for (const [x, z] of [
    [-hx, -AXLE_Z],
    [hx, -AXLE_Z],
    [-hx, AXLE_Z],
    [hx, AXLE_Z],
  ]) {
    vehicle.addWheel({
      ...wheelOptions,
      chassisConnectionPointLocal: new CANNON.Vec3(x, WHEEL_CONNECT_Y, z),
    });
  }
  vehicle.addToWorld(physics.world);
  physics.registerChassis(chassisBody);

  const FRONT = [0, 1];
  const REAR = [2, 3];

  // --- visuals --------------------------------------------------------------
  const mesh = new THREE.Group();
  mesh.name = 'playerCar';
  const { group: shell, beltAt } = createSedanShell({ paint: 0xcf6f5d, interior: true });
  mesh.add(shell);

  const wheelMeshes = vehicle.wheelInfos.map(() => {
    const m = createWheelMesh();
    mesh.add(m);
    return m;
  });

  // --- state ----------------------------------------------------------------
  let gear = 'P';
  let steerNorm = 0; // -1 full left .. +1 full right (the STEERING WHEEL, not
  // the road wheels — the road wheels are this scaled by the speed-faded lock)
  let rpm = IDLE_RPM;
  let autoGearIndex = 0;
  let bumpFlashT = 0;
  let odometerM = 0;
  let hillHoldT = 0;
  let hillHold = false;
  const tmpEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  const tmpQuat = new THREE.Quaternion();

  const scratch = {
    localPos: new CANNON.Vec3(),
    localQuat: new CANNON.Quaternion(),
    invQuat: new CANNON.Quaternion(),
    fwd: new CANNON.Vec3(),
  };

  function speedMs() {
    return chassisBody.velocity.length();
  }

  /**
   * Signed speed: positive when actually travelling nose-first. Needed because
   * velocity.length() can't tell rolling backwards from rolling forwards, and
   * the shift guard and the reversing camera both care.
   */
  function forwardSpeedMs() {
    chassisBody.vectorToWorldFrame(new CANNON.Vec3(0, 0, -1), scratch.fwd);
    return chassisBody.velocity.dot(scratch.fwd);
  }

  function setGear(requested, { force = false } = {}) {
    if (!['P', 'R', 'N', 'D'].includes(requested)) return false;
    if (gear === requested) return true;

    // Shift guard: no slamming R<->D while rolling. A real automatic refuses,
    // and without it the "arcade" car becomes an instant-reverse teleporter.
    const reversal =
      (gear === 'R' && requested === 'D') || (gear === 'D' && requested === 'R');
    const intoPark = requested === 'P';
    if (!force && (reversal || intoPark) && speedMs() > CREEP_SPEED_MS) {
      events.emit('gearRejected', { attempted: requested, gear });
      return false;
    }

    const previous = gear;
    gear = requested;
    events.emit('gearChanged', { gear, previous });
    return true;
  }

  function applySpawn(s) {
    chassisBody.position.set(s.pos[0], s.pos[1] ?? RIDE_HEIGHT, s.pos[2]);
    chassisBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), s.heading);
    chassisBody.velocity.setZero();
    chassisBody.angularVelocity.setZero();
    chassisBody.force.setZero();
    chassisBody.torque.setZero();
    gear = 'P';
    steerNorm = 0;
    rpm = IDLE_RPM;
    autoGearIndex = 0;
    odometerM = 0;
    hillHoldT = 0;
    hillHold = false;
    for (let i = 0; i < vehicle.wheelInfos.length; i++) {
      vehicle.setSteeringValue(0, i);
      vehicle.applyEngineForce(0, i);
      vehicle.setBrake(0, i);
    }
    events.emit('gearChanged', { gear, previous: gear });
  }
  applySpawn(spawn);

  // A bump should feel like hitting a wall, not like a snooker ball. cannon's
  // restitution alone leaves a lively rebound at parking speeds.
  physics.events.on('bump', ({ kind, speedMs: v }) => {
    if (v > 0.3) {
      chassisBody.velocity.scale(0.3, chassisBody.velocity);
      chassisBody.angularVelocity.scale(0.3, chassisBody.angularVelocity);
    }
    bumpFlashT = 0.4;
    events.emit('bump', { kind, speedMs: v });
  });

  function update(dt, input) {
    const v = speedMs();
    const vFwd = forwardSpeedMs();

    // --- steering wheel position -------------------------------------------
    // The player drives the WHEEL; the road wheels are derived from it. That
    // ordering is what makes 720 degrees of rim travel and the hand animation
    // consistent with each other.
    const want = input.steer; // -1 left, 0, +1 right
    if (want === 0) {
      const rate = dt / STEER_RETURN_TIME;
      steerNorm = steerNorm > 0 ? Math.max(0, steerNorm - rate) : Math.min(0, steerNorm + rate);
    } else {
      const rate = dt / STEER_TO_LOCK_TIME;
      steerNorm = THREE.MathUtils.clamp(
        steerNorm + Math.sign(want - steerNorm) * rate,
        -1,
        1
      );
      // Don't overshoot the requested side.
      if (want > 0) steerNorm = Math.min(steerNorm, 1);
      if (want < 0) steerNorm = Math.max(steerNorm, -1);
    }

    const lockFade = THREE.MathUtils.clamp(v / STEER_FADE_SPEED_MS, 0, 1);
    const maxSteer = THREE.MathUtils.lerp(MAX_STEER_RAD, MIN_STEER_RAD, lockFade);
    // Negated: +1 input means "steer right", and a positive cannon steering
    // value turns LEFT (measured).
    const roadWheelAngle = -steerNorm * maxSteer;
    for (const i of FRONT) vehicle.setSteeringValue(roadWheelAngle, i);

    // --- throttle / brake ---------------------------------------------------
    let engineForce = 0;
    let brake = 0;

    if (gear === 'P') {
      brake = PARK_BRAKE_FORCE;
    } else if (input.brake) {
      brake = BRAKE_FORCE;
    } else if (input.throttle && gear === 'D') {
      // Torque-limited (flat DRIVE_FORCE_N) below DRIVE_CORNER_MS, then
      // power-limited (force = power / v) above it — real engines run out of
      // torque multiplication well before top speed, which is what makes the
      // last third of the speed range feel like it's "gradually slowing
      // down" rather than holding a constant shove to the cap.
      const totalForce = v <= DRIVE_CORNER_MS ? DRIVE_FORCE_N : DRIVE_POWER_W / Math.max(v, 0.5);
      // No drag model in this sim, so the power curve alone never actually
      // reaches zero force — a hard cutoff at TOP_SPEED_D stands in for a
      // speed limiter (real cars have these too) rather than the car
      // accelerating forever.
      // /2: DRIVE_FORCE_N/DRIVE_POWER_W are TOTAL (both rear wheels), but
      // `engineForce` below is applied to EACH rear wheel individually
      // (REAR loop) — skipping this halving silently doubled the real force
      // to 9.6 kN and was the actual cause of Level 13's autodrive bump
      // this session, not the force magnitude itself (which had already
      // been re-tuned twice chasing the wrong culprit).
      engineForce = v >= TOP_SPEED_D ? 0 : Math.min(totalForce, DRIVE_FORCE_N) / 2;
    } else if (input.throttle && gear === 'R') {
      const over = (v - TOP_SPEED_R * (1 - TAPER_BAND)) / (TOP_SPEED_R * TAPER_BAND);
      const scale = THREE.MathUtils.clamp(1 - over, 0, 1);
      engineForce = -ENGINE_FORCE_R * scale;
    } else if (gear !== 'N') {
      // No creep (owner's call, 29 Sep 2026): the car moves only while the
      // throttle is held. (Until then an automatic crept at 260 N per rear
      // wheel.) Lifting off keeps the old engine braking above a crawl; below
      // it, the coast-down further on rolls the car gently to a stop.
      if (Math.abs(vFwd) >= 1.1) brake = 6;
    }

    for (const i of REAR) vehicle.applyEngineForce(gear === 'N' ? 0 : engineForce, i);
    for (const i of FRONT) vehicle.applyEngineForce(0, i);

    if (input.handbrake) {
      for (const i of REAR) vehicle.setBrake(HANDBRAKE_FORCE, i);
      for (const i of FRONT) vehicle.setBrake(brake, i);
    } else {
      for (let i = 0; i < 4; i++) vehicle.setBrake(brake, i);
    }

    // PARK IS A PAWL, NOT A BRAKE.
    // Relying on brake force alone leaves the car able to glide: cannon's
    // wheel friction only acts on wheels whose isInContact is true, and after
    // a step that flag reads false even for wheels whose raycast clearly hit
    // (measured — all four wheels, distance 0.57 against a 0.61 ray). With no
    // friction and no opposing force, a car that has any residual velocity
    // slides at a dead constant speed forever, in P, with 1e6 of brake applied.
    // Locking the body outright is both more robust and more honest about what
    // P mechanically is.
    if (gear === 'P' && v < 2.0) {
      chassisBody.velocity.setZero();
      chassisBody.angularVelocity.setZero();
    }

    // THE SAME FLAW DEFEATS THE BRAKE AT A CRAWL. Measured by
    // tools/autodrive.mjs: holding S from 0.8 m/s left the car gliding at a
    // steady 0.10-0.12 m/s for over a minute (90 cm of drift) — the speedo
    // reads 0 while the car keeps rolling into the bay line. Real brakes hold a
    // stationary car, so below walking-crawl speed a held brake does too.
    if ((input.brake || input.handbrake) && v < BRAKE_HOLD_SPEED_MS) {
      chassisBody.velocity.setZero();
      chassisBody.angularVelocity.setZero();
    }

    // --- hill-hold (SPEC-level13.md §5.6) -------------------------------------
    // Behaviour only — it never touches a handling constant. In D or R, no
    // throttle, no brake, below walking-crawl speed, on a slope over 2%: hold
    // for up to 2 s, the same way the brake-hold above does. Ends early on
    // throttle; times out on its own otherwise, exactly like a driver who
    // lifts off, waits too long, and starts rolling again.
    tmpQuat.set(chassisBody.quaternion.x, chassisBody.quaternion.y, chassisBody.quaternion.z, chassisBody.quaternion.w);
    tmpEuler.setFromQuaternion(tmpQuat, 'YXZ');
    const onSlope = Math.abs(tmpEuler.x) > HILL_HOLD_MIN_PITCH;
    const wantsHold = (gear === 'D' || gear === 'R') && !input.throttle && !input.brake && v < BRAKE_HOLD_SPEED_MS && onSlope;
    if (wantsHold && !input.throttle) {
      if (hillHoldT <= 0) hillHoldT = HILL_HOLD_SECONDS;
      hillHold = true;
      chassisBody.velocity.setZero();
      chassisBody.angularVelocity.setZero();
      hillHoldT -= dt;
      if (hillHoldT <= 0) hillHold = false; // timed out; let gravity resume
    } else {
      hillHoldT = 0;
      hillHold = false;
    }

    // --- coast-down (no creep) -------------------------------------------------
    // On the flat, in D or R with no pedal pressed, the car rolls to a stop:
    // a steady COAST_DECEL off its ground speed, then dead still below
    // COAST_STOP_MS. Needed because the isInContact flaw above means wheel
    // friction alone would leave a lifted-off car gliding at a constant crawl
    // forever. Gentle on purpose: a sudden stop at every lift-off made low-speed
    // positioning jerky (tools/autodrive.mjs clipped a parked car on City
    // Drive's roof with it). Slopes are hill-hold's job.
    if ((gear === 'D' || gear === 'R') && !input.throttle && !input.brake && !input.handbrake && !onSlope) {
      const ground = Math.hypot(chassisBody.velocity.x, chassisBody.velocity.z);
      if (ground < COAST_STOP_MS) {
        chassisBody.velocity.setZero();
        chassisBody.angularVelocity.setZero();
      } else {
        const k = Math.max(0, 1 - (COAST_DECEL * dt) / ground);
        chassisBody.velocity.x *= k;
        chassisBody.velocity.z *= k;
      }
    }

    // --- transmission + rpm ---------------------------------------------------
    const wheelRpm = (Math.abs(vFwd) / (2 * Math.PI * WHEEL_RADIUS)) * 60;
    if (gear === 'D') {
      const raw = wheelRpm * AUTO_RATIOS[autoGearIndex];
      if (raw > UPSHIFT_RPM && autoGearIndex < AUTO_RATIOS.length - 1) autoGearIndex++;
      else if (raw < DOWNSHIFT_RPM && autoGearIndex > 0) autoGearIndex--;
    } else {
      autoGearIndex = 0;
    }
    const ratio = gear === 'R' ? AUTO_RATIOS[0] : AUTO_RATIOS[autoGearIndex];
    const loadBlip = input.throttle && gear !== 'P' && gear !== 'N' ? 520 : 0;
    const targetRpm = THREE.MathUtils.clamp(
      IDLE_RPM + wheelRpm * ratio + loadBlip,
      IDLE_RPM,
      REDLINE_RPM
    );
    // A flywheel has inertia; the needle should lag the road speed slightly.
    rpm += (targetRpm - rpm) * Math.min(1, dt * 6);

    odometerM += v * dt;
    if (bumpFlashT > 0) bumpFlashT -= dt;

    // --- push physics into the scene graph ------------------------------------
    mesh.position.copy(chassisBody.position);
    mesh.quaternion.copy(chassisBody.quaternion);

    for (let i = 0; i < vehicle.wheelInfos.length; i++) {
      vehicle.updateWheelTransform(i);
      const t = vehicle.wheelInfos[i].worldTransform;
      // worldTransform is in WORLD space but these meshes are children of
      // `mesh`, which already carries the chassis transform. Copying it
      // straight in applies that transform twice and flings the wheels into
      // the sky — a real bug from v2. Convert to chassis-local first.
      chassisBody.pointToLocalFrame(t.position, scratch.localPos);
      chassisBody.quaternion.conjugate(scratch.invQuat);
      scratch.invQuat.mult(t.quaternion, scratch.localQuat);
      wheelMeshes[i].position.copy(scratch.localPos);
      wheelMeshes[i].quaternion.copy(scratch.localQuat);
    }
  }

  /** Per-wheel contact diagnostics. Verification only. */
  function wheelDebug() {
    return vehicle.wheelInfos.map((w) => ({
      contact: w.isInContact,
      susp: +w.suspensionLength.toFixed(4),
      dist: +(w.raycastResult?.distance ?? -1).toFixed(4),
      n: w.raycastResult?.hitNormalWorld
        ? [
            +w.raycastResult.hitNormalWorld.x.toFixed(3),
            +w.raycastResult.hitNormalWorld.y.toFixed(3),
            +w.raycastResult.hitNormalWorld.z.toFixed(3),
          ]
        : null,
      body: w.raycastResult?.body?.userData?.kind ?? null,
    }));
  }

  return {
    mesh,
    chassisBody,
    vehicle,
    wheelDebug,
    /** Belt half-width at a station, for things mounted on the body (mirrors). */
    beltAt,
    on: events.on,
    update,
    setGear,
    respawn: applySpawn,

    /** Everything the UI, audio, camera and driver rig need, read-only. */
    get state() {
      return {
        gear,
        autoGear: autoGearIndex + 1,
        rpm,
        speedMs: speedMs(),
        speedKmh: speedMs() * 3.6,
        forwardSpeedMs: forwardSpeedMs(),
        steerNorm,
        /** Steering wheel rim rotation, radians. +/-2PI = 720 deg lock-to-lock. */
        wheelAngleRad: -steerNorm * WHEEL_HALF_TURNS_RAD,
        /** Road-wheel angle, for the reversing camera's guideline curvature. */
        roadWheelRad: -steerNorm * THREE.MathUtils.lerp(
          MAX_STEER_RAD,
          MIN_STEER_RAD,
          THREE.MathUtils.clamp(speedMs() / STEER_FADE_SPEED_MS, 0, 1)
        ),
        isStopped: speedMs() < 0.25,
        bumpFlash: Math.max(0, bumpFlashT),
        odometerM,
        hillHold,
      };
    },
  };
}
