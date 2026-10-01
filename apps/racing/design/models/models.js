/**
 * models.js — the Model Lab: every model the storyline needs, on one night
 * ground, with orbit camera, poses, lineups and scene mock-ups
 * (design/SPEC-models.md). A design tool, not the game.
 *
 * Views:
 *   cast lineup, one character (any pose), poses lineup, car lineup, one car
 *   (with or without its driver, lights on/off), each set, and the three
 *   chapter 1 scenes mocked up at real scale ("Keys", "Mara's", "Juno") plus
 *   a heat-3 roadblock.
 *
 * Dev builds expose window.__models (show, setView, checks) for
 * tools/models-shot.mjs, which screenshots every view and runs the checks.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createSkyDome, matte } from '../../src/world/Palette.js';
import { createFigure, REF_HEIGHT } from '../../src/story/Figure.js';
import { POSE_NAMES, walkPose } from '../../src/story/poses.js';
import { CAST, CAST_ORDER, crowdOutfit } from '../../src/story/cast.js';
import { createStoryCar, STORY_CARS, STORY_CAR_ORDER } from '../../src/vehicle/StoryCars.js';
import { createParkedCar } from '../../src/vehicle/CarModel.js';
import { BODIES } from '../../src/vehicle/bodies.js';
import { RIDE_HEIGHT } from '../../src/vehicle/Dimensions.js';
import { createCarKey, createValetBooth, createMaraGarage, createRoadblock, createRooftop } from '../../src/story/StorySets.js';

// --- renderer and scene ---------------------------------------------------------------
const container = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0c1320);
scene.add(createSkyDome(0x060a14, 0x2b2536, 300));
scene.fog = new THREE.Fog(0x1d1b27, 40, 280);
const hemi = new THREE.HemisphereLight(0x4a5878, 0x0d0f14, 0.9);
scene.add(hemi);
const moon = new THREE.DirectionalLight(0xa9bde0, 0.5);
moon.position.set(-14, 22, 10);
moon.castShadow = true;
moon.shadow.mapSize.set(2048, 2048);
Object.assign(moon.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 80 });
moon.shadow.bias = -0.0004;
scene.add(moon);
// Key light: a sodium street lamp over the subject, as in the game.
const sodium = new THREE.SpotLight(0xffb45c, 220, 40, 0.75, 0.6, 1.6);
sodium.position.set(3, 9, -4);
scene.add(sodium, sodium.target);
// Work light: neutral, for judging colours.
const work = new THREE.DirectionalLight(0xffffff, 0);
work.position.set(4, 8, -8);
scene.add(work);

const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.05, 400);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.12;

// Ground: a finite box (never a plane), wet dark asphalt.
const ground = new THREE.Mesh(new THREE.BoxGeometry(160, 0.4, 160), matte(0x2f3238));
ground.position.y = -0.2;
ground.receiveShadow = true;
scene.add(ground);

// --- what is on show ---------------------------------------------------------------------
const stage = new THREE.Group();
scene.add(stage);
const sceneLights = [];
let figures = [];
let cars = [];
let disposers = [];
let view = { kind: 'cast', id: null };
const opts = { pose: 'stand', driver: true, siren: true, light: 'night', spin: false, walk: false };

function clear() {
  for (const d of disposers) d();
  disposers = [];
  for (const l of sceneLights) scene.remove(l);
  sceneLights.length = 0;
  stage.clear();
  stage.rotation.set(0, 0, 0);
  figures = [];
  cars = [];
}

function figure(castOrOutfit, at = [0, 0, 0], heading = 0, pose = 'stand', name) {
  const outfit = typeof castOrOutfit === 'string' ? CAST[castOrOutfit].outfit : castOrOutfit;
  const f = createFigure(outfit, { name: name ?? (typeof castOrOutfit === 'string' ? castOrOutfit : 'crowd'), phase: figures.length * 0.7 });
  f.setPose(pose);
  f.group.position.set(...at);
  f.group.rotation.y = heading;
  stage.add(f.group);
  figures.push(f);
  disposers.push(() => f.dispose());
  return f;
}

function car(id, at = [0, 0, 0], heading = 0, { driver = opts.driver, lights = opts.siren } = {}) {
  const c = createStoryCar(id, { driver });
  c.group.position.set(at[0], RIDE_HEIGHT + at[1], at[2]);
  c.group.rotation.y = heading;
  c.setLights(lights);
  stage.add(c.group);
  cars.push(c);
  disposers.push(() => c.dispose());
  return c;
}

function addLights(list, offset = [0, 0, 0], heading = 0, max = 8) {
  const m = new THREE.Matrix4().makeRotationY(heading).setPosition(...offset);
  for (const l of list.slice(0, max)) {
    const p = new THREE.PointLight(l.color, l.intensity, l.distance, 1.6);
    p.position.set(...l.pos).applyMatrix4(m);
    scene.add(p);
    sceneLights.push(p);
  }
}

/** Camera on an orbit round `target` (az 0 = in front of a figure facing -Z). */
function frame(target, dist, az = 0.6, el = 0.25) {
  controls.target.set(...target);
  camera.position.set(target[0] + dist * Math.sin(az) * Math.cos(el), target[1] + dist * Math.sin(el), target[2] - dist * Math.cos(az) * Math.cos(el));
  controls.update();
}

