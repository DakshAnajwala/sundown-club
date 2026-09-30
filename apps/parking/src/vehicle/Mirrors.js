/**
 * Mirrors.js — the interior rear-view mirror and the two door mirrors, each a
 * live render-to-texture view. Player car only.
 *
 * v2 TRAPS, all avoided here on purpose (see NOTES.md):
 *   - No `metalness`. With no environment map a metallic surface renders nearly
 *     black. The glass is an unlit MeshBasicMaterial showing the render target.
 *   - DoubleSide glass. v2's glass plane faced away from the driver, FrontSide
 *     culled it, and all that showed was the dark housing behind it.
 *   - The rear-view mirror must be INSIDE the driver's field of view. This rig
 *     has no free pitch, so a mirror placed high on the header can never be
 *     seen. It sits ~18 degrees above and ~39 degrees right of straight ahead.
 *
 * A mirror is not a rear-facing camera: it is left-right reversed. The glass
 * UVs are flipped horizontally, so a car overtaking on your left appears on the
 * left of the mirror, as it would in a real one.
 *
 * COST CONTROL
 *   - At most ONE mirror renders per frame, round-robin, so the worst case is
 *     one extra scene render (the rear-view gets every other frame, the doors
 *     share the rest).
 *   - A mirror whose glass is outside the driver's view frustum is skipped. The
 *     passenger door mirror is off-screen unless you lean right, so in normal
 *     driving it costs nothing.
 *   - Shadow maps are NOT re-rendered for mirror passes. By default every
 *     renderer.render() call redraws them; the mirrors reuse the main frame's
 *     (except on a level's first frame, before those maps exist — see
 *     renderOne).
 *   - Small targets: 256x70 and 128x76.
 *
 * HDR: three.js does not tone-map when rendering into a render target, and
 * this scene's sun + sky light pushes lit concrete well past 1.0 in linear
 * terms. In an 8-bit target all of that clips to white: the first mirrors (and
 * the reversing camera, which had the same bug) showed a featureless pale
 * wash. The targets are HalfFloat instead, so the values survive until the
 * composer's OutputPass tone-maps the glass exactly as it tone-maps the scene.
 */
import * as THREE from 'three';
import { COLORS, matte } from '../world/Palette.js';
import { EYE, fromGround } from './Dimensions.js';

/** Door glass turns toward the driver by at most this much (see build()). */
const DOOR_GLASS_MAX_YAW = 0.3;

/** Mirror layout, car-local frame. See the header for why these positions. */
const REAR_VIEW = {
  glass: [0.22, 0.06],
  // Up against the windscreen header. z = -0.17 is as far forward as it can go:
  // the raked screen passes y = 1.32 there, just above the housing's top edge.
  pos: [0, fromGround(1.28), -0.17],
  cam: { pos: [0, fromGround(1.22), 1.0], yaw: 0, pitch: -0.03, fov: 26, near: 0.55 },
  rt: [256, 70],
};
function doorMirror(sx, beltHalfWidth) {
  const x = sx * (beltHalfWidth + 0.13);
  return {
    glass: [0.17, 0.1],
    // Rear face of the housing CarModel builds at z = -0.5 (depth 0.075).
    pos: [x, fromGround(1.08), -0.459],
    // Looking back and slightly outboard, as a correctly adjusted mirror does:
    // just a sliver of your own flank on the inboard edge.
    cam: { pos: [x + sx * 0.03, fromGround(1.08), -0.44], yaw: sx * 0.22, pitch: -0.07, fov: 30, near: 0.05 },
    rt: [128, 76],
  };
}

