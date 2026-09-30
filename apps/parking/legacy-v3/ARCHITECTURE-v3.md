# Architecture — Parking Precision (v1 + v2 + v3)

Modules communicate only through the public API / events described below.
No module reaches into another module's internals (e.g. `car` never touches
`level`'s obstacle meshes directly — it only reads collision events from
`physics`).

```
/src
  /core      — renderer, scene, clock, main loop, resize handling
  /physics   — cannon-es World setup, fixed-timestep stepping,
               helpers for creating static bodies from level data
  /car       — vehicle rig (RaycastVehicle), input→force mapping,
               gear state machine (P/R/N/D)
    vehicle.js    — the rig itself; wires up the four modules below
    sedanBody.js  — procedural low-poly 4-door sedan: tub, greenhouse
                    (pillars + roof), tinted glazing, bumpers, lamps
    wheel.js      — one road wheel: tyre + rim face + 5 spokes + hub
    cockpit.js    — cabin shell (floor, door cards, headliner, bulkheads,
                    seats, console) + dash, animated wheel, gauge, pedals,
                    shifter
    mirrors.js    — 3 mirrors, decorative/functional modes
  /input     — keyboard state manager; exposes normalized signals
  /camera    — first-person rig parented to chassis, right-click free-look
  /level     — level data schema + loader; spawns obstacles/target/cones
  /ui        — HTML/CSS HUD overlay, settings panel, progress store
  /scoring   — bump counter, timer, park-detection, score/star calculation
  main.js    — wiring only, no logic
```

`sedanBody.js`, `cockpit.js` and `mirrors.js` are **internal to `/car`** —
they're wired together inside `vehicle.js`'s `createCar()` and are never
imported by `main.js`. See the per-module notes below.

## /core — `core/engine.js`

Exports:
- `createEngine({ container })` → `{ renderer, scene, clock, onUpdate(fn), onPreRender(fn), setActiveCamera(cam), start(), dispose() }`
  - `renderer`: THREE.WebGLRenderer, sized to container, handles `resize`.
  - `scene`: THREE.Scene, holds directional + hemisphere lights and a flat
    sky-colored background. No fog, no post-processing.
  - `onUpdate(fn)`: registers a per-frame callback `fn(dt, elapsed)` run
    inside the render loop, in registration order.
  - **(v2)** `onPreRender(fn)`: registers `fn(renderer, dt)`, run every frame
    *after* all `onUpdate` callbacks (so this frame's transforms are
    current) and *before* the main `renderer.render(scene, activeCamera)`
    call. Deliberately generic/domain-agnostic — `/car`'s mirror
    render-to-texture passes use it, but `core` stays ignorant of cars and
    mirrors.
  - `start()`: begins `requestAnimationFrame` loop.
  - Window resize is handled internally (updates camera aspect + renderer size
    for whichever camera is currently active, via a registered getter).

Emits: nothing (pure infrastructure). Other modules subscribe via `onUpdate`
/ `onPreRender`.

## /physics — `physics/world.js`

Exports:
- `createPhysicsWorld()` → `{ world, step(dt), addStaticBox(...), events }`
  - `world`: the cannon-es `World` (gravity set, broadphase, solver configured).
  - `step(dt)`: advances the world with a **fixed timestep** (1/60s) using
    `world.fixedStep()`-style accumulation so physics is independent of
    render framerate.
  - `addStaticBox({ pos, rotY, size })`: creates a mass-0 `Body` with a `Box`
    shape sized to the given half-extents, positioned/rotated, added to the
    world. Returns the `Body`. Used by `/level` to instantiate obstacles from
    level data — level code never touches cannon-es types directly.
  - `events`: a tiny EventTarget-like emitter. Emits `'contact'` with
    `{ bodyA, bodyB, contactNormal, impactVelocity }` for every chassis vs.
    static-body collision (filtered inside physics from cannon-es's raw
    `world.addEventListener('beginContact', ...)`), so `/car` and `/scoring`
    both subscribe without depending on cannon-es internals.

## /car — `car/vehicle.js`

