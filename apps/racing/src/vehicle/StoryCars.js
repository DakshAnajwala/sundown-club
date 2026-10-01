/**
 * StoryCars.js — every car the story needs that is not just a parked car
 * (design/SPEC-models.md §3): crew cars with liveries, the bosses' cars,
 * police cruisers, Hale's unmarked car and Mara's tow truck.
 *
 * Each is a body table from bodies.js (shell from CarModel.js) plus bolt-ons:
 *   stripe      a band along the shoulder, full length
 *   pinstripe   a 12 mm shoulder line (Voss)
 *   hoodStripes twin stripes over hood, roof and deck
 *   spoiler     'lip' | 'wing' | 'ducktail' | 'roof'
 *   kit         'police' | 'unmarked' | 'tow'
 *
 * Every bolt-on follows the bodywork it sits on (sampled from the same
 * tables CarModel lofts) and stands 4-5 mm proud of it, or is sunk into it:
 * never flush (z-fighting). Flashing lamps use materials cloned per car and
 * marked userData.disposable, because Palette materials are shared and must
 * never be mutated.
 *
 * Frame: chassis-local, like every car (y = 0 at the chassis centre, which
 * sits RIDE_HEIGHT above the road; forward is -Z). Author in the ground
 * frame and convert with fromGround().
 */
import * as THREE from 'three';
import { matte, COLORS } from '../world/Palette.js';
import { createSedanShell, createWheelMesh, profileHalf } from './CarModel.js';
import { BODIES } from './bodies.js';
import { beamGeometry, mergeGeometries } from './BodyLoft.js';
import { fromGround, WHEEL_RADIUS, TRACK, AXLE_Z, DRIVER_X } from './Dimensions.js';
import { CARS } from './cars.js';
import { createFigure } from '../story/Figure.js';
import { CAST, CREWS } from '../story/cast.js';
import { makeGlowTexture } from '../render/LampLight.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const OFF = 0.005; // how far a painted panel stands off the bodywork
const T = CREWS.tidewater;
const L = CREWS.lantern;
const I = CREWS.ironside;
const U = CREWS.summit;

/**
 * The story's cars. `driver` is the cast id seated in it by default when the
 * caller asks for a driver.
 */
export const STORY_CARS = {
  // The player's cars.
  starter: { name: "Jax's car (starter saloon)", body: 'sedan', paint: CARS.starter.paint },
  coupe: { name: 'Tide coupe (player, after Juno)', body: 'coupe', paint: CARS.coupe.paint, livery: { stripe: 0xe6e2da, spoiler: 'lip' } },
  // Tidewater (Harbour, chapter 1).
  juno: { name: "Juno's Tide coupe", body: 'coupe', paint: T.color, livery: { stripe: 0xe6e2da, spoiler: 'lip' }, driver: 'juno' },
  pike: { name: "Pike's drag hatch", body: 'hatchback', paint: T.dark, livery: { hoodStripes: T.color, spoiler: 'roof' }, driver: 'pike' },
  tidewaterSedan: { name: 'Tidewater sedan', body: 'sedan', paint: 0x2f8a85, livery: { stripe: T.dark }, driver: 'tidewaterA' },
  tidewaterHatch: { name: 'Tidewater hatch', body: 'hatchback', paint: T.dark, livery: { stripe: T.color, spoiler: 'roof' }, driver: 'tidewaterB' },
  // Lantern (Old Town, chapter 2): drift coupes.
  kai: { name: "Kai's drift coupe", body: 'coupe', paint: L.dark, livery: { stripe: L.color, spoiler: 'wing' }, driver: 'kai' },
  lanternCoupe: { name: 'Lantern coupe', body: 'coupe', paint: L.color, livery: { stripe: L.dark, spoiler: 'wing' } },
  lanternHatch: { name: 'Lantern hatch', body: 'hatchback', paint: 0x7a3b2a, livery: { stripe: L.color } },
  // Ironside (rail yards, chapter 3): drag muscle.
  brandt: { name: "Brandt's fastback", body: 'fastback', paint: I.color, livery: { hoodStripes: 0x2a2c30, spoiler: 'ducktail' }, driver: 'brandt' },
  ironsideFastback: { name: 'Ironside fastback', body: 'fastback', paint: I.dark, livery: { hoodStripes: I.color, spoiler: 'ducktail' } },
  ironsidePickup: { name: 'Ironside pickup', body: 'pickup', paint: 0x5c5248, livery: { stripe: I.color } },
  // Summit (Calder Ridge, chapter 4): light hill-run hatches.
  selene: { name: "Selene's hatch", body: 'hatchback', paint: 0xdfe6ee, roof: U.dark, livery: { stripe: U.dark, spoiler: 'roof' }, driver: 'selene' },
  summitHatch: { name: 'Summit hatch', body: 'hatchback', paint: U.color, livery: { stripe: U.dark, spoiler: 'roof' } },
  summitCoupe: { name: 'Summit coupe', body: 'coupe', paint: U.dark, livery: { stripe: U.color, spoiler: 'lip' } },
  // Voss (finale).
  voss: { name: "Voss's grand tourer", body: 'gt', paint: CREWS.voss.color, livery: { pinstripe: CREWS.voss.light }, driver: 'voss' },
  // Police (chase events, roadblocks; Hale).
  police: { name: 'Police cruiser', body: 'sedan', paint: CREWS.police.color, roof: CREWS.police.light, kit: 'police', driver: 'officer' },
  unmarked: { name: "Lt. Hale's unmarked car", body: 'sedan', paint: 0x3a3f47, kit: 'unmarked', driver: 'hale' },
  // Mara's garage.
  tow: { name: "Mara's tow truck", body: 'tow', paint: 0xd9773a, kit: 'tow', driver: 'mara' },
};

