// HTML/CSS HUD overlay. Presentation-only — no game logic, purely renders
// whatever state is pushed into it each frame.

const STYLE = `
#hud { position: fixed; left: 0; right: 0; bottom: 0; display: flex; justify-content: center;
  pointer-events: none; font-family: system-ui, sans-serif; z-index: 10; }
#hud-panel { margin: 18px; padding: 12px 20px; background: rgba(20,24,30,0.72); color: #f2f2ea;
  border-radius: 10px; display: flex; gap: 24px; align-items: center; font-size: 15px; }
#gear-row { display: flex; gap: 6px; }
.gear-btn { width: 26px; height: 26px; display: flex; align-items: center; justify-content: center;
  border-radius: 5px; background: rgba(255,255,255,0.12); font-weight: 700; }
.gear-btn.active { background: #e8d27a; color: #222; }
.gear-btn.rejected { background: #d64545 !important; color: #fff !important; }
#hud .stat { min-width: 70px; text-align: center; }
#hud .stat .label { font-size: 10px; opacity: 0.7; letter-spacing: 0.06em; text-transform: uppercase; }
#hud .stat .value { font-size: 18px; font-weight: 600; }
#level-name { position: fixed; top: 14px; left: 18px; color: #2c333c; font-family: system-ui, sans-serif;
  font-size: 15px; background: rgba(255,255,255,0.55); padding: 6px 12px; border-radius: 8px; z-index: 10; }
#level-switch { position: fixed; top: 14px; right: 18px; display: flex; gap: 8px; z-index: 10; }
#level-switch button { pointer-events: all; cursor: pointer; padding: 6px 12px; border-radius: 8px;
  border: none; background: rgba(255,255,255,0.7); font-family: system-ui, sans-serif; font-size: 13px; }
#level-switch button.active { background: #e8d27a; }
#result-banner { position: fixed; top: 40%; left: 50%; transform: translate(-50%, -50%);
  background: rgba(20,24,30,0.9); color: #fff; padding: 24px 36px; border-radius: 14px;
  font-family: system-ui, sans-serif; text-align: center; z-index: 20; }
#result-banner.hidden { display: none; }
#result-banner .stars { font-size: 32px; margin-bottom: 8px; }
#result-banner .best-tag { margin-top: 6px; font-size: 12px; color: #e8d27a; letter-spacing: 0.06em;
  text-transform: uppercase; }
#result-banner .result-actions { margin-top: 16px; display: flex; gap: 10px; justify-content: center;
  align-items: center; }
#result-banner button { pointer-events: all; cursor: pointer; padding: 8px 16px; border-radius: 8px;
  border: none; background: rgba(255,255,255,0.16); color: #f2f2ea;
  font-family: system-ui, sans-serif; font-size: 13px; }
#result-banner button.primary { background: #e8d27a; color: #222; font-weight: 600; }
#result-banner button:hover { filter: brightness(1.12); }
#result-banner .all-done { font-size: 12px; opacity: 0.7; }
.lvl-badge { color: #c8a83a; font-size: 11px; }
#controls-hint { position: fixed; left: 50%; bottom: 100px; transform: translateX(-50%); color: #2c333c;
  font-family: system-ui, sans-serif; font-size: 13px; background: rgba(255,255,255,0.85); padding: 8px 16px;
  border-radius: 8px; z-index: 10; line-height: 1.5; text-align: center; white-space: nowrap;
  transition: opacity 0.3s; }
#controls-hint.hidden { opacity: 0; pointer-events: none; }
#mirror-toggle { position: fixed; bottom: 18px; right: 18px; z-index: 10; pointer-events: all;
  cursor: pointer; padding: 8px 14px; border-radius: 8px; border: none; background: rgba(255,255,255,0.7);
  font-family: system-ui, sans-serif; font-size: 13px; }
#mirror-toggle.functional { background: #e8d27a; }
`;

