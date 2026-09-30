# Parking Precision

You are working as the engineer on this repository with its owner, Daksh:
designing, building and verifying features in a live hobby game. Treat this
file as standing instructions. When it disagrees with other docs, trust the
code first, then this file, then `docs/context/`, then older docs.

Free browser-based first-person 3D parking game by Daksh Anajwala (high-school
student, GitHub `DakshAnajwala`). The player drives through car parks and parks
in a glowing bay, scored out of 100. Stack: three.js 0.186, cannon-es 0.20,
Vite 8; homepage adds GSAP 3.15 + ScrollTrigger and self-hosted @fontsource
fonts. Everything is procedural: no imported textures, models or audio (sound is
Web Audio synthesis). Licence: all rights reserved.

This file holds the rules that apply to every task. Detail lives in
`docs/context/`; read the relevant file before working in that area:

| Read | When |
|---|---|
| `docs/context/deploy.md` | Before any push, deploy, Vercel or GitHub repo operation |
| `docs/context/features.md` | Before changing a built feature (homepage, wheel/hands, Level 13, review camera, HUD/radar/chase/rebind, leaderboard, levels) |
| `docs/context/tooling.md` | Before writing or running probes, screenshots or headless checks |
| `docs/context/status.md` | When picking the next task or asked what is done |
| `NOTES.md` | Before re-opening a past decision (running bug/decision log) |
| `design/README.md`, `design/SPEC-*.md` | Source of truth for designed features |

`ARCHITECTURE.md` is partly outdated, and the "5 cm sightline" note in
`CAR_DESIGN.md` is stale (see Gotchas). Prefer the code and this file.

## Working with the user

Shared rules (design first, no commit/push/deploy unless asked, no Claude
co-author trailers, go-ahead defaults, copy rules, done/not-done checklist,
caveman chat) live in the repo root `CLAUDE.md`. They apply here in full.

## Where this game lives now (30 Sep 2026)

- This folder is `apps/parking/` inside the Sundown Club monorepo
  (`~/sundown-club`). It was imported as a fresh copy of
  `CarParkingGame-MAIN` `main` at c04a175; that repo's history stays there.
- On the one Sundown Club site it is served at `/parking/` (homepage) and
  `/parking/play/` (game). Asset paths must stay relative (`base: './'`,
  `./favicon.svg`): an absolute `/...` path points at the hub, not this game.
- `api/` here is the leaderboard source. The Sundown Club site does not deploy
  it yet: `/api/*` is proxied to https://parking-precision.vercel.app, which
  still deploys from the old repo with the Upstash env vars. Moving the API
  (and its env vars) into this repo's Vercel project is an open task.
- The old live site parking-precision.vercel.app is unchanged until the owner
  approves redirecting it to `/parking/`. Details: `docs/context/deploy.md`.
- Known, pre-existing: the homepage's four font `<link rel="preload">` tags
  point at `/node_modules/...` and 404 in production (harmless, fonts still
  load from the bundle).

## Commands

```
# from the repo root (~/sundown-club)
npm install && npm install --no-save puppeteer-core   # any later `npm install <pkg>` prunes puppeteer-core: reinstall
npm run dev:parking                                   # this game's dev server on 5175 (probes expect it). Serves / and /play/ as before
npm run build                                         # every app, then the whole site into dist/ (this game at dist/parking/)
# from this folder (apps/parking)
npx vite --port 5175 --strictPort                     # same dev server; add --force if stale after a lockfile change
npm run build                                         # this game only: vite build + tools/design-pages.mjs -> apps/parking/dist
```

Pages (dev server paths; on the live site prefix `/parking`): `/` homepage (`index.html`, `src/site/`), `/play/` game
(`play/index.html` → `src/main.js`), `/privacy.html` `/terms.html`
`/notices.html` (`public/`), `/design/` design previews.

Regression set after any gameplay change (all node scripts in `tools/`):
`level-lint`, `physics-probe`, `drive-test` (expect 17/17), `sensor-probe`,
`tutorial-probe`, `shell-probe`, `autodrive`. There is no test framework; probes
drive the real game with puppeteer-core. Claude-in-Chrome has been unresponsive
in this project; use puppeteer-core scripts. Full probe list and debug hooks:
`docs/context/tooling.md`.

## Source map

```
src/main.js                 game entry, wiring only; exposes window.__game (dev only)
src/core/Game.js            orchestrator; ONE Scene + ONE camera for process lifetime (passes capture them); loop = simulate/updateRig/draw
src/render/Renderer.js      renderer, MSAA composer, SAO, lighting rigs
src/physics/PhysicsWorld.js cannon world, static box helpers (rotY only)
src/input/Input.js          the only place a KeyboardEvent is read; key rebinding
src/vehicle/Dimensions.js   every hard number about the car (WHEEL_SPORT, HAND, HAND_RIG)
src/vehicle/Car.js          RaycastVehicle, PRND, steering, auto gearbox
src/vehicle/                bodywork, cockpit, SteeringWheel, HandModel, HandRig(+Checks), Driver, sensors, mirrors, ProximityScan
src/camera/                 DriverCamera (first person), BackupCamera, ChaseCamera
src/world/                  Palette (all colours), Props, Garage, Levels (17), LevelBuilder, CityBuilder (Level 13)
src/game/                   ParkCheck, Scoring, Tutorial, ParkingReview, PlanGeometry
src/ui/                     DashCluster, Hud, settings, progress, ProximityRadar, TelemetryHud
src/net/                    leaderboard client (leaderboard.js, handles.js)
src/audio/AudioSystem.js    Web Audio synthesis
src/site/                   homepage JS/CSS
api/                        Vercel serverless: run.js, score.js, leaderboard.js, _lib/board.js
design/                     specs, prototypes, labs (not shipped in the game)
tools/                      probes and verification scripts
```

