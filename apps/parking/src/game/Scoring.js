/**
 * Scoring.js — the run timer, the things you hit, and the score out of 100.
 *
 * Placement is judged on TWO axes, not one, because the two mistakes are not
 * equivalent: sitting 40 cm off-centre puts your door against the neighbour's,
 * while sitting 40 cm deep in a bay is invisible to everyone. Lateral accuracy
 * is therefore worth more than longitudinal, and each is measured against that
 * axis's own tolerance (see ParkCheck.js).
 *
 *   Placement (side to side)   30
 *   Depth (fore and aft)       20
 *   Alignment (heading)        25
 *   Time vs. par               15
 *   Finesse (nothing hit)      10
 *                             ----
 *                             100
 *
 * CONES: cones deliberately have no physics body — the car drives straight
 * through them, which is spec'd behaviour. So they are scored by an explicit
 * overlap test here, and knocked flat visually when you clip one. You get the
 * feedback and the penalty without breaking the phase-through rule.
 */
import * as THREE from 'three';
import { CHASSIS_SIZE } from '../vehicle/Dimensions.js';

const HALF_W = CHASSIS_SIZE[0] / 2;
const HALF_L = CHASSIS_SIZE[2] / 2;
/** Cone radius plus a little, for the overlap test. */
const CONE_PAD = 0.2;

const WEIGHTS = { placement: 30, depth: 20, alignment: 25, time: 15, finesse: 10 };
const PENALTY = { bump: 4, cone: 2, kerb: 3 };
export const STAR_CUTOFFS = [88, 68]; // 3 stars, then 2, else 1

