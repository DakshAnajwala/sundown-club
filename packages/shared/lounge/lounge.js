/**
 * lounge.js — the Sundown Club card room, shared by every casino game.
 *
 * Extracted from the Blackjack prototype (apps/blackjack/SPEC.md §8): a
 * slowroads-style, flat-shaded lounge with a big window, a live sky and day
 * cycle, a landscape outside, a pendant lamp and soft shadows. A game adds its
 * own table, figures and props to `scene`.
 *
 *   const L = createLounge({ stage: el, room: ROOMS.lounge, lampAt: new THREE.Vector3(0, 1.95, 0) });
 *   L.applyDay(0.755);   // golden hour
 *   L.render(camera);
 *
 * Imports 'three' by bare name: static pages map it with an import map, Vite
 * apps resolve the npm package.
 */
import * as THREE from 'three';
import { clamp01, smooth, fbm, vnoise, rng } from './util.js';

const V3 = THREE.Vector3;

/** Room dressings (Blackjack SPEC §6.2 / §8.5). */
export const ROOMS = {
  lounge: { name: 'The Lounge', plaster: 0xd9ccb8, trim: 0xb8a58a, land: 'hills' },
  salon: { name: 'The Salon', plaster: 0xc9c0b3, trim: 0xa89a86, land: 'coast' },
  upper: { name: 'The Upper Room', plaster: 0xb7b2ac, trim: 0x9a938b, land: 'alpine' },
};

/** Day keys (Blackjack SPEC §8.5): t, sun elevation, sky top, horizon/fog, sun colour, sun int, hemi int, lamp int. */
const DAY = [
  [0.00, -30, '#0e1324', '#252c45', '#8fa6d6', 0.25, 0.25, 1.00],
  [0.22, -4, '#27305a', '#b98a8a', '#ffb38a', 0.30, 0.35, 0.85],
  [0.27, 6, '#6d86b8', '#f0c39a', '#ffc58f', 1.40, 0.60, 0.30],
  [0.35, 30, '#7fa9d6', '#d7e2e4', '#fff1dc', 2.20, 0.90, 0.00],
  [0.50, 55, '#6f9fd2', '#dfe8ea', '#ffffff', 2.50, 1.00, 0.00],
  [0.68, 30, '#7fa4cf', '#e4dccb', '#fff0d6', 2.00, 0.90, 0.00],
  [0.755, 6, '#6f7fb2', '#f4ad6e', '#ffb068', 1.70, 0.60, 0.35],
  [0.80, -3, '#3f4a78', '#d98f6f', '#ff9a6a', 0.40, 0.40, 0.80],
  [0.86, -12, '#1d2544', '#4d5078', '#8fa6d6', 0.25, 0.30, 1.00],
  [1.00, -30, '#0e1324', '#252c45', '#8fa6d6', 0.25, 0.25, 1.00],
].map((k) => ({ t: k[0], el: k[1], top: new THREE.Color(k[2]), hor: new THREE.Color(k[3]), sun: new THREE.Color(k[4]), sunI: k[5], hemiI: k[6], lampI: k[7] }));

export const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0, flatShading: true, ...o });

