/**
 * Wheel Lab — a live bench for the sport wheel, the articulated hands and the
 * hand-over-hand choreography, built from the real game modules:
 *
 *   CarModel.createSedanShell({ interior: true })   the cabin you sit in
 *   Cockpit                                         dash, cluster, lever, screen
 *   SteeringWheel / HandRig / HandModel / RimCurve  the new work (src/vehicle)
 *   HandRigChecks                                   the same assertions as the probe
 *
 * Steering reproduces Car.js exactly (0.45 s to lock, 0.40 s back) and the
 * simulation runs at a fixed 60 Hz, so what the checks see here is what the
 * probe will see in the game.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { createSedanShell, createParkedCar } from '../../src/vehicle/CarModel.js';
import { createCockpit } from '../../src/vehicle/Cockpit.js';
import { createDashCluster } from '../../src/ui/DashCluster.js';
import { createLightingRig } from '../../src/render/Renderer.js';
import { createSteeringWheel } from '../../src/vehicle/SteeringWheel.js';
import { createHandRig } from '../../src/vehicle/HandRig.js';
import { POSE_TABLES } from '../../src/vehicle/HandModel.js';
import { createRigChecker, buildSweep, steerStep, LIMITS } from '../../src/vehicle/HandRigChecks.js';
import {
  RIDE_HEIGHT, EYE, EYE_TILT_DEG, SEAT_ADJUST, WHEEL_SPORT, HAND, HAND_RIG, WHEEL_HUB,
  CLUSTER_POS, CLUSTER_SIZE, UPPER_ARM, FOREARM,
} from '../../src/vehicle/Dimensions.js';
import { COLORS } from '../../src/world/Palette.js';

const TAU = Math.PI * 2;
const D2R = Math.PI / 180;
const STEP = 1 / 60;
const $ = (s) => document.querySelector(s);
const clone = (o) => JSON.parse(JSON.stringify(o));
const hex = (n) => '#' + n.toString(16).padStart(6, '0');

// --- parameters -------------------------------------------------------------
const DEFAULTS = {
  wheel: clone(WHEEL_SPORT),
  colors: {
    rim: hex(COLORS.wheelRim),
    spoke: hex(COLORS.wheelSpoke),
    hub: hex(COLORS.wheelHub),
    stripe: hex(COLORS.wheelStripe),
  },
  hand: clone(HAND),
  rig: { ...clone(HAND_RIG), poseTables: clone(POSE_TABLES) },
};

function deepMerge(base, over) {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) return over ?? base;
  const out = { ...base };
  for (const k of Object.keys(over ?? {})) {
    out[k] = k in base && typeof base[k] === 'object' && !Array.isArray(base[k]) ? deepMerge(base[k], over[k]) : over[k];
  }
  return out;
}
const getPath = (o, path) => path.split('.').reduce((a, k) => a?.[k], o);
function setPath(o, path, v) {
  const ks = path.split('.');
  const last = ks.pop();
  const t = ks.reduce((a, k) => a[k], o);
  t[last] = v;
}

let params = clone(DEFAULTS);
let lastMeasured = null;

// --- renderer + scene ---------------------------------------------------------
const stage = $('#stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(68, 1, 0.05, 400);
const composer = new EffectComposer(
  renderer,
  new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 })
);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new OutputPass());

const light = createLightingRig('open', { width: 40, depth: 40, ceilingHeight: 3.2 });
scene.add(light.group);
scene.fog = light.fog;
if (light.background) scene.add(light.background);

// A slice of open deck so the windscreen has something true to look at.
{
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(80, 0.2, 80),
    new THREE.MeshLambertMaterial({ color: COLORS.concreteFloor })
  );
  deck.position.y = -0.1;
  deck.receiveShadow = true;
  scene.add(deck);
  const paint = new THREE.MeshBasicMaterial({ color: 0xf2efe6 });
  for (let i = -3; i <= 3; i++) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.01, 5.2), paint);
    line.position.set(i * 2.7 + 1.35, 0.005, -9.5);
    scene.add(line);
  }
  for (const [x, i] of [[-2.7, 1], [2.7, 3], [5.4, 5]]) {
    const car = createParkedCar(COLORS.carPaints[i % COLORS.carPaints.length]);
    const g = car.group ?? car;
    g.position.set(x, RIDE_HEIGHT, -9.4);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    scene.add(g);
  }
  const colMat = new THREE.MeshLambertMaterial({ color: COLORS.concreteColumn });
  for (const x of [-8, 8]) {
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.6, 3.2, 0.6), colMat);
    col.position.set(x, 1.6, -13);
    col.castShadow = true;
    scene.add(col);
  }
}

const carGroup = new THREE.Group();
carGroup.position.y = RIDE_HEIGHT;
scene.add(carGroup);
{
  const shell = createSedanShell({ paint: COLORS.carPaints[0], interior: true });
  carGroup.add(shell.group);
}

// Cockpit with the real cluster canvas and stand-in reversing feed.
const cluster = createDashCluster();
const clusterTexture = new THREE.CanvasTexture(cluster.canvas);
clusterTexture.colorSpace = THREE.SRGBColorSpace;
const feedCanvas = document.createElement('canvas');
feedCanvas.width = 320;
feedCanvas.height = 192;
{
  const c = feedCanvas.getContext('2d');
  const g = c.createLinearGradient(0, 0, 0, 192);
  g.addColorStop(0, '#9fb3bd');
  g.addColorStop(0.55, '#c9c4ba');
  g.addColorStop(1, '#8d8a84');
  c.fillStyle = g;
  c.fillRect(0, 0, 320, 192);
  c.strokeStyle = '#f2efe6';
  c.lineWidth = 5;
  c.beginPath();
  c.moveTo(70, 192); c.lineTo(130, 90);
  c.moveTo(250, 192); c.lineTo(190, 90);
  c.stroke();
}
const feedTexture = new THREE.CanvasTexture(feedCanvas);
feedTexture.colorSpace = THREE.SRGBColorSpace;
const guideCanvas = document.createElement('canvas');
guideCanvas.width = guideCanvas.height = 4;
const guideTexture = new THREE.CanvasTexture(guideCanvas);

const cockpit = createCockpit({ clusterTexture, screenTexture: feedTexture, guidelineTexture: guideTexture });
carGroup.add(cockpit.group);
// The lab's wheel replaces the cockpit's: detach the old rim group, keep the column.
{
  let oldRim = null;
  cockpit.group.traverse((o) => { if (o.geometry?.type === 'TorusGeometry') oldRim = o; });
  oldRim?.parent?.removeFromParent();
}

// --- wheel + rig (rebuilt when parameters change) ------------------------------
let wheel = null;
let rig = null;
let checker = null;
let steerNorm = 0;
let gear = 'P';
let grabEvents = [];

function build() {
  const keepSteer = steerNorm;
  wheel?.dispose();
  rig?.dispose();
  wheel = createSteeringWheel({ params: params.wheel, colors: hexColors(params.colors) });
  cockpit.group.add(wheel.pivot);
  rig = createHandRig({
    wheel,
    shifterKnobLocal: cockpit.shifterKnobLocal,
    onShifterGrabbed: (g) => {
      cockpit.setGear(g);
      grabEvents.push({ gear: g, frame: simFrame });
    },
    params: params.rig,
    handParams: params.hand,
  });
  carGroup.add(rig.group);
  wheel.setAngle(-keepSteer * TAU);
  rig.snapToRest(keepSteer);
  checker = createRigChecker({ wheel });
  buildDomainOverlay();
  updateWheelChecks();
  drawReach();
  refreshExport();
}
function hexColors(c) {
  const o = {};
  for (const k of Object.keys(c)) o[k] = parseInt(String(c[k]).replace('#', ''), 16);
  return o;
}

// --- overlays -------------------------------------------------------------------
const overlay = new THREE.Group();
overlay.renderOrder = 999;
carGroup.add(overlay);
const lineMat = (color) => new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.95 });
const dotMat = (color) => new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true });
let domainGroup = null;

function buildDomainOverlay() {
  domainGroup?.removeFromParent();
  domainGroup = new THREE.Group();
  domainGroup.renderOrder = 999;
  const r = wheel.curve.R + wheel.curve.tube + 0.018;
  const arc = (a0, a1, color, rr = r) => {
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const a = (a0 + ((a1 - a0) * i) / 40) * D2R;
      pts.push(new THREE.Vector3(Math.sin(a) * rr, Math.cos(a) * rr, 0.004));
    }
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat(color));
    l.renderOrder = 999;
    domainGroup.add(l);
  };
  const tick = (a, color, len) => {
    const s = Math.sin(a * D2R);
    const c = Math.cos(a * D2R);
    const pts = [new THREE.Vector3(s * (r - len), c * (r - len), 0.004), new THREE.Vector3(s * (r + len), c * (r + len), 0.004)];
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat(color));
    l.renderOrder = 999;
    domainGroup.add(l);
  };
  const P = rig.params;
  for (const [lo, hi] of [P.domainLeft, P.domainRight]) {
    arc(lo, hi, 0x8fe6bb);
    tick(lo, 0xe0857b, 0.02);
    tick(hi, 0xe0857b, 0.02);
    tick(lo + P.softMargin, 0xe8c98a, 0.012);
    tick(hi - P.softMargin, 0xe8c98a, 0.012);
  }
  tick(-P.rest, 0xffffff, 0.008);
  tick(P.rest, 0xffffff, 0.008);
  wheel.pivot.add(domainGroup);
}

const contactDots = {
  left: new THREE.Mesh(new THREE.SphereGeometry(0.006, 10, 8), dotMat(0x8fe6bb)),
  right: new THREE.Mesh(new THREE.SphereGeometry(0.006, 10, 8), dotMat(0x8fe6bb)),
};
const reachLines = {
  left: new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]), lineMat(0x8fe6bb)),
  right: new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]), lineMat(0x8fe6bb)),
};
const sepLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), lineMat(0xffffff));
const sightLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]), lineMat(0xe3c98f));
for (const o of [contactDots.left, contactDots.right, reachLines.left, reachLines.right, sepLine, sightLine]) {
  o.renderOrder = 999;
  overlay.add(o);
}
const STATE_COLOR = { GRIP: 0x8fe6bb, SLIP: 0xe8c98a, RELEASE: 0xb8c8ff, TRAVEL: 0xb8c8ff, REGRIP: 0xb8c8ff, SETTLE: 0xb8c8ff, SHIFT: 0xe3c98f };

function setLine(line, pts) {
  const a = line.geometry.attributes.position;
  pts.forEach((p, i) => a.setXYZ(i, p[0], p[1], p[2]));
  a.needsUpdate = true;
  line.geometry.computeBoundingSphere();
}

// --- seat, views ------------------------------------------------------------------
const seat = { x: 0, y: 0, z: 0, tiltDeg: EYE_TILT_DEG };
let view = 'driver';
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enabled = false;
orbit.enableDamping = true;
const hubWorld = new THREE.Vector3(WHEEL_HUB[0], WHEEL_HUB[1] + RIDE_HEIGHT, WHEEL_HUB[2]);

function setView(v) {
  view = v;
  document.querySelectorAll('#views button').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
  orbit.enabled = v === 'orbit';
  camera.near = 0.02;
  if (v === 'orbit') {
    camera.position.set(hubWorld.x + 0.9, hubWorld.y + 0.45, hubWorld.z + 0.9);
    orbit.target.copy(hubWorld);
    orbit.update();
  }
  camera.fov = v === 'closeup' ? 40 : 68;
  camera.updateProjectionMatrix();
}

const tmpV = new THREE.Vector3();
function placeCamera() {
  camera.up.set(0, 1, 0);
  if (view === 'driver') {
    camera.near = 0.05;
    camera.position.set(EYE[0] + seat.x, EYE[1] + seat.y + RIDE_HEIGHT, EYE[2] + seat.z);
    camera.rotation.set(seat.tiltDeg * D2R, 0, 0, 'YXZ');
  } else if (view === 'passenger') {
    camera.position.set(0.36, EYE[1] + RIDE_HEIGHT - 0.02, 0.3);
    camera.lookAt(hubWorld.x + 0.02, hubWorld.y + 0.02, hubWorld.z);
  } else if (view === 'above') {
    wheel.wheelNormalLocal(tmpV);
    camera.position.copy(hubWorld).addScaledVector(tmpV, 0.42).add(new THREE.Vector3(0, 0.2, 0));
    camera.lookAt(hubWorld);
  } else if (view === 'closeup') {
    const c = rig.hands.right.contact;
    camera.position.set(c.x + 0.26, c.y + RIDE_HEIGHT + 0.1, c.z + 0.2);
    camera.lookAt(c.x - 0.02, c.y + RIDE_HEIGHT, c.z);
  } else if (view === 'custom') {
    // set by __lab.look()
  } else {
    orbit.update();
  }
  camera.updateMatrixWorld();
}

function resize() {
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);

// --- input ----------------------------------------------------------------------------
const keys = { left: false, right: false };
let scrubbing = false;
let timeScale = 1;
let paused = false;
let stepOnce = false;
let sweeping = false;

function setGear(g) {
  if (g === gear) return;
  gear = g;
  document.querySelectorAll('#gears button').forEach((b) => b.classList.toggle('on', b.dataset.gear === g));
  rig.beginShift(g);
}

addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea')) return;
  const k = e.key.toLowerCase();
  if (k === 'a' || e.key === 'ArrowLeft') keys.left = true;
  else if (k === 'd' || e.key === 'ArrowRight') keys.right = true;
  else if ('prnd'.includes(k) && k.length === 1) setGear(k.toUpperCase());
  else if (k === ' ') { paused = !paused; syncTime(); }
  else if (k === '.') { paused = true; stepOnce = true; syncTime(); }
  else return;
  e.preventDefault();
});
addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'a' || e.key === 'ArrowLeft') keys.left = false;
  if (k === 'd' || e.key === 'ArrowRight') keys.right = false;
});
addEventListener('blur', () => { keys.left = keys.right = false; });

for (const [id, side] of [['#hold-left', 'left'], ['#hold-right', 'right']]) {
  const b = $(id);
  const on = (e) => { e.preventDefault(); keys[side] = true; b.classList.add('on'); b.setPointerCapture?.(e.pointerId); };
  const off = () => { keys[side] = false; b.classList.remove('on'); };
  b.addEventListener('pointerdown', on);
  b.addEventListener('pointerup', off);
  b.addEventListener('pointercancel', off);
  b.addEventListener('lostpointercapture', off);
}
const scrub = $('#scrub');
scrub.addEventListener('input', () => { scrubbing = true; steerNorm = Number(scrub.value); });
scrub.addEventListener('change', () => { scrubbing = false; });
scrub.addEventListener('pointerup', () => { scrubbing = false; });
$('#gears').addEventListener('click', (e) => { const g = e.target.closest('button')?.dataset.gear; if (g) setGear(g); });
$('#views').addEventListener('click', (e) => { const v = e.target.closest('button')?.dataset.view; if (v) setView(v); });
document.querySelectorAll('[data-scale]').forEach((b) =>
  b.addEventListener('click', () => { timeScale = Number(b.dataset.scale); paused = false; syncTime(); })
);
$('#pause').addEventListener('click', () => { paused = !paused; syncTime(); });
$('#step').addEventListener('click', () => { paused = true; stepOnce = true; syncTime(); });
function syncTime() {
  document.querySelectorAll('[data-scale]').forEach((b) => b.classList.toggle('on', !paused && Number(b.dataset.scale) === timeScale));
  $('#pause').classList.toggle('on', paused);
}

document.querySelectorAll('.tabs button').forEach((b) =>
  b.addEventListener('click', () => {
    document.querySelectorAll('.tabs button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    document.querySelectorAll('.tab').forEach((t) => { t.hidden = t.id !== `tab-${b.dataset.tab}`; });
    if (b.dataset.tab === 'export') refreshExport();
  })
);

// --- simulation step -------------------------------------------------------------------
let simFrame = 0;
let lastDebug = null;
let lastViolations = [];

function simulate(dt, want, { check = true, checkerRef = checker, seq = 'live' } = {}) {
  simFrame++;
  if (!scrubbing) steerNorm = steerStep(steerNorm, want, dt);
  wheel.setAngle(-steerNorm * TAU);
  rig.update(dt, { steerNorm });
  cockpit.update(dt, { wheelAngleRad: -steerNorm * TAU, throttle: false, brake: gear !== 'P', reversing: gear === 'R' });
  if (check) {
    lastDebug = rig.debug('corners');
    const v = checkerRef.check(lastDebug, { seq, dt, shifting: rig.isShifting });
    if (v.length) lastViolations = v.concat(lastViolations).slice(0, 6);
  }
}

// --- checks UI ---------------------------------------------------------------------------
const LIVE_ROWS = [
  ['Contact error', (s) => s.maxContactErr, (v) => fmtCm(v), `${LIMITS.contactMax * 100} cm`, (v) => v <= LIMITS.contactMax],
  ['Penetration', (s) => s.maxPen, (v) => fmtCm(v), `${LIMITS.penetration * 100} cm`, (v) => v <= LIMITS.penetration],
  ['Hand separation', (s) => s.minSep, (v) => (Number.isFinite(v) ? fmtCm(v) : '—'), `≥ ${LIMITS.separation * 100} cm`, (v) => v >= LIMITS.separation],
  ['Arm extension', (s) => s.maxExt, (v) => v.toFixed(3), `${LIMITS.extension}`, (v) => v <= LIMITS.extension],
  ['Travel clearance', (s) => s.minTravelClear, (v) => (Number.isFinite(v) ? fmtCm(v) : '—'), `≥ ${LIMITS.travelClear * 100} cm`, (v) => !Number.isFinite(v) || v >= LIMITS.travelClear],
  ['Finger speed', (s) => s.maxFinger, (v) => `${v.toFixed(1)}°/f`, `${LIMITS.fingerStep}°/f`, (v) => v <= LIMITS.fingerStep + 1e-6],
  ['Elbow jump', (s) => s.maxElbow, (v) => fmtCm(v), `${LIMITS.elbowCarried * 100} cm`, (v) => v <= LIMITS.elbowCarried],
  ['Free-hand jump', (s) => Math.max(0, ...['RELEASE', 'TRAVEL', 'REGRIP', 'SETTLE', 'SHIFT'].map((k) => s.maxJump[k] ?? 0)), (v) => fmtCm(v), `${LIMITS.jumpFree * 100} cm`, (v) => v <= LIMITS.jumpFree],
  ['Both hands off', (s) => s.bothOff, (v) => `${v} f`, '0', (v) => v === 0],
  ['Violations', (s) => s.violations, (v) => String(v), '0', (v) => v === 0],
];
const fmtCm = (v) => `${(v * 100).toFixed(2)} cm`;
const chip = (ok, idle) => `<span class="chip ${idle ? 'idle' : ok ? 'pass' : 'fail'}">${idle ? '—' : ok ? 'PASS' : 'FAIL'}</span>`;

function renderLiveChecks() {
  const s = checker.stats.get('live');
  const body = $('#live-checks tbody');
  body.innerHTML = LIVE_ROWS.map(([label, get, fmt, limit, ok]) => {
    if (!s) return `<tr><td>${label}</td><td>—</td><td>${limit}</td><td>${chip(true, true)}</td></tr>`;
    const v = get(s);
    return `<tr><td>${label}</td><td>${fmt(v)}</td><td>${limit}</td><td>${chip(ok(v))}</td></tr>`;
  }).join('');
  $('#live-violations').innerHTML = lastViolations.map((v) => `<li>${v}</li>`).join('');
}
$('#reset-live').addEventListener('click', () => { checker.reset(); lastViolations = []; renderLiveChecks(); });

/** Sightline from the eye over the rim top to the cluster plane; returns ground-frame metres. */
function sightline(seatY, psiRad = 0) {
  const eye = new THREE.Vector3(EYE[0], EYE[1] + seatY, EYE[2]);
  const saved = wheel.psi;
  wheel.setAngle(-psiRad);
  const F = { point: new THREE.Vector3(), tangent: new THREE.Vector3(), normal: new THREE.Vector3(), axis: new THREE.Vector3() };
  const up = new THREE.Vector3(0, 1, 0);
  const n = new THREE.Vector3(0, -Math.sin(-0.26), Math.cos(-0.26)); // binnacle face normal
  const planePt = new THREE.Vector3(...CLUSTER_POS);
  const bottom = planePt.clone().add(new THREE.Vector3(0, -CLUSTER_SIZE[1] / 2, 0).applyAxisAngle(new THREE.Vector3(1, 0, 0), -0.26));
  let best = null;
  for (let a = -40; a <= 40; a += 1) {
    wheel.rimFrameLocal(a * D2R, F);
    // Highest point of the tube cross-section (plus any stripe proudness).
    const dir = up.clone().sub(F.tangent.clone().multiplyScalar(up.dot(F.tangent))).normalize();
    const top = F.point.clone().addScaledVector(dir, wheel.curve.tube + (Math.abs(a) < 4 ? wheel.params.stripe.proud : 0));
    const ray = top.clone().sub(eye);
    const t = planePt.clone().sub(eye).dot(n) / ray.dot(n);
    const hit = eye.clone().addScaledVector(ray, t);
    if (!best || hit.y > best.hit.y) best = { hit, top };
  }
  wheel.setAngle(-saved);
  return {
    eye,
    top: best.top,
    hit: best.hit,
    hitY: best.hit.y + RIDE_HEIGHT,
    clusterBottomY: bottom.y + RIDE_HEIGHT,
    clearance: bottom.y - best.hit.y,
  };
}

