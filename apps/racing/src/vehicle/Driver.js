/**
 * Driver.js — thin adapter: wires the articulated hand rig (HandRig.js) to
 * the cockpit's wheel, keeping the exact contract Game.js already calls.
 *
 * The old two-box hands and the 180-degree "COMFORT_ARC" shuffle (see
 * design/SPEC-wheel-hands.md §3 for why it was replaced) lived directly in
 * this file; the real geometry, IK, per-hand state machine, thumb solving and
 * shifting choreography now live in HandRig.js / HandModel.js / RimCurve.js /
 * SteeringWheel.js, tuned in design/wheel-lab and proven by the S1-S9 sweep
 * (design/wheel-lab/params.json -> measured.sweep, 0 violations).
 */
import { createHandRig } from './HandRig.js';

/**
 * @param {object} opts
 * @param {ReturnType<import('./Cockpit.js').createCockpit>} opts.cockpit
 * @param {(gear: string) => void} [opts.onShifterGrabbed]
 */
export function createDriver({ cockpit, onShifterGrabbed }) {
  const rig = createHandRig({
    wheel: cockpit.wheel,
    shifterKnobLocal: cockpit.shifterKnobLocal,
    onShifterGrabbed,
  });

  return {
    group: rig.group,
    update: rig.update,
    beginShift: rig.beginShift,
    get isShifting() {
      return rig.isShifting;
    },
    get shiftGear() {
      return rig.shiftGear;
    },
    /** Snap both hands to rest (e.g. after a teleport) — used by debug hooks. */
    snapToRest: rig.snapToRest,
    /** Full state for debugDriver() / the future wheel-probe. */
    debug: rig.debug,
    dispose: rig.dispose,
  };
}
