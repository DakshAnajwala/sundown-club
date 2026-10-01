/**
 * Locations.js — the places the story scenes are set in that are bigger
 * than a prop (design/SPEC-scenes.md §4). Each is a stand-in at real scale
 * until the district builder makes the real one; a scene placed in a
 * district location later keeps its coordinates relative to the location's
 * origin.
 *
 *   createMultiStorey()  Harbour Street multi-storey front and street (prologue)
 *   createPier()         harbour quay, containers, crane, ferry ramp (ch. 1, ending)
 *   createAlley()        Old Town street under lantern strings (ch. 2)
 *   createRailYard()     tracks, wagons, high masts, access road (ch. 3)
 *   createLookout()      Calder Ridge pull-off over the city lights (ch. 4)
 *   createSkyline()      a ring of distant lit buildings (backdrop)
 *
 * Same contract as StorySets.js: { group, colliders, lights }, ground frame,
 * metres, nothing flush with a visible face, colliders >= 0.6 m thick. Every
 * "random" choice comes from a fixed seed, so a location is identical on
 * every load (screenshots and probes depend on it).
 */
import * as THREE from 'three';
import { matte, glow, COLORS } from '../world/Palette.js';
import { paintQuad } from '../world/Props.js';
import { beamGeometry, mergeGeometries } from '../vehicle/BodyLoft.js';
import { makeGlowTexture } from '../render/LampLight.js';
import { slab, cylinder, canvasTexture, signMaterial, stripeMaterial } from './StorySets.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const SODIUM = 0xffb45c;

/** Seeded random in [0, 1). */
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

let glowTex = null;
const glowTexture = () => (glowTex ??= makeGlowTexture(64));

/** A soft additive glow sprite (lamp heads, lanterns, distant lights). */
function glowSprite(group, pos, size, color) {
  const m = new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  m.userData.disposable = true;
  const s = new THREE.Sprite(m);
  s.scale.setScalar(size);
  s.position.set(...pos);
  group.add(s);
  return s;
}

/**
 * Lit windows for a facade: a grid of `cols` x `rows` panes, some lit warm,
 * some cool, most dark. Self-lit through the emissive map.
 */
function windowMaterial(cols, rows, seed, wall = '#3a3d44') {
  const key = `win:${cols}:${rows}:${seed}:${wall}`;
  const map = canvasTexture(key, Math.max(64, cols * 16), Math.max(64, rows * 24), (g, w, h) => {
    const r = rng(seed);
    g.fillStyle = wall;
    g.fillRect(0, 0, w, h);
    const cw = w / cols;
    const rh = h / rows;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const v = r();
        g.fillStyle = v < 0.26 ? '#ffcf8a' : v < 0.34 ? '#cfe2ff' : '#15171c';
        g.fillRect(x * cw + cw * 0.22, y * rh + rh * 0.22, cw * 0.56, rh * 0.5);
      }
    }
  });
  const m = new THREE.MeshLambertMaterial({ map, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.85 });
  m.userData.disposable = true;
  return m;
}

/** A building block with windows on all four sides and a dark roof. */
function building(group, { x, z, w, d, h, seed = 1, wall = '#3a3d44', roof = 0x24272b, floorH = 3.2, bay = 2.6 }) {
  const front = windowMaterial(Math.max(1, Math.round(w / bay)), Math.max(1, Math.round(h / floorH)), seed, wall);
  const side = windowMaterial(Math.max(1, Math.round(d / bay)), Math.max(1, Math.round(h / floorH)), seed + 7, wall);
  const top = matte(roof);
  const m = slab(group, [w, h, d], [x, h / 2, z], top);
  m.material = [side, side, top, top, front, front];
  return m;
}

/** Street lamp: pole, arm over the road, lamp head and glow. Heading 0 = arm toward -Z. */
function streetLamp(group, x, z, heading = 0, { height = 8, arm = 2.2 } = {}) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = heading;
  const pole = matte(0x3a3f47);
  slab(g, [0.16, height, 0.16], [0, height / 2, 0], pole);
  slab(g, [0.1, 0.1, arm], [0, height - 0.05, -arm / 2 + 0.05], pole);
  slab(g, [0.32, 0.12, 0.6], [0, height - 0.14, -arm + 0.2], pole);
  slab(g, [0.26, 0.03, 0.5], [0, height - 0.215, -arm + 0.2], glow(SODIUM, 1.6));
  glowSprite(g, [0, height - 0.35, -arm + 0.2], 1.6, 0xffc27a);
  group.add(g);
  const head = new THREE.Vector3(0, height - 0.4, -arm + 0.2).applyAxisAngle(new THREE.Vector3(0, 1, 0), heading).add(new THREE.Vector3(x, 0, z));
  return { pos: [head.x, head.y, head.z], color: SODIUM, intensity: 30, distance: 26 };
}

