# GOAL — parked-car detail, proximity radar, HUD customisation, track cluster, third-person camera, key remapping

Status: **design brief, not yet built.** Written 21 September 2026.
Target implementer: Sonnet at medium effort, working from this file alone.

Read `/Users/dakshgiis/parking-game-v1/CLAUDE.md` in full before writing any
code. It is the project's single source of context: conventions, measured
physics facts, verification tooling, deployment rules, and a list of
constraints that were each found by a bug. This brief assumes all of it and
does not repeat it.

---

## 0. How to use this document

Six features are specified below. They are **ordered by dependency**, not by
importance. Build them in the order given, because F3 (HUD customisation) is
the settings/UI substrate that F2, F4 and F5 all plug their toggles into, and
F6 rewrites the key legend that F3 renders.

After **every** stage: run the regression set in §9, and stop for the user to
look at a screenshot before starting the next stage. Do not batch all six
and present them at the end — this is a visual, taste-driven set of changes
and the user will want to redirect.

Three decisions are the user's, not yours — see §10. Recommended defaults are
given so you are never blocked; use them and flag the choice in your summary.

---

## 1. Baseline: what is already true (do not redo this work)

- **The "glitchy boxes" in Level 13 are already fixed.** As of this session,
  `src/world/CityBuilder.js` bakes merged parked-car geometry relative to
  16 m chunk origins (`CAR_CHUNK`) instead of the city origin. The previous
  black/white checkerboard was float32 precision loss: at 110–160 m from the
  world origin, baked vertices quantise to ~20 µm, which is enough for flush
  surfaces (number plate, lamps, panels) to z-fight. Measured after the fix:
  **932 draw calls, 2.9 ms/frame** at the Level 13 street view.
  **This is the performance baseline every budget below is measured against.**
- The parked car is **not** a box. `createParkedCar()`
  (`src/vehicle/CarModel.js:544`) already builds: a lofted tub, nose and tail
  caps, separate hood/deck/roof lids, a greenhouse with tumblehome side glass,
  merged pillars, headlamp housings (`0x1f2226`) with glow inserts, taillamps
  (`glow(COLORS.lampRed, 0.45)`), a grille bar (`0x24272b`), a lower intake
  (`0x2a2d31`), bumpers, and wheels with a tyre, dished rim, hub and five twin
  spokes (`createWheelMesh()`, `CarModel.js:68`). Five silhouettes exist in
  `src/vehicle/bodies.js:259` — `SEDAN`, `HATCHBACK`, `SUV`, `VAN`, `PICKUP`.
- So F1 below is **genuine added detail plus LOD**, not a rescue job. Read the
  existing model before adding to it; most of what looks missing at distance is
  missing because of fog and screen size, not because it was never built.

---

## 2. Hard constraints (violating any of these is a failed implementation)

These are all already in CLAUDE.md; they are repeated here because every
feature below is capable of breaking one of them.

1. **One Scene and one camera for the process lifetime.** `RenderPass` and
   `SAOPass` capture references at construction (`src/render/Renderer.js`,
   `src/core/Game.js` header). The third-person camera in F5 therefore **must
   write into the existing camera object**, exactly as `DriverCamera` does. Do
   not construct a second `THREE.PerspectiveCamera`.
2. **No imported assets.** No textures, models, audio files or fonts inside the
   game. Everything is procedural geometry and Web Audio. This includes the
   radar and cluster: draw them to a 2D canvas in code.
3. **No marque, badge or model name, anywhere.** `src/vehicle/bodies.js:6-11`
   states the project's position explicitly. F4 implements the *look* of a
   modern track-focused instrument binnacle; it is named `track`, never after
   a manufacturer or model. No logos, no wordmarks, no "911", no "GT3".
   The same applies to F2: it is a "proximity radar", not named after the
   Assetto Corsa app that inspired it.