/** Camera at an exact position, looking at `target` (inside rooms). */
function look(target, from) {
  controls.target.set(...target);
  camera.position.set(...from);
  controls.update();
}

/** A pole with marks at 1.5, 1.7, 1.9 m, for judging heights in a lineup. */
function heightPole(x) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.BoxGeometry(0.03, 2.0, 0.03), matte(0x6b7078));
  pole.position.y = 1.0;
  g.add(pole);
  for (const y of [1.5, 1.6, 1.7, 1.8, 1.9]) {
    const tick = new THREE.Mesh(new THREE.BoxGeometry(y % 0.2 < 0.05 ? 0.16 : 0.1, 0.008, 0.04), matte(0xd9dde3));
    tick.position.set(0.06, y, 0);
    g.add(tick);
  }
  g.position.x = x;
  stage.add(g);
}

// --- views ------------------------------------------------------------------------------------
const VIEWS = {
  cast() {
    const n = CAST_ORDER.length;
    // Two rows, the back one raised by the camera's height. x is reversed so
    // each row reads left to right in CAST_ORDER from the front.
    const per = Math.ceil(n / 2);
    CAST_ORDER.forEach((id, i) => {
      const r = Math.floor(i / per);
      const c = i % per;
      figure(id, [((per - 1) / 2 - c) * 1.0, 0, r * 2.6], 0, opts.pose);
    });
    heightPole(((per + 1) / 2) * 1.0);
    frame([0, 0.9, 1.3], 10.5, 0, 0.16);
  },
  character(id) {
    figure(id, [0, 0, 0], 0, opts.pose);
    frame([0, 0.92, 0], 3.3, 0.5, 0.1);
  },
  poses(id) {
    id ??= 'juno';
    const names = POSE_NAMES;
    const per = Math.ceil(names.length / 2);
    names.forEach((p, i) => {
      const r = Math.floor(i / per);
      const c = i % per;
      figure(id, [((per - 1) / 2 - c) * 1.35, 0, r * 2.8], 0, p);
    });
    frame([0, 0.9, 1.4], 11, 0.25, 0.2);
  },
  cars() {
    const ids = STORY_CAR_ORDER;
    const cols = 5;
    ids.forEach((id, i) => {
      const r = Math.floor(i / cols);
      const c = i % cols;
      car(id, [(c - (cols - 1) / 2) * 3.0, 0, r * 6.2 - 6], 0.5);
    });
    frame([0, 0.5, 3], 26, 0.85, 0.42);
  },
  car(id) {
    car(id, [0, 0, 0], 0);
    frame([0, 0.8, 0], 7.5, 0.75, 0.2);
  },
  key() {
    const k = createCarKey();
    k.group.position.set(0, 1.0, 0);
    k.group.rotation.y = 1.1; // tag swung out toward the camera
    stage.add(k.group);
    frame([0, 0.95, 0.01], 0.3, 0.25, 0.15);
  },
  booth() {
    const b = createValetBooth();
    stage.add(b.group);
    addLights(b.lights);
    b.setBarrier(0);
    frame([-0.8, 1.3, 0], 8.5, 0.7, 0.2);
  },
  garage() {
    const g = createMaraGarage();
    stage.add(g.group);
    addLights(g.lights);
    g.setDoor(0.85);
    look([-1.6, 1.2, 1.4], [4.4, 2.6, -3.5]);
  },
  roadblock() {
    const r = createRoadblock({ width: 16 });
    stage.add(r.group);
    car('police', [-2.2, 0, 1.6], Math.PI / 2 + 0.35, { lights: true });
    car('police', [2.4, 0, 1.9], -Math.PI / 2 - 0.3, { lights: true, driver: false });
    figure('officer', [5.0, 0, -0.6], Math.PI + 0.3, 'point');
    figure('officer', [-5.5, 0, 0.2], Math.PI - 0.2, 'handsOnHips');
    frame([0, 1.0, 0], 15, 0.2, 0.18);
  },
  rooftop() {
    const r = createRooftop();
    stage.add(r.group);
    addLights(r.lights);
    frame([0, 1, 0], 30, 0.6, 0.45);
  },

  /** Scene 1 "Keys": you in the booth with Jax's key; Tidewater at the counter. */
  sceneKeys() {
    const b = createValetBooth();
    stage.add(b.group);
    addLights(b.lights);
    const you = figure('you', [0.15, 0.12, -0.25], 0, 'holdKey');
    you.sockets.handR.add(createCarKey().group);
    figure('tidewaterA', [0.25, 0, -1.75], Math.PI + 0.15, 'talk');
    car('tidewaterSedan', [3.6, 0, -4.4], -Math.PI / 2 + 0.12, { driver: false });
    car('tidewaterHatch', [8.6, 0, -4.9], -Math.PI / 2, { driver: true });
    car('starter', [6.5, 0, 2.6], 0.1, { driver: false });
    for (let i = 0; i < 3; i++) {
      const pc = createParkedCar([0x8fa9c4, 0xc9c08a, 0x33363d][i], BODIES.sedan);
      pc.position.set(9.4 + i * 2.7, RIDE_HEIGHT, 2.6);
      stage.add(pc);
    }
    frame([0.3, 1.25, -1.0], 7.4, -0.55, 0.12);
  },

  /** Scene 2 "Mara's": the workshop, Jax's car on the lift, Mara and you. */
  sceneMaras() {
    const g = createMaraGarage();
    stage.add(g.group);
    addLights(g.lights);
    g.setDoor(0.9);
    car('starter', [g.liftBay.pos[0], 0, g.liftBay.pos[2]], 0, { driver: false });
    figure('mara', [1.15, 0, -1.6], -0.6, 'kneel');
    figure('youStreet', [-1.5, 0, -2.6], 0.5, 'handsInPockets');
    figure('jax', [-3.0, 0, 2.6], 2.6, 'talk');
    car('tow', [3.2, 0, -7.5], Math.PI * 0.5, { driver: false, lights: false });
    look([-0.4, 0.9, 0.2], [4.4, 2.7, -3.5]);
  },

  /** Scene 3 "Juno": rooftop, Tidewater lined up, Juno out front. */
  sceneJuno() {
    const r = createRooftop();
    stage.add(r.group);
    addLights(r.lights);
    const line = ['tidewaterHatch', 'pike', 'juno', 'tidewaterSedan'];
    line.forEach((id, i) => car(id, [r.bays[i + 3][0], 0, r.bays[i + 3][1]], Math.PI, { driver: false }));
    figure('juno', [r.bays[5][0], 0, r.bays[5][1] + 4.2], Math.PI, 'handsOnHips');
    figure('pike', [r.bays[4][0] + 1.2, 0, r.bays[4][1] + 2.3], Math.PI + 0.3, 'lean');
    figure('tidewaterA', [r.bays[6][0] + 1.1, 0, r.bays[6][1] + 2.2], Math.PI - 0.4, 'armsCrossed');
    for (let i = 0; i < 5; i++) figure(crowdOutfit(i, i % 2 ? 'tidewater' : null), [r.bays[3][0] - 2 + i * 0.8, 0, r.bays[3][1] + 4.8 + (i % 2) * 0.6], Math.PI + (i - 2) * 0.2, i % 2 ? 'relaxed' : 'armsCrossed');
    car('starter', [r.bays[5][0] + 0.3, 0, r.bays[5][1] + 10], 0.08, { driver: false });
    figure('youStreet', [r.bays[5][0] - 1.4, 0, r.bays[5][1] + 8.5], 0, 'stand');
    frame([r.bays[5][0], 1.2, r.bays[5][1] + 5], 13, 3.6, 0.2);
  },

  crowd() {
    for (let i = 0; i < 16; i++) {
      const crew = [null, 'tidewater', 'lantern', 'ironside', 'summit'][i % 5];
      figure(crowdOutfit(i, crew), [(i % 8) * 0.95 - 3.3, 0, Math.floor(i / 8) * 1.4], 0, ['stand', 'relaxed', 'armsCrossed', 'handsInPockets'][i % 4]);
    }
    frame([0, 1, 0.7], 10, 0.2, 0.15);
  },
};