function updateWheelChecks() {
  const want = { 'spoke-3': 90, 'spoke-9': -90, 'spoke-6': 180 };
  const rows = [];
  const savedPsi = wheel.psi;
  wheel.setAngle(0);
  const p0 = wheel.parts().parts;
  wheel.setAngle(-savedPsi);
  for (const s of p0.filter((p) => p.name.startsWith('spoke'))) {
    const err = Math.abs(((s.dirDeg - want[s.name] + 540) % 360) - 180);
    rows.push([`${s.name.replace('spoke-', 'Spoke at ')} o'clock`, `${s.dirDeg.toFixed(1)}°`, `±1°`, err <= 1]);
  }
  rows.push(['Draw calls', String(wheel.drawCalls), '≤ 4', wheel.drawCalls <= 4]);
  for (const sy of [SEAT_ADJUST.y[0], 0, SEAT_ADJUST.y[1]]) {
    const s = sightline(sy);
    const label = sy === 0 ? 'Cluster clear (seat 0)' : `Cluster clear (seat ${sy > 0 ? '+' : ''}${sy})`;
    rows.push([label, fmtCm(s.clearance), sy === 0 ? '≥ 0 (torus 0.88)' : 'report', sy === 0 ? s.clearance >= 0 : null]);
  }
  const reachMax = Math.max(
    ...[...Array(15)].map((_, i) => rig.reachAt('left', rig.params.domainLeft[0] + ((rig.params.domainLeft[1] - rig.params.domainLeft[0]) * i) / 14)),
    ...[...Array(15)].map((_, i) => rig.reachAt('right', rig.params.domainRight[0] + ((rig.params.domainRight[1] - rig.params.domainRight[0]) * i) / 14))
  );
  rows.push(['Worst in-domain reach', `${reachMax.toFixed(3)} m`, `≤ ${(0.97 * (UPPER_ARM + FOREARM)).toFixed(3)}`, reachMax <= 0.97 * (UPPER_ARM + FOREARM)]);
  $('#wheel-checks tbody').innerHTML = rows
    .map(([l, v, lim, ok]) => `<tr><td>${l}</td><td>${v}</td><td>${lim}</td><td>${ok === null ? '<span class="chip idle">INFO</span>' : chip(ok)}</td></tr>`)
    .join('');
}

