/** GET /api/club/metrics — the numbers behind /admin/metrics/. Needs the METRICS_PASSWORD bearer. */
import { getStore, metrics, passwordOk } from '../_lib/club.js';

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  if (req.method !== 'GET') { res.status(405).json({ error: 'method' }); return; }
  const expected = process.env.METRICS_PASSWORD;
  if (!expected) { res.status(503).json({ error: 'metrics not configured' }); return; }
  const given = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!passwordOk(given, expected)) { res.status(401).json({ error: 'unauthorized' }); return; }
  try {
    res.status(200).json(await metrics(getStore()));
  } catch {
    res.status(503).json({ error: 'store unavailable' });
  }
}
