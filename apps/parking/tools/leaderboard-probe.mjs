/**
 * leaderboard-probe.mjs — the leaderboard's rules, tested without a browser
 * or a database.
 *
 * Everything asserted here is pure: validation, ranking, run tokens, the
 * wall-clock check and the handle list. Those are the parts that decide what
 * reaches a public page, so they are worth testing on their own rather than
 * only through a deployed endpoint.
 *
 *   node tools/leaderboard-probe.mjs
 */
process.env.LEADERBOARD_SECRET ??= 'probe-secret';
process.env.UPSTASH_REDIS_REST_URL ??= 'https://example.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN ??= 'probe-token';

const board = await import('../api/_lib/board.js');
const { isValidHandle, generateHandle, HANDLE_RE } = await import('../src/net/handles.js');

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
};

const good = {
  levelId: 1,
  score: 82.5,
  stars: 2,
  timeSec: 41.2,
  bumps: 0,
  cones: 0,
  kerbHits: 0,
};

// --- validation ---------------------------------------------------------------
check('a normal submission is accepted', board.rejectReason(good) === null,
  String(board.rejectReason(good)));

const rejects = [
  ['score over 100', { ...good, score: 101 }],
  ['negative score', { ...good, score: -1 }],
  ['unknown level', { ...good, levelId: 99 }],
  ['level zero', { ...good, levelId: 0 }],
  ['non-integer level', { ...good, levelId: 1.5 }],
  ['negative time', { ...good, timeSec: -5 }],
  ['impossibly fast run', { ...good, timeSec: 0.4 }],
  ['absurdly long run', { ...good, timeSec: 999999 }],
  ['fractional bumps', { ...good, bumps: 1.5 }],
  ['negative bumps', { ...good, bumps: -2 }],
  ['too many stars', { ...good, stars: 9 }],
  ['an empty body', null],
  ['an array', []],
  ['a perfect score with contact', { ...good, score: 100, bumps: 3 }],
];
let allRejected = true;
for (const [what, body] of rejects) {
  const reason = board.rejectReason(body);
  if (!reason) {
    allRejected = false;
    console.log(`        not rejected: ${what}`);
  }
}
check(`every malformed submission is rejected (${rejects.length} cases)`, allRejected);

// --- ranking ------------------------------------------------------------------
const rk = board.rankKey;
check('a higher score always outranks a lower one',
  rk(90, 300) > rk(89, 5) && rk(100, 3599) > rk(99, 1));
check('at equal scores, the faster run wins', rk(90, 20) > rk(90, 40));
check('rank keys stay inside their score band',
  rk(90, 0) < 91 && rk(90, board.MAX_TIME_SEC) >= 90);

// --- run tokens ---------------------------------------------------------------
const issued = board.issueRun(3);
check('a freshly issued token verifies', board.verifyRun(issued.runId, 3, issued.token) !== null);
check('a token does not work on another level', board.verifyRun(issued.runId, 4, issued.token) === null);
check('a token does not work with another run id', board.verifyRun('not-the-run', 3, issued.token) === null);
check('a tampered signature is rejected',
  board.verifyRun(issued.runId, 3, issued.token.replace(/.$/, (c) => (c === 'a' ? 'b' : 'a'))) === null);
check('a made-up token is rejected', board.verifyRun(issued.runId, 3, `${Date.now()}.deadbeef`) === null);
check('a token with no signature is rejected', board.verifyRun(issued.runId, 3, '123') === null);

// --- device identity ----------------------------------------------------------
const dev = board.issueIdentity();
check('an issued device token verifies', board.verifyIdentity(dev) !== null);
check('a made-up device token is rejected', board.verifyIdentity('abc.def') === null);
check('a tampered device token is rejected',
  board.verifyIdentity(dev.replace(/.$/, (c) => (c === 'a' ? 'b' : 'a'))) === null);
check('an absent device token is rejected', board.verifyIdentity(undefined) === null);
check('an over-long device token is rejected', board.verifyIdentity('a'.repeat(400)) === null);
check('two devices get different ids', board.verifyIdentity(board.issueIdentity()) !== board.verifyIdentity(dev));

// --- the wall clock -----------------------------------------------------------
const now = Date.now();
check('a run claiming more time than really passed is rejected',
  board.wallClockRejects(600, now - 10_000) === 'fast');
check('an honest run passes', board.wallClockRejects(40, now - 42_000) === null);
check('a slightly throttled tab still passes', board.wallClockRejects(40, now - 38_000) === null);
check('a grossly slowed-down clock is rejected',
  board.wallClockRejects(10, now - 3_600_000) === 'slow');

// --- handles ------------------------------------------------------------------
let generatedOk = true;
for (let i = 0; i < 2000; i++) {
  const h = generateHandle();
  if (!HANDLE_RE.test(h) || !isValidHandle(h)) {
    generatedOk = false;
    console.log(`        bad handle: ${h}`);
    break;
  }
}
check('2000 generated handles are all valid', generatedOk);
check('an empty handle is invalid', !isValidHandle(''));
check('a null handle is invalid', !isValidHandle(null));
check('a very long handle is invalid', !isValidHandle('A'.repeat(500)));
check('markup in a handle is invalid', !isValidHandle('<img src=x onerror=1> Otter 412'));

const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} checks pass`);
process.exit(failed ? 1 : 0);