/** High-mast lamp: a tall pole with a ring of four heads. */
function highMast(group, x, z, height = 18) {
  const pole = matte(0x4a4f57);
  cylinder(group, 0.28, height, [x, height / 2, z], pole, { rTop: 0.16, seg: 8 });
  slab(group, [2.4, 0.2, 0.3], [x, height, z], pole);
  slab(group, [0.3, 0.2, 2.4], [x, height + 0.002 + 0.2, z], pole);
  for (const [dx, dz] of [[1.1, 0], [-1.1, 0], [0, 1.1], [0, -1.1]]) {
    slab(group, [0.4, 0.06, 0.4], [x + dx, height - 0.14, z + dz], glow(SODIUM, 1.8));
    glowSprite(group, [x + dx, height - 0.3, z + dz], 2.4, 0xffc27a);
  }
  return { pos: [x, height - 1, z], color: SODIUM, intensity: 160, distance: 55 };
}

/** Ground slab, top at y = top (default 0). */
function ground(group, w, d, pos, color, top = 0, t = 0.4) {
  return slab(group, [w, t, d], [pos[0], top - t / 2, pos[1]], matte(color));
}

// --- skyline -----------------------------------------------------------------------

/**
 * A ring of distant lit buildings between rMin and rMax, skipping the arc
 * `gap` (radians [from, to], e.g. where the sea is). Fogged at that range;
 * it is there for the lit windows on the horizon.
 */
export function createSkyline({ center = [0, 0], rMin = 140, rMax = 260, count = 70, seed = 11, gap = null, base = 0 } = {}) {
  const group = new THREE.Group();
  group.name = 'set:skyline';
  const r = rng(seed);
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2;
    if (gap && a > gap[0] && a < gap[1]) continue;
    const rad = rMin + r() * (rMax - rMin);
    const w = 14 + r() * 26;
    const d = 14 + r() * 20;
    const h = 18 + r() * r() * 90;
    const b = building(group, { x: center[0] + Math.cos(a) * rad, z: center[1] + Math.sin(a) * rad, w, d, h, seed: 100 + i, wall: '#2a2d34', floorH: 3.4 });
    b.position.y += base;
    b.rotation.y = -a;
    b.castShadow = false;
    b.receiveShadow = false;
    // Red aircraft-warning light on the tall ones.
    if (h > 60) {
      const top = new THREE.Vector3(b.position.x, base + h + 0.4, b.position.z);
      slab(group, [0.6, 0.6, 0.6], top.toArray(), glow(0xd8453b, 2));
    }
  }
  return { group, colliders: [], lights: [] };
}

// --- Harbour Street multi-storey (prologue) ---------------------------------------------

/**
 * The multi-storey you work in, seen from Harbour Street, and the street.
 * Building: x -16..16, z 4..34; decks at 0, 3.2, 6.4, roof at 9.6 m.
 * Entrance x -7..7 in the front wall (z = 4); the valet booth goes at
 * (0, 0, 2.5) with its barrier across the exit lane (x -2.5..-5.7).
 * Street: road z -14..-2 along x, pavement z -2..0 (raised 12 cm).
 * `bays` are parking places on the ground floor, heading 0 (nose to the exit).
 */
