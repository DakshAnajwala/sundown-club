/**
 * ParkCheck.js — "is the car actually parked?", evaluated every frame.
 *
 * The key difference from v3: this works in BAY-LOCAL space, not in radial
 * distance from a point. A bay is 3.0 x 5.4 m, so being 0.5 m too far forward
 * and being 0.5 m too far sideways are completely different situations — one
 * is fine, the other has you straddling the line into your neighbour. v3's
 * `hypot(dx, dz) <= tolerance` treated them identically and, with a single
 * 0.3 m tolerance, demanded pinpoint longitudinal placement that no real
 * parking manoeuvre needs.
 *
 * Tolerances are derived from GEOMETRY rather than hand-tuned per level: you
 * are parked when the car actually fits inside the painted bay. For a 3.0 m bay
 * and a 1.78 m car that is +/-0.61 m of lateral slop; for a 7.2 m parallel space
 * and a 4.2 m car it is +/-1.5 m along the kerb. Both fall out of the same two
 * lines of arithmetic, and both automatically stay correct if a bay is resized.
 */
import { CHASSIS_SIZE, RIDE_HEIGHT } from '../vehicle/Dimensions.js';

const CAR_WIDTH = CHASSIS_SIZE[0];
const CAR_LENGTH = CHASSIS_SIZE[2];

/** How long the car must hold a valid pose before it counts. */
const DWELL_SEC = 0.5;
/** Below this the car counts as stationary. */
const PARK_SPEED_MS = 0.25;

/** Smallest signed angle between two headings, radians. */
export function angleDelta(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function createParkCheck({ level }) {
  const target = level.target;
  const heading = target.heading;
  const cos = Math.cos(heading);
  const sin = Math.sin(heading);

  // Clearance available inside the painted bay, per axis. A small safety inset
  // keeps a "parked" car from resting exactly on the line.
  const INSET = 0.04;
  const lateralTol = Math.max(0.18, (target.bay.width - CAR_WIDTH) / 2 - INSET);
  const longitudinalTol = Math.max(0.25, (target.bay.length - CAR_LENGTH) / 2 - INSET);
  const headingTol = (target.tolerance.headingDeg * Math.PI) / 180;

  let dwell = 0;
  let complete = false;

  /**
   * @param {number} dt
   * @param {{position:{x:number,z:number}, heading:number, speedMs:number,
   *          gear:string}} car
   */
  function update(dt, car) {
    const dx = car.position.x - target.pos[0];
    const dz = car.position.z - target.pos[1];

    // World -> bay-local. The bay's local +X is its width axis and +Z its
    // length axis, matching how createBayMarkings lays the paint out.
    const lateral = dx * cos - dz * sin;
    const longitudinal = dx * sin + dz * cos;

    const headingErr = angleDelta(car.heading, heading);
    const absHeadingErr = Math.abs(headingErr);

    const withinLateral = Math.abs(lateral) <= lateralTol;
    const withinLongitudinal = Math.abs(longitudinal) <= longitudinalTol;
    // Multi-floor levels (target.y set, e.g. Level 13's roof) only: the same
    // x/z can sit under the target on a lower floor, directly below the
    // ramp-hole opening in the slab above it. SPEC-level13.md §5.4.
    const withinFloor = target.y == null || Math.abs((car.position.y ?? 0) - (target.y + RIDE_HEIGHT)) <= 1.0;
    const inBay = withinLateral && withinLongitudinal && withinFloor;

    // In the bay but backwards is worth calling out specifically — otherwise a
    // player who pulls nose-first into a reverse-in bay just sees "not parked"
    // with no idea why. It must require inBay: Roof One spawns facing exactly
    // opposite its target, and without that the prompt said "Right bay, wrong
    // way round" from 30 m away.
    const wrongWay = inBay && Math.abs(Math.abs(headingErr) - Math.PI) < headingTol;
    const aligned = absHeadingErr <= headingTol;
    const stopped = car.speedMs < PARK_SPEED_MS;
    const inPark = car.gear === 'P';

    // The pose must be right BEFORE the handbrake question: this is what stops
    // a car rolling through the bay from banking a dwell timer.
    const posed = inBay && aligned && stopped;
    if (posed) dwell = Math.min(DWELL_SEC, dwell + dt);
    else dwell = 0;

    const settled = dwell >= DWELL_SEC;
    if (settled && inPark) complete = true;

    return {
      lateral,
      longitudinal,
      headingErrDeg: (absHeadingErr * 180) / Math.PI,
      // Signed (GOAL Part C §6): positive = nose rotated counter-clockwise
      // from above = toward the car's left. Same angleDelta as headingErrDeg,
      // just not abs()'d — one source of truth, per the spec's own rule.
      headingErrSignedDeg: (headingErr * 180) / Math.PI,
      lateralTol,
      longitudinalTol,
      inBay,
      aligned,
      stopped,
      wrongWay,
      inPark,
      /** Pose is good and held; only the gear selector is outstanding. */
      settled,
      complete,
      /** 0..1, for the target bay's "you're on it" feedback. */
      dwellFrac: dwell / DWELL_SEC,
      /** What the HUD should be telling the player to do next. */
      prompt: describe({ inBay, aligned, stopped, wrongWay, settled, inPark, complete }),
    };
  }

  function describe(s) {
    if (s.complete) return 'Parked.';
    if (s.settled && !s.inPark) return 'Shift to P to finish';
    if (s.wrongWay) return 'Right bay, wrong way round';
    if (!s.inBay) return 'Get the car inside the bay';
    if (!s.aligned) return 'Straighten up';
    if (!s.stopped) return 'Come to a stop';
    return 'Hold it there';
  }

  function reset() {
    dwell = 0;
    complete = false;
  }

  return { update, reset, lateralTol, longitudinalTol };
}
