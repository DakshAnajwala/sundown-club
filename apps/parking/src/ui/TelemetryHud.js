/**
 * TelemetryHud.js — gear, speed, revs and shift lights as a screen-space pill.
 *
 * WHY THIS EXISTS AT ALL
 * Every instrument in this game lives IN the car, drawn onto the dashboard
 * (DashCluster.js's header explains the reasoning). That holds right up until
 * the chase camera, where the dashboard is behind the player and they have no
 * speed, no revs and no gear at all. So this is the one screen-space readout,
 * and by default it appears only in chase view — in the driver's seat the real
 * dials are right there and a floating duplicate would undercut the framing.
 *
 * NUMBERS COME FROM ONE PLACE
 * The shift-light thresholds are imported from DashCluster, not copied. Two
 * sets of constants for the same thing drift the moment either is tuned, and
 * then the bar on the binnacle and the dots up here disagree about when to
 * shift, which is worse than having neither.
 *
 * COST
 * The DOM is only touched when a DISPLAYED value changes — integer speed,
 * integer rpm, the gear string, the lit-dot count. Writing textContent every
 * frame is what makes an HTML HUD cost more than the 3D scene behind it.
 */
import { SHIFT_FROM_RPM, SHIFT_FULL_RPM, SHIFT_RED_RPM } from './DashCluster.js';

const DOTS = 14;

const CSS = `
.hud-tel {
  position: absolute; left: 50%; bottom: 112px; transform: translateX(-50%) scale(var(--hud-scale));
  transform-origin: bottom center; opacity: var(--hud-opacity);
  display: flex; align-items: center; gap: 14px;
  padding: 10px 18px 10px 12px; border-radius: 999px;
  background: var(--card); border: 1px solid var(--edge);
  backdrop-filter: blur(9px); -webkit-backdrop-filter: blur(9px);
  font-variant-numeric: tabular-nums;
}
.hud-tel[hidden] { display: none !important; }
.hud-tel-gear {
  position: relative; width: 58px; height: 58px; flex: none;
  display: grid; place-items: center;
}
.hud-tel-gear svg { position: absolute; inset: 0; transform: rotate(-90deg); }
.hud-tel-gear circle { fill: none; stroke-width: 4; }
.hud-tel-gear .track { stroke: rgba(255,255,255,0.10); }
.hud-tel-gear .sweep { stroke: var(--mint); transition: stroke .2s; }
.hud-tel-gear b { font-size: 26px; font-weight: 700; letter-spacing: -.02em; }
.hud-tel-mid { display: flex; flex-direction: column; gap: 5px; }
.hud-tel-dots { display: flex; gap: 3px; }
.hud-tel-dots i {
  width: 7px; height: 7px; border-radius: 50%;
  background: rgba(150,170,170,0.18);
}
.hud-tel-nums { display: flex; gap: 16px; align-items: baseline; }
.hud-tel-nums span { font-size: 10px; letter-spacing: .14em; opacity: .55; margin-right: 5px; }
.hud-tel-nums b { font-size: 25px; font-weight: 700; letter-spacing: -.02em; }
.hud-tel-sub {
  display: flex; gap: 14px; font-size: 11px; opacity: .6; letter-spacing: .04em;
  border-left: 1px solid var(--edge); padding-left: 14px;
}
.hud-tel-sub b { font-weight: 600; opacity: .95; }
@media (max-width: 560px) {
  .hud-tel { gap: 10px; padding: 8px 12px 8px 8px; bottom: 104px; }
  .hud-tel-sub { display: none; }
  .hud-tel-nums b { font-size: 21px; }
}
`;

/**
 * @param {Element} root  the HUD layer
 * @returns {{ el: Element, update: Function, setVisible: Function }}
 */
