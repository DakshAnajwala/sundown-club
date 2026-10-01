/**
 * HandRigChecks.js — per-frame assertions for the wheel + hand rig, and the
 * steering sequences S1–S9 that exercise it.
 *
 * Shared by design/wheel-lab (live check panel, "Run sweep") and the future
 * tools/wheel-probe.mjs, so the lab and the probe can never disagree about what
 * "passing" means. Thresholds are design/SPEC-wheel-hands.md §B.10.
 */
import * as THREE from 'three';
import { DASH_TOP_Y, fromGround } from './Dimensions.js';

/** The dash block's driver-facing face, car-local z (Cockpit: box centred at −0.59, 0.42 deep). */
const DASH_FACE_Z = -0.38;

export const LIMITS = {
  contactMin: -0.003, // m, palm contact vs rim surface, GRIP/SLIP
  contactMax: 0.01,
  penetration: 0.003, // m, any hand sample point into rim, spokes, hub
  travelClear: 0.01, // m, hand samples clear of the rim mid-TRAVEL
  separation: 0.1, // m, palm centre to palm centre
  extension: 0.97, // shoulder–wrist / arm length
  jumpGrip: 0.003, // m/frame beyond the rim's own carry
  jumpSlip: 0.003,
  jumpCross: 0.005, // frames crossing GRIP <-> SLIP
  // RELEASE / TRAVEL / REGRIP / SETTLE / SHIFT: no faster than the rim itself
  // moves when self-centring (900°/s at R = 0.175 m is 4.58 cm a frame).
  jumpFree: 0.046,
  elbow: 0.03, // or 1.5× the wrist's own movement, whichever is larger
  elbowCarried: 0.05,
  fingerStep: 20, // degrees per frame
  maxSlip: 0.35, // s in SLIP while the other hand grips
  domainTol: 0.5, // degrees
};

/**
 * Car.js steering, reproduced exactly (the constants are private there):
 * STEER_TO_LOCK_TIME = 0.45 s, STEER_RETURN_TIME = 0.40 s.
 * @param {number} steerNorm current, −1..1
 * @param {-1|0|1} want      key input
 */
export const STEER_TO_LOCK_TIME = 0.45;
export const STEER_RETURN_TIME = 0.4;
export function steerStep(steerNorm, want, dt) {
  if (want === 0) {
    const rate = dt / STEER_RETURN_TIME;
    return steerNorm > 0 ? Math.max(0, steerNorm - rate) : Math.min(0, steerNorm + rate);
  }
  const rate = dt / STEER_TO_LOCK_TIME;
  let s = Math.min(1, Math.max(-1, steerNorm + Math.sign(want - steerNorm) * rate));
  if (want > 0) s = Math.min(s, 1);
  if (want < 0) s = Math.max(s, -1);
  return s;
}

/**
 * The sweep, as a list of timed steps. Each step: { seq, dur, steer, lean?,
 * shift?: gear to request at the step's start, until?: 'lockL'|'lockR' }.
 */
