/**
 * SceneOverlay.js — the DOM layer over a story scene (design/SPEC-scenes.md
 * §2.4): letterbox bars, the subtitle with the speaker's name in their
 * colour, a fade to black, the "Hold Enter to skip" ring, and the ending
 * choice. Plain DOM, no framework; the ScenePlayer drives it every frame.
 */

const CSS = `
.scn { position: fixed; inset: 0; pointer-events: none; font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; z-index: 20; }
.scn-bar { position: absolute; left: 0; right: 0; height: 8vh; background: #000; transition: transform 0.6s ease; }
.scn-bar.top { top: 0; } .scn-bar.bot { bottom: 0; }
.scn.off .scn-bar.top { transform: translateY(-100%); } .scn.off .scn-bar.bot { transform: translateY(100%); }
.scn-fade { position: absolute; inset: 0; background: #000; opacity: 0; }
.scn-sub { position: absolute; left: 50%; bottom: calc(8vh + 3.2vh); transform: translateX(-50%); max-width: min(76vw, 900px);
  text-align: center; color: #eef0f3; font-size: clamp(16px, 2.3vh, 24px); line-height: 1.35; text-shadow: 0 1px 3px rgba(0,0,0,0.9), 0 0 12px rgba(0,0,0,0.6);
  opacity: 0; transition: opacity 0.18s ease; }
.scn-sub.on { opacity: 1; }
.scn-who { display: block; font-size: 0.72em; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 0.25em; }
.scn-skip { position: absolute; right: 2.2vw; bottom: calc(8vh * 0.5); transform: translateY(50%); display: flex; align-items: center; gap: 8px;
  color: rgba(238,240,243,0.55); font-size: 12px; letter-spacing: 0.04em; }
.scn-ring { width: 18px; height: 18px; border-radius: 50%; background: conic-gradient(#eef0f3 var(--p, 0%), rgba(255,255,255,0.18) 0); -webkit-mask: radial-gradient(circle, transparent 5px, #000 6px); mask: radial-gradient(circle, transparent 5px, #000 6px); }
.scn-title { position: absolute; left: 2.4vw; top: calc(8vh * 0.5); transform: translateY(-50%); color: rgba(238,240,243,0.7); font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase; }
.scn-choice { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); display: none; flex-direction: column; gap: 14px; align-items: center; pointer-events: auto; }
.scn-choice.on { display: flex; }
.scn-choice p { color: #eef0f3; font-size: clamp(16px, 2.2vh, 22px); margin: 0 0 6px; text-shadow: 0 1px 3px #000; }
.scn-choice button { min-width: 320px; padding: 12px 22px; font: 600 15px system-ui, sans-serif; color: #eef0f3; background: rgba(12,17,26,0.82);
  border: 1px solid rgba(255,255,255,0.18); border-radius: 8px; cursor: pointer; }
.scn-choice button.sel, .scn-choice button:hover { border-color: #4fc2b8; color: #4fc2b8; }
`;

export function createSceneOverlay(parent = document.body) {
  if (!document.getElementById('scn-css')) {
    const st = document.createElement('style');
    st.id = 'scn-css';
    st.textContent = CSS;
    document.head.append(st);
  }
  const root = document.createElement('div');
  root.className = 'scn off';
  root.innerHTML = `<div class="scn-fade"></div><div class="scn-bar top"></div><div class="scn-bar bot"></div>
    <div class="scn-title"></div><div class="scn-sub"><span class="scn-who"></span><span class="scn-text"></span></div>
    <div class="scn-skip"><span class="scn-ring"></span><span>Hold Enter to skip</span></div><div class="scn-choice"></div>`;
  parent.append(root);
  const $ = (s) => root.querySelector(s);
  const fade = $('.scn-fade');
  const sub = $('.scn-sub');
  const who = $('.scn-who');
  const text = $('.scn-text');
  const ring = $('.scn-ring');
  const title = $('.scn-title');
  const choice = $('.scn-choice');
  let lastLine = null;
  let selected = 0;
  let onPick = null;

  const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;

  return {
    root,
    show(name = '') {
      root.classList.remove('off');
      title.textContent = name;
    },
    hide() {
      root.classList.add('off');
      sub.classList.remove('on');
      choice.classList.remove('on');
      fade.style.opacity = 0;
      lastLine = null;
    },
    /** line: { name, color, text } or null */
    setLine(line) {
      if (line === lastLine) return;
      lastLine = line;
      if (!line) {
        sub.classList.remove('on');
        return;
      }
      who.textContent = line.name ?? '';
      who.style.color = line.color != null ? hex(line.color) : '#eef0f3';
      who.style.display = line.name ? 'block' : 'none';
      text.textContent = line.text;
      sub.classList.add('on');
    },
    setFade(v) {
      fade.style.opacity = String(Math.max(0, Math.min(1, v)));
    },
    setSkip(p) {
      ring.style.setProperty('--p', `${Math.round(p * 100)}%`);
    },
    /** Show the choice; `pick(i)` is called once. Keyboard: arrows/1-2 + Enter. */
    showChoice(prompt, options, pick) {
      selected = 0;
      onPick = pick;
      choice.innerHTML = '';
      const p = document.createElement('p');
      p.textContent = prompt;
      choice.append(p);
      options.forEach((o, i) => {
        const b = document.createElement('button');
        b.textContent = o;
        if (i === 0) b.className = 'sel';
        b.addEventListener('click', () => this.pickChoice(i));
        choice.append(b);
      });
      choice.classList.add('on');
    },
    moveChoice(d) {
      const bs = [...choice.querySelectorAll('button')];
      if (!bs.length) return;
      selected = (selected + d + bs.length) % bs.length;
      bs.forEach((b, i) => (b.className = i === selected ? 'sel' : ''));
    },
    pickChoice(i = selected) {
      if (!onPick) return;
      const f = onPick;
      onPick = null;
      choice.classList.remove('on');
      f(i);
    },
    get choosing() {
      return !!onPick;
    },
    dispose() {
      root.remove();
    },
  };
}
