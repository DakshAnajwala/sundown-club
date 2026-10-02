/** POST /api/club/event — anonymous usage counters. Spec: docs/retention/SPEC-telemetry.md */
import { getStore, ingest, rateLimit, readBody, validateBatch } from '../_lib/club.js';

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ error: 'method' }); return; }
  let batch;
  try {
    batch = validateBatch(await readBody(req));
  } catch {
    res.status(400).json({ error: 'bad request' });
    return;
  }
  if (!batch) { res.status(400).json({ error: 'bad request' }); return; }
  try {
    const store = getStore();
    const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
    if (!(await rateLimit(store, ip, batch.events.length))) { res.status(429).json({ error: 'slow down' }); return; }
    await ingest(store, batch);
  } catch {
    /* counters are best effort: never make a game page fail */
  }
  res.status(204).end();
}
