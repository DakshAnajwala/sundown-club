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
import { ensureIdentity, readProfile, addTokens } from './profile.js';

const PLAY = '/api/club/play';
const BOARD = '/api/club/board';
const SETTINGS_KEY = 'hub.v1.settings';
const STATE_KEY = 'hub.v1.board';
const INVITE_KEY = 'hub.v1.invite';
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
    captureInvite();
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

/** Report a finished Daily Blackjack tournament's final stack to the weekly board. Returns true when the server took it. */
export async function submitTournament(stack) {
  if (!boardEnabled() || !Number.isInteger(stack)) return false;
  return !!(await post({ a: 'submit', player: ensureIdentity().id, board: 'bt', data: { stack } }));
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

// ------------------------------------------------------------------ friends, invites, challenges
/** Make a friends club (or get yours) and give back its six-character code. */
export async function clubCreate() { return boardEnabled() ? post({ a: 'club_create', player: ensureIdentity().id }) : null; }
export async function clubJoin(code) { return boardEnabled() ? post({ a: 'club_join', player: ensureIdentity().id, code }) : null; }
export async function clubLeave() { return boardEnabled() ? post({ a: 'club_leave', player: ensureIdentity().id }) : null; }

/** The link to hand a friend: the site with ?i=<short code> (never your id). */
export async function inviteLink() {
  if (!boardEnabled()) return null;
  const r = await post({ a: 'invite_code', player: ensureIdentity().id });
  return r?.code ? `${location.origin}/?i=${r.code}` : null;
}

/** Remember an invite code from the address (?i=...) until this player finishes a first round. */
export function captureInvite() {
  try {
    const c = new URLSearchParams(location.search).get('i');
    if (c && /^[a-z2-9]{8}$/.test(c) && !localStorage.getItem(INVITE_KEY)) localStorage.setItem(INVITE_KEY, c);
  } catch { /* storage blocked */ }
}

/** After a first round: tell the server a friend arrived from a link. Both sides get a token (the inviter's is collected on their next visit). */
export async function claimInviteIfAny() {
  try {
    const c = localStorage.getItem(INVITE_KEY);
    if (!c || !boardEnabled()) return false;
    localStorage.removeItem(INVITE_KEY);
    const r = await post({ a: 'invite_claim', player: ensureIdentity().id, code: c });
    if (r?.ok) { addTokens(r.tokens || 1); return true; }
  } catch { /* silent */ }
  return false;
}

/** Tokens friends earned you since the last visit. Adds them and returns how many. */
export async function collectInviteTokens() {
  try {
    if (!boardEnabled()) return 0;
    const r = await post({ a: 'invite_status', player: ensureIdentity().id });
    const n = Math.min(5, Number(r?.pending) || 0);
    if (n > 0) addTokens(n);
    return n;
  } catch { return 0; }
}

/** Upload one Parking ghost ({ level, hz, d }) and get a link a friend can race. Null when the boards are off or the server is unavailable. */
export async function shareGhost(ghost) {
  const r = boardEnabled() ? await post({ a: 'ghost_put', player: ensureIdentity().id, ghost }) : null;
  return r?.ok && r.id ? `${location.origin}/parking/play/?g=${r.id}` : null;
}

/** A signed challenge code for a seeded deal: data { g, s, v, l }. */
export async function makeChallenge(data) {
  return boardEnabled() ? post({ a: 'challenge', player: ensureIdentity().id, data }) : { error: 'boards off' };
}
/** Check a code from a link. Needs no identity. */
export async function checkChallenge(code) {
  return post({ a: 'challenge_check', code });
}
