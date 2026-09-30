# Architecture — Parking Precision v4

The v1–v3 architecture document is preserved at `legacy-v3/ARCHITECTURE-v3.md`
alongside the code it describes. Conventions (axes, steering sign, floor shape,
ride height) are in `CLAUDE.md`; the car's proportions are in `CAR_DESIGN.md`.

## Shape of the program

`main.js` constructs `core/Game.js` and exposes it as `window.__game`. `Game` is
the only module that knows about more than one subsystem: everything else is a
factory (`createX(deps) -> api`) that receives what it needs and knows nothing
about its siblings.

```
                     ┌───────────── Game.js ─────────────┐
 Input ─ state ─────►│ simulate(dt)  updateRig(dt)  draw()│
                     └─┬──────┬──────┬──────┬──────┬──────┘
          PhysicsWorld ◄┘  Car/Sensors  Cockpit/Driver  Mirrors/Backup  Hud/Audio
```

### The frame

`frame()` is three calls, split so headless tests can run the simulation
without paying for rendering (`debugTick` runs only `simulate`, `debugRig` runs
`simulate` + `updateRig`):

1. **simulate(dt)** — drain input, step physics at a fixed 120 Hz, apply car
   forces, sample parking sensors, then either the tutorial step machine or
   park detection + scoring + time limit.
2. **updateRig(dt)** — camera, driver IK, cockpit animation, instrument
   cluster (spring needles, redraw-on-change), audio (engine + sensor beeps),
   reversing-camera guidelines.
3. **draw()** — off-screen passes first (at most one mirror, then the
   reversing camera if its screen is lit) so the main pass samples this
   frame's pictures, then the composer.

### Off-screen rendering rules

These are load-bearing and were each found by a bug:

- **Render targets are HalfFloat, linear.** three.js does not tone-map into a
  render target; the lit scene is well above 1.0 in linear terms, so an 8-bit
  target clipped mirrors and the reversing camera to a white wash. The
  composer's OutputPass tone-maps them with the rest of the frame.
- **Off-screen passes reuse the main pass's shadow maps** — except on a level's
  first frame, before those maps exist (WebGL then rejects every lit draw call
  with "Mismatch between texture format and sampler type"). `Game` tracks
  `framesSinceLoad` for this.
- **A mirror hides its own glass while rendering**, or it would sample the
  target it is drawing into.
- **Mirrors are culled by the driver's view frustum.** The passenger door
  mirror is off-screen unless the player leans right.

## Modules

| Module | Responsibility | Talks to |
|---|---|---|
| `core/Game.js` | Orchestration, level/tutorial lifecycle, settings wiring, debug hooks | everything |
| `core/Events.js` | Minimal emitter | — |
| `render/Renderer.js` | WebGLRenderer, MSAA composer, SAO, lighting rigs for `open` / `underground` / `rooftop`, shadow + pixel-ratio switches | — |
| `physics/PhysicsWorld.js` | cannon-es world, static boxes, bump events | — |
| `input/Input.js` | The only reader of KeyboardEvents; held state + queued gear presses + one-shot actions. Bindings are DATA (`ACTIONS`), overridden from settings, so every key is rebindable | settings |
| `vehicle/Dimensions.js` | Every hard number about the car | — |
| `vehicle/Car.js` | RaycastVehicle, PRND with shift guard, steering model, auto-gearbox rpm | PhysicsWorld |
| `vehicle/ParkingSensors.js` | Two five-ray fans, nearest reading per bumper, gating by gear/speed | PhysicsWorld |
| `vehicle/ProximityScan.js` | 360° obstacle footprints in car-local space for the radar, floor-filtered. Reads static bodies directly — NOT the 1.5 m sensor fans | PhysicsWorld |
| `vehicle/Mirrors.js` | Rear-view + two door mirrors, round-robin, frustum-culled, live/static | — |
| `vehicle/CarModel.js`, `BodyLoft.js`, `bodies.js` | Lofted bodywork for five body types | — |
| `vehicle/Cockpit.js` | Dash, binnacle, 720° wheel, shifter, reversing screen | — |
| `vehicle/Driver.js` | Two-bone IK arms, rim re-gripping, shift animation | Cockpit |
| `camera/DriverCamera.js` | Yaw-only first-person rig, look-back, lean, FOV/sensitivity | — |
| `camera/BackupCamera.js` | Rear render + bicycle-model guidelines + sensor distance chip | — |
| `camera/ChaseCamera.js` | Third-person boom: yaw-only, spring-smoothed, collision- and ceiling-clamped. Writes into the ONE shared camera, never its own | PhysicsWorld |
| `ui/DashCluster.js` | Instrument binnacle on canvas: `classic` twin dials, or `track` (one big rev counter, digital speed, shift lights). Critically damped needles, sensor glyph | — |
| `ui/ProximityRadar.js` | Draws the radar canvas — dash screen texture or DOM overlay, same canvas either way | ProximityScan |
| `ui/TelemetryHud.js` | The one screen-space instrument: gear, speed, revs, shift dots. Shown in chase view, where the dashboard is behind the player | DashCluster (shift thresholds) |
| `ui/Hud.js` | DOM overlay: objective card, prompt, every menu | Game via `actions` |
| `ui/settings.js` | Validated persisted settings, quality AND HUD presets, key bindings | — |
| `net/handles.js` | The generated leaderboard names, and the check both sides use. Curated word list: no typed text ever reaches a public page | — |
| `net/leaderboard.js` | The only module that talks to a server. Entirely optional — every failure is swallowed and the game runs unchanged | handles |
| `api/_lib/board.js` | Serverless: validation, ranking, rate limits, one-shot run tokens, Upstash storage | — |
| `api/identity.js`, `api/run.js`, `api/score.js`, `api/leaderboard.js` | Claim this browser's name, start a timed run, submit it, read a level's board | api/_lib/board |
| `ui/progress.js` | Best run per level | — |
| `audio/AudioSystem.js` | WebAudio synthesis: engine, lo-fi, SFX, sensor cadence | — |
| `game/ParkCheck.js` | Bay-local park detection | — |
| `game/Scoring.js` | Score out of 100, cone strikes | PhysicsWorld events |
| `game/Tutorial.js` | Step machine + the tutorial's empty deck | — |
| `world/Levels.js` | The hand-authored levels as data; ids are stable, not sequential with play order | — |
| `world/LevelBuilder.js` | Level data -> meshes + colliders (never for cones) | Garage, Props, PhysicsWorld |
| `world/Garage.js`, `Props.js`, `Palette.js` | Shell, props, the palette | — |

