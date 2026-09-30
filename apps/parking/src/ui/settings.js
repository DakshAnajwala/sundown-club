/**
 * settings.js — player settings, persisted locally, with quality presets.
 *
 * Same storage discipline as progress.js: localStorage can throw outright in
 * some privacy modes, so every access is guarded and the game runs on the
 * defaults without it. Stored values are re-validated field by field on load,
 * so a hand-edited or older payload can never feed a NaN FOV into the camera.
 *
 * Quality presets are just bundles of the individual switches. Touching any
 * one switch afterwards turns the preset label to 'custom' rather than
 * silently snapping the other switches back.
 */

import { EYE_TILT_DEG, SEAT_ADJUST } from '../vehicle/Dimensions.js';

export { SEAT_ADJUST };

const STORAGE_KEY = 'parking-precision:settings:v4';

export const QUALITY_PRESETS = {
  low: { ao: false, shadows: false, mirrors: 'static', pixelRatio: 1 },
  medium: { ao: false, shadows: true, mirrors: 'live', pixelRatio: 1 },
  high: { ao: true, shadows: true, mirrors: 'live', pixelRatio: 2 },
};

/**
 * HUD presets, the same idea as QUALITY_PRESETS: bundles of the individual
 * element switches. Touching one switch demotes the label to 'custom'.
 * The in-car instrument binnacle is NOT part of this — it is a real object in
 * the dashboard, not an overlay, and has its own `clusterTheme`.
 */
export const HUD_PRESETS = {
  full: { hudLevelCard: true, hudPrompt: true, hudKeyLegend: true, hudToggles: true, hudRadar: true },
  minimal: { hudLevelCard: false, hudPrompt: true, hudKeyLegend: false, hudToggles: true, hudRadar: true },
  clean: { hudLevelCard: false, hudPrompt: true, hudKeyLegend: false, hudToggles: false, hudRadar: false },
};

const DEFAULTS = {
  quality: 'high',
  ...QUALITY_PRESETS.high,
  hudPreset: 'full',
  ...HUD_PRESETS.full,
  hudRadarPlace: 'screen',
  hudTelemetry: 'auto',
  /** Post finished runs to the public leaderboard without being asked. */
  leaderboardAutoPost: true,
  /** Cleared once the player has been told that posting is automatic. */
  leaderboardNoticeSeen: false,
  hudSpeedDigital: false,
  hudOpacity: 1,
  hudScale: 1,
  clusterTheme: 'classic',
  cameraMode: 'seat',
  /** action id -> array of KeyboardEvent.code. Empty object = every default. */
  bindings: {},
  fov: 68,
  speedFov: true,
  lookSensitivity: 1,
  volume: 0.7,
  units: 'kmh',
  sensors: true,
  tutorialDone: false,
  /** Retention pass: draw your previous best park in the overhead review. */
  reviewGhost: true,
  /** Retention pass: record your best run and replay it as a ghost car. */
  ghostLive: true,
  // Driving position: offsets from the default eye (metres) + resting tilt.
  seatX: 0,
  seatY: 0,
  seatZ: 0,
  tilt: EYE_TILT_DEG,
};

/** The driving-position fields, and their defaults, for "Reset". */
export const SEAT_FIELDS = ['seatX', 'seatY', 'seatZ', 'tilt'];

/** Per-field validators: return the clean value, or undefined to reject. */
const FIELDS = {
  quality: (v) => (['low', 'medium', 'high', 'custom'].includes(v) ? v : undefined),
  hudPreset: (v) => (['full', 'minimal', 'clean', 'custom'].includes(v) ? v : undefined),
  hudLevelCard: bool,
  hudPrompt: bool,
  hudKeyLegend: bool,
  hudToggles: bool,
  hudRadar: bool,
  hudRadarPlace: (v) => (v === 'screen' || v === 'overlay' ? v : undefined),
  hudTelemetry: (v) => (['auto', 'always', 'off'].includes(v) ? v : undefined),
  leaderboardAutoPost: bool,
  leaderboardNoticeSeen: bool,
  hudSpeedDigital: bool,
  hudOpacity: (v) => num(v, 0.35, 1),
  hudScale: (v) => num(v, 0.8, 1.4),
  clusterTheme: (v) => (v === 'classic' || v === 'track' ? v : undefined),
  cameraMode: (v) => (v === 'seat' || v === 'chase' ? v : undefined),
  bindings: cleanBindings,
  ao: bool,
  shadows: bool,
  mirrors: (v) => (v === 'live' || v === 'static' ? v : undefined),
  pixelRatio: (v) => num(v, 1, 2),
  fov: (v) => num(v, 55, 90),
  speedFov: bool,
  lookSensitivity: (v) => num(v, 0.3, 2.5),
  volume: (v) => num(v, 0, 1),
  units: (v) => (v === 'kmh' || v === 'mph' ? v : undefined),
  sensors: bool,
  tutorialDone: bool,
  reviewGhost: bool,
  ghostLive: bool,
  seatX: (v) => num(v, ...SEAT_ADJUST.x),
  seatY: (v) => num(v, ...SEAT_ADJUST.y),
  seatZ: (v) => num(v, ...SEAT_ADJUST.z),
  tilt: (v) => num(v, ...SEAT_ADJUST.tiltDeg),
};

