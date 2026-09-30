/**
 * build-layout.mjs — writes design/level13/layout.json from layout-model.mjs
 * and prints the checks. Exits 1 if any check fails.
 *
 *   node design/level13/build-layout.mjs
 */
import { writeFileSync } from 'node:fs';
import { buildLayout } from './layout-model.mjs';

const L = buildLayout();
const round = (k, v) => (typeof v === 'number' ? +v.toFixed(4) : v);
// The sampled route is for the sheet; the JSON keeps it at 1 m spacing.
const json = { ...L, route: { ...L.route, points: L.route.points.filter((p, i) => i % 4 === 0 || i === L.route.points.length - 1) } };
writeFileSync(new URL('./layout.json', import.meta.url), JSON.stringify(json, round, 1) + '\n');
let bad = 0;
for (const c of L.checks) {
  if (!c.ok) bad++;
  console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.label.padEnd(40)} ${String(c.value).padEnd(18)} ${c.limit}${c.detail ? '   ' + c.detail : ''}`);
}
console.log(`\n${L.walls.length} colliders, ${L.slabs.length} slabs, ${L.ramps.length} ramps, ${L.parkedCars.length} parked cars, ${L.buildings.length} buildings; route ${L.route.length.toFixed(0)} m, est ${L.estimate.seconds} s`);
process.exit(bad ? 1 : 0);
