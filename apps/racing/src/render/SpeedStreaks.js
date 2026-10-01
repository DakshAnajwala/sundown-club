/**
 * SpeedStreaks.js — faint wind lines rushing past the camera at speed.
 *
 * World-space line segments scattered in a box around the camera's path,
 * each stretched backwards along the car's velocity by how far it moves in
 * STREAK_SECONDS. A streak that falls behind the camera is re-seeded ahead,
 * so the pool never grows. One draw call (LineSegments), additive, not
 * fogged, invisible below ~110 km/h.
 *
 * Deliberately faint: they should be felt in the corner of the eye, not read
 * as rain.
 */
import * as THREE from 'three';

const COUNT = 140;
const STREAK_SECONDS = 0.06;
const BOX = { side: 16, low: 0.2, high: 3.2, ahead: 90, behind: 4, clearSide: 2.2 };

export function createSpeedStreaks({ scene }) {
  const positions = new Float32Array(COUNT * 6);
  const colors = new Float32Array(COUNT * 6);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;
  lines.renderOrder = 10;
  scene.add(lines);

  // Each streak's anchor point in world space, and a brightness.
  const pts = new Float32Array(COUNT * 3);
  const glow = new Float32Array(COUNT);
  const fwd = new THREE.Vector3();
  const right = new THREE.Vector3();
  const rel = new THREE.Vector3();
  let seeded = false;

  function seed(i, cam, vdir, near) {
    // A lateral offset that keeps clear of the car itself.
    let x = (Math.random() * 2 - 1) * BOX.side;
    if (Math.abs(x) < BOX.clearSide) x = Math.sign(x || 1) * (BOX.clearSide + Math.random() * 3);
    const y = BOX.low + Math.random() * (BOX.high - BOX.low);
    const z = near ? Math.random() * BOX.ahead : BOX.ahead * (0.6 + Math.random() * 0.4);
    right.set(-vdir.z, 0, vdir.x).normalize();
    pts[i * 3] = cam.x + vdir.x * z + right.x * x;
    pts[i * 3 + 1] = y;
    pts[i * 3 + 2] = cam.z + vdir.z * z + right.z * x;
    glow[i] = 0.35 + Math.random() * 0.65;
  }

  /**
   * @param {THREE.Camera} camera
   * @param {{x:number,y:number,z:number}} velocity  the car's world velocity
   * @param {number} amount 0..1 shared speed factor (SpeedFeel.amount)
   */
  function update(camera, velocity, amount) {
    const speed = Math.hypot(velocity.x, velocity.z);
    // Fade in from ~110 km/h (amount 0.35) to full at the top end.
    const vis = THREE.MathUtils.clamp((amount - 0.35) / 0.5, 0, 1);
    mat.opacity = 0.35 * vis;
    lines.visible = vis > 0.01;
    if (!lines.visible || speed < 1) {
      seeded = false;
      return;
    }
    fwd.set(velocity.x / speed, 0, velocity.z / speed);
    const cam = camera.position;
    if (!seeded) {
      for (let i = 0; i < COUNT; i++) seed(i, cam, fwd, true);
      seeded = true;
    }
    const len = speed * STREAK_SECONDS;
    for (let i = 0; i < COUNT; i++) {
      rel.set(pts[i * 3] - cam.x, 0, pts[i * 3 + 2] - cam.z);
      const along = rel.dot(fwd);
      if (along < -BOX.behind || along > BOX.ahead * 1.2) seed(i, cam, fwd, false);
      const px = pts[i * 3];
      const py = pts[i * 3 + 1];
      const pz = pts[i * 3 + 2];
      const o = i * 6;
      positions[o] = px;
      positions[o + 1] = py;
      positions[o + 2] = pz;
      positions[o + 3] = px - fwd.x * len;
      positions[o + 4] = py;
      positions[o + 5] = pz - fwd.z * len;
      // Head bright, tail dark: the line fades out behind itself.
      const g = glow[i];
      colors[o] = 0.75 * g;
      colors[o + 1] = 0.85 * g;
      colors[o + 2] = 1.0 * g;
      colors[o + 3] = colors[o + 4] = colors[o + 5] = 0;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  }

  return {
    update,
    dispose() {
      scene.remove(lines);
      geo.dispose();
      mat.dispose();
    },
  };
}