export function createLounge({ stage, room = ROOMS.lounge, lampAt = new V3(0, 1.95, -0.05), lampTarget = new V3(0, 0.76, 0.05) }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  stage.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xdfe8ea, 25, 480);

  function box(w, h, d, material, x, y, z, { cast = true, receive = true, parent = scene } = {}) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = receive; parent.add(m); return m;
  }

  // ---- sky, stars, lights
  const skyMat = new THREE.ShaderMaterial({
    uniforms: { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, sunColor: { value: new THREE.Color() }, sunDir: { value: new V3(0, 1, 0) }, sunVis: { value: 1 } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunColor; uniform vec3 sunDir; uniform float sunVis; varying vec3 vDir;
      void main(){ vec3 d = normalize(vDir); float h = d.y;
        vec3 col = mix(horizon, top, pow(clamp(h, 0.0, 1.0), 0.55));
        if (h < 0.0) col = horizon * 0.97;
        float s = max(dot(d, sunDir), 0.0);
        col += sunColor * (smoothstep(0.9993, 0.9997, s) * 1.6 + pow(s, 14.0) * 0.28) * sunVis;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), skyMat));
  const starGeo = new THREE.BufferGeometry();
  { const r = rng(7), p = []; for (let i = 0; i < 500; i++) { const a = r() * Math.PI * 2, e = 0.05 + r() * 1.3; p.push(Math.cos(a) * Math.cos(e) * 850, Math.sin(e) * 850, Math.sin(a) * Math.cos(e) * 850); } starGeo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); }
  const starMat = new THREE.PointsMaterial({ color: 0xdfe6ff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
  scene.add(new THREE.Points(starGeo, starMat));

  const hemi = new THREE.HemisphereLight(0xcfe0ff, 0x8a6a52, 1);
  const ambient = new THREE.AmbientLight(0xffe8d0, 0.22);
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -4.5, right: 4.5, top: 4.5, bottom: -4.5, near: 1, far: 50 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  sun.target.position.set(0, 0.8, 0);
  const frontFill = new THREE.DirectionalLight(0xffe2c4, 0.45);
  frontFill.position.set(0.6, 2.2, 3.2);
  const windowFill = new THREE.PointLight(0xffffff, 1, 9, 1.4);
  windowFill.position.set(0, 1.7, -2.1);
  const lamp = new THREE.SpotLight(0xffd7a1, 6, 6, 0.85, 0.9, 1.3);
  lamp.position.copy(lampAt); lamp.target.position.copy(lampTarget);
  const lampGlow = new THREE.PointLight(0xffd7a1, 0.6, 5, 1.6);
  lampGlow.position.copy(lampAt).add(new V3(0, 0.15, 0));
  scene.add(hemi, ambient, sun, sun.target, frontFill, windowFill, lamp, lamp.target, lampGlow);

  // ---- room (Blackjack SPEC §8.2)
  const M = {
    plaster: mat(room.plaster), trim: mat(room.trim), ceiling: mat(0xe6dccb), frame: mat(0x3b3431),
    wood: mat(0x7a5a43), woodDark: mat(0x4a3a30), rail: mat(0x3b2d27, { roughness: 0.85 }),
    brass: mat(0xc9a36a, { roughness: 0.55 }), pot: mat(0xb9876a), leaf: mat(0x5f7f55), leaf2: mat(0x74905f),
    shade: mat(0x2f3a36, { side: THREE.DoubleSide }), bulb: new THREE.MeshStandardMaterial({ color: 0xfff2dc, emissive: 0xffd7a1, emissiveIntensity: 2 }),
  };
  {
    const n = 32, planks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.04, 6.0), mat(0xffffff), n);
    const r = rng(3), m4 = new THREE.Matrix4(), c = new THREE.Color();
    for (let i = 0; i < n; i++) { m4.makeTranslation(-3.5 + 0.11 + i * 0.22, -0.02, 0.4); planks.setMatrixAt(i, m4); planks.setColorAt(i, c.set(0x7a5a43).offsetHSL(0, (r() - 0.5) * 0.05, (r() - 0.5) * 0.06)); }
    planks.receiveShadow = true; scene.add(planks);
  }
  const W = 3.5, BACK = -2.6, FRONT = 3.4, H = 3.0, SILL = 0.85, WIN_TOP = 2.45, WIN_W = 3.6, T = 0.16;
  box(2 * W, SILL, T, M.plaster, 0, SILL / 2, BACK - T / 2);
  box(2 * W, H - WIN_TOP, T, M.plaster, 0, (H + WIN_TOP) / 2, BACK - T / 2);
  box(W - WIN_W / 2, WIN_TOP - SILL, T, M.plaster, -(W + WIN_W / 2) / 2, (SILL + WIN_TOP) / 2, BACK - T / 2);
  box(W - WIN_W / 2, WIN_TOP - SILL, T, M.plaster, (W + WIN_W / 2) / 2, (SILL + WIN_TOP) / 2, BACK - T / 2);
  box(T, H, FRONT - BACK, M.plaster, -W - T / 2, H / 2, (FRONT + BACK) / 2);
  box(T, H, FRONT - BACK, M.plaster, W + T / 2, H / 2, (FRONT + BACK) / 2);
  box(2 * W, H, T, M.plaster, 0, H / 2, FRONT + T / 2);
  box(2 * W + 2 * T, T, FRONT - BACK + T, M.ceiling, 0, H + T / 2, (FRONT + BACK) / 2);
  box(0.03, 0.95, FRONT - BACK, M.trim, -W + 0.015, 0.475, (FRONT + BACK) / 2);
  box(0.03, 0.95, FRONT - BACK, M.trim, W - 0.015, 0.475, (FRONT + BACK) / 2);
  box(2 * W, 0.95, 0.03, M.trim, 0, 0.475, BACK + 0.015, { cast: false });
  box(0.05, 0.05, FRONT - BACK, M.trim, -W + 0.03, 0.97, (FRONT + BACK) / 2);
  box(0.05, 0.05, FRONT - BACK, M.trim, W - 0.03, 0.97, (FRONT + BACK) / 2);
  box(WIN_W + 0.16, 0.06, 0.34, M.trim, 0, SILL - 0.01, BACK + 0.04);
  box(WIN_W + 0.16, 0.1, 0.2, M.frame, 0, WIN_TOP + 0.03, BACK);
  box(0.1, WIN_TOP - SILL, 0.2, M.frame, -WIN_W / 2 - 0.03, (SILL + WIN_TOP) / 2, BACK);
  box(0.1, WIN_TOP - SILL, 0.2, M.frame, WIN_W / 2 + 0.03, (SILL + WIN_TOP) / 2, BACK);
  for (const x of [-0.9, 0, 0.9]) box(0.05, WIN_TOP - SILL, 0.12, M.frame, x, (SILL + WIN_TOP) / 2, BACK);
  box(WIN_W, 0.04, 0.1, M.frame, 0, 1.78, BACK);
  box(0.45, 0.8, 1.6, M.woodDark, -W + 0.24, 0.4, -0.6);
  box(0.5, 0.04, 1.66, M.wood, -W + 0.25, 0.82, -0.6);
  {
    const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; scene.add(o); return o; };
    add(new THREE.CylinderGeometry(0.06, 0.09, 0.32, 7), mat(0x9fb3a6), -W + 0.25, 0.99, -0.95);
    add(new THREE.SphereGeometry(0.1, 7, 5), mat(0xc98d68), -W + 0.25, 0.93, -0.55);
    add(new THREE.CylinderGeometry(0.05, 0.07, 0.36, 6), M.woodDark, -W + 0.25, 1.02, -0.1);
    M.sideShade = add(new THREE.CylinderGeometry(0.1, 0.16, 0.18, 8, 1, true), mat(0xe8dcc6, { side: THREE.DoubleSide, emissive: 0xffc98a, emissiveIntensity: 0 }), -W + 0.25, 1.28, -0.1);
    add(new THREE.CylinderGeometry(0.2, 0.15, 0.4, 8), M.pot, W - 0.45, 0.2, BACK + 0.5);
    const r = rng(11);
    for (let i = 0; i < 9; i++) { const l = add(new THREE.IcosahedronGeometry(0.16 + r() * 0.1, 0), i % 2 ? M.leaf : M.leaf2, W - 0.45 + (r() - 0.5) * 0.4, 0.55 + r() * 0.7, BACK + 0.5 + (r() - 0.5) * 0.4); l.rotation.set(r() * 3, r() * 3, r() * 3); }
    const fx = W - 0.02; box(0.03, 0.72, 1.02, M.frame, fx, 1.75, 0.3, { cast: false });
    ['#e8c9a0', '#c9a488', '#8fa38a', '#6f8a7d'].forEach((c, i) => box(0.035, 0.15, 0.92, mat(c), fx, 2.03 - i * 0.18, 0.3, { cast: false }));
    // pendant lamp over lampAt
    const lx = lampAt.x, lz = lampAt.z;
    add(new THREE.CylinderGeometry(0.006, 0.006, H - lampAt.y - 0.3, 5), M.frame, lx, (H + lampAt.y + 0.3) / 2, lz).castShadow = false;
    add(new THREE.ConeGeometry(0.34, 0.24, 10, 1, true), M.shade, lx, lampAt.y + 0.29, lz).castShadow = false;
    add(new THREE.SphereGeometry(0.05, 8, 6), M.bulb, lx, lampAt.y + 0.18, lz).castShadow = false;
    const rim = add(new THREE.TorusGeometry(0.34, 0.008, 4, 20), M.brass, lx, lampAt.y + 0.17, lz); rim.rotation.x = Math.PI / 2; rim.castShadow = false;
  }

  // ---- landscape through the window
  const roadX = (z) => 7 * Math.sin(z * 0.045) + 3 * Math.sin(z * 0.11 + 1.3);
  const LANDS = {
    hills: { h: (x, z) => { const d = -z, amp = 2.2 + d * 0.06, near = 1 - smooth(2.5, 11, Math.abs(x - roadX(z))); return -2.4 + fbm(x * 0.018, z * 0.018) * amp * (1 - 0.85 * near) + Math.max(0, d - 150) * 0.13 + fbm(x * 0.004 + 9, z * 0.004) * Math.max(0, d - 200) * 0.12; },
      ramp: [[-4, '#a7b06f'], [4, '#86a060'], [18, '#6f8a5f'], [40, '#7d8a7a'], [70, '#9aa3a8']], trees: 320, treeColor: ['#4f6b47', '#5e7a50', '#6a8455'], road: true },
    coast: { h: (x, z) => { const d = -z, side = smooth(8, 70, -x) + 0.8 * smooth(45, 120, x) + smooth(200, 320, d); return -9 + side * (13 + fbm(x * 0.02, z * 0.02) * (4 + d * 0.05)) + fbm(x * 0.05, z * 0.05) * 2; },
      ramp: [[-6, '#6f93a8'], [-2.6, '#dccaa0'], [0, '#9cab6c'], [10, '#7f9463'], [22, '#8c867c']], trees: 90, treeColor: ['#51704a', '#62804f'], sea: true },
    alpine: { h: (x, z) => { const d = -z, amp = 3 + d * 0.11, near = 1 - smooth(2.5, 11, Math.abs(x - roadX(z))); const ridge = 1 - Math.abs(vnoise(x * 0.012, z * 0.012)); return -2.5 + fbm(x * 0.016, z * 0.016) * amp * (1 - 0.8 * near) + ridge * ridge * Math.max(0, d - 60) * 0.35 + Math.max(0, d - 120) * 0.2; },
      ramp: [[-4, '#8fa06a'], [8, '#6f865c'], [26, '#7d7a78'], [48, '#9a9591'], [62, '#eef0f2']], trees: 380, treeColor: ['#3f5a44', '#4a6649', '#56704f'], road: true },
  };
  let landGroup = null;
  function rampColor(ramp, h, out) {
    if (h <= ramp[0][0]) return out.set(ramp[0][1]);
    for (let i = 1; i < ramp.length; i++) if (h < ramp[i][0]) { const [h0, c0] = ramp[i - 1], [h1, c1] = ramp[i]; return out.set(c0).lerp(new THREE.Color(c1), (h - h0) / (h1 - h0)); }
    return out.set(ramp[ramp.length - 1][1]);
  }
  function buildLand(kind) {
    if (landGroup) { scene.remove(landGroup); landGroup.traverse((o) => o.geometry?.dispose()); }
    const L = LANDS[kind], grp = new THREE.Group(), r = rng(kind.length * 17);
    const NX = 150, NZ = 110, pos = [], col = [], idx = [], c = new THREE.Color();
    for (let j = 0; j <= NZ; j++) {
      const z = -5 - 470 * Math.pow(j / NZ, 1.6);
      for (let i = 0; i <= NX; i++) { const x = -340 + (680 * i) / NX + (r() - 0.5) * 2, h = L.h(x, z); pos.push(x, h, z); rampColor(L.ramp, h, c).offsetHSL(0, (r() - 0.5) * 0.04, (r() - 0.5) * 0.05); col.push(c.r, c.g, c.b); }
    }
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) { const a = j * (NX + 1) + i, b = a + 1, d = a + NX + 1, e = d + 1; idx.push(a, d, b, b, d, e); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    grp.add(new THREE.Mesh(geo, mat(0xffffff, { vertexColors: true })));
    if (L.sea) { const sea = new THREE.Mesh(new THREE.PlaneGeometry(1400, 900).rotateX(-Math.PI / 2), mat(0x6f93a8, { roughness: 0.6 })); sea.position.set(0, -3, -440); grp.add(sea); }
    if (L.road) {
      const rp = [], ri = [], dash = []; let n = 0;
      for (let z = -6; z > -320; z -= 1.5) {
        const x = roadX(z), dx = roadX(z - 0.5) - x, len = Math.hypot(dx, 0.5), nx = 0.5 / len, nz = dx / len, y = L.h(x, z) + 0.1;
        rp.push(x - nx * 1.7, y, z - nz * 1.7, x + nx * 1.7, y, z + nz * 1.7);
        if (n) ri.push((n - 1) * 2, n * 2, (n - 1) * 2 + 1, (n - 1) * 2 + 1, n * 2, n * 2 + 1);
        if (n % 3 === 0) dash.push(x, y + 0.02, z);
        n++;
      }
      const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3)); rg.setIndex(ri); rg.computeVertexNormals();
      grp.add(new THREE.Mesh(rg, mat(0x6b6560)));
      const dm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 0.02, 1.2), mat(0xe8e0c8), dash.length / 3), m4 = new THREE.Matrix4();
      for (let i = 0; i < dash.length / 3; i++) { const z = dash[i * 3 + 2]; m4.makeRotationY(Math.atan2(roadX(z - 0.5) - roadX(z), -0.5) + Math.PI).setPosition(dash[i * 3], dash[i * 3 + 1], z); dm.setMatrixAt(i, m4); }
      grp.add(dm);
    }
    const tm = new THREE.InstancedMesh(new THREE.ConeGeometry(0.9, 3, 6).translate(0, 1.4, 0), mat(0xffffff), L.trees), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new V3();
    let k = 0;
    while (k < L.trees) {
      const x = (r() - 0.5) * 150, z = -10 - r() * 150;
      if (L.road && Math.abs(x - roadX(z)) < 5) continue;
      const y = L.h(x, z);
      if (L.sea && y < -2.2) continue;
      const sc = 0.7 + r() * 0.9;
      m4.compose(new V3(x, y - 0.2, z), q, s.set(sc, sc * (0.9 + r() * 0.5), sc)); tm.setMatrixAt(k, m4); tm.setColorAt(k, c.set(L.treeColor[k % L.treeColor.length])); k++;
    }
    grp.add(tm);
    landGroup = grp; scene.add(grp);
  }

  function setRoom(r) { M.plaster.color.set(r.plaster); M.trim.color.set(r.trim); buildLand(r.land); }
  setRoom(room);

  // ---- day cycle
  const tmp = { top: new THREE.Color(), hor: new THREE.Color(), sun: new THREE.Color() };
  const deg = THREE.MathUtils.degToRad;
  let lampColor = 0xffd7a1;
  function applyDay(t) {
    let i = 0; while (i < DAY.length - 2 && t > DAY[i + 1].t) i++;
    const a = DAY[i], b = DAY[i + 1], k = (t - a.t) / (b.t - a.t), lerp = THREE.MathUtils.lerp;
    const el = lerp(a.el, b.el, k), sunI = lerp(a.sunI, b.sunI, k), hemiI = lerp(a.hemiI, b.hemiI, k), lampI = lerp(a.lampI, b.lampI, k);
    tmp.top.copy(a.top).lerp(b.top, k); tmp.hor.copy(a.hor).lerp(b.hor, k); tmp.sun.copy(a.sun).lerp(b.sun, k);
    const az = deg(-30 + 60 * clamp01((t - 0.2) / 0.62));
    const useMoon = el < 0, e = deg(useMoon ? 28 : el), azz = useMoon ? -0.35 : az;
    sun.position.copy(sun.target.position).addScaledVector(new V3(Math.sin(azz) * Math.cos(e), Math.sin(e), -Math.cos(azz) * Math.cos(e)), 20);
    sun.color.copy(tmp.sun); sun.intensity = sunI * smooth(0, 3, Math.abs(el));
    skyMat.uniforms.top.value.copy(tmp.top); skyMat.uniforms.horizon.value.copy(tmp.hor); skyMat.uniforms.sunColor.value.copy(tmp.sun);
    skyMat.uniforms.sunDir.value.set(Math.sin(az) * Math.cos(deg(el)), Math.sin(deg(el)), -Math.cos(az) * Math.cos(deg(el)));
    skyMat.uniforms.sunVis.value = smooth(-6, 2, el);
    scene.fog.color.copy(tmp.hor);
    hemi.color.copy(tmp.top).lerp(tmp.hor, 0.5); hemi.intensity = hemiI;
    windowFill.color.copy(tmp.hor); windowFill.intensity = 1.2 + hemiI * 2.2;
    lamp.color.set(lampColor); lampGlow.color.set(lampColor); M.bulb.emissive.set(lampColor);
    lamp.intensity = 1.5 + lampI * 4.5; lampGlow.intensity = 0.2 + lampI * 1.0; M.bulb.emissiveIntensity = 0.6 + lampI * 2.2;
    M.sideShade.material.emissiveIntensity = lampI * 0.9;
    starMat.opacity = smooth(-4, -14, el) * 0.9;
    const hh = Math.floor(t * 24), mm = Math.floor((t * 24 - hh) * 60);
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  function resize(camera) {
    const w = stage.clientWidth, h = stage.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }

  return {
    THREE, renderer, scene, M, box, sun, lamp,
    applyDay, setRoom, resize,
    set lampColor(c) { lampColor = c; },
    setShadows(on) { sun.castShadow = on; scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; }); },
  };
}

