/**
 * Garage.js — the concrete shell a level sits inside.
 *
 * Two moods from one builder:
 *   'open'        an above-ground deck. Waist-high parapets leave the sides
 *                 open from 1.05 m to the underside of the deck above, so the
 *                 low sun rakes in through that slot and the pilasters chop it
 *                 into stripes across the floor. Those stripes are real
 *                 shadow-mapped geometry, not a faked light-shaft effect.
 *   'underground' walls floor-to-ceiling, no daylight, lower slab, fluorescent
 *                 tubes overhead and a much tighter fog.
 *   'rooftop'     the top deck at dusk: no slab overhead at all, parapets,
 *                 and lamp posts along them instead of pilasters. The sky is
 *                 the ceiling, so there is nothing to shade the low sun.
 *
 * Returns visual geometry AND the list of colliders the shell needs, so the
 * level builder can register them without knowing how the shell was drawn.
 * Every collider is an axis-aligned box description: { pos, size, kind }.
 *
 * Columns are pilasters — half-buried in the perimeter walls, protruding only
 * ~0.25 m into the lot. That is deliberate: free-standing columns on a grid
 * look great and then silently land in the middle of somebody's parking bay,
 * which is how a level becomes uncompletable. Interior pillars are placed
 * explicitly by each level instead, where their clearance can be reasoned about.
 */
import * as THREE from 'three';
import { COLORS, matte, flat, glow } from './Palette.js';
import { createTubeFixture, paintQuad } from './Props.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);

function slab(group, size, pos, material, { cast = false, receive = true } = {}) {
  const m = new THREE.Mesh(BOX, material);
  m.scale.set(size[0], size[1], size[2]);
  m.position.set(pos[0], pos[1], pos[2]);
  m.castShadow = cast;
  m.receiveShadow = receive;
  group.add(m);
  return m;
}