function drawReach() {
  const svg = $('#reach-chart');
  const W = 340, H = 170, x0 = 34, x1 = W - 8, y0 = 10, y1 = H - 22;
  const vmin = 0.5, vmax = 0.72;
  const X = (a) => x0 + ((a + 180) / 360) * (x1 - x0);
  const Y = (v) => y1 - ((v - vmin) / (vmax - vmin)) * (y1 - y0);
  const P = rig.params;
  let s = '';
  s += `<rect class="dom" x="${X(P.domainLeft[0])}" y="${y0}" width="${X(P.domainLeft[1]) - X(P.domainLeft[0])}" height="${y1 - y0}"/>`;
  s += `<rect class="dom" x="${X(P.domainRight[0])}" y="${y0}" width="${X(P.domainRight[1]) - X(P.domainRight[0])}" height="${y1 - y0}"/>`;
  for (const v of [0.5, 0.55, 0.6, 0.65, 0.7]) s += `<line class="grid" x1="${x0}" x2="${x1}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${x0 - 4}" y="${Y(v) + 3}" text-anchor="end">${v.toFixed(2)}</text>`;
  for (const a of [-180, -90, 0, 90, 180]) s += `<text x="${X(a)}" y="${H - 6}" text-anchor="middle">${a}°</text>`;
  const lim = 0.97 * (UPPER_ARM + FOREARM);
  s += `<line class="lim" x1="${x0}" x2="${x1}" y1="${Y(lim)}" y2="${Y(lim)}"/>`;
  for (const side of ['left', 'right']) {
    const pts = [];
    for (let a = -180; a <= 180; a += 10) pts.push(`${X(a).toFixed(1)},${Y(Math.min(vmax, Math.max(vmin, rig.reachAt(side, a)))).toFixed(1)}`);
    s += `<polyline class="ln ${side[0]}" points="${pts.join(' ')}"/>`;
    const rest = side === 'left' ? -P.rest : P.rest;
    s += `<circle class="dot ${side[0]}" cx="${X(rest)}" cy="${Y(rig.reachAt(side, rest))}" r="3.5"/>`;
  }
  svg.innerHTML = s;
}

