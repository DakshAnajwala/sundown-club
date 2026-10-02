/**
 * handling.js — the Handling Lab: a night test ground for tuning the race
 * cars before any of the city exists (design/SPEC-game.md §16, next step).
 *
 * What it has: a 1.1 km straight with a drag strip, an open plaza with a
 * drift circle, a slalom and a hairpin pylon; both slice cars; every tuning
 * field from Tuning.js as a live slider; chase and cockpit cameras (the
 * cockpit is Parking Precision's wheel, hands and dials); keyboard and
 * gamepad; and run timers (0-100, quarter mile, 100-0, top speed, drift
 * score using the SPEC §5.5 formula).
 *
 * It is a design tool, not the game: no menus, no saving beyond the setups
 * (localStorage, per car). The numbers it settles go back into cars.js and
 * the spec, re-checked by tools/race-physics-probe.mjs.
 */
import * as THREE from 'three';
import { createPhysicsWorld } from '../../src/physics/PhysicsWorld.js';
import { createRaceCar } from '../../src/vehicle/RaceCar.js';
import { CARS } from '../../src/vehicle/cars.js';
import { FIELDS, defaultTuning, cleanField, PRESETS, applyPreset } from '../../src/vehicle/Tuning.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createSpeedFeel } from '../../src/camera/SpeedFeel.js';
import { createSpeedStreaks } from '../../src/render/SpeedStreaks.js';
import { createSpeedBlurPass } from '../../src/render/SpeedBlur.js';
import { createFollowCamera } from '../../src/camera/FollowCamera.js';
import { bakeLampMap, lampLightTree, makeGlowTexture, lampUniforms } from '../../src/render/LampLight.js';
import { createSkyDome } from '../../src/world/Palette.js';
import { createLeaveGuard } from '@sundown/shared/leave-guard';
import { trackPlaytime, updateGame } from '@sundown/shared/profile';
import { reportRound } from '@sundown/shared/retention';
import { showRoundPanel } from '@sundown/shared/roundpanel';
import { createDriverCamera } from '../../src/camera/DriverCamera.js';
import { createCockpit } from '../../src/vehicle/Cockpit.js';
import { createDriver } from '../../src/vehicle/Driver.js';
import { createDashCluster } from '../../src/ui/DashCluster.js';
import { createAudioSystem } from '../../src/audio/AudioSystem.js';

// --- the test ground (x east, z south; heading 0 = nose to -Z, north) ------
const GROUND = { width: 900, depth: 1700 }; // centred on the origin
const STRAIGHT = { halfWidth: 8, zStart: 700, zEnd: -400 };
const START = { pos: [0, undefined, 690], heading: 0 };
const PLAZA = { zNear: -400, zFar: -840, halfWidth: 440 };
const DRIFT = { c: [-200, -620], r: 30 };
const COLORS = {
  sky: 0x0c1320,
  fog: 0x121a28,
  asphalt: 0x3a3d44,
  plaza: 0x3b3f46,
  line: 0xd9dde3,
  barrier: 0x6b7280,
  kerbRed: 0xa4473d,
  pole: 0x3a3f47,
  lamp: 0xffb45c,
  pool: 0xff9d3c,
  cone: 0xe8743b,
  neonTeal: 0x3fe0d0,
  neonPink: 0xe0457b,
};

// --- renderer, scene ---------------------------------------------------------
const container = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);
// Composer: scene -> edge motion blur -> tone map. MSAA on the composer's own
// target (EffectComposer's default has none, which would throw away the
// antialias above; Parking Precision's Renderer.js hit the same thing).
const composerTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, composerTarget);
const blur = createSpeedBlurPass();
let renderPass = null;

const scene = new THREE.Scene();
scene.background = new THREE.Color(COLORS.sky);
// Night sky with a warm city glow at the horizon; fog matches the horizon so
// the far end of the road dissolves into it instead of a black wall.
// The dome rides with the camera (drawn inside the 400 m far plane).
const sky = createSkyDome(0x060a14, 0x2b2536, 360);
scene.add(sky);
scene.fog = new THREE.Fog(0x1d1b27, 50, 390);
// Low ambient: the street lamps (LampLight.js) do the real lighting.
scene.add(new THREE.HemisphereLight(0x4a5878, 0x0d0f14, 0.75));
const moon = new THREE.DirectionalLight(0xa9bde0, 0.35);
moon.position.set(-200, 300, 100);
scene.add(moon);

const physics = createPhysicsWorld();
buildGround();

// --- car, cameras, cockpit -------------------------------------------------
const audio = createAudioSystem();
const cluster = createDashCluster({ theme: 'classic' });
const clusterTexture = new THREE.CanvasTexture(cluster.canvas);
clusterTexture.colorSpace = THREE.SRGBColorSpace;
const blank = new THREE.CanvasTexture(Object.assign(document.createElement('canvas'), { width: 4, height: 4 }));

const input = { throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false, analogSteer: false, shiftUp: false, shiftDown: false };
/** DriverCamera reads look-back and lean through Parking Precision's Input shape. */
const look = {
  state: { lookBack: false, leanLeft: false, leanRight: false },
  mouse: { x: 0, y: 0 },
  consumeMouseDelta() {
    const d = { ...this.mouse };
    this.mouse.x = 0;
    this.mouse.y = 0;
    return d;
  },
};

let carId = 'starter';
let rc = null;
let chase = null;
let seat = null;
let cockpit = null;
let driver = null;
let headlight = null;
let cameraMode = 'chase';
let speedFeel = null;
const streaks = createSpeedStreaks({ scene });
/** Lab switches for judging each speed cue on its own. */
const feel = { shake: true, blur: true, streaks: true };
let manual = false;

function loadSetup(id) {
  try {
    const raw = JSON.parse(localStorage.getItem(`handling-lab:setup:${id}`) ?? 'null');
    if (raw && typeof raw === 'object') {
      const out = defaultTuning(CARS[id]);
      for (const f of FIELDS) out[f.key] = cleanField(CARS[id], f.key, raw[f.key]);
      return out;
    }
  } catch {
    // unavailable or corrupt: stock
  }
  return defaultTuning(CARS[id]);
}
function saveSetup(id, setup) {
  try {
    localStorage.setItem(`handling-lab:setup:${id}`, JSON.stringify(setup));
  } catch {
    // session only
  }
}
let setup = loadSetup(carId);

