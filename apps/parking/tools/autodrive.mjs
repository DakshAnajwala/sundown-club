/**
 * autodrive.mjs — drives levels start to finish with real key events.
 *
 * drive-test.mjs proves a target pose is reachable by TELEPORT. This proves a
 * level can actually be driven into: an in-page pure-pursuit autopilot follows
 * a hand-authored route, pressing W/S/A/D/F/R/P through the same KeyboardEvents
 * Input.js reads, and must finish with the game's own park check firing.
 *
 *   node tools/autodrive.mjs [levelNumber ...]      (default: all routed levels)
 *
 * Pure pursuit: steer toward a point LOOKAHEAD metres further along the route,
 * measured from the REAR axle in both directions. The rear axle is the one that
 * doesn't steer, so it is the one that follows a smooth path whether the car is
 * going forwards or backwards; the nose swings out around it. (The first
 * version tracked the front axle in reverse, on the wrong theory that the
 * roles swap, and the chassis visibly swung away from the arc.) Keys are
 * binary but the steering wheel ramps, so holding a key until the wheel reaches
 * the wanted position and releasing it approximates proportional steering.
 *
 * Routes are chassis-centre polylines per leg; each leg ends with the car
 * stopped at its last point.
 */
import puppeteer from 'puppeteer-core';
import { buildLayout } from '../design/level13/layout-model.mjs';

const URL = 'http://localhost:5175/play/?lowfx=1';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const S = Math.SQRT1_2;

/**
 * Quarter-circle route points. 'east-to-north': start travelling +X at (x0, z0),
 * curve left, finish travelling -Z at (x0 + r, z0 - r).
 */
function arc(x0, z0, r, kind, steps = 8) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const th = (Math.PI / 2) * (i / steps);
    if (kind === 'east-to-north') pts.push([x0 + r * Math.sin(th), z0 - r + r * Math.cos(th)]);
  }
  return pts;
}

// level number -> legs
const ROUTES = {
  1: [
    // Up the aisle, then one diagonal (1.4 m clear of the cone at [-2.5, -5.5])
    // into a 52-degree left turn onto x = 4, and 5 m straight into the bay.
    // A first route with a square 90-degree swing needed exactly the car's
    // 3.56 m minimum radius, ran wide during the 0.45 s the wheel takes to wind
    // on, and hit the parked car at x = 7.
    { gear: 'D', path: [[-6, 8.5], [-6, -1], [4, -8.8], [4, -13.8]] },
  ],
  // Pull past the bay, then reverse round a sampled 4.8 m arc (the lane is
  // 7.3 m from the bay centre: 4.8 m of arc + 2.5 m straight). Hand-placed
  // points first bent at ~2.5 m radius, below the car's 3.56 m minimum; the
  // wheel sat at full lock, ran wide and backed into the neighbour at x = 1.
  2: [
    { gear: 'D', path: [[10, -6.5], [-6.8, -6.5]] },
    { gear: 'R', path: [...arc(-6.8, -6.5, 4.8, 'east-to-north'), [-2, -13.8]] },
  ],
  6: [
    {
      gear: 'D',
      path: [[-15.5, -7.5], [-9.5, -7.5], [-6.2, -7.9], [-4.4, -9.6], [-0.77 - 3 * S, -13.2 + 3 * S], [-0.77, -13.2]],
    },
  ],
  // Level 13 "City Drive": one continuous forward leg over the exact route
  // design/level13/layout-model.mjs already validated (checkLayout, the
  // route table in SPEC-level13.md §1) — not a hand-placed polyline like the
  // levels above. `points` (not `path`) signals the y-aware pure-pursuit
  // variant below (SPEC-level13.md §5.8): stacked floors overlap in plan, so
  // projection must stay within +/-1.5 m of the car's own y.
  13: [{ gear: 'D', points: buildLayout().route.points.map((p) => ({ x: p.x, z: p.z, y: p.y, s: p.s })) }],
};

