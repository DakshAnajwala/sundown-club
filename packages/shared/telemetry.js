/**
 * telemetry.js — anonymous, first-party usage counters.
 *
 *   initTelemetry({ game: 'holdem' })   once per page
 *   track('round_end', { game: 'holdem', result: 'win' })
 *
 * Sends nothing that was typed and nothing that identifies a person: the
 * random browser id from profile.js, event names and a few short tags. Off when
 * the player turns it off (settings.telemetry === false), when Do Not Track or
 * Global Privacy Control is on, or when storage is blocked. Spec and the list
 * of events: docs/retention/SPEC-telemetry.md. Policy: apps/hub/legal/privacy.html.
 *
 * Nothing here touches the DOM at import time. Every storage and network call
 * is wrapped, so a game never fails because of it.
 */
import { ensureIdentity, today } from './profile.js';

const ENDPOINT = '/api/club/event';
const SETTINGS_KEY = 'hub.v1.settings';
const TELE_KEY = 'hub.v1.tele';
const SESSION_FLAG = 'hub.v1.tele.session';
const FLUSH_AT = 10;
const FLUSH_MS = 5000;

const SEARCH = /(^|\.)(google|bing|duckduckgo|yahoo|ecosia|brave|baidu|yandex|startpage|qwant)\./;
const SOCIAL = /(^|\.)(t\.co|twitter|x\.com|facebook|instagram|reddit|tiktok|youtube|youtu\.be|discord|whatsapp|snapchat|pinterest|linkedin|threads|bsky)(\.|$)/;

/** direct | internal | search | social | other, from document.referrer. The URL itself is never sent. */
export function classifyRef(referrer, host) {
  if (!referrer) return 'direct';
  let h;
  try { h = new URL(referrer).hostname; } catch { return 'other'; }
  if (h === host) return 'internal';
  if (SEARCH.test(h)) return 'search';
  if (SOCIAL.test(h)) return 'social';
  return 'other';
}

/** Whole local days between two YYYY-MM-DD strings. */
export function daysBetween(a, b) {
  const t = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((t(b) - t(a)) / 86400000);
}

function readSettings() {
  try { const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); return s && typeof s === 'object' ? s : {}; } catch { return {}; }
}

/** True unless the player switched it off or the browser asks not to be tracked. */
export function telemetryEnabled() {
  try {
    if (readSettings().telemetry === false) return false;
    const nav = globalThis.navigator;
    if (nav && (nav.doNotTrack === '1' || nav.globalPrivacyControl === true)) return false;
    return true;
  } catch { return false; }
}

export function setTelemetry(on) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...readSettings(), telemetry: !!on }));
  } catch { /* storage blocked */ }
  if (!on) { queue.length = 0; }
}

let player = null;
let game = null;
let started = 0;       // performance.now() when this page started counting
let shown = 0;         // visible milliseconds so far
let since = null;      // performance.now() of the last time it became visible
let timer = null;
let wired = false;
const queue = [];

function send(body) {
  try {
    const json = JSON.stringify(body);
    if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, new Blob([json], { type: 'application/json' }))) return;
    fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: json, keepalive: true }).catch(() => {});
  } catch { /* offline or blocked */ }
}

export function flush() {
  if (timer) { clearTimeout(timer); timer = null; }
  if (!player || !queue.length || !telemetryEnabled()) { queue.length = 0; return; }
  send({ player, events: queue.splice(0, 20) });
  if (queue.length) flush();
}

export function track(name, props = {}) {
  try {
    if (!player || !telemetryEnabled()) return;
    queue.push({ name, props: { game, ...props } });
    if (queue.length >= FLUSH_AT) flush();
    else if (!timer) timer = setTimeout(flush, FLUSH_MS);
  } catch { /* never break a game */ }
}

function visibleSeconds() {
  const live = since == null ? 0 : performance.now() - since;
  return Math.round((shown + live) / 1000);
}

function leaving() {
  track('game_leave', { dur: visibleSeconds() });
  track('session_end', { dur: visibleSeconds() });
  flush();
}

export function initTelemetry(opts = {}) {
  try {
    if (wired) return;
    game = opts.game || 'hub';
    // The club boards count play time (their own switch, see leaderboard.js); telemetry being off does not stop them.
    import('./leaderboard.js').then((m) => m.startBoardSession(game)).catch(() => {});
    import('./pwa.js').then((m) => m.registerPwa()).catch(() => {});
    import('./wellbeing.js').then((m) => m.startBreakNudge()).catch(() => {});
    if (!telemetryEnabled()) return;
    player = ensureIdentity().id;
    wired = true;
    started = performance.now();
    since = document.visibilityState === 'visible' ? started : null;

    // Local-only facts: first visit day, so day_index counts days since then.
    let tele = {};
    try { tele = JSON.parse(localStorage.getItem(TELE_KEY) || '{}') || {}; } catch { /* fresh */ }
    const t = today();
    const isNew = !tele.first;
    if (isNew) { tele.first = t; try { localStorage.setItem(TELE_KEY, JSON.stringify(tele)); } catch { /* blocked */ } }

    let first = true;
    try { first = !sessionStorage.getItem(SESSION_FLAG); sessionStorage.setItem(SESSION_FLAG, '1'); } catch { /* treat each page as a session */ }
    if (first) {
      track('session_start', { ref: classifyRef(document.referrer, location.hostname), day_index: Math.max(0, daysBetween(tele.first, t)), is_new: isNew });
    }
    track('game_open');

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        if (since != null) { shown += performance.now() - since; since = null; }
        flush();
      } else since = performance.now();
    });
    addEventListener('pagehide', leaving);
  } catch { /* telemetry is optional */ }
}