function spawnCar(id, at = START) {
  if (rc) {
    scene.remove(rc.mesh);
    rc.dispose();
  }
  carId = id;
  setup = loadSetup(id);
  rc = createRaceCar({ physics, car: CARS[id], tuning: setup, spawn: at });
  rc.setManual(manual);
  scene.add(rc.mesh);
  rc.on('gear', () => audio.gearClick());

  // Headlights: one spot, no shadow. The cheapest thing that makes a night
  // road readable at speed.
  headlight = new THREE.SpotLight(0xfff0d6, 90, 120, 0.42, 0.55, 1.2);
  headlight.position.set(0, 0.0, -2.0);
  headlight.target.position.set(0, -0.6, -22);
  rc.mesh.add(headlight, headlight.target);
  // Dim dome light: the cabin is shadowed from every scene light, and at night
  // the emissive trim alone leaves the wheel and hands black.
  const dome = new THREE.PointLight(0xffe2c0, 0.1, 1.2, 2);
  dome.position.set(-0.2, 0.3, 0.2);
  rc.mesh.add(dome);

  seat = createDriverCamera({ chassisBody: rc.chassisBody });
  seat.setFov(70);
  // SpeedFeel replaces the rigs' own speed FOV (theirs is done by 100 km/h).
  seat.setSpeedFov(0);
  if (!renderPass) {
    renderPass = new RenderPass(scene, seat.camera);
    composer.addPass(renderPass);
    composer.addPass(blur.pass);
    composer.addPass(new OutputPass());
  } else {
    renderPass.camera = seat.camera;
  }
  speedFeel = createSpeedFeel({ camera: seat.camera, baseFov: 72 });
  speedFeel.setShake(feel.shake);
  // slowroads-style follow camera (owner, 30 Sep) replaces Parking
  // Precision's fixed chase boom in this view.
  chase = createFollowCamera({ camera: seat.camera, chassisBody: rc.chassisBody });
  chase.reset();
  // The car is lit by the same baked street light as the road.
  lampLightTree(rc.mesh);

  cockpit = createCockpit({ clusterTexture, screenTexture: blank, guidelineTexture: blank });
  rc.mesh.add(cockpit.group);
  cockpit.setGear('D');
  driver = createDriver({ cockpit, onShifterGrabbed: (g) => cockpit.setGear(g) });
  rc.mesh.add(driver.group);
  onResize();
  buildPanel();
  resetRuns();
}

// --- input: keyboard ---------------------------------------------------------
const held = new Set();
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) {
    if (e.code !== 'Escape') return;
    e.target.blur();
  }
  if (!audio.isStarted) {
    audio.start();
    audio.resume();
  }
  if (e.code === 'Space') e.preventDefault();
  if (e.repeat) return;
  held.add(e.code);
  if (e.code === 'KeyC') toggleCamera();
  if (e.code === 'KeyE') input.shiftUp = true;
  if (e.code === 'KeyQ') input.shiftDown = true;
  if (e.code === 'KeyT') resetRuns();
  if (e.code === 'KeyR') resetUpright();
  if (e.code === 'Backspace' || e.code === 'Home') {
    rc.respawn(START);
    chase.reset();
    resetRuns();
  }
});
window.addEventListener('keyup', (e) => held.delete(e.code));
window.addEventListener('blur', () => held.clear());
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
renderer.domElement.addEventListener('mousedown', (e) => {
  if (e.button === 2) look.state.lookBack = true;
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 2) look.state.lookBack = false;
});
window.addEventListener('mousemove', (e) => {
  if (!look.state.lookBack) return;
  look.mouse.x += e.movementX || 0;
  look.mouse.y += e.movementY || 0;
});

// --- input: gamepad (standard mapping) ---------------------------------------
const PAD_DEAD = 0.08;
let padActive = false;
let padPrev = [];
function readPad() {
  const pads = navigator.getGamepads?.() ?? [];
  const p = [...pads].find((g) => g && g.connected);
  if (!p) return null;
  const btn = (i) => p.buttons[i]?.value ?? 0;
  const pressed = (i) => (p.buttons[i]?.pressed ?? false) && !padPrev[i];
  const raw = p.axes[0] ?? 0;
  const steer = Math.abs(raw) < PAD_DEAD ? 0 : Math.sign(raw) * ((Math.abs(raw) - PAD_DEAD) / (1 - PAD_DEAD));
  const out = {
    steer,
    throttle: btn(7),
    brake: btn(6),
    handbrake: btn(0) > 0.5,
    nitro: btn(1) > 0.5,
    shiftUp: pressed(5),
    shiftDown: pressed(4),
    camera: pressed(3),
    reset: pressed(8),
    any: Math.abs(steer) > 0 || btn(7) > 0.05 || btn(6) > 0.05 || p.buttons.some((b) => b.pressed),
  };
  padPrev = p.buttons.map((b) => b.pressed);
  return out;
}

function gatherInput() {
  const pad = readPad();
  if (pad?.any) padActive = true;
  const keyAny = held.size > 0;
  if (keyAny) padActive = false;
  const k = (...codes) => codes.some((c) => held.has(c));
  if (padActive && pad) {
    input.throttle = pad.throttle;
    input.brake = pad.brake;
    input.steer = pad.steer;
    input.analogSteer = true;
    input.handbrake = pad.handbrake;
    input.nitro = pad.nitro;
    input.shiftUp ||= pad.shiftUp;
    input.shiftDown ||= pad.shiftDown;
    if (pad.camera) toggleCamera();
    if (pad.reset) resetUpright();
  } else {
    input.throttle = k('KeyW', 'ArrowUp') ? 1 : 0;
    input.brake = k('KeyS', 'ArrowDown') ? 1 : 0;
    input.steer = (k('KeyD', 'ArrowRight') ? 1 : 0) - (k('KeyA', 'ArrowLeft') ? 1 : 0);
    input.analogSteer = false;
    input.handbrake = k('Space');
    input.nitro = k('ShiftLeft', 'ShiftRight');
  }
  hud.pad.hidden = !padActive;
}

