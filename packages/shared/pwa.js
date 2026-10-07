/**
 * pwa.js — installable app and offline play. Registers the service worker
 * (/sw.js, built by tools/build-site.mjs), counts sessions locally, and keeps
 * the browser's "install" prompt so the hub can offer it politely: never on the
 * first visit, only from the second session on, and never again after "Not now".
 *   registerPwa()   called from telemetry.js initTelemetry on every page
 *   installOffer()  { canInstall, sessions, dismissed, installed } for the hub
 *   promptInstall() shows the browser's own dialog; returns 'accepted' | 'dismissed' | 'unavailable'
 * Local state: hub.v1.pwa { sessions, dismissed, installed }. Nothing is sent.
 */
import { ensureIdentity } from './profile.js';

const KEY = 'hub.v1.pwa';
const SESSION_FLAG = 'hub.v1.pwa.session';
let deferred = null;
let registered = false;

const read = () => { try { const s = JSON.parse(localStorage.getItem(KEY) || '{}'); return s && typeof s === 'object' ? s : {}; } catch { return {}; } };
const write = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* blocked */ } };

export function registerPwa() {
  try {
    if (typeof window === 'undefined' || registered) return;
    registered = true;
    const st = read();
    let first = true;
    try { first = !sessionStorage.getItem(SESSION_FLAG); sessionStorage.setItem(SESSION_FLAG, '1'); } catch { /* count each page */ }
    if (first) { st.sessions = (Number(st.sessions) || 0) + 1; write(st); }
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; document.dispatchEvent(new Event('club-install-ready')); });
    window.addEventListener('appinstalled', () => { const s = read(); s.installed = true; write(s); deferred = null; });
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      navigator.serviceWorker.register('/sw.js').catch(() => { /* offline play is optional */ });
    }
  } catch { /* optional */ }
}

export function installOffer() {
  const st = read();
  const standalone = typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches;
  return { canInstall: !!deferred && !standalone, sessions: Number(st.sessions) || 0, dismissed: !!st.dismissed, installed: !!st.installed || standalone };
}

export function dismissInstall() { const s = read(); s.dismissed = true; write(s); }

export async function promptInstall() {
  if (!deferred) return 'unavailable';
  const e = deferred; deferred = null;
  try { e.prompt(); const r = await e.userChoice; if (r?.outcome === 'accepted') { const s = read(); s.installed = true; write(s); } return r?.outcome === 'accepted' ? 'accepted' : 'dismissed'; } catch { return 'unavailable'; }
}

// ------------------------------------------------------------------ daily reminder (web push), only when the server has it switched on
async function call(body) {
  try { const r = await fetch('/api/club/play', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return r.ok ? await r.json() : null; } catch { return null; }
}
const toKey = (b64) => { const pad = '='.repeat((4 - (b64.length % 4)) % 4); const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, (c) => c.charCodeAt(0)); };

/** What the hub needs to decide whether to offer reminders. `available` is false unless the server has push configured. */
export async function pushOffer() {
  const st = read();
  const supported = typeof Notification !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;
  if (!supported) return { available: false, sessions: Number(st.sessions) || 0, on: false, dismissed: !!st.pushDismissed, denied: false };
  const k = await call({ a: 'push_key' });
  return { available: !!k?.key, key: k?.key || null, sessions: Number(st.sessions) || 0, on: !!st.push && Notification.permission === 'granted', dismissed: !!st.pushDismissed, denied: Notification.permission === 'denied' };
}
export function dismissPush() { const s = read(); s.pushDismissed = true; write(s); }

/** Ask permission and subscribe. Returns 'on' | 'denied' | 'unavailable'. */
export async function enablePush(key) {
  try {
    if (!key) return 'unavailable';
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return 'denied';
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(key) }));
    const r = await call({ a: 'push_on', player: ensureIdentity().id, endpoint: sub.endpoint });
    if (!r?.ok) return 'unavailable';
    const s = read(); s.push = true; write(s);
    return 'on';
  } catch { return 'unavailable'; }
}
export async function disablePush() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) { await call({ a: 'push_off', endpoint: sub.endpoint }); await sub.unsubscribe(); }
  } catch { /* nothing to undo */ }
  const s = read(); s.push = false; write(s);
}
