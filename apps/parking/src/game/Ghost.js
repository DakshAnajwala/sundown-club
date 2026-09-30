/**
 * Ghost.js — race your own best run (design/SPEC-retention.md §8.2).
 *
 * Every scored attempt is sampled at GHOST.hz (x, z relative to the target
 * and y, in cm; heading in 0.1 degrees; four int16 per sample). When the run
 * becomes the level's new best score, the samples are stored locally
 * (`parking-precision:ghost:v1`, base64) and replayed on the next attempt as
 * a translucent car.
 *
 * THE GHOST HAS NO PHYSICS BODY, by construction: it is two meshes and
 * nothing else. Parking sensors, the proximity radar and ParkCheck only ever
 * query the physics world or the player's chassis, so none of them can see
 * it — the same rule that keeps cones body-less.
 *
 * It fades to nothing within GHOST.fadeNearM[0] of the player's car, so at
 * the start line (where both cars sit on the same spot) it never fills the
 * seat view. Deliberately a simple silhouette (body + cabin, two draw calls)
 * rather than a clone of the real car's ~40-part mesh: it only has to read
 * as "you, earlier", and it is on screen for the whole run.
 *
 * Size caps: GHOST.maxBytesPerLevel per level (a longer run is decimated to
 * half rate, and dropped if still too big) and GHOST.maxBytesTotal overall
 * (the least recently saved ghosts are evicted first). Local only.
 */
import * as THREE from 'three';
import { COLORS } from '../world/Palette.js';
import { CHASSIS_SIZE, RIDE_HEIGHT } from '../vehicle/Dimensions.js';
import { GHOST } from './Retention.js';

const STORAGE_KEY = 'parking-precision:ghost:v1';
const FIELDS = 4; // x, z (cm, relative to target), y (cm), heading (0.1 deg)
const I16 = 32767;

const clampI16 = (v) => Math.max(-I16, Math.min(I16, Math.round(v)));

function toBase64(i16) {
  const bytes = new Uint8Array(i16.buffer, i16.byteOffset, i16.byteLength);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(b64) {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return new Int16Array(bytes.buffer, 0, Math.floor(bytes.length / 2));
}

/** [{ id, hz, d }] oldest first, re-validated. */
function readStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (!parsed || !Array.isArray(parsed.ghosts)) return [];
    return parsed.ghosts.filter(
      (g) =>
        g &&
        Number.isInteger(g.id) &&
        (g.hz === GHOST.hz || g.hz === GHOST.hz / 2) &&
        typeof g.d === 'string' &&
        g.d.length <= GHOST.maxBytesPerLevel &&
        /^[A-Za-z0-9+/]*={0,2}$/.test(g.d)
    );
  } catch {
    return [];
  }
}

function writeStore(ghosts) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, ghosts }));
    return true;
  } catch {
    return false;
  }
}

