/**
 * Level 13 layout sheet: title block, live checks, city plan, car park plans
 * per floor, long sections, the ramp probe table, and a three.js blockout with
 * a driver-eye camera that follows the route.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildLayout, CAR, headingDir, carFootprint } from './layout-model.mjs';
import probe from './ramp-probe.json';

const L = buildLayout();
const K = L.params.park;
const $ = (s) => document.querySelector(s);
const NS = 'http://www.w3.org/2000/svg';
const FLOOR_COLOR = ['var(--f0)', 'var(--f1)', 'var(--f2)', 'var(--f3)', 'var(--f4)'];
const FLOOR_HEX = [0x6f7680, 0x3e7cb1, 0x6a9a3a, 0xb2842b, 0x9a4f96];
const floorOfY = (y) => Math.max(0, Math.min(K.floors, Math.round(y / K.storey)));
const floorName = (f) => (f === 0 ? 'G' : f === K.floors ? 'Roof' : `Level ${f}`);

// --- title block -----------------------------------------------------------------
{
  const stats = [
    ['Route', `${L.estimate.metres} m`],
    ['Est. drive', `${L.estimate.seconds} s`],
    ['Par / limit', `${L.parTime} / ${L.timeLimit} s`],
    ['Floors', `G + ${K.floors - 1} + Roof`],
    ['Ramp grade', `${K.grade * 100} % · ${L.ramp.total.toFixed(1)} m`],
    ['Target', `Roof · ${K.bayPitch} m bay`],
  ];
  $('#stats').innerHTML = stats.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
}

// --- checks ---------------------------------------------------------------------------
$('#checks').innerHTML = `<tbody>${L.checks
  .map((c) => `<tr><td>${c.label}</td><td class="v">${c.value}</td><td class="l">${c.limit}</td><td><span class="chip ${c.ok ? 'pass' : 'fail'}">${c.ok ? 'PASS' : 'FAIL'}</span></td><td class="d">${c.detail}</td></tr>`)
  .join('')}</tbody>`;

// --- svg helpers ---------------------------------------------------------------------
function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  parent?.appendChild(e);
  return e;
}
const polyStr = (pts) => pts.map((p) => p.map((v) => v.toFixed(2)).join(',')).join(' ');
function boxPoly(b) {
  const r = b.rotY ?? 0;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const hx = b.s[0] / 2;
  const hz = (b.s[2] / 2) * Math.cos(b.pitch ?? 0);
  return [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([x, z]) => [b.c[0] + x * c + z * s, b.c[2] - x * s + z * c]);
}
function hatch(svg, id, color = 'var(--hatch)', gap = 3) {
  const defs = el('defs', {}, svg);
  const p = el('pattern', { id, width: gap, height: gap, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
  el('line', { x1: 0, y1: 0, x2: 0, y2: gap, stroke: color, 'stroke-width': gap * 0.35 }, p);
}
function dim(g, x1, y1, x2, y2, label, off = 0, size = 1.6) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * off;
  const ny = (dx / len) * off;
  const a = [x1 + nx, y1 + ny];
  const b = [x2 + nx, y2 + ny];
  el('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: 'var(--graphite)', 'stroke-width': size * 0.12 }, g);
  for (const p of [a, b]) el('line', { x1: p[0] - size * 0.35, y1: p[1] + size * 0.35, x2: p[0] + size * 0.35, y2: p[1] - size * 0.35, stroke: 'var(--graphite)', 'stroke-width': size * 0.15 }, g);
  const t = el('text', { x: (a[0] + b[0]) / 2 + nx * 0.25, y: (a[1] + b[1]) / 2 + ny * 0.25 - size * 0.4, 'font-size': size, 'text-anchor': 'middle', fill: 'var(--graphite)' }, g);
  if (Math.abs(dx) < Math.abs(dy)) t.setAttribute('transform', `rotate(-90 ${(a[0] + b[0]) / 2 + nx * 0.25} ${(a[1] + b[1]) / 2 + ny * 0.25 - size * 0.4})`);
  t.textContent = label;
}

// --- city plan ---------------------------------------------------------------------------
{
  const svg = $('#city');
  const H = L.params.city.half + 4;
  svg.setAttribute('viewBox', `${-H} ${-H} ${2 * H} ${2 * H}`);
  hatch(svg, 'hatch-park', 'var(--hatch)', 2.2);
  el('rect', { x: -H, y: -H, width: 2 * H, height: 2 * H, fill: '#f7f5ef' }, svg);
  const g = el('g', {}, svg);
  for (const s of L.sidewalks) el('rect', { x: s.x0, y: s.z0, width: s.x1 - s.x0, height: s.z1 - s.z0, fill: 'var(--paper-2)', stroke: 'var(--rule)', 'stroke-width': 0.3 }, g);
  for (const b of L.buildings) {
    const p = boxPoly(b.box);
    el('polygon', { points: polyStr(p), fill: '#d7d2c4', stroke: 'var(--graphite)', 'stroke-width': 0.35 }, g);
    const t = el('text', { x: b.box.c[0], y: b.box.c[2] + 1.4, 'font-size': 4, 'text-anchor': 'middle', fill: 'var(--graphite)' }, g);
    t.textContent = `${b.box.s[1]} m`;
  }
  el('rect', { x: -K.halfX, y: -K.halfZ, width: 2 * K.halfX, height: 2 * K.halfZ, fill: 'url(#hatch-park)', stroke: 'var(--ink)', 'stroke-width': 0.8 }, g);
  const pt = el('text', { x: 0, y: 2, 'font-size': 6, 'text-anchor': 'middle', 'font-weight': 600, fill: 'var(--ink)' }, g);
  pt.textContent = 'CAR PARK · G–R';
  // Street centrelines.
  for (const s of L.streets) {
    const [x1, y1, x2, y2] = s.axis === 'z' ? [s.at, s.from, s.at, s.to] : [s.from, s.at, s.to, s.at];
    el('line', { x1, y1, x2, y2, stroke: 'var(--rule)', 'stroke-width': 0.4, 'stroke-dasharray': '3 3' }, g);
  }
  for (const c of L.parkedCars.filter((c) => c.floor === 'street')) {
    el('polygon', { points: polyStr(boxPoly({ c: c.pos, s: [CAR.width, 1, CAR.length], rotY: c.heading })), fill: 'var(--graphite)' }, g);
  }
  // Route (street part in red, then floors in their colours).
  drawRoute(g, (p) => true, 1.1);
  // Spawn, pylon.
  const sp = L.spawn;
  el('polygon', { points: polyStr([[sp.pos[0], sp.pos[1] - 3], [sp.pos[0] + 3, sp.pos[1]], [sp.pos[0], sp.pos[1] + 3], [sp.pos[0] - 3, sp.pos[1]]]), fill: 'var(--route)' }, g);
  const st = el('text', { x: sp.pos[0], y: sp.pos[1] - 5, 'font-size': 5, 'text-anchor': 'middle', fill: 'var(--route)', 'font-weight': 600 }, g);
  st.textContent = 'START';
  const py = L.signs.find((s) => s.kind === 'pylon');
  el('circle', { cx: py.pos[0], cy: py.pos[2], r: 2.2, fill: 'var(--ink)' }, g);
  const pyt = el('text', { x: py.pos[0], y: py.pos[2] + 1.2, 'font-size': 3, 'text-anchor': 'middle', fill: 'var(--paper)', 'font-weight': 700 }, g);
  pyt.textContent = 'P';
  // Scale bar + north.
  el('line', { x1: -H + 8, y1: H - 8, x2: -H + 58, y2: H - 8, stroke: 'var(--ink)', 'stroke-width': 1 }, g);
  const sb = el('text', { x: -H + 33, y: H - 11, 'font-size': 4.5, 'text-anchor': 'middle' }, g);
  sb.textContent = '50 m';
  el('polygon', { points: `${H - 12},${-H + 20} ${H - 8},${-H + 8} ${H - 4},${-H + 20}`, fill: 'var(--ink)' }, g);
  const nt = el('text', { x: H - 8, y: -H + 27, 'font-size': 5, 'text-anchor': 'middle' }, g);
  nt.textContent = 'N';
  dim(g, L.params.city.streetsX[1] - 6, L.params.city.streetsZ[2] + 22, L.params.city.streetsX[1] + 6, L.params.city.streetsZ[2] + 22, '12 m', 0, 4);
}

function drawRoute(g, filter, width, floorOnly = null) {
  const pts = L.route.points;
  let run = [];
  let runFloor = null;
  const flush = () => {
    if (run.length > 1) {
      const color = runFloor === 'street' ? 'var(--route)' : FLOOR_COLOR[runFloor];
      el('polyline', { points: polyStr(run), fill: 'none', stroke: color, 'stroke-width': width, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, g);
    }
    run = [];
  };
  for (const p of pts) {
    if (!filter(p)) {
      flush();
      continue;
    }
    const inPark = Math.abs(p.x) <= K.halfX && Math.abs(p.z) <= K.halfZ;
    const f = inPark ? floorOfY(p.y + 0.4) : 'street';
    if (floorOnly !== null && f !== floorOnly && !(f === floorOnly - 1 && p.y > floorOnly * K.storey - K.storey + 0.05)) {
      flush();
      continue;
    }
    if (f !== runFloor) {
      if (run.length) run.push([p.x, p.z]);
      flush();
      runFloor = f;
    }
    run.push([p.x, p.z]);
  }
  flush();
}

// --- car park plan per floor -------------------------------------------------------------
let currentFloor = K.floors;
function drawPark(f) {
  const svg = $('#park');
  svg.innerHTML = '';
  const pad = 6;
  svg.setAttribute('viewBox', `${-K.halfX - pad} ${-K.halfZ - pad} ${2 * (K.halfX + pad)} ${2 * (K.halfZ + pad)}`);
  hatch(svg, 'hatch-hole', '#c9c2ae', 0.9);
  const g = el('g', {}, svg);
  const y = f * K.storey;
  el('rect', { x: -K.halfX - pad, y: -K.halfZ - pad, width: 2 * (K.halfX + pad), height: 2 * (K.halfZ + pad), fill: '#f7f5ef' }, g);
  // Slab: the floor's own rects; holes hatched.
  const slab = L.slabs.find((s) => s.floor === f);
  el('rect', { x: -K.halfX, y: -K.halfZ, width: 2 * K.halfX, height: 2 * K.halfZ, fill: 'url(#hatch-hole)' }, g);
  for (const [x0, z0, x1, z1] of slab.rects) el('rect', { x: x0, y: z0, width: x1 - x0, height: z1 - z0, fill: '#ecE8dc' }, g);
  // Ramps on this floor (leaving it) and arriving at it.
  for (const r of L.ramps.filter((r) => r.from === f || r.to === f)) {
    const leaving = r.from === f;
    const z0 = Math.min(r.lowZ, r.highZ);
    const z1 = Math.max(r.lowZ, r.highZ);
    el('rect', { x: r.x0, y: z0, width: r.x1 - r.x0, height: z1 - z0, fill: leaving ? '#fff' : 'none', stroke: FLOOR_COLOR[leaving ? r.to : r.from], 'stroke-width': 0.25, 'stroke-dasharray': leaving ? 'none' : '1 0.8' }, g);
    if (leaving) {
      // Up-arrow chevrons along travel.
      const dirZ = r.dir === 'north' ? -1 : 1;
      for (let d = 4; d < L.ramp.total - 2; d += 6) {
        const zc = r.lowZ + dirZ * d;
        const xc = (r.x0 + r.x1) / 2;
        el('polyline', { points: `${xc - 1.2},${zc - dirZ * 0.7} ${xc},${zc + dirZ * 0.5} ${xc + 1.2},${zc - dirZ * 0.7}`, fill: 'none', stroke: FLOOR_COLOR[r.to], 'stroke-width': 0.35 }, g);
      }
      const t = el('text', { x: (r.x0 + r.x1) / 2, y: (z0 + z1) / 2, 'font-size': 1.3, 'text-anchor': 'middle', fill: FLOOR_COLOR[r.to], transform: `rotate(-90 ${(r.x0 + r.x1) / 2} ${(z0 + z1) / 2})` }, g);
      t.textContent = `UP to ${r.to === K.floors ? 'R' : r.to} · ${K.grade * 100}%`;
    }
  }
  // Bays.
  for (const b of L.bays.filter((b) => b.floor === f)) {
    const s = b.x < 0 ? -1 : 1;
    const mouthX = b.x - s * (b.length / 2);
    el('polyline', { points: `${mouthX},${b.z - b.width / 2} ${b.x + s * (b.length / 2)},${b.z - b.width / 2} ${b.x + s * (b.length / 2)},${b.z + b.width / 2} ${mouthX},${b.z + b.width / 2}`, fill: 'none', stroke: 'var(--faint)', 'stroke-width': 0.12 }, g);
  }
  // Parked cars, walls, columns.
  for (const c of L.parkedCars.filter((c) => c.floor === f)) el('polygon', { points: polyStr(boxPoly({ c: c.pos, s: [CAR.width, 1, CAR.length], rotY: c.heading })), fill: '#b9b4a6', stroke: 'var(--graphite)', 'stroke-width': 0.1 }, g);
  for (const w of L.walls) {
    if (!['groundWall', 'parapet', 'holeParapet', 'column', 'booth', 'lamp'].includes(w.kind) || w.floor !== f) continue;
    el('polygon', { points: polyStr(boxPoly(w.box)), fill: 'var(--ink)' }, g);
  }
  for (const w of L.walls.filter((w) => w.kind === 'rampWall')) {
    const r = L.ramps.find((r) => Math.abs(w.box.c[0] - (r.x0 - 0.1)) < 0.01 || Math.abs(w.box.c[0] - (r.x1 + 0.1)) < 0.01);
    void r;
  }
  for (const r of L.ramps.filter((r) => r.from === f)) {
    const z0 = Math.min(r.lowZ, r.highZ);
    const z1 = Math.max(r.lowZ, r.highZ);
    for (const x of [r.x0 - 0.2, r.x1]) el('rect', { x, y: z0, width: 0.2, height: z1 - z0, fill: 'var(--graphite)' }, g);
  }
  // Target.
  if (L.target.floor === f) {
    const t = L.target;
    el('rect', { x: t.pos[0] - t.bay.length / 2, y: t.pos[1] - t.bay.width / 2, width: t.bay.length, height: t.bay.width, fill: 'none', stroke: 'var(--route)', 'stroke-width': 0.45 }, g);
    const tt = el('text', { x: t.pos[0], y: t.pos[1] + 0.5, 'font-size': 1.4, 'text-anchor': 'middle', fill: 'var(--route)', 'font-weight': 700 }, g);
    tt.textContent = 'TARGET';
  }
  // Route on this floor (the ramp up to the next floor included), with swept path at hairpins.
  const onFloor = (p) => Math.abs(p.x) <= K.halfX + 12 && Math.abs(p.z) <= K.halfZ + 12 && p.y >= y - 0.05 && p.y <= y + K.storey - 0.05;
  const swept = el('g', { opacity: 0.16 }, g);
  L.route.points.forEach((p, i) => {
    if (i % 3 || !onFloor(p) || p.radius === Infinity) return;
    el('polygon', { points: polyStr(carFootprint(p)), fill: FLOOR_COLOR[f] }, swept);
  });
  drawRoute(g, onFloor, 0.4);
  // Dimensions.
  dim(g, -K.halfX, -K.halfZ, K.halfX, -K.halfZ, `${2 * K.halfX} m`, -3.2, 1.6);
  dim(g, K.halfX, -K.halfZ, K.halfX, K.halfZ, `${2 * K.halfZ} m`, -3.2, 1.6);
  dim(g, -K.laneX - K.laneWidth / 2, 18, -K.laneX + K.laneWidth / 2, 18, `${K.laneWidth} m`, 0, 1.1);
  dim(g, K.laneX - K.laneWidth / 2, -18, K.laneX + K.laneWidth / 2, -18, `${K.laneWidth} m`, 0, 1.1);
  dim(g, -K.bayRowX - 0.4, -K.halfZ + 4 - K.bayPitch / 2, -K.bayRowX - 0.4, -K.halfZ + 4 + K.bayPitch / 2, `${K.bayPitch}`, -2.2, 1.1);
  const lbl = el('text', { x: -K.halfX, y: K.halfZ + 4.4, 'font-size': 2.2, fill: FLOOR_COLOR[f], 'font-weight': 700 }, g);
  lbl.textContent = `${floorName(f).toUpperCase()} · y ${y.toFixed(1)} m`;
  const hr = el('text', { x: 0, y: f % 2 === 1 ? -K.hairpinCentreZ - 6.4 : K.hairpinCentreZ + 7.4, 'font-size': 1.1, 'text-anchor': 'middle', fill: 'var(--graphite)' }, g);
  hr.textContent = f > 0 && f < K.floors ? `hairpin R ${K.hairpinR} m (rear axle)` : '';
}
{
  const host = $('#floors');
  for (let f = 0; f <= K.floors; f++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = f === 0 ? 'G' : f === K.floors ? 'R' : String(f);
    b.addEventListener('click', () => {
      currentFloor = f;
      host.querySelectorAll('button').forEach((x, i) => x.classList.toggle('on', i === f));
      drawPark(f);
    });
    host.append(b);
  }
  host.querySelectorAll('button')[currentFloor].classList.add('on');
  drawPark(currentFloor);
}

// --- long sections --------------------------------------------------------------------------
{
  const svg = $('#section');
  const VS = 1.5; // vertical exaggeration
  const z0 = -K.halfZ - 3;
  const z1 = K.halfZ + 3;
  const topY = K.floors * K.storey + 3;
  const laneH = (topY + 2) * VS;
  const W = z1 - z0;
  svg.setAttribute('viewBox', `${z0 - 6} ${-laneH + 1} ${W + 10} ${2 * laneH + 5}`);
  el('rect', { x: z0 - 6, y: -laneH + 1, width: W + 10, height: 2 * laneH + 5, fill: '#f7f5ef' }, svg);
  const lanes = [
    { name: 'LANE A · x −4 · rising north ←', x: -K.laneX, off: 0 },
    { name: 'LANE B · x +4 · rising south →', x: K.laneX, off: laneH + 8 },
  ];
  for (const lane of lanes) {
    const g = el('g', { transform: `translate(0 ${lane.off})` }, svg);
    const Y = (y) => -y * VS;
    // Floor slabs as cut through this lane.
    for (const s of L.slabs) {
      const segs = [];
      for (const [rx0, rz0, rx1, rz1] of s.rects) if (lane.x >= rx0 && lane.x <= rx1) segs.push([rz0, rz1]);
      for (const [a, b] of segs) el('rect', { x: a, y: Y(s.y), width: b - a, height: Math.max(0.3, s.thick) * VS, fill: 'var(--ink)' }, g);
      const t = el('text', { x: z1 + 1, y: Y(s.y) + 0.6, 'font-size': 1.4, fill: FLOOR_COLOR[s.floor] }, g);
      t.textContent = s.floor === 0 ? 'G' : s.floor === K.floors ? 'R' : String(s.floor);
    }
    // Ramps in this lane.
    for (const r of L.ramps.filter((r) => Math.abs((r.x0 + r.x1) / 2 - lane.x) < 0.01)) {
      el('polyline', { points: r.profile.map(([z, y]) => `${z},${Y(y)}`).join(' '), fill: 'none', stroke: FLOOR_COLOR[r.to], 'stroke-width': 0.6 }, g);
      el('polyline', { points: r.profile.map(([z, y]) => `${z},${Y(y) + 0.35 * VS}`).join(' '), fill: 'none', stroke: FLOOR_COLOR[r.to], 'stroke-width': 0.25 }, g);
      // Grade labels at piece midpoints.
      for (let i = 0; i < r.profile.length - 1; i++) {
        const [za, ya] = r.profile[i];
        const [zb, yb] = r.profile[i + 1];
        const t = el('text', { x: (za + zb) / 2, y: Y((ya + yb) / 2) - 1.2, 'font-size': 1.1, 'text-anchor': 'middle', fill: FLOOR_COLOR[r.to] }, g);
        t.textContent = `${(Math.abs(yb - ya) / Math.abs(zb - za) * 100).toFixed(0)}%`;
      }
      // Headroom at the slab edge above the low end.
      const above = L.slabs.find((s) => s.floor === r.to);
      const edgeZ = r.dir === 'north' ? above.hole.z1 : above.hole.z0;
      const d = Math.abs(edgeZ - r.lowZ);
      let rise = 0;
      let left = d;
      for (const p of [[K.transition, K.grade / 2], [L.ramp.run, K.grade], [K.transition, K.grade / 2]]) {
        const tt = Math.min(left, p[0]);
        if (tt <= 0) break;
        rise += tt * p[1];
        left -= tt;
      }
      const ySurf = r.from * K.storey + rise;
      const yUnder = above.y - above.thick;
      el('line', { x1: edgeZ, y1: Y(ySurf), x2: edgeZ, y2: Y(yUnder), stroke: 'var(--route)', 'stroke-width': 0.3 }, g);
      const ht = el('text', { x: edgeZ + (r.dir === 'north' ? 1 : -1), y: Y((ySurf + yUnder) / 2), 'font-size': 1.2, 'text-anchor': r.dir === 'north' ? 'start' : 'end', fill: 'var(--route)' }, g);
      ht.textContent = `${(yUnder - ySurf).toFixed(2)} m`;
    }
    // Storey dimension.
    dim(g, z0 - 3, Y(0), z0 - 3, Y(K.storey), `${K.storey} m`, 0, 1.1);
    const name = el('text', { x: z0, y: -laneH + 3, 'font-size': 1.6, 'font-weight': 600, fill: 'var(--ink)' }, g);
    name.textContent = lane.name;
    const n = el('text', { x: z0, y: 3, 'font-size': 1.2, fill: 'var(--graphite)' }, g);
    n.textContent = `N ← z ${z0}`;
    const sN = el('text', { x: z1, y: 3, 'font-size': 1.2, 'text-anchor': 'end', fill: 'var(--graphite)' }, g);
    sN.textContent = `z +${z1} → S`;
  }
}

// --- probe table ------------------------------------------------------------------------------
{
  const cols = [
    ['grade', 'Grade'], ['deg', '°'], ['totalM', 'Ramp m'], ['P_driftCm', 'P drift cm'], ['brake_driftCm', 'Brake drift cm'],
    ['D_noInput_2s_cm', 'Roll back, no pedal, 2 s cm'], ['restart_rollbackCm', 'Restart roll back cm'], ['restart_t1ms', 'Restart to 1 m/s s'],
    ['ascent_s', 'Ascent s'], ['ascent_minWheels', 'Min wheels'], ['ascent_chassisHits', 'Scrapes'], ['descent_noInput_vmaxKmh', 'Coast down km/h'],
  ];
  const chosen = `${Math.round(K.grade * 100)}%`;
  $('#probe').innerHTML = `<thead><tr>${cols.map(([, h]) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${probe.rows
    .map((r) => `<tr class="${r.grade === chosen ? 'chosen' : ''}">${cols.map(([k]) => `<td>${r[k]}</td>`).join('')}</tr>`)
    .join('')}</tbody>`;
}

// --- 3D blockout ---------------------------------------------------------------------------------
const host = $('#viewer');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
host.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xcfdbe2);
scene.fog = new THREE.Fog(0xcfdbe2, 60, 320);
const camera = new THREE.PerspectiveCamera(68, 1, 0.05, 900);
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enabled = false;
orbit.target.set(0, 6, 0);

scene.add(new THREE.HemisphereLight(0xe4eef5, 0x8d8779, 1.4));
const sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
sun.position.set(-80, 120, 60);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -130, right: 130, top: 130, bottom: -130, near: 10, far: 400 });
sun.shadow.bias = -0.0008;
scene.add(sun);

const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
const M = {
  street: mat(0x6f7174), sidewalk: mat(0xbdb8ab), slab: mat(0xcbc6bd), slabG: mat(0xb9b4aa), ramp: mat(0xd5cfc2),
  wall: mat(0xa8a296), column: mat(0xdedad1), building: [0xc9c1b3, 0xb7c0c4, 0xd6cbb8, 0xa9b3a6, 0xc4b6b0].map(mat),
  car: [0xcf6f5d, 0x6b8fb3, 0x8fae7e, 0xdedad2, 0x8c8f96, 0xd5b48a, 0x5d5a73].map(mat), booth: mat(0x3e7cb1), lamp: mat(0x55585c),
};
const BOX = new THREE.BoxGeometry(1, 1, 1);
function addBox(b, m, shadow = true) {
  const mesh = new THREE.Mesh(BOX, m);
  mesh.scale.set(...b.s);
  mesh.position.set(...b.c);
  mesh.rotation.set(b.pitch ?? 0, b.rotY ?? 0, 0, 'YXZ');
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}
// Ground and streets.
addBox({ c: [0, -0.06, 0], s: [240, 0.1, 240] }, M.street, false);
for (const s of L.sidewalks) addBox({ c: [(s.x0 + s.x1) / 2, 0.02, (s.z0 + s.z1) / 2], s: [s.x1 - s.x0, 0.04, s.z1 - s.z0] }, M.sidewalk, false);
for (const b of L.buildings) addBox(b.box, M.building[b.palette]);
// Street markings: centre dashes.
{
  const dash = new THREE.MeshBasicMaterial({ color: 0xe9e4d2 });
  for (const s of L.streets) {
    for (let t = s.from + 2; t < s.to; t += 6) {
      const m = new THREE.Mesh(BOX, dash);
      m.scale.set(s.axis === 'z' ? 0.15 : 3, 0.02, s.axis === 'z' ? 3 : 0.15);
      m.position.set(s.axis === 'z' ? s.at : t, 0.02, s.axis === 'z' ? t : s.at);
      scene.add(m);
    }
  }
}
// Car park.
for (const s of L.slabs) {
  for (const [x0, z0, x1, z1] of s.rects) {
    const th = Math.max(s.thick, 0.05);
    addBox({ c: [(x0 + x1) / 2, s.y - th / 2 + (s.floor === 0 ? 0.04 : 0), (z0 + z1) / 2], s: [x1 - x0, th, z1 - z0] }, s.floor === 0 ? M.slabG : M.slab);
  }
}
for (const r of L.ramps) for (const p of r.pieces) addBox(p, M.ramp);
for (const w of L.walls) {
  if (w.kind === 'boundary') continue;
  if (w.kind === 'parkedCar') continue;
  addBox(w.box, w.kind === 'column' ? M.column : w.kind === 'booth' ? M.booth : w.kind === 'lamp' ? M.lamp : M.wall);
}
for (const c of L.parkedCars) {
  const body = addBox({ c: [c.pos[0], c.pos[1] + 0.55, c.pos[2]], s: [CAR.width, 0.8, CAR.length], rotY: c.heading }, M.car[c.paint % 7]);
  const cab = addBox({ c: [c.pos[0], c.pos[1] + 1.15, c.pos[2]], s: [CAR.width * 0.86, 0.5, CAR.length * 0.5], rotY: c.heading }, M.car[(c.paint + 3) % 7]);
  void body;
  void cab;
}
// Bay lines (roof + target) and target glow.
{
  const paint = new THREE.MeshBasicMaterial({ color: 0xf2efe6 });
  for (const b of L.bays) {
    const s = b.x < 0 ? -1 : 1;
    for (const dz of [-b.width / 2, b.width / 2]) {
      const m = new THREE.Mesh(BOX, paint);
      m.scale.set(b.length, 0.02, 0.1);
      m.position.set(b.x, b.y + 0.02, b.z + dz);
      scene.add(m);
    }
    void s;
  }
  const t = L.target;
  const glow = new THREE.Mesh(BOX, new THREE.MeshBasicMaterial({ color: 0x8fe6bb, transparent: true, opacity: 0.55 }));
  glow.scale.set(t.bay.length - 0.3, 0.03, t.bay.width - 0.3);
  glow.position.set(t.pos[0], t.y + 0.03, t.pos[1]);
  scene.add(glow);
}
// Signs.
function textPlane(text, w, h, bg = '#1f4e8c', fg = '#ffffff') {
  const cv = document.createElement('canvas');
  cv.width = Math.max(64, Math.round(256 * (w / h)));
  cv.height = 256;
  const c = cv.getContext('2d');
  c.fillStyle = bg;
  c.fillRect(0, 0, cv.width, cv.height);
  c.fillStyle = fg;
  c.font = '700 170px "IBM Plex Sans Condensed", Arial Narrow, sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(text, cv.width / 2, cv.height / 2 + 8, cv.width * 0.92);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
}
const faceYaw = { south: 0, north: Math.PI, west: -Math.PI / 2, east: Math.PI / 2 };
for (const s of L.signs) {
  if (s.kind === 'pylon') {
    addBox({ c: [s.pos[0], s.height / 2, s.pos[2]], s: [0.5, s.height, 0.5] }, M.lamp);
    for (const face of s.faces) {
      const p = textPlane('P', s.panel, s.panel);
      p.position.set(s.pos[0], s.height - s.panel / 2, s.pos[2]);
      p.rotation.y = faceYaw[face];
      p.translateZ(0.3);
      scene.add(p);
    }
  } else if (s.kind === 'floorNumber') {
    const p = textPlane(s.text, s.size, s.size, '#00000000', '#f2efe6');
    p.material.transparent = true;
    p.rotation.x = -Math.PI / 2;
    p.position.set(s.pos[0], s.pos[1] + 0.02, s.pos[2]);
    scene.add(p);
  } else {
    const p = textPlane(s.text, s.width, s.height, s.kind === 'levelSign' ? '#23262b' : '#1f4e8c');
    p.position.set(...s.pos);
    p.rotation.y = faceYaw[s.facing] ?? 0;
    scene.add(p);
  }
}
// Floor arrows.
{
  const arrowMat = new THREE.MeshBasicMaterial({ color: 0xf2efe6, side: THREE.DoubleSide });
  const shape = new THREE.Shape();
  shape.moveTo(0, 1.6); shape.lineTo(-0.9, 0.2); shape.lineTo(-0.32, 0.2); shape.lineTo(-0.32, -1.6); shape.lineTo(0.32, -1.6); shape.lineTo(0.32, 0.2); shape.lineTo(0.9, 0.2); shape.closePath(); // tip at +y: after the -90° X turn it points along the arrow's heading
  const geo = new THREE.ShapeGeometry(shape);
  for (const a of L.arrows) {
    const m = new THREE.Mesh(geo, arrowMat);
    m.rotation.set(-Math.PI / 2, 0, 0);
    const g = new THREE.Group();
    g.add(m);
    g.position.set(a.pos[0], a.pos[1] + 0.03, a.pos[2]);
    g.rotation.y = a.heading;
    if (a.kind === 'left') m.rotation.z = Math.PI / 4;
    if (a.kind === 'right') m.rotation.z = -Math.PI / 4;
    scene.add(g);
  }
}
// Route line.
{
  const pts = L.route.points.map((p) => new THREE.Vector3(p.x, p.y + 0.08, p.z));
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xc8412b }));
  scene.add(line);
}
// The player's car (a box) rides the route in Drive view for scale.
const me = new THREE.Group();
{
  const body = new THREE.Mesh(BOX, mat(0xcf6f5d));
  body.scale.set(CAR.width, 0.8, CAR.length);
  body.position.set(0, 0.55, 0);
  const cab = new THREE.Mesh(BOX, mat(0x3b3936));
  cab.scale.set(CAR.width * 0.86, 0.5, CAR.length * 0.5);
  cab.position.set(0, 1.15, 0.2);
  me.add(body, cab);
  scene.add(me);
}

// --- route playback ---------------------------------------------------------------------------------
const pts = L.route.points;
const total = L.route.length;
let s = 0;
let playing = true;
let speed = 1;
let mode = 'drive';
function sampleAt(dist) {
  let lo = 0;
  let hi = pts.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (pts[mid].s <= dist) lo = mid;
    else hi = mid;
  }
  const a = pts[lo];
  const b = pts[hi];
  const u = b.s > a.s ? (dist - a.s) / (b.s - a.s) : 0;
  let dh = b.heading - a.heading;
  while (dh > Math.PI) dh -= Math.PI * 2;
  while (dh < -Math.PI) dh += Math.PI * 2;
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u, heading: a.heading + dh * u, idx: lo };
}
function speedAt(p) {
  const inPark = Math.abs(p.x) <= K.halfX && Math.abs(p.z) <= K.halfZ;
  return inPark ? 2.6 : 5.5;
}
function place() {
  const p = sampleAt(s);
  const ahead = sampleAt(Math.min(total, s + 2.62));
  const pitch = Math.atan2(ahead.y - p.y, 2.62);
  const [fx, fz] = headingDir(p.heading);
  // Car centre is half a wheelbase ahead of the rear axle.
  me.position.set(p.x + fx * 1.31, p.y + (ahead.y - p.y) / 2, p.z + fz * 1.31);
  me.rotation.set(pitch, p.heading, 0, 'YXZ');
  if (mode === 'drive') {
    me.visible = false;
    // Eye: 0.99 m ahead of the rear axle, 0.36 m left, 1.20 m up.
    const lx = -fz;
    const lz = fx;
    camera.position.set(p.x + fx * 0.99 + lx * -0.36, p.y + (ahead.y - p.y) * 0.38 + 1.2, p.z + fz * 0.99 + lz * -0.36);
    camera.rotation.set(pitch + (-6 * Math.PI) / 180, p.heading, 0, 'YXZ');
    camera.fov = 68;
    camera.updateProjectionMatrix();
  } else {
    me.visible = true;
  }
  const inPark = Math.abs(p.x) <= K.halfX && Math.abs(p.z) <= K.halfZ;
  const f = floorOfY(p.y + 0.4);
  $('#floor-chip').textContent = inPark ? floorName(f) : 'Street';
  $('#floor-chip').style.background = inPark ? getComputedStyle(document.documentElement).getPropertyValue(`--f${f}`) : 'var(--route)';
  $('#scrub-label').textContent = `${s.toFixed(0)} / ${total.toFixed(0)} m`;
  $('#scrub').value = String(Math.round((s / total) * 1000));
}
function resize() {
  const w = host.clientWidth;
  const h = host.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(host);
resize();

$('#play').addEventListener('click', () => {
  playing = !playing;
  $('#play').textContent = playing ? '❚❚' : '▶';
});
document.querySelectorAll('[data-speed]').forEach((b) =>
  b.addEventListener('click', () => {
    speed = Number(b.dataset.speed);
    document.querySelectorAll('[data-speed]').forEach((x) => x.classList.toggle('on', x === b));
  })
);
$('#scrub').addEventListener('input', (e) => {
  s = (Number(e.target.value) / 1000) * total;
  place();
});
function setMode(m) {
  mode = m;
  $('#cam-drive').classList.toggle('on', m === 'drive');
  $('#cam-orbit').classList.toggle('on', m === 'orbit');
  orbit.enabled = m === 'orbit';
  if (m === 'orbit') {
    camera.position.set(70, 75, 95);
    orbit.target.set(0, 6, 0);
    orbit.update();
  }
  place();
}
$('#cam-drive').addEventListener('click', () => setMode('drive'));
$('#cam-orbit').addEventListener('click', () => setMode('orbit'));

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
if (reduce) {
  playing = false;
  $('#play').textContent = '▶';
}
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (playing) {
    s += speedAt(sampleAt(s)) * dt * speed;
    if (s >= total) s = 0;
    place();
  }
  if (mode === 'orbit') orbit.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
place();
requestAnimationFrame(frame);

window.__sheet = {
  layout: L,
  seek(d) { s = d; place(); renderer.render(scene, camera); },
  mode: setMode,
  pause() { playing = false; },
  render() { renderer.render(scene, camera); },
  floor(f) { document.querySelectorAll('#floors button')[f].click(); },
};
