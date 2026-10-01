/**
 * Figure.js — the faceless mannequin every character is built from
 * (design/SPEC-models.md §2).
 *
 * One parametric body, authored at a 1.76 m reference height and scaled
 * uniformly to the outfit's height. Proportions are standard anthropometric
 * fractions of height (Drillis & Contini): hip joint 0.52 H, knee 0.28 H,
 * shoulder 0.82 H, upper arm 0.17 H, forearm 0.15 H, hand 0.10 H.
 *
 * Clothes ARE the body: a jacket is the torso in the jacket's colour, a
 * trouser leg is the leg. Layers that sit on top (waistcoat, bib, tie, badge,
 * collar) stand at least 4 mm proud of what they cover, and a piece that
 * tucks into another is narrower at the overlap, never equal: nothing ends
 * flush with a visible face (the z-fighting rule from Parking Precision).
 *
 * Every surface is a Lambert material from Palette.matte (shared, never
 * mutated) on flat-shaded geometry (one normal per face), matching the cars.
 * Forward is -Z, right is +X, like the cars.
 */
import * as THREE from 'three';
import { matte } from '../world/Palette.js';
import { beamGeometry } from '../vehicle/BodyLoft.js';
import { TONES } from './cast.js';
import { POSES } from './poses.js';

/** Reference height every number below is authored at. */
export const REF_HEIGHT = 1.76;

const TAU = Math.PI * 2;
const BOX = new THREE.BoxGeometry(1, 1, 1);
const D2R = Math.PI / 180;

// --- landmarks at 1.76 m (ground frame) --------------------------------------
const HIP_Y = 0.91;
const KNEE_Y = 0.49;
const ANKLE_Y = 0.08;
const THIGH = HIP_Y - KNEE_Y;
const SHIN = KNEE_Y - ANKLE_Y;
const WAIST = 0.12; // spine pivot above the hip joint
const SHOULDER = 0.41; // shoulder joint above the spine pivot (1.44 m)
const NECK = 0.455; // neck base above the spine pivot
const HEAD_PIVOT = 0.075; // top of the neck
const HEAD_C = 0.085; // head centre above the head pivot (1.645 m)
const HEAD_R = [0.078, 0.115, 0.098];
const UPPER_ARM = 0.3;
const FOREARM = 0.26;

// --- geometry helpers -----------------------------------------------------------

/** Emit a triangle wound so its normal points along `out`. */
function tri(pos, a, b, c, out) {
  const nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
  const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
  const nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const flip = nx * out[0] + ny * out[1] + nz * out[2] < 0;
  const [p, q] = flip ? [c, b] : [b, c];
  pos.push(...a, ...p, ...q);
}

function finish(pos) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals(); // non-indexed: one normal per face = flat shading
  g.userData.disposable = true;
  return g;
}

/**
 * Loft elliptical rings stacked along Y. ring = [y, rx, rz, dx = 0, dz = 0].
 * Angle 0 is the front (-Z). `arc` = [a0, a1] builds an open sheet (a coat
 * open at the front) instead of a closed tube; give it a DoubleSide material.
 */
function ringLoft(rings, { seg = 8, capTop = true, capBottom = true, arc = null } = {}) {
  const pos = [];
  const a0 = arc ? arc[0] : 0;
  const a1 = arc ? arc[1] : TAU;
  const pt = (r, k) => {
    const a = a0 + ((a1 - a0) * k) / seg;
    return [(r[3] ?? 0) + r[1] * Math.sin(a), r[0], (r[4] ?? 0) - r[2] * Math.cos(a)];
  };
  for (let i = 0; i < rings.length - 1; i++) {
    const A = rings[i];
    const B = rings[i + 1];
    for (let k = 0; k < seg; k++) {
      const k2 = arc ? k + 1 : (k + 1) % seg;
      const p0 = pt(A, k);
      const p1 = pt(A, k2);
      const p2 = pt(B, k2);
      const p3 = pt(B, k);
      const mid = [(p0[0] + p1[0] + p2[0] + p3[0]) / 4, (p0[1] + p1[1] + p2[1] + p3[1]) / 4, (p0[2] + p1[2] + p2[2] + p3[2]) / 4];
      const ax = [((A[3] ?? 0) + (B[3] ?? 0)) / 2, mid[1], ((A[4] ?? 0) + (B[4] ?? 0)) / 2];
      const out = [mid[0] - ax[0], mid[1] - ax[1], mid[2] - ax[2]];
      tri(pos, p0, p1, p2, out);
      tri(pos, p0, p2, p3, out);
    }
  }
  if (!arc) {
    const cap = (r, dir) => {
      const c = [r[3] ?? 0, r[0], r[4] ?? 0];
      for (let k = 0; k < seg; k++) tri(pos, c, pt(r, k), pt(r, (k + 1) % seg), [0, dir, 0]);
    };
    if (capBottom) cap(rings[0], rings[0][0] < rings[rings.length - 1][0] ? -1 : 1);
    if (capTop) cap(rings[rings.length - 1], rings[0][0] < rings[rings.length - 1][0] ? 1 : -1);
  }
  return finish(pos);
}

