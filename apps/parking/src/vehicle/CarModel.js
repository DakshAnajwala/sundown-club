/**
 * CarModel.js — the vehicle bodywork, lofted from the proportion tables in
 * bodies.js. Used for the player's car and for every parked car in every lot.
 *
 * THE STRUCTURE THAT MATTERS
 * The body is a TUB, not a solid. Each station's profile runs from the beltline
 * on one side, down the flank, under the floor, and back up to the beltline on
 * the other — an open section. Lofting those gives a hollow trough with nothing
 * across the top. The hood and boot lids then close the parts of that opening
 * which should be closed, and the gap between them (cowl to deck) is the cabin
 * aperture: genuinely open, with the interior shell sitting inside it.
 *
 * This is the fix for the defining bug of the first playable build. Previously
 * the body was 43 solid boxes and the "shoulder band" that formed the hood ran
 * the full length of the car, straight through the passenger compartment. From
 * the driver's seat the entire lower half of the screen was the top face of a
 * body-coloured slab, and the dashboard, the steering wheel and the driver's
 * own arms were all sealed inside it.
 *
 * MATERIALS
 * Bodywork is FrontSide. From outside you see the shell; from inside the cabin
 * its back faces cull away and vanish, so the bodywork never boxes the camera
 * in. The interior shell is what you actually see in there, and it is
 * DoubleSide with a small emissive term — the cabin is shadowed from every
 * light in the scene, and without that it renders as a black void (v3's bug).
 */
import * as THREE from 'three';
import { COLORS, matte, glow } from '../world/Palette.js';
import {
  fromGround,
  WHEEL_RADIUS,
  WHEEL_WIDTH,
  AXLE_Z,
  TRACK,
  CABIN_FLOOR_Y,
} from './Dimensions.js';
import { SEDAN } from './bodies.js';
import {
  station,
  stationFull,
  loftOpen,
  capProfile,
  mergeGeometries,
  quadGeometry,
  beamGeometry,
} from './BodyLoft.js';

// --- shared wheel geometry ----------------------------------------------------
const TYRE_GEO = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, WHEEL_WIDTH, 16);
TYRE_GEO.rotateZ(Math.PI / 2);
const DISH_GEO = new THREE.CylinderGeometry(WHEEL_RADIUS * 0.66, WHEEL_RADIUS * 0.66, WHEEL_WIDTH * 0.72, 12);
DISH_GEO.rotateZ(Math.PI / 2);
const HUB_GEO = new THREE.CylinderGeometry(WHEEL_RADIUS * 0.2, WHEEL_RADIUS * 0.2, WHEEL_WIDTH * 0.9, 8);
HUB_GEO.rotateZ(Math.PI / 2);
const SPOKE_GEO = new THREE.BoxGeometry(WHEEL_WIDTH * 0.5, WHEEL_RADIUS * 1.16, 0.05);
/** Style 1: five broad blades. Style 2: ten fine ones. */
const SPOKE_WIDE_GEO = new THREE.BoxGeometry(WHEEL_WIDTH * 0.5, WHEEL_RADIUS * 1.16, 0.105);
const SPOKE_FINE_GEO = new THREE.BoxGeometry(WHEEL_WIDTH * 0.46, WHEEL_RADIUS * 1.16, 0.028);
const BOX = new THREE.BoxGeometry(1, 1, 1);
/** How far inside the beltline a hood or boot lid sits. */
const LID_INSET = 0.006;

/** Shift a geometry authored in the ground frame into chassis-local space. */
function toLocal(geo) {
  geo.translate(0, fromGround(0), 0);
  return geo;
}

/**
 * One road wheel: tyre, dished alloy face, and one of three spoke patterns.
 * Built once per car; the geometries themselves are shared across all of them.
 *
 * `style` exists so a row of parked cars doesn't read as one car stamped out
 * twenty times. It changes only the spoke pattern — every style keeps the same
 * tyre, dish and hub, so the wheel's silhouette and size are identical and no
 * clearance anywhere depends on which one a car happens to get.
 */
