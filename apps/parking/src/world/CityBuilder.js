/**
 * CityBuilder.js — turns `design/level13/layout-model.mjs`'s `buildLayout()`
 * output into scene geometry plus physics bodies, for `level.style === 'city'`.
 *
 * This is the `style: 'city'` counterpart to LevelBuilder.js's single-lot
 * path (SPEC-level13.md §5.2). It does NOT go through `Garage.js` or
 * `addGround` — a 222 m city with five car-park floors is nothing like one
 * flat lot, so it builds its own visual meshes and colliders straight from
 * the layout data, and returns the same shape LevelBuilder.buildLevel does
 * ({ root, target, cones, spawn, update, dispose }) so Game.js needs no
 * per-style branching of its own beyond picking which builder to call.
 *
 * Conventions: same as layout-model.mjs — x east, z south, y up, a box is
 * { c:[x,y,z], s:[w,h,d], rotY?, pitch? } with FULL extents.
 */
import * as THREE from 'three';
import { COLORS, matte, flat, glow, carPaint } from './Palette.js';
import { createBayMarkings, createTargetBay, createCone, createFloorArrow, paintQuad } from './Props.js';
import { createParkedCar, parkedCarVariation } from '../vehicle/CarModel.js';
import { bodyForIndex, BODY_TYPES } from '../vehicle/bodies.js';
import { RIDE_HEIGHT } from '../vehicle/Dimensions.js';
import { createLightingRig } from '../render/Renderer.js';
import { surfaceAt } from '../../design/level13/layout-model.mjs';

const BOX = new THREE.BoxGeometry(1, 1, 1);
/** Half this, in metres, is the furthest a merged parked-car vertex sits from
 *  its mesh origin — small enough that float32 keeps flush body panels apart. */
const CAR_CHUNK = 16;

/** Same parked-car collision box LevelBuilder uses, so a bump on the street
 *  or in a bay feels identical everywhere in the game. */
const CAR_BOX = { size: [1.78, 1.28, 4.2], centreY: 0.84 };

/** Deterministic building-facade colour per palette index (layout-model seeds these 0-4). */
const BUILDING_COLORS = [0xd7d2c8, 0xc7ccc9, 0xd3c9bd, 0xc9d0d3, 0xcdc7d0];

function box(c, size, color, { rotY = 0, pitch = 0, castShadow = true, receiveShadow = true } = {}) {
  const m = new THREE.Mesh(BOX, matte(color));
  m.scale.set(size[0], size[1], size[2]);
  m.position.set(c[0], c[1], c[2]);
  if (rotY) m.rotation.y = rotY;
  if (pitch) m.rotation.x = pitch; // applied after rotY via three's default XYZ Euler order... see note below
  m.castShadow = castShadow;
  m.receiveShadow = receiveShadow;
  return m;
}