Exports:
- `createCar({ physicsWorld, spawn })` → car API object:
  - `.chassisBody` — cannon-es body (read-only access for camera parenting).
  - `.mesh` — THREE.Group visual chassis + 4 wheel meshes, kept in sync with
    physics each frame internally (also exposed so `/core` can add it to scene).
  - `.update(dt, inputState)` — applies engine force / steering / brake /
    handbrake to the `RaycastVehicle` based on the current `InputState` and
    current gear; advances the steering ramp/auto-center; advances the fake
    RPM cosmetic value.
  - `.getState()` → `{ speedKmh, gear, rpm, position, rotationY }` — read-only
    snapshot consumed by `/ui` and `/scoring`.
  - `.setGear(requested)` — attempts a gear change; applies the shift guard
    (R↔D blocked above 2 km/h); returns `{ accepted: bool }`.
  - `.resetSpawn(spawn)` — teleports car back to a spawn pose (used on level
    load only, never mid-attempt per v1 no-hard-reset rule).
  - **(v2)** `.renderMirrors(renderer, scene)` — runs the mirror
    render-to-texture passes; no-op in decorative mode. Called from
    `main.js` via `engine.onPreRender`.
  - **(v2)** `.setMirrorMode(mode)` — `'decorative' | 'functional'`.

v2 note: gear D and R now have **separate** engine-force and top-speed
constants (`ENGINE_FORCE_D`/`TOP_SPEED_D_MS` vs `ENGINE_FORCE_R`/
`TOP_SPEED_R_MS`) — reverse is deliberately half the force and half the cap.

v2 internals (not part of the public surface — `main.js` never sees these):
  - `sedanBody.js` — `createSedanBody({ size, bodyColor, trimColor,
    sillColor })` → THREE.Group. Stepped tub + greenhouse (A/B/C pillars,
    roof, cant rails) + tinted glazing + rocker, bumpers, lamps. The
    greenhouse has real window apertures, which is why the shell is
    `DoubleSide` and the cabin needs its own interior in `cockpit.js`.
  - `wheel.js` — `createWheelMesh({ radius, width })` → THREE.Group of
    tyre + rim + 5 spokes + hub, authored with the spin axis on local X to
    match what `RaycastVehicle`'s wheel transform expects.
  - `cockpit.js` — `createCockpit()` → `{ group, update(dt, { steerAngle,
    speedKmh }), animateShifterTo(gear) }`. Steering wheel uses a nested
    mount/spin group so only the inner group's local rotation animates;
    the shifter tweens between 4 gate angles via the same exponential-decay
    pattern used for fake RPM. `animateShifterTo` is called **directly**
    from `setGear()`, not via the public `'gearChanged'` event (same-module
    call, no need to round-trip through the emitter).
  - `mirrors.js` — `createMirrors()` → `{ group, setMode(mode),
    renderMirrors(renderer, scene) }`. Mirror cameras are parented under
    the car's mesh, so their world transforms follow the chassis through
    the normal scene graph — no manual per-frame matrix math.

Emits (via a small internal emitter, `.on(event, cb)`):
  - `'gearRejected'` — shift guard blocked an R↔D change; `/ui` flashes gear readout.
  - `'gearChanged'` — `{ gear }`.