## Level data

A level is pure data (`world/Levels.js`). Fields that are not obvious:

- `target.heading` is where the **car's nose** points when parked;
  `target.bayHeading` (default: `heading`) is the rotation of the **painted
  bay**. They differ for every reverse park.
- `bayRow` / `southRow` / `extraRows` paint bays: either `xs` along a fixed `z`,
  or explicit `bays: [[x, z], ...]` for rows that step in both (echelon).
- `cars[].body` forces a body type (`'van'`, `'pickup'`, `'suv'`, …).
- `target.style` is `'bay'` (U), `'parallel'` or `'box'` (full rectangle).
- `timeLimit` makes the level failable; `parTime` only affects score.
- `style` is `'open'`, `'underground'` or `'rooftop'`.

`tools/level-lint.mjs` checks every clearance rule in plan view before a level
is ever loaded; `tools/drive-test.mjs` proves each target pose reachable.

## Menus

`Hud` owns all DOM and calls back into `Game` through one `actions` object
(`continueGame`, `startTutorial`, `skipTutorial`, `playLevel`, `restart`,
`next`, `resume`, `pause`, `quitToMenu`, `toggleAudio`, `resetProgress`).
Sub-panels take a `back` function, so Settings returns to wherever it was
opened from. The driving-position tuner is the exception to the veil: it docks
a card in the corner and lights the reversing screen (`actions.previewScreen`)
so the player can see what the sliders change. There are no browser dialogs; reset progress confirms in place.

Settings changes flow `Hud -> settings.set() -> onChange -> Game.applySettings`
into the subsystem; `debug().applied` reads the result back from the
subsystems, which is what `tools/shell-probe.mjs` asserts against.

## Verification tools

| Tool | What it proves |
|---|---|
| `physics-probe.mjs` | Axis/steering conventions and handling numbers, headless cannon-es |
| `level-lint.mjs` | Target fits with door gaps, bay mouth opens onto a clear aisle, spawn clear, no parked-car intersections, parallel gap, three-point lane width |
| `drive-test.mjs` | Boot, all levels completable by teleport, controls, 0 console errors (GL_INVALID_* counts as an error) |
| `sensor-probe.mjs` | Sensor readings against known geometry, gating, no false positives in a tight bay |
| `needle-probe.mjs` | Needle lag and no overshoot |
| `mirror-probe.mjs` | Each mirror's picture, frustum visibility, live-vs-static cost |
| `tutorial-probe.mjs` | The tutorial finished by an autopilot sending real key events |
| `shell-probe.mjs` | Every menu path by clicking the DOM; settings reach their subsystems and persist |
| `cluster-shot.mjs`, `shot.mjs`, `car-view.mjs` | Screenshots |
