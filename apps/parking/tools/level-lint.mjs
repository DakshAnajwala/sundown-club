/**
 * level-lint.mjs — static geometry checks on every level in Levels.js.
 *
 * drive-test.mjs proves each target pose is REACHABLE by teleport. That catches
 * "the car doesn't fit" but not "the bay opens onto a wall" or "a pillar sits
 * in the swing". This checks the load-bearing clearances written at the top of
 * Levels.js directly, in plan view, against the same colliders the game builds
 * (including the garage perimeter and pilasters from Garage.js). No browser.
 *
 *   node tools/level-lint.mjs
 *
 * Checks, per level:
 *   target fits      player footprint at the target pose overlaps nothing,
 *                    and the nearest obstacle beside it leaves a door gap
 *   mouth clear      the aisle in front of the bay MOUTH (the open end of the
 *                    painted U) is free of obstacles for the manoeuvre's depth
 *   spawn clear      the car doesn't spawn inside or against anything
 *   parked cars      no parked car intersects a pillar, wall, kerb or another car
 *   parallel gap     bumper-to-bumper gap along the kerb >= 6.2 m
 *
 * A bay's "mouth" is local +Z of its markings (createBayMarkings draws the head
 * line at local -Z). Found by this tool: levels 2 and 4 rotated their markings
 * by the CAR's heading, which for a backed-in car points the U's open end at
 * the wall.
 */
import { LEVELS } from '../src/world/Levels.js';
import { createGarage } from '../src/world/Garage.js';
import { rect, overlaps, gap, levelFootprints } from '../src/game/PlanGeometry.js';
import { DAILY_POOL, dailyLevel } from '../src/game/Retention.js';

const CAR = { w: 1.78, l: 4.2 };
const DOOR_GAP_MIN = 0.35; // per side, from the car body to the nearest obstacle
const PARALLEL_GAP_MIN = 6.2;
const AISLE = { 'pull-in': 5.5, reverse: 7.5, angled: 4.5, 'three-point': 6.0 };

// --- obstacles as the game builds them -------------------------------------------
// Moved into src/game/PlanGeometry.js (GOAL Part C, C.7) so the review and this
// linter can never disagree; `obstacles` kept as a local name (same shape).
function obstacles(level) {
  const { width, depth, ceilingHeight } = level.lot;
  const garage = createGarage({ style: level.style, width, depth, ceilingHeight });
  return levelFootprints(level, garage);
}

// --- checks --------------------------------------------------------------------------
let failures = 0;
let warnings = 0;

// Every daily-challenge variant (src/game/Retention.js DAILY_POOL) is linted
// exactly like a level, so a daily can never be impossible. A variant that
// fails is removed from the pool, not fixed by moving cars.
const DAILIES = DAILY_POOL.map((entry, i) => dailyLevel(entry, null, i));
const ALL = [...LEVELS, ...DAILIES];

