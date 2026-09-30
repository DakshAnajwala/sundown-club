import * as CANNON from 'cannon-es';

// cannon-es World setup, fixed-timestep stepping, static-body helpers.
// NOTE: cannon-es, never the abandoned `cannon` package.

const FIXED_TIMESTEP = 1 / 60;
const MAX_SUBSTEPS = 5;

// Minimal EventTarget-like emitter so /car and /scoring can subscribe to
// contact events without depending on cannon-es types directly.
function createEmitter() {
  const listeners = new Map();
  return {
    on(event, cb) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(cb);
    },
    off(event, cb) {
      listeners.get(event)?.delete(cb);
    },
    emit(event, payload) {
      listeners.get(event)?.forEach((cb) => cb(payload));
    },
  };
}

export function createPhysicsWorld() {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.solver.iterations = 10;
  world.defaultContactMaterial.friction = 0.4;

  const events = createEmitter();

  // Track which body is the chassis so contact filtering only fires for
  // chassis-vs-static collisions (cones have no body at all, so they never
  // appear here by construction).
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
    if (other.mass !== 0) return; // only static obstacles count as bumps
    if (other.isGround) return; // ground contact is not a "bump"

    // Find the contact normal from the world's active contacts this step.
    const contact = world.contacts.find(
      (c) => (c.bi === bodyA && c.bj === bodyB) || (c.bi === bodyB && c.bj === bodyA)
    );
    let normal = new CANNON.Vec3(0, 1, 0);
    if (contact) {
      normal = isA ? contact.ni.clone() : contact.ni.clone().negate();
    }
    const relVel = chassisBody.velocity.length();
    events.emit('contact', { chassisBody, other, contactNormal: normal, impactVelocity: relVel });
  });

  function step(dt) {
    world.step(FIXED_TIMESTEP, dt, MAX_SUBSTEPS);
  }

  function addStaticBox({ pos, rotY = 0, size }) {
    const shape = new CANNON.Box(new CANNON.Vec3(size[0] / 2, size[1] / 2, size[2] / 2));
    const body = new CANNON.Body({ mass: 0 });
    body.addShape(shape);
    body.position.set(pos[0], pos[1], pos[2]);
    body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), rotY);
    world.addBody(body);
    return body;
  }

  function removeBody(body) {
    world.removeBody(body);
  }

  return { world, step, addStaticBox, removeBody, events, registerChassis };
}