export function createGhost({ scene }) {
  // --- look -------------------------------------------------------------------
  const material = new THREE.MeshBasicMaterial({
    color: COLORS.ghost,
    transparent: true,
    opacity: GHOST.opacity,
    depthWrite: false,
  });
  material.userData = { disposable: true };
  const [w, , l] = CHASSIS_SIZE;
  const bodyGeo = new THREE.BoxGeometry(w, 0.62, l);
  const cabinGeo = new THREE.BoxGeometry(w * 0.86, 0.5, l * 0.48);
  bodyGeo.userData = { disposable: true };
  cabinGeo.userData = { disposable: true };
  const group = new THREE.Group();
  group.name = 'pb-ghost';
  const body = new THREE.Mesh(bodyGeo, material);
  body.position.y = 0.52 - RIDE_HEIGHT; // ground frame 0.21..0.83
  const cabin = new THREE.Mesh(cabinGeo, material);
  cabin.position.set(0, 1.08 - RIDE_HEIGHT, 0.12);
  for (const m of [body, cabin]) {
    m.castShadow = false;
    m.receiveShadow = false;
    m.renderOrder = 5;
  }
  group.add(body, cabin);
  group.visible = false;
  scene.add(group);

  // --- state ------------------------------------------------------------------
  let target = null; // [x, z] of the level's target
  let recording = null; // number[] while a run is being sampled
  let sinceSample = 0;
  let playback = null; // { samples: Int16Array, hz }
  let lastOpacity = 0;

  /**
   * Arm for a new attempt. `levelId` null (tutorial, daily) disarms entirely:
   * nothing is recorded or drawn.
   */
  function begin(levelId, levelTarget, enabled) {
    target = levelTarget;
    recording = enabled && levelId != null ? [] : null;
    sinceSample = 1 / GHOST.hz; // sample the start pose immediately
    playback = null;
    group.visible = false;
    if (!recording) return;
    const found = readStore().find((g) => g.id === levelId);
    if (found) {
      const samples = fromBase64(found.d);
      if (samples.length >= FIELDS) playback = { samples, hz: found.hz };
    }
  }

  /** Called every simulated frame while driving. */
  function sample(dt, runTimeSec, chassis, heading) {
    if (!recording) return;
    sinceSample += dt;
    if (sinceSample >= 1 / GHOST.hz - 1e-6) {
      sinceSample = 0;
      const deg = (((heading * 180) / Math.PI + 540) % 360) - 180;
      recording.push(
        clampI16((chassis.x - target[0]) * 100),
        clampI16((chassis.z - target[1]) * 100),
        clampI16(chassis.y * 100),
        clampI16(deg * 10)
      );
    }
    void runTimeSec;
  }

  /** Place the ghost for this moment of the run (render side). */
  function update(runTimeSec, carPos, driving) {
    if (!playback || !driving) {
      group.visible = false;
      return;
    }
    const s = playback.samples;
    const n = s.length / FIELDS;
    const f = Math.min(n - 1, Math.max(0, runTimeSec * playback.hz));
    const i = Math.floor(f);
    const j = Math.min(n - 1, i + 1);
    const t = f - i;
    const at = (k, field) => s[k * FIELDS + field];
    const x = target[0] + THREE.MathUtils.lerp(at(i, 0), at(j, 0), t) / 100;
    const z = target[1] + THREE.MathUtils.lerp(at(i, 1), at(j, 1), t) / 100;
    const y = THREE.MathUtils.lerp(at(i, 2), at(j, 2), t) / 100;
    let h0 = at(i, 3) / 10;
    let h1 = at(j, 3) / 10;
    if (h1 - h0 > 180) h1 -= 360;
    else if (h0 - h1 > 180) h1 += 360;
    const h = (THREE.MathUtils.lerp(h0, h1, t) * Math.PI) / 180;
    group.position.set(x, y, z);
    group.rotation.set(0, h, 0);
    const d = Math.hypot(x - carPos.x, z - carPos.z);
    const [near, far] = GHOST.fadeNearM;
    lastOpacity = GHOST.opacity * THREE.MathUtils.clamp((d - near) / (far - near), 0, 1);
    material.opacity = lastOpacity;
    group.visible = lastOpacity > 0.01;
  }

  /**
   * The run just became this level's best score: keep it. Returns the stored
   * size in bytes, or 0 when nothing was stored.
   */
  function saveBest(levelId) {
    if (!recording || recording.length < FIELDS) return 0;
    let hz = GHOST.hz;
    let data = Int16Array.from(recording);
    let b64 = toBase64(data);
    if (b64.length > GHOST.maxBytesPerLevel) {
      const half = [];
      for (let k = 0; k < data.length / FIELDS; k += 2) for (let f = 0; f < FIELDS; f++) half.push(data[k * FIELDS + f]);
      data = Int16Array.from(half);
      hz = GHOST.hz / 2;
      b64 = toBase64(data);
      if (b64.length > GHOST.maxBytesPerLevel) return 0;
    }
    const ghosts = readStore().filter((g) => g.id !== levelId);
    ghosts.push({ id: levelId, hz, d: b64 });
    let total = ghosts.reduce((a, g) => a + g.d.length, 0);
    while (total > GHOST.maxBytesTotal && ghosts.length > 1) total -= ghosts.shift().d.length;
    return writeStore(ghosts) ? b64.length : 0;
  }

  /** Stop recording without saving (fail, quit, restart). */
  function stop() {
    recording = null;
    group.visible = false;
  }

  function clearAll() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // nothing to clear
    }
  }

  return {
    begin,
    sample,
    update,
    saveBest,
    stop,
    clearAll,
    debug() {
      const ghosts = readStore();
      return {
        recording: Boolean(recording),
        samples: recording ? recording.length / FIELDS : 0,
        playback: playback ? playback.samples.length / FIELDS : 0,
        visible: group.visible,
        opacity: +lastOpacity.toFixed(3),
        stored: ghosts.map((g) => ({ id: g.id, hz: g.hz, bytes: g.d.length })),
        totalBytes: ghosts.reduce((a, g) => a + g.d.length, 0),
        pos: group.visible ? { x: group.position.x, y: group.position.y, z: group.position.z } : null,
      };
    },
  };
}
