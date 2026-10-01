/**
 * figure.js — the faceless Sundown Club regulars (Blackjack SPEC §8.6).
 *
 * A matte mannequin with no face, in a suit. Standing (the dealer) or seated
 * (players). Arms are solved every frame (two-bone IK) from the shoulders to
 * wherever the hands are asked to go; the torso leans when a target is past
 * a comfortable reach. Works at any position and facing.
 *
 *   const f = createFigure(scene, { at: new V3(0, 0, -0.74), face: new V3(0, 0, 0), seated: false });
 *   f.reach('right', worldPoint); f.rest('right'); f.look(worldPoint); f.update(dt, t, speed);
 */
import * as THREE from 'three';
import { mat } from './lounge.js';
import { clamp01 } from './util.js';

const V3 = THREE.Vector3;
const UP = new V3(0, 1, 0);

/** Suit palettes. Muted on purpose (taste record: no saturated colour). */
export const SUITS = {
  charcoal: { suit: 0x474a52, lapel: 0x383a41, shirt: 0xece6dc, tie: 0x1b1c21 },
  navy: { suit: 0x3a4660, lapel: 0x2e384d, shirt: 0xe9e4da, tie: 0x8a3b33 },
  olive: { suit: 0x5b5e47, lapel: 0x4a4c3a, shirt: 0xe4dccb, tie: null },
  burgundy: { suit: 0x5e3a3e, lapel: 0x4b2e31, shirt: 0xece6dc, tie: 0x23202a },
  cream: { suit: 0xcfc4ae, lapel: 0xb9ad96, shirt: 0xf3ede2, tie: 0x4a3a30 },
  slate: { suit: 0x5a6068, lapel: 0x4a4f56, shirt: 0xe6e2da, tie: 0x3a4660 },
};

