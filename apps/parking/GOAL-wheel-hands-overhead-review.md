# GOAL — Sport steering wheel, articulated hands, and the overhead parking review

This file is a complete brief for one `/goal` run on **Parking Precision**
(`~/parking-game-v1`). It has three deliverables:

| Part | Deliverable | One-line summary |
|---|---|---|
| **A** | Sport steering wheel | Replace the placeholder wheel with a low-poly 3-spoke sport wheel (spokes at 9, 3 and 6 o'clock) |
| **B** | Hands and arms | Articulated hands that wrap the rim, rest at 9 and 3, and steer hand-over-hand without clipping, snapping or locking an arm |
| **C** | Overhead ("helicopter") parking review | After a level ends, the camera flies up over the bay and shows how close the park was to perfect: ghost of the ideal pose, measured offsets, clearances |

Nothing in this file is a suggestion unless it is explicitly labelled
**optional**. Numbers marked *measured* were taken from the code as it stands
on 14 Sep 2026 (commit `0a66bcd` on `main`). Numbers marked *starting value*
are yours to tune, but every tuned value goes in `src/vehicle/Dimensions.js`
(or `Palette.js` for colours) and its final value goes in `NOTES.md`.

---

## How to run this goal

```
/goal /Users/dakshgiis/parking-game-v1/GOAL-wheel-hands-overhead-review.md — complete every item in its "Definition of Done" and show the evidence it asks for
```

### Read these first, in this order

1. `CLAUDE.md` — measured conventions, load-bearing constraints, tool list.
2. `NOTES.md` — every past bug. Several constraints below exist because of one.
3. `ARCHITECTURE.md` — frame order, off-screen rendering rules, module map.
4. `CAR_DESIGN.md` — cabin package table (eye, wheel hub, shoulders, cluster, screen).
5. `src/vehicle/Cockpit.js`, `src/vehicle/Driver.js`, `src/vehicle/Dimensions.js`.
6. `src/core/Game.js` (`completeLevel`, `failLevel`, `teardown`, `updateRig`, `draw`, the `debug*` hooks).
7. `src/ui/Hud.js` (`showResults`, `showFailed`, `showPanel`, the seat tuner as a model for a docked card).
8. `src/game/ParkCheck.js`, `src/game/Scoring.js`, `src/world/LevelBuilder.js`, `src/world/Garage.js`, `src/world/Props.js` (`createTargetBay`).
9. `tools/level-lint.mjs` (its plan-view geometry is reused in Part C), `tools/tutorial-probe.mjs` and `tools/autodrive.mjs` (real-key-input patterns to copy).

### Order of work

**A → B → C.** Part B depends on Part A's rim-curve API. Part C is
independent, but do it last so the regression suite runs once over
everything. Run the regression list in Part D at the end of **each** part,
not only at the end.

---

## 0. Ground truth and non-negotiable rules

### Environment

- Dev server: `npm run dev`. Every browser tool hardcodes **port 5175**. Check
  `lsof -iTCP:5175 -sTCP:LISTEN` before starting a second server.
- Browser tools use `puppeteer-core` installed with
  `npm install --no-save puppeteer-core` (deliberately **not** a dependency).
  An ordinary `npm install` can prune it; reinstall the same way if an import
  fails.
- Headless timing: **never** assert on wall-clock sleeps. Use
  `window.__game.debugTick(s)` (simulation only) or `debugRig(s, dt)`
  (simulation + camera, driver IK, cockpit, instruments). Software WebGL runs
  game time ~20× slower than wall time.
- Always open the game with `?lowfx=1` in headless runs.

### Project rules that apply to this work (all from CLAUDE.md / NOTES.md)

1. **Every hard number about the car lives in `Dimensions.js`.** Colours live in
   `Palette.js`. No inline magic numbers in Cockpit/Driver/review code beyond
   trivially local ones (loop counters, easing exponents).
2. **No imported assets.** No textures, images, fonts, models or audio files.
   Canvas-generated textures are allowed (the cluster already uses one).
   Everything visible is procedural geometry. If you add *any* npm dependency
   that ships code, add its licence to `THIRD_PARTY_NOTICES.md`; `three/addons/*`
   is part of three.js and needs no new notice.
3. **No `metalness` anywhere** (no environment map; metals render black —
   NOTES.md v2).
4. **Cabin materials are DoubleSide with a small emissive term.** The cabin gets
   no light from any source. Copy the existing `surf()` / `matte(..., { emissive })`
   pattern. The wheel, hands and arms are cabin objects.
5. **Palette materials are cached and shared by key.** Never mutate a material
   returned by `matte()` / `flat()` / `glow()`; clone it and mark
   `userData.disposable = true` if it needs per-instance state (NOTES.md: the
   target bay bug).
6. **ONE scene and ONE camera for the process lifetime.** `RenderPass` and
   `SAOPass` capture the camera object at construction (`Renderer.js`). The
   overhead review must move and re-project **the same camera object**
   (`cameraRig.camera`), exactly like the existing `freeCam` branch in
   `Game.updateRig`. Do not create a second camera for the main view.
7. **Off-screen passes:** HalfFloat linear render targets; reuse shadow maps only
   once `framesSinceLoad > 0`; a mirror hides its own glass while rendering.
8. **Arm reach is a real constraint** (see Part B, measured table).
9. **Seat adjustment moves the camera only.** The shoulders never move with it.
   The wheel must still work at every seat setting in `SEAT_ADJUST`.
10. **macOS filesystem is case-insensitive.** Never create two files in one
    directory whose names differ only by case (`Hud.js` / `hud.js` destroyed a file
    once, and a case mismatch between git's index and imports nearly broke the
    Vercel Linux build). Pick new names that don't collide with anything in the
    same directory.
11. **State names are load-bearing.** `drive-test`, `autodrive`, `tutorial-probe`
    and `shell-probe` check `debug().state` for `'menu' | 'driving' | 'paused' |
    'results'`. Keep those exact names. The review is a sub-mode of `'results'`,
    not a new state.
12. **Teleporting onto a target pose in P completes the level.** In older probes
    that was a trap; in Part C it's the method.
13. **Do not change handling.** `Car.js` steering constants
    (`STEER_TO_LOCK_TIME = 0.45`, `STEER_RETURN_TIME = 0.4`,
    `WHEEL_HALF_TURNS_RAD = 2π`), engine/brake forces, the car's 4.20 × 1.78 m
    footprint, level geometry and scoring weights are all out of scope. The hands
    must be solved *visually* around the steering model as it is.
14. **The repo is public and all-rights-reserved; the game is live** at
    https://parking-precision.vercel.app. This goal does **not** commit, push or
    deploy (see "Out of scope"). Never touch `.env.local` (it holds a Vercel OIDC
    token; `.env*` is gitignored).
15. **No browser dialogs** (`alert`/`confirm`/`prompt`) anywhere, and no emoji in
    game UI.

---

## Part A — Sport steering wheel

### A.1 What exists today (measured)

`src/vehicle/Cockpit.js`, section `--- steering column + wheel ---`:

| Element | Today |
|---|---|
| Pivot | `wheelPivot` at `WHEEL_HUB = [DRIVER_X, fromGround(0.86), -0.16]`, `rotation.x = -WHEEL_TILT_RAD` (22° lay-back). Local +Z points back at the driver. |
| Rim | `TorusGeometry(WHEEL_RIM_RADIUS = 0.175, tube 0.022, 8 radial, 28 tubular)`. A perfect circle; the tube radius is an inline literal. |
| Spokes | `for (const a of [Math.PI / 2, -Math.PI / 2, Math.PI])`, a box `0.95R × 0.028 × 0.018` at half radius. **This puts the spokes at 12, 6 and 9 o'clock.** The comment says "9, 3 and 6". There is no 3 o'clock spoke, and a spoke points straight **up** into the 12 o'clock marker. |
| Hub | `CylinderGeometry(0.055, 0.055, 0.035, 12)`, `COLORS.dashSoft`. |
| 12 o'clock marker | A `0.03 × 0.045 × 0.03` box, colour `0xd8d4cb`, sitting *on* the rim (hands would pass through it). |
| Rotation | `rimGroup.rotation.z = wheelAngleRad` where `wheelAngleRad = -steerNorm * 2π`: ±360° of rim, 720° lock to lock. Positive `steerNorm` (right) is clockwise as the driver sees it. |
| Material | `surf(COLORS.wheelRim = 0x2c2a28, emissive 0x101010)`, DoubleSide Lambert. |
| Contract used by Driver.js | `gripPointLocal(spatialAngle, radial)` — a point on a **circle** of radius `R + radial`, angle measured clockwise from 12 o'clock as the driver sees it; `wheelNormalLocal()`; `shifterKnobLocal()`. |

### A.2 Visual brief

A contemporary 3-spoke sport wheel in the Porsche/Audi *idiom*: generic
surfacing, **no badge, logo, lettering or marque** (the same no-brand position
`CAR_DESIGN.md` and `TERMS.md` §3 take for the whole car). It must read at a
glance from the driver's seat at 0.45–0.55 m, flat-shaded and low-poly like
everything else.

- **Two side spokes** exactly at 3 and 9 o'clock (centrelines at material angles
  +90° and −90°) and **one lower spoke** at 6 o'clock (180°). With the wheel
  straight, the lower spoke points straight **down**. No spoke at 12.
- The **lower spoke is visually heavier** than the side spokes (wider, or a
  double bar), so rotation reads even with a hand covering a side spoke.
- A **thicker rim** than today, with a **flattened bottom** (D-shape).
- **Thumb grips**: subtle bulges on the rim's inner edge where the side spokes
  meet it.
- **Padded centre hub**: a chamfered octagonal or rounded-rectangle prism,
  slightly **dished** (the hub sits further from the driver than the rim plane).
- A **contrasting 12 o'clock stripe** that *wraps the rim tube* as a band, not a
  box standing proud of it, so hands can grip across it without clipping and
  720° of rotation stays readable.

