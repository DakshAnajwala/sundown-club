/**
 * main.js — entry point. Wiring only; all behaviour lives in core/Game.js.
 */
import { createGame } from './core/Game.js';
import { DEBUG_HOOKS } from './core/debugHooks.js';

const container = document.getElementById('app');
const game = createGame({ container });
game.start();

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
