/**
 * HandRig.js — the driver's arms and articulated hands on the sport wheel:
 * hand-over-hand steering, slipping on fast returns, settling back to 9 and 3,
 * and the right hand's trip to the gear lever.
 *
 * Designed in design/wheel-lab (tune it there) and specified in
 * design/SPEC-wheel-hands.md. Replaces Driver.js's hand logic when wired in;
 * keeps its contract: update(dt, { steerNorm }), beginShift(gear),
 * isShifting, shiftGear, and onShifterGrabbed(gear) firing only when the hand
 * ARRIVES on the knob.
 *
 * ------------------------------ WHY DOMAINS --------------------------------
 * Shoulder-to-wrist reach was measured at every rim angle. Each hand reaches
 * its OWN half of the rim comfortably and locks out only on the far half. So
 * each hand owns a domain (left [−160°, −20°], right [20°, 160°]) and never
 * leaves it. Two consequences fall out: the hands can never touch (the closest
 * they get is a 40° chord, 12 cm), and the arms never straighten.
 *
 * ------------------------------ WHY SLIP -----------------------------------
 * Keyboard steering is binary: the rim turns at exactly 800°/s (turning in) or
 * 900°/s (self-centring), or not at all. No human re-grip keeps up with that
 * while both hands stay welded, so a hand that reaches the hard edge of its
 * domain while the rim is still turning holds its place with a loosened grip
 * and the rim slides through it — which is what drivers really do when they
 * let a wheel spin back.
 *
 * ------------------------------ ANGLES -------------------------------------
 * ψ (psi)   rim rotation, clockwise as the driver sees it = steerNorm·2π
 * material  where on the rim a hand holds (turns with the rim)
 * spatial   where that is right now = material + ψ; 0 = 12 o'clock, +90° = 3
 */
import * as THREE from 'three';
import { COLORS, matte } from '../world/Palette.js';
import { SHOULDER_L, SHOULDER_R, UPPER_ARM, FOREARM, HAND_RIG, HAND } from './Dimensions.js';
import { createHandModel, wrapPose, POSE_TABLES, POSE_LEN } from './HandModel.js';
import { wrapAngle } from './RimCurve.js';

const TAU = Math.PI * 2;
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
const OMEGA_EPS = 1e-3; // rad/s: below this the rim is "still"
const KNOB_RADIUS = 0.045; // matches Cockpit's knob sphere

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const smooth = (t) => t * t * (3 - 2 * t);

/** State names as the probes and the lab print them. */
export const STATES = ['GRIP', 'SLIP', 'RELEASE', 'TRAVEL', 'REGRIP', 'SETTLE', 'SHIFT'];

/**
 * @param {object} opts
 * @param {ReturnType<import('./SteeringWheel.js').createSteeringWheel>} opts.wheel
 * @param {() => THREE.Vector3} opts.shifterKnobLocal   car-local knob centre (Cockpit)
 * @param {(gear: string) => void} [opts.onShifterGrabbed]
 * @param {object} [opts.params]      overrides for HAND_RIG
 * @param {object} [opts.handParams]  overrides for HAND
 */
