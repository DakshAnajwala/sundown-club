/**
 * StorySets.js — the props and places the story scenes need
 * (design/SPEC-models.md §4).
 *
 *   createCarKey()       Jax's key with its valet tag (scene "Keys" close-up)
 *   createValetBooth()   the Harbour Street valet booth, key board, sign, barrier
 *   createMaraGarage()   Mara's workshop: roll-up door, lift, bench, chest, lamps
 *   createRoadblock()    police barriers and cones (heat 3, SPEC-game §9.2)
 *   createRooftop()      the multi-storey's top deck (scene "Juno"), Garage.js
 *
 * Each returns { group, colliders, lights, ... }. `colliders` are axis-aligned
 * boxes in the set's frame ({ pos, size, kind }, like Garage.js), already at
 * least 0.6 m thick (the racing tunnelling rule): a thin visible wall gets a
 * thicker invisible box behind it. `lights` are where a scene should put real
 * lights ({ pos, color, intensity, distance }); the sets only carry the
 * glowing fittings, so a scene decides how many real lights it can afford.
 *
 * Ground frame: y = 0 on the floor. Real-world sizes in metres.
 */
import * as THREE from 'three';
import { matte, glow, COLORS } from '../world/Palette.js';
import { paintQuad, createCone } from '../world/Props.js';
import { createGarage } from '../world/Garage.js';
import { beamGeometry } from '../vehicle/BodyLoft.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);

export function slab(group, size, pos, material, rot) {
  const m = new THREE.Mesh(BOX, material);
  m.scale.set(...size);
  m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  m.castShadow = true;
  m.receiveShadow = true;
  group.add(m);
  return m;
}

export function cylinder(group, r, h, pos, material, { seg = 14, open = false, rTop = r } = {}) {
  const g = new THREE.CylinderGeometry(rTop, r, h, seg, 1, open);
  g.userData.disposable = true;
  const m = new THREE.Mesh(g, material);
  m.position.set(...pos);
  m.castShadow = true;
  m.receiveShadow = true;
  group.add(m);
  return m;
}

const texCache = new Map();
/** Canvas texture, cached by key. `draw(ctx, w, h)` paints it once. */
export function canvasTexture(key, w, h, draw, { repeat = null } = {}) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...repeat);
  }
  texCache.set(key, t);
  return t;
}

