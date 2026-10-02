# SPEC — Rebuilding Sundown Club in React

Phase 3 of `docs/prompts/design-overhaul.md`. Status: **draft, waiting on the
owner's yes. Nothing gets converted before it.**

The owner has already made the decision: the whole site becomes React,
every interface and every 3D world. This spec decides how, app by app. It
also decides how we prove that each React version looks and plays exactly
as today before the new design goes in.

Read with:

- `docs/design/AUDIT.md`: what exists today, and the baselines;
- `docs/design/SYSTEM.md`: the design system;
- `PRODUCT.md`;
- each app's `CLAUDE.md`.

---

## 1. Rules this plan keeps

1. **Parity first, then redesign.** Each app is rebuilt to look and play like
   today, and its existing checks prove it (§7). Only then does the new design
   go in, in Phase 5.
2. **Physics and game rules are ported, not re-tuned.** Every measured number
   stays: `Car.js`, `RaceCar.js`, `Tuning.js`, `cars.js`, `Dimensions.js`,
   `Levels.js`, scoring, park detection, the casino engines and `cards.js`. No
   gameplay number, physics constant, scoring rule, game rule or saved-data
   format changes.
3. **Nothing changes for players outside the redesign:**
   - same URLs;
   - same `localStorage` keys and formats;
   - Esc twice to leave;
   - works from its sub-path;
   - one `dist/`;
   - no new network request;
   - nothing loaded from another company's server.
4. **No lower frame rate** than today, on the same machine and in the same
   scene. Draw calls no higher. Both are measured before and after with Chrome
   DevTools (§8).
5. **The old version stays live until the React version passes parity.** All
   work happens on `design/overhaul`, one app at a time. Nothing reaches `main`
   or the live site without the owner's yes.
6. **Rules carried over from the driving games, because each one was a real
   bug:**
   - one scene and one camera for the whole process;
   - physics steps first, then the car;
   - floors are finite boxes;
   - off-screen targets are HalfFloat linear;
   - no metalness;
   - shared materials are never mutated;
   - nothing ends flush with a visible face.

## 2. What "no imperative three.js" means here

The acceptance grep is: zero hits for `new THREE.Scene`,
`new THREE.WebGLRenderer` and `EffectComposer` outside React Three Fiber
(R3F).

| Allowed | Not allowed |
|---|---|
| Scenes, lights, cameras, meshes, materials and render passes declared in JSX | `new THREE.Scene()`, `new THREE.WebGLRenderer()`, or a hand-made render loop |
| Per-frame work in `useFrame` (physics step, camera rig, IK, needles) | `requestAnimationFrame` loops that render |
| Pure factories that **return** geometry or materials from data (`createSedanShell` lofting a `BufferGeometry`, `drawFace` painting a card canvas), used as `<mesh geometry={…}>` | Factories that build and mutate a scene graph (`scene.add(...)` trees) outside components |
| three.js math types (`Vector3`, `Quaternion`, `Matrix4`, `Color`) and constants | `EffectComposer` outside an R3F component |
| Off-screen renders through drei's `useFBO` inside `useFrame` (mirrors, reversing camera) | Second renderers or second canvases for the same world |

`tools/react-check.mjs` (new) runs the grep, plus a check that `apps/*/src`
has no `requestAnimationFrame` render loop. It joins `npm run check`.

## 3. Stack

Libraries were chosen with `pick-ui-library` where its list covers the task.