### A.3 Geometry constants (add to `Dimensions.js`; starting values)

| Constant | Starting value | Notes |
|---|---|---|
| `WHEEL_RIM_RADIUS` | **0.175 (keep)** | Changing it re-opens arm reach and the cluster sightline. Don't, unless you re-run both checks in A.7. |
| `WHEEL_HUB`, `WHEEL_TILT_RAD` | **keep** | Same reason. |
| `WHEEL_RIM_TUBE` | 0.025 | was 0.022 inline |
| `WHEEL_RIM_FLAT_HALF_DEG` | 32 | Flat bottom spans polar angles 180° ± 32° (see A.4) |
| `WHEEL_RIM_SEGMENTS` | 56 tubular, 8 radial | Low-poly but round at 0.5 m; the flat segment gets its own vertices |
| `WHEEL_SPOKE_SIDE` | thickness 0.030 (in the wheel plane), depth 0.020 | length derived: hub edge to rim inner surface |
| `WHEEL_SPOKE_LOWER` | width 0.050 (or two 0.018 bars 0.014 apart), depth 0.020 | |
| `WHEEL_DISH` | 0.022 | hub-plane offset away from the driver along the wheel axis; spokes slope to meet it |
| `WHEEL_HUB_PAD` | 0.130 wide × 0.095 tall × 0.045 deep, 8-sided, 12 mm chamfer | no emblem, no lettering |
| `WHEEL_THUMB_GRIP` | 0.060 long along the rim, +0.006 tube radius, inner side only, centred at ±90° material | blend in over its length, no step |
| `WHEEL_STRIPE` | 0.018 m arc length centred at material angle 0°, tube radius + 0.0015 | |

### A.4 The rim curve is a single shared function

Create a **pure math module** (no three.js import), e.g.
`src/vehicle/RimCurve.js`, used by `Cockpit.js`, `Driver.js` and the probes (in
page, via `await import('/src/vehicle/RimCurve.js')`, the way `drive-test`
imports `Levels.js`).

Define the rim centreline in the wheel's local 2D plane (x right, y up as the
driver sees it, clockwise polar angle θ from 12 o'clock):

- For θ outside `[180° − F, 180° + F]` (F = `WHEEL_RIM_FLAT_HALF_DEG`): the point
  at radius R along the ray, `(R·sin θ, R·cos θ)`.
- For θ inside that range: the intersection of the ray with the horizontal chord
  `y = −R·cos F`. That is radius `r(θ) = R·cos F / cos(θ − 180°)`. This equals R
  at both ends, so the curve is continuous. A small fillet (≤ 6° each side) is
  allowed to soften the two corners, provided the same function is used
  everywhere.

Export at least:

```
rimPoint2D(thetaRad)          -> { x, y }                       // centreline, wheel plane
rimFrame2D(thetaRad)          -> { x, y, tx, ty, nx, ny }       // unit tangent (increasing θ = clockwise), unit outward normal
RIM_TUBE                      -> tube radius
```

Then in `Cockpit.js`:

- `gripPointLocal(spatialAngle, radial)` **keeps its signature and meaning**
  ("a point on the rim, plus `radial` metres outward"). It now uses `rimFrame2D`
  (outward normal, not the hub ray) and applies the same tilt and `WHEEL_HUB`
  transform as today.
- Add `rimFrameLocal(spatialAngle, out)`, which returns the car-local centreline
  point, unit tangent, unit in-plane outward normal, and the wheel axis (toward
  the driver). `Driver.js` builds hand orientations from this. Its current
  `rimQuaternion()` samples `gripPointLocal(spatial, -1)` as "one metre inward",
  which is only valid for a circle.
- Build the rim mesh as a `TubeGeometry` along a closed `Curve3` that samples
  `rimPoint2D`. The stripe and thumb grips are short tubes along the same curve.
  Material angle 0 is 12 o'clock on the **rim**, so the stripe, spokes and grips
  all rotate with `rimGroup`.

### A.5 Materials and palette

Add named entries to `Palette.js`, all matte Lambert, DoubleSide, with the cabin
emissive term:

- `wheelRim` (keep 0x2c2a28) — leather rim and thumb grips.
- `wheelSpoke` (new, e.g. satin dark grey near `0x4a4744`) — spokes. **Not metal.**
- `wheelHub` (new, or reuse `dashSoft`) — hub pad.
- `wheelStripe` (new, a warm contrast such as `COLORS.hazard` 0xe3c98f) — 12 o'clock band.

Set `flatShading: true` on these materials if it reads better (Lambert supports
it). Materials come from `matte(color, opts)` so they are cached; don't mutate
them.

### A.6 Draw-call budget

