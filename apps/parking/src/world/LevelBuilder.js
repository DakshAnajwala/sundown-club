/**
 * LevelBuilder.js — turns one entry of Levels.js into scene geometry plus
 * physics bodies, and knows how to tear it all down again.
 *
 * The single rule worth stating out loud: colliders are added HERE, from the
 * level's own data, and cones are never in that data path. That is what makes
 * "the car phases through cones" structurally true rather than a flag someone
 * has to remember to set.
 */
import * as THREE from 'three';
import { createGarage } from './Garage.js';
import {
  createPillar,
  createCone,
  createBayMarkings,
  createTargetBay,
  createKerb,
  createFloorArrow,
} from './Props.js';
import { carPaint, COLORS } from './Palette.js';
import { createParkedCar, parkedCarVariation } from '../vehicle/CarModel.js';
import { bodyForIndex, BODY_TYPES } from '../vehicle/bodies.js';
import { RIDE_HEIGHT } from '../vehicle/Dimensions.js';
import { createLightingRig } from '../render/Renderer.js';
import { buildCityLevel } from './CityBuilder.js';
import { levelFootprints } from '../game/PlanGeometry.js';

/** Height of a parked car's collision box, and where its centre sits. */
const CAR_BOX = { size: [1.78, 1.28, 4.2], centreY: 0.84 };

