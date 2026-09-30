import { STAR_THRESHOLDS, DEFAULT_THREE_STAR_SEC } from './thresholds.js';

const DWELL_SEC = 0.5;
const PARK_SPEED_MS = 0.2;

function createEmitter() {
  const listeners = new Map();
  return {
    on(event, cb) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(cb);
    },
    emit(event, payload) {
      listeners.get(event)?.forEach((cb) => cb(payload));
    },
  };
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

// Bump counter, timer, park-detection (dwell-timer gated), score/star calc.
export function createScoring({ physicsWorld, car, level, levelId }) {
  const emitter = createEmitter();
  let bumps = 0;
  let elapsedSec = 0;
  let parked = false;
  let dwellTimer = 0;

  const contactHandler = ({ chassisBody }) => {
    if (chassisBody !== car.chassisBody) return;
    if (parked) return;
    bumps += 1;
  };
  physicsWorld.events.on('contact', contactHandler);

  function computeStars() {
    if (bumps === 0) {
      const thresh = STAR_THRESHOLDS[levelId]?.threeStarSec ?? DEFAULT_THREE_STAR_SEC;
      if (elapsedSec <= thresh) return 3;
    }
    if (bumps <= 2) return 2;
    return 1;
  }

  function update(dt) {
    if (parked) return;
    elapsedSec += dt;

    const carState = car.getState();
    const dx = carState.position.x - level.target.pos[0];
    const dz = carState.position.z - level.target.pos[2];
    const posDist = Math.hypot(dx, dz);
    const headingDiff = angleDiff(carState.rotationY, level.target.rotY);
    const headingDiffDeg = (headingDiff * 180) / Math.PI;
    const speedMs = carState.speedKmh / 3.6;

    const inTolerance =
      posDist <= level.target.posTolerance &&
      headingDiffDeg <= level.target.rotToleranceDeg &&
      speedMs < PARK_SPEED_MS;

    if (inTolerance) {
      dwellTimer += dt;
      if (dwellTimer >= DWELL_SEC) {
        parked = true;
        const stars = computeStars();
        emitter.emit('parked', { stars, timeSec: elapsedSec, bumps });
      }
    } else {
      dwellTimer = 0;
    }
  }

  function getState() {
    return { bumps, elapsedSec, parked };
  }

  function reset() {
    bumps = 0;
    elapsedSec = 0;
    parked = false;
    dwellTimer = 0;
  }

  function dispose() {
    physicsWorld.events.off('contact', contactHandler);
  }

  return { update, getState, reset, on: emitter.on, dispose };
}
