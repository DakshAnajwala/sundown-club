/** GET /api/club/push-run — the daily reminder run. Called by the Vercel cron in vercel.json; needs CRON_SECRET as a bearer. Does nothing until push is configured. */
import { getStore, passwordOk } from '../_lib/club.js';
import { pushConfigured, runPush } from '../_lib/push.js';

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  if (!pushConfigured()) { res.status(503).json({ error: 'push not configured' }); return; }
  const secret = process.env.CRON_SECRET;
  const given = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!secret || !passwordOk(given, secret)) { res.status(401).json({ error: 'unauthorized' }); return; }
  try { res.status(200).json(await runPush(getStore())); } catch { res.status(503).json({ error: 'store unavailable' }); }
}