function toggleCamera() {
  cameraMode = cameraMode === 'chase' ? 'cockpit' : 'chase';
  if (cameraMode === 'chase') chase.reset();
  else chase.release();
  panelRefs.camBtn.textContent = `Camera: ${cameraMode}`;
}

/** Put the car back on its wheels where it is, facing the way it faced. */
function resetUpright() {
  const p = rc.chassisBody.position;
  const q = rc.chassisBody.quaternion;
  const heading = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x));
  rc.respawn({ pos: [p.x, undefined, p.z], heading });
  chase.reset();
}

// --- run timers ----------------------------------------------------------------
const runs = {};
function resetRuns() {
  Object.assign(runs, {
    top: 0,
    still: 0,
    launch: null, // { t, dist }
    t100: null,
    best100: runs.best100 ?? null,
    quarter: null,
    bestQuarter: runs.bestQuarter ?? null,
    brakeFrom: null, // { pos } once braking from >= 100 km/h
    brake100: null,
    prevKmh: 0,
    drift: 0,
    driftBest: runs.driftBest ?? 0,
    combo: 1,
    comboT: 0,
    t: 0,
  });
}
resetRuns();

function updateRuns(dt) {
  const s = rc.state;
  const kmh = Math.abs(s.forwardSpeedMs) * 3.6;
  const p = rc.chassisBody.position;
  runs.t += dt;
  runs.top = Math.max(runs.top, s.speedKmh);

  // Launch timers start when the car leaves a standstill it held for 0.5 s.
  if (s.speedKmh < 0.5) {
    runs.still += dt;
    if (runs.still > 0.5) runs.launch = null;
  } else {
    if (runs.still > 0.5 && !runs.launch && input.throttle > 0) {
      runs.launch = { t: 0, x: p.x, z: p.z, dist: 0 };
      runs.t100 = null;
      runs.quarter = null;
    }
    runs.still = 0;
  }
  if (runs.launch) {
    const L = runs.launch;
    L.t += dt;
    L.dist += s.speedMs * dt;
    if (runs.t100 === null && kmh >= 100) {
      runs.t100 = L.t;
      runs.best100 = runs.best100 == null ? L.t : Math.min(runs.best100, L.t);
    }
    if (runs.quarter === null && L.dist >= 402.3) {
      runs.quarter = { t: L.t, trap: kmh };
      runs.bestQuarter = runs.bestQuarter == null || L.t < runs.bestQuarter.t ? runs.quarter : runs.bestQuarter;
      runs.launch = null;
    }
  }

  // 100-0: brake held through 100 km/h all the way to a stop. The distance
  // starts where the speed CROSSES 100, so braking from 115 still measures
  // 100-0 and not 115-0.
  if (input.brake > 0.9 && !runs.brakeFrom && runs.prevKmh > 100 && kmh <= 100) runs.brakeFrom = { x: p.x, z: p.z };
  runs.prevKmh = kmh;
  if (runs.brakeFrom) {
    if (input.brake < 0.9) runs.brakeFrom = null;
    else if (s.speedKmh < 1) {
      runs.brake100 = Math.hypot(p.x - runs.brakeFrom.x, p.z - runs.brakeFrom.z);
      runs.brakeFrom = null;
    }
  }

  // Drift score, SPEC §5.5: kmh x angle factor (15°-50° -> 0..1) x combo.
  const ang = Math.abs(s.slipDeg);
  const factor = THREE.MathUtils.clamp((ang - 15) / 35, 0, 1);
  if (factor > 0 && kmh > 20) {
    runs.comboT += dt;
    runs.combo = Math.min(3, 1 + 0.1 * Math.floor(runs.comboT / 2));
    runs.drift += kmh * factor * runs.combo * dt;
    runs.driftBest = Math.max(runs.driftBest, runs.drift);
  } else if (ang < 8) {
    runs.comboT = Math.max(0, runs.comboT - dt * 2);
    if (runs.comboT === 0) runs.drift = 0;
  }
  trackLeg(dt, s, factor > 0 && kmh > 20);
}

// A "run" for the club's daily quests: from setting off to coming to rest again
// (moving for 3 s or more, reaching 20 km/h). Reported once, when the car stops
// or the player leaves.
const leg = { t: 0, top: 0, drift: 0, hold: 0, still: 0 };
function trackLeg(dt, s, drifting) {
  if (s.speedKmh >= 5) {
    leg.t += dt; leg.still = 0; leg.top = Math.max(leg.top, s.speedKmh);
    leg.hold = drifting ? leg.hold + dt : 0; leg.drift = Math.max(leg.drift, leg.hold);
  } else if (leg.t > 0) {
    leg.still += dt;
    if (leg.still > 0.8) endLeg(true);
  }
}
function endLeg(show) {
  if (leg.t >= 3 && leg.top >= 20) {
    const r = reportRound('racing', 'run', { topKmh: Math.round(leg.top), driftSec: Math.floor(leg.drift) });
    if (show) showRoundPanel(r, { corner: 'bl' });
  }
  leg.t = 0; leg.top = 0; leg.drift = 0; leg.hold = 0; leg.still = 0;
}