4. **The car stays 4.20 × 1.78 m.** Every level clearance depends on it.
   F1 adds surface detail only — mirrors, plates, trim. It must not change the
   silhouette's extents, the collision box (`CAR_BOX`, `CityBuilder.js:32` and
   `LevelBuilder.js:29`), or `Dimensions.js`'s chassis numbers.
5. **Do not change `Car.js` handling constants.** F5's camera and F6's bindings
   both sit upstream of the car; neither may touch how it drives.
6. **No metalness** (no env map; metals render black). Use `matte()` / `flat()`
   / `glow()` from `src/world/Palette.js`.
7. **Palette materials are cached and shared.** Never mutate one in place;
   clone it and set `userData.disposable = true`. A per-frame-animated material
   must never come from the cache — see the traffic-light lamps
   (`CityBuilder.js:307-313`) for the pattern and the reason.
8. **Minimum 4 mm separation between any two parallel surfaces** you add to a
   car or to city geometry. This is the direct lesson of the z-fighting bug in
   §1: flush geometry survives per-mesh rendering but fails once merged and
   baked. A plate, a trim strip or a shut line that sits exactly on the body
   surface **will** produce the checkerboard again.
9. **Any new merged city geometry follows the `CAR_CHUNK` rule** — bake
   relative to a chunk origin within 16 m, never to the world origin.
10. **`localStorage` may throw.** Every access is guarded and the game runs on
    defaults without it (`src/ui/settings.js:74-89`). F3 and F6 persist new
    state; they must keep this discipline and re-validate every field on load.
11. **`src/input/Input.js` is the only place a `KeyboardEvent` is read.** F6
    makes it data-driven; it must not spread key handling into other modules.

---

## 3. F1 — Parked-car detail and LOD

### 3.1 Why

The user's report: parked cars "look really bad compared to the cars in the
other levels… just glitchy boxes with tail lights." The glitching is fixed
(§1). What remains is that a parked car carries less surface detail than the
player's own car, and at the distances a city level presents (20–80 m) it
reads as a slab.

### 3.2 What to add

All of this goes in `src/vehicle/CarModel.js`, driven by the per-body tables in
`src/vehicle/bodies.js`. Add proportions to the tables rather than hard-coding
numbers in the builder — that is the existing division of labour
(`bodies.js:3-5`).

Per car, add:

| Part | Geometry | Placement rule |
|---|---|---|
| Door mirrors (2) | Stalk (tapered box ~0.06 × 0.04 × 0.09 m) + shell (box 0.16 × 0.09 × 0.05 m) | At the A-pillar base, beltline height; reuse the shapes from `src/vehicle/Mirrors.js` **without** a render target — parked cars get a flat `matte(COLORS.glass)` face, never a live mirror |
| Number plates (2) | Plane 0.52 × 0.11 m | Front and rear, **6 mm proud** of the bumper face. Plate face is a pale flat colour; no lettering (no text = no marque, and no texture) |
| High-level stop lamp | Box 0.28 × 0.03 × 0.02 m | Top of the rear screen, `glow(COLORS.lampRed, 0.30)` — dimmer than the main taillamps so it reads as secondary |
| Exhaust tip | Short cylinder, r 0.035 m, length 0.09 m | Under the rear bumper, offset from centre; `matte(0x3a3d41)` |
| Wipers (2) | Thin boxes 0.42 × 0.012 × 0.02 m | Along the screen base, angled ~12°, `matte(0x24272b)` |
| Door shut lines | Inset strips 0.008 m wide | **Recessed 4 mm**, not flush (constraint §2.8). Two per side |
| Wheel-arch lips | Already partly present (`CarModel.js:369` `lip` / `well`) | Verify all five body types have them; add where missing |
| Roof furniture | Rails for `SUV`/`VAN` (2 boxes), bed rails + tailgate line for `PICKUP` | Body-type specific — this is what makes the silhouettes distinguishable at distance |

