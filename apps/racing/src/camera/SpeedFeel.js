/**
 * SpeedFeel.js — what makes 200 km/h FEEL like 200 km/h, applied to the one
 * shared camera after whichever rig (chase or cockpit) has placed it.
 *
 * Owner, 30 Sep 2026: "even on the loosest gear it feels like I am not going
 * fast. I need a good sense of speed." The car was genuinely doing 200; the
 * camera was the problem. Parking Precision's rigs were built for 5 km/h:
 * their speed-FOV kick is complete by 100 km/h, and the chase boom sits at a
 * fixed 6 m above and behind, so 100 and 200 looked the same.
 *
 * What this adds, each one scaled by speed and each one cheap:
 *   - FOV that keeps widening all the way to 240 km/h (the rigs' own speed
 *     FOV is switched off, this replaces it), plus a surge under hard
 *     acceleration and nitrous.
 *   - Chase only: the camera drops and closes in as speed rises (a low lens
 *     near the ground makes the road rush), and lags back under
 *     acceleration, so the car pulls away from you and the camera chases it.
 *   - Road rumble: a small, smooth, high-frequency wobble that grows with the
 *     square of speed. Switchable (setShake), because some players get
 *     motion sick. This deliberately relaxes Parking Precision's "no camera
 *     shake" rule, at the owner's request; there is still no roll from the
 *     chassis and no bob from the suspension.
 *
 * `amount` (0..1) is the speed factor everything shares, exposed so the
 * streaks and the radial blur ramp in step with the camera.
 */
import * as THREE from 'three';

const KMH_LOW = 40; // nothing below this
const KMH_HIGH = 240; // full effect at and above this
const MODES = {
  // Placement at speed is FollowCamera's job; SpeedFeel only widens the lens
  // and adds rumble. (A lens this close cannot take the old 22 degrees.)
  chase: { fovKick: 20, dolly: 0, drop: 0, lagPerG: 0, nitroLag: 0, rumble: 0.035, rumbleRot: 0.004 },
  cockpit: { fovKick: 16, dolly: 0, drop: 0, lagPerG: 0, nitroLag: 0, rumble: 0.006, rumbleRot: 0.002 },
};
const ACCEL_FOV_PER_G = 6; // degrees of extra FOV per g of forward acceleration
const NITRO_FOV = 5;

function springTo(current, vel, target, smoothTime, dt) {
  const omega = 2 / smoothTime;
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = current - target;
  const temp = (vel + omega * change) * dt;
  return [target + (change + temp) * exp, (vel - omega * temp) * exp];
}
const smoothstep = (t) => t * t * (3 - 2 * t);

export function createSpeedFeel({ camera, baseFov = 70 }) {
  let fov = baseFov;
  let fovVel = 0;
  let accel = 0; // smoothed forward acceleration, g
  let accelVel = 0;
  let lastSpeed = null;
  let nitro = 0;
  let nitroVel = 0;
  let lag = 0;
  let lagVel = 0;
  let shake = true;
  let amount = 0;
  let time = 0;
  const fwd = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  const tmpE = new THREE.Euler();

  /**
   * @param {number} dt
   * @param {{mode:'chase'|'cockpit', speedMs:number, forwardSpeedMs:number, nitroOn:boolean}} s
   */
  function update(dt, s) {
    if (dt <= 0) return;
    const m = MODES[s.mode] ?? MODES.chase;
    time += dt;
    const kmh = Math.abs(s.forwardSpeedMs) * 3.6;
    amount = smoothstep(THREE.MathUtils.clamp((kmh - KMH_LOW) / (KMH_HIGH - KMH_LOW), 0, 1));

    // Forward acceleration in g, smoothed so gear changes read as a dip, not a
    // flicker.
    const a = lastSpeed === null ? 0 : (s.forwardSpeedMs - lastSpeed) / dt / 9.82;
    lastSpeed = s.forwardSpeedMs;
    [accel, accelVel] = springTo(accel, accelVel, THREE.MathUtils.clamp(a, -1.5, 1.5), 0.25, dt);
    [nitro, nitroVel] = springTo(nitro, nitroVel, s.nitroOn ? 1 : 0, 0.3, dt);

    // --- FOV ------------------------------------------------------------------
    const target = baseFov + m.fovKick * amount + ACCEL_FOV_PER_G * Math.max(0, accel) + NITRO_FOV * nitro;
    [fov, fovVel] = springTo(fov, fovVel, target, 0.3, dt);
    if (Math.abs(camera.fov - fov) > 1e-3) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }

    // --- chase: drop, close in, lag ------------------------------------------------
    camera.getWorldDirection(fwd);
    if (m.dolly || m.drop || m.lagPerG) {
      const lagTarget = m.lagPerG * Math.max(0, accel) + m.nitroLag * nitro;
      [lag, lagVel] = springTo(lag, lagVel, lagTarget, 0.45, dt);
      const forward = m.dolly * amount - lag;
      camera.position.addScaledVector(fwd, forward);
      camera.position.y -= m.drop * amount;
    }

    // --- road rumble -----------------------------------------------------------
    if (shake && amount > 0) {
      const k = amount * amount;
      // Sum of incommensurate sines: smooth, never repeating, no allocation.
      const n1 = Math.sin(time * 71.3) * 0.5 + Math.sin(time * 113.7 + 1.3) * 0.3 + Math.sin(time * 41.9 + 2.1) * 0.2;
      const n2 = Math.sin(time * 67.1 + 0.7) * 0.5 + Math.sin(time * 97.3 + 2.9) * 0.3 + Math.sin(time * 53.3) * 0.2;
      camera.position.y += n1 * m.rumble * k;
      camera.position.x += n2 * m.rumble * 0.6 * k;
      tmpE.set(n2 * m.rumbleRot * k, 0, n1 * m.rumbleRot * 0.6 * k);
      tmpQ.setFromEuler(tmpE);
      camera.quaternion.multiply(tmpQ);
    }
  }

  return {
    update,
    /** 0..1, the shared speed factor (streaks, blur). */
    get amount() {
      return amount;
    },
    get fov() {
      return fov;
    },
    setShake(on) {
      shake = Boolean(on);
    },
    get shake() {
      return shake;
    },
    setBaseFov(deg) {
      baseFov = deg;
    },
    reset() {
      lastSpeed = null;
      accel = accelVel = nitro = nitroVel = lag = lagVel = 0;
    },
  };
}