export function createWheelMesh(style = 0) {
  const g = new THREE.Group();
  const tyre = new THREE.Mesh(TYRE_GEO, matte(COLORS.tyre));
  tyre.castShadow = true;
  g.add(tyre);

  const dish = new THREE.Mesh(DISH_GEO, matte(COLORS.rim));
  g.add(dish);
  const hub = new THREE.Mesh(HUB_GEO, matte(0x8d8a84));
  g.add(hub);

  const spokeMat = matte(COLORS.rim);
  // [geometry, arm count, offsets of the blades within one arm]
  const [geo, arms, offsets] =
    style === 1
      ? [SPOKE_WIDE_GEO, 5, [0]]
      : style === 2
        ? [SPOKE_FINE_GEO, 10, [0]]
        : // Twin spokes: two thin blades per arm reads as an alloy at low poly
          // counts, where a single fat spoke just reads as a cross.
          [SPOKE_GEO, 5, [-0.035, 0.035]];
  for (let i = 0; i < arms; i++) {
    for (const off of offsets) {
      const s = new THREE.Mesh(geo, spokeMat);
      s.rotation.x = (i / arms) * Math.PI * 2;
      s.translateX(off);
      g.add(s);
    }
  }
  return g;
}

/**
 * Vertical section at one station, from the beltline down the flank, under the
 * floor, to the centreline. Six points rather than five: the extra tuck below
 * the shoulder is what gives the flank some curvature instead of a flat slab
 * side, and it costs one quad per station pair.
 *
 * beltY comes from the station row when present, so the belt can fall away at
 * the nose and tail; the rest of the section follows it down.
 */
function profileHalf(spec, row) {
  const [, beltW, maxW, rockW, beltYRow] = row;
  const beltY = beltYRow ?? spec.yBelt;
  const drop = spec.yBelt - beltY; // how far this station sits below the datum
  return [
    [beltW, beltY],
    [maxW, spec.yShoulder - drop * 0.55],
    [maxW * 0.985, spec.yShoulder - 0.22 - drop * 0.3],
    [rockW, spec.yRocker],
    [rockW * 0.68, spec.yFloorEdge],
    [0, spec.yFloor],
  ];
}

/** Lid profile (hood / roof / boot): a gently crowned strip across the width. */
function lidHalf(y, halfWidth, crown = 0.012) {
  return [
    [halfWidth, y],
    [halfWidth * 0.62, y + crown * 0.75],
    [0, y + crown],
  ];
}

function lidStations(rows, crown) {
  return rows.map(([z, y, hw]) => station(z, lidHalf(y, hw, crown)));
}

/**
 * Detail tiers. A city level parks 137 cars; giving every one of them wipers
 * and shut lines it is too far away to resolve costs triangles and merged
 * draw calls for nothing. The tier is chosen once at build time (by distance
 * from the drivable route), never swapped per frame — the city bakes its cars
 * into merged geometry, so a runtime LOD swap would mean rebuilding the merge.
 *
 *   full  everything below
 *   mid   no wipers, shut lines, exhaust or plates
 *   low   no mirrors, handles, arch lips or bumper strips either
 *
 * Every tier keeps the tub, lids, glass, pillars, lamps, grille and arch wells,
 * so the silhouette and the lit parts — what actually reads at distance — are
 * identical in all three.
 */
const TIERS = {
  full: { wipers: true, shutLines: true, exhaust: true, plates: true, mirrors: true, handles: true, archLips: true, bumperStrips: true, roofRails: true, stopLamp: true },
  mid: { wipers: false, shutLines: false, exhaust: false, plates: false, mirrors: true, handles: true, archLips: true, bumperStrips: true, roofRails: true, stopLamp: true },
  low: { wipers: false, shutLines: false, exhaust: false, plates: false, mirrors: false, handles: false, archLips: false, bumperStrips: true, roofRails: true, stopLamp: false },
};

/**
 * Build the bodywork for one vehicle spec.
 * @returns {{ group: THREE.Group, spec: object }}
 */
