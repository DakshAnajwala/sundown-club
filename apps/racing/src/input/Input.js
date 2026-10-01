/**
 * Input.js — keyboard + mouse, normalised into a per-frame state object.
 *
 * Nothing else in the game reads a KeyboardEvent. Systems read `input.state`
 * (continuous: throttle, steer, handbrake, look), drain
 * `input.takeGearRequest()` (discrete: gear presses), or poll
 * `input.takeAction(id)` (one-shots: pause, restart, camera).
 *
 * BINDINGS ARE DATA. `ACTIONS` below is the whole control scheme: an id, a
 * label for the settings UI and the on-screen legend, a kind, and the default
 * codes. The player's overrides live in settings (`bindings`), and the
 * code -> action lookup is rebuilt whenever they change. Nothing in the game
 * hard-codes a key: the HUD legend and the tutorial both ask this module what
 * a given action is bound to, so a remap shows up everywhere at once.
 *
 * Note on D: "D" is steer-right, so Drive is bound to F (forward) rather than
 * to its own initial. R, N and P keep theirs.
 *
 * ESCAPE IS NOT NEGOTIABLE. Whatever else it may be bound to, Escape always
 * also opens the menu. A remap must never be able to lock a player out of the
 * settings screen where they would undo it.
 */

/** @typedef {'held'|'gear'|'cycle'|'oneShot'} ActionKind */

/**
 * The complete control scheme.
 * `state` is the field in `input.state` a held action drives.
 * `gear` is the gate position a gear action selects.
 */
export const ACTIONS = [
  { id: 'throttle', label: 'Accelerate', category: 'Driving', kind: 'held', state: 'throttle', defaults: ['KeyW', 'ArrowUp'] },
  { id: 'brake', label: 'Brake / reverse', category: 'Driving', kind: 'held', state: 'brake', defaults: ['KeyS', 'ArrowDown'] },
  { id: 'steerLeft', label: 'Steer left', category: 'Driving', kind: 'held', state: 'steerLeft', defaults: ['KeyA', 'ArrowLeft'] },
  { id: 'steerRight', label: 'Steer right', category: 'Driving', kind: 'held', state: 'steerRight', defaults: ['KeyD', 'ArrowRight'] },
  { id: 'handbrake', label: 'Handbrake', category: 'Driving', kind: 'held', state: 'handbrake', defaults: ['Space'] },

  { id: 'gearP', label: 'Park', category: 'Gears', kind: 'gear', gear: 'P', defaults: ['KeyP', 'Digit1'] },
  { id: 'gearR', label: 'Reverse', category: 'Gears', kind: 'gear', gear: 'R', defaults: ['KeyR', 'Digit2'] },
  { id: 'gearN', label: 'Neutral', category: 'Gears', kind: 'gear', gear: 'N', defaults: ['KeyN', 'Digit3'] },
  { id: 'gearD', label: 'Drive', category: 'Gears', kind: 'gear', gear: 'D', defaults: ['KeyF', 'Digit4'] },
  { id: 'gearCycle', label: 'Cycle P-R-N-D', category: 'Gears', kind: 'cycle', defaults: ['KeyG'] },

  { id: 'leanLeft', label: "Lean out of the driver's window", category: 'View', kind: 'held', state: 'leanLeft', defaults: ['KeyQ'] },
  { id: 'leanRight', label: 'Lean across to the passenger window', category: 'View', kind: 'held', state: 'leanRight', defaults: ['KeyE'] },
  { id: 'cameraMode', label: 'Seat / chase camera', category: 'View', kind: 'oneShot', defaults: ['KeyC'] },

  { id: 'pause', label: 'Pause / menu', category: 'System', kind: 'oneShot', defaults: ['Escape'] },
  { id: 'confirm', label: 'Confirm', category: 'System', kind: 'oneShot', defaults: ['Enter'] },
  { id: 'restart', label: 'Restart level', category: 'System', kind: 'oneShot', defaults: ['KeyB'] },
  { id: 'toggleAudioMode', label: 'Audio mode', category: 'System', kind: 'oneShot', defaults: ['KeyM'] },
];

const BY_ID = new Map(ACTIONS.map((a) => [a.id, a]));
const GEAR_CYCLE = ['P', 'R', 'N', 'D'];

/** The codes an action is currently on: the player's override, else defaults. */
export function codesFor(actionId, bindings = {}) {
  const custom = bindings?.[actionId];
  return custom?.length ? custom : (BY_ID.get(actionId)?.defaults ?? []);
}

/** "W", "↑", "Space" — what a key should be called on screen. */
export function keyLabel(code) {
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  const named = {
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    Space: 'Space',
    Escape: 'Esc',
    Enter: 'Enter',
    ShiftLeft: 'Shift',
    ShiftRight: 'Shift',
    ControlLeft: 'Ctrl',
    ControlRight: 'Ctrl',
    AltLeft: 'Alt',
    AltRight: 'Alt',
    Backquote: '`',
    Minus: '-',
    Equal: '=',
    Comma: ',',
    Period: '.',
    Slash: '/',
    Semicolon: ';',
    Quote: "'",
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
  };
  return named[code] ?? code;
}

