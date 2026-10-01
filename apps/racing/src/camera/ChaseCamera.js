/**
 * ChaseCamera.js — the third-person view, for players who would rather see the
 * whole car than judge its corners from the driver's seat.
 *
 * IT DOES NOT OWN A CAMERA. There is exactly ONE THREE.PerspectiveCamera for
 * the life of the process, because RenderPass and SAOPass capture a reference
 * to it when the render stack is built (see Game.js's header and Renderer.js).
 * So this rig is handed the same camera DriverCamera uses and writes into it;
 * whichever rig ran last owns the frame.
 *
 * IT HOLDS THE SAME LINE ON STEADINESS. DriverCamera exists the way it does
 * because inheriting the chassis's pitch and roll makes a car game unreadable
 * (see its header). A chase camera that bobs with the body is the same mistake
 * one step further back, so this one takes the chassis's YAW and POSITION and
 * nothing else, and even the yaw is spring-smoothed: snapping the boom round
 * as the car turns is what makes third-person views nauseating.
 *
 * In reverse the boom does NOT swing round the front. Rotating the world 180°
 * every time the player shifts to R destroys any sense of which way is
 * forward, precisely when they are concentrating hardest. Instead the camera
 * rises and looks further down, which is what actually helps: you can see the
 * kerb and the bay behind the car without the picture flipping.
 */
import * as THREE from 'three';
import { RIDE_HEIGHT } from '../vehicle/Dimensions.js';

/** Pivot above the chassis centre that the boom swings around. */
const PIVOT_Y = 1.05;

/** Normal driving pose. */
const DRIVE = { boom: 6.0, height: 2.4, pitch: (-14 * Math.PI) / 180 };
/** Reversing pose: higher and steeper, same direction. */
const REVERSE = { boom: 5.4, height: 3.2, pitch: (-26 * Math.PI) / 180 };

/** Seconds for the yaw spring to settle. */
const YAW_SMOOTH_TIME = 0.28;
/** Seconds to ease between the driving and reversing poses. */
const POSE_SMOOTH_TIME = 0.35;
/** Body smoothing, same job as DriverCamera's: kill suspension bob. */
const BODY_SMOOTH_TIME = 0.12;

/** Never let the lens end up closer than this to the car. */
const MIN_BOOM = 2.2;
/** Clearance kept between the lens and whatever the boom hit. */
const HIT_MARGIN = 0.25;
/** Never let the lens drop below this above the car's own floor. */
const MIN_HEIGHT_OVER_FLOOR = 0.35;
/** Clearance kept below a deck's roof slab. */
const CEILING_MARGIN = 0.45;

/** Fast critically-damped approach — same one DriverCamera uses. */
function springTo(current, vel, target, smoothTime, dt) {
  const omega = 2 / smoothTime;
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = current - target;
  const temp = (vel + omega * change) * dt;
  const newVel = (vel - omega * temp) * exp;
  return [target + (change + temp) * exp, newVel];
}

/** Shortest signed angle from a to b, so the yaw spring never takes the long way. */
function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * @param {object} o
 * @param {THREE.PerspectiveCamera} o.camera       the one shared camera
 * @param {import('cannon-es').Body} o.chassisBody
 * @param {object} o.physics                       for the boom collision ray
 */
