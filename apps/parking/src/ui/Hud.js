/**
 * Hud.js — the DOM overlay: in-play cards, and the menu shell.
 *
 * Division of labour: anything that is an INSTRUMENT lives in the car, drawn
 * to a canvas texture on the dashboard (see DashCluster.js). Speed, revs, the
 * selected gear and the parking sensors are on the dash because that is where a
 * driver reads them, and putting them in screen-space would undercut the
 * first-person framing the whole game is built on.
 *
 * What is left for the DOM is everything that is NOT part of the car: the
 * objective card, the live prompt, and the menus — start, level select,
 * settings, controls, pause, results, and the tutorial's cards.
 *
 * Menus navigate as a tiny stack: every sub-panel is opened with a `back`
 * function, so Settings opened from Pause returns to Pause, and opened from the
 * start screen returns there. No alert/confirm dialogs anywhere — destructive
 * actions (reset progress) confirm in place.
 *
 * The module owns its own markup and stylesheet so the whole overlay is one
 * import with nothing to keep in sync in index.html.
 *
 * NOTE: this file is `Hud.js` with a capital H, and macOS filesystems are
 * case-insensitive — do not add a `hud.js` alongside it, they are the same file.
 */
import { SEAT_ADJUST } from './settings.js';
import { ACTIONS, codesFor, keyLabel, conflictsFor } from '../input/Input.js';
import { createTelemetryHud } from './TelemetryHud.js';
import { fetchBoard, getHandle } from '../net/leaderboard.js';
import { share } from './share.js';
import { nextGoal } from '../game/Retention.js';