| Need | Choice | Why |
|---|---|---|
| UI | **React 19** + **Vite 8** (Vite is already used by Parking and Night Drive) | One workspace app per game at the same URL; `base: './'` keeps sub-paths working |
| 3D | **@react-three/fiber 9** + **@react-three/drei 10** on three 0.186 (unchanged) | Required by the brief. The current three version stays, so materials, shadows and colour management are identical |
| Post-processing | **@react-three/postprocessing** for new effects; today's passes ported as-is first (see the box below) | Parity |
| Physics | **cannon-es 0.20, unchanged**, stepped in `useFrame` | Ported, not swapped (no `@react-three/cannon` or rapier: different solvers) |
| Styling | **Tailwind CSS 4** whose theme maps onto `packages/shared/design/tokens.css` variables; **clsx** and **cva** for variants | One source of truth: classes and scenes read the same tokens |
| Accessible primitives (dialog, sheet, tabs, slider, tooltip, toggle) | **shadcn components in their Base UI flavour** (pulled with the shadcn MCP, source copied into `packages/ui`, restyled to our tokens); Radix flavour only where no Base UI version exists | The brief asks for shadcn; `pick-ui-library` names Base UI. shadcn's Base UI flavour satisfies both. No default shadcn look ships |
| Toasts | **Sonner** | Replaces the hand-rolled hub toast |
| Motion (DOM) | **motion** for springs, exits and layout; plain CSS transitions for hovers and fades | Emil's rule: a fade does not need a library |
| Counting numbers | **NumberFlow**, only for the hub's "Your evening" and result moments | SYSTEM.md: numbers never animate during play |
| State | **zustand**, one store per game bridging engine events to the UI | Avoids prop webs. The engines stay pure |
| Scroll story (hub) | **GSAP 3.15 + ScrollTrigger** via `@gsap/react` (already self-hosted) | Same scrubbed chapters with a known tool; `motion` covers UI |
| Dev-only lab panels | **Leva**, never in a public build | Replaces the Handling Lab's hand-built slider stack (dev only, per the owner's 1 Oct call) |
| Cards and Night Drive tuning data | unchanged modules | Engines, `Tuning.js` and `cars.js` are already pure |

Everything is installed from npm and bundled into our own files. There are no
CDNs, fonts stay self-hosted, and the privacy policy needs no change because
nothing new is sent anywhere.

> **Post-processing and parity.** Parking renders through three's
> `EffectComposer`: MSAA on a HalfFloat target, SAO and an `OutputPass`. Night
> Drive adds a radial `SpeedBlur` pass. `@react-three/postprocessing` has no
> SAO; its ambient occlusion is N8AO, which looks different. So:
>
> 1. **Parity build:** today's passes are declared inside R3F (`extend` the
>    three passes, render them from an `<Effects>` component in `useFrame`).
>    The look stays identical, and the grep passes because nothing runs
>    outside R3F.
> 2. **Redesign (Phase 5):** each effect may move to its
>    `@react-three/postprocessing` equivalent (N8AO, a custom `SpeedBlur`
>    Effect, bloom for neon), but only if a side-by-side screenshot diff and
>    a frame-time measurement are no worse, and with the owner looking at it.

## 4. Repository shape after the rebuild

```
apps/hub/            React + Vite, prerendered first screen (§6.1)        → /
apps/blackjack/      React + Vite + R3F                                     → /blackjack/
apps/holdem/         React + Vite + R3F   (engine.js, bots.js unchanged)    → /holdem/
apps/videopoker/     React + Vite + R3F   (engine.js unchanged)             → /videopoker/
apps/parking/        React + Vite + R3F + cannon-es                         → /parking/, /parking/play/
apps/racing/         React + Vite + R3F + cannon-es                         → /racing/
packages/shared/     pure modules as today: cards, chips, profile, design tokens, leave-guard logic
packages/ui/         NEW. React components restyled to the tokens: Button, Kbd, Dialog (leave card),
                     Sheet, Tabs, Slider, Tooltip, Toggle/Segmented, Toaster, CoachCard, HudPanel,
                     ResultMoment, plus the Tailwind theme (tokens → utilities)
packages/lounge-r3f/ NEW. The casino kit as R3F components: <Lounge> (room, window landscape, sky
                     and day cycle, pendant lamp), <CameraRig>, <Card>/<useDeck>, <ChipStack>,
                     <Figure> (two-bone IK), <Felt>; useTimeline() wraps today's createTimeline
                     (same skipAll, same speed); sfx.js unchanged
tools/build-site.mjs copies each app's dist/ into dist/<app>/, as Parking and Night Drive do today
```

