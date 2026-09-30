/**
 * BackupCamera.js — the reversing camera: a real rear-facing render, plus the
 * green/yellow/red guidelines that bend with the steering.
 *
 * The guidelines are not a decal. They are the car's actual predicted path,
 * computed from a bicycle model and then projected through the reversing
 * camera's own lens, so they bend correctly, foreshorten correctly, and end up
 * exactly where the car will be.
 *
 * ------------------------------ THE MATHS ----------------------------------
 * With a steer angle d at the front wheels and a wheelbase L, the whole car
 * pivots about an instantaneous centre of rotation (ICR) that lies on the rear
 * axle line, R = L / tan(d) to one side. Measured convention (see Car.js):
 * a POSITIVE steer angle turns LEFT, and left is local -X, so:
 *
 *      ICR = (-R, 0, AXLE_Z)
 *
 * A point p on the car sweeps a circle about that ICR. Backing up an arc
 * length s rotates every point by psi = -s / R about the ICR (the sign falls
 * out of requiring the rear axle to move toward +Z, i.e. backwards). As d goes
 * to zero R goes to infinity and the arcs straighten out, which is handled as
 * a separate branch to avoid dividing by ~0.
 *
 * Projection is done in CAR-LOCAL space: the camera is bolted to the car, so
 * its local matrix never changes, and one cached inverse turns car-local
 * points straight into camera space with no world transforms involved.
 */
import * as THREE from 'three';
import {
  REAR_CAM_POS,
  REAR_CAM_FOV,
  REAR_CAM_PITCH,
  WHEELBASE,
  AXLE_Z,
  CHASSIS_SIZE,
  BUMPER_Z,
  SCREEN_SIZE,
} from '../vehicle/Dimensions.js';

const RT_W = 512;
const RT_H = Math.round((RT_W * SCREEN_SIZE[1]) / SCREEN_SIZE[0]); // keep the
// render target's aspect identical to the physical screen, or the feed is
// stretched on the dash.

const CANVAS_W = 512;
const CANVAS_H = RT_H;

/** Distance zones behind the bumper, in metres. */
const ZONES = [
  { to: 0.5, color: '#ff6b5e' }, // red
  { to: 1.2, color: '#f2c661' }, // yellow
  { to: 2.6, color: '#79e3a6' }, // green
];
const BARS = [
  { s: 0.45, color: '#ff6b5e', label: '0.5' },
  { s: 1.15, color: '#f2c661', label: '1.2' },
  { s: 2.3, color: '#79e3a6', label: '2.5' },
];

/** Half-width of the guideline corridor: the car's body, plus nothing. */
const HALF_W = CHASSIS_SIZE[0] / 2 - 0.05;
/**
 * Where the guidelines start: the rear bumper face, in the SAME frame
 * ParkingSensors.js measures `rearDist` from (BUMPER_Z — see Dimensions.js).
 * Used to be a separate hard-coded 2.16, ~6 cm off HALF_L's face — the rails
 * and the numeric readout disagreed about where "0" was, so an obstacle
 * reported at 1.4 m could visually line up with the fixed 0.5 m bar instead.
 */
const START_Z = BUMPER_Z;