export function createScoring({ level, physics, cones = [] }) {
  let elapsed = 0;
  let bumps = 0;
  let kerbHits = 0;
  let finished = false;

  // Cone bookkeeping: each entry tracks whether it has already been counted,
  // plus a little animation state for tipping it over.
  const coneState = cones.map((mesh) => ({
    mesh,
    home: mesh.position.clone(),
    struck: false,
    t: 0,
    axis: null,
  }));

  const unsub = physics.events.on('bump', ({ kind, speedMs }) => {
    if (finished) return;
    // A gentle kiss of the kerb while creeping is not the same event as
    // clouting a pillar; below walking pace it does not count against you.
    if (speedMs < 0.35) return;
    if (kind === 'kerb') kerbHits += 1;
    else bumps += 1;
  });

  const localPos = new THREE.Vector3();
  const invQuat = new THREE.Quaternion();
  const carQuat = new THREE.Quaternion();

  function updateCones(dt, car) {
    carQuat.set(
      car.chassisBody.quaternion.x,
      car.chassisBody.quaternion.y,
      car.chassisBody.quaternion.z,
      car.chassisBody.quaternion.w
    );
    invQuat.copy(carQuat).invert();

    for (const c of coneState) {
      if (!c.struck && !finished) {
        // Cone position in the car's own frame: an oriented-box overlap test,
        // which a world-space distance check would get wrong on a car sitting
        // at 45 degrees.
        localPos
          .set(c.home.x, 0, c.home.z)
          .sub(new THREE.Vector3(car.chassisBody.position.x, 0, car.chassisBody.position.z))
          .applyQuaternion(invQuat);
        if (Math.abs(localPos.x) < HALF_W + CONE_PAD && Math.abs(localPos.z) < HALF_L + CONE_PAD) {
          c.struck = true;
          // Tip it away from the car's centreline, so it falls the way it was
          // shoved rather than always the same direction.
          c.axis = Math.sign(localPos.x) || 1;
        }
      }
      if (c.struck && c.t < 1) {
        c.t = Math.min(1, c.t + dt * 4);
        const e = 1 - (1 - c.t) * (1 - c.t); // ease out
        c.mesh.rotation.z = -c.axis * e * (Math.PI / 2) * 0.94;
        c.mesh.position.y = c.home.y - e * 0.02;
      }
    }
  }

  function coneStrikes() {
    return coneState.filter((c) => c.struck).length;
  }

  function update(dt, car) {
    if (!finished) elapsed += dt;
    updateCones(dt, car);
  }

  /**
   * Close the run and produce the breakdown.
   * @param {object} status the final ParkCheck result
   */
  function finish(status) {
    finished = true;
    const strikes = coneStrikes();

    // Each accuracy term is 1 at dead-centre and 0 at the edge of tolerance.
    const lateralAcc = clamp01(1 - Math.abs(status.lateral) / status.lateralTol);
    const depthAcc = clamp01(1 - Math.abs(status.longitudinal) / status.longitudinalTol);
    const alignAcc = clamp01(1 - status.headingErrDeg / level.target.tolerance.headingDeg);

    // Full marks at or under par, decaying to zero at 2.5x par.
    const par = level.parTime ?? 60;
    const timeAcc = clamp01(1 - Math.max(0, elapsed - par) / (par * 1.5));

    const penalties =
      bumps * PENALTY.bump + strikes * PENALTY.cone + kerbHits * PENALTY.kerb;
    const finesse = Math.max(0, WEIGHTS.finesse - penalties);

    const parts = {
      placement: WEIGHTS.placement * lateralAcc,
      depth: WEIGHTS.depth * depthAcc,
      alignment: WEIGHTS.alignment * alignAcc,
      time: WEIGHTS.time * timeAcc,
      finesse,
    };
    const score = Math.max(0, Math.round(Object.values(parts).reduce((a, b) => a + b, 0)));
    const stars = score >= STAR_CUTOFFS[0] ? 3 : score >= STAR_CUTOFFS[1] ? 2 : 1;

    const breakdown = [
      {
        label: 'Placement in bay',
        detail: `${Math.abs(status.lateral * 100).toFixed(0)} cm off centre · ${Math.round(parts.placement)}`,
        points: parts.placement,
      },
      {
        label: 'Depth',
        detail: `${Math.abs(status.longitudinal * 100).toFixed(0)} cm off · ${Math.round(parts.depth)}`,
        points: parts.depth,
      },
      {
        label: 'Alignment',
        detail: `${status.headingErrDeg.toFixed(1)}° out · ${Math.round(parts.alignment)}`,
        points: parts.alignment,
      },
      {
        label: 'Time',
        detail: `${elapsed.toFixed(1)}s (par ${par}s) · ${Math.round(parts.time)}`,
        points: parts.time,
      },
    ];
    if (bumps) breakdown.push({ label: 'Bumps', detail: `${bumps} · −${bumps * PENALTY.bump}`, points: -1 });
    if (strikes) breakdown.push({ label: 'Cones flattened', detail: `${strikes} · −${strikes * PENALTY.cone}`, points: -1 });
    if (kerbHits) breakdown.push({ label: 'Kerb strikes', detail: `${kerbHits} · −${kerbHits * PENALTY.kerb}`, points: -1 });
    if (!bumps && !strikes && !kerbHits) {
      breakdown.push({ label: 'Clean run', detail: `no contact · ${WEIGHTS.finesse}`, points: WEIGHTS.finesse });
    }

    // parts/max/par are additive (retention pass): Retention.explain() reads
    // them to say where the points went. They are the same numbers the score
    // was summed from, so nothing downstream can compute a different total.
    return {
      score,
      stars,
      breakdown,
      timeSec: elapsed,
      bumps,
      cones: strikes,
      kerbHits,
      parts,
      max: { ...WEIGHTS },
      par,
    };
  }

  function reset() {
    elapsed = 0;
    bumps = 0;
    kerbHits = 0;
    finished = false;
    for (const c of coneState) {
      c.struck = false;
      c.t = 0;
      c.mesh.rotation.z = 0;
      c.mesh.position.copy(c.home);
    }
  }

  return {
    update,
    finish,
    reset,
    dispose: () => unsub?.(),
    get state() {
      return { timeSec: elapsed, bumps, cones: coneStrikes(), kerbHits };
    },
  };
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));