/** Every action a code is currently bound to — used to warn about conflicts. */
export function conflictsFor(code, bindings = {}, ignoreActionId = null) {
  return ACTIONS.filter((a) => a.id !== ignoreActionId && codesFor(a.id, bindings).includes(code)).map((a) => a.id);
}

/**
 * @param {HTMLElement} domElement
 * @param {{ get: (k: string) => any, onChange: (fn: Function) => Function }} [settings]
 */
export function createInput(domElement, settings = null) {
  const state = {
    throttle: false,
    brake: false,
    steerLeft: false,
    steerRight: false,
    handbrake: false,
    leanLeft: false,
    leanRight: false,
    lookBack: false,
    /** -1 (full left) .. +1 (full right) — derived from the two steer keys. */
    steer: 0,
    /** Accumulated mouse movement while looking back; drained by the camera. */
    mouseDX: 0,
    mouseDY: 0,
  };

  const gearQueue = [];
  const oneShot = new Set();
  let currentGearForCycle = 'P';
  let enabled = true;
  let capture = null; // fn(code) while the settings UI is listening for a key

  /** code -> [action, ...]. Rebuilt on every bindings change. */
  let byCode = new Map();

  function rebuild() {
    const bindings = settings?.get('bindings') ?? {};
    byCode = new Map();
    const bind = (code, action) => {
      if (!byCode.has(code)) byCode.set(code, []);
      byCode.get(code).push(action);
    };
    for (const a of ACTIONS) for (const code of codesFor(a.id, bindings)) bind(code, a);
    // Escape always reaches the menu, whatever the player has done to it.
    const pause = BY_ID.get('pause');
    if (!(byCode.get('Escape') ?? []).includes(pause)) bind('Escape', pause);
  }
  rebuild();
  const offSettings = settings?.onChange?.((changed) => {
    if ('bindings' in changed) rebuild();
  });

  function releaseAll() {
    for (const a of ACTIONS) if (a.kind === 'held') state[a.state] = false;
    state.lookBack = false;
  }

  function onKeyDown(e) {
    // Rebinding: the settings UI wants the raw key, and the car must not also
    // react to it. Modifier-only presses are ignored so holding Shift to reach
    // a character doesn't bind Shift itself.
    if (capture) {
      e.preventDefault();
      if (/^(Shift|Control|Alt|Meta)/.test(e.code)) return;
      const fn = capture;
      capture = null;
      fn(e.code);
      return;
    }

    if (e.repeat) return;
    if (!enabled) return;

    const actions = byCode.get(e.code);
    if (!actions) return;

    for (const a of actions) {
      if (a.kind === 'held') {
        state[a.state] = true;
        // Space would otherwise scroll the page / re-activate the last button.
        if (e.code === 'Space') e.preventDefault();
      } else if (a.kind === 'gear') {
        gearQueue.push(a.gear);
      } else if (a.kind === 'cycle') {
        const i = GEAR_CYCLE.indexOf(currentGearForCycle);
        gearQueue.push(GEAR_CYCLE[(i + 1) % GEAR_CYCLE.length]);
      } else {
        oneShot.add(a.id);
      }
    }
  }

  function onKeyUp(e) {
    for (const a of byCode.get(e.code) ?? []) if (a.kind === 'held') state[a.state] = false;
  }

  function onMouseDown(e) {
    if (e.button === 2) {
      state.lookBack = true;
      e.preventDefault();
    }
  }

  function onMouseUp(e) {
    if (e.button === 2) state.lookBack = false;
  }

  function onMouseMove(e) {
    if (!state.lookBack) return;
    state.mouseDX += e.movementX || 0;
    state.mouseDY += e.movementY || 0;
  }

  function onContextMenu(e) {
    e.preventDefault(); // right-click is a game control here
  }

  function onBlur() {
    // Tab away mid-throttle and the car would drive off on its own forever.
    releaseAll();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  domElement.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('mousemove', onMouseMove);
  domElement.addEventListener('contextmenu', onContextMenu);

  return {
    state,

    /** Called once per frame before systems read `state`. */
    update() {
      state.steer = (state.steerRight ? 1 : 0) - (state.steerLeft ? 1 : 0);
    },

    /** Pops the oldest queued gear press, or null. */
    takeGearRequest() {
      return gearQueue.length ? gearQueue.shift() : null;
    },

    /** Lets the car tell us where the gate currently is, for the cycle action. */
    syncGear(gear) {
      currentGearForCycle = gear;
    },

    /** True once per press. */
    takeAction(name) {
      if (!oneShot.has(name)) return false;
      oneShot.delete(name);
      return true;
    },

    consumeMouseDelta() {
      const d = { x: state.mouseDX, y: state.mouseDY };
      state.mouseDX = 0;
      state.mouseDY = 0;
      return d;
    },

    /** Disabled while a menu is open so driving keys don't leak through. */
    setEnabled(v) {
      enabled = v;
      if (!v) onBlur();
    },

    /**
     * Listen for one key press and hand back its code, for the rebinding UI.
     * Returns a cancel function. While capturing, no action fires.
     */
    captureKey(fn) {
      capture = fn;
      releaseAll();
      return () => {
        capture = null;
      };
    },

    dispose() {
      offSettings?.();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      domElement.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
      domElement.removeEventListener('contextmenu', onContextMenu);
    },
  };
}