Internally subscribes to `physicsWorld.events` `'contact'` to zero the
velocity component along the contact normal (collision response lives here
because it needs direct access to the chassis body's velocity vector).

## /input — `input/keyboard.js`

Exports:
- `createInputState()` → object with getters, updated live from
  `keydown`/`keyup`/`mousedown`/`mouseup`/`mousemove` listeners registered
  internally:
    - `throttle` (bool — W/Up held)
    - `brakeOrReverse` (bool — S/Down held)
    - `steer` (-1..1, from A/D or Left/Right, instantaneous key state; the
      *ramping* itself happens in `/car`, input only reports raw intent)
    - `handbrake` (bool — Space held)
    - `gearSelect` (0 | null — last-pressed of 1/2/3/4 this frame, consumed
      once read via `.consumeGearSelect()`)
    - `.consumeGearCycleDir()` (one-shot -1 | 0 | +1 — F steps forward
      through P→R→N→D→P, R steps back; `main.js` applies it by reusing
      `getState()`/`setGear()`, so cycling obeys the same R↔D shift guard
      as the direct 1-4 keys)
    - `peekLeft` / `peekRight` (bool — Q/E held, eased view swing)
    - `leanOut` (bool — C held; leans the eye toward the right-side window
      with a downward pitch, for sighting the kerb)
    - `freeLook` (bool — right mouse button held)
    - `mouseDeltaX` (number, reset each read via `.consumeMouseDelta()`)

No events emitted — pure polled state, consumed by `/car` and `/camera` each frame.

## /camera — `camera/firstPerson.js`

Exports:
- `createFirstPersonCamera({ chassisMesh })` → `{ camera, update(dt, inputState) }`
  - `camera`: THREE.PerspectiveCamera, FOV 72, near 0.1, far 500.
  - `setFov(deg)` / `setEyeOffset(x, y, z)`: driven by the settings panel
    (`ui/settings.js`), which persists them to localStorage.
  - `update(dt, inputState)`: each frame, sets camera position/quaternion to
    chassis transform + eye offset (rigid parenting, no bob/tilt/lag),
    then composes the Q/E peek yaw and the C lean-out (position offset +
    yaw + the rig's only pitch term),
    then applies yaw-only free-look offset driven by `inputState` mouse delta
    while `freeLook` is held, clamped to ±140°, easing back to 0 over ~0.2s on release.

Emits: nothing.

## /level — `level/levels.js` + `level/loader.js`

`level/levels.js` exports the plain data array `LEVELS` (schema below, see
Detailed Feature Specs). Adding a level is a pure data change.

`level/loader.js` exports:
- `loadLevel(levelData, { scene, physicsWorld })` → `{ dispose(), spawn, target, maneuverType }`
  - Builds THREE meshes + calls `physicsWorld.addStaticBox` for each
    `obstacles[]` entry (walls/pillars/parkedCars — collides:true always in
    v1 data, kept as a field for future flexibility).
  - Builds THREE meshes only (no physics body, per spec) for each `cones[]`
    entry.
  - Builds a visual target-zone decal (flat plane, no collision) at `target.pos/rotY`.
  - Returns `spawn`/`target`/`maneuverType` so `/main.js` can hand them to
    `/car` and `/scoring` without those modules reading level data directly.
  - `dispose()` removes all spawned meshes + static bodies (called before
    loading a new level).

Emits: nothing (pull-based; `main.js` reads the returned handles).

## /ui — `ui/hud.js`

Exports:
- `createHud({ container, levels, onSelectLevel, onNextLevel, onReplay, onMirrorModeChange, initialMirrorMode })`
  → `{ update(carState, scoringState), showResult(result), flashGearRejected(), setActiveLevel(i), setMirrorMode(mode), setProgress(map), dispose() }`
  - `showResult` takes `{ stars, timeSec, bumps, isBest, hasNext, nextName }`
    and renders Replay / Next-level buttons; `setProgress` paints star
    badges onto the level switcher.
- `ui/progress.js` — `createProgress()` → `{ all(), get(id), isCompleted(id),
  record(id, result), reset() }`. Per-level best result in localStorage
  (`parking-precision:progress:v1`); keeps the best run, never downgrades.
- `ui/settings.js` — `createSettings({ container, onChange })` → camera FOV /
  eye-offset sliders persisted to localStorage.
  - Builds the fixed-position DOM overlay (gear/speed/rpm/bumps/timer/result banner).
  - `update(carState, scoringState)` — called every frame from `main.js` with
    the latest snapshots; pure read/render, no game logic.
  - `showResult({ stars, timeSec, bumps })` — shows the result banner on park success.
  - `flashGearRejected()` — brief red flash on the gear readout.
  - **(v2)** mirror-mode toggle button, following the same
    `onSelectLevel`/`setActiveLevel` callback+setter shape as the level
    switcher. Defaults to `'decorative'` for out-of-the-box performance.

Emits: nothing (HUD is presentation-only, driven by data pushed into it).

## /scoring — `scoring/scoring.js`

Exports:
- `createScoring({ physicsWorld, car, level, thresholds })` → `{ update(dt), getState(), reset(), on(event, cb) }`
  - Subscribes to `physicsWorld.events` `'contact'` to increment the bump
    counter (debounced per continuous-contact — see Collision Handling).
  - `update(dt)` — each frame, checks car position/heading/speed against
    `level.target` tolerance; runs the 0.5s dwell timer; advances the
    elapsed-time timer (stops on success).
  - `getState()` → `{ bumps, elapsedSec, parked: bool }` for `/ui`.
  - `reset()` — called on level (re)load.
  - Emits `'parked'` with `{ stars, timeSec, bumps }` when the dwell
    condition completes — `main.js` forwards this to `ui.showResult(...)`.

`scoring/thresholds.js` exports the per-level star-rating time thresholds in
one place, easy to tune (see Scoring spec).

## main.js — wiring only

Creates engine → physics world → input → loads level 0 → creates car at
level spawn → creates camera parented to car → creates HUD → creates
scoring wired to physics/car/level → registers `engine.onUpdate` to step
physics, update car, update camera, update scoring, update HUD, in that
order. Listens for `scoring.on('parked', ...)` to show the result banner.
Provides a minimal level-select (number-key or on-screen buttons, see NOTES.md)
that calls `dispose()` on the current level and repeats the load sequence —
this is the only place that knows the full wiring order.
