/**
 * ProximityRadar.js — the top-down proximity display, drawn to a 2D canvas.
 *
 * Car-centred and heading-up: your car is a fixed icon in the middle and the
 * world rotates around it, which is the only orientation that lets you steer
 * by the picture without translating it in your head first.
 *
 * Same cost discipline as DashCluster.js: the rings and the car icon never
 * change, so they are drawn ONCE to an offscreen canvas and blitted; the live
 * pass is one drawImage plus the footprints. Redraws are capped, and skipped
 * entirely when nothing has moved enough to see — parked in P against an empty
 * aisle, the texture is not re-uploaded at all.
 *
 * The canvas is used two ways: as a texture on the dashboard screen, and as a
 * DOM overlay. Both read this same canvas, so there is only ever one of it.
 */
import { RADAR_RANGE } from '../vehicle/ProximityScan.js';

/**
 * The dash screen is 0.30 x 0.18 m (Dimensions.SCREEN_SIZE), so the canvas is
 * that 5:3 shape. The radar itself is drawn as a circle inside it, sized by
 * the SHORT side: stretching a square canvas onto this plane turned every
 * range ring into an ellipse, which is exactly the kind of lie a distance
 * display must not tell.
 */
const W = 320;
const H = 192;
const SIZE = Math.min(W, H);
const REDRAW_SEC = 1 / 15;
/** Movement (in canvas pixels) that justifies a redraw. */
const MOVE_EPS = 1.5;

/** Range rings, metres. */
const RINGS = [2, 4, 8, 12];

const INK = '#eef4f2';
const DIM = 'rgba(200,215,212,0.55)';
const MINT = '#8fe6bb';
const AMBER = '#e8c98a';
const RED = '#e0857b';

/** Same bands the cluster and the reverse camera use, so nothing disagrees. */
function zoneColor(d) {
  if (d < 0.3) return RED;
  if (d < 0.8) return AMBER;
  if (d < 1.5) return MINT;
  return DIM;
}

export function createProximityRadar() {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  const face = document.createElement('canvas');
  face.width = W;
  face.height = H;

  const CX = W / 2;
  const CY = H / 2;
  const R = SIZE / 2 - 6; // radius of the outer ring
  const scale = R / RADAR_RANGE; // pixels per metre
  const px = (x) => CX + x * scale;
  const py = (z) => CY - z * scale; // +z is forward, and forward is up

  let accum = REDRAW_SEC;
  let dirty = true;
  let lastKey = '';
  let pulse = 0;

  // --- static face ----------------------------------------------------------
  {
    const f = face.getContext('2d');
    f.clearRect(0, 0, W, H);

    f.fillStyle = 'rgba(10,14,16,0.82)';
    f.fillRect(0, 0, W, H);
    f.fillStyle = 'rgba(16,22,25,0.9)';
    f.beginPath();
    f.arc(CX, CY, R + 3, 0, Math.PI * 2);
    f.fill();

    f.strokeStyle = 'rgba(190,210,208,0.16)';
    f.lineWidth = 1;
    for (const r of RINGS) {
      f.beginPath();
      f.arc(CX, CY, r * scale, 0, Math.PI * 2);
      f.stroke();
    }
    // Cross hairs, broken at the centre so they don't run through the car.
    f.beginPath();
    f.moveTo(CX, CY - R);
    f.lineTo(CX, CY - 22);
    f.moveTo(CX, CY + 22);
    f.lineTo(CX, CY + R);
    f.moveTo(CX - R, CY);
    f.lineTo(CX - 16, CY);
    f.moveTo(CX + 16, CY);
    f.lineTo(CX + R, CY);
    f.stroke();

    f.fillStyle = DIM;
    f.font = '600 11px ui-sans-serif, system-ui, -apple-system, sans-serif';
    f.textAlign = 'left';
    for (const r of RINGS) f.fillText(`${r}`, CX + 3, CY - r * scale + 12);

    f.textAlign = 'left';
    f.fillStyle = MINT;
    f.font = '700 11px ui-sans-serif, system-ui, -apple-system, sans-serif';
    f.fillText('RADAR', 12, 20);

    // The car: a plan-view silhouette, nose up, drawn to the same scale as
    // everything else so the rings read as real distances from the bodywork.
    const w = 1.78 * scale;
    const l = 4.2 * scale;
    f.fillStyle = 'rgba(143,230,187,0.20)';
    f.strokeStyle = MINT;
    f.lineWidth = 1.4;
    f.beginPath();
    f.roundRect(CX - w / 2, CY - l / 2, w, l, 3);
    f.fill();
    f.stroke();
    // Nose notch, so which way is forward is never ambiguous.
    f.beginPath();
    f.moveTo(CX - w / 2 + 2, CY - l / 2);
    f.lineTo(CX, CY - l / 2 - 5);
    f.lineTo(CX + w / 2 - 2, CY - l / 2);
    f.closePath();
    f.fillStyle = MINT;
    f.fill();
  }

  function draw(blips) {
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(face, 0, 0);

    ctx.save();
    ctx.beginPath();
    ctx.arc(CX, CY, R, 0, Math.PI * 2);
    ctx.clip();

    let closest = Infinity;
    for (const b of blips) {
      const color = zoneColor(b.distance);
      // Fade with distance so the near things dominate the picture.
      ctx.globalAlpha = Math.max(0.22, 1 - b.distance / RADAR_RANGE);
      ctx.fillStyle = color;
      ctx.beginPath();
      b.corners.forEach(([x, z], i) => {
        const sx = px(x);
        const sz = py(z);
        if (i === 0) ctx.moveTo(sx, sz);
        else ctx.lineTo(sx, sz);
      });
      ctx.closePath();
      ctx.fill();
      if (b.distance < closest) closest = b.distance;
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // Contact warning: a ring that breathes while something is inside 0.3 m.
    if (closest < 0.3) {
      ctx.strokeStyle = RED;
      ctx.lineWidth = 2 + Math.sin(pulse * 7) * 1.2;
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.arc(CX, CY, R - 1, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Nearest-obstacle readout, bottom right.
    ctx.fillStyle = closest === Infinity ? DIM : zoneColor(closest);
    ctx.font = '700 15px ui-sans-serif, system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(closest === Infinity ? '—' : `${closest.toFixed(1)} m`, W - 10, H - 10);
  }

  return {
    canvas,

    /**
     * @param {number} dt
     * @param {Array}  blips  from ProximityScan
     * @returns {boolean} true when the canvas changed (upload the texture)
     */
    update(dt, blips) {
      pulse += dt;
      accum += dt;
      if (accum < REDRAW_SEC) return false;
      accum = 0;

      // Cheap change test: quantise each footprint's first corner and the
      // nearest distance. Nothing moving means nothing to upload.
      let key = '';
      let closest = Infinity;
      for (const b of blips) {
        const [x, z] = b.corners[0];
        key += `${Math.round(px(x) / MOVE_EPS)},${Math.round(py(z) / MOVE_EPS)};`;
        if (b.distance < closest) closest = b.distance;
      }
      // While something is very close the warning ring is animating, so the
      // canvas genuinely changes every frame and must keep being uploaded.
      const animating = closest < 0.3;
      if (key === lastKey && !dirty && !animating) return false;
      lastKey = key;
      dirty = false;
      draw(blips);
      return true;
    },

    /** Force a redraw on the next update (theme/visibility changes). */
    invalidate() {
      dirty = true;
    },
  };
}
