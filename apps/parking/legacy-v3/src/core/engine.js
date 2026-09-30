import * as THREE from 'three';

// Renderer, scene, clock, main loop, resize handling.
// Public API only — other modules never touch renderer/scene internals
// beyond what's exposed here.
export function createEngine({ container }) {
  const scene = new THREE.Scene();
  // Flat pastel sky-blue background, no fog per v1 scope.
  scene.background = new THREE.Color(0xb9c6d6);

  const hemi = new THREE.HemisphereLight(0xdfe9f5, 0x8a8f7a, 0.9);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff6e0, 1.1);
  sun.position.set(15, 25, 10);
  scene.add(sun);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  container.appendChild(renderer.domElement);

  const clock = new THREE.Clock();
  const updateCallbacks = [];
  const preRenderCallbacks = [];

  let activeCamera = null;
  function setActiveCamera(camera) {
    activeCamera = camera;
    onResize();
  }

  function onUpdate(fn) {
    updateCallbacks.push(fn);
  }

  // v2: generic hook for anything that needs to render extra passes AFTER
  // this frame's transforms are updated but BEFORE the main camera render
  // — e.g. mirror render-to-texture passes. Deliberately domain-agnostic
  // (not mirror-specific) so core stays ignorant of car-specific cameras,
  // preserving the "modules only reach each other through public APIs"
  // rule from ARCHITECTURE.md.
  function onPreRender(fn) {
    preRenderCallbacks.push(fn);
  }

  function onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h);
    if (activeCamera) {
      activeCamera.aspect = w / h;
      activeCamera.updateProjectionMatrix();
    }
  }
  window.addEventListener('resize', onResize);

  let running = false;
  function loop() {
    if (!running) return;
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 1 / 20); // clamp to avoid spiral of death on tab-switch
    const elapsed = clock.getElapsedTime();
    for (const fn of updateCallbacks) fn(dt, elapsed);
    for (const fn of preRenderCallbacks) fn(renderer, dt);
    if (activeCamera) renderer.render(scene, activeCamera);
  }

  function start() {
    running = true;
    clock.start();
    loop();
  }

  function dispose() {
    running = false;
    window.removeEventListener('resize', onResize);
    renderer.dispose();
  }

  return { scene, renderer, clock, onUpdate, onPreRender, setActiveCamera, start, dispose };
}
