/**
 * city-lint.mjs — the Level 13 layout checks (SPEC-level13.md §4), as a
 * regular verification tool alongside level-lint.mjs and physics-probe.mjs.
 *
 * This is the SAME `checkLayout()` design/level13/build-layout.mjs runs — no
 * separate rule set to drift out of sync. It exists as its own tool because
 * §5's "does anything else still pass" checklist and CLAUDE.md §8's
 * regression list both name `tools/city-lint.mjs` specifically, and because
 * `build-layout.mjs` also has the side effect of rewriting layout.json, which
 * a plain lint run shouldn't need to do.
 *
 *   node tools/city-lint.mjs
 */
import { buildLayout } from '../design/level13/layout-model.mjs';

const L = buildLayout();
let bad = 0;
for (const c of L.checks) {
  if (!c.ok) bad++;
  console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.label.padEnd(40)} ${String(c.value).padEnd(18)} ${c.limit}${c.detail ? '   ' + c.detail : ''}`);
}
console.log(
  `\n${L.checks.length - bad}/${L.checks.length} checks pass. ${L.walls.length} colliders, ${L.slabs.length} slabs, ${L.ramps.length} ramps, ${L.parkedCars.length} parked cars, ${L.buildings.length} buildings; route ${L.route.length.toFixed(0)} m, est ${L.estimate.seconds} s.`
);
process.exit(bad ? 1 : 0);
