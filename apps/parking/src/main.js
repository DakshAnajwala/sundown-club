/**
 * main.js — entry point. Wiring only; all behaviour lives in core/Game.js.
 */
import { createGame } from './core/Game.js';
import { DEBUG_HOOKS } from './core/debugHooks.js';
import { initTelemetry } from '@sundown/shared/telemetry';
import { showNote } from '@sundown/shared/roundpanel';

initTelemetry({ game: 'parking' });

const container = document.getElementById('app');
const game = createGame({ container });
game.start();

// A shared ghost link (/parking/play/?g=<id>): fetch the friend's run and keep it for that level.
{
  const gid = new URLSearchParams(location.search).get('g');
  if (gid && /^[A-Za-z0-9]{8}$/.test(gid)) {
    fetch('/api/club/play', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ a: 'ghost_get', id: gid }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((g) => {
        if (!g || !game.rival.set(g.level, g.hz, g.d, g.name)) return showNote('That ghost link has expired or does not work.');
        showNote(`Racing ${g.name}'s ghost on ${game.rival.levelName(g.level) ?? `level ${g.level}`}. Start that level and a gold car drives their run.`, { ttl: 12000, corner: 'tr', style: { top: '72px' } });
      })
      .catch(() => {});
  }
}

/**
 * Debug handle, for console poking and for the scripted verification runs in
 * tools/.
 *
 * NOT exposed in a production build by default. `debugTeleport` puts the car
 * on any pose, including the target one, and `debugTick` advances the
 * simulation by hand — with those reachable from the console, a leaderboard
 * score means nothing at all. The dev server keeps them (every probe in
 * tools/ runs against it), and `?debug=1` turns them back on for a built
 * site when someone genuinely needs to inspect one.
 */
if (DEBUG_HOOKS) {
  window.__game = game;
}
