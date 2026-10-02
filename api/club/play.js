/**
 * POST /api/club/play — everything a game page tells the boards.
 * Body (JSON, ≤ 2 KB): { a: 'session'|'beat'|'submit'|'name'|'reroll'|'leave', player, ... }.
 * Nothing the player typed is accepted: names are made by the server.
 */
import { getStore, readBody } from '../_lib/club.js';
import { beat, clubCreate, clubJoin, clubLeave, inviteClaim, inviteCode, inviteStatus, leave, limit, nameOf, reroll, startSession, submit, validPlayer } from '../_lib/board.js';
import { signChallenge, verifyChallenge } from '../_lib/challenge.js';
import { getGhost, putGhost } from '../_lib/ghost.js';

const KIND = { session: 'session', beat: 'beat', submit: 'submit', name: 'name', reroll: 'name', leave: 'name', club_create: 'club', club_join: 'club', club_leave: 'club', invite_code: 'invite', invite_claim: 'invite', invite_status: 'invite', challenge: 'invite', challenge_check: 'invite', ghost_put: 'invite', ghost_get: 'invite' };

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ error: 'method' }); return; }
  let body;
  try { body = await readBody(req, 40000); } catch { res.status(400).json({ error: 'bad request' }); return; }
  const a = body?.a;
  if (!KIND[a]) { res.status(400).json({ error: 'bad request' }); return; }
  const now = process.env.CLUB_DEV === '1' && req.headers['x-dev-now'] ? Number(req.headers['x-dev-now']) : Date.now();
  try {
    const store = getStore();
    const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
    if (!(await limit(store, ip, KIND[a], now))) { res.status(429).json({ error: 'slow down' }); return; }
    if (a === 'beat') { res.status(200).json(await beat(store, body.token, now)); return; }
    if (a === 'ghost_get') { const g = await getGhost(store, body.id); res.status(g ? 200 : 404).json(g || { error: 'not found' }); return; }
    if (a === 'challenge_check') { res.status(200).json(verifyChallenge(body.code)); return; }
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
    if (a === 'club_create') { res.status(200).json(await clubCreate(store, player)); return; }
    if (a === 'club_join') { res.status(200).json(await clubJoin(store, player, body.code)); return; }
    if (a === 'club_leave') { res.status(200).json(await clubLeave(store, player)); return; }
    if (a === 'invite_code') { res.status(200).json({ code: await inviteCode(store, player) }); return; }
    if (a === 'invite_claim') { res.status(200).json(await inviteClaim(store, player, body.code, now)); return; }
    if (a === 'invite_status') { res.status(200).json(await inviteStatus(store, player)); return; }
    if (a === 'ghost_put') { const r = await putGhost(store, player, await nameOf(store, player), body.ghost || {}, now); res.status(r.ok ? 200 : 422).json(r); return; }
    if (a === 'challenge') { res.status(200).json(signChallenge(body.data, await nameOf(store, player), now)); return; }
  } catch {
    res.status(503).json({ error: 'the board is resting' });
    return;
  }
}
