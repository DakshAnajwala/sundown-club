/**
 * DashCluster.js — the analog instrument binnacle, drawn to a 2D canvas and
 * mapped onto a plane in the dashboard.
 *
 * It is a real object in the car rather than a DOM overlay, because a HUD
 * floating in screen space breaks the first-person illusion the rest of the
 * game is built around.
 *
 * Layout (canvas 784 x 280, the same 2.8:1 aspect as CLUSTER_SIZE):
 *
 *     [ tachometer ]   [ gear · speed · sensors ]   [ speedometer ]
 *
 * NEEDLES are driven by a critically-damped spring, not by the raw value: a
 * physical needle has inertia, so it swings and settles instead of teleporting
 * when the car's rpm jumps by 500 on a throttle blip. Critical damping (zeta =
 * 1) is the fastest response with no overshoot, which reads as "good quality
 * gauge" rather than "wobbly toy".
 *
 * COST: the dial faces (arcs, ticks, numerals) never change, so they are drawn
 * ONCE to an offscreen canvas. A redraw is one drawImage plus two needles and a
 * handful of text calls. Redraws are capped at 30 Hz and skipped entirely when
 * no needle has moved a visible amount and no readout has changed — parked in P
 * the texture is not re-uploaded at all.
 */
const W = 784;
const H = 280;

/**
 * Natural frequency of the needles, rad/s. A critically-damped spring trails a
 * ramping target by 2/omega seconds: at 9 that was 0.22 s (measured with
 * tools/needle-probe.mjs), which read as sluggish when braking to a stop.
 */
const NEEDLE_OMEGA = 12;
/** Redraw at most this often. */
const REDRAW_SEC = 1 / 30;
/** Needle movement (as a fraction of full sweep) that justifies a redraw. */
const NEEDLE_EPS = 0.0015;

/** Dial sweep: 270 degrees, from 7:30 round clockwise to 4:30. */
const SWEEP_START = (135 * Math.PI) / 180;
const SWEEP = (270 * Math.PI) / 180;

const TACHO = { cx: 150, cy: 146, r: 122, max: 7, red: 6 };
/**
 * 'track' theme: one dominant rev counter with the speed demoted to a digital
 * readout, plus a shift-light bar — the layout a modern track-focused car
 * uses, because at speed you read revs by needle position and speed by number.
 *
 * The dial's range is NOT a style choice: Car.js idles at 780 rpm and redlines
 * at 6000 (REDLINE_RPM), so the face is the same 0-7000 with red from 6 that
 * the classic theme uses. A prettier 9000 rpm face would be a dial that lies.
 */
const TRACK_TACHO = { cx: 392, cy: 168, r: 116, max: 7, red: 6 };
/**
 * Shift lights track THIS car's gearbox, not a generic redline. Car.js's
 * automatic upshifts at 3400 rpm (UPSHIFT_RPM) and only reaches its 6000 rpm
 * redline under kickdown, so lighting the bar at "70% of redline" would mean
 * it essentially never lit. Instead the bar fills over the 600 rpm approaching
 * an upshift, and only goes red if the engine is actually near the limiter.
 */
export const SHIFT_FROM_RPM = 2800;
export const SHIFT_FULL_RPM = 3400;
export const SHIFT_RED_RPM = 5400;
const SHIFT_SEGMENTS = 12;
const SHIFT_W = 34;
const SHIFT_GAP = 6;
const SHIFT_H = 11;
const SHIFT_Y = 13;
const SHIFT_X0 = (784 - (SHIFT_SEGMENTS * SHIFT_W + (SHIFT_SEGMENTS - 1) * SHIFT_GAP)) / 2;
const SPEEDO = { cx: W - 150, cy: 146, r: 122 };
// max raised from 60/40 for the 100 km/h top speed (Car.js DRIVE_*).
const UNIT_SCALES = {
  kmh: { max: 120, major: 20, minor: 10, label: 'km/h', factor: 1 },
  mph: { max: 70, major: 10, minor: 5, label: 'mph', factor: 0.621371 },
};

const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
const INK = '#eef4f2';
const DIM = 'rgba(200,215,212,0.55)';
const MINT = '#8fe6bb';
const AMBER = '#e8c98a';
const RED = '#e0857b';