### 3.3 Per-car variation (this is what kills the "row of clones" read)

Driven deterministically from the car's existing index — **never `Math.random()`**,
because `tools/drive-test.mjs` and `tools/level-lint.mjs` need reproducible
scenes:

- 3 wheel face styles (5-twin-spoke exists; add a 5-spoke and a 10-spoke).
- Ride height jitter ±15 mm.
- Front wheels turned ±6° on roughly one car in four.
- Roof furniture present on a subset, not all, of the SUVs and vans.

### 3.4 LOD — mandatory, not optional

137 parked cars in Level 13. Adding ~12 meshes each is ~1,600 new meshes
before merging, and the merged triangle count rises accordingly. Build the
detail tier **at construction time**, from each car's distance to the route
path, not per frame:

- **Tier A (full detail):** car is within 25 m of the route polyline
  (`L.route` in `design/level13/layout.json`). Everything in §3.2.
- **Tier B:** 25–60 m. Drop wipers, shut lines, exhaust, plates.
- **Tier C:** beyond 60 m. Body, glass, lamps, wheels only — i.e. today's model.

Static tiering keeps the merge deterministic and avoids any runtime mesh swap.
Other levels (`LevelBuilder.js`) have ~20 cars and no distance problem — give
them Tier A unconditionally.

### 3.5 Budgets and acceptance

- [ ] Level 13 street view: **≤ 1,050 draw calls and ≤ 3.6 ms/frame**, measured
      with `window.__game.debugBenchmark(60)` at the same pose used for the §1
      baseline (`debugTeleport(-68, 110, -Math.PI/2)`). Baseline is 932 / 2.9.
- [ ] Other levels: no more than +40 draw calls versus current.
- [ ] Zero new z-fighting. Verify by screenshotting a Level 13 street car at
      `(-68, 110)` **and** a car park bay car near the origin, at quality
      `high`, and comparing against a Level 1 car at the same range.
- [ ] Collision boxes unchanged (`CAR_BOX` untouched); `level-lint` clearances
      unchanged; `sensor-probe` still 0 failures (mirrors must not stick into a
      sensor fan).
- [ ] All five body types visibly distinct in a single line-up screenshot.

---

## 4. F2 — Proximity radar

### 4.1 What it is

A car-centred, top-down proximity display, in the spirit of the sim-racing
proximity radar apps: your car is a fixed icon at the centre, nearby obstacles
appear as shapes around it, and colour encodes how close they are. In a racing
sim it shows other cars; here it shows **anything solid near the car**, which
is what a parking game actually needs.

### 4.2 Data source — not the parking sensors

Do **not** build this on `src/vehicle/ParkingSensors.js`. Those are two
5-ray fans with a **1.5 m** range (`SENSOR_RANGE`, `ParkingSensors.js:29`) and
a ±20° splay — far too narrow and too short for a 360° display.

Instead add `src/vehicle/ProximityScan.js`:

- Iterate the static bodies already held by `src/physics/PhysicsWorld.js`
  (it keeps a `staticBodies` list; expose a read-only accessor rather than
  reaching into internals).
- Keep bodies whose centre is within **12 m** of the chassis in x/z.
- **Filter by floor.** Level 13 is five decks stacked at 3.2 m. Keep only
  bodies whose vertical extent overlaps the car's y ± 1.2 m — the same class
  of check `ParkCheck` needed when the city landed. Without this the radar
  shows the deck above you as a wall.
- Skip bodies with `userData.isGround` (slabs, ramps, ground) — the floor is
  not an obstacle.
- For each kept body, project its footprint (4 corners, honouring `rotY`) into
  **car-local** space: x right, z forward, origin at the chassis centre.
- Return `{ corners, nearestDistance, kind }` per obstacle, where
  `nearestDistance` is measured from the car's **collision box edge**, not its
  centre — a driver reads "how much room have I got", and consistency with the
  existing sensor readout matters (see the `BUMPER_Z` shared constant in
  `Dimensions.js` introduced when the reverse-camera mismatch was fixed).

