/**
 * RimCurve.js — the steering wheel rim's centreline, as pure maths.
 *
 * No three.js import: the wheel mesh (SteeringWheel.js), the hand rig
 * (HandRig.js), the wheel lab and the browser probes all evaluate the SAME
 * function, so "the hand is on the rim" can be checked against the curve the rim
 * was actually built from, not against a circle that merely resembles it.
 *
 * ------------------------------ CONVENTIONS --------------------------------
 * The wheel's own 2D plane, as the driver sees it: x right, y up. The polar
 * angle θ is measured CLOCKWISE from 12 o'clock, so 3 o'clock is +π/2 and
 * 9 o'clock is −π/2. That is the same convention Cockpit.gripPointLocal uses.
 *
 * The rim is a circle of radius R with a flattened bottom ("D" shape): for θ
 * within ±F of 6 o'clock the centreline follows the horizontal chord
 * y = −R·cos F, i.e. r(θ) = R·cos F / cos(θ − π). The two corners where the
 * chord meets the circle are softened with a polynomial smooth-min of width
 * `fillet` metres, which moves the corner inward by fillet/4 and leaves every
 * other angle exact.
 */
import {
  WHEEL_RIM_RADIUS,
  WHEEL_SPORT,
} from './Dimensions.js';

const TAU = Math.PI * 2;

/** Wrap an angle to (−π, π]. */
export function wrapAngle(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

/** Polynomial smooth minimum (C1), width k. Exactly min(a, b) when |a − b| ≥ k. */
function smin(a, b, k) {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - (h * h * k) / 4;
}

/**
 * Builds a rim curve for a parameter set. The game uses the default instance
 * exported below; the wheel lab builds its own when the sliders move.
 *
 * @param {{R?: number, tube?: number, flatHalfDeg?: number, fillet?: number}} p
 */
export function createRimCurve(p = {}) {
  const R = p.R ?? WHEEL_RIM_RADIUS;
  const tube = p.tube ?? WHEEL_SPORT.rimTube;
  const F = ((p.flatHalfDeg ?? WHEEL_SPORT.flatHalfDeg) * Math.PI) / 180;
  const fillet = p.fillet ?? WHEEL_SPORT.rimFillet;
  const chordY = R * Math.cos(F);

  /** Centreline radius at polar angle θ. */
  function radius(theta) {
    const c = Math.cos(wrapAngle(theta) - Math.PI); // 1 at 6 o'clock
    const chord = c > 1e-6 ? chordY / c : Infinity;
    return smin(R, chord, fillet);
  }

  function rimPoint2D(theta, out = { x: 0, y: 0 }) {
    const r = radius(theta);
    out.x = r * Math.sin(theta);
    out.y = r * Math.cos(theta);
    return out;
  }

  const H = 1e-4;
  /**
   * Centreline point, unit tangent (direction of increasing θ = clockwise) and
   * unit in-plane OUTWARD normal (away from the hub).
   */
  function rimFrame2D(theta, out = { x: 0, y: 0, tx: 0, ty: 0, nx: 0, ny: 0 }) {
    const r = radius(theta);
    const dr = (radius(theta + H) - radius(theta - H)) / (2 * H);
    const s = Math.sin(theta);
    const c = Math.cos(theta);
    out.x = r * s;
    out.y = r * c;
    let tx = dr * s + r * c;
    let ty = dr * c - r * s;
    const len = Math.hypot(tx, ty) || 1;
    tx /= len;
    ty /= len;
    out.tx = tx;
    out.ty = ty;
    // Rotating a clockwise tangent by +90° (counter-clockwise) points outward.
    out.nx = -ty;
    out.ny = tx;
    return out;
  }

  const scratch = { x: 0, y: 0 };
  /**
   * Nearest point on the centreline to a point given in the wheel's own frame
   * (x, y in the plane; z along the wheel axis, + toward the driver).
   * Returns { theta, dist } where dist is the 3D distance to the centreline, so
   * `dist − tube` is the signed distance to the rim's surface.
   */
  function nearest(x, y, z = 0) {
    let best = Math.atan2(x, y);
    const d2 = (t) => {
      rimPoint2D(t, scratch);
      return (scratch.x - x) ** 2 + (scratch.y - y) ** 2;
    };
    // Golden-section refinement around the polar guess. On the flat segment
    // the nearest point and the polar ray differ by at most a few degrees.
    let lo = best - 0.35;
    let hi = best + 0.35;
    const g = 0.381966;
    let a = lo + g * (hi - lo);
    let b = hi - g * (hi - lo);
    let fa = d2(a);
    let fb = d2(b);
    for (let i = 0; i < 40; i++) {
      if (fa < fb) {
        hi = b;
        b = a;
        fb = fa;
        a = lo + g * (hi - lo);
        fa = d2(a);
      } else {
        lo = a;
        a = b;
        fa = fb;
        b = hi - g * (hi - lo);
        fb = d2(b);
      }
    }
    best = (lo + hi) / 2;
    return { theta: wrapAngle(best), dist: Math.sqrt(d2(best) + z * z) };
  }

  return { R, tube, flatHalfRad: F, fillet, radius, rimPoint2D, rimFrame2D, nearest };
}

/** The game's rim, built from Dimensions.js. */
export const RIM = createRimCurve();
export const RIM_TUBE = RIM.tube;
export const rimPoint2D = RIM.rimPoint2D;
export const rimFrame2D = RIM.rimFrame2D;
