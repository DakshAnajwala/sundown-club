/**
 * BodyLoft.js — lofting cross-sections into car bodywork.
 *
 * WHY THIS EXISTS
 * The v1-v3 car was 43 axis-aligned boxes. Two things are wrong with that.
 * Visually it reads as a stack of slabs, never as a car. Structurally it is
 * SOLID: the "shoulder band" that formed the hood also ran the full length of
 * the car straight through the passenger compartment, so from the driver's seat
 * you looked at the top face of a body-coloured slab, with the dashboard, the
 * steering wheel and the driver's own arms buried inside it. That is what the
 * first playable build actually looked like.
 *
 * Real car surfacing works from cross-sections ("stations") along the length,
 * skinned together. That gives a hollow shell, a controllable silhouette, and —
 * with flat shading and no smoothing — precisely the faceted-but-smooth look
 * this game's art direction is after.
 *
 * PROFILES
 * A station is a polyline of [x, y] points in the ground frame, plus its z.
 * Profiles are authored as HALF sections (x >= 0, running top-outer down to the
 * centreline) and mirrored, because cars are symmetrical and authoring both
 * sides by hand is how the two sides end up not matching.
 *
 * OPEN vs CLOSED
 * `loftOpen` skins a strip and leaves it open — used for the tub (open at the
 * top, which is what makes the cabin hollow), and for the hood, roof and boot
 * lids that cover the parts of that opening which should be covered.
 * `capProfile` closes an end when one is needed (the nose and tail).
 *
 * WINDING
 * Rather than reason about vertex order per surface and get it wrong once,
 * every triangle is emitted and then checked against a reference point known to
 * be inside the body: if the face normal points inward, the winding is flipped.
 * Single-sided materials then behave — the outside is visible, and from inside
 * the cabin the bodywork's back faces cull away instead of boxing the camera in.
 */
import * as THREE from 'three';

/**
 * Mirror a half profile into a full one.
 * @param {number[][]} half  [[x, y], ...] with x >= 0, ordered top-outer ->
 *                           centreline. A final point with x === 0 is treated
 *                           as being ON the centreline and is not duplicated.
 * @returns {number[][]} full profile, +x side -> centre -> -x side
 */
export function mirrorHalf(half) {
  const out = half.map(([x, y]) => [x, y]);
  const start = half[half.length - 1][0] === 0 ? half.length - 2 : half.length - 1;
  for (let i = start; i >= 0; i--) out.push([-half[i][0], half[i][1]]);
  return out;
}

/** Build a station from a half profile. */
export function station(z, half) {
  return { z, pts: mirrorHalf(half) };
}

/** Build a station from an already-mirrored full profile. */
export function stationFull(z, pts) {
  return { z, pts: pts.map(([x, y]) => [x, y]) };
}

class SurfaceBuilder {
  constructor() {
    this.positions = [];
  }

  /**
   * Emit a triangle, flipping the winding if its normal faces away from
   * `outward` (a direction that should point out of the body).
   */
  tri(a, b, c, outward) {
    const nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
    const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    const nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const flip = nx * outward[0] + ny * outward[1] + nz * outward[2] < 0;
    const [p, q] = flip ? [c, b] : [b, c];
    this.positions.push(a[0], a[1], a[2], p[0], p[1], p[2], q[0], q[1], q[2]);
  }

  quad(a, b, c, d, outward) {
    this.tri(a, b, c, outward);
    this.tri(a, c, d, outward);
  }

  /**
   * Non-indexed geometry so every triangle owns its vertices; computing normals
   * then yields one normal per face, which IS flat shading — no need for
   * flatShading on the material and no smoothing artefacts at the creases.
   */
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    g.computeVertexNormals();
    g.userData.disposable = true;
    return g;
  }
}

/** Vector from an interior reference point to a surface point. */
function outwardAt(p, ref) {
  return [p[0] - ref[0], p[1] - ref[1], p[2] - ref[2]];
}