export function createMultiStorey() {
  const group = new THREE.Group();
  group.name = 'set:multiStorey';
  const W = 32;
  const D = 30;
  const Z0 = 4;
  const decks = [3.2, 6.4, 9.6];
  const concrete = matte(COLORS.concreteWall);
  const concreteDark = matte(COLORS.concreteWallDark);
  const deckMat = matte(COLORS.ceiling);

  // Ground floor and the forecourt in front of it.
  ground(group, W, D, [0, Z0 + D / 2], COLORS.concreteFloorDark, 0.0, 0.3);
  ground(group, 40, 4, [0, 2], COLORS.concreteFloor, 0.0, 0.3);
  // Pavement and kerb along the street, road beyond.
  ground(group, 120, 2, [0, -1], 0x55595f, 0.12, 0.3);
  ground(group, 120, 12, [0, -8], 0x2c2f35, 0.01, 0.3);
  ground(group, 120, 3, [0, -15.5], 0x55595f, 0.12, 0.3);
  for (let x = -57; x < 60; x += 6) {
    const q = paintQuad(3, 0.14, COLORS.paintLine, { y: 0.022, opacity: 0.85 });
    q.position.set(x, 0, -8);
    group.add(q);
  }
  // Entrance lane arrows.
  for (const [x, rot] of [[-4.2, 0], [4.2, Math.PI]]) {
    const q = paintQuad(0.3, 2.4, COLORS.paintLine, { y: 0.012 });
    q.position.set(x, 0, 6);
    q.rotation.y = rot;
    group.add(q);
  }

  // Decks above the ground floor, columns, walls.
  decks.forEach((y, i) => slab(group, [W, 0.3, D], [0, y - 0.15, Z0 + D / 2], i === decks.length - 1 ? matte(COLORS.concreteFloor) : deckMat));
  for (const x of [-12, -4, 4, 12]) {
    for (const z of [Z0 + 4, Z0 + 12, Z0 + 20, Z0 + 28]) slab(group, [0.6, 9.6, 0.6], [x, 4.8, z], concrete);
  }
  const groundH = decks[0] - 0.3;
  // Front wall each side of the entrance, side and back walls on the ground floor.
  for (const sx of [-1, 1]) slab(group, [9, groundH, 0.3], [sx * 11.5, groundH / 2, Z0 + 0.15], concrete);
  slab(group, [14.2, 0.5, 0.32], [0, groundH - 0.25, Z0 + 0.15], concreteDark); // lintel over the entrance
  for (const sx of [-1, 1]) slab(group, [0.3, groundH, D], [sx * (W / 2 - 0.15), groundH / 2, Z0 + D / 2], concrete);
  slab(group, [W - 0.6, groundH, 0.3], [0, groundH / 2, Z0 + D - 0.15], concrete);
  // Parapets on the upper decks and the roof, with a light capping rail.
  for (const y of decks) {
    slab(group, [W, 1.05, 0.3], [0, y + 0.525, Z0 + 0.15], concrete);
    slab(group, [W, 1.05, 0.3], [0, y + 0.525, Z0 + D - 0.15], concrete);
    for (const sx of [-1, 1]) slab(group, [0.3, 1.05, D - 0.6], [sx * (W / 2 - 0.15), y + 0.525, Z0 + D / 2], concrete);
    slab(group, [W + 0.12, 0.1, 0.42], [0, y + 1.1, Z0 + 0.15], concreteDark);
  }
  // Sign over the entrance on the first-deck parapet, 1 cm proud of it.
  const sign = signMaterial('HARBOUR STREET  PARKING', { w: 1024, h: 96, fg: '#f2e6cf' });
  const signBox = slab(group, [12, 0.7, 0.14], [0, decks[0] + 0.53, Z0 - 0.08], matte(0x1d2026));
  signBox.material = [matte(0x1d2026), matte(0x1d2026), matte(0x1d2026), matte(0x1d2026), matte(0x1d2026), sign];
  // A big P on the corner.
  const p = signMaterial('P', { w: 128, h: 128, fg: '#ffffff', bg: '#2f5d8a' });
  const pBox = slab(group, [1.4, 1.4, 0.16], [W / 2 - 1.5, decks[1] + 0.55, Z0 - 0.09], matte(0x2f5d8a));
  pBox.material = [matte(0x2f5d8a), matte(0x2f5d8a), matte(0x2f5d8a), matte(0x2f5d8a), matte(0x2f5d8a), p];

  // Tube lights under each deck: glowing fittings (the scene adds real lights).
  const tube = glow(COLORS.fluorescent, 1.4);
  for (const y of decks.slice(0, 2)) {
    for (const x of [-8, 0, 8]) {
      for (const z of [Z0 + 8, Z0 + 16, Z0 + 24]) slab(group, [2.4, 0.06, 0.14], [x, y - 0.34, z], tube);
    }
  }
  // Bay lines on the ground floor, both sides of the drive aisle.
  const bays = [];
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const z = Z0 + 6 + i * 3.0;
      const q = paintQuad(5, 0.1, COLORS.paintLine, { y: 0.012, opacity: 0.8 });
      q.position.set(sx * 11, 0, z);
      group.add(q);
      if (i < 5) bays.push([sx * 11, z + 1.5]);
    }
  }
  // Street lamps on both pavements; buildings across the street.
  const lights = [];
  // Near-side lamps clear of the entrance, so they never stand in front of the sign.
  for (const x of [-24, 13, 40]) lights.push(streetLamp(group, x, -1.2, 0));
  for (const x of [-17, 8, 33]) lights.push(streetLamp(group, x, -15.5, Math.PI));
  const r = rng(5);
  for (let x = -50; x < 50; ) {
    const w = 10 + r() * 10;
    building(group, { x: x + w / 2, z: -26, w: w - 0.4, d: 16, h: 10 + r() * 16, seed: 200 + Math.round(x), wall: '#3b3a3f' });
    x += w;
  }
  // Inside the ground floor and under the first deck: cool tube light.
  lights.push({ pos: [0, 2.6, Z0 + 10], color: COLORS.fluorescent, intensity: 22, distance: 20 });
  lights.push({ pos: [-9, 2.6, Z0 + 18], color: COLORS.fluorescent, intensity: 16, distance: 16 });

  const colliders = [
    { pos: [-11.5, 1.5, Z0 + 0.3], size: [9, 3, 0.6], kind: 'wall' },
    { pos: [11.5, 1.5, Z0 + 0.3], size: [9, 3, 0.6], kind: 'wall' },
  ];
  return { group, colliders, lights, bays, entrance: { x: [-7, 7], z: Z0 }, booth: [0, 0, 2.5] };
}

