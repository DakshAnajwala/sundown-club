/**
 * Cockpit.js — everything the driver looks at and touches: dashboard, the
 * 720-degree steering wheel, the centre-console gear lever, the instrument
 * cluster and the reversing-camera screen.
 *
 * This module owns the geometry AND the two functions the driver's hands need:
 *   gripPointLocal(spatialAngle) — a point on the wheel rim
 *   shifterKnobLocal()           — where the gear knob currently is
 * Driver.js drives its IK from those, so the hands can never end up somewhere
 * the wheel isn't.
 *
 * Angle convention on the rim: `spatialAngle` is measured CLOCKWISE from 12
 * o'clock as the driver sees it. So 10 o'clock is -60 degrees and 2 o'clock is
 * +60 degrees, which is exactly how the hand positions are named.
 */
import * as THREE from 'three';
import { COLORS, matte, flat } from '../world/Palette.js';
import { createSteeringWheel } from './SteeringWheel.js';
import {
  SHIFTER_BASE,
  SHIFTER_LENGTH,
  SHIFTER_GATE_RAD,
  CLUSTER_POS,
  CLUSTER_SIZE,
  DASH_TOP_Y,
  BELT_Y,
  COWL_Z,
  SCREEN_POS,
  SCREEN_SIZE,
  DRIVER_X,
  fromGround,
} from './Dimensions.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);

function addBox(parent, size, pos, material, rot = {}) {
  const m = new THREE.Mesh(BOX, material);
  m.scale.set(size[0], size[1], size[2]);
  m.position.set(pos[0], pos[1], pos[2]);
  if (rot.x) m.rotation.x = rot.x;
  if (rot.y) m.rotation.y = rot.y;
  if (rot.z) m.rotation.z = rot.z;
  parent.add(m);
  return m;
}

