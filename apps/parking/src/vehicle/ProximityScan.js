/**
 * ProximityScan.js — what is solid near the car, in car-local space.
 *
 * WHY NOT THE PARKING SENSORS
 * ParkingSensors.js is two five-ray fans with a 1.5 m range and a ±20° splay:
 * exactly right for a beeping bumper aid, and useless for a 360° display. The
 * radar needs to know about things beside and behind the car, out to about a
 * car park aisle's width, so it reads the level's static bodies directly
 * instead of casting rays for them.
 *
 * WHAT IT RETURNS
 * Footprints, not points. Each obstacle comes back as its four corners in the
 * car's own frame (x right, z forward, origin at the chassis centre), plus the
 * distance from the car's collision box to the nearest of them. Drawing the
 * footprint rather than a blob is what makes a pillar read as a pillar and a
 * parked car read as a car.
 *
 * FLOOR FILTERING IS NOT OPTIONAL
 * Level 13 stacks five decks 3.2 m apart. Without a vertical test the radar
 * shows the deck above you as a solid wall in every direction. Only bodies
 * whose vertical extent overlaps the car's own band are kept.
 */
import { CHASSIS_SIZE } from './Dimensions.js';

/** How far out the radar looks, metres from the car's centre. */
export const RADAR_RANGE = 12;
/** Vertical half-band around the car that counts as "this floor". */
const FLOOR_BAND = 1.2;
/** Scans per second. The display is a driving aid, not a physics reading. */
const SAMPLE_HZ = 15;

const HALF_W = CHASSIS_SIZE[0] / 2;
const HALF_L = CHASSIS_SIZE[2] / 2;

/**
 * Distance from the car's collision box to a point in car-local space.
 * Zero inside the box. This is the same "how much room have I got" measure the
 * bumper sensors report, so the two never disagree about a gap.
 */
function boxDistance(x, z) {
  const dx = Math.max(Math.abs(x) - HALF_W, 0);
  const dz = Math.max(Math.abs(z) - HALF_L, 0);
  return Math.hypot(dx, dz);
}

export function createProximityScan({ physics, chassisBody }) {
  let blips = [];
  let accum = 1;
  let enabled = true;

  function scan() {
    const out = [];
    const p = chassisBody.position;
    const q = chassisBody.quaternion;
    // Chassis yaw only: the radar is a plan view, so roll and pitch would only
    // smear the footprints.
    const yaw = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x));
    const cos = Math.cos(-yaw);
    const sin = Math.sin(-yaw);

    for (const body of physics.staticBodies) {
      if (body === chassisBody) continue;
      if (body.userData?.isGround) continue; // the floor is not an obstacle

      const bp = body.position;
      const dx = bp.x - p.x;
      const dz = bp.z - p.z;
      if (dx * dx + dz * dz > (RADAR_RANGE + 6) ** 2) continue;

      const shape = body.shapes[0];
      const he = shape?.halfExtents;
      if (!he) continue;

      // Floor test before any corner maths: on a five-deck car park this is
      // what stops the deck overhead rendering as a wall all around you.
      if (Math.abs(bp.y - p.y) > he.y + FLOOR_BAND) continue;

      // Body yaw, so a box parked at an angle draws at that angle.
      const bq = body.quaternion;
      const byaw = Math.atan2(2 * (bq.w * bq.y + bq.x * bq.z), 1 - 2 * (bq.y * bq.y + bq.x * bq.x));
      const bc = Math.cos(byaw);
      const bs = Math.sin(byaw);

      const corners = [];
      let nearest = Infinity;
      for (const [sx, sz] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ]) {
        // Corner in world space, then into the car's frame.
        const ox = sx * he.x;
        const oz = sz * he.z;
        const wx = dx + ox * bc + oz * bs;
        const wz = dz - ox * bs + oz * bc;
        const lx = wx * cos + wz * sin;
        // The car's forward axis is local -Z (see CLAUDE.md's measured
        // conventions), but a plan view wants forward to be +z so it can draw
        // straight up the screen. Flip it here, once, rather than making every
        // reader of this data remember the sign.
        const lz = -(-wx * sin + wz * cos);
        corners.push([lx, lz]);
        const d = boxDistance(lx, lz);
        if (d < nearest) nearest = d;
      }
      if (nearest > RADAR_RANGE) continue;
      out.push({ corners, distance: nearest, kind: body.userData?.kind ?? 'obstacle' });
    }

    // Nearest last: the closest footprint draws on top of the rest.
    out.sort((a, b) => b.distance - a.distance);
    blips = out;
  }

  return {
    get blips() {
      return blips;
    },

    update(dt) {
      if (!enabled) {
        if (blips.length) blips = [];
        return;
      }
      accum += dt;
      if (accum < 1 / SAMPLE_HZ) return;
      accum = 0;
      scan();
    },

    setEnabled(v) {
      enabled = v;
      if (!v) blips = [];
    },

    /** Forget the level's geometry — called when a level is torn down. */
    reset() {
      blips = [];
      accum = 1;
    },
  };
}