export function createChaseCamera({ camera, chassisBody, physics }) {
  let yaw = 0;
  let yawVel = 0;
  let pose = 0; // 0 = driving, 1 = reversing
  let poseVel = 0;
  let smoothedY = null;
  let smoothedYVel = 0;
  let baseFov = camera.fov;
  let fovKick = 0;
  /**
   * Height of the deck's roof above the car's own floor, or null under open
   * sky. The ceiling is visual-only geometry (Garage.js builds it as a named
   * group with no collider), so the boom's collision test cannot find it — put
   * the camera 2.4 m up on a deck with a 3.3 m roof and it sits ABOVE the slab
   * looking down at a blank grey plane, which is exactly what the first build
   * of this rig did.
   */
  let ceilingHeight = null;

  const pivot = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const tmpQuat = new THREE.Quaternion();
  const tmpEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  const boomDir = new THREE.Vector3();
  /** Chassis yaw, ignoring pitch and roll entirely. */
  function chassisYaw() {
    const q = chassisBody.quaternion;
    return Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x));
  }

  /**
   * Shorten the boom so the lens never ends up inside a wall or a parked car.
   * Uses the physics world's static boxes rather than a three.js raycast
   * against the scene graph: the city merges its geometry into a handful of
   * huge meshes, so a scene raycast there would be both slow and useless.
   */
  function clampBoom(px, py, pz, dx, dy, dz, want) {
    let best = want;
    const bodies = physics?.staticBodies ?? [];
    for (const body of bodies) {
      if (body.userData?.isGround) continue;
      const shape = body.shapes[0];
      const he = shape?.halfExtents;
      if (!he) continue;
      const bp = body.position;
      // Cheap reject: the boom is at most `want` long, so anything further
      // away than that plus the box's own reach cannot be hit.
      const reach = want + Math.max(he.x, he.y, he.z) * 1.8;
      if ((bp.x - px) ** 2 + (bp.y - py) ** 2 + (bp.z - pz) ** 2 > reach * reach) continue;

      // Slab test in the box's own frame. Static boxes here are axis-aligned
      // apart from a yaw (and a ramp's pitch, which this deliberately ignores
      // — a slightly conservative boom on a ramp is the safe error).
      const q = body.quaternion;
      const byaw = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x));
      const c = Math.cos(-byaw);
      const s = Math.sin(-byaw);
      const ox = px - bp.x;
      const oz = pz - bp.z;
      const lox = ox * c + oz * s;
      const loz = -ox * s + oz * c;
      const loy = py - bp.y;
      const ldx = dx * c + dz * s;
      const ldz = -dx * s + dz * c;

      let tMin = 0;
      let tMax = best;
      for (const [o, d, h] of [
        [lox, ldx, he.x],
        [loy, dy, he.y],
        [loz, ldz, he.z],
      ]) {
        if (Math.abs(d) < 1e-6) {
          if (o < -h || o > h) {
            tMin = Infinity;
            break;
          }
          continue;
        }
        let t1 = (-h - o) / d;
        let t2 = (h - o) / d;
        if (t1 > t2) [t1, t2] = [t2, t1];
        tMin = Math.max(tMin, t1);
        tMax = Math.min(tMax, t2);
        if (tMin > tMax) {
          tMin = Infinity;
          break;
        }
      }
      if (tMin !== Infinity && tMin < best) best = tMin;
    }
    return Math.max(MIN_BOOM, best === want ? want : best - HIT_MARGIN);
  }

  function update(dt, _input, speedMs = 0, { reversing = false } = {}) {
    const p = chassisBody.position;

    // Body height, smoothed: the same suspension bob DriverCamera filters out.
    if (smoothedY === null) smoothedY = p.y;
    [smoothedY, smoothedYVel] = springTo(smoothedY, smoothedYVel, p.y, BODY_SMOOTH_TIME, dt);

    // Yaw, spring-smoothed and taking the short way round.
    const target = yaw + angleDelta(yaw, chassisYaw());
    [yaw, yawVel] = springTo(yaw, yawVel, target, YAW_SMOOTH_TIME, dt);

    [pose, poseVel] = springTo(pose, poseVel, reversing ? 1 : 0, POSE_SMOOTH_TIME, dt);
    const boomLen = DRIVE.boom + (REVERSE.boom - DRIVE.boom) * pose;
    const height = DRIVE.height + (REVERSE.height - DRIVE.height) * pose;
    const pitch = DRIVE.pitch + (REVERSE.pitch - DRIVE.pitch) * pose;

    pivot.set(p.x, smoothedY + PIVOT_Y, p.z);

    // Heading 0 points the nose at -Z, so with yaw t the nose faces
    // (-sin t, 0, -cos t) and the boom hangs off the opposite side.
    const dir = boomDir.set(Math.sin(yaw) * boomLen, height, Math.cos(yaw) * boomLen).normalize();
    const want = Math.hypot(boomLen, height);
    const len = clampBoom(pivot.x, pivot.y, pivot.z, dir.x, dir.y, dir.z, want);

    desired.copy(pivot).addScaledVector(dir, len);
    // Never scrape the floor the car is standing on, and never rise through
    // the roof above it.
    const floorY = p.y - RIDE_HEIGHT;
    desired.y = Math.max(desired.y, floorY + MIN_HEIGHT_OVER_FLOOR);
    if (ceilingHeight != null) {
      desired.y = Math.min(desired.y, floorY + ceilingHeight - CEILING_MARGIN);
    }

    camera.position.copy(desired);
    // A camera with yaw t looks along (-sin t, 0, -cos t) — the same way the
    // car's nose points, which is what we want from behind it.
    tmpEuler.set(pitch, yaw, 0, 'YXZ');
    tmpQuat.setFromEuler(tmpEuler);
    camera.quaternion.copy(tmpQuat);

    // Speed FOV, matching DriverCamera so the two views feel related.
    const kmh = speedMs * 3.6;
    const t = THREE.MathUtils.clamp((kmh - 20) / 80, 0, 1);
    const kickTarget = 10 * (t * t * (3 - 2 * t));
    fovKick += (kickTarget - fovKick) * Math.min(1, dt * 3);
    const fov = baseFov + fovKick;
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  }

  return {
    camera,
    update,

    setFov(deg) {
      baseFov = deg;
    },

    /** @param {number|null} h metres above the floor, or null for open sky. */
    setCeiling(h) {
      ceilingHeight = Number.isFinite(h) ? h : null;
    },

    /** Snap the rig to the car — called when the view is switched on, so it
     *  does not fly in from wherever the seat camera happened to be. */
    reset() {
      yaw = chassisYaw();
      yawVel = 0;
      pose = 0;
      poseVel = 0;
      smoothedY = null;
      smoothedYVel = 0;
    },
  };
}
