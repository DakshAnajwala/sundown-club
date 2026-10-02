/**
 * roundpanel.js — the small after-round note every game shows: XP gained,
 * tonight's quests with progress, the streak. It never blocks play: it sits in
 * a corner, ignores the pointer, and fades by itself.
 *
 *   showRoundPanel(reportRound(...), { corner: 'bl', ttl: 7000 });
 *
 * Text only goes in through textContent. Respects prefers-reduced-motion.
 * Spec: docs/retention/SPEC-daily.md §6.
 */
const STYLE_ID = 'sc-rp-style';
const CSS = `
.sc-rp { position: fixed; z-index: 40; width: min(280px, calc(100vw - 24px)); padding: 12px 14px 12px; border-radius: 14px; background: rgba(24,20,31,.9); color: #f1ebe0; border: 1px solid rgba(241,235,224,.14); font: 13px/1.35 "Schibsted Grotesk", ui-sans-serif, system-ui, sans-serif; box-shadow: 0 10px 30px rgba(0,0,0,.35); pointer-events: none; transition: opacity .5s, transform .5s; }
.sc-rp.bl { left: 12px; bottom: 12px; } .sc-rp.br { right: 12px; bottom: 12px; } .sc-rp.tl { left: 12px; top: 12px; } .sc-rp.tr { right: 12px; top: 12px; }
.sc-rp.in { animation: sc-rp-in .35s ease-out; }
.sc-rp.out { opacity: 0; transform: translateY(6px); }
.sc-rp .h { display: flex; justify-content: space-between; gap: 10px; align-items: baseline; margin-bottom: 8px; }
.sc-rp .xp { font: 600 15px "IBM Plex Mono", ui-monospace, monospace; color: #f0a868; }
.sc-rp .lv { color: #a39cab; font-size: 12px; }
.sc-rp .up { color: #8fe3cf; font-weight: 600; }
.sc-rp .q { margin: 6px 0 0; }
.sc-rp .q span { display: flex; justify-content: space-between; gap: 8px; }
.sc-rp .q b { font: 500 12px "IBM Plex Mono", ui-monospace, monospace; color: #a39cab; white-space: nowrap; }
.sc-rp .q.done b, .sc-rp .q.now b { color: #8fe3cf; }
.sc-rp .bar { height: 3px; margin-top: 3px; border-radius: 3px; background: rgba(241,235,224,.12); overflow: hidden; }
.sc-rp .bar i { display: block; height: 100%; background: #f0a868; }
.sc-rp .q.done .bar i { background: #8fe3cf; }
.sc-rp .f { margin-top: 9px; color: #a39cab; font-size: 12px; }
@keyframes sc-rp-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .sc-rp, .sc-rp.in { animation: none; transition: none; } }
`;

/** A plain one-paragraph note in the same card style (links, ghosts). Same rules: it never blocks, it fades. */
export function showNote(text, opts = {}) {
  try {
    if (typeof document === 'undefined') return;
    if (!document.getElementById(STYLE_ID)) { const s = el('style'); s.id = STYLE_ID; s.textContent = CSS; document.head.append(s); }
    if (current) { clearTimeout(timer); current.remove(); current = null; }
    const root = el('div', `sc-rp in ${opts.corner || 'bl'}`);
    if (opts.style) Object.assign(root.style, opts.style);
    root.setAttribute('role', 'status'); root.setAttribute('aria-live', 'polite');
    root.append(el('div', 'f', text));
    root.querySelector('.f').style.marginTop = '0';
    root.querySelector('.f').style.color = '#f1ebe0';
    document.body.append(root);
    current = root;
    timer = setTimeout(hideRoundPanel, opts.ttl || 8000);
  } catch { /* a missing note must never break a game */ }
}

let current = null;
let timer = null;

function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

export function hideRoundPanel() {
  clearTimeout(timer);
  if (!current) return;
  const node = current; current = null;
  node.classList.add('out');
  setTimeout(() => node.remove(), 600);
}

export function showRoundPanel(r, opts = {}) {
  try {
    if (!r || typeof document === 'undefined') return;
    if (!document.getElementById(STYLE_ID)) { const s = el('style'); s.id = STYLE_ID; s.textContent = CSS; document.head.append(s); }
    if (current) { clearTimeout(timer); current.remove(); current = null; }
    const root = el('div', `sc-rp in ${opts.corner || 'bl'}`);
    if (opts.style) Object.assign(root.style, opts.style);   // e.g. { top: '70px' } to sit under a game's own buttons
    root.setAttribute('role', 'status'); root.setAttribute('aria-live', 'polite');
    const h = el('div', 'h');
    h.append(el('span', 'xp', r.xp > 0 ? `+${r.xp} XP` : 'Round done'));
    const lv = el('span', 'lv');
    if (r.level?.leveled) lv.append(el('span', 'up', `Level up! `), document.createTextNode(`Lv ${r.level.level} · ${r.level.title}`));
    else lv.textContent = `Lv ${r.level?.level ?? 1} · ${r.level?.title ?? ''}`;
    h.append(lv);
    root.append(h);
    for (const q of r.quests || []) {
      const row = el('div', `q${q.done ? ' done' : ''}${q.justDone ? ' now' : ''}`);
      const line = el('span');
      line.append(el('span', null, q.text), el('b', null, q.justDone ? `Done +${q.xp}` : q.done ? 'Done' : `${q.p}/${q.target}`));
      const bar = el('div', 'bar'); const fill = el('i'); fill.style.width = `${Math.min(100, (q.p / q.target) * 100)}%`; bar.append(fill);
      row.append(line, bar); root.append(row);
    }
    // Content layer: unlocks, mastery, the weekly goal (three lines at most, newest first)
    const extras = [];
    for (const u of r.unlocked || []) extras.push([`Unlocked: ${u.name}`, `+${u.xp}`]);
    for (const m of r.mastery?.milestones || []) extras.push([`${m.name} (mastery ${m.level})`, m.item ? 'badge' : `+${m.tokens || 0} token`]);
    if (r.mastery?.leveled && !(r.mastery.milestones || []).length) extras.push([`Mastery level ${r.mastery.level}`, '']);
    if (r.weekly?.justDone) extras.push(['Weekly goal done', `+${r.weekly.reward?.xp || 0}`]);
    for (const [t, v] of extras.slice(0, 3)) { const row = el('div', 'q done now'); const line = el('span'); line.append(el('span', null, t), el('b', null, v)); row.append(line); root.append(row); }
    const foot = el('div', 'f');
    if (r.firstWin) foot.textContent = `First win! +${r.firstWinXp} XP. Press Esc twice to open the club and set up your table.`;
    else if (r.allDone) foot.textContent = "Tonight's table is cleared: +60 XP and a token.";
    else if (r.streak?.earnedToday) foot.textContent = r.streak.days > 1 ? `Day ${r.streak.days} in a row.` : 'Today counts. Day 1.';
    else foot.textContent = 'Play 5 minutes or finish a quest to count today.';
    root.append(foot);
    document.body.append(root);
    current = root;
    timer = setTimeout(hideRoundPanel, opts.ttl || 7000);
  } catch { /* a missing note must never break a game */ }
}
