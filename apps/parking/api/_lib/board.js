/**
 * board.js — shared leaderboard rules and storage, for the two API routes.
 *
 * STORAGE
 * Upstash Redis over its REST API, so there is no connection pool to manage in
 * a serverless function. One sorted set per level holds the ranking; one hash
 * per entry holds the row. Both are reached with plain fetch, so this file has
 * no dependencies at all — nothing to install, nothing to keep in step with
 * the game's own bundle.
 *
 * The environment variables come from Vercel's Upstash integration. That
 * integration names them KV_REST_API_URL / KV_REST_API_TOKEN; connecting an
 * Upstash database directly gives UPSTASH_REDIS_REST_URL / _TOKEN instead.
 * Both are the same REST endpoint, so both spellings are accepted and it does
 * not matter which route the database was added by.
 *
 * With the URL, the token or LEADERBOARD_SECRET missing, `configured()` is
 * false and the routes answer 503
 * rather than throwing. The game treats that exactly like being offline, which
 * is the behaviour it must have anyway.
 *
 * TRUST
 * Nothing that arrives here is trusted. The score is computed in the player's
 * own browser (src/game/Scoring.js) and can be forged by anyone willing to
 * open the console. What this file can do is reject the impossible and the
 * implausible, keep one entry per player per level, and rate-limit. What it
 * cannot do is prove a run happened. The board says so on its face.
 */

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

/** Highest level id that may be posted. Ids are stable, not sequential with
 *  play order — levels added later keep their own id. */
export const LEVEL_COUNT = 17;
export const TOP_N = 100;
/** Fastest a level has ever been finished in testing, with margin. */
export const MIN_TIME_SEC = 4;
/** Longest run worth recording; the hardest level's limit is 420 s. */
export const MAX_TIME_SEC = 3600;
export const MAX_BODY_BYTES = 4096;
/** Submissions allowed per IP per window. */
export const RATE_LIMIT = 12;
/**
 * Run starts allowed per IP per window. Every level load and every restart
 * starts a run, so sharing the submission budget meant a player practising a
 * bay (or a class behind one school IP) silently lost the ability to post
 * after 12 starts. Tokens are one-shot, level-bound and wall-clock checked,
 * so this only needs to stop bulk minting: one start every 5 s on average.
 */
export const START_RATE_LIMIT = 120;
export const RATE_WINDOW_SEC = 600;
/** A run token is good for this long. Longest level limit is 420 s. */
export const RUN_TTL_SEC = 1800;
/**
 * A submission must be consistent with the wall-clock time the server itself
 * measured between issuing the token and receiving the score.
 *
 * Lower bound: the claimed run cannot have taken LONGER than real time did.
 * 0.7 leaves room for a throttled background tab, which advances game time
 * slower than the wall, not faster.
 *
 * Upper bound: a run that took far longer in the real world than it claims
 * means game time was slowed down — the trick that buys a cheat extra
 * thinking time per game second. Generous, because pausing is legitimate.
 */
export const WALL_MIN_RATIO = 0.7;
export const WALL_SLACK_SEC = 180;
export const WALL_MAX_RATIO = 4;

const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const secret = process.env.LEADERBOARD_SECRET;

export const configured = () => Boolean(url && token && secret);