export function buildCityLevel({ level, scene, physics }) {
  const L = level.layout;
  const root = new THREE.Group();
  root.name = `level:${level.id}`;

  // One ground collider under the whole city (streets included) at y = 0 —
  // without this the wheel raycasts on the spawn street never hit anything
  // (see PhysicsWorld.js's header note: no floor collider = no wheel contact
  // = the car sits nose-down and never moves). The car-park floors above
  // street level get their own slab colliders below.
  physics.addGround({ width: 2 * L.params.city.half + 4, depth: 2 * L.params.city.half + 4 });

  // --- lighting: daylight like 'open', sun follows the car (§5.5, §5.12) ----
  const lighting = createLightingRig('city', { width: 60, depth: 60, ceilingHeight: 3.0 });
  root.add(lighting.group);
  scene.fog = lighting.fog;
  if (lighting.background) root.add(lighting.background);
  scene.background = new THREE.Color(lighting.clear);

  // --- streets + sidewalks (visual only; the boundary walls are colliders) --
  for (const s of L.streets) {
    const len = s.to - s.from;
    const mesh =
      s.axis === 'z'
        ? box([s.at, -0.01, 0], [s.width, 0.02, len], COLORS.concreteFloorDark, { castShadow: false })
        : box([0, -0.01, s.at], [len, 0.02, s.width], COLORS.concreteFloorDark, { castShadow: false });
    mesh.receiveShadow = true;
    root.add(mesh);
  }
  for (const sw of L.sidewalks) {
    const mesh = box(
      [(sw.x0 + sw.x1) / 2, -0.005, (sw.z0 + sw.z1) / 2],
      [sw.x1 - sw.x0, 0.01, sw.z1 - sw.z0],
      COLORS.concreteFloor,
      { castShadow: false }
    );
    mesh.receiveShadow = true;
    root.add(mesh);
  }
  // A base plate under the whole city so there's never a gap between streets.
  const base = box([0, -0.06, 0], [2 * L.params.city.half + 4, 0.02, 2 * L.params.city.half + 4], COLORS.concreteFloorDark, { castShadow: false });
  base.receiveShadow = true;
  root.add(base);

  // --- buildings: visual + collider, merged per palette colour (perf) -------
  const byColor = new Map();
  for (const b of L.buildings) {
    const color = BUILDING_COLORS[b.palette % BUILDING_COLORS.length];
    if (!byColor.has(color)) byColor.set(color, []);
    byColor.get(color).push(b.box);
    physics.addStaticBox({ pos: b.box.c, size: b.box.s, userData: { kind: 'building' } });
  }
  for (const [color, boxes] of byColor) {
    const geos = boxes.map((bx) => {
      const g = new THREE.BoxGeometry(bx.s[0], bx.s[1], bx.s[2]);
      g.translate(bx.c[0], bx.c[1], bx.c[2]);
      return g;
    });
    const merged = mergeBoxGeometries(geos);
    const mesh = new THREE.Mesh(merged, matte(color));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.geometry.userData.disposable = true;
    root.add(mesh);
  }

  // --- car park structure: slabs, ramps, walls, columns ---------------------
  // Same merge-by-material technique as the parked cars below: ~300 individual
  // boxes here (5 slabs' worth of rects, 12 ramp pieces, ~270 walls/columns)
  // collapse to one draw call per colour instead of one per box.
  const structureByColor = new Map();
  const bakeBox = (c, size, color, { rotY = 0, pitch = 0 } = {}) => {
    if (!structureByColor.has(color)) structureByColor.set(color, []);
    const g = new THREE.BoxGeometry(size[0], size[1], size[2]);
    const m = new THREE.Matrix4()
      .makeRotationFromEuler(new THREE.Euler(pitch, 0, 0, 'YXZ'))
      .premultiply(new THREE.Matrix4().makeRotationY(rotY));
    g.applyMatrix4(m);
    g.translate(c[0], c[1], c[2]);
    structureByColor.get(color).push(g);
  };
  for (const s of L.slabs) {
    for (const [x0, z0, x1, z1] of s.rects) {
      const thick = s.thick > 0 ? s.thick : 0.05;
      bakeBox(
        [(x0 + x1) / 2, s.y - thick / 2, (z0 + z1) / 2],
        [x1 - x0, thick, z1 - z0],
        s.floor === 0 ? COLORS.concreteFloor : COLORS.concreteFloorDark
      );
      if (s.thick > 0) {
        physics.addStaticBox({
          pos: [(x0 + x1) / 2, s.y - thick / 2, (z0 + z1) / 2],
          size: [x1 - x0, thick, z1 - z0],
          userData: { kind: 'slab', isGround: true },
        });
      }
    }
  }
  for (const r of L.ramps) {
    for (const pc of r.pieces) {
      bakeBox(pc.c, pc.s, COLORS.concreteFloorDark, { pitch: pc.pitch });
      physics.addStaticBox({ pos: pc.c, size: pc.s, pitch: pc.pitch, userData: { kind: 'ramp', isGround: true } });
    }
  }
  for (const w of L.walls) {
    // The layout model lists a box per parked car in `walls` so its own
    // clearance checks (checkLayout's swept-path rule) can see them. They are
    // NOT structure: the parked-car pass below builds the real car mesh and
    // its collider. Baking these too drew a featureless concrete box over
    // every car in the city — which is what made them read as "glitchy boxes
    // with tail lights" — and added a second, slightly taller static body on
    // top of each car's own.
    if (w.kind === 'parkedCar') continue;
    const color = w.kind === 'column' ? COLORS.concreteColumn : COLORS.concreteWall;
    bakeBox(w.box.c, w.box.s, color, { rotY: w.box.rotY ?? 0, pitch: w.box.pitch ?? 0 });
    physics.addStaticBox({
      pos: w.box.c,
      size: w.box.s,
      rotY: w.box.rotY ?? 0,
      pitch: w.box.pitch ?? 0,
      userData: { kind: w.kind },
    });
  }
  for (const [color, geos] of structureByColor) {
    const merged = mergeBoxGeometries(geos);
    const mesh = new THREE.Mesh(merged, matte(color));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.geometry.userData.disposable = true;
    root.add(mesh);
  }

  // --- ceiling light strips (glow material, not real lights — §5.12) -------
  for (const f of L.floors) {
    if (f.index === 0) continue;
    const stripY = f.y - L.params.park.slab - 0.05;
    for (const z of [-L.params.park.halfZ + 4, 0, L.params.park.halfZ - 4]) {
      const strip = box([0, stripY, z], [L.params.park.halfX * 1.6, 0.04, 0.25], null);
      strip.material = glow(COLORS.fluorescent, 0.9);
      strip.castShadow = false;
      strip.receiveShadow = false;
      root.add(strip);
    }
  }

  // --- bays + parked cars -----------------------------------------------------
  // ~190 bays x 2-3 paint quads each — merge for the same reason as the
  // structure above (every bay is the same width/length, so createBayMarkings
  // is called once and its quads re-baked per bay rather than rebuilt).
  const bayGeos = [];
  {
    const template = createBayMarkings({ width: L.bays[0].width, length: L.bays[0].length, style: 'bay' });
    template.updateMatrixWorld(true);
    // Bake each quad's OWN local transform (its offset within the bay, and
    // the -90 deg X rotation paintQuad uses to lie flat) first — grabbing
    // `obj.geometry` raw would drop both and stack every line on the bay
    // centre, standing upright.
    const quads = [];
    template.traverse((obj) => {
      if (!obj.isMesh) return;
      const g = obj.geometry.clone();
      g.applyMatrix4(obj.matrixWorld);
      quads.push(g);
    });
    for (const bay of L.bays) {
      const m = new THREE.Matrix4().makeRotationY(bay.heading).setPosition(bay.x, bay.y + 0.001, bay.z);
      for (const g of quads) {
        const bg = g.clone();
        bg.applyMatrix4(m);
        bayGeos.push(bg);
      }
    }
  }
  {
    const merged = mergeBoxGeometries(bayGeos);
    const mesh = new THREE.Mesh(merged, flat(COLORS.paintLine, { transparent: true, opacity: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, depthWrite: false }));
    mesh.geometry.userData.disposable = true;
    root.add(mesh);
  }
  // 132 parked cars here vs ~20 on any other lot (SPEC-level13.md §5.11), and
  // each createParkedCar() is ~20 draw calls of its own — added one mesh at a
  // time that was 2,500+ draw calls just for parked cars, measured well over
  // the 60 fps budget. Build every car off-screen, bake its world transform
  // into its geometry, and merge everything sharing one material (Palette's
  // materials are cached/shared, so "same material object" already means
  // "same colour" — see Palette.js's cache) into one mesh per material per
  // CAR_CHUNK cell.
  const byMaterial = new Map();
  const chunkOrigins = new Map();
  // Detail tier by distance from the drivable route (SPEC: full within 25 m,
  // mid to 60 m, low beyond). Cars the player never gets near carry the
  // silhouette and the lamps and nothing else. Measured against the route's
  // sampled points rather than its segments: 432 points over 427 m is a point
  // roughly every metre, so nearest-point is accurate to well under the 25 m
  // and 60 m thresholds and costs no geometry.
  const routePoints = L.route?.points ?? [];
  const detailFor = (pos) => {
    let best = Infinity;
    for (const p of routePoints) {
      const d = (p.x - pos[0]) ** 2 + (p.z - pos[2]) ** 2;
      if (d < best) best = d;
    }
    best = Math.sqrt(best);
    return best <= 25 ? 'full' : best <= 60 ? 'mid' : 'low';
  };
  L.parkedCars.forEach((c, carIndex) => {
    // Same fallback LevelBuilder.js uses: an explicit `body` name (the layout
    // model sets one for every car — GOAL-city-polish.md item 2) picks the
    // silhouette independently of paint, so vans/pickups actually appear
    // instead of `bodyForIndex(paint)` silently capping variety at whatever
    // range `paint` covers.
    const body = BODY_TYPES.find((b) => b.name === c.body) ?? bodyForIndex(c.paint ?? 0);
    const mesh = createParkedCar(carPaint(c.paint), body, parkedCarVariation(carIndex, detailFor(c.pos)));
    mesh.position.set(c.pos[0], c.pos[1] + RIDE_HEIGHT, c.pos[2]);
    mesh.rotation.y = c.heading;
    mesh.updateMatrixWorld(true);
    // Bake relative to a chunk origin, never to the city origin. A car's body
    // panels, plate and lamps sit flush on each other; at world coordinates
    // (up to 160 m out on the street grid) float32 vertices quantise to ~20 um,
    // enough for those flush pairs to z-fight into a black/white checkerboard.
    // Near the origin the same merge renders clean. Chunking keeps every baked
    // coordinate within CAR_CHUNK/2 of its mesh's own origin.
    const key = `${Math.floor(c.pos[0] / CAR_CHUNK)},${Math.floor(c.pos[2] / CAR_CHUNK)}`;
    const origin = chunkOrigins.get(key) ?? (() => {
      const o = new THREE.Vector3(
        (Math.floor(c.pos[0] / CAR_CHUNK) + 0.5) * CAR_CHUNK,
        0,
        (Math.floor(c.pos[2] / CAR_CHUNK) + 0.5) * CAR_CHUNK
      );
      chunkOrigins.set(key, o);
      return o;
    })();
    const toChunk = new THREE.Matrix4().makeTranslation(-origin.x, -origin.y, -origin.z);
    mesh.traverse((obj) => {
      if (!obj.isMesh) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        const bucket = `${key}|${mat.uuid}`;
        if (!byMaterial.has(bucket)) byMaterial.set(bucket, { mat, origin, geos: [] });
        const g = obj.geometry.clone();
        g.applyMatrix4(obj.matrixWorld);
        g.applyMatrix4(toChunk);
        byMaterial.get(bucket).geos.push(g);
      }
    });
    physics.addStaticBox({
      pos: [c.pos[0], c.pos[1] + CAR_BOX.centreY, c.pos[2]],
      size: CAR_BOX.size,
      rotY: c.heading,
      userData: { kind: 'parkedCar' },
    });
  });
  for (const { mat, origin, geos } of byMaterial.values()) {
    const merged = mergeBoxGeometries(geos); // works for any indexed/non-indexed geometry, not just boxes
    const mesh = new THREE.Mesh(merged, mat);
    mesh.position.copy(origin);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.geometry.userData.disposable = true;
    root.add(mesh);
  }

  // --- crossing stripes (GOAL-city-polish.md item 3.4) ------------------------
  // One flat painted rectangle per crossing — same paintQuad + bake-and-merge
  // technique as the bay markings above, just not worth a shared template
  // since there are only 8 of them (2 route intersections x 4 approaches).
  if (L.crossings.length) {
    const crossingGeos = L.crossings.map((cr) => {
      const q = paintQuad(cr.size[0], cr.size[1], COLORS.paintLine, { y: 0.012, opacity: 0.55 });
      q.rotation.y = cr.rotY ?? 0;
      q.position.set(cr.pos[0], cr.pos[1] + 0.012, cr.pos[2]);
      q.updateMatrixWorld(true);
      const g = q.geometry.clone();
      g.applyMatrix4(q.matrixWorld);
      return g;
    });
    const merged = mergeBoxGeometries(crossingGeos);
    const mesh = new THREE.Mesh(merged, flat(COLORS.paintLine, { transparent: true, opacity: 0.55, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, depthWrite: false }));
    mesh.geometry.userData.disposable = true;
    root.add(mesh);
  }

  // --- roundabout island (item 3.3): decorative, off the drivable route ------
  if (L.roundabout) {
    const ra = L.roundabout;
    const kerb = new THREE.Mesh(new THREE.CylinderGeometry(ra.radius, ra.radius, 0.18, 20), matte(COLORS.concreteFloor));
    kerb.position.set(ra.pos[0], 0.09, ra.pos[2]);
    kerb.receiveShadow = true;
    root.add(kerb);
    const planter = new THREE.Mesh(new THREE.CylinderGeometry(ra.radius * 0.7, ra.radius * 0.7, 0.5, 18), matte(0x9ab8a3));
    planter.position.set(ra.pos[0], 0.18 + 0.25, ra.pos[2]);
    planter.castShadow = true;
    planter.receiveShadow = true;
    root.add(planter);
    physics.addStaticBox({
      pos: [ra.pos[0], 0.34, ra.pos[2]],
      size: [ra.radius * 1.4, 0.68, ra.radius * 1.4],
      userData: { kind: 'roundabout' },
    });
  }

  // --- traffic lights (item 3.2): atmosphere only, no enforcement ------------
  const trafficLightLamps = [];
  for (const tl of L.trafficLights) {
    const pole = box([tl.pos[0], tl.height / 2, tl.pos[2]], [0.1, tl.height, 0.1], COLORS.concreteColumnDark, { castShadow: true });
    root.add(pole);
    const housing = box([tl.pos[0], tl.height, tl.pos[2]], [0.22, 0.6, 0.22], 0x1f2226, { castShadow: true });
    root.add(housing);
    const lampY = [tl.height + 0.18, tl.height, tl.height - 0.18];
    // NOT Palette's glow() cache: each lamp's emissiveIntensity is animated
    // per-instance below, and glow() returns one SHARED material per
    // (colour, intensity) key — two lights sharing a cached red material
    // would animate in lockstep regardless of their phaseOffset.
    const lamps = [COLORS.lampRed, COLORS.lampAmber, COLORS.targetGlow].map((color, i) => {
      const mat = new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.05 });
      mat.userData.disposable = true; // not Palette's cache — this instance is animated per-frame
      const m = new THREE.Mesh(BOX, mat);
      m.scale.set(0.14, 0.14, 0.05);
      m.position.set(tl.pos[0], lampY[i], tl.pos[2] + 0.14);
      root.add(m);
      return m;
    });
    trafficLightLamps.push({ lamps, phaseOffset: tl.phaseOffset ?? 0 });
  }
  /** 8s green / 2s amber / 8s red, offset per light so they don't flip in lockstep. */
  const TL_CYCLE = 18;
  function updateTrafficLights(elapsed) {
    for (const { lamps, phaseOffset } of trafficLightLamps) {
      const t = (elapsed + phaseOffset) % TL_CYCLE;
      const phase = t < 8 ? 2 : t < 10 ? 1 : 0; // 2=green, 1=amber, 0=red
      for (let i = 0; i < 3; i++) lamps[i].material.emissiveIntensity = i === 2 - phase ? 1.4 : 0.05;
    }
  }

  // --- target bay -------------------------------------------------------------
  const t = L.target;
  const target = createTargetBay({ width: t.bay.width, length: t.bay.length, style: t.style });
  target.group.position.set(t.pos[0], t.y, t.pos[1]);
  target.group.rotation.y = t.bayHeading;
  root.add(target.group);

  // --- cones, arrows, signs, lamps, barrier ------------------------------------
  const coneMeshes = [];
  for (const c of L.cones) {
    const mesh = createCone();
    mesh.position.set(c.pos[0], c.pos[1], c.pos[2]);
    root.add(mesh);
    coneMeshes.push(mesh);
  }
  for (const a of L.arrows) {
    const mesh = createFloorArrow();
    mesh.position.set(a.pos[0], a.pos[1] + 0.002, a.pos[2]);
    mesh.rotation.y = a.heading ?? 0;
    root.add(mesh);
  }
  for (const s of L.signs) buildSign(root, s);
  for (const lp of L.lamps) {
    const pole = box([lp.pos[0], lp.pos[1] + lp.height / 2, lp.pos[2]], [0.12, lp.height, 0.12], COLORS.concreteColumnDark, { castShadow: true });
    root.add(pole);
    const head = new THREE.Mesh(BOX, glow(COLORS.lampWarm, 1.2));
    head.scale.set(0.3, 0.12, 0.3);
    head.position.set(lp.pos[0], lp.pos[1] + lp.height, lp.pos[2]);
    root.add(head);
  }
  if (L.barrier) {
    const b = L.barrier;
    const post = box([b.pos[0], 0.55, b.pos[2]], [0.1, 1.1, 0.1], COLORS.hazard);
    root.add(post);
    const arm = new THREE.Mesh(BOX, flat(COLORS.hazard));
    arm.scale.set(b.armLength, 0.06, 0.06);
    // Raised: the arm stands vertical beside the post (cosmetic only, no collider).
    arm.position.set(b.pos[0], b.raised ? 1.0 : 0.85, b.pos[2]);
    if (b.raised) arm.rotation.z = Math.PI / 2.1;
    root.add(arm);
    root.add(box(b.booth.c, b.booth.s, COLORS.concreteWall));
  }

  // --- shadow-follow sun (§5.5) -------------------------------------------
  const sun = lighting.sun;
  const shadowSpan = 30; // half-span of the 60 m box in §5.5
  const texel = 2;
  const snap = (v) => Math.round(v / texel) * texel;
  function followShadow(carPos) {
    if (!sun || !carPos) return;
    const cx = snap(carPos.x);
    const cz = snap(carPos.z);
    sun.position.set(cx - 40, carPos.y + 30, cz + 30);
    sun.target.position.set(cx, carPos.y, cz);
    sun.target.updateMatrixWorld();
    sun.shadow.camera.left = -shadowSpan;
    sun.shadow.camera.right = shadowSpan;
    sun.shadow.camera.top = shadowSpan;
    sun.shadow.camera.bottom = -shadowSpan;
    sun.shadow.camera.far = 120;
    sun.shadow.camera.updateProjectionMatrix();
  }

  scene.add(root);

  return {
    root,
    target,
    cones: coneMeshes,
    spawn: {
      pos: [level.spawn.pos[0], RIDE_HEIGHT, level.spawn.pos[1]],
      heading: level.spawn.heading,
    },
    /** Surface height at (x,z), for debugTeleport and anything else that
     *  needs to drop the car onto the right floor of this level. */
    surfaceAt: (x, z, prevY = 0) => surfaceAt(L, x, z, prevY),
    layout: L,

    update(elapsed, carPos) {
      target.update(elapsed);
      followShadow(carPos);
      updateTrafficLights(elapsed);
    },

    dispose() {
      scene.remove(root);
      physics.clearStatics();
      scene.fog = null;
      root.traverse((obj) => {
        if (!obj.isMesh) return;
        if (obj.geometry?.userData?.disposable) obj.geometry.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) if (m?.userData?.disposable) m.dispose();
      });
    },
  };
}

