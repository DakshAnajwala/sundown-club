/**
 * Rain.js — falling rain streaks in a box (design/SPEC-scenes.md §2.6).
 *
 * Line segments, one per drop, falling 9 m/s with a little wind slant. The
 * state is a pure function of time (`setTime`), so a scene can be scrubbed
 * and every screenshot of the same moment is identical. Faint and additive:
 * rain should read against the lights, not fog up the picture.
 */
import * as THREE from 'three';

/**
 * @param {{ center?: number[], size?: number[], count?: number, color?: number, opacity?: number }} opts
 *   center [x, y-bottom, z]; size [width, height, depth] in metres
 */
export function createRain({ center = [0, 0, 0], size = [20, 8, 20], count = 1400, color = 0xbfd4e6, opacity = 0.32 } = {}) {
  const FALL = 9; // m/s
  const LEN = 0.38; // streak length, m
  const WIND = [0.6, 0, 0.25]; // drift per metre of fall
  const base = new Float32Array(count * 3);
  // Deterministic scatter (a fixed LCG): the same scene rains the same way.
  let seed = 1234567;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < count; i++) {
    base[i * 3] = (rnd() - 0.5) * size[0];
    base[i * 3 + 1] = rnd() * size[1];
    base[i * 3 + 2] = (rnd() - 0.5) * size[2];
  }
  const pos = new Float32Array(count * 6);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.userData.disposable = true;
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: true });
  mat.userData.disposable = true;
  const lines = new THREE.LineSegments(geo, mat);
  lines.name = 'rain';
  lines.frustumCulled = false;
  lines.position.set(center[0], center[1], center[2]);

  function setTime(t) {
    const h = size[1];
    for (let i = 0; i < count; i++) {
      const fallen = (base[i * 3 + 1] - FALL * t) % h;
      const y = fallen < 0 ? fallen + h : fallen;
      const drift = h - y;
      const x = base[i * 3] + WIND[0] * drift;
      const z = base[i * 3 + 2] + WIND[2] * drift;
      const o = i * 6;
      pos[o] = x;
      pos[o + 1] = y;
      pos[o + 2] = z;
      pos[o + 3] = x - WIND[0] * LEN;
      pos[o + 4] = y + LEN;
      pos[o + 5] = z - WIND[2] * LEN;
    }
    geo.attributes.position.needsUpdate = true;
  }
  setTime(0);

  return {
    object: lines,
    setTime,
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}
