import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { createCockpit } from './cockpit.js';
import { createSedanBody } from './sedanBody.js';
import { createMirrors } from './mirrors.js';
import { createWheelMesh } from './wheel.js';

// Vehicle rig on cannon-es RaycastVehicle, input->force mapping, PRND gear
// state machine. Tuned for high grip / low slip ("go-kart with good tires"),
// NOT loose drift-arcade handling — see ARCHITECTURE.md / prompt spec.
//
// Starting tuning values (spec-provided defaults, not sacred — iterate by
// feel; whatever changes from these should be noted in NOTES.md):
const CHASSIS_MASS = 1200; // kg
const CHASSIS_SIZE = [1.7, 1.4, 4.2]; // width, height, length (m)
const WHEEL_RADIUS = 0.35; // m
const SUSPENSION_STIFFNESS = 45;
const SUSPENSION_REST_LENGTH = 0.3;
const FRICTION_SLIP = 8; // high end of 5-10 range: favor grip over slip
const DAMPING_RELAXATION = 3.2; // cannon-es-typical starting value
const DAMPING_COMPRESSION = 6.5; // cannon-es-typical starting value
const ROLL_INFLUENCE = 0.08; // low: precision > realistic body roll

const MAX_STEER_RAD = THREE.MathUtils.degToRad(35);
const STEER_RAMP_TIME = 0.35; // seconds to reach full lock while held
const STEER_RETURN_TIME = 0.25; // seconds to auto-center from full lock

// Simple capped acceleration curve (not torque/RPM). Target: 0->30km/h in
// ~2.5s, top speed capped ~40km/h. F = m*a, a = (30/3.6)/2.5 ≈ 3.33 m/s^2,
// F_total = m*a ≈ 4000N. cannon-es's applyEngineForce(value, wheelIndex)
// takes the force for THAT wheel, not a total split automatically — split
// across both rear (drive) wheels so the *total* matches the target curve
// (applying 4000N to each of 2 wheels would double the intended accel).
const ENGINE_FORCE_TOTAL_D = 4000; // N — unchanged, already-verified curve
const ENGINE_FORCE_D = ENGINE_FORCE_TOTAL_D / 2; // N per rear wheel
const TOP_SPEED_D_MS = 40 / 3.6;

// Reverse: deliberately weaker/slower than Drive (v2 feature request).
// Half of D's force AND half its top-speed cap, chosen together so the
// curve shape matches: a_R = 2000/1200 ≈ 1.67 m/s^2 is exactly half of
// a_D ≈ 3.33 m/s^2, and reaching the 20km/h cap at half the acceleration
// takes about the same ~2.5s D takes to reach its 40km/h cap. Reverse
// feels like a scaled-down mirror of Drive, not a differently-shaped
// curve. Starting values, not sacred — real reverse gears sometimes have
// *more* torque multiplication than a mid/high forward gear; "weaker" here
// is a deliberate game-feel choice, not mechanical realism.
const ENGINE_FORCE_TOTAL_R = 2000; // N
const ENGINE_FORCE_R = ENGINE_FORCE_TOTAL_R / 2; // N per rear wheel
const TOP_SPEED_R_MS = 20 / 3.6;

const BRAKE_FORCE = 60; // regular brake pedal force
const HANDBRAKE_FORCE = 100; // separate, stronger — rear wheels only
const PARK_BRAKE_FORCE = 1e6; // effectively immovable in P

const SHIFT_GUARD_SPEED_MS = 2 / 3.6;

function createEmitter() {
  const listeners = new Map();
  return {
    on(event, cb) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(cb);
    },
    emit(event, payload) {
      listeners.get(event)?.forEach((cb) => cb(payload));
    },
  };
}