/** Flat-shaded ellipsoid, or the top `thetaLen` of one (a cap shell). */
function ellipsoid(rx, ry, rz, { w = 10, h = 7, thetaLen = Math.PI } = {}) {
  const g = new THREE.SphereGeometry(1, w, h, 0, TAU, 0, thetaLen).toNonIndexed();
  g.scale(rx, ry, rz);
  g.computeVertexNormals();
  g.userData.disposable = true;
  return g;
}

/** The front half of a thin disc: a cap's peak. */
function brim(r, t, depthScale = 1.25) {
  const g = new THREE.CylinderGeometry(r, r, t, 10, 1, false, Math.PI / 2, Math.PI).toNonIndexed();
  g.scale(1, 1, depthScale);
  g.computeVertexNormals();
  g.userData.disposable = true;
  return g;
}

// --- outfit defaults ---------------------------------------------------------------

function normalise(o) {
  return {
    height: o.height ?? REF_HEIGHT,
    shoulders: o.shoulders ?? 1,
    hips: o.hips ?? 1,
    girth: o.girth ?? 1,
    hair: o.hair ?? { style: 'short', color: TONES.hairDark },
    headwear: o.headwear ?? null,
    top: { style: 'tee', color: TONES.charcoal, ...o.top },
    coat: o.coat ?? null,
    vest: o.vest ?? null,
    overalls: o.overalls ?? null,
    legs: { color: TONES.denim, style: 'trousers', ...o.legs },
    shoes: { color: TONES.black, style: 'trainers', ...o.shoes },
    extras: o.extras ?? [],
    gloves: o.gloves ?? TONES.black,
    scarf: o.scarf ?? TONES.charcoal,
    tie: o.tie ?? TONES.black,
  };
}

const SLEEVED = new Set(['shirt', 'jacket', 'bomber', 'hoodie', 'suit', 'uniform']);
const JACKETS = new Set(['jacket', 'bomber', 'hoodie', 'suit', 'uniform']);

/**
 * Build a figure.
 * @param {object} outfit  see cast.js
 * @returns {{
 *   group: THREE.Group, joints: Record<string, THREE.Group>, sockets: Record<string, THREE.Group>,
 *   outfit: object, height: number,
 *   setPose(pose: string|object, opts?: { blend?: number }): void,
 *   update(dt: number): void, dispose(): void,
 * }}
 */