// --- the pier ---------------------------------------------------------------------------

const CONTAINER_COLORS = ['#8e3b2e', '#2f5d8a', '#3f6b4a', '#8a8f96', '#b8612e', '#2f7f7a', '#6b2f4a', '#c9b56a'];

function containerMaterial(color) {
  const map = canvasTexture(`box:${color}`, 128, 64, (g, w, h) => {
    g.fillStyle = color;
    g.fillRect(0, 0, w, h);
    // Corrugation: darker ribs every 1/32 of the length.
    g.fillStyle = 'rgba(0,0,0,0.22)';
    for (let x = 0; x < w; x += 4) g.fillRect(x, 0, 1.6, h);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(0, 0, w, 3);
    g.fillRect(0, h - 3, w, 3);
  });
  const m = new THREE.MeshLambertMaterial({ map });
  m.userData.disposable = true;
  return m;
}

/** One shipping container (40 ft unless short), sitting on y. */
function container(group, x, y, z, color, { short = false, heading = 0 } = {}) {
  const L = short ? 6.06 : 12.19;
  const m = slab(group, [L, 2.59, 2.44], [x, y + 1.295, z], containerMaterial(color));
  m.rotation.y = heading;
  return m;
}

/**
 * The harbour quay. Quay top y = 0 for x -60..60, z -12..40; the edge is at
 * z = -12 with water 1.6 m below. Containers stack in a block x -42..-8,
 * z 6..30. A ship-to-shore crane straddles x 12..28 at the back with its boom
 * over the water. The ferry ramp runs down into the water at x 32..40.
 * High masts light the quay. `spots` names useful places for scenes.
 */
