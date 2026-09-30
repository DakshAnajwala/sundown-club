/**
 * SteeringWheel.js — the sport 3-spoke wheel: D-shaped rim, thumb grips,
 * dished octagonal hub pad, a heavier lower spoke and a wrapped 12 o'clock
 * stripe. No badge, no lettering (same no-brand position as the whole car).
 *
 * Built from RimCurve.js, so the mesh, the hands and the probes share one rim.
 * Four draw calls: rim + grips, spokes + hub bezel, hub pad, stripe.
 *
 * ------------------------------ FRAMES -------------------------------------
 *   car-local   the chassis frame everything in the cockpit is authored in
 *   pivot       at WHEEL_HUB, laid back by WHEEL_TILT_RAD; +Z points at the
 *               driver. Does NOT rotate with steering.
 *   rim         child of pivot, rotation.z = wheelAngleRad. "Material" angles
 *               live here: 0 is the stripe, ±π/2 the side spokes, π the lower
 *               spoke.
 *
 * A SPATIAL angle σ (what the hands use) is where on the rim a point sits as the
 * driver sees it right now: σ = material + ψ, with ψ = −wheelAngleRad =
 * steerNorm·2π (clockwise positive). Because the rim is not a circle, the rim's
 * radius at σ depends on ψ: the flat bottom turns with the wheel.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COLORS, matte } from '../world/Palette.js';
import { WHEEL_HUB, WHEEL_RIM_RADIUS, WHEEL_TILT_RAD, WHEEL_SPORT } from './Dimensions.js';
import { createRimCurve, wrapAngle } from './RimCurve.js';

const HALF_PI = Math.PI / 2;

/** Non-indexed, uv-less, flat normals: what mergeGeometries needs to agree on. */
function prep(g) {
  const out = g.index ? g.toNonIndexed() : g;
  if (out !== g) g.dispose();
  out.deleteAttribute('uv');
  out.computeVertexNormals();
  return out;
}

