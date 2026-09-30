import * as THREE from 'three';

// First-person camera rigidly parented to the chassis — no bob, no tilt,
// no lag. Right-click free-look (yaw only, clamped, snaps back on release).

// Eye offset from chassis origin (assumption, tuned after visual
// verification). The spec's literal starting value (-0.35, 1.05, 0.15)
// placed the eye ~0.35m ABOVE the solid chassis box's roof (chassis origin
// sits at the physics center, ~1.2m off the ground once resting on
// suspension, so +1.05 overshot the ~1.9m roof) — that put the camera
// outside the box looking down at its own roof/hood from point-blank
// range, dominating the frame. Since v1 has no interior cutout mesh, the
// intended "empty space" cabin experience only works if the eye sits
// *inside* the solid chassis box's volume (|x|<0.85, |y|<0.7, |z|<2.1):
// MeshStandardMaterial defaults to FrontSide, so from inside, the box's
// own inward-facing surfaces are backface-culled and invisible — giving
// an unobstructed view out, with the HUD as the dashboard per spec.
// Driver's side, forward-biased for a windshield-like view.
// y raised from 0.1 to 0.32 (v2): at 0.1 the eye sat only ~0.07m above the
// sedan body's hood surface, so the view sighted almost exactly ALONG the
// hood plane — the hood stretched to the horizon and covered everything
// below it, leaving no view of the ground or the target bay. Reported from
// an actual playthrough. Raising the eye (and lowering the hood, see
// sedanBody.js) puts the hood in the lower ~third of the frame where it
// belongs, with the lot visible above it. Still well inside the greenhouse
// box's y-range so the "you don't see your own car" backface-culling trick
// keeps working.
// These are the STARTING values only — the eye offset and FOV are both
// player-adjustable at runtime via the settings panel (ui/settings.js,
// persisted to localStorage), applied through setEyeOffset()/setFov()
// below. Keep these in sync with SETTING_DEFS' defaults there.
const DEFAULT_EYE_OFFSET = new THREE.Vector3(-0.3, 0.32, 0.6);
const DEFAULT_FOV = 72;

const FREE_LOOK_CLAMP_RAD = THREE.MathUtils.degToRad(140);
const FREE_LOOK_SENSITIVITY = 0.0025; // radians per pixel of mouse delta
const FREE_LOOK_RETURN_TIME = 0.2; // seconds to snap back to forward

// Held-key glances. Sign convention follows the existing free-look: screen
// RIGHT is negative yaw here (mouse-right decrements freeLookYaw), and
// chassis local -X is screen-right — the same convention that made the A/D
// steering fix necessary. So peek-right is negative, peek-left positive.
const PEEK_YAW_RAD = THREE.MathUtils.degToRad(70);
const PEEK_RATE = 9; // exponential approach, ~95% in 3/9 ≈ 0.33s

// Lean out the right-side window (C). The driver sits at local x=-0.3, i.e.
// on the RIGHT of the car (this build is right-hand drive), so leaning out
// their own window means moving further along -X. The offset stops inside
// the body envelope (|x| < 0.83) — head in the window aperture, not
// protruding through bodywork. Paired with a downward pitch and a small
// rightward yaw so it reads as sighting the kerb.
// x stops well short of the pillar plane (pillars sit at |x|≈0.72-0.76):
// an earlier -0.42 put the head level with the B-pillar and filled the
// frame with a black column. -0.30 keeps ~0.12 of clearance so you lean
// into the open window aperture instead of into the bodywork.
const LEAN_OFFSET = new THREE.Vector3(-0.3, -0.06, 0);
const LEAN_PITCH_RAD = THREE.MathUtils.degToRad(-22); // negative pitches the view DOWN
const LEAN_YAW_RAD = THREE.MathUtils.degToRad(-25); // negative = toward screen-right
const LEAN_RATE = 7;

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);

// Chassis "forward" is local +Z (cannon-es RaycastVehicle indexForwardAxis:2)
// but a THREE.PerspectiveCamera looks down local -Z by default, so rotate
// 180° to align the camera's view direction with the car's forward.
const FORWARD_FIX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);

export function createFirstPersonCamera({ chassisMesh }) {
  const camera = new THREE.PerspectiveCamera(DEFAULT_FOV, window.innerWidth / window.innerHeight, 0.1, 500);

  const eyeOffset = DEFAULT_EYE_OFFSET.clone(); // mutable, driven by settings
  let freeLookYaw = 0; // radians, relative offset from forward
  let peekYaw = 0; // radians, Q/E glance, eased
  let leanAmount = 0; // 0..1, C lean-out blend

  function setFov(deg) {
    if (!Number.isFinite(deg)) return;
    camera.fov = deg;
    camera.updateProjectionMatrix(); // required, fov alone doesn't take effect
  }

  function setEyeOffset(x, y, z) {
    if (![x, y, z].every(Number.isFinite)) return;
    eyeOffset.set(x, y, z);
  }

  function update(dt, input) {
    if (input.freeLook) {
      const deltaX = input.consumeMouseDelta();
      freeLookYaw -= deltaX * FREE_LOOK_SENSITIVITY;
      freeLookYaw = THREE.MathUtils.clamp(freeLookYaw, -FREE_LOOK_CLAMP_RAD, FREE_LOOK_CLAMP_RAD);
    } else {
      input.consumeMouseDelta(); // discard accumulated delta while not looking
      const returnRate = FREE_LOOK_CLAMP_RAD * 2 / FREE_LOOK_RETURN_TIME;
      if (freeLookYaw > 0) freeLookYaw = Math.max(0, freeLookYaw - returnRate * dt);
      else if (freeLookYaw < 0) freeLookYaw = Math.min(0, freeLookYaw + returnRate * dt);
    }

    // Q/E glance. Eased with the same exponential-approach pattern used for
    // the shifter and fake RPM rather than a second bespoke tween.
    let peekTarget = 0;
    if (input.peekLeft && !input.peekRight) peekTarget = PEEK_YAW_RAD;
    else if (input.peekRight && !input.peekLeft) peekTarget = -PEEK_YAW_RAD;
    peekYaw += (peekTarget - peekYaw) * Math.min(1, dt * PEEK_RATE);

    // C lean-out, 0..1, drives position offset + pitch + yaw together.
    leanAmount += ((input.leanOut ? 1 : 0) - leanAmount) * Math.min(1, dt * LEAN_RATE);

    const localEye = eyeOffset.clone().addScaledVector(LEAN_OFFSET, leanAmount);
    const worldEye = localEye.applyQuaternion(chassisMesh.quaternion).add(chassisMesh.position);
    camera.position.copy(worldEye);

    const totalYaw = freeLookYaw + peekYaw + LEAN_YAW_RAD * leanAmount;
    const yawQuat = new THREE.Quaternion().setFromAxisAngle(Y_AXIS, totalYaw);
    // Pitch applied last so it tilts in the camera's own frame (a head
    // tilt), not around the world axis.
    const pitchQuat = new THREE.Quaternion().setFromAxisAngle(X_AXIS, LEAN_PITCH_RAD * leanAmount);
    camera.quaternion
      .copy(chassisMesh.quaternion)
      .multiply(FORWARD_FIX)
      .multiply(yawQuat)
      .multiply(pitchQuat);
  }

  return { camera, update, setFov, setEyeOffset };
}
