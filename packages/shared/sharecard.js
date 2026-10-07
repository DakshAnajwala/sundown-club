/**
 * sharecard.js — a 1200x630 result card drawn on a canvas in the browser (no
 * server, nothing uploaded), plus the share action: the system share sheet with
 * the picture where the browser allows it, otherwise the text copied and the
 * picture offered as a download. The card never shows a typed name: only the
 * made-up board name or none.
 *
 *   const png = await renderShareCard({ eyebrow: 'Sundown Daily #5', title: 'Two pair', sub: '10 coins', game: 'Video Poker', accent: '#e8b860', foot: 'Level 4 · 3-day streak', grid: '🟩⬛🟩⬛⬛' });
 *   await shareResult({ title, text, url, png });
 */
const W = 1200, H = 630;

function wrap(g, text, maxWidth) {
  const words = String(text).split(' '), lines = [];
  let line = '';
  for (const w of words) { const t = line ? `${line} ${w}` : w; if (g.measureText(t).width > maxWidth && line) { lines.push(line); line = w; } else line = t; }
  if (line) lines.push(line);
  return lines;
}

/** Draw the card. Returns a PNG Blob (or null where canvas is not available). */
export async function renderShareCard({ eyebrow = 'Sundown Club', title = '', sub = '', game = '', accent = '#f0a868', foot = '', grid = '' } = {}) {
  try {
    if (typeof document === 'undefined') return null;
    try { await Promise.all(['400 90px "Young Serif"', '600 30px "Schibsted Grotesk"', '500 28px "IBM Plex Mono"'].map((f) => document.fonts.load(f))); } catch { /* fall back to system fonts */ }
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    // dusk sky and hills, like the hub
    const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#171a36'); sky.addColorStop(0.55, '#3a2218'); sky.addColorStop(1, '#7a4424');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    const glow = g.createRadialGradient(W * 0.82, H * 0.62, 10, W * 0.82, H * 0.62, 340); glow.addColorStop(0, 'rgba(255,212,154,.85)'); glow.addColorStop(0.3, 'rgba(240,168,104,.35)'); glow.addColorStop(1, 'rgba(240,168,104,0)');
    g.fillStyle = glow; g.fillRect(0, 0, W, H);
    g.fillStyle = '#2a1b18'; g.beginPath(); g.moveTo(0, 520); for (let x = 0; x <= W; x += 60) g.lineTo(x, 500 + 22 * Math.sin(x / 130) + 14 * Math.sin(x / 47)); g.lineTo(W, H); g.lineTo(0, H); g.fill();
    g.fillStyle = '#1b1210'; g.beginPath(); g.moveTo(0, 560); for (let x = 0; x <= W; x += 60) g.lineTo(x, 556 + 16 * Math.sin(x / 90 + 1)); g.lineTo(W, H); g.lineTo(0, H); g.fill();
    // wordmark
    g.fillStyle = '#f1ebe0'; g.font = '400 34px "Young Serif", Georgia, serif'; g.textBaseline = 'alphabetic'; g.fillText('sundown club', 96, 100);
    g.fillStyle = accent; g.beginPath(); g.arc(70, 88, 12, Math.PI, 0); g.fill();
    // text block
    g.fillStyle = accent; g.font = '500 28px "IBM Plex Mono", ui-monospace, monospace'; g.fillText(String(eyebrow).toUpperCase(), 96, 210);
    g.fillStyle = '#f1ebe0'; g.font = '400 104px "Young Serif", Georgia, serif';
    const lines = wrap(g, title, 780).slice(0, 2);
    lines.forEach((l, i) => g.fillText(l, 96, 320 + i * 112));
    let y = 320 + (lines.length - 1) * 112 + 70;
    if (sub) { g.fillStyle = '#e2d5c5'; g.font = '500 42px "Schibsted Grotesk", system-ui, sans-serif'; g.fillText(sub, 96, y); y += 56; }
    if (grid) { g.font = '60px system-ui, sans-serif'; g.fillText(grid, 96, y + 20); }
    g.fillStyle = '#b9a896'; g.font = '500 28px "Schibsted Grotesk", system-ui, sans-serif';
    if (game) g.fillText(game, 96, 560);
    if (foot) { g.textAlign = 'right'; g.fillText(foot, W - 96, 560); g.textAlign = 'left'; }
    return await new Promise((res) => c.toBlob((b) => res(b), 'image/png'));
  } catch { return null; }
}

/**
 * Share a result. Returns 'shared' | 'copied' | 'downloaded' | 'failed'.
 * Order: the share sheet (with the picture if files are supported), else the
 * clipboard (text and link), else a PNG download.
 */
export async function shareResult({ title, text, url, png } = {}) {
  try {
    const full = [text, url].filter(Boolean).join('\n');
    if (typeof navigator !== 'undefined' && navigator.share) {
      const file = png ? new File([png], 'sundown-club.png', { type: 'image/png' }) : null;
      const data = file && navigator.canShare?.({ files: [file] }) ? { title, text, url, files: [file] } : { title, text, url };
      try { await navigator.share(data); return 'shared'; } catch (e) { if (e?.name === 'AbortError') return 'failed'; /* fall through */ }
    }
    try { await navigator.clipboard.writeText(full); return 'copied'; } catch { /* clipboard blocked */ }
    if (png) {
      const a = document.createElement('a'); a.href = URL.createObjectURL(png); a.download = 'sundown-club.png';
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      return 'downloaded';
    }
  } catch { /* fall through */ }
  return 'failed';
}