const CSS = `
.hud, .hud * { box-sizing: border-box; }
.hud {
  position: fixed; inset: 0; pointer-events: none;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  color: #eef3f2; z-index: 10;
  --card: rgba(16,21,24,0.72);
  --edge: rgba(190,210,208,0.16);
  --mint: #8fe6bb;
  --amber: #e8c98a;
  --red: #e0857b;
  --gold: #e9c46a;
  --plat: #d6e4ea;
  --hud-opacity: 1;
  --hud-scale: 1;
}
.hud-card {
  background: var(--card); border: 1px solid var(--edge);
  border-radius: 14px; padding: 12px 16px;
  backdrop-filter: blur(9px); -webkit-backdrop-filter: blur(9px);
}
.hud-tl { position: absolute; top: 18px; left: 18px; max-width: 340px; }
.hud-tr { position: absolute; top: 18px; right: 18px; display: flex; gap: 8px; }
.hud-bc {
  position: absolute; bottom: 26px; left: 50%; transform: translateX(-50%);
  text-align: center; display: flex; flex-direction: column; gap: 10px;
  align-items: center;
}
.hud-level { font-size: 13px; letter-spacing: .16em; text-transform: uppercase;
  color: var(--mint); margin-bottom: 3px; }
.hud-name { font-size: 21px; font-weight: 600; letter-spacing: -.01em; }
.hud-hint { font-size: 13px; line-height: 1.45; opacity: .74; margin-top: 6px; }
.hud-stats { display: flex; gap: 16px; margin-top: 10px; font-variant-numeric: tabular-nums;
  font-size: 13px; opacity: .8; }
.hud-stats b { font-weight: 600; color: #fff; }
.hud-stats[hidden], .hud-dots[hidden] { display: none; }
.hud-dots { display: flex; gap: 5px; margin-top: 10px; }
.hud-dots i { width: 22px; height: 4px; border-radius: 2px; background: rgba(255,255,255,.14); }
.hud-dots i.on { background: var(--mint); }

.hud-btn {
  pointer-events: auto; cursor: pointer; font: inherit; font-size: 12px;
  letter-spacing: .04em; color: #dfe8e6; background: var(--card);
  border: 1px solid var(--edge); border-radius: 10px; padding: 8px 13px;
  backdrop-filter: blur(9px); -webkit-backdrop-filter: blur(9px);
  transition: background .15s, color .15s, border-color .15s;
}
.hud-btn:hover { background: rgba(40,52,56,0.85); color: #fff; border-color: rgba(143,230,187,.5); }
.hud-btn:focus-visible { outline: 2px solid var(--mint); outline-offset: 2px; }
.hud-btn.is-on { color: #10201a; background: var(--mint); border-color: var(--mint); font-weight: 600; }
.hud-btn.is-danger { color: var(--red); border-color: rgba(224,133,123,.4); }
.hud-btn[hidden] { display: none; }

.hud-prompt {
  font-size: 15px; font-weight: 500; padding: 9px 18px; border-radius: 999px;
  background: var(--card); border: 1px solid var(--edge);
  backdrop-filter: blur(9px); -webkit-backdrop-filter: blur(9px);
  transition: opacity .2s, color .2s; opacity: 0;
}
.hud-prompt.show { opacity: 1; }
.hud-prompt.good { color: var(--mint); border-color: rgba(143,230,187,.45); }
.hud-prompt.warn { color: var(--amber); border-color: rgba(232,201,138,.45); }

.hud-keys { display: flex; gap: 14px; font-size: 12px; opacity: .78; letter-spacing: .03em;
  text-shadow: 0 1px 3px rgba(0,0,0,.7); }
.hud-keys kbd, .hud-controls kbd {
  font: inherit; font-size: 11px; background: rgba(255,255,255,.11);
  border: 1px solid rgba(255,255,255,.16); border-radius: 5px;
  padding: 1.5px 5px; margin-right: 3px;
}

.hud-veil {
  position: absolute; inset: 0; pointer-events: auto;
  background: radial-gradient(ellipse at center, rgba(12,16,18,.72), rgba(8,11,13,.93));
  display: flex; align-items: center; justify-content: center; padding: 16px;
  backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px);
}
.hud-veil[hidden] { display: none !important; }
/* HUD customisation (F3). Applied to the in-play clusters only — menus, the
   veil and the review card are deliberately not scaled or faded. Each cluster
   scales from its own corner so nothing drifts off-screen at 1.4x. */
.hud-tl, .hud-tr, .hud-bc, .hud-radar { opacity: var(--hud-opacity); }
.hud-tl { transform: scale(var(--hud-scale)); transform-origin: top left; }
.hud-tr { transform: scale(var(--hud-scale)); transform-origin: top right; }
/* Keep the centring transform: .hud-bc positions itself with left:50% plus
   translateX(-50%), so a bare scale() here silently un-centred the prompt and
   the key legend. */
.hud-bc { transform: translateX(-50%) scale(var(--hud-scale)); transform-origin: bottom center; }
.hud-radar {
  position: absolute; top: 64px; right: 16px; width: 208px; aspect-ratio: 5 / 3;
  transform: scale(var(--hud-scale)); transform-origin: top right;
}
.hud-radar canvas { width: 100%; height: 100%; display: block;
  border-radius: 10px; border: 1px solid var(--edge); background: rgba(10,14,16,0.66); }

/* Key rebinding grid (F6). */
.hud-rebind { text-align: left; display: grid; grid-template-columns: 1fr auto;
  gap: 8px 16px; align-items: center; font-size: 13.5px; margin-top: 6px; }
.hud-rebind .sec { grid-column: 1 / -1; margin-top: 12px; }
.hud-key {
  pointer-events: auto; cursor: pointer; font: inherit; font-size: 12px;
  min-width: 46px; margin-left: 6px; padding: 5px 9px; border-radius: 6px;
  color: #eef3f2; background: rgba(255,255,255,0.06);
  border: 1px solid var(--edge);
}
.hud-key:hover { background: rgba(255,255,255,0.12); }
.hud-key.capturing { border-color: var(--mint); color: var(--mint); min-width: 104px; }
.hud-key.clash { border-color: var(--amber); color: var(--amber); }

/* Leaderboard block on the results card, and the board panel. */
.hud-lb { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--edge); text-align: left; }
.hud-lb-line { display: flex; align-items: center; gap: 10px; font-size: 13px;
  opacity: .8; margin-bottom: 9px; flex-wrap: wrap; }
.hud-lb-line b { font-weight: 600; opacity: 1; color: var(--mint); }
.hud-lb-status { font-size: 12.5px; opacity: .75; margin-top: 8px; line-height: 1.45; }
.hud-lb-notice { font-size: 12.5px; line-height: 1.5; margin-bottom: 10px; padding: 10px 12px;
  border: 1px solid rgba(232,201,138,.35); border-radius: 10px; background: rgba(232,201,138,.06); }
.hud-lb-notice b { color: var(--amber); }
.hud-lb-notice .hud-btn { margin-top: 9px; font-size: 11.5px; padding: 6px 11px; }
.hud-board-nav { display: flex; align-items: center; justify-content: center; gap: 12px;
  margin: 14px 0 4px; font-size: 12.5px; opacity: .8; flex-wrap: wrap; }
.hud-board-nav .hud-btn { font-size: 12px; padding: 6px 12px; }
.hud-board { text-align: left; margin-top: 8px; max-height: 52vh; overflow-y: auto; }
.hud-board table { width: 100%; border-collapse: collapse; font-size: 13px;
  font-variant-numeric: tabular-nums; }
.hud-board th { text-align: left; font-weight: 600; opacity: .5; font-size: 11px;
  letter-spacing: .12em; text-transform: uppercase; padding: 0 8px 8px 0; position: sticky;
  top: 0; background: rgba(18,23,26,0.96); }
.hud-board td { padding: 6px 8px 6px 0; border-top: 1px solid rgba(190,210,208,0.08); }
.hud-board tr.me td { color: var(--mint); }
.hud-board .num { text-align: right; }
.hud-note { font-size: 12px; opacity: .6; line-height: 1.5; margin-top: 12px; }

.hud-panel {
  background: rgba(18,23,26,0.92); border: 1px solid var(--edge);
  border-radius: 20px; padding: 30px 34px; width: min(560px, 100%); text-align: center;
  max-height: calc(100vh - 32px); overflow-y: auto; overscroll-behavior: contain;
}
.hud-panel.wide { width: min(860px, 100%); }
.hud-panel h1 { margin: 0 0 6px; font-size: 30px; font-weight: 650; letter-spacing: -.02em; }
.hud-panel h2 { margin: 0 0 14px; font-size: 22px; font-weight: 600; }
.hud-panel p { margin: 0 0 8px; font-size: 14px; line-height: 1.55; opacity: .78; }
.hud-panel p.hud-leave-hint { margin: 14px 0 0; font-size: 12px; opacity: .6; }
.hud-panel p.hud-touch { opacity: 1; margin: 6px 0 10px; padding: 10px 12px; border: 1px solid rgba(232,201,138,.35);
  border-radius: 10px; background: rgba(232,201,138,.06); color: var(--amber); font-size: 13px; }
.hud-panel .tag { color: var(--mint); font-size: 12px; letter-spacing: .18em;
  text-transform: uppercase; margin-bottom: 10px; }
.hud-actions { display: flex; gap: 10px; justify-content: center; margin-top: 20px; flex-wrap: wrap; }
.hud-actions + .hud-actions { margin-top: 10px; }
.hud-actions .hud-btn { font-size: 13px; padding: 10px 18px; }

.hud-controls { text-align: left; display: grid; grid-template-columns: auto 1fr;
  gap: 7px 16px; margin: 18px 0 4px; font-size: 13px; }
.hud-controls span:nth-child(odd) { opacity: .6; white-space: nowrap; }

.hud-break { display: grid; grid-template-columns: 1fr auto; gap: 7px 18px;
  text-align: left; margin: 16px 0 4px; font-size: 13.5px;
  font-variant-numeric: tabular-nums; }
.hud-break .neg { color: var(--red); }
.hud-break .tot { border-top: 1px solid var(--edge); padding-top: 9px; margin-top: 4px;
  font-weight: 650; font-size: 16px; }
.hud-stars { font-size: 30px; letter-spacing: 6px; color: var(--mint); margin: 6px 0 2px; }

.hud-levels { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 10px; margin-top: 16px; text-align: left; }
.hud-lv {
  pointer-events: auto; cursor: pointer; font: inherit; color: inherit; text-align: left;
  background: rgba(255,255,255,.035); border: 1px solid var(--edge); border-radius: 12px;
  padding: 11px 12px 10px; display: flex; flex-direction: column; gap: 3px;
  transition: border-color .15s, background .15s;
}
.hud-lv:hover { border-color: rgba(143,230,187,.55); background: rgba(143,230,187,.06); }
.hud-lv:focus-visible { outline: 2px solid var(--mint); outline-offset: 2px; }
.hud-lv .n { font-size: 11px; letter-spacing: .14em; text-transform: uppercase; opacity: .55; }
.hud-lv .t { font-size: 15px; font-weight: 600; }
.hud-lv .s { font-size: 12px; opacity: .7; min-height: 2.6em; line-height: 1.3; }
.hud-lv .b { display: flex; justify-content: space-between; align-items: baseline; margin-top: 4px;
  font-size: 12px; font-variant-numeric: tabular-nums; }
.hud-lv .stars { color: var(--mint); letter-spacing: 2px; font-size: 14px; }
.hud-lv .stars.none { color: rgba(255,255,255,.2); }
.hud-lv .chip { font-size: 10px; letter-spacing: .1em; text-transform: uppercase; padding: 2px 6px;
  border-radius: 6px; background: rgba(255,255,255,.07); opacity: .8; align-self: flex-start; }
.hud-lv.current { border-color: rgba(143,230,187,.45); }

.hud-form { display: grid; grid-template-columns: 1fr auto; gap: 12px 18px; text-align: left;
  margin-top: 18px; font-size: 13.5px; align-items: center; }
.hud-form .sec { grid-column: 1 / -1; font-size: 11px; letter-spacing: .16em; text-transform: uppercase;
  color: var(--mint); margin-top: 8px; }
.hud-form label { opacity: .85; }
.hud-form small { display: block; opacity: .5; font-size: 11.5px; margin-top: 1px; }
.hud-form input[type=range] { pointer-events: auto; width: 170px; accent-color: #8fe6bb; vertical-align: middle; }
.hud-form input[type=checkbox] { pointer-events: auto; width: 18px; height: 18px; accent-color: #8fe6bb; justify-self: end; }
.hud-form .val { font-variant-numeric: tabular-nums; opacity: .7; font-size: 12px; margin-left: 8px;
  display: inline-block; min-width: 3.2em; text-align: right; }
.hud-seg { display: inline-flex; border: 1px solid var(--edge); border-radius: 9px; overflow: hidden; justify-self: end; }
.hud-seg button { pointer-events: auto; cursor: pointer; font: inherit; font-size: 12px; color: #dfe8e6;
  background: transparent; border: 0; padding: 6px 11px; }
.hud-seg button + button { border-left: 1px solid var(--edge); }
.hud-seg button.on { background: var(--mint); color: #10201a; font-weight: 600; }

/* Driving-position tuner: docked, no veil, so the view it changes stays visible. */
.hud-seat {
  position: absolute; left: 18px; bottom: 18px; width: min(340px, calc(100vw - 36px));
  pointer-events: auto; padding: 16px 18px 14px;
  background: rgba(16,21,24,0.86);
}
.hud-seat[hidden] { display: none; }
.hud.tuning .hud-keys, .hud.tuning .hud-prompt { visibility: hidden; }
.hud-seat h3 { margin: 0 0 2px; font-size: 16px; font-weight: 600; }
.hud-seat p { margin: 0 0 12px; font-size: 12.5px; line-height: 1.45; opacity: .66; }
.hud-seat .row { display: grid; grid-template-columns: 1fr auto; gap: 2px 10px; margin-bottom: 10px; }
.hud-seat label { font-size: 13px; opacity: .88; }
.hud-seat output { font-size: 12px; font-variant-numeric: tabular-nums; opacity: .7; text-align: right; }
.hud-seat input[type=range] { grid-column: 1 / -1; width: 100%; accent-color: #8fe6bb; margin: 2px 0 0; }
.hud-seat .hud-actions { justify-content: flex-start; margin-top: 12px; }
.hud-seat .hud-actions .hud-btn { font-size: 12.5px; padding: 8px 14px; }

/* Overhead parking review (GOAL Part C): docked results card, no veil, so the
 * top-down flight/overlay stays visible behind it — same principle as
 * .hud-seat above. Right-docked >= 900px, bottom sheet below that (C.8). */
.hud-review-card {
  position: absolute; right: 24px; top: 24px; width: 380px;
  pointer-events: auto; padding: 20px 22px; overflow-y: auto; overscroll-behavior: contain;
  max-height: calc(100vh - 48px); text-align: left;
}
.hud-review-card[hidden] { display: none; }
.hud-review-card .tag { color: var(--mint); font-size: 12px; letter-spacing: .18em;
  text-transform: uppercase; margin-bottom: 8px; }
.hud-review-card .tag.fail { color: var(--amber); }
.hud-review-card h2 { margin: 0 0 8px; font-size: 21px; font-weight: 650; }
.hud-review-card .hud-stars { margin: 2px 0 10px; }
.hud-review-card p { margin: 0 0 8px; font-size: 13.5px; line-height: 1.5; opacity: .8; }
.hud-review-card .stop-sentence { font-size: 13px; line-height: 1.5; opacity: .9;
  background: rgba(255,255,255,.04); border: 1px solid var(--edge); border-radius: 10px;
  padding: 10px 12px; margin: 10px 0; }
.hud-review-card .hud-actions { justify-content: flex-start; margin-top: 14px; }
.hud-review-pill {
  position: absolute; top: 18px; right: 18px; pointer-events: auto;
}
.hud-review-pill[hidden] { display: none; }
.hud-review {
  position: absolute; inset: 0; pointer-events: none;
}
.hud-review[hidden] { display: none; }
.hud-review-label {
  position: absolute; transform: translate(-50%, -50%); pointer-events: none;
  background: rgba(16,21,24,0.82); border: 1px solid var(--edge); border-radius: 999px;
  padding: 3px 9px; font-size: 12.5px; font-variant-numeric: tabular-nums;
  color: #eef3f2; white-space: nowrap;
}
/* Retention pass (design/SPEC-retention.md, prototypes in design/retention/). */
.hud-btn kbd { font: inherit; font-size: 10.5px; margin-left: 7px; padding: 1px 5px;
  border-radius: 5px; border: 1px solid currentColor; opacity: .7; }
.hud-stars-row { display: flex; align-items: center; gap: 10px; margin: 2px 0 6px; }
.hud-stars-row .hud-stars, .hud-review-card .hud-stars-row .hud-stars { margin: 0; }
.hud-medal { font-size: 10.5px; font-weight: 700; letter-spacing: .16em; padding: 3px 8px;
  border-radius: 6px; line-height: 1.2; }
.hud-medal.gold { color: #1d1606; background: var(--gold); }
.hud-medal.platinum { color: #0f1a1f; background: var(--plat); box-shadow: 0 0 0 1px rgba(255,255,255,.5) inset; }
.hud-delta { font-size: 13px; opacity: .85; margin-bottom: 4px; font-variant-numeric: tabular-nums; }
.hud-delta b { font-weight: 650; }
.hud-delta.up b { color: var(--mint); }
.hud-delta.down b { color: var(--amber); }
.hud-break.v2 { grid-template-columns: auto 1fr auto auto; gap: 7px 12px; font-size: 13px; }
.hud-break.v2 .d { opacity: .7; }
.hud-break.v2 .p { text-align: right; opacity: .85; }
.hud-break.v2 .l { text-align: right; color: var(--red); min-width: 2.4em; }
.hud-break.v2 .big { color: var(--amber); font-weight: 600; opacity: 1; }
.hud-break.v2 .hr { grid-column: 1 / -1; height: 1px; background: var(--edge); margin-top: 2px; }
.hud-break.v2 .tot { border-top: 0; padding-top: 0; margin-top: 0; }
.hud-break.v2 .tot.lab { grid-column: span 2; }
.hud-break.v2 .tot.val { grid-column: span 2; text-align: right; }
.hud-fix { font-size: 13px; line-height: 1.5; margin: 12px 0 6px; padding: 10px 12px;
  border-radius: 10px; border: 1px solid rgba(232,201,138,.4); background: rgba(232,201,138,.07); }
.hud-fix b { color: var(--amber); font-weight: 600; }
.hud-fix.clean { border-color: rgba(143,230,187,.4); background: rgba(143,230,187,.06); }
.hud-fix.clean b { color: var(--mint); }
.hud-next { font-size: 13px; margin: 6px 0 2px; color: var(--mint); }
.hud-next b { font-weight: 650; }
.hud-summary { font-size: 13px; opacity: .8; margin: -4px 0 10px; font-variant-numeric: tabular-nums; }
.hud-summary b { color: #fff; font-weight: 600; }
.hud-daily { pointer-events: auto; cursor: pointer; font: inherit; color: inherit; width: 100%;
  display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; text-align: left; margin: 0 0 4px;
  padding: 11px 14px; border-radius: 12px; border: 1px solid rgba(143,230,187,.45);
  background: rgba(143,230,187,.06); }
.hud-daily:hover { background: rgba(143,230,187,.11); }
.hud-daily:focus-visible { outline: 2px solid var(--mint); outline-offset: 2px; }
.hud-daily .k { font-size: 11px; letter-spacing: .16em; text-transform: uppercase; color: var(--mint); }
.hud-daily .t { font-size: 14px; font-weight: 600; }
.hud-daily .m { font-size: 12.5px; opacity: .7; margin-left: auto; }
.hud-soon { font-size: 11px; opacity: .5; text-align: right; margin-bottom: 8px; }
.hud-lv .b { flex-wrap: wrap; gap: 2px 8px; }
.hud-lv .b .stars { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.hud-lv .b .best { font-size: 12px; opacity: .8; white-space: nowrap; font-variant-numeric: tabular-nums; }
.hud-lv .goal { font-size: 12px; color: var(--mint); margin-top: 2px; line-height: 1.35; }
.hud-lv .goal.none { color: inherit; opacity: .4; }
.hud-lv .hud-medal { font-size: 9px; padding: 2px 5px; letter-spacing: .12em; }
.hud-panel p.hud-dailyline { font-size: 12px; opacity: .6; margin-top: 12px; }

@media (max-width: 899px) {
  .hud-review-card {
    left: 16px; right: 16px; top: auto; bottom: 0; width: auto;
    max-height: 48vh; border-radius: 20px 20px 0 0;
  }
}

@media (max-width: 720px) {
  .hud-tl { max-width: calc(100vw - 36px); }
  .hud-tr { top: auto; bottom: 90px; }
  .hud-keys { display: none; }
  .hud-panel { padding: 22px 18px; }
  .hud-form { grid-template-columns: 1fr; }
  .hud-form input[type=checkbox], .hud-seg { justify-self: start; }
}
`;