Sample at **15 Hz**, not per frame. Reuse the accumulator pattern from
`ParkingSensors.js` (`SAMPLE_HZ = 20`).

### 4.3 Rendering

Add `src/ui/ProximityRadar.js`. Canvas **256 × 256**, drawn with the same
discipline as `src/ui/DashCluster.js`:

- Static background (rings, car icon, cardinal ticks) drawn **once** to an
  offscreen canvas; live pass is one `drawImage` plus the blips.
- Redraw capped at **15 Hz**, and skipped entirely when no blip has moved more
  than 2 px and no colour band has changed. Parked in P against nothing, the
  texture must not be re-uploaded at all.
- Car heading is **up**. Range rings at 2 / 4 / 8 / 12 m.
- Obstacle footprints as filled rounded rectangles, opacity falling with
  distance.
- Colour by `nearestDistance`, reusing the existing palette constants so the
  radar agrees with the rest of the car:
  `< 0.3 m` red `#e0857b` · `< 0.8 m` amber `#e8c98a` · `< 1.5 m` mint
  `#8fe6bb` · beyond, dim slate `rgba(200,215,212,0.55)`.
- A thin pulsing ring when anything is inside 0.3 m. Pulse from a clock the
  module owns; **do not** animate a cached Palette material (§2.7).

### 4.4 Where it lives

The dashboard's right-hand screen is currently the reverse camera's
(`src/camera/BackupCamera.js`, `src/vehicle/Cockpit.js` `screenActive`).

Default behaviour: **radar owns the dash screen in P / N / D; the reverse
camera owns it in R.** The transition should be a hard cut, not a fade — a
real car's screen switches instantly on shift.

F3 additionally offers a screen-space overlay placement (top-right, DOM) for
players who want the radar visible while reversing. Decision D3 in §10.

### 4.5 Budgets and acceptance

- [ ] ≤ 1 extra draw call, ≤ 0.25 ms/frame.
- [ ] New debug hook `window.__game.debugRadar()` returns the current blip
      list in car-local coordinates.
- [ ] New probe `tools/radar-probe.mjs`: park the car a **known** distance from
      a known parked car (use `debugTeleport` plus a level whose geometry
      `level-lint` already validates), and assert the blip's local coordinates
      and `nearestDistance` match the geometry within 5 cm, and that its colour
      band is correct.
- [ ] Floor filter proven: on Level 13's roof, `debugRadar()` returns no blips
      from the deck below.
- [ ] Radar hidden entirely when `settings.sensors` is false (the existing
      driver-aids switch) — it is an aid, and the existing toggle should govern
      it. Note this in the settings panel copy.

---

## 5. F3 — HUD customisation

### 5.1 Scope boundary

The instrument binnacle is a **real object in the car**, drawn to a texture on
a plane in the dashboard, deliberately not a DOM overlay
(`src/ui/DashCluster.js:4-7`). HUD customisation therefore governs the **DOM
overlay** (`src/ui/Hud.js`) and the radar placement — **not** the binnacle.
The binnacle's appearance is F4's `theme` setting, surfaced in the same panel
for discoverability but stored separately.

### 5.2 New settings fields

Add to `DEFAULTS` and `FIELDS` in `src/ui/settings.js`. Adding fields is
backward compatible — `load()` only copies keys present in `FIELDS` and
re-validates each one (`settings.js:81-84`), so **no `STORAGE_KEY` bump is
needed**. Do not bump it; an older payload must keep working.

