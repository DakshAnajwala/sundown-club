# Verification tooling

There is no test framework. Verification drives the real game. Claude-in-Chrome
has been unresponsive in this project, so use puppeteer-core scripts.

## Setup

- `npm install --no-save puppeteer-core`. Any later `npm install <pkg>` prunes
  it; reinstall afterwards.
- Browser tools expect the dev server on port 5175 and open
  `http://localhost:5175/play/`. Start it with `npx vite --port 5175 --strictPort`
  (plain `npm run dev` may pick 5173/5174 if busy).
- A dev server left running for days goes stale after a lockfile change; probes
  then time out on `page.goto`. Restart with `--force`.

## Scripts

```
node tools/level-lint.mjs             # no browser: clearances, bay mouths, spawns
node tools/physics-probe.mjs          # no browser: cannon-es conventions + handling
node tools/drive-test.mjs             # boots, proves every level completable (expect 17/17)
node tools/sensor-probe.mjs           # sensor readings vs geometry
node tools/tutorial-probe.mjs         # autopilot finishes the tutorial with real keys
node tools/shell-probe.mjs            # clicks every menu path; settings take effect
node tools/autodrive.mjs [n ...]      # pure-pursuit autopilot, a fixed set of levels to "Parked"
node tools/mirror-probe.mjs [level]
node tools/needle-probe.mjs
node tools/seat-shot.mjs name [level] [gear] [WxH] [seat json]   # driver's view
node tools/cluster-shot.mjs name sec gear [level x z heading]
node tools/car-view.mjs
node tools/shot.mjs <name> <angle|driver> <dist> <height> <level>
node design/level13/build-layout.mjs  # Level 13 layout checks
node tools/city-lint.mjs              # Level 13 layout-model checks against the live model
node tools/review-probe.mjs           # overhead parking-review flight/overlay/card
node tools/radar-probe.mjs            # ProximityRadar
node tools/chase-probe.mjs            # ChaseCamera third-person view
node tools/rebind-probe.mjs           # key remapping
node tools/telemetry-probe.mjs        # TelemetryHud track cluster
node tools/leaderboard-probe.mjs      # pure-logic check of api/_lib/board.js, no browser/DB
node tools/site-probe.mjs [base]      # website: every page, 0 errors/0 third-party, hero CTA, reduced motion, SEO tags, robots/sitemap, no identity on load (use `vite preview` for robots/sitemap)
node tools/loop-probe.mjs [--quick] [--json out]  # GPU harness: retry-loop timings (restart, fail card, park card, cold load), card clarity, 3-star dead end
node tools/retention-probe.mjs [--no-build]       # retention acceptance: card keys, card v2, medals, v4->v5 migration, mastery map, daily, share, ghost, no creep, forbidden-list scan of dist/
node tools/media-shots.mjs [--dry]    # regenerate homepage stills, og-card.jpg, apple-touch-icon.png from the real game (GPU)
```

Regression set after any gameplay change: level-lint, physics-probe,
drive-test, sensor-probe, tutorial-probe, shell-probe, autodrive.

Screenshots go to `tools/shots/` (gitignored; scratch scripts go there too).
`drive-test` counts any `GL_INVALID_*` as an error; "GPU stall due to
ReadPixels" warnings are harmless.

Last recorded results (29 Sep 2026, branch `feat/retention`): level-lint
17 levels + 23 daily variants, 0/0; drive-test 17/17 + 23/23 daily, 0 console
errors; retention-probe 54/54; autodrive 4/4 (real parks); city-lint 11/11;
radar 9/9; chase 14/14; rebind 13/13; telemetry 12/12; leaderboard 26/26;
review-probe all pass; shell/sensor/tutorial/needle/physics clean; site-probe
66/66 dev, 68/68 production build.

## Writing probes

- Resolve levels by name/id via `debug().levelNames` / `levelIds`. Never assume
  `id === index + 1` or hard-code an index for a named level. `shell-probe`,
  `telemetry-probe`, `chase-probe`, `radar-probe` and `autodrive` all once
  silently tested the wrong level this way.
- Headless GPU capture that works on this M1 Pro: Chrome args
  `--use-angle=metal --enable-gpu --ignore-gpu-blocklist` (AO on, ~60 fps).
  Older tools use swiftshader + `?lowfx=1`.
- Software WebGL runs game time ~20× slower than wall time. Never assert on
  wall-clock sleeps. Use `window.__game.debugTick(s)` (simulation) or
  `debugRig(s)` (simulation + camera/needles/driver rig).
- `window.__game` exists only in dev builds.
- Teleporting onto a target pose in P completes the level (state → `results`);
  use N or an empty bay.
- A bay beside a wall pilaster gives a legitimate sensor hit.
- `debug().state` names are load-bearing: `'menu' | 'driving' | 'paused' | 'results'`.

## `window.__game` hooks

`debug()` (includes `driver`, `review`, `levelNames`, `levelIds`),
`debugPlay(i)`, `debugTutorial()`, `debugTeleport(x,z,heading)`,
`debugTick(s)`, `debugRig(s)`, `debugSetGear(g)`, `debugSensors()`,
`debugMirrorImages()`, `debugClusterImage()`,
`debugBenchmark(frames, mirrorMode)`,
`debugExternalView(angle|null, dist, height)`, `setMirrorMode(m)`, `settings`,
`debugDriver(withSegments)`, `debugWheelParts()`, `debugDriverRest()`,
`debugCabinView('passenger'|'above-wheel'|null)`, `debugReviewSkip()`,
`debugReviewSnapshot()`, `debugResources()` (geometries, textures, programs,
scene objects, bodies, draw calls), `debugRetention()`, `debugSetDate('YYYY-MM-DD'|null)`,
`debugPlayDaily(poolIndex?)`, `debugGhost()`.