export function createCockpit({ clusterTexture, screenTexture, guidelineTexture, radarTexture = null }) {
  const group = new THREE.Group();
  group.name = 'cockpit';

  // Cabin surfaces are shadowed from every light in the scene, so they carry a
  // small emissive term or they render as a black void (v3 learned this the
  // hard way). DoubleSide because the camera is inside the volume.
  const surf = (color, emissive = 0x2e3236) =>
    matte(color, { side: THREE.DoubleSide, emissive, emissiveIntensity: 1 });

  const dashMat = surf(COLORS.dash);
  const softMat = surf(COLORS.dashSoft);
  const trimMat = surf(COLORS.trim);

  // --- dashboard ------------------------------------------------------------
  // A low shelf (DASH_TOP_Y) rather than the old block topped at 1.02, which
  // walled off the lower third of the view and swallowed the screen.
  const dashH = 0.3;
  addBox(group, [1.72, dashH, 0.42], [0, fromGround(DASH_TOP_Y - dashH / 2), -0.59], dashMat);
  // Centre stack below the screen, angled toward the driver, top under the
  // shelf so nothing stands in front of the display.
  addBox(group, [0.36, 0.22, 0.05], [-0.02, fromGround(DASH_TOP_Y - 0.12), -0.4], softMat, { x: -0.34 });
  // Air vents on the dash face, below the shelf line.
  for (const x of [-0.68, -0.26, 0.22, 0.68]) {
    addBox(group, [0.16, 0.045, 0.03], [x, fromGround(DASH_TOP_Y - 0.05), -0.375], trimMat);
  }
  // Scuttle: a sloped panel from the shelf's leading edge up to the
  // windscreen base. Without it, lowering the shelf opens a slot below the
  // glass through which the (FrontSide, invisible-from-inside) body tub shows
  // the ground outside.
  {
    const z0 = -0.66;
    const y0 = DASH_TOP_Y;
    const z1 = COWL_Z - 0.09;
    const y1 = BELT_Y + 0.012;
    const len = Math.hypot(z1 - z0, y1 - y0);
    const slope = Math.atan2(y1 - y0, -(z1 - z0)); // rises toward -Z
    addBox(group, [1.7, 0.025, len], [0, fromGround((y0 + y1) / 2), (z0 + z1) / 2], softMat, { x: slope });
  }

  // --- steering column + wheel ---------------------------------------------
  // The wheel itself (rim, spokes, hub pad, stripe) is a sport 3-spoke design
  // built from RimCurve.js / SteeringWheel.js — see design/SPEC-wheel-hands.md.
  // Its pivot is already positioned at WHEEL_HUB and laid back by
  // WHEEL_TILT_RAD, so the column just needs to sit inside the same pivot.
  const wheel = createSteeringWheel();
  const wheelPivot = wheel.pivot;
  group.add(wheelPivot);

  // The column's front end must stop INSIDE the hub pad. It used to end at
  // z = -0.010, exactly the pad's front face (-dish + proud), and the two
  // coplanar faces z-fought: the "static" on the hub.
  const column = new THREE.Mesh(BOX, dashMat);
  column.scale.set(0.09, 0.09, 0.28);
  column.position.set(0, 0, -0.17);
  wheelPivot.add(column);

  // --- gear lever -----------------------------------------------------------
  const shifterPivot = new THREE.Group();
  shifterPivot.position.set(SHIFTER_BASE[0], SHIFTER_BASE[1], SHIFTER_BASE[2]);
  group.add(shifterPivot);

  const boot = new THREE.Mesh(BOX, surf(0x2a2825));
  boot.scale.set(0.12, 0.05, 0.16);
  shifterPivot.add(boot);
  const lever = new THREE.Mesh(BOX, trimMat);
  lever.scale.set(0.028, SHIFTER_LENGTH, 0.028);
  lever.position.y = SHIFTER_LENGTH / 2;
  shifterPivot.add(lever);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), surf(0x2f2c29));
  knob.geometry.userData.disposable = true;
  knob.position.y = SHIFTER_LENGTH;
  shifterPivot.add(knob);

  // The P R N D gate legend, painted on the console beside the lever.
  const gateLabels = new THREE.Group();
  group.add(gateLabels);
  for (const [g, ang] of Object.entries(SHIFTER_GATE_RAD)) {
    const dot = new THREE.Mesh(BOX, flat(0x9a958c));
    dot.scale.set(0.02, 0.004, 0.02);
    dot.position.set(
      SHIFTER_BASE[0] + 0.1,
      SHIFTER_BASE[1] + 0.015,
      SHIFTER_BASE[2] + Math.sin(ang) * SHIFTER_LENGTH
    );
    dot.userData.gear = g;
    gateLabels.add(dot);
  }

  // --- instrument cluster ---------------------------------------------------
  // Everything is authored in the binnacle's own frame (face at local z = 0,
  // normal toward the driver) so nothing can drift in front of the dial.
  // The first build put the bezel box 2.2 cm IN FRONT of the face and let an
  // "upper cowl" slab rise over its bottom edge, so from the seat the
  // cluster was a blank dark slab.
  const binnacle = new THREE.Group();
  binnacle.position.set(...CLUSTER_POS);
  binnacle.rotation.x = -0.26;
  group.add(binnacle);

  // Note: `toneMapped: false` would do nothing here. The scene renders through
  // an EffectComposer, and tone mapping happens once, in the OutputPass, over
  // the whole image — materials never get a per-material say.
  const clusterMat = new THREE.MeshBasicMaterial({ map: clusterTexture, transparent: true });
  clusterMat.userData = { disposable: true };
  const cluster = new THREE.Mesh(new THREE.PlaneGeometry(...CLUSTER_SIZE), clusterMat);
  cluster.geometry.userData.disposable = true;
  binnacle.add(cluster);

  const [cw, ch] = CLUSTER_SIZE;
  const bezelMat = surf(COLORS.screenBezel, 0x121212);
  // Housing: entirely behind the face (front at z = -0.004).
  addBox(binnacle, [cw + 0.05, ch + 0.05, 0.1], [0, 0, -0.054], bezelMat);
  // Shallow visor over the dials. It is seen from ABOVE now that the eye
  // clears the cluster, so it stays thin: every centimetre of it is road that
  // disappears straight ahead.
  addBox(binnacle, [cw + 0.07, 0.014, 0.1], [0, ch / 2 + 0.012, -0.03], softMat);
  for (const sx of [-1, 1]) {
    addBox(binnacle, [0.018, ch + 0.05, 0.12], [sx * (cw / 2 + 0.03), 0, -0.02], softMat);
  }

  // --- reversing camera screen ---------------------------------------------
  // Two coplanar quads: the live camera feed, and a transparent overlay that
  // the guideline canvas is drawn into. Keeping them separate means the
  // guidelines can be redrawn on a 2D canvas without touching the 3D feed.
  const screenGroup = new THREE.Group();
  screenGroup.position.set(...SCREEN_POS);
  screenGroup.rotation.x = -0.36;
  group.add(screenGroup);

  addBox(screenGroup, [SCREEN_SIZE[0] + 0.03, SCREEN_SIZE[1] + 0.03, 0.015], [0, 0, -0.01],
    surf(COLORS.screenBezel));

  const feedMat = new THREE.MeshBasicMaterial({
    map: screenTexture,
    transparent: true,
    opacity: 0,
  });
  feedMat.userData = { disposable: true };
  const feed = new THREE.Mesh(new THREE.PlaneGeometry(...SCREEN_SIZE), feedMat);
  feed.geometry.userData.disposable = true;
  screenGroup.add(feed);

  const overlayMat = new THREE.MeshBasicMaterial({
    map: guidelineTexture,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  overlayMat.userData = { disposable: true };
  const overlay = new THREE.Mesh(new THREE.PlaneGeometry(...SCREEN_SIZE), overlayMat);
  overlay.geometry.userData.disposable = true;
  overlay.position.z = 0.002;
  screenGroup.add(overlay);

  // Proximity radar (F2). It shares the screen with the reverse camera and the
  // two are mutually exclusive: in R the camera owns it, otherwise the radar
  // does. A real car's screen switches on the shift, so this is a hard cut
  // rather than a cross-fade — two images dissolving through each other on a
  // driving aid reads as a fault, not as polish.
  let radarMat = null;
  if (radarTexture) {
    radarMat = new THREE.MeshBasicMaterial({ map: radarTexture, transparent: true, opacity: 0 });
    radarMat.userData = { disposable: true };
    const radar = new THREE.Mesh(new THREE.PlaneGeometry(...SCREEN_SIZE), radarMat);
    radar.geometry.userData.disposable = true;
    radar.position.z = 0.001;
    screenGroup.add(radar);
  }

  // Dark idle face, visible when the camera is off.
  const idle = new THREE.Mesh(new THREE.PlaneGeometry(...SCREEN_SIZE), flat(0x14181a));
  idle.geometry.userData.disposable = true;
  idle.position.z = -0.002;
  screenGroup.add(idle);

  // --- pedals ---------------------------------------------------------------
  // Below the sightline in normal driving, but they exist and they move, which
  // matters the moment anyone leans or looks down.
  const pedalGroup = new THREE.Group();
  group.add(pedalGroup);
  const throttlePedal = addBox(pedalGroup, [0.07, 0.16, 0.02],
    [DRIVER_X + 0.12, fromGround(0.28), -0.66], trimMat, { x: -0.4 });
  const brakePedal = addBox(pedalGroup, [0.1, 0.14, 0.02],
    [DRIVER_X - 0.06, fromGround(0.31), -0.68], trimMat, { x: -0.4 });

  // --- animation state ------------------------------------------------------
  let shifterAngle = SHIFTER_GATE_RAD.P;
  let shifterTarget = SHIFTER_GATE_RAD.P;
  let screenOpacity = 0;

  /**
   * A point on the wheel rim, in CAR-LOCAL space. Delegates to
   * SteeringWheel.js, which knows the rim's real (non-circular) shape.
   * @param {number} spatialAngle clockwise from 12 o'clock, radians
   * @param {number} radial       offset out from the rim (used when a hand
   *                              lifts off to re-grip)
   * @param {THREE.Vector3} [out] reusable output vector
   */
  function gripPointLocal(spatialAngle, radial = 0, out) {
    return wheel.gripPointLocal(spatialAngle, radial, out);
  }

  /** Outward normal of the wheel plane (points at the driver). */
  function wheelNormalLocal(out) {
    return wheel.wheelNormalLocal(out);
  }

  /**
   * Full rim frame at a spatial angle: centreline point, unit tangent
   * (clockwise), unit in-plane outward normal, wheel axis. HandRig.js uses
   * this instead of sampling gripPointLocal at nearby angles.
   */
  function rimFrameLocal(spatialAngle, out) {
    return wheel.rimFrameLocal(spatialAngle, out);
  }

  /** Current position of the gear knob, in CAR-LOCAL space. */
  function shifterKnobLocal(out = new THREE.Vector3()) {
    return out
      .set(0, SHIFTER_LENGTH, 0)
      .applyAxisAngle(new THREE.Vector3(1, 0, 0), shifterAngle)
      .add(new THREE.Vector3(...SHIFTER_BASE));
  }

  function setGear(gear) {
    shifterTarget = SHIFTER_GATE_RAD[gear] ?? shifterTarget;
  }

  function update(dt, { wheelAngleRad, throttle, brake, reversing, radarOnScreen = false }) {
    wheel.setAngle(wheelAngleRad);

    // The lever eases into its gate. Rate is chosen to finish inside the hand
    // animation's "at the knob" window (see Driver.js) so the stick never
    // moves on its own with nobody holding it.
    shifterAngle += (shifterTarget - shifterAngle) * Math.min(1, dt * 11);

    throttlePedal.rotation.x = -0.4 + (throttle ? 0.22 : 0);
    brakePedal.rotation.x = -0.4 + (brake ? 0.2 : 0);

    // Screen fades up over ~0.35 s when reverse is engaged, and back down when
    // it isn't. The spec asks for the camera to "smoothly activate".
    const wanted = reversing ? 1 : 0;
    screenOpacity += (wanted - screenOpacity) * Math.min(1, dt * 5.5);
    if (Math.abs(screenOpacity - wanted) < 0.004) screenOpacity = wanted;
    feedMat.opacity = screenOpacity;
    overlayMat.opacity = screenOpacity;
    if (radarMat) radarMat.opacity = radarOnScreen && !reversing ? 1 : 0;
  }

  return {
    group,
    wheel,
    update,
    setGear,
    gripPointLocal,
    wheelNormalLocal,
    rimFrameLocal,
    shifterKnobLocal,
    get shifterAngle() {
      return shifterAngle;
    },
    get screenActive() {
      return screenOpacity > 0.01;
    },
  };
}
