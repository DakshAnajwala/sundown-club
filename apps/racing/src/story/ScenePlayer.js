/**
 * ScenePlayer.js — plays a story scene in the engine (design/SPEC-scenes.md §2).
 *
 * A scene is pure data (src/story/scenes/*.js): the location, who stands
 * where, the cars, the props, a list of camera shots, and timed cues (lines,
 * poses, walks, drives, lights, a fade, a choice). The player builds it into
 * the ONE scene it is given, writes the ONE camera it is given (the render
 * passes captured both: CLAUDE.md), and runs it on a timeline.
 *
 * Everything that moves is a function of scene time, or is stepped with a
 * fixed dt from 0, so `seek(t)` gives the same picture every time (probes
 * step with seek, never with wall-clock sleeps).
 */
import * as THREE from 'three';
import { createEmitter } from '../core/Events.js';
import { createSkyDome } from '../world/Palette.js';
import { createFigure } from './Figure.js';
import { CAST, crowdOutfit } from './cast.js';
import { walkPose, STRIDE, RUN_STRIDE } from './poses.js';
import { createStoryCar } from '../vehicle/StoryCars.js';
import { createParkedCar, parkedCarVariation } from '../vehicle/CarModel.js';
import { bodyForIndex } from '../vehicle/bodies.js';
import { carPaint } from '../world/Palette.js';
import { RIDE_HEIGHT, WHEEL_RADIUS, WHEELBASE } from '../vehicle/Dimensions.js';
import { createValetBooth, createMaraGarage, createRoadblock, createRooftop, createCarKey, createLedger } from './StorySets.js';
import { createMultiStorey, createPier, createAlley, createRailYard, createLookout, createSkyline } from './Locations.js';
import { createRain } from '../render/Rain.js';

/** Location builders by the name a scene uses. */
export const SET_BUILDERS = {
  valetBooth: () => createValetBooth(),
  maraGarage: () => createMaraGarage(),
  roadblock: (o) => createRoadblock(o),
  rooftop: (o) => createRooftop(o),
  multiStorey: () => createMultiStorey(),
  pier: () => createPier(),
  alley: () => createAlley(),
  railYard: () => createRailYard(),
  lookout: () => createLookout(),
  skyline: (o) => createSkyline(o),
};

export const PROP_BUILDERS = {
  carKey: (o) => createCarKey(o),
  ledger: () => createLedger(),
};

/** Sky, fog and ambient light per mood (SPEC-scenes §2.5). */
export const ENVS = {
  night: { sky: [0x060a14, 0x2b2536], fog: [0x1d1b27, 45, 300], hemi: [0x4a5878, 0x0d0f14, 0.9], moon: [0xa9bde0, 0.35] },
  rain: { sky: [0x04070c, 0x1a202c], fog: [0x141922, 18, 150], hemi: [0x3a4658, 0x0b0d10, 0.85], moon: [0x8fa3c0, 0.12] },
  lanterns: { sky: [0x07060c, 0x33202a], fog: [0x1e1418, 25, 120], hemi: [0x5a4a58, 0x120c0c, 0.8], moon: [0xa9bde0, 0.15] },
  ridge: { sky: [0x03060e, 0x18203a], fog: [0x0e1424, 300, 2200], hemi: [0x4a5878, 0x0d0f14, 1.0], moon: [0xc9d8f0, 0.6] },
  dawn: { sky: [0x324a70, 0xe8a888], fog: [0xb89488, 80, 520], hemi: [0xa8b8d8, 0x3a3030, 1.5], moon: [0xffc8a0, 1.4] },
};

const D2R = Math.PI / 180;
const ease = {
  linear: (u) => u,
  inOut: (u) => u * u * (3 - 2 * u),
  in: (u) => u * u,
  out: (u) => 1 - (1 - u) * (1 - u),
};