| Field | Type / validator | Default | Governs |
|---|---|---|---|
| `hudPreset` | `'full' \| 'minimal' \| 'clean' \| 'custom'` | `'full'` | Bundle selector, same pattern as `QUALITY_PRESETS` |
| `hudLevelCard` | bool | `true` | Top-left level/tutorial card |
| `hudPrompt` | bool | `true` | Bottom-centre live prompt |
| `hudKeyLegend` | bool | `true` | Bottom key legend (`Hud.js:308`) |
| `hudToggles` | bool | `true` | Top-right buttons |
| `hudRadar` | bool | `true` | F2 radar on/off |
| `hudRadarPlace` | `'screen' \| 'overlay'` | `'screen'` | F2 §4.4 |
| `hudSpeedDigital` | bool | `false` | Small digital speed in the overlay |
| `hudOpacity` | num 0.35–1 | `1` | Overlay opacity |
| `hudScale` | num 0.8–1.4 | `1` | Overlay scale |

Presets: `full` = everything on; `minimal` = prompt + radar only; `clean` =
nothing but the prompt. Touching any individual switch demotes `hudPreset` to
`'custom'` — mirror the existing behaviour in `settings.set()`
(`settings.js:112-120`), which already does exactly this for quality.

### 5.3 UI

New panel in `src/ui/Hud.js`, reachable from the settings menu, built with the
existing `showPanel` / `el` helpers and the sub-panel `back` stack
(`Hud.js:14`, `Hud.js:348`). Changes apply **live**, with the panel open, so
the player sees the result — the veil is translucent enough for this; verify.
Include a "Reset HUD" button following `resetSeat()`'s shape
(`settings.js:132-139`).

### 5.4 Acceptance

- [ ] Every toggle takes effect immediately and survives a reload.
- [ ] With `localStorage` unavailable (test by stubbing it to throw), the game
      runs on defaults and the panel still works for the session.
- [ ] `hudScale` / `hudOpacity` never push an element off-screen at 390 × 844.
- [ ] `tools/shell-probe.mjs` extended to click every new control; still
      0 failures.
- [ ] An old `parking-precision:settings:v4` payload from before this change
      loads without error and picks up the new defaults.

---

## 6. F4 — "Track" instrument theme

### 6.1 The look (implement the idiom, not a badge — see §2.3)

The reference the user gave is a modern track-focused sports car binnacle.
The cues that actually carry that read:

- **A single dominant central tachometer**, much larger than anything else;
  the speedometer demoted to a small digital readout rather than a second dial.
- Sparse, thin numerals; a fine needle; a mostly black face.
- A **large digital gear numeral** beside or inside the tach.
- A **shift-light bar** across the top of the binnacle: a row of segments that
  light green → amber → red as revs approach the limit.
- Minimal secondary information — the opposite of the current three-pane
  layout (`DashCluster.js:11`).

### 6.2 Implementation

`src/ui/DashCluster.js` gains a `theme` option: `'classic'` (today's face,
unchanged and still the default) and `'track'`. Keep, unchanged:

- Canvas `W = 784`, `H = 280` and the 2.8:1 `CLUSTER_SIZE` aspect.
- The critically-damped needle spring (`NEEDLE_OMEGA = 12`) — it was tuned
  against `tools/needle-probe.mjs` and 9 measured as sluggish.
- The offscreen static face, the 30 Hz redraw cap (`REDRAW_SEC`), and the
  "skip the redraw when nothing moved" rule. A second theme must not double
  the texture upload cost.

**The tach must stay truthful.** Read the actual rev range and shift points out
of `src/vehicle/Car.js` (it runs a 6-speed automatic with a real power curve
since commit `55cb1d6`) and map the dial to them. Do not invent a 9,000 rpm
redline because the reference car has one — a needle that disagrees with the
engine is worse than a plain dial. If the engine model's range makes the track
face look wrong, say so in your summary rather than fudging the mapping.

Shift-light bar: 12 segments, first segment lights at 70% of the rev limit,
all red at the limit. Segments are canvas fills, not lights, not materials.

### 6.3 Acceptance

- [ ] `tools/cluster-shot.mjs` produces a legible shot of both themes at
      several speeds and gears; attach both to the summary.
