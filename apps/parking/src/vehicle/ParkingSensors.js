/**
 * ParkingSensors.js — ultrasonic bumper sensors, simulated with raycasts.
 *
 * Each bumper carries a fan of five rays, fired horizontally at sensor height
 * against the physics world. The nearest hit per bumper is the reading. That
 * reading drives three things: the beep cadence (AudioSystem), the proximity
 * arcs on the instrument cluster (DashCluster), and the distance readout on
 * the reversing camera (BackupCamera).
 *
 * Why the rays start 2 cm OUTSIDE the chassis box rather than at its face: a
 * ray that starts inside or on a body's surface can report that body at
 * distance 0. Starting clear of it means the car can never detect itself, with
 * no collision-filter plumbing.
 *
 * What the sensors can and cannot see, by construction:
 *   - walls, pillars, parked cars: yes (static bodies at bumper height)
 *   - the floor: no (rays are horizontal, 0.45 m up)
 *   - kerbs: no (0.14 m tall, under the beam — same as many real systems)
 *   - cones: no, because cones have no physics body at all (see NOTES.md)
 *
 * Corner rays splay out only 20 degrees. At 35 degrees the corner rays of a car
 * sitting correctly in a 3.0 m bay caught the neighbouring cars ~1 m away and
 * the sensors beeped continuously at a perfect park.
 */
import * as CANNON from 'cannon-es';
import { BUMPER_Z, fromGround } from './Dimensions.js';

/** Maximum detection range from the bumper face, metres. */
export const SENSOR_RANGE = 1.5;
/** Front sensors only run below this speed in D, like a real system. */
const FRONT_ACTIVE_MS = 10 / 3.6;
/** Raycasts per second. The beep cadence doesn't need physics rate. */
const SAMPLE_HZ = 20;

const Y = fromGround(0.45);
const HALF_L = BUMPER_Z + 0.02;
const DEG = Math.PI / 180;

/** [x offset on the bumper, splay angle outward] for the five rays. */
const FAN = [
  [-0.78, -20 * DEG],
  [-0.4, -8 * DEG],
  [0, 0],
  [0.4, 8 * DEG],
  [0.78, 20 * DEG],
];

export function createParkingSensors({ physics, chassisBody }) {
  const from = new CANNON.Vec3();
  const to = new CANNON.Vec3();
  const localFrom = new CANNON.Vec3();
  const localTo = new CANNON.Vec3();
  const options = { skipBackfaces: true };

  let front = null;
  let rear = null;
  let accum = 1;
  let enabled = true;

  /** Nearest obstacle for one bumper, or null when nothing is in range. */
  function scan(dir) {
    // dir = -1 for the front (forward is local -Z), +1 for the rear.
    let best = Infinity;
    for (const [x, splay] of FAN) {
      // Splay is outward from the bumper's centreline on both ends, so the
      // sideways component has the same sign front and rear.
      const sx = Math.sin(splay);
      const sz = Math.cos(splay);
      localFrom.set(x, Y, dir * HALF_L);
      localTo.set(x + sx * SENSOR_RANGE, Y, dir * (HALF_L + sz * SENSOR_RANGE));
      chassisBody.pointToWorldFrame(localFrom, from);
      chassisBody.pointToWorldFrame(localTo, to);
      // raycastClosest, not raycastAll: it doesn't know to skip `isGround`
      // bodies (the floor, and now Level 13's pitched ramp slabs — a sensor
      // fan riding up a ramp must not report the ramp surface itself as an
      // "obstacle" ahead). Take the nearest hit that isn't ground.
      let nearest = Infinity;
      physics.world.raycastAll(from, to, options, (r) => {
        if (!r.hasHit || r.body?.userData?.isGround) return;
        if (r.distance < nearest) nearest = r.distance;
      });
      if (nearest < Infinity) {
        // A ray splayed outward travels further than the perpendicular
        // distance; report the component straight out from the bumper, which
        // is what "how much room is left" actually means.
        // +0.02 for the gap between the chassis face and the ray origin.
        const along = nearest * sz + 0.02;
        if (along < best) best = along;
      }
    }
    return best <= SENSOR_RANGE ? best : null;
  }

  return {
    /**
     * @param {number} dt
     * @param {{gear:string, speedMs:number}} s
     */
    update(dt, { gear, speedMs }) {
      accum += dt;
      if (accum < 1 / SAMPLE_HZ) return;
      accum = 0;

      const moving = gear === 'R' || gear === 'D';
      if (!enabled || !moving) {
        front = null;
        rear = null;
        return;
      }
      // Rear sensors run in reverse; front sensors in either gear, but only at
      // parking speeds so driving along a lane beside a wall stays quiet.
      rear = gear === 'R' ? scan(1) : null;
      front = speedMs < FRONT_ACTIVE_MS ? scan(-1) : null;
    },

    /** Scan both bumpers now, ignoring gear and the sample clock. Verification. */
    measure() {
      return { front: scan(-1), rear: scan(1) };
    },

    reset() {
      front = null;
      rear = null;
      accum = 1;
    },

    setEnabled(v) {
      enabled = v;
      if (!v) {
        front = null;
        rear = null;
      }
    },
    get enabled() {
      return enabled;
    },

    /** Latest readings in metres from each bumper face, null = clear. */
    get readings() {
      return { front, rear };
    },

    /** The closer of the two, or null. */
    get nearest() {
      if (front == null) return rear;
      if (rear == null) return front;
      return Math.min(front, rear);
    },
  };
}
