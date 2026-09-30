import * as THREE from 'three';

// One road wheel: tyre + rim face + spokes + hub cap, as a THREE.Group.
//
// Orientation convention matters here: the caller (car/vehicle.js) drives
// each wheel's position/quaternion straight from the RaycastVehicle wheel
// transform, which expects the wheel's spin axis along local X. The
// geometries below are authored axis-up (Three's cylinder default) and then
// rotated onto X once, at build time, rather than per frame.

const TYRE_MAT = new THREE.MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.9 });
const RIM_MAT = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, metalness: 0.35, roughness: 0.45 });
const HUB_MAT = new THREE.MeshStandardMaterial({ color: 0x6d7177, metalness: 0.3, roughness: 0.5 });

const SPOKE_COUNT = 5;

export function createWheelMesh({ radius = 0.35, width = 0.25 } = {}) {
  const group = new THREE.Group();

  const rimRadius = radius * 0.62;

  const tyre = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 20), TYRE_MAT);
  tyre.rotation.z = Math.PI / 2;
  group.add(tyre);

  // Very slightly wider than the tyre so the rim face reads on both sides
  // instead of z-fighting with the tyre's end caps.
  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(rimRadius, rimRadius, width * 1.04, 16),
    RIM_MAT
  );
  rim.rotation.z = Math.PI / 2;
  group.add(rim);

  // Spokes span hub to rim edge, laid out in the plane perpendicular to the
  // axle and rotated about X (the spin axis).
  const spokeLen = rimRadius * 0.86;
  const spokeGeo = new THREE.BoxGeometry(width * 1.06, spokeLen, 0.035);
  spokeGeo.translate(0, spokeLen / 2, 0); // pivot at the hub end
  for (let i = 0; i < SPOKE_COUNT; i++) {
    const spoke = new THREE.Mesh(spokeGeo, HUB_MAT);
    spoke.rotation.x = (i / SPOKE_COUNT) * Math.PI * 2;
    group.add(spoke);
  }

  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.17, radius * 0.17, width * 1.1, 12),
    HUB_MAT
  );
  hub.rotation.z = Math.PI / 2;
  group.add(hub);

  return group;
}
