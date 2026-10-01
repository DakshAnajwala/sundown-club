/**
 * poses.js — joint angles for Figure.js (design/SPEC-models.md §2.3).
 *
 * Angles are degrees, Euler order ZXY ([x, y, z]: twist about the bone
 * first, then x, then z). Written for the RIGHT side; Figure.js mirrors the
 * left side (negates y and z), so a symmetric pose lists one side only and
 * an asymmetric one lists both.
 *
 *   arms, legs (hang down)   +x swings forward, +z swings out to the side,
 *                            +y twists inward
 *   elbow                    +x bends the forearm forward
 *   knee                     -x bends the shin back
 *   ankle                    +x lifts the toes
 *   pelvis, spine, neck,     +x tilts BACK (-x leans forward), +y turns to
 *   head (point up)          the figure's left, +z leans to its left
 *
 * `drop` lowers the hip joint by that many metres at the 1.76 m reference
 * height (scaled with the figure). `hide` lists parts a pose hides (a long
 * coat's skirt when seated).
 */

export const POSES = {
  stand: {
    shoulderR: [2, 0, 7],
    elbowR: [10, 0, 0],
    hipR: [0, 0, 2],
    kneeR: [-2, 0, 0],
    head: [-3, 0, 0],
  },

  relaxed: {
    pelvis: [0, 0, -3],
    spine: [0, 0, 3],
    shoulderR: [3, 0, 7],
    elbowR: [14, 0, 0],
    shoulderL: [-3, 0, 6],
    elbowL: [8, 0, 0],
    hipR: [0, 0, 6],
    hipL: [6, 0, -1],
    kneeL: [-14, 0, 0],
    ankleL: [6, 0, 0],
    head: [-4, 10, 0],
  },

  armsCrossed: {
    shoulderR: [22, 74, 6],
    elbowR: [118, 0, 0],
    shoulderL: [30, 70, 4],
    elbowL: [108, 0, 0],
    hipR: [0, 0, 4],
    head: [-2, 0, 0],
  },

  handsInPockets: {
    shoulderR: [-8, 14, 13],
    elbowR: [40, 0, 0],
    wristR: [0, 0, 0],
    hipR: [0, 0, 4],
    head: [-6, 0, 0],
  },

  holdKey: {
    shoulderR: [52, 22, 6],
    elbowR: [34, 0, 0],
    wristR: [-20, 0, 0],
    shoulderL: [2, 0, 7],
    elbowL: [10, 0, 0],
    hipR: [0, 0, 3],
    head: [-16, 0, 0],
  },

  point: {
    shoulderR: [84, 0, 12],
    elbowR: [6, 0, 0],
    shoulderL: [2, 0, 7],
    elbowL: [12, 0, 0],
    spine: [0, 6, 0],
    hipR: [0, 0, 4],
    head: [0, -6, 0],
  },

  talk: {
    shoulderR: [22, 26, 10],
    elbowR: [78, 0, 0],
    wristR: [-10, 0, 0],
    shoulderL: [4, 0, 8],
    elbowL: [22, 0, 0],
    hipR: [0, 0, 4],
    head: [-4, 6, 0],
  },

  // The upper arm twists inward 80 degrees first, so the elbow bends the
  // forearm back toward the hip instead of forward.
  handsOnHips: {
    shoulderR: [-8, 80, 42],
    elbowR: [100, 0, 0],
    wristR: [0, 0, 0],
    hipR: [0, 0, 6],
    head: [-2, 0, 0],
  },

  /** Leaning back against a car, arms crossed, ankles crossed. */
  lean: {
    pelvis: [9, 0, 0],
    spine: [3, 0, 0],
    shoulderR: [22, 74, 6],
    elbowR: [118, 0, 0],
    shoulderL: [30, 70, 4],
    elbowL: [108, 0, 0],
    hipR: [10, 0, -5],
    hipL: [4, 0, 5],
    kneeR: [-4, 0, 0],
    ankleR: [-8, 0, 0],
    ankleL: [-10, 0, 0],
    head: [-8, 0, 0],
    drop: 0.03,
  },

  /** On one knee by a wheel (Mara looking the car over). */
  kneel: {
    drop: 0.42,
    pelvis: [-6, 0, 0],
    spine: [-16, 0, 0],
    head: [-18, 0, 0],
    hipR: [92, 0, 8],
    kneeR: [-92, 0, 0],
    ankleR: [0, 0, 0],
    hipL: [-2, 0, 4],
    kneeL: [-90, 0, 0],
    ankleL: [40, 0, 0],
    shoulderR: [56, 0, 10],
    elbowR: [22, 0, 0],
    shoulderL: [34, 0, 8],
    elbowL: [52, 0, 0],
    hide: ['coatSkirt'],
  },

  /** Driving: reclined, hands at a wheel ~0.55 m ahead of the shoulders. */
  seated: {
    pelvis: [22, 0, 0],
    spine: [4, 0, 0],
    neck: [-6, 0, 0],
    head: [-14, 0, 0],
    hipR: [64, 0, 6],
    kneeR: [-40, 0, 0],
    ankleR: [12, 0, 0],
    hipL: [62, 0, 8],
    kneeL: [-46, 0, 0],
    ankleL: [12, 0, 0],
    shoulderR: [50, 0, -2],
    elbowR: [30, 0, 0],
    hide: ['coatSkirt'],
  },

  /** Race starter: both arms straight up. */
  armsUp: {
    shoulderR: [168, 0, 16],
    elbowR: [4, 0, 0],
    hipR: [0, 0, 5],
    head: [6, 0, 0],
  },
};

/**
 * A walking pose at `phase` (0..1 is one full stride, right foot forward at
 * 0). Scenes advance phase by distance / stride (STRIDE at 1.76 m; a run's
 * stride is RUN_STRIDE). `run` 0..1 blends a walk into a run: longer swing,
 * more knee, bent arms, the body leaning into it.
 */
export const STRIDE = 1.5;
export const RUN_STRIDE = 2.6;

export function walkPose(phase, run = 0) {
  const a = phase * Math.PI * 2;
  const s = Math.sin(a);
  const c = Math.cos(a);
  const k = 1 + 0.7 * run;
  // The leg swinging forward bends its knee mid-swing; the planted leg stays straight.
  const kneeBend = (x) => -6 - (34 + 50 * run) * Math.max(0, x);
  return {
    drop: (0.015 + 0.03 * run) * (1 - Math.abs(c)),
    pelvis: [-8 * run, 4 * s, 0],
    spine: [-3 - 6 * run, -6 * s, 0],
    head: [-3 + 8 * run, 2 * s, 0],
    hipR: [24 * k * s + 8 * run, 0, 2],
    hipL: [-24 * k * s + 8 * run, 0, 2],
    kneeR: [kneeBend(Math.sin(a + 1.4)), 0, 0],
    kneeL: [kneeBend(Math.sin(a + 1.4 + Math.PI)), 0, 0],
    ankleR: [6 * c, 0, 0],
    ankleL: [-6 * c, 0, 0],
    shoulderR: [-18 * k * s, 0, 7],
    shoulderL: [18 * k * s, 0, 7],
    elbowR: [16 + 60 * run + 10 * Math.max(0, -s), 0, 0],
    elbowL: [16 + 60 * run + 10 * Math.max(0, s), 0, 0],
  };
}

export const POSE_NAMES = Object.keys(POSES);