for (const [index, level] of ALL.entries()) {
  // A city level (Level 13) isn't one flat lot in plan view — it has its own
  // dedicated checks in tools/city-lint.mjs (the same rules build-layout.mjs
  // already ran on it). Skip it here rather than crash on the missing `lot`.
  if (level.style === 'city') {
    console.log(`L${index + 1} ${level.name} — see tools/city-lint.mjs\n`);
    continue;
  }
  const lines = [];
  const fail = (msg) => {
    failures++;
    lines.push(`  FAIL ${msg}`);
  };
  const warn = (msg) => {
    warnings++;
    lines.push(`  warn ${msg}`);
  };
  const ok = (msg) => lines.push(`  ok   ${msg}`);

  const obs = obstacles(level);
  const t = level.target;
  const [tx, tz] = t.pos;
  const car = rect(tx, tz, CAR.w, CAR.l, t.heading);

  // target fits, and its door gaps
  const hits = obs.filter((o) => overlaps(car, o.poly));
  if (hits.length) fail(`target footprint overlaps ${hits.map((h) => h.kind).join(', ')}`);
  const nearest = obs
    .map((o) => ({ kind: o.kind, d: gap(car, o.poly) }))
    .sort((a, b) => a.d - b.d)[0];
  if (!hits.length) {
    const msg = `target fits; nearest obstacle ${nearest.kind} at ${nearest.d.toFixed(2)} m`;
    if (t.style !== 'parallel' && nearest.d < DOOR_GAP_MIN) fail(`${msg} (< ${DOOR_GAP_MIN} door gap)`);
    else ok(msg);
  }

  // bay mouth / aisle
  const bayHeading = t.bayHeading ?? t.heading;
  if (t.style === 'box') {
    // A turning box in a lane: the free width across the target decides the
    // level. Wider than the ~8.9 m kerb-to-kerb circle and a plain U-turn
    // works; narrower than ~5.8 m (car length + 1.6) and even three points
    // can't do it.
    const latAxis = [Math.cos(t.heading), -Math.sin(t.heading)];
    const side = (o) => {
      const cx = o.poly.reduce((a, p) => a + p[0], 0) / 4 - tx;
      const cz = o.poly.reduce((a, p) => a + p[1], 0) / 4 - tz;
      return Math.sign(cx * latAxis[0] + cz * latAxis[1]);
    };
    const near = (sgn) => Math.min(...obs.filter((o) => side(o) === sgn).map((o) => gap(car, o.poly)));
    const width = near(-1) + near(1) + CAR.w;
    if (width >= 8.9) fail(`lane ${width.toFixed(2)} m wide: a U-turn fits, no three-point turn needed`);
    else if (width < 5.8) fail(`lane ${width.toFixed(2)} m wide: too narrow even for a three-point turn`);
    else ok(`lane ${width.toFixed(2)} m wide (U-turn impossible, three-point feasible)`);
  } else if (t.style === 'parallel') {
    // Gap between the nearest parked cars in front and behind, along the kerb.
    const along = (x, z) => (x - tx) * -Math.sin(t.heading) + (z - tz) * -Math.cos(t.heading);
    const lateral = (x, z) => (x - tx) * Math.cos(t.heading) - (z - tz) * Math.sin(t.heading);
    const inRow = level.cars.filter((c) => Math.abs(lateral(c.pos[0], c.pos[1])) < 0.6);
    const ahead = inRow.map((c) => along(c.pos[0], c.pos[1])).filter((a) => a > 0);
    const behind = inRow.map((c) => along(c.pos[0], c.pos[1])).filter((a) => a < 0);
    if (!ahead.length || !behind.length) warn('parallel space has no car on one end');
    else {
      const g = Math.min(...ahead) - Math.max(...behind) - CAR.l;
      if (g < PARALLEL_GAP_MIN) fail(`parallel gap ${g.toFixed(2)} m < ${PARALLEL_GAP_MIN}`);
      else ok(`parallel gap ${g.toFixed(2)} m`);
    }
  } else {
    const need = AISLE[level.maneuver] ?? AISLE.reverse;
    const L = t.bay.length;
    const W = t.bay.width;
    // Rectangle from the mouth line outward, in the bay's frame (+Z = out).
    const cz = L / 2 + need / 2 + 0.05;
    const s = Math.sin(bayHeading);
    const c = Math.cos(bayHeading);
    const mouth = rect(tx + cz * s, tz + cz * c, W - 0.2, need, bayHeading);
    const blocked = obs.filter((o) => overlaps(mouth, o.poly, 0.02));
    if (blocked.length) fail(`bay mouth: ${need} m of aisle blocked by ${[...new Set(blocked.map((b) => b.kind))].join(', ')}`);
    else ok(`bay mouth opens onto ${need} m of clear aisle`);
  }

  // spawn
  const [sx, sz] = level.spawn.pos;
  const spawn = rect(sx, sz, CAR.w, CAR.l, level.spawn.heading);
  const spawnHits = obs.filter((o) => gap(spawn, o.poly) < 0.4);
  if (spawnHits.length) fail(`spawn within 0.4 m of ${spawnHits.map((h) => h.kind).join(', ')}`);
  else ok('spawn clear');

  // parked cars vs everything else
  const cars = obs.filter((o) => o.car);
  let carBad = 0;
  for (const a of cars) {
    for (const b of obs) {
      if (a === b) continue;
      if (b.car && cars.indexOf(b) < cars.indexOf(a)) continue;
      if (overlaps(a.poly, b.poly)) {
        carBad++;
        fail(`${a.kind} at [${a.car.pos}] overlaps ${b.kind}`);
      }
    }
  }
  if (!carBad) ok(`${cars.length} parked cars, no intersections`);

  // cones inside the target footprint would be a scoring trap
  for (const cone of level.cones ?? []) {
    if (overlaps(car, rect(cone.pos[0], cone.pos[1], 0.4, 0.4))) warn(`cone at [${cone.pos}] sits inside the target pose`);
  }

  const title = level.daily ? `Daily pool ${level.daily.index}` : `L${index + 1}`;
  console.log(`${title} ${level.name} — ${level.subtitle}`);
  lines.forEach((l) => console.log(l));
}

console.log(`\n${LEVELS.length} levels + ${DAILIES.length} daily variants, ${failures} failures, ${warnings} warnings`);
process.exit(failures ? 1 : 0);
