/**
 * cards3d.js — the stylised Sundown Club deck (Blackjack SPEC §8.7) as 2D
 * canvases (drawFace/drawBack, also used by the video poker screen) and as 3D
 * cards on the table.
 */
import * as THREE from 'three';
import { cardBackPalette } from '../cosmetics.js';

export const RED = '#c0594b', INK = '#2e2d35', STOCK = '#f3ede2';
export const RANK_LABEL = { T: '10' };

export function pip(g, suit, x, y, r) {
  g.beginPath();
  if (suit === 'D') { g.moveTo(x, y - r * 1.35); g.lineTo(x + r, y); g.lineTo(x, y + r * 1.35); g.lineTo(x - r, y); g.closePath(); }
  else if (suit === 'H') { g.arc(x - r * 0.5, y - r * 0.35, r * 0.55, 0, 7); g.arc(x + r * 0.5, y - r * 0.35, r * 0.55, 0, 7); g.moveTo(x - r * 1.03, y - r * 0.18); g.lineTo(x + r * 1.03, y - r * 0.18); g.lineTo(x, y + r * 1.05); g.closePath(); }
  else if (suit === 'S') { g.arc(x - r * 0.5, y + r * 0.25, r * 0.55, 0, 7); g.arc(x + r * 0.5, y + r * 0.25, r * 0.55, 0, 7); g.moveTo(x - r * 1.03, y + r * 0.08); g.lineTo(x + r * 1.03, y + r * 0.08); g.lineTo(x, y - r * 1.1); g.closePath(); g.moveTo(x, y + r * 0.2); g.lineTo(x + r * 0.42, y + r * 1.1); g.lineTo(x - r * 0.42, y + r * 1.1); g.closePath(); }
  else { g.arc(x, y - r * 0.5, r * 0.46, 0, 7); g.moveTo(x - r * 0.5 + r * 0.46, y + r * 0.2); g.arc(x - r * 0.5, y + r * 0.2, r * 0.46, 0, 7); g.moveTo(x + r * 0.5 + r * 0.46, y + r * 0.2); g.arc(x + r * 0.5, y + r * 0.2, r * 0.46, 0, 7); g.moveTo(x, y); g.lineTo(x + r * 0.38, y + r * 1.1); g.lineTo(x - r * 0.38, y + r * 1.1); g.closePath(); }
  g.fill();
}

/** rank: 'A','2'..'9','T' or '10','J','Q','K'; suit: 'S','H','D','C'. */
export function drawFace(rank, suit) {
  rank = RANK_LABEL[rank] ?? rank;
  const Wc = 360, Hc = 500, c = document.createElement('canvas'); c.width = Wc; c.height = Hc;
  const g = c.getContext('2d'), col = suit === 'H' || suit === 'D' ? RED : INK;
  g.fillStyle = STOCK; g.fillRect(0, 0, Wc, Hc);
  g.strokeStyle = 'rgba(46,45,53,0.10)'; g.lineWidth = 3; g.strokeRect(14, 14, Wc - 28, Hc - 28);
  const index = () => {
    g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.font = `700 ${rank === '10' ? 76 : 88}px "Schibsted Grotesk", system-ui, sans-serif`;
    g.fillText(rank, 62, 100);
    pip(g, suit, 62, 142, 20);
  };
  index();
  g.save(); g.translate(Wc, Hc); g.rotate(Math.PI); index(); g.restore();
  g.fillStyle = col;
  if (rank === 'A') pip(g, suit, Wc / 2, Hc / 2, 62);
  else if ('JQK'.includes(rank)) {
    g.save(); g.globalAlpha = 0.12; g.beginPath(); g.roundRect(100, 128, Wc - 200, Hc - 256, 18); g.fill(); g.restore();
    g.lineWidth = 12; g.strokeStyle = col; g.lineJoin = 'round';
    const cx = Wc / 2, cy = Hc / 2 - 16;
    if (rank === 'K') { g.beginPath(); g.moveTo(cx - 62, cy + 30); g.lineTo(cx - 62, cy - 34); g.lineTo(cx - 31, cy); g.lineTo(cx, cy - 50); g.lineTo(cx + 31, cy); g.lineTo(cx + 62, cy - 34); g.lineTo(cx + 62, cy + 30); g.closePath(); g.fill(); }
    else if (rank === 'Q') { g.beginPath(); g.arc(cx, cy, 44, 0, 7); g.stroke(); g.beginPath(); g.arc(cx, cy, 12, 0, 7); g.fill(); }
    else { g.beginPath(); g.roundRect(cx - 13, cy - 62, 26, 110, 13); g.fill(); g.beginPath(); g.arc(cx, cy - 78, 14, 0, 7); g.fill(); }
    pip(g, suit, cx, cy + 86, 18);
  } else {
    const n = +rank;
    pip(g, suit, Wc / 2, Hc / 2 - 34, 44);
    const rows = n > 5 ? [Math.ceil(n / 2), Math.floor(n / 2)] : [n];
    rows.forEach((k, ri) => { for (let i = 0; i < k; i++) { g.beginPath(); g.arc(Wc / 2 + (i - (k - 1) / 2) * 30, Hc / 2 + 62 + ri * 30, 8, 0, 7); g.fill(); } });
  }
  return c;
}

