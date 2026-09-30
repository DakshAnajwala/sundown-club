/**
 * Palette.js — the single source of truth for the game's look.
 *
 * Art direction (slowroads.io-adjacent): minimalist, low-poly, smooth. Soft
 * pastel colours, no image textures anywhere, flat unlit-ish shading. Every
 * surface in the game gets its material from here so the whole scene can be
 * re-tinted from one file.
 *
 * Why MeshLambertMaterial almost everywhere: it has no specular highlight, so
 * large flat slabs read as matte painted concrete instead of plastic, and it
 * is markedly cheaper than MeshStandardMaterial. PBR metalness/roughness
 * buys nothing here — with no environment map, metals render nearly black
 * (a bug v2 hit and documented in NOTES.md).
 */
import * as THREE from 'three';

export const COLORS = {
  // --- daylight / open-air deck -------------------------------------------
  skyDay: 0xd7e7f2,
  skyHorizonDay: 0xeef3f2,
  fogDay: 0xdfe9ef,
  sunLight: 0xfff4e2,
  skyBounce: 0xbfd8ec, // hemisphere sky term
  groundBounce: 0xb9b1a4, // hemisphere ground term

  // --- underground deck ----------------------------------------------------
  fogNight: 0x1d2429,
  ambientNight: 0x2c3944,
  fluorescent: 0xdff2ff, // cold tube light
  fluorescentWarm: 0xa8c4bd,

  // --- rooftop at dusk ------------------------------------------------------
  skyDusk: 0x7d86b3,
  skyHorizonDusk: 0xf1c7a8,
  fogDusk: 0xd9b9ab,
  sunDusk: 0xffb48c,
  skyBounceDusk: 0x9fa6c9,
  groundBounceDusk: 0xa08a7c,
  lampWarm: 0xffd9a0,

  // --- structure -----------------------------------------------------------
  concreteFloor: 0xcbc6bd,
  concreteFloorDark: 0x9d9a94,
  concreteWall: 0xd6d1c7,
  concreteWallDark: 0x8f8c86,
  concreteColumn: 0xdedad1,
  concreteColumnDark: 0x9a9791,
  ceiling: 0xe3e0d8,
  ceilingDark: 0x7e7c78,
  kerb: 0xbdb8ae,

  // --- paint ---------------------------------------------------------------
  paintLine: 0xf4f1e8,
  paintLineDark: 0xd9d6cc,
  paintArrow: 0xe9e5d8,
  paintNumber: 0xbfbbb0,
  hazard: 0xe3c98f,

  // --- target bay ----------------------------------------------------------
  targetGlow: 0x76d6a8,
  targetGlowDeep: 0x2f9d76,

  // --- personal-best ghost car (retention pass) -----------------------------
  ghost: 0xd6e4ea,

  // --- props ---------------------------------------------------------------
  coneBody: 0xe08a5a,
  coneStripe: 0xf2eee5,
  tyre: 0x33312f,
  rim: 0xb9b5ad,
  glass: 0x9fb6c4,
  lampRed: 0xc4685e,
  lampAmber: 0xd9a866,

  // Pastel car paints — deliberately desaturated so a lot full of them still
  // reads as one calm image rather than a bag of sweets. Widened from 8 to 10
  // (GOAL-city-polish.md item 2) with two darker, more saturated tones (ink,
  // brick) so a big lot like Level 13 doesn't read as one flat lightness band.
  carPaints: [
    0xd98b7e, // clay
    0x8fa9c4, // dusty blue
    0xc9c08a, // sand
    0x9ab8a3, // sage
    0xc2a5bd, // lilac
    0xdedad2, // chalk
    0x8c8f96, // slate
    0xd5b48a, // biscuit
    0x33363d, // ink (dark, desaturated navy-black)
    0xa1493f, // brick (deeper red, distinct from clay)
  ],

  // --- cabin ---------------------------------------------------------------
  dash: 0x3b3936,
  dashSoft: 0x4a4744,
  trim: 0x5d5952,
  seat: 0x4f4b46,
  wheelRim: 0x2c2a28,
  // Sport wheel (SteeringWheel.js): satin spokes, not metal (no env map).
  wheelSpoke: 0x4a4744,
  wheelHub: 0x353331,
  wheelStripe: 0xe3c98f,
  skin: 0xd9a988, // driver's hands/arms
  sleeve: 0x6d7b86,
  screenBezel: 0x232120,
};

const cache = new Map();

/**
 * Cached matte material. Materials are shared aggressively — a level has
 * hundreds of meshes but only a dozen or so distinct materials, which keeps
 * draw-call state changes (and GC churn on level reload) low.
 */
export function matte(color, opts = {}) {
  const key = `l:${color}:${JSON.stringify(opts)}`;
  if (!cache.has(key)) {
    cache.set(key, new THREE.MeshLambertMaterial({ color, ...opts }));
  }
  return cache.get(key);
}

/** Unlit material — for paint, screens, glows: things that shouldn't shade. */
export function flat(color, opts = {}) {
  const key = `b:${color}:${JSON.stringify(opts)}`;
  if (!cache.has(key)) {
    cache.set(key, new THREE.MeshBasicMaterial({ color, ...opts }));
  }
  return cache.get(key);
}

/** Self-lit material that still receives scene lighting (lamps, tail lights). */
export function glow(color, intensity = 1, opts = {}) {
  const key = `e:${color}:${intensity}:${JSON.stringify(opts)}`;
  if (!cache.has(key)) {
    cache.set(
      key,
      new THREE.MeshLambertMaterial({
        color,
        emissive: color,
        emissiveIntensity: intensity,
        ...opts,
      })
    );
  }
  return cache.get(key);
}

/** Deterministic pastel paint pick, so a given level always looks the same. */
export function carPaint(index) {
  return COLORS.carPaints[Math.abs(index) % COLORS.carPaints.length];
}

/**
 * Vertical gradient sky dome. Cheaper and softer than a cube map, and it
 * gives the horizon the pale wash that sells the "bright hazy afternoon"
 * look. Rendered on the inside of a sphere with depth writing off.
 */
export function createSkyDome(topColor, bottomColor, radius = 400) {
  const uniforms = {
    top: { value: new THREE.Color(topColor) },
    bottom: { value: new THREE.Color(bottomColor) },
    // Where the gradient sits vertically, in world units.
    offset: { value: 12 },
    power: { value: 0.7 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 top;
      uniform vec3 bottom;
      uniform float offset;
      uniform float power;
      varying vec3 vWorld;
      void main() {
        float h = normalize(vWorld + vec3(0.0, offset, 0.0)).y;
        float t = pow(clamp(h, 0.0, 1.0), power);
        gl_FragColor = vec4(mix(bottom, top, t), 1.0);
      }
    `,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 16), mat);
  dome.name = 'skyDome';
  return dome;
}