/** A hexahedron from 8 corners, ordered: hub end [−u−v, +u−v, +u+v, −u+v], then rim end, same order. */
function hexahedron(c) {
  const faces = [
    [0, 1, 2, 3], // hub end
    [5, 4, 7, 6], // rim end
    [4, 5, 1, 0],
    [3, 2, 6, 7],
    [1, 5, 6, 2],
    [4, 0, 3, 7],
  ];
  const pos = [];
  for (const [a, b, cc, d] of faces) {
    pos.push(...c[a], ...c[b], ...c[cc], ...c[a], ...c[cc], ...c[d]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

/**
 * A tube (or partial tube) swept along the rim curve.
 * @param curve     RimCurve instance
 * @param t0,t1     material angle range
 * @param segs      segments along the curve
 * @param radiusAt  (u along [0,1], phi) -> tube radius
 * @param phi0,phi1 range around the tube; phi = 0 is the driver side (+Z),
 *                  phi = π/2 the outer edge. Full ring when phi1 − phi0 = 2π.
 */
function sweep(curve, t0, t1, segs, radial, radiusAt, phi0 = 0, phi1 = Math.PI * 2, caps = false) {
  const full = Math.abs(phi1 - phi0 - Math.PI * 2) < 1e-6;
  const ringN = full ? radial : radial + 1;
  const closedLoop = Math.abs(t1 - t0 - Math.PI * 2) < 1e-6;
  const rows = closedLoop ? segs : segs + 1;
  const verts = [];
  const f = {};
  for (let i = 0; i < rows; i++) {
    const u = i / segs;
    curve.rimFrame2D(t0 + (t1 - t0) * u, f);
    for (let j = 0; j < ringN; j++) {
      const phi = phi0 + ((phi1 - phi0) * j) / radial;
      const r = radiusAt(u, phi);
      const cn = Math.sin(phi) * r; // along outward normal
      const ca = Math.cos(phi) * r; // along the axis, toward the driver
      verts.push([f.x + f.nx * cn, f.y + f.ny * cn, ca]);
    }
  }
  const pos = [];
  const quad = (a, b, c, d) => pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  const rowCount = closedLoop ? rows : rows - 1;
  const colCount = full ? ringN : ringN - 1;
  for (let i = 0; i < rowCount; i++) {
    const i2 = (i + 1) % rows;
    for (let j = 0; j < colCount; j++) {
      const j2 = (j + 1) % ringN;
      quad(verts[i * ringN + j], verts[i2 * ringN + j], verts[i2 * ringN + j2], verts[i * ringN + j2]);
    }
  }
  if (caps && !closedLoop) {
    // Fan each open end closed around its centreline point.
    for (const i of [0, rows - 1]) {
      curve.rimFrame2D(t0 + (t1 - t0) * (i / segs), f);
      const centre = [f.x, f.y, 0];
      for (let j = 0; j < colCount; j++) {
        const j2 = (j + 1) % ringN;
        if (i === 0) pos.push(...centre, ...verts[i * ringN + j2], ...verts[i * ringN + j]);
        else pos.push(...centre, ...verts[i * ringN + j], ...verts[i * ringN + j2]);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

function octagonShape(w, h, c) {
  const s = new THREE.Shape();
  const x = w / 2;
  const y = h / 2;
  s.moveTo(-x + c, -y);
  s.lineTo(x - c, -y);
  s.lineTo(x, -y + c);
  s.lineTo(x, y - c);
  s.lineTo(x - c, y);
  s.lineTo(-x + c, y);
  s.lineTo(-x, y - c);
  s.lineTo(-x, -y + c);
  s.closePath();
  return s;
}

/**
 * @param {object} [opts]
 * @param {object} [opts.params]   overrides for WHEEL_SPORT (the lab passes its sliders)
 * @param {object} [opts.colors]   overrides for { rim, spoke, hub, stripe }
 */
export function createSteeringWheel({ params = {}, colors = {} } = {}) {
  const P = { ...WHEEL_SPORT, ...params };
  const R = P.R ?? WHEEL_RIM_RADIUS;
  const curve = createRimCurve({ R, tube: P.rimTube, flatHalfDeg: P.flatHalfDeg, fillet: P.rimFillet });
  const tube = curve.tube;

  // dithering: true smooths ACES banding on these dark flat materials. (The
  // "static" once reported on the hub pad was not banding: it was the steering
  // column's end face z-fighting with the pad's front face — see Cockpit.js.)
  const cabin = (color, emissive) =>
    matte(color, { side: THREE.DoubleSide, emissive, emissiveIntensity: 1, flatShading: true, dithering: true });
  const mats = {
    rim: cabin(colors.rim ?? COLORS.wheelRim, 0x101010),
    spoke: cabin(colors.spoke ?? COLORS.wheelSpoke, 0x1c1b1a),
    hub: cabin(colors.hub ?? COLORS.wheelHub, 0x141312),
    stripe: cabin(colors.stripe ?? COLORS.wheelStripe, 0x3a3222),
  };

  const pivot = new THREE.Group();
  pivot.name = 'steering-wheel';
  pivot.position.set(WHEEL_HUB[0], WHEEL_HUB[1], WHEEL_HUB[2]);
  pivot.rotation.x = -WHEEL_TILT_RAD;
  const rimGroup = new THREE.Group();
  pivot.add(rimGroup);

  // --- rim + thumb grips ----------------------------------------------------
  const rimGeo = sweep(curve, -Math.PI, Math.PI, P.rimSegments, P.rimRadial, () => tube);
  const gripArc = P.thumbGrip.length / R;
  const gripParts = [];
  for (const side of [-1, 1]) {
    const c = side * HALF_PI;
    // The hub-side half of the tube only: phi π (away from the driver) through
    // 3π/2 (the inner edge) to 2π (the driver side). 0.4 mm over the rim so the
    // shell's edges never z-fight with the facets beneath.
    gripParts.push(
      sweep(
        curve,
        c - gripArc / 2,
        c + gripArc / 2,
        8,
        P.rimRadial / 2,
        (u, phi) => {
          const along = Math.sin(Math.PI * u) ** 2;
          const inward = Math.max(0, -Math.sin(phi)); // 1 on the hub side
          return tube + 0.0004 + P.thumbGrip.bulge * along * inward;
        },
        Math.PI,
        Math.PI * 2
      )
    );
  }
  const rimMesh = new THREE.Mesh(mergeGeometries([rimGeo, ...gripParts].map(prep)), mats.rim);

  // --- stripe ---------------------------------------------------------------
  const stripeArc = P.stripe.length / R;
  const stripeMesh = new THREE.Mesh(
    prep(
      sweep(curve, -stripeArc / 2, stripeArc / 2, 3, P.rimRadial, () => tube + P.stripe.proud, 0, Math.PI * 2, true)
    ),
    mats.stripe
  );

  // --- hub pad --------------------------------------------------------------
  const pad = P.hubPad;
  const bevel = Math.min(0.004, pad.chamfer / 3);
  const padGeo = new THREE.ExtrudeGeometry(octagonShape(pad.width - 2 * bevel, pad.height - 2 * bevel, pad.chamfer), {
    depth: pad.depth - 2 * bevel,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    curveSegments: 1,
  });
  padGeo.computeBoundingBox();
  const padFrontZ = -P.dish + pad.proud;
  padGeo.translate(0, 0, padFrontZ - padGeo.boundingBox.max.z);
  const hubMesh = new THREE.Mesh(prep(padGeo), mats.hub);

  // --- spokes + bezel -------------------------------------------------------
  const spokeGeos = [];
  const spokeOBBs = [];
  const hubZ = -P.dish;
  const bury = tube * 0.45; // how far a spoke end sinks into the rim tube
  {
    const { thickness: t, depth: d } = P.spokeSide;
    const flare = P.spokeSide.hubFlare ?? 1.3;
    for (const side of [-1, 1]) {
      const x0 = side * (pad.width / 2 - 0.006);
      const x1 = side * (curve.radius(side * HALF_PI) - tube + bury);
      const th0 = (t * flare) / 2;
      const th1 = t / 2;
      const corners = [
        [x0, -th0, hubZ - d / 2],
        [x0, -th0, hubZ + d / 2],
        [x0, th0, hubZ + d / 2],
        [x0, th0, hubZ - d / 2],
        [x1, -th1, -d / 2],
        [x1, -th1, d / 2],
        [x1, th1, d / 2],
        [x1, th1, -d / 2],
      ];
      if (side < 0) {
        // Keep the winding outward on the mirrored side.
        for (const k of [0, 4]) {
          [corners[k], corners[k + 1]] = [corners[k + 1], corners[k]];
          [corners[k + 2], corners[k + 3]] = [corners[k + 3], corners[k + 2]];
        }
      }
      spokeGeos.push(hexahedron(corners));
      spokeOBBs.push({
        name: side > 0 ? 'spoke-3' : 'spoke-9',
        materialAngle: side * HALF_PI,
        a: [x0, 0, hubZ],
        b: [x1, 0, 0],
        half: [th0, d / 2],
      });
    }
  }
  {
    const { widthHub, widthRim, depth: d } = P.spokeLower;
    const y0 = -(pad.height / 2 - 0.006);
    const y1 = -(curve.radius(Math.PI) - tube + bury);
    const corners = [
      [widthHub / 2, y0, hubZ - d / 2],
      [widthHub / 2, y0, hubZ + d / 2],
      [-widthHub / 2, y0, hubZ + d / 2],
      [-widthHub / 2, y0, hubZ - d / 2],
      [widthRim / 2, y1, -d / 2],
      [widthRim / 2, y1, d / 2],
      [-widthRim / 2, y1, d / 2],
      [-widthRim / 2, y1, -d / 2],
    ];
    spokeGeos.push(hexahedron(corners));
    spokeOBBs.push({
      name: 'spoke-6',
      materialAngle: Math.PI,
      a: [0, y0, hubZ],
      b: [0, y1, 0],
      half: [widthHub / 2, d / 2],
    });
  }
  {
    // A satin frame behind the pad: gives the pad an edge to read against.
    const bz = P.hubBezel;
    const g = new THREE.ExtrudeGeometry(
      octagonShape(pad.width + 2 * bz, pad.height + 2 * bz, pad.chamfer + bz * 0.6),
      { depth: 0.03, bevelEnabled: false, curveSegments: 1 }
    );
    g.translate(0, 0, padFrontZ - 0.012 - 0.03);
    spokeGeos.push(g);
  }
  const spokeMesh = new THREE.Mesh(mergeGeometries(spokeGeos.map(prep)), mats.spoke);

  for (const m of [rimMesh, spokeMesh, hubMesh, stripeMesh]) {
    m.geometry.userData.disposable = true;
    rimGroup.add(m);
  }

  // --- frames ---------------------------------------------------------------
  let psi = 0; // clockwise rim rotation, = steerNorm·2π
  const pivotQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -WHEEL_TILT_RAD);
  const pivotQuatInv = pivotQuat.clone().invert();
  const hubVec = new THREE.Vector3(...WHEEL_HUB);
  const f2 = { x: 0, y: 0, tx: 0, ty: 0, nx: 0, ny: 0 };
  const v = new THREE.Vector3();

  /** Rotate a rim-plane vector clockwise by ψ (material -> spatial). */
  const rotCW = (x, y, out) => {
    const c = Math.cos(psi);
    const s = Math.sin(psi);
    out.x = x * c + y * s;
    out.y = -x * s + y * c;
    return out;
  };

  function setAngle(wheelAngleRad) {
    psi = -wheelAngleRad;
    rimGroup.rotation.z = wheelAngleRad;
  }

  /** Pivot-frame (x, y, z) -> car-local. */
  function pivotToCar(x, y, z, out) {
    return out.set(x, y, z).applyQuaternion(pivotQuat).add(hubVec);
  }
  /** Car-local -> pivot frame (non-rotating). */
  function carToPivot(p, out) {
    return out.copy(p).sub(hubVec).applyQuaternion(pivotQuatInv);
  }

  const tmp2 = { x: 0, y: 0 };
  /**
   * The rim frame at a spatial angle, in car-local space: centreline point,
   * unit tangent (clockwise), unit in-plane outward normal, wheel axis (toward
   * the driver). Pass reusable Vector3s in `out` to avoid allocation.
   */
  function rimFrameLocal(spatial, out) {
    curve.rimFrame2D(spatial - psi, f2);
    rotCW(f2.x, f2.y, tmp2);
    pivotToCar(tmp2.x, tmp2.y, 0, out.point);
    rotCW(f2.tx, f2.ty, tmp2);
    out.tangent.set(tmp2.x, tmp2.y, 0).applyQuaternion(pivotQuat);
    rotCW(f2.nx, f2.ny, tmp2);
    out.normal.set(tmp2.x, tmp2.y, 0).applyQuaternion(pivotQuat);
    out.axis.set(0, 0, 1).applyQuaternion(pivotQuat);
    return out;
  }

  const frameScratch = {
    point: new THREE.Vector3(),
    tangent: new THREE.Vector3(),
    normal: new THREE.Vector3(),
    axis: new THREE.Vector3(),
  };
  /** Same contract as Cockpit.gripPointLocal: a rim point plus `radial` metres outward. */
  function gripPointLocal(spatial, radial = 0, out = new THREE.Vector3()) {
    rimFrameLocal(spatial, frameScratch);
    return out.copy(frameScratch.point).addScaledVector(frameScratch.normal, radial);
  }

  function wheelNormalLocal(out = new THREE.Vector3()) {
    return out.set(0, 0, 1).applyQuaternion(pivotQuat);
  }

  // --- geometry queries (probes, lab checks) ---------------------------------
  const q = new THREE.Vector3();
  /**
   * Signed clearance of a car-local point from each wheel part (negative =
   * inside). Rim distances include the grip bulge and stripe where they apply.
   */
  function clearance(p) {
    carToPivot(p, q);
    // Into the rim's own (rotating) frame.
    const c = Math.cos(-psi);
    const s = Math.sin(-psi);
    const mx = q.x * c + q.y * s;
    const my = -q.x * s + q.y * c;
    const mz = q.z;
    const near = curve.nearest(mx, my, mz);
    let surface = tube;
    for (const side of [-1, 1]) {
      const d = wrapAngle(near.theta - side * HALF_PI);
      if (Math.abs(d) < gripArc / 2) {
        const u = d / gripArc + 0.5;
        curve.rimPoint2D(near.theta, tmp2);
        const r0 = Math.hypot(tmp2.x, tmp2.y);
        const inward = Math.max(0, (r0 - Math.hypot(mx, my)) / Math.max(near.dist, 1e-6));
        surface = Math.max(surface, tube + P.thumbGrip.bulge * Math.sin(Math.PI * u) ** 2 * inward);
      }
    }
    if (Math.abs(near.theta) < stripeArc / 2) surface = tube + P.stripe.proud;
    const rim = near.dist - surface;

    let spokes = Infinity;
    for (const o of spokeOBBs) {
      spokes = Math.min(spokes, segmentBoxClearance(mx, my, mz, o));
    }
    // Hub pad as a box (the octagon is inside it: conservative).
    const hx = pad.width / 2 - Math.abs(mx);
    const hy = pad.height / 2 - Math.abs(my);
    const zc = padFrontZ - pad.depth / 2;
    const hz = pad.depth / 2 - Math.abs(mz - zc);
    const hub =
      hx > 0 && hy > 0 && hz > 0
        ? -Math.min(hx, hy, hz)
        : Math.hypot(Math.max(-hx, 0), Math.max(-hy, 0), Math.max(-hz, 0));
    return { rim, spokes, hub, materialTheta: near.theta };
  }

  /** Signed clearance from a spoke approximated as a swept box a->b. */
  function segmentBoxClearance(x, y, z, o) {
    const ax = o.a[0], ay = o.a[1], az = o.a[2];
    const dx = o.b[0] - ax, dy = o.b[1] - ay, dz = o.b[2] - az;
    const len = Math.hypot(dx, dy, dz);
    const ux = dx / len, uy = dy / len, uz = dz / len;
    const px = x - ax, py = y - ay, pz = z - az;
    const along = px * ux + py * uy + pz * uz;
    // In-plane perpendicular (thickness) and the out-of-plane depth axis.
    let wx = -uy, wy = ux; // perpendicular in the wheel plane
    const wl = Math.hypot(wx, wy) || 1;
    wx /= wl;
    wy /= wl;
    const across = px * wx + py * wy;
    // depth axis = u × w
    const ex = uy * 0 - uz * wy;
    const ey = uz * wx - ux * 0;
    const ez = ux * wy - uy * wx;
    const depth = px * ex + py * ey + pz * ez;
    const h = [len / 2 - Math.abs(along - len / 2), o.half[0] - Math.abs(across), o.half[1] - Math.abs(depth)];
    if (h[0] > 0 && h[1] > 0 && h[2] > 0) return -Math.min(...h);
    return Math.hypot(Math.max(-h[0], 0), Math.max(-h[1], 0), Math.max(-h[2], 0));
  }

  /** OBB summary of the non-rim parts in car-local space (debugWheelParts). */
  function parts() {
    const out = [];
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    for (const o of spokeOBBs) {
      rotCW(o.a[0], o.a[1], tmp2);
      pivotToCar(tmp2.x, tmp2.y, o.a[2], a);
      rotCW(o.b[0], o.b[1], tmp2);
      pivotToCar(tmp2.x, tmp2.y, o.b[2], b);
      // In-plane direction of the spoke as the driver sees it, clockwise from 12.
      rotCW(o.b[0] - o.a[0], o.b[1] - o.a[1], tmp2);
      const dirDeg = (Math.atan2(tmp2.x, tmp2.y) * 180) / Math.PI;
      out.push({ name: o.name, from: a.toArray(), to: b.toArray(), halfWidth: o.half[0], halfDepth: o.half[1], dirDeg });
    }
    pivotToCar(0, 0, padFrontZ - pad.depth / 2, a);
    out.push({ name: 'hub-pad', centre: a.toArray(), half: [pad.width / 2, pad.height / 2, pad.depth / 2] });
    gripPointLocal(psi, 0, a);
    out.push({ name: 'stripe', centre: a.toArray(), arcLength: P.stripe.length });
    for (const side of [-1, 1]) {
      gripPointLocal(psi + side * HALF_PI, 0, a);
      out.push({ name: side > 0 ? 'grip-3' : 'grip-9', centre: a.toArray() });
    }
    return { parts: out, rim: { R, tube, flatHalfDeg: P.flatHalfDeg, hub: [...WHEEL_HUB], tiltRad: WHEEL_TILT_RAD } };
  }

  function dispose() {
    for (const m of [rimMesh, spokeMesh, hubMesh, stripeMesh]) m.geometry.dispose();
    pivot.removeFromParent();
  }

  return {
    pivot,
    rimGroup,
    curve,
    params: P,
    drawCalls: 4,
    get psi() {
      return psi;
    },
    setAngle,
    rimFrameLocal,
    gripPointLocal,
    wheelNormalLocal,
    carToPivot,
    pivotToCar,
    clearance,
    parts,
    dispose,
  };
}
