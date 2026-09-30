// Level data schema (see ARCHITECTURE.md / prompt spec):
// {
//   id, name, maneuverType: 'pull-in' | 'reverse' | 'parallel',
//   spawn: { pos: [x,y,z], rotY },
//   target: { pos: [x,y,z], rotY, posTolerance, rotToleranceDeg },
//   obstacles: [{ type: 'wall'|'pillar'|'parkedCar', pos, rotY, scale, collides: true }],
//   cones: [{ pos, rotY }],
//   groundSize: [w, d],  // flat lot footprint, centered at origin
// }
//
// Adding level 4/5 (or an underground-lighting variant) is purely a data
// addition to this array — no code changes required elsewhere. Obstacle
// density is the difficulty lever; maneuverType is the variety lever — kept
// independent per spec (don't conflate the two).

const DEG = Math.PI / 180;

// Bay gaps are load-bearing, not cosmetic: the chassis is 4.2m long, so the
// clear space between the two flanking parkedCars must exceed that or the
// level is literally uncompletable. Lot A originally left a 3.4m gap for a
// 4.2m car (impossible — the car intersects both neighbours at the target
// pose), and Lot C left only 0.3m at each end, which is far too tight to
// swing into for a parallel park. Widened to 5.6m and 6.0m respectively.
// If you move a parkedCar, re-check the gap against the chassis length.

export const LEVELS = [
  {
    id: 'pull-in-01',
    name: 'Lot A — Pull-In',
    maneuverType: 'pull-in',
    groundSize: [36, 30],
    spawn: { pos: [-13, 1.2, -10], rotY: 0 },
    target: { pos: [10, 0, 8], rotY: 0, posTolerance: 0.3, rotToleranceDeg: 8 },
    obstacles: [
      { type: 'pillar', pos: [-4, 0.75, -10], rotY: 0, scale: [0.6, 1.5, 0.6], collides: true },
      { type: 'pillar', pos: [3, 0.75, -3], rotY: 0, scale: [0.6, 1.5, 0.6], collides: true },
      { type: 'parkedCar', pos: [10, 0.5, 3.1], rotY: 0, scale: [1.7, 1.1, 4.2], collides: true },
      { type: 'parkedCar', pos: [10, 0.5, 12.9], rotY: 0, scale: [1.7, 1.1, 4.2], collides: true },
    ],
    cones: [
      { pos: [-1, 0, -6], rotY: 0 },
      { pos: [6, 0, 0], rotY: 0 },
    ],
  },
  {
    id: 'reverse-01',
    name: 'Lot B — Reverse Park',
    maneuverType: 'reverse',
    groundSize: [36, 32],
    spawn: { pos: [0, 1.2, -12], rotY: 0 },
    target: { pos: [8, 0, 6], rotY: Math.PI, posTolerance: 0.3, rotToleranceDeg: 8 },
    obstacles: [
      { type: 'wall', pos: [-14, 0.9, 0], rotY: 0, scale: [0.6, 1.8, 20], collides: true },
      { type: 'pillar', pos: [2, 0.75, -2], rotY: 0, scale: [0.6, 1.5, 0.6], collides: true },
      { type: 'parkedCar', pos: [8, 0.5, 0.9], rotY: Math.PI, scale: [1.7, 1.1, 4.2], collides: true },
      { type: 'parkedCar', pos: [8, 0.5, 11.1], rotY: Math.PI, scale: [1.7, 1.1, 4.2], collides: true },
    ],
    cones: [
      { pos: [4, 0, -6], rotY: 0 },
      { pos: [8, 0, -1], rotY: 0 },
    ],
  },
  {
    id: 'parallel-01',
    name: 'Lot C — Parallel Park',
    maneuverType: 'parallel',
    groundSize: [40, 26],
    spawn: { pos: [-15, 1.2, 0], rotY: 90 * DEG },
    target: { pos: [8, 0, 6.5], rotY: 90 * DEG, posTolerance: 0.3, rotToleranceDeg: 8 },
    obstacles: [
      { type: 'wall', pos: [0, 0.9, 10.3], rotY: 0, scale: [30, 1.8, 0.6], collides: true },
      { type: 'pillar', pos: [-6, 0.75, 3], rotY: 0, scale: [0.6, 1.5, 0.6], collides: true },
      { type: 'parkedCar', pos: [2.9, 0.5, 6.5], rotY: 90 * DEG, scale: [1.7, 1.1, 4.2], collides: true },
      { type: 'parkedCar', pos: [13.1, 0.5, 6.5], rotY: 90 * DEG, scale: [1.7, 1.1, 4.2], collides: true },
    ],
    cones: [
      { pos: [-2, 0, 3], rotY: 0 },
      { pos: [8, 0, 2], rotY: 0 },
    ],
  },
];
