/**
 * wellbeing.js — a gentle "take a break" note. After 90 minutes of the page
 * being on screen (a hidden page for ten minutes or more starts the count
 * again), a note says so, and again after each further 90 minutes. It never
 * blocks play and says it once; there is nothing to dismiss. Called from
 * telemetry.js initTelemetry on every page. Spec: GOAL.md section 1.
 */
import { showNote } from './roundpanel.js';

export const BREAK_AFTER_MS = 90 * 60 * 1000;
export const RESET_AFTER_HIDDEN_MS = 10 * 60 * 1000;

/**
 * The counting, with no DOM so it can be checked in node. Call tick(now, visible)
 * regularly and every time visibility changes. Returns true when a break note is due.
 */
export function createBreakTimer() {
  let visibleMs = 0, last = null, hiddenAt = null;
  return {
    tick(now, visible) {
      if (last == null) last = now;
      if (visible) {
        if (hiddenAt != null && now - hiddenAt >= RESET_AFTER_HIDDEN_MS) visibleMs = 0;   // you were away: start again
        hiddenAt = null;
        visibleMs += now - last;
      } else if (hiddenAt == null) hiddenAt = now;
      last = now;
      if (visibleMs >= BREAK_AFTER_MS) { visibleMs = 0; return true; }
      return false;
    },
    get visibleMs() { return visibleMs; },
  };
}

let started = false;
export function startBreakNudge() {
  try {
    if (started || typeof document === 'undefined') return;
    started = true;
    const t = createBreakTimer();
    const check = () => {
      if (t.tick(performance.now(), document.visibilityState === 'visible')) {
        showNote('You have been here for 90 minutes. A break is a good idea: stretch, have some water. Your table will be right here.', { ttl: 20000, corner: 'br' });
      }
    };
    setInterval(check, 30000);
    document.addEventListener('visibilitychange', check);
    check();
  } catch { /* never break a game */ }
}