const SCENES = new Set(['sceneKeys', 'sceneMaras', 'sceneJuno', 'roadblock', 'booth', 'garage', 'rooftop']);

function show(kind, id = null) {
  clear();
  view = { kind, id };
  // Scenes in night light, as the game will show them; single models and
  // lineups in neutral work light, for judging shape and colour.
  setLighting(SCENES.has(kind) ? 'night' : 'work');
  VIEWS[kind](id);
  buildPanel();
  info.textContent = describe();
}

function describe() {
  if (view.kind === 'character') {
    const c = CAST[view.id];
    return `${c.name} — ${c.role}\nheight ${c.outfit.height.toFixed(2)} m  car ${c.car ?? '—'}  crew ${c.crew ?? '—'}`;
  }
  if (view.kind === 'car') {
    const c = cars[0];
    const s = c.seat;
    return `${c.def.name}\nbody ${c.def.body}${s ? `\ndriver ${c.def.driver}: head clears roof by ${(s.clearance * 100).toFixed(1)} cm, hip ${(s.hipAboveFloor * 100).toFixed(0)} cm above floor` : ''}`;
  }
  return '';
}

// --- panel ---------------------------------------------------------------------------------
const panel = document.createElement('div');
panel.className = 'panel';
document.body.append(panel);
const info = document.createElement('div');
info.className = 'info';
document.body.append(info);

