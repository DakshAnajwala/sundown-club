/**
 * Levels.js — the hand-authored lots, as pure data.
 *
 * Ids are stable and do NOT match play order: levels added after the first
 * twelve keep their own ids so saved progress and leaderboard rows stay
 * attached to the right level. Order in this array is the order they are
 * played; `id` is identity. Nothing may assume `id === index + 1`.
 *
 * ----------------------------- CONVENTIONS ---------------------------------
 * Positions are [x, z] on the lot floor; the builder supplies y.
 * `heading` is a yaw in radians. The car's nose points along local -Z, so:
 *      heading 0      nose points -Z  (call it north, up the lot)
 *      heading PI     nose points +Z  (south)
 *      heading +PI/2  nose points -X  (west)
 *      heading -PI/2  nose points +X  (east)
 *
 * ------------------------- LOAD-BEARING CLEARANCES -------------------------
 * These are not decoration. The car is 4.20 x 1.78 m and its measured turning
 * radius at full 42-degree lock is 3.56 m (tools/physics-probe.mjs). v1
 * shipped a level that was mathematically impossible to complete because two
 * parked cars left a 3.4 m gap for a 4.2 m car, so:
 *
 *   - Bay row standoff: bays sit 0.5 m off the wall, i.e. centred at
 *     -halfDepth + 3.2 for a 5.4 m bay. Any closer and the parked cars
 *     intersect the perimeter pilasters, which protrude ~0.55 m.
 *   - Bay-to-bay pitch: >= 2.55 m, giving >= 0.77 m of door gap either side
 *     of a 1.78 m car. Level 1 uses a roomy 3.0; level 5 uses the 2.55 floor.
 *   - Parallel gap: the clear space between the two flanking cars' bumpers is
 *     6.2 m minimum for a 4.2 m car (2.0 m of slack). Level 3 gives 7.0.
 *   - Aisle depth: >= 7.5 m of clear floor in front of any bay mouth, since a
 *     reverse-in needs roughly 2x the turning radius to swing through.
 *
 * If you move a parked car, re-check the number above that it belongs to.
 * `node tools/level-lint.mjs` checks all of these in plan view.
 *
 * ------------------------------ BAY HEADING ---------------------------------
 * A painted bay has a closed head and an open mouth; its markings are drawn
 * with the head at local -Z. `target.heading` is where the CAR's nose points
 * when parked, which is NOT the same thing for a reverse park: backed in, the
 * nose points out of the mouth. So targets carry `bayHeading` (defaults to
 * `heading`) and bay rows carry their own `heading`, both meaning "rotation of
 * the markings". Levels 2 and 4 originally rotated their bays by the car's
 * heading and painted every U with its open end against the wall.
 */

import { buildLayout } from '../../design/level13/layout-model.mjs';

const DEG = Math.PI / 180;

// Level 13's layout is generated data (design/level13/layout-model.mjs is the
// source of truth — see design/SPEC-level13.md), not hand-typed like the
// hand-authored lots above. Built once at module load, not per level-load: it is
// deterministic and building it does the same route/clearance math build-
// layout.mjs already validated (checkLayout ran here would just repeat that).
const CITY13 = buildLayout();

/** Standard bay footprint. */
const BAY = { width: 3.0, length: 5.4 };
/** Kerbside parallel space footprint (length runs along the kerb). */
const PARALLEL = { width: 2.7, length: 7.2 };

/**
 * A run of parked cars in a bay row.
 * @param {number[]} xs      bay centre x positions
 * @param {number}   z       row centre line
 * @param {number}   heading which way the parked cars face
 * @param {number}   seed    offsets the paint sequence so rows differ
 */
function row(xs, z, heading, seed = 0) {
  return xs.map((x, i) => ({ pos: [x, z], heading, paint: seed + i }));
}

