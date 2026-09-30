/**
 * DriverCamera.js — locked first-person view from the driver's seat.
 *
 * "Perfectly steady" is a hard requirement, and it is stronger than it sounds:
 * it is NOT enough to skip camera shake. The chassis body itself pitches under
 * braking and rolls in a turn, and parenting the camera to it inherits all of
 * that. So this rig takes only the chassis's YAW and its X/Z position, and
 * holds the eye at a constant height. On a flat deck that is exactly correct
 * and completely motionless.
 *
 * Head movements available to the player:
 *   hold right mouse   look back over the right shoulder, out of the rear
 *                      window; mouse X/Y adjusts within a cone
 *   Q                  lean out of the driver's window to sight the near kerb
 *   E                  lean across to the passenger window for the far kerb
 * All three ease in and out; none of them are instant snaps.
 *
 * Speed FOV (GOAL-city-polish.md §1): a smooth, framerate-independent FOV kick
 * added on top of the user's base FOV as speed climbs, so 30 km/h and 90 km/h
 * feel different from the seat. This does NOT touch the steady-cam rule above
 * — no shake, no roll, no chassis pitch bleed — it only widens the lens.
 */
import * as THREE from 'three';
import { EYE, EYE_TILT_DEG, RIDE_HEIGHT, SEAT_ADJUST } from '../vehicle/Dimensions.js';

const FOV = 68;

// --- speed FOV (GOAL-city-polish.md §1) --------------------------------------
const SPEED_FOV_MAX_DEG = 12; // added at 100 km/h, never exceeded
const SPEED_FOV_LOW_KMH = 20; // no kick at or below this speed
const SPEED_FOV_HIGH_KMH = 100; // full kick at or above this speed
const SPEED_FOV_SMOOTH_TIME = 0.35; // critically-damped approach, seconds
const smoothstep = (t) => t * t * (3 - 2 * t);

/** Over-the-shoulder angle when looking out of the rear window. */
const LOOK_BACK_YAW = -(150 * Math.PI) / 180; // negative = to the right
const LOOK_BACK_PITCH = -0.1;
const LOOK_BACK_RATE = 7.5;
/** How far the mouse can steer the view while looking back. */
const MOUSE_YAW_LIMIT = (42 * Math.PI) / 180;
const MOUSE_PITCH_LIMIT = (26 * Math.PI) / 180;
const MOUSE_SENSITIVITY = 0.0022; // x the player's lookSensitivity setting

/**
 * Lean poses. x is the local sideways offset of the head; the driver sits at
 * x = -0.36 and the door card's inner face is at -0.765, so -0.30 puts the
 * head in the window aperture rather than through the trim.
 */
const LEAN_DRIVER = { x: -0.3, y: -0.05, yaw: 0.5, pitch: -0.42 };
const LEAN_PASSENGER = { x: 0.55, y: -0.03, yaw: -0.55, pitch: -0.34 };
const LEAN_RATE = 7;

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);