The driving games keep **separate copies** of the shared car, cockpit and
hand-rig code. The owner chose that on 30 Sep, and `apps/racing/NOTES.md` maps
the copied files. Converting both to R3F is an opportunity to share one
`packages/drive-r3f`, but that is the owner's call (§11, question 2). Until
then, each app converts its own copy.

## 5. How a converted app is built

- **One `<Canvas>` per app.** It owns the one scene and the one default
  camera. Camera rigs write to `state.camera` in `useFrame`; they never create
  a second camera for the main view.
- **No React render per frame.** Moving things are updated through refs in
  `useFrame`, never through state. React renders only when the UI changes:
  a new hand, a menu, a result.
- **Frame order, fixed with `useFrame` priorities:**
  1. input;
  2. the physics step at fixed 120 Hz with an accumulator, physics first;
  3. the car or engine update;
  4. camera rigs;
  5. off-screen passes (mirrors, the reversing camera) through `useFBO`
     (HalfFloat, linear);
  6. the main composer.

  This is today's `simulate / updateRig / draw`.
- **Engine → UI.** A game's zustand store holds what the UI shows: bankroll,
  bet, hand text, turn, result. The engine stays pure and returns events. The
  timeline plays them and updates the store and the 3D refs. Space still
  drains the timeline (`skipAll`).
- **Debug hooks keep their names and behaviour.** Probes drive the game
  through them, so they are part of parity:
  - `window.__game` (Parking: dev and `?debug`);
  - `window.__lab` and `window.__models` (Night Drive, dev only);
  - `window.__bj`, `window.__holdem`, `window.__vp`.

  A `useDebugHook(name, api)` helper installs them on mount and removes them
  on unmount.
- **DOM that probes rely on stays reachable.** Ids and labels used by
  `shell-probe`, `tutorial-probe`, `retention-probe`, `site-check` and the
  others either stay, or get a `data-testid` with the probe updated in the
  same commit. A probe is never weakened.
- **Leaving.** `packages/shared/leave-guard.js` keeps its logic: Esc twice
  saves and goes to `/`. Its overlay becomes `packages/ui`'s
  `<LeaveDialog>`. The behaviour stays identical, including "focus defaults to
  Stay".

## 6. App by app, in order

The order comes from the brief:

1. hub;
2. shared UI and the lounge kit;
3. Video Poker;
4. Hold'em;
5. Blackjack;
6. Night Drive;
7. Parking Precision (largest, last).

Each step lands on `design/overhaul` on its own, with its parity evidence in
the commit message.

### 6.1 Hub (`apps/hub`, about 650 lines, no 3D)

- **Converts:**
  - the sky, the lobby (hero and rail), the door manifesto, the three
    chapters, the workshop, "Your evening", the house and the night footer;
  - the scroll story through GSAP with `useGSAP`, scoped to its section (a
    repo gotcha);
  - the `html.static` reduced-motion end state, kept as a mode the React tree
    renders.
- **First screen in the HTML.** A build step prerenders the page with
  `react-dom/server`'s `renderToString` (no framework), and the client
  hydrates it. The LCP image and hero text then arrive with the HTML, which
  keeps LCP at or under 2.5 s. Today's first screen is built by JS (AUDIT
  #30).
- **Parity proof:**
  - `tools/parity-shot.mjs` screenshots of every section at 1440×900,
    1280×800 and 390×844, compared with `screens/before/`;
  - a new `tools/hub-probe.mjs` (hub SPEC §13): ← → cycles the tiles, Enter
    navigates, there are no console errors, and nothing scrolls sideways at
    400 px.
- **Budget:** hub JS at or under 200 KB gzipped (React, ReactDOM, GSAP and our
  code are about 150 KB). No three.js.
- **Not in parity:** the live bugs the audit found (sample profile, stale nav
  state, cropped rail). Parity copies them. They are fixed in Phase 5, so each
  fix shows up as a reviewed change.

### 6.2 Shared UI and the lounge kit (`packages/ui`, `packages/lounge-r3f`)