export function createBackupCamera({ carMesh }) {
  // --- the camera -----------------------------------------------------------
  const camera = new THREE.PerspectiveCamera(REAR_CAM_FOV, RT_W / RT_H, 0.05, 120);
  camera.position.set(...REAR_CAM_POS);
  // Yaw 180 to face backwards, then pitch down. With Euler order XYZ the X
  // term is applied last, which is what puts the tilt in the already-turned
  // frame: (0,0,-1) -> Ry(pi) -> (0,0,1) -> Rx(+p) -> (0, -sin p, cos p),
  // i.e. backwards and DOWN.
  camera.rotation.set(REAR_CAM_PITCH, Math.PI, 0);
  camera.updateMatrix();
  camera.updateProjectionMatrix();
  carMesh.add(camera);

  // HalfFloat and linear, not 8-bit sRGB. three.js does not tone-map into a
  // render target, and the lit scene runs well past 1.0 in linear terms, so an
  // 8-bit target clipped the whole feed to a pale white wash. Kept in HDR, the
  // composer's OutputPass tone-maps the screen along with everything else.
  const renderTarget = new THREE.WebGLRenderTarget(RT_W, RT_H, {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: true,
  });

  // --- guideline canvas ------------------------------------------------------
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext('2d');
  const guidelineTexture = new THREE.CanvasTexture(canvas);
  guidelineTexture.colorSpace = THREE.SRGBColorSpace;

  // Car-local -> camera space. Constant, because the camera is bolted on.
  const invCamLocal = new THREE.Matrix4().copy(camera.matrix).invert();
  const scratch = new THREE.Vector3();

  function project(x, y, z) {
    scratch.set(x, y, z).applyMatrix4(invCamLocal);
    // Anything at or behind the lens plane cannot be drawn; the projection
    // would flip it to the far side of the screen.
    if (scratch.z > -camera.near) return null;
    scratch.applyMatrix4(camera.projectionMatrix);
    return {
      x: (scratch.x * 0.5 + 0.5) * CANVAS_W,
      y: (1 - (scratch.y * 0.5 + 0.5)) * CANVAS_H,
    };
  }

  /**
   * Where a car-local point ends up after reversing `s` metres at steer `d`.
   * Returns [x, z]; y stays on the ground.
   */
  function sweep(x0, z0, s, steerRad) {
    if (Math.abs(steerRad) < 0.006) return [x0, z0 + s]; // straight
    const R = WHEELBASE / Math.tan(steerRad);
    const cx = -R;
    const cz = AXLE_Z;
    const psi = -s / R;
    const c = Math.cos(psi);
    const sn = Math.sin(psi);
    const dx = x0 - cx;
    const dz = z0 - cz;
    return [cx + dx * c + dz * sn, cz - dx * sn + dz * c];
  }

  let lastSteer = NaN;
  let lastDrawnActive = false;
  let lastDistKey = '';

  function drawGuidelines(steerRad, rearDist) {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    // Rails: one polyline per side, split into the three distance zones.
    for (const side of [-1, 1]) {
      let from = 0;
      for (const zone of ZONES) {
        const pts = [];
        const steps = 9;
        for (let i = 0; i <= steps; i++) {
          const s = from + ((zone.to - from) * i) / steps;
          const [x, z] = sweep(side * HALF_W, START_Z, s, steerRad);
          const p = project(x, 0.02, z);
          if (p) pts.push(p);
        }
        strokePath(pts, zone.color, 6);
        from = zone.to;
      }
    }

    // The actual obstacle marker: swept to `rearDist`, not to a fixed zone
    // boundary like the BARS below. This is what the driver should trust as
    // "the obstacle is here" — the BARS stay as a general depth guide, but an
    // obstacle at 1.4 m now marks 1.4 m instead of only coinciding, by
    // coincidence of perspective, with a fixed bar.
    //
    // A first version drew this as a full-width line, glowing and on top of
    // the bars: at the compressed distances this screen covers (0.5-2.5 m),
    // a real distance often lands within a few screen pixels of a fixed bar,
    // so the full-width line and the bar's label kept blotting each other
    // out (reported with a screenshot). Small chevrons at the rail edges
    // instead — they mark the same swept position without ever crossing the
    // centre of the screen, where the bar labels live.
    if (rearDist != null) {
      const zone = ZONES.find((z) => rearDist <= z.to) ?? ZONES[ZONES.length - 1];
      for (const side of [-1, 1]) {
        const [x, z] = sweep(side * HALF_W, START_Z, rearDist, steerRad);
        const p = project(x, 0.02, z);
        if (p) drawChevron(p, side, zone.color);
      }
    }

    // Lateral bars at each zone boundary.
    for (const bar of BARS) {
      const pts = [];
      for (let i = 0; i <= 6; i++) {
        const t = -1 + (2 * i) / 6;
        const [x, z] = sweep(t * HALF_W, START_Z, bar.s, steerRad);
        const p = project(x, 0.02, z);
        if (p) pts.push(p);
      }
      strokePath(pts, bar.color, 5);
      if (pts.length) {
        const mid = pts[Math.floor(pts.length / 2)];
        ctx.font = '600 20px ui-sans-serif, system-ui, sans-serif';
        ctx.fillStyle = bar.color;
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0,0,0,0.85)';
        ctx.shadowBlur = 6;
        ctx.fillText(`${bar.label}m`, mid.x, mid.y - 10);
        ctx.shadowBlur = 0;
      }
    }

    // Screen furniture: a frame and a mode chip, so the dash panel reads as a
    // device rather than as a hole cut in the dashboard.
    ctx.strokeStyle = 'rgba(230,240,238,0.28)';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, CANVAS_W - 4, CANVAS_H - 4);
    ctx.fillStyle = 'rgba(10,14,16,0.72)';
    ctx.fillRect(12, 12, 92, 34);
    ctx.fillStyle = '#e8c98a';
    ctx.font = '700 20px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('REVERSE', 20, 36);

    // Rear sensor distance, top right, coloured by the same zones as the rails.
    if (rearDist != null) {
      const zone = ZONES.find((z) => rearDist <= z.to) ?? ZONES[ZONES.length - 1];
      const label = rearDist < 0.3 ? 'STOP' : `${rearDist.toFixed(1)} m`;
      ctx.fillStyle = 'rgba(10,14,16,0.72)';
      ctx.fillRect(CANVAS_W - 128, 12, 116, 40);
      ctx.fillStyle = zone.color;
      ctx.font = '700 26px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, CANVAS_W - 70, 42);
    }

    guidelineTexture.needsUpdate = true;
  }

  /** Small triangle at `p`, pointing inward (toward the screen centre), marking the true obstacle distance on one rail. White outline so it reads against a rail of the same zone colour, not just a dark casing. */
  function drawChevron(p, side, color) {
    const w = 20;
    const h = 15;
    const dx = side === -1 ? 1 : -1; // -1 = left rail, points right; +1 = right rail, points left
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - h / 2);
    ctx.lineTo(p.x + dx * w, p.y);
    ctx.lineTo(p.x, p.y + h / 2);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function strokePath(pts, color, width) {
    if (pts.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    // A dark casing under each line keeps it readable over pale concrete.
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = width + 4;
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  return {
    camera,
    renderTarget,
    feedTexture: renderTarget.texture,
    guidelineTexture,

    /**
     * @param {boolean} active  is the screen showing anything at all
     * @param {number}  steerRad current road-wheel angle
     * @param {number|null} rearDist rear parking-sensor reading, metres
     */
    update(active, steerRad, rearDist = null) {
      if (!active) {
        lastDrawnActive = false;
        return;
      }
      // Redraw only when the picture would actually change.
      const distKey = rearDist == null ? '-' : rearDist.toFixed(1);
      if (!lastDrawnActive || Math.abs(steerRad - lastSteer) > 0.004 || distKey !== lastDistKey) {
        lastSteer = steerRad;
        lastDistKey = distKey;
        lastDrawnActive = true;
        drawGuidelines(steerRad, rearDist);
      }
    },

    /** Renders the rear view into the dash screen's texture. */
    render(renderer, scene, { reuseShadows = true } = {}) {
      const prev = renderer.getRenderTarget();
      // Reuse the main frame's shadow maps; by default every render() call
      // would redraw them for this one small view. Not on a level's first
      // frame, though — see Mirrors.renderOne for why that breaks.
      const prevShadow = renderer.shadowMap.autoUpdate;
      if (reuseShadows) renderer.shadowMap.autoUpdate = false;
      renderer.setRenderTarget(renderTarget);
      renderer.render(scene, camera);
      renderer.setRenderTarget(prev);
      renderer.shadowMap.autoUpdate = prevShadow;
    },

    dispose() {
      renderTarget.dispose();
      guidelineTexture.dispose();
    },
  };
}