// --- HUD -----------------------------------------------------------------------
const hud = buildHud();
function buildHud() {
  const el = (tag, cls, html = '') => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    e.innerHTML = html;
    return e;
  };
  const tele = el('div', 'panel tele');
  const gear = el('div', 'gear', '1');
  const speed = el('div', 'speed', '0<small>km/h</small>');
  const rpm = el('div', 'rpm', '<i></i>');
  const dl = el('dl');
  const rows = {};
  for (const [k, label] of [
    ['rpm', 'rpm'],
    ['slip', 'slip'],
    ['nitro', 'nitro'],
    ['force', 'drive / drag'],
  ]) {
    dl.append(el('dt', null, label));
    rows[k] = el('dd');
    dl.append(rows[k]);
  }
  const tyres = el('div', 'tyres', '<b></b><b></b><b></b><b></b>');
  tele.append(gear, speed, rpm, dl, tyres);
  const runsEl = el('div', 'panel runs');
  const keys = el(
    'div',
    'panel keys',
    '<kbd>W</kbd><kbd>S</kbd><kbd>A</kbd><kbd>D</kbd> drive · <kbd>Space</kbd> handbrake · <kbd>Shift</kbd> nitrous · <kbd>E</kbd><kbd>Q</kbd> shift (manual) · <kbd>C</kbd> camera · <kbd>R</kbd> reset upright · <kbd>Home</kbd> start line · <kbd>T</kbd> clear timers · hold RMB look back · <kbd>Esc</kbd> back to the club <span class="pad" hidden>· gamepad active</span>'
  );
  const toast = el('div', 'panel toast');
  document.body.append(tele, runsEl, keys, toast);
  return { gear, speed, rpm, rows, tyres: [...tyres.children], runs: runsEl, pad: keys.querySelector('.pad'), toast };
}

let toastTimer = 0;
function toast(text) {
  hud.toast.textContent = text;
  hud.toast.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => hud.toast.classList.remove('on'), 1600);
}

const fmt = (v, d = 2, unit = ' s') => (v == null ? '—' : `${v.toFixed(d)}${unit}`);
let hudT = 0;
function drawHud(dt) {
  hudT += dt;
  if (hudT < 1 / 20) return; // DOM at 20 Hz is plenty
  hudT = 0;
  const s = rc.state;
  hud.gear.textContent = s.gear;
  hud.speed.innerHTML = `${Math.round(s.speedKmh)}<small>km/h</small>`;
  const car = rc.car;
  hud.rpm.firstChild.style.width = `${Math.min(100, (s.rpm / car.limiterRpm) * 100)}%`;
  hud.rpm.classList.toggle('hot', s.rpm > car.redlineRpm);
  hud.rows.rpm.textContent = `${Math.round(s.rpm)}${s.limiter ? ' LIM' : ''}`;
  hud.rows.slip.textContent = `${s.slipDeg.toFixed(1)}°`;
  hud.rows.nitro.textContent = `${s.nitroLeft.toFixed(1)} s${s.nitroOn ? ' ON' : ''}`;
  hud.rows.force.textContent = `${Math.round(s.wheelForce)} / ${Math.round(s.dragForce)} N`;
  s.sliding.forEach((sl, i) => hud.tyres[i].classList.toggle('slide', sl));
  const q = runs.quarter ?? runs.bestQuarter;
  hud.runs.innerHTML = [
    `0–100 <b>${fmt(runs.t100 ?? runs.launch?.t ?? null)}</b> best <b>${fmt(runs.best100)}</b>`,
    `¼ mile <b>${q ? `${q.t.toFixed(2)} s @ ${Math.round(q.trap)}` : runs.launch ? `${Math.round(runs.launch.dist)} m` : '—'}</b>`,
    `100–0 <b>${fmt(runs.brake100, 1, ' m')}</b>`,
    `top <b>${Math.round(runs.top)} km/h</b>`,
    `drift <b>${Math.round(runs.drift)}</b> ×${runs.combo.toFixed(1)} best <b>${Math.round(runs.driftBest)}</b>`,
  ]
    .map((x) => `<span>${x}</span>`)
    .join('');
}

// --- tuning panel ------------------------------------------------------------------
const panel = document.createElement('div');
panel.className = 'panel tune';
document.body.append(panel);
const panelRefs = {};