- **`packages/ui`.** Pull Dialog, Sheet, Tabs, Slider, Tooltip and Toggle
  with the shadcn MCP (Base UI flavour) and restyle them to the tokens.
  Add Button, Kbd, HudPanel, CoachCard, LeaveDialog, ResultMoment and the
  Sonner Toaster.
  - **Parity mode:** each component can render today's look (cream paper,
    today's colours), selected by a `look="today"` prop. The game ports then
    change no pixels.
  - **Redesign:** Phase 5 removes that mode.
- **`packages/lounge-r3f`.** Today's lounge kit (`lounge.js` 288 lines,
  `cards3d.js`, `chips3d.js`, `figure.js`, `util.js`) becomes R3F components
  with the same numbers:
  - room sizes, window, landscape ramps;
  - day keys (now read from `tokens.js` `scene`, the identical values);
  - lamp and lights;
  - card sizes and flips;
  - chip stacks;
  - IK arm lengths;
  - camera drift.
- **Proof:** a kit gallery page (dev only) renders the room at t = 0.30, 0.50,
  0.755, 0.82 and 0.00. Each one must match today's kit within the
  `parity-shot` tolerance.

### 6.3 Video Poker (`apps/videopoker`, 368 lines + `engine.js`)

- **Kept:** `engine.js` as is, the pay table, the `1 coin = 5 chips` rule,
  and the drawn-before-leaving rule.