function button(row, label, on, click) {
  const b = document.createElement('button');
  b.textContent = label;
  if (on) b.className = 'on';
  b.addEventListener('click', () => {
    b.blur();
    click();
  });
  row.append(b);
}
function section(title) {
  const h = document.createElement('h2');
  h.textContent = title;
  const row = document.createElement('div');
  row.className = 'row';
  panel.append(h, row);
  return row;
}

function buildPanel() {
  panel.innerHTML = '<h1>Model Lab</h1><div style="color:#9aa6b6">Every model the story needs. Drag to orbit, scroll to zoom.</div>';
  let r = section('Scenes (chapter 1)');
  for (const [k, label] of [['sceneKeys', '1 Keys'], ['sceneMaras', "2 Mara's"], ['sceneJuno', '3 Juno'], ['roadblock', 'Roadblock']]) button(r, label, view.kind === k, () => show(k));
  r = section('Lineups');
  for (const [k, label] of [['cast', 'Cast'], ['poses', 'Poses'], ['cars', 'Cars'], ['crowd', 'Crowd']]) button(r, label, view.kind === k, () => show(k));
  r = section('Characters');
  for (const id of CAST_ORDER) button(r, id === 'youStreet' ? 'You (street)' : CAST[id].name.replace(' driver', ''), view.kind === 'character' && view.id === id, () => show('character', id));
  r = section('Pose');
  const sel = document.createElement('select');
  for (const p of POSE_NAMES) {
    const o = document.createElement('option');
    o.value = o.textContent = p;
    if (p === opts.pose) o.selected = true;
    sel.append(o);
  }
  sel.addEventListener('change', () => {
    opts.pose = sel.value;
    opts.walk = false;
    for (const f of figures) f.setPose(opts.pose, { blend: 0.4 });
  });
  r.append(sel);
  button(r, 'Walk', opts.walk, () => {
    opts.walk = !opts.walk;
    buildPanel();
  });
  r = section('Cars');
  for (const id of STORY_CAR_ORDER) button(r, STORY_CARS[id].name.replace(/^(.*?)'s /, '$1 ').replace(' (starter saloon)', ''), view.kind === 'car' && view.id === id, () => show('car', id));
  r = section('Sets and props');
  for (const [k, label] of [['booth', 'Valet booth'], ['key', 'Car key'], ['garage', "Mara's garage"], ['rooftop', 'Rooftop']]) button(r, label, view.kind === k, () => show(k));
  r = section('Options');
  button(r, `Drivers: ${opts.driver ? 'on' : 'off'}`, opts.driver, () => {
    opts.driver = !opts.driver;
    show(view.kind, view.id);
  });
  button(r, `Lights: ${opts.siren ? 'on' : 'off'}`, opts.siren, () => {
    opts.siren = !opts.siren;
    for (const c of cars) c.setLights(opts.siren);
    buildPanel();
  });
  button(r, `Light: ${opts.light}`, opts.light === 'work', () => {
    setLighting(opts.light === 'night' ? 'work' : 'night');
    buildPanel();
  });
  button(r, 'Turntable', opts.spin, () => {
    opts.spin = !opts.spin;
    buildPanel();
  });
}

function setLighting(mode) {
  opts.light = mode;
  work.intensity = mode === 'work' ? 2.4 : 0;
  hemi.intensity = mode === 'work' ? 2.2 : 1.2;
  sodium.intensity = mode === 'work' ? 0 : 220;
}

/** Shift the picture's centre right, clear of the 290 px panel. */
function fitView() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.setViewOffset(w + 290, h, 0, 0, w, h);
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
fitView();

// --- loop ------------------------------------------------------------------------------------
let walkPhase = 0;
function tick(dt) {
  if (opts.walk) {
    walkPhase = (walkPhase + dt / 1.1) % 1;
    for (const f of figures) f.setPose(walkPose(walkPhase));
  }
  for (const f of figures) f.update(dt);
  for (const c of cars) c.update(dt);
  if (opts.spin) stage.rotation.y += dt * 0.35;
  controls.update();
  renderer.render(scene, camera);
}
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => tick(Math.min(clock.getDelta(), 0.05)));

window.addEventListener('resize', fitView);

// --- checks (design/SPEC-models.md §5) -------------------------------------------------------------

/** Triangles and meshes under a root. */
function stats(root) {
  let tris = 0;
  let meshes = 0;
  root.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    meshes++;
    const g = o.geometry;
    tris += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
  });
  return { tris, meshes };
}