Merge geometry per material (`mergeGeometries` already exists in
`BodyLoft.js`/three addons): rim + thumb grips, spokes, hub pad, stripe → **at most
4 draw calls** for the whole wheel (today it's 6 meshes). Measure with
`window.__game.debugBenchmark(10, 'static')` before and after; report the
difference.

### A.7 Re-checks the wheel change must pass

The thicker tube raises the rim top by ~3 mm, and the dish moves the hub. Measure;
don't assume:

1. **Cluster sightline.** `CAR_DESIGN.md` records the sightline over the rim top
   meeting the cluster plane at 0.894 m, 5 cm below the cluster's bottom edge
   (0.945 m). Compute it from the new geometry for `seatY ∈ {−0.08, 0, +0.14}`.
   At the default seat (0) the cluster bottom must stay ≥ **1.0 cm** above the
   rim sightline. Report the other two (the lowest seat may overlap; say by how much).
2. **Reversing screen** fully visible at the default seat in R:
   `node tools/seat-shot.mjs wheel-A-R 1 R 1440x900` — look at it.
3. **Arm reach** — re-measured with the new `gripPointLocal` in Part B's probe.

### A.8 Part A acceptance

- Spokes: at `steerNorm = 0`, the in-plane direction of the lower spoke is 180° ±
  1°, the side spokes 90° ± 1° and 270° ± 1°. Check numerically through a debug hook
  (`window.__game.debugWheelParts()` → OBBs of spokes, hub pad, stripe, grip
  centres, in car-local space, plus the rim parameters).
- `gripPointLocal` and `rimFrameLocal` agree with `RimCurve.js` to 0.1 mm at 360
  sample angles, and every rim-tube vertex lies within 0.5 mm of
  `RIM_TUBE` from the centreline curve (script it).
- Seat screenshots at 0°, ±90°, ±180°, ±360° (see B.11) show the lower spoke
  straight down at 0° and at ±360°, and the stripe at 12 at 0° and ±360°.
- Wheel draw calls ≤ 4. A.7 checks reported with numbers.

---

## Part B — Articulated hands and hand-over-hand steering

### B.1 What exists today (measured, `src/vehicle/Driver.js`)

- **Arms:** two-bone analytic IK (law of cosines) with pole vectors
  `(∓0.55, −0.8, 0.2)`. Upper arm capsule radius 0.046, forearm 0.039.
  `UPPER_ARM = 0.32`, `FOREARM = 0.34` (0.66 m total). Shoulders at
  `SHOULDER_L/R = [DRIVER_X ∓ 0.235, fromGround(0.99), 0.42]`. When a target is out
  of reach, the solver clamps and the arm locks straight.
- **Hands:** a palm box `0.055 × 0.09 × 0.064`, a thumb box, a sleeve cuff. **No
  fingers.** The wrist sits 3.5 cm behind the contact point along the hand's +Z.
- **Grip:** rest at **10 and 2** (`DEFAULT_GRIP = 60°`). Each hand grips a *material*
  angle; `spatial = material + steerNorm·2π`. When `|spatial| > COMFORT_ARC (132°)`
  the hand lerps its material angle **180°** around the rim in `REGRIP_TIME = 0.26 s`,
  lifted `REGRIP_LIFT = 0.055` m **radially outward**. Nothing stops a hand from
  sliding through the other hand, or from crossing to the far half of the rim.
- **Shifting:** only the right hand shifts, in phases `release 0.16 → toKnob 0.22
  (quadratic Bézier) → hold 0.30 → back 0.32` = 1.00 s. `onShifterGrabbed(gear)`
  fires on arrival at the knob; **that** is when the lever moves. The left hand
  never leaves the wheel. The right hand re-plants at 2 o'clock afterwards.
- **Allocations:** `update()` allocates (`new THREE.Vector3()` for the knob offset,
  `new THREE.Quaternion()` in `rimQuaternion`) every frame despite the comment
  about scratch objects.

### B.2 Measured problems that shape the design

**1. Reach — the halves.** Shoulder → wrist distance at each spatial rim angle,
current rig (wrist 3.5 cm behind contact, along the wheel normal). `!` marks
> 0.97 × arm = 0.640 m:

| spatial° | left | right | | spatial° | left | right |
|---|---|---|---|---|---|---|
| −180 | 0.605 | 0.605 | | 10 | 0.669 ! | 0.647 ! |
| −160 | 0.583 | 0.629 | | 20 | 0.678 ! | 0.635 |
| −140 | 0.566 | 0.653 ! | | 40 | 0.691 ! | 0.610 |
| −120 | 0.558 | 0.674 ! | | 60 | 0.698 ! | 0.587 |
| −90 (9 o'clock) | **0.563** | 0.694 ! | | 90 (3 o'clock) | 0.694 ! | **0.563** |
| −60 | 0.587 | 0.698 ! | | 120 | 0.674 ! | 0.558 |
| −40 | 0.610 | 0.691 ! | | 140 | 0.653 ! | 0.566 |
| −20 | 0.635 | 0.678 ! | | 160 | 0.629 | 0.583 |
| −10 | 0.647 ! | 0.669 ! | | 180 | 0.605 | 0.605 |
| 0 (12 o'clock) | 0.658 ! | 0.658 ! | | | | |

**Each hand reaches its own half of the rim comfortably (0.557–0.635 m).**
Every lock-out happens when a hand crosses to the far half, which the current
180° shuffle allows. So the fix is a **domain rule**, not longer arms:
left hand `[−160°, −20°]`, right hand `[+20°, +160°]`. Every angle in both
domains measures ≤ 0.635 m. Rest positions 9 and 3 measure 0.563 m.

**2. Rim speed — the steering model is binary.** Keyboard steering ramps
`steerNorm` at a constant rate while a key is held, so the rim turns at exactly:

- **800°/s** while turning in (`2π / 0.45 s`) = **2.44 m/s** at the rim = **4.07 cm per frame** at 60 Hz;
- **900°/s** self-centring (`2π / 0.40 s`) = **4.58 cm per frame**;
- **0** otherwise.

There is no slow steering. A hand-over-hand rig that keeps both hands welded to
the rim, or allows only one hand off at a time at human speed (~150–300°/s),
cannot keep up. The design below therefore includes **SLIP**: a hand that reaches
the edge of its domain while the rim is still turning holds its position with a
loosened grip, and the rim slides through it, as real drivers do on fast returns.

**3. Separation.** With domains ending at ±20° and ±160°, the closest two
gripping contact points can be is a 40° chord: `2 × 0.175 × sin 20° = 11.97 cm`.
That's more than one hand's width across the knuckles (~8.5 cm), so hands on their
own domains cannot touch.

### B.3 Hand model

A procedural, flat-shaded, low-poly hand per side, built once. Suggested new
module: `src/vehicle/HandModel.js`, used by `Driver.js`.

| Part | Starting dimensions (m) | Structure |
|---|---|---|
| Palm | 0.080 long × 0.085 wide × 0.026 thick, slightly tapered toward the wrist | one mesh |
| Index / middle / ring / little finger | total lengths 0.075 / 0.082 / 0.078 / 0.062; phalanx split 45% / 30% / 25%; thickness 0.017 tapering to 0.014; knuckle spacing 0.020 | 3 segments each, each on its own pivot `Group` (MCP, PIP, DIP) |
| Thumb | metacarpal 0.045, proximal 0.032, distal 0.028; thickness 0.019 | 3 segments; the CMC pivot allows both flexion and opposition |
| Wrist + cuff | cuff 0.066 × 0.030 × 0.074, `COLORS.sleeve` | cuff joins the forearm capsule without a visible gap |

- Segments are boxes (shared unit `BoxGeometry` scaled) or 5-sided capsules; boxes
  read more "low-poly" and are preferred.
- `COLORS.skin` / `COLORS.sleeve` materials with the existing emissive terms
  (`0x3a2a1e` / `0x232c33`).
- Left hand = mirrored right hand. A negative-scale parent is acceptable (three.js
  flips the winding for negative-determinant matrices), **but** check lighting on
  both hands in the screenshots; build mirrored geometry if one looks wrong.
- Budget: ≤ **600 triangles per hand**, ≤ **24 meshes per hand**, total added
  draw calls ≤ **+50** versus today (measure with `debugBenchmark`).
- No per-frame allocations anywhere in `Driver.js` or `HandModel.js` (preallocate
  scratch vectors/quaternions; fix the two existing allocations listed in B.1).

### B.4 Poses

Each pose is a table of joint angles (degrees) blended per joint. Starting values:

| Pose | Finger MCP / PIP / DIP | Thumb CMC flex / opposition, MCP, IP | Use |
|---|---|---|---|
| `RIM_GRIP` | 62 / 84 / 48 (index 5° less, little finger 6° more) | 25 / 40, 20, 15 | welded to the rim |
| `RIM_SLIP` | 45 / 60 / 30 | 15 / 30, 10, 5 | rim sliding through a loose grip |
| `THUMB_ON_SPOKE` | as `RIM_GRIP` | 5 / 10, 0, 5 — thumb lies along the side spoke's top edge | rest at 9/3 when a side spoke is within ±8° of the hand |
| `RELAXED` | 18 / 22 / 10 | 10 / 20, 5, 5 | released, travelling |
| `KNOB_GRIP` | 70 / 80 / 40, wrapping the 0.045 m knob sphere | 35 / 55, 25, 20 | shifting |

Blend with an exponential approach (`angle += (target − angle)·(1 − e^(−k·dt))`,
k ≈ 28) or a time-based smootherstep over 60–90 ms. **Joint angular speed must never
exceed 1200°/s** (no finger snaps).

### B.5 Grip geometry — what "on the rim" means

Use `Cockpit.rimFrameLocal(spatial)`: centreline point `C`, tangent `t`, in-plane
outward normal `n`, wheel axis `a` (toward the driver).

- **Palm contact point** (a fixed point on the palm's inner surface, defined in
  `HandModel`) sits on the rim tube surface at `C + (a·cos φ + n·sin φ)·(RIM_TUBE + skinGap)`,
  with φ ≈ 35° (palm on the driver-facing, slightly outer side of the tube) and
  `skinGap ≈ 0.004`.
- Knuckles run along `t`; fingers wrap **around the tube away from the driver**
  and finish on the inner (hub-side) face.
- **The palm centre is offset along `t` by +8°** of arc from the gripped angle toward
  12 o'clock when a side spoke is within ±8°, so the fingers wrap the rim just above
  the spoke junction and the thumb lies on the spoke (`THUMB_ON_SPOKE`).
- **Spoke avoidance:** when choosing a re-grip target (TRAVEL, SETTLE, post-shift),
  reject spatial targets whose *material* angle is within ±12° of the lower spoke
  (180°), or within ±12° of a side spoke unless it's the rest thumb-on-spoke pose.
  Nudge to the nearest clear angle inside the domain. In GRIP/SLIP the hand never
  moves relative to a spoke it isn't already clear of, except in SLIP, where the
  fingers blend toward `RIM_SLIP` (which clears a 20 mm spoke).
- **Penetration limits** (asserted in B.10): no finger/palm/thumb segment penetrates
  the rim tube, a spoke, the hub pad or the stripe by more than **3 mm**. The thumb
  touching a spoke top in `THUMB_ON_SPOKE` is contact, not penetration, within the
  same 3 mm.

### B.6 Steering behaviour — per-hand state machine

States: `GRIP`, `SLIP`, `RELEASE`, `TRAVEL`, `REGRIP`, `SETTLE` (a TRAVEL whose
target is the rest angle), and `SHIFT` (right hand only).

Definitions: `rim` = current rim angle (radians, clockwise-positive = `steerNorm·2π`);
`ω` = rim angular velocity this frame; a hand's `spatial` = its angle on the rim
as the driver sees it; `domain` = `[−160°, −20°]` left / `[+20°, +160°]` right;
**soft edge** = 25° inside a hard edge; **in contact** = GRIP or SLIP.

| From | To | Condition | Behaviour |
|---|---|---|---|
| GRIP | — | — | Welded: `material` fixed, `spatial = material + rim`. Pose `RIM_GRIP` (or `THUMB_ON_SPOKE`). |
| GRIP | SLIP | `spatial` reaches a **hard** edge while `ω` moves it further out | Clamp `spatial` at the edge. |
| SLIP | — | — | `spatial` fixed at the clamp; `material = clamp − rim` recomputed every frame (so re-welding is seamless). Pose `RIM_SLIP`. Contact stays on the tube surface. |
| SLIP | GRIP | `ω` reverses (would carry the hand back inside), or `ω = 0` for ≥ 0.05 s | Re-weld at the current point. |
| GRIP or SLIP | RELEASE | Hand is past its **soft** edge in the direction of rim motion **and** the other hand is in contact **and** no shift is in progress **and** ≥ 0.10 s since this hand's last REGRIP | Hand-over-hand begins. |
| RELEASE | TRAVEL | after **0.06 s** | Fingers → `RELAXED`; contact lifts 1.0 cm off the tube along `a`. |
| TRAVEL | REGRIP | after **0.22 s** | Path: from the release point to the target along the rim curve's parametrisation, offset by `a·0.06·sin(πu) + n·0.015·sin(πu)` (u = smootherstep progress). The target spatial angle is **predicted**: `target material = targetSpatial − rim(arrival)`, with `rim(arrival) = rim + ω·(remaining TRAVEL + REGRIP time)`, clamped into the domain and spoke-nudged (B.5). |
| REGRIP | GRIP | after **0.07 s** | Fingers close to `RIM_GRIP`. |
| GRIP (idle) | SETTLE | `ω = 0` for ≥ **0.35 s**, `|spatial − rest| > 12°`, the other hand is in GRIP, no shift | RELEASE → TRAVEL → REGRIP to rest (left −90°, right +90°, spoke-nudged). **One hand at a time**, left first. |
| any (right) | SHIFT | `beginShift(gear)` | See B.7. |

- **Re-grip targets.** Moving clockwise (increasing spatial): left targets −130°,
  right targets +50°. Moving counter-clockwise: left −50°, right +130°. So for a
  right turn the right hand pulls down and re-grips high; for a left turn,
  mirror that.
- **Tie-break.** If both hands qualify for RELEASE in the same frame: on clockwise
  rim motion the **right** hand goes first; on counter-clockwise, the **left**. The
  other hand stays in contact (it will SLIP at its hard edge if needed).
- **Invariant: never both hands out of contact.** Out of contact means RELEASE,
  TRAVEL, REGRIP, SETTLE or SHIFT. The only exception is none. If the right hand
  enters SHIFT while the left is out of contact, the SHIFT *release* phase waits
  until the left hand is back in contact (B.7).
- **No slipping forever.** A hand may not stay in SLIP for more than **0.35 s**
  continuously while the other hand is in GRIP and no shift is in progress. It must
  RELEASE instead.
- **Self-centring.** When keys are released the rim returns at 900°/s. Hands are
  carried, slip at their edges, and after 0.35 s idle they SETTLE to 9 and 3. At
  `steerNorm = 0` with the car at rest they end at exactly 9 and 3 with thumbs on
  the side spokes.
- **Why not the current 180° shuffle:** it crosses to the far half (arms lock,
  B.2 table) and lerps through the other hand. Remove `COMFORT_ARC` and the 180°
  shuffle entirely.

### B.7 Shifting (preserve the contract)

- Keep `beginShift(gear)`, the four phases and their durations
  (0.16 / 0.22 / 0.30 / 0.32 s), and `onShifterGrabbed(gear)` firing **only on
  arrival at the knob**. The lever must never move without the hand on it.
- The right hand leaves from wherever it currently is (GRIP, SLIP or mid-TRAVEL: if
  mid-TRAVEL, it continues from the current travel pose; don't snap to the rim
  first).
- **The left hand may not leave the rim during a shift** (no RELEASE/TRAVEL/SETTLE
  for the left hand while the right is in SHIFT). If the left hand is out of contact
  when the shift starts, the release phase is delayed until it's in contact
  (≤ 0.35 s).
- Fingers blend `RIM_GRIP → RELAXED → KNOB_GRIP` on the way down and reverse on the
  way back.
- After `back`, the right hand re-grips at spatial **+90°** (3 o'clock), spoke-nudged
  and domain-clamped, entering REGRIP (not an instant plant).
- With `steerNorm` non-zero during a shift, the left hand alone is carried and slips
  as needed. That's acceptable.

### B.8 Arm IK

- Keep the analytic two-bone solver. Tune pole vectors so the elbows hang down and
  out and never flip across the arm during TRAVEL (an elbow's position must not jump
  > 3 cm per frame).
- **Do not move the wheel.** If the new hand geometry moves the wrist enough that any
  domain angle exceeds the extension limit, fix it by (in order of preference): hand
  contact offsets and wrist offset → pole vectors → domain edges tightened to ±25°
  and ±155° → shoulder x/y (z must stay ≥ 0.40) → arm lengths up to +0.02 m each.
  Anything that makes the upper arms visible as blobs in the seat view is not a fix
  (NOTES.md: "Arms then filled the lower corners"). Check with screenshots at
  `seatZ = +0.08` (the most rearward seat) as well as the default.
- Keep `SEAT_ADJUST` working: the hands must not change behaviour with seat
  settings (they're car-local and the shoulders don't move).

### B.9 Debug hooks (add; keep every existing hook)

- `debug().driver` → JSON-serialisable:
  ```
  {
    rim: { angleDeg, omegaDegS },
    hands: {
      left:  { state, spatialDeg, materialDeg, contact:[x,y,z], palmCentre:[x,y,z],
               wrist:[x,y,z], elbow:[x,y,z], shoulder:[x,y,z], extensionRatio,
               segments:[{ name, centre:[x,y,z], halfExtents:[x,y,z], quat:[x,y,z,w] }] },
      right: { …same…, shiftPhase: null|'release'|'toKnob'|'hold'|'back' }
    }
  }
  ```
  All positions in car-local space. `extensionRatio = |shoulder − wrist| / (UPPER_ARM + FOREARM)`.
- `window.__game.debugWheelParts()` → spokes, hub pad, stripe and thumb grips as OBBs
  (car-local, current rotation), plus `{ R, tube, flatHalfDeg, hub, tiltRad }`.
- `window.__game.debugCabinView(preset | null)` → presets:
  - `'passenger'` — camera at the passenger's eye (x ≈ +0.36, eye height, z ≈ +0.30)
    looking at the wheel;
  - `'above-wheel'` — 0.45 m above the hub, looking down the steering column at the
    hands.

  Implement it the same way as `debugExternalView` (drives the one camera; `null`
  restores the rig).

### B.10 `tools/wheel-probe.mjs` — per-frame proof

Pattern: copy `tools/tutorial-probe.mjs` / `tools/autodrive.mjs`. Real
`KeyboardEvent`s dispatched on `window` (the events `Input.js` reads). Stepping by
`debugRig(1/60, 1/60)` one frame at a time. Load level 1 with `debugPlay(0)`; the car
stays in **P** (pawl, no movement) except in S8. Import `RimCurve.js` and
`Dimensions.js` in page for the geometry checks.

**Sequences** (each preceded by 1.0 s idle):

| # | Input | Purpose |
|---|---|---|
| S1 | none, 1.0 s | rest pose |
| S2 | hold A until `steerNorm = −1`, hold 1.0 s more | full left lock (−360°), carry/slip/hand-over-hand |
| S3 | release, 2.0 s | self-centre + SETTLE back to 9/3 |
| S4 | hold D until `steerNorm = +1`, hold 1.0 s | full right lock |
| S5 | release, 2.0 s | self-centre + settle |
| S6 | A 0.15 s / D 0.15 s, × 10 | direction reversals |
| S7 | 4 × (A 0.06 s on / 0.12 s off), then 4 × (D 0.06 s on / 0.12 s off), repeated 3 times | feathered corrections |
| S8 | holding A (reach half lock): tap F (shift to D); 0.5 s later, holding D: tap R | steering while shifting (use the real keys; the car is stopped, so the shift guard allows R) |
| S9 | S7 again while holding Q for the first half and E for the second | lean poses must not affect the hands |

**Per-frame assertions (the run exits 1 on any violation; print the first 5
violations with frame number, sequence, hand, state and values):**

1. **Contact:** for a hand in GRIP or SLIP, the palm contact point's distance to the rim
   **tube surface** (distance to the `RimCurve` centreline − `RIM_TUBE`) ∈ **[−0.3 cm, +1.0 cm]**.
2. **Penetration:** for every segment OBB of both hands (sample its 8 corners + centre),
   penetration into the rim tube, a spoke OBB, the hub pad or the stripe ≤ **0.3 cm**
   (`THUMB_ON_SPOKE` contact included in the same limit).
3. **TRAVEL clearance:** during RELEASE/TRAVEL/SETTLE (not REGRIP), every hand sample
   point is ≥ **1.0 cm** outside the rim tube surface, above the dash shelf
   (`DASH_TOP_Y`), and outside the hub pad.
4. **Separation:** palm-centre distance between the two hands ≥ **10.0 cm** on every frame.
5. **Extension:** `extensionRatio ≤ 0.97` for both arms on every frame, including SHIFT.
6. **Smoothness** (60 Hz, car-local):
   - GRIP: `|contact_now − expected|` ≤ **0.3 cm**, where `expected` is last frame's
     contact rotated about the wheel axis by this frame's rim delta (the rim carry is
     *expected* motion: up to 4.58 cm/frame).
   - SLIP: contact movement ≤ **0.3 cm**.
   - Frames crossing GRIP↔SLIP: ≤ **0.5 cm**.
   - RELEASE/TRAVEL/REGRIP/SETTLE/SHIFT: absolute contact movement ≤ **3.0 cm**.
   - Any state: elbow movement ≤ **3.0 cm**, excluding frames where the hand is carried
     by the rim in GRIP (then ≤ 5.0 cm).
   - No NaN anywhere.
7. **Fingers:** no joint angle changes by more than **20° in one frame** (1200°/s).
8. **Contact invariant:** frames with both hands out of contact = **0**.
9. **No endless slip:** no hand in SLIP > **0.35 s** continuously while the other is in
   GRIP and no shift is in progress.
10. **Domains:** a gripping left hand's `spatialDeg ∈ [−160, −20]` (± 0.5), right
    `∈ [20, 160]`, on every frame (TRAVEL paths may pass between these but must satisfy 3).

**Per-sequence event assertions:**

- S2 and S4: **≥ 2 TRAVEL events each** (hand-over-hand actually happens).
- S1, end of S3, end of S5: both hands in GRIP at spatial −90° ± 5° / +90° ± 5°, thumb tip
  within **1.5 cm** of the corresponding side spoke's top surface.
- S8: `onShifterGrabbed` fires once per shift, only while the right hand is in the `hold`
  phase with palm centre ≤ **6 cm** from the knob centre; the left hand is in contact on
  every frame of every shift; the right hand is back in GRIP ≤ **1.4 s** after the shift
  began; the lever's `shifterAngle` doesn't change before the grab.
- S9: hand transforms are identical (≤ 0.1 mm) to the matching S7 frames with no lean.

**Printed summary** (paste it in the final report): per sequence — frames, TRAVEL
count, SLIP frames, max contact error, max penetration, min separation, max extension,
max per-state jump, violations (must be 0); plus the **live reach table** (spatial
−180…180 step 10 → shoulder–wrist distance for each arm, from the final rig, flagged
against 0.640).

### B.11 Screenshots (look at every one)

`tools/wheel-shot.mjs` (or extend `seat-shot.mjs`), 1440×900, saved to `tools/shots/`:

- Seat view, car stopped, wheel held steady at `steerNorm` = 0, ±0.25 (±90°),
  ±0.5 (±180°), ±1 (±360°) — 7 shots, taken after hands have settled.
- A frame with a hand mid-TRAVEL (capture the first frame whose state is TRAVEL
  during S2).
- The right hand on the knob during a shift (`shiftPhase === 'hold'`).
- `debugCabinView('passenger')` at 0° and at +180°, and `debugCabinView('above-wheel')`
  at 0°: the finger wrap, thumbs on spokes and wrist/cuff joints must look right.
- Seat view at `seatZ = +0.08` and `seatY = +0.14`: no upper-arm blobs.

Describe what each shot shows in the final report (one line each), including anything
that still looks wrong.

### B.12 Part B acceptance

`node tools/wheel-probe.mjs` exits 0 with 0 violations and all event assertions met;
the screenshots have been viewed and described; draw-call delta ≤ +50; no per-frame
allocations in `Driver.js`/`HandModel.js` (state how you checked, e.g. a code search for
`new THREE.` inside `update` paths returns none); `drive-test`, `tutorial-probe`,
`shell-probe` and `autodrive` still pass.

---

## Part C — Overhead ("helicopter") parking review

### C.1 What the player experiences

Timeline after the park is accepted (`ParkCheck` reports `complete`, i.e. stopped, in
the bay, straight, in P, held 0.5 s):

| t (s) | What happens |
|---|---|
| 0.00 | Success chime (existing `audio.success()`), the bay turns white (`setSatisfied(true)`). In-play HUD fades out: level card, prompt pill, key legend, top-right buttons. |
| 0.00–2.00 | **Flight.** The camera leaves the driver's eye, glides forward out through the windscreen, rises, and settles high above the bay looking **straight down**, rotated so the bay's closed end is at the top of the screen. The deck ceiling disappears as the camera approaches it. |
| 1.70–2.00 | The measurement overlay fades in (ghost of the perfect pose, the car's actual footprint, the parking window, offset dimension lines, heading arc, gaps to neighbours). |
| 2.00+ | The results card slides in, **docked to the side**, not over the view. The player reads their score next to a picture that explains it. |
| any | Any key or click during the flight skips straight to the final state. |

The picture should answer, at a glance: *How far off centre was I, which way, how
crooked, and how much room did I leave?*

### C.2 When it runs, and when it doesn't

| Trigger | Review? |
|---|---|
| `completeLevel(status)` — every level 1–12 | **Yes**, variant `'parked'` |
| `failLevel(reason)` — timed levels 11 and 12 running out | **Yes**, variant `'failed'` (C.9) |
| Tutorial completion (`showTutorialDone`) | **No** (no bay) |
| Pause, menus, level select opened from the start screen | No |

**Exit** (restore everything, C.10) on: Next level, Replay, choosing a level from Level
select, Main menu, keyboard Enter/R (C.8), and **any** call to `loadLevel`,
`loadTutorial`, `debugPlay`, `debugTutorial`. Exit is **immediate** (no reverse flight)
so every existing probe stays deterministic.

### C.3 Camera, flight and scene state

**Single camera.** In `Game.updateRig`, add a branch before the `freeCam` check: if the
review is active, the review module drives `cameraRig.camera` and
`cameraRig.update(dt, input)` is **not** called (it would overwrite the pose every
frame). On exit, the rig takes over again on the next frame. It sets position and
quaternion absolutely, but **not** fov or near, which is why those must be restored
explicitly.

**Flight path** (starting values; tune freely if the C.12 flight assertions hold):

- `P0` = camera world position at `completeLevel`; `Q0` = its quaternion.
- `P1` (u ≈ 0.18) = car-local `(eyeX, min(eyeY, 1.30) + 0.05, −0.95)` transformed by the
  chassis pose: straight out through the windscreen. The segment P0→P1 must pass
  **below the roof header** (y ≤ 1.36 at car-local z = −0.05), clear of the rear-view
  mirror housing (x ∈ [−0.13, 0.13]) and above the cluster visor. At the highest seat
  (`seatY = +0.14`, eye 1.34) lower `P1.y` accordingly.
- `P2` (u ≈ 0.55) = midway (horizontally) between the car and the final look-at point, at
  45% of the final altitude.
- `P3` (u = 1) = the final review pose (C.4).
- Position: centripetal Catmull-Rom through P0…P3, time remapped with smootherstep.
  Duration **2.0 s** (≤ 2.2 s).
- Orientation: slerp Q0 → "level, looking along the path" for u ∈ [0, 0.30]; → pitched
  down 60° for u ∈ [0.30, 0.75]; → the final top-down basis for u ∈ [0.75, 1].
- **Final orientation must be built from a basis, not `lookAt`** (looking straight down
  with an up vector perpendicular to the view is fine, but `lookAt` degenerates when up
  is parallel to the view direction):
  `X = up × Y_world`, `Y = up`, `Z = +Y_world` (the camera looks along its −Z = world
  −Y), where `up` is the horizontal screen-up direction from C.4.
  Check: `up = (0,0,−1)` gives `X = (+1,0,0)`, so north is up and east is right, like a map.

**Scene state during the review** (save at entry, restore on exit, C.10):

| Thing | During review | Why |
|---|---|---|
| Camera fov | tween from the settings value to **`REVIEW_FOV_DEG = 28`** over u ∈ [0.5, 1] | narrow lens, high altitude: little perspective, so roofs and floor footprints line up |
| Camera near | switch **0.05 → 1.0** once the camera is outside the car and above y = 4 m | depth precision at 25–60 m; the paint quads are 12 mm above the floor |
| Deck ceiling (slab, downstand beams, tube fixtures, warning stripe, soffit panels) | **hidden** once camera y > `ceilingHeight − 0.6` or u > 0.4, whichever is first | otherwise the camera looks at the top of the ceiling slab |
| Target-bay beacon shaft (additive cylinder) | hidden | from above it's a translucent disc over the car |
| `scene.fog` | near/far pushed out (e.g. `near = altitude + 50`, `far = altitude + 400`) during the flight | underground fog starts at 12 m: at altitude it would grey everything |
| SAO (ambient occlusion) | **off** during review if it's on; restored after | its kernel is tuned for eye-level distances and can't be judged headless |
| Mirrors | not rendered (`mirrors.render` skipped while review is active) | from above, mirror glass is in frustum; wasted renders |
| Reversing camera | not rendered (it's in P, the screen is dark anyway) | |
| In-play HUD (level card, prompt, key legend, top-right buttons) | hidden | |
| Input | stays disabled (`state === 'results'`); review keys are handled in `Hud` like the seat tuner's Esc | |

**Ceiling grouping.** `Garage.js` currently adds the ceiling slab, beams, tube fixtures,
warning stripe and soffit panels straight into `group` with no names. Put them in a named
child group (`garage.ceiling`, returned from `createGarage`) so the review can toggle one
`visible` flag. Rooftop levels have no ceiling; the group simply stays empty.

**Beacon.** `createTargetBay` returns `{ group, update, setSatisfied }`. Add
`setBeaconVisible(bool)`, which toggles only the shaft cylinder.

**Reduced motion.** If `matchMedia('(prefers-reduced-motion: reduce)')` matches: no flight.
Cut to the final pose in one frame and fade the overlay in over 0.2 s.

**Resize.** On window resize during the review, recompute the final pose (C.4), ribbon
widths (C.5) and label positions. If still flying, retarget `P3`.

### C.4 Framing

**Screen-up direction (`up`):**

- Bay styles `'bay'`: the bay's **head** direction = bay-local −Z in world, using
  `bh = target.bayHeading ?? target.heading` → `up = (−sin bh, 0, −cos bh)`. The car
  always "drives up" into the bay on screen, whether it pulled in or reversed.
- Styles `'parallel'` and `'box'`: the ideal car's forward, `h = target.heading` →
  `up = (−sin h, 0, −cos h)`.

**Frame rectangle** (bay-aligned: width W across the screen, length L up the screen):
the union of the painted bay, the ideal-pose footprint, the actual footprint and the
facing edge of the nearest obstacle on each side (so gap labels are in view), expanded by
0.8 m. Minimum `W = 6.0`, `L = 7.5`.

**Free area.** The results card occupies part of the viewport (C.8). Let `A` = viewport
width/height, and let the free area be the part of the viewport not covered by the card
(right-docked: a fraction `f` of the width; bottom sheet: a fraction `g` of the height).
With vertical fov φ and margin m = 0.08 (8%, covers roof-height parallax):

- right-docked: `h = max( (L/2) / (tan(φ/2)·(1−m)),  (W/2) / (tan(φ/2)·A·f·(1−m)) )`
- bottom sheet: `h = max( (L/2) / (tan(φ/2)·g·(1−m)), (W/2) / (tan(φ/2)·A·(1−m)) )`

Camera altitude above the floor = h, clamped to **[12 m, 60 m]**. Centre the bay in the
free area, not the viewport, by offsetting the camera position in the ground plane. For a
right-docked card, move the camera `+H·A·(1−f)` along screen-right (`X`), where
`H = h·tan(φ/2)`; the bay then appears centred in the left free area. For a bottom sheet,
move it `−H·(1−g)` along `up`. **Don't use `camera.setViewOffset`** (it changes the
projection that SAOPass reads). If you choose to, you must clear it on exit and prove the
restore in C.12.

### C.5 Measurement overlay

All overlay geometry is per-review, disposable (`userData.disposable`), built from flat
ribbons (thin quads, like `paintQuad`), and drawn on top: `depthTest: false`,
`depthWrite: false`, `transparent: true`, `fog: false`, `renderOrder ≥ 900`. Ribbons are
laid at floor level (y = 0.03). Because they're drawn on top, the car body doesn't hide its
own footprint. Ribbon width in world units = `px × worldPerPixel`, where
`worldPerPixel = 2·h·tan(φ/2) / viewportHeightPx`. Recompute on resize. Colours from
`Palette.js`, matched to the HUD tokens.

| # | Element | Spec |
|---|---|---|
| 1 | **Ideal pose ghost** | The 4.20 × 1.78 m footprint at `target.pos`, `target.heading`. **Dashed** outline (dash 0.25 m, gap 0.15 m, 3 px), mint `#8fe6bb`, faint fill (12% alpha), and a small chevron at the nose showing the ideal facing direction. |
| 2 | **Actual footprint** | The same rectangle at the car's pose **snapshotted at `completeLevel`**. Solid 3 px outline, coloured by overall grade from `Scoring` `STAR_CUTOFFS = [88, 68]`: ≥ 88 mint `#8fe6bb`, ≥ 68 amber `#e8c98a`, else coral `#e0857b`. A nose chevron in the same colour. |
| 3 | **Parking window** | The rectangle the car's **centre** had to be inside: `2·lateralTol × 2·longitudinalTol`, centred on `target.pos` and aligned to `target.heading`. Dotted 1.5 px, mint 45% alpha, with a small label "parking window" at one corner (lowest label priority). |
| 4 | **Centres** | A crosshair at the ideal centre (mint); a dot at the actual centre (grade colour). |
| 5 | **Offset dimension lines** | An L-shaped dimension from ideal centre to actual centre, decomposed along the ideal car's **lateral** axis then its **longitudinal** axis, white 90%, 2.5 px, with end ticks. One label at the midpoint of each leg, offset 0.35 m outward. Omit a leg below 1 cm; if both legs are below 1 cm, one label "dead centre" at the crosshair. |
| 6 | **Heading arc** | An arc of radius 1.2 m around the actual centre, from the ideal nose axis to the actual nose axis (12 segments, white 2.5 px) + label. If `headingErrDeg < 0.3`, no arc; the label reads "0.0°". |
| 7 | **Clearances** | For the car's left and right sides: the nearest obstacle within 3 m (parked car, pillar, pilaster, wall, lamp post, kerb). A short dimension line between the closest points + label (e.g. "gap 43 cm"). Front/rear gaps only if < 1.0 m (end stalls, parallel spaces). A kerb reads "kerb 24 cm". |
| 8 | **Perfect badge** | If `|lateral| < 0.02` m **and** `|longitudinal| < 0.02` m **and** `headingErrDeg < 0.5`: a "Perfect" label over the car with one gentle scale pulse (skipped under reduced motion). |
| 9 | **Title chip** | Top-centre of the free area: small uppercase mint tag "Overhead review" + level name. |

**Labels are DOM, not canvas sprites** (crisper, same fonts as the HUD). A
`.hud-review` layer inside `Hud`, `pointer-events: none`, each label a pill
(`background: rgba(16,21,24,0.82)`, 1 px `rgba(190,210,208,0.16)` border, 12.5 px,
`font-variant-numeric: tabular-nums`). Position each label by projecting its world anchor
with `camera.project()`. **Collision avoidance:** place in priority order (offsets →
heading → gaps → perfect → parking-window label); if a label overlaps an earlier one, nudge
it perpendicular to its dimension line in 18 px steps up to 3 times; if it still overlaps,
hide it, **except** offsets and heading, which are never hidden. No label may sit under the
results card.

### C.6 Numbers: one source of truth, exact conventions, exact wording

**Source.** Every number comes from the `status` object passed to `completeLevel(status)`
(the same object `Scoring.finish(status)` scores), plus `level.target`. **Never recompute
offsets from the chassis pose after completion.** The actual-footprint *drawing* uses the
chassis pose snapshotted in `completeLevel`, and C.12 asserts it agrees with `status` to
1 mm / 0.05°.

**Conventions** (derived from `ParkCheck.js`; C.12 must confirm each empirically by
injecting known offsets):

- `dx, dz = car − target.pos`; `h = target.heading` (where the parked car's **nose** points).
- `lateral = dx·cos h − dz·sin h` = displacement along the ideal car's local **+X** = its
  **right**.
- `longitudinal = dx·sin h + dz·cos h` = displacement along the ideal car's local **+Z** =
  its **rear** (forward is −Z).
- `headingErrDeg = |angleDelta(car.heading, h)|` (unsigned). `angleDelta` is exported from
  `ParkCheck.js`. **Add** `headingErrSignedDeg` to the `ParkCheck` result, computed with
  the same `angleDelta`. Don't write a second formula. Positive = the nose is rotated
  counter-clockwise seen from above = toward the car's **left** (heading +90° turns a −Z
  nose to −X).
- `lateralTol = max(0.18, (bay.width − 1.78)/2 − 0.04)`,
  `longitudinalTol = max(0.25, (bay.length − 4.20)/2 − 0.04)`.
- **Depth for `'bay'` styles:** `inDir = (−sin bh, 0, −cos bh)` (toward the bay head);
  `depth = (dx, dz)·inDir`; positive = deeper into the bay. For `'parallel'`/`'box'` use
  forward/back relative to the ideal car: `forward = −longitudinal`.

**Wording** (labels and the card's text summary must use exactly these):

| Quantity | Format |
|---|---|
| lateral | `"{n} cm right"` / `"{n} cm left"`, n = `Math.abs(lateral*100).toFixed(0)`; n = 0 → omitted (C.5 #5) |
| depth (bay) | `"{n} cm too deep"` (depth > 0) / `"{n} cm short"` (depth < 0) |
| forward/back (parallel, box) | `"{n} cm forward"` / `"{n} cm back"` |
| heading | `"{d}° nose left"` / `"{d}° nose right"`, d = `headingErrDeg.toFixed(1)`; `"0.0°"` when d = 0.0 |
| gaps | `"gap {n} cm"`; ≥ 100 cm → `"gap {m.mm} m"` (2 decimals); kerb → `"kerb {n} cm"` |
| failed distance | `"{m.m} m from the bay"` (1 decimal) |

**Consistency with the existing breakdown** (`Scoring.js`, which must keep its current
strings): the lateral n equals the number in `"{n} cm off centre"`, the depth n equals the
number in `"{n} cm off"`, and d equals the number in `"{d}° out"`. C.12 asserts all three
against the card's DOM text.

### C.7 Shared plan-view geometry (clearances)

`tools/level-lint.mjs` already has correct oriented-rectangle helpers (`rect`, `axes`,
`overlaps`, `segDist`, `gap`) and an `obstacles(level)` builder using the real garage
colliders. **Move them into a pure module** (no three.js import), e.g.
`src/game/PlanGeometry.js`, with:

- `rect(cx, cz, w, l, yaw)`, `overlaps(a, b, eps)`, `gap(a, b)`;
- **new** `closestPoints(a, b)` → `{ distance, pa:[x,z], pb:[x,z] }` for the clearance
  dimension lines;
- `levelFootprints(level)` → `[{ kind, poly, car? }]`, the same list lint builds today
  (garage colliders, parked cars, pillars, wall blocks, kerbs).

Both `tools/level-lint.mjs` and the review import it, so the game and the linter can never
disagree. **Lint output must be byte-identical before and after** (diff it and say so).
`LevelBuilder.buildLevel` returns `footprints` (computed once per level). The yaw
convention is the one lint uses (same as THREE `rotation.y`).

### C.8 Results card (replaces the full-screen veil for `showResults`/`showFailed`)

The current `showResults` puts the panel on `.hud-veil`, a full-screen dark radial gradient
with blur. That would hide the overhead view. For the review, results render as a **docked
card with no veil** (the seat tuner in `Hud.js` is the precedent).

- **Layout ≥ 900 px wide:** right-docked, width 380 px, 24 px from the right, top and bottom,
  vertically centred, `max-height: calc(100vh − 48px)`, scrolls internally. The free area is
  the rest of the viewport (C.4 `f`).
- **Layout < 900 px:** bottom sheet, 16 px side gutters, `max-height: 48vh`, scrolls
  internally. The free area is the top of the viewport (C.4 `g`).
- **Contents, top to bottom:** tag ("New personal best" / "Parked"); level name; stars; the
  existing breakdown grid unchanged; score; **new** "Where you stopped" sentence (the
  overlay as text, e.g. "18 cm right of centre, 12 cm too deep, nose 3.4° left. Gaps: 61 cm
  left, 43 cm right."); buttons **Next level** (primary, only if there is one), **Replay**,
  **Level select**, **Hide panel**.
- **Keyboard** (handled in `Hud`, active only while the review card is showing): `Enter` →
  Next level (or Replay on the last level); `R` → Replay; `H` → hide/show the card;
  `Esc` → show the card if hidden, otherwise nothing. When hidden, a small pill "Show
  results (H)" stays in the top-right of the viewport. Buttons must not keep focus in a way
  that makes Space/Enter double-fire (the in-play buttons already blur on click; follow that).
- **Level select** from the card opens the normal veil panel; its Back returns to the review
  card (the review stays active underneath); choosing a level exits the review.
- **Accessibility:** the card has `role="dialog"` and `aria-label="Parking results"`; the
  "Where you stopped" sentence is real text; every button is keyboard-reachable with a
  visible focus ring (existing `.hud-btn:focus-visible`).
- **Optional:** hovering a breakdown row highlights the matching overlay element.

### C.9 Failed (timed-out) variant

When `failLevel` fires, the car may be anywhere, possibly still rolling (physics stops
stepping when state leaves `'driving'`, so it freezes in place).

- Same flight and scene-state rules. Frame the union of the bay and the car (the 60 m
  altitude clamp applies; if the car is too far to fit, frame the bay and draw an arrow
  toward the car at the free-area edge).
- Overlay: the painted bay highlighted, the car's footprint in coral, a straight dashed line
  from the car centre to `target.pos`, and one label `"{m.m} m from the bay"`. No ghost, no
  offsets, no heading arc, no stars.
- Card: tag "Not parked", level name, the existing reason text, the distance sentence,
  buttons **Try again** (primary, `Enter`/`R`), **Level select**, **Hide panel**.

### C.10 Lifecycle, restore and leaks

Implement the review as its own module (e.g. `src/game/ParkingReview.js`) with `enter()`,
`update(dt)`, `skip()`, `exit()` and `get state()`. `Game.teardown()` calls
`review.exit()` **first**, before `built.dispose()`: `dispose` sets `scene.fog = null`, and
restoring fog after that would write the old level's fog values onto nothing (or onto the
next level).

`exit()` must restore, synchronously:

- camera fov → **`settings.get('fov')` at exit time** (not a value snapshotted at entry: the
  player may have changed settings via Level select → Settings) and `updateProjectionMatrix()`;
- camera near → 0.05;
- the camera back under rig control on the next `updateRig` (clear the review branch);
- the original `scene.fog` object's near/far values (same object, same numbers);
- ceiling group and beacon visibility;
- AO → the user's setting (and still off under `?lowfx`);
- mirror and backup-camera rendering;
- in-play HUD visibility;
- remove every overlay mesh from the scene and dispose its geometry/materials; remove every
  DOM label and the review card.

**No leaks:** after a completion → review → exit cycle, `renderer.info.memory.geometries`
and `.textures`, and `scene.children.length`, return to their pre-review values.

### C.11 Debug hooks

- `debug().review` → JSON-serialisable:
  ```
  {
    active, variant: 'parked'|'failed'|null, phase: 'flying'|'shown'|null, u,
    camera: { pos:[x,y,z], forward:[x,y,z], up:[x,y,z], fov, near },
    expectedUp:[x,y,z], altitude, freeArea:{ x, y, w, h },           // CSS px
    scene: { ceilingVisible, beaconVisible, fogNear, fogFar, aoEnabled, mirrorsPaused },
    numbers: { lateralCm, depthCm|null, forwardCm|null, headingDeg, headingSignedDeg,
               lateralWord, depthWord, headingWord, gaps:{ left, right, front, rear },
               perfect, distanceM|null },
    footprints: { actual:[[x,z]×4], ideal:[[x,z]×4] },
    labels: [{ text, x, y, w, h, hidden }],                         // CSS px
    cardVisible, cardRect:{ x, y, w, h }
  }
  ```
- `window.__game.debugReviewSkip()` → jump to `'shown'` (same code path as a key press).
- `window.__game.debugReviewSnapshot()` → the `status` and the chassis pose captured at
  `completeLevel`.

### C.12 `tools/review-probe.mjs` — proof

Uses the dev server with `?lowfx=1`, a 1440×900 viewport unless stated, and real DOM clicks
and keys for UI. Exit 1 on any failure. Print a PASS/FAIL line per check.

**Pose injection.** For a target `(tx, tz, h)`, an offset of `lat` metres (car-right),
`lon` metres (car-rear) and `e` radians of heading goes to world
`x = tx + lat·cos h + lon·sin h`, `z = tz − lat·sin h + lon·cos h`, `heading = h + e`,
then `debugTeleport(x, z, heading)` (which leaves the car in P). Then `debugTick(1.0)` —
the 0.5 s dwell completes the level and the review starts. Standard offset:
**lat = +0.15, lon = +0.10, e = +3.0°**. It fits inside every level's tolerances
(tightest: 2.6 m bays, lateralTol 0.37; Final Exam heading tolerance 8°) without touching
a neighbour.

**Levels:** 1 (open, pull-in), 2 (open, reverse), 3 (open, parallel), 4 (underground,
2.75 m reverse), 6 (open, 45° echelon), 9 (rooftop, box), 10 (rooftop corner, 2.6 m),
12 (rooftop Final Exam, 2.6 m).

**Per level, after `debugReviewSkip()` and `debugRig(0.1)`:**

1. `review.active`, `variant === 'parked'`, `phase === 'shown'`, `state === 'results'`.
2. Top-down: `camera.forward · (0,−1,0) ≥ 0.9995`.
3. Oriented: `camera.up · expectedUp ≥ 0.9998` (≈ 1°), where the probe computes
   `expectedUp` **itself** from the level data per C.4.
4. Framing: the 4 corners of the actual footprint and the ideal ghost, at y = 0.02 **and**
   y = 1.45 (roof height), plus the 4 painted-bay corners — all project inside `freeArea`
   inset by 5%, and none inside `cardRect`. Project them in-page with the real camera.
5. Numbers match the park: `numbers.lateralCm === Math.abs(status.lateral*100).toFixed(0)`
   (as numbers); the same for depth/forward from the probe's **own** C.6 computation from the
   snapshot; `headingDeg === status.headingErrDeg.toFixed(1)`.
6. Wording truth, computed by the probe from `debug().pos` and the level data (not from the
   overlay): lateral word "right" (injected +lat); heading word "nose left" (injected +3°);
   depth word from the sign of `(pos − target)·inDir` for `'bay'` levels, forward/back for
   levels 3 and 9. Assert the overlay words match.
7. The card's breakdown DOM text contains `"{lateralCm} cm off centre"`,
   `"{|lon| cm} cm off"` and `"{headingDeg}° out"`, and the "Where you stopped" sentence
   contains the same words as the overlay.
8. Snapshot agreement: the chassis pose snapshot vs `status` within 1 mm / 0.05°.
9. Scene state: `ceilingVisible === false` (levels 1, 2, 3, 4, 6); `beaconVisible === false`;
   `fogNear ≥ altitude + 30`; `mirrorsPaused === true`, and the mirror render counters don't
   change across `debugBenchmark(3, 'live')` during the review; `camera.near ≥ 0.5`;
   `camera.fov === 28`.
10. Labels: ≥ 4 visible labels; all inside the viewport; no two visible labels' rects
    intersect; none intersects `cardRect`; offset and heading labels are never `hidden`.
11. Screenshot `tools/shots/review-L{n}.png`.
12. Click **Replay** (DOM). Then `debugRig(0.2)` and assert: `state === 'driving'`;
    `review.active === false`; camera world y within 1 cm of
    `RIDE_HEIGHT + EYE[1] + settings.seatY`; `camera.fov === settings.fov`;
    `camera.near === 0.05`; ceiling and beacon visible; the fog object's near/far equal the
    values read **before** the review; `aoEnabled` equals its pre-review value; no
    `.hud-review` label nodes remain; `renderer.info.memory.geometries` and `.textures`
    equal their pre-review values.

**Additional checks:**

- **Perfect:** level 1 with zero offset → `numbers.perfect === true`, all zeros, "Perfect"
  label visible, "dead centre" label present.
- **Flight** (normal motion, level 2): step the flight with `debugRig(1/60)` per frame and
  assert — no NaN; after the first 0.15 s, the camera is never inside any static collider box
  (use `levelFootprints` in plan plus each box's height) nor within 0.3 m of a parked car's
  box; the camera stays above y = 0.6 whenever it's outside the player car's footprint;
  `ceilingVisible` becomes false before camera y exceeds `ceilingHeight − 0.5`;
  `phase === 'shown'` by 2.2 s; the final pose equals the skip pose within 1 mm / 0.01°.
- **Reduced motion:** `page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value:
  'reduce' }])` → after completion, `phase === 'shown'` within one `debugRig(1/60)`.
- **Timed fail:** level 11: `debugPlay(10)` (car at spawn, in P), `debugTick(46)` →
  `variant === 'failed'`; `numbers.distanceM` equals the probe's own spawn-to-target
  distance to 0.1 m; the card shows "Not parked" and no stars; **Try again** restarts level 11.
- **Narrow viewport** (700×900, level 2): bottom-sheet layout, `cardRect` along the bottom,
  framing check 4 passes against the top free area.
- **Keyboard:** in `'shown'`: `H` hides the card (pill visible) and shows it again; `R`
  replays; `Enter` goes to the next level (`levelIndex` + 1, `state === 'driving'`,
  `review.active === false`).
- **Level select round trip:** the card's Level select → Back → the review card is visible
  again with `review.active === true`.
- **Leak loop:** complete levels 1→12 in sequence via teleport + Next level (12 reviews).
  After the second iteration, `renderer.info.memory.geometries`/`textures` and
  `scene.children.length` never grow.
- **Driven park:** extend `tools/autodrive.mjs` so that after each successful park it asserts
  `debug().review.active`, `variant === 'parked'`, and `numbers.lateralCm` equal to the
  printed `lat` of that run. `node tools/autodrive.mjs` must still print `3/3 driven to
  completion`.
- **Console:** 0 page errors and 0 `GL_INVALID*` messages for the whole probe run (copy the
  `drive-test` filter).

### C.13 Optional stretch (not required for done)

- **Personal-best ghost:** a grey ghost of the best previous park in that bay. This needs
  new stored fields in `progress.js` (validated like the existing ones). **Adding stored
  fields changes what the privacy policy says is stored:** update `PRIVACY.md` §2 and
  `public/privacy.html` in the same change, and note it in `LAUNCH_CHECKLIST.md`.
- **"View again"** button that replays the flight.
- **Angled drone view** toggle (`V`): 55° pitch, same framing rules.

### C.14 Part C acceptance

`node tools/review-probe.mjs` exits 0 with every check above passing; the 8 level screenshots
plus the perfect, failed and narrow-viewport screenshots have been viewed and described
(including anything that looks off: unreadable labels, overlapping lines, washed-out colours
after tone mapping); `level-lint` output is byte-identical to before; `autodrive` 3/3 with the
new assertions; the full regression list passes.

---

## Part D — Regression and evidence

Run at the end of each part, and once more at the very end on the final code:

| Command | Must show |
|---|---|
| `for f in src/**/*.js; do node --check "$f" \|\| echo BAD $f; done` | no `BAD` lines |
| `node tools/level-lint.mjs` | `12 levels, 0 failures, 0 warnings` and byte-identical output to before Part C |
| `node tools/physics-probe.mjs` | unchanged numbers (handling untouched) |
| `node tools/drive-test.mjs` | `12/12 levels completable, 0 console errors` |
| `node tools/sensor-probe.mjs` | `0 failures, 0 page errors` |
| `node tools/tutorial-probe.mjs` | `PASS: tutorial completed by input` |
| `node tools/shell-probe.mjs` | `0 failures, 0 page errors` |
| `node tools/autodrive.mjs` | `3/3 driven to completion, 0 page errors` (+ new review assertions) |
| `node tools/wheel-probe.mjs` | 0 violations, all event assertions met, summary + live reach table printed |
| `node tools/review-probe.mjs` | every check PASS, exit 0 |
| `window.__game.debugBenchmark(10, 'static')` before vs after | draw-call delta reported (wheel ≤ 4 calls; hands ≤ +50) |
| `npm run build` | builds without errors |

Because bash in this environment is zsh, run multi-command loops through an explicit
`bash -c` or a script file (a zsh `for t in "node a" "node b"` loop does not word-split
and silently runs nothing; that happened once).

---

## Part E — Documentation to update

- **`CLAUDE.md`:** architecture list (new modules: `RimCurve.js`, `HandModel.js`,
  `ParkingReview.js`, `PlanGeometry.js` or whatever names you chose); new constraints (the
  single camera during the review, the restore order in `teardown`, hand domains and the
  contact invariant, rim speeds); tool list (`wheel-probe`, `review-probe`, `wheel-shot`);
  new debug hooks; the probe trap that review exit is immediate.
- **`NOTES.md`:** a "v4, fourth session" section: what was wrong with the old wheel (spokes
  at 12/6/9) and hands (180° shuffle to the far half, measured lock-outs); the measured reach
  table from the final rig; the binary rim-speed finding and why SLIP exists; final tuned
  constants; review framing altitudes per level; anything the probes caught.
- **`ARCHITECTURE.md`:** module table rows; the frame section (review branch in `updateRig`,
  mirrors paused in `draw`); verification tools table.
- **`CAR_DESIGN.md`:** cabin package table (wheel: spokes, rim tube, flat bottom, dish; hands:
  rest at 9 and 3, domains `[−160°, −20°]` / `[20°, 160°]`).
- **`PRIVACY.md` / `public/privacy.html` / `LAUNCH_CHECKLIST.md`:** only if you do the
  optional personal-best ghost (stored data changes).

---

## Definition of Done

Do not declare this goal complete unless **every** item below is true **and** its evidence
appears in the session (tool output shown, screenshots viewed).

**Part A — Wheel**

- [ ] 3 spokes at 3, 9 and 6 o'clock; numeric spoke-angle check passes (±1°); no spoke at 12.
- [ ] Rim is a D-shape from one shared `RimCurve` module; `gripPointLocal`/`rimFrameLocal` agree
      with it to 0.1 mm at 360 angles; tube vertices within 0.5 mm.
- [ ] Thumb grips, dished padded hub, wrapped 12 o'clock stripe; no logo or lettering; no
      metalness; cabin DoubleSide + emissive materials from `Palette.js`.
- [ ] Wheel draws in ≤ 4 draw calls (benchmark output shown).
- [ ] Cluster-sightline clearance at default seat ≥ 1.0 cm (numbers for three seat heights shown);
      reversing screen fully visible in the R seat shot (viewed).
- [ ] All new dimensions in `Dimensions.js`, all colours in `Palette.js`.

**Part B — Hands**

- [ ] Articulated hands (4 fingers × 3 segments + 3-segment thumb) within the triangle/mesh budget;
      draw-call delta ≤ +50 (shown).
- [ ] Rest at 9 and 3 with thumbs on the side spokes (probe event check passes).
- [ ] Hand-over-hand per the B.6 state machine: domains, soft/hard edges, predictive re-grip
      targets, SLIP, SETTLE, tie-break, never both hands off the rim.
- [ ] Shifting contract preserved: lever moves only on grab; left hand stays on the wheel; right
      hand re-grips at 3 o'clock.
- [ ] `node tools/wheel-probe.mjs` exits 0: **0 violations** across S1–S9, ≥ 2 TRAVEL events in S2
      and in S4, and the printed summary + live reach table shown in the session.
- [ ] Screenshots from B.11 viewed and described one line each.
- [ ] No per-frame allocations in `Driver.js`/`HandModel.js` (how it was checked is stated).

**Part C — Overhead review**

- [ ] Review runs after every completed level and after a timed fail; never after the tutorial.
- [ ] Flight ≤ 2.2 s, skippable by key/click, instant under reduced motion; ends top-down with the
      bay's head at the top of the screen.
- [ ] Ceiling and beacon hidden, fog pushed out, AO off, mirrors paused during review; everything
      restored exactly on exit (probe restore checks pass).
- [ ] Overlay shows the ideal ghost, actual footprint, parking window, centres, lateral and depth
      offsets, heading arc, left/right clearances and the Perfect badge, with the C.6 wording.
- [ ] All numbers come from the `status` scored by `Scoring`; the overlay words, the card sentence
      and the breakdown strings agree (probe checks 5–7).
- [ ] Results appear as a docked card (right at ≥ 900 px, bottom sheet below) with Next/Replay/
      Level select/Hide and Enter/R/H keys; nothing is covered by a full-screen veil during the
      review.
- [ ] Plan-view geometry lives in one shared module used by both lint and game; lint output
      byte-identical (diff shown).
- [ ] `node tools/review-probe.mjs` exits 0 with every check passing, including perfect, flight,
      reduced motion, timed fail, narrow viewport, keyboard, level-select round trip, leak loop;
      screenshots viewed and described.
- [ ] `autodrive` asserts the review after real driven parks and still reports 3/3.

**Everything**

- [ ] The full Part D table run on the final code, with each command's key output line shown.
- [ ] `npm run build` succeeds.
- [ ] Docs updated per Part E.
- [ ] `git status --short` shown at the end; **nothing committed, pushed or deployed**.

---

## Out of scope — do not do these

- **Commit, push, merge or deploy.** No `git commit`, no `git push`, no `vercel`/`vercel --prod`,
  no artifact republish. Leave the working tree ready and end the final report with the commands
  to ship *when the user asks*:
  `git checkout -b wheel-hands-review && git add -A && git commit …`, `git push -u origin …`, then
  `npm run build && npx vercel --prod` (this folder is already linked to
  `daksh-personal1/parking-precision`), then
  `curl -sI https://parking-precision.vercel.app/ | head -1` must say `200` (Vercel SSO
  deployment protection is **disabled** on purpose and must stay disabled).
- Changing handling (`Car.js` steering/engine/brake constants), car dimensions, level layouts,
  scoring weights/cutoffs, or `ParkCheck` tolerances.
- Moving `WHEEL_HUB`, `WHEEL_RIM_RADIUS` or `WHEEL_TILT_RAD` without the A.7 re-checks.
- Imported assets of any kind, analytics, network calls, new cookies/storage (beyond the optional
  C.13 item with its privacy-doc updates).
- A second main camera, `setViewOffset` without proven restore, or mutating cached Palette materials.
- Renaming the `debug().state` values or removing any existing `window.__game` hook.
- Browser dialogs; emoji in UI.

---

## Appendix A — Reference numbers

**Rim speeds** (binary, from `Car.js`): turning in 800°/s = 13.96 rad/s = 2.44 m/s at R 0.175 =
4.07 cm/frame at 60 Hz. Self-centring 900°/s = 15.71 rad/s = 2.75 m/s = 4.58 cm/frame.

**Domain edge separation:** 40° gap between the nearest hard edges → contact chord
`2·0.175·sin 20° = 11.97 cm`.

**Tolerances per level** (`lateralTol` / `longitudinalTol`, from `ParkCheck`):

| Bay | lateralTol | longitudinalTol | Levels |
|---|---|---|---|
| 3.00 × 5.40 | 0.57 | 0.56 | 1, 2, 6, 7, 11, and 9 (box) |
| 2.75 × 5.40 | 0.445 | 0.56 | 4, 8 |
| 2.60 × 5.40 | 0.37 | 0.56 | 10, 12 |
| 2.70 × 7.20 (parallel) | 0.42 | 1.46 | 3, 5 |

**Heading tolerances** (degrees): L1 12, L2 11, L3 12, L4 10, L5 10, L6 12, L7 11, L8 10, L9 12,
L10 10, L11 12, L12 8.

**Scoring** (`Scoring.js`): weights placement 30 / depth 20 / alignment 25 / time 15 /
finesse 10; `STAR_CUTOFFS = [88, 68]`.

**Framing:** `h = max((L/2)/(tan(φ/2)(1−m)), (W/2)/(tan(φ/2)·A·f·(1−m)))`, m = 0.08,
φ = 28°, altitude clamp [12, 60] m, look-point offset `+h·tan(φ/2)·A·(1−f)` along screen-right
for a right-docked card.

**Seat limits** (`SEAT_ADJUST`): x ±0.15, y −0.08…+0.14, z −0.12…+0.08 m, tilt −20…+6°. Default
eye `[−0.36, 1.20, 0.32]` (ground frame), tilt −6°.

## Appendix B — Files you will touch (expected)

| File | Change |
|---|---|
| `src/vehicle/Dimensions.js` | wheel, hand, domain, review constants |
| `src/world/Palette.js` | wheel colours, overlay colours |
| `src/vehicle/RimCurve.js` (new) | shared rim centreline math |
| `src/vehicle/Cockpit.js` | new wheel build; `gripPointLocal` on the curve; `rimFrameLocal`; `debugWheelParts` data |
| `src/vehicle/HandModel.js` (new) | hand geometry, joints, poses |
| `src/vehicle/Driver.js` | state machine, IK tuning, shift integration, debug state, no allocations |
| `src/game/ParkCheck.js` | add `headingErrSignedDeg` |
| `src/game/PlanGeometry.js` (new) | shared plan-view geometry + `levelFootprints` |
| `src/game/ParkingReview.js` (new) | flight, scene state save/restore, overlay meshes |
| `src/world/Garage.js` | named `ceiling` group |
| `src/world/Props.js` | `setBeaconVisible` |
| `src/world/LevelBuilder.js` | expose `footprints`, `garage.ceiling` |
| `src/core/Game.js` | review wiring in `completeLevel`/`failLevel`/`teardown`/`updateRig`/`draw`; debug hooks |
| `src/ui/Hud.js` | docked results card, review labels layer, review keys |
| `tools/level-lint.mjs` | import `PlanGeometry.js` (output unchanged) |
| `tools/autodrive.mjs` | review assertions after parks |
| `tools/wheel-probe.mjs`, `tools/wheel-shot.mjs`, `tools/review-probe.mjs` (new) | verification |
| `CLAUDE.md`, `NOTES.md`, `ARCHITECTURE.md`, `CAR_DESIGN.md` | Part E |