function buildBody(spec, paint, { staticMirrorGlass = true, detail = 'full' } = {}) {
  const tier = TIERS[detail] ?? TIERS.full;
  const group = new THREE.Group();

  const body = matte(paint);
  const bodyDark = matte(new THREE.Color(paint).multiplyScalar(0.58).getHex());
  const trim = matte(COLORS.trim);
  const glassMat = matte(COLORS.glass, {
    transparent: true,
    opacity: 0.36,
    side: THREE.DoubleSide,
  });

  const beltAt = (z) => {
    // Interpolate the belt half-width along the plan table.
    const p = spec.plan;
    for (let i = 0; i < p.length - 1; i++) {
      if (z >= p[i][0] && z <= p[i + 1][0]) {
        const t = (z - p[i][0]) / (p[i + 1][0] - p[i][0]);
        return p[i][1] + (p[i + 1][1] - p[i][1]) * t;
      }
    }
    return p[p.length - 1][1];
  };

  /** The body's own extremes: nothing bolted on may sit outside these. */
  const noseZ = spec.plan[0][0];
  const tailZ = spec.plan[spec.plan.length - 1][0];

  // --- tub -------------------------------------------------------------------
  const tubStations = spec.plan.map((row) => station(row[0], profileHalf(spec, row)));
  const tub = new THREE.Mesh(toLocal(loftOpen(tubStations, (z) => [0, spec.yShoulder, z])), body);
  tub.castShadow = true;
  tub.receiveShadow = true;
  group.add(tub);

  // Nose and tail caps. Without these you can see straight into the hollow tub
  // from in front of the car.
  const nose = new THREE.Mesh(toLocal(capProfile(tubStations[0], [0, 0, -1])), body);
  const tail = new THREE.Mesh(
    toLocal(capProfile(tubStations[tubStations.length - 1], [0, 0, 1])),
    body
  );
  group.add(nose, tail);

  // --- lids -------------------------------------------------------------------
  // A lid may never be wider than the flank it sits on. The hand-authored
  // tables put the boot lid 2.0-4.7 cm PROUD of the beltline on every body
  // type, which from behind reads as a shelf sticking out of each rear
  // quarter. Clamping here rather than editing five tables means a future
  // station cannot reintroduce it.
  const fitLid = (rows) =>
    rows.map(([z, y, hw]) => [z, y, Math.min(hw, beltAt(z) - LID_INSET)]);

  const hood = new THREE.Mesh(
    toLocal(loftOpen(lidStations(fitLid(spec.hood), 0.014), (z) => [0, spec.yShoulder, z])),
    body
  );
  hood.castShadow = true;
  group.add(hood);

  const deck = new THREE.Mesh(
    toLocal(loftOpen(lidStations(fitLid(spec.deck), 0.01), (z) => [0, spec.yShoulder, z])),
    body
  );
  deck.castShadow = true;
  group.add(deck);

  // DoubleSide, unlike the rest of the shell. The driver's eye is at 1.16 m and
  // a roof sits at ~1.42, so every OTHER car in the lot is seen from below its
  // roofline — with a single-sided panel they all render as roofless convertibles.
  const roof = new THREE.Mesh(
    toLocal(loftOpen(lidStations(spec.roof, 0.018), (z) => [0, spec.yBelt, z])),
    matte(paint, { side: THREE.DoubleSide })
  );
  roof.castShadow = true;
  group.add(roof);

  // --- greenhouse --------------------------------------------------------------
  const roofFrontZ = spec.roof[0][0];
  const roofFrontY = spec.roof[0][1];
  const roofRearY = spec.roof[spec.roof.length - 1][1];
  const wScreenBase = beltAt(spec.cowlZ) - 0.05;
  const wScreenTop = spec.roof[0][2] - 0.005;
  const wBeltCabin = beltAt(0) - spec.glassBeltInset;
  const wRoofMid = spec.roof[1][2] - 0.005;
  const wRearTop = spec.roof[spec.roof.length - 1][2] - 0.005;
  const wRearBase = beltAt(spec.backlightBaseZ - 0.2) - 0.05;

  // Windscreen: one raked panel. The rake is what the cowl position buys us.
  group.add(
    new THREE.Mesh(
      toLocal(
        quadGeometry(
          [-wScreenBase, spec.yBelt, spec.cowlZ],
          [wScreenBase, spec.yBelt, spec.cowlZ],
          [wScreenTop, roofFrontY, roofFrontZ],
          [-wScreenTop, roofFrontY, roofFrontZ]
        )
      ),
      glassMat
    )
  );

  // Backlight.
  group.add(
    new THREE.Mesh(
      toLocal(
        quadGeometry(
          [-wRearTop, roofRearY, spec.roofRearZ],
          [wRearTop, roofRearY, spec.roofRearZ],
          [wRearBase, spec.backlightBaseY, spec.backlightBaseZ],
          [-wRearBase, spec.backlightBaseY, spec.backlightBaseZ]
        )
      ),
      glassMat
    )
  );

  // Side glass, front and rear panes, with tumblehome (leaning inboard toward
  // the roof). Split at the B-pillar so the two panes read as two doors.
  for (const sx of [-1, 1]) {
    const spans = [
      [roofFrontZ + 0.02, spec.bPillarZ - 0.04],
      [spec.bPillarZ + 0.04, spec.roofRearZ - 0.03],
    ];
    for (const [z0, z1] of spans) {
      group.add(
        new THREE.Mesh(
          toLocal(
            quadGeometry(
              [sx * wBeltCabin, spec.yBelt, z0],
              [sx * wBeltCabin, spec.yBelt, z1],
              [sx * wRoofMid, roofFrontY, z1],
              [sx * wRoofMid, roofFrontY, z0]
            )
          ),
          glassMat
        )
      );
    }
  }

  // Pillars. The B-pillar is deliberately dark rather than body colour, which
  // is what makes the side glass read as one continuous graphic.
  const pillarGeos = [];
  for (const sx of [-1, 1]) {
    pillarGeos.push(
      beamGeometry(
        [sx * (wScreenBase + 0.02), spec.yBelt, spec.cowlZ],
        [sx * (wScreenTop + 0.01), roofFrontY, roofFrontZ],
        0.062,
        0.066
      ),
      beamGeometry(
        [sx * (wRearBase + 0.02), spec.backlightBaseY, spec.backlightBaseZ],
        [sx * (wRearTop + 0.01), roofRearY, spec.roofRearZ],
        0.07,
        0.072
      ),
      // Cant rail along the top of the doors.
      beamGeometry(
        [sx * (wRoofMid + 0.005), roofFrontY, roofFrontZ],
        [sx * (wRearTop + 0.005), roofRearY, spec.roofRearZ],
        0.044,
        0.046
      )
    );
  }
  const pillars = new THREE.Mesh(toLocal(mergeGeometries(pillarGeos)), body);
  pillars.castShadow = true;
  group.add(pillars);

  const bGeos = [];
  for (const sx of [-1, 1]) {
    bGeos.push(
      beamGeometry(
        [sx * wBeltCabin, spec.yBelt, spec.bPillarZ],
        [sx * wRoofMid, roofFrontY, spec.bPillarZ],
        0.06,
        0.08
      )
    );
  }
  group.add(new THREE.Mesh(toLocal(mergeGeometries(bGeos)), matte(0x22252a)));

  // --- lamps, grille, bumpers ---------------------------------------------------
  const [lampIn, lampOut, lampY, lampH] = spec.headlamp;
  for (const sx of [-1, 1]) {
    const w = lampOut - lampIn;
    // Dark surround first, lens recessed into it: a bare bright box on the nose
    // reads as a sticker rather than a lamp.
    const housing = new THREE.Mesh(BOX, matte(0x1f2226));
    housing.scale.set(w + 0.04, lampH + 0.03, 0.05);
    housing.position.set(sx * (lampIn + w / 2), fromGround(lampY), spec.plan[0][0] + 0.005);
    group.add(housing);
    const m = new THREE.Mesh(BOX, glow(0xd9d6cb, 0.22));
    m.scale.set(w, lampH, 0.045);
    m.position.set(sx * (lampIn + w / 2), fromGround(lampY), spec.plan[0][0] - 0.004);
    group.add(m);
  }
  // Tail lamps get the same treatment as the headlamps above: a dark surround
  // with the lit lens recessed into it. A bare glowing box 4.5 cm proud of the
  // tail reads as a sticker, which is exactly how the old one looked.
  const [tIn, tOut, tY, tH] = spec.taillamp;
  for (const sx of [-1, 1]) {
    const w = tOut - tIn;
    const housing = new THREE.Mesh(BOX, matte(0x1f2226));
    housing.scale.set(w + 0.04, tH + 0.03, 0.05);
    housing.position.set(sx * (tIn + w / 2), fromGround(tY), tailZ - 0.005);
    group.add(housing);

    const lens = new THREE.Mesh(BOX, glow(COLORS.lampRed, 0.45));
    lens.scale.set(w, tH, 0.045);
    lens.position.set(sx * (tIn + w / 2), fromGround(tY), tailZ + 0.004);
    group.add(lens);
  }

  // Dark grille bar linking the headlamps — the strongest single front-end cue.
  const grille = new THREE.Mesh(BOX, matte(0x24272b));
  grille.scale.set(lampIn * 2 + 0.1, lampH * 0.8, 0.06);
  grille.position.set(0, fromGround(lampY), spec.plan[0][0] - 0.005);
  group.add(grille);

  const lowerIntake = new THREE.Mesh(BOX, matte(0x2a2d31));
  lowerIntake.scale.set(1.06, 0.13, 0.06);
  lowerIntake.position.set(0, fromGround(spec.yRocker + 0.16), spec.plan[0][0] - 0.02);
  group.add(lowerIntake);

  // Bumper rubbing strips. Width and depth both follow the bodywork: the fixed
  // 1.45 m strip used to stand ~5 cm proud of each rear quarter and 3.8 cm past
  // the tail, which is what made the back of the car read as a stack of slabs.
  if (tier.bumperStrips) {
    const STRIP_DEPTH = 0.1;
    for (const [z, outward] of [
      [noseZ, -1],
      [tailZ, 1],
    ]) {
      const b = new THREE.Mesh(BOX, bodyDark);
      b.scale.set(2 * (beltAt(z) - 0.012), 0.12, STRIP_DEPTH);
      // Sit the outer face flush with the body's own end, never past it.
      b.position.set(0, fromGround(spec.yRocker + 0.05), z - outward * (STRIP_DEPTH / 2));
      group.add(b);
    }
  }

  // Number plates.
  if (tier.plates) {
    for (const [z, s] of [
      [spec.plan[0][0] - 0.02, -1],
      [spec.plan[spec.plan.length - 1][0] + 0.02, 1],
    ]) {
      const pl = new THREE.Mesh(BOX, matte(0xe8e6df));
      pl.scale.set(0.46, 0.11, 0.02);
      pl.position.set(0, fromGround(spec.yRocker + 0.2), z);
      group.add(pl);
    }
  }

  // High-level stop lamp, on the trailing edge of the roof. Dimmer than the
  // main tail lamps so it reads as secondary rather than as a third brake
  // light competing with them.
  if (tier.stopLamp) {
    const roofTop = spec.roof[spec.roof.length - 1];
    const lamp = new THREE.Mesh(BOX, glow(COLORS.lampRed, 0.3));
    lamp.scale.set(0.3, 0.032, 0.04);
    lamp.position.set(0, fromGround(roofTop[1] - 0.045), spec.roofRearZ - 0.03);
    group.add(lamp);
  }

  // Exhaust tip, offset from the centreline like a real single-pipe car. It
  // emerges from a dark valance under the rear bumper: on its own, a lone
  // cylinder hanging below the bodywork read as a broken-off part, and its
  // rear face sat 4 cm PAST the tail with nothing behind it.
  if (tier.exhaust) {
    const PIPE_LEN = 0.09;
    const valance = new THREE.Mesh(BOX, matte(0x24272b));
    valance.scale.set(2 * (beltAt(tailZ) - 0.1), 0.1, 0.12);
    valance.position.set(0, fromGround(spec.yRocker - 0.055), tailZ - 0.075);
    group.add(valance);

    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, PIPE_LEN, 8), matte(0x3a3d41));
    pipe.geometry.userData.disposable = true;
    pipe.rotation.x = Math.PI / 2;
    // Tucked under the valance, tip stopping 2 cm short of the body's tail.
    pipe.position.set(-0.34, fromGround(spec.yRocker - 0.055), tailZ - 0.02 - PIPE_LEN / 2);
    group.add(pipe);
  }

  // Wipers, parked along the base of the screen.
  if (tier.wipers) {
    for (const sx of [-1, 1]) {
      const w = new THREE.Mesh(BOX, matte(0x24272b));
      w.scale.set(0.42, 0.014, 0.022);
      w.position.set(sx * 0.3, fromGround(spec.yBelt + 0.035), spec.cowlZ + 0.09);
      w.rotation.z = sx * 0.21;
      group.add(w);
    }
  }

  // Roof rails, on the body types that carry them. They are most of what
  // separates a van or a crossover from a tall hatchback at any distance.
  if (tier.roofRails && spec.roofRails) {
    const first = spec.roof[0];
    const last = spec.roof[spec.roof.length - 1];
    const len = spec.roofRearZ - first[0] - 0.12;
    for (const sx of [-1, 1]) {
      const rail = new THREE.Mesh(BOX, matte(0x54585d));
      rail.scale.set(0.05, 0.05, len);
      rail.position.set(
        sx * last[2] * 0.78,
        fromGround((first[1] + last[1]) / 2 + 0.045),
        first[0] + len / 2 + 0.06
      );
      rail.castShadow = true;
      group.add(rail);
    }
  }

  // --- wheel arches --------------------------------------------------------------
  // An arch lip plus a dark inner fender. Without the inner fender you can see
  // through the wheel opening into the hollow tub.
  const archMat = matte(0x2c2f33);
  for (const sz of [-AXLE_Z, AXLE_Z]) {
    for (const sx of [-1, 1]) {
      if (tier.archLips) {
        const lip = new THREE.Mesh(
          new THREE.TorusGeometry(spec.wheelArchRadius, 0.032, 6, 14, Math.PI),
          bodyDark
        );
        lip.geometry.userData.disposable = true;
        lip.rotation.y = Math.PI / 2;
        lip.position.set(sx * (beltAt(sz) - 0.012), fromGround(WHEEL_RADIUS), sz);
        group.add(lip);
      }

      const well = new THREE.Mesh(
        new THREE.CylinderGeometry(
          spec.wheelArchRadius * 0.94,
          spec.wheelArchRadius * 0.94,
          0.2,
          10,
          1,
          true,
          0,
          Math.PI
        ),
        archMat
      );
      well.geometry.userData.disposable = true;
      well.rotation.z = Math.PI / 2;
      well.position.set(sx * (beltAt(sz) - 0.12), fromGround(WHEEL_RADIUS), sz);
      group.add(well);
    }
  }

  // Door mirrors: stalk + body-colour housing, glass on the REAR face. The
  // first version put a tiny face on the outboard side (facing +/-X), so from
  // the driver's seat you only ever saw the arm. The player car's glass is a
  // live view added by Mirrors.js at exactly this housing's rear face, so the
  // static glass is only built for parked cars (the two would z-fight).
  // Keep in sync with Mirrors.doorMirror().
  for (const sx of tier.mirrors ? [-1, 1] : []) {
    const bw = beltAt(-0.5);
    const stalk = new THREE.Mesh(BOX, bodyDark);
    stalk.scale.set(0.09, 0.04, 0.07);
    stalk.position.set(sx * (bw + 0.035), fromGround(spec.yBelt + 0.05), -0.5);
    group.add(stalk);
    const housing = new THREE.Mesh(BOX, body);
    housing.scale.set(0.2, 0.11, 0.075);
    housing.position.set(sx * (bw + 0.13), fromGround(spec.yBelt + 0.1), -0.5);
    housing.castShadow = true;
    group.add(housing);
    if (staticMirrorGlass) {
      const face = new THREE.Mesh(BOX, matte(0x8d9ca6));
      face.scale.set(0.17, 0.09, 0.006);
      face.position.set(sx * (bw + 0.13), fromGround(spec.yBelt + 0.1), -0.461);
      group.add(face);
    }
  }

  // Door handles and shut lines: cheap, and they stop the flank reading as one
  // blank extrusion.
  for (const sx of [-1, 1]) {
    for (const z of tier.handles ? [-0.1, 0.78] : []) {
      const h = new THREE.Mesh(BOX, bodyDark);
      h.scale.set(0.03, 0.035, 0.14);
      h.position.set(sx * (beltAt(z) + 0.01), fromGround(spec.yBelt - 0.14), z);
      group.add(h);
    }
    for (const z of tier.shutLines ? [spec.cowlZ + 0.06, spec.bPillarZ, 1.18] : []) {
      const cut = new THREE.Mesh(BOX, bodyDark);
      cut.scale.set(0.012, spec.yBelt - spec.yRocker - 0.08, 0.022);
      cut.position.set(
        sx * (beltAt(z) + 0.004),
        fromGround((spec.yBelt + spec.yRocker) / 2 + 0.04),
        z
      );
      group.add(cut);
    }
  }

  // Pickup bed walls, when the spec has them.
  if (spec.bed) {
    for (const sx of [-1, 1]) {
      const w = new THREE.Mesh(BOX, body);
      w.scale.set(0.07, spec.bed.wallY - spec.deck[0][1], spec.bed.toZ - spec.bed.fromZ);
      w.position.set(
        sx * spec.bed.halfWidth,
        fromGround((spec.bed.wallY + spec.deck[0][1]) / 2),
        (spec.bed.fromZ + spec.bed.toZ) / 2
      );
      group.add(w);

      // Cap rail along the top of each bed wall: a pickup's bed edge catches
      // the light as a hard line, and without it the bed reads as a slot.
      if (tier.roofRails) {
        const cap = new THREE.Mesh(BOX, matte(0x54585d));
        cap.scale.set(0.09, 0.03, spec.bed.toZ - spec.bed.fromZ);
        cap.position.set(
          sx * spec.bed.halfWidth,
          fromGround(spec.bed.wallY + 0.02),
          (spec.bed.fromZ + spec.bed.toZ) / 2
        );
        group.add(cap);
      }
    }
  }

  return { group, beltAt };
}

