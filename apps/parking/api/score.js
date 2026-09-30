/**
 * POST /api/score — submit a finished run.
 *
 * Every check this route makes, in order: the body is small and well formed,
 * the values are possible, the run token is one this server issued for this
 * level and has not been spent, and the claimed run length agrees with the
 * wall clock the server itself measured. Only then does the row go on the
 * board, and only if it beats that player's own previous best.
 *
 * What none of that proves is that anybody drove. The score arrives from the
 * player's browser. The board is labelled unverified for that reason.
 */
import {
  clientIp,
  configured,
  consumeRun,
  nameFor,
  rankOf,
  rateLimited,
  readJson,
  rejectReason,
  submit,
  verifyIdentity,
  verifyRun,
  wallClockRejects,
} from './_lib/board.js';
import { generateHandle } from '../src/net/handles.js';

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method' });
    return;
  }
  if (!configured()) {
    res.status(503).json({ error: 'leaderboard unavailable' });
    return;
  }

  let body;
  try {
    body = await readJson(req);
  } catch {
    res.status(400).json({ error: 'bad request' });
    return;
  }

  // One vague message for every rejection: telling a cheat which rule it
  // tripped is telling it how to pass next time.
  const reject = () => res.status(400).json({ error: 'rejected' });

  const bad = rejectReason(body);
  if (bad) {
    reject();
    return;
  }

  // Who this is. The client cannot choose: the name comes from the device id
  // the server issued, so a submission can only ever land under that name.
  const deviceId = verifyIdentity(body.deviceToken);
  if (!deviceId) {
    reject();
    return;
  }

  try {
    if (await rateLimited(clientIp(req))) {
      res.status(429).json({ error: 'slow down' });
      return;
    }

    const issuedAt = verifyRun(body.runId, body.levelId, body.token);
    if (issuedAt === null) {
      reject();
      return;
    }
    if (wallClockRejects(body.timeSec, issuedAt)) {
      reject();
      return;
    }
    // Spend the token. A second submission on the same run finds it gone.
    if (!(await consumeRun(body.runId))) {
      reject();
      return;
    }

    const row = {
      score: Math.round(body.score * 10) / 10,
      stars: body.stars,
      timeSec: Math.round(body.timeSec * 10) / 10,
      bumps: body.bumps,
      cones: body.cones,
      kerbHits: body.kerbHits,
      at: Date.now(),
    };
    const handle = await nameFor(deviceId, generateHandle);
    const { improved } = await submit(body.levelId, handle, row);
    const rank = await rankOf(body.levelId, handle);
    res.status(200).json({ ok: true, improved, rank, handle });
  } catch {
    res.status(503).json({ error: 'leaderboard unavailable' });
  }
}