export function createPier() {
  const group = new THREE.Group();
  group.name = 'set:pier';
  const lights = [];
  // Quay slab (its front face is the quay wall) and water.
  slab(group, [120, 3.0, 52], [0, -1.5, 14], matte(0x6f6b64));
  slab(group, [400, 1.0, 300], [0, -2.1, -162], matte(0x0e1a24));
  // Edge timber and bollards.
  slab(group, [120, 0.25, 0.35], [0, 0.125, -11.8], matte(0x3a3530));
  for (let x = -57; x <= 57; x += 6) {
    cylinder(group, 0.17, 0.55, [x, 0.275, -11.2], matte(0x2c2f33), { seg: 10 });
    cylinder(group, 0.24, 0.07, [x, 0.585, -11.2], matte(0x2c2f33), { seg: 10 });
  }
  // Painted lane and the yellow edge line.
  const edge = paintQuad(120, 0.2, COLORS.hazard, { y: 0.012 });
  edge.position.set(0, 0, -10.6);
  group.add(edge);
  for (let x = -55; x < 58; x += 8) {
    const q = paintQuad(4, 0.14, COLORS.paintLine, { y: 0.012, opacity: 0.8 });
    q.position.set(x, 0, -4);
    group.add(q);
  }
  // Containers: rows along x, stacked one to three high, 1 cm apart.
  const r = rng(31);
  for (let row = 0; row < 5; row++) {
    const z = 7 + row * 5.6;
    for (let col = 0; col < 3; col++) {
      const x = -36 + col * 12.6;
      const high = 1 + Math.floor(r() * 3);
      for (let k = 0; k < high; k++) container(group, x, k * 2.6, z, CONTAINER_COLORS[Math.floor(r() * CONTAINER_COLORS.length)]);
    }
  }
  // Two loose boxes near the edge: cover for scene "Blue Lights".
  container(group, -6, 0, 1.5, '#8e3b2e');
  container(group, -6, 2.6, 1.5, '#2f5d8a', { short: true });
  container(group, 5, 0, 2.2, '#3f6b4a', { short: true, heading: 0.2 });

  // Ship-to-shore crane: four legs, sill beams, the boom out over the water.
  const crane = matte(0x6f8aa3);
  const cx = 20;
  for (const sx of [-1, 1]) {
    for (const z of [6, 20]) slab(group, [1.2, 34, 1.2], [cx + sx * 8, 17, z], crane);
    slab(group, [1.0, 1.4, 15.2], [cx + sx * 8, 34, 13], crane);
    slab(group, [1.0, 1.0, 14], [cx + sx * 8, 8, 13], crane);
  }
  slab(group, [17.2, 1.6, 1.2], [cx, 33.6, 6], crane);
  slab(group, [17.2, 1.6, 1.2], [cx, 33.6, 20], crane);
  slab(group, [2.2, 2.4, 70], [cx, 36.2, -6], crane); // boom
  slab(group, [5, 3.4, 6], [cx, 39.2, 14], matte(0x8fa3b5)); // machinery house
  for (const z of [-40, 28]) slab(group, [0.5, 0.5, 0.5], [cx, 37.7, z], glow(0xd8453b, 2.2));

  // Ferry ramp: a hinged steel deck sloping into the water, with rails.
  const ramp = new THREE.Group();
  ramp.position.set(36, 0, -12);
  ramp.rotation.x = -0.14;
  group.add(ramp);
  slab(ramp, [8, 0.3, 14], [0, -0.15, -7], matte(0x4a4f57));
  for (const sx of [-1, 1]) slab(ramp, [0.12, 0.9, 14], [sx * 4.1, 0.45, -7], matte(0xd9b43c));
  const fs = signMaterial('FERRY', { w: 256, h: 96, fg: '#f2e6cf', bg: '#2f5d8a' });
  const sb = slab(group, [2.4, 0.9, 0.12], [31, 3.4, -10.6], matte(0x2f5d8a));
  sb.material = [matte(0x2f5d8a), matte(0x2f5d8a), matte(0x2f5d8a), matte(0x2f5d8a), matte(0x2f5d8a), fs];
  slab(group, [0.14, 3.0, 0.14], [31, 1.5, -10.5], matte(0x3a3f47));

  // Light: high masts along the quay, the reflections of their heads on the water.
  for (const x of [-30, 0, 30]) lights.push(highMast(group, x, -2, 18));
  const refl = new THREE.MeshBasicMaterial({ color: 0xffa64a, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false });
  refl.userData.disposable = true;
  for (const x of [-30, 0, 30, cx]) {
    const q = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 30), refl);
    q.geometry.userData.disposable = true;
    q.rotation.x = -Math.PI / 2;
    q.position.set(x, -1.58, -28);
    group.add(q);
  }
  // Distant shore across the water.
  const far = createSkyline({ center: [0, -40], rMin: 260, rMax: 340, count: 40, seed: 77, gap: [0.1, Math.PI - 0.1], base: -1.6 });
  group.add(far.group);

  const colliders = [{ pos: [0, -1.5, 14], size: [120, 3, 52], kind: 'quay' }];
  const spots = {
    edge: [0, -9], // quay edge, open water behind
    boxes: [-6, -2.5], // in front of the loose containers
    ramp: [36, -9], // top of the ferry ramp
  };
  return { group, colliders, lights, spots };
}

// --- Old Town alley -------------------------------------------------------------------------

const PLASTER = ['#9a7a52', '#8e4a3a', '#6f7a64', '#b9a888', '#7a6a5a', '#5a4a52'];

function cobbleMaterial() {
  const map = canvasTexture('cobble', 256, 256, (g, w, h) => {
    const r = rng(9);
    g.fillStyle = '#2a2826';
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) {
      const off = (y / 16) % 2 ? 8 : 0;
      for (let x = -16; x < w; x += 16) {
        const v = 52 + Math.floor(r() * 26);
        g.fillStyle = `rgb(${v},${v - 4},${v - 8})`;
        g.fillRect(x + off + 1.5, y + 1.5, 13, 13);
      }
    }
  });
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  const m = new THREE.MeshLambertMaterial({ map });
  m.userData.disposable = true;
  return m;
}

/**
 * A street in Old Town (Lantern's district). Road x -4..4, z -30..30, cobbled;
 * pavements to x = +-5.5; three- and four-storey houses both sides with
 * shopfronts, balconies and two neon signs; strings of paper lanterns
 * across the street every 5 m at 5.6-6.6 m. `spots`: places for scenes.
 */
