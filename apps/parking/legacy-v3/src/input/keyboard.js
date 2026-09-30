// Keyboard/mouse state manager. Exposes normalized, polled signals.
// Assumption: gear-select keys are 1/2/3/4 = P/R/N/D (trivially rebindable
// by changing the map below — noted in NOTES.md).

const GEAR_KEYS = { Digit1: 'P', Digit2: 'R', Digit3: 'N', Digit4: 'D' };

export function createInputState() {
  const keys = new Set();
  let pendingGearSelect = null;
  let pendingCycleDir = 0; // -1 | 0 | +1, one-shot per keypress
  let mouseDeltaX = 0;
  let freeLook = false;

  function onKeyDown(e) {
    keys.add(e.code);
    if (GEAR_KEYS[e.code]) pendingGearSelect = GEAR_KEYS[e.code];
    // Gear cycle, additive alongside the direct 1-4 select above.
    // F steps forward through P->R->N->D->P, R steps back the other way.
    // (These moved off E, which is now peek-right.)
    if (e.code === 'KeyF') pendingCycleDir = 1;
    if (e.code === 'KeyR') pendingCycleDir = -1;
  }
  function onKeyUp(e) {
    keys.delete(e.code);
  }
  function onMouseDown(e) {
    if (e.button === 2) freeLook = true;
  }
  function onMouseUp(e) {
    if (e.button === 2) freeLook = false;
  }
  function onMouseMove(e) {
    if (freeLook) mouseDeltaX += e.movementX;
  }
  function onContextMenu(e) {
    e.preventDefault(); // right-click drives free-look, not the browser menu
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('contextmenu', onContextMenu);

  const held = (...codes) => codes.some((c) => keys.has(c));

  return {
    get throttle() {
      return held('KeyW', 'ArrowUp');
    },
    get brakeOrReverse() {
      return held('KeyS', 'ArrowDown');
    },
    get steer() {
      const left = held('KeyA', 'ArrowLeft');
      const right = held('KeyD', 'ArrowRight');
      if (left && !right) return -1;
      if (right && !left) return 1;
      return 0;
    },
    get handbrake() {
      return held('Space');
    },
    get freeLook() {
      return freeLook;
    },
    // Held glance keys. Q/E swing the view left/right without moving the
    // head; C leans the driver toward the right-side window (and angles the
    // view down) to sight the kerb while manoeuvring.
    get peekLeft() {
      return held('KeyQ');
    },
    get peekRight() {
      return held('KeyE');
    },
    get leanOut() {
      return held('KeyC');
    },
    consumeGearSelect() {
      const g = pendingGearSelect;
      pendingGearSelect = null;
      return g;
    },
    consumeGearCycleDir() {
      const v = pendingCycleDir;
      pendingCycleDir = 0;
      return v;
    },
    consumeMouseDelta() {
      const d = mouseDeltaX;
      mouseDeltaX = 0;
      return d;
    },
    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('contextmenu', onContextMenu);
    },
  };
}
