/** Small maths helpers shared by the lounge kit and the games. No three.js, no DOM. */

export const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
export const easeOut = (k) => 1 - Math.pow(1 - k, 3);
export const fmt = (n) => Math.round(n).toLocaleString('en-US');

export function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
export function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}
export function fbm(x, y) { let s = 0, a = 0.55, f = 1; for (let i = 0; i < 4; i++) { s += a * vnoise(x * f, y * f); f *= 2.03; a *= 0.5; } return s; }

/** mulberry32: small seeded RNG for scenery (not for shuffling). */
export function rng(seed) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * Animation timeline (apps/blackjack/SPEC.md §12): the game decides first,
 * the timeline plays it. skipAll() drains everything to the end state.
 */
export function createTimeline() {
  return {
    clock: 0, cursor: 0, items: [], speed: 1,
    add(dur, fns = {}, gap) { const it = { t0: Math.max(this.cursor, this.clock), dur, ...fns, started: false }; this.items.push(it); this.cursor = it.t0 + (gap ?? dur); return it; },
    wait(ms) { this.cursor = Math.max(this.cursor, this.clock) + ms; },
    call(fn) { return this.add(0, { end: fn }); },
    get busy() { return this.items.length > 0; },
    tick(ms) { this.clock += ms * this.speed; this.run(); },
    run() {
      while (this.items.length && this.clock >= this.items[0].t0) {
        let progressed = false;
        for (let i = 0; i < this.items.length; i++) {
          const it = this.items[i];
          if (this.clock < it.t0) break;
          if (!it.started) { it.started = true; it.start?.(); }
          const k = it.dur ? Math.min(1, (this.clock - it.t0) / it.dur) : 1;
          it.update?.(k);
          if (k >= 1) { this.items.splice(i, 1); i--; it.end?.(); progressed = true; }
        }
        if (!progressed) break;
      }
    },
    skipAll() { let guard = 0; while (this.items.length && guard++ < 400) { this.clock = Math.max(this.cursor, ...this.items.map((i) => i.t0 + i.dur)); this.run(); } },
  };
}