export function drawBack() {
  const Wc = 360, Hc = 500, c = document.createElement('canvas'); c.width = Wc; c.height = Hc;
  const g = c.getContext('2d');
  const P = cardBackPalette();   // the player's equipped card back (cosmetics.js); copper stripe by default
  g.fillStyle = STOCK; g.fillRect(0, 0, Wc, Hc);
  g.save(); g.beginPath(); g.roundRect(20, 20, Wc - 40, Hc - 40, 16); g.clip();
  g.fillStyle = P.base; g.fillRect(0, 0, Wc, Hc);
  g.translate(Wc / 2, Hc / 2); g.rotate(-0.6);
  for (let i = -20; i < 20; i++) { g.fillStyle = i % 3 === 0 ? P.a : i % 3 === 1 ? P.b : P.base; g.fillRect(-500, i * 26, 1000, 26); }
  g.restore();
  g.strokeStyle = P.line; g.lineWidth = 6;
  g.beginPath(); g.moveTo(Wc / 2, Hc / 2 - 60); g.lineTo(Wc / 2 + 40, Hc / 2); g.lineTo(Wc / 2, Hc / 2 + 60); g.lineTo(Wc / 2 - 40, Hc / 2); g.closePath(); g.stroke();
  return c;
}

/**
 * 3D cards lying on felt. A card is a Group with a child `flip` group:
 * flip.rotation.z = 0 face up, π face down.
 */
export function createCardKit(renderer, scene, { w = 0.095, h = 0.132 } = {}) {
  const shape = new THREE.Shape(), x = -w / 2, y = -h / 2, r = 0.006;
  shape.moveTo(x + r, y); shape.lineTo(x + w - r, y); shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r); shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h); shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r); shape.quadraticCurveTo(x, y, x + r, y);
  const base = new THREE.ShapeGeometry(shape, 4);
  { const p = base.attributes.position, uv = base.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + w / 2) / w, (p.getY(i) + h / 2) / h); }
  const frontGeo = base.clone().rotateX(-Math.PI / 2).translate(0, 0.0004, 0);
  const backGeo = base.clone().rotateX(Math.PI / 2).translate(0, -0.0004, 0);
  const aniso = renderer.capabilities.getMaxAnisotropy();
  const tex = (canvas) => { const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; return new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 }); };
  const cache = {};
  let backMat = null;
  return {
    w, h,
    /** Call once fonts are loaded. */
    ready() { backMat = tex(drawBack()); },
    make(card, at) {
      const g = new THREE.Group(), flip = new THREE.Group();
      const key = card.rank + card.suit;
      cache[key] ||= tex(drawFace(card.rank, card.suit));
      for (const m of [new THREE.Mesh(frontGeo, cache[key]), new THREE.Mesh(backGeo, backMat)]) { m.castShadow = true; m.receiveShadow = true; flip.add(m); }
      g.add(flip); g.userData.flip = flip; flip.rotation.z = Math.PI;
      if (at) g.position.copy(at);
      scene.add(g);
      return g;
    },
    setFlip(mesh, theta) { const f = mesh.userData.flip; f.rotation.z = theta; f.position.y = Math.abs(Math.sin(theta)) * w * 0.5; },
  };
}
