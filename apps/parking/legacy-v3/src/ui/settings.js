// Settings panel + persistence. Presentation and storage only — this module
// owns no game state; it reads/writes a plain values object and reports
// changes through onChange, the same push-based shape the rest of /ui uses.
//
// Storage is localStorage, not cookies: cookies are sent with every HTTP
// request and are size-capped, which is the wrong tool for purely
// client-side preferences. Every access is wrapped in try/catch because
// localStorage throws outright (not just returns null) in some privacy
// modes / blocked-site-data configurations.

const STORAGE_KEY = 'parking-precision:settings:v1';

// Slider bounds on the eye offsets are deliberately kept inside the sedan
// body's greenhouse box (see car/sedanBody.js — x ±0.612, y -0.098..0.602,
// z -1.029..1.281). Staying inside that volume is what keeps v1's "you
// don't see your own car" backface-culling trick working; let the player
// drag the eye outside it and they'd clip through their own body panels.
export const SETTING_DEFS = [
  { key: 'fov', label: 'Field of view', min: 50, max: 110, step: 1, def: 72, unit: '°', digits: 0 },
  { key: 'eyeY', label: 'Eye height', min: -0.05, max: 0.55, step: 0.01, def: 0.32, unit: 'm', digits: 2 },
  { key: 'eyeZ', label: 'Seat forward / back', min: -0.6, max: 1.1, step: 0.01, def: 0.6, unit: 'm', digits: 2 },
  { key: 'eyeX', label: 'Seat left / right', min: -0.55, max: 0.55, step: 0.01, def: -0.3, unit: 'm', digits: 2 },
];

export const DEFAULTS = Object.fromEntries(SETTING_DEFS.map((d) => [d.key, d.def]));

function loadStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    // Merge over defaults rather than trusting the stored shape — an older
    // or hand-edited payload shouldn't be able to drop or NaN a setting.
    const merged = { ...DEFAULTS };
    for (const d of SETTING_DEFS) {
      const v = Number(parsed?.[d.key]);
      if (Number.isFinite(v)) merged[d.key] = Math.min(d.max, Math.max(d.min, v));
    }
    return merged;
  } catch {
    return { ...DEFAULTS };
  }
}

function saveStored(values) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
  } catch {
    // Storage unavailable (private mode, blocked site data) — settings still
    // work for this session, they just won't persist. Not worth surfacing.
  }
}

const STYLE = `
#settings-btn { position: fixed; left: 18px; bottom: 18px; z-index: 11; pointer-events: all;
  cursor: pointer; padding: 8px 14px; border-radius: 8px; border: none; background: rgba(255,255,255,0.7);
  font-family: system-ui, sans-serif; font-size: 13px; }
#settings-btn.open { background: #e8d27a; }
#settings-panel { position: fixed; left: 18px; bottom: 60px; z-index: 11; width: 260px;
  background: rgba(20,24,30,0.88); color: #f2f2ea; border-radius: 10px; padding: 14px 16px;
  font-family: system-ui, sans-serif; font-size: 13px; pointer-events: all; }
#settings-panel.hidden { display: none; }
#settings-panel h3 { margin: 0 0 10px; font-size: 13px; letter-spacing: 0.06em; text-transform: uppercase;
  opacity: 0.75; font-weight: 600; }
.setting-row { margin-bottom: 12px; }
.setting-row .setting-label { display: flex; justify-content: space-between; margin-bottom: 4px; }
.setting-row .setting-value { opacity: 0.75; font-variant-numeric: tabular-nums; }
.setting-row input[type=range] { width: 100%; accent-color: #e8d27a; cursor: pointer; }
#settings-reset { width: 100%; margin-top: 2px; padding: 7px; border-radius: 7px; border: none;
  cursor: pointer; background: rgba(255,255,255,0.16); color: #f2f2ea;
  font-family: system-ui, sans-serif; font-size: 12px; }
#settings-reset:hover { background: rgba(255,255,255,0.26); }
#settings-note { margin-top: 10px; opacity: 0.55; font-size: 11px; line-height: 1.4; }
`;

export function createSettings({ container, onChange }) {
  const styleTag = document.createElement('style');
  styleTag.textContent = STYLE;
  document.head.appendChild(styleTag);

  let values = loadStored();

  const btn = document.createElement('button');
  btn.id = 'settings-btn';
  btn.textContent = 'Settings';
  container.appendChild(btn);

  const panel = document.createElement('div');
  panel.id = 'settings-panel';
  panel.className = 'hidden';
  panel.innerHTML = `
    <h3>Camera</h3>
    ${SETTING_DEFS.map(
      (d) => `
      <div class="setting-row">
        <div class="setting-label">
          <span>${d.label}</span>
          <span class="setting-value" data-value="${d.key}"></span>
        </div>
        <input type="range" data-key="${d.key}" min="${d.min}" max="${d.max}" step="${d.step}" />
      </div>`
    ).join('')}
    <button id="settings-reset">Reset to defaults</button>
    <div id="settings-note">Saved in this browser.</div>`;
  container.appendChild(panel);

  const inputs = {};
  const valueEls = {};
  for (const d of SETTING_DEFS) {
    inputs[d.key] = panel.querySelector(`input[data-key="${d.key}"]`);
    valueEls[d.key] = panel.querySelector(`[data-value="${d.key}"]`);
  }

  function renderValues() {
    for (const d of SETTING_DEFS) {
      inputs[d.key].value = String(values[d.key]);
      valueEls[d.key].textContent = `${values[d.key].toFixed(d.digits)}${d.unit}`;
    }
  }

  function commit() {
    saveStored(values);
    onChange?.({ ...values });
  }

  for (const d of SETTING_DEFS) {
    inputs[d.key].addEventListener('input', () => {
      const v = Number(inputs[d.key].value);
      if (!Number.isFinite(v)) return;
      values[d.key] = v;
      valueEls[d.key].textContent = `${v.toFixed(d.digits)}${d.unit}`;
      commit();
    });
  }

  panel.querySelector('#settings-reset').addEventListener('click', () => {
    values = { ...DEFAULTS };
    renderValues();
    commit();
  });

  btn.addEventListener('click', () => {
    const nowHidden = panel.classList.toggle('hidden');
    btn.classList.toggle('open', !nowHidden);
  });

  // Keyboard input is captured at window level by /input, so typing while a
  // slider is focused would also drive the car. Blur on release so arrow
  // keys don't fight the steering.
  panel.addEventListener('mouseup', () => document.activeElement?.blur?.());

  renderValues();

  return {
    getValues: () => ({ ...values }),
    dispose() {
      btn.remove();
      panel.remove();
      styleTag.remove();
    },
  };
}
