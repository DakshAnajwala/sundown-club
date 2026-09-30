/**
 * POST /api/identity — get (or keep) this browser's leaderboard name.
 *
 * Send nothing the first time and the server issues an opaque signed id and
 * generates a name for it. Send the id back on later visits and the same name
 * comes back. The client never picks the name, so it cannot collect several
 * rows on one board by editing its own storage.
 *
 * The id is random and says nothing about the device. It identifies a browser
 * profile, not a person — see the note in _lib/board.js.
 *
 * Body: { deviceToken? }
 */
import { configured, issueIdentity, nameFor, readJson, verifyIdentity } from './_lib/board.js';
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

  let body = {};
  try {
    body = await readJson(req);
  } catch {
    res.status(400).json({ error: 'bad request' });
    return;
  }

  try {
    // An unrecognised or absent token gets a brand new identity rather than
    // an error: a player who cleared their site data should simply carry on.
    const deviceToken = verifyIdentity(body?.deviceToken) ? body.deviceToken : issueIdentity();
    const id = verifyIdentity(deviceToken);
    const handle = await nameFor(id, generateHandle);
    res.status(200).json({ deviceToken, handle });
  } catch {
    res.status(503).json({ error: 'leaderboard unavailable' });
  }
}
