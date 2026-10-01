/**
 * PhysicsWorld.js — cannon-es world, fixed-timestep stepping, static helpers.
 *
 * Everything the player can hit (walls, pillars, parked cars, the floor) is a
 * mass-0 static box. Traffic cones deliberately have NO body at all, so the
 * car drives straight through them — that is a spec'd behaviour, not an
 * oversight, and it is enforced by construction rather than by a filter.
 *
 * IMPORTANT (measured, see tools/physics-probe.mjs): the floor must be a
 * finite Box, never an infinite CANNON.Plane. With a Plane floor, only the
 * front pair of RaycastVehicle wheels ever reports a hit; the rear pair
 * returns distance -1 forever and the car sits nose-down on its chassis and
 * refuses to move (0.4 m in 3 seconds of full throttle). Same tuning with a
 * Box floor: four wheels in contact, 35 km/h.
 */
import * as CANNON from 'cannon-es';
import { createEmitter } from '../core/Events.js';

const FIXED_TIMESTEP = 1 / 120; // small steps: parking is a low-speed,
// high-precision problem and 120 Hz keeps the wheel raycasts stable when
// creeping at 2 km/h against a kerb.
const MAX_SUBSTEPS = 6;

export function createPhysicsWorld() {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.solver.iterations = 12;
  world.defaultContactMaterial.friction = 0.6;
  world.defaultContactMaterial.restitution = 0.02; // near-dead bumps: hitting
  // a pillar should stop you, not bounce you across the aisle.
  world.allowSleep = false;

  const events = createEmitter();
  const staticBodies = [];
  let chassisBody = null;

  function registerChassis(body) {
    chassisBody = body;
  }

  world.addEventListener('beginContact', (e) => {
    const { bodyA, bodyB } = e;
    if (!chassisBody) return;
    const isA = bodyA === chassisBody;
    const isB = bodyB === chassisBody;
    if (!isA && !isB) return;
    const other = isA ? bodyB : bodyA;
    if (other.mass !== 0) return;
    if (other.userData?.isGround) return; // resting on the floor isn't a bump

    const speed = chassisBody.velocity.length();
    events.emit('bump', {
      other,
      kind: other.userData?.kind ?? 'obstacle',
      speedMs: speed,
    });
  });

  function step(dt) {
    world.step(FIXED_TIMESTEP, dt, MAX_SUBSTEPS);
  }

  /**
   * Static box obstacle.
   * @param {number[]} pos    world centre [x, y, z]
   * @param {number[]} size   full extents [w, h, d] (not half-extents)
   * @param {number}   rotY   yaw in radians
   * @param {number}   pitch  tilt about local X, applied AFTER rotY (Euler
   *                          order YXZ — matches design/level13/layout-model.mjs's
   *                          box convention). Ramps and ramp walls need it;
   *                          every other caller leaves it at 0.
   * @param {object}   userData tagged onto the body ({ kind: 'pillar' } etc.)
   */
  function addStaticBox({ pos, size, rotY = 0, pitch = 0, userData = {} }) {
    const body = new CANNON.Body({ mass: 0 });
    body.addShape(new CANNON.Box(new CANNON.Vec3(size[0] / 2, size[1] / 2, size[2] / 2)));
    body.position.set(pos[0], pos[1], pos[2]);
    if (pitch) {
      // YXZ: yaw first, then pitch about the yawed frame's local X.
      const yawQ = new CANNON.Quaternion();
      yawQ.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), rotY);
      const pitchQ = new CANNON.Quaternion();
      pitchQ.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), pitch);
      yawQ.mult(pitchQ, body.quaternion);
    } else {
      body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), rotY);
    }
    body.userData = userData;
    world.addBody(body);
    staticBodies.push(body);
    return body;
  }

  /** Finite floor slab. See the header note on why this is not a Plane. */
  function addGround({ width, depth, y = 0 }) {
    return addStaticBox({
      pos: [0, y - 0.5, 0],
      size: [width, 1, depth],
      userData: { isGround: true, kind: 'ground' },
    });
  }

  /** Drop every static body — called between levels. */
  function clearStatics() {
    for (const b of staticBodies) world.removeBody(b);
    staticBodies.length = 0;
  }

  return {
    world,
    events,
    step,
    /** The level's static obstacles, for anything that needs to reason about
     *  what is near the car without raycasting for it (ProximityScan.js). */
    staticBodies,
    addStaticBox,
    addGround,
    clearStatics,
    registerChassis,
  };
}