// --- telemetry ----------------------------------------------------------------------------
let teleAcc = 0;
function renderTelemetry() {
  const d = lastDebug ?? rig.debug();
  const ang = d.rim.angleDeg;
  $('#t-angle').textContent = `${ang >= 0 ? '+' : '−'}${Math.abs(ang).toFixed(0)}°`;
  $('#t-omega').textContent = `${Math.round(d.rim.omegaDegS)} °/s`;
  $('#dial-hand').setAttribute('transform', `rotate(${ang})`);
  const frac = Math.max(-1, Math.min(1, ang / 360));
  const end = frac * 2 * Math.PI * 0.999;
  const r = 42;
  const large = Math.abs(end) > Math.PI ? 1 : 0;
  const sweepFlag = end >= 0 ? 1 : 0;
  $('#dial-arc').setAttribute('d', Math.abs(frac) < 0.002 ? '' : `M0,${-r} A${r},${r} 0 ${large} ${sweepFlag} ${(Math.sin(end) * r).toFixed(2)},${(-Math.cos(end) * r).toFixed(2)}`);
  for (const side of ['left', 'right']) {
    const h = d.hands[side];
    const el = $(`#t-${side}`);
    const label = h.shiftPhase ? `SHIFT·${h.shiftPhase}` : h.state;
    el.querySelector('.state').textContent = label;
    el.querySelector('.state').dataset.s = h.state;
    el.querySelector('.num').textContent = `${h.spatialDeg >= 0 ? '+' : '−'}${Math.abs(h.spatialDeg).toFixed(0)}°`;
  }
  const sep = tmpV.fromArray(d.hands.left.palmCentre).distanceTo(new THREE.Vector3(...d.hands.right.palmCentre));
  const sepEl = $('#t-sep');
  sepEl.textContent = `${(sep * 100).toFixed(1)} cm`;
  sepEl.className = sep < LIMITS.separation ? 'bad' : '';
  const ext = Math.max(d.hands.left.extensionRatio, d.hands.right.extensionRatio);
  const extEl = $('#t-ext');
  extEl.textContent = ext.toFixed(3);
  extEl.className = ext > LIMITS.extension ? 'bad' : ext > 0.93 ? 'warn' : '';
  if (!sweeping) $('#scrub').value = String(steerNorm);
}

function updateOverlays() {
  const d = lastDebug ?? rig.debug();
  const on = (id) => $(id).checked;
  if (domainGroup) domainGroup.visible = on('#ov-domains');
  for (const side of ['left', 'right']) {
    const h = d.hands[side];
    const dot = contactDots[side];
    dot.visible = on('#ov-contacts');
    dot.position.fromArray(h.contact);
    dot.material.color.setHex(STATE_COLOR[h.state] ?? 0xffffff);
    const rl = reachLines[side];
    rl.visible = on('#ov-reach');
    setLine(rl, [h.shoulder, h.elbow, h.wrist]);
    rl.material.color.setHex(h.extensionRatio > 0.97 ? 0xe0857b : h.extensionRatio > 0.93 ? 0xe8c98a : 0x8fe6bb);
  }
  sepLine.visible = on('#ov-sep');
  setLine(sepLine, [d.hands.left.palmCentre, d.hands.right.palmCentre]);
  sightLine.visible = on('#ov-sight');
  if (sightLine.visible) {
    const s = sightline(seat.y, wheel.psi);
    setLine(sightLine, [s.eye.toArray(), s.top.toArray(), s.hit.toArray()]);
  }
  document.querySelector('.telemetry').style.visibility = on('#ov-labels') ? '' : 'hidden';
}

