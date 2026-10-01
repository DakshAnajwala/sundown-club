/**
 * HandModel.js — one procedural, flat-shaded, low-poly hand: a tapered palm,
 * four three-segment fingers and a three-segment thumb, plus a sleeve cuff.
 *
 * Every segment is the shared unit box, scaled, on its own joint Group, so a
 * pose is nothing but joint rotations. 18 meshes, 216 triangles per hand.
 *
 * ------------------------------ HAND FRAME ---------------------------------
 * Right hand: origin at the wrist joint, +Y along the palm toward the fingers,
 * +Z out of the palm (the gripping side), +X toward the thumb. Finger flexion
 * is a positive rotation about X (curls +Y toward +Z). The left hand is the
 * same hand under a mirror (scale.x = −1), so poses and contact points are
 * shared and the thumb lands on the anatomically correct side.
 *
 * ------------------------------- POSES -------------------------------------
 * A pose is a flat array of 16 angles in degrees:
 *   [index MCP, PIP, DIP, middle ×3, ring ×3, little ×3, thumb opp, flex, MCP, IP]
 * Grip poses are not hand-typed: wrapPose() solves each finger around a circle
 * (the rim tube's cross-section, or the gear knob), so a thicker rim or longer
 * fingers re-solve instead of needing a new table.
 */
import * as THREE from 'three';
import { HAND } from './Dimensions.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const D2R = Math.PI / 180;

export const POSE_LEN = 16;
export const JOINT_NAMES = [
  'index.mcp', 'index.pip', 'index.dip',
  'middle.mcp', 'middle.pip', 'middle.dip',
  'ring.mcp', 'ring.pip', 'ring.dip',
  'little.mcp', 'little.pip', 'little.dip',
  'thumb.opp', 'thumb.flex', 'thumb.mcp', 'thumb.ip',
];

/** Hand-typed poses (the grip poses come from wrapPose). Degrees. */
export const POSE_TABLES = {
  RELAXED: [12, 16, 8, 10, 16, 8, 12, 17, 8, 13, 17, 8, 20, 10, 5, 5],
  // Thumb angles laid over a solved grip.
  THUMB_GRIP: [40, 25, 20, 15],
  THUMB_SLIP: [30, 15, 10, 5],
  THUMB_ON_SPOKE: [62, 6, 4, 8],
  THUMB_KNOB: [55, 35, 25, 20],
};