const wanted = process.argv.slice(2).map(Number).filter(Boolean);
const levels = wanted.length ? wanted : Object.keys(ROUTES).map(Number);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  protocolTimeout: 600000,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
  defaultViewport: { width: 640, height: 400 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
await sleep(2500);

// ROUTES is keyed by level ID, which is NOT the play index: levels added
// after the first twelve keep their own ids, so City Drive is id 13 but sits
// last in the running order. Resolve id -> index from the game itself.
const indexOfId = await page.evaluate(() => {
  const d = window.__game.debug();
  const map = {};
  (d.levelIds ?? []).forEach((id, i) => {
    map[id] = i;
  });
  return map;
});

let failures = 0;
for (const n of levels) {
  const route = ROUTES[n];
  if (!route) {
    console.log(`L${n}: no route authored`);
    continue;
  }
  const r = await page.evaluate(
    (idx, legs) => {
      const g = window.__game;
      g.debugPlay(idx);
      g.debugRig(0.5);

      const WHEELBASE = 2.62;
      const HALF_WB = WHEELBASE / 2;
      const LOOKAHEAD = 2.4;
      const DT = 1 / 20;
      const held = new Set();
      const key = (code, down) => {
        if (down === held.has(code)) return;
        window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code }));
        down ? held.add(code) : held.delete(code);
      };
      const tap = (code) => {
        key(code, true);
        key(code, false);
      };
      const releaseAll = () => [...held].forEach((c) => key(c, false));
      const tick = (s) => g.debugRig(s, 1 / 60);

      // polyline helpers
      const segs = (path) => {
        const out = [];
        let acc = 0;
        for (let i = 0; i < path.length - 1; i++) {
          const [ax, az] = path[i];
          const [bx, bz] = path[i + 1];
          const len = Math.hypot(bx - ax, bz - az);
          out.push({ ax, az, dx: (bx - ax) / len, dz: (bz - az) / len, len, s0: acc });
          acc += len;
        }
        return { segs: out, total: acc };
      };
      const project = (poly, x, z) => {
        let best = { d: Infinity, s: 0 };
        for (const sg of poly.segs) {
          const t = Math.max(0, Math.min(sg.len, (x - sg.ax) * sg.dx + (z - sg.az) * sg.dz));
          const px = sg.ax + sg.dx * t;
          const pz = sg.az + sg.dz * t;
          const d = Math.hypot(x - px, z - pz);
          if (d < best.d) best = { d, s: sg.s0 + t };
        }
        return best;
      };
      const pointAt = (poly, s) => {
        const last = poly.segs[poly.segs.length - 1];
        if (s >= poly.total) {
          const over = s - poly.total;
          return [last.ax + last.dx * (last.len + over), last.az + last.dz * (last.len + over)];
        }
        for (const sg of poly.segs) {
          if (s <= sg.s0 + sg.len) return [sg.ax + sg.dx * (s - sg.s0), sg.az + sg.dz * (s - sg.s0)];
        }
        return [last.ax, last.az];
      };

      // Level 13 variant: the route is already a dense (0.25 m) sampled point
      // list with y baked in (design/level13/layout-model.mjs), so no
      // segment interpolation is needed — but stacked floors DO overlap in
      // plan, so the nearest point must be restricted to the car's own floor
      // (SPEC-level13.md §5.8), unlike the flat-lot legs above.
      const YTOL = 1.5;
      const pointsProject = (points, x, z, y) => {
        let best = { d: Infinity, s: 0 };
        for (const p of points) {
          if (Math.abs(p.y - y) > YTOL) continue;
          const d = Math.hypot(x - p.x, z - p.z);
          if (d < best.d) best = { d, s: p.s };
        }
        return best;
      };
      const pointsAt = (points, s) => {
        let lo = points[0];
        for (const p of points) {
          if (p.s > s) break;
          lo = p;
        }
        return [lo.x, lo.z];
      };

      const log = [];
      const trace = [];
      let t = 0;
      for (const [legIndex, leg] of legs.entries()) {
        releaseAll();
        // Stop, then select the leg's gear (the shift guard refuses R<->D while rolling).
        for (let i = 0; i < 60 && g.debug().car.speedMs > 0.1; i++) {
          key('KeyS', true);
          tick(DT);
          t += DT;
        }
        key('KeyS', false);
        tap(leg.gear === 'D' ? 'KeyF' : leg.gear === 'R' ? 'KeyR' : 'KeyN');
        tick(0.3);
        t += 0.3;

        const usesPoints = Boolean(leg.points);
        const poly = usesPoints ? { points: leg.points, total: leg.points[leg.points.length - 1].s } : segs(leg.path);
        const proj = usesPoints ? (x, z, y) => pointsProject(poly.points, x, z, y) : (x, z) => project(poly, x, z);
        const at = usesPoints ? (s) => pointsAt(poly.points, s) : (s) => pointAt(poly, s);
        const reverse = leg.gear === 'R';
        let s = 0;
        let maxErr = 0;
        let done = false;
        // Level 13 is 427 m at low speed; the other routed levels are all
        // under 40 m. 1600 steps at DT=1/20 is only 80 s of game time.
        const maxSteps = usesPoints ? 12000 : 1600;
        for (let i = 0; i < maxSteps && !done; i++) {
          const d = g.debug();
          if (d.state !== 'driving') break;
          const h = d.heading;
          const fx = -Math.sin(h);
          const fz = -Math.cos(h);
          const cx = d.pos.x;
          const cz = d.pos.z;
          const cy = d.pos.y;
          // tracking point: the rear axle, in both directions
          const ax = cx - fx * HALF_WB;
          const az = cz - fz * HALF_WB;
          // Hand-authored routes (levels 1/2/6) are chassis-centre polylines
          // (file header), so their progress is tracked from (cx, cz). The
          // Level 13 layout model's route is explicitly the REAR-AXLE path
          // (layout-model.mjs's own header) — tracking progress from the
          // chassis centre against a rear-axle route left the car stopping
          // ~1.2 m (half the wheelbase) short of the final waypoint every
          // time, which the park check then flagged as "did not finish"
          // even though the leg itself reported "stopped at end".
          const pa = proj(ax, az, cy);
          const pc = usesPoints ? pa : proj(cx, cz, cy);
          s = Math.max(s, pc.s);
          maxErr = Math.max(maxErr, pc.d);
          const remaining = poly.total - s;

          const [tx, tz] = at(pa.s + LOOKAHEAD);
          const vx = tx - ax;
          const vz = tz - az;
          const trx = reverse ? -fx : fx;
          const trz = reverse ? -fz : fz;
          const cross = trx * vz - trz * vx; // negative when the target is to the LEFT
          const dot = trx * vx + trz * vz;
          const alpha = Math.atan2(-cross, dot); // + = target left of travel
          const Ld = Math.hypot(vx, vz);
          const delta = Math.atan((2 * WHEELBASE * Math.sin(alpha)) / Math.max(1, Ld));
          const fade = Math.min(1, d.car.speedMs / (40 / 3.6));
          const maxSteer = ((42 + (19 - 42) * fade) * Math.PI) / 180;
          // Forward: a left target needs negative steerNorm (+ is right).
          // Reverse: the turning centre is on the car's right = left of travel,
          // so a left-of-travel target needs positive steerNorm.
          let desired = Math.max(-1, Math.min(1, delta / maxSteer));
          if (!reverse) desired = -desired;
          const sn = d.car.steerNorm;
          key('KeyD', sn < desired - 0.04);
          key('KeyA', sn > desired + 0.04);

          const speed = d.car.speedMs;
          // Level 13's final approach (turn into the roof bay) needs more room
          // to straighten out than the short hand-authored routes: at 0.7 m/s
          // over only the last 3.5 m, the car reached the end still ~0.2 deg
          // over the heading tolerance. A longer, slower final stretch fixes it.
          const cruise = usesPoints ? (remaining < 6 ? 0.5 : reverse ? 1.3 : 2.0) : remaining < 3.5 ? 0.7 : reverse ? 1.3 : 2.0;
          if (remaining < 0.06) {
            key('KeyW', false);
            key('KeyS', true);
            if (speed < 0.05) done = true;
          } else {
            key('KeyW', speed < cruise - 0.15);
            key('KeyS', speed > cruise + 0.25 || remaining < speed * speed / 8 + 0.05);
          }
          if (i % 40 === 0) {
            trace.push(
              `      t=${t.toFixed(1)} leg${legIndex + 1} pos(${cx.toFixed(2)},${cz.toFixed(2)}) hdg ${((h * 180) / Math.PI).toFixed(0)} ` +
                `v ${speed.toFixed(2)} rem ${remaining.toFixed(2)} off ${pc.d.toFixed(2)} steer ${sn.toFixed(2)}/${desired.toFixed(2)} ` +
                `gear ${d.car.gear} keys ${[...held].join(',')}`
            );
          }
          tick(DT);
          t += DT;
        }
        releaseAll();
        log.push(`leg ${legIndex + 1} (${leg.gear}): max off-route ${maxErr.toFixed(2)} m, ${done ? 'stopped at end' : 'did not finish'}`);
        if (!done) break;
      }

      // Straighten the wheel, settle, park.
      tick(0.8);
      key('KeyS', true);
      tick(0.4);
      tap('KeyP');
      key('KeyS', false);
      tick(1.5);
      t += 2.7;
      const end = g.debug();
      releaseAll();
      return {
        log,
        trace,
        t,
        state: end.state,
        park: end.park,
        bumps: end.scoring?.bumps,
        cones: end.scoring?.cones,
        name: end.levelName,
      };
    },
    indexOfId[n] ?? n - 1,
    route
  );

  const p = r.park ?? {};
  // 'results' alone is not a park: a timed level that runs out also ends in
  // 'results' (City Drive did exactly that and was counted as a pass).
  const ok = r.state === 'results' && r.park?.complete === true;
  if (!ok) failures++;
  console.log(`L${n} ${r.name}: ${ok ? 'PASS — parked by driving' : 'FAIL'}  (${r.t.toFixed(1)} s game time)`);
  r.log.forEach((l) => console.log(`    ${l}`));
  // A failure is usually at the end of a long route, so show the last stretch.
  if (!ok) r.trace.slice(-40).forEach((l) => console.log(l));
  console.log(
    `    lat ${p.lateral?.toFixed(2)} / ±${p.lateralTol?.toFixed(2)}  lon ${p.longitudinal?.toFixed(2)} / ±${p.longitudinalTol?.toFixed(2)}` +
      `  heading ${p.headingErrDeg?.toFixed(1)}°  bumps ${r.bumps}  cones ${r.cones}  prompt "${p.prompt}"`
  );
  // Close the results panel for the next level.
  await page.evaluate(() => window.__game.debugPlay(0));
}

console.log(`\n${levels.length - failures}/${levels.length} driven to completion, ${errors.length} page errors`);
await browser.close();
process.exit(failures || errors.length ? 1 : 0);