function buildPanel() {
  const car = CARS[carId];
  panel.innerHTML = '';
  const header = document.createElement('header');
  header.innerHTML = '<h1>Night Drive <small style="font-weight:400;color:var(--ink-faint)">· test drive, early build</small></h1>';
  const carRow = document.createElement('div');
  carRow.className = 'row';
  for (const c of Object.values(CARS)) {
    const b = document.createElement('button');
    b.textContent = c.name;
    b.className = c.id === carId ? 'on' : '';
    b.addEventListener('click', () => {
      b.blur();
      if (c.id !== carId) spawnCar(c.id, START);
    });
    carRow.append(b);
  }
  const optRow = document.createElement('div');
  optRow.className = 'row';
  optRow.style.marginTop = '6px';
  const camBtn = document.createElement('button');
  camBtn.textContent = `Camera: ${cameraMode}`;
  camBtn.addEventListener('click', () => {
    camBtn.blur();
    toggleCamera();
  });
  const boxBtn = document.createElement('button');
  boxBtn.textContent = `Gearbox: ${manual ? 'manual' : 'auto'}`;
  boxBtn.addEventListener('click', () => {
    boxBtn.blur();
    manual = !manual;
    rc.setManual(manual);
    boxBtn.textContent = `Gearbox: ${manual ? 'manual' : 'auto'}`;
  });
  const stockBtn = document.createElement('button');
  stockBtn.textContent = 'Stock (Race, base parts)';
  stockBtn.addEventListener('click', () => {
    stockBtn.blur();
    setup = defaultTuning(car);
    saveSetup(carId, setup);
    rc.applyTuning(setup);
    buildPanel();
    toast('Stock setup');
  });
  const copyBtn = document.createElement('button');
  copyBtn.textContent = 'Copy setup';
  copyBtn.addEventListener('click', async () => {
    copyBtn.blur();
    const text = JSON.stringify({ car: carId, setup }, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      toast('Setup copied');
    } catch {
      console.log(text);
      toast('Setup printed to the console');
    }
  });
  optRow.append(camBtn, boxBtn, stockBtn, copyBtn);
  // Preset tunes: change free tuning only; parts stay as owned.
  const presetRow = document.createElement('div');
  presetRow.className = 'row';
  presetRow.style.marginTop = '6px';
  for (const [name, pr] of Object.entries(PRESETS)) {
    const b = document.createElement('button');
    b.textContent = pr.label;
    b.title = pr.about;
    b.addEventListener('click', () => {
      b.blur();
      setup = applyPreset(car, setup, name);
      saveSetup(carId, setup);
      rc.applyTuning(setup);
      buildPanel();
      toast(`${pr.label}: ${pr.about}`);
    });
    presetRow.append(b);
  }
  // Speed cues, each switchable so they can be judged one at a time.
  const feelRow = document.createElement('div');
  feelRow.className = 'row';
  feelRow.style.marginTop = '6px';
  for (const [key, label] of [
    ['shake', 'Rumble'],
    ['blur', 'Blur'],
    ['streaks', 'Streaks'],
  ]) {
    const b = document.createElement('button');
    const draw = () => {
      b.textContent = `${label}: ${feel[key] ? 'on' : 'off'}`;
      b.className = feel[key] ? 'on' : '';
    };
    b.addEventListener('click', () => {
      b.blur();
      feel[key] = !feel[key];
      if (key === 'shake') speedFeel.setShake(feel.shake);
      draw();
    });
    draw();
    feelRow.append(b);
  }
  header.append(carRow, optRow, presetRow, feelRow);
  panelRefs.camBtn = camBtn;

  const fields = document.createElement('div');
  fields.className = 'fields';
  let group = null;
  const ordered = [...FIELDS.filter((f) => !f.upgrade), ...FIELDS.filter((f) => f.upgrade)];
  for (const f of ordered) {
    const heading = f.upgrade ? 'Upgrades (bought in the career)' : f.group;
    if (heading !== group) {
      group = heading;
      const h = document.createElement('h2');
      h.textContent = group;
      fields.append(h);
    }
    const wrap = document.createElement('div');
    wrap.className = 'field';
    const label = document.createElement('label');
    const out = document.createElement('output');
    const stock = f.stock(car);
    const show = (v) => {
      out.textContent = f.kind === 'enum' ? v : `${f.kind === 'int' ? v : (+v).toFixed(f.step < 0.01 ? 3 : f.step < 1 ? 2 : 0)}${f.unit ? ` ${f.unit}` : ''}`;
      wrap.classList.toggle('changed', v !== stock);
    };
    label.append(document.createTextNode(f.label), out);
    const id = `f-${f.key}`;
    label.htmlFor = id;
    let control;
    if (f.kind === 'enum') {
      control = document.createElement('select');
      for (const o of f.options) control.append(new Option(o, o));
      control.value = setup[f.key];
    } else {
      control = document.createElement('input');
      control.type = 'range';
      control.min = f.min;
      control.max = f.max;
      control.step = f.step;
      control.value = setup[f.key];
    }
    control.id = id;
    control.addEventListener('input', () => {
      const v = cleanField(car, f.key, control.value);
      setup = { ...setup, [f.key]: v };
      show(v);
      rc.applyTuning(setup);
      saveSetup(carId, setup);
    });
    show(setup[f.key]);
    const p = document.createElement('p');
    p.textContent = f.effect;
    wrap.append(label, control, p);
    fields.append(wrap);
  }
  panel.append(header, fields);
}

