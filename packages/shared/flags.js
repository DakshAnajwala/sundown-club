/**
 * flags.js — A/B tests without a service. Each experiment in /flags.json (apps/hub/flags.json, same origin, so it can be
 * changed by a deploy without touching code) lists variants with weights and is off until `enabled` is true. A player's
 * variant is a hash of their random id and the experiment name, so it never changes and needs no server. While an
 * experiment is off everyone gets its `default`, which is the recommended behaviour. Telemetry tags events with the
 * variant (`exp: "round_panel:off"`), so the metrics page can compare groups.
 *
 *   variant('round_panel')            -> 'on'
 *   loadFlags()                       -> fetches /flags.json once a day into hub.v1.flags (called from initTelemetry)
 *
 * Rules (docs/retention/experiments.md): write the hypothesis, metric and stop rule before turning one on, and do not
 * run one until enough players exist to answer it. Pure and node-safe except loadFlags.
 */
import { hash32 } from './daily.js';

const KEY = 'hub.v1.flags';
const FALLBACK = { v: 1, experiments: {} };

/** The variant a player gets. config: { experiments: { name: { enabled, default, variants: { id: weight } } } }. */
export function pick(name, playerId, config = FALLBACK) {
  const e = config?.experiments?.[name];
  if (!e) return null;
  const ids = Object.keys(e.variants || {});
  if (!e.enabled || !ids.length) return e.default ?? ids[0] ?? null;
  const total = ids.reduce((n, id) => n + Math.max(0, Number(e.variants[id]) || 0), 0);
  if (!(total > 0)) return e.default ?? ids[0];
  let r = (hash32(`${playerId}|${name}`) / 4294967296) * total;
  for (const id of ids) { r -= Math.max(0, Number(e.variants[id]) || 0); if (r < 0) return id; }
  return ids[ids.length - 1];
}

function cached() {
  try { const c = JSON.parse(localStorage.getItem(KEY) || 'null'); return c && c.config && typeof c.config === 'object' ? c : null; } catch { return null; }
}

/** This player's variant of an experiment, from the cached config (the default until the file has been fetched once). */
export function variant(name, playerId) {
  try {
    const id = playerId ?? JSON.parse(localStorage.getItem('hub.v2.profile') || '{}').id ?? 'anon';
    return pick(name, id, cached()?.config || FALLBACK);
  } catch { return pick(name, 'anon', FALLBACK); }
}

/** "name:variant" for every experiment that is switched on, to tag telemetry. null when none is. */
export function activeTag(playerId) {
  try {
    const cfg = cached()?.config;
    if (!cfg) return null;
    const tags = Object.keys(cfg.experiments || {}).filter((n) => cfg.experiments[n].enabled).map((n) => `${n}:${pick(n, playerId, cfg)}`);
    return tags.length ? tags.join(',').slice(0, 60) : null;
  } catch { return null; }
}

/** Fetch /flags.json at most once a day. Never throws. */
export async function loadFlags() {
  try {
    const c = cached();
    if (c && Date.now() - c.t < 86400000) return c.config;
    const r = await fetch('/flags.json', { cache: 'no-cache' });
    if (!r.ok) return c?.config || null;
    const config = await r.json();
    if (!config || typeof config !== 'object' || typeof config.experiments !== 'object') return c?.config || null;
    localStorage.setItem(KEY, JSON.stringify({ t: Date.now(), config }));
    return config;
  } catch { return null; }
}