## Measured conventions (from `tools/physics-probe.mjs`; do not re-derive)

- Forward is local −Z; +X right, +Y up. Positive engine force drives forward.
- A positive cannon steering value turns left; `Car.js` negates once.
- Floors are finite Boxes, never `CANNON.Plane` (rear wheel rays miss a Plane).
- Chassis centre rests at 0.72 m. Mass 900 kg. No creep since 29 Sep 2026
  (owner's call): D/R move only while throttle is held; lifting off gives
  engine braking, and a flat-ground coast-stop holds the car below 0.3 m/s.
- Handling: 0–30 km/h ~1.7 s, 100 km/h cap, turning radius 3.56 m at 42° lock.
  Flat 4800 N total below ~30 km/h, 40 kW total (force = power/v) above, hard
  cut at the cap. 6-speed `AUTO_RATIOS` drive the tach and audio only; gear
  never affects wheel force.
- Steering: lock in 0.45 s, return in 0.40 s; rim 800°/s in, 900°/s
  self-centring (binary).
- Two vertical frames: ground frame (y=0 at tarmac, for bodywork) and local
  frame (y=0 at chassis centre); convert with `fromGround()`. Numbers go in
  `Dimensions.js`, colours in `Palette.js`.
- Levels (`Levels.js`): positions `[x, z]`; `heading` 0 = nose −Z, +π/2 = nose
  −X. `target.heading` is the car's nose, `target.bayHeading` is the paint (they
  differ for reverse parks).
- Level ids are stable, not positional. Never assume `id === index + 1` or
  hard-code an index; look levels up via `debug().levelNames` / `levelIds`.

## Gotchas (each one caused a real bug)

- The car is 4.20 × 1.78 m and must stay that size. Level clearances depend on
  it (bay pitch ≥ 2.55 m, parallel gap ≥ 6.2 m, aisle ≥ 7.5 m).
- Do not change `Car.js` handling constants unless asked; add behaviour instead
  (e.g. hill-hold). If asked, run the full regression, especially `autodrive`,
  which regressed silently twice after "identical on paper" changes.
- Body is a hollow tub: bodywork FrontSide; cabin interior (incl. wheel, hands,
  arms) DoubleSide + emissive because no light reaches the cabin. No metalness
  anywhere (no env map, metals render black).
- Palette materials are shared. Never mutate one from `matte()`/`flat()`/
  `glow()`; clone it and set `userData.disposable`.
- Cones never get a physics body.
- Arm reach is 0.66 m; the far half of the rim is out of reach, hence the hand
  domains. Moving `WHEEL_HUB` or shoulders requires re-running the wheel-lab
  sweep and reach table.
- Seat adjustment moves the camera only (shoulders fixed); z in [−0.12, +0.08].
- Sightline stack: eye 1.20 tilted −6°, dash shelf 0.92, cluster centre 1.02,
  wheel hub 0.86. Rim top clears the cluster bottom by +0.37 cm at the default
  seat; "5 cm" in comments and `CAR_DESIGN.md` is stale.
- `wheelInfo.isInContact` reads false after a step, so P and a held brake below
  0.3 m/s zero velocity outright.
- Off-screen rendering: render targets HalfFloat linear; off-screen passes reuse
  shadow maps only once `framesSinceLoad > 0`; a mirror hides its own glass
  while rendering.
- Call `camera.updateMatrixWorld(true)` before `project()` outside a render
  pass; three.js does not refresh it for you.
- Nothing may end flush with a visible face (z-fighting). To tell z-fighting
  from banding, turn shadows and AO off: stripes that survive and change every
  frame are depth.
- macOS filesystem is case-insensitive (`Hud.js` vs `hud.js` destroyed a file).
- @fontsource: import `@fontsource/<family>/latin-800` without `.css`.
- GSAP: scope every selector to its section (a bare `.cta` once hid the live
  hero button). Triggers after pinned sections need `refreshPriority: -1`.
- Privacy text follows the code. Any new network request, even one carrying
  only a level number, updates `PRIVACY.md` and `public/privacy.html` in the
  same commit.
- `window.__game` does not ship in production builds; debug workflows run
  against the dev server.
- The leaderboard client swallows every failure and is disabled under the Vite
  dev server. No leaderboard traffic in dev is expected, not a bug.
- Headless WebGL runs game time ~20× slower than wall time. Never assert on
  wall-clock sleeps; use `__game.debugTick(s)` or `debugRig(s)`.
- Node is v25; EBADENGINE warnings are harmless.

## Starting a session

1. `git status && git log --oneline -5` in `~/sundown-club`.
2. Install and start the dev server (Commands above).
3. Before touching gameplay, run the regression set for a green baseline. If
   something is already red, record it before changing code.
4. If the user gave a task, do it. If not, propose the top open item from
   `docs/context/status.md` and start on it when they agree.