export function buildLevel({ level, scene, physics }) {
  // A city (SPEC-level13.md) is nothing like one flat lot — multiple floors,
  // a whole street grid — so it gets its own builder rather than trying to
  // squeeze buildLayout()'s output through the single-lot path below.
  if (level.style === 'city') return buildCityLevel({ level, scene, physics });

  const root = new THREE.Group();
  root.name = `level:${level.id}`;
  const { width, depth, ceilingHeight } = level.lot;

  // --- shell ---------------------------------------------------------------
  const garage = createGarage({ style: level.style, width, depth, ceilingHeight });
  root.add(garage.group);
  physics.addGround({ width, depth });
  for (const c of garage.colliders) {
    physics.addStaticBox({ pos: c.pos, size: c.size, userData: { kind: c.kind } });
  }

  // --- lighting + atmosphere ------------------------------------------------
  const lighting = createLightingRig(level.style, { width, depth, ceilingHeight });
  root.add(lighting.group);
  scene.fog = lighting.fog;
  if (lighting.background) {
    root.add(lighting.background);
    scene.background = new THREE.Color(lighting.clear);
  } else {
    scene.background = new THREE.Color(lighting.clear);
  }

  // --- painted bay rows -----------------------------------------------------
  // A row is xs along a fixed z, or explicit `bays: [[x, z], ...]` for rows that
  // don't run along an axis (echelon rows step in z as well as x).
  const paintRow = (spec) => {
    if (!spec) return;
    const w = spec.width ?? 3.0;
    const spots = spec.bays ?? spec.xs.map((x) => [x, spec.z]);
    for (const [x, z] of spots) {
      const m = createBayMarkings({ width: w, length: spec.length ?? 5.4, style: 'bay' });
      m.position.set(x, 0, z);
      m.rotation.y = spec.heading ?? 0;
      root.add(m);
    }
  };
  paintRow(level.bayRow);
  paintRow(level.southRow);
  for (const r of level.extraRows ?? []) paintRow(r);

  // --- target bay -----------------------------------------------------------
  const target = createTargetBay({
    width: level.target.bay.width,
    length: level.target.bay.length,
    style: level.target.style,
  });
  target.group.position.set(level.target.pos[0], 0, level.target.pos[1]);
  // The MARKINGS' rotation, not the parked car's: see "BAY HEADING" in Levels.js.
  target.group.rotation.y = level.target.bayHeading ?? level.target.heading;
  root.add(target.group);

  // --- parked cars ----------------------------------------------------------
  level.cars.forEach((c, i) => {
    // Body type is picked deterministically from the same index as the paint,
    // so a lot has a believable mix of saloons, hatchbacks and the odd van, and
    // looks identical every time it loads.
    // `body` forces a type where the level needs one (the van beside an end
    // stall is the point of that level, not a coincidence of the paint index).
    const body = BODY_TYPES.find((b) => b.name === c.body) ?? bodyForIndex(c.paint ?? 0);
    // ~20 cars in a single lot, all of them within a few metres of the player:
    // every one gets full detail. Only the city needs tiers (see CityBuilder).
    const mesh = createParkedCar(carPaint(c.paint ?? 0), body, parkedCarVariation(i));
    mesh.position.set(c.pos[0], RIDE_HEIGHT, c.pos[1]);
    mesh.rotation.y = c.heading;
    root.add(mesh);

    physics.addStaticBox({
      pos: [c.pos[0], CAR_BOX.centreY, c.pos[1]],
      size: CAR_BOX.size,
      rotY: c.heading,
      userData: { kind: 'parkedCar' },
    });
  });

  // --- pillars --------------------------------------------------------------
  for (const p of level.pillars ?? []) {
    const [w, d] = p.size;
    const mesh = createPillar({ width: w, depth: d, height: ceilingHeight });
    mesh.position.set(p.pos[0], 0, p.pos[1]);
    root.add(mesh);
    physics.addStaticBox({
      pos: [p.pos[0], ceilingHeight / 2, p.pos[1]],
      size: [w, ceilingHeight, d],
      userData: { kind: 'pillar' },
    });
  }

  // --- free-standing walls / stair cores ------------------------------------
  for (const w of level.walls ?? []) {
    const h = w.height ?? ceilingHeight;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w.size[0], h, w.size[1]),
      new THREE.MeshLambertMaterial({
        color: level.style === 'underground' ? COLORS.concreteWallDark : COLORS.concreteWall,
      })
    );
    mesh.geometry.userData.disposable = true;
    mesh.material.userData = { disposable: true };
    mesh.position.set(w.pos[0], h / 2, w.pos[1]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    physics.addStaticBox({
      pos: [w.pos[0], h / 2, w.pos[1]],
      size: [w.size[0], h, w.size[1]],
      userData: { kind: 'wall' },
    });
  }

  // --- kerbs (low, but solid: they are colliders) ---------------------------
  for (const k of level.kerbs ?? []) {
    const mesh = createKerb({ length: k.length });
    mesh.position.set(k.pos[0], 0, k.pos[1]);
    mesh.rotation.y = k.rotY ?? 0;
    root.add(mesh);
    physics.addStaticBox({
      pos: [k.pos[0], 0.07, k.pos[1]],
      size: [0.32, 0.14, k.length],
      rotY: k.rotY ?? 0,
      userData: { kind: 'kerb' },
    });
  }

  // --- cones: VISUAL ONLY. No physics body, by design. ----------------------
  // They are handed to Scoring, which detects overlaps itself and knocks them
  // flat — feedback and a penalty without giving them a collider.
  const coneMeshes = [];
  for (const c of level.cones ?? []) {
    const mesh = createCone();
    mesh.position.set(c.pos[0], 0, c.pos[1]);
    mesh.rotation.y = (c.pos[0] * 13 + c.pos[1] * 7) % 1.5; // scatter their yaw
    root.add(mesh);
    coneMeshes.push(mesh);
  }

  // --- floor arrows ---------------------------------------------------------
  for (const a of level.arrows ?? []) {
    const mesh = createFloorArrow();
    mesh.position.set(a.pos[0], 0, a.pos[1]);
    mesh.rotation.y = a.heading ?? 0;
    root.add(mesh);
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
    /** The garage's named ceiling group (GOAL Part C §3): the overhead review
     *  toggles its `visible` flag. `null` for `style: 'city'` (n/a — Level 13
     *  uses CityBuilder and the review does not run on it). */
    ceiling: garage.ceiling,
    /** Same obstacle list tools/level-lint.mjs checks against (PlanGeometry.js,
     *  GOAL Part C §7) — the review's clearance dimension lines use this. */
    footprints: levelFootprints(level, garage),

    update(elapsed) {
      target.update(elapsed);
    },

    dispose() {
      scene.remove(root);
      physics.clearStatics();
      scene.fog = null;
      // Only geometry/materials created per level are disposed. The shared
      // BoxGeometry and the cached Palette materials are reused by the next
      // level and must survive; they are identified by the absence of the
      // disposable flag.
      root.traverse((obj) => {
        if (!obj.isMesh) return;
        if (obj.geometry?.userData?.disposable) obj.geometry.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) if (m?.userData?.disposable) m.dispose();
      });
    },
  };
}