/** A plain parked car (the Nth of the deterministic mix) with the story-car interface. */
function parkedCar(n) {
  const group = new THREE.Group();
  group.add(createParkedCar(carPaint(n), bodyForIndex(n), parkedCarVariation(n)));
  const none = () => {};
  return { group, wheels: [], setLights: none, setHeadlights: none, update: none, dispose: () => group.traverse((o) => o.isMesh && o.geometry.userData.disposable && o.geometry.dispose()) };
}

/** Heading (rotation.y) that faces from a to b in the xz plane; 0 faces -Z. */
export function headingTo(a, b) {
  return Math.atan2(-(b[0] - a[0]), -(b[1] - a[1]));
}

/** How long a line stays up: never under 1.8 s, about 18 characters a second after the first second. */
export function readTime(text) {
  return Math.max(1.8, 1.0 + text.length * 0.055);
}

/** Lines of a scene with their resolved timing (used by the player, the probe and SCRIPT.md). */
export function sceneLines(script) {
  return script.cues
    .filter((c) => c.say)
    .map((c) => ({ t: c.t, who: c.say, text: c.text, dur: c.dur ?? readTime(c.text) }));
}

export function sceneDuration(script) {
  return script.shots.reduce((s, sh) => s + sh.dur, 0);
}

/**
 * @param {{ scene: THREE.Scene, camera: THREE.PerspectiveCamera, overlay?: ReturnType<import('../ui/SceneOverlay.js').createSceneOverlay> }} deps
 */