export function createMirrors({ carMesh, beltHalfWidth }) {
  const group = new THREE.Group();
  group.name = 'mirrors';
  carMesh.add(group);

  const eye = new THREE.Vector3(...EYE);
  const holders = [];
  const staticMat = matte(0x7d8d97, { side: THREE.DoubleSide });

  const mirrors = [
    build('rear', REAR_VIEW, true),
    build('left', doorMirror(-1, beltHalfWidth), false),
    build('right', doorMirror(1, beltHalfWidth), false),
  ];

  function build(name, spec, withHousing) {
    // HalfFloat, linear: see the header note on HDR. An 8-bit target clips the
    // lit scene to white before tone mapping ever sees it.
    const rt = new THREE.WebGLRenderTarget(spec.rt[0], spec.rt[1], {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
    });

    const camera = new THREE.PerspectiveCamera(spec.cam.fov, spec.glass[0] / spec.glass[1], spec.cam.near, 160);
    camera.position.set(...spec.cam.pos);
    // Face backwards (+Z), then yaw outboard and pitch down in that frame.
    camera.rotation.set(spec.cam.pitch, Math.PI + spec.cam.yaw, 0, 'YXZ');
    carMesh.add(camera);

    const geo = new THREE.PlaneGeometry(...spec.glass);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i)); // mirror image
    const liveMat = new THREE.MeshBasicMaterial({
      map: rt.texture,
      color: 0xdfe7ea, // a touch of grey: real mirror glass is not a screen
      side: THREE.DoubleSide,
    });
    const glass = new THREE.Mesh(geo, liveMat);

    // Holder oriented so the glass faces the driver's eye (see aimHolder).
    const holder = new THREE.Group();
    holder.rotation.order = 'YXZ';
    holders.push({ holder, spec, withHousing });
    aimHolder(holders[holders.length - 1], eye);
    group.add(holder);
    glass.position.z = 0.004;
    holder.add(glass);

    if (withHousing) {
      const housing = new THREE.Mesh(
        new THREE.BoxGeometry(spec.glass[0] + 0.024, spec.glass[1] + 0.022, 0.035),
        matte(COLORS.dash, { side: THREE.DoubleSide, emissive: 0x2e3236, emissiveIntensity: 1 })
      );
      housing.position.z = -0.016;
      holder.add(housing);
      // Short stem to the header. A long one, seen from below at 0.5 m, reads as
      // a pole running off the top of the screen.
      const stem = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.035, 0.02), housing.material);
      stem.position.set(0, spec.glass[1] / 2 + 0.02, -0.022);
      holder.add(stem);
    }

    return { name, rt, camera, glass, liveMat, lastRendered: -1, renders: 0 };
  }

  /**
   * Turn one mirror's glass toward an eye position. The rear-view mirror hangs
   * free and turns fully. Door glass sits in a housing only 7.5 cm deep: turned
   * the full ~59 degrees toward the eye, half of it sank inside the box, so its
   * yaw is capped and it is pushed out by the swing. Re-run when the player
   * moves the seat — a mirror aimed at the old eye shows the wrong slice.
   */
  function aimHolder({ holder, spec, withHousing }, eyePos) {
    holder.position.set(...spec.pos);
    const toEye = eyePos.clone().sub(holder.position);
    let yaw = Math.atan2(toEye.x, toEye.z);
    if (!withHousing) {
      yaw = THREE.MathUtils.clamp(yaw, -DOOR_GLASS_MAX_YAW, DOOR_GLASS_MAX_YAW);
      holder.position.z += (spec.glass[0] / 2) * Math.sin(Math.abs(yaw)) + 0.004;
    }
    holder.rotation.y = yaw;
    holder.rotation.x = -Math.atan2(toEye.y, Math.hypot(toEye.x, toEye.z));
  }

  // --- visibility -------------------------------------------------------------
  const frustum = new THREE.Frustum();
  const projView = new THREE.Matrix4();
  const sphere = new THREE.Sphere();

  function visibleFrom(viewCamera, m) {
    // matrixWorldInverse is only refreshed by updateMatrixWorld (or a render);
    // without this the test runs against wherever the head was last frame.
    viewCamera.updateMatrixWorld();
    projView.multiplyMatrices(viewCamera.projectionMatrix, viewCamera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projView);
    m.glass.updateWorldMatrix(true, false);
    if (!m.glass.geometry.boundingSphere) m.glass.geometry.computeBoundingSphere();
    sphere.copy(m.glass.geometry.boundingSphere).applyMatrix4(m.glass.matrixWorld);
    return frustum.intersectsSphere(sphere);
  }

  let mode = 'live'; // 'live' | 'static'
  let frame = 0;

  function renderOne(renderer, scene, m, reuseShadows) {
    const prevTarget = renderer.getRenderTarget();
    const prevShadow = renderer.shadowMap.autoUpdate;
    // Only once the main pass has drawn this level: shadow-map textures are
    // created lazily INSIDE a shadow update, so reusing them before one exists
    // binds nothing to the lights' shadow samplers and WebGL rejects every lit
    // draw call ("Mismatch between texture format and sampler type").
    if (reuseShadows) renderer.shadowMap.autoUpdate = false;
    // The mirror must not see its own glass (it would sample the target it is
    // rendering into, which WebGL rejects as a feedback loop).
    m.glass.visible = false;
    renderer.setRenderTarget(m.rt);
    renderer.render(scene, m.camera);
    renderer.setRenderTarget(prevTarget);
    m.glass.visible = true;
    renderer.shadowMap.autoUpdate = prevShadow;
    m.renders++;
  }

  return {
    group,

    /**
     * Render at most one mirror this frame. Call before the main pass.
     * @returns {string|null} which mirror rendered
     */
    render(renderer, scene, viewCamera, { reuseShadows = true } = {}) {
      if (mode !== 'live') return null;
      frame++;
      // Even frames: rear-view. Odd frames: alternate the doors.
      const order = frame % 2 === 0 ? [0, 1, 2] : frame % 4 === 1 ? [1, 2, 0] : [2, 1, 0];
      for (const i of order) {
        const m = mirrors[i];
        if (!visibleFrom(viewCamera, m)) continue;
        renderOne(renderer, scene, m, reuseShadows);
        return m.name;
      }
      return null;
    },

    /** Render every mirror now, visible or not. Verification. */
    renderAll(renderer, scene) {
      for (const m of mirrors) renderOne(renderer, scene, m, false);
    },

    /** Re-aim every mirror at a new resting eye position (car-local). */
    aimAt(eyePos) {
      for (const h of holders) aimHolder(h, eyePos);
    },

    /** Which mirrors the driver can currently see. */
    visibility(viewCamera) {
      return Object.fromEntries(mirrors.map((m) => [m.name, visibleFrom(viewCamera, m)]));
    },

    /** 'live' renders the views; 'static' shows plain grey glass for weak GPUs. */
    setMode(next) {
      mode = next === 'static' ? 'static' : 'live';
      for (const m of mirrors) m.glass.material = mode === 'live' ? m.liveMat : staticMat;
    },
    get mode() {
      return mode;
    },

    get stats() {
      return Object.fromEntries(mirrors.map((m) => [m.name, m.renders]));
    },

    targets: Object.fromEntries(mirrors.map((m) => [m.name, m.rt])),
  };
}