// --- ground ---------------------------------------------------------------------------
function buildGround() {
  const lambert = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
  const addBox = (pos, size, color, collide = true, kind = 'barrier') => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(...size), lambert(color));
    m.position.set(...pos);
    scene.add(m);
    // Colliders at least 0.6 m thick (CLAUDE.md: tunnelling at 250 km/h).
    if (collide) physics.addStaticBox({ pos, size: size.map((s, i) => (i === 1 ? s : Math.max(0.6, s))), userData: { kind } });
    return m;
  };

  physics.addGround({ width: GROUND.width, depth: GROUND.depth });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(GROUND.width, GROUND.depth), lambert(COLORS.plaza));
  floor.rotation.x = -Math.PI / 2;
  const plazaGrain = makeGrainTexture();
  plazaGrain.repeat.set(GROUND.width / 3, GROUND.depth / 3);
  floor.material.map = plazaGrain;
  scene.add(floor);

  // Straight: darker tarmac strip, edge lines, dashed centre line, barriers.
  const len = STRAIGHT.zStart - STRAIGHT.zEnd + 40;
  const zc = (STRAIGHT.zStart + STRAIGHT.zEnd) / 2 + 20;
  // Asphalt grain: a generated noise texture (no image files). Fine texture
  // right beside the car is one of the strongest speed cues there is.
  const grain = makeGrainTexture();
  grain.repeat.set((STRAIGHT.halfWidth * 2) / 3, len / 3);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(STRAIGHT.halfWidth * 2, len), lambert(0xffffff, { map: grain, color: COLORS.asphalt }));
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.005, zc);
  scene.add(road);
  // Paint is lit like the road (lamp map + headlights), with a trace of
  // emissive so a line in the dark between lamps is still just visible.
  const paintMat = (color) => lambert(color, { emissive: color, emissiveIntensity: 0.06 });
  const paint = (x, z, w, l, color = COLORS.line, y = 0.012) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), paintMat(color));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    scene.add(m);
    return m;
  };
  paint(-STRAIGHT.halfWidth + 0.3, zc, 0.15, len);
  paint(STRAIGHT.halfWidth - 0.3, zc, 0.15, len);
  // Lane dashes: 3 m of paint every 9 m on three lane lines, so something
  // flicks past at the edge of the view many times a second at speed.
  const dashXs = [-STRAIGHT.halfWidth / 2, 0, STRAIGHT.halfWidth / 2];
  const perLine = Math.ceil(len / 9);
  const dashes = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.14, 3), paintMat(COLORS.line), perLine * dashXs.length);
  const mtx = new THREE.Matrix4();
  const rotX = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
  let n = 0;
  for (const x of dashXs) {
    for (let z = STRAIGHT.zStart + 20; z > STRAIGHT.zEnd - 20; z -= 9) {
      mtx.makeTranslation(x, 0.012, z).multiply(rotX);
      dashes.setMatrixAt(n++, mtx);
    }
  }
  dashes.count = n;
  scene.add(dashes);
  // Cat's eyes on the centre line, between the dashes.
  const eyes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.03, 0.08), new THREE.MeshBasicMaterial({ color: 0xfff1c4 }), perLine);
  let ne = 0;
  for (let z = STRAIGHT.zStart + 15.5; z > STRAIGHT.zEnd - 20 && ne < perLine; z -= 9) eyes.setMatrixAt(ne++, new THREE.Matrix4().makeTranslation(0, 0.02, z));
  eyes.count = ne;
  scene.add(eyes);
  // Start line, quarter-mile line, 1 km board.
  paint(0, STRAIGHT.zStart - 10, STRAIGHT.halfWidth * 2, 0.5);
  paint(0, STRAIGHT.zStart - 10 - 402.3, STRAIGHT.halfWidth * 2, 0.5, COLORS.neonTeal);
  addBox([-STRAIGHT.halfWidth - 2.5, 2.5, STRAIGHT.zStart - 10 - 402.3], [0.3, 5, 0.3], COLORS.neonTeal, false);
  addBox([STRAIGHT.halfWidth + 2.5, 2.5, STRAIGHT.zStart - 10 - 402.3], [0.3, 5, 0.3], COLORS.neonTeal, false);
  addBox([0, 5.2, STRAIGHT.zStart - 10 - 402.3], [STRAIGHT.halfWidth * 2 + 5.3, 0.4, 0.3], COLORS.neonTeal, false);

  // Barriers along the straight (open at the plaza end), with red/white kerbs.
  const bLen = STRAIGHT.zStart - PLAZA.zNear + 20;
  const bz = (STRAIGHT.zStart + 20 + PLAZA.zNear) / 2;
  for (const sx of [-1, 1]) {
    addBox([sx * (STRAIGHT.halfWidth + 1.4), 0.45, bz], [0.8, 0.9, bLen], COLORS.barrier);
  }
  // Reflector posts on the barrier tops every 8 m (white left, amber right),
  // and dark joints down the barrier face every 4 m: close, repeating detail
  // is what the eye counts to judge speed.
  const posts = [];
  for (let z = STRAIGHT.zStart + 20; z > PLAZA.zNear; z -= 8) posts.push([-1, z], [1, z + 4]);
  const postGeo = new THREE.BoxGeometry(0.12, 0.35, 0.12);
  postGeo.translate(0, 0.9 + 0.175, 0);
  for (const [side, color] of [
    [-1, 0xf4f6fb],
    [1, 0xffb347],
  ]) {
    const list = posts.filter((p) => p[0] === side);
    const im = new THREE.InstancedMesh(postGeo, new THREE.MeshBasicMaterial({ color }), list.length);
    list.forEach(([, z], i) => im.setMatrixAt(i, new THREE.Matrix4().makeTranslation(side * (STRAIGHT.halfWidth + 1.4), 0, z)));
    scene.add(im);
  }
  const joints = [];
  for (let z = STRAIGHT.zStart + 20; z > PLAZA.zNear; z -= 4) joints.push(z);
  const jointGeo = new THREE.BoxGeometry(0.02, 0.86, 0.12);
  const jointMesh = new THREE.InstancedMesh(jointGeo, lambert(0x3a3f48), joints.length * 2);
  joints.forEach((z, i) => {
    jointMesh.setMatrixAt(i * 2, new THREE.Matrix4().makeTranslation(-(STRAIGHT.halfWidth + 0.99), 0.45, z));
    jointMesh.setMatrixAt(i * 2 + 1, new THREE.Matrix4().makeTranslation(STRAIGHT.halfWidth + 0.99, 0.45, z));
  });
  scene.add(jointMesh);
  buildSkyline();
  buildTrees();
  // Everything above is lit by the lamp map from here on. (Called after the
  // lamps and skyline exist; the car opts in when it spawns.)
  queueMicrotask(() => lampLightTree(scene));
  addBox([0, 0.45, STRAIGHT.zStart + 30], [STRAIGHT.halfWidth * 2 + 3.6, 0.9, 0.8], COLORS.barrier);

  // Perimeter walls.
  const W = GROUND.width / 2;
  const D = GROUND.depth / 2;
  addBox([0, 1.5, -D], [GROUND.width, 3, 2], COLORS.barrier);
  addBox([0, 1.5, D], [GROUND.width, 3, 2], COLORS.barrier);
  addBox([-W, 1.5, 0], [2, 3, GROUND.depth], COLORS.barrier);
  addBox([W, 1.5, 0], [2, 3, GROUND.depth], COLORS.barrier);

  // Plaza grid: reads slip and speed where there is no road.
  const grid = new THREE.GridHelper(PLAZA.halfWidth * 2, 44, 0x3b4250, 0x323843);
  grid.position.set(0, 0.01, (PLAZA.zNear + PLAZA.zFar) / 2);
  grid.scale.z = (PLAZA.zNear - PLAZA.zFar) / (PLAZA.halfWidth * 2);
  scene.add(grid);

  // Cones: visual only, like Parking Precision (no body, drive through them).
  const coneGeo = new THREE.ConeGeometry(0.22, 0.7, 10);
  coneGeo.translate(0, 0.35, 0);
  const cones = [];
  for (let a = 0; a < 360; a += 12) {
    const r = (a * Math.PI) / 180;
    cones.push([DRIFT.c[0] + Math.cos(r) * DRIFT.r, DRIFT.c[1] + Math.sin(r) * DRIFT.r]);
    if (a % 24 === 0) cones.push([DRIFT.c[0] + Math.cos(r) * (DRIFT.r - 12), DRIFT.c[1] + Math.sin(r) * (DRIFT.r - 12)]);
  }
  for (let i = 0; i < 14; i++) cones.push([150 + (i % 2 ? 0 : 0), -450 - i * 25]); // slalom
  for (let i = 0; i < 8; i++) {
    const r = (i / 8) * Math.PI * 2;
    cones.push([300 + Math.cos(r) * 3, -760 + Math.sin(r) * 3]); // hairpin pylon ring
  }
  const coneMesh = new THREE.InstancedMesh(coneGeo, lambert(COLORS.cone, { emissive: COLORS.cone, emissiveIntensity: 0.25 }), cones.length);
  cones.forEach(([x, z], i) => coneMesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, 0, z)));
  scene.add(coneMesh);

  // Street lamps: pole, arm over the road, head. Their light on the world is
  // baked into a top-down map (LampLight.js) that every lit material samples,
  // so the road is evenly lit the way a real street is, with no fake discs.
  const LAMP_H = 8;
  const ARM = 2.2;
  const lamps = [];
  for (let z = STRAIGHT.zStart + 20; z > STRAIGHT.zEnd - 20; z -= 25) {
    lamps.push([-STRAIGHT.halfWidth - 2.6, z, 1]);
    lamps.push([STRAIGHT.halfWidth + 2.6, z + 12.5, -1]);
  }
  // Plaza: taller lamps on a tighter grid (car-park style), or the open
  // floor between them falls dark.
  for (let x = -420; x <= 420; x += 35) for (let z = PLAZA.zNear - 20; z > PLAZA.zFar; z -= 35) lamps.push([x, z, 0, 12]);
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.13, LAMP_H, 6);
  poleGeo.translate(0, LAMP_H / 2, 0);
  const armGeo = new THREE.BoxGeometry(ARM, 0.08, 0.1);
  const headGeo = new THREE.BoxGeometry(0.7, 0.14, 0.34);
  const poles = new THREE.InstancedMesh(poleGeo, lambert(COLORS.pole), lamps.length);
  const arms = new THREE.InstancedMesh(armGeo, lambert(COLORS.pole), lamps.length);
  const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshBasicMaterial({ color: 0xfff2dc }), lamps.length);
  const heads3 = [];
  lamps.forEach(([x, z, side], i) => {
    const h = lamps[i][3] ?? LAMP_H;
    poles.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, 0, z).multiply(new THREE.Matrix4().makeScale(1, h / LAMP_H, 1)));
    arms.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x + (side * ARM) / 2, h, z));
    const hx = x + side * ARM;
    heads.setMatrixAt(i, new THREE.Matrix4().makeTranslation(hx, h - 0.08, z));
    heads3.push(hx, h - 0.25, z);
  });
  scene.add(poles, arms, heads);
  // Glow around each head: one Points draw call, additive.
  const glowGeo = new THREE.BufferGeometry();
  glowGeo.setAttribute('position', new THREE.Float32BufferAttribute(heads3, 3));
  const glow = new THREE.Points(
    glowGeo,
    new THREE.PointsMaterial({ map: makeGlowTexture(), color: 0xffe2bd, size: 2.2, sizeAttenuation: true, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  scene.add(glow);
  bakeLampMap({
    bounds: [-GROUND.width / 2, -GROUND.depth / 2, GROUND.width / 2, GROUND.depth / 2],
    lamps: lamps.map(([x, z, side, h]) => ({ x: x + side * ARM, z, h: h ?? LAMP_H })),
    texel: 1,
  });

  // A few neon signs at the plaza edge, for the mood the city will have.
  addBox([-120, 6, PLAZA.zFar - 3], [30, 1.2, 0.3], COLORS.neonPink, false).material = new THREE.MeshBasicMaterial({ color: COLORS.neonPink });
  addBox([140, 8, PLAZA.zFar - 3], [22, 1.2, 0.3], COLORS.neonTeal, false).material = new THREE.MeshBasicMaterial({ color: COLORS.neonTeal });
}

/**
 * Trees just beyond the barriers, slowroads-style: tall, simple, close. They
 * are the nearest tall things to the lens, so they whip past faster than
 * anything else in view. Lit by the lamp map like everything else.
 */
function buildTrees() {
  const spots = [];
  let seed = 4242;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let z = STRAIGHT.zStart + 20; z > PLAZA.zNear + 10; z -= 9) {
    for (const side of [-1, 1]) {
      if (rnd() < 0.2) continue;
      spots.push([side * (STRAIGHT.halfWidth + 4.5 + rnd() * 5), z + rnd() * 5, 0.8 + rnd() * 0.6]);
    }
  }
  const crown = new THREE.ConeGeometry(1.6, 5.5, 7);
  crown.translate(0, 5.2, 0);
  const trunk = new THREE.CylinderGeometry(0.18, 0.24, 2.6, 6);
  trunk.translate(0, 1.3, 0);
  const crowns = new THREE.InstancedMesh(crown, new THREE.MeshLambertMaterial({ color: 0x2d4a3a, flatShading: true }), spots.length);
  const trunks = new THREE.InstancedMesh(trunk, new THREE.MeshLambertMaterial({ color: 0x3b3029 }), spots.length);
  spots.forEach(([x, z, s], i) => {
    const m = new THREE.Matrix4().makeTranslation(x, 0, z).multiply(new THREE.Matrix4().makeScale(s, s, s));
    crowns.setMatrixAt(i, m);
    trunks.setMatrixAt(i, m);
  });
  scene.add(crowns, trunks);
}

/** Asphalt grain, generated: speckled greys, tiling. */
function makeGrainTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const img = g.createImageData(128, 128);
  // Deterministic LCG so the road looks the same every load.
  let seed = 1234567;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 128 * 128; i++) {
    const v = 150 + rnd() * 105 - (rnd() < 0.06 ? 70 : 0);
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}

