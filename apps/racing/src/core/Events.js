/**
 * Events.js — the tiniest possible pub/sub.
 *
 * Modules talk to each other through these rather than holding references to
 * each other: the audio system doesn't know the car exists, it just hears
 * 'gearChanged'. Keeps the dependency graph a tree instead of a web.
 */
export function createEmitter() {
  const listeners = new Map();

  return {
    on(event, cb) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(cb);
      return () => listeners.get(event)?.delete(cb); // unsubscribe handle
    },
    off(event, cb) {
      listeners.get(event)?.delete(cb);
    },
    emit(event, payload) {
      const set = listeners.get(event);
      if (!set) return;
      // Copy before iterating: a handler is allowed to unsubscribe itself.
      for (const cb of [...set]) cb(payload);
    },
  };
}
