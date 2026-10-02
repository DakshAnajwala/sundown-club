/**
 * leaderboard.js — the club boards, client side. Spec: apps/hub/SPEC-leaderboard.md.
 *
 *   startBoardSession('holdem')        every game page (called from telemetry.js initTelemetry)
 *   fetchBoard({ tab, win })           the hub's "The board"
 *   submitFromProfile()                hub load: report this player's peak chips and Parking stars
 *
 * Play time is counted by the server: one session on load, then a beat every
 * minute only while the page is visible and the player did something in the
 * last two minutes. Idle and hidden tabs earn nothing. Names are made by the
 * server, nothing typed is ever sent. "Show me on the boards" off (settings.board
 * === false) means nothing here sends a request at all. Never throws.
 */
import { ensureIdentity, readProfile } from './profile.js';

const PLAY = '/api/club/play';
const BOARD = '/api/club/board';
const SETTINGS_KEY = 'hub.v1.settings';
const STATE_KEY = 'hub.v1.board';
const BEAT_MS = 60000;
const ACTIVE_MS = 120000;

function readSettings() {
  try { const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); return s && typeof s === 'object' ? s : {}; } catch { return {}; }
}
/** On unless the player switched it off. */
export const boardEnabled = () => readSettings().board !== false;

async function post(body) {
  try {
    const r = await fetch(PLAY, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), keepalive: true });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

let token = null, lastInput = 0, wired = false, timer = null;

function beacon(body) {
  try { return navigator.sendBeacon?.(PLAY, new Blob([JSON.stringify(body)], { type: 'application/json' })); } catch { return false; }
}

export async function startBoardSession(game) {
  try {
    if (wired || !boardEnabled() || typeof document === 'undefined') return;
    wired = true;
    const player = ensureIdentity().id;
    lastInput = Date.now();
    const bump = () => { lastInput = Date.now(); };
    for (const ev of ['keydown', 'pointerdown', 'wheel', 'touchstart']) addEventListener(ev, bump, { passive: true });
    let moveAt = 0;
    addEventListener('pointermove', () => { const n = Date.now(); if (n - moveAt > 1000) { moveAt = n; bump(); } }, { passive: true });
    const s = await post({ a: 'session', player, game });
    if (!s?.token) return;
    token = s.token;
    const tick = () => {
      if (!token || !boardEnabled()) return;
      if (document.visibilityState === 'visible' && Date.now() - lastInput < ACTIVE_MS) post({ a: 'beat', token });
    };
    timer = setInterval(tick, globalThis.__scBeatMs || BEAT_MS);   // __scBeatMs: only for tools/board-probe.mjs
    addEventListener('pagehide', () => { if (token && boardEnabled() && Date.now() - lastInput < ACTIVE_MS) beacon({ a: 'beat', token }); });
  } catch { /* the boards are optional */ }
}

/** Turn the boards on or off. Off takes this player off every board and stops the heartbeats. */
export async function setBoardEnabled(on) {
  try {
    const s = readSettings(); s.board = !!on;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch { /* storage blocked */ }
  if (!on) {
    token = null; if (timer) { clearInterval(timer); timer = null; }
    await post({ a: 'leave', player: ensureIdentity().id });
    try { localStorage.removeItem(STATE_KEY); } catch { /* blocked */ }
  }
}

/** { rows, you, total } for a tab ('time', 'bj', 'pk', 'streak') and window ('week', 'all'), or null when the board is resting. */
export async function fetchBoard({ tab = 'time', win = 'week' } = {}) {
  try {
    const q = new URLSearchParams({ tab, win });
    if (boardEnabled()) q.set('player', ensureIdentity().id);
    const r = await fetch(`${BOARD}?${q}`);
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

export async function myBoardName() {
  if (!boardEnabled()) return null;
  return (await post({ a: 'name', player: ensureIdentity().id }))?.name ?? null;
}
export async function rerollBoardName() {
  if (!boardEnabled()) return null;
  return post({ a: 'reroll', player: ensureIdentity().id });
}

/** Report Blackjack's peak and Parking's stars from the saved profile, only when they went up since the last report. */
export async function submitFromProfile() {
  try {
    if (!boardEnabled()) return;
    const p = readProfile(), player = ensureIdentity().id;
    let sent = {}; try { sent = JSON.parse(localStorage.getItem(STATE_KEY) || '{}') || {}; } catch { /* fresh */ }
    const bj = Number(p.games.blackjack?.ledger?.peak), stars = Number(p.games.parking?.ledger?.stars), best = Number(p.games.parking?.ledger?.best) || 0;
    if (Number.isInteger(bj) && bj > 1000 && bj > (sent.bj || 0) && (await post({ a: 'submit', player, board: 'bj', data: { peak: bj } }))) sent.bj = bj;
    const code = Number.isInteger(stars) ? stars * 1000 + Math.min(100, Math.max(0, Math.round(best))) : 0;
    if (Number.isInteger(stars) && stars > 0 && code > (sent.pk || 0) && (await post({ a: 'submit', player, board: 'pk', data: { stars, best: Math.min(100, Math.max(0, Math.round(best))) } }))) sent.pk = code;
    localStorage.setItem(STATE_KEY, JSON.stringify(sent));
  } catch { /* silent */ }
}