/**
 * Coplanar same-facing overlapping faces between unrotated boxes under one
 * root: the z-fighting the "nothing flush" rule forbids. Only axis-aligned
 * boxes are tested (most of the sets and bolt-ons); lofted surfaces are
 * judged in the screenshots.
 */
function flushFaces(root, tol = 0.0008, groundY = 0) {
  root.updateMatrixWorld(true);
  const boxes = [];
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  root.traverse((o) => {
    if (!o.isMesh || !o.visible || o.geometry.type !== 'BoxGeometry') return;
    // beamGeometry() bakes a rotation into a BoxGeometry; only plain boxes count.
    const g = o.geometry;
    g.computeBoundingBox();
    const size = g.boundingBox.getSize(new THREE.Vector3());
    const { width, height, depth } = g.parameters;
    if (Math.abs(size.x - width) + Math.abs(size.y - height) + Math.abs(size.z - depth) > 1e-6) return;
    o.matrixWorld.decompose(p, q, s);
    // Axis-aligned only (any rotation that is not a multiple of 90 degrees is skipped).
    const e = new THREE.Euler().setFromQuaternion(q);
    const aligned = [e.x, e.y, e.z].every((a) => Math.abs(Math.sin(a * 2)) < 1e-4);
    if (!aligned) return;
    const b = new THREE.Box3().setFromObject(o);
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (mats.every((m) => m.transparent)) return;
    boxes.push({ b, name: o.parent?.name || o.name || 'box' });
  });
  const hits = [];
  const axes = ['x', 'y', 'z'];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const A = boxes[i].b;
      const B = boxes[j].b;
      for (let a = 0; a < 3; a++) {
        const k = axes[a];
        const o1 = axes[(a + 1) % 3];
        const o2 = axes[(a + 2) % 3];
        const ov1 = Math.min(A.max[o1], B.max[o1]) - Math.max(A.min[o1], B.min[o1]);
        const ov2 = Math.min(A.max[o2], B.max[o2]) - Math.max(A.min[o2], B.min[o2]);
        if (ov1 <= 0.002 || ov2 <= 0.002) continue;
        for (const side of ['min', 'max']) {
          // Undersides resting on the ground can never be seen.
          if (k === 'y' && side === 'min' && A.min.y < groundY + tol) continue;
          if (Math.abs(A[side][k] - B[side][k]) < tol) {
            hits.push(`${k}${side === 'min' ? '-' : '+'} at ${A[side][k].toFixed(3)} (${(ov1 * 100).toFixed(0)}x${(ov2 * 100).toFixed(0)} cm)`);
          }
        }
      }
    }
  }
  return hits;
}