export function createHud({
  container,
  levels,
  onSelectLevel,
  onNextLevel,
  onReplay,
  onMirrorModeChange,
  initialMirrorMode = 'decorative',
}) {
  const styleTag = document.createElement('style');
  styleTag.textContent = STYLE;
  document.head.appendChild(styleTag);

  const hud = document.createElement('div');
  hud.id = 'hud';
  hud.innerHTML = `
    <div id="hud-panel">
      <div id="gear-row">
        ${['P', 'R', 'N', 'D'].map((g) => `<div class="gear-btn" data-gear="${g}">${g}</div>`).join('')}
      </div>
      <div class="stat"><div class="label">Speed</div><div class="value" id="stat-speed">0 km/h</div></div>
      <div class="stat"><div class="label">RPM</div><div class="value" id="stat-rpm">800</div></div>
      <div class="stat"><div class="label">Bumps</div><div class="value" id="stat-bumps">0</div></div>
      <div class="stat"><div class="label">Time</div><div class="value" id="stat-timer">0.0s</div></div>
    </div>`;
  container.appendChild(hud);

  const levelName = document.createElement('div');
  levelName.id = 'level-name';
  container.appendChild(levelName);

  const levelSwitch = document.createElement('div');
  levelSwitch.id = 'level-switch';
  levelSwitch.innerHTML = levels
    .map(
      (lvl, i) =>
        `<button data-index="${i}">${i + 1}. ${lvl.name}<span class="lvl-badge" data-badge="${i}"></span></button>`
    )
    .join('');
  container.appendChild(levelSwitch);
  levelSwitch.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => onSelectLevel(Number(btn.dataset.index)));
  });

  // Completion badges, refreshed from the persisted progress store.
  function setProgress(progress) {
    levels.forEach((lvl, i) => {
      const el = levelSwitch.querySelector(`[data-badge="${i}"]`);
      if (!el) return;
      const rec = progress?.[lvl.id];
      el.textContent = rec ? ` ${'★'.repeat(rec.stars)}` : '';
    });
  }

  const resultBanner = document.createElement('div');
  resultBanner.id = 'result-banner';
  resultBanner.className = 'hidden';
  container.appendChild(resultBanner);

  // Cars spawn in P (parked, wheels locked per spec) — nothing else on
  // screen says "press 4 to drive", which reads as "the game is broken."
  // Shown until the player shifts out of P for the first time.
  const controlsHint = document.createElement('div');
  controlsHint.id = 'controls-hint';
  controlsHint.innerHTML =
    'Press <b>4</b> to shift into <b>Drive</b><br>W/S throttle-brake &middot; A/D steer &middot; Space handbrake' +
    '<br>F/R cycle gears &middot; Q/E peek &middot; C lean out window';
  container.appendChild(controlsHint);

  const mirrorToggle = document.createElement('button');
  mirrorToggle.id = 'mirror-toggle';
  mirrorToggle.className = initialMirrorMode === 'functional' ? 'functional' : '';
  mirrorToggle.textContent = `Mirrors: ${initialMirrorMode === 'functional' ? 'Functional' : 'Decorative'}`;
  mirrorToggle.addEventListener('click', () => {
    const next = mirrorToggle.classList.contains('functional') ? 'decorative' : 'functional';
    setMirrorMode(next);
    onMirrorModeChange?.(next);
  });
  container.appendChild(mirrorToggle);

  const gearEls = {};
  hud.querySelectorAll('.gear-btn').forEach((el) => (gearEls[el.dataset.gear] = el));
  const speedEl = hud.querySelector('#stat-speed');
  const rpmEl = hud.querySelector('#stat-rpm');
  const bumpsEl = hud.querySelector('#stat-bumps');
  const timerEl = hud.querySelector('#stat-timer');

  function setActiveLevel(index) {
    levelName.textContent = levels[index].name;
    levelSwitch.querySelectorAll('button').forEach((btn, i) => {
      btn.classList.toggle('active', i === index);
    });
    resultBanner.classList.add('hidden');
    controlsHint.classList.remove('hidden');
  }

  function update(carState, scoringState) {
    Object.entries(gearEls).forEach(([g, el]) => el.classList.toggle('active', g === carState.gear));
    speedEl.textContent = `${carState.speedKmh.toFixed(0)} km/h`;
    rpmEl.textContent = carState.rpm.toFixed(0);
    bumpsEl.textContent = String(scoringState.bumps);
    timerEl.textContent = `${scoringState.elapsedSec.toFixed(1)}s`;
    if (carState.gear !== 'P') controlsHint.classList.add('hidden');
  }

  function showResult({ stars, timeSec, bumps, isBest, hasNext, nextName }) {
    resultBanner.innerHTML = `
      <div class="stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</div>
      <div>Parked in ${timeSec.toFixed(1)}s — ${bumps} bump${bumps === 1 ? '' : 's'}</div>
      ${isBest ? '<div class="best-tag">New best</div>' : ''}
      <div class="result-actions">
        <button id="result-replay">Replay</button>
        ${hasNext ? `<button id="result-next" class="primary">Next: ${nextName} →</button>` : '<span class="all-done">All levels complete</span>'}
      </div>`;
    resultBanner.classList.remove('hidden');
    resultBanner.querySelector('#result-replay')?.addEventListener('click', () => onReplay?.());
    resultBanner.querySelector('#result-next')?.addEventListener('click', () => onNextLevel?.());
  }

  function setMirrorMode(mode) {
    mirrorToggle.classList.toggle('functional', mode === 'functional');
    mirrorToggle.textContent = `Mirrors: ${mode === 'functional' ? 'Functional' : 'Decorative'}`;
  }

  let gearFlashTimeout = null;
  function flashGearRejected(gear) {
    const el = gearEls[gear];
    if (!el) return;
    el.classList.add('rejected');
    clearTimeout(gearFlashTimeout);
    gearFlashTimeout = setTimeout(() => el.classList.remove('rejected'), 250);
  }

  function dispose() {
    hud.remove();
    levelName.remove();
    levelSwitch.remove();
    resultBanner.remove();
    controlsHint.remove();
    mirrorToggle.remove();
    styleTag.remove();
  }

  return { update, showResult, flashGearRejected, setActiveLevel, setMirrorMode, setProgress, dispose };
}