// --- sweep ----------------------------------------------------------------------------------
async function runSweep(watch = false) {
  if (sweeping) return null;
  sweeping = true;
  $('#sweep-run').disabled = $('#sweep-watch').disabled = true;
  $('#sweep-verdict').textContent = '';
  const steps = buildSweep();
  const total = steps.reduce((a, s) => a + s.dur, 0);
  const sweepChecker = createRigChecker({ wheel });
  const events = [];
  const record = { S7: [], S9: [] };
  const seqEnd = {};
  let elapsed = 0;

  // Start from rest in P.
  steerNorm = 0;
  keys.left = keys.right = false;
  gear = 'P';
  cockpit.setGear('P');
  for (let i = 0; i < 60; i++) cockpit.update(STEP, { wheelAngleRad: 0, throttle: false, brake: false, reversing: false });
  rig.snapToRest(0);
  grabEvents = [];
  const shifts = [];

  let frameCount = 0;
  for (let si = 0; si < steps.length; si++) {
    const step = steps[si];
    if (step.shift) {
      const leverBefore = cockpit.shifterAngle;
      const startFrame = simFrame + 1;
      const grabsBefore = grabEvents.length;
      setGear(step.shift);
      const prevShift = shifts[shifts.length - 1];
      if (prevShift && grabEvents.length === prevShift.grabsBefore) prevShift.superseded = true;
      shifts.push({ gear: step.shift, startFrame, leverBefore, grabsBefore, leftOff: 0, leverMovedEarly: false, backInGripAt: null, grabOk: null, superseded: false });
    }
    let t = 0;
    const firstOfSeq = si === 0 || steps[si - 1].seq !== step.seq;
    if (firstOfSeq) seqEnd[step.seq] = null;
    // S7 and S9 are compared frame by frame, so both start from the same rest.
    if (firstOfSeq && (step.seq === 'S7' || step.seq === 'S9')) {
      rig.snapToRest(0);
      sweepChecker.breakContinuity();
    }
    while (t < step.dur - 1e-9) {
      if (step.until === 'lockL' && steerNorm <= -1) break;
      if (step.until === 'lockR' && steerNorm >= 1) break;
      const grabsBefore = grabEvents.length;
      simulate(STEP, step.steer, { checkerRef: sweepChecker, seq: step.seq });
      const d = lastDebug;
      // Shift assertions.
      for (const sh of shifts) {
        const grabbed = grabEvents.length > sh.grabsBefore;
        if (!grabbed && Math.abs(cockpit.shifterAngle - sh.leverBefore) > 1e-6 && sh.gear === gear) sh.leverMovedEarly = true;
        if (d.hands.right.state === 'SHIFT' && !['GRIP', 'SLIP'].includes(d.hands.left.state)) sh.leftOff++;
        if (sh.backInGripAt === null && grabbed && d.hands.right.state === 'GRIP') sh.backInGripAt = (simFrame - sh.startFrame) * STEP;
      }
      if (grabEvents.length > grabsBefore) {
        const knob = cockpit.shifterKnobLocal();
        const distTop = tmpV.fromArray(d.hands.right.contact).distanceTo(knob) - 0.045;
        const sh = shifts[shifts.length - 1];
        sh.grabOk = d.hands.right.shiftPhase === 'hold' && Math.abs(distTop) <= 0.01;
        sh.grabDist = distTop;
      }
      if (step.seq === 'S7' || step.seq === 'S9') record[step.seq].push([...d.hands.left.contact, ...d.hands.right.contact]);
      seqEnd[step.seq] = d;
      t += STEP;
      frameCount++;
      elapsed += STEP;
      if (watch) {
        render();
        await new Promise(requestAnimationFrame);
      } else if (frameCount % 90 === 0) {
        $('#sweep-progress i').style.width = `${(100 * elapsed) / total}%`;
        render();
        await new Promise(requestAnimationFrame);
      }
    }
    if (!watch) elapsed = steps.slice(0, si + 1).reduce((a, s) => a + s.dur, 0);
    $('#sweep-progress i').style.width = `${Math.min(100, (100 * elapsed) / total)}%`;
  }

  // --- event assertions ---
  const stats = sweepChecker.stats;
  const ev = (name, ok, detail) => events.push({ name, ok, detail });
  ev('S2 hand-over-hand', (stats.get('S2')?.travels ?? 0) >= 2, `${stats.get('S2')?.travels ?? 0} travels (≥ 2)`);
  ev('S4 hand-over-hand', (stats.get('S4')?.travels ?? 0) >= 2, `${stats.get('S4')?.travels ?? 0} travels (≥ 2)`);
  for (const seq of ['S1', 'S3', 'S5']) {
    const d = seqEnd[seq];
    const L = d.hands.left;
    const R = d.hands.right;
    const atRest = L.state === 'GRIP' && R.state === 'GRIP' && Math.abs(L.spatialDeg + 90) <= 5 && Math.abs(R.spatialDeg - 90) <= 5;
    const thumbs = ['left', 'right'].map((side) => thumbToSpoke(d.hands[side], side));
    ev(`${seq} rests at 9 and 3`, atRest && thumbs.every((x) => x <= 0.015),
      `L ${L.state} ${L.spatialDeg.toFixed(1)}°, R ${R.state} ${R.spatialDeg.toFixed(1)}°; thumb off its rest ${thumbs.map((x) => (x * 100).toFixed(1)).join(' / ')} cm (≤ 1.5)`);
  }
  shifts.forEach((sh, i) => {
    const grabs = grabEvents.filter((g, gi) => gi >= sh.grabsBefore && (i + 1 >= shifts.length || gi < shifts[i + 1].grabsBefore)).length;
    if (sh.superseded) {
      ev(`S8 shift → ${sh.gear}`, grabs === 0 && sh.leftOff === 0 && !sh.leverMovedEarly,
        `superseded before the hand reached the knob; lever never moved for it, left off ${sh.leftOff} f`);
      return;
    }
    ev(`S8 shift → ${sh.gear}`,
      grabs === 1 && sh.grabOk && sh.leftOff === 0 && !sh.leverMovedEarly && sh.backInGripAt !== null && sh.backInGripAt <= 1.4,
      `grabs ${grabs}, on knob ${sh.grabOk ? 'yes' : 'no'}${sh.grabDist != null ? ` (${(sh.grabDist * 100).toFixed(1)} cm)` : ''}, left off ${sh.leftOff} f, lever early ${sh.leverMovedEarly ? 'yes' : 'no'}, back in GRIP ${sh.backInGripAt?.toFixed(2) ?? '—'} s (≤ 1.4)`);
  });
  const n = Math.min(record.S7.length, record.S9.length);
  let maxDiff = 0;
  for (let i = 0; i < n; i++) for (let k = 0; k < 6; k++) maxDiff = Math.max(maxDiff, Math.abs(record.S7[i][k] - record.S9[i][k]));
  ev('S9 lean-independent', n > 0 && maxDiff <= 0.0001, `max difference vs S7 ${(maxDiff * 1000).toFixed(3)} mm over ${n} frames`);

  const totalViolations = [...stats.values()].reduce((a, s) => a + s.violations, 0);
  const pass = totalViolations === 0 && events.every((e) => e.ok);
  const result = { pass, totalViolations, stats: Object.fromEntries(stats), events, firstViolations: sweepChecker.firstViolations.slice() };
  renderSweep(result);
  lastMeasured = {
    sweep: {
      pass,
      violations: totalViolations,
      sequences: Object.fromEntries([...stats].map(([k, s]) => [k, {
        frames: s.frames, travels: s.travels, slipFrames: s.slipFrames,
        maxContactErrCm: +(s.maxContactErr * 100).toFixed(3), maxPenCm: +(s.maxPen * 100).toFixed(3),
        minSepCm: +(s.minSep * 100).toFixed(2), maxExt: +s.maxExt.toFixed(4),
        maxFreeJumpCm: +(Math.max(0, ...Object.entries(s.maxJump).filter(([k2]) => !['GRIP', 'SLIP'].includes(k2)).map(([, v]) => v)) * 100).toFixed(2),
        maxElbowCm: +(s.maxElbow * 100).toFixed(2), violations: s.violations,
      }])),
      events,
    },
  };
  refreshExport();
  sweeping = false;
  gear = 'P';
  document.querySelectorAll('#gears button').forEach((b) => b.classList.toggle('on', b.dataset.gear === 'P'));
  $('#sweep-run').disabled = $('#sweep-watch').disabled = false;
  return result;
}

/** Thumb tip error from resting on the rim just above its side spoke (0 = resting). */
function thumbToSpoke(h, side) {
  const seg = h.segments.find((s) => s.name === 'thumb.2');
  if (!seg) return Infinity;
  const q = new THREE.Quaternion().fromArray(seg.quat);
  const tip = new THREE.Vector3(...seg.centre).add(new THREE.Vector3(0, seg.halfExtents[1], 0).applyQuaternion(q));
  return rig.thumbRestError(tip, side);
}

