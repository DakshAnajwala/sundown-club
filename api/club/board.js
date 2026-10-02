/** GET /api/club/board?tab=time|bj|pk|streak&win=week|all&player=<id> — top 10 and your place. Public, read only. */
import { getStore } from '../_lib/club.js';
import { limit, readBoard } from '../_lib/board.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'method' }); return; }
  const url = new URL(req.url, 'http://x');
  const tab = url.searchParams.get('tab') || 'time', win = url.searchParams.get('win') === 'all' ? 'all' : 'week';
  const now = process.env.CLUB_DEV === '1' && req.headers['x-dev-now'] ? Number(req.headers['x-dev-now']) : Date.now();
  try {
    const store = getStore();
    const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
    if (!(await limit(store, ip, 'read', now))) { res.status(429).json({ error: 'slow down' }); return; }
    const out = await readBoard(store, { tab, win, player: url.searchParams.get('player') }, now);
    if (!out) { res.status(400).json({ error: 'bad request' }); return; }
    res.setHeader('cache-control', 'public, max-age=15');
    res.status(200).json(out);
  } catch {
    res.status(503).json({ error: 'the board is resting' });
  }
}