/**
 * Deterministic cosmetic variation for the Nth parked car in a level.
 *
 * Deliberately not random: tools/level-lint.mjs, drive-test.mjs and every
 * screenshot probe need the same scene on every run, and a level that differs
 * between runs cannot be linted. Mixing three odd multipliers is enough to
 * stop the three fields marching in step with each other down a bay row.
 */
export function parkedCarVariation(index, detail = 'full') {
  const i = Math.abs(Math.round(index));
  return {
    detail,
    wheelStyle: i % 3,
    // +/-15 mm, five steps. Below about 10 mm it reads as nothing; above about
    // 20 mm the car looks broken rather than differently sprung.
    rideHeight: ((((i * 7) % 5) - 2) / 2) * 0.015,
    // Roughly one car in four sits with its front wheels turned.
    steerRad: (i * 5) % 4 === 0 ? (((i * 11) % 2 ? 1 : -1) * 6 * Math.PI) / 180 : 0,
  };
}

/** Cabin interior — only the player's car needs one. */
function buildInterior(group, spec, beltAt) {
  // DoubleSide throughout (the camera is inside a non-convex volume) and a
  // small emissive term (the cabin is shadowed from every light in the scene,
  // and renders as a black void without it).
  // The cabin receives essentially no light: it is shadowed by its own roof
  // from the sun, and the hemisphere term barely reaches inside. The emissive
  // floor is what keeps it a readable dark grey instead of a black hole. 0x15
  // was too timid once the cabin was genuinely hollow.
  const cabin = (color) =>
    matte(color, { side: THREE.DoubleSide, emissive: 0x2e3236, emissiveIntensity: 1 });
  const trimMat = cabin(COLORS.trim);
  const seatMat = cabin(COLORS.seat);
  const darkMat = cabin(COLORS.dash);

  const add = (size, pos, mat, rot = {}) => {
    const m = new THREE.Mesh(BOX, mat);
    m.scale.set(size[0], size[1], size[2]);
    m.position.set(pos[0], fromGround(pos[1]), pos[2]);
    if (rot.x) m.rotation.x = rot.x;
    group.add(m);
    return m;
  };

  const innerW = beltAt(0) - 0.07;
  const F = CABIN_FLOOR_Y;

  add([innerW * 2, 0.04, spec.roofRearZ - spec.cowlZ], [0, F, (spec.cowlZ + spec.roofRearZ) / 2], darkMat);
  // Headliner, just under the roof.
  add(
    [spec.roof[1][2] * 1.9, 0.03, spec.roofRearZ - spec.roof[0][0]],
    [0, spec.roof[1][1] - 0.03, (spec.roof[0][0] + spec.roofRearZ) / 2],
    trimMat
  );
  // Rear bulkhead and parcel shelf.
  add([innerW * 2, spec.yBelt - F, 0.05], [0, (F + spec.yBelt) / 2, spec.deckZ ?? 1.2], trimMat);
  add([innerW * 1.8, 0.04, 0.4], [0, spec.yBelt + 0.02, spec.roofRearZ - 0.1], trimMat);

  // Door cards, inboard of the shell so the doors read as having thickness.
  for (const sx of [-1, 1]) {
    add(
      [0.05, spec.yBelt - F, spec.roofRearZ - spec.cowlZ - 0.1],
      [sx * innerW, (F + spec.yBelt) / 2, (spec.cowlZ + spec.roofRearZ) / 2],
      trimMat
    );
    add([0.09, 0.05, 0.36], [sx * (innerW - 0.03), spec.yBelt - 0.12, -0.05], darkMat);
  }

  // Seats.
  for (const sx of [-1, 1]) {
    add([0.5, 0.12, 0.52], [sx * 0.36, F + 0.13, 0.42], seatMat);
    add([0.5, 0.58, 0.14], [sx * 0.36, F + 0.45, 0.7], seatMat, { x: -0.12 });
    add([0.24, 0.14, 0.1], [sx * 0.36, F + 0.78, 0.75], seatMat);
  }
  add([innerW * 1.7, 0.12, 0.5], [0, F + 0.13, 0.98], seatMat);
  add([innerW * 1.7, 0.44, 0.12], [0, F + 0.39, 1.13], seatMat, { x: -0.1 });

  // Centre console. Its top face is where the gear lever pivots.
  add([0.3, 0.26, 1.0], [0, F + 0.11, 0.25], darkMat);
  add([0.34, 0.03, 1.0], [0, F + 0.245, 0.25], trimMat);

  // Sun visors are deliberately absent: they sit ~0.3 m from the eye, where a
  // 0.28 m slab fills a quarter of the screen, and they do nothing for the
  // game. The rear-view mirror is built by Mirrors.js, which owns its glass.
}