/**
 * Buildings beyond the straight: mid-distance parallax (they slide past
 * slower than the barrier, faster than the sky), with lit windows from a
 * generated texture. Three sizes, instanced.
 */
function buildSkyline() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, 64, 64);
  let seed = 99;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      if (rnd() < 0.45) continue;
      const warm = rnd() < 0.7;
      g.fillStyle = warm ? `rgba(255,${190 + rnd() * 40},${120 + rnd() * 50},1)` : 'rgba(170,210,255,1)';
      g.fillRect(x * 16 + 4, y * 16 + 5, 8, 7);
    }
  }
  const windows = new THREE.CanvasTexture(c);
  windows.wrapS = windows.wrapT = THREE.RepeatWrapping;
  windows.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshLambertMaterial({ color: 0x1a1f28, emissive: 0xffffff, emissiveMap: windows, emissiveIntensity: 0.5 });
  /** Box whose side UVs repeat one window cell per 4 m x 3.5 m. */
  const makeGeo = (w, h, d) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    geo.translate(0, h / 2, 0);
    const uv = geo.attributes.uv;
    const normal = geo.attributes.normal;
    for (let i = 0; i < uv.count; i++) {
      const nx = Math.abs(normal.getX(i));
      const ny = Math.abs(normal.getY(i));
      if (ny > 0.5) {
        uv.setXY(i, 0, 0); // roofs: unlit
        continue;
      }
      const across = nx > 0.5 ? d : w;
      uv.setXY(i, (uv.getX(i) * across) / 16, (uv.getY(i) * h) / 14);
    }
    return geo;
  };
  const kinds = [makeGeo(18, 52, 18), makeGeo(26, 30, 22), makeGeo(34, 14, 24)];
  const spots = [[], [], []];
  let seed2 = 7;
  const r2 = () => ((seed2 = (seed2 * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let z = STRAIGHT.zStart + 60; z > PLAZA.zNear; z -= 38) {
    for (const side of [-1, 1]) {
      const x = side * (45 + r2() * 70);
      spots[Math.floor(r2() * 3)].push([x, z + r2() * 20]);
    }
  }
  for (let x = -380; x <= 380; x += 70) spots[Math.floor(r2() * 3)].push([x, PLAZA.zFar - 40 - r2() * 20]);
  kinds.forEach((geo, k) => {
    const im = new THREE.InstancedMesh(geo, mat, spots[k].length);
    spots[k].forEach(([x, z], i) => im.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, 0, z)));
    scene.add(im);
  });
}