export function buildSweep() {
  const S = [];
  const idle = (seq) => S.push({ seq, dur: 1.0, steer: 0 });
  idle('S1');
  S.push({ seq: 'S1', dur: 1.0, steer: 0 });
  idle('S2');
  S.push({ seq: 'S2', dur: 0.46, steer: -1, until: 'lockL' });
  S.push({ seq: 'S2', dur: 1.0, steer: -1 });
  S.push({ seq: 'S3', dur: 2.0, steer: 0 });
  idle('S4');
  S.push({ seq: 'S4', dur: 0.46, steer: 1, until: 'lockR' });
  S.push({ seq: 'S4', dur: 1.0, steer: 1 });
  S.push({ seq: 'S5', dur: 2.0, steer: 0 });
  idle('S6');
  for (let i = 0; i < 10; i++) {
    S.push({ seq: 'S6', dur: 0.15, steer: -1 });
    S.push({ seq: 'S6', dur: 0.15, steer: 1 });
  }
  S.push({ seq: 'S6', dur: 1.0, steer: 0 });
  const feather = (seq, leanA, leanB) => {
    for (let r = 0; r < 3; r++) {
      for (let i = 0; i < 4; i++) {
        S.push({ seq, dur: 0.06, steer: -1, lean: leanA });
        S.push({ seq, dur: 0.12, steer: 0, lean: leanA });
      }
      for (let i = 0; i < 4; i++) {
        S.push({ seq, dur: 0.06, steer: 1, lean: leanB });
        S.push({ seq, dur: 0.12, steer: 0, lean: leanB });
      }
    }
  };
  idle('S7');
  feather('S7', 0, 0);
  S.push({ seq: 'S7', dur: 1.0, steer: 0 });
  idle('S8');
  S.push({ seq: 'S8', dur: 0.225, steer: -1 }); // half lock
  S.push({ seq: 'S8', dur: 0.5, steer: -1, shift: 'D' });
  S.push({ seq: 'S8', dur: 1.5, steer: 1, shift: 'R' });
  S.push({ seq: 'S8', dur: 2.0, steer: 0 });
  idle('S9');
  feather('S9', 'Q', 'E');
  S.push({ seq: 'S9', dur: 1.0, steer: 0 });
  return S;
}

const R2D = 180 / Math.PI;

/**
 * @param {object} opts
 * @param {object} opts.wheel  SteeringWheel instance
 * @param {object} [opts.limits]
 */