export function createAlley() {
  const group = new THREE.Group();
  group.name = 'set:alley';
  const lights = [];
  const road = slab(group, [8, 0.3, 64], [0, -0.15, 0], cobbleMaterial());
  road.material.map = road.material.map.clone();
  road.material.map.repeat.set(2, 16);
  road.material.map.needsUpdate = true;
  for (const sx of [-1, 1]) {
    slab(group, [1.5, 0.3, 64], [sx * 4.75, -0.03, 0], matte(0x5a5650));
  }
  // Houses, both sides.
  const r = rng(21);
  const fronts = [];
  for (const sx of [-1, 1]) {
    for (let z = -32; z < 32; ) {
      const len = 6 + Math.floor(r() * 4);
      const h = 9 + Math.floor(r() * 2) * 3.2 + r() * 1.2;
      const x = sx * (5.5 + 4);
      const wall = PLASTER[Math.floor(r() * PLASTER.length)];
      const b = building(group, { x, z: z + len / 2, w: 8, d: len - 0.3, h, seed: 300 + z * 3 + (sx > 0 ? 1 : 0), wall, floorH: 3.2, bay: 2.2 });
      // Windows face the street: building() puts the window grid on +-Z
      // faces (w) and +-X faces (d); the street side is the +-X face here.
      b.material = [b.material[0], b.material[1], b.material[2], b.material[3], matte(0x2a2826), matte(0x2a2826)];
      fronts.push({ sx, z0: z, z1: z + len, h });
      // Shopfront on the ground floor: a lit window or a rolled-down shutter, 4 cm proud.
      const fz = z + len / 2;
      const lit = r() < 0.55;
      const shopLight = r() < 0.3 ? 0xcfe2ff : 0xffd2a0;
      const shop = slab(group, [0.08, 2.4, len - 1.6], [sx * (5.5 - 0.04), 1.3, fz], lit ? glow(shopLight, 0.9) : stripeMaterial('#55595f', '#44474d', 24));
      shop.castShadow = false;
      slab(group, [0.5, 0.12, len - 1.2], [sx * (5.5 - 0.25), 2.75, fz], matte(0x3a2a24)); // awning
      // A balcony on the second floor of every other house.
      if (r() < 0.5) {
        slab(group, [0.9, 0.12, 2.6], [sx * (5.5 - 0.45), 6.5, fz], matte(0x4a4440));
        slab(group, [0.04, 0.9, 2.6], [sx * (5.5 - 0.88), 7.0, fz], matte(0x2c2f33));
      }
      z += len;
    }
  }
  // Two neon signs (teal and magenta: used sparingly, SPEC-game §8.1).
  for (const [sx, z, c] of [[-1, -8, 0x3fe0d0], [1, 9, 0xe0457b]]) {
    slab(group, [0.12, 2.6, 0.5], [sx * (5.5 - 0.6), 5.2, z], glow(c, 1.6));
    slab(group, [0.5, 0.08, 0.08], [sx * (5.5 - 0.3), 6.4, z], matte(0x2c2f33));
    lights.push({ pos: [sx * 3.6, 4.6, z], color: c, intensity: 8, distance: 10 });
  }
  // Lantern strings, zig-zagging across the street.
  const wire = [];
  const lanternRed = glow(0xd8453b, 1.3);
  const lanternAmber = glow(0xe0a043, 1.3);
  const lanternGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.34, 8);
  lanternGeo.userData.disposable = true;
  const sag = (u) => 0.7 * 4 * u * (1 - u);
  for (let k = 0; k < 12; k++) {
    const z0 = -27.5 + k * 5;
    const z1 = z0 + (k % 2 ? -2 : 2);
    const y = 6.3 + (k % 3) * 0.2;
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const u = i / 10;
      pts.push([-5.4 + 10.8 * u, y - sag(u), z0 + (z1 - z0) * u]);
    }
    for (let i = 0; i < 10; i++) wire.push(beamGeometry(pts[i], pts[i + 1], 0.015, 0.015));
    for (let i = 1; i < 10; i += 2) {
      const [x, wy, z] = pts[i];
      const l = new THREE.Mesh(lanternGeo, (i + k) % 3 ? lanternRed : lanternAmber);
      l.position.set(x, wy - 0.24, z);
      group.add(l);
      glowSprite(group, [x, wy - 0.24, z], 0.9, (i + k) % 3 ? 0xff7a5a : 0xffc27a);
    }
  }
  group.add(new THREE.Mesh(mergeGeometries(wire), matte(0x1d1f22)));
  for (const z of [-20, 0, 20]) lights.push({ pos: [0, 5.4, z], color: 0xffa060, intensity: 26, distance: 18 });

  const colliders = [
    { pos: [-9.5, 6, 0], size: [8, 12, 64], kind: 'building' },
    { pos: [9.5, 6, 0], size: [8, 12, 64], kind: 'building' },
  ];
  const spots = { kai: [2.2, -6], mouth: [0, -24], square: [0, 22] };
  return { group, colliders, lights, spots };
}

