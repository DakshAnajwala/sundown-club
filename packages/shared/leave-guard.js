/**
 * leave-guard.js — "Esc once to ask, Esc again to leave" for every game.
 *
 *   const guard = createLeaveGuard({ game: 'Blackjack', save: () => store.save() });
 *   // first Escape opens the card, second Escape saves and goes to the hub.
 *
 * A game that already has its own pause menu on Escape (Parking Precision)
 * skips the overlay and calls leaveToHub() from that menu instead, so there is
 * one confirmation, not two.
 *
 * While the card is open it swallows every key (capture phase), so nothing in
 * the game reacts underneath: Escape leaves, Enter or Space stays, anything
 * else is ignored.
 */

const HUB = '/';
let leaving = false;

/** Save, then go to the hub. `save` may be sync or return a promise; a failed save never blocks leaving. */
export async function leaveToHub({ save, href = HUB } = {}) {
  if (leaving) return;
  leaving = true;
  try { await save?.(); } catch { /* leave anyway: the game's own storage already has the last good state */ }
  location.href = href;
}

const CSS = `
.sc-leave { position: fixed; inset: 0; z-index: 2147483000; display: grid; place-items: center; padding: 16px;
  background: rgba(14, 10, 12, .56); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
  font-family: "Schibsted Grotesk", system-ui, sans-serif; color: #f3e7d8; opacity: 0; transition: opacity .18s ease; }
.sc-leave.on { opacity: 1; }
.sc-leave .card { width: min(420px, 100%); background: #1b1512; border: 1px solid rgba(243,231,216,.14); border-radius: 16px;
  padding: 26px 26px 22px; box-shadow: 0 30px 80px -30px rgba(0,0,0,.8); transform: translateY(8px) scale(.98); transition: transform .22s cubic-bezier(.2,.8,.2,1); }
.sc-leave.on .card { transform: none; }
.sc-leave .eyebrow { font: 500 11px "IBM Plex Mono", ui-monospace, monospace; letter-spacing: .14em; text-transform: uppercase; color: #f0a868; }
.sc-leave h2 { margin: 8px 0 6px; font: 400 30px/1.1 "Young Serif", Georgia, serif; }
.sc-leave p { margin: 0; color: #b9a896; line-height: 1.5; font-size: 15px; }
.sc-leave .row { display: flex; gap: 10px; margin-top: 22px; flex-wrap: wrap; }
.sc-leave button { display: inline-flex; align-items: center; gap: 10px; padding: 11px 16px; border-radius: 10px; cursor: pointer;
  font: 600 15px "Schibsted Grotesk", system-ui, sans-serif; border: 1px solid rgba(243,231,216,.14); color: #f3e7d8; background: rgba(243,231,216,.06); }
.sc-leave button.go { background: #f0a868; color: #1b1209; border-color: transparent; }
.sc-leave kbd { font: 500 11px "IBM Plex Mono", ui-monospace, monospace; padding: 1px 6px; border-radius: 4px; border: 1px solid currentColor; opacity: .6; }
.sc-leave button:focus-visible { outline: 2px solid #f3e7d8; outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .sc-leave, .sc-leave .card { transition: none; } }
`;

/**
 * @param {object} o
 * @param {string} o.game          name shown on the card
 * @param {() => any} [o.save]     called before leaving
 * @param {() => void} [o.onOpen]  e.g. pause the game
 * @param {() => void} [o.onClose] e.g. resume
 * @param {() => boolean} [o.canOpen] return false to let the game keep Escape (a menu of its own is open)
 * @param {string} [o.href]        where "leave" goes (default: the hub at /)
 */
export function createLeaveGuard({ game, save, onOpen, onClose, canOpen = () => true, href = HUB }) {
  if (!document.getElementById('sc-leave-css')) {
    const s = document.createElement('style');
    s.id = 'sc-leave-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }
  const root = document.createElement('div');
  root.className = 'sc-leave';
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'sc-leave-title');
  root.innerHTML = `<div class="card">
      <div class="eyebrow">Sundown Club</div>
      <h2 id="sc-leave-title"></h2>
      <p>Your progress is saved first. Press Esc again to head back to the club.</p>
      <div class="row"><button class="go" type="button">Leave <kbd>Esc</kbd></button><button class="stay" type="button">Stay <kbd>Enter</kbd></button></div>
    </div>`;
  root.querySelector('h2').textContent = `Leave ${game}?`;
  document.body.appendChild(root);
  const goBtn = root.querySelector('.go'), stayBtn = root.querySelector('.stay');
  let isOpen = false, returnFocus = null;

  function open() {
    if (isOpen || leaving) return;
    isOpen = true;
    returnFocus = document.activeElement;
    root.hidden = false;
    requestAnimationFrame(() => root.classList.add('on'));
    stayBtn.focus({ preventScroll: true });
    onOpen?.();
  }
  function close() {
    if (!isOpen) return;
    isOpen = false;
    root.classList.remove('on');
    root.hidden = true;
    if (returnFocus instanceof HTMLElement) returnFocus.focus({ preventScroll: true });
    onClose?.();
  }
  const leave = () => leaveToHub({ save, href });

  goBtn.addEventListener('click', leave);
  stayBtn.addEventListener('click', close);
  root.addEventListener('click', (e) => { if (e.target === root) close(); });

  // Capture phase so the game never sees keys while the card is up.
  addEventListener('keydown', (e) => {
    if (isOpen) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.repeat) return;
      if (e.key === 'Escape') leave();
      else if (e.key === 'Enter' || e.key === ' ') close();
      return;
    }
    if (e.key === 'Escape' && !e.repeat && canOpen()) {
      e.preventDefault();
      e.stopImmediatePropagation();
      open();
    }
  }, true);

  return { open, close, leave, get isOpen() { return isOpen; } };
}