/**
 * Seated/standing first-person camera with the cinematic drift and "beats"
 * (Blackjack SPEC §8.3). Call update(dt, elapsed) every frame.
 */
export function createCameraRig(camera, modes, { reducedMotion = false } = {}) {
  let mode = Object.keys(modes)[0];
  const cam = { pos: modes[mode].pos.clone().add(new V3(0, 0.25, 0.6)), look: modes[mode].look.clone(), fov: modes[mode].fov + 4 };
  const beat = { off: new V3(), fov: 0 };
  const fx = [];
  const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
  return {
    get mode() { return mode; },
    set mode(m) { mode = m; },
    /** Dolly a little toward a point and back (cinematic mode only). */
    beat(toward, dist = 0.1, fovD = -2, inMs = 600, holdMs = 700, outMs = 900) {
      if (mode !== 'cinematic' || reducedMotion) return;
      const dir = toward.clone().sub(modes[mode].pos).normalize().multiplyScalar(dist);
      fx.push({ t: 0, dur: inMs + holdMs + outMs, update: (ms) => { const k = ms < inMs ? easeInOut(ms / inMs) : ms < inMs + holdMs ? 1 : 1 - easeInOut((ms - inMs - holdMs) / outMs); beat.off.copy(dir).multiplyScalar(k); beat.fov = fovD * k; } });
    },
    update(dt, t, speed = 1) {
      for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; f.t += dt * 1000 * speed; f.update(Math.min(f.t, f.dur)); if (f.t >= f.dur) fx.splice(i, 1); }
      const base = modes[mode], wantPos = base.pos.clone(), wantLook = base.look.clone();
      if (mode === 'cinematic' && !reducedMotion) {
        const w = (t * Math.PI * 2) / 7;
        wantPos.add(beat.off).add(new V3(Math.sin(w) * 0.006, Math.sin(w * 0.8 + 1) * 0.006, 0));
        wantLook.add(beat.off.clone().multiplyScalar(0.6)).add(new V3(Math.sin(w * 0.6) * 0.004, 0, 0));
      }
      const cr = 1 - Math.exp(-dt * 3.2);
      cam.pos.lerp(wantPos, cr); cam.look.lerp(wantLook, cr); cam.fov += (base.fov + (mode === 'cinematic' ? beat.fov : 0) - cam.fov) * cr;
      camera.position.copy(cam.pos); camera.fov = cam.fov; camera.updateProjectionMatrix(); camera.lookAt(cam.look); camera.updateMatrixWorld(true);
    },
  };
}
