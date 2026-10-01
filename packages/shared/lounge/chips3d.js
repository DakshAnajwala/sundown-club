/** chips3d.js — Pastel chip set (Blackjack SPEC §8.4), 3D stacks and helpers. */
import * as THREE from 'three';

export const CHIP_COLORS = { 1: '#cfc6b8', 5: '#e8e1d3', 25: '#86ad8f', 100: '#4a5568', 500: '#9d86b5', 1000: '#dcb45e', 5000: '#c7735e', 25000: '#6e9fb4' };
export const CHIP_INK = { 1: '#2e2d35', 5: '#2e2d35', 25: '#2e2d35', 100: '#f3ede2', 500: '#f3ede2', 1000: '#2e2d35', 5000: '#f3ede2', 25000: '#f3ede2' };
export const DENOMS = [25000, 5000, 1000, 500, 100, 25, 5, 1];
export const CHIP_R = 0.0254, CHIP_H = 0.0043;

/** Fewest chips for an amount, largest first. */
export function breakdown(amount) { const out = []; for (const d of DENOMS) while (amount >= d) { out.push(d); amount -= d; } return out; }

export function createChipKit(scene) {
  const geo = new THREE.CylinderGeometry(CHIP_R, CHIP_R, CHIP_H, 28);
  const mats = {};
  function top(v) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = CHIP_COLORS[v]; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = '#f3ede2'; g.lineWidth = 22;
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; g.beginPath(); g.arc(128, 128, 116, a - 0.16, a + 0.16); g.stroke(); }
    g.lineWidth = 5; g.beginPath(); g.arc(128, 128, 80, 0, Math.PI * 2); g.stroke();
    g.fillStyle = CHIP_INK[v];
    const label = v >= 1000 ? `${v / 1000}K` : String(v);
    g.font = `600 ${label.length > 2 ? 58 : 70}px "IBM Plex Mono", monospace`;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, 128, 132);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
  }
  function side(v) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 32;
    const g = c.getContext('2d');
    g.fillStyle = CHIP_COLORS[v]; g.fillRect(0, 0, 512, 32);
    g.fillStyle = '#f3ede2'; for (let i = 0; i < 6; i++) g.fillRect(i * (512 / 6) + 20, 0, 34, 32);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  function material(v) {
    if (!mats[v]) { const t = new THREE.MeshStandardMaterial({ map: top(v), roughness: 0.75 }); mats[v] = [new THREE.MeshStandardMaterial({ map: side(v), roughness: 0.75 }), t, t]; }
    return mats[v];
  }
  function make(v) { const m = new THREE.Mesh(geo, material(v)); m.castShadow = true; m.receiveShadow = true; m.rotation.y = Math.random() * 6.28; scene.add(m); return m; }

  /**
   * A tidy stack (or a few stacks side by side) that shows an amount. Call
   * set(amount) to rebuild; position the returned group.
   */
  function stack({ maxPerColumn = 12, spacing = CHIP_R * 2.15 } = {}) {
    const group = new THREE.Group(); scene.add(group);
    let shown = -1;
    return {
      group,
      set(amount) {
        amount = Math.max(0, Math.round(amount));
        if (amount === shown) return; shown = amount;
        for (const c of [...group.children]) group.remove(c);
        const chips = breakdown(amount);
        const cols = [];
        for (const v of chips) { let col = cols.find((c) => c.v === v && c.n < maxPerColumn); if (!col) { col = { v, n: 0 }; cols.push(col); } col.n++; }
        cols.forEach((c, i) => {
          for (let j = 0; j < c.n; j++) {
            const m = new THREE.Mesh(geo, material(c.v)); m.castShadow = true; m.receiveShadow = true;
            m.position.set((i % 3) * spacing - spacing, CHIP_H / 2 + j * CHIP_H, Math.floor(i / 3) * spacing); m.rotation.y = (i * 1.7 + j * 0.9) % 6.28;
            group.add(m);
          }
        });
      },
    };
  }
  return { geo, material, make, stack };
}