export function createGarage({ style, width, depth, ceilingHeight }) {
  const group = new THREE.Group();
  group.name = `garage:${style}`;
  const colliders = [];
  const underground = style === 'underground';
  const rooftop = style === 'rooftop';
  // Named child group for everything that reads as "the ceiling" (GOAL Part
  // C, overhead review §3): the deck slab, its downstand beams, underground
  // tube fixtures, the low-ceiling warning stripe, and open-deck soffit
  // panels. The review toggles this one group's `visible` flag rather than
  // hunting for each mesh. Rooftop levels have no ceiling, so it stays empty.
  const ceiling = new THREE.Group();
  ceiling.name = 'ceiling';
  group.add(ceiling);

  const wallColor = underground ? COLORS.concreteWallDark : COLORS.concreteWall;
  const floorColor = underground ? COLORS.concreteFloorDark : COLORS.concreteFloor;
  const ceilColor = underground ? COLORS.ceilingDark : COLORS.ceiling;
  const colColor = underground ? COLORS.concreteColumnDark : COLORS.concreteColumn;

  const halfW = width / 2;
  const halfD = depth / 2;
  // 0.6 m, not Parking Precision's 0.5: at 250 km/h a 120 Hz step moves
  // 0.58 m, so every collider in the racing game is at least 0.6 m thick.
  const WALL_T = 0.6;

  // --- floor ---------------------------------------------------------------
  // The visual slab only. The physics floor is added separately by the level
  // builder (see PhysicsWorld.addGround) because it must be a finite Box.
  slab(group, [width, 0.4, depth], [0, -0.2, 0], matte(floorColor));

  // Expansion joints: thin darker lines on a 6 m grid. Free visual interest,
  // and they give the eye something to judge distance against when reversing.
  for (let x = -halfW + 6; x < halfW; x += 6) {
    const j = paintQuad(0.05, depth, COLORS.concreteFloorDark, { y: 0.008, opacity: 0.35 });
    j.position.x = x;
    group.add(j);
  }
  for (let z = -halfD + 6; z < halfD; z += 6) {
    const j = paintQuad(width, 0.05, COLORS.concreteFloorDark, { y: 0.008, opacity: 0.35 });
    j.position.z = z;
    group.add(j);
  }

  // --- ceiling / deck above -------------------------------------------------
  const ceilY = ceilingHeight;
  if (!rooftop) {
    slab(ceiling, [width, 0.34, depth], [0, ceilY + 0.17, 0], matte(ceilColor), { cast: true });

    // Downstand beams across the short axis every 6 m — the underside of a real
    // deck is ribbed, and the ribs read strongly under the AO pass.
    for (let z = -halfD + 6; z < halfD; z += 6) {
      slab(ceiling, [width, 0.34, 0.46], [0, ceilY - 0.17, z], matte(ceilColor), { cast: true });
    }
  }

  // --- perimeter ------------------------------------------------------------
  const parapetH = underground ? ceilingHeight : 1.05;
  const wallSpecs = [
    { pos: [0, parapetH / 2, -halfD - WALL_T / 2], size: [width + WALL_T * 2, parapetH, WALL_T] },
    { pos: [0, parapetH / 2, halfD + WALL_T / 2], size: [width + WALL_T * 2, parapetH, WALL_T] },
    { pos: [-halfW - WALL_T / 2, parapetH / 2, 0], size: [WALL_T, parapetH, depth] },
    { pos: [halfW + WALL_T / 2, parapetH / 2, 0], size: [WALL_T, parapetH, depth] },
  ];
  for (const w of wallSpecs) {
    slab(group, w.size, w.pos, matte(wallColor), { cast: true });
    colliders.push({ pos: w.pos, size: w.size, kind: 'wall' });
  }

  if (!underground) {
    // Capping rail along the top of each parapet — a light-coloured line that
    // separates the concrete from the sky and stops the parapet reading as an
    // unfinished cut.
    // Where the rails cross at the corners, equal rails put their tops,
    // bottoms and ends flush (z-fighting): the side rails are 8 mm shallower
    // and the end rails run 5 mm further out.
    wallSpecs.forEach((w, i) => {
      slab(
        group,
        [w.size[0] + (i < 2 ? 0.13 : 0.12), i < 2 ? 0.12 : 0.112, w.size[2] + 0.12],
        [w.pos[0], parapetH + 0.06, w.pos[2]],
        matte(COLORS.concreteColumnDark)
      );
    });
  }

  // --- pilasters ------------------------------------------------------------
  // Full-height columns embedded in the perimeter. On open decks these are
  // what slice the incoming sunlight into bands.
  const pilaster = (x, z, w, d) => {
    slab(group, [w, ceilingHeight, d], [x, ceilingHeight / 2, z], matte(colColor), { cast: true });
    colliders.push({ pos: [x, ceilingHeight / 2, z], size: [w, ceilingHeight, d], kind: 'pillar' });
  };
  const SPACING = 7.5;
  if (rooftop) {
    // Lamp posts standing on the parapet line instead of pilasters: same
    // spacing, but a 0.22 m post protrudes 0.11 m where a pilaster protruded
    // 0.55, so rooftop bays can sit tighter to the edge.
    const post = (x, z) => {
      const g = createLampPost();
      g.position.set(x, 0, z);
      group.add(g);
      // 0.6 m collider round a 0.22 m post (racing tunnelling rule).
      colliders.push({ pos: [x, 1.6, z], size: [0.6, 3.2, 0.6], kind: 'pillar' });
    };
    for (let z = -halfD + SPACING / 2; z < halfD; z += SPACING) {
      post(-halfW, z);
      post(halfW, z);
    }
    for (let x = -halfW + SPACING; x < halfW - SPACING / 2; x += SPACING) {
      post(x, -halfD);
      post(x, halfD);
    }
  } else {
    for (let z = -halfD + SPACING / 2; z < halfD; z += SPACING) {
      pilaster(-halfW + 0.18, z, 0.75, 0.62);
      pilaster(halfW - 0.18, z, 0.75, 0.62);
    }
    for (let x = -halfW + SPACING; x < halfW - SPACING / 2; x += SPACING) {
      pilaster(x, -halfD + 0.18, 0.62, 0.75);
      pilaster(x, halfD - 0.18, 0.62, 0.75);
    }
  }

  // --- style-specific dressing ---------------------------------------------
  if (underground) {
    // Tube fixtures on the same 3x3 grid the point lights use (Renderer.js),
    // so the visible fittings line up with where the light actually comes from.
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const x = -halfW + (width * (c + 0.5)) / 3;
        const z = -halfD + (depth * (r + 0.5)) / 3;
        const fx = createTubeFixture({ length: 2.6 });
        fx.position.set(x, ceilingHeight - 0.22, z);
        ceiling.add(fx);
      }
    }
    // Hazard band around the base of the walls — pure car-park vernacular, and
    // it keeps the dark walls from merging into the dark floor.
    for (const w of wallSpecs) {
      slab(
        group,
        [w.size[0] * 0.999, 0.22, w.size[2] * 0.999],
        [w.pos[0], 0.42, w.pos[2]],
        matte(COLORS.hazard),
        { cast: false }
      );
    }
    // Low ceiling warning stripes at the entrance end.
    const warn = new THREE.Mesh(BOX, flat(COLORS.hazard));
    warn.scale.set(width * 0.6, 0.16, 0.08);
    warn.position.set(0, ceilingHeight - 0.5, -halfD + 0.55);
    ceiling.add(warn);
  } else if (!rooftop) {
    // Open deck: a run of light-coloured soffit panels just inside the parapet
    // catches the low sun and glows, which is what sells "outside light is
    // getting in here" from the driver's seat.
    for (const sx of [-1, 1]) {
      slab(
        ceiling,
        [1.6, 0.06, depth * 0.96],
        [sx * (halfW - 0.9), ceilingHeight - 0.06, 0],
        matte(0xf0ece2),
        { receive: false }
      );
    }
  }

  return { group, colliders, ceiling };
}

/** Rooftop lamp post: a slim column with a glowing head, no real light. */
function createLampPost() {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(BOX, matte(COLORS.concreteColumnDark));
  // 0.13, not 0.12: the pole stands on the parapet line and passes through
  // the 0.62 m cap rail, whose face sits 0.06 m off that line.
  pole.scale.set(0.13, 3.2, 0.13);
  pole.position.y = 1.6;
  pole.castShadow = true;
  g.add(pole);
  const base = new THREE.Mesh(BOX, matte(COLORS.concreteColumnDark));
  base.scale.set(0.22, 0.5, 0.22);
  base.position.y = 0.25;
  g.add(base);
  // Emissive only. Real point lights cost a per-fragment loop iteration each;
  // at dusk the sun still does the lighting and the heads just need to glow.
  const head = new THREE.Mesh(BOX, glow(COLORS.lampWarm, 1.4));
  head.scale.set(0.34, 0.1, 0.2);
  head.position.y = 3.2;
  g.add(head);
  return g;
}
