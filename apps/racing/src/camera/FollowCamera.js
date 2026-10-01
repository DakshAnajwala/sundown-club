/**
 * FollowCamera.js — the default third-person camera, in the manner of
 * slowroads.io (owner, 30 Sep 2026: "make it like slowroads.io camera. It has
 * to follow").
 *
 * Parking Precision's ChaseCamera is a boom bolted 6 m back and 2.4 m up,
 * looking 14 degrees down: right for parking, dead at speed, because the car
 * never moves in the frame and the road is seen from above. This one:
 *
 *   - sits LOW and CLOSE (~1.6 m off the ground, 5 m back), looking just over the roof
 *     at the road ahead, so the tarmac rushes toward the lens;
 *   - FOLLOWS: its heading chases the direction the car is travelling (a
 *     blend of velocity and nose) through a spring, so in a turn the car
 *     rotates in the frame first and the camera swings round after it, and in
 *     a slide you see the car's side;
 *   - is sprung on its OFFSET from the car, not on world position, so it never
 *     lags metres behind at 200 km/h;
 *   - leans a little into turns (bank from lateral acceleration);
 *   - looks further ahead with speed, so the car sits lower in the frame as it
 *     goes faster, and pulls back slightly (the car running away from you).
 *
 * Writes into the ONE shared camera (RenderPass captured it). FOV and road
 * rumble are SpeedFeel's job, applied after this.
 */
import * as THREE from 'three';

// Heights are above the chassis centre, which rides 0.72 m off the ground:
// the lens sits ~1.7 m up, the aim point just over the roof.
const BASE = { back: 5.0, up: 0.85, lookUp: 0.3, lookAhead: 3.0 };
const FAST = { back: 5.5, up: 0.7, lookAhead: 10.0 }; // at and above FAST_KMH
const FAST_KMH = 200;
/** How much the camera heading follows the velocity rather than the nose. */
const VELOCITY_WEIGHT = 0.45;
// Owner, 30 Sep: 0.32 s was "too slow". 0.14 s still lets the car turn
// in the frame first, then the camera snaps round after it.
const YAW_SMOOTH = 0.14; // s: the swing-round lag in turns
const OFFSET_SMOOTH = 0.06; // s: position smoothing around the car
/** Under acceleration the car pulls away: extra boom per g, sprung. */
const SURGE_PER_G = 1.0;
const SURGE_SMOOTH = 0.3;
const BANK_PER_G = 0.05; // rad of roll per g of lateral acceleration
const BANK_MAX = 0.06;
/** Reversing: swing to face the way the car moves only above this speed. */
const REVERSE_FOLLOW_MS = 3;

function springTo(current, vel, target, smoothTime, dt) {
  const omega = 2 / smoothTime;
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = current - target;
  const temp = (vel + omega * change) * dt;
  return [target + (change + temp) * exp, (vel - omega * temp) * exp];
}
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const smoothstep = (t) => t * t * (3 - 2 * t);

export function createFollowCamera({ camera, chassisBody }) {
  let yaw = null;
  let yawVel = 0;
  const offset = new THREE.Vector3();
  const offsetVel = new THREE.Vector3();
  let bank = 0;
  let bankVel = 0;
  let lastVelDir = null;
  let latG = 0;
  let lastFwd = null;
  let surge = 0;
  let surgeVel = 0;
  const target = new THREE.Vector3();
  const look = new THREE.Vector3();
  const up = new THREE.Vector3();

  function noseYaw() {
    const q = chassisBody.quaternion;
    return Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x));
  }

  /**
   * @param {number} dt
   * @param {{speedMs:number, forwardSpeedMs:number}} s
   */
  function update(dt, s) {
    if (dt <= 0) return;
    const p = chassisBody.position;
    const v = chassisBody.velocity;
    const ground = Math.hypot(v.x, v.z);
    const nose = noseYaw();

    // Heading of travel. Nose at -Z means yaw t faces (-sin t, -cos t), so the
    // travel yaw of velocity (vx, vz) is atan2(-vx, -vz).
    let desired = nose;
    const forward = s.forwardSpeedMs >= 0;
    if (ground > 1.5 && (forward || ground > REVERSE_FOLLOW_MS)) {
      const travel = forward ? Math.atan2(-v.x, -v.z) : nose; // reversing: keep looking forward
      desired = nose + wrap(travel - nose) * VELOCITY_WEIGHT;
    }
    if (yaw === null) yaw = desired;
    [yaw, yawVel] = springTo(yaw, yawVel, yaw + wrap(desired - yaw), YAW_SMOOTH, dt);

    // Lateral acceleration from the turn rate of the velocity, for the bank.
    const velDir = Math.atan2(v.x, v.z);
    if (lastVelDir !== null && ground > 3) {
      const rate = wrap(velDir - lastVelDir) / dt;
      latG += ((ground * rate) / 9.82 - latG) * Math.min(1, dt * 6);
    }
    lastVelDir = velDir;
    [bank, bankVel] = springTo(bank, bankVel, THREE.MathUtils.clamp(-latG * BANK_PER_G, -BANK_MAX, BANK_MAX), 0.25, dt);

    // Surge: forward acceleration in g (nitrous included) lengthens the boom
    // for a moment, so the car visibly leaps away from the camera.
    const accelG = lastFwd === null ? 0 : (s.forwardSpeedMs - lastFwd) / dt / 9.82;
    lastFwd = s.forwardSpeedMs;
    [surge, surgeVel] = springTo(surge, surgeVel, Math.max(0, Math.min(1.2, accelG)) * SURGE_PER_G, SURGE_SMOOTH, dt);

    const f = smoothstep(THREE.MathUtils.clamp((Math.abs(s.forwardSpeedMs) * 3.6) / FAST_KMH, 0, 1));
    const back = THREE.MathUtils.lerp(BASE.back, FAST.back, f) + surge;
    const height = THREE.MathUtils.lerp(BASE.up, FAST.up, f);
    const ahead = THREE.MathUtils.lerp(BASE.lookAhead, FAST.lookAhead, f);
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);

    // Spring the OFFSET from the car, so speed never turns into lag.
    target.set(-fx * back, height, -fz * back);
    for (const k of ['x', 'y', 'z']) {
      [offset[k], offsetVel[k]] = springTo(offset[k], offsetVel[k], target[k], OFFSET_SMOOTH, dt);
    }
    camera.position.set(p.x + offset.x, Math.max(p.y + offset.y, 0.5), p.z + offset.z);
    look.set(p.x + fx * ahead, p.y + BASE.lookUp, p.z + fz * ahead);
    // Bank: tilt the camera's up vector toward the outside of the turn.
    up.set(Math.cos(yaw) * Math.sin(bank), Math.cos(bank), -Math.sin(yaw) * Math.sin(bank));
    camera.up.copy(up);
    camera.lookAt(look);
  }

  return {
    camera,
    update,
    /** Snap behind the car (on spawn, or when switching into this view). */
    reset() {
      yaw = noseYaw();
      yawVel = 0;
      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      offset.set(-fx * BASE.back, BASE.up, -fz * BASE.back);
      offsetVel.set(0, 0, 0);
      bank = bankVel = latG = 0;
      lastVelDir = null;
      lastFwd = null;
      surge = surgeVel = 0;
    },
    /** Hand the camera back with a normal up vector (the seat rig assumes it). */
    release() {
      camera.up.set(0, 1, 0);
    },
  };
}
