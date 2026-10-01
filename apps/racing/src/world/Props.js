/**
 * Props.js — everything that populates a lot: pillars, cones, painted floor
 * markings, kerbs, and the glowing target bay.
 *
 * Physics lives in LevelBuilder; this file is purely visual. That split is
 * what makes the cone rule trivially safe: a cone is built here and never
 * handed to LevelBuilder's collider list, so the car phases through it by
 * construction rather than by a runtime filter someone can forget.
 */
import * as THREE from 'three';
import { COLORS, matte, flat, glow } from './Palette.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CONE_GEO = new THREE.ConeGeometry(0.17, 0.52, 8);
const CONE_RING_GEO = new THREE.CylinderGeometry(0.125, 0.14, 0.07, 8);
const CONE_BASE_GEO = new THREE.BoxGeometry(0.36, 0.045, 0.36);

/**
 * A flat painted patch lying on the floor.
 * polygonOffset rather than a big y-lift: markings need to sit visually ON the
 * concrete, and lifting them 2 cm makes them float when seen at the shallow
 * angle a driver actually looks at the ground from.
 */
export function paintQuad(width, depth, color, { y = 0.012, opacity = 1 } = {}) {
  const mat = flat(color, {
    transparent: opacity < 1,
    opacity,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    depthWrite: false,
  });
  const geo = new THREE.PlaneGeometry(width, depth);
  geo.userData.disposable = true; // per-level geometry; see LevelBuilder.dispose
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  return m;
}

/** Concrete column with a darker skirt, the classic car-park pillar. */
export function createPillar({ width = 0.62, depth = 0.62, height = 3.0 } = {}) {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(BOX, matte(COLORS.concreteColumn));
  shaft.scale.set(width, height, depth);
  shaft.position.y = height / 2;
  shaft.castShadow = true;
  shaft.receiveShadow = true;
  g.add(shaft);

  // Scuffed skirt — every real pillar in every real car park has one.
  const skirt = new THREE.Mesh(BOX, matte(COLORS.hazard));
  skirt.scale.set(width + 0.03, 0.55, depth + 0.03);
  skirt.position.y = 0.42;
  g.add(skirt);

  const cap = new THREE.Mesh(BOX, matte(COLORS.concreteColumnDark));
  cap.scale.set(width + 0.12, 0.12, depth + 0.12);
  cap.position.y = height - 0.06;
  g.add(cap);
  return g;
}

/**
 * Traffic cone. Visual only — deliberately given no physics body anywhere in
 * the codebase, per spec: the car drives straight through cones.
 */
export function createCone() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(CONE_GEO, matte(COLORS.coneBody));
  body.position.y = 0.29;
  body.castShadow = true;
  g.add(body);

  const ring = new THREE.Mesh(CONE_RING_GEO, matte(COLORS.coneStripe));
  ring.position.y = 0.25;
  g.add(ring);

  const base = new THREE.Mesh(CONE_BASE_GEO, matte(COLORS.coneBody));
  base.position.y = 0.022;
  g.add(base);
  g.userData.isCone = true;
  return g;
}

/**
 * Painted markings for one bay.
 * @param {'bay'|'parallel'|'box'} style  'bay' draws a U (two flanks + a head
 *                                  line), 'parallel' and 'box' draw a full
 *                                  rectangle outline (a kerbside space, or a
 *                                  turning box in the middle of a lane).
 */
export function createBayMarkings({ width, length, style = 'bay', color = COLORS.paintLine }) {
  const g = new THREE.Group();
  const t = 0.11; // line thickness

  const line = (w, d, x, z) => {
    const q = paintQuad(w, d, color, { y: 0.012, opacity: 0.9 });
    q.position.x = x;
    q.position.z = z;
    g.add(q);
  };

  line(t, length, -width / 2, 0);
  line(t, length, width / 2, 0);
  if (style === 'parallel' || style === 'box') {
    line(width, t, 0, -length / 2);
    line(width, t, 0, length / 2);
  } else {
    // Head of the bay only — the mouth stays open so it reads as "drive in
    // from here".
    line(width, t, 0, -length / 2);
  }
  return g;
}

/**
 * The glowing target bay. Returns an update(elapsed) so the pulse is driven by
 * the game clock rather than by each material animating itself.
 */