export function createFigure(outfit = {}, { name = 'figure', breathe = true, phase = 0 } = {}) {
  const o = normalise(outfit);
  const S = o.shoulders;
  const P = o.hips;
  const G = o.girth;
  const top = o.top;
  const jacket = JACKETS.has(top.style);
  const overalls = !!o.overalls;

  const skin = matte(TONES.mannequin);
  const topMat = matte(top.color);
  const accentMat = matte(top.accent ?? top.color);
  const legMat = matte(overalls ? o.overalls.color : o.legs.color);
  const shoeMat = matte(o.shoes.color);
  const hairMat = matte(o.hair.color);
  const coatMat = o.coat ? matte(o.coat.color, { side: THREE.DoubleSide }) : null;
  const sleeveMat = o.coat ? matte(o.coat.color) : topMat;
  const handMat = o.extras.includes('gloves') ? matte(o.gloves) : skin;

  const group = new THREE.Group();
  group.name = `figure:${name}`;
  // Everything below is authored at 1.76 m and scaled once here.
  const body = new THREE.Group();
  body.scale.setScalar(o.height / REF_HEIGHT);
  group.add(body);

  const joints = {};
  const sockets = {};
  const parts = {};
  const joint = (key, parent, x, y, z) => {
    const g = new THREE.Group();
    g.name = key;
    g.rotation.order = 'ZXY';
    g.position.set(x, y, z);
    parent.add(g);
    joints[key] = g;
    return g;
  };
  const mesh = (parent, geo, material, part) => {
    const m = new THREE.Mesh(geo, material);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    if (part) (parts[part] ??= []).push(m);
    return m;
  };
  const box = (parent, size, at, material, rot) => {
    const m = mesh(parent, BOX, material);
    m.scale.set(...size);
    m.position.set(...at);
    if (rot) m.rotation.set(...rot);
    return m;
  };

  // --- pelvis -------------------------------------------------------------------
  const hips = joint('pelvis', body, 0, HIP_Y, 0);
  const pelvisRings = [
    [-0.1, 0.125 * P * G, 0.095 * G],
    [0.0, 0.168 * P * G, 0.112 * G],
    [0.15, 0.14 * P * G, 0.1 * G], // narrower than the torso where it tucks in
  ];
  mesh(hips, ringLoft(pelvisRings), legMat);
  /** Half-width of the pelvis at height y (hips frame), for belts and hems. */
  const pelvisRx = (y) => {
    if (y <= 0) return 0.168 * P * G;
    return 0.168 * P * G + ((0.14 - 0.168) * P * G * Math.min(y, 0.15)) / 0.15;
  };

  // --- torso -----------------------------------------------------------------------
  const spine = joint('spine', hips, 0, WAIST, 0);
  const chestDz = -0.008;
  const torsoRings = (grow = 0) => [
    [0.0, 0.155 * P * G + grow, 0.106 * G + grow],
    [0.1, 0.152 * G * (S + P) * 0.5 + grow, 0.108 * G + grow],
    [0.22, 0.172 * S * G + grow, 0.122 * G + grow, 0, chestDz],
    [0.34, 0.185 * S + grow, 0.118 * G + grow, 0, -0.004],
    [0.435, 0.172 * S + grow, 0.095 * G + grow, 0, 0.005],
    [0.475, 0.07 + grow, 0.06 + grow, 0, 0.01],
  ];
  const jacketGrow = jacket ? 0.008 : 0;
  mesh(spine, ringLoft(torsoRings(jacketGrow), { seg: 10 }), topMat, 'torso');
  /** Distance from the spine axis to the chest front at height y (spine frame). */
  const chestFront = 0.122 * G + jacketGrow - chestDz;

  if (jacket) {
    // Hem below the waist, wider than the pelvis it covers. Suits and coats
    // run longer than a bomber.
    const len = top.style === 'bomber' ? 0.1 : top.style === 'suit' || top.style === 'uniform' ? 0.2 : 0.15;
    const hemR = (y) => pelvisRx(y + WAIST) + 0.016;
    mesh(
      spine,
      ringLoft(
        [
          [-len, hemR(-len) + 0.004, 0.124 * G],
          [-0.06, hemR(-0.06), 0.12 * G],
          // Top ring tucked 6 mm INSIDE the torso, so the two never overlap flush.
          [0.04, 0.15 * P * G + jacketGrow - 0.006, 0.104 * G + jacketGrow - 0.006],
        ],
        { seg: 10, capTop: false }
      ),
      topMat
    );
    if (top.style === 'bomber') {
      // Ribbed hem band in the accent colour, 5 mm proud of the hem.
      mesh(spine, ringLoft([[-len - 0.002, hemR(-len) + 0.01, 0.13 * G], [-len + 0.045, hemR(-len + 0.045) + 0.009, 0.128 * G]], { seg: 10 }), accentMat);
    }
    if (top.style === 'hoodie') {
      // Kangaroo pocket.
      box(spine, [0.2 * P, 0.1, 0.03], [0, 0.02, -(0.108 * G + jacketGrow) - 0.008], accentMat);
    }
  }

  // Collar: a short ring at the neck base, proud of the torso's top.
  if (top.style !== 'tee' && top.style !== 'hoodie') {
    const collarMat = top.style === 'shirt' || top.style === 'suit' || top.style === 'uniform' ? matte(top.style === 'shirt' ? top.color : TONES.white) : accentMat;
    mesh(spine, ringLoft([[0.43, 0.085, 0.075, 0, 0.01], [0.49, 0.075, 0.068, 0, 0.012]], { seg: 10 }), collarMat);
  }

  // Shirt front and tie for a suit (Voss), between the lapels.
  // A V of shirt (a downward triangle, 2 cm thick, back face sunk into the
  // chest) with the tie down its middle.
  if (top.style === 'suit') {
    const v = new THREE.Shape();
    v.moveTo(-0.055, 0);
    v.lineTo(0.055, 0);
    v.lineTo(0, -0.2);
    v.closePath();
    const vGeo = new THREE.ExtrudeGeometry(v, { depth: 0.02, bevelEnabled: false }).toNonIndexed();
    vGeo.computeVertexNormals();
    vGeo.userData.disposable = true;
    const shirt = mesh(spine, vGeo, matte(top.accent ?? TONES.white));
    // Extruded along +z; sits from chestFront - 0.014 (inside) to chestFront + 0.006 (proud).
    shirt.position.set(0, 0.43, -chestFront - 0.006);
    shirt.rotation.x = 0.2;
    if (o.extras.includes('tie')) {
      const t = new THREE.Shape();
      t.moveTo(-0.014, 0);
      t.lineTo(0.014, 0);
      t.lineTo(0.02, -0.15);
      t.lineTo(0, -0.172);
      t.lineTo(-0.02, -0.15);
      t.closePath();
      const tGeo = new THREE.ExtrudeGeometry(t, { depth: 0.012, bevelEnabled: false }).toNonIndexed();
      tGeo.computeVertexNormals();
      tGeo.userData.disposable = true;
      const tie = mesh(spine, tGeo, matte(o.tie));
      tie.position.set(0, 0.425, -chestFront - 0.014);
      tie.rotation.x = 0.2;
    }
  }

  // Waistcoat (valet) or hi-vis vest: a sleeveless shell 12 mm outside the
  // torso from waist to chest.
  if (o.vest) {
    const vestMat = matte(o.vest.color);
    const vr = torsoRings(jacketGrow + 0.012).slice(0, 4);
    vr[3] = [0.37, vr[3][1] - 0.012, vr[3][2], 0, -0.004];
    mesh(spine, ringLoft([[-0.03, 0.162 * P * G + 0.012, 0.118 * G], ...vr.slice(1)], { seg: 10 }), vestMat);
    if (o.vest.style === 'hivis') {
      const band = matte(0xd8dcd6);
      for (const y of [0.1, 0.25]) {
        const r = torsoRings(jacketGrow + 0.018);
        const at = (yy) => {
          const i = r.findIndex((q) => q[0] > yy);
          const a = r[i - 1];
          const b = r[i];
          const t = (yy - a[0]) / (b[0] - a[0]);
          return [yy, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, 0, (a[4] ?? 0) + ((b[4] ?? 0) - (a[4] ?? 0)) * t];
        };
        mesh(spine, ringLoft([at(y), at(y + 0.035)], { seg: 10 }), band);
      }
    }
  }

  // Overalls (Mara): bib, straps, and the sleeves tied round the waist.
  if (overalls) {
    box(spine, [0.2 * S, 0.21, 0.03], [0, 0.22, -chestFront - 0.006 + 0.015], legMat);
    for (const sx of [-1, 1]) {
      const strapFront = [sx * 0.075, 0.33, -chestFront - 0.002];
      const strapTop = [sx * 0.11 * S, 0.47, 0.0];
      const strapBack = [sx * 0.085, 0.24, 0.125 * G];
      mesh(spine, beamGeometry(strapFront, strapTop, 0.035, 0.012), legMat);
      mesh(spine, beamGeometry(strapTop, strapBack, 0.035, 0.012), legMat);
    }
    mesh(hips, ringLoft([[0.07, pelvisRx(0.07) + 0.016, 0.128 * G], [0.13, pelvisRx(0.13) + 0.03, 0.124 * G]], { seg: 10 }), legMat);
    for (const sx of [-1, 1]) {
      mesh(
        hips,
        ringLoft([[0.09, 0.03, 0.025, sx * 0.06, -0.13 * G], [-0.12, 0.026, 0.02, sx * 0.075, -0.13 * G - 0.015]]),
        legMat
      );
    }
  }

  // Belt (police), with a buckle.
  if (o.extras.includes('belt')) {
    const y = 0.06;
    mesh(hips, ringLoft([[y, pelvisRx(y) + (jacket ? 0.03 : 0.012), 0.13 * G], [y + 0.045, pelvisRx(y + 0.045) + (jacket ? 0.03 : 0.012), 0.128 * G]], { seg: 10 }), matte(TONES.black));
  }

  // Badges on the chest: police (left, gold) and the valet's name badge (right).
  // Back face just inside the outermost layer, front face 6-8 mm proud.
  const outerFront = chestFront + (o.vest ? 0.012 : 0);
  if (o.extras.includes('badge')) box(spine, [0.045, 0.055, 0.012], [-0.075 * S, 0.27, -outerFront - 0.004], matte(0xc9a95a));
  if (o.extras.includes('nameBadge')) box(spine, [0.07, 0.025, 0.01], [0.075 * S, 0.27, -outerFront - 0.003], matte(TONES.white));

  // Scarf: a ring at the neck and one end hanging down the front.
  if (o.extras.includes('scarf')) {
    const scarf = matte(o.scarf);
    mesh(spine, ringLoft([[0.42, 0.1, 0.09, 0, 0.005], [0.5, 0.09, 0.08, 0, 0.008]], { seg: 10 }), scarf);
    // The loose end drapes from the front of the neck ring down the chest.
    const knot = [-0.05, 0.45, -0.088];
    const fold = [-0.05, 0.36, -chestFront - 0.012];
    const end = [-0.062, 0.16, -chestFront - 0.016];
    mesh(spine, beamGeometry(knot, fold, 0.065, 0.016), scarf);
    mesh(spine, beamGeometry(fold, end, 0.065, 0.016), scarf);
  }

  // A hoodie's hood, down, lying on the upper back (unless it is worn up).
  if (top.style === 'hoodie' && o.headwear?.style !== 'hood') {
    mesh(spine, ellipsoid(0.11, 0.065, 0.06, { w: 8, h: 5 }), accentMat).position.set(0, 0.44, 0.1);
  }

  // Long coat: open at the front, so the suit or uniform under it shows.
  if (o.coat) {
    const open = [0.55, TAU - 0.55];
    mesh(spine, ringLoft(torsoRings(jacketGrow + 0.014).slice(0, 5), { seg: 12, arc: open }), coatMat);
    mesh(spine, ringLoft([[0.42, 0.175 * S + jacketGrow + 0.014, 0.1 * G + jacketGrow + 0.014, 0, 0.005], [0.47, 0.09, 0.08, 0, 0.012]], { seg: 12 }), matte(o.coat.color));
    const skirt = mesh(
      hips,
      ringLoft(
        [
          [-0.49, 0.225 * P, 0.16 * G],
          [-0.25, 0.205 * P * G, 0.148 * G],
          [0.0, 0.19 * P * G, 0.136 * G],
          [WAIST, 0.155 * P * G + jacketGrow + 0.018, 0.106 * G + jacketGrow + 0.018],
        ],
        { seg: 12, arc: [0.4, TAU - 0.4] }
      ),
      coatMat,
      'coatSkirt'
    );
    skirt.name = 'coatSkirt';
  }

  // --- neck and head --------------------------------------------------------------
  const neck = joint('neck', spine, 0, NECK - 0.03, 0.01);
  mesh(neck, ringLoft([[0, 0.052, 0.05], [HEAD_PIVOT + 0.03, 0.045, 0.045]], { seg: 8 }), skin);
  const head = joint('head', neck, 0, HEAD_PIVOT + 0.03, 0);
  const skull = new THREE.Group();
  skull.position.set(0, HEAD_C, -0.008);
  head.add(skull);
  mesh(skull, ellipsoid(...HEAD_R, { w: 12, h: 9 }), skin, 'skull');
  sockets.head = skull;

  // Hair: a cap shell a little larger than the skull, tilted back so the
  // hairline sits above the (blank) face and the back of the head is covered.
  const hairStyle = o.hair.style;
  const hidden = o.headwear && ['beanie', 'hood', 'peaked'].includes(o.headwear.style);
  if (hairStyle !== 'none') {
    const cap = mesh(skull, ellipsoid(HEAD_R[0] + 0.006, HEAD_R[1] + 0.006, HEAD_R[2] + 0.007, { w: 12, h: 7, thetaLen: Math.PI * 0.6 }), hairMat);
    cap.rotation.x = 0.55;
    cap.position.set(0, 0.004, 0.006);
    if (hairStyle === 'bun' && !hidden) {
      mesh(skull, ellipsoid(0.045, 0.042, 0.042, { w: 8, h: 6 }), hairMat).position.set(0, 0.07, 0.095);
    }
    if (hairStyle === 'ponytail' && !hidden) {
      const tail = new THREE.Group();
      tail.position.set(0, 0.045, 0.098);
      tail.rotation.x = 0.4;
      skull.add(tail);
      mesh(tail, ringLoft([[0, 0.028, 0.026], [-0.09, 0.034, 0.03], [-0.25, 0.012, 0.012]], { seg: 7 }), hairMat);
    }
    if (hairStyle === 'long') {
      mesh(skull, ringLoft([[-0.26, 0.085, 0.03, 0, 0.075], [-0.12, 0.092, 0.045, 0, 0.07], [0.02, 0.083, 0.06, 0, 0.055]], { seg: 9 }), hairMat);
    }
  }

  // Headwear.
  if (o.headwear) {
    const hw = o.headwear;
    const hwMat = matte(hw.color);
    const hwAccent = matte(hw.accent ?? hw.color);
    const g = new THREE.Group();
    skull.add(g);
    if (hw.style === 'cap' || hw.style === 'capBack') {
      const crown = mesh(g, ellipsoid(HEAD_R[0] + 0.012, HEAD_R[1] - 0.005, HEAD_R[2] + 0.012, { w: 12, h: 6, thetaLen: Math.PI * 0.5 }), hwMat);
      crown.position.y = 0.022;
      crown.rotation.x = 0.12;
      const peak = mesh(g, brim(0.072, 0.008), hwAccent);
      peak.position.set(0, 0.03, -0.085);
      peak.rotation.x = 0.12;
      if (hw.style === 'capBack') g.rotation.y = Math.PI;
    } else if (hw.style === 'beanie') {
      const crown = mesh(g, ellipsoid(HEAD_R[0] + 0.014, HEAD_R[1] + 0.02, HEAD_R[2] + 0.014, { w: 12, h: 7, thetaLen: Math.PI * 0.56 }), hwMat);
      crown.rotation.x = 0.3;
      crown.position.y = 0.006;
      // Turned-up band: a strip of a larger ellipsoid round the crown's rim.
      const bandGeo = new THREE.SphereGeometry(1, 12, 9, 0, TAU, Math.PI * 0.42, Math.PI * 0.14).toNonIndexed();
      bandGeo.scale(HEAD_R[0] + 0.02, HEAD_R[1] + 0.026, HEAD_R[2] + 0.02);
      bandGeo.computeVertexNormals();
      bandGeo.userData.disposable = true;
      const band = mesh(g, bandGeo, matte(hw.accent ?? hw.color, { side: THREE.DoubleSide }));
      band.rotation.x = 0.3;
      band.position.y = 0.006;
    } else if (hw.style === 'peaked') {
      mesh(g, ringLoft([[0.01, HEAD_R[0] + 0.008, HEAD_R[2] + 0.008], [0.07, HEAD_R[0] + 0.016, HEAD_R[2] + 0.018], [0.11, HEAD_R[0] + 0.026, HEAD_R[2] + 0.03, 0, -0.008]], { seg: 12 }), hwMat);
      mesh(g, ringLoft([[0.005, HEAD_R[0] + 0.013, HEAD_R[2] + 0.013], [0.042, HEAD_R[0] + 0.018, HEAD_R[2] + 0.019]], { seg: 12 }), hwAccent);
      const peak = mesh(g, brim(0.07, 0.008, 1.0), matte(TONES.black));
      peak.position.set(0, 0.008, -(HEAD_R[2] + 0.01));
      peak.rotation.x = -0.3;
      box(g, [0.03, 0.03, 0.01], [0, 0.07, -(HEAD_R[2] + 0.02)], matte(0xc9a95a));
    } else if (hw.style === 'hood') {
      const hood = mesh(g, ellipsoid(HEAD_R[0] + 0.03, HEAD_R[1] + 0.025, HEAD_R[2] + 0.03, { w: 12, h: 8, thetaLen: Math.PI * 0.74 }), matte(hw.color, { side: THREE.DoubleSide }));
      hood.rotation.x = 0.62;
      hood.position.set(0, 0.005, 0.012);
    }
  }

  // --- arms ----------------------------------------------------------------------------
  const tee = top.style === 'tee';
  const sleeveGrow = jacket || o.coat ? 0.008 : 0;
  for (const side of ['R', 'L']) {
    const sx = side === 'R' ? 1 : -1;
    const sh = joint(`shoulder${side}`, spine, sx * 0.19 * S, SHOULDER, 0.005);
    const armMat = SLEEVED.has(top.style) || o.coat ? sleeveMat : skin;
    // Deltoid: a ball a little below the joint, so it rounds the shoulder
    // instead of standing up like a pad.
    mesh(sh, ellipsoid(0.055 * G + sleeveGrow, 0.052 * G + sleeveGrow, 0.056 * G + sleeveGrow, { w: 8, h: 6 }), tee ? topMat : armMat).position.y = -0.014;
    mesh(
      sh,
      ringLoft([[0, 0.052 * G + sleeveGrow, 0.056 * G + sleeveGrow], [-0.14, 0.047 * G + sleeveGrow, 0.05 * G + sleeveGrow], [-UPPER_ARM, 0.038 * G + sleeveGrow, 0.042 * G + sleeveGrow]]),
      armMat
    );
    if (tee) {
      // Short sleeve, 6 mm outside the bare upper arm.
      mesh(sh, ringLoft([[0.02, 0.06 * G, 0.064 * G], [-0.13, 0.054 * G, 0.058 * G]], { seg: 8 }), topMat);
    }
    const el = joint(`elbow${side}`, sh, 0, -UPPER_ARM, 0);
    mesh(el, ellipsoid(0.041 * G + sleeveGrow, 0.041 * G + sleeveGrow, 0.043 * G + sleeveGrow, { w: 7, h: 5 }), armMat);
    mesh(
      el,
      ringLoft([[0, 0.038 * G + sleeveGrow, 0.042 * G + sleeveGrow], [-0.07, 0.04 * G + sleeveGrow, 0.044 * G + sleeveGrow], [-FOREARM + 0.01, 0.028 * G + sleeveGrow, 0.032 * G + sleeveGrow]]),
      armMat
    );
    if (top.style === 'bomber') {
      mesh(el, ringLoft([[-FOREARM + 0.005, 0.036 * G + 0.008, 0.04 * G + 0.008], [-FOREARM + 0.05, 0.04 * G + 0.008, 0.044 * G + 0.008]]), accentMat);
    }
    const wr = joint(`wrist${side}`, el, 0, -FOREARM, 0);
    // Mitten hand: thin across the palm (x), broad front to back (z).
    mesh(wr, ringLoft([[0.02, 0.022, 0.034], [-0.07, 0.019, 0.046], [-0.165, 0.012, 0.03]], { seg: 8 }), handMat);
    box(wr, [0.02, 0.07, 0.022], [-sx * 0.004, -0.045, -0.04], handMat, [0.35, 0, 0]);
    const grip = new THREE.Group();
    grip.position.set(-sx * 0.022, -0.085, -0.01);
    wr.add(grip);
    sockets[`hand${side}`] = grip;
  }

  // --- legs ---------------------------------------------------------------------------
  const loose = o.legs.style === 'cargo' ? 1.12 : 1.06;
  for (const side of ['R', 'L']) {
    const sx = side === 'R' ? 1 : -1;
    const hp = joint(`hip${side}`, hips, sx * 0.09 * P, 0, 0);
    mesh(hp, ringLoft([[0.04, 0.08 * P * G * loose, 0.088 * G * loose], [-0.2, 0.07 * G * loose, 0.075 * G * loose], [-THIGH, 0.054 * G * loose, 0.058 * G * loose]]), legMat);
    if (o.legs.style === 'cargo') {
      box(hp, [0.026, 0.12, 0.1], [sx * (0.069 * G * loose + 0.016), -0.22, 0], legMat);
    }
    const kn = joint(`knee${side}`, hp, 0, -THIGH, 0);
    mesh(kn, ellipsoid(0.054 * G * loose, 0.054 * G * loose, 0.058 * G * loose, { w: 8, h: 6 }), legMat);
    mesh(kn, ringLoft([[0, 0.052 * G * loose, 0.056 * G * loose], [-0.12, 0.053 * G * loose, 0.06 * G * loose], [-SHIN + 0.02, 0.045 * loose, 0.048 * loose]]), legMat);
    const an = joint(`ankle${side}`, kn, 0, -SHIN, 0);
    // Shoe lofted heel to toe along -Z, sole flat on the ground.
    const shoe = o.shoes.style;
    const lift = shoe === 'boots' ? 1.15 : 1;
    const footRings = [
      [0.0, 0.042, 0.04 * lift],
      [0.08, 0.047, 0.05 * lift],
      [0.18, 0.05, 0.036 * lift],
      [0.27, 0.036, 0.022],
    ].map(([l, rx, rz]) => [l, rx, rz, 0, rz]);
    const foot = mesh(an, ringLoft(footRings, { seg: 8 }), shoeMat);
    foot.rotation.x = -Math.PI / 2; // loft +Y -> forward (-Z), loft z -> up
    foot.position.set(0, -ANKLE_Y, 0.06);
    if (shoe === 'trainers') {
      // White sole strip round the shoe, 4 mm outside it.
      // Its end caps sit 4 mm beyond the shoe's (equal caps would z-fight).
      const soleRings = footRings.map(([l, rx], i, a) => [i === 0 ? l - 0.004 : i === a.length - 1 ? l + 0.004 : l, rx + 0.004, 0.016, 0, 0.015]);
      const sole = mesh(an, ringLoft(soleRings, { seg: 8 }), matte(TONES.white));
      sole.rotation.x = -Math.PI / 2;
      sole.position.set(0, -ANKLE_Y, 0.06);
      if (o.shoes.color === TONES.white) sole.material = matte(TONES.charcoal);
    }
    if (shoe === 'boots') {
      mesh(an, ringLoft([[-0.06, 0.054 * loose, 0.058 * loose], [0.13, 0.059 * G * loose, 0.064 * G * loose]], { seg: 8 }), shoeMat);
    }
  }

  // --- pose ---------------------------------------------------------------------------
  const JOINT_KEYS = ['pelvis', 'spine', 'neck', 'head', 'shoulderR', 'elbowR', 'wristR', 'shoulderL', 'elbowL', 'wristL', 'hipR', 'kneeR', 'ankleR', 'hipL', 'kneeL', 'ankleL'];
  const MIRRORED = { shoulderL: 'shoulderR', elbowL: 'elbowR', wristL: 'wristR', hipL: 'hipR', kneeL: 'kneeR', ankleL: 'ankleR' };

  /** Resolve a pose (name or object) into full joint angles in radians. */
  function resolve(pose) {
    const p = typeof pose === 'string' ? POSES[pose] : pose;
    if (!p) throw new Error(`unknown pose ${pose}`);
    const out = { drop: p.drop ?? 0, hide: p.hide ?? [] };
    for (const k of JOINT_KEYS) {
      let v = p[k];
      if (!v && MIRRORED[k]) {
        v = p[MIRRORED[k]];
      }
      v = v ?? [0, 0, 0];
      const sign = k.endsWith('L') && k !== 'pelvis' ? -1 : 1;
      // Left-side angles are authored anatomically; y and z mirror.
      out[k] = [v[0] * D2R, v[1] * D2R * sign, v[2] * D2R * sign];
    }
    return out;
  }

  let target = resolve('stand');
  let current = resolve('stand');
  let blendTime = 0;
  let t = phase;

  function apply(st) {
    for (const k of JOINT_KEYS) joints[k].rotation.set(st[k][0], st[k][1], st[k][2]);
    joints.pelvis.position.y = HIP_Y - st.drop;
    for (const [part, meshes] of Object.entries(parts)) {
      if (part === 'coatSkirt') for (const m of meshes) m.visible = !st.hide.includes(part);
    }
  }

  function setPose(pose, { blend = 0 } = {}) {
    target = resolve(pose);
    blendTime = blend;
    if (blend <= 0) {
      current = structuredClone(target);
      apply(current);
    }
  }

  function update(dt) {
    t += dt;
    if (blendTime > 0) {
      const k = 1 - Math.exp(-dt / (blendTime / 3));
      for (const j of JOINT_KEYS) for (let i = 0; i < 3; i++) current[j][i] += (target[j][i] - current[j][i]) * k;
      current.drop += (target.drop - current.drop) * k;
      current.hide = target.hide;
    } else {
      current = structuredClone(target);
    }
    apply(current);
    if (breathe) {
      // 4 s breath: a few millimetres of chest rise, never a visible bob.
      const b = Math.sin((t * TAU) / 4);
      joints.spine.rotation.x += b * 0.008;
      joints.neck.rotation.x -= b * 0.006;
      joints.shoulderR.rotation.z += b * 0.006;
      joints.shoulderL.rotation.z -= b * 0.006;
    }
  }

  setPose('stand');

  function dispose() {
    group.traverse((m) => {
      if (m.isMesh && m.geometry.userData.disposable) m.geometry.dispose();
    });
  }

  return { group, joints, sockets, parts, outfit: o, height: o.height, setPose, update, dispose, resolve };
}