export function createScenePlayer({ scene, camera, overlay = null }) {
  const events = createEmitter();
  const root = new THREE.Group();
  root.name = 'storyScene';
  let script = null;
  let built = null;
  let time = 0;
  let playing = false;
  let ended = false;
  let skipHeld = 0;
  let choice = null;
  let waitingChoice = false;
  const saved = {};

  // --- building ------------------------------------------------------------------
  function figureFor(spec) {
    if (typeof spec === 'string') return createFigure(CAST[spec].outfit, { name: spec, phase: spec.length * 0.37 });
    // { crowd: n, crew }
    return createFigure(crowdOutfit(spec.crowd, spec.crew ?? null), { name: `crowd${spec.crowd}`, phase: spec.crowd * 0.61 });
  }

  function place(obj, at, heading, y = 0) {
    obj.position.set(at[0], y + (at.length > 2 ? at[2] : 0), at[1]);
    obj.rotation.y = heading ?? 0;
  }

  function headingOf(spec, from) {
    if (spec.face) return headingTo(from, spec.face);
    return (spec.heading ?? 0) * (spec.deg ? D2R : 1);
  }

  function build(s) {
    const b = { sets: {}, actors: {}, cars: {}, props: {}, lights: [], env: [], tracks: [], fired: new Set(), rain: null };
    // Environment.
    const env = ENVS[s.env ?? 'night'];
    saved.background = scene.background;
    saved.fog = scene.fog;
    saved.far = camera.far;
    scene.background = new THREE.Color(env.fog[0]);
    scene.fog = new THREE.Fog(env.fog[0], env.fog[1], env.fog[2]);
    camera.far = Math.max(camera.far, env.fog[2] * 1.2, 2400);
    camera.updateProjectionMatrix();
    const sky = createSkyDome(env.sky[0], env.sky[1], camera.far * 0.8);
    sky.material.fog = false;
    const hemi = new THREE.HemisphereLight(env.hemi[0], env.hemi[1], env.hemi[2]);
    const moon = new THREE.DirectionalLight(env.moon[0], env.moon[1]);
    const sc = s.shadow ?? { center: [0, 0], size: 30 };
    moon.position.set(sc.center[0] - 20, 40, sc.center[1] + 14);
    moon.target.position.set(sc.center[0], 0, sc.center[1]);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    Object.assign(moon.shadow.camera, { left: -sc.size, right: sc.size, top: sc.size, bottom: -sc.size, near: 1, far: 120 });
    moon.shadow.bias = -0.0004;
    b.env.push(sky, hemi, moon, moon.target);
    for (const o of b.env) scene.add(o);
    b.sky = sky;
    // A base ground under everything, 3 cm below the sets' floors.
    if (s.ground !== false) {
      const g = new THREE.Mesh(new THREE.BoxGeometry(600, 0.4, 600), new THREE.MeshLambertMaterial({ color: s.groundColor ?? 0x2a2c31 }));
      g.position.y = -0.23;
      g.receiveShadow = true;
      g.userData.base = true;
      root.add(g);
      b.base = g;
    }
    // Sets.
    const setLights = [];
    for (const [id, spec] of Object.entries(s.sets ?? {})) {
      const set = SET_BUILDERS[spec.kind](spec.opts ?? {});
      place(set.group, spec.at ?? [0, 0], (spec.heading ?? 0));
      root.add(set.group);
      b.sets[id] = { set, spec };
      const m = new THREE.Matrix4().makeRotationY(spec.heading ?? 0).setPosition(spec.at?.[0] ?? 0, 0, spec.at?.[1] ?? 0);
      if (spec.lights !== false) for (const l of set.lights ?? []) setLights.push({ ...l, pos: new THREE.Vector3(...l.pos).applyMatrix4(m).toArray() });
    }
    // Real lights: the scene's own first, then the sets', at most 8 (fragment cost).
    const all = [...(s.lights ?? []), ...setLights].slice(0, s.maxLights ?? 8);
    for (const l of all) {
      const p = new THREE.PointLight(l.color, l.intensity, l.distance, 1.6);
      p.position.set(...l.pos);
      root.add(p);
      b.lights.push(p);
    }
    // Cars.
    for (const [id, spec] of Object.entries(s.cars ?? {})) {
      const c = spec.parked != null ? parkedCar(spec.parked) : createStoryCar(spec.id, { driver: spec.driver ?? false });
      root.add(c.group);
      b.cars[id] = { car: c, spec, dist: 0 };
    }
    // People.
    for (const [id, spec] of Object.entries(s.cast ?? {})) {
      const f = figureFor(spec.who ?? id);
      root.add(f.group);
      b.actors[id] = { fig: f, spec, who: typeof (spec.who ?? id) === 'string' ? spec.who ?? id : null };
    }
    // Props.
    for (const [id, spec] of Object.entries(s.props ?? {})) {
      const p = PROP_BUILDERS[spec.kind](spec.opts ?? {});
      b.props[id] = { prop: p, spec };
    }
    // Weather.
    if (s.rain) {
      b.rain = createRain(s.rain);
      root.add(b.rain.object);
    }
    return b;
  }

  /** Put everything back where the script starts it. */
  function reset() {
    const b = built;
    b.tracks = [];
    b.fired = new Set();
    for (const [, { set, spec }] of Object.entries(b.sets)) {
      if (set.setDoor) set.setDoor(spec.door ?? 0);
      if (set.setBarrier) set.setBarrier(spec.barrier ?? 0);
    }
    for (const c of Object.values(b.cars)) {
      const { car, spec } = c;
      place(car.group, spec.at, headingOf(spec, spec.at), RIDE_HEIGHT);
      car.group.visible = !spec.hidden;
      car.setLights(!!spec.lights);
      car.setHeadlights(!!spec.headlights);
      c.dist = 0;
      for (const w of car.wheels) {
        w.wheel.rotation.x = 0;
        w.steer.rotation.y = 0;
      }
    }
    for (const a of Object.values(b.actors)) {
      const { fig, spec } = a;
      place(fig.group, spec.at, headingOf(spec, spec.at));
      fig.group.visible = !spec.hidden;
      fig.setPose(spec.pose ?? 'stand');
    }
    for (const [id, { prop, spec }] of Object.entries(b.props)) attachProp(id, spec);
    fadeValue = script.fadeIn === false ? 0 : 1;
    if (script.fadeIn !== false) b.tracks.push({ kind: 'fade', t0: 0, dur: script.fadeIn ?? 0.8, from: 1, to: 0 });
    choice = null;
    waitingChoice = false;
    ended = false;
  }

  function attachProp(id, spec) {
    const p = built.props[id].prop.group;
    p.removeFromParent();
    p.position.set(0, 0, 0);
    p.rotation.set(0, 0, 0);
    if (spec.attach) {
      const [who, socket] = spec.attach;
      built.actors[who].fig.sockets[socket].add(p);
      if (spec.offset) p.position.set(...spec.offset);
      if (spec.rot) p.rotation.set(...spec.rot.map((v) => v * D2R));
    } else if (spec.at) {
      root.add(p);
      p.position.set(spec.at[0], spec.at[1], spec.at[2]);
      if (spec.rot) p.rotation.set(...spec.rot.map((v) => v * D2R));
    }
    p.visible = !spec.hidden;
  }

  // --- cues --------------------------------------------------------------------------
  function actorPos(id) {
    const a = built.actors[id] ?? built.cars[id];
    if (!a) throw new Error(`no actor or car "${id}" in scene ${script.id}`);
    const g = a.fig?.group ?? a.car.group;
    return [g.position.x, g.position.z];
  }

  function fire(c) {
    const b = built;
    if (c.pose) b.actors[c.pose].fig.setPose(c.to, { blend: c.blend ?? 0.45 });
    if (c.walk) {
      const a = b.actors[c.walk];
      const pts = [actorPos(c.walk), ...c.path];
      const lens = [0];
      for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      b.tracks = b.tracks.filter((t) => !(t.kind === 'walk' && t.id === c.walk));
      // Stepping down from a floor that is higher than the ground (the booth's plinth).
      if (c.y != null) a.fig.group.position.y = c.y;
      b.tracks.push({ kind: 'walk', id: c.walk, fig: a.fig, t0: c.t, pts, lens, speed: c.speed ?? (c.run ? 4.2 : 1.35), run: c.run ? 1 : 0, then: c.then ?? 'stand', face: c.face, h: a.fig.height });
    }
    if (c.turn) {
      const a = b.actors[c.turn] ?? b.cars[c.turn];
      const g = a.fig?.group ?? a.car.group;
      const to = Array.isArray(c.to) ? headingTo([g.position.x, g.position.z], c.to) : c.to;
      let from = g.rotation.y;
      // Shortest way round.
      while (to - from > Math.PI) from += Math.PI * 2;
      while (from - to > Math.PI) from -= Math.PI * 2;
      b.tracks.push({ kind: 'turn', g, t0: c.t, dur: c.dur ?? 0.6, from, to });
    }
    if (c.drive) {
      const car = b.cars[c.drive];
      const start = [car.car.group.position.x, car.car.group.position.z];
      const pts = [start, ...c.path].map(([x, z]) => new THREE.Vector3(x, RIDE_HEIGHT, z));
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      b.tracks = b.tracks.filter((t) => !(t.kind === 'drive' && t.car === car));
      b.tracks.push({ kind: 'drive', car, curve, len: curve.getLength(), t0: c.t, dur: c.dur, ease: ease[c.ease ?? 'inOut'], reverse: !!c.reverse, dist0: car.dist });
    }
    if (c.lights) b.cars[c.lights].car.setLights(c.on);
    if (c.headlights) b.cars[c.headlights].car.setHeadlights(c.on);
    if (c.show) visible(c.show, true);
    if (c.hide) visible(c.hide, false);
    if (c.attach) attachProp(c.attach, { attach: c.to, offset: c.offset, rot: c.rot });
    if (c.place) attachProp(c.place, { at: c.at, rot: c.rot });
    if (c.toss) {
      const p = b.props[c.toss].prop.group;
      const from = new THREE.Vector3();
      p.getWorldPosition(from);
      root.worldToLocal(from);
      p.removeFromParent();
      root.add(p);
      p.position.copy(from);
      b.tracks.push({ kind: 'toss', id: c.toss, p, t0: c.t, dur: c.dur ?? 0.9, from, to: c.to, height: c.height ?? 0.7 });
    }
    if (c.set) {
      const set = b.sets[c.set].set;
      const kind = c.door != null ? 'door' : 'barrier';
      const to = c.door ?? c.barrier;
      b.tracks.push({ kind: 'setAnim', fn: kind === 'door' ? set.setDoor : set.setBarrier, from: c.from ?? (kind === 'door' ? (b.sets[c.set].spec.door ?? 0) : (b.sets[c.set].spec.barrier ?? 0)), to, t0: c.t, dur: c.dur ?? 1.5 });
    }
    if (c.fade != null) b.tracks.push({ kind: 'fade', t0: c.t, dur: c.dur ?? 0.8, from: fadeValue, to: c.fade });
    if (c.choice) {
      waitingChoice = true;
      playing = false;
      events.emit('choice', { prompt: c.prompt, options: c.choice });
      overlay?.showChoice(c.prompt ?? '', c.choice, (i) => choose(i));
    }
  }

  function visible(id, v) {
    const a = built.actors[id] ?? built.cars[id] ?? built.props[id];
    (a.fig?.group ?? a.car?.group ?? a.prop.group).visible = v;
  }

  let fadeValue = 1;

  function runTracks() {
    const b = built;
    for (const tr of b.tracks) {
      const u = tr.dur ? Math.min(1, Math.max(0, (time - tr.t0) / tr.dur)) : 1;
      if (tr.kind === 'fade') fadeValue = tr.from + (tr.to - tr.from) * ease.inOut(u);
      if (tr.kind === 'turn') tr.g.rotation.y = tr.from + (tr.to - tr.from) * ease.inOut(u);
      if (tr.kind === 'setAnim') tr.fn(tr.from + (tr.to - tr.from) * ease.inOut(u));
      if (tr.kind === 'walk' && !tr.done) {
        const total = tr.lens[tr.lens.length - 1];
        const d = Math.min(total, (time - tr.t0) * tr.speed);
        const at = pointAt(tr.pts, tr.lens, d);
        const ahead = pointAt(tr.pts, tr.lens, Math.min(total, d + 0.5));
        tr.fig.group.position.x = at[0];
        tr.fig.group.position.z = at[1];
        if (Math.hypot(ahead[0] - at[0], ahead[1] - at[1]) > 0.05) tr.fig.group.rotation.y = headingTo(at, ahead);
        const stride = (tr.run ? RUN_STRIDE : STRIDE) * (tr.h / 1.76);
        if (d < total) tr.fig.setPose(walkPose(d / stride, tr.run));
        else {
          tr.done = true;
          tr.fig.setPose(tr.then, { blend: 0.35 });
          if (tr.face) tr.fig.group.rotation.y = headingTo(at, tr.face);
        }
      }
      if (tr.kind === 'drive') {
        const k = tr.ease(u);
        const s = tr.len * k;
        const p = tr.curve.getPointAt(Math.min(1, k));
        const tan = tr.curve.getTangentAt(Math.min(1, k));
        const g = tr.car.car.group;
        g.position.x = p.x;
        g.position.z = p.z;
        let h = Math.atan2(-tan.x, -tan.z);
        if (tr.reverse) h += Math.PI;
        g.rotation.y = h;
        tr.car.dist = tr.dist0 + (tr.reverse ? -s : s);
        // Front wheels steer by the path's curvature; all four roll.
        const k2 = Math.min(1, k + 0.01);
        const t2 = tr.curve.getTangentAt(k2);
        let dh = Math.atan2(-t2.x, -t2.z) - Math.atan2(-tan.x, -tan.z);
        dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        const ds = Math.max(1e-3, tr.len * (k2 - k));
        const steer = Math.max(-0.55, Math.min(0.55, Math.atan((dh / ds) * WHEELBASE)));
        for (const w of tr.car.car.wheels) {
          w.wheel.rotation.x = -tr.car.dist / WHEEL_RADIUS;
          if (w.front) w.steer.rotation.y = u < 1 ? steer : 0;
        }
      }
      if (tr.kind === 'toss') {
        const [who, socket] = tr.to;
        const end = new THREE.Vector3();
        built.actors[who].fig.sockets[socket].getWorldPosition(end);
        root.worldToLocal(end);
        const e = ease.inOut(u);
        tr.p.position.lerpVectors(tr.from, end, e);
        tr.p.position.y += tr.height * 4 * u * (1 - u);
        tr.p.rotation.x = u * Math.PI * 3;
        if (u >= 1 && !tr.done) {
          tr.done = true;
          attachProp(tr.id, { attach: tr.to });
        }
      }
    }
  }

  function pointAt(pts, lens, d) {
    for (let i = 1; i < pts.length; i++) {
      if (d <= lens[i] || i === pts.length - 1) {
        const seg = lens[i] - lens[i - 1] || 1;
        const k = Math.min(1, Math.max(0, (d - lens[i - 1]) / seg));
        return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k];
      }
    }
    return pts[pts.length - 1];
  }

  // --- camera ------------------------------------------------------------------------------
  const _from = new THREE.Vector3();
  const _to = new THREE.Vector3();
  const _look = new THREE.Vector3();

  function targetOf(id, offset) {
    // "who:socket" aims at a hand or the head (a prop close-up).
    if (id.includes(':')) {
      const [who, socket] = id.split(':');
      const v = new THREE.Vector3();
      built.actors[who].fig.sockets[socket].getWorldPosition(v);
      root.worldToLocal(v);
      if (offset) v.add(new THREE.Vector3(...offset));
      return v;
    }
    const a = built.actors[id] ?? built.cars[id];
    const g = a.fig?.group ?? a.car.group;
    const off = offset ?? (a.fig ? [0, 1.45, 0] : [0, 0.1, 0]);
    return new THREE.Vector3(g.position.x + off[0], g.position.y + off[1], g.position.z + off[2]);
  }

  /** Index and local progress of the shot at time t. */
  function shotAt(t) {
    let t0 = 0;
    for (let i = 0; i < script.shots.length; i++) {
      const sh = script.shots[i];
      if (t < t0 + sh.dur || i === script.shots.length - 1) return { i, sh, u: Math.min(1, Math.max(0, (t - t0) / sh.dur)), t0 };
      t0 += sh.dur;
    }
    return null;
  }

  function applyCamera() {
    const { sh, u } = shotAt(time);
    const e = (ease[sh.ease ?? 'inOut'] ?? ease.inOut)(u);
    _from.set(...sh.from);
    _to.set(...(sh.to ?? sh.from));
    camera.position.lerpVectors(_from, _to, e);
    if (sh.follow) {
      root.updateMatrixWorld(true);
      camera.position.add(targetOf(sh.follow, [0, 0, 0]));
    }
    if (sh.track) {
      root.updateMatrixWorld(true);
      _look.copy(targetOf(sh.track, sh.trackOffset));
    }
    else {
      _look.set(...sh.look);
      if (sh.lookTo) _look.lerp(_to.set(...sh.lookTo), e);
    }
    camera.up.set(0, 1, 0);
    camera.lookAt(_look);
    const fov = sh.fov ?? 40;
    camera.fov = sh.fovTo != null ? fov + (sh.fovTo - fov) * e : fov;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
  }

  // --- stepping --------------------------------------------------------------------------------
  function step(dt, { visuals = true } = {}) {
    if (!script || ended) return;
    if (!waitingChoice) time = Math.min(duration, time + dt);
    for (const c of script.cues) {
      if (c.t <= time && !built.fired.has(c)) {
        built.fired.add(c);
        fire(c);
        if (waitingChoice) break;
      }
    }
    runTracks();
    for (const a of Object.values(built.actors)) a.fig.update(dt);
    for (const c of Object.values(built.cars)) c.car.update(dt);
    if (visuals) present();
    if (time >= duration && !waitingChoice) finish(false);
  }

  function present() {
    applyCamera();
    built.rain?.setTime(time);
    built.sky.position.copy(camera.position);
    if (overlay) {
      const line = currentLine();
      overlay.setLine(line);
      overlay.setFade(fadeValue);
    }
  }

  let lines = [];
  let duration = 0;
  let lineCache = new Map();
  function currentLine() {
    let cur = null;
    for (const l of lines) if (time >= l.t && time < l.t + l.dur) cur = l;
    if (!cur) return null;
    if (!lineCache.has(cur)) {
      const actor = built.actors[cur.who];
      const castId = actor?.who ?? cur.who;
      const c = CAST[castId];
      lineCache.set(cur, { name: c?.name ?? cur.who, color: c?.subtitle ?? null, text: cur.text });
    }
    return lineCache.get(cur);
  }

  function finish(skipped) {
    if (ended) return;
    ended = true;
    playing = false;
    events.emit('end', { id: script.id, skipped, choice });
  }

  function choose(i) {
    if (!waitingChoice) return;
    choice = i;
    waitingChoice = false;
    events.emit('chose', { id: script.id, choice: i });
    playing = true;
  }

  // --- public ----------------------------------------------------------------------------------
  function load(s) {
    unload();
    script = s;
    duration = sceneDuration(s);
    lines = sceneLines(s);
    lineCache = new Map();
    built = build(s);
    scene.add(root);
    reset();
    time = 0;
    step(0);
    overlay?.show(s.title);
  }

  function unload() {
    if (!built) return;
    scene.remove(root);
    for (const o of built.env) scene.remove(o);
    root.traverse((o) => {
      if (o.isMesh || o.isSprite || o.isPoints || o.isLineSegments) {
        if (o.geometry?.userData?.disposable) o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) if (m?.userData?.disposable) m.dispose();
      }
    });
    for (const c of Object.values(built.cars)) c.car.dispose();
    for (const a of Object.values(built.actors)) a.fig.dispose();
    built.rain?.dispose();
    built.base?.geometry.dispose();
    root.clear();
    scene.background = saved.background;
    scene.fog = saved.fog;
    camera.far = saved.far;
    camera.updateProjectionMatrix();
    built = null;
    script = null;
    overlay?.hide();
  }

  /** Deterministic jump: rebuild the start state and step at 60 Hz up to t. */
  function seek(t, { autoChoice = 0 } = {}) {
    if (!script) return;
    reset();
    time = 0;
    const DT = 1 / 60;
    while (time < t - 1e-9 && !ended) {
      step(Math.min(DT, t - time), { visuals: false });
      if (waitingChoice) {
        if (autoChoice == null) break;
        if (overlay) overlay.pickChoice(autoChoice);
        choose(autoChoice);
      }
    }
    if (!ended) present();
  }

  return {
    events,
    on: events.on,
    load,
    unload,
    play() {
      if (script && !ended) playing = true;
    },
    pause() {
      playing = false;
    },
    seek,
    /** Advance by real frame time while playing; also feeds the hold-to-skip. */
    update(dt) {
      if (!script) return;
      if (skipHeld > 0 && !waitingChoice) {
        skipHeld += dt;
        overlay?.setSkip(Math.min(1, skipHeld / 0.6));
        if (skipHeld >= 0.6) {
          skipHeld = 0;
          overlay?.setSkip(0);
          skip();
          return;
        }
      }
      if (playing) step(dt);
      else if (!ended) present();
    },
    /** Hold-to-skip input (Enter, or the gamepad's A): true while held. */
    holdSkip(held) {
      if (held && skipHeld === 0) skipHeld = 1e-6;
      if (!held) {
        skipHeld = 0;
        overlay?.setSkip(0);
      }
    },
    /** Skip to the scene's choice if it has one still ahead, else end it. */
    skip() {
      skip();
    },
    choose,
    get time() {
      return time;
    },
    get duration() {
      return duration;
    },
    get playing() {
      return playing;
    },
    get ended() {
      return ended;
    },
    get waitingChoice() {
      return waitingChoice;
    },
    get script() {
      return script;
    },
    get built() {
      return built;
    },
    shotAt: (t) => (script ? shotAt(t) : null),
  };

  function skip() {
    if (!script || ended) return;
    const c = script.cues.find((q) => q.choice && !built.fired.has(q));
    if (c) {
      seek(c.t, { autoChoice: null });
      playing = true;
    } else finish(true);
  }
}