export function createCar({ physicsWorld, spawn }) {
  const emitter = createEmitter();

  // --- cannon-es chassis + RaycastVehicle -----------------------------
  const chassisShape = new CANNON.Box(
    new CANNON.Vec3(CHASSIS_SIZE[0] / 2, CHASSIS_SIZE[1] / 2, CHASSIS_SIZE[2] / 2)
  );
  const chassisBody = new CANNON.Body({ mass: CHASSIS_MASS });
  chassisBody.addShape(chassisShape);
  chassisBody.position.set(spawn.pos[0], spawn.pos[1], spawn.pos[2]);
  chassisBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), spawn.rotY);
  chassisBody.angularVelocity.set(0, 0, 0);
  // Extra angular damping beyond cannon-es's default (0.01) — found via
  // browser verification that the default let pitch/roll oscillation from
  // the drive-wheel reaction torque build up under sustained throttle until
  // the chassis body itself nose-dived into the ground plane and got
  // wedged (wheel raycasts then miss the ground entirely because the
  // chassis box is resting on it directly). This is a common practical fix
  // for RaycastVehicle pitch/roll runaway; low rollInfluence alone wasn't
  // enough to prevent it here.
  chassisBody.angularDamping = 0.6;
  chassisBody.linearDamping = 0.05;

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
    suspensionRestLength: SUSPENSION_REST_LENGTH,
    frictionSlip: FRICTION_SLIP,
    dampingRelaxation: DAMPING_RELAXATION,
    dampingCompression: DAMPING_COMPRESSION,
    maxSuspensionForce: 1e5,
    rollInfluence: ROLL_INFLUENCE,
    maxSuspensionTravel: 0.2,
    customSlidingRotationalSpeed: -30,
    useCustomSlidingRotationalSpeed: true,
    chassisConnectionPointLocal: new CANNON.Vec3(),
  };

  const halfW = CHASSIS_SIZE[0] / 2 - 0.15;
  const axleZ = CHASSIS_SIZE[2] / 2 - 0.9;
  const connectionY = -CHASSIS_SIZE[1] / 2 + 0.15;

  // Wheel index order: 0 FL, 1 FR, 2 RL, 3 RR
  const wheelConnections = [
    [-halfW, connectionY, axleZ],
    [halfW, connectionY, axleZ],
    [-halfW, connectionY, -axleZ],
    [halfW, connectionY, -axleZ],
  ];
  wheelConnections.forEach(([x, y, z]) => {
    const opts = { ...wheelOptions, chassisConnectionPointLocal: new CANNON.Vec3(x, y, z) };
    vehicle.addWheel(opts);
  });
  vehicle.addToWorld(physicsWorld.world);
  physicsWorld.registerChassis(chassisBody);

  const FRONT_WHEELS = [0, 1];
  const REAR_WHEELS = [2, 3];

  // --- visuals ----------------------------------------------------------
  const mesh = new THREE.Group();
  // Procedural low-poly sedan exterior (car/sedanBody.js) — replaces the
  // original plain-box body mesh. Sized off CHASSIS_SIZE, so the camera's
  // "inside the car" trick (see camera/firstPerson.js) keeps working
  // unchanged.
  const sedanBody = createSedanBody({ size: CHASSIS_SIZE });
  mesh.add(sedanBody);

  const wheelMeshes = wheelConnections.map(() => {
    const m = createWheelMesh({ radius: WHEEL_RADIUS, width: 0.25 });
    mesh.add(m);
    return m;
  });

  // --- cockpit: dashboard, animated steering wheel, speedometer gauge,
  // pedals, animated gear shifter (car/cockpit.js). No hands/IK rig, no
  // wheel-grip or hand-leaving-wheel-to-shift animation — out of scope,
  // same as v1. See cockpit.js for exact prop positions/tuning.
  const cockpit = createCockpit();
  mesh.add(cockpit.group);

  // --- mirrors: rear-view + 2 side, decorative/functional toggle ---------
  const mirrors = createMirrors();
  mesh.add(mirrors.group);

  // --- gear state machine ------------------------------------------------
  let gear = 'P';

  function currentSpeedMs() {
    return chassisBody.velocity.length();
  }

  function setGear(requested) {
    if (!['P', 'R', 'N', 'D'].includes(requested)) return { accepted: false };
    if (gear === requested) return { accepted: true };
    const isRDSwitch = (gear === 'R' && requested === 'D') || (gear === 'D' && requested === 'R');
    if (isRDSwitch && currentSpeedMs() >= SHIFT_GUARD_SPEED_MS) {
      emitter.emit('gearRejected', { attempted: requested });
      return { accepted: false };
    }
    gear = requested;
    emitter.emit('gearChanged', { gear });
    // Internal call, not via the public 'gearChanged' event — cockpit.js
    // is a sibling module within /car's own closure, not an external
    // consumer; the public event stays reserved for external subscribers
    // (the HUD's gear highlight).
    cockpit.animateShifterTo(gear);
    return { accepted: true };
  }

  // --- steering ramp state ------------------------------------------------
  let steerAngle = 0; // radians, current front wheel angle

  // Scratch objects for the per-frame wheel world->local conversion below,
  // allocated once rather than per wheel per frame.
  const wheelLocalPos = new CANNON.Vec3();
  const wheelLocalQuat = new CANNON.Quaternion();
  const invChassisQuat = new CANNON.Quaternion();

  // --- fake RPM (cosmetic only, NOT a real engine model) ------------------
  let fakeRpm = 800; // idle

  function update(dt, input) {
    // Steering: ramp toward target over STEER_RAMP_TIME, auto-center over
    // STEER_RETURN_TIME. Simple eased linear approach — no spring/overshoot.
    // Negated: verified empirically (window.__debug()) that a positive
    // wheel steering value here turns the chassis toward world +X, which
    // is screen-LEFT from the driver's seat — because the camera's
    // FORWARD_FIX (180° around Y, see camera/firstPerson.js) makes
    // screen-right correspond to world -X at zero yaw, not +X. Without
    // this negation, D (steerInput=+1, "turn right") visually turned left.
    const steerInput = -input.steer; // -1..1, already flipped to match screen-right
    const target = steerInput * MAX_STEER_RAD;
    const rampRate = MAX_STEER_RAD / STEER_RAMP_TIME;
    const returnRate = MAX_STEER_RAD / STEER_RETURN_TIME;
    if (steerInput === 0) {
      // auto-center toward 0
      if (steerAngle > 0) steerAngle = Math.max(0, steerAngle - returnRate * dt);
      else if (steerAngle < 0) steerAngle = Math.min(0, steerAngle + returnRate * dt);
    } else if (target > steerAngle) {
      steerAngle = Math.min(target, steerAngle + rampRate * dt);
    } else {
      steerAngle = Math.max(target, steerAngle - rampRate * dt);
    }
    FRONT_WHEELS.forEach((i) => vehicle.setSteeringValue(steerAngle, i));

    // Engine force: single gas pedal (W), direction determined by gear.
    // Brake pedal (S) always decelerates current motion — it never reverses
    // by itself, only gear R + gas moves the car backward. This is the
    // "standard convention" from the spec and is what makes the PRND shift
    // guard meaningful (no instant-reverse via holding S in D).
    let engineForce = 0;
    let brakeForce = 0;
    const speedMs = currentSpeedMs();

    if (gear === 'P') {
      brakeForce = PARK_BRAKE_FORCE;
    } else {
      if (input.brakeOrReverse) {
        brakeForce = BRAKE_FORCE;
      } else if (input.throttle && gear !== 'N') {
        // gear is 'R' or 'D' here (P handled above, N excluded above) —
        // per-gear force/cap so R is deliberately weaker/slower than D.
        const topSpeed = gear === 'D' ? TOP_SPEED_D_MS : TOP_SPEED_R_MS;
        if (speedMs < topSpeed) {
          // Verified empirically in-browser (window.__debug()) that a
          // positive value passed to RaycastVehicle.applyEngineForce here
          // drives the chassis toward local -Z, not +Z — opposite of the
          // +Z-is-forward assumption used when placing spawns/targets in
          // level data and in the camera's FORWARD_FIX. Negating D's sign
          // (and R's) here, rather than rewriting every level's spawn/target
          // geometry, keeps "local +Z = forward" true everywhere else.
          engineForce = gear === 'D' ? -ENGINE_FORCE_D : ENGINE_FORCE_R;
        }
      }
    }

    REAR_WHEELS.forEach((i) => vehicle.applyEngineForce(gear === 'N' ? 0 : engineForce, i));
    FRONT_WHEELS.forEach((i) => vehicle.applyEngineForce(0, i));

    // Handbrake: locks rear wheel brakes at max force regardless of
    // throttle; front wheels unaffected. Enables stationary pivots.
    if (input.handbrake) {
      REAR_WHEELS.forEach((i) => vehicle.setBrake(HANDBRAKE_FORCE, i));
      FRONT_WHEELS.forEach((i) => vehicle.setBrake(brakeForce, i));
    } else {
      vehicle.wheelInfos.forEach((_, i) => vehicle.setBrake(brakeForce, i));
    }

    // Sync visuals from physics.
    mesh.position.copy(chassisBody.position);
    mesh.quaternion.copy(chassisBody.quaternion);
    for (let i = 0; i < vehicle.wheelInfos.length; i++) {
      vehicle.updateWheelTransform(i);
      const t = vehicle.wheelInfos[i].worldTransform;
      // wheelInfos[i].worldTransform is in WORLD space, but these meshes are
      // children of `mesh`, which already carries the chassis transform —
      // copying world values straight in applies that transform twice and
      // flings the wheels off into the sky (visible as 4 black blobs
      // floating above the lot). Convert to chassis-local first.
      chassisBody.pointToLocalFrame(t.position, wheelLocalPos);
      chassisBody.quaternion.conjugate(invChassisQuat);
      invChassisQuat.mult(t.quaternion, wheelLocalQuat);
      wheelMeshes[i].position.copy(wheelLocalPos);
      wheelMeshes[i].quaternion.copy(wheelLocalQuat);
    }

    // Fake RPM: cosmetic value derived from (speed, throttle), purely for
    // HUD feedback — there is no real engine/gearbox model in v1. An
    // earlier version derived this from raw wheelInfo.deltaRotation/dt,
    // but that produced five-digit nonsense values once verified in a
    // browser (deltaRotation is a per-substep angular delta, not a rate,
    // so dividing by frame dt wildly over-scaled it) — speed fraction is
    // simpler and stays in a plausible idle..redline range by construction.
    const speedFraction = Math.min(1, speedMs / TOP_SPEED_D_MS);
    const throttleBlip = input.throttle && gear !== 'N' && gear !== 'P' ? 900 : 0;
    const targetRpm = 800 + speedFraction * 4200 + throttleBlip;
    fakeRpm += (targetRpm - fakeRpm) * Math.min(1, dt * 4);

    cockpit.update(dt, { steerAngle, speedKmh: speedMs * 3.6 });
  }

  // Zero velocity component along contact normal on obstacle bump — lets
  // the car keep sliding along a wall instead of a dead stop on any graze.
  physicsWorld.events.on('contact', ({ chassisBody: cb, contactNormal }) => {
    if (cb !== chassisBody) return;
    const n = contactNormal;
    const vDotN = chassisBody.velocity.dot(n);
    if (vDotN < 0) {
      chassisBody.velocity.vsub(n.scale(vDotN), chassisBody.velocity);
    }
  });

  function getState() {
    return {
      speedKmh: currentSpeedMs() * 3.6,
      gear,
      rpm: fakeRpm,
      position: chassisBody.position,
      rotationY: new THREE.Euler().setFromQuaternion(
        new THREE.Quaternion(
          chassisBody.quaternion.x,
          chassisBody.quaternion.y,
          chassisBody.quaternion.z,
          chassisBody.quaternion.w
        ),
        'YXZ'
      ).y,
    };
  }

  function resetSpawn(newSpawn) {
    chassisBody.position.set(newSpawn.pos[0], newSpawn.pos[1], newSpawn.pos[2]);
    chassisBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), newSpawn.rotY);
    chassisBody.velocity.set(0, 0, 0);
    chassisBody.angularVelocity.set(0, 0, 0);
    gear = 'P';
  }

  return {
    chassisBody,
    mesh,
    update,
    getState,
    setGear,
    resetSpawn,
    on: emitter.on,
    renderMirrors: (renderer, scene) => mirrors.renderMirrors(renderer, scene),
    setMirrorMode: (mode) => mirrors.setMode(mode),
  };
}