function renderSweep(r) {
  const cols = [
    ['Seq', (k) => k],
    ['Frames', (k, s) => s.frames],
    ['Travel', (k, s) => s.travels],
    ['Slip f', (k, s) => s.slipFrames],
    ['Contact', (k, s) => (s.maxContactErr * 100).toFixed(2), (s) => s.maxContactErr > LIMITS.contactMax],
    ['Pen', (k, s) => (s.maxPen * 100).toFixed(2), (s) => s.maxPen > LIMITS.penetration],
    ['Sep', (k, s) => (s.minSep * 100).toFixed(1), (s) => s.minSep < LIMITS.separation],
    ['Ext', (k, s) => s.maxExt.toFixed(3), (s) => s.maxExt > LIMITS.extension],
    ['Jump', (k, s) => (Math.max(0, ...Object.entries(s.maxJump).filter(([k2]) => !['GRIP', 'SLIP'].includes(k2)).map(([, v]) => v)) * 100).toFixed(2)],
    ['Elbow', (k, s) => (s.maxElbow * 100).toFixed(2)],
    ['Viol', (k, s) => s.violations, (s) => s.violations > 0],
  ];
  const head = `<thead><tr>${cols.map((c) => `<th>${c[0]}</th>`).join('')}</tr></thead>`;
  const rows = Object.entries(r.stats)
    .map(([k, s]) => `<tr>${cols.map((c) => `<td class="${c[2]?.(s) ? 'bad' : ''}">${c[1](k, s)}</td>`).join('')}</tr>`)
    .join('');
  $('#sweep-table').innerHTML = `${head}<tbody>${rows}</tbody><caption hidden>cm unless noted</caption>`;
  $('#sweep-events').innerHTML = r.events.map((e) => `<li>${chip(e.ok)}<span><b>${e.name}</b> — ${e.detail}</span></li>`).join('');
  $('#sweep-violations').innerHTML = r.firstViolations.map((v) => `<li>${v}</li>`).join('');
  const v = $('#sweep-verdict');
  v.textContent = r.pass ? '0 violations · all events pass' : `${r.totalViolations} violations`;
  v.className = `verdict ${r.pass ? 'pass' : 'fail'}`;
}
$('#sweep-run').addEventListener('click', () => runSweep(false));
$('#sweep-watch').addEventListener('click', () => { setView('driver'); runSweep(true); });

// --- tuning panel ----------------------------------------------------------------------------
const TUNE = [
  ['Wheel', 'rim, spokes, hub', [
    ['wheel.rimTube', 'Rim tube radius', 0.018, 0.034, 0.0005, 'mm', 1000],
    ['wheel.flatHalfDeg', 'Flat bottom half-angle', 0, 45, 1, '°'],
    ['wheel.rimFillet', 'Flat-bottom corner softening', 0, 0.02, 0.001, 'mm', 1000],
    ['wheel.dish', 'Dish (hub behind rim plane)', 0, 0.045, 0.001, 'mm', 1000],
    ['wheel.spokeSide.thickness', 'Side spoke thickness', 0.015, 0.05, 0.001, 'mm', 1000],
    ['wheel.spokeSide.depth', 'Spoke depth', 0.01, 0.035, 0.001, 'mm', 1000],
    ['wheel.spokeLower.widthHub', 'Lower spoke width at hub', 0.03, 0.09, 0.001, 'mm', 1000],
    ['wheel.spokeLower.widthRim', 'Lower spoke width at rim', 0.02, 0.07, 0.001, 'mm', 1000],
    ['wheel.hubPad.width', 'Hub pad width', 0.1, 0.16, 0.001, 'mm', 1000],
    ['wheel.hubPad.height', 'Hub pad height', 0.07, 0.12, 0.001, 'mm', 1000],
    ['wheel.hubPad.depth', 'Hub pad depth', 0.02, 0.07, 0.001, 'mm', 1000],
    ['wheel.hubPad.chamfer', 'Hub pad chamfer', 0, 0.03, 0.001, 'mm', 1000],
    ['wheel.thumbGrip.bulge', 'Thumb grip bulge', 0, 0.012, 0.0005, 'mm', 1000],
    ['wheel.thumbGrip.length', 'Thumb grip length', 0.03, 0.1, 0.002, 'mm', 1000],
    ['wheel.stripe.length', 'Stripe width', 0.008, 0.04, 0.001, 'mm', 1000],
    ['colors.rim', 'Rim', 'color'],
    ['colors.spoke', 'Spokes', 'color'],
    ['colors.hub', 'Hub pad', 'color'],
    ['colors.stripe', 'Stripe', 'color'],
  ]],
  ['Hands', 'palm, fingers, thumb', [
    ['hand.palm.length', 'Palm length', 0.06, 0.1, 0.001, 'mm', 1000],
    ['hand.palm.width', 'Palm width', 0.065, 0.1, 0.001, 'mm', 1000],
    ['hand.palm.thick', 'Palm thickness', 0.018, 0.036, 0.001, 'mm', 1000],
    ['hand.fingerLengths.1', 'Middle finger length', 0.06, 0.1, 0.001, 'mm', 1000],
    ['hand.fingerThick.0', 'Finger thickness (base)', 0.012, 0.024, 0.0005, 'mm', 1000],
    ['hand.contact.1', 'Grip line along palm', 0.03, 0.08, 0.001, 'mm', 1000],
    ['rig.forearmSleeve', 'Forearm in sleeve', 'bool'],
    ['rig.solveThumbs', 'Solve thumbs against the wheel (ignores the sliders below)', 'bool'],
    ['sub', 'Thumb on rim'],
    ['rig.poseTables.THUMB_GRIP.0', 'Opposition', -10, 90, 1, '°'],
    ['rig.poseTables.THUMB_GRIP.1', 'Flex', -30, 80, 1, '°'],
    ['rig.poseTables.THUMB_GRIP.2', 'MCP', -20, 80, 1, '°'],
    ['rig.poseTables.THUMB_GRIP.3', 'IP', -20, 80, 1, '°'],
    ['sub', 'Thumb on spoke (rest)'],
    ['rig.poseTables.THUMB_ON_SPOKE.0', 'Opposition', -10, 90, 1, '°'],
    ['rig.poseTables.THUMB_ON_SPOKE.1', 'Flex', -30, 80, 1, '°'],
    ['rig.poseTables.THUMB_ON_SPOKE.2', 'MCP', -20, 80, 1, '°'],
    ['rig.poseTables.THUMB_ON_SPOKE.3', 'IP', -20, 80, 1, '°'],
    ['sub', 'Thumb on knob'],
    ['rig.poseTables.THUMB_KNOB.0', 'Opposition', -10, 90, 1, '°'],
    ['rig.poseTables.THUMB_KNOB.1', 'Flex', -30, 80, 1, '°'],
  ]],
  ['Choreography', 'domains, timing, paths', [
    ['rig.gripRoll', 'Palm roll around the tube', 0, 90, 1, '°'],
    ['rig.skinGap', 'Skin gap', 0, 0.01, 0.0005, 'mm', 1000],
    ['rig.slipLoosen', 'Slip loosening', 0, 0.03, 0.001, 'mm', 1000],
    ['rig.domainLeft.1', 'Domain inner edge (±)', -40, -10, 1, '°'],
    ['rig.domainLeft.0', 'Domain outer edge (±)', -175, -140, 1, '°'],
    ['rig.softMargin', 'Soft margin', 5, 50, 1, '°'],
    ['rig.targetsCW.right', 'Re-grip target, pulling hand', 30, 90, 1, '°'],
    ['rig.targetsCW.left', 'Re-grip target, pushing hand', -160, -100, 1, '°'],
    ['rig.release', 'Release time', 0.02, 0.15, 0.005, 's'],
    ['rig.travel', 'Travel time', 0.12, 0.4, 0.005, 's'],
    ['rig.regrip', 'Re-grip time', 0.03, 0.15, 0.005, 's'],
    ['rig.cooldown', 'Cooldown after re-grip', 0, 0.3, 0.01, 's'],
    ['rig.settleIdle', 'Idle before settling', 0.1, 1, 0.01, 's'],
    ['rig.travelLiftAxis', 'Travel lift toward driver', 0, 0.12, 0.002, 'mm', 1000],
    ['rig.travelLiftNormal', 'Travel lift outward', 0, 0.05, 0.001, 'mm', 1000],
    ['rig.spokePalmOffset', 'Palm offset from side spoke (+ toward 12)', -16, 16, 0.5, '°'],
    ['rig.spokeClear', 'Spoke clearance for re-grip', 0, 25, 1, '°'],
    ['rig.poleL.0', 'Elbow pole outward (±x)', -1, 0, 0.01, ''],
    ['rig.poleL.1', 'Elbow pole down (y)', -1, 0, 0.01, ''],
    ['rig.poleL.2', 'Elbow pole back (z)', -0.5, 0.8, 0.01, ''],
  ]],
];
/** Paths mirrored left <-> right so one slider tunes both sides. */
const MIRRORS = {
  'rig.domainLeft.1': (p, v) => { p.rig.domainRight[0] = -v; },
  'rig.domainLeft.0': (p, v) => { p.rig.domainRight[1] = -v; },
  'rig.targetsCW.right': (p, v) => { p.rig.targetsCCW.left = -v; },
  'rig.targetsCW.left': (p, v) => { p.rig.targetsCCW.right = -v; },
  'rig.poleL.0': (p, v) => { p.rig.poleR[0] = -v; },
  'rig.poleL.1': (p, v) => { p.rig.poleR[1] = v; },
  'rig.poleL.2': (p, v) => { p.rig.poleR[2] = v; },
};