// --- rail yard ----------------------------------------------------------------------------

function wagonMaterial(color) {
  const map = canvasTexture(`wagon:${color}`, 128, 64, (g, w, h) => {
    g.fillStyle = color;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (let x = 6; x < w; x += 10) g.fillRect(x, 0, 2, h);
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(w * 0.4, h * 0.25, w * 0.2, h * 0.55); // sliding door
  });
  const m = new THREE.MeshLambertMaterial({ map });
  m.userData.disposable = true;
  return m;
}

/**
 * Ironside's rail yards. Gravel ground; four tracks along x at z = 6, 10.5,
 * 15, 19.5 with wagons standing on them; an asphalt access road along x at
 * z -6..2 (Brandt's quarter mile runs down it); high masts along z = -9;
 * a signal and a fence. `spots`: places for scenes.
 */
export function createRailYard() {
  const group = new THREE.Group();
  group.name = 'set:railYard';
  const lights = [];
  ground(group, 200, 90, [0, 10], 0x4a4540, 0, 0.4);
  slab(group, [200, 0.3, 8], [0, -0.12, -2], matte(0x2c2f35)); // road, 3 cm proud of the gravel
  for (let x = -95; x < 100; x += 8) {
    const q = paintQuad(4, 0.14, COLORS.paintLine, { y: 0.042, opacity: 0.8 });
    q.position.set(x, 0, -2);
    group.add(q);
  }
  // Tracks: rails and instanced sleepers (one draw call for all of them).
  const tracks = [6, 10.5, 15, 19.5];
  const railMat = matte(0x5c5853);
  const sleeperGeo = new THREE.BoxGeometry(2.6, 0.14, 0.25);
  sleeperGeo.userData.disposable = true;
  const perTrack = Math.floor(190 / 0.65);
  const sleepers = new THREE.InstancedMesh(sleeperGeo, matte(0x3a3028), perTrack * tracks.length);
  const m4 = new THREE.Matrix4();
  let n = 0;
  for (const z of tracks) {
    for (const sz of [-0.7175, 0.7175]) slab(group, [190, 0.15, 0.07], [0, 0.215, z + sz], railMat);
    for (let i = 0; i < perTrack; i++) sleepers.setMatrixAt(n++, m4.makeTranslation(-95 + i * 0.65, 0.07, z));
  }
  sleepers.receiveShadow = true;
  group.add(sleepers);
  // Wagons: boxcars and tank wagons on bogies.
  const r = rng(41);
  const wagonColors = ['#7a3a2a', '#5c5248', '#3f4a52', '#8a6a3a', '#4a3a3a'];
  for (const [ti, x0, count] of [[1, -60, 4], [2, -20, 3], [3, -70, 6], [3, 30, 3]]) {
    for (let k = 0; k < count; k++) {
      const x = x0 + k * 15.2;
      const z = tracks[ti];
      for (const bx of [-4.6, 4.6]) slab(group, [2.6, 0.7, 2.4], [x + bx, 0.64, z], matte(0x24272b));
      if (r() < 0.7) {
        slab(group, [14, 3.2, 3.0], [x, 2.6, z], wagonMaterial(wagonColors[Math.floor(r() * wagonColors.length)]));
        slab(group, [14.2, 0.12, 3.1], [x, 4.26, z], matte(0x3a3d42));
      } else {
        const t = cylinder(group, 1.4, 12, [x, 2.5, z], matte(['#2c2f33', '#8a8f96', '#4a5a52'][Math.floor(r() * 3)]), { seg: 14 });
        t.rotation.z = Math.PI / 2;
        slab(group, [13.6, 0.3, 2.6], [x, 1.05, z], matte(0x24272b));
      }
    }
  }
  // Signal on a post with a red lamp.
  slab(group, [0.2, 5, 0.2], [8, 2.5, 3.6], matte(0x2c2f33));
  slab(group, [0.5, 1.0, 0.3], [8, 5.2, 3.6], matte(0x1d1f22));
  slab(group, [0.22, 0.22, 0.04], [8, 5.45, 3.43], glow(0xd8453b, 2));
  glowSprite(group, [8, 5.45, 3.3], 1.2, 0xff5a4a);
  // Fence along the far side of the road.
  for (let x = -95; x <= 95; x += 3) slab(group, [0.08, 2.2, 0.08], [x, 1.1, -10.5], matte(0x5c5853));
  for (const y of [0.4, 2.1]) slab(group, [190, 0.05, 0.05], [0, y, -10.5], matte(0x5c5853));
  // High masts and an industrial skyline.
  for (const x of [-60, -20, 20, 60]) lights.push(highMast(group, x, -8.5, 20));
  const far = createSkyline({ center: [0, 0], rMin: 150, rMax: 240, count: 40, seed: 91 });
  group.add(far.group);
  for (const [x, z, h] of [[-120, 110, 60], [-90, 130, 48], [140, 120, 70]]) cylinder(group, 3, h, [x, h / 2, z], matte(0x3a3d42), { seg: 10, rTop: 2.2 });

  const colliders = [];
  const spots = { start: [-40, -4], finish: [-40 + 402, -4], brandt: [4, -4.5], yard: [0, 2.6] };
  return { group, colliders, lights, spots };
}

