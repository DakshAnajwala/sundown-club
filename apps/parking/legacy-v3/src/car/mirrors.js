import * as THREE from 'three';

// 3 mirrors (rear-view + 2 side), each with a decorative mode (flat tinted
// glass, zero render cost) and a functional mode (live camera-to-texture
// reflection — deliberately NOT true left-right-flipped planar reflection
// math, a plain rear-facing camera rendered to a texture on the glass
// mesh, per the v2 spec's explicit simplification). Runtime-toggleable via
// setMode(), not a build-time choice.
//
// Mirror cameras are added as children of local mount groups, which are
// themselves children of `group` — since `group` gets parented under the
// car's chassis mesh (car/vehicle.js does mesh.add(mirrors.group)), the
// cameras' world transforms follow the chassis automatically through the
// normal Three.js scene graph (recomputed by updateMatrixWorld() inside
// any renderer.render() call), no manual per-frame matrix math needed.

const HOUSING_MAT = new THREE.MeshStandardMaterial({ color: 0x1c1f22 });
// DoubleSide on both glass materials: verified via pixel-readback debugging
// that the glass PlaneGeometry's default face normal (+Z, unrotated)
// points AWAY from the driver for the rear mirror specifically (driver
// approaches from -Z), so FrontSide alone backface-culled it — what
// rendered instead was the housing box sitting behind it. Side mirrors add
// their own yaw on top, so rather than work out the exact correct
// single-sided rotation per mirror, DoubleSide is the simpler, more
// robust fix for a thin display plane like this.
//
// metalness intentionally low (was 0.9): verified in-browser that a
// highly metallic MeshStandardMaterial renders almost solid black without
// an environment map — metals get most of their appearance from
// environment reflections, which this scene doesn't have (no fancy
// rendering / envMap per v1 scope). Lower metalness relies on the scene's
// two direct lights (hemisphere + directional, core/engine.js) instead,
// which actually reads as a tinted grey-blue surface.
const DECORATIVE_GLASS_MAT = new THREE.MeshStandardMaterial({
  color: 0xaeb8c2,
  metalness: 0.2,
  roughness: 0.4,
  side: THREE.DoubleSide,
});

const MIRROR_FAR_PLANE = 150; // vs. the main camera's 500 — largest level footprint (40x32) fits well inside

// Repositioned twice after browser checks:
// 1. The first placement (0, 0.42, 0.75) sat ~65deg above the driver's
//    forward view from the eye position (camera/firstPerson.js's
//    EYE_OFFSET is (-0.3, 0.1, 0.6)) — outside the 72deg-FOV camera
//    entirely, and unreachable since the first-person rig has no pitch
//    control (free-look is yaw-only, per v1 spec: "no bob, no tilt, no
//    lag").
// 2. Moving it to (0, 0.32, 1.3) fixed the FOV problem but put the mirror
//    CAMERA almost exactly on the sedan body's greenhouse front face (see
//    sedanBody.js — greenhouse reaches to local z=1.281), so it rendered
//    solid black: point-blank into its own dark glass material.
// Settled position keeps the camera INSIDE the greenhouse volume (same
// idea as the driver's own eye position) with real clearance from its
// front face (~0.13m), while staying within ~15-29deg of the eye's
// forward view.
// y raised 0.25 -> 0.48 alongside the v2 eye move (0.1 -> 0.32): at 0.25 it
// would now sit BELOW the sightline, down in the dash/hood area instead of
// overhead where a rear-view mirror belongs. Still inside the greenhouse
// box (top 0.602) and ~16deg above the sightline, comfortably in frame.
const REARVIEW_POS = [0, 0.48, 1.15];
const REARVIEW_FOV = 60;
const REARVIEW_RT_SIZE = [320, 180];
const REARVIEW_GLASS_SIZE = [0.22, 0.06];

const SIDE_MIRROR_FOV = 80; // wider than the main 72deg FOV, hints at a convex mirror
const SIDE_MIRROR_RT_SIZE = [200, 200];
const SIDE_MIRROR_GLASS_SIZE = [0.1, 0.08];
const SIDE_MIRROR_YAW_DEG = 25; // outward yaw per side
const LEFT_MIRROR_POS = [-0.95, 0.15, 0.95]; // 0.10m beyond half-width (0.85)
const RIGHT_MIRROR_POS = [0.95, 0.15, 0.95];

function createMirror({ pos, yawDeg = 0, fov, rtSize, glassSize }) {
  const mount = new THREE.Group();
  mount.position.set(...pos);
  mount.rotation.y = THREE.MathUtils.degToRad(yawDeg);
  // Default PerspectiveCamera looks down local -Z, which already matches
  // "look toward the car's rear" (chassis forward is local +Z, per
  // car/vehicle.js / camera/firstPerson.js's FORWARD_FIX convention) — no
  // extra rotation fix needed here, unlike the driver's first-person rig.

  const housing = new THREE.Mesh(new THREE.BoxGeometry(glassSize[0] * 1.15, glassSize[1] * 1.15, 0.015), HOUSING_MAT);
  housing.position.z = 0.01; // slightly behind the glass
  mount.add(housing);

  const glass = new THREE.Mesh(new THREE.PlaneGeometry(...glassSize), DECORATIVE_GLASS_MAT);
  mount.add(glass);

  const camera = new THREE.PerspectiveCamera(fov, rtSize[0] / rtSize[1], 0.1, MIRROR_FAR_PLANE);
  mount.add(camera);

  const renderTarget = new THREE.WebGLRenderTarget(rtSize[0], rtSize[1]);
  const functionalMat = new THREE.MeshBasicMaterial({ map: renderTarget.texture, side: THREE.DoubleSide });

  return { mount, glass, camera, renderTarget, functionalMat };
}

export function createMirrors() {
  const group = new THREE.Group();

  const rear = createMirror({ pos: REARVIEW_POS, fov: REARVIEW_FOV, rtSize: REARVIEW_RT_SIZE, glassSize: REARVIEW_GLASS_SIZE });
  const left = createMirror({ pos: LEFT_MIRROR_POS, yawDeg: SIDE_MIRROR_YAW_DEG, fov: SIDE_MIRROR_FOV, rtSize: SIDE_MIRROR_RT_SIZE, glassSize: SIDE_MIRROR_GLASS_SIZE });
  const right = createMirror({ pos: RIGHT_MIRROR_POS, yawDeg: -SIDE_MIRROR_YAW_DEG, fov: SIDE_MIRROR_FOV, rtSize: SIDE_MIRROR_RT_SIZE, glassSize: SIDE_MIRROR_GLASS_SIZE });
  const mirrors = [rear, left, right];

  for (const m of mirrors) group.add(m.mount);

  let mode = 'decorative';
  function setMode(newMode) {
    if (newMode !== 'decorative' && newMode !== 'functional') return;
    mode = newMode;
    for (const m of mirrors) {
      m.glass.material = mode === 'functional' ? m.functionalMat : DECORATIVE_GLASS_MAT;
    }
  }

  function renderMirrors(renderer, scene) {
    if (mode !== 'functional') return; // no-op in decorative mode — zero extra render cost
    for (const m of mirrors) m.glass.visible = false; // avoid infinite-mirror self-render
    for (const m of mirrors) {
      renderer.setRenderTarget(m.renderTarget);
      renderer.render(scene, m.camera);
    }
    renderer.setRenderTarget(null);
    for (const m of mirrors) m.glass.visible = true;
  }

  return { group, setMode, renderMirrors };
}