/**
 * The car shell.
 * @param {number}  paint     hex body colour
 * @param {boolean} interior  build the cabin the player sits in
 * @param {object}  spec      a table from bodies.js
 */
export function createSedanShell({ paint = COLORS.carPaints[0], interior = false, spec = SEDAN, detail = 'full' } = {}) {
  const group = new THREE.Group();
  group.name = `body:${spec.name}`;
  // The player's car (interior) gets live mirror glass from Mirrors.js instead.
  const { group: body, beltAt } = buildBody(spec, paint, { staticMirrorGlass: !interior, detail });
  group.add(body);
  if (interior) buildInterior(group, spec, beltAt);
  return { group, beltAt, spec };
}

/**
 * A complete static parked car, wheels included.
 *
 * `variation` is what stops a bay row reading as one car stamped out twenty
 * times. Every field is supplied by the caller from a deterministic index —
 * never from Math.random(), because level-lint and drive-test both need the
 * same scene every run.
 *
 * @param {object} variation
 * @param {'full'|'mid'|'low'} variation.detail      see TIERS
 * @param {number}             variation.wheelStyle  0-2, spoke pattern
 * @param {number}             variation.rideHeight  metres, body only (the
 *   wheels stay on the road); keep it small — the collision box does not move,
 *   so this is cosmetic and must not look like the car is floating
 * @param {number}             variation.steerRad    front wheels turned in the bay
 */
export function createParkedCar(paint, spec = SEDAN, { detail = 'full', wheelStyle = 0, rideHeight = 0, steerRad = 0 } = {}) {
  const g = new THREE.Group();
  const { group: shell } = createSedanShell({ paint, interior: false, spec, detail });
  shell.position.y = rideHeight;
  g.add(shell);
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    const w = createWheelMesh(wheelStyle);
    w.position.set((sx * TRACK) / 2, fromGround(WHEEL_RADIUS), sz * AXLE_Z);
    if (sz < 0) w.rotation.y = steerRad;
    g.add(w);
  }
  return g;
}
