/**
 * layout-model.mjs — Level 13 "City drive", as data. Pure JS, no three.js.
 *
 * buildLayout(P) turns a handful of dimensions into every box, slab, ramp,
 * sign and route point of the level; checkLayout(L) runs the rules the future
 * tools/city-lint.mjs will enforce. design/level13/build-layout.mjs writes the
 * result to layout.json; sheet.html draws it and re-runs the checks live.
 *
 * ------------------------------ CONVENTIONS --------------------------------
 * Same as Levels.js: x east, z south, y up (ground frame, y = 0 at street and
 * ground-floor tarmac). heading 0 = nose toward -Z (north), +PI/2 = nose -X
 * (west). A box is { c:[x,y,z], s:[w,h,d], rotY?, pitch? } with FULL extents;
 * `pitch` tilts the box about its local X after rotY (ramps, ramp walls): a
 * positive pitch raises its -Z end.
 *
 * The route is the path of the REAR AXLE midpoint (what a low-speed car's
 * rear axle actually follows), so swept paths come out right in turns.
 */

export const CAR = { length: 4.2, width: 1.78, height: 1.45, wheelbase: 2.62, overhang: 0.79, minRadius: 3.56 };
const TAU = Math.PI * 2;

// Paint/body variety (GOAL-city-polish.md item 2). PAINT_COUNT mirrors
// Palette.js's COLORS.carPaints.length (10) — kept as a plain number here
// since this file is pure data with no three.js/src import. BODY_MIX mirrors
// bodies.js's MIX ratios by name (mostly sedans, a scattering of everything
// else) and is deliberately indexed independently of paint: LevelBuilder.js's
// hand-authored levels always set an explicit `body` name per car for exactly
// this reason — leaving it unset falls back to `bodyForIndex(paint)`, which
// silently caps body variety at whatever range `paint` happens to cover.
const PAINT_COUNT = 10;
const BODY_MIX = ['sedan', 'sedan', 'hatchback', 'sedan', 'suv', 'sedan', 'hatchback', 'suv', 'sedan', 'van', 'sedan', 'pickup'];

export const DEFAULTS = {
  city: {
    half: 111, // boundary: the outer streets' far kerbs
    streetsX: [-105, -35, 35, 105],
    streetsZ: [-105, -38, 38, 105],
    street: 12, // carriageway: a driving lane and a parking lane each way
    sidewalk: 2.5,
    laneOffset: 2.2, // driving line from the centreline (drive on the right)
    kerbCarOffset: 5.0, // kerbside parked cars: 1.0 m clear of a car on the driving line
  },
  park: {
    halfX: 22,
    halfZ: 29,
    storey: 3.2,
    floors: 4, // above ground: L1, L2, L3, Roof
    slab: 0.3,
    laneX: 4.0, // lane centres at ±laneX (A west, B east)
    laneWidth: 4.0,
    rampSouthZ: 15, // low end of a north-rising ramp / high end of a south-rising one
    grade: 0.12,
    transition: 3.0, // half-grade pieces each end
    holeStartRise: 0.48, // slab above a ramp opens once the ramp has risen this much (headroom >= 2.3)
    parapet: 1.1,
    groundWall: 3.0,
    rampWall: 1.0,
    entrance: [-10, 0], // x range of the ground-floor opening in the south facade
    bayRowX: 18.8,
    bayPitch: 2.75,
    bayLength: 5.4,
    columnX: 16.1,
    hairpinR: 4.0,
    hairpinCentreZ: 21,
  },
  route: {
    spawnCentre: [-90, 107.2],
    cornerR: { street: 8, entrance: 6, roof: 5 },
  },
  target: { row: 'west', bayIndex: 4, tolerance: { pos: 0.5, headingDeg: 10 } },
  parTime: 240,
  timeLimit: 420,
};

const clone = (o) => JSON.parse(JSON.stringify(o));

/** Ramp profile, as pieces along travel: [{ len, grade }] (horizontal lengths). */
export function rampProfile(P) {
  const { storey, grade, transition } = P.park;
  const run = (storey - 2 * transition * (grade / 2)) / grade;
  return {
    run,
    total: run + 2 * transition,
    pieces: [
      { len: transition, grade: grade / 2 },
      { len: run, grade },
      { len: transition, grade: grade / 2 },
    ],
  };
}

/** Horizontal distance along a ramp at which it has risen `rise`. */
function distanceForRise(P, rise) {
  const prof = rampProfile(P);
  let d = 0;
  let y = 0;
  for (const p of prof.pieces) {
    if (y + p.len * p.grade >= rise) return d + (rise - y) / p.grade;
    d += p.len;
    y += p.len * p.grade;
  }
  return d;
}

/** Rise of a ramp after horizontal distance d from its low end. */
function riseAt(P, d) {
  const prof = rampProfile(P);
  let y = 0;
  let left = d;
  for (const p of prof.pieces) {
    const t = Math.min(left, p.len);
    if (t <= 0) break;
    y += t * p.grade;
    left -= t;
  }
  return y;
}

/**
 * @param {typeof DEFAULTS} [overrides]
 */