export function createTargetBay({ width, length, style = 'bay' }) {
  const g = new THREE.Group();

  const fill = paintQuad(width - 0.08, length - 0.08, COLORS.targetGlow, {
    y: 0.014,
    opacity: 0.3,
  });
  // This bay animates its own material (pulse + setSatisfied), so it must own
  // it. Palette's materials are shared by key: mutating one here would leave
  // the NEXT level's target bay stuck on whatever colour this one ended on.
  fill.material = fill.material.clone();
  fill.material.userData = { disposable: true };
  g.add(fill);

  g.add(createBayMarkings({ width, length, style, color: COLORS.targetGlow }));

  // Corner posts of light. Four short vertical bars are much easier to pick
  // out from a driver's eye height than a floor decal, which foreshortens to
  // nothing at 30 m.
  const posts = [];
  const postMat = flat(COLORS.targetGlow, { transparent: true, opacity: 0.55 }).clone();
  postMat.userData = { disposable: true };
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const p = new THREE.Mesh(BOX, postMat);
      p.scale.set(0.07, 1.1, 0.07);
      p.position.set((sx * width) / 2, 0.55, (sz * length) / 2);
      g.add(p);
      posts.push(p);
    }
  }

  // A very soft column of light over the bay: the "you are looking for this
  // one" beacon, visible over the roofs of the parked cars between you and it.
  // Height is kept under the lowest ceiling in the game (2.75 m underground)
  // so the beacon never pokes through the deck above.
  const shaftGeo = new THREE.CylinderGeometry(width * 0.36, width * 0.46, 2.3, 12, 1, true);
  shaftGeo.userData.disposable = true;
  const shaft = new THREE.Mesh(
    shaftGeo,
    new THREE.MeshBasicMaterial({
      color: COLORS.targetGlow,
      transparent: true,
      opacity: 0.055,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  shaft.material.userData = { disposable: true };
  shaft.position.y = 1.2;
  g.add(shaft);

  // Perfect-park pulse (retention pass, design/SPEC-retention.md §9): ONE
  // smooth rise and fall over `ms`, never a flash. Strength scales with the
  // result, so a Platinum park glows harder than a three-star one.
  let flare = null; // { start, ms, strength } in game-clock seconds

  return {
    group: g,
    update(elapsed) {
      const pulse = 0.5 + 0.5 * Math.sin(elapsed * 2.1);
      let boost = 0;
      if (flare) {
        if (flare.start == null) flare.start = elapsed;
        const t = (elapsed - flare.start) / (flare.ms / 1000);
        if (t >= 1) flare = null;
        else boost = flare.strength * Math.sin(Math.PI * Math.max(0, t));
      }
      fill.material.opacity = 0.2 + pulse * 0.18 + boost * 0.5;
      postMat.opacity = Math.min(1, 0.4 + pulse * 0.3 + boost * 0.45);
      shaft.material.opacity = 0.035 + pulse * 0.045;
    },
    /** One pulse of `strength` (0..1) over `ms`, starting on the next update. */
    pulse(strength, ms) {
      flare = { start: null, ms, strength };
    },
    /** Turns the beacon green->calm once the car is correctly placed. */
    setSatisfied(on) {
      const c = on ? 0xffffff : COLORS.targetGlow;
      fill.material.color.setHex(c);
      postMat.color.setHex(c);
    },
    /** Hides just the light-shaft cylinder (GOAL Part C §3: from above it's a
     *  translucent disc over the car). The bay markings/posts stay visible. */
    setBeaconVisible(on) {
      shaft.visible = on;
    },
  };
}

/** A raised kerb — used to define the kerbside for parallel parking. */
export function createKerb({ length, height = 0.14, width = 0.32 }) {
  const g = new THREE.Group();
  const top = new THREE.Mesh(BOX, matte(COLORS.kerb));
  top.scale.set(width, height, length);
  top.position.y = height / 2;
  top.receiveShadow = true;
  top.castShadow = true;
  g.add(top);
  return g;
}

/** Directional floor arrow, drawn from flat quads (no textures anywhere). */
export function createFloorArrow({ color = COLORS.paintArrow } = {}) {
  const g = new THREE.Group();
  const stem = paintQuad(0.16, 1.1, color, { opacity: 0.75 });
  g.add(stem);
  // Head: two angled bars forming a chevron.
  for (const s of [-1, 1]) {
    const bar = paintQuad(0.16, 0.5, color, { opacity: 0.75 });
    bar.position.set(s * 0.16, 0, -0.62);
    bar.rotation.z = s * 0.72;
    g.add(bar);
  }
  return g;
}

/** Ceiling-mounted fluorescent tube fixture (underground decks). */
export function createTubeFixture({ length = 2.2 } = {}) {
  const g = new THREE.Group();
  const housing = new THREE.Mesh(BOX, matte(COLORS.concreteWallDark));
  housing.scale.set(0.18, 0.09, length);
  g.add(housing);
  const tube = new THREE.Mesh(BOX, flat(COLORS.fluorescent));
  tube.scale.set(0.13, 0.03, length - 0.12);
  tube.position.y = -0.055;
  g.add(tube);
  g.userData.tube = tube;
  return g;
}
