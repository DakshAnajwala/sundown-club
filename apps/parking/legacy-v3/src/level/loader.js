import * as THREE from 'three';

// Level data schema + loader: spawns ground, obstacles, target-zone decal,
// and cones from level data. Obstacles get static cannon-es bodies via
// physicsWorld.addStaticBox; cones are pure visual meshes with zero
// collision code (per spec — simplest way to guarantee "car phases through
// cones").

const PALETTE = {
  concrete: 0xcfcfd1,
  lineYellow: 0xe8d27a,
  lineWhite: 0xf2f2ea,
  pillar: 0x9a9a94,
  wall: 0xaeb0a6,
  parkedCar: 0x7d92a8,
  cone: 0xe06a2a,
};

export function loadLevel(levelData, { scene, physicsWorld }) {
  const group = new THREE.Group();
  scene.add(group);
  const staticBodies = [];

  // --- ground ------------------------------------------------------------
  const [gw, gd] = levelData.groundSize;
  const groundGeo = new THREE.PlaneGeometry(gw, gd);
  const groundMat = new THREE.MeshLambertMaterial({ color: PALETTE.concrete });
  const groundMesh = new THREE.Mesh(groundGeo, groundMat);
  groundMesh.rotation.x = -Math.PI / 2;
  group.add(groundMesh);

  const groundBody = physicsWorld.addStaticBox({ pos: [0, -0.05, 0], rotY: 0, size: [gw, 0.1, gd] });
  groundBody.isGround = true; // excluded from bump-counting contact filter
  staticBodies.push(groundBody);

  // Invisible perimeter walls at the ground footprint edge. Not in the
  // spec's obstacle list — noticed during browser verification that a
  // sustained turn can drive the car off the lot's edge with nothing to
  // stop it (falls through empty space indefinitely). Cheap, load-bearing
  // fix: static boundary boxes, no visual mesh, tall enough that a car
  // airborne off a low bump can't hop over them. Excluded from bump
  // counting like the ground, since driving into the lot's own edge isn't
  // an "obstacle" in the level-design sense.
  const wallThickness = 1;
  const wallHeight = 3;
  const boundary = [
    { pos: [0, wallHeight / 2, -gd / 2 - wallThickness / 2], size: [gw + wallThickness * 2, wallHeight, wallThickness] },
    { pos: [0, wallHeight / 2, gd / 2 + wallThickness / 2], size: [gw + wallThickness * 2, wallHeight, wallThickness] },
    { pos: [-gw / 2 - wallThickness / 2, wallHeight / 2, 0], size: [wallThickness, wallHeight, gd] },
    { pos: [gw / 2 + wallThickness / 2, wallHeight / 2, 0], size: [wallThickness, wallHeight, gd] },
  ];
  for (const b of boundary) {
    const body = physicsWorld.addStaticBox({ pos: b.pos, rotY: 0, size: b.size });
    body.isGround = true;
    staticBodies.push(body);
  }

  // --- parking bay (visual only, no collision) ----------------------------
  // Painted bay markings rather than a solid decal: side lines plus a head
  // line at the far end, which is what actually reads as a parking space on
  // the ground. The bay is only a visual cue — whether the car counts as
  // parked is decided entirely by scoring.js against target.posTolerance /
  // rotToleranceDeg, so the painted size here is deliberately a little
  // larger than the tolerance to avoid implying pixel-perfect alignment.
  //
  // Built as a group rotated by target.rotY with children laid out in local
  // space (length along local +Z, the car's heading at the target), which
  // avoids the rotate-the-plane-then-negate-rotZ trick the old decal used.
  const BAY_W = 2.5;
  const BAY_L = 5.0;
  const LINE_W = 0.12;
  const bay = new THREE.Group();
  bay.position.set(levelData.target.pos[0], 0, levelData.target.pos[2]);
  bay.rotation.y = levelData.target.rotY;
  group.add(bay);

  const fill = new THREE.Mesh(
    new THREE.PlaneGeometry(BAY_W, BAY_L),
    new THREE.MeshBasicMaterial({
      color: PALETTE.lineYellow,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
    })
  );
  fill.rotation.x = -Math.PI / 2;
  fill.position.y = 0.015;
  bay.add(fill);

  const lineMat = new THREE.MeshBasicMaterial({ color: PALETTE.lineWhite });
  const addLine = (w, d, x, z) => {
    const line = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), lineMat);
    line.position.set(x, 0.02, z);
    bay.add(line);
  };
  addLine(LINE_W, BAY_L, -BAY_W / 2, 0); // left side
  addLine(LINE_W, BAY_L, BAY_W / 2, 0); // right side
  addLine(BAY_W, LINE_W, 0, BAY_L / 2); // head line; entry end left open

  // --- obstacles (walls / pillars / parked cars) — static physics bodies --
  for (const obs of levelData.obstacles) {
    const geo = new THREE.BoxGeometry(...obs.scale);
    const color = PALETTE[obs.type] ?? PALETTE.pillar;
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color }));
    mesh.position.set(obs.pos[0], obs.pos[1], obs.pos[2]);
    mesh.rotation.y = obs.rotY;
    group.add(mesh);

    if (obs.collides) {
      const body = physicsWorld.addStaticBox({ pos: obs.pos, rotY: obs.rotY, size: obs.scale });
      staticBodies.push(body);
    }
  }

  // --- cones (visual only, zero collision code) ---------------------------
  const coneGeo = new THREE.ConeGeometry(0.2, 0.4, 10);
  const coneMat = new THREE.MeshStandardMaterial({ color: PALETTE.cone });
  for (const cone of levelData.cones) {
    const mesh = new THREE.Mesh(coneGeo, coneMat);
    mesh.position.set(cone.pos[0], 0.2, cone.pos[2]);
    mesh.rotation.y = cone.rotY;
    group.add(mesh);
  }

  function dispose() {
    scene.remove(group);
    group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    });
    for (const body of staticBodies) physicsWorld.removeBody(body);
  }

  return {
    dispose,
    spawn: levelData.spawn,
    target: levelData.target,
    maneuverType: levelData.maneuverType,
  };
}
