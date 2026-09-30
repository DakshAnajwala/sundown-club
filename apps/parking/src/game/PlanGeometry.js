/**
 * PlanGeometry.js — pure plan-view (x,z) geometry, shared by the level linter
 * and the overhead parking review (GOAL: Part C, C.7).
 *
 * No three.js import: both `tools/level-lint.mjs` (a Node script) and the
 * in-game review import this same module, so the game and the linter can
 * never disagree about what counts as an obstacle or how close it is.
 *
 * Moved out of level-lint.mjs verbatim — same functions, same behaviour.
 * `node tools/level-lint.mjs` output is byte-identical before and after.
 */

/** Oriented rectangle -> 4 corners in (x, z). Same yaw convention as THREE. */
export function rect(cx, cz, w, l, yaw = 0) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [
    [-w / 2, -l / 2],
    [w / 2, -l / 2],
    [w / 2, l / 2],
    [-w / 2, l / 2],
  ].map(([x, z]) => [cx + x * c + z * s, cz - x * s + z * c]);
}

export function axes(poly) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const [x1, z1] = poly[i];
    const [x2, z2] = poly[(i + 1) % poly.length];
    const ex = x2 - x1;
    const ez = z2 - z1;
    const len = Math.hypot(ex, ez);
    out.push([-ez / len, ex / len]);
  }
  return out;
}

/** Separating-axis test; true when the interiors overlap by more than eps. */
export function overlaps(a, b, eps = 0.005) {
  for (const [ax, az] of [...axes(a), ...axes(b)]) {
    const pa = a.map(([x, z]) => x * ax + z * az);
    const pb = b.map(([x, z]) => x * ax + z * az);
    if (Math.max(...pa) <= Math.min(...pb) + eps || Math.max(...pb) <= Math.min(...pa) + eps) return false;
  }
  return true;
}

export function segDist(p, a, b) {
  const [px, pz] = p;
  const [ax, az] = a;
  const [bx, bz] = b;
  const dx = bx - ax;
  const dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

/** Min distance between two convex polygons (0 if they overlap). */
export function gap(a, b) {
  if (overlaps(a, b, 0)) return 0;
  let best = Infinity;
  for (const [P, Q] of [
    [a, b],
    [b, a],
  ]) {
    for (const p of P) {
      for (let i = 0; i < Q.length; i++) best = Math.min(best, segDist(p, Q[i], Q[(i + 1) % Q.length]));
    }
  }
  return best;
}

/**
 * Closest pair of points between two convex polygons — for a clearance
 * dimension line, which needs WHERE the gap is, not just how big it is.
 * @returns {{distance:number, pa:[number,number], pb:[number,number]}}
 */
export function closestPoints(a, b) {
  let best = { distance: Infinity, pa: a[0], pb: b[0] };
  const consider = (p, q0, q1) => {
    const [px, pz] = p;
    const [ax, az] = q0;
    const [bx, bz] = q1;
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
    const cx = ax + t * dx;
    const cz = az + t * dz;
    const d = Math.hypot(px - cx, pz - cz);
    if (d < best.distance) best = { distance: d, pa: p, pb: [cx, cz] };
  };
  for (const p of a) for (let i = 0; i < b.length; i++) consider(p, b[i], b[(i + 1) % b.length]);
  for (const p of b) {
    for (let i = 0; i < a.length; i++) {
      const [ax, az] = a[i];
      const [bx, bz] = a[(i + 1) % a.length];
      const dx = bx - ax;
      const dz = bz - az;
      const t = Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - az) * dz) / (dx * dx + dz * dz)));
      const cx = ax + t * dx;
      const cz = az + t * dz;
      const d = Math.hypot(p[0] - cx, p[1] - cz);
      if (d < best.distance) best = { distance: d, pa: [cx, cz], pb: p };
    }
  }
  return best;
}

/**
 * Every plan-view obstacle the game actually builds for one (single-lot)
 * level: garage colliders (walls, pilasters/lamp posts), parked cars,
 * explicit pillars, wall blocks and kerbs. The exact list `tools/level-lint.mjs`
 * has always checked against — moved here so the review can use the same one.
 *
 * Not valid for `level.style === 'city'` (Level 13) — that level has its own
 * checks in `tools/city-lint.mjs` and the review does not run on it (C.2's
 * trigger table only covers levels 1-12).
 *
 * @param {object} level
 * @param {{colliders: Array}} garage  the object `createGarage(...)` returns
 */
export function levelFootprints(level, garage) {
  const CAR = { w: 1.78, l: 4.2 };
  const list = [];
  for (const c of garage.colliders) {
    list.push({ kind: c.kind, poly: rect(c.pos[0], c.pos[2], c.size[0], c.size[2]) });
  }
  for (const [i, c] of level.cars.entries()) {
    list.push({ kind: `car#${i}`, poly: rect(c.pos[0], c.pos[1], CAR.w, CAR.l, c.heading), car: c });
  }
  for (const p of level.pillars ?? []) {
    list.push({ kind: 'pillar', poly: rect(p.pos[0], p.pos[1], p.size[0], p.size[1]) });
  }
  for (const w of level.walls ?? []) {
    list.push({ kind: 'wall-block', poly: rect(w.pos[0], w.pos[1], w.size[0], w.size[1]) });
  }
  for (const k of level.kerbs ?? []) {
    list.push({ kind: 'kerb', poly: rect(k.pos[0], k.pos[1], 0.32, k.length, k.rotY ?? 0) });
  }
  return list;
}
