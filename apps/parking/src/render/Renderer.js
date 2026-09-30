/**
 * Renderer.js — WebGL renderer, post-processing stack, and the two lighting
 * rigs (open-air daylight vs underground fluorescent).
 *
 * The whole game uses ONE THREE.Scene and ONE camera object for their entire
 * lifetime; level changes swap the contents of a group inside the scene. That
 * matters because RenderPass and SAOPass capture references to the scene and
 * camera at construction — rebuilding the composer per level would be both
 * wasteful and a reliable source of "why is the AO pass rendering the old
 * level" bugs.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SAOPass } from 'three/addons/postprocessing/SAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { COLORS, createSkyDome } from '../world/Palette.js';

export function createRenderStack({ container, scene, camera }) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
    stencil: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  // PCFShadowMap: PCFSoftShadowMap was removed from three and silently falls
  // back to this with a console warning.
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  // MSAA inside the composer. EffectComposer's default target has samples: 0,
  // which silently throws away the `antialias: true` above the moment any
  // pass is active — every edge in the scene turns into stairsteps.
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(size.x, size.y, {
    type: THREE.HalfFloatType,
    samples: 4,
  });

  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));

  // Ambient occlusion. Subtle on purpose: it should darken the crease where a
  // pillar meets the floor and the shadow under a parked car's sills, and be
  // otherwise invisible. Heavy AO fights the flat pastel look.
  const sao = new SAOPass(scene, camera, new THREE.Vector2(size.x, size.y));
  sao.params.saoIntensity = 0.028;
  sao.params.saoScale = 8;
  sao.params.saoKernelRadius = 26;
  sao.params.saoBias = 0.2;
  sao.params.saoBlur = true;
  sao.params.saoBlurRadius = 6;
  sao.params.saoBlurStdDev = 3;
  sao.params.saoBlurDepthCutoff = 0.02;
  composer.addPass(sao);

  composer.addPass(new OutputPass());

  function onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
  }
  window.addEventListener('resize', onResize);

  let aoEnabled = true;
  function setAO(on) {
    aoEnabled = on;
    sao.enabled = on;
  }

  /**
   * Shadow maps on/off. Flipping renderer.shadowMap.enabled alone does nothing
   * to materials that already compiled with shadow code: they must be told to
   * rebuild their programs, so every material in the scene is marked dirty.
   */
  function setShadows(on) {
    if (renderer.shadowMap.enabled === on) return;
    renderer.shadowMap.enabled = on;
    scene.traverse((o) => {
      if (!o.material) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.needsUpdate = true;
    });
  }

  function setPixelRatio(max) {
    const r = Math.min(window.devicePixelRatio, max);
    renderer.setPixelRatio(r);
    composer.setPixelRatio(r);
    onResize();
  }

  return {
    renderer,
    composer,
    setAO,
    setShadows,
    setPixelRatio,
    get aoEnabled() {
      return aoEnabled;
    },
    render() {
      composer.render();
    },
    dispose() {
      window.removeEventListener('resize', onResize);
      composer.dispose();
      renderer.dispose();
    },
  };
}

/**
 * Lighting rig for one level style. Returns a group to add to the scene plus
 * the fog/background settings for that mood.
 *
 * 'open'        levels 1-3: an above-ground concrete deck. One warm sun with
 *               shadows, a cool sky bounce, pale fog. Because the deck's
 *               ceiling slab and columns cast shadows, the open sides of the
 *               structure produce the bands of sunlight spilling across the
 *               floor by themselves — no faked light shafts needed.
 * 'rooftop'     the top deck at dusk: a low, warm sun raking almost flat across
 *               the deck (long shadows off every parked car), a lilac sky
 *               bounce, and warm haze. No ceiling, so nothing blocks it.
 * 'underground' levels 4-5: no sun at all. Cold fluorescent tubes overhead
 *               with a dim blue-grey ambient, dense dark fog so the far end
 *               of the deck fades into nothing.
 */