let rebuildTimer = 0;
function scheduleRebuild() {
  clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(() => {
    build();
    renderLiveChecks();
  }, 90);
}

function fmtVal(v, unit, scale = 1) {
  const x = v * scale;
  const dec = unit === 'mm' ? 1 : unit === 's' ? 3 : unit === '°' ? 1 : 2;
  return `${x.toFixed(dec)}${unit ? ' ' + unit : ''}`;
}

let uid = 0;
function renderTune() {
  const host = $('#tune');
  host.innerHTML = '';
  TUNE.forEach(([title, sub, items], gi) => {
    const det = document.createElement('details');
    det.className = 'group';
    if (gi === 2) det.open = true;
    det.innerHTML = `<summary><h2>${title}</h2><span>${sub}</span></summary>`;
    const box = document.createElement('div');
    box.className = 'sliders';
    for (const it of items) {
      if (it[0] === 'sub') {
        const s = document.createElement('div');
        s.className = 'subhead';
        s.textContent = it[1];
        box.append(s);
        continue;
      }
      const [path, label, min] = it;
      const id = `tune-${uid++}`;
      const row = document.createElement('div');
      if (min === 'color') {
        row.className = 'slider color';
        row.innerHTML = `<label for="${id}">${label}</label><input type="color" id="${id}" value="${getPath(params, path)}">`;
        row.querySelector('input').addEventListener('input', (e) => { setPath(params, path, e.target.value); scheduleRebuild(); });
      } else if (min === 'bool') {
        row.className = 'slider';
        row.innerHTML = `<label for="${id}">${label}</label><input type="checkbox" id="${id}" ${getPath(params, path) ? 'checked' : ''}>`;
        row.querySelector('input').style.gridColumn = 'auto';
        row.querySelector('input').addEventListener('change', (e) => { setPath(params, path, e.target.checked); scheduleRebuild(); });
      } else {
        const [, , , max, step, unit, scale] = it;
        const v = getPath(params, path);
        const def = getPath(DEFAULTS, path);
        row.className = 'slider';
        row.innerHTML = `<label for="${id}">${label}</label><output for="${id}">${fmtVal(v, unit, scale)}</output><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${v}">`;
        const out = row.querySelector('output');
        out.classList.toggle('changed', Math.abs(v - def) > 1e-9);
        row.querySelector('input').addEventListener('input', (e) => {
          const nv = Number(e.target.value);
          setPath(params, path, nv);
          MIRRORS[path]?.(params, nv);
          out.textContent = fmtVal(nv, unit, scale);
          out.classList.toggle('changed', Math.abs(nv - def) > 1e-9);
          scheduleRebuild();
        });
      }
      box.append(row);
    }
    det.append(box);
    host.append(det);
  });
}

function renderSeat() {
  const host = $('#seat');
  const items = [
    ['x', 'Sideways', SEAT_ADJUST.x, 0.005, 'mm', 1000],
    ['y', 'Height', SEAT_ADJUST.y, 0.005, 'mm', 1000],
    ['z', 'Fore / aft', SEAT_ADJUST.z, 0.005, 'mm', 1000],
    ['tiltDeg', 'Tilt', SEAT_ADJUST.tiltDeg, 0.5, '°', 1],
  ];
  host.innerHTML = '';
  for (const [k, label, [min, max], step, unit, scale] of items) {
    const id = `seat-${k}`;
    const row = document.createElement('div');
    row.className = 'slider';
    row.innerHTML = `<label for="${id}">${label}</label><output>${fmtVal(seat[k], unit, scale)}</output><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${seat[k]}">`;
    row.querySelector('input').addEventListener('input', (e) => {
      seat[k] = Number(e.target.value);
      row.querySelector('output').textContent = fmtVal(seat[k], unit, scale);
    });
    host.append(row);
  }
}

// --- export ---------------------------------------------------------------------------------
function exportJson() {
  const reach = {};
  for (const side of ['left', 'right']) {
    reach[side] = [];
    for (let a = -180; a <= 180; a += 10) reach[side].push([a, +rig.reachAt(side, a).toFixed(4)]);
  }
  const sight = Object.fromEntries([SEAT_ADJUST.y[0], 0, SEAT_ADJUST.y[1]].map((sy) => {
    const s = sightline(sy);
    return [String(sy), { sightlineAtClusterY: +s.hitY.toFixed(4), clusterBottomY: +s.clusterBottomY.toFixed(4), clearanceCm: +(s.clearance * 100).toFixed(2) }];
  }));
  return {
    about: 'Parking Precision wheel lab parameters. wheel -> Dimensions.WHEEL_SPORT, colors -> Palette.COLORS.wheel*, hand -> Dimensions.HAND, rig -> Dimensions.HAND_RIG (poseTables -> HandModel.POSE_TABLES).',
    version: 1,
    exportedAt: new Date().toISOString(),
    wheel: params.wheel,
    colors: params.colors,
    hand: params.hand,
    rig: params.rig,
    derivedPoses: rig.poses,
    measured: { reach, sightline: sight, ...(lastMeasured ?? {}) },
  };
}
function refreshExport() {
  if (!rig) return;
  $('#params-json').value = JSON.stringify(exportJson(), null, 2);
}
function status(msg, bad = false) {
  const s = $('#export-status');
  s.textContent = msg;
  s.className = `status${bad ? ' bad' : ''}`;
}
$('#save-params').addEventListener('click', async () => {
  try {
    const res = await fetch('/__wheel-lab/save', { method: 'POST', headers: { 'content-type': 'application/json' }, body: $('#params-json').value });
    if (!res.ok) throw new Error(await res.text());
    status('Saved design/wheel-lab/params.json');
  } catch {
    status('Saving needs the local dev server. Select all and paste the JSON into design/wheel-lab/params.json instead.', true);
  }
});
$('#copy-params').addEventListener('click', () => {
  const ta = $('#params-json');
  ta.focus();
  ta.select();
  status('Selected. Copy with ⌘C / Ctrl+C.');
});
$('#apply-params').addEventListener('click', () => {
  try {
    const j = JSON.parse($('#params-json').value);
    params = deepMerge(clone(DEFAULTS), { wheel: j.wheel, colors: j.colors, hand: j.hand, rig: j.rig });
    renderTune();
    build();
    status('Applied.');
  } catch (err) {
    status(`That JSON didn't parse: ${err.message}`, true);
  }
});
$('#reset-params').addEventListener('click', () => {
  params = clone(DEFAULTS);
  renderTune();
  build();
  status('Back to the Dimensions.js defaults.');
});