export const STORY_CAR_ORDER = Object.keys(STORY_CARS);

// --- sampling the bodywork ------------------------------------------------------

/** A plan row interpolated at z (the same five columns as bodies.js). */
export function planRowAt(spec, z) {
  const p = spec.plan;
  if (z <= p[0][0]) return p[0];
  for (let i = 0; i < p.length - 1; i++) {
    if (z <= p[i + 1][0]) {
      const t = (z - p[i][0]) / (p[i + 1][0] - p[i][0]);
      const a = p[i];
      const b = p[i + 1];
      return a.map((v, k) => v + ((b[k] ?? spec.yBelt) - (v ?? spec.yBelt)) * t);
    }
  }
  return p[p.length - 1];
}

/** Half-width of the flank at height y (ground frame) and station z. */
export function flankX(spec, z, y) {
  const pts = profileHalf(spec, planRowAt(spec, z)); // top (belt) -> floor
  if (y >= pts[0][1]) return pts[0][0];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    if (y <= y0 && y >= y1) return x0 + ((x1 - x0) * (y0 - y)) / (y0 - y1);
  }
  return pts[pts.length - 1][0];
}

/** Local shoulder height at z (the widest point of the section). */
export function shoulderY(spec, z) {
  const row = planRowAt(spec, z);
  const drop = spec.yBelt - (row[4] ?? spec.yBelt);
  return spec.yShoulder - drop * 0.55;
}

/** Height of a lid (hood, roof or deck rows) at z and x, crown included. */
function lidY(rows, crown, z, x, fit) {
  let a = rows[0];
  let b = rows[rows.length - 1];
  for (let i = 0; i < rows.length - 1; i++) {
    if (z >= rows[i][0] && z <= rows[i + 1][0]) {
      a = rows[i];
      b = rows[i + 1];
      break;
    }
  }
  const t = b[0] === a[0] ? 0 : Math.min(1, Math.max(0, (z - a[0]) / (b[0] - a[0])));
  const y = a[1] + (b[1] - a[1]) * t;
  let hw = a[2] + (b[2] - a[2]) * t;
  if (fit) hw = Math.min(hw, fit(z) - 0.006);
  const ax = Math.abs(x);
  // lidHalf: (hw, y) -> (0.62 hw, y + 0.75 c) -> (0, y + c)
  if (ax <= 0.62 * hw) return y + crown - (0.25 * crown * ax) / (0.62 * hw);
  return y + 0.75 * crown - (0.75 * crown * (ax - 0.62 * hw)) / (0.38 * hw);
}