/** A critically-damped spring toward a moving target. */
function createNeedle() {
  let x = 0;
  let v = 0;
  return {
    get value() {
      return x;
    },
    step(dt, target) {
      // Sub-step so a long frame (tab refocus, headless) can't blow it up.
      const n = Math.max(1, Math.ceil(dt / (1 / 120)));
      const h = dt / n;
      for (let i = 0; i < n; i++) {
        const a = NEEDLE_OMEGA * NEEDLE_OMEGA * (target - x) - 2 * NEEDLE_OMEGA * v;
        v += a * h;
        x += v * h;
      }
      return x;
    },
    snap(value) {
      x = value;
      v = 0;
    },
  };
}

export function createDashCluster({ units = 'kmh', theme = 'classic' } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  const face = document.createElement('canvas');
  face.width = W;
  face.height = H;

  let scale = UNIT_SCALES[units] ?? UNIT_SCALES.kmh;
  let style = theme === 'track' ? 'track' : 'classic';

  const tachoNeedle = createNeedle(); // fraction 0..1 of the sweep
  const speedNeedle = createNeedle();
  tachoNeedle.snap(0.78 / TACHO.max); // idle, so the first frame isn't a sweep up from 0

  let accum = REDRAW_SEC;
  let lastKey = '';
  let drawnTacho = -1;
  let drawnSpeed = -1;

  // --- static face -----------------------------------------------------------
  function drawFace() {
    if (style === 'track') return drawFaceTrack();
    const f = face.getContext('2d');
    f.clearRect(0, 0, W, H);

    // Housing glass.
    const bg = f.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#171d20');
    bg.addColorStop(1, '#0c1012');
    f.fillStyle = bg;
    roundRect(f, 0, 0, W, H, 26);
    f.fill();

    drawDial(f, TACHO, {
      max: TACHO.max,
      major: 1,
      minor: 0.5,
      redFrom: TACHO.red,
      label: (v) => String(v),
      caption: 'x1000 rpm',
    });
    drawDial(f, SPEEDO, {
      max: scale.max,
      major: scale.major,
      minor: scale.minor,
      redFrom: null,
      label: (v) => String(v),
      caption: scale.label,
    });

    // Centre panel.
    f.fillStyle = 'rgba(255,255,255,0.03)';
    roundRect(f, 292, 30, 200, 220, 18);
    f.fill();
    f.strokeStyle = 'rgba(190,210,208,0.12)';
    f.lineWidth = 2;
    roundRect(f, 292, 30, 200, 220, 18);
    f.stroke();
  }


  /** The 'track' face: housing, one big dial, and the two side panels. */
  function drawFaceTrack() {
    const f = face.getContext('2d');
    f.clearRect(0, 0, W, H);

    const bg = f.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#171d20');
    bg.addColorStop(1, '#0a0e10');
    f.fillStyle = bg;
    roundRect(f, 0, 0, W, H, 26);
    f.fill();

    // Unlit shift-light bar. The live pass lights the segments on top.
    for (let i = 0; i < SHIFT_SEGMENTS; i++) {
      const x = SHIFT_X0 + i * (SHIFT_W + SHIFT_GAP);
      f.fillStyle = 'rgba(150,170,170,0.10)';
      roundRect(f, x, SHIFT_Y, SHIFT_W, SHIFT_H, 3);
      f.fill();
    }

    drawDial(f, TRACK_TACHO, {
      max: TRACK_TACHO.max,
      major: 1,
      minor: 0.5,
      redFrom: TRACK_TACHO.red,
      label: (v) => String(v),
      caption: 'x1000 rpm',
    });

    // Side panels: tell-tales and sensors on the left, speed on the right.
    f.fillStyle = 'rgba(255,255,255,0.03)';
    f.strokeStyle = 'rgba(190,210,208,0.12)';
    f.lineWidth = 2;
    for (const x of [22, W - 172]) {
      roundRect(f, x, 34, 150, 212, 16);
      f.fill();
      roundRect(f, x, 34, 150, 212, 16);
      f.stroke();
    }
  }

  /** The 'track' live layer. */
  function drawTrack(s) {
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(face, 0, 0);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Shift lights: green, then amber, then the whole bar red near the limiter.
    const rpm = s.rpm ?? 0;
    const lit = Math.round(
      clamp01((rpm - SHIFT_FROM_RPM) / (SHIFT_FULL_RPM - SHIFT_FROM_RPM)) * SHIFT_SEGMENTS
    );
    const atLimit = rpm >= SHIFT_RED_RPM;
    for (let i = 0; i < lit; i++) {
      const x = SHIFT_X0 + i * (SHIFT_W + SHIFT_GAP);
      ctx.fillStyle = atLimit ? RED : i < SHIFT_SEGMENTS * 0.5 ? MINT : AMBER;
      roundRect(ctx, x, SHIFT_Y, SHIFT_W, SHIFT_H, 3);
      ctx.fill();
    }

    // Gear, inside the dial where the driver is already looking. It sits in
    // the open bottom of the 270-degree sweep, between the 0 and the 7 — big
    // enough to read at a glance, small enough not to touch either numeral.
    const gearColor = s.gear === 'R' ? AMBER : s.gear === 'D' ? MINT : INK;
    ctx.fillStyle = gearColor;
    ctx.font = `700 42px ${FONT}`;
    ctx.fillText(s.gear === 'D' ? `D${s.autoGear ?? ''}` : s.gear, TRACK_TACHO.cx, TRACK_TACHO.cy + 56);

    // Speed: the number is the readout, the dial is for revs.
    const shown = Math.max(0, Math.round(s.speedKmh * scale.factor));
    const rx = W - 97;
    ctx.fillStyle = INK;
    ctx.font = `700 66px ${FONT}`;
    ctx.fillText(String(shown), rx, 96);
    ctx.fillStyle = DIM;
    ctx.font = `600 15px ${FONT}`;
    ctx.fillText(scale.label, rx, 138);

    const sens = s.sensors;
    if (sens && (sens.front != null || sens.rear != null)) {
      drawSensorGlyph(rx, 196, sens);
    } else {
      ctx.fillStyle = DIM;
      ctx.font = `500 14px ${FONT}`;
      ctx.fillText('TRIP', rx, 186);
      ctx.fillStyle = INK;
      ctx.font = `600 22px ${FONT}`;
      const trip = ((s.odometerM ?? 0) / 1000) * scale.factor;
      ctx.fillText(`${trip.toFixed(2)} km`, rx, 214);
    }

    // Tell-tales, left panel.
    const lx = 97;
    ctx.font = `700 17px ${FONT}`;
    ctx.fillStyle = s.handbrake ? RED : 'rgba(150,170,170,0.16)';
    ctx.fillText('BRAKE', lx, 84);
    ctx.fillStyle = s.bumpFlash > 0 ? AMBER : 'rgba(150,170,170,0.16)';
    ctx.fillText('IMPACT', lx, 118);
    ctx.fillStyle = s.hillHold ? MINT : 'rgba(150,170,170,0.16)';
    ctx.fillText('HOLD', lx, 152);

    // Gate, so P-R-N-D is still readable at a glance.
    ctx.font = `600 17px ${FONT}`;
    ['P', 'R', 'N', 'D'].forEach((g, i) => {
      ctx.fillStyle = g === s.gear ? gearColor : 'rgba(190,205,205,0.28)';
      ctx.fillText(g, lx - 51 + i * 34, 208);
    });

    drawNeedle(TRACK_TACHO, tachoNeedle.value, atLimit ? RED : '#f08f7e');
  }

  function drawDial(f, d, o) {
    const { cx, cy, r } = d;

    // Dial disc.
    f.fillStyle = '#12171a';
    f.beginPath();
    f.arc(cx, cy, r + 10, 0, Math.PI * 2);
    f.fill();
    f.strokeStyle = 'rgba(190,210,208,0.22)';
    f.lineWidth = 3;
    f.stroke();

    // Redline band, drawn under the ticks.
    if (o.redFrom != null) {
      f.strokeStyle = 'rgba(224,133,123,0.85)';
      f.lineWidth = 12;
      f.beginPath();
      f.arc(cx, cy, r - 8, angleOf(o.redFrom / o.max), angleOf(1));
      f.stroke();
    }

    // Ticks: minor, then major with numerals.
    const steps = Math.round(o.max / o.minor);
    for (let i = 0; i <= steps; i++) {
      const v = i * o.minor;
      const isMajor = Math.abs(v / o.major - Math.round(v / o.major)) < 1e-6;
      const a = angleOf(v / o.max);
      const inner = r - (isMajor ? 26 : 16);
      const red = o.redFrom != null && v >= o.redFrom;
      f.strokeStyle = red ? RED : isMajor ? INK : 'rgba(220,232,230,0.5)';
      f.lineWidth = isMajor ? 5 : 3;
      f.beginPath();
      f.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
      f.lineTo(cx + Math.cos(a) * (r - 2), cy + Math.sin(a) * (r - 2));
      f.stroke();

      if (isMajor) {
        const nr = r - 50;
        f.fillStyle = red ? RED : INK;
        f.font = `600 30px ${FONT}`;
        f.textAlign = 'center';
        f.textBaseline = 'middle';
        f.fillText(o.label(v), cx + Math.cos(a) * nr, cy + Math.sin(a) * nr + 1);
      }
    }

    // Caption ABOVE the hub: below it, it runs into the 0 and max numerals,
    // which sit either side of the dial's open bottom.
    f.fillStyle = DIM;
    f.font = `500 16px ${FONT}`;
    f.textAlign = 'center';
    f.fillText(o.caption, cx, cy - 34);
  }

  // --- live layer ------------------------------------------------------------
  function drawNeedle(d, frac, color) {
    const a = angleOf(frac);
    const tipR = d.r - 6;
    const tailR = 20;
    const nx = Math.cos(a);
    const ny = Math.sin(a);
    // Tapered blade: wide at the hub, a point at the tip.
    ctx.fillStyle = color;
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(d.cx + nx * tipR, d.cy + ny * tipR);
    ctx.lineTo(d.cx - ny * 5 - nx * tailR, d.cy + nx * 5 - ny * tailR);
    ctx.lineTo(d.cx + ny * 5 - nx * tailR, d.cy - nx * 5 - ny * tailR);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    // Hub cap.
    ctx.fillStyle = '#2b3236';
    ctx.beginPath();
    ctx.arc(d.cx, d.cy, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(220,232,230,0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function draw(s) {
    if (style === 'track') return drawTrack(s);
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(face, 0, 0);

    // Digital speed under the speedo hub.
    const shown = Math.max(0, Math.round(s.speedKmh * scale.factor));
    ctx.fillStyle = INK;
    ctx.font = `600 34px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(shown), SPEEDO.cx, SPEEDO.cy + 92);

    // Tell-tales under the tacho hub.
    ctx.font = `700 16px ${FONT}`;
    ctx.fillStyle = s.handbrake ? RED : 'rgba(150,170,170,0.16)';
    ctx.fillText('BRAKE', TACHO.cx - 30, TACHO.cy + 92);
    ctx.fillStyle = s.bumpFlash > 0 ? AMBER : 'rgba(150,170,170,0.16)';
    ctx.fillText('IMPACT', TACHO.cx + 36, TACHO.cy + 92);
    // Hill-hold (SPEC-level13.md §5.6): only ever lights on Level 13's ramps.
    ctx.fillStyle = s.hillHold ? MINT : 'rgba(150,170,170,0.16)';
    ctx.fillText('HOLD', TACHO.cx - 30, TACHO.cy + 112);

    drawNeedle(TACHO, tachoNeedle.value, '#f08f7e');
    drawNeedle(SPEEDO, speedNeedle.value, '#f08f7e');

    drawCentre(s);
  }

  function drawCentre(s) {
    const cx = 392;

    // Gear: the selected one large, the gate beside it small.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const gearColor = s.gear === 'R' ? AMBER : s.gear === 'D' ? MINT : INK;
    ctx.fillStyle = gearColor;
    ctx.font = `700 64px ${FONT}`;
    const gearLabel = s.gear === 'D' ? `D${s.autoGear ?? ''}` : s.gear;
    ctx.fillText(gearLabel, cx, 78);

    ctx.font = `600 18px ${FONT}`;
    ['P', 'R', 'N', 'D'].forEach((g, i) => {
      ctx.fillStyle = g === s.gear ? gearColor : 'rgba(190,205,205,0.28)';
      ctx.fillText(g, cx - 54 + i * 36, 128);
    });

    // Parking sensors: a top-down car with arcs front and rear, only while a
    // sensor has something in range. Otherwise the trip meter lives here.
    const sens = s.sensors;
    if (sens && (sens.front != null || sens.rear != null)) {
      drawSensorGlyph(cx, 196, sens);
    } else {
      ctx.fillStyle = DIM;
      ctx.font = `500 16px ${FONT}`;
      ctx.fillText('TRIP', cx, 176);
      ctx.fillStyle = INK;
      ctx.font = `600 26px ${FONT}`;
      const trip = ((s.odometerM ?? 0) / 1000) * scale.factor;
      ctx.fillText(`${trip.toFixed(2)} ${scale.label === 'mph' ? 'mi' : 'km'}`, cx, 206);
    }
  }

  /**
   * Car outline seen from above, nose up, with up to three arcs per end. The
   * number of lit arcs and their colour track the nearest obstacle distance.
   */
  function drawSensorGlyph(cx, cy, sens) {
    const cw = 30;
    const ch = 62;
    ctx.fillStyle = 'rgba(220,232,230,0.85)';
    roundRect(ctx, cx - cw / 2, cy - ch / 2, cw, ch, 8);
    ctx.fill();
    ctx.fillStyle = '#12171a';
    roundRect(ctx, cx - cw / 2 + 5, cy - ch / 2 + 14, cw - 10, 16, 3);
    ctx.fill();

    const end = (dist, dir) => {
      if (dist == null) return;
      const lit = dist < 0.4 ? 3 : dist < 0.9 ? 2 : 1;
      const color = dist < 0.4 ? RED : dist < 0.9 ? AMBER : MINT;
      for (let i = 0; i < 3; i++) {
        const rad = 22 + i * 11;
        ctx.strokeStyle = i < lit ? color : 'rgba(150,170,170,0.14)';
        ctx.lineWidth = 6;
        ctx.beginPath();
        const mid = dir < 0 ? -Math.PI / 2 : Math.PI / 2;
        ctx.arc(cx, cy + dir * (ch / 2 - 14), rad, mid - 0.7, mid + 0.7);
        ctx.stroke();
      }
      ctx.fillStyle = color;
      ctx.font = `700 15px ${FONT}`;
      ctx.fillText(`${dist.toFixed(1)}m`, cx + 64, cy + dir * 26);
    };
    end(sens.front, -1);
    end(sens.rear, 1);
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  drawFace();

  return {
    canvas,

    /** Returns true when the canvas changed and the texture needs re-upload. */
    update(dt, s) {
      const tacho = tachoNeedle.step(dt, clamp01(s.rpm / 1000 / TACHO.max));
      const speed = speedNeedle.step(dt, clamp01((s.speedKmh * scale.factor) / scale.max));

      accum += dt;
      if (accum < REDRAW_SEC) return false;
      accum = 0;

      const sens = s.sensors;
      const key = [
        s.gear,
        s.autoGear,
        Math.round(s.speedKmh * scale.factor),
        s.handbrake ? 1 : 0,
        s.bumpFlash > 0 ? 1 : 0,
        s.hillHold ? 1 : 0,
        Math.floor((s.odometerM ?? 0) / 10),
        sens?.front == null ? '-' : sens.front.toFixed(1),
        sens?.rear == null ? '-' : sens.rear.toFixed(1),
      ].join('|');
      const needlesMoved =
        Math.abs(tacho - drawnTacho) > NEEDLE_EPS || Math.abs(speed - drawnSpeed) > NEEDLE_EPS;
      if (key === lastKey && !needlesMoved) return false;

      lastKey = key;
      drawnTacho = tacho;
      drawnSpeed = speed;
      draw(s);
      return true;
    },

    /**
     * Swap the instrument layout. Rebuilds the static face only — the needle
     * springs keep their state, so changing theme mid-drive doesn't make the
     * needles sweep up from zero.
     */
    setTheme(next) {
      const wanted = next === 'track' ? 'track' : 'classic';
      if (wanted === style) return;
      style = wanted;
      drawFace();
      lastKey = '';
    },

    /** Switch the speedometer between km/h and mph. Rebuilds the dial face. */
    setUnits(next) {
      if (!UNIT_SCALES[next]) return;
      scale = UNIT_SCALES[next];
      drawFace();
      lastKey = '';
    },

    /** Needle fractions, for verification. */
    get needles() {
      return { tacho: tachoNeedle.value, speed: speedNeedle.value };
    },
  };
}

function angleOf(frac) {
  return SWEEP_START + SWEEP * clamp01(frac);
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}
