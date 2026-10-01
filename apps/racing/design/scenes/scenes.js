/**
 * scenes.js — the Scene Lab: plays every story scene in the engine with the
 * real ScenePlayer and overlay (design/SPEC-scenes.md). Pick a scene, play,
 * scrub, jump to a shot, hold Enter to skip, or free the camera to look
 * round the set. A design tool, not the game.
 *
 * Dev builds expose window.__scenes for tools/scenes-shot.mjs.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createScenePlayer, sceneLines, sceneDuration, readTime } from '../../src/story/ScenePlayer.js';
import { createSceneOverlay } from '../../src/ui/SceneOverlay.js';
import { SCENES, SCENE_BY_ID } from '../../src/story/scenes/index.js';
import { CAST } from '../../src/story/cast.js';

const container = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

// ONE scene and ONE camera; the player writes into them.
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.05, 2400);
const overlay = createSceneOverlay(document.body);
const player = createScenePlayer({ scene, camera, overlay });

const free = { on: false, controls: new OrbitControls(camera, renderer.domElement) };
free.controls.enabled = false;

let current = null;
let lastEnd = null;
player.on('end', (e) => {
  lastEnd = e;
  buildPanel();
});

function load(id) {
  current = SCENE_BY_ID[id];
  lastEnd = null;
  player.load(current);
  buildPanel();
}

// --- panel -----------------------------------------------------------------------------
const panel = document.createElement('div');
panel.className = 'panel';
document.body.append(panel);
let slider = null;
let timeEl = null;

function el(tag, attrs = {}, text) {
  const e = document.createElement(tag);
  Object.assign(e, attrs);
  if (text != null) e.textContent = text;
  return e;
}

function buildPanel() {
  panel.innerHTML = '';
  panel.append(el('h1', {}, 'Scene Lab'), el('div', { style: 'color:#9aa6b6' }, 'Space play/pause · hold Enter skip · F free camera · H hide panel'));
  const list = el('div', { className: 'scene-list' });
  let ch = null;
  for (const s of SCENES) {
    if (s.chapter !== ch) {
      ch = s.chapter;
      list.append(el('div', { className: 'ch' }, ch));
    }
    const b = el('button', { className: current?.id === s.id ? 'on' : '' }, `${s.title}  ·  ${sceneDuration(s).toFixed(0)} s`);
    b.addEventListener('click', () => {
      b.blur();
      load(s.id);
      player.play();
    });
    list.append(b);
  }
  panel.append(list);
  if (!current) return;
  panel.append(el('h2', {}, 'Play'));
  const row = el('div', { className: 'row' });
  const btn = (label, fn, on) => {
    const b = el('button', { className: on ? 'on' : '' }, label);
    b.addEventListener('click', () => {
      b.blur();
      fn();
      buildPanel();
    });
    row.append(b);
  };
  btn(player.playing ? 'Pause' : 'Play', () => (player.playing ? player.pause() : (player.ended ? (load(current.id), player.play()) : player.play())));
  btn('Restart', () => {
    load(current.id);
    player.play();
  });
  btn('Skip', () => player.skip());
  btn(`Free camera: ${free.on ? 'on' : 'off'}`, toggleFree, free.on);
  panel.append(row);
  slider = el('input', { type: 'range', min: 0, max: sceneDuration(current), step: 0.05, value: player.time });
  slider.addEventListener('input', () => {
    player.pause();
    player.seek(+slider.value);
  });
  timeEl = el('div', { className: 'time' });
  panel.append(slider, timeEl);
  panel.append(el('h2', {}, 'Shots'));
  const shots = el('div', { className: 'row' });
  let t0 = 0;
  current.shots.forEach((sh, i) => {
    const t = t0;
    const b = el('button', {}, `${i + 1}`);
    b.title = `${t.toFixed(1)} s, ${sh.dur} s`;
    b.addEventListener('click', () => {
      b.blur();
      player.pause();
      player.seek(t + 0.01);
    });
    shots.append(b);
    t0 += sh.dur;
  });
  panel.append(shots);
  panel.append(el('h2', {}, 'About'));
  panel.append(el('div', { style: 'color:#9aa6b6;white-space:pre-wrap' }, `${current.when}\n\n${current.summary}`));
  if (lastEnd) panel.append(el('div', { className: 'time' }, `ended${lastEnd.skipped ? ' (skipped)' : ''}${lastEnd.choice != null ? `, choice ${lastEnd.choice}` : ''}`));
}

function toggleFree() {
  free.on = !free.on;
  free.controls.enabled = free.on;
  if (free.on) {
    player.pause();
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    free.controls.target.copy(camera.position).addScaledVector(dir, 6);
    free.controls.update();
  }
}

// --- input -------------------------------------------------------------------------------
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'Enter') {
    if (overlay.choosing) overlay.pickChoice();
    else player.holdSkip(true);
  }
  if (overlay.choosing && (e.code === 'ArrowUp' || e.code === 'ArrowDown')) overlay.moveChoice(e.code === 'ArrowUp' ? -1 : 1);
  if (e.code === 'Digit1' && overlay.choosing) overlay.pickChoice(0);
  if (e.code === 'Digit2' && overlay.choosing) overlay.pickChoice(1);
  if (e.code === 'Space') {
    e.preventDefault();
    player.playing ? player.pause() : player.play();
    buildPanel();
  }
  if (e.code === 'KeyF') {
    toggleFree();
    buildPanel();
  }
  if (e.code === 'KeyH') panel.classList.toggle('hidden');
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Enter') player.holdSkip(false);
});

// --- loop --------------------------------------------------------------------------------
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (free.on) free.controls.update();
  else player.update(dt);
  if (slider && player.playing) slider.value = player.time;
  if (timeEl && current) {
    const sh = player.shotAt(player.time);
    timeEl.textContent = `${player.time.toFixed(2)} / ${player.duration.toFixed(1)} s · shot ${sh ? sh.i + 1 : '-'} of ${current.shots.length}`;
  }
  renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const first = new URLSearchParams(location.search).get('scene') ?? SCENES[0].id;
load(first);
player.play();

// --- probe hooks ------------------------------------------------------------------------------
if (import.meta.env.DEV) {
  window.__scenes = {
    list: () => SCENES.map((s) => ({ id: s.id, title: s.title, chapter: s.chapter, duration: sceneDuration(s), shots: s.shots.length })),
    load: (id) => {
      load(id);
      player.pause();
      panel.classList.add('hidden');
      return true;
    },
    seek: (t) => {
      player.pause();
      player.seek(t);
      return { time: player.time, ended: player.ended, waitingChoice: player.waitingChoice };
    },
    /** Shot start times and lines with timing, for the probe's checks. */
    info: (id) => {
      const s = SCENE_BY_ID[id];
      let t0 = 0;
      const shots = s.shots.map((sh) => {
        const r = { t0, dur: sh.dur };
        t0 += sh.dur;
        return r;
      });
      const lines = sceneLines(s).map((l) => ({ ...l, min: readTime(l.text) }));
      const speakers = [...new Set(lines.map((l) => l.who))].map((w) => ({ id: w, castId: s.cast?.[w]?.who ?? w, known: !!CAST[s.cast?.[w]?.who ?? w] }));
      const cues = s.cues.map((c) => c.t);
      return { duration: sceneDuration(s), shots, lines, speakers, cues, hasChoice: s.cues.some((c) => c.choice) };
    },
    /** Hold Enter for 0.7 s of scene time: the scene must end, or stop at its choice. */
    skipTest: () => {
      player.seek(1);
      player.holdSkip(true);
      for (let i = 0; i < 50; i++) player.update(1 / 60);
      player.holdSkip(false);
      return { ended: player.ended, waitingChoice: player.waitingChoice, lastEnd };
    },
    choose: (i) => {
      overlay.pickChoice(i);
      for (let k = 0; k < 600 && !player.ended; k++) player.update(1 / 60);
      return { ended: player.ended, lastEnd };
    },
    /** World positions of the camera and every actor, for overlap checks. */
    where: () => {
      const b = player.built;
      const out = { camera: camera.position.toArray(), actors: {} };
      for (const [id, a] of Object.entries(b.actors)) out.actors[id] = { pos: a.fig.group.position.toArray(), visible: a.fig.group.visible };
      for (const [id, c] of Object.entries(b.cars)) out.actors[id] = { pos: c.car.group.position.toArray(), visible: c.car.group.visible, car: true };
      // Is the camera inside anybody (a figure's or a car's bounding box)?
      out.inside = [];
      const box = new THREE.Box3();
      for (const [id, a] of [...Object.entries(b.actors).map(([k, v]) => [k, v.fig.group]), ...Object.entries(b.cars).map(([k, v]) => [k, v.car.group])]) {
        if (!a.visible) continue;
        box.setFromObject(a).expandByScalar(-0.04);
        if (box.containsPoint(camera.position)) out.inside.push(id);
      }
      return out;
    },
    render: () => renderer.render(scene, camera),
  };
}
