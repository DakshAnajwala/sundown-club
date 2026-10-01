/**
 * LampLight.js — street lighting that actually lights the street.
 *
 * Owner, 30 Sep 2026 (on the fake orange discs): "I don't want this kind of
 * lighting. I want well illuminated street lights."
 *
 * Hundreds of real PointLights are not an option (forward rendering pays for
 * every light on every pixel). Instead the light the lamps throw onto the
 * world is BAKED once per level into a top-down map, and every lit material
 * samples that map at its own world position:
 *
 *   illuminance under a lamp at height h, horizontal distance d:
 *     E = h³ / (d² + h²)^1.5      (inverse square x cosine; 1.0 right below)
 *
 * summed over all lamps. That is how real street lighting is laid out, and it
 * gives smooth, even pools that overlap into a lit road with no hard edges.
 * The same map lights the car as it drives under each lamp (surfaces facing
 * up get the most), so the car brightens and darkens lamp by lamp — one of
 * the strongest speed cues at night.
 *
 * Materials opt in with `useLampLight(material)`. Uniforms are shared, so a
 * new level only swaps the map.
 */
import * as THREE from 'three';

const MAX_E = 2; // stored as 0..MAX_E in 8 bits

/** Shared by every patched material. */
export const lampUniforms = {
  lampMap: { value: null },
  /** minX, minZ, 1/width, 1/depth */
  lampBounds: { value: new THREE.Vector4(0, 0, 1, 1) },
  lampColor: { value: new THREE.Color(0xffe6c8) },
  lampStrength: { value: 2.4 },
  /** Lamps are overhead: surfaces this high above the ground get little. */
  lampFalloffHeight: { value: 12 },
};

/**
 * @param {object} o
 * @param {number[]} o.bounds  [minX, minZ, maxX, maxZ] world metres
 * @param {{x:number, z:number, h:number, i?:number}[]} o.lamps  light heads
 * @param {number} [o.texel]   metres per texel
 * @param {number} [o.range]   lamps are ignored beyond this horizontal distance
 */
export function bakeLampMap({ bounds, lamps, texel = 1, range = 45 }) {
  const [minX, minZ, maxX, maxZ] = bounds;
  const w = Math.ceil((maxX - minX) / texel);
  const d = Math.ceil((maxZ - minZ) / texel);
  const sum = new Float32Array(w * d);
  for (const L of lamps) {
    const h2 = L.h * L.h;
    const h3 = h2 * L.h;
    const k = L.i ?? 1;
    const x0 = Math.max(0, Math.floor((L.x - range - minX) / texel));
    const x1 = Math.min(w - 1, Math.ceil((L.x + range - minX) / texel));
    const z0 = Math.max(0, Math.floor((L.z - range - minZ) / texel));
    const z1 = Math.min(d - 1, Math.ceil((L.z + range - minZ) / texel));
    for (let zi = z0; zi <= z1; zi++) {
      const dz = minZ + (zi + 0.5) * texel - L.z;
      for (let xi = x0; xi <= x1; xi++) {
        const dx = minX + (xi + 0.5) * texel - L.x;
        const r2 = dx * dx + dz * dz;
        if (r2 > range * range) continue;
        sum[zi * w + xi] += (k * h3) / Math.pow(r2 + h2, 1.5);
      }
    }
  }
  const data = new Uint8Array(w * d * 4);
  for (let i = 0; i < w * d; i++) {
    const v = Math.round((Math.min(MAX_E, sum[i]) / MAX_E) * 255);
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, w, d, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  lampUniforms.lampMap.value = tex;
  lampUniforms.lampBounds.value.set(minX, minZ, 1 / (maxX - minX), 1 / (maxZ - minZ));
  return tex;
}

/** Illuminance (0..MAX_E) at a world point, for code that needs it on the CPU. */
export function lampAt(x, z) {
  const tex = lampUniforms.lampMap.value;
  if (!tex) return 0;
  const b = lampUniforms.lampBounds.value;
  const u = (x - b.x) * b.z;
  const v = (z - b.y) * b.w;
  if (u < 0 || u > 1 || v < 0 || v > 1) return 0;
  const { width, height, data } = tex.image;
  const i = (Math.min(height - 1, Math.floor(v * height)) * width + Math.min(width - 1, Math.floor(u * width))) * 4;
  return (data[i] / 255) * MAX_E;
}

/**
 * Add lamp lighting to a Lambert/Phong/Standard material (idempotent). Basic
 * materials are unlit by definition and are left alone.
 */
export function useLampLight(material) {
  if (!material || material.userData.lampLit) return material;
  if (!(material.isMeshLambertMaterial || material.isMeshStandardMaterial || material.isMeshPhongMaterial)) return material;
  material.userData.lampLit = true;
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prev?.call(material, shader, renderer);
    Object.assign(shader.uniforms, lampUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLampWorld;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 lampWorld = vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
          lampWorld = instanceMatrix * lampWorld;
        #endif
        vLampWorld = ( modelMatrix * lampWorld ).xyz;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vLampWorld;
        uniform sampler2D lampMap;
        uniform vec4 lampBounds;
        uniform vec3 lampColor;
        uniform float lampStrength;
        uniform float lampFalloffHeight;`
      )
      .replace(
        '#include <opaque_fragment>',
        `{
          vec2 lampUv = ( vLampWorld.xz - lampBounds.xy ) * lampBounds.zw;
          float lampE = texture2D( lampMap, lampUv ).r * ${MAX_E.toFixed(1)};
          float lampH = clamp( 1.0 - vLampWorld.y / lampFalloffHeight, 0.2, 1.0 );
          vec3 lampUp = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
          // Lamps are overhead: tops get it all, sides some, and anything facing
          // down none (the car's underbody lit up like a skirt at 0.35).
          float lampFacing = clamp( 0.4 + 0.6 * dot( normal, lampUp ), 0.0, 1.0 );
          outgoingLight += diffuseColor.rgb * lampColor * ( lampStrength * lampE * lampH * lampFacing );
        }
        #include <opaque_fragment>`
      );
  };
  const prevKey = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => `${prevKey ? prevKey() : ''}|lamp`;
  material.needsUpdate = true;
  return material;
}

/** useLampLight on every mesh material under `root`. */
export function lampLightTree(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach(useLampLight);
  });
}

/** Soft round glow sprite texture for lamp heads (generated, no image file). */
export function makeGlowTexture(size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,240,215,0.55)');
  grad.addColorStop(1, 'rgba(255,230,200,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