function taperedBox(len, wWrist, wTip, thick) {
  // Corners, y from 0 (wrist) to len (knuckles).
  const c = [
    [-wWrist / 2, 0, -thick / 2], [wWrist / 2, 0, -thick / 2], [wWrist / 2, 0, thick / 2], [-wWrist / 2, 0, thick / 2],
    [-wTip / 2, len, -thick / 2], [wTip / 2, len, -thick / 2], [wTip / 2, len, thick / 2], [-wTip / 2, len, thick / 2],
  ];
  const faces = [[0, 1, 2, 3], [5, 4, 7, 6], [4, 5, 1, 0], [3, 2, 6, 7], [1, 5, 6, 2], [4, 0, 3, 7]];
  const pos = [];
  for (const [a, b, cc, d] of faces) pos.push(...c[a], ...c[b], ...c[cc], ...c[a], ...c[cc], ...c[d]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  g.userData.disposable = true;
  return g;
}

/**
 * Solve finger joint angles that wrap a circle in the hand's YZ plane.
 *
 * @param {object} H        hand params (HAND merged with overrides)
 * @param {number} centreY  circle centre, hand-local y
 * @param {number} centreZ  circle centre, hand-local z (> 0: in front of the palm)
 * @param {number} radius   radius the finger's PALMAR surface must stay outside
 * @param {number[]} [thumb] four thumb angles to append
 * @returns {number[]} a POSE_LEN array, degrees
 *
 * Each finger's joints are placed on a circle of radius sqrt(ρ² + (L/2)²)
 * around the centre (ρ = radius + half the segment thickness, L the segment),
 * so each segment is a chord whose midpoint just touches the surface: the
 * finger lies ON the tube, never in it. The first joint goes where the
 * proximal segment reaches that circle, travelling around in the curl
 * direction. If a segment cannot reach it the finger points at the tangent.
 */
export function wrapPose(H, centreY, centreZ, radius, thumb = POSE_TABLES.THUMB_GRIP, limits = [95, 110, 90]) {
  const out = new Array(POSE_LEN).fill(0);
  const [t0, t1] = H.fingerThick;
  for (let k = 0; k < 4; k++) {
    const total = H.fingerLengths[k];
    const lens = H.fingerSplit.map((s) => s * total);
    let y = H.palm.length + H.knuckleDrop[k];
    let z = 0;
    let beta = 0; // current direction, radians, 0 = +Y
    for (let i = 0; i < 3; i++) {
      const L = lens[i];
      const th = t0 + ((t1 - t0) * (i + 0.5)) / 3;
      const rho = radius + th / 2;
      const rJ = Math.sqrt(rho * rho + (L / 2) * (L / 2));
      const dy = y - centreY;
      const dz = z - centreZ;
      const d = Math.hypot(dy, dz);
      let nb;
      if (d > rJ + L - 1e-9 || d < Math.abs(rJ - L)) {
        // Can't land on the joint circle: aim at the tangent of the surface.
        const toC = Math.atan2(-dz, -dy);
        nb = toC - Math.asin(Math.min(1, rho / Math.max(d, 1e-6)));
      } else {
        // Circle-circle intersection; keep the one further round in the curl.
        const a = (L * L - rJ * rJ + d * d) / (2 * d);
        const h = Math.sqrt(Math.max(0, L * L - a * a));
        const ux = -dy / d;
        const uz = -dz / d;
        const my = y + ux * a;
        const mz = z + uz * a;
        const cands = [
          [my - uz * h, mz + ux * h],
          [my + uz * h, mz - ux * h],
        ];
        const alpha0 = Math.atan2(dz, dy);
        let best = null;
        let bestDelta = Infinity;
        for (const [cy, cz] of cands) {
          let delta = Math.atan2(cz - centreZ, cy - centreY) - alpha0;
          // Curling round the far side of the circle is increasing alpha here
          // (knuckle below-behind, fingertips over the top).
          while (delta <= -Math.PI) delta += Math.PI * 2;
          while (delta > Math.PI) delta -= Math.PI * 2;
          if (delta > 0 && delta < bestDelta) {
            bestDelta = delta;
            best = [cy, cz];
          }
        }
        if (!best) best = cands[0];
        nb = Math.atan2(best[1] - z, best[0] - y);
      }
      let joint = (nb - beta) / D2R;
      while (joint > 180) joint -= 360;
      while (joint < -180) joint += 360;
      joint = Math.max(i === 0 ? -10 : 0, Math.min(limits[i], joint));
      beta += joint * D2R;
      out[k * 3 + i] = joint;
      y += Math.cos(beta) * L;
      z += Math.sin(beta) * L;
    }
  }
  out[12] = thumb[0];
  out[13] = thumb[1];
  out[14] = thumb[2];
  out[15] = thumb[3];
  return out;
}

/**
 * @param {object} opts
 * @param {'left'|'right'} opts.side
 * @param {THREE.Material} opts.skinMat
 * @param {THREE.Material} opts.sleeveMat
 * @param {object} [opts.params]  overrides for HAND
 */
export function createHandModel({ side = 'right', skinMat, sleeveMat, params = {} }) {
  const H = { ...HAND, ...params, palm: { ...HAND.palm, ...(params.palm ?? {}) }, cuff: { ...HAND.cuff, ...(params.cuff ?? {}) } };

  const root = new THREE.Group();
  root.name = `hand-${side}`;
  const mirror = new THREE.Group();
  if (side === 'left') mirror.scale.x = -1;
  root.add(mirror);

  const segments = []; // { name, mesh, size: [x, y, z] }
  const addSeg = (parent, name, size, pos, mat = skinMat, geo = BOX) => {
    const m = new THREE.Mesh(geo, mat);
    if (geo === BOX) m.scale.set(size[0], size[1], size[2]);
    m.position.set(pos[0], pos[1], pos[2]);
    parent.add(m);
    segments.push({ name, mesh: m, size });
    return m;
  };

  // --- palm -----------------------------------------------------------------
  const { length: pl, width: pw, thick: pt, wristTaper } = H.palm;
  const palmGeo = taperedBox(pl, pw * wristTaper, pw, pt);
  const palm = addSeg(mirror, 'palm', [pw, pl, pt], [0, 0, 0], skinMat, palmGeo);
  // Box used for OBB export: the palm's bounding box, centred.
  segments[segments.length - 1].centre = [0, pl / 2, 0];
  // Thenar pad: the thumb's muscle mass at the base of the palm.
  const thenar = addSeg(mirror, 'thenar', [0.028, 0.046, 0.02], [pw * 0.3, 0.03, pt * 0.3]);
  thenar.rotation.z = -0.35;

  // --- fingers --------------------------------------------------------------
  const FINGER = ['index', 'middle', 'ring', 'little'];
  const fingerJoints = [];
  const [t0, t1] = H.fingerThick;
  for (let k = 0; k < 4; k++) {
    const total = H.fingerLengths[k];
    let parent = mirror;
    let at = [(1.5 - k) * H.fingerSpacing, pl + H.knuckleDrop[k], 0];
    const joints = [];
    for (let i = 0; i < 3; i++) {
      const L = H.fingerSplit[i] * total;
      const th = t0 + ((t1 - t0) * (i + 0.5)) / 3;
      const j = new THREE.Group();
      j.position.set(at[0], at[1], at[2]);
      parent.add(j);
      addSeg(j, `${FINGER[k]}.${i}`, [H.fingerSpacing * 0.92, L * 0.98, th], [0, L / 2, 0]);
      joints.push(j);
      parent = j;
      at = [0, L, 0];
    }
    fingerJoints.push(joints);
  }

  // --- thumb ----------------------------------------------------------------
  // root -> opp (about palm Y: swings the thumb in front of the palm) ->
  // splay (fixed, points it out toward the index side) -> flex -> MCP -> IP.
  const thumbRoot = new THREE.Group();
  thumbRoot.position.set(...H.thumbBase);
  mirror.add(thumbRoot);
  const thumbOpp = new THREE.Group();
  thumbRoot.add(thumbOpp);
  const thumbSplay = new THREE.Group();
  thumbSplay.rotation.z = -(H.thumbSplayDeg ?? 52) * D2R;
  thumbOpp.add(thumbSplay);
  const thumbFlex = new THREE.Group();
  thumbSplay.add(thumbFlex);
  const [m0, m1, m2] = H.thumbLengths;
  const tt = H.thumbThick;
  addSeg(thumbFlex, 'thumb.0', [tt * 1.05, m0, tt], [0, m0 / 2, 0]);
  const thumbMcp = new THREE.Group();
  thumbMcp.position.y = m0;
  thumbFlex.add(thumbMcp);
  addSeg(thumbMcp, 'thumb.1', [tt, m1 * 0.98, tt * 0.92], [0, m1 / 2, 0]);
  const thumbIp = new THREE.Group();
  thumbIp.position.y = m1;
  thumbMcp.add(thumbIp);
  addSeg(thumbIp, 'thumb.2', [tt * 0.92, m2 * 0.98, tt * 0.82], [0, m2 / 2, 0]);

  // --- cuff -----------------------------------------------------------------
  const { width: cw, thick: ct, length: cl } = H.cuff;
  addSeg(mirror, 'cuff', [cw, cl, ct], [0, -cl / 2 + 0.008, 0], sleeveMat);

  // --- pose -----------------------------------------------------------------
  const angles = new Float32Array(POSE_LEN);
  function applyAngles() {
    for (let k = 0; k < 4; k++) {
      for (let i = 0; i < 3; i++) fingerJoints[k][i].rotation.x = angles[k * 3 + i] * D2R;
    }
    // Opposition swings +X toward +Z: a negative rotation about Y.
    thumbOpp.rotation.y = -angles[12] * D2R;
    thumbFlex.rotation.x = angles[13] * D2R;
    thumbMcp.rotation.x = angles[14] * D2R;
    thumbIp.rotation.x = angles[15] * D2R;
  }

  /** Set angles immediately. */
  function setPose(pose) {
    for (let i = 0; i < POSE_LEN; i++) angles[i] = pose[i];
    applyAngles();
  }

  /**
   * Approach a target pose: exponential with rate k, and no joint faster than
   * maxDegS. Returns the largest per-joint change this step, degrees.
   */
  function approachPose(pose, dt, k, maxDegS) {
    const a = 1 - Math.exp(-k * dt);
    const cap = maxDegS * dt;
    let maxStep = 0;
    for (let i = 0; i < POSE_LEN; i++) {
      let step = (pose[i] - angles[i]) * a;
      if (step > cap) step = cap;
      if (step < -cap) step = -cap;
      angles[i] += step;
      if (Math.abs(step) > maxStep) maxStep = Math.abs(step);
    }
    applyAngles();
    return maxStep;
  }

  const contactLocal = new THREE.Vector3(...H.contact);

  return {
    root,
    params: H,
    segments,
    angles,
    contactLocal,
    setPose,
    approachPose,
    meshCount: segments.length,
    triangleCount: segments.length * 12,
    /** Circle centre (hand-local y, z) for a surface of radius r under the palm contact. */
    gripCentre(r) {
      return [contactLocal.y, contactLocal.z + r];
    },
    dispose() {
      palmGeo.dispose();
      root.removeFromParent();
    },
  };
}
