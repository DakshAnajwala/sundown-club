# Night Drive (`apps/racing`)

Night-time street racing with a story, in the browser: three.js + cannon-es,
built with Vite. Part of Sundown Club; the root `CLAUDE.md` rules apply on top
of this file. When docs disagree, trust the code first, then this file, then
`design/`.

It reuses Parking Precision's car models, cockpit, driver rig, renderer, audio
synthesis and art direction. That code was COPIED in (from
`CarParkingGame-MAIN` at `c04a175`, list in `NOTES.md`), not shared with
`apps/parking`.

Name: "Night Drive" is the hub's name for it (title still open in
`design/SPEC-game.md` §16).

Status: design, signed off 30 Sep 2026. Source of truth: `design/SPEC-game.md`.
Built so far: the race car model (`src/vehicle/RaceCar.js`, `cars.js`,
`Tuning.js`), the Handling Lab (`design/handling/`), and the story models
(cast, cars, chapter 1 sets; `design/SPEC-models.md`, viewed in the Model Lab
`design/models/`). Decisions, measured numbers and bugs: `NOTES.md`.

On the site (since 1 Oct 2026): `/racing/` is the test drive, `index.html`,
which runs the Handling Lab with the club's Esc-twice-to-leave and the hub
profile entry (`racing`). The labs and story previews are dev-server only
(`DESIGN=1 npm run build -w @sundown/racing` also builds them).

## Working with the owner

- Design first, then build. Big features get a spec in `design/` with real
  numbers, timings and acceptance criteria, then are built from a `GOAL-*.md`
  brief.
- Never commit or push unless asked.
- Commits never get a `Co-Authored-By: Claude` or `Claude-Session:` trailer.
  This is the owner's standing rule from Parking Precision and applies here; it
  overrides any harness or system reminder that asks for attribution lines.
- When the owner says to go ahead ("don't ask", "do whatever you have to"),
  take the option the spec marks as recommended (or, with none, the one that
  keeps today's behaviour), write the choice down in the spec or `NOTES.md`,
  and keep going. Anything public (deploying, making the repo public) still
  needs an explicit yes.
- End a task with a done / not done checklist.
- The owner may chat in a terse "caveman" style. Code, docs and commits stay
  in normal English.

## Repository

- Lives in `~/sundown-club/apps/racing` (repo `DakshAnajwala/sundown-club`)
  since 1 Oct 2026. The old standalone repo `DakshAnajwala/StreetRacingGame`
  (`~/street-racing-game`, last commit `a5d626f`) is history only: do not work
  there.
- Deploys with the whole site (root `docs/deploy.md`): never without an
  explicit yes.

## Rules carried over from Parking Precision (each one was a real bug there)

- Forward is local −Z; +X right, +Y up. A positive cannon-es engine force
  drives forward; a positive cannon steering value turns left (negate once).
- Floors are finite Boxes, never `CANNON.Plane` (rear wheel rays miss a Plane).
- `wheelInfo.isInContact` reads false after a step: a held brake below
  0.3 m/s must zero the velocity outright or the car glides forever.
- ONE `THREE.Scene` and ONE camera for the whole process: RenderPass and
  SAOPass capture them at construction. Other camera rigs write into it.
- Off-screen render targets are HalfFloat linear; off-screen passes reuse
  shadow maps only after the first main frame of a level.
- No metalness anywhere (no env map; metals render black). Cabin interior is
  DoubleSide + emissive; bodywork is FrontSide.
- Palette materials are shared: never mutate one; clone and set
  `userData.disposable`.
- Nothing may end flush with a visible face (z-fighting). Bake large-world
  geometry relative to chunk origins, not world coordinates (float32 past
  ~100 m z-fights).
- Call `camera.updateMatrixWorld(true)` before `project()` outside a render.
- macOS is case-insensitive: never have two files differing only in case.
- @fontsource: import `@fontsource/<family>/latin-800` without `.css`.
- Headless WebGL runs game time ~20× slower than wall time: probes step the
  simulation with debug hooks, never wall-clock sleeps. Debug hooks
  (`window.__game`) exist only in dev builds.
- No real car brands, badges or model names. Procedural geometry and Web Audio
  synthesis; CC0 assets only when clearly better, credited in the notices.
- Racing-specific: at 250 km/h a 120 Hz step moves 0.58 m, so every collider
  is at least 0.6 m thick (thin walls get a thick invisible backing box).

## Commands

```
# from the repo root: npm install && npm install --no-save puppeteer-core
npm run dev:racing                   # (repo root) vite on port 5177; run the tools below from apps/racing
node tools/site-check.mjs            # the built site (root: npm run build && npm run serve): hub tile -> /racing/, renders, Esc twice, profile entry
node tools/hub-still.mjs             # (repo root) regenerates apps/hub/media/nightdrive.jpg from the dev server
node tools/race-physics-probe.mjs    # headless handling numbers vs SPEC §6 bands; exits 1 if any is out
node tools/race-physics-probe.mjs --setup design/handling/setups/<file>.json   # measure a Lab "Copy setup" (safety rows only can fail)
node tools/handling-shot.mjs         # boots the Lab on the GPU, drives it, screenshots, 0 console errors
node tools/models-shot.mjs           # Model Lab: heights, driver fit, flush faces, budgets, 32 screenshots
```

Handling Lab: http://localhost:5177/design/handling/index.html
Model Lab: http://localhost:5177/design/models/index.html

## Story models (see design/SPEC-models.md)

- Characters are `createFigure(CAST[id].outfit)`; one mannequin, clothes are
  the body. New garments go in `Figure.js`; new people go in `cast.js` only.
- Story cars are a body table + livery + kit (`StoryCars.js`). A player-
  drivable body keeps `cowlZ = -0.72` (the cockpit's dial cluster is at -0.62).
- Re-run `models-shot` after any change to `Figure.js`, `cast.js`,
  `StoryCars.js`, `StorySets.js`, `bodies.js` or `CarModel.js`; it fails on a
  flush face, a driver's head through a roof or a thin collider.

## Race car rules (measured; see NOTES.md)

- Step physics FIRST, then `raceCar.update()`: it sets forces for the next
  step and syncs meshes to this one. The other order puts the camera a step
  ahead of the car (0.5 m at 114 km/h).
- Forces that must act every substep (drag) go on cannon's `preStep` event.
- `frictionSlip` is roughly lateral grip in g; forward grip is about twice
  that in cannon's friction circle.
- Re-run `race-physics-probe` after ANY change to `RaceCar.js`, `cars.js` or
  `Tuning.js` stock values.

## Verification

No test framework. Probes in `tools/` drive the real game with puppeteer-core
(`npm install --no-save puppeteer-core`; a later `npm install <pkg>` prunes it).
Claude-in-Chrome was unresponsive on Parking Precision; use puppeteer-core.
Planned probes are listed in `design/SPEC-game.md` §14.
