/**
 * POST /api/club/play — everything a game page tells the boards.
 * Body (JSON, ≤ 2 KB): { a: 'session'|'beat'|'submit'|'name'|'reroll'|'leave', player, ... }.
 * Nothing the player typed is accepted: names are made by the server.
 */
import { getStore, readBody } from '../_lib/club.js';
import { beat, leave, limit, nameOf, reroll, startSession, submit, validPlayer } from '../_lib/board.js';

const KIND = { session: 'session', beat: 'beat', submit: 'submit', name: 'name', reroll: 'name', leave: 'name' };

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ error: 'method' }); return; }
  let body;
  try { body = await readBody(req, 2048); } catch { res.status(400).json({ error: 'bad request' }); return; }
  const a = body?.a;
  if (!KIND[a]) { res.status(400).json({ error: 'bad request' }); return; }
  const now = process.env.CLUB_DEV === '1' && req.headers['x-dev-now'] ? Number(req.headers['x-dev-now']) : Date.now();
  try {
    const store = getStore();
    const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
    if (!(await limit(store, ip, KIND[a], now))) { res.status(429).json({ error: 'slow down' }); return; }
    if (a === 'beat') { res.status(200).json(await beat(store, body.token, now)); return; }
    const player = typeof body.player === 'string' ? body.player.toLowerCase() : '';
    if (!validPlayer(player)) { res.status(400).json({ error: 'bad request' }); return; }
    if (a === 'session') {
      const s = await startSession(store, player, String(body.game || ''), now);
      if (!s) { res.status(400).json({ error: 'bad request' }); return; }
      res.status(200).json(s); return;
    }
    if (a === 'submit') {
      const r = await submit(store, player, body.board, body.data);
      res.status(r.ok ? 200 : r.status).json(r.ok ? { ok: true } : { error: 'rejected' }); return;
    }
    if (a === 'name') { res.status(200).json({ name: await nameOf(store, player) }); return; }
    if (a === 'reroll') { res.status(200).json(await reroll(store, player, now)); return; }
    if (a === 'leave') { res.status(200).json(await leave(store, player, now)); return; }
  } catch {
    res.status(503).json({ error: 'the board is resting' });
    return;
  }
}