export function buildLayout(overrides = {}) {
  const P = mergeDeep(clone(DEFAULTS), overrides);
  const C = P.city;
  const K = P.park;
  const prof = rampProfile(P);
  const floorY = (k) => k * K.storey; // k = 0 ground .. floors roof

  const L = {
    id: 13,
    name: 'City Drive',
    subtitle: 'Across town, up four floors, park on the roof',
    maneuver: 'pull-in',
    style: 'city',
    params: P,
    units: 'metres; x east, z south, y up; heading 0 = north (-Z)',
    ramp: { grade: K.grade, transition: K.transition, run: +prof.run.toFixed(3), total: +prof.total.toFixed(3) },
    floors: [],
    streets: [],
    sidewalks: [],
    blocks: [],
    buildings: [],
    slabs: [], // { floor, y, rects:[[x0,z0,x1,z1]], thick }
    ramps: [], // { id, from, to, lane, dir, pieces:[box] , profile:[[z,y]] , x0, x1 }
    walls: [], // colliders: { kind, box }
    columns: [],
    bays: [],
    parkedCars: [],
    cones: [],
    arrows: [],
    signs: [],
    lamps: [],
    trafficLights: [], // { pos:[x,y,z], phaseOffset } — atmosphere only, no enforcement (GOAL-city-polish.md item 3)
    roundabout: null, // { pos:[x,y,z], radius } — decorative island, off-route
    crossings: [], // { pos:[x,y,z], size:[w,d], rotY }
    barrier: null,
    spawn: null,
    target: null,
    route: null,
  };

  // --- city ------------------------------------------------------------------
  const half = C.half;
  for (const x of C.streetsX) L.streets.push({ axis: 'z', at: x, from: -half, to: half, width: C.street });
  for (const z of C.streetsZ) L.streets.push({ axis: 'x', at: z, from: -half, to: half, width: C.street });
  const edges = (lines) => {
    const out = [];
    for (let i = 0; i < lines.length - 1; i++) out.push([lines[i] + C.street / 2 + C.sidewalk, lines[i + 1] - C.street / 2 - C.sidewalk]);
    return out;
  };
  const bx = edges(C.streetsX);
  const bz = edges(C.streetsZ);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < bx.length; i++) {
    for (let j = 0; j < bz.length; j++) {
      const [x0, x1] = bx[i];
      const [z0, z1] = bz[j];
      const block = { x0, x1, z0, z1, kind: i === 1 && j === 1 ? 'carpark' : 'buildings' };
      L.blocks.push(block);
      L.sidewalks.push({ x0: x0 - C.sidewalk, x1: x1 + C.sidewalk, z0: z0 - C.sidewalk, z1: z1 + C.sidewalk });
      if (block.kind === 'carpark') continue;
      // 2 x 2 buildings with a 4 m service gap, heights 9-32 m.
      const gx = (x0 + x1) / 2;
      const gz = (z0 + z1) / 2;
      for (const [ax0, ax1] of [[x0, gx - 2], [gx + 2, x1]]) {
        for (const [az0, az1] of [[z0, gz - 2], [gz + 2, z1]]) {
          const h = Math.round(9 + rnd() * 23);
          L.buildings.push({ box: { c: [(ax0 + ax1) / 2, h / 2, (az0 + az1) / 2], s: [ax1 - ax0, h, az1 - az0] }, palette: Math.floor(rnd() * 5) });
        }
      }
    }
  }
  // Boundary walls just outside the outer carriageways.
  for (const s of [-1, 1]) {
    L.walls.push({ kind: 'boundary', box: { c: [s * (half + 0.5), 2, 0], s: [1, 4, 2 * half + 2] } });
    L.walls.push({ kind: 'boundary', box: { c: [0, 2, s * (half + 0.5)], s: [2 * half + 2, 4, 1] } });
  }

  // --- car park: floors, slabs with ramp holes -------------------------------
  const laneA = [-K.laneX - K.laneWidth / 2, -K.laneX + K.laneWidth / 2];
  const laneB = [K.laneX - K.laneWidth / 2, K.laneX + K.laneWidth / 2];
  const southZ = K.rampSouthZ;
  const northZ = southZ - prof.total;
  const holeFromLow = distanceForRise(P, K.holeStartRise);

  // Ramp k goes from floor k to k+1. Even k: lane A, rising north (low end south).
  for (let k = 0; k < K.floors; k++) {
    const lane = k % 2 === 0 ? 'A' : 'B';
    const [xa, xb] = lane === 'A' ? laneA : laneB;
    const dir = lane === 'A' ? 'north' : 'south';
    const lowZ = dir === 'north' ? southZ : northZ;
    const sgn = dir === 'north' ? -1 : 1; // travel along z
    const y0 = floorY(k);
    const pieces = [];
    const profile = [[lowZ, y0]];
    let z = lowZ;
    let y = y0;
    for (const p of prof.pieces) {
      const z2 = z + sgn * p.len;
      const y2 = y + p.len * p.grade;
      const len = Math.hypot(p.len, p.len * p.grade) + 0.04;
      const ang = Math.atan(p.grade);
      const thick = 0.35;
      // Surface midpoint, box centre lowered along the surface normal.
      const mz = (z + z2) / 2;
      const my = (y + y2) / 2;
      const ny = Math.cos(ang);
      const nz = -sgn * Math.sin(ang) * -1; // normal tilts back toward the low end
      pieces.push({
        c: [(xa + xb) / 2, my - (ny * thick) / 2, mz + ((sgn * Math.sin(ang) * thick) / 2)],
        s: [xb - xa + 0.4, thick, len],
        pitch: dir === 'north' ? ang : -ang,
        grade: p.grade,
      });
      void nz;
      profile.push([z2, y2]);
      z = z2;
      y = y2;
    }
    const ramp = { id: `r${k}`, from: k, to: k + 1, lane, dir, x0: xa, x1: xb, lowZ, highZ: z, pieces, profile };
    L.ramps.push(ramp);
    // Side walls: tilted, following each piece, 1.0 m above the surface.
    for (const side of [xa - 0.1, xb + 0.1]) {
      for (const pc of pieces) {
        L.walls.push({
          kind: 'rampWall',
          box: { c: [side, pc.c[1] + 0.175 + K.rampWall / 2 - 0.0, pc.c[2]], s: [0.2, K.rampWall + 0.35, pc.s[2]], pitch: pc.pitch },
        });
      }
    }
  }

  for (let f = 0; f <= K.floors; f++) {
    const y = floorY(f);
    const name = f === 0 ? 'G' : f === K.floors ? 'R' : String(f);
    L.floors.push({ index: f, name, y });
    if (f === 0) continue; // ground floor is the street tarmac itself (plus a slab-coloured deck)
    // Hole over the ramp that arrives at this floor.
    const r = L.ramps[f - 1];
    const holeLow = r.dir === 'north' ? r.lowZ - holeFromLow : r.lowZ + holeFromLow;
    const hole = { x0: r.x0 - 0.2, x1: r.x1 + 0.2, z0: Math.min(holeLow, r.highZ), z1: Math.max(holeLow, r.highZ) };
    const rects = subtractRect([-K.halfX, -K.halfZ, K.halfX, K.halfZ], [hole.x0, hole.z0, hole.x1, hole.z1]);
    L.slabs.push({ floor: f, name, y, thick: K.slab, rects, hole });
    // Parapets along the hole's sides, and across its low end (the high end is
    // where the ramp lands, so it stays open).
    const lowEndZ = holeLow;
    for (const hx of [hole.x0 - 0.1, hole.x1 + 0.1]) {
      L.walls.push({ kind: 'holeParapet', floor: f, box: { c: [hx, y + K.parapet / 2, (hole.z0 + hole.z1) / 2], s: [0.2, K.parapet, hole.z1 - hole.z0] } });
    }
    L.walls.push({ kind: 'holeParapet', floor: f, box: { c: [(hole.x0 + hole.x1) / 2, y + K.parapet / 2, lowEndZ + (r.dir === 'north' ? 0.1 : -0.1)], s: [hole.x1 - hole.x0 + 0.4, K.parapet, 0.2] } });
  }
  // Ground deck (visual) and perimeter walls.
  L.slabs.unshift({ floor: 0, name: 'G', y: 0, thick: 0, rects: [[-K.halfX, -K.halfZ, K.halfX, K.halfZ]], hole: null });
  for (let f = 0; f <= K.floors; f++) {
    const y = floorY(f);
    const h = f === 0 ? K.groundWall : K.parapet;
    const kind = f === 0 ? 'groundWall' : 'parapet';
    // North, east, west full; south has the entrance on the ground floor.
    L.walls.push({ kind, floor: f, box: { c: [0, y + h / 2, -K.halfZ + 0.15], s: [2 * K.halfX, h, 0.3] } });
    for (const s of [-1, 1]) L.walls.push({ kind, floor: f, box: { c: [s * (K.halfX - 0.15), y + h / 2, 0], s: [0.3, h, 2 * K.halfZ] } });
    if (f === 0) {
      const [e0, e1] = K.entrance;
      L.walls.push({ kind, floor: f, box: { c: [(-K.halfX + e0) / 2, h / 2, K.halfZ - 0.15], s: [e0 + K.halfX, h, 0.3] } });
      L.walls.push({ kind, floor: f, box: { c: [(e1 + K.halfX) / 2, h / 2, K.halfZ - 0.15], s: [K.halfX - e1, h, 0.3] } });
    } else {
      L.walls.push({ kind, floor: f, box: { c: [0, y + h / 2, K.halfZ - 0.15], s: [2 * K.halfX, h, 0.3] } });
    }
  }
  // Columns: bay/aisle boundary lines (every 3 bays) and the spine between lanes.
  const bayZs = [];
  for (let z = -K.halfZ + 4.0; z <= K.halfZ - 4.0 + 1e-6; z += K.bayPitch) bayZs.push(+z.toFixed(3));
  for (let f = 0; f < K.floors; f++) {
    const y = floorY(f);
    const h = K.storey - K.slab;
    for (const s of [-1, 1]) {
      for (let i = 0; i <= bayZs.length; i += 3) {
        const z = bayZs[0] - K.bayPitch / 2 + i * K.bayPitch;
        if (z > K.halfZ - 1) continue;
        L.columns.push({ floor: f, box: { c: [s * K.columnX, y + h / 2, z], s: [0.6, h, 0.6] } });
      }
    }
    for (const z of [-14, -6, 2, 10]) L.columns.push({ floor: f, box: { c: [0, y + h / 2, z], s: [0.6, h, 0.6] } });
  }
  for (const c of L.columns) L.walls.push({ kind: 'column', floor: c.floor, box: c.box });

  // --- bays, parked cars ------------------------------------------------------
  const tgtRowX = P.target.row === 'west' ? -K.bayRowX : K.bayRowX;
  for (let f = 0; f <= K.floors; f++) {
    const y = floorY(f);
    for (const s of [-1, 1]) {
      bayZs.forEach((z, i) => {
        const heading = s < 0 ? Math.PI / 2 : -Math.PI / 2; // markings: head at the wall
        const bay = { floor: f, x: s * K.bayRowX, y, z, heading, width: K.bayPitch, length: K.bayLength };
        L.bays.push(bay);
        const isTarget = f === K.floors && s * K.bayRowX === tgtRowX && i === P.target.bayIndex;
        // Deterministic fill: roughly two thirds occupied, both target neighbours taken.
        const neighbour = f === K.floors && s * K.bayRowX === tgtRowX && Math.abs(i - P.target.bayIndex) === 1;
        const occupied = !isTarget && (neighbour || ((i * 7 + f * 3 + (s > 0 ? 5 : 0)) % 3 !== 0));
        if (occupied) {
          L.parkedCars.push({
            floor: f,
            pos: [s * K.bayRowX, y, z],
            heading: (i + f) % 4 === 0 ? heading + Math.PI : heading,
            paint: (i + f * 2) % PAINT_COUNT,
            body: BODY_MIX[Math.abs(i * 5 + f * 3 + (s > 0 ? 2 : 0)) % BODY_MIX.length],
          });
        }
        if (isTarget) {
          L.target = {
            pos: [s * K.bayRowX, z],
            y,
            floor: f,
            heading: s < 0 ? Math.PI / 2 : -Math.PI / 2, // forward park: nose to the wall
            bayHeading: heading,
            bay: { width: K.bayPitch, length: K.bayLength },
            style: 'bay',
            tolerance: P.target.tolerance,
          };
        }
      });
    }
  }
  // Kerbside cars on the route streets (never in the driving lane). Denser
  // than a single-lot street (GOAL-city-polish.md item 4.1) so the approach
  // reads busier and rewards precise lane-keeping — always at the same
  // kerbCarOffset (never narrower), so the validated swept-path clearance is
  // untouched; only the DENSITY along the street changed, not its width.
  for (const [x, z, h] of [
    [-82, 105 + C.kerbCarOffset, -Math.PI / 2],
    [-70, 105 + C.kerbCarOffset, -Math.PI / 2],
    [-62, 105 + C.kerbCarOffset, -Math.PI / 2],
    [-52, 105 + C.kerbCarOffset, -Math.PI / 2],
    [-46, 105 + C.kerbCarOffset, -Math.PI / 2],
    [-35 + C.kerbCarOffset, 92, 0],
    [-35 + C.kerbCarOffset, 80, 0],
    [-35 + C.kerbCarOffset, 58, 0],
    [-35 - C.kerbCarOffset, 70, Math.PI],
    [-35 - C.kerbCarOffset, 50, Math.PI],
    [-20, 38 + C.kerbCarOffset, -Math.PI / 2],
    [12, 38 - C.kerbCarOffset, Math.PI / 2],
  ]) L.parkedCars.push({
    floor: 'street',
    pos: [x, 0, z],
    heading: h,
    paint: Math.abs(Math.round(x + z)) % PAINT_COUNT,
    body: BODY_MIX[Math.abs(Math.round(x * 3 - z * 2)) % BODY_MIX.length],
  });
  for (const pc of L.parkedCars) {
    L.walls.push({ kind: 'parkedCar', floor: pc.floor, box: { c: [pc.pos[0], pc.pos[1] + 0.75, pc.pos[2]], s: [CAR.width, 1.5, CAR.length], rotY: pc.heading } });
  }

  // --- route -----------------------------------------------------------------
  const R = P.route.cornerR;
  const sp = P.route.spawnCentre;
  const lane = C.laneOffset;
  const hz = K.hairpinCentreZ;
  const hr = K.hairpinR;
  const wp = [
    // [x, z, cornerRadius, floorHint]
    [sp[0] - CAR.wheelbase / 2, sp[1], 0, 0],
    [C.streetsX[1] + lane, C.streetsZ[3] + lane, R.street, 0],
    [C.streetsX[1] + lane, C.streetsZ[2] + lane, R.street, 0],
    [-K.laneX, C.streetsZ[2] + lane, R.entrance, 0],
  ];
  let fz = 'north';
  for (let k = 0; k < K.floors; k++) {
    // Up ramp k, then (except after the last ramp) a hairpin at its high end.
    const r = L.ramps[k];
    if (k === K.floors - 1) break;
    const endZ = r.dir === 'north' ? -hz - hr : hz + hr;
    const fromX = r.lane === 'A' ? -K.laneX : K.laneX;
    const toX = -fromX;
    wp.push([fromX, endZ, hr, k + 1]);
    wp.push([toX, endZ, hr, k + 1]);
    fz = r.dir;
  }
  void fz;
  // Roof: arrive heading south in lane B, west along the south cross aisle,
  // north up the west aisle, left into the bay.
  const roofY = floorY(K.floors);
  const aisleX = -(K.bayRowX - K.bayLength / 2 - 5.0); // 5 m out from the bay mouths
  const t = L.target;
  const turnZ = hz + 3.5;
  wp.push([K.laneX, turnZ, R.roof, K.floors]);
  wp.push([aisleX, turnZ, R.roof, K.floors]);
  wp.push([aisleX, t.pos[1], R.roof, K.floors]);
  // Rear axle when parked: car centre minus half the wheelbase along the nose.
  const nose = headingDir(t.heading);
  wp.push([t.pos[0] - nose[0] * (CAR.wheelbase / 2), t.pos[1] - nose[1] * (CAR.wheelbase / 2), 0, K.floors]);
  L.route = buildRoute(wp, (x, z, prevY) => surfaceAt(L, x, z, prevY));
  const first = L.route.points[0];
  L.spawn = { pos: [sp[0], sp[1]], y: 0, heading: first.heading };
  L.parTime = P.parTime;
  L.timeLimit = P.timeLimit;

  // --- cones, arrows, signs, lamps, barrier -----------------------------------
  L.cones = [
    { pos: [aisleX + 1.6, roofY, 6] },
    { pos: [aisleX - 1.6, roofY, 0] },
    { pos: [aisleX + 1.6, roofY, -6] },
  ];
  const arrowAt = (x, y, z, heading, kind = 'straight') => L.arrows.push({ pos: [x, y, z], heading, kind });
  arrowAt(-80, 0, 105 + lane, -Math.PI / 2);
  arrowAt(-47, 0, 105 + lane, -Math.PI / 2, 'left');
  arrowAt(-35 + lane, 0, 53, 0, 'right');
  arrowAt(-17, 0, 38 + lane, -Math.PI / 2, 'left');
  for (const r of L.ramps) {
    const fromX = r.lane === 'A' ? -K.laneX : K.laneX;
    arrowAt(fromX, floorY(r.from), r.dir === 'north' ? r.lowZ + 4 : r.lowZ - 4, r.dir === 'north' ? 0 : Math.PI, 'ramp');
  }
  arrowAt(K.laneX, roofY, turnZ - 2.5, Math.PI, 'right');
  // The two real street x street crossings the route passes through (GOAL-
  // city-polish.md item 3): wp[1]/wp[2] above sit ON the driving lane through
  // these, offset by `lane` from the true centreline.
  const routeIntersections = [
    { x: C.streetsX[1], z: C.streetsZ[3], turn: 'left' }, // (-35, 105) — into the north-south street
    { x: C.streetsX[1], z: C.streetsZ[2], turn: 'left' }, // (-35, 38) — toward the entrance
  ];
  L.signs = [
    { kind: 'pylon', text: 'P', pos: [-26.5, 0, 33], height: 9, panel: 2.6, faces: ['south', 'west'] },
    { kind: 'facade', text: 'PARKING  ·  ROOF ↑', pos: [(K.entrance[0] + K.entrance[1]) / 2, 3.6, K.halfZ + 0.05], width: 9, height: 1.1, facing: 'south' },
    { kind: 'street', text: 'P  150 m  ↑', pos: [-41.5, 2.6, 99], width: 2.6, height: 0.9, facing: 'south' },
    ...L.floors.map((f) => ({ kind: 'floorNumber', text: f.name, pos: [f.index % 2 === 0 ? -K.laneX : K.laneX, f.y + 0.01, f.index % 2 === 0 ? hz + 5 : -hz - 5], size: 3.2 })),
    ...L.floors.slice(1).map((f) => ({ kind: 'levelSign', text: `LEVEL ${f.name}`, pos: [0, f.y + 2.1, f.index % 2 === 1 ? -K.halfZ + 0.35 : K.halfZ - 0.35], width: 3.2, height: 0.7, facing: f.index % 2 === 1 ? 'south' : 'north' })),
    // Overhead directional gantries at the two route intersections (item 3.1):
    // a raised chevron pointing the way to turn, right where the driver needs
    // to decide, so the route is found by reading signage rather than there
    // being only one open road.
    { kind: 'gantry', pos: [-47, 4.6, 105 + lane], height: 4.6, arrowHeading: -Math.PI / 2, turn: 'left' },
    { kind: 'gantry', pos: [-17, 4.6, 38 + lane], height: 4.6, arrowHeading: -Math.PI / 2, turn: 'left' },
    // Decoy wayfinding (item 4.2): a second "P" pylon further east along the
    // through street at intersection 1, tempting a first-time player to keep
    // straight instead of taking the gantry's indicated left. Purely a sign —
    // no new street, gate or collider — so it adds a real decision to make
    // without touching the validated route/autodrive geometry.
    { kind: 'pylon', text: 'P', pos: [10, 0, 99], height: 7, panel: 2.0, faces: ['south'] },
  ];

  // --- traffic lights (item 3.2): atmosphere only, no enforcement ------------
  // One signal per route intersection, near the kerb corner the driver
  // approaches, animated on a fixed cycle by CityBuilder.update(). Offset
  // phases so the two don't flip in lockstep.
  //
  // Placement: the rendered sidewalk band at a corner runs from the
  // carriageway edge (street/2 off the centreline) out to the building line
  // (street/2 + sidewalk off the centreline) — see edges()/L.sidewalks above.
  // A light must sit inside that band, not just past the carriageway edge:
  // offsetting by only `street/2 + 0.6` (old code) put the pole ~2 m short of
  // the sidewalk, in the paved-but-nothing-there gap, which read as "standing
  // in the street." Centring the offset in the band (street/2 + sidewalk/2)
  // gives ~1.25 m clearance from both the carriageway and the building line.
  // NW corner (x and z both below the crossing) is used for both
  // intersections: at (-35, 38) it sits on the far side of the -35 street
  // from the car-park entrance (which is ~25 m east, past the intersection)
  // — away from the entrance opening and the barrier booth, not competing
  // for space with either; at (-35, 105) it's simply the corner nearest the
  // spawn approach. Both land on real sidewalk pavement (checked against
  // L.sidewalks' rects, not just off the carriageway).
  const cornerOffset = C.street / 2 + C.sidewalk / 2;
  L.trafficLights = routeIntersections.map((ix, k) => ({
    pos: [ix.x - cornerOffset, 0, ix.z - cornerOffset],
    height: 4.0,
    phaseOffset: k * 6,
  }));

  // --- roundabout (item 3.3): decorative island at an OFF-route intersection -
  // A functional, drivable roundabout would change the route geometry and the
  // validated autodrive path — too risky here. This is atmosphere only: a
  // raised planter + kerb ring at a grid crossing the route never visits.
  L.roundabout = { pos: [C.streetsX[2], 0, C.streetsZ[2]], radius: 4.5 };

  // --- crossing stripes (item 3.4): at the two route intersections only ------
  for (const ix of routeIntersections) {
    const half = C.street / 2 - 1.2;
    L.crossings.push({ pos: [ix.x, 0, ix.z - half - 0.6], size: [C.street - 2, 1.4], rotY: 0 });
    L.crossings.push({ pos: [ix.x, 0, ix.z + half + 0.6], size: [C.street - 2, 1.4], rotY: 0 });
    L.crossings.push({ pos: [ix.x - half - 0.6, 0, ix.z], size: [1.4, C.street - 2], rotY: 0 });
    L.crossings.push({ pos: [ix.x + half + 0.6, 0, ix.z], size: [1.4, C.street - 2], rotY: 0 });
  }
  for (let z = -K.halfZ + 6; z <= K.halfZ - 6; z += 12) {
    for (const s of [-1, 1]) L.lamps.push({ pos: [s * (K.halfX - 0.6), roofY, z], height: 5.5 });
  }
  for (const lp of L.lamps) {
    L.walls.push({ kind: 'lamp', floor: K.floors, box: { c: [lp.pos[0], lp.pos[1] + lp.height / 2, lp.pos[2]], s: [0.25, lp.height, 0.25] } });
  }
  L.barrier = { pos: [K.entrance[0] - 1.3, 0, K.halfZ + 0.6], armLength: K.entrance[1] - K.entrance[0] - 0.4, raised: true, booth: { c: [K.entrance[0] - 2.4, 1.2, K.halfZ + 1.8], s: [1.8, 2.4, 1.6] } };
  L.walls.push({ kind: 'booth', floor: 0, box: L.barrier.booth });

  L.checks = checkLayout(L);
  return L;
}