// --- resize, loop ------------------------------------------------------------------------
function onResize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(window.innerWidth, window.innerHeight);
  if (seat) {
    seat.camera.aspect = window.innerWidth / window.innerHeight;
    seat.camera.updateProjectionMatrix();
  }
}
window.addEventListener('resize', onResize);

spawnCar(carId);

// --- Sundown Club: playtime, the hub's summary, Esc twice to leave ------------
// Same contract as every club game (packages/shared/leave-guard.js, profile.js):
// Esc asks, Esc again saves and goes to the hub. The summary is what the hub's
// "Your evening" section shows for this game.
const playtime = trackPlaytime('racing');
function saveToClub() {
  endLeg(false);
  playtime.flush();
  updateGame('racing', {
    resume: 'Test drive',
    facts: [
      [`${Math.round(runs.top)} km/h`, 'Top speed'],
      [runs.best100 == null ? '—' : `${runs.best100.toFixed(2)} s`, 'Best 0–100'],
    ],
    ledger: { topKmh: Math.round(runs.top), best100: runs.best100 },
  });
}
createLeaveGuard({
  game: 'Night Drive',
  save: saveToClub,
  // Let go of every key, or the car keeps driving under the card.
  onOpen: () => held.clear(),
});
addEventListener('pagehide', saveToClub);

const MAX_DT = 0.05;
const timer = new THREE.Timer();
timer.connect(document);

function simulate(dt) {
  gatherInput();
  // Physics first, then the car: update() sets forces for the NEXT step and
  // syncs the meshes to THIS one. The other way round, the body moves after
  // the meshes were placed and the camera (which follows the body) runs a
  // step ahead of the dashboard: 0.5 m at 114 km/h, which drew the cluster
  // huge and pushed the wheel out of view.
  physics.step(dt);
  rc.update(dt, input);
  input.shiftUp = false;
  input.shiftDown = false;
  updateRuns(dt);
}

function updateRig(dt) {
  const s = rc.state;
  if (cameraMode === 'chase') chase.update(dt, s);
  else seat.update(dt, look, s.speedMs);
  cockpit.update(dt, { wheelAngleRad: -s.steer * Math.PI * 2, throttle: input.throttle > 0, brake: input.brake > 0, reversing: false });
  driver.update(dt, { steerNorm: s.steer });
  const shown = { gear: s.gear === 'R' ? 'R' : 'D', autoGear: s.gear === 'R' ? 1 : s.gear, rpm: s.rpm, speedKmh: s.speedKmh, handbrake: input.handbrake, sensors: { front: null, rear: null } };
  if (cluster.update(dt, shown)) clusterTexture.needsUpdate = true;
  sky.position.copy(seat.camera.position);
  speedFeel.update(dt, { mode: cameraMode, speedMs: s.speedMs, forwardSpeedMs: s.forwardSpeedMs, nitroOn: s.nitroOn });
  streaks.update(seat.camera, rc.chassisBody.velocity, feel.streaks ? speedFeel.amount : 0);
  blur.setAmount(speedFeel.amount, feel.blur);
  if (audio.isStarted) audio.update(dt, { rpm: s.rpm, speedMs: s.speedMs, throttle: input.throttle > 0, gear: 'D' });
  drawHud(dt);
}

function frame() {
  requestAnimationFrame(frame);
  timer.update();
  const dt = Math.min(MAX_DT, timer.getDelta());
  simulate(dt);
  updateRig(dt);
  composer.render();
}
frame();

// Verification hooks (dev server only), for tools/handling-shot.mjs.
if (import.meta.env.DEV) {
  window.__lab = {
    get state() {
      return { car: carId, camera: cameraMode, ...rc.state, pos: { ...rc.chassisBody.position }, runs: { ...runs } };
    },
    setCar: (id) => spawnCar(id, START),
    setCamera(mode) {
      if (mode !== cameraMode) toggleCamera();
    },
    teleport(x, z, heading = 0) {
      rc.respawn({ pos: [x, undefined, z], heading });
      chase.reset();
    },
    /** Hold inputs for `seconds` of game time, simulating and rigging every 1/60 s. */
    drive(seconds, controls = {}) {
      const saved = { ...input };
      for (let t = 0; t < seconds; t += 1 / 60) {
        Object.assign(input, controls);
        physics.step(1 / 60);
        rc.update(1 / 60, input);
        updateRuns(1 / 60);
        updateRig(1 / 60);
      }
      Object.assign(input, saved);
      return this.state;
    },
  };
}