- [ ] `tools/needle-probe.mjs` still passes, both themes.
- [ ] Redraw cost unchanged: no more than one texture upload per 1/30 s, and
      still zero uploads when parked in P with nothing changing. Measure, don't
      assume.
- [ ] Theme switch is live — no level reload required.
- [ ] Legible at 390 px wide and in the mirror render.

---

## 7. F5 — Third-person chase camera

### 7.1 Why, and the risk

The user's reason is explicit: "so it's easier for beginners." That is a real
accessibility win — judging a bumper from the driver's seat is the hardest
part of the game for a new player.

The risk is that the project's whole camera design is built on the opposite
principle. `src/camera/DriverCamera.js:3-9` states that "perfectly steady" is a
hard requirement, and that the rig deliberately takes **only** the chassis yaw
and x/z, holding eye height constant, because inheriting chassis pitch and roll
ruins it. A chase camera that inherits body motion will feel wrong in the same
way. Build it to the same standard.

### 7.2 Structure

New `src/camera/ChaseCamera.js`, with the **same shape** as `DriverCamera` —
`setFov`, `setSpeedFov`, `setSensitivity`, an `update(dt)`, and it writes into
the **existing** camera object (§2.1). `src/core/Game.js` picks which rig
drives the camera each frame in `updateRig()` (`Game.js:493`); it does not
create or swap cameras.

### 7.3 Behaviour (numbers are a starting point — tune on screen, then record
the tuned values in the file's header comment)

- Pivot: chassis origin + `(0, 1.05, 0)` in the ground frame.
- Boom length **6.0 m**, height **2.4 m**, pitch **−14°**.
- Yaw follows chassis yaw with a **0.28 s** critically-damped smoothing — the
  same spring form used for the needles and the speed FOV, not a lerp.
- **Take yaw only.** No chassis pitch or roll bleed, per §7.1. On Level 13's
  12% ramps, add the smoothed *floor* pitch the `DriverCamera` already follows
  for multi-floor levels — match whatever it does, do not invent a second rule.
- In **R**: raise to 3.2 m and pitch to −26° rather than swinging the boom
  around, so the player keeps a stable sense of which way is forward. Ease over
  0.35 s.
- **Boom collision:** raycast from pivot to camera against static bodies each
  frame; on a hit, shorten to `hitDistance − 0.25 m`, floor at **2.2 m**.
  Never let the camera go below **y = 0.35 m** above the current floor.
- FOV: the player's `settings.fov`, with the existing speed-FOV kick applied
  (`DriverCamera.js:26-31`) so the two views feel related.

### 7.4 Wiring

- New setting `cameraMode`: `'seat' | 'chase'`. Default `'seat'`.
- Bound to an action in F6's table (default key **C**), cycling between them.
- The cockpit, wheel, hands and arms are cabin objects (DoubleSide + emissive).
  In chase they are mostly hidden by the bodywork; **verify** no interior
  geometry pokes through the roof or doors from outside, and that the camera
  never ends up inside the body shell at minimum boom length.
- Mirrors: their live render targets are pure cost in chase view. Skipping them
  in chase is worth doing, **but** the reverse camera must keep working in R
  (the dash screen is still visible). Measure before and after.
- `ParkCheck`, `Scoring` and the sensors are untouched by camera choice.

### 7.5 Acceptance