/** Lit sign lettering: warm letters on a dark ground, self-lit. */
export function signMaterial(text, { fg = '#ffd9a0', bg = '#1d2026', w = 512, h = 128 } = {}) {
  const map = canvasTexture(`sign:${text}:${fg}:${bg}`, w, h, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = fg;
    g.font = `800 ${Math.round(h * 0.62)}px system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + h * 0.03);
  });
  const m = new THREE.MeshLambertMaterial({ map, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.9 });
  m.userData.disposable = true;
  return m;
}

/** Red-and-white (or amber-and-white) stripes along a bar's length. */
export function stripeMaterial(a = '#c4473d', b = '#e8e6df', stripes = 8) {
  const map = canvasTexture(`stripe:${a}:${b}:${stripes}`, 256, 16, (g, w, h) => {
    for (let i = 0; i < stripes; i++) {
      g.fillStyle = i % 2 ? b : a;
      g.fillRect((i * w) / stripes, 0, w / stripes + 1, h);
    }
  });
  const m = new THREE.MeshLambertMaterial({ map });
  m.userData.disposable = true;
  return m;
}

// --- the key -----------------------------------------------------------------------

/**
 * Jax's car key: fob, blade, ring, and the valet's paper tag on a loop
 * (the close-up in scene "Keys"). Origin at the ring, where a hand holds it.
 */
export function createCarKey({ tagNumber = '47', tagColor = 0xa13a34 } = {}) {
  const group = new THREE.Group();
  group.name = 'prop:carKey';
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0018, 6, 16), matte(0x9a9890));
  ring.geometry.userData.disposable = true;
  ring.rotation.y = Math.PI / 2;
  group.add(ring);
  // Fob hangs below the ring.
  slab(group, [0.014, 0.058, 0.032], [0, -0.042, 0], matte(0x24272b));
  slab(group, [0.016, 0.012, 0.016], [0, -0.07, 0], matte(0x3a3d42)); // buttons end, proud on all sides
  slab(group, [0.003, 0.045, 0.008], [0, -0.098, 0], matte(0x9a9890)); // blade
  // Valet tag on a short string: card with a number and a coloured stripe.
  slab(group, [0.0015, 0.03, 0.0015], [0, -0.012, 0.016], matte(0xd8d2c0), [0.6, 0, 0]);
  const tagMap = canvasTexture(`tag:${tagNumber}:${tagColor}`, 128, 224, (g, w, h) => {
    g.fillStyle = '#e9e2cf';
    g.fillRect(0, 0, w, h);
    g.fillStyle = `#${tagColor.toString(16).padStart(6, '0')}`;
    g.fillRect(0, 0, w, h * 0.18);
    g.fillStyle = '#2a2a2a';
    g.font = `800 ${Math.round(w * 0.55)}px system-ui, Arial, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(tagNumber, w / 2, h * 0.58);
    g.beginPath();
    g.arc(w / 2, h * 0.09, w * 0.06, 0, Math.PI * 2);
    g.fillStyle = '#e9e2cf';
    g.fill();
  });
  const tagMat = new THREE.MeshLambertMaterial({ map: tagMap });
  tagMat.userData.disposable = true;
  // Box faces +x, -x carry the printed card; the thin edges are plain.
  const edge = matte(0xe9e2cf);
  const tag = slab(group, [0.002, 0.07, 0.04], [0, -0.055, 0.036], edge);
  tag.material = [tagMat, tagMat, edge, edge, edge, edge];
  tag.rotation.x = 0.25;
  return { group, colliders: [], lights: [] };
}

/**
 * Voss's ledger: a black notebook with an elastic strap and a red ribbon
 * (found in Jax's spare-wheel well, chapter 2). Origin at its centre; 21 x
 * 15 x 2.4 cm.
 */
export function createLedger() {
  const group = new THREE.Group();
  group.name = 'prop:ledger';
  slab(group, [0.15, 0.024, 0.21], [0, 0, 0], matte(0x1d1f22));
  slab(group, [0.142, 0.018, 0.204], [0.006, 0, 0], matte(0xd8d2c0)); // page block, 1 cm in from the spine
  slab(group, [0.008, 0.026, 0.212], [0.05, 0, 0], matte(0x2c2f33)); // strap, proud of the covers
  slab(group, [0.006, 0.004, 0.08], [-0.03, 0, 0.13], matte(0x8e2f2f)); // ribbon out of the bottom
  return { group, colliders: [], lights: [] };
}

// --- the valet booth ------------------------------------------------------------------

/**
 * The Harbour Street valet booth. Faces -Z (the drive lane is in front of
 * it). 1.8 x 1.5 m, 2.45 m walls, roof overhanging 25 cm, glazed from the
 * counter (1.0 m) to 2.1 m on three sides, door on the right (+X) side, key
 * board on the back wall, lit VALET sign on the roof. The barrier arm stands
 * 1.4 m to the left, across the exit lane; setBarrier(0..1) raises it.
 */
export function createValetBooth() {
  const group = new THREE.Group();
  group.name = 'set:valetBooth';
  const W = 1.8;
  const D = 1.5;
  const H = 2.45;
  const T = 0.08; // wall thickness
  const panel = matte(0x4f5964);
  const frame = matte(0x2c3036);
  const glass = matte(COLORS.glass, { transparent: true, opacity: 0.14, side: THREE.DoubleSide });
  const inside = matte(0xb8b2a6, { side: THREE.DoubleSide, emissive: 0x2a2620, emissiveIntensity: 1 });

  slab(group, [W + 0.1, 0.12, D + 0.1], [0, 0.06, 0], matte(COLORS.concreteFloorDark)); // plinth
  const y0 = 0.12;
  // Lower walls (to the counter) on all four sides; the back wall runs full height.
  slab(group, [W, 1.0 - y0, T], [0, (1.0 + y0) / 2, -D / 2 + T / 2], panel);
  slab(group, [T, 1.0 - y0, D - 2 * T], [-W / 2 + T / 2, (1.0 + y0) / 2, 0], panel);
  slab(group, [W, H - y0, T], [0, (H + y0) / 2, D / 2 - T / 2], panel);
  // Right side: lower wall in front of the door, then the door (proud 6 mm).
  slab(group, [T, 1.0 - y0, 0.55], [W / 2 - T / 2, (1.0 + y0) / 2, -D / 2 + 0.275 + T], panel);
  slab(group, [0.04, 2.0, 0.7], [W / 2 + 0.006, y0 + 1.0, 0.25], matte(0x3e4750));
  slab(group, [0.03, 0.03, 0.12], [W / 2 + 0.035, 1.05, 0.0], frame); // handle
  // Header band above the glass.
  slab(group, [W, H - 2.1, T], [0, (H + 2.1) / 2, -D / 2 + T / 2], panel);
  slab(group, [T, H - 2.1, D - 2 * T], [-W / 2 + T / 2, (H + 2.1) / 2, 0], panel);
  slab(group, [T, H - 2.1, D - 2 * T], [W / 2 - T / 2, (H + 2.1) / 2, 0], panel);
  // Glass, set into the middle of the wall thickness.
  slab(group, [W - 0.1, 1.1, 0.01], [0, 1.55, -D / 2 + T / 2], glass);
  slab(group, [0.01, 1.1, D - 0.2], [-W / 2 + T / 2, 1.55, 0], glass);
  slab(group, [0.01, 1.1, 0.5], [W / 2 - T / 2, 1.55, -D / 2 + 0.3 + T], glass);
  // Corner posts, 1 cm outside the walls.
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    slab(group, [0.1, H - y0 + 0.02, 0.1], [x * (W / 2 - 0.04), (H + y0) / 2, z * (D / 2 - 0.04)], frame);
  }
  // Counter outside the front window.
  slab(group, [W - 0.2, 0.04, 0.3], [0, 1.02, -D / 2 - 0.14], frame);
  // Roof slab and the sign on it.
  slab(group, [W + 0.5, 0.14, D + 0.5], [0, H + 0.07, 0], matte(0x3a4048));
  const sign = signMaterial('VALET');
  const signBody = slab(group, [1.4, 0.36, 0.14], [0, H + 0.14 + 0.2, -D / 2 + 0.2], frame);
  signBody.material = [frame, frame, frame, frame, sign, sign];
  // Interior: floor, ceiling light panel, key board with hooks and tags.
  slab(group, [W - 2 * T - 0.01, 0.02, D - 2 * T - 0.01], [0, y0 + 0.01, 0], inside);
  slab(group, [0.8, 0.03, 0.3], [0, H - 0.04, 0], glow(COLORS.lampWarm, 1.2));
  const boardZ = D / 2 - T - 0.015;
  slab(group, [0.9, 0.7, 0.025], [0, 1.6, boardZ], matte(0x6b5a45));
  const tagColors = [0xe9e2cf, 0xe9e2cf, 0xd8c9a0, 0xe9e2cf];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 6; c++) {
      const x = -0.35 + c * 0.14;
      const y = 1.86 - r * 0.16;
      slab(group, [0.008, 0.008, 0.03], [x, y, boardZ - 0.025], matte(0x9a9890));
      // Hook 47 (row 2, column 3) is empty: Jax's key is in your hand.
      if (r === 2 && c === 3) continue;
      if ((r * 6 + c) % 5 === 4) continue; // a few empty hooks
      slab(group, [0.035, 0.06, 0.003], [x, y - 0.04, boardZ - 0.04], matte(tagColors[(r + c) % 4]));
    }
  }
  // Stool.
  cylinder(group, 0.17, 0.04, [-0.35, 0.72, 0.1], frame);
  cylinder(group, 0.025, 0.58, [-0.35, 0.41, 0.1], frame);

  // Barrier: post with a striped arm across the exit lane (to the left, -X).
  const barrier = new THREE.Group();
  barrier.position.set(-W / 2 - 1.4, 0, -D / 2 - 0.3);
  group.add(barrier);
  slab(barrier, [0.32, 1.0, 0.32], [0, 0.5, 0], matte(0xd9b43c));
  slab(barrier, [0.34, 0.06, 0.34], [0, 0.03, 0], frame); // base flange, proud 1 cm
  const pivot = new THREE.Group();
  pivot.position.set(0, 0.92, -0.22);
  barrier.add(pivot);
  const arm = slab(pivot, [3.4, 0.08, 0.05], [-1.7, 0, 0], stripeMaterial('#c4473d', '#e8e6df', 10));
  arm.castShadow = true;
  const armLamp = slab(pivot, [0.06, 0.05, 0.06], [-3.38, 0.065, 0], glow(0xd8453b, 0.8));
  armLamp.castShadow = false;
  function setBarrier(t) {
    pivot.rotation.z = -Math.min(1, Math.max(0, t)) * (Math.PI / 2) * 0.96;
  }

  const colliders = [
    { pos: [0, H / 2, 0], size: [W + 0.1, H, D + 0.1], kind: 'booth' },
    // Visible post 0.32 m; collider 0.6 m (tunnelling rule).
    { pos: [barrier.position.x, 0.5, barrier.position.z], size: [0.6, 1.0, 0.6], kind: 'post' },
  ];
  const lights = [{ pos: [0, H - 0.2, 0], color: COLORS.lampWarm, intensity: 6, distance: 6 }];
  return { group, colliders, lights, setBarrier, barrierArm: pivot };
}

// --- Mara's garage ------------------------------------------------------------------------

/**
 * Mara's workshop, 10 m (x) by 8 m (z), 4.5 m to the roof. Door (3.4 x 3.2 m
 * roll-up) in the front wall at -Z; car lift in the middle bay; bench and
 * pegboard on the left wall; tool chest, tyres and drums on the right; a
 * small desk at the back. setDoor(0..1): 0 shut, 1 rolled up.
 * `liftBay` is where a car stands on the lift (ground frame, heading -Z).
 */
export function createMaraGarage() {
  const group = new THREE.Group();
  group.name = 'set:maraGarage';
  const W = 10;
  const D = 8;
  const H = 4.5;
  const T = 0.25;
  const wall = matte(0x8a8378, { side: THREE.DoubleSide });
  const wallLow = matte(0x5f5a52);
  const steel = matte(0x4f6a86);
  const dark = matte(0x2c2f33);
  const orange = matte(0xd9773a);

  slab(group, [W + 2 * T, 0.2, D + 2 * T], [0, -0.1, 0], matte(0x8f8a82)); // floor slab
  // Oil stains and bay lines on the floor, 1.2 cm up.
  for (const [x, z, s] of [[0.2, 0.6, 1.4], [-0.5, -1.0, 0.9], [2.8, 2.2, 0.7]]) {
    const q = paintQuad(s, s * 0.7, 0x4a4640, { y: 0.012, opacity: 0.45 });
    q.position.set(x, 0, z);
    group.add(q);
  }
  for (const x of [-1.9, 1.9]) {
    const q = paintQuad(0.1, 6.0, COLORS.hazard, { y: 0.012, opacity: 0.8 });
    q.position.set(x, 0, 0.2);
    group.add(q);
  }

  // Walls: back, two sides, and the front wall in three pieces round the door.
  const DW = 3.4;
  const DH = 3.2;
  slab(group, [W + 2 * T, H, T], [0, H / 2, D / 2 + T / 2], wall);
  slab(group, [T, H, D], [-W / 2 - T / 2, H / 2, 0], wall);
  slab(group, [T, H, D], [W / 2 + T / 2, H / 2, 0], wall);
  const side = (W - DW) / 2;
  slab(group, [side + T, H, T], [-(DW / 2 + side / 2 + T / 2), H / 2, -D / 2 - T / 2], wall);
  slab(group, [side + T, H, T], [DW / 2 + side / 2 + T / 2, H / 2, -D / 2 - T / 2], wall);
  slab(group, [DW, H - DH, T], [0, DH + (H - DH) / 2, -D / 2 - T / 2], wall);
  // Dado band round the inside, 1 m high, 1 cm proud of the walls.
  slab(group, [W - 0.02, 1.0, 0.02], [0, 0.5, D / 2 - 0.01], wallLow);
  // Side bands stop 3 cm short of the back band (their tops would meet flush).
  slab(group, [0.02, 1.0, D - 0.08], [-W / 2 + 0.01, 0.5, -0.02], wallLow);
  slab(group, [0.02, 1.0, D - 0.08], [W / 2 - 0.01, 0.5, -0.02], wallLow);
  // Roof and its steel trusses.
  slab(group, [W + 2 * T, 0.2, D + 2 * T], [0, H + 0.1, 0], matte(0x6b665e, { side: THREE.DoubleSide }));
  for (const z of [-2.5, 0, 2.5]) slab(group, [W, 0.22, 0.14], [0, H - 0.11, z], dark);

  // Roll-up door: slatted panel inside the opening, drum housing above it.
  const door = new THREE.Group();
  door.position.set(0, DH, -D / 2 + 0.12);
  group.add(door);
  const doorMat = matte(0x9aa1a8);
  const ribMat = matte(0x7f868d);
  const panel = slab(door, [DW - 0.04, DH, 0.04], [0, -DH / 2, 0], doorMat);
  const ribs = [];
  for (let y = 0.12; y < DH; y += 0.16) ribs.push(slab(door, [DW - 0.06, 0.025, 0.06], [0, -y, 0], ribMat));
  slab(group, [DW + 0.2, 0.42, 0.42], [0, DH + 0.21, -D / 2 + 0.25], dark); // drum housing
  for (const sx of [-1, 1]) slab(group, [0.08, DH, 0.12], [sx * (DW / 2 + 0.04), DH / 2, -D / 2 + 0.06], dark); // guide rails
  function setDoor(t) {
    const k = Math.min(1, Math.max(0, t));
    const h = Math.max(0.04, DH * (1 - k));
    panel.scale.y = h;
    panel.position.y = -h / 2;
    for (const r of ribs) r.visible = -r.position.y < h - 0.02;
  }

  // Sign above the door, outside.
  const sign = signMaterial("MARA'S", { fg: '#f0a060' });
  const s = slab(group, [2.4, 0.6, 0.12], [0, DH + 0.75, -D / 2 - T - 0.06], dark);
  s.material = [dark, dark, dark, dark, dark, sign];

  // Two-post lift in the middle bay.
  const liftBay = { pos: [0, 0, 0.2], heading: 0 };
  for (const sx of [-1, 1]) {
    const x = sx * 1.75;
    slab(group, [0.34, 3.4, 0.34], [x, 1.7, 0.2], steel);
    slab(group, [0.6, 0.04, 0.6], [x, 0.02, 0.2], dark);
    // Two arms per post, swung under the car's jacking points.
    for (const sz of [-1, 1]) slab(group, [0.95, 0.07, 0.12], [x - sx * 0.5, 0.22, 0.2 + sz * 0.35], steel, [0, sx * sz * 0.35, 0]);
    slab(group, [0.12, 0.5, 0.14], [x + sx * 0.0, 2.0, 0.2 - 0.25], orange); // control box on one face
  }
  slab(group, [3.84, 0.2, 0.3], [0, 3.5, 0.2], steel);

  // Workbench and pegboard along the left wall.
  const bx = -W / 2 + 0.45;
  slab(group, [0.75, 0.06, 2.4], [bx, 0.92, 1.4], matte(0x7a5c3e));
  for (const [dx, dz] of [[-0.3, -1.1], [0.3, -1.1], [-0.3, 1.1], [0.3, 1.1]]) slab(group, [0.06, 0.89, 0.06], [bx + dx, 0.445, 1.4 + dz], dark);
  slab(group, [0.7, 0.03, 2.3], [bx, 0.25, 1.4], dark);
  slab(group, [0.03, 1.1, 2.2], [-W / 2 + 0.035, 1.75, 1.4], matte(0xb79f7c));
  const toolMat = matte(0x3a3d42);
  for (let i = 0; i < 9; i++) {
    const z = 0.5 + i * 0.22;
    const len = 0.18 + ((i * 7) % 4) * 0.05;
    slab(group, [0.02, len, 0.035], [-W / 2 + 0.06, 1.55 + len / 2, z], toolMat);
  }
  slab(group, [0.25, 0.28, 0.5], [bx + 0.1, 1.09, 0.6], matte(0x6b2e2a)); // vice / grinder block
  // Tool chest on castors, right wall.
  const cx = W / 2 - 0.4;
  slab(group, [0.5, 1.0, 0.8], [cx, 0.62, 1.8], orange);
  for (let i = 0; i < 6; i++) {
    slab(group, [0.012, 0.012, 0.7], [cx - 0.256, 0.27 + i * 0.15, 1.8], dark); // drawer lines, proud
    slab(group, [0.03, 0.02, 0.3], [cx - 0.27, 0.34 + i * 0.15, 1.8], matte(0xbdb8ae)); // handles
  }
  for (const [dx, dz] of [[-0.18, -0.32], [0.18, -0.32], [-0.18, 0.32], [0.18, 0.32]]) {
    const w = cylinder(group, 0.05, 0.04, [cx + dx, 0.06, 1.8 + dz], dark, { seg: 8 });
    w.rotation.z = Math.PI / 2;
  }
  // Tyres stacked (each sunk 5 mm into the one below) and two drums.
  for (let i = 0; i < 4; i++) {
    const t = cylinder(group, 0.32, 0.22, [W / 2 - 0.5, 0.11 + i * 0.215, -1.6], matte(COLORS.tyre), { seg: 16 });
    t.rotation.y = i * 0.3;
  }
  for (const [x, z, c] of [[W / 2 - 0.45, -2.5, 0x2f5d8a], [W / 2 - 1.1, -2.7, 0x8e2f2f]]) {
    cylinder(group, 0.29, 0.88, [x, 0.44, z], matte(c), { seg: 16 });
    for (const y of [0.3, 0.6]) cylinder(group, 0.296, 0.03, [x, y, z], matte(0x2c2f33), { seg: 16 });
  }
  // Desk at the back with a lamp, a chair and a shelf of parts boxes.
  slab(group, [1.4, 0.05, 0.7], [-2.8, 0.75, D / 2 - 0.5], matte(0x5a4a3a));
  for (const [dx, dz] of [[-0.62, -0.28], [0.62, -0.28], [-0.62, 0.28], [0.62, 0.28]]) slab(group, [0.05, 0.725, 0.05], [-2.8 + dx, 0.3625, D / 2 - 0.5 + dz], dark);
  slab(group, [0.45, 0.06, 0.45], [-2.8, 0.47, D / 2 - 1.15], dark);
  slab(group, [0.45, 0.5, 0.05], [-2.8, 0.75, D / 2 - 0.92], dark);
  cylinder(group, 0.09, 0.02, [-2.4, 0.785, D / 2 - 0.4], dark);
  cylinder(group, 0.11, 0.12, [-2.4, 1.05, D / 2 - 0.4], glow(COLORS.lampWarm, 0.9), { rTop: 0.06 });
  slab(group, [0.015, 0.25, 0.015], [-2.4, 0.91, D / 2 - 0.4], dark);
  slab(group, [2.0, 0.04, 0.45], [2.6, 1.4, D / 2 - 0.25], dark);
  slab(group, [2.0, 0.04, 0.45], [2.6, 0.8, D / 2 - 0.25], dark);
  for (let i = 0; i < 6; i++) {
    const c = [0x8a6a48, 0x6b7078, 0x8a6a48][i % 3];
    slab(group, [0.28, 0.24, 0.32], [1.85 + i * 0.3, 1.54, D / 2 - 0.26], matte(c));
    if (i % 2 === 0) slab(group, [0.28, 0.2, 0.32], [1.85 + i * 0.3, 0.92, D / 2 - 0.26], matte(c));
  }

  // Hanging work lamps over the lift and the bench.
  const lights = [];
  const shade = matte(0x2c2f33, { side: THREE.DoubleSide });
  for (const [x, z] of [[-1.2, -0.8], [1.2, 1.2], [-3.6, 1.4]]) {
    const y = 2.9;
    const cable = new THREE.Mesh(beamGeometry([x, H - 0.22, z], [x, y + 0.2, z], 0.012, 0.012), dark);
    group.add(cable);
    cylinder(group, 0.26, 0.22, [x, y + 0.08, z], shade, { open: true, rTop: 0.08, seg: 12 });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), glow(0xffe2b0, 2.0));
    bulb.geometry.userData.disposable = true;
    bulb.position.set(x, y + 0.02, z);
    group.add(bulb);
    lights.push({ pos: [x, y - 0.05, z], color: 0xffd7a0, intensity: 14, distance: 9 });
  }

  // Colliders: walls with backing to 0.6 m outward; the lift posts.
  const colliders = [
    { pos: [0, H / 2, D / 2 + 0.3], size: [W + 1.2, H, 0.6], kind: 'wall' },
    { pos: [-W / 2 - 0.3, H / 2, 0], size: [0.6, H, D + 1.2], kind: 'wall' },
    { pos: [W / 2 + 0.3, H / 2, 0], size: [0.6, H, D + 1.2], kind: 'wall' },
    { pos: [-(DW / 2 + side / 2), H / 2, -D / 2 - 0.3], size: [side, H, 0.6], kind: 'wall' },
    { pos: [DW / 2 + side / 2, H / 2, -D / 2 - 0.3], size: [side, H, 0.6], kind: 'wall' },
    { pos: [-1.75, 1.7, 0.2], size: [0.6, 3.4, 0.6], kind: 'post' },
    { pos: [1.75, 1.7, 0.2], size: [0.6, 3.4, 0.6], kind: 'post' },
  ];
  setDoor(0);
  return { group, colliders, lights, setDoor, liftBay, size: { width: W, depth: D, height: H, door: [DW, DH] } };
}

// --- roadblock ------------------------------------------------------------------------

/** One A-frame barrier: striped top board, legs, a small amber flasher. */
export function createSawhorse(length = 2.4) {
  const group = new THREE.Group();
  group.name = 'prop:sawhorse';
  const leg = matte(0x2c2f33);
  slab(group, [length, 0.2, 0.04], [0, 1.0, 0], stripeMaterial('#c4473d', '#e8e6df', 8));
  slab(group, [length, 0.2, 0.04], [0, 0.55, 0], stripeMaterial('#c4473d', '#e8e6df', 8));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const m = new THREE.Mesh(beamGeometry([sx * (length / 2 - 0.15), 1.08, 0], [sx * (length / 2 - 0.15), 0, sz * 0.32], 0.05, 0.05), leg);
      m.castShadow = true;
      group.add(m);
    }
  }
  const lamp = slab(group, [0.1, 0.12, 0.1], [length / 2 - 0.2, 1.17, 0], glow(COLORS.lampAmber, 1.2));
  lamp.castShadow = false;
  return group;
}

/**
 * Heat-3 roadblock across a road `width` m wide (SPEC-game §9.2): two
 * barriers leaving a car-width gap in the middle (the police cars, placed by
 * the event, close it) and a line of cones. Cones have no collider (the car
 * drives through cones, as in Parking Precision); barriers do.
 */
export function createRoadblock({ width = 16 } = {}) {
  const group = new THREE.Group();
  group.name = 'set:roadblock';
  const colliders = [];
  const len = Math.min(3.2, (width - 3.0) / 2 - 0.4);
  for (const sx of [-1, 1]) {
    const s = createSawhorse(len);
    s.position.set(sx * (1.5 + len / 2 + 0.2), 0, 0);
    group.add(s);
    colliders.push({ pos: [s.position.x, 0.6, 0], size: [len, 1.2, 0.6], kind: 'barrier' });
  }
  for (let x = -width / 2 + 0.6; x <= width / 2 - 0.6; x += 1.2) {
    const c = createCone();
    c.position.set(x, 0, -3.0);
    group.add(c);
  }
  return { group, colliders, lights: [] };
}

// --- rooftop ------------------------------------------------------------------------------

/**
 * The multi-storey's top deck for scene "Juno": Parking Precision's rooftop
 * shell (parapets, lamp posts), with bay lines. 36 x 28 m by default.
 */
export function createRooftop({ width = 36, depth = 28 } = {}) {
  const g = createGarage({ style: 'rooftop', width, depth, ceilingHeight: 3.2 });
  g.group.name = 'set:rooftop';
  const bays = [];
  for (let i = 0; i < 10; i++) {
    const x = -width / 2 + 3 + i * 2.6;
    const q = paintQuad(0.11, 5.0, COLORS.paintLine, { y: 0.012 });
    q.position.set(x, 0, -depth / 2 + 2.6);
    g.group.add(q);
    bays.push([x + 1.3, -depth / 2 + 2.6]);
  }
  const lights = [];
  for (let z = -depth / 2 + 3.75; z < depth / 2; z += 7.5) {
    for (const x of [-width / 2, width / 2]) lights.push({ pos: [x * 0.97, 3.1, z], color: COLORS.lampWarm, intensity: 10, distance: 16 });
  }
  return { group: g.group, colliders: g.colliders, lights, bays };
}
