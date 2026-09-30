import * as THREE from 'three';

// Minimal cockpit props: dashboard, animated steering wheel, speedometer
// gauge, pedals, animated gear shifter. Static/non-animated where the v2
// spec calls for it (dash, pedals) — no hands, no IK rig, no wheel-grip or
// hand-leaving-wheel-to-shift animation anywhere (out of scope, same as
// v1). All positions are local to the chassis origin (box center) — the
// same convention the chassis/wheel meshes already use.
//
// camera/firstPerson.js's EYE_OFFSET is (-0.3, 0.1, 0.6) local — these
// props are placed relative to that number, but it isn't imported
// (crossing that module boundary isn't allowed); the value is duplicated
// here in comments only, same precedent v1's original dash/wheel code set.

const DASH_MAT = new THREE.MeshStandardMaterial({ color: 0x2b2b2b });
const TRIM_MAT = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.6 });
const GAUGE_FACE_MAT = new THREE.MeshStandardMaterial({ color: 0x1c1f22, side: THREE.DoubleSide });
const NEEDLE_MAT = new THREE.MeshStandardMaterial({ color: 0xe8d27a });

// --- steering wheel -------------------------------------------------------
// All prop heights raised ~0.22 in v2 alongside the eye moving from y=0.1
// to y=0.32 (camera/firstPerson.js) — the eye rose to clear the hood, and
// the cockpit follows it so the wheel/gauge/dash keep the same relative
// composition in frame rather than sliding off the bottom.
const STEER_MOUNT_POS = [-0.3, 0.12, 0.95];
const STEER_MOUNT_TILT_X = Math.PI / 2.3; // tilt back toward the driver
// Steering-wheel-to-front-wheel ratio. MAX_STEER_RAD (car/vehicle.js) is
// 35deg, so max visual wheel rotation = 35*12 = 420deg (~1.17 turns
// lock-to-lock) — deliberately below the realistic 14-20:1 range because
// the physics steer ramp is fast (0.35s to full lock); a full real-car
// ratio would look chaotic over that short a ramp. Sign is cosmetic-only:
// flip if the wheel visually spins the "wrong" way, zero gameplay effect.
const STEER_WHEEL_RATIO = 12;

// --- speedometer gauge (physical instrument; HUD text stays too) ---------
// y raised to clear the top of the tilted steering wheel rim (wheel center
// is (-0.3, -0.1, 0.95)) rather than sitting directly behind the wheel's
// hub, which occluded it in an initial browser check — real dash clusters
// are visible over the rim's top arc, not through the (solid) hub. A first
// reposition attempt (y=0.06, z=0.92, radius=0.1) fixed the occlusion but
// overshot the other way — that close to the eye (z=0.6) a 0.1-radius disc
// filled most of the frame. Pulled further back (z=1.05, closer to the
// dash/gauge's natural depth) and shrunk to read as a real instrument, not
// a windshield-sized dial.
// Must clear the top of the steering wheel rim (wheel center y=0.12,
// rim radius 0.16) or the wheel occludes it — keep gauge center ~0.1
// above wheel center, same relationship that worked before the v2 eye
// raise. The dash below is raised to meet it so it doesn't read as a
// free-floating disc.
const GAUGE_MOUNT_POS = [-0.3, 0.22, 1.05];
const GAUGE_RADIUS = 0.045;
const NEEDLE_LENGTH = 0.035; // ~80% of GAUGE_RADIUS, rescaled alongside it
const GAUGE_SWEEP_DEG = 220; // -110..+110
const GAUGE_FULL_SCALE_KMH = 50; // headroom above D's 40km/h cap, needle never pins

// --- pedals (static, no press animation) ----------------------------------
// Pedals stay low by the floor. Note they are effectively never visible in
// play: at ~58deg below the sightline they fall outside the 72deg FOV, and
// this camera has no pitch control to look down (free-look is yaw-only).
// Kept as geometry for completeness / any future look-down control.
const PEDAL_ACCEL_POS = [-0.22, -0.42, 1.05];
const PEDAL_BRAKE_POS = [-0.38, -0.42, 1.05];