/** One Upstash REST command, e.g. redis(['ZADD', key, score, member]). */
async function redis(command) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(command),
  });
  if (!res.ok) throw new Error(`upstash ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json.result;
}

/**
 * Run tokens.
 *
 * A score is only accepted against a token this server issued, for that level,
 * within the last RUN_TTL_SEC, and never used before. That alone closes the
 * easy attacks: pasting a submit call into the console, replaying a captured
 * request, and spraying submissions, all need a fresh token per attempt, and
 * the token records when the run really started.
 *
 * It does NOT prove the run was driven. The score still comes from the
 * player's own browser. See the note at the top of this file.
 */
export function issueRun(levelId) {
  const runId = randomUUID();
  const issuedAt = Date.now();
  const sig = createHmac('sha256', secret).update(`${runId}:${levelId}:${issuedAt}`).digest('hex');
  return { runId, issuedAt, token: `${issuedAt}.${sig}` };
}

/** Verify a token's signature. Returns issuedAt (ms), or null. */
export function verifyRun(runId, levelId, token) {
  if (typeof runId !== 'string' || typeof token !== 'string') return null;
  const [issuedRaw, sig] = token.split('.');
  const issuedAt = Number(issuedRaw);
  if (!Number.isFinite(issuedAt) || !sig) return null;
  const want = createHmac('sha256', secret).update(`${runId}:${levelId}:${issuedAt}`).digest('hex');
  const a = Buffer.from(sig, 'hex');
  const b = Buffer.from(want, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (Date.now() - issuedAt > RUN_TTL_SEC * 1000) return null;
  return issuedAt;
}

/**
 * Device identity.
 *
 * The server hands each browser an opaque random id, signed so it cannot be
 * minted client-side, and stores the generated name against it. The client
 * never chooses or sends a name: /api/score looks it up from the id. That is
 * what makes "one name per player" mean anything — editing localStorage no
 * longer changes who you are on the board, because the mapping lives here.
 *
 * It identifies a BROWSER PROFILE, not a person. Clearing site data or using
 * a private window starts again, and that is disclosed in the privacy policy
 * rather than papered over. Stopping a determined person would need accounts,
 * or fingerprinting, which is tracking; neither is wanted here.
 *
 * The id is random. Nothing about the device is collected or derived.
 */
export function issueIdentity() {
  const id = randomUUID();
  const sig = createHmac('sha256', secret).update(`id:${id}`).digest('hex');
  return `${id}.${sig}`;
}

/** The id inside a device token, or null when it was not issued by us. */
export function verifyIdentity(deviceToken) {
  if (typeof deviceToken !== 'string' || deviceToken.length > 200) return null;
  const [id, sig] = deviceToken.split('.');
  if (!id || !sig) return null;
  const want = createHmac('sha256', secret).update(`id:${id}`).digest('hex');
  const a = Buffer.from(sig, 'hex');
  const b = Buffer.from(want, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return id;
}

const nameKey = (id) => `lb:v1:name:${id}`;

/**
 * The name for a device id, generating and claiming one on first use.
 * SETNX so two requests racing on a fresh id cannot end up with two names.
 */
export async function nameFor(id, generate) {
  const existing = await redis(['GET', nameKey(id)]);
  if (existing) return existing;
  const handle = generate();
  const claimed = await redis(['SET', nameKey(id), handle, 'NX']);
  if (claimed) return handle;
  return (await redis(['GET', nameKey(id)])) ?? handle;
}

const runKey = (runId) => `lb:v1:run:${runId}`;

/** Mark a run started, so the token can only be spent once. */
export async function openRun(runId) {
  await redis(['SET', runKey(runId), '1', 'EX', String(RUN_TTL_SEC)]);
}

/** Spend a run token. False when it was already used, or has expired. */
export async function consumeRun(runId) {
  const removed = await redis(['DEL', runKey(runId)]);
  return Number(removed) === 1;
}

/** True when the claimed run length disagrees with the wall clock. */
export function wallClockRejects(claimedSec, issuedAt) {
  const wallSec = (Date.now() - issuedAt) / 1000;
  if (claimedSec > wallSec / WALL_MIN_RATIO + 2) return 'fast';
  if (wallSec > claimedSec * WALL_MAX_RATIO + WALL_SLACK_SEC) return 'slow';
  return null;
}

export const boardKey = (levelId) => `lb:v1:level:${levelId}`;
export const rowKey = (levelId, handle) => `lb:v1:row:${levelId}:${handle}`;

/**
 * Rank key: score descending, then time ascending, in one float.
 *
 * Redis sorts a sorted set ascending, so the key is negated at read time by
 * reading the range in reverse. Score contributes the whole part; the time
 * contributes a fraction that DECREASES the key as the run gets slower, so a
 * faster run at the same score ranks higher. Time is clamped so a long run
 * can never bleed into the next score.
 */
export function rankKey(score, timeSec) {
  const t = Math.min(Math.max(timeSec, 0), MAX_TIME_SEC);
  // Scaled by 0.999 so an instant run cannot reach the next whole score: at
  // t = 0 the fraction was exactly 1, which tied a 90 with a 91.
  return score + 0.999 * (1 - t / (MAX_TIME_SEC + 1));
}

/** Per-IP fixed-window counter. Returns true when the caller is over budget. */
export async function rateLimited(ip, limit = RATE_LIMIT) {
  const key = `lb:v1:rate:${ip}:${Math.floor(Date.now() / 1000 / RATE_WINDOW_SEC)}`;
  const hits = await redis(['INCR', key]);
  if (hits === 1) await redis(['EXPIRE', key, RATE_WINDOW_SEC]);
  return hits > limit;
}

/**
 * Validate a submission's numbers. Returns null when acceptable, otherwise a
 * short reason — deliberately vague in the response, so probing the rules
 * teaches a cheat as little as possible.
 *
 * The display name is NOT among them: it is never sent by the client, it is
 * looked up from the device id (see nameFor).
 */
export function rejectReason(body) {
  if (!body || typeof body !== 'object') return 'shape';
  const { levelId, score, stars, timeSec, bumps, cones, kerbHits } = body;

  if (!Number.isInteger(levelId) || levelId < 1 || levelId > LEVEL_COUNT) return 'level';
  if (!Number.isFinite(score) || score < 0 || score > 100) return 'score';
  if (!Number.isInteger(stars) || stars < 0 || stars > 3) return 'stars';
  if (!Number.isFinite(timeSec) || timeSec < MIN_TIME_SEC || timeSec > MAX_TIME_SEC) return 'time';
  for (const n of [bumps, cones, kerbHits]) {
    if (!Number.isInteger(n) || n < 0 || n > 999) return 'counts';
  }

  // Plausibility: the scoring weights give at most 10 points of Finesse for a
  // clean run, so a run that hit things cannot also be perfect.
  if (score >= 100 && (bumps || cones || kerbHits)) return 'implausible';
  return null;
}

/** Write a submission, keeping only the player's best run on that level. */
export async function submit(levelId, handle, row) {
  const key = rankKey(row.score, row.timeSec);
  const existing = await redis(['ZSCORE', boardKey(levelId), handle]);
  if (existing !== null && Number(existing) >= key) return { improved: false };
  await redis(['ZADD', boardKey(levelId), key, handle]);
  await redis(['SET', rowKey(levelId, handle), JSON.stringify(row)]);
  return { improved: true };
}

/** The top `limit` entries for a level, best first. */
export async function top(levelId, limit = TOP_N) {
  const n = Math.min(Math.max(1, limit), TOP_N);
  const handles = await redis(['ZREVRANGE', boardKey(levelId), 0, n - 1]);
  if (!handles?.length) return [];
  const rows = await redis(['MGET', ...handles.map((h) => rowKey(levelId, h))]);
  return handles
    .map((handle, i) => {
      try {
        const row = JSON.parse(rows[i]);
        return { rank: i + 1, handle, ...row };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/** 1-based rank of one handle on a level, or null. */
export async function rankOf(levelId, handle) {
  const r = await redis(['ZREVRANK', boardKey(levelId), handle]);
  return r === null || r === undefined ? null : Number(r) + 1;
}

/** Best-effort client IP, for the rate limiter only. Never stored. */
export function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  const first = Array.isArray(fwd) ? fwd[0] : String(fwd ?? '').split(',')[0];
  return (first || 'unknown').trim();
}

export function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY_BYTES) {
        reject(new Error('too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch {
        reject(new Error('bad json'));
      }
    });
    req.on('error', reject);
  });
}
