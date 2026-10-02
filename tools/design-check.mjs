/**
 * design-check.mjs — checks the design tokens (packages/shared/design/):
 *   1. tokens.css matches what tools/build-tokens.mjs would write from tokens.js
 *   2. every text/background pair the system allows meets WCAG 2.1 AA
 *      (4.5:1 for text, 3:1 for the focus ring), in every sky phase
 * Exits 1 on any failure. Part of `npm run check`.
 */
import { readFileSync } from 'node:fs';
import * as T from '../packages/shared/design/tokens.js';
import { renderCss, CSS_PATH } from './build-tokens.mjs';

let fails = 0;
const fail = (msg) => { fails += 1; console.log(`FAIL ${msg}`); };

// 1. tokens.css is current
let onDisk = '';
try { onDisk = readFileSync(CSS_PATH, 'utf8'); } catch { /* missing */ }
if (onDisk !== renderCss()) fail(`${CSS_PATH} is out of date: run node tools/build-tokens.mjs`);
else console.log(`ok   ${CSS_PATH} is current`);

// 2. contrast
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const mix = (top, alpha, under) => top.map((c, i) => Math.round(c * alpha + under[i] * (1 - alpha)));
const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');

// Glass sits over a moving 3D scene. Check it against the brightest and
// darkest things a scene shows: a white sky, the golden window, a night sky.
const BEHIND_GLASS = { 'white sky': '#ffffff', 'golden window': '#f4ad6e', 'night sky': '#0e1324' };

let pairs = 0, worst = { r: 99 };
function need(min, fg, bg, label) {
  const r = ratio(fg, bg); pairs += 1;
  if (r < worst.r) worst = { r, label };
  if (r < min) fail(`${label}: ${r.toFixed(2)}:1 (need ${min}:1) ${hex(fg)} on ${hex(bg)}`);
}

for (const [phase, p] of Object.entries(T.sky)) {
  const solids = { s0: rgb(p.s0), s1: rgb(p.s1), s2: rgb(p.s2), s3: rgb(p.s3) };
  const glasses = Object.fromEntries(Object.entries(BEHIND_GLASS).map(([k, v]) => [`glass over ${k}`, mix(rgb(p.s1), T.glass.alpha, rgb(v))]));
  for (const [inkName, inkHex] of Object.entries(T.ink)) {
    for (const [s, bg] of Object.entries(solids)) need(4.5, rgb(inkHex), bg, `${phase} ink.${inkName} on ${s}`);
    if (inkName !== 'tertiary') for (const [g, bg] of Object.entries(glasses)) need(4.5, rgb(inkHex), bg, `${phase} ink.${inkName} on ${g}`);
  }
  for (const [rName, rHex] of Object.entries(T.result)) {
    for (const s of ['s1', 's2']) need(4.5, rgb(rHex), solids[s], `${phase} result.${rName} on ${s}`);
    for (const [g, bg] of Object.entries(glasses)) need(4.5, rgb(rHex), bg, `${phase} result.${rName} on ${g}`);
  }
  need(4.5, rgb(p.onSun), rgb(p.sun), `${phase} onSun on sun`);
  for (const s of ['s0', 's1', 's2']) need(4.5, rgb(p.sun), solids[s], `${phase} sun as text on ${s}`);
  for (const [s, bg] of Object.entries(solids)) need(3, rgb(T.ink.primary), bg, `${phase} focus ring on ${s}`);
  for (const [id, g] of Object.entries(T.games)) {
    for (const s of ['s0', 's1', 's2']) need(4.5, rgb(g.accent), solids[s], `${phase} ${id} accent as text on ${s}`);
    need(4.5, rgb(g.accent), glasses['glass over night sky'], `${phase} ${id} accent as text on glass over night sky`);
  }
}
for (const [id, g] of Object.entries(T.games)) need(4.5, rgb(g.onAccent), rgb(g.accent), `${id} onAccent on accent`);

// Paper (card tables): dark ink on light surfaces, glass over the room.
for (const [phase, p] of Object.entries(T.paper.sky)) {
  const solids = { s0: rgb(p.s0), s1: rgb(p.s1), s2: rgb(p.s2), s3: rgb(p.s3) };
  const glasses = Object.fromEntries(Object.entries(BEHIND_GLASS).map(([k, v]) => [`paper glass over ${k}`, mix(rgb(p.s1), T.paper.glassAlpha, rgb(v))]));
  for (const [inkName, inkHex] of Object.entries(T.paper.ink)) {
    for (const [s, bg] of Object.entries(solids)) need(4.5, rgb(inkHex), bg, `paper ${phase} ink.${inkName} on ${s}`);
    if (inkName !== 'tertiary') for (const [g, bg] of Object.entries(glasses)) need(4.5, rgb(inkHex), bg, `paper ${phase} ink.${inkName} on ${g}`);
  }
  for (const [rName, rHex] of Object.entries(T.paper.result)) {
    for (const s of ['s1', 's2']) need(4.5, rgb(rHex), solids[s], `paper ${phase} result.${rName} on ${s}`);
    for (const [g, bg] of Object.entries(glasses)) need(4.5, rgb(rHex), bg, `paper ${phase} result.${rName} on ${g}`);
  }
  for (const [s, bg] of Object.entries(solids)) need(3, rgb(T.paper.ink.primary), bg, `paper ${phase} focus ring on ${s}`);
  for (const [id, g] of Object.entries(T.games)) {
    for (const s of ['s0', 's1', 's2']) need(4.5, rgb(g.paperInk), solids[s], `paper ${phase} ${id} paperInk on ${s}`);
    need(4.5, rgb(g.paperInk), glasses['paper glass over night sky'], `paper ${phase} ${id} paperInk on glass over night sky`);
  }
}

console.log(`${fails ? 'FAIL' : 'PASS'}: ${pairs} contrast pairs, lowest ${worst.r.toFixed(2)}:1 (${worst.label})${fails ? `, ${fails} failing` : ''}`);
process.exit(fails ? 1 : 0);