/**
 * The "How to play" table and the in-play legend are both generated from the
 * live bindings, so a remap shows up in them immediately. Each row names the
 * actions it describes; `caps()` turns those into keycaps.
 */
const CONTROL_ROWS = [
  [['throttle'], 'Throttle (in the selected gear)'],
  [['brake'], 'Brake'],
  [['steerLeft', 'steerRight'], 'Steer — the wheel turns 720° lock to lock'],
  [['handbrake'], 'Handbrake'],
  [['gearD', 'gearR', 'gearN', 'gearP'], 'Drive · Reverse · Neutral · Park'],
  [[], 'Look back over your shoulder', 'Right mouse'],
  [['leanLeft', 'leanRight'], 'Lean out of the driver / passenger window'],
  [['cameraMode'], 'Switch between the seat and the chase camera'],
  [['toggleAudioMode'], 'Switch soundscape'],
  [['restart'], 'Restart level'],
  [['pause'], 'Pause'],
];

/** Keycap markup for the first binding of each action. */
function caps(actionIds, bindings) {
  return actionIds
    .map((id) => `<kbd>${keyLabel(codesFor(id, bindings)[0])}</kbd>`)
    .join(' ');
}

const STYLE_LABEL = { open: 'Open deck', underground: 'Underground', rooftop: 'Rooftop' };

function el(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}

/**
 * @param {object}   o
 * @param {Element}  o.container
 * @param {object}   o.actions   callbacks into Game: continueGame, startTutorial,
 *                               skipTutorial, playLevel(i), restart, next, resume,
 *                               quitToMenu, toggleAudio, pause, resetProgress
 * @param {Function} o.getLevels () => [{ index, name, subtitle, style, timeLimit, best }]
 * @param {object}   o.settings  settings.js instance
 */
