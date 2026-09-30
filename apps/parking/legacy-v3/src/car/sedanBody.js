import * as THREE from 'three';

// Procedural low-poly 4-door sedan exterior, built from primitives. Original
// geometry with generic sedan proportions — not a model of any specific
// production car, and no external/licensed asset (see NOTES.md for why this
// is procedural rather than an imported GLTF).
//
// Layout uses the chassis-local frame: origin at the physics box centre,
// which spans x ±0.85, y ±0.7, z ±2.1 (CHASSIS_SIZE in vehicle.js).
//
// Key reference heights, all local:
//   -0.62  underbody / rocker bottom
//   -0.50  wheel tops (wheel centre sits ~0.85 below chassis centre, r=0.35)
//   -0.12  hood top (front deck, stepped below the belt line)
//   -0.02  belt line / window sill
//    0.32  driver's eye (camera/firstPerson.js EYE_OFFSET) — inside the
//          window band, which is what makes Q/E peeking and the C lean-out
//          actually see something
//    0.50  roof underside
//    0.57  roof top
//
// The greenhouse is built as PILLARS + ROOF rather than a solid block, so
// the window apertures are genuinely open. That replaced the earlier solid
// greenhouse box and retired v1's "camera inside a sealed box, inner faces
// backface-culled" trick — with real openings the cabin needs real interior
// surfaces instead, which car/cockpit.js supplies.
export function createSedanBody({
  size,
  bodyColor = 0xd65f4e,
  trimColor = 0x2b3138,
  sillColor = 0x3a3a3c,
} = {}) {
  const group = new THREE.Group();

  // DoubleSide on the painted shell: with open windows the camera sits in a
  // cabin that is no longer a sealed convex box, so single-sided panels
  // would vanish when viewed from inside and you would see straight out
  // through the doors. Interior trim in cockpit.js layers over this.
  const paint = new THREE.MeshStandardMaterial({ color: bodyColor, side: THREE.DoubleSide });
  const trim = new THREE.MeshStandardMaterial({ color: trimColor, side: THREE.DoubleSide });
  const sill = new THREE.MeshStandardMaterial({ color: sillColor, side: THREE.DoubleSide });
  const lampWhite = new THREE.MeshStandardMaterial({ color: 0xf2f2ea });
  const lampRed = new THREE.MeshStandardMaterial({ color: 0xd6453a });

  // box(w, h, d) positioned by centre.
  const box = (w, h, d, x, y, z, mat) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    group.add(m);
    return m;
  };
  // Helper: build from an explicit min/max span, which reads far closer to
  // the reference heights above than centre+size arithmetic does.
  const span = (x0, x1, y0, y1, z0, z1, mat) =>
    box(x1 - x0, y1 - y0, z1 - z0, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, mat);

  const HALF_W = 0.83;

  // --- body tub, three stepped sections front to back ---------------------
  // Front deck sits lower than the cabin belt line, which is what reads as
  // "hood" without needing a separate panel.
  span(-HALF_W, HALF_W, -0.5, -0.12, 1.0, 2.05, paint); // front / hood
  // Cabin runs back to -1.4 (not -1.15): a shorter cabin over a ~0.95m flat
  // rear deck read as a pickup bed rather than a saloon boot.
  span(-HALF_W, HALF_W, -0.5, -0.02, -1.4, 1.0, paint); // cabin sides / doors
  span(-HALF_W, HALF_W, -0.5, -0.06, -2.05, -1.4, paint); // rear quarters / boot

  // Rocker panel between the wheels, tucked in and darker so the car reads
  // as sitting on its wheels rather than as one slab.
  span(-0.72, 0.72, -0.62, -0.5, -1.05, 1.05, sill);

  // Bumpers, slight overhang past the body at each end.
  span(-0.85, 0.85, -0.45, -0.18, 2.05, 2.14, sill);
  span(-0.85, 0.85, -0.45, -0.18, -2.14, -2.05, sill);

  // --- greenhouse: pillars + roof, windows left open ----------------------
  const PILLAR = 0.09;
  const pillarPairs = [
    { z: 1.0, x: 0.72 }, // A-pillar (windscreen)
    { z: -0.05, x: 0.76 }, // B-pillar (between doors)
    { z: -1.35, x: 0.72 }, // C-pillar (rear screen)
  ];
  // Roof line raised to 0.58: at 0.50 the headliner sat only 0.18 above the
  // driver's eye and cropped the top ~20% of the forward view, which reads
  // as claustrophobic and hides the lot. 0.58 keeps the roof visible as a
  // header rail without eating the windscreen.
  for (const p of pillarPairs) {
    for (const sx of [-1, 1]) {
      span(sx * p.x - PILLAR / 2, sx * p.x + PILLAR / 2, -0.02, 0.58, p.z - PILLAR / 2, p.z + PILLAR / 2, trim);
    }
  }

  // Roof panel spanning the pillars.
  span(-0.74, 0.74, 0.58, 0.65, -1.4, 1.05, paint);

  // Cant rails: the thin beams along the top of each door opening, joining
  // the pillar tops. Without them the roof looks like it floats.
  for (const sx of [-1, 1]) {
    span(sx * 0.72 - PILLAR / 2, sx * 0.72 + PILLAR / 2, 0.52, 0.58, -1.35, 1.0, trim);
  }

  // --- glazing -------------------------------------------------------------
  // Transparent rather than open apertures. Fully open holes read as an
  // open-top buggy from outside; tinted glass reads as a saloon while still
  // leaving the driver ~80% transmission to see out, so Q/E peeking and the
  // C lean-out still work. Inset slightly from the pillar faces to avoid
  // z-fighting with them.
  const glass = new THREE.MeshStandardMaterial({
    color: 0x7d929f,
    transparent: true,
    opacity: 0.22,
    roughness: 0.1,
    side: THREE.DoubleSide,
  });
  const GLASS_T = 0.02;
  span(-0.67, 0.67, -0.02, 0.56, 1.0 - GLASS_T / 2, 1.0 + GLASS_T / 2, glass); // windscreen
  span(-0.67, 0.67, -0.02, 0.56, -1.35 - GLASS_T / 2, -1.35 + GLASS_T / 2, glass); // rear screen
  for (const sx of [-1, 1]) {
    const x = sx * 0.72;
    span(x - GLASS_T / 2, x + GLASS_T / 2, -0.02, 0.5, 0.0, 0.96, glass); // front door
    span(x - GLASS_T / 2, x + GLASS_T / 2, -0.02, 0.5, -1.31, -0.1, glass); // rear door
  }

  // --- lamps ---------------------------------------------------------------
  for (const sx of [-1, 1]) {
    box(0.34, 0.1, 0.06, sx * 0.52, -0.22, 2.07, lampWhite);
    box(0.34, 0.1, 0.06, sx * 0.52, -0.18, -2.07, lampRed);
  }

  return group;
}
