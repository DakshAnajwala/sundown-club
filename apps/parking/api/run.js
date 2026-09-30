/**
 * POST /api/run — start a run and get a one-shot token for its score.
 *
 * The client calls this when a level begins. The token it gets back is the
 * only thing /api/score will accept, it is good for one submission, and it
 * carries the moment the server saw the run start — which is what lets the
 * score route check the claimed run length against real time.
 *
 * Body: { levelId }
 */
import { configured, issueRun, openRun, clientIp, rateLimited, readJson, LEVEL_COUNT, START_RATE_LIMIT } from './_lib/board.js';

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

  const levelId = body?.levelId;
  if (!Number.isInteger(levelId) || levelId < 1 || levelId > LEVEL_COUNT) {
    res.status(400).json({ error: 'bad request' });
    return;
  }

  try {
    // Starting runs is rate-limited too: without it, a cheat can mint tokens
    // as fast as it likes and spend them later.
    if (await rateLimited(`start:${clientIp(req)}`, START_RATE_LIMIT)) {
      res.status(429).json({ error: 'slow down' });
      return;
    }
    const { runId, token } = issueRun(levelId);
    await openRun(runId);
    res.status(200).json({ runId, token });
  } catch {
    res.status(503).json({ error: 'leaderboard unavailable' });
  }
}