// ============================================================================
// Route: waypoints with fillet radii -> sampled rear-axle path with y
// ============================================================================
export const headingDir = (h) => [-Math.sin(h), -Math.cos(h)];
const headingOf = (dx, dz) => Math.atan2(-dx, -dz);

function buildRoute(wp, surface) {
  // Fillet each interior corner.
  const segs = [];
  let cur = [wp[0][0], wp[0][1]];
  for (let i = 1; i < wp.length; i++) {
    const [x, z, r] = wp[i];
    const next = wp[i + 1];
    if (!next || !r) {
      segs.push({ type: 'line', a: cur, b: [x, z], floorHint: wp[i][3] });
      cur = [x, z];
      continue;
    }
    const d1 = norm([x - cur[0], z - cur[1]]);
    const d2 = norm([next[0] - x, next[1] - z]);
    const turn = Math.acos(Math.max(-1, Math.min(1, d1[0] * d2[0] + d1[1] * d2[1])));
    const tlen = r * Math.tan(turn / 2);
    const p1 = [x - d1[0] * tlen, z - d1[1] * tlen];
    const p2 = [x + d2[0] * tlen, z + d2[1] * tlen];
    segs.push({ type: 'line', a: cur, b: p1, floorHint: wp[i][3] });
    // The centre lies from p1 toward the outgoing direction, perpendicular to the incoming one.
    const dot = d1[0] * d2[0] + d1[1] * d2[1];
    const n = norm([d2[0] - d1[0] * dot, d2[1] - d1[1] * dot]);
    const centre = [p1[0] + n[0] * r, p1[1] + n[1] * r];
    segs.push({ type: 'arc', a: p1, b: p2, centre, r, turn, floorHint: wp[i][3] });
    cur = p2;
  }
  // Sample every 0.25 m.
  const pts = [];
  let s = 0;
  let prevY = 0;
  const step = 0.25;
  for (const g of segs) {
    if (g.type === 'line') {
      const len = Math.hypot(g.b[0] - g.a[0], g.b[1] - g.a[1]);
      const h = headingOf(g.b[0] - g.a[0], g.b[1] - g.a[1]);
      const n = Math.max(1, Math.ceil(len / step));
      for (let i = pts.length ? 1 : 0; i <= n; i++) {
        const u = i / n;
        const x = g.a[0] + (g.b[0] - g.a[0]) * u;
        const z = g.a[1] + (g.b[1] - g.a[1]) * u;
        const y = surface(x, z, prevY);
        pts.push({ x, z, y, heading: h, s: s + len * u, radius: Infinity });
        prevY = y;
      }
      s += len;
    } else {
      const a0 = Math.atan2(g.a[1] - g.centre[1], g.a[0] - g.centre[0]);
      const a1 = Math.atan2(g.b[1] - g.centre[1], g.b[0] - g.centre[0]);
      let da = a1 - a0;
      while (da > Math.PI) da -= TAU;
      while (da < -Math.PI) da += TAU;
      const len = Math.abs(da) * g.r;
      const n = Math.max(2, Math.ceil(len / step));
      for (let i = 1; i <= n; i++) {
        const ang = a0 + (da * i) / n;
        const x = g.centre[0] + Math.cos(ang) * g.r;
        const z = g.centre[1] + Math.sin(ang) * g.r;
        // Tangent: derivative of the arc in the direction of travel.
        const tx = -Math.sin(ang) * Math.sign(da);
        const tz = Math.cos(ang) * Math.sign(da);
        const y = surface(x, z, prevY);
        pts.push({ x, z, y, heading: headingOf(tx, tz), s: s + (len * i) / n, radius: g.r });
        prevY = y;
      }
      s += len;
    }
  }
  return { waypoints: wp, segments: segs, points: pts, length: s };
}