export function createFigure(scene, { at, face, seated = false, scale = 1, colors = SUITS.charcoal, reducedMotion = false, restReach = 0.3 }) {
  const skin = mat(0xd8d2ca), suit = mat(colors.suit), lapel = mat(colors.lapel), shirt = mat(colors.shirt);
  const root = new THREE.Group();
  root.position.copy(at);
  root.rotation.y = Math.atan2(face.x - at.x, face.z - at.z);   // local +z faces `face`
  root.scale.setScalar(scale);
  scene.add(root);
  const part = (geo, m, x, y, z, parent) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o; };
  const waist = seated ? 0.6 : 0.92;
  if (seated) {
    const wood = mat(0x4a3a30), leather = mat(0x3b2d27);
    part(new THREE.BoxGeometry(0.46, 0.06, 0.44), leather, 0, 0.47, -0.04, root);
    part(new THREE.BoxGeometry(0.44, 0.52, 0.06), leather, 0, 0.78, -0.27, root).rotation.x = -0.12;
    for (const [x, z] of [[-0.2, 0.14], [0.2, 0.14], [-0.2, -0.22], [0.2, -0.22]]) part(new THREE.BoxGeometry(0.04, 0.46, 0.04), wood, x, 0.23, z, root);
    part(new THREE.BoxGeometry(0.34, 0.12, 0.42), suit, 0, 0.55, 0.06, root);                       // lap
    for (const sd of [-1, 1]) part(new THREE.BoxGeometry(0.12, 0.44, 0.13), suit, sd * 0.09, 0.27, 0.27, root); // shins
  } else {
    for (const sd of [-1, 1]) part(new THREE.BoxGeometry(0.13, 0.9, 0.16), suit, sd * 0.085, 0.45, 0, root);
    part(new THREE.CylinderGeometry(0.17, 0.16, 0.14, 8).scale(1, 1, 0.62), suit, 0, 0.88, 0, root);
  }
  const torso = new THREE.Group(); torso.position.y = waist; root.add(torso);
  part(new THREE.CylinderGeometry(0.205, 0.165, 0.46, 8).scale(1, 1, 0.6), suit, 0, 0.23, 0, torso);
  const front = 0.108;
  part(new THREE.BoxGeometry(0.1, 0.19, 0.01), shirt, 0, 0.36, front, torso).rotation.x = -0.08;
  if (colors.tie != null) part(new THREE.BoxGeometry(0.028, 0.2, 0.012), mat(colors.tie), 0, 0.33, front + 0.006, torso).rotation.x = -0.08;
  for (const sd of [-1, 1]) { const l = part(new THREE.BoxGeometry(0.06, 0.26, 0.012), lapel, sd * 0.06, 0.33, front + 0.004, torso); l.rotation.set(-0.08, 0, sd * 0.32); }
  for (const sd of [-1, 1]) part(new THREE.SphereGeometry(0.072, 8, 6), suit, sd * 0.2, 0.42, 0, torso);
  part(new THREE.CylinderGeometry(0.045, 0.05, 0.1, 8), skin, 0, 0.5, 0, torso);
  part(new THREE.CylinderGeometry(0.06, 0.07, 0.03, 8).scale(1, 1, 0.9), shirt, 0, 0.47, 0.005, torso);
  const head = new THREE.Group(); head.position.set(0, 0.58, 0.005); torso.add(head);
  part(new THREE.SphereGeometry(0.1, 14, 10).scale(0.9, 1.16, 1.0), skin, 0, 0.07, 0, head);
  const shoulders = [-1, 1].map((sd) => { const o = new THREE.Object3D(); o.position.set(sd * 0.215, 0.41, 0); torso.add(o); return o; });

  function limb(r0, r1, m) { const g = new THREE.CylinderGeometry(r1, r0, 1, 7).translate(0, 0.5, 0); const o = new THREE.Mesh(g, m); o.castShadow = true; scene.add(o); return o; }
  function placeLimb(o, a, b) { const d = b.clone().sub(a), len = Math.max(1e-4, d.length()); o.position.copy(a); o.quaternion.setFromUnitVectors(UP, d.divideScalar(len)); o.scale.set(scale, len, scale); }
  const toWorld = (x, y, z) => root.localToWorld(new V3(x, y, z));
  root.updateMatrixWorld(true);
  const restY = seated ? (waist + 0.16) : 0.8;
  const hands = {};
  for (const [name, side] of [['left', -1], ['right', 1]]) {
    const g = new THREE.Group();
    const add = (geo, m, x, y, z, rx = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.x = rx; o.castShadow = true; g.add(o); return o; };
    add(new THREE.BoxGeometry(0.072, 0.024, 0.085), skin, 0, 0, 0.045);
    for (let i = 0; i < 4; i++) add(new THREE.BoxGeometry(0.0155, 0.015, 0.052 - Math.abs(i - 1.5) * 0.006), skin, -0.027 + i * 0.018, -0.006, 0.108, 0.28);
    add(new THREE.BoxGeometry(0.017, 0.015, 0.045), skin, -side * 0.043, -0.004, 0.058).rotation.y = side * 0.5;
    g.scale.setScalar(scale);
    const rest = toWorld(side * 0.2, restY, restReach);
    hands[name] = { g, side, rest, target: rest.clone(), want: rest.clone(), shoulder: shoulders[side > 0 ? 1 : 0], upper: limb(0.05, 0.043, suit), fore: limb(0.043, 0.037, suit), cuff: limb(0.034, 0.032, shirt) };
    g.position.copy(rest); scene.add(g);
  }

  const A = 0.31 * scale, B = 0.29 * scale;
  let lean = 0, lookAt = null, headYaw = 0;
  const _s = new V3(), _u = new V3(), _p = new V3(), _e = new V3(), _w = new V3(), q = new THREE.Quaternion(), qi = new THREE.Quaternion();
  return {
    root, head, hands,
    /** Send a hand toward a world point (it eases there and stays). */
    reach(name, point) { hands[name].target.copy(point); },
    rest(name) { if (name) hands[name].target.copy(hands[name].rest); else for (const h of Object.values(hands)) h.target.copy(h.rest); },
    look(point) { lookAt = point ? point.clone() : null; },
    update(dt, t, speed = 1) {
      const rate = 1 - Math.exp(-dt * 11 * Math.max(1, speed));
      let need = 0;
      for (const h of Object.values(hands)) {
        h.want.lerp(h.target, rate);
        h.shoulder.getWorldPosition(_s);
        need = Math.max(need, clamp01((h.want.distanceTo(_s) - (A + B) * 0.82) / 0.45));
      }
      lean += (need * 0.34 - lean) * (1 - Math.exp(-dt * 5));
      torso.rotation.x = lean;
      torso.scale.y = reducedMotion ? 1 : 1 + Math.sin(t * 1.6 + at.x * 3) * 0.004;
      // head yaw toward the look point (or the busier hand), in the figure's own frame
      let yaw = 0;
      root.getWorldQuaternion(q); qi.copy(q).invert();
      const busy = lookAt || Object.values(hands).reduce((b, h) => (h.target.distanceTo(h.rest) > b.d ? { d: h.target.distanceTo(h.rest), p: h.want } : b), { d: 0.05, p: null }).p;
      if (busy) { const local = busy.clone().sub(root.position).applyQuaternion(qi); yaw = THREE.MathUtils.clamp(Math.atan2(local.x, Math.max(0.05, local.z)) * 0.7, -0.6, 0.6); }
      headYaw += (yaw - headYaw) * (1 - Math.exp(-dt * 4));
      head.rotation.y = headYaw;
      head.rotation.x = (seated ? 0.22 : 0.32) - lean * 0.6;
      root.updateMatrixWorld(true);
      for (const h of Object.values(hands)) {
        h.shoulder.getWorldPosition(_s);
        _u.copy(h.want).sub(_s);
        const d = THREE.MathUtils.clamp(_u.length(), 0.12 * scale, A + B - 0.002);
        _u.normalize();
        _w.copy(_s).addScaledVector(_u, d);
        const cosA = (A * A + d * d - B * B) / (2 * A * d), sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
        _p.set(h.side * 0.9, -1, -0.25).applyQuaternion(q).normalize();   // elbow out and down, in the figure's frame
        _p.addScaledVector(_u, -_p.dot(_u)).normalize();
        _e.copy(_s).addScaledVector(_u, A * cosA).addScaledVector(_p, A * sinA);
        h.g.position.copy(_w);
        h.g.lookAt(_w.clone().add(_w.clone().sub(_e).setY(0).normalize()));
        placeLimb(h.upper, _s, _e);
        const cuffStart = _e.clone().lerp(_w, 0.84);
        placeLimb(h.fore, _e, cuffStart);
        placeLimb(h.cuff, cuffStart, _w);
      }
    },
  };
}