// --- loop -----------------------------------------------------------------------------------
function render() {
  placeCamera();
  updateOverlays();
  if (cluster.update(STEP, { rpm: 780, speedKmh: 0, gear, autoGear: gear === 'D' ? 1 : null, handbrake: gear === 'P', sensors: null, odometerM: 0 })) {
    clusterTexture.needsUpdate = true;
  }
  composer.render();
}

let last = performance.now();
let acc = 0;
let uiAcc = 0;
function frame(now) {
  const real = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!sweeping) {
    const want = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    if (!paused) {
      acc += real * timeScale;
      let n = 0;
      while (acc >= STEP && n < 4) {
        simulate(STEP, want);
        acc -= STEP;
        n++;
      }
      if (n === 4) acc = 0;
    } else if (stepOnce) {
      simulate(STEP, want);
      stepOnce = false;
    }
    render();
  }
  uiAcc += real;
  teleAcc += real;
  if (teleAcc > 1 / 20) {
    renderTelemetry();
    teleAcc = 0;
  }
  if (uiAcc > 0.25 && !sweeping) {
    renderLiveChecks();
    uiAcc = 0;
  }
  requestAnimationFrame(frame);
}

// --- boot -----------------------------------------------------------------------------------
async function boot() {
  try {
    // The published page embeds params.json; the dev server serves the file.
    const embedded = window.__LAB_PARAMS__;
    const res = embedded ? null : await fetch('./params.json', { cache: 'no-store' });
    if (embedded || res.ok) {
      const j = embedded ?? (await res.json());
      params = deepMerge(clone(DEFAULTS), { wheel: j.wheel, colors: j.colors, hand: j.hand, rig: j.rig });
      lastMeasured = j.measured?.sweep ? { sweep: j.measured.sweep } : null;
    }
  } catch {
    // No saved parameters yet: start from Dimensions.js.
  }
  renderTune();
  renderSeat();
  build();
  resize();
  setView('driver');
  syncTime();
  renderLiveChecks();
  requestAnimationFrame(frame);
}

// Hooks for headless screenshots and probes.
window.__lab = {
  runSweep: () => runSweep(false),
  setView,
  look(pos, target, fov = 40) {
    view = 'custom';
    orbit.enabled = false;
    camera.fov = fov;
    camera.near = 0.01;
    camera.updateProjectionMatrix();
    camera.position.set(pos[0], pos[1] + RIDE_HEIGHT, pos[2]);
    camera.lookAt(target[0], target[1] + RIDE_HEIGHT, target[2]);
    render();
  },
  setSeat: (s) => Object.assign(seat, s),
  setSteer(v) { steerNorm = v; wheel.setAngle(-v * TAU); rig.snapToRest(v); },
  sightFor(overrides) {
    const real = wheel;
    const temp = createSteeringWheel({ params: deepMerge(params.wheel, overrides) });
    wheel = temp;
    const r = [SEAT_ADJUST.y[0], 0, SEAT_ADJUST.y[1]].map((sy) => +(sightline(sy).clearance * 100).toFixed(2));
    wheel = real;
    temp.dispose();
    return r;
  },
  settleAt(v, seconds = 1.5) {
    steerNorm = v; wheel.setAngle(-v * TAU); rig.snapToRest(v);
    scrubbing = true;
    for (let i = 0; i < Math.round(seconds / STEP); i++) simulate(STEP, 0, { check: false });
    scrubbing = false;
    render();
    return rig.debug().hands;
  },
  untilState(want, pred, maxSeconds = 3) {
    for (let i = 0; i < Math.round(maxSeconds / STEP); i++) {
      simulate(STEP, want, { check: false });
      if (pred(rig.debug())) break;
    }
    render();
    const d = rig.debug();
    return `${d.hands.left.state} ${d.hands.right.state} ${d.hands.right.shiftPhase ?? ''}`;
  },
  reset() { steerNorm = 0; gear = 'P'; cockpit.setGear('P'); wheel.setAngle(0); rig.snapToRest(0); render(); },
  trace(start, want, seconds) {
    steerNorm = start; wheel.setAngle(-start * TAU); rig.snapToRest(start);
    const out = [];
    const n = Math.round(seconds / STEP);
    let last = '';
    for (let i = 0; i < n; i++) {
      simulate(STEP, want, { check: false });
      const d = rig.debug();
      const key = `${d.hands.left.state}/${d.hands.right.state}`;
      if (key !== last) out.push(`${(i * STEP).toFixed(2)}s rim ${d.rim.angleDeg.toFixed(0)} L ${d.hands.left.state} ${d.hands.left.spatialDeg.toFixed(0)} R ${d.hands.right.state} ${d.hands.right.spatialDeg.toFixed(0)}`);
      last = key;
    }
    return out;
  },
  hold(want, seconds) { const n = Math.round(seconds / STEP); for (let i = 0; i < n; i++) simulate(STEP, want); render(); },
  shift(g) { setGear(g); },
  pause(p = true) { paused = p; syncTime(); },
  overlays(on) { for (const id of ['#ov-domains', '#ov-contacts', '#ov-reach', '#ov-labels']) $(id).checked = on; render(); },
  debug: () => rig.debug(),
  thumbReport: () => rig.thumbReport,
  marker(pos, color = 0xff3355) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.004, 10, 8), dotMat(color));
    m.renderOrder = 1000;
    m.position.set(...pos);
    overlay.add(m);
    render();
  },
  tips() {
    const d = rig.debug('corners');
    return d.hands.right.segments.map((sg) => {
      const q = new THREE.Quaternion().fromArray(sg.quat);
      const tip = new THREE.Vector3(...sg.centre).add(new THREE.Vector3(0, sg.halfExtents[1], 0).applyQuaternion(q));
      const cen = new THREE.Vector3(...sg.centre);
      const c = wheel.clearance(tip);
      const cc = wheel.clearance(cen);
      return `${sg.name.padEnd(9)} tip rim ${(c.rim * 100).toFixed(1)}cm θ${(c.materialTheta * 180 / Math.PI).toFixed(0)} | centre rim ${(cc.rim * 100).toFixed(1)}cm | tip car ${tip.toArray().map((v) => v.toFixed(3)).join(',')}`;
    });
  },
  thumbGrid: (st) => rig.thumbGrid(st),
  thumbSearch() {
    const out = [];
    const saved = clone(params.hand);
    for (const splay of [20, 40, 60, 80]) {
      for (const bz of [0.004, 0.014]) {
        for (const by of [0.02, 0.035]) {
          params.hand.thumbSplayDeg = splay;
          params.hand.thumbBase = [0.03, by, bz];
          params.rig.solveThumbs = false;
          build();
          const g = rig.thumbGrid(20);
          out.push({ splay, by, bz, clear: g.bestClear && +(g.bestClear.dist * 100).toFixed(2), t: g.bestClear?.t });
        }
      }
    }
    params.hand = saved;
    params.rig.solveThumbs = true;
    build();
    return out.sort((a, b) => (a.clear ?? 99) - (b.clear ?? 99));
  },
  penetrations() {
    const d = rig.debug('corners');
    const out = [];
    for (const side of ['left', 'right']) {
      for (const seg of d.hands[side].segments) {
        let worst = { pen: 0 };
        for (const pt of seg.points) {
          const c = wheel.clearance(new THREE.Vector3(...pt));
          const pen = Math.max(0, -c.rim, -c.spokes, -c.hub);
          if (pen > worst.pen) worst = { pen, part: -c.rim === pen ? 'rim' : -c.spokes === pen ? 'spoke' : 'hub' };
        }
        if (worst.pen > 0.001) out.push(`${side} ${seg.name} ${(worst.pen * 100).toFixed(2)}cm ${worst.part}`);
      }
    }
    return out;
  },
  params: () => exportJson(),
  render,
  get ready() { return !!rig; },
};

boot();