function bool(v) {
  return typeof v === 'boolean' ? v : undefined;
}

/**
 * Key codes a player is allowed to bind. Deliberately an allowlist: a stored
 * payload is untrusted (it is hand-editable), and binding an action to a code
 * the page never receives, or to a browser shortcut, is a way to lock yourself
 * out of your own controls. Anything rejected here falls back to the action's
 * default, so a corrupt file costs a binding, never the game.
 */
const CODE_RE =
  /^(Key[A-Z]|Digit[0-9]|Arrow(Up|Down|Left|Right)|Space|Enter|Escape|Numpad[0-9]|Shift(Left|Right)|Control(Left|Right)|Alt(Left|Right)|Backquote|Minus|Equal|Comma|Period|Slash|Semicolon|Quote|Bracket(Left|Right)|Backslash)$/;

function cleanBindings(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const out = {};
  for (const [action, codes] of Object.entries(v)) {
    if (!/^[a-zA-Z][a-zA-Z0-9]{0,31}$/.test(action)) continue;
    if (!Array.isArray(codes)) continue;
    const kept = [...new Set(codes.filter((c) => typeof c === 'string' && CODE_RE.test(c)))].slice(0, 2);
    if (kept.length) out[action] = kept;
  }
  return out;
}
function num(v, lo, hi) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : undefined;
}

function load() {
  const out = { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return out;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return out;
    for (const [k, check] of Object.entries(FIELDS)) {
      const v = check(parsed[k]);
      if (v !== undefined) out[k] = v;
    }
  } catch {
    // unavailable or corrupt: defaults
  }
  return out;
}

export function createSettings() {
  let data = load();
  const listeners = new Set();

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // session-only
    }
  }

  function emit(changed) {
    for (const fn of listeners) fn(changed, { ...data });
  }

  return {
    get: (k) => data[k],
    all: () => ({ ...data }),

    /** Set one field. Graphics switches demote the preset label to 'custom'. */
    set(k, value) {
      const clean = FIELDS[k]?.(value);
      if (clean === undefined || data[k] === clean) return;
      const changed = { [k]: clean };
      if (k in QUALITY_PRESETS.high && data.quality !== 'custom') changed.quality = 'custom';
      if (k in HUD_PRESETS.full && data.hudPreset !== 'custom') changed.hudPreset = 'custom';
      data = { ...data, ...changed };
      save();
      emit(changed);
    },

    applyPreset(name) {
      const preset = QUALITY_PRESETS[name];
      if (!preset) return;
      const changed = { quality: name, ...preset };
      data = { ...data, ...changed };
      save();
      emit(changed);
    },

    applyHudPreset(name) {
      const preset = HUD_PRESETS[name];
      if (!preset) return;
      const changed = { hudPreset: name, ...preset };
      data = { ...data, ...changed };
      save();
      emit(changed);
    },

    /** Put every HUD field, placement and sizing included, back to default. */
    resetHud() {
      const changed = { hudPreset: 'full', ...HUD_PRESETS.full };
      for (const k of ['hudRadarPlace', 'hudTelemetry', 'hudSpeedDigital', 'hudOpacity', 'hudScale']) changed[k] = DEFAULTS[k];
      data = { ...data, ...changed };
      save();
      emit(changed);
    },

    /** Drop every custom key binding back to the defaults in Input.js. */
    resetBindings() {
      if (!Object.keys(data.bindings).length) return;
      data = { ...data, bindings: {} };
      save();
      emit({ bindings: {} });
    },

    /** Put the driving position back to the car's default. */
    resetSeat() {
      const changed = {};
      for (const k of SEAT_FIELDS) if (data[k] !== DEFAULTS[k]) changed[k] = DEFAULTS[k];
      if (!Object.keys(changed).length) return;
      data = { ...data, ...changed };
      save();
      emit(changed);
    },

    /** fn(changedFields, allSettings) */
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