export function createHandRig({ wheel, shifterKnobLocal, onShifterGrabbed, params = {}, handParams = {} }) {
  const P = { ...HAND_RIG, ...params, shift: { ...HAND_RIG.shift, ...(params.shift ?? {}) } };
  P.flatCornerDeg = () => wheel.params.flatHalfDeg;
  const group = new THREE.Group();
  group.name = 'hand-rig';

  const skinMat = matte(COLORS.skin, { emissive: 0x3a2a1e, emissiveIntensity: 1 });
  const sleeveMat = matte(COLORS.sleeve, { emissive: 0x232c33, emissiveIntensity: 1 });

  // --- arms -----------------------------------------------------------------
  const Y_UP = new THREE.Vector3(0, 1, 0);
  function buildArm() {
    const upper = new THREE.Mesh(
      new THREE.CapsuleGeometry(P.upperArmRadius, UPPER_ARM - 2 * P.upperArmRadius, 2, 8),
      sleeveMat
    );
    const lower = new THREE.Mesh(
      new THREE.CapsuleGeometry(P.forearmRadius, FOREARM - 2 * P.forearmRadius, 2, 8),
      P.forearmSleeve ? sleeveMat : skinMat
    );
    upper.geometry.userData.disposable = true;
    lower.geometry.userData.disposable = true;
    group.add(upper, lower);
    return { upper, lower };
  }

  // --- grip poses, solved once per parameter set -----------------------------
  const Hp = { ...HAND, ...handParams };
  const tube = wheel.curve.tube;
  const cY = (Hp.contact ?? HAND.contact)[1];
  const cZ = (Hp.contact ?? HAND.contact)[2];
  const gripR = tube + P.skinGap;
  // The lab can override the hand-typed tables (thumb angles, RELAXED).
  const T = { ...POSE_TABLES, ...(P.poseTables ?? {}) };
  const POSES = {
    RIM_GRIP: wrapPose(Hp, cY, cZ + gripR, gripR, T.THUMB_GRIP),
    RIM_SLIP: wrapPose(Hp, cY, cZ + gripR, gripR + P.slipLoosen, T.THUMB_SLIP),
    KNOB_GRIP: wrapPose(Hp, cY, cZ + KNOB_RADIUS + P.skinGap, KNOB_RADIUS + P.skinGap, T.THUMB_KNOB),
    RELAXED: T.RELAXED.slice(),
  };
  POSES.THUMB_ON_SPOKE = POSES.RIM_GRIP.slice(0, 12).concat(T.THUMB_ON_SPOKE);
  // Fingers closed, thumb still up: the last part of a re-grip.
  POSES.RIM_CLOSING = POSES.RIM_GRIP.slice();

  function makeHand(side) {
    const sgn = side === 'left' ? -1 : 1;
    const model = createHandModel({ side, skinMat, sleeveMat, params: handParams });
    group.add(model.root);
    const dom = side === 'left' ? P.domainLeft : P.domainRight;
    return {
      side,
      sgn,
      model,
      arm: buildArm(),
      shoulder: new THREE.Vector3(...(side === 'left' ? SHOULDER_L : SHOULDER_R)),
      pole: new THREE.Vector3(...(side === 'left' ? P.poleL : P.poleR)).normalize(),
      lo: dom[0] * D2R,
      hi: dom[1] * D2R,
      mid: ((dom[0] + dom[1]) / 2) * D2R,
      rest: sgn * P.rest * D2R,
      state: 'GRIP',
      settling: false,
      t: 0,
      material: sgn * P.rest * D2R,
      spatial: sgn * P.rest * D2R,
      edge: 0,
      slipT: 0,
      slipStillT: 0,
      stillT: 0,
      lastRegripEnd: -1,
      spokeOffset: 0, // degrees, palm shifted toward 12 o'clock
      slipLift: 0,
      travelFrom: 0,
      targetSpatial: 0,
      targetMaterial: 0,
      lift: 0,
      planned: 0,
      travelDur: 0,
      regripGap: 0,
      regripLift: 0,
      regripDur: 0,
      travels: 0,
      // outputs, car-local
      contact: new THREE.Vector3(),
      quat: new THREE.Quaternion(),
      wrist: new THREE.Vector3(),
      elbow: new THREE.Vector3(),
      palmCentre: new THREE.Vector3(),
      poseTarget: POSES.RIM_GRIP,
      poseStep: 0,
    };
  }

  const L = makeHand('left');
  const Rh = makeHand('right');
  const hands = [L, Rh];
  const other = (h) => (h === L ? Rh : L);

  let clock = 0;
  let psi = 0;
  let psiPrev = 0;
  let omega = 0;
  let shift = null;
  let lastShiftGear = null;
  let grabs = 0;

  // --- scratch --------------------------------------------------------------
  const F = { point: new THREE.Vector3(), tangent: new THREE.Vector3(), normal: new THREE.Vector3(), axis: new THREE.Vector3() };
  const vX = new THREE.Vector3();
  const vY = new THREE.Vector3();
  const vZ = new THREE.Vector3();
  const m4 = new THREE.Matrix4();
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  const tmpC = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  const knobQuat = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, -1, 0))
  );
  const roll = () => P.gripRoll * D2R;

  const inContact = (h) => h.state === 'GRIP' || h.state === 'SLIP';

  /**
   * Hand contact pose on the rim at a spatial angle: palm contact on the tube
   * surface at roll φ, plus optional lift along the wheel axis and normal.
   */
  function rimPose(spatial, liftAxis, liftNormal, outPos, outQuat) {
    wheel.rimFrameLocal(spatial, F);
    const phi = roll();
    const c = Math.cos(phi);
    const s = Math.sin(phi);
    // dir = a·cosφ + n·sinφ points from the tube centre to the palm contact.
    vZ.copy(F.axis).multiplyScalar(-c).addScaledVector(F.normal, -s); // palm normal, into the tube
    vY.copy(F.axis).multiplyScalar(-s).addScaledVector(F.normal, c); // fingers wrap away from the driver
    vX.crossVectors(vY, vZ);
    m4.makeBasis(vX, vY, vZ);
    outQuat.setFromRotationMatrix(m4);
    outPos
      .copy(F.point)
      .addScaledVector(vZ, -(tube + P.skinGap))
      .addScaledVector(F.axis, liftAxis)
      .addScaledVector(F.normal, liftNormal);
  }

  const clampDomain = (h, a) => clamp(a, h.lo, h.hi);

  /** Nudge a target material angle off the spokes, staying inside the domain at ψ_arrival. */
  function nudge(h, material, psiArr, allowSideSpoke) {
    const clear = P.spokeClear * D2R;
    const spokes = allowSideSpoke ? [Math.PI] : [Math.PI, Math.PI / 2, -Math.PI / 2];
    const isClear = (m) => spokes.every((sp) => Math.abs(wrapAngle(m - sp)) >= clear - 1e-6);
    const inDomain = (m) => {
      const sp = aroundDomain(h, m + psiArr);
      return sp >= h.lo - 1e-6 && sp <= h.hi + 1e-6;
    };
    if (isClear(material)) return material;
    // Candidates stay UNWRAPPED near `material`: the travel path adds ψ to the
    // result and must never see a 360° step.
    const cands = [];
    for (const sp of spokes) {
      const d = wrapAngle(material - sp);
      if (Math.abs(d) < clear) cands.push(material - d + clear, material - d - clear);
    }
    cands.sort((a, b) => Math.abs(a - material) - Math.abs(b - material));
    for (const m of cands) if (isClear(m) && inDomain(m)) return m;
    for (const m of cands) if (isClear(m)) return m;
    return material;
  }

  /** Unwrapped around the hand's own domain centre, so ±180° never flips a hand to the wrong edge. */
  const aroundDomain = (h, a) => h.mid + wrapAngle(a - h.mid);
  function spatialOf(h) {
    return aroundDomain(h, h.material + psi);
  }

  // --- per-hand steering state machine ----------------------------------------
  function updateContact(h, dt) {
    if (h.state === 'GRIP') {
      h.spatial = spatialOf(h);
      if (h.spatial > h.hi || h.spatial < h.lo) {
        const edge = h.spatial > h.hi ? h.hi : h.lo;
        const outward = (edge === h.hi && omega > OMEGA_EPS) || (edge === h.lo && omega < -OMEGA_EPS);
        h.spatial = edge;
        h.material = edge - psi;
        if (outward) {
          h.state = 'SLIP';
          h.edge = edge;
          h.slipT = 0;
          h.slipStillT = 0;
        }
      }
    } else if (h.state === 'SLIP') {
      h.slipT += dt;
      h.spatial = h.edge;
      h.material = h.edge - psi;
      const inward = (h.edge === h.hi && omega < -OMEGA_EPS) || (h.edge === h.lo && omega > OMEGA_EPS);
      h.slipStillT = Math.abs(omega) <= OMEGA_EPS ? h.slipStillT + dt : 0;
      if (inward || h.slipStillT >= P.slipRegrip) h.state = 'GRIP';
    }
    h.stillT = Math.abs(omega) <= OMEGA_EPS ? h.stillT + dt : 0;
  }

  function wantsRelease(h) {
    if (!inContact(h) || !inContact(other(h)) || shift) return false;
    if (clock - h.lastRegripEnd < P.cooldown) return false;
    const soft = P.softMargin * D2R;
    if (omega > OMEGA_EPS) return h.spatial > h.hi - soft;
    if (omega < -OMEGA_EPS) return h.spatial < h.lo + soft;
    return false;
  }

  function wantsSettle(h) {
    if (h.state !== 'GRIP' || other(h).state !== 'GRIP' || shift) return false;
    if (h.stillT < P.settleIdle) return false;
    return Math.abs(wrapAngle(h.spatial - h.rest)) > P.settleThreshold * D2R;
  }

  function startRelease(h, targetSpatial, settling) {
    h.state = 'RELEASE';
    h.settling = settling;
    h.t = 0;
    h.travelFrom = h.spatial - h.sgn * h.spokeOffset * D2R;
    h.spatial = h.travelFrom;
    h.spokeOffset = 0; // already folded into travelFrom; re-applying it later would jump
    h.targetSpatial = targetSpatial;
  }

  function predictTarget(h, remaining) {
    const psiArr = psi + omega * remaining;
    const spatial = clampDomain(h, h.targetSpatial);
    h.targetMaterial = nudge(h, spatial - psiArr, psiArr, h.settling);
  }

  /** Start closing onto the rim from wherever the hand is now (end of TRAVEL or a shift). */
  function beginRegrip(h, lift = P.releaseLift) {
    h.state = 'REGRIP';
    h.t = 0;
    // Grip the rim that is under the hand now, nudged off any spoke; the small
    // nudge is closed while the fingers close.
    h.targetMaterial = nudge(h, h.spatial - psi, psi, h.settling);
    h.regripGap = h.spatial - (h.targetMaterial + psi); // against the UNclamped target, so the clamp can't step
    h.regripLift = lift;
    // A big gap (the rim reversed mid-travel) takes longer to close.
    h.regripDur = P.regrip + Math.abs(h.regripGap * R2D) / P.landingRate;
  }

  /** Advance RELEASE / TRAVEL / REGRIP; writes h.contact, h.quat, h.poseTarget. */
  function advanceOffRim(h, dt) {
    h.t += dt;
    if (h.state === 'RELEASE') {
      const u = smooth(clamp(h.t / P.release, 0, 1));
      h.lift = P.releaseLift * u;
      h.spatial = h.travelFrom;
      rimPose(h.spatial, h.lift, 0, h.contact, h.quat);
      h.poseTarget = POSES.RELAXED;
      if (h.t >= P.release) {
        h.state = 'TRAVEL';
        h.t = 0;
        h.travels++;
        // Long hops get more time, so no re-grip outruns travelSpeed.
        const hop = Math.abs(clampDomain(h, h.targetSpatial) - h.travelFrom) * R2D;
        h.travelDur = clamp(hop / P.travelSpeed, h.settling ? P.settleTravel : P.travel, P.travelMax);
        predictTarget(h, h.travelDur);
        // Plan in spatial terms, already nudged off spokes for a steady rim.
        h.planned = clampDomain(h, h.targetMaterial + psi + omega * h.travelDur);
      }
      return;
    }
    if (h.state === 'TRAVEL') {
      const k = clamp(h.t / h.travelDur, 0, 1);
      const u = smooth(k);
      // The hand heads for the spot it planned. If the rim changes speed on the
      // way, it still lands there and grips whatever rim is under it: no
      // chasing a moving target.
      h.spatial = h.travelFrom + (h.planned - h.travelFrom) * u;
      const arc = Math.sin(Math.PI * u);
      h.lift = P.releaseLift;
      rimPose(h.spatial, P.releaseLift + P.travelLiftAxis * arc, P.travelLiftNormal * arc, h.contact, h.quat);
      h.poseTarget = POSES.RELAXED;
      if (h.t >= h.travelDur) {
        beginRegrip(h);
      }
      return;
    }
    if (h.state === 'REGRIP') {
      const u = smooth(clamp(h.t / h.regripDur, 0, 1));
      // Carried by the rim, closing out whatever gap the landing left.
      h.spatial = clampDomain(h, h.targetMaterial + psi + h.regripGap * (1 - u));
      h.lift = h.regripLift * (1 - u);
      rimPose(h.spatial, h.lift, 0, h.contact, h.quat);
      // Fingers stay loose until the palm is nearly down, then close.
      h.poseTarget = u < P.regripCloseAt ? POSES.RIM_SLIP : POSES.RIM_CLOSING;
      if (h.t >= h.regripDur) {
        h.state = 'GRIP';
        h.settling = false;
        h.material = h.spatial - psi;
        h.lift = 0;
        h.lastRegripEnd = clock;
        h.stillT = 0;
      }
    }
  }

  /** Contact pose for a hand in GRIP or SLIP, including the thumb-on-spoke offset. */
  function poseOnRim(h, dt) {
    const nearSpoke =
      h.state === 'GRIP' &&
      Math.abs(wrapAngle(h.material - (h.sgn * Math.PI) / 2)) < Math.max(8, Math.abs(P.spokePalmOffset)) * D2R;
    const want = nearSpoke ? P.spokePalmOffset : 0;
    const offStep = P.spokeOffsetRate * dt;
    h.spokeOffset += clamp(want - h.spokeOffset, -offStep, offStep);
    const s = h.spatial - h.sgn * h.spokeOffset * D2R;
    // A loosened, slipping grip rides a few millimetres off the tube, which is
    // what lets it pass over the D-rim's corners and the thumb grips.
    const step = P.slipLiftRate * dt;
    h.slipLift += clamp((h.state === 'SLIP' ? P.slipLift : 0) - h.slipLift, -step, step);
    rimPose(s, 0, 0, h.contact, h.quat);
    if (h.slipLift > 0) {
      tmpA.set(0, 0, 1).applyQuaternion(h.quat); // palm normal, into the tube
      h.contact.addScaledVector(tmpA, -h.slipLift);
    }
    if (h.state === 'SLIP') {
      h.poseTarget = POSES.RIM_SLIP;
    } else {
      const w = P.spokePalmOffset !== 0 ? h.spokeOffset / P.spokePalmOffset : 0;
      blendPose(POSES.RIM_GRIP, POSES.THUMB_ON_SPOKE, w, h.blend ?? (h.blend = new Array(POSE_LEN)));
      h.poseTarget = h.blend;
    }
  }

  function blendPose(a, b, w, out) {
    for (let i = 0; i < POSE_LEN; i++) out[i] = a[i] + (b[i] - a[i]) * w;
    return out;
  }

  // --- shifting (right hand) ----------------------------------------------------
  function beginShift(gear) {
    lastShiftGear = gear;
    if (shift) {
      shift.gear = gear;
      if (shift.phase === 'hold' && shift.grabbed) {
        grabs++;
        onShifterGrabbed?.(gear);
        shift.t = 0;
      } else if (shift.phase === 'back') {
        shift.phase = 'toKnob';
        shift.t = 0;
        shift.grabbed = false;
        shift.startPos.copy(Rh.contact);
        shift.startQuat.copy(Rh.quat);
        shift.skipPeel = true;
      }
      return;
    }
    shift = {
      gear,
      phase: 'wait',
      t: 0,
      waitT: 0,
      grabbed: false,
      skipPeel: false,
      startPos: new THREE.Vector3(),
      startQuat: new THREE.Quaternion(),
      peelPos: new THREE.Vector3(),
    };
  }

  const knobScratch = new THREE.Vector3();
  function knobContact(out) {
    return out.copy(shifterKnobLocal(knobScratch)).add(tmpC.set(0, KNOB_RADIUS + P.skinGap, 0));
  }

  function quadBezier(p0, p1, p2, t, out) {
    const u = 1 - t;
    return out.set(
      u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
      u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
      u * u * p0.z + 2 * u * t * p1.z + t * t * p2.z
    );
  }

  function advanceShift(dt) {
    const h = Rh;
    const S = P.shift;
    if (shift.phase === 'wait') {
      shift.waitT += dt;
      if (!inContact(L) && shift.waitT < P.shiftWaitMax) return false; // right hand carries on as normal
      shift.phase = 'release';
      shift.t = 0;
      shift.startPos.copy(h.contact);
      shift.startQuat.copy(h.quat);
      h.state = 'SHIFT';
      h.settling = false;
    }
    shift.t += dt;
    const axis = wheel.wheelNormalLocal(tmpB);
    if (shift.phase === 'release') {
      const u = smooth(clamp(shift.t / S.release, 0, 1));
      h.contact.copy(shift.startPos).addScaledVector(axis, S.peel * u);
      h.quat.copy(shift.startQuat).slerp(knobQuat, u * 0.35);
      h.poseTarget = POSES.RELAXED;
      if (shift.t >= S.release) {
        shift.phase = 'toKnob';
        shift.t = 0;
        shift.peelPos.copy(h.contact);
      }
    } else if (shift.phase === 'toKnob') {
      const u = smooth(clamp(shift.t / S.toKnob, 0, 1));
      const from = shift.skipPeel ? shift.startPos : shift.peelPos;
      const knob = knobContact(tmpA);
      tmpC.set((from.x + knob.x) / 2, Math.max(from.y, knob.y) + S.arc, (from.z + knob.z) / 2);
      quadBezier(from, tmpC, knob, u, h.contact);
      h.quat.copy(shift.startQuat).slerp(knobQuat, 0.35 + 0.65 * u);
      h.poseTarget = u > 0.45 ? POSES.KNOB_GRIP : POSES.RELAXED;
      if (shift.t >= S.toKnob) {
        shift.phase = 'hold';
        shift.t = 0;
      }
    } else if (shift.phase === 'hold') {
      if (!shift.grabbed) {
        shift.grabbed = true;
        grabs++;
        onShifterGrabbed?.(shift.gear);
      }
      knobContact(h.contact);
      h.quat.copy(knobQuat);
      h.poseTarget = POSES.KNOB_GRIP;
      if (shift.t >= S.hold) {
        shift.phase = 'back';
        shift.t = 0;
        shift.startPos.copy(h.contact);
        // Target: 3 o'clock, predicted to where the rim will be on arrival.
        h.targetSpatial = h.rest;
        h.settling = true;
        predictTarget(h, S.back);
        h.planned = clampDomain(h, h.targetMaterial + psi + omega * S.back);
      }
    } else if (shift.phase === 'back') {
      const u = smooth(clamp(shift.t / S.back, 0, 1));
      const target = h.planned;
      rimPose(target, P.releaseLift, 0, tmpA, tmpQ);
      tmpC.set((shift.startPos.x + tmpA.x) / 2, Math.max(shift.startPos.y, tmpA.y) + S.arc, (shift.startPos.z + tmpA.z) / 2);
      quadBezier(shift.startPos, tmpC, tmpA, u, h.contact);
      h.quat.copy(knobQuat).slerp(tmpQ, u);
      h.poseTarget = POSES.RELAXED;
      if (shift.t >= S.back) {
        h.spatial = target;
        beginRegrip(h);
        shift = null;
      }
    }
    return true;
  }

  // --- IK -------------------------------------------------------------------
  const ikDir = new THREE.Vector3();
  const ikPole = new THREE.Vector3();
  function solveElbow(shoulder, target, pole, out) {
    ikDir.subVectors(target, shoulder);
    let d = ikDir.length();
    const dMax = UPPER_ARM + FOREARM - 1e-4;
    const dMin = Math.abs(UPPER_ARM - FOREARM) + 1e-4;
    d = clamp(d, Math.max(dMin, 1e-5), dMax);
    ikDir.normalize();
    const a = (UPPER_ARM * UPPER_ARM - FOREARM * FOREARM + d * d) / (2 * d);
    const hgt = Math.sqrt(Math.max(0, UPPER_ARM * UPPER_ARM - a * a));
    ikPole.copy(pole).addScaledVector(ikDir, -pole.dot(ikDir));
    if (ikPole.lengthSq() < 1e-8) ikPole.set(0, -1, 0);
    ikPole.normalize();
    return out.copy(shoulder).addScaledVector(ikDir, a).addScaledVector(ikPole, hgt);
  }

  const boneQ = new THREE.Quaternion();
  function orientBone(mesh, a, b) {
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    tmpC.subVectors(b, a);
    const len = tmpC.length();
    if (len < 1e-5) return;
    tmpC.divideScalar(len);
    boneQ.setFromUnitVectors(Y_UP, tmpC);
    mesh.quaternion.copy(boneQ);
  }

  function place(h, dt) {
    // Wrist = contact − R·contactLocal. The hand root IS the wrist.
    tmpA.copy(h.model.contactLocal).applyQuaternion(h.quat);
    h.wrist.copy(h.contact).sub(tmpA);
    h.model.root.position.copy(h.wrist);
    h.model.root.quaternion.copy(h.quat);
    h.poseStep = dt > 0 ? h.model.approachPose(h.poseTarget, dt, P.fingerK, P.fingerRate) : 0;
    solveElbow(h.shoulder, h.wrist, h.pole, h.elbow);
    orientBone(h.arm.upper, h.shoulder, h.elbow);
    orientBone(h.arm.lower, h.elbow, h.wrist);
    tmpA.set(0, h.model.params.palm.length / 2, 0).applyQuaternion(h.quat);
    h.palmCentre.copy(h.wrist).add(tmpA);
  }

  // --- main update ------------------------------------------------------------
  function update(dt, { steerNorm }) {
    clock += dt;
    psi = steerNorm * TAU;
    omega = dt > 0 ? (psi - psiPrev) / dt : 0;
    psiPrev = psi;

    for (const h of hands) if (inContact(h)) updateContact(h, dt);

    // Hand-over-hand: one hand leaves per frame; ties go to the hand the rim
    // is carrying toward its edge fastest (right on clockwise, left on anti).
    const qL = wantsRelease(L);
    const qR = wantsRelease(Rh);
    const cw = omega > 0;
    const first = qL && qR ? (cw ? Rh : L) : qL ? L : qR ? Rh : null;
    if (first) {
      const targets = cw ? P.targetsCW : P.targetsCCW;
      startRelease(first, targets[first.side] * D2R, false);
    } else if (wantsSettle(L)) {
      startRelease(L, L.rest, true);
    } else if (wantsSettle(Rh) && L.state === 'GRIP') {
      startRelease(Rh, Rh.rest, true);
    }

    let shifting = false;
    if (shift) shifting = advanceShift(dt);

    for (const h of hands) {
      if (h === Rh && shifting && h.state === 'SHIFT') {
        // advanceShift wrote contact/quat/poseTarget.
      } else if (inContact(h)) {
        poseOnRim(h, dt);
      } else {
        advanceOffRim(h, dt);
      }
      place(h, dt);
    }
  }

  /** Put both hands on the rim at rest, fingers closed, no blending. */
  function snapToRest(steerNorm = 0) {
    psi = psiPrev = steerNorm * TAU;
    omega = 0;
    shift = null;
    for (const h of hands) {
      h.state = 'GRIP';
      h.settling = false;
      h.material = nudge(h, h.rest - psi, psi, true);
      h.spatial = spatialOf(h);
      h.spokeOffset = Math.abs(wrapAngle(h.material - (h.sgn * Math.PI) / 2)) < Math.max(8, Math.abs(P.spokePalmOffset)) * D2R ? P.spokePalmOffset : 0;
      h.stillT = 1;
      poseOnRim(h, 0);
      h.model.setPose(h.poseTarget);
      place(h, 0);
    }
  }
  // --- thumb solve -------------------------------------------------------------
  // Hand-typed thumb angles don't survive a thicker rim or a different palm
  // roll, so the thumb is solved against the real wheel once per build:
  // coordinate descent over the four thumb joints, minimising penetration
  // (heavily), the tip's distance from where it should rest, and deviation
  // from the table pose (lightly, so the answer stays anatomical).
  const THUMB_RANGE = [[-10, 95], [-35, 75], [-15, 75], [-15, 85]];
  const tipScratch = new THREE.Vector3();
  function thumbPoints(h) {
    group.updateWorldMatrix(true, true);
    const segs = segmentsOf(h, true).filter((sg) => sg.name.startsWith('thumb'));
    const last = segs[segs.length - 1];
    const q = new THREE.Quaternion().fromArray(last.quat);
    tipScratch.set(0, last.halfExtents[1], 0).applyQuaternion(q).add(new THREE.Vector3(...last.centre));
    return { points: segs.flatMap((sg) => sg.points), tip: tipScratch.clone() };
  }
  function solveThumb(h, base, clearanceOf, tipCost) {
    // Multi-start: the table pose plus a coarse grid, then refine the best.
    const starts = [base.slice(12, 16)];
    for (const opp of [0, 45, 90]) for (const flex of [-25, 20, 65]) starts.push([opp, flex, 20, 20]);
    let winner = null;
    for (const st of starts) {
      const r = descend(h, base, st, clearanceOf, tipCost, [12, 6]);
      if (!winner || r.cost < winner.cost) winner = r;
    }
    return descend(h, base, winner.thumb, clearanceOf, tipCost, [4, 2, 1]);
  }
  function descend(h, base, start, clearanceOf, tipCost, steps, around = null) {
    const pose = base.slice();
    for (let i = 0; i < 4; i++) pose[12 + i] = start[i];
    const evalAt = (tc) => {
      h.model.setPose(pose);
      const { points, tip } = thumbPoints(h);
      let c = 0;
      for (const pt of points) {
        const cl = clearanceOf(tmpA.fromArray(pt));
        if (cl < 0.002) c += ((0.002 - cl) * 400) ** 2;
      }
      return c + tc(tip);
    };
    const cost = () => {
      let c = around ? around(evalAt) : evalAt(tipCost);
      for (let i = 12; i < 16; i++) c += ((pose[i] - base[i]) / 90) ** 2 * P.thumbStayNear;
      return c;
    };
    let best = cost();
    for (const stepDeg of steps) {
      let improved = true;
      let guard = 0;
      while (improved && guard++ < 30) {
        improved = false;
        for (let i = 12; i < 16; i++) {
          for (const dir of [1, -1]) {
            const old = pose[i];
            pose[i] = clamp(old + dir * stepDeg, ...THUMB_RANGE[i - 12]);
            const c = cost();
            if (c < best - 1e-9) {
              best = c;
              improved = true;
            } else {
              pose[i] = old;
            }
          }
        }
      }
    }
    return { thumb: pose.slice(12, 16), cost: best };
  }

  /**
   * How far a thumb tip is from resting on the rim just above its side spoke:
   * tip on the tube surface (6 mm skin + pad), and within
   * [thumbRestAbove.min, max] degrees of rim above the spoke. 0 when it rests.
   * Returns metres-equivalent error, so the probe can assert it too.
   */
  function thumbRestError(tip, side) {
    const c = wheel.clearance(tip);
    const sgn = side === 'left' ? -1 : 1;
    const aboveDeg = sgn * (sgn * 90 - c.materialTheta * R2D - psi * R2D);
    const [lo, hi] = P.thumbRestAbove;
    const angErr = aboveDeg < lo ? lo - aboveDeg : aboveDeg > hi ? aboveDeg - hi : 0;
    const surfErr = Math.max(0, Math.abs(c.rim - P.thumbRestGap) - 0.004);
    return Math.hypot(surfErr, angErr * D2R * wheel.curve.R);
  }
  const thumbRestCost = (tip, side) => (thumbRestError(tip, side) * 60) ** 2;

  /** Diagnostic: brute-force the thumb space at the rest pose. */
  function thumbGrid(step = 15) {
    const h = Rh;
    snapToRest(0);
    const pose = POSES.THUMB_ON_SPOKE.slice();
    let bestFree = null;
    let bestClear = null;
    for (let a = THUMB_RANGE[0][0]; a <= THUMB_RANGE[0][1]; a += step)
      for (let b = THUMB_RANGE[1][0]; b <= THUMB_RANGE[1][1]; b += step)
        for (let c = THUMB_RANGE[2][0]; c <= THUMB_RANGE[2][1]; c += step)
          for (let d = THUMB_RANGE[3][0]; d <= THUMB_RANGE[3][1]; d += step) {
            pose[12] = a; pose[13] = b; pose[14] = c; pose[15] = d;
            h.model.setPose(pose);
            const { points, tip } = thumbPoints(h);
            const dist = thumbRestError(tip, 'right');
            let pen = 0;
            for (const pt of points) {
              const cl = wheel.clearance(tmpA.fromArray(pt));
              pen = Math.max(pen, -Math.min(cl.rim, cl.spokes, cl.hub));
            }
            if (!bestFree || dist < bestFree.dist) bestFree = { dist, pen, t: [a, b, c, d] };
            if (pen <= 0.003 && (!bestClear || dist < bestClear.dist)) bestClear = { dist, pen, t: [a, b, c, d] };
          }
    snapToRest(0);
    return { bestFree, bestClear };
  }

  function solveThumbs() {
    const h = Rh;
    const saved = { contact: h.contact.clone(), quat: h.quat.clone() };
    const wheelClear = (pt) => {
      const c = wheel.clearance(pt);
      return Math.min(c.rim, c.spokes, c.hub);
    };
    const report = {};
    // Thumb at rest: the pad on the thumb grip, the bulge on the rim's inner
    // face where the side spoke joins it.
    h.spokeOffset = P.spokePalmOffset;
    rimPose(h.rest - P.spokePalmOffset * D2R, 0, 0, h.contact, h.quat);
    place(h, 0);
    let r = solveThumb(h, POSES.THUMB_ON_SPOKE, wheelClear, (tip) => thumbRestCost(tip, 'right'));
    for (let i = 0; i < 4; i++) POSES.THUMB_ON_SPOKE[12 + i] = r.thumb[i];
    // Hovering thumb, for gripping anywhere but rest, slipping and travelling:
    // the rest thumb eased ~1.8 cm off the tube, staying as close to the rest
    // shape as it can (a straight "lift" reads as a thumbs-up).
    // Solved against three placements at once: plain rim, and each corner of
    // the D's flat bottom passing under the hand (the worst case for a thumb
    // that lies along the tube).
    const placements = [[0, h.rest - 40 * D2R]];
    for (const corner of [P.flatCornerDeg(), -P.flatCornerDeg()]) {
      for (const along of [-16, -8, 0, 8, 16]) placements.push([(90 - 180 + corner + along) * D2R, h.rest]);
    }
    const savedPsi = wheel.psi;
    const hover = descend(
      h,
      POSES.THUMB_ON_SPOKE,
      r.thumb,
      wheelClear,
      null,
      [8, 4, 2, 1],
      (evalAt) => {
        let c = 0;
        for (const [ps, sp] of placements) {
          wheel.setAngle(-ps);
          rimPose(sp, 0, 0, h.contact, h.quat);
          place(h, 0);
          c += evalAt((tip) => ((Math.max(0, Math.abs(wheel.clearance(tip).rim - P.thumbHoverGap) - 0.006)) * 60) ** 2 * 4);
        }
        wheel.setAngle(-savedPsi);
        return c;
      }
    );
    report.hover = hover;
    // The thumb only lies ON the rim at rest (THUMB_ON_SPOKE, blended in by the
    // spoke offset). A thumb that wraps the tube must swing through it on every
    // re-grip, and the D-rim's corners pass under a resting thumb.
    for (let i = 0; i < 4; i++) {
      for (const pose of [POSES.RIM_GRIP, POSES.RELAXED, POSES.RIM_SLIP, POSES.RIM_CLOSING]) pose[12 + i] = hover.thumb[i];
    }
    // Knob: thumb wrapped round the side of the sphere.
    knobContact(h.contact);
    h.quat.copy(knobQuat);
    place(h, 0);
    const knob = shifterKnobLocal();
    const knobClear = (pt) => pt.distanceTo(knob) - KNOB_RADIUS;
    r = solveThumb(h, POSES.KNOB_GRIP, knobClear, (tip) => ((knobClear(tip) - 0.004) * 60) ** 2);
    for (let i = 0; i < 4; i++) POSES.KNOB_GRIP[12 + i] = r.thumb[i];
    report.knob = r;
    h.contact.copy(saved.contact);
    h.quat.copy(saved.quat);
    return report;
  }
  snapToRest(0);

  // --- debug ----------------------------------------------------------------
  const inv = new THREE.Matrix4();
  const segM = new THREE.Matrix4();
  const e = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const c = new THREE.Vector3();
  const segQ = new THREE.Quaternion();
  const segBasis = new THREE.Matrix4();

  /**
   * Segment OBBs in the rig group's frame (car-local when the rig is added to
   * the car mesh). Requires world matrices to be current.
   */
  function segmentsOf(h, withCorners = false) {
    group.updateWorldMatrix(true, true);
    inv.copy(group.matrixWorld).invert();
    const out = [];
    for (const s of h.model.segments) {
      segM.multiplyMatrices(inv, s.mesh.matrixWorld);
      segM.extractBasis(e[0], e[1], e[2]);
      const half = [0, 0, 0];
      if (s.centre) {
        c.set(...s.centre).applyMatrix4(segM);
        for (let i = 0; i < 3; i++) half[i] = (s.size[i] * e[i].length()) / 2;
      } else {
        c.setFromMatrixPosition(segM);
        for (let i = 0; i < 3; i++) half[i] = e[i].length() / 2;
      }
      for (const v of e) v.normalize();
      if (e[0].clone().cross(e[1]).dot(e[2]) < 0) e[0].negate();
      segBasis.makeBasis(e[0], e[1], e[2]);
      segQ.setFromRotationMatrix(segBasis);
      const seg = { name: s.name, centre: c.toArray(), halfExtents: half, quat: segQ.toArray() };
      if (withCorners) {
        seg.points = [c.toArray()];
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
          seg.points.push(
            c.clone()
              .addScaledVector(e[0], sx * half[0])
              .addScaledVector(e[1], sy * half[1])
              .addScaledVector(e[2], sz * half[2])
              .toArray()
          );
        }
      }
      out.push(seg);
    }
    return out;
  }

  function stateLabel(h) {
    if (h.state === 'TRAVEL' && h.settling) return 'SETTLE';
    return h.state;
  }

  function handDebug(h, withSegments) {
    const reach = h.shoulder.distanceTo(h.wrist);
    const d = {
      state: stateLabel(h),
      spatialDeg: h.spatial * R2D,
      materialDeg: wrapAngle(h.material) * R2D,
      contact: h.contact.toArray(),
      palmCentre: h.palmCentre.toArray(),
      wrist: h.wrist.toArray(),
      elbow: h.elbow.toArray(),
      shoulder: h.shoulder.toArray(),
      extensionRatio: reach / (UPPER_ARM + FOREARM),
      spokeOffsetDeg: h.spokeOffset,
      travels: h.travels,
      travelU: h.state === 'TRAVEL' ? clamp(h.t / h.travelDur, 0, 1) : 0,
      slipT: h.state === 'SLIP' ? h.slipT : 0,
      poseStepDeg: h.poseStep,
      joints: Array.from(h.model.angles),
    };
    if (withSegments) d.segments = segmentsOf(h, withSegments === 'corners');
    if (h === Rh) d.shiftPhase = shift && shift.phase !== 'wait' ? shift.phase : null;
    return d;
  }

  function debug(withSegments = false) {
    return {
      rim: { angleDeg: psi * R2D, omegaDegS: omega * R2D },
      grabs,
      hands: { left: handDebug(L, withSegments), right: handDebug(Rh, withSegments) },
    };
  }

  /** Shoulder-to-wrist distance with a hand gripping at a spatial angle (reach table). */
  function reachAt(side, spatialDeg) {
    const h = side === 'left' ? L : Rh;
    rimPose(spatialDeg * D2R, 0, 0, tmpA, tmpQ);
    tmpB.copy(h.model.contactLocal).applyQuaternion(tmpQ);
    return h.shoulder.distanceTo(tmpA.sub(tmpB));
  }

  // Solved after every helper above exists (segmentsOf uses the debug scratch).
  const thumbReport = P.solveThumbs === false ? null : solveThumbs();
  snapToRest(0);

  function dispose() {
    for (const h of hands) {
      h.model.dispose();
      h.arm.upper.geometry.dispose();
      h.arm.lower.geometry.dispose();
    }
    group.removeFromParent();
  }

  return {
    group,
    update,
    beginShift,
    snapToRest,
    debug,
    reachAt,
    thumbReport,
    thumbRestError,
    thumbGrid,
    poses: POSES,
    params: P,
    hands: { left: L, right: Rh },
    get isShifting() {
      return shift !== null;
    },
    get shiftGear() {
      return lastShiftGear;
    },
    dispose,
  };
}
