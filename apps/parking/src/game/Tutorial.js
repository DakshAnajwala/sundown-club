/**
 * Tutorial.js — a step machine over an empty deck.
 *
 * Each step is a title, a line of detail, a short on-screen prompt, and a
 * `check(ctx)` predicate. The machine advances when the predicate holds, after
 * a short confirmation beat so the player sees the tick instead of the text
 * just changing under them. Nothing here reads keys or touches physics: it only
 * observes the same state the rest of the game already exposes, which is what
 * keeps it skippable at any moment with no cleanup.
 *
 * A glowing marker (the same target-bay visual the levels use) moves to
 * wherever the current step wants the car to go.
 */
import { createTargetBay } from '../world/Props.js';

/** How long a completed step lingers, ticked, before the next one appears. */
const CONFIRM_SEC = 0.9;

/** The empty deck the tutorial runs on. Same shape as a Levels.js entry. */
export const TUTORIAL_LEVEL = {
  id: 'tutorial',
  name: 'Driving school',
  subtitle: 'Tutorial',
  maneuver: 'pull-in',
  style: 'open',
  lot: { width: 40, depth: 34, ceilingHeight: 3.3 },
  hint: '',
  parTime: 999,
  spawn: { pos: [0, 12], heading: 0 },
  // Never shown or checked: the tutorial runs its own markers.
  target: { pos: [0, -100], heading: 0, bay: { width: 3, length: 5.4 }, style: 'bay', tolerance: { pos: 1, headingDeg: 20 } },
  cars: [],
  pillars: [
    { pos: [-15, -2], size: [0.7, 0.7] },
    { pos: [15, -2], size: [0.7, 0.7] },
  ],
  walls: [],
  // The steering gate for step 5: 3.6 m wide, centred on x = 4.
  cones: [{ pos: [2.2, -7] }, { pos: [5.8, -7] }],
  arrows: [{ pos: [0, 7], heading: 0 }],
  kerbs: [],
};

const MARKERS = {
  drive: [0, 0],
  gate: [4, -11.5],
  reverse: [4, -4],
};

/**
 * ctx, built by Game every frame:
 *   car       car.state (gear, speedMs, steerNorm, ...)
 *   pos       {x, z} chassis position
 *   input     input.state
 *   camera    { lookingBack, lean }
 */
function near(ctx, [x, z], r) {
  return Math.hypot(ctx.pos.x - x, ctx.pos.z - z) < r;
}

export const STEPS = [
  {
    title: 'Look around',
    detail: 'Hold the right mouse button to look over your shoulder, or hold Q or E to lean out of a window.',
    prompt: 'Hold right mouse, or press Q / E',
    check: (ctx) => ctx.camera.lookingBack || ctx.camera.lean > 0.8,
  },
  {
    title: 'Select Drive',
    detail: 'The car starts in Park. Press F to move the lever to D — watch your hand do it.',
    prompt: 'Press F for Drive',
    check: (ctx) => ctx.car.gear === 'D',
  },
  {
    title: 'Drive to the marker',
    detail: 'W is the throttle. The car only moves while you hold it, so tap it to inch forward.',
    prompt: 'Hold W — drive onto the green marker',
    marker: MARKERS.drive,
    check: (ctx) => near(ctx, MARKERS.drive, 1.6),
  },
  {
    title: 'Stop',
    detail: 'S is the brake. Bring the car to a complete stop on the marker.',
    prompt: 'Hold S until the needle reads zero',
    marker: MARKERS.drive,
    // 3.5 m, not "on" the marker: braking from ~25 km/h takes ~4.5 m, and a
    // first-timer who holds W all the way should not fail step 4 for it.
    check: (ctx) => ctx.car.speedMs < 0.2 && near(ctx, MARKERS.drive, 3.5),
  },
  {
    title: 'Steer through the gate',
    detail: 'A and D turn the steering wheel — 720 degrees lock to lock, so it takes a moment to wind on. Cones have no collision, but they cost points.',
    prompt: 'Steer right, through the cones, onto the marker',
    marker: MARKERS.gate,
    check: (ctx) => near(ctx, MARKERS.gate, 1.8),
  },
  {
    title: 'Select Reverse',
    detail: 'Stop first: the gearbox refuses R while you are rolling. Then press R. The dash screen wakes up with the reversing camera.',
    prompt: 'Stop, then press R',
    marker: MARKERS.gate,
    check: (ctx) => ctx.car.gear === 'R',
  },
  {
    title: 'Reverse to the marker',
    detail: 'W drives backwards in R. The guidelines on the dash bend with the steering; the beeps quicken as something gets close.',
    prompt: 'Back up onto the marker behind you',
    marker: MARKERS.reverse,
    check: (ctx) => ctx.car.gear === 'R' && near(ctx, MARKERS.reverse, 1.6),
  },
  {
    title: 'Park',
    detail: 'Every level ends the same way: stopped, inside the bay, lever in P.',
    prompt: 'Stop, then press P',
    marker: MARKERS.reverse,
    check: (ctx) => ctx.car.gear === 'P' && ctx.car.speedMs < 0.25,
  },
];

export function createTutorial({ scene }) {
  let index = 0;
  let confirmT = 0;
  let done = false;

  const marker = createTargetBay({ width: 3.0, length: 3.0, style: 'box' });
  marker.group.visible = false;
  scene.add(marker.group);

  function placeMarker() {
    const m = STEPS[index]?.marker;
    marker.group.visible = Boolean(m);
    marker.setSatisfied(false);
    if (m) marker.group.position.set(m[0], 0, m[1]);
  }
  placeMarker();

  return {
    /**
     * @returns {{changed:boolean, done:boolean}} changed = a new step began
     *          (or the current one just completed), so the HUD should redraw
     */
    update(dt, ctx, elapsed) {
      marker.update(elapsed);
      if (done) return { changed: false, done };
      if (confirmT > 0) {
        confirmT -= dt;
        if (confirmT > 0) return { changed: false, done };
        index++;
        if (index >= STEPS.length) {
          done = true;
          marker.group.visible = false;
          return { changed: true, done };
        }
        placeMarker();
        return { changed: true, done };
      }
      if (STEPS[index].check(ctx)) {
        confirmT = CONFIRM_SEC;
        marker.setSatisfied(true);
        return { changed: true, done };
      }
      return { changed: false, done };
    },

    get step() {
      return STEPS[Math.min(index, STEPS.length - 1)];
    },
    get index() {
      return index;
    },
    get total() {
      return STEPS.length;
    },
    /** The current step's check has passed and it is showing its tick. */
    get confirming() {
      return confirmT > 0;
    },
    get done() {
      return done;
    },

    dispose() {
      scene.remove(marker.group);
      marker.group.traverse((o) => {
        if (!o.isMesh) return;
        if (o.geometry?.userData?.disposable) o.geometry.dispose();
        if (o.material?.userData?.disposable) o.material.dispose();
      });
    },
  };
}