/**
 * Skin consecutive stations into a strip.
 * @param {{z:number, pts:number[][]}[]} stations  all must have equal point counts
 * @param {(z:number)=>number[]} insideRef  a point inside the body at that z,
 *                                          used only to orient the faces
 */
export function loftOpen(stations, insideRef) {
  const b = new SurfaceBuilder();
  for (let s = 0; s < stations.length - 1; s++) {
    const A = stations[s];
    const B = stations[s + 1];
    const ref = insideRef((A.z + B.z) / 2);
    for (let i = 0; i < A.pts.length - 1; i++) {
      const a = [A.pts[i][0], A.pts[i][1], A.z];
      const b2 = [A.pts[i + 1][0], A.pts[i + 1][1], A.z];
      const c = [B.pts[i + 1][0], B.pts[i + 1][1], B.z];
      const d = [B.pts[i][0], B.pts[i][1], B.z];
      const mid = [
        (a[0] + b2[0] + c[0] + d[0]) / 4,
        (a[1] + b2[1] + c[1] + d[1]) / 4,
        (a[2] + b2[2] + c[2] + d[2]) / 4,
      ];
      b.quad(a, b2, c, d, outwardAt(mid, ref));
    }
  }
  return b.build();
}

/**
 * Close one end of a lofted strip with a fan from the profile's centroid.
 * @param {number[]} normal  which way the cap should face, e.g. [0,0,-1] for a nose
 */
export function capProfile(st, normal) {
  const b = new SurfaceBuilder();
  let cx = 0;
  let cy = 0;
  for (const [x, y] of st.pts) {
    cx += x;
    cy += y;
  }
  cx /= st.pts.length;
  cy /= st.pts.length;
  const centre = [cx, cy, st.z];
  // Includes the closing segment from the last point back to the first, which
  // is what seals the top of an open (tub) profile.
  for (let i = 0; i < st.pts.length; i++) {
    const j = (i + 1) % st.pts.length;
    b.tri(
      centre,
      [st.pts[i][0], st.pts[i][1], st.z],
      [st.pts[j][0], st.pts[j][1], st.z],
      normal
    );
  }
  return b.build();
}

/** Merge several geometries into one draw call. */
export function mergeGeometries(list) {
  const total = list.reduce((n, g) => n + g.getAttribute('position').count * 3, 0);
  const arr = new Float32Array(total);
  let o = 0;
  for (const g of list) {
    arr.set(g.getAttribute('position').array, o);
    o += g.getAttribute('position').count * 3;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
  out.computeVertexNormals();
  out.userData.disposable = true;
  return out;
}

/**
 * A flat panel from four corners — glass, lids and other simple surfaces that
 * do not need a full loft.
 */
export function quadGeometry(a, b, c, d) {
  const sb = new SurfaceBuilder();
  const mid = [
    (a[0] + b[0] + c[0] + d[0]) / 4,
    (a[1] + b[1] + c[1] + d[1]) / 4,
    (a[2] + b[2] + c[2] + d[2]) / 4,
  ];
  // Panels are authored facing outward already; use the midpoint pushed along
  // the polygon normal as the reference so the check is a no-op.
  const nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
  const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
  const nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  sb.quad(a, b, c, d, [nx, ny, nz]);
  const g = sb.build();
  g.userData.centre = mid;
  return g;
}

/**
 * A rectangular beam between two points — pillars, rails, trim strips.
 * Cheaper to author than a loft and correct for anything essentially linear.
 */
export function beamGeometry(from, to, width, thickness) {
  const dir = new THREE.Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  const len = dir.length();
  const geo = new THREE.BoxGeometry(width, len, thickness);
  geo.userData.disposable = true;
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    dir.clone().normalize()
  );
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2),
    q,
    new THREE.Vector3(1, 1, 1)
  );
  geo.applyMatrix4(m);
  return geo;
}