/**
 * Nearest route point to (x, z), restricted to points whose y is within
 * `yTol` of `y`. Stacked floors overlap in plan view (SPEC-level13.md §5.8/
 * §5.9), so a plan-only nearest-point search would snap the HUD distance
 * chip or autodrive's pure-pursuit target onto the wrong floor's stretch of
 * route whenever two floors' routes happen to cross in x/z. Used by both the
 * game (HUD distance chip) and tools/autodrive.mjs.
 */
export function nearestRoutePoint(points, x, z, y, yTol = 1.5) {
  let best = null;
  let bestD = Infinity;
  for (const p of points) {
    if (Math.abs(p.y - y) > yTol) continue;
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

const norm = (v) => {
  const l = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / l, v[1] / l];
};

/**
 * Drivable surface height at (x, z): the highest floor or ramp surface that is
 * not more than 0.6 m above prevY (so a car on a lower floor doesn't snap up
 * onto the slab above it).
 */
export function surfaceAt(L, x, z, prevY = 0) {
  const cands = [];
  // Ramps.
  for (const r of L.ramps) {
    if (x < r.x0 - 1e-6 || x > r.x1 + 1e-6) continue;
    const zmin = Math.min(r.lowZ, r.highZ);
    const zmax = Math.max(r.lowZ, r.highZ);
    if (z < zmin || z > zmax) continue;
    const d = Math.abs(z - r.lowZ);
    cands.push(r.from * L.params.park.storey + riseAt(L.params, d));
  }
  // Slabs (car park floors).
  for (const s of L.slabs) {
    if (s.rects.some(([x0, z0, x1, z1]) => x >= x0 && x <= x1 && z >= z0 && z <= z1)) cands.push(s.y);
  }
  cands.push(0); // streets and the ground
  const ok = cands.filter((y) => y <= prevY + 0.6);
  return ok.length ? Math.max(...ok) : 0;
}

// ============================================================================
// Checks (the future tools/city-lint.mjs)
// ============================================================================
export const RULES = {
  maxGrade: 0.12,
  maxGradeChange: 0.061,
  headroom: 2.3,
  rampWidth: 4.0,
  landing: 8.0,
  routeClearance: 0.6,
  minRadius: 3.56,
  doorGap: 0.77,
  spawnClearance: 0.6,
  speeds: { street: 20 / 3.6, park: 9 / 3.6, ramp: 11 / 3.6 },
  perTurnSeconds: 1.5,
  parkingSeconds: 25,
};

export function checkLayout(L) {
  const out = [];
  const add = (id, label, value, limit, ok, detail = '') => out.push({ id, label, value, limit, ok, detail });
  const K = L.params.park;

  // Grades.
  let maxG = 0;
  let maxDG = 0;
  for (const r of L.ramps) {
    let prev = 0;
    for (const p of r.pieces) {
      maxG = Math.max(maxG, p.grade);
      maxDG = Math.max(maxDG, Math.abs(p.grade - prev));
      prev = p.grade;
    }
    maxDG = Math.max(maxDG, prev);
  }
  add('grade', 'Steepest ramp grade', `${(maxG * 100).toFixed(1)} %`, `≤ ${RULES.maxGrade * 100} %`, maxG <= RULES.maxGrade + 1e-9, 'measured: 8–20 % all climb, hold and crest cleanly (ramp-probe)');
  add('gradeChange', 'Largest grade change at a break', `${(maxDG * 100).toFixed(1)} %`, `≤ ${(RULES.maxGradeChange * 100).toFixed(1)} %`, maxDG <= RULES.maxGradeChange + 1e-9, 'no chassis contact at 6 % breaks up to a 20 % ramp');

  // Ramp width.
  const minW = Math.min(...L.ramps.map((r) => r.x1 - r.x0));
  add('rampWidth', 'Narrowest ramp (between walls)', `${minW.toFixed(2)} m`, `≥ ${RULES.rampWidth} m`, minW >= RULES.rampWidth - 1e-9);

  // Landings: flat floor from a ramp's high end to the wall it faces.
  let minLanding = Infinity;
  for (const r of L.ramps) {
    const wallZ = r.dir === 'north' ? -K.halfZ + 0.3 : K.halfZ - 0.3;
    minLanding = Math.min(minLanding, Math.abs(wallZ - r.highZ));
  }
  add('landing', 'Shortest landing beyond a ramp', `${minLanding.toFixed(2)} m`, `≥ ${RULES.landing} m`, minLanding >= RULES.landing - 1e-9);

  // Turning radius.
  const minR = Math.min(...L.route.points.map((p) => p.radius));
  add('radius', 'Tightest route turn (rear axle)', `${minR.toFixed(2)} m`, `≥ ${RULES.minRadius} m`, minR >= RULES.minRadius - 1e-9);

  // Headroom and clearance along the route.
  let minHead = Infinity;
  let headAt = null;
  let minClear = Infinity;
  let clearAt = null;
  const colliders = L.walls.filter((w) => w.kind !== 'boundary' || true);
  const targetS = L.route.length - 7; // the final approach into the bay is judged by the door-gap rule instead
  for (const p of L.route.points) {
    if (p.y > 0.05 || insidePark(L, p.x, p.z)) {
      const hr = headroomAt(L, p);
      if (hr < minHead) {
        minHead = hr;
        headAt = p;
      }
    }
    if (p.s > targetS) continue;
    const fp = carFootprint(p);
    for (const w of colliders) {
      const b = w.box;
      const yb = boxYRange(b);
      if (yb[1] < p.y + 0.15 || yb[0] > p.y + CAR.height) continue;
      const d = polyDistance(fp, boxFootprint(b));
      if (d < minClear) {
        minClear = d;
        clearAt = { p, kind: w.kind };
      }
    }
  }
  add('headroom', 'Lowest headroom on the route', `${minHead.toFixed(2)} m`, `≥ ${RULES.headroom} m`, minHead >= RULES.headroom - 1e-9, headAt ? `at x ${headAt.x.toFixed(1)}, z ${headAt.z.toFixed(1)}, y ${headAt.y.toFixed(2)}` : '');
  add('clearance', 'Swept path clearance to anything solid', `${minClear.toFixed(2)} m`, `≥ ${RULES.routeClearance} m`, minClear >= RULES.routeClearance - 1e-9, clearAt ? `${clearAt.kind} near x ${clearAt.p.x.toFixed(1)}, z ${clearAt.p.z.toFixed(1)} (floor y ${clearAt.p.y.toFixed(1)})` : '');

  // Target door gaps.
  const t = L.target;
  const neighbours = L.parkedCars.filter((c) => c.floor === t.floor && Math.abs(c.pos[0] - t.pos[0]) < 0.1 && Math.abs(Math.abs(c.pos[2] - t.pos[1]) - K.bayPitch) < 0.01);
  const gap = K.bayPitch - CAR.width;
  add('doorGap', 'Door gap beside the target', `${gap.toFixed(2)} m × ${neighbours.length}`, `≥ ${RULES.doorGap} m, 2 neighbours`, gap >= RULES.doorGap - 1e-9 && neighbours.length === 2);

  // Spawn.
  const sp = { x: L.spawn.pos[0] - headingDir(L.spawn.heading)[0] * CAR.wheelbase / 2, z: L.spawn.pos[1] - headingDir(L.spawn.heading)[1] * CAR.wheelbase / 2, heading: L.spawn.heading, y: 0 };
  let spawnClear = Infinity;
  for (const w of L.walls) {
    if (boxYRange(w.box)[0] > 1.5) continue;
    spawnClear = Math.min(spawnClear, polyDistance(carFootprint(sp), boxFootprint(w.box)));
  }
  add('spawn', 'Spawn clear of anything solid', `${spawnClear.toFixed(2)} m`, `≥ ${RULES.spawnClearance} m`, spawnClear >= RULES.spawnClearance);

  // Route length and time.
  let time = RULES.parkingSeconds;
  let turns = 0;
  let prev = null;
  let prevRadius = Infinity;
  for (const p of L.route.points) {
    if (prev) {
      const ds = p.s - prev.s;
      const v = p.y > 0.05 && Math.abs(p.y - prev.y) > 1e-4 ? RULES.speeds.ramp : insidePark(L, p.x, p.z) ? RULES.speeds.park : RULES.speeds.street;
      time += ds / v;
    }
    if (p.radius < Infinity && prevRadius === Infinity) turns++;
    prevRadius = p.radius;
    prev = p;
  }
  time += turns * RULES.perTurnSeconds;
  add('route', 'Route length and estimated drive', `${L.route.length.toFixed(0)} m · ${time.toFixed(0)} s`, `par ${L.parTime} s`, time <= L.parTime, `${turns} turns`);
  L.estimate = { seconds: Math.round(time), turns, metres: Math.round(L.route.length) };

  // City atmosphere (GOAL-city-polish.md item 3): every real street x street
  // crossing the route passes through must have a traffic-light control near
  // it — an intersection with signage but no signal reads as an oversight,
  // not a design choice.
  const C = L.params.city;
  const gridIntersections = [];
  for (const x of C.streetsX) for (const z of C.streetsZ) gridIntersections.push({ x, z });
  const nearAnIntersection = (p, tol) => gridIntersections.some((g) => Math.abs(g.x - p.x) < tol && Math.abs(g.z - p.z) < tol);
  const routeCrossesIntersection = (g) => L.route.points.some((p) => Math.abs(p.x - g.x) < C.street && Math.abs(p.z - g.z) < C.street && p.y < 0.05);
  const routeGridIntersections = gridIntersections.filter(routeCrossesIntersection);
  const uncontrolled = routeGridIntersections.filter((g) => !L.trafficLights.some((tl) => nearAnIntersection({ x: tl.pos[0], z: tl.pos[2] }, C.street)));
  add(
    'trafficControl',
    'Route intersections with a traffic-light control',
    `${routeGridIntersections.length - uncontrolled.length} / ${routeGridIntersections.length}`,
    'all',
    uncontrolled.length === 0 && routeGridIntersections.length > 0
  );
  return out;
}

function insidePark(L, x, z) {
  const K = L.params.park;
  return Math.abs(x) <= K.halfX && Math.abs(z) <= K.halfZ;
}

/**
 * Headroom over a car at route point p: for the four body corners and the
 * body centre, the gap from the surface under that point up to the underside
 * of the lowest slab above it. The corners matter: on a ramp the nose is
 * higher than the rear axle, and a slab edge ahead is overhead before the axle
 * gets there.
 */
export function headroomAt(L, p) {
  const fp = carFootprint(p);
  const [fx, fz] = headingDir(p.heading);
  const mid = [p.x + fx * (CAR.wheelbase / 2), p.z + fz * (CAR.wheelbase / 2)];
  let best = Infinity;
  for (const [x, z] of [...fp, mid]) {
    const y = surfaceAt(L, x, z, p.y + 0.3);
    for (const s of L.slabs) {
      if (s.thick <= 0) continue;
      const under = s.y - s.thick;
      if (under <= y + 0.01) continue;
      if (s.rects.some(([x0, z0, x1, z1]) => x >= x0 && x <= x1 && z >= z0 && z <= z1)) best = Math.min(best, under - y);
    }
  }
  return best;
}

export function carFootprint(p) {
  // p is the rear axle; the body runs from -overhang to wheelbase + overhang along the nose.
  const [fx, fz] = headingDir(p.heading);
  const rx = -fz;
  const rz = fx;
  const back = -CAR.overhang;
  const front = CAR.wheelbase + CAR.overhang;
  const w = CAR.width / 2;
  return [
    [p.x + fx * back - rx * w, p.z + fz * back - rz * w],
    [p.x + fx * front - rx * w, p.z + fz * front - rz * w],
    [p.x + fx * front + rx * w, p.z + fz * front + rz * w],
    [p.x + fx * back + rx * w, p.z + fz * back + rz * w],
  ];
}

export function boxFootprint(b) {
  const r = b.rotY ?? 0;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const hx = b.s[0] / 2;
  // A pitched box's plan length shrinks by cos(pitch).
  const hz = (b.s[2] / 2) * Math.cos(b.pitch ?? 0);
  return [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([x, z]) => [b.c[0] + x * c + z * s, b.c[2] - x * s + z * c]);
}

export function boxYRange(b) {
  const p = Math.abs(b.pitch ?? 0);
  const hy = (b.s[1] / 2) * Math.cos(p) + (b.s[2] / 2) * Math.sin(p);
  return [b.c[1] - hy, b.c[1] + hy];
}

/** Distance between two convex polygons (0 if they overlap). */
export function polyDistance(A, B) {
  if (polysOverlap(A, B)) return 0;
  let d = Infinity;
  for (const p of A) d = Math.min(d, pointPolyDist(p, B));
  for (const p of B) d = Math.min(d, pointPolyDist(p, A));
  return d;
}
function polysOverlap(A, B) {
  for (const poly of [A, B]) {
    for (let i = 0; i < poly.length; i++) {
      const [x1, z1] = poly[i];
      const [x2, z2] = poly[(i + 1) % poly.length];
      const nx = z2 - z1;
      const nz = x1 - x2;
      let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
      for (const [x, z] of A) { const v = x * nx + z * nz; aMin = Math.min(aMin, v); aMax = Math.max(aMax, v); }
      for (const [x, z] of B) { const v = x * nx + z * nz; bMin = Math.min(bMin, v); bMax = Math.max(bMax, v); }
      if (aMax < bMin || bMax < aMin) return false;
    }
  }
  return true;
}
function pointPolyDist([px, pz], poly) {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [x1, z1] = poly[i];
    const [x2, z2] = poly[(i + 1) % poly.length];
    const dx = x2 - x1;
    const dz = z2 - z1;
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (pz - z1) * dz) / (dx * dx + dz * dz || 1)));
    d = Math.min(d, Math.hypot(px - (x1 + dx * t), pz - (z1 + dz * t)));
  }
  return d;
}

/** Rectangle minus a rectangle, as up to four rectangles [x0, z0, x1, z1]. */
function subtractRect([ax0, az0, ax1, az1], [bx0, bz0, bx1, bz1]) {
  const out = [];
  if (bz0 > az0) out.push([ax0, az0, ax1, Math.min(bz0, az1)]);
  if (bz1 < az1) out.push([ax0, Math.max(bz1, az0), ax1, az1]);
  const z0 = Math.max(az0, bz0);
  const z1 = Math.min(az1, bz1);
  if (z1 > z0) {
    if (bx0 > ax0) out.push([ax0, z0, Math.min(bx0, ax1), z1]);
    if (bx1 < ax1) out.push([Math.max(bx1, ax0), z0, ax1, z1]);
  }
  return out;
}

function mergeDeep(base, over) {
  for (const k of Object.keys(over ?? {})) {
    if (over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]) && base[k] && typeof base[k] === 'object') mergeDeep(base[k], over[k]);
    else base[k] = over[k];
  }
  return base;
}