// --- gear shifter (new geometry, animates between 4 gate positions) ------
const SHIFTER_MOUNT_POS = [0.05, -0.03, 0.85]; // center console, right of driver seat (x=-0.3)
const SHIFTER_GATE_ANGLES_DEG = { P: -20, R: -6.67, N: 6.67, D: 20 }; // rotation.x, evenly spaced +-20deg gate
// Reuses the same exponential-decay animation pattern already used for
// fake RPM in car/vehicle.js. Rate 12 reaches ~95% of target in ~3/12 =
// 0.25s, matching the ~0.2-0.3s target with one tunable constant.
const SHIFTER_DECAY_RATE = 12;

// --- cabin shell ----------------------------------------------------------
// The exterior in car/sedanBody.js now has genuinely open window apertures
// (pillars + roof, not a sealed box), so the cabin needs its own inward
// surfaces — otherwise you look straight through the doors to the ground.
// These sit just inside the outer skin (body half-width 0.83) and use the
// same reference heights as sedanBody.js: floor -0.47, sill -0.02, roof
// underside 0.50, cabin z from -1.15 (rear bulkhead) to 1.12 (firewall).
// Mid-grey rather than near-black: the scene has only a hemisphere + one
// directional light and no bounce, so a dark interior renders as a flat
// black void rather than reading as trim.
// A small emissive term stands in for bounce light. Interior surfaces face
// away from the single directional light (the headliner faces straight
// down), so without it they resolve to near-black regardless of base colour.
const CABIN_MAT = new THREE.MeshStandardMaterial({
  color: 0x3c4046,
  emissive: 0x20232a,
  side: THREE.DoubleSide,
});
const SEAT_MAT = new THREE.MeshStandardMaterial({
  color: 0x4a4f57,
  emissive: 0x22262c,
  roughness: 0.85,
  side: THREE.DoubleSide,
});