- [ ] `tools/drive-test.mjs` **13/13** in both camera modes, 0 console errors.
- [ ] `tools/autodrive.mjs` unaffected (it drives by physics, not by camera —
      prove it, don't assume).
- [ ] New `tools/chase-probe.mjs`: drive a lap of a level in chase mode and
      assert the boom never intersects static geometry, the camera never drops
      below the floor, and yaw smoothing never overshoots.
- [ ] Switching modes mid-drive does not move the car, change the physics step,
      or drop a frame beyond the existing budget.
- [ ] No second camera or scene was created (grep the diff for
      `new THREE.PerspectiveCamera` and `new THREE.Scene`).

---

## 8. F6 — Rebindable keyboard controls

### 8.1 Make `Input.js` data-driven

`src/input/Input.js:6` already says rebinding is "a one-line edit to the maps
below" — make it a runtime map instead. Export an `ACTIONS` table: a stable
`id`, a human label, a category (`driving` / `gears` / `view` / `system`), and
the default `KeyboardEvent.code`s. Today's bindings (`Input.js:24-49`) are the
defaults:

`throttle` W/↑ · `brake` S/↓ · `steerLeft` A/← · `steerRight` D/→ ·
`handbrake` Space · `leanLeft` Q · `leanRight` E · gears P/R/N/F and 1/2/3/4 ·
`gearCycle` G · `pause` Esc · `confirm` Enter · `audioMode` M · `restart` B ·
plus F5's new `cameraMode` (default C).

Note `Input.js:21-22`: Drive is bound to **F**, not D, because D is steer-right.
Keep that default and keep the explanation.

### 8.2 Persistence and validation

New settings field `bindings`: a map of action id → array of up to 2 codes.
Validator rules, applied field by field on load (`settings.js:81`):

- Codes must match `/^(Key[A-Z]|Digit[0-9]|Arrow(Up|Down|Left|Right)|Space|Enter|Escape|Numpad[0-9]|Shift(Left|Right)|Control(Left|Right)|Alt(Left|Right)|Tab|Backquote|Minus|Equal|Comma|Period|Slash|Semicolon|Quote|Bracket(Left|Right)|Backslash)$/`.
  Anything else is rejected and that action falls back to its default.
- Reject browser-reserved keys outright: `F1`–`F12`, `Tab` in combination with
  nothing, and anything the page cannot receive.
- **Escape always remains a pause binding**, regardless of what the player
  does, so a bad remap can never lock someone out of the menu. If the player
  binds Escape elsewhere, keep pause on it too and say so in the UI.
- Duplicate detection: a code bound to two actions is a conflict. The UI must
  show it and offer to clear the other binding; it must never silently steal.
- An unknown action id in a stored payload is ignored (forward compatibility).

### 8.3 UI

New "Controls" panel in `Hud.js`, grouped by category. Each row: action label,
its one or two bindings as keycaps, a "Change" affordance. Clicking enters
capture mode: "Press a key…", the next `keydown` binds it, **Escape cancels the
capture** (it does not bind Escape). Ignore modifier-only presses. A "Reset to
defaults" button follows `resetSeat()`'s shape.

While capturing, `input.setEnabled(false)` so the press does not also drive the
car — the menu path already does this (`Input.js:175`).

### 8.4 The parts people forget

- **The on-screen key legend is hard-coded HTML** at `Hud.js:308`. It must be
  generated from the live bindings and re-rendered when they change.
- **The tutorial names keys in its copy** (`src/game/Tutorial.js`). Grep the
  whole `src/` tree for literal key names — `'Space'`, `'W/S'`, `'Q'`, `'Esc'`,
  keycap markup — and route every one through the bindings.
- The homepage's "How to play" section (`src/site/home.js`) shows keycaps too.
  It is a static marketing page and does not read the player's settings —
  **leave it on the defaults**, but if you change a default, update it.

### 8.5 Acceptance

- [ ] New probe `tools/rebind-probe.mjs`: rebind throttle to `KeyT`, dispatch
      real `KeyboardEvent`s, and prove the car drives on T and no longer on W.
- [ ] Conflict detection proven with a deliberate collision.
- [ ] A corrupt/hand-edited `bindings` payload loads to defaults without
      throwing.
- [ ] Escape still opens the menu after a hostile remap attempt.
- [ ] Legend and tutorial text both reflect a custom binding.
- [ ] `tools/tutorial-probe.mjs` and `tools/shell-probe.mjs` still pass.

---

## 9. Regression set — run after every stage

From CLAUDE.md §8. Dev server on **5175**: `npx vite --port 5175 --strictPort`.
`npm install --no-save puppeteer-core` (and reinstall it after any later
`npm install <pkg>`, which prunes it).

```
node tools/level-lint.mjs           # expect 13 levels, 0 failures, 0 warnings
node tools/physics-probe.mjs
node tools/drive-test.mjs           # expect 13/13, 0 console errors
node tools/sensor-probe.mjs         # expect 0 failures
node tools/tutorial-probe.mjs       # expect PASS
node tools/shell-probe.mjs          # expect 0 failures
node tools/autodrive.mjs            # expect 4/4
node tools/city-lint.mjs            # expect 11/11
node design/level13/build-layout.mjs
```

Plus the new probes as they land: `radar-probe`, `chase-probe`, `rebind-probe`.

Headless notes that will otherwise cost you an hour: software WebGL runs game
time ~20× slower than wall time, so **never assert on wall-clock sleeps** — use
`debugTick(s)` or `debugRig(s)`. For GPU-accurate screenshots on this machine
use Chrome args `--use-angle=metal --enable-gpu --ignore-gpu-blocklist`.
Teleporting onto a target pose in P completes the level; use N or an empty bay.

New debug hooks to add alongside the features, for the probes to use:
`debugRadar()`, `debugCameraMode(mode)`, `debugBindings()`, `debugHud()`.

---

## 10. Decisions for the user (defaults chosen so you are not blocked)

- **D1 — Chase camera and scoring.** Third person makes parking materially
  easier. Options: (a) no effect on score, record `camera: 'chase'` on the
  results card; (b) score penalty; (c) chase disabled on the last few levels.
  **Default: (a)** — it is an accessibility feature, and a silent penalty is
  worse than none. Flag the choice in your summary.
- **D2 — Track cluster as default.** Options: `classic` stays default and
  `track` is opt-in, or `track` becomes the default. **Default: `classic`
  stays**, because every existing screenshot, the homepage and the preview
  build show it.
- **D3 — Radar default placement.** Dash screen (in-world, preserves the
  first-person illusion) versus DOM overlay (visible in R alongside the
  reverse camera). **Default: dash screen**, overlay available in the HUD
  panel.

---

## 11. Explicitly out of scope

Do not do these in this piece of work, even though they are adjacent:

- Photo mode (agreed feature, separate brief).
- Gamepad support (F6 is keyboard only; do not half-build a pad layer).
- Touch controls.
- Any change to `Car.js` handling, `Dimensions.js` chassis numbers, or level
  geometry.
- Recapturing the homepage screenshots (they will be stale after F1 and F4 —
  note it in your summary, do not act on it).
- Committing, pushing or deploying. CLAUDE.md §2: never commit, push or deploy
  unless the user asks. The live site is a separate, hard-to-reverse decision.

---

## 12. Definition of Done

- [ ] All six features implemented, each with its own acceptance list ticked.
- [ ] Full regression set green, pasted into the summary.
- [ ] Before/after screenshots for F1, F2, F4 and F5, at `high` quality,
      1100 × 760, GPU (metal) — not swiftshader.
- [ ] Draw-call and frame-time measurements versus the 932 / 2.9 ms baseline,
      per feature, not just a total at the end.
- [ ] No new console errors or warnings in `drive-test`.
- [ ] `settings.js` still loads a pre-change v4 payload cleanly.
- [ ] `ARCHITECTURE.md` updated with the new modules
      (`ProximityScan.js`, `ProximityRadar.js`, `ChaseCamera.js`) and the new
      `Input.js` binding model; `NOTES.md` gains this session's decisions.
- [ ] The three §10 decisions named, with what you actually shipped.
- [ ] Nothing committed, pushed or deployed.