function buildSign(root, s) {
  if (s.kind === 'pylon') {
    const pole = box([s.pos[0], s.height / 2, s.pos[2]], [0.3, s.height, 0.3], COLORS.concreteColumnDark);
    root.add(pole);
    for (const face of s.faces) {
      const panel = new THREE.Mesh(BOX, glow(COLORS.targetGlow, 0.6));
      panel.scale.set(s.panel, s.panel, 0.08);
      panel.position.set(s.pos[0], s.height - s.panel / 2 - 0.3, s.pos[2]);
      panel.rotation.y = face === 'south' ? 0 : Math.PI / 2;
      root.add(panel);
    }
    return;
  }
  // facade / street / floorNumber / levelSign: a flat glowing panel is enough
  // wayfinding to drive by — full lettering is a texture problem this game
  // deliberately has none of (Palette.js header: no image textures anywhere).
  const w = s.width ?? s.size ?? 1;
  const h = s.height ?? 0.05;
  if (s.kind === 'floorNumber') {
    const q = paintQuad(w, w, COLORS.paintNumber, { y: (s.pos[1] ?? 0) + 0.005, opacity: 0.85 });
    q.position.x = s.pos[0];
    q.position.z = s.pos[2];
    root.add(q);
    return;
  }
  if (s.kind === 'gantry') {
    // Overhead directional gantry (item 3.1): a beam across the carriageway on
    // one support pole, a glowing "P" panel, and a chevron pointing the turn
    // — geometry only, same no-lettering convention as every other sign here.
    const beamLen = 12;
    const poleX = s.pos[0] - beamLen / 2;
    root.add(box([poleX, s.height / 2, s.pos[2]], [0.14, s.height, 0.14], COLORS.concreteColumnDark, { castShadow: true }));
    root.add(box([s.pos[0], s.height, s.pos[2]], [beamLen, 0.14, 0.14], COLORS.concreteColumnDark, { castShadow: true }));
    const panelY = s.height - 0.7;
    const panel = new THREE.Mesh(BOX, glow(COLORS.targetGlow, 0.55));
    panel.scale.set(1.6, 1.0, 0.08);
    panel.position.set(s.pos[0], panelY, s.pos[2]);
    panel.castShadow = true;
    root.add(panel);
    // Chevron: two bars angled to meet at a point on the turn side.
    const dir = s.turn === 'left' ? -1 : 1;
    const chevron = matte(0x1f2226);
    for (const sgn of [-1, 1]) {
      const bar = new THREE.Mesh(BOX, chevron);
      bar.scale.set(0.42, 0.09, 0.04);
      bar.position.set(s.pos[0] + dir * 0.14, panelY + sgn * 0.14, s.pos[2] - 0.045);
      bar.rotation.z = sgn * dir * 0.62;
      root.add(bar);
    }
    return;
  }
  const panel = new THREE.Mesh(BOX, glow(COLORS.lampWarm, 0.5));
  panel.scale.set(w, h, 0.08);
  panel.position.set(s.pos[0], s.pos[1], s.pos[2]);
  root.add(panel);
}

/** Merge a list of BufferGeometry (already translated into place) into one. */
function mergeBoxGeometries(geos) {
  const positions = [];
  const normals = [];
  let indexOffset = 0;
  const indices = [];
  for (const g of geos) {
    const pos = g.attributes.position.array;
    const nor = g.attributes.normal.array;
    for (let i = 0; i < pos.length; i++) positions.push(pos[i]);
    for (let i = 0; i < nor.length; i++) normals.push(nor[i]);
    const idx = g.index ? g.index.array : null;
    const vertCount = pos.length / 3;
    if (idx) {
      for (let i = 0; i < idx.length; i++) indices.push(idx[i] + indexOffset);
    } else {
      for (let i = 0; i < vertCount; i++) indices.push(i + indexOffset);
    }
    indexOffset += vertCount;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  out.setIndex(indices);
  return out;
}
