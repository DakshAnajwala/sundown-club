/**
 * GET /api/leaderboard?levelId=N&limit=100 — the ranked table for one level.
 *
 * Public and read-only. Rows hold a generated handle and the run's numbers;
 * there is nothing personal in them to protect.
 */
import { configured, top, LEVEL_COUNT, TOP_N } from './_lib/board.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method' });
    return;
  }
  if (!configured()) {
    res.status(503).json({ error: 'leaderboard unavailable' });
    return;
  }

  const params = new URL(req.url, 'http://localhost').searchParams;
  const levelId = Number(params.get('levelId'));
  const limit = Number(params.get('limit') ?? TOP_N);
  if (!Number.isInteger(levelId) || levelId < 1 || levelId > LEVEL_COUNT) {
    res.status(400).json({ error: 'bad request' });
    return;
  }

  try {
    const entries = await top(levelId, Number.isFinite(limit) ? limit : TOP_N);
    // A few seconds of edge caching: the board is not live scoring, and this
    // keeps a refresh-spamming page off the database.
    res.setHeader('cache-control', 'public, s-maxage=10, stale-while-revalidate=60');
    res.status(200).json({ levelId, entries, verified: false });
  } catch {
    res.status(503).json({ error: 'leaderboard unavailable' });
  }
}