export function createCockpit() {
  const group = new THREE.Group();

  const panel = (w, h, d, x, y, z, mat = CABIN_MAT) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    group.add(m);
    return m;
  };

  panel(1.56, 0.03, 2.52, 0, -0.47, -0.13); // floor
  panel(1.44, 0.03, 2.45, 0, 0.57, -0.175); // headliner, tracks the raised roof line
  for (const sx of [-1, 1]) {
    panel(0.03, 0.45, 2.52, sx * 0.79, -0.245, -0.13); // door cards
  }
  panel(1.56, 0.45, 0.03, 0, -0.245, 1.12); // firewall, closes the footwell
  panel(1.56, 0.45, 0.03, 0, -0.245, -1.4); // rear bulkhead
  panel(1.44, 0.06, 0.5, 0, -0.05, -1.62); // rear parcel shelf

  // Seats. This build is right-hand drive — local -X is screen-right and the
  // driver's eye sits at x=-0.3, so the driver's seat is the -X one.
  for (const sx of [-1, 1]) {
    panel(0.5, 0.12, 0.52, sx * 0.35, -0.18, 0.56, SEAT_MAT); // cushion
    panel(0.5, 0.5, 0.12, sx * 0.35, 0.08, 0.3, SEAT_MAT); // backrest
    panel(0.28, 0.16, 0.1, sx * 0.35, 0.38, 0.31, SEAT_MAT); // headrest
  }
  panel(1.3, 0.12, 0.5, 0, -0.18, -0.72, SEAT_MAT); // rear bench cushion
  panel(1.3, 0.46, 0.12, 0, 0.06, -0.98, SEAT_MAT); // rear bench backrest

  // Centre console, top just below the shifter base (y=-0.03).
  panel(0.3, 0.38, 0.72, 0, -0.27, 0.55);

  // --- dashboard -----------------------------------------------------------
  const dashGeo = new THREE.BoxGeometry(0.55, 0.12, 0.35);
  const dashMesh = new THREE.Mesh(dashGeo, DASH_MAT);
  // Kept low deliberately. Raising it to close the gap under the gauge pod
  // was tried and looked far worse — at only ~0.55m from the eye a 0.55m
  // wide box reads as a black wall and swallowed the steering wheel. The
  // small gap under the gauge reads fine (real cars use separate binnacles).
  dashMesh.position.set(-0.3, 0.0, 1.15);
  group.add(dashMesh);

  // --- steering wheel (nested groups so animation only touches the spin) --
  const steeringMount = new THREE.Group();
  steeringMount.position.set(...STEER_MOUNT_POS);
  steeringMount.rotation.x = STEER_MOUNT_TILT_X;
  group.add(steeringMount);

  const steeringWheelSpin = new THREE.Group();
  steeringMount.add(steeringWheelSpin);

  const wheelRimGeo = new THREE.TorusGeometry(0.16, 0.018, 10, 20);
  steeringWheelSpin.add(new THREE.Mesh(wheelRimGeo, TRIM_MAT));

  const wheelHubGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.05, 12);
  steeringWheelSpin.add(new THREE.Mesh(wheelHubGeo, TRIM_MAT));

  const wheelSpokeGeo = new THREE.BoxGeometry(0.28, 0.02, 0.02);
  steeringWheelSpin.add(new THREE.Mesh(wheelSpokeGeo, TRIM_MAT));

  // --- speedometer gauge -----------------------------------------------------
  const gaugeMount = new THREE.Group();
  gaugeMount.position.set(...GAUGE_MOUNT_POS);
  gaugeMount.rotation.y = Math.PI; // face toward the driver
  group.add(gaugeMount);

  const gaugeFaceGeo = new THREE.CircleGeometry(GAUGE_RADIUS, 20);
  gaugeMount.add(new THREE.Mesh(gaugeFaceGeo, GAUGE_FACE_MAT));

  const needlePivot = new THREE.Group();
  needlePivot.position.z = 0.003; // avoid z-fighting with the gauge face
  gaugeMount.add(needlePivot);

  const needleGeo = new THREE.BoxGeometry(NEEDLE_LENGTH, 0.006, 0.004);
  needleGeo.translate(NEEDLE_LENGTH / 2, 0, 0); // pivot from one end, not center
  needlePivot.add(new THREE.Mesh(needleGeo, NEEDLE_MAT));

  // --- pedals ----------------------------------------------------------------
  const pedalGeo = new THREE.BoxGeometry(0.1, 0.03, 0.16);
  const accelPedal = new THREE.Mesh(pedalGeo, TRIM_MAT);
  accelPedal.position.set(...PEDAL_ACCEL_POS);
  accelPedal.rotation.x = -0.3;
  group.add(accelPedal);

  const brakePedal = new THREE.Mesh(pedalGeo, TRIM_MAT);
  brakePedal.position.set(...PEDAL_BRAKE_POS);
  brakePedal.rotation.x = -0.3;
  group.add(brakePedal);

  // --- gear shifter (nested groups, animates rotation.x between gates) -----
  const shifterMount = new THREE.Group();
  shifterMount.position.set(...SHIFTER_MOUNT_POS);
  group.add(shifterMount);

  const shifterStick = new THREE.Group();
  shifterMount.add(shifterStick);

  const stalkGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.16, 8);
  stalkGeo.translate(0, 0.08, 0); // pivot from the base, not center
  shifterStick.add(new THREE.Mesh(stalkGeo, TRIM_MAT));

  const knobGeo = new THREE.SphereGeometry(0.025, 10, 8);
  const knobMesh = new THREE.Mesh(knobGeo, TRIM_MAT);
  knobMesh.position.y = 0.16;
  shifterStick.add(knobMesh);

  let shifterAngle = THREE.MathUtils.degToRad(SHIFTER_GATE_ANGLES_DEG.P);
  let shifterTargetAngle = shifterAngle;
  shifterStick.rotation.x = shifterAngle;

  function animateShifterTo(gear) {
    const deg = SHIFTER_GATE_ANGLES_DEG[gear];
    if (deg === undefined) return;
    shifterTargetAngle = THREE.MathUtils.degToRad(deg);
  }

  function update(dt, { steerAngle, speedKmh }) {
    steeringWheelSpin.rotation.z = steerAngle * STEER_WHEEL_RATIO;

    const speedFrac = THREE.MathUtils.clamp(speedKmh / GAUGE_FULL_SCALE_KMH, 0, 1);
    const sweep = THREE.MathUtils.degToRad(GAUGE_SWEEP_DEG);
    needlePivot.rotation.z = THREE.MathUtils.degToRad(-GAUGE_SWEEP_DEG / 2) + speedFrac * sweep;

    shifterAngle += (shifterTargetAngle - shifterAngle) * Math.min(1, dt * SHIFTER_DECAY_RATE);
    shifterStick.rotation.x = shifterAngle;
  }

  return { group, update, animateShifterTo };
}
