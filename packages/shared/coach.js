/**
 * coach.js — the tutorial card every game uses (owner, 1 Oct 2026: "idiot
 * proof, no complex jargon, proper English").
 *
 * A paper card at the top of the screen with a title, short paragraphs, an
 * optional list of terms, and buttons. While a step waits for the player to do
 * something, the button they should press pulses.
 *
 *   const coach = createCoach({ game: 'Blackjack' });
 *   coach.show({ title, body: ['…'], list: [['Hit', 'take another card']], buttons: [{ label: 'Next', primary: true, onClick }], pulse: ['#bHit'] });
 *   coach.nudge();   // shake when the player presses the wrong thing
 *   coach.offerOnce('blackjack', { onYes, onNo });   // first visit: "New to blackjack?"
 *
 * All text goes in with textContent: nothing here is treated as HTML.
 */

const CSS = `
.sc-coach { position: fixed; left: 50%; top: 16px; transform: translate(-50%, -8px); z-index: 2147482000; width: min(500px, calc(100vw - 32px));
  background: rgba(248, 243, 234, .96); color: #2c2a30; border: 1px solid rgba(44,42,48,.14); border-radius: 14px; padding: 18px 20px 16px;
  box-shadow: 0 18px 50px -18px rgba(30,24,30,.45); font: 15px/1.5 "Schibsted Grotesk", ui-sans-serif, system-ui, sans-serif;
  opacity: 0; transition: opacity .2s ease, transform .25s cubic-bezier(.2,.8,.2,1); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
.sc-coach.on { opacity: 1; transform: translate(-50%, 0); }
.sc-coach .top { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
.sc-coach .step { font: 600 11px "IBM Plex Mono", ui-monospace, monospace; letter-spacing: .12em; text-transform: uppercase; color: #8a6a3a; }
.sc-coach .skip { background: none; border: 0; padding: 0; color: #6b6670; font: 500 12px "Schibsted Grotesk", system-ui, sans-serif; text-decoration: underline; cursor: pointer; }
.sc-coach h2 { margin: 6px 0 8px; font: 400 24px/1.15 "Young Serif", Georgia, serif; }
.sc-coach p { margin: 0 0 8px; }
.sc-coach dl { margin: 4px 0 10px; display: grid; grid-template-columns: max-content 1fr; gap: 4px 14px; }
.sc-coach dt { font-weight: 700; }
.sc-coach dd { margin: 0; color: #4a4650; }
.sc-coach .do { margin: 10px 0 0; padding: 8px 12px; border-radius: 8px; background: rgba(240,168,104,.18); font-weight: 600; }
.sc-coach .do:empty { display: none; }
.sc-coach .row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
.sc-coach .row:empty { display: none; }
.sc-coach button.b { padding: 9px 14px; border-radius: 8px; border: 1px solid rgba(44,42,48,.14); background: #fff; font: 600 14px "Schibsted Grotesk", system-ui, sans-serif; color: #2c2a30; cursor: pointer; }
.sc-coach button.b.primary { background: #3f5f59; color: #f6f0e4; border-color: transparent; }
.sc-coach button:focus-visible { outline: 2px solid #3d5f86; outline-offset: 2px; }
.sc-coach.nudge { animation: sc-nudge .35s ease; }
@keyframes sc-nudge { 25% { transform: translate(calc(-50% - 6px), 0); } 75% { transform: translate(calc(-50% + 6px), 0); } }
.coach-pulse { position: relative; animation: sc-pulse 1.3s ease-in-out infinite; outline: 3px solid #f0a868 !important; outline-offset: 3px; z-index: 1; }
@keyframes sc-pulse { 50% { outline-color: rgba(240,168,104,.25); } }
@media (prefers-reduced-motion: reduce) { .sc-coach, .sc-coach.nudge, .coach-pulse { transition: none; animation: none; } }
`;

export function createCoach({ game, onSkip } = {}) {
  if (!document.getElementById('sc-coach-css')) { const s = document.createElement('style'); s.id = 'sc-coach-css'; s.textContent = CSS; document.head.appendChild(s); }
  const root = document.createElement('section');
  root.className = 'sc-coach'; root.hidden = true;
  root.setAttribute('role', 'dialog'); root.setAttribute('aria-live', 'polite'); root.setAttribute('aria-label', `${game} tutorial`);
  root.innerHTML = '<div class="top"><span class="step"></span><button class="skip" type="button">Skip tutorial</button></div><h2></h2><div class="body"></div><dl></dl><p class="do"></p><div class="row"></div>';
  document.body.appendChild(root);
  const $ = (s) => root.querySelector(s);
  let pulsing = [], active = false;
  $('.skip').addEventListener('click', () => onSkip?.());

  function clearPulse() { pulsing.forEach((el) => el.classList.remove('coach-pulse')); pulsing = []; }
  function pulse(selectors = []) {
    clearPulse();
    for (const sel of selectors) document.querySelectorAll(sel).forEach((el) => { el.classList.add('coach-pulse'); pulsing.push(el); });
  }

  /**
   * step: { label, title, body: string[], list: [term, meaning][], todo: string,
   *         buttons: [{ label, primary, onClick }], pulse: selectors[], skippable }
   */
  function show(step) {
    active = true;
    $('.step').textContent = step.label || `${game} tutorial`;
    $('.skip').hidden = step.skippable === false;
    $('h2').textContent = step.title || '';
    const body = $('.body'); body.textContent = '';
    for (const t of step.body || []) { const p = document.createElement('p'); p.textContent = t; body.appendChild(p); }
    const dl = $('dl'); dl.textContent = ''; dl.hidden = !step.list?.length;
    for (const [term, meaning] of step.list || []) { const dt = document.createElement('dt'); dt.textContent = term; const dd = document.createElement('dd'); dd.textContent = meaning; dl.append(dt, dd); }
    $('.do').textContent = step.todo || '';
    const row = $('.row'); row.textContent = '';
    for (const b of step.buttons || []) { const el = document.createElement('button'); el.type = 'button'; el.className = `b${b.primary ? ' primary' : ''}`; el.textContent = b.label; el.addEventListener('click', b.onClick); row.appendChild(el); }
    root.hidden = false;
    requestAnimationFrame(() => root.classList.add('on'));
    pulse(step.pulse);
    if (step.buttons?.length && !step.pulse?.length) row.querySelector('.primary')?.focus({ preventScroll: true });
  }
  function hide() { active = false; clearPulse(); root.classList.remove('on'); root.hidden = true; }
  function nudge() { root.classList.remove('nudge'); void root.offsetWidth; root.classList.add('nudge'); }

  /** First visit only: offer the tutorial. Remembers the answer in localStorage "tut.v1.<key>". */
  function offerOnce(key, { title, body, onYes, onNo }) {
    let seen = null;
    try { seen = localStorage.getItem(`tut.v1.${key}`); } catch { /* storage blocked: offer every time */ }
    if (seen) return false;
    const mark = () => { try { localStorage.setItem(`tut.v1.${key}`, 'seen'); } catch { /* blocked */ } };
    show({
      label: 'Welcome', title, body, skippable: false,
      buttons: [
        { label: 'Show me how', primary: true, onClick: () => { mark(); onYes(); } },
        { label: 'I know how to play', onClick: () => { mark(); hide(); onNo?.(); } },
      ],
    });
    return true;
  }

  return { show, hide, nudge, pulse, offerOnce, get active() { return active; } };
}

/** Mark a game's tutorial as seen (e.g. after the player finishes it). */
export function markTutorialSeen(key) { try { localStorage.setItem(`tut.v1.${key}`, 'seen'); } catch { /* blocked */ } }