// --- Calder Ridge lookout -------------------------------------------------------------------

/**
 * A pull-off on the ridge road above the city. Road along x at z 0..7;
 * gravel pull-off z -6..0 for x -16..16; guardrail along z = -6.3; the
 * drop beyond it with the city's lights spread out 150-1,500 m away and
 * 160 m below. Uphill bank with trees on the +z side.
 */
export function createLookout() {
  const group = new THREE.Group();
  group.name = 'set:lookout';
  const lights = [];
  slab(group, [240, 0.4, 7], [0, -0.2, 3.5], matte(0x2c2f35));
  slab(group, [32, 0.4, 7.2], [0, -0.23, -3.4], matte(0x5a544c)); // runs under the guardrail
  slab(group, [240, 6, 30], [0, -3.4, -21.5], matte(0x2a2622)); // cliff top falls away
  for (let x = -110; x < 112; x += 9) {
    const q = paintQuad(4.5, 0.14, COLORS.paintLine, { y: 0.012, opacity: 0.75 });
    q.position.set(x, 0, 3.5);
    group.add(q);
  }
  // Guardrail: posts every 2 m and a W-beam, 1 cm off the posts' faces.
  for (let x = -16; x <= 16; x += 2) slab(group, [0.12, 0.75, 0.12], [x, 0.375, -6.3], matte(0x6b7078));
  slab(group, [32.2, 0.32, 0.08], [0, 0.58, -6.4], matte(0x8a8f96));
  // Uphill bank and trees.
  const bank = slab(group, [240, 14, 12], [0, 2.5, 13.5], matte(0x2a2622));
  bank.rotation.x = -0.55;
  const r = rng(61);
  const treeMat = matte(0x1d2a22);
  const coneGeo = new THREE.ConeGeometry(1.6, 6, 7);
  coneGeo.userData.disposable = true;
  for (let i = 0; i < 40; i++) {
    const x = -100 + r() * 200;
    const z = 9 + r() * 10;
    const s = 0.7 + r() * 0.8;
    const t = new THREE.Mesh(coneGeo, treeMat);
    t.scale.setScalar(s);
    t.position.set(x, (z - 8) * 0.55 + 3 * s, z);
    t.castShadow = true;
    group.add(t);
  }
  // The city below: a field of points, denser toward the harbour, plus the
  // dark band of the water and two lit road lines.
  const N = 3200;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const warm = new THREE.Color(0xffc27a);
  const cool = new THREE.Color(0xd8e6ff);
  for (let i = 0; i < N; i++) {
    const a = -Math.PI * 0.85 + r() * Math.PI * 0.7; // spread in front (-z)
    const d = 150 + Math.pow(r(), 0.6) * 1350;
    pos[i * 3] = Math.cos(a + Math.PI / 2) * d * 1.4;
    pos[i * 3 + 1] = -160 + r() * 6;
    pos[i * 3 + 2] = -Math.sin(a + Math.PI / 2) * d - 40;
    const c = r() < 0.75 ? warm : cool;
    col.set([c.r, c.g, c.b], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.userData.disposable = true;
  const pm = new THREE.PointsMaterial({ size: 3.2, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, sizeAttenuation: true });
  pm.userData.disposable = true;
  group.add(new THREE.Points(g, pm));
  slab(group, [3000, 1, 3000], [0, -170, -900], matte(0x0a0d12)); // the valley floor under the lights
  // Moon.
  const moon = glowSprite(group, [-260, 220, -700], 90, 0xdfe8ff);
  moon.material.fog = false;
  // One lamp at the pull-off.
  lights.push(streetLamp(group, 12, -5.4, Math.PI));

  const colliders = [{ pos: [0, 0.4, -6.6], size: [32, 0.8, 0.6], kind: 'rail' }];
  const spots = { pullOff: [0, -3], road: [0, 3.5], rail: [0, -6] };
  return { group, colliders, lights, spots };
}