export function roofTopY(spec, z, x = 0) {
  return lidY(spec.roof, 0.018, z, x);
}

// --- painted panels ------------------------------------------------------------------

/**
 * A panel following the flank on both sides, between z0..z1 and heights
 * y0(z)..y1(z) (ground frame), standing OFF proud of the bodywork. With a
 * texture, u runs rear-to-front on each side so text reads correctly.
 */
function flankPanel(spec, { z0, z1, y0, y1, zSteps = 16, ySteps = 4, off = OFF }) {
  const pos = [];
  const uv = [];
  for (const sx of [1, -1]) {
    const grid = [];
    for (let i = 0; i <= zSteps; i++) {
      const z = z0 + ((z1 - z0) * i) / zSteps;
      const lo = typeof y0 === 'function' ? y0(z) : y0;
      const hi = typeof y1 === 'function' ? y1(z) : y1;
      const col = [];
      for (let j = 0; j <= ySteps; j++) {
        const y = lo + ((hi - lo) * j) / ySteps;
        col.push([sx * (flankX(spec, z, y) + off), fromGround(y), z]);
      }
      grid.push(col);
    }
    const U = (i) => (sx > 0 ? 1 - i / zSteps : i / zSteps);
    for (let i = 0; i < zSteps; i++) {
      for (let j = 0; j < ySteps; j++) {
        const a = grid[i][j];
        const b = grid[i + 1][j];
        const c = grid[i + 1][j + 1];
        const d = grid[i][j + 1];
        const ua = [U(i), j / ySteps];
        const ub = [U(i + 1), j / ySteps];
        const uc = [U(i + 1), (j + 1) / ySteps];
        const ud = [U(i), (j + 1) / ySteps];
        // Outward is +sx; order the two triangles to face it.
        const quads = sx > 0 ? [[a, d, c, ua, ud, uc], [a, c, b, ua, uc, ub]] : [[a, b, c, ua, ub, uc], [a, c, d, ua, uc, ud]];
        for (const [p, q, r, up, uq, ur] of quads) {
          pos.push(...p, ...q, ...r);
          uv.push(...up, ...uq, ...ur);
        }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  g.userData.disposable = true;
  return g;
}

/** A strip across a lid between |x| = x0..x1 on both sides of the centre line. */
function lidStrips(rows, crown, x0, x1, fit, { zFrom, zTo, steps = 10 } = {}) {
  const geos = [];
  const za = zFrom ?? rows[0][0];
  const zb = zTo ?? rows[rows.length - 1][0];
  for (const sx of [-1, 1]) {
    const pos = [];
    for (let i = 0; i < steps; i++) {
      const zA = za + ((zb - za) * i) / steps;
      const zB = za + ((zb - za) * (i + 1)) / steps;
      const p = (z, x) => [sx * x, fromGround(lidY(rows, crown, z, x, fit) + 0.004), z];
      const a = p(zA, x0);
      const b = p(zA, x1);
      const c = p(zB, x1);
      const d = p(zB, x0);
      // Facing up: wind counter-clockwise seen from above.
      const up = sx > 0 ? [a, d, c, a, c, b] : [a, c, d, a, b, c];
      for (const v of up) pos.push(...v);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    geos.push(g);
  }
  return mergeGeometries(geos);
}

let glowTex = null;
function glowTexture() {
  glowTex ??= makeGlowTexture(64);
  return glowTex;
}

const textCache = new Map();
/** Lettering on a transparent canvas, for door panels. Cached per text. */
function textTexture(text, { color = '#ffffff', bg = null, w = 1024, h = 128, size = 84, weight = 800 } = {}) {
  const key = `${text}|${color}|${bg}|${w}|${h}|${size}`;
  if (textCache.has(key)) return textCache.get(key);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (bg) {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
  }
  g.fillStyle = color;
  g.font = `${weight} ${size}px system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + size * 0.04);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  textCache.set(key, t);
  return t;
}

/** A lamp lens whose glow can flash: a private material, never a shared one. */
function flashLens(color) {
  const m = new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.15 });
  m.userData.disposable = true;
  return m;
}

function addBox(group, size, ground, material, rot) {
  const m = new THREE.Mesh(BOX, material);
  m.scale.set(...size);
  m.position.set(ground[0], fromGround(ground[1]), ground[2]);
  if (rot) m.rotation.set(...rot);
  m.castShadow = true;
  group.add(m);
  return m;
}

/** Beam between two ground-frame points. */
function addBeam(group, from, to, w, t, material) {
  const m = new THREE.Mesh(beamGeometry([from[0], fromGround(from[1]), from[2]], [to[0], fromGround(to[1]), to[2]], w, t), material);
  m.castShadow = true;
  group.add(m);
  return m;
}

// --- liveries ------------------------------------------------------------------------

function addLivery(group, spec, beltAt, livery) {
  const noseZ = spec.plan[0][0];
  const tailZ = spec.plan[spec.plan.length - 1][0];
  if (livery.stripe) {
    const geo = flankPanel(spec, {
      z0: noseZ + 0.06,
      z1: tailZ - 0.06,
      y0: (z) => shoulderY(spec, z) + 0.02,
      y1: (z) => shoulderY(spec, z) + 0.07,
      zSteps: 28,
      ySteps: 2,
    });
    group.add(new THREE.Mesh(geo, matte(livery.stripe)));
  }
  if (livery.pinstripe) {
    const geo = flankPanel(spec, {
      z0: noseZ + 0.1,
      z1: tailZ - 0.1,
      y0: (z) => shoulderY(spec, z) + 0.035,
      y1: (z) => shoulderY(spec, z) + 0.047,
      zSteps: 28,
      ySteps: 1,
    });
    group.add(new THREE.Mesh(geo, matte(livery.pinstripe)));
  }
  if (livery.hoodStripes) {
    const m = matte(livery.hoodStripes);
    const hoodEnd = spec.hood[spec.hood.length - 1][0];
    // Hood, roof and deck; the glass in between is left bare.
    group.add(new THREE.Mesh(lidStrips(spec.hood, 0.014, 0.06, 0.15, beltAt, { zTo: hoodEnd - 0.02 }), m));
    group.add(new THREE.Mesh(lidStrips(spec.roof, 0.018, 0.06, 0.15, null, { zFrom: spec.roof[0][0] + 0.03, zTo: spec.roofRearZ - 0.03 }), m));
    group.add(new THREE.Mesh(lidStrips(spec.deck, 0.01, 0.06, 0.15, beltAt, { zFrom: Math.max(spec.deck[0][0], spec.backlightBaseZ + 0.03) }), m));
  }
  if (livery.spoiler) addSpoiler(group, spec, livery.spoiler, livery.spoilerColor ?? 0x24272b);
}

function addSpoiler(group, spec, type, color) {
  const mat = matte(color);
  const last = spec.deck[spec.deck.length - 1];
  const prev = spec.deck[spec.deck.length - 2];
  const deckTop = (z) => lidY(spec.deck, 0.01, z, 0);
  if (type === 'lip') {
    const z = last[0] - 0.05;
    // Sunk 12 mm into the crown at the centre, so its underside is below the
    // deck everywhere across the width.
    addBox(group, [2 * (prev[2] - 0.08), 0.035, 0.07], [0, deckTop(z) - 0.012 + 0.0175, z], mat);
  } else if (type === 'ducktail') {
    const z = last[0] - 0.08;
    addBox(group, [2 * (prev[2] - 0.06), 0.05, 0.14], [0, deckTop(z) - 0.012 + 0.025, z], mat, [-0.3, 0, 0]);
  } else if (type === 'wing') {
    const z = last[0] - 0.16;
    const base = deckTop(z) - 0.012;
    const top = base + 0.22;
    for (const sx of [-1, 1]) addBox(group, [0.03, 0.22, 0.06], [sx * 0.5, base + 0.11, z], mat);
    addBox(group, [1.5, 0.025, 0.26], [0, top + 0.01, z + 0.02], mat, [-0.1, 0, 0]);
    for (const sx of [-1, 1]) addBox(group, [0.012, 0.12, 0.3], [sx * 0.754, top, z + 0.02], mat);
  } else if (type === 'roof') {
    const z = spec.roofRearZ + 0.06;
    const hw = spec.roof[spec.roof.length - 1][2];
    addBox(group, [2 * (hw - 0.03), 0.03, 0.2], [0, roofTopY(spec, spec.roofRearZ) - 0.012, z - 0.04], mat, [0.15, 0, 0]);
  }
}

// --- kits ------------------------------------------------------------------------------

function policeKit(group, spec, beltAt, lights) {
  const noseZ = spec.plan[0][0];
  // Door band: white, both doors, kept clear of the wheel arches.
  const doorZ0 = -AXLE_Z + 0.5;
  const doorZ1 = AXLE_Z - 0.5;
  const band = flankPanel(spec, { z0: doorZ0, z1: doorZ1, y0: 0.46, y1: 0.7, zSteps: 12, ySteps: 6 });
  group.add(new THREE.Mesh(band, matte(CREWS.police.light)));
  // Lettering on its own panel 4 mm further out (transparent, letters only).
  const text = flankPanel(spec, { z0: doorZ0 + 0.05, z1: doorZ1 - 0.05, y0: 0.5, y1: 0.66, zSteps: 12, ySteps: 6, off: OFF + 0.004 });
  const letters = new THREE.MeshLambertMaterial({ map: textTexture('POLICE', { color: '#23324a', size: 92 }), transparent: true, alphaTest: 0.5 });
  letters.userData.disposable = true;
  group.add(new THREE.Mesh(text, letters));

  // Light bar on two feet, feet sunk into the roof's crown.
  const z = spec.roof[0][0] + 0.32;
  const roofY = roofTopY(spec, z);
  for (const sx of [-1, 1]) addBox(group, [0.06, 0.05, 0.2], [sx * 0.42, roofY + 0.025 - 0.012, z], matte(0x24272b));
  const baseY = roofY + 0.038 + 0.03;
  addBox(group, [1.16, 0.06, 0.26], [0, baseY, z], matte(0x24272b));
  const colors = [0xd8453b, 0x2f6fd8, 0xd8453b, 0x2f6fd8];
  const xs = [-0.43, -0.15, 0.15, 0.43];
  xs.forEach((x, i) => {
    const lens = flashLens(colors[i]);
    addBox(group, [0.27, 0.055, 0.22], [x, baseY + 0.03 + 0.0275 - 0.004, z], lens);
    lights.push({ material: lens, phase: i % 2 ? 0 : 0.5, pattern: 'bar' });
  });

  // Push bar in front of the bumper, strutted back into the nose.
  const pz = noseZ - 0.095;
  const pm = matte(0x1d1f22);
  for (const sx of [-1, 1]) {
    addBox(group, [0.05, 0.44, 0.05], [sx * 0.32, 0.53, pz], pm);
    addBox(group, [0.04, 0.04, 0.12], [sx * 0.32, 0.5, pz + 0.07], pm);
  }
  // Crossbars 1 cm shallower than the uprights, so their faces never meet flush.
  for (const y of [0.42, 0.68]) addBox(group, [0.74, 0.045, 0.04], [0, y, pz], pm);

  // Whip antenna on the deck.
  const dz = spec.deck[1][0];
  addBox(group, [0.008, 0.42, 0.008], [0.4, lidY(spec.deck, 0.01, dz, 0.4) + 0.2, dz], pm);
}

function unmarkedKit(group, spec, beltAt, lights) {
  const noseZ = spec.plan[0][0];
  const [, , lampY] = spec.headlamp;
  // Strobes hidden in the grille: sunk 5 mm into the grille bar.
  [[-0.12, 0xd8453b], [0.12, 0x2f6fd8]].forEach(([x, c], i) => {
    const lens = flashLens(c);
    addBox(group, [0.09, 0.03, 0.02], [x, lampY, noseZ - 0.04], lens);
    lights.push({ material: lens, phase: i ? 0 : 0.5, pattern: 'strobe' });
  });
  // Same pair behind the rear screen, on the parcel shelf.
  [[-0.2, 0xd8453b], [0.2, 0x2f6fd8]].forEach(([x, c], i) => {
    const lens = flashLens(c);
    addBox(group, [0.16, 0.03, 0.04], [x, spec.backlightBaseY + 0.03, spec.backlightBaseZ - 0.12], lens);
    lights.push({ material: lens, phase: i ? 0.5 : 0, pattern: 'strobe' });
  });
  // Pillar spotlight on the driver's side.
  const sz = spec.cowlZ + 0.12;
  const sx = -(beltAt(sz) + 0.06);
  const pm = matte(0x1d1f22);
  addBox(group, [0.05, 0.12, 0.05], [sx, spec.yBelt + 0.06, sz], pm);
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.13, 10), pm);
  head.geometry.userData.disposable = true;
  head.rotation.x = Math.PI / 2;
  head.position.set(sx, fromGround(spec.yBelt + 0.15), sz);
  group.add(head);
  const dz = spec.deck[1][0];
  addBox(group, [0.008, 0.3, 0.008], [0.35, lidY(spec.deck, 0.01, dz, 0.35) + 0.14, dz], pm);
}

function towKit(group, spec, beltAt, lights) {
  const dark = matte(0x2c2f33);
  const grey = matte(0x3c3f44);
  const deckY = (z, x = 0) => lidY(spec.deck, 0.01, z, x, beltAt);
  // Toolboxes along both sides of the flat deck, sunk 1 cm into it.
  for (const sx of [-1, 1]) {
    const x = sx * 0.62;
    const y0 = deckY(1.4, 0.62) - 0.01;
    addBox(group, [0.34, 0.34, 0.62], [x, y0 + 0.17, 1.42], grey);
    addBox(group, [0.36, 0.03, 0.64], [x, y0 + 0.34 + 0.012, 1.42], dark); // lid, overhanging 1 cm all round
  }
  // A-frame and boom.
  const fz = 1.82;
  for (const sx of [-1, 1]) addBeam(group, [sx * 0.28, deckY(fz) - 0.01, fz], [sx * 0.12, 1.98, fz + 0.05], 0.08, 0.08, dark);
  addBox(group, [0.36, 0.08, 0.1], [0, 1.98, fz + 0.05], dark);
  addBeam(group, [0, 1.98, fz + 0.05], [0, 1.78, 2.62], 0.1, 0.1, dark);
  // Cable and hook.
  addBeam(group, [0, 1.73, 2.62], [0, 1.22, 2.62], 0.012, 0.012, matte(0x8a8d91));
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.014, 6, 10, Math.PI * 1.5), dark);
  hook.geometry.userData.disposable = true;
  hook.position.set(0, fromGround(1.16), 2.62);
  hook.rotation.y = Math.PI / 2;
  group.add(hook);
  // Wheel-lift: an arm out from under the tail, a crossbar, two L forks.
  addBeam(group, [0, 0.46, 1.9], [0, 0.4, 2.72], 0.14, 0.09, dark);
  addBox(group, [1.3, 0.09, 0.12], [0, 0.4, 2.76], dark);
  for (const sx of [-1, 1]) addBox(group, [0.08, 0.07, 0.42], [sx * 0.6, 0.38, 2.6], dark);
  // Amber beacon bar on the cab roof.
  const z = spec.roof[0][0] + 0.25;
  const ry = roofTopY(spec, z);
  addBox(group, [1.0, 0.05, 0.2], [0, ry + 0.025 - 0.01, z], dark);
  [-0.32, 0, 0.32].forEach((x, i) => {
    const lens = flashLens(COLORS.lampAmber);
    addBox(group, [0.24, 0.06, 0.16], [x, ry + 0.05 + 0.03 - 0.014, z], lens);
    lights.push({ material: lens, phase: i / 3, pattern: 'beacon' });
  });
  // "MARA'S GARAGE" on both doors: letters only, on a transparent panel.
  const text = flankPanel(spec, { z0: -0.75, z1: 0.75, y0: 0.66, y1: 0.86, zSteps: 10, ySteps: 6 });
  const m = new THREE.MeshLambertMaterial({ map: textTexture("MARA'S GARAGE", { color: '#24272b', size: 76 }), transparent: true, alphaTest: 0.5 });
  m.userData.disposable = true;
  group.add(new THREE.Mesh(text, m));
}

// --- the seated driver ---------------------------------------------------------------

/**
 * Seat a figure in a car shell (no interior needed) with a simple wheel at
 * its hands. The hip point is placed so the head clears the roof by 4 cm;
 * returns the numbers the Model Lab checks (design/SPEC-models.md §5).
 */
export function seatDriver(group, spec, figure) {
  figure.setPose('seated');
  figure.update(0);
  // Hip over the seat cushion (CarModel buildInterior: cushion 0.16-0.68 m, back at 0.70 m).
  const hipZ = 0.55 + (spec.seatShift ?? 0);
  figure.group.position.set(DRIVER_X, 0, hipZ);
  group.add(figure.group);
  figure.group.updateMatrixWorld(true);
  // Head top and hip joint, in the shell's frame, at y = 0 root.
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const headBox = new THREE.Box3().setFromObject(figure.sockets.head).applyMatrix4(inv);
  const hip = new THREE.Vector3().setFromMatrixPosition(figure.joints.pelvis.matrixWorld).applyMatrix4(inv);
  const headAboveHip = headBox.max.y - hip.y;
  const headZ = (headBox.min.z + headBox.max.z) / 2;
  const roofAtHead = roofTopY(spec, Math.min(Math.max(headZ, spec.roof[0][0]), spec.roofRearZ));
  // Ground-frame hip height: high enough to see over the belt, low enough to clear the roof.
  const hipY = Math.min(spec.yFloor + 0.32, roofAtHead - 0.04 - headAboveHip);
  figure.group.position.y = fromGround(hipY) - (hip.y - figure.group.position.y);
  figure.group.updateMatrixWorld(true);

  // Steering wheel at the hands.
  const a = new THREE.Vector3().setFromMatrixPosition(figure.sockets.handR.matrixWorld).applyMatrix4(inv);
  const b = new THREE.Vector3().setFromMatrixPosition(figure.sockets.handL.matrixWorld).applyMatrix4(inv);
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const r = Math.min(0.19, Math.max(0.15, a.distanceTo(b) / 2));
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(r, 0.016, 6, 18), matte(0x2c2a28));
  wheel.geometry.userData.disposable = true;
  wheel.position.copy(mid);
  wheel.rotation.x = 0.38;
  group.add(wheel);
  const column = new THREE.Mesh(beamGeometry([mid.x, mid.y, mid.z], [mid.x, mid.y - 0.12, mid.z - 0.35], 0.05, 0.05), matte(0x2c2a28));
  group.add(column);

  return {
    hipY,
    headTop: hipY + headAboveHip,
    roofAtHead,
    clearance: roofAtHead - (hipY + headAboveHip),
    hipAboveFloor: hipY - spec.yFloor,
    headZ,
  };
}

// --- assembly --------------------------------------------------------------------------

/**
 * Build a story car.
 * @param {string} id  a key of STORY_CARS
 * @param {{ driver?: boolean|string, detail?: 'full'|'mid'|'low', wheelStyle?: number }} opts
 */
export function createStoryCar(id, { driver = false, detail = 'full', wheelStyle = 1 } = {}) {
  const def = STORY_CARS[id];
  if (!def) throw new Error(`unknown story car ${id}`);
  const spec = BODIES[def.body];
  const group = new THREE.Group();
  group.name = `storyCar:${id}`;
  // Seats and a dash, so a story car seen close up in a scene is not an
  // empty tub; static mirror glass (only the player's car has live mirrors).
  const cabin = detail === 'full';
  const { group: shell, beltAt } = createSedanShell({ paint: def.paint, spec, detail, roofPaint: def.roof ?? def.paint, interior: cabin, staticMirrorGlass: true });
  group.add(shell);
  if (cabin) {
    // Dash: Cockpit.js builds the player's; story cars get one box under the screen.
    const dz = spec.cowlZ + 0.2;
    const top = spec.yBelt - 0.04;
    const m = matte(COLORS.dash, { side: THREE.DoubleSide, emissive: 0x2e3236, emissiveIntensity: 1 });
    addBox(group, [2 * (beltAt(dz) - 0.09), 0.3, 0.42], [0, top - 0.15, dz], m);
  }
  // Each wheel sits in a steer group so a scene can turn the fronts and roll all four.
  const wheels = [];
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const steer = new THREE.Group();
    steer.position.set((sx * TRACK) / 2, fromGround(WHEEL_RADIUS), sz * AXLE_Z);
    const w = createWheelMesh(wheelStyle);
    steer.add(w);
    group.add(steer);
    wheels.push({ steer, wheel: w, front: sz < 0 });
  }
  if (def.livery) addLivery(group, spec, beltAt, def.livery);
  const lights = [];
  if (def.kit === 'police') policeKit(group, spec, beltAt, lights);
  if (def.kit === 'unmarked') unmarkedKit(group, spec, beltAt, lights);
  if (def.kit === 'tow') towKit(group, spec, beltAt, lights);

  let figure = null;
  let seat = null;
  const castId = driver === true ? def.driver ?? 'youStreet' : driver || null;
  if (castId) {
    figure = createFigure(CAST[castId].outfit, { name: castId, breathe: false });
    group.updateMatrixWorld(true);
    seat = seatDriver(group, spec, figure);
  }

  // Headlights for scenes: one shadowless spot ahead of the car (the same
  // cheap rig as the Handling Lab) plus a soft glow over each lamp. Built on
  // first use; a parked story car costs nothing.
  let head = null;
  function setHeadlights(v) {
    if (!head && v) {
      head = new THREE.Group();
      const spot = new THREE.SpotLight(0xfff0d6, 60, 60, 0.45, 0.55, 1.4);
      spot.position.set(0, fromGround(spec.headlamp[2]), spec.plan[0][0] - 0.1);
      spot.target.position.set(0, fromGround(0), spec.plan[0][0] - 14);
      head.add(spot, spot.target);
      const glowMat = new THREE.SpriteMaterial({ map: glowTexture(), color: 0xfff2dc, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      glowMat.userData.disposable = true;
      const [lampIn, lampOut, lampY] = spec.headlamp;
      for (const sx of [-1, 1]) {
        const g = new THREE.Sprite(glowMat);
        g.scale.setScalar(0.9);
        g.position.set(sx * (lampIn + lampOut) / 2, fromGround(lampY), spec.plan[0][0] - 0.06);
        head.add(g);
      }
      group.add(head);
    }
    if (head) head.visible = v;
  }

  let on = false;
  let t = 0;
  function setLights(v) {
    on = v;
    if (!on) for (const l of lights) l.material.emissiveIntensity = 0.15;
  }
  function update(dt) {
    t += dt;
    if (!on) return;
    for (const l of lights) {
      const p = (t * (l.pattern === 'beacon' ? 1.1 : 1.6) + l.phase) % 1;
      // Bar and strobe: double flash per half cycle. Beacon: rotating sweep.
      const lit = l.pattern === 'beacon' ? Math.max(0, Math.cos(p * Math.PI * 2)) : p < 0.12 || (p > 0.2 && p < 0.32) ? 1 : 0;
      l.material.emissiveIntensity = 0.15 + 1.6 * lit;
    }
  }
  function dispose() {
    group.traverse((o) => {
      if (!o.isMesh && !o.isSprite) return;
      if (o.geometry.userData.disposable) o.geometry.dispose();
      if (o.material.userData?.disposable) o.material.dispose();
    });
    figure?.dispose();
  }

  return { group, spec, def, figure, seat, lights, wheels, setLights, setHeadlights, update, dispose };
}
