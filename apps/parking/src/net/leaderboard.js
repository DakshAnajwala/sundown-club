/**
 * leaderboard.js — the only part of the game that talks to a server.
 *
 * EVERYTHING HERE IS OPTIONAL. The game was built to run with no network at
 * all and must keep doing exactly that: every call is wrapped, every failure
 * is swallowed, nothing blocks a frame, and nothing retries in a loop. If the
 * API is unreachable the player simply never sees a rank, and the rest of the
 * game behaves as though this file did not exist.
 *
 * Submission is automatic on finishing a level, unless the player has switched
 * it off in Settings (the caller checks that setting before calling submit).
 */
import { DEBUG_HOOKS } from '../core/debugHooks.js';

const DEVICE_KEY = 'parking-precision:device:v1';
const HANDLE_KEY = 'parking-precision:handle:v1';
/** Give up on a request after this long rather than leaving it hanging. */
const TIMEOUT_MS = 6000;

/**
 * Identity.
 *
 * The SERVER owns the name. This module holds an opaque token it was given
 * and caches the name for display; it never generates or chooses one, because
 * a name the client picks is a name the client can change, and then "one name
 * per player" means nothing.
 *
 * The cached name is for showing in the UI before the network answers. The
 * name that actually appears on the board is whatever the server resolves
 * from the token.
 */
const store = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null; // private mode, blocked storage
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Session-only. A new identity next visit is not worth an error message.
    }
  },
};

/** The last name the server gave us, or null before the first exchange. */
export function getHandle() {
  return store.get(HANDLE_KEY);
}

/**
 * Make sure this browser has an identity, creating one on first use.
 * Returns the name, or null when the board is unreachable.
 */
export async function ensureIdentity() {
  const deviceToken = store.get(DEVICE_KEY);
  const out = await request('/api/identity', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(deviceToken ? { deviceToken } : {}),
  });
  if (!out?.deviceToken || !out?.handle) return null;
  store.set(DEVICE_KEY, out.deviceToken);
  store.set(HANDLE_KEY, out.handle);
  return out.handle;
}

/**
 * The Vite dev server serves the static site only — there are no serverless
 * functions behind it, so every call would 404 and fill the console with
 * errors that the verification probes then count as failures. Off in dev,
 * on in a real build, and `?lb=1` forces it on for local testing against a
 * deployed API.
 */
const ENABLED = import.meta.env.PROD || new URLSearchParams(location.search).has('lb');
/**
 * A page with window.__game exposed (dev server, or `?debug`) has
 * debugTeleport, which parks the car on the target pose. Such a page never
 * starts or submits a run; it can still read the boards.
 */
const CAN_SUBMIT = ENABLED && !DEBUG_HOOKS;

async function request(path, options = {}) {
  if (!ENABLED) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(path, { ...options, signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null; // offline, blocked, timed out, unconfigured — all the same here
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Tell the server a run has begun and hold on to its token.
 *
 * The token is what makes a submitted score correspond to a real run that the
 * server timed. Called on every level start; if it fails, the run simply
 * cannot be submitted, which is the correct outcome.
 */
export function createRunTracker() {
  let current = null;

  return {
    get token() {
      return current;
    },

    async begin(levelId) {
      current = null;
      if (!CAN_SUBMIT) return;
      const out = await request('/api/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ levelId }),
      });
      if (out?.runId && out?.token) current = { ...out, levelId };
    },

    /** Forget the run, whether it was spent or abandoned. */
    clear() {
      current = null;
    },

    /**
     * Submit a finished run. Returns { ok, rank, improved } or null.
     * @param {object} result from Scoring.finish()
     */
    async submit(levelId, result) {
      if (!CAN_SUBMIT || !current || current.levelId !== levelId) return null;
      if (!store.get(DEVICE_KEY) && !(await ensureIdentity())) return null;
      // No name in the payload: the server resolves it from the device token.
      const payload = {
        runId: current.runId,
        token: current.token,
        deviceToken: store.get(DEVICE_KEY),
        levelId,
        score: result.score,
        stars: result.stars,
        timeSec: result.timeSec,
        bumps: result.bumps,
        cones: result.cones,
        kerbHits: result.kerbHits,
      };
      const out = await request('/api/score', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      current = null; // the token is one-shot either way
      if (out?.handle) store.set(HANDLE_KEY, out.handle);
      return out;
    },
  };
}

/** Top entries for one level, or null when the board is unreachable. */
export async function fetchBoard(levelId, limit = 100) {
  const out = await request(`/api/leaderboard?levelId=${levelId}&limit=${limit}`);
  return out?.entries ?? null;
}