export function createDriverCamera({ chassisBody }) {
  const camera = new THREE.PerspectiveCamera(
    FOV,
    window.innerWidth / window.innerHeight,
    // Near plane is tight because the driver's own hands are ~0.45 m away and
    // the wheel rim closer still.
    0.05,
    400
  );

  let sensitivity = 1;
  // Player seat adjustment (Settings > Driving position): an offset from EYE
  // and an absolute resting tilt. Clamped here as well as in settings.js, so
  // no caller can put the lens through the headliner.
  const seat = { x: 0, y: 0, z: 0 };
  let tiltRad = (EYE_TILT_DEG * Math.PI) / 180;
  let baseFov = FOV; // set by setFov() (Settings); speed kick is added on top
  let speedFovIntensity = 1; // 0..1, Settings toggle (default ON at 100%)
  let speedFovKick = 0; // current eased+damped kick, degrees
  let speedFovKickVel = 0;
  let lookBack = 0; // 0..1 blend
  let leanDriver = 0;
  let leanPassenger = 0;
  let mouseYaw = 0;
  let mousePitch = 0;

  // Smoothed chassis y and pitch (SPEC-level13.md §5.3): a flat level's
  // chassisBody.position.y still has a couple of millimetres of suspension
  // bob, which is exactly what the constant RIDE_HEIGHT used to paper over.
  // Critically-damped smoothing (~0.12 s) removes that bob AND lets the eye
  // follow a ramp, instead of only ever handling the flat-level case. `null`
  // until the first update() so the very first frame snaps to the real
  // height rather than easing up from 0.
  let smoothedY = null;
  let smoothedYVel = 0;
  let smoothedPitch = 0;
  let smoothedPitchVel = 0;
  const EYE_SMOOTH_TIME = 0.12;
  /** Fast critically-damped approach (Game Programming Gems 4.6), avoids the
   *  overshoot a plain exponential-decay lerp gives under a bouncy input. */
  function springTo(current, vel, target, smoothTime, dt) {
    const omega = 2 / smoothTime;
    const x = omega * dt;
    const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    const change = current - target;
    const temp = (vel + omega * change) * dt;
    const newVel = (vel - omega * temp) * exp;
    const result = target + (change + temp) * exp;
    return [result, newVel];
  }

  const eyeLocal = new THREE.Vector3();
  const yawQuat = new THREE.Quaternion();
  const headQuat = new THREE.Quaternion();
  const pitchQuat = new THREE.Quaternion();
  const tmpEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  const tmpQuat = new THREE.Quaternion();

  function update(dt, input, speedMs = 0) {
    // --- blends --------------------------------------------------------------
    const approach = (cur, target, rate) => cur + (target - cur) * Math.min(1, dt * rate);

    // --- speed FOV (GOAL-city-polish.md §1) -----------------------------------
    // Flat + eased below 20 km/h, ramping to +12 deg at 100 km/h, then critically
    // damped so gear changes / throttle lifts never snap the lens.
    const kmh = speedMs * 3.6;
    const t = THREE.MathUtils.clamp((kmh - SPEED_FOV_LOW_KMH) / (SPEED_FOV_HIGH_KMH - SPEED_FOV_LOW_KMH), 0, 1);
    const kickTarget = SPEED_FOV_MAX_DEG * speedFovIntensity * smoothstep(t);
    [speedFovKick, speedFovKickVel] = springTo(speedFovKick, speedFovKickVel, kickTarget, SPEED_FOV_SMOOTH_TIME, dt);
    const fov = baseFov + speedFovKick;
    if (Math.abs(camera.fov - fov) > 1e-4) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    lookBack = approach(lookBack, input.state.lookBack ? 1 : 0, LOOK_BACK_RATE);
    leanDriver = approach(leanDriver, input.state.leanLeft ? 1 : 0, LEAN_RATE);
    leanPassenger = approach(leanPassenger, input.state.leanRight ? 1 : 0, LEAN_RATE);

    if (input.state.lookBack) {
      const d = input.consumeMouseDelta();
      mouseYaw = THREE.MathUtils.clamp(
        mouseYaw - d.x * MOUSE_SENSITIVITY * sensitivity,
        -MOUSE_YAW_LIMIT,
        MOUSE_YAW_LIMIT
      );
      mousePitch = THREE.MathUtils.clamp(
        mousePitch - d.y * MOUSE_SENSITIVITY * sensitivity,
        -MOUSE_PITCH_LIMIT,
        MOUSE_PITCH_LIMIT
      );
    } else {
      input.consumeMouseDelta(); // drop movement accumulated while not looking
      mouseYaw = approach(mouseYaw, 0, 5);
      mousePitch = approach(mousePitch, 0, 5);
    }

    // --- yaw-only chassis orientation ----------------------------------------
    tmpQuat.set(
      chassisBody.quaternion.x,
      chassisBody.quaternion.y,
      chassisBody.quaternion.z,
      chassisBody.quaternion.w
    );
    tmpEuler.setFromQuaternion(tmpQuat, 'YXZ');
    const carYaw = tmpEuler.y; // roll is deliberately discarded; pitch is smoothed below
    yawQuat.setFromAxisAngle(Y_AXIS, carYaw);

    // Smoothed chassis height + pitch (ramps; see the field comments above).
    if (smoothedY === null) smoothedY = chassisBody.position.y;
    [smoothedY, smoothedYVel] = springTo(smoothedY, smoothedYVel, chassisBody.position.y, EYE_SMOOTH_TIME, dt);
    [smoothedPitch, smoothedPitchVel] = springTo(smoothedPitch, smoothedPitchVel, tmpEuler.x, EYE_SMOOTH_TIME, dt);

    // --- eye position ---------------------------------------------------------
    eyeLocal.set(
      EYE[0] + seat.x + LEAN_DRIVER.x * leanDriver + LEAN_PASSENGER.x * leanPassenger,
      EYE[1] + seat.y + LEAN_DRIVER.y * leanDriver + LEAN_PASSENGER.y * leanPassenger,
      EYE[2] + seat.z
    );
    eyeLocal.applyQuaternion(yawQuat);
    // On a flat level the chassis rests at ~RIDE_HEIGHT, so smoothedY is
    // ~RIDE_HEIGHT too — this is RIDE_HEIGHT + eyeLocal.y exactly as before,
    // just with the couple of millimetres of suspension bob smoothed out
    // instead of hard-pinned. On a ramp smoothedY follows the chassis up.
    camera.position.set(
      chassisBody.position.x + eyeLocal.x,
      smoothedY + eyeLocal.y,
      chassisBody.position.z + eyeLocal.z
    );

    // --- head orientation -----------------------------------------------------
    const headYaw =
      LOOK_BACK_YAW * lookBack +
      mouseYaw * lookBack +
      LEAN_DRIVER.yaw * leanDriver +
      LEAN_PASSENGER.yaw * leanPassenger;
    // The resting tilt fades out as the head turns: look-back and the lean
    // poses carry their own pitch, and stacking the tilt on those would stare
    // at the floor.
    const headTurned = Math.max(lookBack, leanDriver, leanPassenger);
    const headPitch =
      tiltRad * (1 - headTurned) +
      LOOK_BACK_PITCH * lookBack +
      mousePitch * lookBack +
      LEAN_DRIVER.pitch * leanDriver +
      LEAN_PASSENGER.pitch * leanPassenger +
      smoothedPitch * 0.85; // chassis pitch on a ramp, scaled down (§5.3); 0 on every flat level

    headQuat.setFromAxisAngle(Y_AXIS, headYaw);
    pitchQuat.setFromAxisAngle(X_AXIS, headPitch);
    // Pitch multiplied last so it tilts in the head's own frame (a nod), not
    // around the world axis (which would roll the horizon when looking back).
    camera.quaternion.copy(yawQuat).multiply(headQuat).multiply(pitchQuat);
  }

  return {
    camera,
    update,
    setFov(deg) {
      baseFov = deg;
      camera.fov = baseFov + speedFovKick;
      camera.updateProjectionMatrix();
    },
    /** Speed FOV toggle (Settings): 0 = off, 1 = full +12 deg at 100 km/h. */
    setSpeedFov(intensity) {
      speedFovIntensity = THREE.MathUtils.clamp(intensity, 0, 1);
    },
    setSensitivity(mult) {
      sensitivity = mult;
    },
    /** Seat offset from the default eye, metres (clamped to SEAT_ADJUST). */
    setSeat({ x = seat.x, y = seat.y, z = seat.z } = {}) {
      const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));
      seat.x = clamp(x, SEAT_ADJUST.x);
      seat.y = clamp(y, SEAT_ADJUST.y);
      seat.z = clamp(z, SEAT_ADJUST.z);
    },
    /** Resting look-down angle, degrees (negative looks down). */
    setTilt(deg) {
      const [lo, hi] = SEAT_ADJUST.tiltDeg;
      tiltRad = (Math.min(hi, Math.max(lo, deg)) * Math.PI) / 180;
    },
    /** Where the eye rests in car-local space, for aiming the mirrors. */
    get restingEyeLocal() {
      return new THREE.Vector3(EYE[0] + seat.x, EYE[1] + seat.y, EYE[2] + seat.z);
    },
    get isLookingBack() {
      return lookBack > 0.5;
    },
    get leanAmount() {
      return Math.max(leanDriver, leanPassenger);
    },
  };
}