function metalCheck(root) {
  const bad = new Set();
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if ((m.metalness ?? 0) > 0) bad.add(m.type);
    }
  });
  return [...bad];
}

function checks() {
  const out = { cast: {}, cars: {}, sets: {}, failures: [] };
  const fail = (msg) => out.failures.push(msg);
  const holder = new THREE.Group();
  scene.add(holder);

  // Heights: top of the bare skull = the cast height (+-1 cm).
  for (const id of CAST_ORDER) {
    const f = createFigure(CAST[id].outfit, { name: id, breathe: false });
    holder.add(f.group);
    f.update(0);
    f.group.updateMatrixWorld(true);
    const top = new THREE.Box3().setFromObject(f.parts.skull[0]).max.y;
    const st = stats(f.group);
    const flush = flushFaces(f.group);
    out.cast[id] = { height: CAST[id].outfit.height, measured: +top.toFixed(3), tris: st.tris, meshes: st.meshes, flush: flush.length };
    if (Math.abs(top - CAST[id].outfit.height) > 0.01) fail(`${id}: head top ${top.toFixed(3)} m, cast says ${CAST[id].outfit.height}`);
    if (st.tris > 4000) fail(`${id}: ${st.tris} triangles (budget 4,000)`);
    if (st.meshes > 70) fail(`${id}: ${st.meshes} meshes (budget 70)`);
    for (const h of flush) fail(`${id}: flush faces ${h}`);
    holder.remove(f.group);
    f.dispose();
  }

  // Cars: seated driver fits, triangles, flush faces, no metal.
  const sedan = createParkedCar(0x888888, BODIES.sedan);
  const base = stats(sedan).tris;
  for (const id of STORY_CAR_ORDER) {
    const c = createStoryCar(id, { driver: true });
    holder.add(c.group);
    const st = stats(c.group);
    const shellOnly = createStoryCar(id, { driver: false });
    const flush = flushFaces(shellOnly.group);
    shellOnly.dispose();
    const s = c.seat;
    out.cars[id] = {
      body: c.def.body,
      tris: st.tris,
      meshes: st.meshes,
      clearanceCm: s ? +(s.clearance * 100).toFixed(1) : null,
      hipAboveFloorCm: s ? +(s.hipAboveFloor * 100).toFixed(1) : null,
      headAboveBeltCm: s ? +((s.headTop - c.spec.yBelt) * 100).toFixed(1) : null,
      flush,
    };
    if (s && s.clearance < 0.035) fail(`${id}: driver's head clears the roof by ${(s.clearance * 100).toFixed(1)} cm (min 3.5)`);
    if (s && s.hipAboveFloor < 0.12) fail(`${id}: driver's hip only ${(s.hipAboveFloor * 100).toFixed(0)} cm above the floor (min 12)`);
    if (s && s.headTop - c.spec.yBelt < 0.15) fail(`${id}: driver's head only ${((s.headTop - c.spec.yBelt) * 100).toFixed(0)} cm above the belt (min 15, must show in the glass)`);
    if (st.tris > base + 9000) fail(`${id}: ${st.tris} triangles (budget sedan ${base} + 9,000)`);
    for (const h of flush) fail(`${id}: flush faces ${h}`);
    for (const m of metalCheck(c.group)) fail(`${id}: metal material ${m}`);
    holder.remove(c.group);
    c.dispose();
  }

  // Sets.
  const sets = {
    key: createCarKey(),
    booth: createValetBooth(),
    garage: createMaraGarage(),
    roadblock: createRoadblock(),
    rooftop: createRooftop(),
  };
  const budgets = { key: 800, booth: 6000, garage: 30000, roadblock: 4000, rooftop: 30000 };
  for (const [k, s] of Object.entries(sets)) {
    holder.add(s.group);
    const st = stats(s.group);
    const flush = flushFaces(s.group);
    const thin = s.colliders.filter((c) => Math.min(...c.size) < 0.6);
    out.sets[k] = { tris: st.tris, meshes: st.meshes, colliders: s.colliders.length, thinColliders: thin.length, flush };
    if (st.tris > budgets[k]) fail(`${k}: ${st.tris} triangles (budget ${budgets[k]})`);
    for (const h of flush) fail(`${k}: flush faces ${h}`);
    if (thin.length) fail(`${k}: ${thin.length} colliders thinner than 0.6 m`);
    for (const m of metalCheck(s.group)) fail(`${k}: metal material ${m}`);
    holder.remove(s.group);
  }
  scene.remove(holder);
  return out;
}

// --- boot ---------------------------------------------------------------------------------
show('sceneKeys');

if (import.meta.env.DEV) {
  window.__models = {
    show: (kind, id) => {
      show(kind, id);
      return true;
    },
    setPose: (p) => {
      opts.pose = p;
      for (const f of figures) f.setPose(p);
    },
    setView: (target, dist, az, el) => frame(target, dist, az, el),
    setLighting,
    setOpt: (k, v) => {
      opts[k] = v;
      show(view.kind, view.id);
    },
    step: (n = 1, dt = 1 / 60) => {
      for (let i = 0; i < n; i++) tick(dt);
    },
    checks,
    REF_HEIGHT,
  };
}