export function createHud({ container, actions, getLevels, settings, input }) {
  const style = el('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const root = el('div', 'hud');
  container.appendChild(root);

  // --- top left: level / tutorial card ---------------------------------------
  const tl = el('div', 'hud-tl hud-card');
  const levelTag = el('div', 'hud-level', '');
  const levelName = el('div', 'hud-name', '—');
  const hint = el('div', 'hud-hint', '');
  const stats = el('div', 'hud-stats');
  const timeEl = el('span', null, 'Time <b>0.0s</b>');
  const bumpEl = el('span', null, 'Bumps <b>0</b>');
  stats.append(timeEl, bumpEl);
  const dots = el('div', 'hud-dots');
  dots.hidden = true;
  // Route distance chip — Level 13 only (SPEC-level13.md §5.9); every other
  // level never calls setRouteDistance, so this stays hidden.
  const routeEl = el('div', 'hud-hint', '');
  routeEl.hidden = true;
  tl.append(levelTag, levelName, hint, routeEl, stats, dots);
  root.appendChild(tl);

  // --- top right: toggles -----------------------------------------------------
  const tr = el('div', 'hud-tr');
  const audioBtn = el('button', 'hud-btn', 'Sound: Engine');
  audioBtn.addEventListener('click', () => actions.toggleAudio?.());
  const skipBtn = el('button', 'hud-btn', 'Skip tutorial');
  skipBtn.hidden = true;
  skipBtn.addEventListener('click', () => actions.skipTutorial?.());
  const restartBtn = el('button', 'hud-btn', 'Restart');
  restartBtn.addEventListener('click', () => actions.restart?.());
  const menuBtn = el('button', 'hud-btn', 'Menu');
  menuBtn.addEventListener('click', () => actions.pause?.());
  tr.append(audioBtn, skipBtn, restartBtn, menuBtn);
  root.appendChild(tr);
  // In-play buttons must not keep keyboard focus: Space would re-click the last
  // one instead of pulling the handbrake.
  for (const b of [audioBtn, skipBtn, restartBtn, menuBtn]) b.addEventListener('click', () => b.blur());

  // --- bottom centre: live prompt + key legend -------------------------------
  const bc = el('div', 'hud-bc');
  const prompt = el('div', 'hud-prompt', '');
  prompt.setAttribute('aria-live', 'polite');
  const keys = el('div', 'hud-keys');
  /** Rebuilt whenever the player rebinds something. */
  function drawKeyLegend() {
    const b = settings.get('bindings');
    const cap = (id) => `<kbd>${keyLabel(codesFor(id, b)[0])}</kbd>`;
    keys.innerHTML = [
      `<span>${cap('throttle')}${cap('steerLeft')}${cap('brake')}${cap('steerRight')}drive</span>`,
      `<span>${cap('gearD')}/${cap('gearR')}/${cap('gearP')}gear</span>`,
      `<span>${cap('handbrake')}handbrake</span>`,
      '<span><kbd>RMB</kbd>look back</span>',
      `<span>${cap('leanLeft')}${cap('leanRight')}lean</span>`,
    ].join('');
  }
  drawKeyLegend();
  bc.append(prompt, keys);
  root.appendChild(bc);

  // --- chase-camera telemetry pill -------------------------------------------
  const telemetry = createTelemetryHud(root);

  // --- radar overlay mount (F2, when the player puts it on screen) -----------
  const radarSlot = el('div', 'hud-radar');
  radarSlot.hidden = true;
  root.appendChild(radarSlot);

  /**
   * Apply every HUD customisation switch. Called on load and on any settings
   * change, so the panel's controls take effect live with the panel still open.
   */
  /** Mount (or unmount) the radar canvas in the on-screen slot. */
  /** Level currently loaded, so the pause menu opens that level's board. */
  let currentLevelId = 1;
  let radarCanvas = null;
  function setRadarCanvas(canvas) {
    if (canvas === radarCanvas) return;
    radarCanvas = canvas;
    radarSlot.innerHTML = '';
    if (canvas) radarSlot.append(canvas);
  }

  function applyHudSettings() {
    const s = settings.all();
    tl.hidden = !s.hudLevelCard;
    tr.hidden = !s.hudToggles;
    prompt.hidden = !s.hudPrompt;
    keys.hidden = !s.hudKeyLegend;
    radarSlot.hidden = !(s.hudRadar && s.hudRadarPlace === 'overlay');
    root.style.setProperty('--hud-opacity', String(s.hudOpacity));
    root.style.setProperty('--hud-scale', String(s.hudScale));
  }
  applyHudSettings();
  settings.onChange((changed) => {
    if ('bindings' in changed) drawKeyLegend();
    applyHudSettings();
  });

  // --- driving-position tuner (docked card, see showSeatTuner) -----------------
  const seatCard = el('div', 'hud-seat hud-card');
  seatCard.hidden = true;
  root.appendChild(seatCard);

  // --- overhead parking review: label layer, docked results card, hide pill ---
  const reviewLabels = el('div', 'hud-review');
  reviewLabels.hidden = true;
  root.appendChild(reviewLabels);
  const reviewCard = el('div', 'hud-review-card hud-card');
  reviewCard.hidden = true;
  reviewCard.setAttribute('role', 'dialog');
  reviewCard.setAttribute('aria-label', 'Parking results');
  root.appendChild(reviewCard);
  const reviewPill = el('button', 'hud-btn hud-review-pill', 'Show results (H)');
  reviewPill.hidden = true;
  reviewPill.addEventListener('click', () => setReviewCardVisible(true));
  root.appendChild(reviewPill);

  // --- full-screen veil (every menu) -----------------------------------------
  const veil = el('div', 'hud-veil');
  const panel = el('div', 'hud-panel');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  veil.appendChild(panel);
  root.appendChild(veil);

  let currentLimit = null;
  let currentLevelIndex = 0;
  let onEscape = null;
  let onSeatEscape = null;

  function showPanel(build, { wide = false, escape = null } = {}) {
    panel.innerHTML = '';
    panel.className = `hud-panel${wide ? ' wide' : ''}`;
    build(panel);
    veil.hidden = false;
    onEscape = escape;
    panel.scrollTop = 0;
    const heading = panel.querySelector('h1, h2');
    if (heading) {
      heading.id ||= 'hud-panel-title';
      panel.setAttribute('aria-labelledby', heading.id);
    }
    // Keyboard players land on the main action, so Enter starts/continues.
    // Not on touch screens, where focusing would pop an on-screen keyboard.
    if (!window.matchMedia?.('(pointer: coarse)').matches) {
      panel.querySelector('.hud-btn.is-on')?.focus({ preventScroll: true });
    }
  }
  function hidePanel() {
    veil.hidden = true;
    onEscape = null;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }

  // Esc inside a menu goes "back" (or resumes from pause). The game's own Esc
  // handling lives in Input, which is disabled while a panel is open.
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && !seatCard.hidden && onSeatEscape) {
      e.preventDefault();
      onSeatEscape();
      return;
    }
    // Level select opened FROM the review card puts the veil on top of it
    // (C.8: "Back returns to the review card, the review stays active
    // underneath") — the veil's own Escape handling must win while it's open.
    if (!veil.hidden && onEscape) {
      if (e.code === 'Escape') {
        e.preventDefault();
        onEscape();
      }
      return;
    }
    // Any open results/fail card takes keys — not only while the review is
    // flying. City Drive never runs the review, and its cards used to ignore
    // the keyboard entirely because this checked `review.active`.
    if (cardOpen) {
      reviewKeyboard(e);
      return;
    }
  });

  function buttons(defs) {
    const wrap = el('div', 'hud-actions');
    for (const [label, fn, kind] of defs) {
      const cls = kind === 'primary' ? ' is-on' : kind === 'danger' ? ' is-danger' : '';
      const b = el('button', `hud-btn${cls}`, label);
      b.addEventListener('click', fn);
      wrap.appendChild(b);
    }
    return wrap;
  }

  // --- panels -------------------------------------------------------------------
  function showStart() {
    const done = settings.get('tutorialDone');
    showPanel((p) => {
      p.append(
        el('div', 'tag', 'Multi-storey'),
        el('h1', null, 'Parking Precision'),
        el(
          'p',
          null,
          'Sixteen lots, from the open deck down to the basement and up to the roof at dusk, and then a drive across town. Park inside the glowing bay, straighten up, and shift to P.'
        )
      );
      const defs = done
        ? [
            ['Start driving', () => actions.continueGame?.(), 'primary'],
            ["Today's daily", () => actions.playDaily?.()],
            ['Level select', () => showLevelSelect(showStart)],
            ['Tutorial', () => actions.startTutorial?.()],
          ]
        : [
            ['Start the tutorial', () => actions.startTutorial?.(), 'primary'],
            // Skipping is a choice: record it, so the offer isn't repeated
            // on every launch.
            ['Skip to level 1', () => actions.skipTutorial?.()],
          ];
      // A phone or tablet with no keyboard can open every menu but never move
      // the car. Say so before they try, and offer the link for later.
      if (window.matchMedia?.('(hover: none) and (pointer: coarse)').matches) {
        const note = el('p', 'hud-touch', 'This game is driven with a keyboard, so it plays on a computer. On a tablet with a keyboard attached, go ahead.');
        const shareBtn = el('button', 'hud-btn', 'Send me the link');
        shareBtn.addEventListener('click', async () => {
          if ((await share({})) === 'copied') shareBtn.textContent = 'Link copied';
        });
        p.append(note, shareBtn);
      }
      p.append(
        buttons(defs),
        buttons([
          ['Settings', () => showSettings(showStart)],
          ['Controls', () => showControls(showStart)],
          // Viewable without playing a single run.
          ['Leaderboard', () => showBoard(1, showStart)],
        ])
      );
      // Plain information about today's daily. A cumulative count only —
      // nothing here is a streak, and nothing counts down in seconds.
      const d = done ? actions.getDaily?.() : null;
      if (d) p.append(el('p', 'hud-dailyline', dailyLine(d)));
    });
  }

  function dailyLine(d) {
    const parts = [`Daily #${d.day}: ${d.title}`];
    if (d.bestToday) parts.push(`your best today ${d.bestToday.score}`);
    parts.push(`dailies parked: ${d.parked}`, d.nextText);
    return parts.join(' · ');
  }

  function showControls(back) {
    showPanel(
      (p) => {
        p.append(el('h2', null, 'Controls'));
        const list = el('div', 'hud-controls');
        {
          const b = settings.get('bindings');
          for (const [ids, d, literal] of CONTROL_ROWS) {
            list.append(el('span', null, literal ?? caps(ids, b)), el('span', null, d));
          }
        }
        p.append(list, buttons([['Back', back, 'primary']]));
      },
      { escape: back }
    );
  }

  function showLevelSelect(back) {
    showPanel(
      (p) => {
        p.append(el('h2', null, 'Level select'));
        const levels = getLevels();
        // Mastery map (design/SPEC-retention.md §5): one summary line, today's
        // daily, then every level with its medal, best and next goal. All
        // levels stay unlocked.
        const n = levels.length;
        const three = levels.filter((l) => l.best?.stars === 3).length;
        const gold = levels.filter((l) => l.best?.medal === 'gold' || l.best?.medal === 'platinum').length;
        const plat = levels.filter((l) => l.best?.medal === 'platinum').length;
        p.append(el('div', 'hud-summary', `★★★ <b>${three}</b>/${n} · Gold <b>${gold}</b>/${n} · Platinum <b>${plat}</b>/${n}`));
        const d = actions.getDaily?.();
        if (d) {
          const strip = el('button', 'hud-daily');
          strip.append(
            el('span', 'k', "Today's daily"),
            el('span', 't', `Daily #${d.day} · ${d.title}`),
            el('span', 'm', d.bestToday ? `your best ${d.bestToday.score}` : `dailies parked: ${d.parked}`)
          );
          strip.addEventListener('click', () => actions.playDaily?.());
          p.append(strip, el('div', 'hud-soon', d.nextText));
        }
        const grid = el('div', 'hud-levels');
        for (const lv of levels) {
          const card = el('button', `hud-lv${lv.index === currentLevelIndex ? ' current' : ''}`);
          const stars = lv.best ? '★'.repeat(lv.best.stars) + '☆'.repeat(3 - lv.best.stars) : '☆☆☆';
          card.append(
            el('span', 'n', `Level ${lv.index + 1}`),
            el('span', 't', lv.name),
            el('span', 's', lv.subtitle + (lv.timeLimit ? ` · ${lv.timeLimit}s limit` : '')),
            el('span', 'chip', STYLE_LABEL[lv.style] ?? lv.style)
          );
          const b = el('span', 'b');
          const starsEl = el('span', `stars${lv.best ? '' : ' none'}`, stars);
          if (lv.best?.medal) starsEl.append(el('span', `hud-medal ${lv.best.medal}`, lv.best.medal.toUpperCase()));
          const bestText =
            lv.best?.score != null
              ? `best ${lv.best.score}${lv.best.timeSec != null ? ` · ${lv.best.timeSec.toFixed(1)} s` : ''}`
              : '';
          b.append(starsEl, el('span', 'best', bestText));
          card.append(b, el('span', `goal${lv.best ? '' : ' none'}`, lv.best ? `→ ${nextGoal(lv.best, lv.id)}` : nextGoal(null, lv.id)));
          card.addEventListener('click', () => actions.playLevel?.(lv.index));
          grid.appendChild(card);
        }
        p.append(grid, buttons([['Back', back]]));
      },
      { wide: true, escape: back }
    );
  }

  function showSettings(back) {
    showPanel(
      (p) => {
        p.append(el('h2', null, 'Settings'));
        const form = el('div', 'hud-form');
        const s = settings.all();
        // Re-render in place so the preset label and the switches stay in sync.
        const redraw = () => {
          const top = panel.scrollTop;
          showSettings(back);
          panel.scrollTop = top;
        };

        const section = (title) => form.append(el('div', 'sec', title));
        const row = (label, note, control) => {
          const l = el('label', null, label);
          if (note) l.append(el('small', null, note));
          form.append(l, control);
        };
        const segmented = (options, value, onPick) => {
          const seg = el('div', 'hud-seg');
          for (const [val, text] of options) {
            const b = el('button', val === value ? 'on' : '', text);
            b.addEventListener('click', () => onPick(val));
            seg.append(b);
          }
          return seg;
        };
        const slider = (key, min, max, step, fmt) => {
          const wrap = el('span');
          const input = el('input');
          Object.assign(input, { type: 'range', min, max, step, value: s[key] });
          const val = el('span', 'val', fmt(s[key]));
          input.addEventListener('input', () => {
            val.textContent = fmt(Number(input.value));
            settings.set(key, Number(input.value));
          });
          wrap.append(input, val);
          return wrap;
        };
        const check = (key) => {
          const input = el('input');
          input.type = 'checkbox';
          input.checked = s[key];
          input.addEventListener('change', () => {
            settings.set(key, input.checked);
            redraw();
          });
          return input;
        };
        const pick = (key) => (v) => {
          settings.set(key, v);
          redraw();
        };

        section('Graphics');
        row(
          'Quality preset',
          s.quality === 'custom' ? 'Custom — individual switches changed' : null,
          segmented(
            [
              ['low', 'Low'],
              ['medium', 'Medium'],
              ['high', 'High'],
            ],
            s.quality,
            (v) => {
              settings.applyPreset(v);
              redraw();
            }
          )
        );
        row('Ambient occlusion', 'Soft contact shadows. The most expensive switch.', check('ao'));
        row('Shadows', null, check('shadows'));
        row(
          'Mirrors',
          'Static shows plain glass and skips the mirror renders.',
          segmented(
            [
              ['live', 'Live'],
              ['static', 'Static'],
            ],
            s.mirrors,
            pick('mirrors')
          )
        );
        row(
          'Resolution',
          'Retina renders at up to 2x on high-density screens.',
          segmented(
            [
              [1, 'Standard'],
              [2, 'Retina'],
            ],
            s.pixelRatio,
            pick('pixelRatio')
          )
        );

        section('View');
        {
          const adjust = el('button', 'hud-btn', 'Adjust…');
          adjust.addEventListener('click', () => showSeatTuner(() => showSettings(back)));
          row('Driving position', 'Seat height, forward/back, left/right and look-down angle, with a live view', adjust);
        }
        row('Field of view', null, slider('fov', 55, 90, 1, (v) => `${v}°`));
        row('Speed FOV', 'Lens widens slightly as speed climbs, for a sense of speed', check('speedFov'));
        row('Look sensitivity', 'Right-mouse look-back', slider('lookSensitivity', 0.3, 2.5, 0.1, (v) => `${v.toFixed(1)}x`));

        section('Car');
        row(
          'Speedometer',
          null,
          segmented(
            [
              ['kmh', 'km/h'],
              ['mph', 'mph'],
            ],
            s.units,
            pick('units')
          )
        );
        row('Parking sensors', 'Beeps, and the proximity arcs on the cluster', check('sensors'));

        section('Display');
        {
          const hudBtn = el('button', 'hud-btn', 'Customise…');
          hudBtn.addEventListener('click', () => showHudPanel(() => showSettings(back)));
          row('HUD', 'Which on-screen elements show, the radar, size and opacity', hudBtn);
          const keysBtn = el('button', 'hud-btn', 'Change…');
          keysBtn.addEventListener('click', () => showRebind(() => showSettings(back)));
          row('Keyboard controls', 'Rebind any key', keysBtn);
        }
        row(
          'Instruments',
          'Track swaps the twin dials for one big rev counter, a digital speed and shift lights',
          segmented(
            [
              ['classic', 'Classic'],
              ['track', 'Track'],
            ],
            s.clusterTheme,
            pick('clusterTheme')
          )
        );
        row(
          'Camera',
          'Chase sits behind the car — easier for judging where the corners are',
          segmented(
            [
              ['seat', "Driver's seat"],
              ['chase', 'Chase'],
            ],
            s.cameraMode,
            pick('cameraMode')
          )
        );

        section('Personal best');
        row('Show my personal best in the review', 'Draws your previous best park over the bay after each park', check('reviewGhost'));
        row(
          'Race my best run',
          'Replays your best run as a see-through car while you drive. Stored on this device only.',
          check('ghostLive')
        );

        section('Leaderboard');
        row(
          'Post my scores automatically',
          'Sends the level, score, time and bumps of each finished run to the public board, under a name generated for you. Turn this off and nothing is sent unless you press Post on the results card.',
          check('leaderboardAutoPost')
        );
        {
          const view = el('button', 'hud-btn', 'View leaderboard');
          view.addEventListener('click', () => showBoard(currentLevelId, () => showSettings(back)));
          row('Public board', 'Scores are unverified — they are worked out in your browser', view);
        }

        section('Sound');
        row('Volume', null, slider('volume', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`));

        section('Legal');
        {
          const legalLinks = el('span');
          const link = (href, text) => {
            const a = el('a', null, text);
            a.href = href;
            a.target = '_blank';
            a.rel = 'noopener';
            a.style.color = 'var(--mint)';
            a.style.marginRight = '16px';
            a.style.fontSize = '13px';
            return a;
          };
          legalLinks.append(link('../privacy.html', 'Privacy Policy'), link('../terms.html', 'Terms of Use'));
          row(
            'Data & terms',
            'No account. Progress and settings stay on this device; only a leaderboard score you choose to post leaves it',
            legalLinks
          );
        }

        p.append(form);

        // Reset progress confirms in place: no browser dialogs in this game.
        p.append(
          buttons([
            [
              'Reset progress',
              (e) => {
                const b = e.currentTarget;
                if (b.dataset.armed) {
                  actions.resetProgress?.();
                  b.textContent = 'Progress cleared';
                  b.disabled = true;
                } else {
                  b.dataset.armed = '1';
                  b.textContent = 'Click again to erase all stars';
                }
              },
              'danger',
            ],
            ['Done', back, 'primary'],
          ])
        );
      },
      { escape: back }
    );
  }

  /**
   * The seat tuner. It closes the veil and docks a small card in the corner so
   * the player sees the view move as they drag. The reversing screen is lit
   * for the duration, since "can I see the camera" is half of why they came.
   * The game stays in whatever non-driving state it was in (menu or paused),
   * so keys never drive the car while tuning.
   */
  /**
   * HUD customisation (F3). Every control applies live, with the panel still
   * open, because the whole point is seeing what you are turning off.
   */
  function showHudPanel(back) {
    showPanel(
      (p) => {
        p.append(el('h2', null, 'HUD'));
        p.append(el('p', null, 'These change the on-screen overlay only. The instrument binnacle is a real dial pack in the dashboard — it has its own setting under Display.'));
        const form = el('div', 'hud-form');
        const s = settings.all();
        const redraw = () => {
          const top = panel.scrollTop;
          showHudPanel(back);
          panel.scrollTop = top;
        };
        const row = (label, note, control) => {
          const l = el('label', null, label);
          if (note) l.append(el('small', null, note));
          form.append(l, control);
        };
        const check = (key) => {
          const input = el('input');
          input.type = 'checkbox';
          input.checked = s[key];
          input.addEventListener('change', () => {
            settings.set(key, input.checked);
            redraw();
          });
          return input;
        };
        const slider = (key, min, max, step, fmt) => {
          const wrap = el('span');
          const input = el('input');
          Object.assign(input, { type: 'range', min, max, step, value: s[key] });
          const val = el('span', 'val', fmt(s[key]));
          input.addEventListener('input', () => {
            val.textContent = fmt(Number(input.value));
            settings.set(key, Number(input.value));
          });
          wrap.append(input, val);
          return wrap;
        };
        const segmented = (options, value, onPick) => {
          const seg = el('div', 'hud-seg');
          for (const [val, text] of options) {
            const b = el('button', val === value ? 'on' : '', text);
            b.addEventListener('click', () => onPick(val));
            seg.append(b);
          }
          return seg;
        };

        form.append(el('div', 'sec', 'Preset'));
        row(
          'Layout',
          s.hudPreset === 'custom' ? 'Custom — individual elements changed' : null,
          segmented(
            [
              ['full', 'Full'],
              ['minimal', 'Minimal'],
              ['clean', 'Clean'],
            ],
            s.hudPreset,
            (v) => {
              settings.applyHudPreset(v);
              redraw();
            }
          )
        );

        form.append(el('div', 'sec', 'Elements'));
        row('Level card', 'Top left: level name, hint, time and bumps', check('hudLevelCard'));
        row('Prompt', 'Bottom centre: what to do next', check('hudPrompt'));
        row('Key legend', 'Bottom centre: the driving keys', check('hudKeyLegend'));
        row('Buttons', 'Top right: sound, restart, menu', check('hudToggles'));

        form.append(el('div', 'sec', 'Telemetry'));
        row(
          'Gear, speed and revs',
          'A compact readout for the chase camera, where the dashboard is behind you',
          segmented(
            [
              ['auto', 'In chase'],
              ['always', 'Always'],
              ['off', 'Off'],
            ],
            s.hudTelemetry,
            (v) => {
              settings.set('hudTelemetry', v);
              redraw();
            }
          )
        );

        form.append(el('div', 'sec', 'Radar'));
        row('Proximity radar', 'Top-down view of what is close to the car', check('hudRadar'));
        row(
          'Radar position',
          'On the dash screen it gives way to the reverse camera in R. On screen it is always visible.',
          segmented(
            [
              ['screen', 'Dash screen'],
              ['overlay', 'On screen'],
            ],
            s.hudRadarPlace,
            (v) => {
              settings.set('hudRadarPlace', v);
              redraw();
            }
          )
        );

        form.append(el('div', 'sec', 'Size'));
        row('Scale', null, slider('hudScale', 0.8, 1.4, 0.05, (v) => `${Math.round(v * 100)}%`));
        row('Opacity', null, slider('hudOpacity', 0.35, 1, 0.05, (v) => `${Math.round(v * 100)}%`));

        p.append(form);
        const reset = el('button', 'hud-btn', 'Reset HUD');
        reset.addEventListener('click', () => {
          settings.resetHud();
          redraw();
        });
        const backBtn = el('button', 'hud-btn primary', 'Back');
        backBtn.addEventListener('click', back);
        const bar = el('div', 'hud-actions');
        bar.append(reset, backBtn);
        p.append(bar);
      },
      { wide: true, escape: back }
    );
  }

  /**
   * Key rebinding (F6). Capture runs through Input.captureKey, which suppresses
   * the press so the car does not also react to it, and refuses modifier-only
   * keys. Escape cancels a capture rather than binding itself.
   */
  function showRebind(back) {
    let cancelCapture = null;
    const stop = () => {
      cancelCapture?.();
      cancelCapture = null;
    };
    showPanel(
      (p) => {
        p.append(el('h2', null, 'Keyboard controls'));
        p.append(el('p', null, 'Click a key to change it. Escape cancels. Escape always opens the menu, whatever else you bind it to.'));
        const bindings = settings.get('bindings');
        const list = el('div', 'hud-rebind');
        let lastCategory = null;
        for (const a of ACTIONS) {
          if (a.category !== lastCategory) {
            // .sec spans both columns; an extra spacer cell would shift every
            // following row by one and put the keycaps under the labels.
            list.append(el('div', 'sec', a.category));
            lastCategory = a.category;
          }
          const caps = el('span');
          const codes = codesFor(a.id, bindings);
          codes.forEach((code, slot) => {
            const b = el('button', 'hud-key', keyLabel(code));
            const clash = conflictsFor(code, bindings, a.id);
            if (clash.length) {
              b.classList.add('clash');
              b.title = `Also bound to ${clash.join(', ')}`;
            }
            b.addEventListener('click', () => {
              b.textContent = 'Press a key…';
              b.classList.add('capturing');
              stop();
              cancelCapture = input.captureKey((code2) => {
                cancelCapture = null;
                if (code2 !== 'Escape') {
                  const next = { ...settings.get('bindings') };
                  const cur = [...codesFor(a.id, next)];
                  cur[slot] = code2;
                  next[a.id] = [...new Set(cur)];
                  settings.set('bindings', next);
                }
                showRebind(back);
              });
            });
            caps.append(b);
          });
          list.append(el('span', null, a.label), caps);
        }
        p.append(list);

        const reset = el('button', 'hud-btn', 'Reset to defaults');
        reset.addEventListener('click', () => {
          settings.resetBindings();
          showRebind(back);
        });
        const backBtn = el('button', 'hud-btn primary', 'Back');
        backBtn.addEventListener('click', () => {
          stop();
          back();
        });
        const bar = el('div', 'hud-actions');
        bar.append(reset, backBtn);
        p.append(bar);
      },
      {
        wide: true,
        escape: () => {
          stop();
          back();
        },
      }
    );
  }

  /**
   * The public board for one level. Read-only, and it says plainly that the
   * scores are unverified — a board that implies it has checked something it
   * has not is worse than one that admits it.
   */
  async function showBoard(levelId, back) {
    const me = getHandle();
    showPanel(
      (p) => {
        p.append(el('h2', null, 'Leaderboard'));
        // By id, not by position: ids are stable and no longer match play order.
        const levels = getLevels();
        const here = levels.find((l) => l.id === levelId);
        const name = here?.name ?? `Level ${levelId}`;
        p.append(el('p', null, `${name} — best run per player, highest score first, ties broken by time.`));

        // Step through the boards without leaving the panel.
        if (levels.length > 1) {
          const nav = el('div', 'hud-board-nav');
          const at = here ? levels.indexOf(here) : 0;
          const step = (delta) => {
            const next = levels[(at + delta + levels.length) % levels.length];
            showBoard(next.id, back);
          };
          const prev = el('button', 'hud-btn', '‹ Previous level');
          prev.addEventListener('click', () => step(-1));
          const next = el('button', 'hud-btn', 'Next level ›');
          next.addEventListener('click', () => step(1));
          nav.append(prev, el('span', null, `Level ${at + 1} of ${levels.length}`), next);
          p.append(nav);
        }
        const host = el('div', 'hud-board', '<p style="opacity:.6">Loading…</p>');
        p.append(host);
        p.append(
          el(
            'div',
            'hud-note',
            'Scores are worked out in your own browser, so this board is <b>unverified</b>: treat it as a bit of fun, not a record. Names are generated for you — nothing you type, and no account.'
          )
        );
        const bar = el('div', 'hud-actions');
        const backBtn = el('button', 'hud-btn is-on', 'Back');
        backBtn.addEventListener('click', back);
        bar.append(backBtn);
        p.append(bar);

        fetchBoard(levelId).then((entries) => {
          if (!entries) {
            host.innerHTML = '<p style="opacity:.6">The leaderboard is unavailable right now. The game works fine without it.</p>';
            return;
          }
          if (!entries.length) {
            host.innerHTML = '<p style="opacity:.6">Nobody has posted a run on this level yet.</p>';
            return;
          }
          const rows = entries
            .map(
              (e) =>
                `<tr class="${e.handle === me ? 'me' : ''}"><td class="num">${e.rank}</td><td>${e.handle}</td><td class="num">${e.score}</td><td class="num">${e.timeSec.toFixed(1)}s</td><td class="num">${e.bumps}</td></tr>`
            )
            .join('');
          host.innerHTML = `<table><thead><tr><th class="num">#</th><th>Player</th><th class="num">Score</th><th class="num">Time</th><th class="num">Bumps</th></tr></thead><tbody>${rows}</tbody></table>`;
        });
      },
      { wide: true, escape: back }
    );
  }

  function showSeatTuner(back) {
    hidePanel();
    actions.previewScreen?.(true);
    const s = settings.all();
    seatCard.innerHTML = '';
    seatCard.append(
      el('h3', null, 'Driving position'),
      el('p', null, 'Move the camera until you can see over the bonnet and read the dash screen. Esc when done.')
    );

    const cm = (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)} cm`;
    const deg = (v) => `${v > 0 ? '+' : ''}${Math.round(v)}°`;
    const defs = [
      ['seatY', 'Seat height', 'Higher sees more of the ground ahead', SEAT_ADJUST.y, 0.01, cm],
      ['seatZ', 'Forward / back', 'Negative moves toward the wheel', SEAT_ADJUST.z, 0.01, cm],
      ['seatX', 'Left / right', 'Negative moves toward your door', SEAT_ADJUST.x, 0.01, cm],
      ['tilt', 'Look down', 'Resting angle; negative looks down', SEAT_ADJUST.tiltDeg, 1, deg],
    ];
    const inputs = [];
    for (const [key, label, title, [min, max], step, fmt] of defs) {
      const wrap = el('div', 'row');
      const id = `seat-${key}`;
      const l = el('label', null, label);
      l.htmlFor = id;
      l.title = title;
      const out = el('output', null, fmt(s[key]));
      const input = el('input');
      Object.assign(input, { type: 'range', id, min, max, step, value: s[key] });
      input.setAttribute('aria-label', `${label}: ${title}`);
      input.addEventListener('input', () => {
        settings.set(key, Number(input.value));
        out.textContent = fmt(Number(input.value));
      });
      wrap.append(l, out, input);
      seatCard.append(wrap);
      inputs.push({ key, input, out, fmt });
    }

    const done = () => {
      seatCard.hidden = true;
      root.classList.remove('tuning');
      onSeatEscape = null;
      actions.previewScreen?.(false);
      back();
    };
    const acts = buttons([
      [
        'Reset to default',
        () => {
          settings.resetSeat();
          const now = settings.all();
          for (const { key, input, out, fmt } of inputs) {
            input.value = now[key];
            out.textContent = fmt(now[key]);
          }
        },
      ],
      ['Done', done, 'primary'],
    ]);
    seatCard.append(acts);
    onSeatEscape = done;
    seatCard.hidden = false;
    root.classList.add('tuning');
  }

  function showPause({ tutorial = false } = {}) {
    const self = () => showPause({ tutorial });
    showPanel(
      (p) => {
        p.append(
          el('div', 'tag', tutorial ? 'Tutorial' : `Level ${currentLevelIndex + 1}`),
          el('h2', null, 'Paused')
        );
        p.append(
          buttons([
            ['Resume', () => actions.resume?.(), 'primary'],
            tutorial ? ['Skip tutorial', () => actions.skipTutorial?.()] : ['Restart level', () => actions.restart?.()],
            ['Level select', () => showLevelSelect(self)],
          ]),
          buttons([
            ['Settings', () => showSettings(self)],
            ['Controls', () => showControls(self)],
            ['Leaderboard', () => showBoard(currentLevelId, self)],
            ['Main menu', () => actions.quitToMenu?.()],
          ]),
          buttons([['Leave to Sundown Club', () => actions.leave?.()]]),
          el('p', 'hud-leave-hint', 'Press Esc again to save and leave to Sundown Club.')
        );
      },
      // First Escape paused the game (this menu); a second one leaves.
      { escape: () => actions.leave?.() }
    );
  }

  // --- overhead review results card (GOAL Part C §8) --------------------------
  // Docked, no veil — same precedent as showSeatTuner above — so the flight
  // and overlay behind it stay visible. `currentReview` is the ParkingReview
  // instance Game.js is driving; keyboard/buttons call straight into it.
  let currentReview = null;
  let reviewCardHidden = false;
  /** A results or fail card is up (with or without a review behind it). */
  let cardOpen = false;

  function setReviewCardVisible(visible) {
    reviewCardHidden = !visible;
    reviewCard.hidden = !visible;
    reviewPill.hidden = visible;
  }

  /**
   * Card keys. The retry action (`restart`, B by default, rebindable) and
   * Enter act from the card's first frame, flight or not: the card is on
   * screen at once, so making the player wait out the 2 s flight only taught
   * them that the keys were broken. H/V/Esc during the flight just end it.
   *
   * R keeps its old card meaning, but only once the flight has settled: R is
   * Reverse while driving, and a Reverse press that lands as a timed level
   * runs out must not throw the fail card away unread.
   */
  function reviewKeyboard(e) {
    if (!currentReview || e.repeat) return;
    if (codesFor('restart', settings.get('bindings')).includes(e.code)) {
      e.preventDefault();
      actions.restart?.();
      return;
    }
    if (e.code === 'Enter') {
      e.preventDefault();
      if (reviewOnNext) actions.next?.();
      else actions.restart?.();
      return;
    }
    // City Drive has no review at all (phase null): treat it as settled.
    const settled = currentReview.phase === 'shown' || currentReview.phase == null;
    if (!settled) {
      if (e.code === 'KeyH' || e.code === 'KeyV' || e.code === 'Escape') {
        e.preventDefault();
        currentReview.skip();
      }
      return;
    }
    if (e.code === 'KeyV') {
      currentReview.toggleDrone();
      return;
    }
    if (e.code === 'KeyH') {
      e.preventDefault();
      setReviewCardVisible(reviewCardHidden);
    } else if (e.code === 'KeyR') {
      e.preventDefault();
      actions.restart?.();
    } else if (e.code === 'Escape' && reviewCardHidden) {
      e.preventDefault();
      setReviewCardVisible(true);
    }
  }
  let reviewOnNext = false;

  function showReviewResults(r, review) {
    currentReview = review;
    cardOpen = true;
    reviewOnNext = Boolean(r.hasNext);
    reviewCard.innerHTML = '';
    const tag = r.daily ? `Daily #${r.daily.day}` : r.isBest ? 'New personal best' : 'Parked';
    const starsRow = el('div', 'hud-stars-row');
    starsRow.append(el('span', 'hud-stars', '★'.repeat(r.stars) + '☆'.repeat(3 - r.stars)));
    if (r.medal) starsRow.append(el('span', `hud-medal ${r.medal}`, r.medal.toUpperCase()));
    reviewCard.append(el('div', 'tag', tag), el('h2', null, r.daily ? r.daily.title : r.levelName), starsRow);

    // Personal-best delta: this run against the best BEFORE it.
    if (r.prevScore === null) {
      reviewCard.append(el('div', 'hud-delta', r.daily ? 'First park of this daily' : 'First park on this level'));
    } else if (r.prevScore != null) {
      const d = r.score - r.prevScore;
      const whose = r.daily ? 'your best today' : 'your best';
      reviewCard.append(
        d === 0
          ? el('div', 'hud-delta', `Equal to ${whose} (${r.prevScore})`)
          : el('div', `hud-delta ${d > 0 ? 'up' : 'down'}`, `<b>${d > 0 ? '+' : '−'}${Math.abs(d)}</b> on ${whose} (${r.prevScore})`)
      );
    }

    // Where the points went (Retention.explain): points earned and lost per
    // part, the biggest loss highlighted, one fix worth an exact number.
    const grid = el('div', 'hud-break v2');
    for (const row of r.explain.rows) {
      const big = row.big ? ' big' : '';
      grid.append(
        el('span', big.trim() || null, row.label),
        el('span', `d${big}`, row.detail),
        el('span', `p${big}`, `${row.earned} / ${row.max}`),
        el('span', `l${big}`, row.lost > 0 ? `−${row.lost}` : '')
      );
    }
    grid.append(el('span', 'hr'), el('span', 'tot lab', 'Score'), el('span', 'tot val', `${r.score} / 100`));
    reviewCard.append(grid);
    const fix = el('div', `hud-fix${r.explain.fix.clean ? ' clean' : ''}`);
    fix.append(el('b', null, r.explain.fix.lead), document.createTextNode(` ${r.explain.fix.text}`));
    reviewCard.append(fix);
    if (r.next) {
      const next = el('div', 'hud-next');
      next.append(el('b', null, r.next.lead));
      if (r.next.text) next.append(document.createTextNode(` ${r.next.text}`));
      reviewCard.append(next);
    }
    const stop = r.stopSentence ?? review.describeStop();
    if (stop) reviewCard.append(el('div', 'stop-sentence', `Where you stopped: ${stop}`));

    // Leaderboard. Posting is automatic unless the player has switched it
    // off, so this block reports what happened rather than asking. The name
    // is assigned by the server and cannot be changed from here — that is what
    // makes one name per player mean anything.
    if (r.leaderboard) {
      const lb = el('div', 'hud-lb');
      const status = el('div', 'hud-lb-status', '');
      lb.append(status);

      if (r.leaderboard.autoPost) {
        // Told once, the first time a score is posted, so nobody discovers
        // after the fact that their runs are going somewhere public.
        if (!settings.get('leaderboardNoticeSeen')) {
          const notice = el('div', 'hud-lb-notice');
          notice.innerHTML =
            'Your scores are posted to the <b>public leaderboard</b> automatically, under a name generated for you. No account, nothing you type. You can switch this off in Settings.';
          const off = el('button', 'hud-btn', 'Turn off posting');
          off.addEventListener('click', () => {
            settings.set('leaderboardAutoPost', false);
            notice.textContent = 'Automatic posting is off. Runs already posted stay on the board.';
          });
          notice.append(off);
          lb.append(notice);
          settings.set('leaderboardNoticeSeen', true);
        }
        status.textContent = 'Posting your score…';
        // Post once per run: this card is rebuilt when the player comes back
        // from the leaderboard or level select, and the run token is one-shot.
        r.posting ??= r.leaderboard.post();
        r.posting
          .then((out) => {
            if (!out?.ok) {
              status.textContent = 'Score not posted — the leaderboard is unavailable right now.';
              return;
            }
            const who = out.handle ? ` as ${out.handle}` : '';
            status.innerHTML = out.improved
              ? `Posted${who}. You are ${out.rank ? `<b>#${out.rank}</b>` : 'on the board'} on this level.`
              : `Your earlier run on this level still scores higher${out.rank ? ` (#${out.rank})` : ''}.`;
          })
          .catch(() => {
            status.textContent = 'Score not posted — the leaderboard is unavailable right now.';
          });
      } else {
        const name = getHandle();
        status.textContent = 'Automatic posting is off. You can turn it on in Settings.';
        const post = el('button', 'hud-btn', name ? `Post this run as ${name}` : 'Post this run');
        post.addEventListener('click', async () => {
          post.disabled = true;
          post.textContent = 'Posting…';
          const out = await r.leaderboard.post();
          if (!out?.ok) {
            status.textContent = 'Could not post — the leaderboard is unavailable right now.';
            post.disabled = false;
            post.textContent = 'Post this run';
            return;
          }
          post.remove();
          const who = out.handle ? ` as ${out.handle}` : '';
          status.innerHTML = out.improved
            ? `Posted${who}. You are ${out.rank ? `<b>#${out.rank}</b>` : 'on the board'} on this level.`
            : `Your earlier run on this level still scores higher${out.rank ? ` (#${out.rank})` : ''}.`;
        });
        lb.append(post);
      }
      reviewCard.append(lb);
    }

    const actWrap = el('div', 'hud-actions');
    const btn = (label, fn, kind) => {
      const cls = kind === 'primary' ? ' is-on' : '';
      const b = el('button', `hud-btn${cls}`, label);
      b.addEventListener('click', fn);
      actWrap.appendChild(b);
      return b;
    };
    const retryKey = keyLabel(codesFor('restart', settings.get('bindings'))[0]);
    if (r.hasNext) btn(`Next level<kbd>Enter</kbd>`, () => actions.next?.(), 'primary');
    btn(`Retry<kbd>${r.hasNext ? retryKey : `${retryKey} / Enter`}</kbd>`, () => actions.restart?.(), r.hasNext ? null : 'primary');
    // A result to paste anywhere (Retention.shareText: the run's numbers and a
    // row of five coloured cells, no name or identifier). Built here, sent by
    // the player's own share sheet or clipboard; the page itself sends nothing.
    const shareBtn = btn('Share result', async () => {
      const out = await share({ text: r.shareText, sheet: 'touch' });
      if (out === 'copied') shareBtn.textContent = 'Copied to clipboard';
      else if (out === 'failed') shareBtn.textContent = 'Could not copy';
    });
    if (review.active) btn('View again', () => review.replay());
    if (review.hasBestPose) {
      const ghostBtn = btn(review.bestGhostVisible ? 'Hide your personal best' : 'Show your personal best', () => {
        review.toggleBestGhost();
        ghostBtn.textContent = review.bestGhostVisible ? 'Hide your personal best' : 'Show your personal best';
      });
    }
    if (r.daily) {
      btn('Main menu', () => actions.quitToMenu?.());
    } else {
      if (r.levelId) btn('Leaderboard', () => showBoard(r.levelId, () => showReviewResults(r, review)));
      btn('Level select', () => showLevelSelect(() => showReviewResults(r, review)));
    }
    btn('Hide panel', () => setReviewCardVisible(false));
    reviewCard.append(actWrap);
    setReviewCardVisible(true);
  }

  function showReviewFailed(f, review) {
    currentReview = review;
    cardOpen = true;
    reviewOnNext = false;
    reviewCard.innerHTML = '';
    reviewCard.append(
      el('div', 'tag fail', f.daily ? `Not parked · Daily #${f.daily.day}` : 'Not parked'),
      el('h2', null, f.daily ? f.daily.title : f.levelName),
      el('p', null, f.reason)
    );
    const stop = review.describeStop() || (f.distanceM != null ? `${f.distanceM.toFixed(1)} m from the bay` : '');
    if (stop) reviewCard.append(el('div', 'stop-sentence', stop));
    const actWrap = el('div', 'hud-actions');
    const btn = (label, fn, kind) => {
      const cls = kind === 'primary' ? ' is-on' : '';
      const b = el('button', `hud-btn${cls}`, label);
      b.addEventListener('click', fn);
      actWrap.appendChild(b);
    };
    const retryKey = keyLabel(codesFor('restart', settings.get('bindings'))[0]);
    btn(`Try again<kbd>${retryKey} / Enter</kbd>`, () => actions.restart?.(), 'primary');
    if (f.daily) btn('Main menu', () => actions.quitToMenu?.());
    else btn('Level select', () => showLevelSelect(() => showReviewFailed(f, review)));
    btn('Hide panel', () => setReviewCardVisible(false));
    reviewCard.append(actWrap);
    setReviewCardVisible(true);
  }

  /** In-play HUD: level card, prompt, key legend, top-right buttons (GOAL
   *  Part C §1: these fade out the moment the review starts). */
  function setInPlayHudVisible(visible) {
    tl.style.visibility = visible ? '' : 'hidden';
    bc.style.visibility = visible ? '' : 'hidden';
    tr.style.visibility = visible ? '' : 'hidden';
    radarSlot.style.visibility = visible ? '' : 'hidden';
    telemetry.el.style.visibility = visible ? '' : 'hidden';
    if (visible) {
      currentReview = null;
      cardOpen = false;
      reviewLabels.hidden = true;
      reviewLabels.innerHTML = ''; // C.10: "remove every DOM label", not just hide the layer
      reviewCard.hidden = true;
      reviewPill.hidden = true;
    }
  }

  /** Review overlay labels (GOAL Part C §5): `[{ id, text, x, y, hidden }]`
   *  in CSS pixels, computed by ParkingReview.js each frame. */
  function setReviewLabels(list) {
    reviewLabels.hidden = list.length === 0;
    reviewLabels.innerHTML = '';
    for (const l of list) {
      if (l.hidden) continue;
      const d = el('div', 'hud-review-label', l.text);
      d.style.left = `${l.x}px`;
      d.style.top = `${l.y}px`;
      d.dataset.id = l.id;
      reviewLabels.appendChild(d);
    }
  }

  function showTutorialDone() {
    showPanel((p) => {
      p.append(
        el('div', 'tag', 'Tutorial complete'),
        el('h2', null, "You're ready"),
        el(
          'p',
          null,
          'Every level is scored out of 100: how centred and straight you finish, your time against par, and whether you touched anything.'
        ),
        buttons([
          ['Start level 1', () => actions.playLevel?.(0), 'primary'],
          ['Level select', () => showLevelSelect(showTutorialDone)],
        ])
      );
    });
  }

  return {
    setRadarCanvas,
    telemetry,
    showStart,
    showPause,
    showReviewResults,
    showReviewFailed,
    setReviewLabels,
    setInPlayHudVisible,
    showTutorialDone,
    showLevelSelect: () => showLevelSelect(showStart),
    showSettings: () => showSettings(showStart),

    hidePanel,
    get isPanelOpen() {
      return !veil.hidden;
    },

    setLevel({ name, subtitle, hint: hintText, index, levelId, total, timeLimit = null, tag = null }) {
      currentLevelIndex = index;
      currentLevelId = levelId ?? index + 1;
      levelTag.textContent = tag ?? `Level ${index + 1} of ${total} · ${subtitle}`;
      levelName.textContent = name;
      hint.textContent = hintText ?? '';
      currentLimit = timeLimit;
      stats.hidden = false;
      dots.hidden = true;
      routeEl.hidden = true;
      skipBtn.hidden = true;
      restartBtn.hidden = false;
    },

    /** The tutorial's card: step title, detail and a progress strip. */
    setTutorial({ index, total, title, detail }) {
      levelTag.textContent = `Tutorial · step ${index + 1} of ${total}`;
      levelName.textContent = title;
      hint.textContent = detail;
      stats.hidden = true;
      dots.hidden = false;
      dots.innerHTML = '';
      for (let i = 0; i < total; i++) dots.append(el('i', i <= index ? 'on' : ''));
      skipBtn.hidden = false;
      restartBtn.hidden = true;
    },

    setStats({ timeSec, bumps }) {
      if (currentLimit) {
        const left = Math.max(0, currentLimit - timeSec);
        const urgent = left < 10 ? ' style="color:#e0857b"' : '';
        timeEl.innerHTML = `Time left <b${urgent}>${left.toFixed(1)}s</b>`;
      } else {
        timeEl.innerHTML = `Time <b>${timeSec.toFixed(1)}s</b>`;
      }
      bumpEl.innerHTML = `Bumps <b>${bumps}</b>`;
    },

    /** @param {'good'|'warn'|null} tone */
    setPrompt(text, tone = null) {
      // Called every simulation tick. The prompt is an aria-live region, so
      // rewriting the same text 60 times a second would make a screen reader
      // repeat it endlessly: only touch the DOM when something changed.
      const cls = text ? `hud-prompt show${tone ? ` ${tone}` : ''}` : 'hud-prompt';
      if (text && prompt.textContent !== text) prompt.textContent = text;
      if (prompt.className !== cls) prompt.className = cls;
    },

    setAudioMode(mode) {
      audioBtn.textContent = mode === 'lofi' ? 'Sound: Lo-Fi' : 'Sound: Engine';
    },

    /**
     * Remaining route distance + current floor, Level 13 only.
     * @param {{floorName: string, metres: number}|null} info  null hides the chip
     *   (SPEC-level13.md §5.9: hidden once inside 10 m of the target).
     */
    setRouteDistance(info) {
      if (!info) {
        routeEl.hidden = true;
        return;
      }
      routeEl.hidden = false;
      routeEl.textContent = `${info.floorName} · ${Math.round(info.metres)} m`;
    },
  };
}