export const LEVELS = [
  // ==========================================================================
  {
    id: 1,
    name: 'Deck One',
    subtitle: 'Forward pull-in',
    maneuver: 'pull-in',
    style: 'open',
    lot: { width: 40, depth: 34, ceilingHeight: 3.3 },
    hint: 'Drive up the aisle and pull straight into the glowing bay.',
    parTime: 40,

    // Nose-first, straight ahead: the gentlest possible introduction.
    spawn: { pos: [-6, 8.5], heading: 0 },
    target: {
      pos: [4, -13.8],
      heading: 0,
      bay: BAY,
      style: 'bay',
      tolerance: { pos: 0.62, headingDeg: 12 },
    },

    // Empty painted bays either side of the target, so the row reads as a row.
    bayRow: { xs: [-11, -8, -5, -2, 1, 4, 7, 10, 13], z: -13.8, heading: 0 },
    southRow: { xs: [-13, -10, -7, 8, 11, 14], z: 13.8, heading: Math.PI },

    // Flanking cars at +/-3.0 m from the target: 1.22 m of clear door gap.
    cars: [
      ...row([1, 7], -13.8, 0, 0),
      ...row([-11, -8, -5], -13.8, 0, 3),
      ...row([-13, -10, 11, 14], 13.8, Math.PI, 2),
    ],
    pillars: [
      { pos: [-15, -2], size: [0.7, 0.7] },
      { pos: [15, -2], size: [0.7, 0.7] },
    ],
    walls: [],
    cones: [
      { pos: [-2.5, -5.5] },
      { pos: [9.5, 1.5] },
      { pos: [-9, 4] },
    ],
    arrows: [{ pos: [-6, 1], heading: 0 }],
    kerbs: [],
  },

  // ==========================================================================
  {
    id: 2,
    name: 'Deck Two',
    subtitle: 'Reverse bay park',
    maneuver: 'reverse',
    style: 'open',
    lot: { width: 40, depth: 34, ceilingHeight: 3.3 },
    hint: 'Pull past the bay, shift to R and back in. The dash screen wakes up in reverse.',
    parTime: 60,

    // Starts alongside the row, facing west, exactly as you would arrive
    // having just driven down the aisle. Bay mouth is at z = -11.1, the lane
    // is at z = -6.5, so there is 4.6 m to the mouth and 23 m of swing room
    // behind — comfortably more than the 7.5 m minimum.
    spawn: { pos: [10, -6.5], heading: 90 * DEG },
    target: {
      pos: [-2, -13.8],
      heading: Math.PI, // backed in: nose points back out of the bay
      bayHeading: 0, // ...but the bay itself still opens south, onto the aisle
      bay: BAY,
      style: 'bay',
      tolerance: { pos: 0.58, headingDeg: 11 },
    },

    bayRow: { xs: [-14, -11, -8, -5, -2, 1, 4, 7, 10, 13], z: -13.8, heading: 0 },
    southRow: { xs: [-14, -11, -8, 8, 11, 14], z: 13.8, heading: Math.PI },

    cars: [
      ...row([-5, 1], -13.8, Math.PI, 1), // the two flanking the target
      ...row([-14, -11, 7, 10, 13], -13.8, Math.PI, 4),
      ...row([-14, -11, 11, 14], 13.8, Math.PI, 6),
    ],
    pillars: [
      { pos: [-14, 1.5], size: [0.7, 0.7] },
      { pos: [14, 1.5], size: [0.7, 0.7] },
      { pos: [0, 6.5], size: [0.7, 0.7] },
    ],
    // A stair core: a solid block, the sort of thing that blocks your mirror
    // view on the way past.
    walls: [{ pos: [16, -9], size: [5, 3.2], height: 3.3 }],
    cones: [
      { pos: [-4.9, -10.4] }, // marking the mouth of the target bay
      { pos: [0.9, -10.4] },
      { pos: [6, -3] },
    ],
    arrows: [{ pos: [7, -6.5], heading: 90 * DEG }],
    kerbs: [],
  },

  // ==========================================================================
  {
    id: 3,
    name: 'Deck Three',
    subtitle: 'Parallel, kerbside',
    maneuver: 'parallel',
    style: 'open',
    lot: { width: 44, depth: 26, ceilingHeight: 3.3 },
    hint: 'Kerb is on your right. Pull alongside the front car, then reverse in.',
    parTime: 80,

    // Facing west with the kerb to the north puts it on the passenger side —
    // the ordinary way round. Level 5 mirrors it onto the driver's side.
    spawn: { pos: [15, -6.6], heading: 90 * DEG },
    target: {
      pos: [0, -10.9],
      heading: 90 * DEG,
      bay: PARALLEL,
      style: 'parallel',
      tolerance: { pos: 0.6, headingDeg: 12 },
    },

    // Flanking cars at +/-5.6 leave 11.2 - 4.2 = 7.0 m of clear kerb for a
    // 4.2 m car. The row sits 0.3 m off the kerb face: the kerb IS a collider,
    // and the bay tolerance is 0.6 m, so a car parked at the northern edge of
    // tolerance must still not be inside it.
    cars: [
      { pos: [-5.6, -10.9], heading: 90 * DEG, paint: 2 },
      { pos: [5.6, -10.9], heading: 90 * DEG, paint: 5 },
      { pos: [-11.2, -10.9], heading: 90 * DEG, paint: 0 },
      { pos: [11.2, -10.9], heading: 90 * DEG, paint: 7 },
      ...row([-16, -13, -10, 10, 13, 16], 9.8, Math.PI, 3),
    ],
    southRow: { xs: [-16, -13, -10, -7, 7, 10, 13, 16], z: 9.8, heading: Math.PI },
    pillars: [
      { pos: [-18, -2], size: [0.7, 0.7] },
      { pos: [18, 2], size: [0.7, 0.7] },
      { pos: [0, 1.5], size: [0.7, 0.7] },
    ],
    walls: [],
    cones: [{ pos: [-8.4, -8.6] }, { pos: [8.4, -8.6] }, { pos: [-14, -4] }],
    arrows: [{ pos: [11, -6.6], heading: 90 * DEG }],
    // Kerb face at z = -12.09, which clears the north pilasters (they protrude
    // to -12.445) without leaving a visible gap behind it.
    kerbs: [{ pos: [0, -12.25], length: 44, rotY: 90 * DEG }],
  },

  // ==========================================================================
  {
    id: 4,
    name: 'Level B1',
    subtitle: 'Reverse bay, tight',
    maneuver: 'reverse',
    style: 'underground',
    lot: { width: 36, depth: 30, ceilingHeight: 2.75 },
    hint: 'Underground and full. 0.97 m of door gap either side — use the camera.',
    parTime: 85,

    // Bay row at -11.8, mouth at -9.1, lane at -5.5: 3.6 m to the mouth and
    // 20 m behind. Pitch drops to 2.75 m, so the gap is 0.97 m per side.
    spawn: { pos: [9, -5.5], heading: 90 * DEG },
    target: {
      pos: [-3.25, -11.8],
      heading: Math.PI,
      bayHeading: 0,
      bay: { width: 2.75, length: 5.4 },
      style: 'bay',
      tolerance: { pos: 0.5, headingDeg: 10 },
    },

    // Uniform 2.75 m pitch across the row, so the target's neighbours are the
    // same distance away on both sides.
    bayRow: {
      xs: [-11.5, -8.75, -6, -3.25, -0.5, 2.25, 5, 7.75, 10.5],
      z: -11.8,
      heading: 0,
      width: 2.75,
    },
    southRow: { xs: [-11, -8, -5, 5, 8, 11], z: 11.8, heading: Math.PI },

    cars: [
      ...row([-6, -0.5], -11.8, Math.PI, 2), // flanking the target
      ...row([-11.5, -8.75, 2.25, 5, 7.75, 10.5], -11.8, Math.PI, 4),
      ...row([-11, -8, 8, 11], 11.8, Math.PI, 1),
    ],
    // Interior columns kept back to z = -1.5, leaving 7.6 m of clear aisle in
    // front of the bay mouth for the reverse swing.
    pillars: [
      { pos: [2, -1.5], size: [0.8, 0.8] },
      { pos: [-8, -1.5], size: [0.8, 0.8] },
      { pos: [12, 4], size: [0.8, 0.8] },
      { pos: [-14, 5], size: [0.8, 0.8] },
    ],
    walls: [{ pos: [14, -9], size: [4.5, 3], height: 2.75 }],
    cones: [
      { pos: [-4.85, -8.4] },
      { pos: [-1.65, -8.4] },
      { pos: [4, -4] },
      { pos: [-10, -4] },
    ],
    arrows: [{ pos: [6, -5.5], heading: 90 * DEG }],
    kerbs: [],
  },

  // ==========================================================================
  {
    id: 5,
    name: 'Level B2',
    subtitle: 'Parallel, driver side',
    maneuver: 'parallel',
    style: 'underground',
    lot: { width: 38, depth: 24, ceilingHeight: 2.75 },
    hint: 'Kerb on your left this time. 6.2 m of space for a 4.2 m car — lean out with Q.',
    parTime: 100,

    // Facing east with the kerb to the north: the kerb is now on the driver's
    // side, which is what makes the Q lean-out worth using.
    spawn: { pos: [-15, -6.4], heading: -90 * DEG },
    target: {
      pos: [0, -9.75],
      heading: -90 * DEG,
      bay: PARALLEL,
      style: 'parallel',
      tolerance: { pos: 0.52, headingDeg: 10 },
    },

    // +/-5.2 m: 10.4 - 4.2 = 6.2 m clear. This is the tightest space in the
    // game and sits exactly on the stated minimum.
    cars: [
      { pos: [-5.2, -9.75], heading: -90 * DEG, paint: 6 },
      { pos: [5.2, -9.75], heading: -90 * DEG, paint: 3 },
      { pos: [-10.4, -9.75], heading: -90 * DEG, paint: 1 },
      { pos: [10.4, -9.75], heading: -90 * DEG, paint: 4 },
      ...row([-13, -10, -7, 7, 10, 13], 8.8, Math.PI, 5),
    ],
    southRow: { xs: [-13, -10, -7, -4, 4, 7, 10, 13], z: 8.8, heading: Math.PI },
    pillars: [
      { pos: [-6, -1.5], size: [0.8, 0.8] },
      { pos: [7, -1.5], size: [0.8, 0.8] },
      { pos: [-15, 3], size: [0.8, 0.8] },
      { pos: [15, 3], size: [0.8, 0.8] },
    ],
    walls: [],
    cones: [
      { pos: [-8, -7.6] },
      { pos: [8, -7.6] },
      { pos: [0, -6.2] },
      { pos: [-12, -3] },
      { pos: [12, -3] },
    ],
    arrows: [{ pos: [-11, -6.4], heading: -90 * DEG }],
    // Kerb face at z = -11.09, clear of the north pilasters (-11.445) and
    // 0.45 m off the parked row.
    kerbs: [{ pos: [0, -11.25], length: 38, rotY: 90 * DEG }],
  },

  // ==========================================================================
  {
    id: 6,
    name: 'Deck Four',
    subtitle: 'Echelon bay',
    maneuver: 'angled',
    style: 'open',
    lot: { width: 40, depth: 34, ceilingHeight: 3.3 },
    hint: 'Echelon bays are angled for one-way traffic. Drive east and swing left into the glowing bay.',
    parTime: 45,

    // Driving east (heading -PI/2) and turning LEFT by 45 degrees leaves the
    // nose pointing north-east: heading -PI/4. The bay's mouth is then at its
    // south-west end, facing the approach.
    spawn: { pos: [-15.5, -7.5], heading: -90 * DEG },
    target: {
      pos: [-0.77, -13.2],
      heading: -45 * DEG,
      bay: BAY,
      style: 'bay',
      tolerance: { pos: 0.6, headingDeg: 12 },
    },

    // Echelon row. Bays are 3.0 m wide measured square to the bay, so along the
    // wall they step 3.0 / cos(45) = 4.243 m. In a bay's own frame its
    // neighbour sits 3.0 m to the side and 3.0 m further in: 1.22 m of door gap.
    // At z = -13.2 the bays' northmost paint corner is at -16.17, clear of the
    // pilasters (-16.445), and a parked car's nose corner at -15.31.
    bayRow: {
      bays: [-13.5, -9.257, -5.014, -0.771, 3.472, 7.715, 11.958].map((x) => [x, -13.2]),
      heading: -45 * DEG,
    },
    southRow: { xs: [-13, -10, -7, 8, 11, 14], z: 13.8, heading: Math.PI },

    cars: [
      { pos: [-13.5, -13.2], heading: -45 * DEG, paint: 1 },
      { pos: [-9.257, -13.2], heading: -45 * DEG, paint: 4 },
      { pos: [-5.014, -13.2], heading: -45 * DEG, paint: 6 }, // flanking
      { pos: [3.472, -13.2], heading: -45 * DEG, paint: 2 }, // flanking
      { pos: [11.958, -13.2], heading: -45 * DEG, paint: 7 },
      ...row([-13, -7, 11], 13.8, Math.PI, 3),
    ],
    pillars: [
      { pos: [-15, -2], size: [0.7, 0.7] },
      { pos: [15, -2], size: [0.7, 0.7] },
      { pos: [0, 4], size: [0.7, 0.7] },
    ],
    walls: [],
    cones: [{ pos: [-9, -3.5] }, { pos: [7, -4] }, { pos: [9.5, 6] }],
    arrows: [
      { pos: [-11, -7.5], heading: -90 * DEG },
      { pos: [6, -7.5], heading: -90 * DEG },
    ],
    kerbs: [],
  },

  // ==========================================================================
  {
    id: 14,
    name: 'Deck Five',
    subtitle: 'Service lane',
    maneuver: 'three-point',
    style: 'open',
    lot: { width: 30, depth: 44, ceilingHeight: 3.3 },
    hint: 'A dead end, and no room to swing round. Back-and-forth until you face the way out, then stop in the box.',
    parTime: 65,

    // Same 7.8 m lane as Roof One — rows at +/-6.0 put their lane-side bumpers
    // at +/-3.9, and the measured kerb-to-kerb circle is ~8.9 m, so a U-turn
    // cannot fit. The difference here is the direction: you start at the
    // closed end facing IN, so the turn has to happen at the tight end of the
    // lane rather than in open floor.
    spawn: { pos: [0, -15], heading: Math.PI },
    target: {
      pos: [0, 13],
      heading: 0,
      bay: BAY,
      style: 'box',
      tolerance: { pos: 0.6, headingDeg: 12 },
    },

    extraRows: [
      { bays: rowZs().map((z) => [-6.0, z]), heading: 90 * DEG },
      { bays: rowZs().map((z) => [6.0, z]), heading: -90 * DEG },
    ],
    cars: [
      ...rowZs()
        .filter((z) => z > -18 && z !== 12.5)
        .map((z, i) => ({ pos: [-6.0, z], heading: 90 * DEG, paint: i + 2 })),
      ...rowZs()
        .filter((z) => z > -15 && z !== 12.5 && z !== 9.5)
        .map((z, i) => ({ pos: [6.0, z], heading: -90 * DEG, paint: i + 5 })),
    ],
    pillars: [],
    walls: [],
    cones: [{ pos: [0, -19] }],
    arrows: [{ pos: [0, -10], heading: Math.PI }],
    kerbs: [],
  },

  // ==========================================================================
  {
    id: 7,
    name: 'Level B3',
    subtitle: 'Pillar slalom',
    maneuver: 'pull-in',
    style: 'underground',
    lot: { width: 36, depth: 30, ceilingHeight: 2.75 },
    hint: 'Weave the three pillars — north, south, north — then pull into the far bay. Cones mark the wrong side.',
    parTime: 75,

    spawn: { pos: [-14.5, -1.5], heading: -90 * DEG },
    target: {
      pos: [12, -11.8],
      heading: 0,
      bay: BAY,
      style: 'bay',
      tolerance: { pos: 0.6, headingDeg: 11 },
    },

    // Row at the standard -halfDepth + 3.2. The target has a pilaster dead
    // ahead of it (nose clearance 0.545 m, same as level 4).
    bayRow: { xs: [-12, -9, -6, -3, 0, 3, 6, 9, 12, 15], z: -11.8, heading: 0 },
    southRow: { xs: [-12, -9, -6, 6, 9, 12], z: 11.8, heading: Math.PI },

    cars: [
      ...row([9, 15], -11.8, 0, 2), // flanking
      ...row([-12, -9, -3, 0, 6], -11.8, 0, 5),
      ...row([-12, -6, 9], 11.8, Math.PI, 0),
    ],
    // The slalom: three pillars on the lane centreline. The lane is bounded by
    // the bay row's rear bumpers (-9.7) and the south row's (9.7), so the
    // pillars leave 7.8 m either side — the challenge is the cones, not width.
    // The target's 5.5 m mouth zone (x 10.6-13.4) is clear of pillar C at x 5.
    pillars: [
      { pos: [-9, -1.5], size: [0.8, 0.8] },
      { pos: [-2, -1.5], size: [0.8, 0.8] },
      { pos: [5, -1.5], size: [0.8, 0.8] },
      { pos: [-14, 6], size: [0.8, 0.8] },
      { pos: [14, 6], size: [0.8, 0.8] },
    ],
    walls: [],
    // Per pillar: a gate cone 3.7 m out on the correct side, and a cone 1.8 m
    // out on the wrong side, which a 1.78 m car cannot pass without clipping.
    cones: [
      { pos: [-9, -5.2] }, { pos: [-9, 0.3] }, // A: go north
      { pos: [-2, 2.2] }, { pos: [-2, -3.3] }, // B: go south
      { pos: [5, -5.2] }, { pos: [5, 0.3] }, // C: go north
    ],
    arrows: [{ pos: [-12, -1.5], heading: -90 * DEG }],
    kerbs: [],
  },

  // ==========================================================================
  {
    id: 15,
    name: 'Level B5',
    subtitle: 'Echelon, the other way',
    maneuver: 'angled',
    style: 'underground',
    lot: { width: 40, depth: 34, ceilingHeight: 2.9 },
    hint: 'Echelon again, mirrored: drive west and swing right into the glowing bay. The ceiling is lower down here.',
    parTime: 50,

    // Deck Four's echelon reflected across the centreline. Driving west
    // (heading +PI/2) and turning RIGHT by 45 degrees leaves the nose at
    // +PI/4, so the bay mouth faces the approach exactly as it does up there.
    // The step along the wall is unchanged at 3.0 / cos(45) = 4.243 m.
    spawn: { pos: [15.5, -7.5], heading: 90 * DEG },
    target: {
      pos: [0.77, -13.2],
      heading: 45 * DEG,
      bay: BAY,
      style: 'bay',
      tolerance: { pos: 0.6, headingDeg: 12 },
    },

    bayRow: {
      bays: [13.5, 9.257, 5.014, 0.771, -3.472, -7.715, -11.958].map((x) => [x, -13.2]),
      heading: 45 * DEG,
    },
    southRow: { xs: [-14, -11, -8, 9, 12, 15], z: 13.8, heading: Math.PI },

    cars: [
      { pos: [13.5, -13.2], heading: 45 * DEG, paint: 3 },
      { pos: [9.257, -13.2], heading: 45 * DEG, paint: 8 },
      { pos: [5.014, -13.2], heading: 45 * DEG, paint: 1 }, // flanking
      { pos: [-3.472, -13.2], heading: 45 * DEG, paint: 6 }, // flanking
      { pos: [-11.958, -13.2], heading: 45 * DEG, paint: 4 },
      ...row([-14, -8, 12], 13.8, Math.PI, 5),
    ],
    pillars: [
      { pos: [15, -2], size: [0.7, 0.7] },
      { pos: [-15, -2], size: [0.7, 0.7] },
      { pos: [0, 4], size: [0.7, 0.7] },
    ],
    walls: [],
    cones: [{ pos: [9, -3.5] }, { pos: [-7, -4] }, { pos: [-9.5, 6] }],
    arrows: [
      { pos: [11, -7.5], heading: 90 * DEG },
      { pos: [-6, -7.5], heading: 90 * DEG },
    ],
    kerbs: [],
  },

  // ==========================================================================
  {
    id: 8,
    name: 'Level B4',
    subtitle: 'End stall beside a van',
    maneuver: 'reverse',
    style: 'underground',
    lot: { width: 34, depth: 28, ceilingHeight: 2.75 },
    hint: 'Last bay in the row: a pilaster on one side, a van on the other. Come up the east lane, pass it, reverse in.',
    parTime: 90,

    // Up the east lane heading north, turn west past the bay, then reverse
    // right into it. The east lane is kept clear by ending the south row at
    // x = 7.
    spawn: { pos: [14.6, 8], heading: 0 },
    target: {
      pos: [15.1, -10.8],
      heading: Math.PI,
      bayHeading: 0,
      bay: { width: 2.75, length: 5.4 },
      style: 'bay',
      tolerance: { pos: 0.5, headingDeg: 10 },
    },

    // 2.75 m pitch. The east-wall pilaster at z = -10.25 sits right beside the
    // end bay: its face is at x = 16.445, so a car centred at 15.1 has 0.455 m
    // on that side and 0.97 m to the van.
    bayRow: {
      xs: [15.1, 12.35, 9.6, 6.85, 4.1, 1.35, -1.4, -4.15, -6.9, -9.65, -12.4],
      z: -10.8,
      heading: 0,
      width: 2.75,
    },
    southRow: { xs: [-8, -5, -2, 1, 4, 7], z: 10.8, heading: Math.PI },

    cars: [
      { pos: [12.35, -10.8], heading: Math.PI, paint: 5, body: 'van' },
      ...row([6.85, 4.1, -1.4, -4.15], -10.8, Math.PI, 1),
      ...row([-9.65, -12.4], -10.8, 0, 6),
      ...row([-8, -2, 4, 7], 10.8, Math.PI, 3),
    ],
    pillars: [
      { pos: [-8, 2], size: [0.8, 0.8] },
      { pos: [0, 2], size: [0.8, 0.8] },
      { pos: [7, 2], size: [0.8, 0.8] },
    ],
    walls: [{ pos: [-14, 8], size: [4, 3], height: 2.75 }],
    cones: [{ pos: [13.7, -7.4] }, { pos: [10, -4] }, { pos: [3, -4.5] }],
    arrows: [{ pos: [14.6, 3], heading: 0 }],
    kerbs: [],
  },

  // ==========================================================================
  {
    id: 17,
    name: 'Level B6',
    subtitle: 'Against the clock',
    maneuver: 'reverse',
    style: 'underground',
    lot: { width: 40, depth: 34, ceilingHeight: 2.9 },
    hint: 'Same reverse park, less room and a clock running. Pull past the bay, shift to R and back in.',
    parTime: 70,
    timeLimit: 110,

    spawn: { pos: [12, -6.5], heading: 90 * DEG },
    target: {
      pos: [-2, -13.8],
      heading: Math.PI, // backed in: the nose points out of the bay
      bayHeading: 0, // the paint still opens south, onto the aisle
      bay: BAY,
      style: 'bay',
      tolerance: { pos: 0.55, headingDeg: 10 },
    },

    // Flanking cars at +/-2.7 rather than Deck Two's 3.0: 0.92 m of door gap
    // either side of a 1.78 m car, against the 0.35 m floor the lint enforces.
    // The aisle is unchanged, because a tighter bay does not make the swing in
    // front of it any shorter.
    bayRow: { xs: [-14, -11, -8, -4.7, -2, 0.7, 4, 7, 10, 13], z: -13.8, heading: 0 },
    southRow: { xs: [-14, -11, -8, 8, 11, 14], z: 13.8, heading: Math.PI },

    cars: [
      { pos: [-4.7, -13.8], heading: 0, paint: 5 },
      { pos: [0.7, -13.8], heading: 0, paint: 2 },
      ...row([-14, -11, -8], -13.8, 0, 6),
      ...row([7, 10, 13], -13.8, 0, 1),
      ...row([-14, -11, 11, 14], 13.8, Math.PI, 4),
    ],
    pillars: [
      { pos: [-16, -3], size: [0.7, 0.7] },
      { pos: [16, -3], size: [0.7, 0.7] },
      { pos: [5, 3], size: [0.7, 0.7] },
    ],
    walls: [],
    cones: [{ pos: [-9, -7.5] }, { pos: [3, -4.5] }],
    arrows: [{ pos: [9, -6.5], heading: 90 * DEG }],
    kerbs: [],
  },

  // ==========================================================================
  {
    id: 9,
    name: 'Roof One',
    subtitle: 'Three-point turn',
    maneuver: 'three-point',
    style: 'rooftop',
    lot: { width: 30, depth: 44, ceilingHeight: 3.3 },
    hint: 'The lane is too narrow to U-turn. Turn round in three moves and stop in the box facing back the way you came.',
    parTime: 60,

    spawn: { pos: [0, 16], heading: 0 },
    // Facing south, in a marked box in the middle of the lane.
    target: {
      pos: [0, -14],
      heading: Math.PI,
      bay: BAY,
      style: 'box',
      tolerance: { pos: 0.6, headingDeg: 12 },
    },

    // The lane is 7.8 m between the two rows' rear bumpers. The car's
    // kerb-to-kerb turning circle is ~8.9 m, so a U-turn is impossible and a
    // three-point turn (which needs roughly car length + 1.5 m) comfortably
    // isn't. Rows run to z = -20.5, 0.5 m off the lamp posts, so there is no
    // wide apron at the end of the lane to swing round in.
    extraRows: [
      { bays: rowZs().map((z) => [-6.0, z]), heading: 90 * DEG },
      { bays: rowZs().map((z) => [6.0, z]), heading: -90 * DEG },
    ],
    cars: [
      ...rowZs()
        .filter((z) => z < 12)
        .map((z, i) => ({ pos: [-6.0, z], heading: 90 * DEG, paint: i })),
      ...rowZs()
        .filter((z) => z !== 6.5)
        .map((z, i) => ({ pos: [6.0, z], heading: -90 * DEG, paint: i + 3 })),
    ],
    pillars: [],
    walls: [],
    cones: [],
    arrows: [{ pos: [0, 10], heading: 0 }],
    kerbs: [],
  },

  // ==========================================================================
  {
    id: 10,
    name: 'Roof Two',
    subtitle: 'Corner stall',
    maneuver: 'reverse',
    style: 'rooftop',
    lot: { width: 36, depth: 30, ceilingHeight: 3.3 },
    hint: 'The corner stall: a lamp post on one side, a pickup on the other, 2.6 m wide. Pass it heading west and reverse in.',
    parTime: 85,

    spawn: { pos: [15.5, 9], heading: 0 },
    target: {
      pos: [16.5, -11.8],
      heading: Math.PI,
      bayHeading: 0,
      bay: { width: 2.6, length: 5.4 },
      style: 'bay',
      tolerance: { pos: 0.5, headingDeg: 10 },
    },

    // The east parapet's lamp post at z = -11.25 stands beside the stall: its
    // face is x = 17.89, leaving 0.5 m from a car centred at 16.5. The pickup
    // at 13.9 leaves 0.82 m on the other side.
    bayRow: {
      xs: [16.5, 13.9, 11.3, 8.7, 6.1, 3.5, 0.9, -1.7, -4.3],
      z: -11.8,
      heading: 0,
      width: 2.6,
    },
    southRow: { xs: [-12, -9, -6, -3, 0, 3, 6, 9], z: 11.8, heading: Math.PI },

    cars: [
      { pos: [13.9, -11.8], heading: Math.PI, paint: 3, body: 'pickup' },
      ...row([8.7, 6.1], -11.8, Math.PI, 5),
      ...row([0.9, -1.7, -4.3], -11.8, 0, 0),
      ...row([-12, -6, 0, 9], 11.8, Math.PI, 2),
    ],
    pillars: [],
    // A stair head and a raised planter island mid-deck.
    walls: [
      { pos: [-14, -2], size: [4, 4], height: 3.3 },
      { pos: [2, 3], size: [6, 1.2], height: 0.9 },
    ],
    cones: [{ pos: [15.1, -8.3] }, { pos: [11, -5] }],
    arrows: [{ pos: [15.5, 4], heading: 0 }],
    kerbs: [],
  },

  // ==========================================================================
  {
    id: 16,
    name: 'Roof Four',
    subtitle: 'Parallel on the parapet',
    maneuver: 'parallel',
    style: 'rooftop',
    lot: { width: 44, depth: 26, ceilingHeight: 3.3 },
    hint: 'Parallel again, and the kerb is the roof parapet. Pull alongside the front car and reverse in.',
    parTime: 95,

    // Tighter than Deck Three: flanking cars at +/-5.4 leave 10.8 - 4.2 =
    // 6.6 m of clear kerb, against that level's 7.0 and the 6.2 m floor. The
    // kerb here is the parapet, so overshooting it is a wall, not a kerb hop.
    spawn: { pos: [15, -6.6], heading: 90 * DEG },
    target: {
      pos: [0, -10.9],
      heading: 90 * DEG,
      bay: PARALLEL,
      style: 'parallel',
      tolerance: { pos: 0.56, headingDeg: 11 },
    },

    cars: [
      { pos: [-5.4, -10.9], heading: 90 * DEG, paint: 4 },
      { pos: [5.4, -10.9], heading: 90 * DEG, paint: 9 },
      { pos: [-11.0, -10.9], heading: 90 * DEG, paint: 1 },
      { pos: [11.0, -10.9], heading: 90 * DEG, paint: 6 },
      ...row([-16, -13, -10, 10, 13, 16], 9.8, Math.PI, 2),
    ],
    southRow: { xs: [-16, -13, -10, -7, 7, 10, 13, 16], z: 9.8, heading: Math.PI },
    pillars: [],
    walls: [],
    cones: [{ pos: [-8.2, -8.6] }, { pos: [8.2, -8.6] }],
    arrows: [{ pos: [11, -6.6], heading: 90 * DEG }],
    kerbs: [{ pos: [0, -12.25], length: 44, rotY: 90 * DEG }],
  },

  // ==========================================================================
  {
    id: 11,
    name: 'Roof Three',
    subtitle: 'Timed valet',
    maneuver: 'pull-in',
    style: 'rooftop',
    lot: { width: 44, depth: 36, ceilingHeight: 3.3 },
    hint: 'A guest is waiting. Through the three cone gates and into the bay in under 45 seconds.',
    parTime: 30,
    timeLimit: 45,

    spawn: { pos: [-18, 13], heading: 0 },
    target: {
      pos: [8, -14.8],
      heading: 0,
      bay: BAY,
      style: 'bay',
      tolerance: { pos: 0.6, headingDeg: 12 },
    },

    bayRow: { xs: [-1, 2, 5, 8, 11, 14, 17], z: -14.8, heading: 0 },
    southRow: { xs: [-8, -5, -2, 1, 4, 7, 10], z: 14.8, heading: Math.PI },

    cars: [
      ...row([5, 11], -14.8, 0, 4), // flanking
      ...row([-1, 17], -14.8, 0, 1),
      ...row([-8, -2, 4, 10], 14.8, Math.PI, 6),
    ],
    pillars: [],
    walls: [{ pos: [-15, -12], size: [5, 4], height: 3.3 }],
    // Gates 3.6 m wide: with Scoring's cone pad, the car's centre has +/-0.7 m
    // of line through each. Gate 3 lines the car straight up into the bay.
    cones: [
      { pos: [-13.8, 4] }, { pos: [-10.2, 4] }, // gate 1, heading north
      { pos: [-4, -5.8] }, { pos: [-4, -2.2] }, // gate 2, heading east
      { pos: [6.2, -6] }, { pos: [9.8, -6] }, // gate 3, heading north
    ],
    arrows: [
      { pos: [-18, 8], heading: 0 },
      { pos: [-8, -4], heading: -90 * DEG },
    ],
    kerbs: [],
  },

  // ==========================================================================
  {
    id: 12,
    name: 'Final Exam',
    subtitle: 'Slalom, then a 2.6 m bay',
    maneuver: 'reverse',
    style: 'rooftop',
    lot: { width: 40, depth: 32, ceilingHeight: 3.3 },
    hint: 'Everything at once: weave the cones, pass the bay, reverse between the van and the SUV. Two minutes.',
    parTime: 70,
    timeLimit: 120,

    spawn: { pos: [16, -6.5], heading: 90 * DEG },
    target: {
      pos: [-1.2, -12.8],
      heading: Math.PI,
      bayHeading: 0,
      bay: { width: 2.6, length: 5.4 },
      style: 'bay',
      tolerance: { pos: 0.45, headingDeg: 8 },
    },

    // 2.6 m pitch: 0.82 m between the target and each neighbour.
    bayRow: {
      xs: [-9, -6.4, -3.8, -1.2, 1.4, 4, 6.6, 9.2, 11.8],
      z: -12.8,
      heading: 0,
      width: 2.6,
    },
    southRow: { xs: [-12, -9, -6, -3, 0, 3, 6, 9, 12], z: 12.8, heading: Math.PI },

    cars: [
      { pos: [-3.8, -12.8], heading: Math.PI, paint: 5, body: 'van' },
      { pos: [1.4, -12.8], heading: 0, paint: 1, body: 'suv' },
      ...row([-9, -6.4, 4, 6.6, 11.8], -12.8, Math.PI, 2),
      ...row([-12, -6, 0, 3, 9], 12.8, Math.PI, 4),
    ],
    pillars: [],
    walls: [{ pos: [-16, 6], size: [5, 4], height: 3.3 }],
    // Slalom on the approach lane, clear of the target's 7.5 m mouth zone
    // (x -2.4 to 0).
    cones: [{ pos: [11, -6.5] }, { pos: [7.5, -5.2] }, { pos: [4, -6.5] }, { pos: [-3, -3] }],
    arrows: [{ pos: [18, -6.5], heading: 90 * DEG }],
    kerbs: [],
  },

  // ==========================================================================
  // Level 13 — City Drive (design/SPEC-level13.md). Built from
  // design/level13/layout-model.mjs's buildLayout(), not hand-typed: see
  // CITY13 above. CityBuilder.js (not LevelBuilder.js's single-lot path)
  // turns this into scene geometry — `style: 'city'` is what routes it there.
  {
    id: 13,
    name: CITY13.name,
    subtitle: CITY13.subtitle,
    maneuver: CITY13.maneuver,
    style: 'city',
    hint: 'Follow the P signs across town, up to the roof, and into the glowing bay.',
    parTime: CITY13.parTime,
    timeLimit: CITY13.timeLimit,
    spawn: { pos: CITY13.spawn.pos, heading: CITY13.spawn.heading },
    target: CITY13.target,
    layout: CITY13,
  },
];

/** Row positions along z for Roof One's lane: -20.5 to 15.5 at 3.0 m pitch. */
function rowZs() {
  const out = [];
  for (let z = -20.5; z <= 15.5; z += 3) out.push(z);
  return out;
}

export function getLevel(index) {
  return LEVELS[Math.max(0, Math.min(LEVELS.length - 1, index))];
}