export function createLightingRig(style, { width, depth, ceilingHeight }) {
  const group = new THREE.Group();
  group.name = `lighting:${style}`;

  if (style === 'open') {
    const hemi = new THREE.HemisphereLight(COLORS.skyBounce, COLORS.groundBounce, 1.15);
    group.add(hemi);

    const sun = new THREE.DirectionalLight(COLORS.sunLight, 2.4);
    // Low-ish afternoon sun coming across the deck rather than straight down,
    // so the columns throw long stripes instead of little puddles.
    sun.position.set(-width * 0.55, ceilingHeight * 2.6, depth * 0.42);
    sun.target.position.set(width * 0.1, 0, -depth * 0.1);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const span = Math.max(width, depth) * 0.72;
    sun.shadow.camera.left = -span;
    sun.shadow.camera.right = span;
    sun.shadow.camera.top = span;
    sun.shadow.camera.bottom = -span;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = ceilingHeight * 6 + span * 2;
    // Without a bias the low-poly floor slab self-shadows into moire stripes.
    sun.shadow.bias = -0.0012;
    sun.shadow.normalBias = 0.035;
    group.add(sun);
    group.add(sun.target);

    // A weak fill from the opposite side stops the shadowed halves of columns
    // from going flat black, standing in for bounce off the concrete.
    const fill = new THREE.DirectionalLight(0xdfe8ef, 0.35);
    fill.position.set(width * 0.6, ceilingHeight * 1.4, -depth * 0.5);
    group.add(fill);

    return {
      group,
      fog: new THREE.Fog(COLORS.fogDay, 34, 190),
      background: createSkyDome(COLORS.skyDay, COLORS.skyHorizonDay),
      clear: COLORS.fogDay,
      sun,
    };
  }

  if (style === 'city') {
    // Daylight like 'open' (SPEC-level13.md §5.12): the decks under the slabs
    // darken naturally from their own shadows, no separate "indoor" rig. The
    // one difference from 'open' is the shadow camera: a 222 m city can't get
    // one shadow map sized to the whole level without the resolution turning
    // to mush, so CityBuilder re-centres this light's shadow camera on the
    // car every frame (§5.5) — `sun` is returned so it can.
    const hemi = new THREE.HemisphereLight(COLORS.skyBounce, COLORS.groundBounce, 1.15);
    group.add(hemi);

    const sun = new THREE.DirectionalLight(COLORS.sunLight, 2.4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const span = 30; // CityBuilder overwrites this every frame to track the car
    sun.shadow.camera.left = -span;
    sun.shadow.camera.right = span;
    sun.shadow.camera.top = span;
    sun.shadow.camera.bottom = -span;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 120;
    sun.shadow.bias = -0.0012;
    sun.shadow.normalBias = 0.035;
    group.add(sun, sun.target);

    const fill = new THREE.DirectionalLight(0xdfe8ef, 0.35);
    fill.position.set(30, 20, -20);
    group.add(fill);

    return {
      group,
      fog: new THREE.Fog(COLORS.fogDay, 34, 260),
      background: createSkyDome(COLORS.skyDay, COLORS.skyHorizonDay),
      clear: COLORS.fogDay,
      sun,
    };
  }

  if (style === 'rooftop') {
    group.add(new THREE.HemisphereLight(COLORS.skyBounceDusk, COLORS.groundBounceDusk, 1.25));

    const sun = new THREE.DirectionalLight(COLORS.sunDusk, 2.1);
    // Low in the west-south-west: ~16 degrees of elevation.
    sun.position.set(-width * 1.1, 9, depth * 0.35);
    sun.target.position.set(0, 0, 0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const span = Math.max(width, depth) * 0.75;
    sun.shadow.camera.left = -span;
    sun.shadow.camera.right = span;
    sun.shadow.camera.top = span;
    sun.shadow.camera.bottom = -span;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = width * 3;
    sun.shadow.bias = -0.0012;
    sun.shadow.normalBias = 0.035;
    group.add(sun, sun.target);

    const fill = new THREE.DirectionalLight(0xc9d0ef, 0.45);
    fill.position.set(width * 0.6, 12, -depth * 0.5);
    group.add(fill);

    return {
      group,
      fog: new THREE.Fog(COLORS.fogDusk, 40, 220),
      background: createSkyDome(COLORS.skyDusk, COLORS.skyHorizonDusk),
      clear: COLORS.fogDusk,
    };
  }

  // --- underground ---------------------------------------------------------
  const ambient = new THREE.AmbientLight(COLORS.ambientNight, 1.5);
  group.add(ambient);

  // A very dim overhead directional gives the tops of cars and pillars a
  // readable silhouette; the tubes alone leave the scene muddy.
  const key = new THREE.DirectionalLight(COLORS.fluorescentWarm, 0.5);
  key.position.set(0, ceilingHeight * 3, 0);
  group.add(key);

  // Fluorescent tubes on a grid. Point lights are capped deliberately: each
  // one costs a per-fragment loop iteration on every lit material in view.
  const rows = 3;
  const cols = 3;
  const tubes = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = -width / 2 + (width * (c + 0.5)) / cols;
      const z = -depth / 2 + (depth * (r + 0.5)) / rows;
      const lamp = new THREE.PointLight(COLORS.fluorescent, 26, 30, 1.8);
      lamp.position.set(x, ceilingHeight - 0.35, z);
      group.add(lamp);
      tubes.push(lamp);
    }
  }

  return {
    group,
    fog: new THREE.Fog(COLORS.fogNight, 12, 78),
    background: null,
    clear: COLORS.fogNight,
    tubes, // handed to the level builder so it can flicker one of them
  };
}