export function createRigChecker({ wheel, limits = {} }) {
  const Lm = { ...LIMITS, ...limits };
  const dashY = fromGround(DASH_TOP_Y);
  const prev = { left: null, right: null };
  let prevPsi = null;
  const slipRun = { left: 0, right: 0 };
  const stats = new Map();
  let frame = 0;
  const firstViolations = [];
  const kinds = new Map();
  const p = new THREE.Vector3();
  const q = new THREE.Vector3();

  const blank = () => ({
    frames: 0,
    travels: 0,
    slipFrames: 0,
    maxContactErr: 0,
    maxPen: 0,
    minTravelClear: Infinity,
    minSep: Infinity,
    maxExt: 0,
    maxJump: {},
    maxElbow: 0,
    maxFinger: 0,
    bothOff: 0,
    violations: 0,
  });

  function statsFor(seq) {
    if (!stats.has(seq)) stats.set(seq, blank());
    return stats.get(seq);
  }

  /** Expected position of a car-local point carried by the rim through dψ. */
  function carried(arr, dPsi, out) {
    wheel.carToPivot(p.fromArray(arr), q);
    const c = Math.cos(-dPsi);
    const s = Math.sin(-dPsi);
    const x = q.x * c - q.y * s;
    const y = q.x * s + q.y * c;
    return wheel.pivotToCar(x, y, q.z, out);
  }

  const contactStates = new Set(['GRIP', 'SLIP']);
  const fa = {};
  const fb = {};
  /**
   * How far the rim's surface moves under a fixed spatial angle when the
   * material under it changes from θ0 to θ1: radial change of the D-shape plus
   * the swing of the surface normal times the contact's distance off the
   * centreline.
   */
  function surfaceShift(t0, t1) {
    wheel.curve.rimFrame2D(t0, fa);
    wheel.curve.rimFrame2D(t1, fb);
    const r0 = Math.hypot(fa.x, fa.y);
    const r1 = Math.hypot(fb.x, fb.y);
    const n0 = Math.atan2(fa.nx, fa.ny) - t0;
    const n1 = Math.atan2(fb.nx, fb.ny) - t1;
    const dn = Math.abs(Math.atan2(Math.sin(n1 - n0), Math.cos(n1 - n0)));
    return Math.abs(r1 - r0) + dn * (wheel.curve.tube + 0.012);
  }

  /**
   * Check one frame. `d` is rig.debug('corners'); `ctx` = { seq, dt, shifting }.
   * Returns this frame's violations (strings).
   */
  function check(d, ctx) {
    frame++;
    const st = statsFor(ctx.seq ?? 'live');
    st.frames++;
    const out = [];
    const v = (hand, msg) => {
      const s = `f${frame} ${ctx.seq ?? ''} ${hand} ${d.hands[hand]?.state ?? ''}: ${msg}`;
      out.push(s);
      st.violations++;
      const kind = `${ctx.seq}:${hand}:${msg.replace(/[-\d.]+/g, '#').slice(0, 40)}`;
      const n = kinds.get(kind) ?? 0;
      kinds.set(kind, n + 1);
      if (n < 2 && firstViolations.length < 40) firstViolations.push(s);
    };
    const psi = d.rim.angleDeg / R2D;
    const dPsi = prevPsi === null ? 0 : psi - prevPsi;
    prevPsi = psi;

    for (const side of ['left', 'right']) {
      const h = d.hands[side];
      const pr = prev[side];
      const gripping = contactStates.has(h.state);

      // NaN
      if (![...h.contact, ...h.wrist, ...h.elbow].every(Number.isFinite)) v(side, 'NaN in pose');

      // 1. contact on the tube surface
      if (gripping) {
        const c = wheel.clearance(p.fromArray(h.contact)).rim;
        st.maxContactErr = Math.max(st.maxContactErr, Math.abs(c));
        if (c < Lm.contactMin || c > Lm.contactMax) v(side, `contact ${(c * 100).toFixed(2)} cm from rim surface`);
      }

      // 2. penetration, 3. travel clearance
      let minRim = Infinity;
      let minRimSeg = '';
      let maxPen = 0;
      let penWhere = '';
      let insideDash = false;
      for (const seg of h.segments ?? []) {
        if (seg.name === 'cuff') continue;
        for (const pt of seg.points ?? [seg.centre]) {
          const cl = wheel.clearance(p.fromArray(pt));
          if (cl.rim < minRim) {
            minRim = cl.rim;
            minRimSeg = seg.name;
          }
          const pen = Math.max(0, -cl.rim, -cl.spokes, -cl.hub);
          if (pen > maxPen) {
            maxPen = pen;
            penWhere = `${seg.name} into ${pen === -cl.rim ? 'rim' : pen === -cl.spokes ? 'spoke' : 'hub'}`;
          }
          if (pt[1] < dashY && pt[2] < DASH_FACE_Z) insideDash = true;
        }
      }
      st.maxPen = Math.max(st.maxPen, maxPen);
      if (maxPen > Lm.penetration) v(side, `penetration ${(maxPen * 100).toFixed(2)} cm (${penWhere})`);
      if (h.state === 'TRAVEL' || h.state === 'SETTLE') {
        st.minTravelClear = Math.min(st.minTravelClear, minRim);
        if (minRim < Lm.travelClear && h.travelU > 0.2 && h.travelU < 0.8) v(side, `travel clearance ${(minRim * 100).toFixed(2)} cm (${minRimSeg})`);
        if (insideDash) v(side, 'inside the dash');
      }

      // 5. extension
      st.maxExt = Math.max(st.maxExt, h.extensionRatio);
      if (h.extensionRatio > Lm.extension) v(side, `extension ${h.extensionRatio.toFixed(3)}`);

      // 7. fingers
      st.maxFinger = Math.max(st.maxFinger, h.poseStepDeg);
      if (h.poseStepDeg > Lm.fingerStep + 1e-6) v(side, `finger joint ${h.poseStepDeg.toFixed(1)}°/frame`);

      // 9. endless slip
      const o = d.hands[side === 'left' ? 'right' : 'left'];
      if (h.state === 'SLIP') {
        st.slipFrames++;
        slipRun[side] = o.state === 'GRIP' && !ctx.shifting ? slipRun[side] + ctx.dt : 0;
        if (slipRun[side] > Lm.maxSlip + 1e-6) v(side, `slipping ${slipRun[side].toFixed(2)} s`);
      } else {
        slipRun[side] = 0;
      }

      // 10. domains
      if (gripping) {
        const [lo, hi] = side === 'left' ? [-160, -20] : [20, 160];
        if (h.spatialDeg < lo - Lm.domainTol || h.spatialDeg > hi + Lm.domainTol) v(side, `outside domain at ${h.spatialDeg.toFixed(1)}°`);
      }

      // 6. smoothness
      if (pr) {
        let limit;
        let jump;
        if (pr.state === 'GRIP' && h.state === 'GRIP') {
          carried(pr.contact, dPsi, q);
          jump = q.distanceTo(p.fromArray(h.contact));
          limit = Lm.jumpGrip;
        } else if (pr.state === 'SLIP' && h.state === 'SLIP') {
          jump = p.fromArray(h.contact).distanceTo(q.fromArray(pr.contact));
          // The rim is D-shaped: as the flat passes under a slipping hand the
          // surface itself moves in or out, and the hand must follow it.
          limit = Lm.jumpSlip + surfaceShift(pr.materialDeg / R2D, h.materialDeg / R2D);
        } else if (contactStates.has(pr.state) && gripping) {
          jump = p.fromArray(h.contact).distanceTo(q.fromArray(pr.contact));
          limit = Lm.jumpCross + Math.abs(dPsi) * 0.2; // one frame of carry either side
        } else {
          // Off-rim states may move freely OR ride along with the rim (REGRIP
          // is carried by design); whichever explains the motion better counts.
          const free = p.fromArray(h.contact).distanceTo(q.fromArray(pr.contact));
          carried(pr.contact, dPsi, q);
          jump = Math.min(free, q.distanceTo(p.fromArray(h.contact)));
          limit = Lm.jumpFree;
        }
        const key = `${pr.state}>${h.state}`;
        st.maxJump[h.state] = Math.max(st.maxJump[h.state] ?? 0, jump);
        if (jump > limit) v(side, `contact jump ${(jump * 100).toFixed(2)} cm (${key}) at ${pr.spatialDeg?.toFixed(0)}→${h.spatialDeg.toFixed(0)}° rim ${d.rim.angleDeg.toFixed(0)}° ω ${d.rim.omegaDegS.toFixed(0)}`);
        const ej = p.fromArray(h.elbow).distanceTo(q.fromArray(pr.elbow));
        st.maxElbow = Math.max(st.maxElbow, ej);
        // An elbow FLIP is the elbow moving far more than the hand driving it.
        const wristMove = p.fromArray(h.wrist).distanceTo(q.fromArray(pr.wrist));
        const eLimit = Math.max(['GRIP', 'SLIP', 'REGRIP'].includes(h.state) ? Lm.elbowCarried : Lm.elbow, 1.5 * wristMove);
        if (ej > eLimit) v(side, `elbow jump ${(ej * 100).toFixed(2)} cm`);
        if (h.state === 'TRAVEL' && pr.state !== 'TRAVEL') st.travels++;
        if (h.state === 'SETTLE' && pr.state !== 'SETTLE') st.travels++;
      }
      prev[side] = { state: h.state, spatialDeg: h.spatialDeg, materialDeg: h.materialDeg, contact: h.contact.slice(), elbow: h.elbow.slice(), wrist: h.wrist.slice() };
    }

    // 4. separation
    const sep = p.fromArray(d.hands.left.palmCentre).distanceTo(q.fromArray(d.hands.right.palmCentre));
    st.minSep = Math.min(st.minSep, sep);
    if (sep < Lm.separation) v('both', `hands ${(sep * 100).toFixed(1)} cm apart`);

    // 8. never both off
    if (!contactStates.has(d.hands.left.state) && !contactStates.has(d.hands.right.state)) {
      st.bothOff++;
      v('both', 'both hands off the rim');
    }
    return out;
  }

  return {
    limits: Lm,
    check,
    /** Forget the previous frame (after a deliberate teleport such as snapToRest). */
    breakContinuity() {
      prev.left = prev.right = null;
      prevPsi = null;
    },
    reset() {
      prev.left = prev.right = null;
      prevPsi = null;
      slipRun.left = slipRun.right = 0;
      stats.clear();
      frame = 0;
      firstViolations.length = 0;
      kinds.clear();
    },
    get stats() {
      return stats;
    },
    get firstViolations() {
      return firstViolations;
    },
  };
}