- **Converts:**
  - the machine (body, topper, buttons as R3F meshes with pointer events);
  - the screen (today's canvas drawing, kept as a `CanvasTexture` component,
    redrawn only when its state changes; this also fixes the per-frame
    re-upload, AUDIT #27);
  - the HUD and button bar (`packages/ui`);
  - the tutorial (CoachCard).
- **Parity proof:**
  - `npm run check` (`videopoker-check`);
  - a new `vp-probe` (puppeteer): load, play 30 hands by keyboard with seeded
    decks through `__vp`, check the bankroll after each hand against the
    engine's ledger, check T mid-hand and leaving mid-hand keep the result,
    and require 0 console errors;
  - `parity-shot` of the four `vp-*` states;
  - frame rate and draw calls against the before numbers.

### 6.4 Hold'em (`apps/holdem`, 604 lines + `engine.js`, `bots.js`)

- **Kept:** the engine and bots as they are. `holdem-sim 3000` must still
  pass.
- **Converts:**
  - six seats of `<Figure seated>`;
  - the table with its printed felt;
  - hole and board cards, chip stacks and the button;
  - seat labels (drei `<Html>` anchored to the rail, or a projected DOM layer
    updated only when a label moves);
  - the action bar, slider and keys (`packages/ui`).
- **Parity proof:**
  - `npm run check` (cards and holdem-sim);
  - a new `holdem-probe` (puppeteer): with a seeded `startHand({ deck })`,
    check every hand to the end; the bankroll each hand equals chips off the
    table plus the stack; the showdown label equals the sum of the win events
    (the 2 Oct fix); 0 console errors;
  - `parity-shot` of the `he-*` states;
  - frame rate and draw calls.

### 6.5 Blackjack (`apps/blackjack`, 1,316 lines, rules inline)

Blackjack predates the kit, and its rules live inside `index.html`.

- **First, a move with no behaviour change.** The round logic moves to
  `apps/blackjack/src/rules/` (shoe, round state machine, payouts) as a pure
  module, exactly as written today: hit, stand, double, S17, 3:2 rounding
  down, dealer peek. It is proven unchanged by a new node test,
  `tools/bj-rules.mjs` (the SPEC §14 scenarios that exist today, run against
  both the old inline code and the module).
- **Then the scene moves onto `packages/lounge-r3f`.** Blackjack's own copy
  of the room is compared with the kit's numbers. Any difference becomes an
  explicit kit option rather than a silent change.
- **The Design review panel stays in parity.** The bankroll top-up was already
  removed on `fix/live-bugs`. Phase 5 replaces the panel with settings.
- **Parity proof:**
  - `bj-rules`;
  - a new `bj-probe` (puppeteer): 50 rounds by keyboard at 4× with seeded
    shoes, bankroll equal to the engine's ledger, 0 console errors;
  - `parity-shot` of the `bj-*` states;
  - frame rate and draw calls.

### 6.6 Night Drive (`apps/racing`, about 14k lines)

- **Kept as plain modules:**
  - `RaceCar.js`, `cars.js`, `Tuning.js`;
  - `PhysicsWorld.js`;
  - the input mapping;
  - `AudioSystem.js`;
  - the story data (`cast.js`, `poses.js`);
  - `LampLight` bake maths. Its material patch uses `onBeforeCompile`, which
    works the same on R3F materials.
- **Converts:**
  - the test-drive world (road, lamps, trees, buildings, barriers) as
    components;
  - the car body, cockpit, wheel and hands as components around today's
    geometry factories;
  - `FollowCamera` and `SpeedFeel` as `useFrame` rigs;
  - wind streaks;
  - the `SpeedBlur` pass, through the parity `<Effects>`;
  - the story models and scenes (Model Lab, scene previews: dev only);
  - the Handling Lab UI, rebuilt with Leva (dev only).
- **The public `/racing/` page.** In parity it renders the test drive as
  today. In Phase 5 it becomes car and camera only, with no tuning (the
  owner's 1 Oct decision).
- **Parity proof:**
  - `race-physics-probe` (node, unchanged numbers, exits 0);
  - `handling-shot` (needs `window.__lab`: 0 console errors, same
    screenshots);
  - `models-shot` (needs `window.__models`: heights, fits, flush faces,
    budgets);
  - `site-check` (8/8);
  - frame rate at speed (120 fps today) and draw calls.

### 6.7 Parking Precision (`apps/parking`, about 16.5k lines), last

This is the biggest port and the most probed.

- **Kept as plain modules:**
  - `Car.js` and `Dimensions.js`;
  - `PhysicsWorld.js`;
  - `Levels.js`;
  - `ParkCheck`, `Scoring` and `Retention`;
  - `Tutorial` logic;
  - `Input.js` (the only place a key is read);
  - `AudioSystem.js`;
  - the `net/` leaderboard client and the `api/`;
  - `PlanGeometry`;
  - the layout model for City Drive.
- **Converts:**
  - `Game.js` (1,235 lines) becomes the `<ParkingGame>` shell plus a small
    non-React `GameCore`. `GameCore` keeps the state machine (driving,
    results, fail, menus) and the probe API, but builds no scene;
  - `LevelBuilder`, `Garage` and `CityBuilder` become `<Level>` components
    from the same data;
  - the car body, cockpit, steering wheel, `HandRig` and driver become
    components (IK in `useFrame`);
  - mirrors and the reversing camera become `useFBO` passes, round-robin, at
    most one mirror a frame as today;
  - the `DriverCamera`, `ChaseCamera` and review camera rigs;
  - `Renderer.js` (MSAA HalfFloat composer, SAO, lighting rigs) becomes the
    parity `<Effects>` and a `<Lighting style>` component;
  - `Hud.js` (1,711 lines) and the menus become React UI, keeping the ids the
    probes use;
  - the `DashCluster` and radar canvases become CanvasTexture components,
    keeping their 30 Hz cap.
- **Probe API.** `window.__game` keeps every function the probes call:
  `debugTick`, `debugRig`, `debugTeleport`, `debugPlay`, `debugSetGear`,
  `debugBenchmark`, `debugResources`, `debugRetention` and the rest.
  `debugTick` steps the simulation without rendering, as today.
- **Parity proof (the full regression set from `apps/parking/CLAUDE.md`):**
  - `level-lint`, `physics-probe`, **`drive-test` 17/17**, `sensor-probe`,
    `tutorial-probe`, `shell-probe`, **`autodrive`**;
  - `retention-probe`, `review-probe`, `radar-probe`, `chase-probe`,
    `telemetry-probe`, `rebind-probe`, `mirror-probe`, `site-probe`;
  - `parity-shot` of `pk-*`, plus `seat-shot`, `car-view` and `cluster-shot`;
  - frame rate and draw calls on Deck One (seat and chase), B4 and City Drive.

## 7. Proving parity

1. **Before any conversion, record the baselines.** Run every check and probe
   above on today's code. Save the results in `docs/design/BASELINE.md`, with
   frame rate and draw calls per scene. Anything already red is recorded red
   before any code changes (`apps/parking/CLAUDE.md`'s rule).
2. **`tools/parity-shot.mjs` (new).** It opens a page in a fixed state and
   screenshots it:
   - the time of day is frozen;
   - camera drift is off through a `?capture` flag (it already respects
     reduced motion);
   - decks and shoes are seeded through the debug hooks.

   It compares against the "before" set with `pixelmatch`, a dev-only npm
   dependency. **Pass:** at most 0.5% of pixels differ beyond a small colour
   threshold. Any larger difference is shown to the owner, never waved
   through.
3. **Probes run unchanged.** If a probe needs a new selector, the probe and
   the app change in the same commit, and the probe's assertions stay the
   same.
4. **An app counts as converted when:**
   - every check is green;
   - `parity-shot` passes;
   - frame rate and draw calls are no worse than baseline;
   - there are 0 console errors;
   - the `react-check` grep is clean for that app.

## 8. Performance

- **Frame rate.** Measured with a 3 s `requestAnimationFrame` count during
  active play (dealing, driving), not at idle, in Chrome on the same M1 Pro.
  Today's values are in AUDIT.md (casino 119–120 fps, Night Drive 120, Parking
  45 in chase view on High). No app may drop.
- **Draw calls.** Read from `renderer.info.render.calls` through the debug
  hooks, in the same scenes. No app may rise.
- **Hub:**
  - LCP at or under 2.5 s;
  - CLS at or under 0.05;
  - INP at or under 200 ms (DevTools trace, desktop profile);
  - JS at or under 200 KB gzipped.
- **React costs to watch:**
  - per-frame state updates (forbidden: refs only);
  - drei `<Html>` labels (at most 6, updated only on move);
  - React reconciliation inside `useFrame` (none).

## 9. Risks

| Risk | Mitigation |
|---|---|
| Probes depend on exact DOM and timing | Keep ids and hook names; game time through `debugTick`, never wall-clock sleeps (repo rule) |
| One-camera rule broken by drei helpers that create cameras | Only `useFBO` with our own off-screen cameras; the main view is always `state.camera` |
| Look drifts during the port (colour space, tone mapping, shadow type) | Set the `<Canvas>` `gl` options to today's renderer settings (ACES, sRGB output, PCF shadows, pixel-ratio rules); check with `parity-shot` per app |
| Parking's size | Last in order; the kit and the patterns are proven on the smaller games first; one probe group at a time |
| A 2 MB unminified three.js in static pages today | Ends naturally: every app becomes a Vite bundle (tree-shaken) |
| shadcn or Base UI component churn | Source is copied into `packages/ui` and owned by us |

## 10. When to stop and ask

- **Before converting anything:** the owner's yes on this spec.
- **Gameplay:** any change to gameplay, physics, scoring, rules or saved data.
- **Visible behaviour:** any parity difference over the tolerance, and any
  feature a player can see today that would be removed.
- **Outside services:** any network request, third-party service or new font.
- **Shipping:** merging to `main` or deploying (from a clean clone of
  committed `main`).

## 11. Questions for the owner

1. **Yes to this plan?** That covers the order, the stack, "parity first with
   today's passes, then post-processing" and `parity-shot` at 0.5%.
2. **Driving games:** convert each copy separately (your 30 Sep choice), or
   share one `packages/drive-r3f` between Parking and Night Drive now that
   both are rebuilt? Recommendation: **keep the copies** for the parity port
   (less risk), and decide on sharing after Phase 5.
3. **Parity tolerance:** 0.5% of pixels. Lower is safer but brittle to font
   antialiasing.