export function createTelemetryHud(root) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const el = document.createElement('div');
  el.className = 'hud-tel';
  el.hidden = true;
  // r = 26 gives a 163.4 circumference; the dash array is set from that.
  el.innerHTML = `
    <div class="hud-tel-gear">
      <svg viewBox="0 0 58 58" aria-hidden="true">
        <circle class="track" cx="29" cy="29" r="26"></circle>
        <circle class="sweep" cx="29" cy="29" r="26" stroke-linecap="round"
                stroke-dasharray="163.4" stroke-dashoffset="163.4"></circle>
      </svg>
      <b data-gear>P</b>
    </div>
    <div class="hud-tel-mid">
      <div class="hud-tel-dots">${'<i></i>'.repeat(DOTS)}</div>
      <div class="hud-tel-nums">
        <div><span data-unit>KMH</span><b data-speed>0</b></div>
        <div><span>RPM</span><b data-rpm>0</b></div>
      </div>
    </div>
    <div class="hud-tel-sub">
      <div><span>TIME</span> <b data-time>0.0s</b></div>
      <div><span>BUMPS</span> <b data-bumps>0</b></div>
    </div>
  `;
  root.appendChild(el);

  const gearEl = el.querySelector('[data-gear]');
  const sweepEl = el.querySelector('.sweep');
  const speedEl = el.querySelector('[data-speed]');
  const unitEl = el.querySelector('[data-unit]');
  const rpmEl = el.querySelector('[data-rpm]');
  const timeEl = el.querySelector('[data-time]');
  const bumpsEl = el.querySelector('[data-bumps]');
  const dots = [...el.querySelectorAll('.hud-tel-dots i')];

  const CIRC = 163.4;
  const MINT = '#8fe6bb';
  const AMBER = '#e8c98a';
  const RED = '#e0857b';

  // Last DISPLAYED values, so an unchanged frame writes nothing.
  let lastGear = null;
  let lastSpeed = null;
  let lastRpm = null;
  let lastLit = -1;
  let lastTime = null;
  let lastBumps = null;
  let lastUnit = null;
  let writes = 0;

  /**
   * @param {object} s
   * @param {string} s.gear       'P' | 'R' | 'N' | 'D'
   * @param {number} s.autoGear   1-6, only meaningful in D
   * @param {number} s.rpm
   * @param {number} s.speedKmh
   * @param {'kmh'|'mph'} s.units
   * @param {number} s.timeSec
   * @param {number} s.bumps
   */
  function update(s) {
    const gear = s.gear === 'D' ? `D${s.autoGear ?? ''}` : s.gear;
    if (gear !== lastGear) {
      gearEl.textContent = gear;
      gearEl.style.color = s.gear === 'R' ? AMBER : s.gear === 'D' ? MINT : '#eef3f2';
      lastGear = gear;
      writes++;
    }

    const mph = s.units === 'mph';
    const speed = Math.max(0, Math.round(s.speedKmh * (mph ? 0.621371 : 1)));
    if (speed !== lastSpeed) {
      speedEl.textContent = String(speed);
      lastSpeed = speed;
      writes++;
    }
    const unit = mph ? 'MPH' : 'KMH';
    if (unit !== lastUnit) {
      unitEl.textContent = unit;
      lastUnit = unit;
      writes++;
    }

    // Quantised to 10 rpm, then held with a 20 rpm deadband. The engine model
    // jitters by a few revs at idle; a readout that flickers on the last digit
    // is noise, not information, and it rewrote the DOM on nearly every frame
    // of a stationary car.
    const rpm = Math.max(0, Math.round((s.rpm ?? 0) / 10) * 10);
    if (lastRpm === null || Math.abs(rpm - lastRpm) >= 20) {
      rpmEl.textContent = String(rpm);
      // The ring sweeps with revs, like the dial needle it stands in for.
      const frac = Math.max(0, Math.min(1, rpm / 7000));
      sweepEl.setAttribute('stroke-dashoffset', String(CIRC * (1 - frac)));
      sweepEl.style.stroke = rpm >= SHIFT_RED_RPM ? RED : rpm >= SHIFT_FULL_RPM ? AMBER : MINT;
      lastRpm = rpm;
      writes++;
    }

    // Same thresholds as the track cluster's shift bar — imported, not copied.
    const lit = Math.round(
      Math.max(0, Math.min(1, (rpm - SHIFT_FROM_RPM) / (SHIFT_FULL_RPM - SHIFT_FROM_RPM))) * DOTS
    );
    if (lit !== lastLit) {
      const atLimit = rpm >= SHIFT_RED_RPM;
      dots.forEach((d, i) => {
        d.style.background =
          i >= lit ? 'rgba(150,170,170,0.18)' : atLimit ? RED : i < DOTS * 0.5 ? MINT : AMBER;
      });
      lastLit = lit;
      writes++;
    }

    const t = `${(s.timeSec ?? 0).toFixed(1)}s`;
    if (t !== lastTime) {
      timeEl.textContent = t;
      lastTime = t;
      writes++;
    }
    const b = String(s.bumps ?? 0);
    if (b !== lastBumps) {
      bumpsEl.textContent = b;
      lastBumps = b;
      writes++;
    }
  }

  return {
    el,
    update,
    setVisible(v) {
      if (el.hidden === !v) return;
      el.hidden = !v;
    },
    /** DOM write count, for the probe that proves idle frames are free. */
    get writes() {
      return writes;
    },
    dispose() {
      el.remove();
      style.remove();
    },
  };
}
