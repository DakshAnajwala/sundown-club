# Goal

Extend the working **Parking Precision v1** MVP (built and playtested this
session — see `ARCHITECTURE.md` and `NOTES.md`) with a proper cockpit and
exterior: a real sedan body, a legible instrument cluster, animated
steering/shifting, working mirrors, a tuned reverse gear, and a faster way
to cycle gears. This is **v2 scope**, additive on top of v1 — nothing here
should regress the things v1 already got right and had verified working:
grippy/precise handling, the PRND shift guard, bump/park scoring, or the
3 existing levels.

If in doubt, build less, not more — same rule as v1.

---

# Explicit Out of Scope for v2 — do not build these

- **Driver hand/arm rig.** Steering wheel and gear shifter animate as
  objects (the wheel spins, the shifter slides between gates) with **no
  hands, no arms, no IK**. This was excluded in v1 for the same reason and
  stays excluded here — the user explicitly chose "objects only" over
  adding a hand rig when this was scoped.
- **True planar-reflection mirror math** (view-dependent flipped
  reflection). Mirrors use the standard "camera behind the mirror, rendered
  to a texture" trick, not physically-accurate reflection. Left-right
  flipping is a possible future polish item, not required now.
- **Pedal-press animation.** Pedals are visible, static props. No foot, no
  depression animation.
- **Imported 3D model / external asset pipeline.** The sedan exterior is
  built procedurally from Three.js primitives, not loaded from a file —
  this supersedes an earlier draft of this spec that called for a GLTF
  import. Decision reversed after the asset-sourcing discussion made clear
  procedural geometry sidesteps licensing entirely and needs no external
  dependency (no GLTFLoader, no `public/models/` asset, nothing to source
  or verify). Any copyrighted/unlicensed 3D asset (ripped or informally
  "licensed" sim-racing mods, DLC content, etc.) remains categorically
  unacceptable if this decision is ever revisited.
- **Real-time FPS profiling / adaptive quality settings.** The mirror
  performance mitigations below (low-res render targets, reduced far
  plane) are starting values, not a dynamic quality system.

If something here seems trivial to add "while you're in there," don't. Note
it as an opportunity in `NOTES.md` instead, same convention as v1.

---

# Tech stack & conventions

Unchanged from v1 — Three.js + cannon-es + Vite, plain ES modules, no
TypeScript, SI units in physics. **No new dependencies for v2** — the
sedan body is built from the same primitive geometries (`BoxGeometry`,
`CylinderGeometry`, etc.) already used for the chassis/wheels/cockpit
props, so there's no loader, no asset pipeline, and nothing to source.

---

# Architecture updates

New files, all internal to `/car` (not imported directly by `main.js`,
preserving the "modules only reach each other through public APIs" rule
from `ARCHITECTURE.md`):

```
/src/car
  vehicle.js     — (existing) gains: per-gear reverse tuning, wires up
                   cockpit.js/sedanBody.js/mirrors.js, calls
                   cockpit.animateShifterTo(gear) from inside setGear()
  sedanBody.js   — NEW: procedural low-poly sedan exterior built from
                   Three.js primitives, sized to the existing physics
                   chassis box
  cockpit.js     — NEW: dashboard, steering wheel (animated), speedometer
                   gauge, pedals, gear shifter (animated) — extracted from
                   vehicle.js's current inline dash/wheel code
  mirrors.js     — NEW: 3 mirror cameras + render targets, decorative/
                   functional mode toggle
```

Other module changes:

- **`core/engine.js`** gains one new, deliberately generic hook:
  `onPreRender(fn)` — registered callbacks run every frame *after* all
  `onUpdate` callbacks (so this frame's transforms are current) and
  *before* the main `renderer.render(scene, activeCamera)` call. This is
  the seam mirrors' render-to-texture passes use; it's not mirror-specific,
  so `core` still doesn't need to know anything about cars or cameras.
- **`input/keyboard.js`** gains `consumeCycleGear()`, a one-shot signal
  following the exact same pattern as the existing `consumeGearSelect()`.
- **`ui/hud.js`** gains a mirror-mode toggle control, following the exact
  same pattern as the existing `onSelectLevel`/`setActiveLevel` pair:
  `createHud({ ..., onMirrorModeChange, initialMirrorMode })` →
  `{ ..., setMirrorMode(mode) }`.
- **`car`'s public surface** (what `main.js` can call) grows by exactly
  two methods: `.renderMirrors(renderer, scene)` and `.setMirrorMode(mode)`.
  Everything else (gauge, pedals, shifter, wheel animation, model swap) is
  internal — `car.mesh` / `car.update` / `car.getState` / `car.setGear` /
  `car.on` keep their existing v1 contract.

`ARCHITECTURE.md` needs a documentation pass once this is implemented,
listing these new modules/exports the same way the existing modules are
documented.

---

# Detailed feature specs

## 1. Reverse gear tuning

Currently `car/vehicle.js` uses one symmetric `ENGINE_FORCE`/`TOP_SPEED_MS`
pair for both D and R. Split it:

```js
const ENGINE_FORCE_TOTAL_D = 4000; // N — unchanged, already-verified curve
const ENGINE_FORCE_D = ENGINE_FORCE_TOTAL_D / 2; // 2000N per rear wheel
const TOP_SPEED_D_MS = 40 / 3.6; // unchanged, ~40 km/h cap

const ENGINE_FORCE_TOTAL_R = 2000; // N — exactly half of D's total
const ENGINE_FORCE_R = ENGINE_FORCE_TOTAL_R / 2; // 1000N per rear wheel
const TOP_SPEED_R_MS = 20 / 3.6; // exactly half of D's cap, ~20 km/h
```

**Why half-and-half:** halving both force and cap together keeps the curve
easy to reason about — `a_R ≈ 1.67 m/s²` is exactly half of D's
`≈3.33 m/s²`, so R reaches its 20km/h cap in about the same ~2.5–3s window
D takes to reach its 40km/h cap. Reverse feels like a scaled-down mirror of
Drive, not a differently-shaped curve. Starting values, not sacred — tune
by feel like everything else in v1.

Engine-force branch becomes gear-aware on both force and cap:

```js
} else if (input.throttle && gear !== 'N') {
  const topSpeed = gear === 'D' ? TOP_SPEED_D_MS : TOP_SPEED_R_MS;
  if (speedMs < topSpeed) {
    engineForce = gear === 'D' ? -ENGINE_FORCE_D : ENGINE_FORCE_R;
  }
}
```

Unaffected: `BRAKE_FORCE`, `HANDBRAKE_FORCE`, `PARK_BRAKE_FORCE`,
`SHIFT_GUARD_SPEED_MS` (2 km/h) — all gear-direction-agnostic already.

**Flagged assumption:** real reverse gears sometimes have *more* torque
multiplication than a mid/high forward gear — "weaker" here is a deliberate
game-feel choice per explicit product decision, not mechanical realism.

## 2. Sedan exterior (procedural, low-poly)

New `car/sedanBody.js` — builds a recognizable sedan silhouette from
combined primitives, sized off the existing `CHASSIS_SIZE` (no separate
asset, no loader, no network/file dependency):

```js
createSedanBody({
  size = CHASSIS_SIZE,        // [1.7, 1.4, 4.2] — width, height, length
  bodyColor = 0xd65f4e,       // same paint color v1's box body already used
  glassColor = 0x2b3138,      // dark tinted "windows", no real transparency needed
}) -> THREE.Group
```

Five boxes, all positioned relative to the chassis's existing local origin
(box center — same convention the current plain-box body mesh already
uses, so this is a drop-in replacement, not a new coordinate system):

```js
LOWER_HULL   : size = [w*0.96, h*0.42, l*0.98], y = -h*0.29
  // doors/bumpers/sills — the widest, longest piece, sits low

HOOD         : size = [w*0.86, h*0.16, l*0.30], y = -h*0.06,  z = +l*0.335
TRUNK        : size = [w*0.86, h*0.16, l*0.30], y = -h*0.06,  z = -l*0.335
  // low flat panels front/rear — a real taper/bevel toward the bumper
  // would look nicer but isn't required; flat boxes match v1's existing
  // low-poly ethos (no beveled geometry anywhere else in the project)

GREENHOUSE   : size = [w*0.72, h*0.46, l*0.46], y = +h*0.18,  z = 0
  // the cabin/roof/window band — narrower and set back from the hull,
  // this inset is what actually reads as "sedan" vs. "van" in silhouette
  // material: glassColor, not bodyColor
```

All five are `BoxGeometry` + `MeshStandardMaterial`, added as children of
one returned `THREE.Group`. Fractions above are starting values, not
sacred — tune by feel, same convention as every other tuning constant in
this project.

**Force `material.side = THREE.FrontSide`** on all five (it's already the
`MeshStandardMaterial` default, but set it explicitly and leave a comment
saying why): this is what makes v1's "you don't see your own car" trick
work — the camera sits *inside* this geometry's volume (see
`camera/firstPerson.js`'s `EYE_OFFSET`), so the body's inward-facing
surfaces need to backface-cull to nothing for the view to stay
unobstructed. Building this ourselves means there's no exporter/materials
uncertainty to guard against (unlike an imported asset would have had) —
still worth the explicit, commented `FrontSide` assignment so a future
edit to this geometry doesn't accidentally break the trick.

Wiring in `car/vehicle.js` — fully synchronous, replaces the current
single `BoxGeometry` body mesh outright (no fallback branching needed,
since there's no load step that can fail):

```js
const sedanBody = createSedanBody({ size: CHASSIS_SIZE });
mesh.add(sedanBody); // replaces the old single-box bodyMesh
```

**Wheels:** unchanged — keep the existing procedural cylinder wheel meshes
exactly as they are, already correctly synced from `vehicle.wheelInfos[i]`
every frame. Nothing about this item touches them.

**Physics unchanged:** `CHASSIS_SIZE`, wheel connection points, suspension
tuning all stay exactly as tuned in v1 — the body is sized *from* those
existing constants, so there's no fitting/scaling step and no risk of
mismatch to reconcile.

## 3. Interior: speedometer gauge, pedals, cockpit coexistence policy

New `car/cockpit.js` (the existing dash box + steering wheel meshes move
here from their current spot as loose siblings in `vehicle.js`, refactored
into the nested-group structure described in §6):

```js
createCockpit() -> {
  group,                                  // vehicle.js does mesh.add(cockpit.group)
  update(dt, { steerAngle, speedKmh }),
  animateShifterTo(gear),                 // called from vehicle.js's setGear()
}
```

`camera/firstPerson.js`'s `EYE_OFFSET (-0.3, 0.1, 0.6)` is **not**
importable (would cross a module boundary) — same precedent as today's
dash/wheel code: the number is duplicated in a comment, not imported.

**Speedometer gauge** (physical instrument, HUD text stays too):

```js
GAUGE_MOUNT_POS = (-0.3, -0.13, 1.0)   // dash top, ahead of wheel (wheel at z=0.95)
GAUGE_MOUNT_ROTATION_Y = Math.PI        // face toward driver
GAUGE_RADIUS = 0.09
NEEDLE_LENGTH = 0.075
GAUGE_SWEEP_DEG = 220                   // -110°..+110°
GAUGE_FULL_SCALE_KMH = 50               // headroom above D's 40km/h cap
```
`needleAngle = -110 + (clamp(speedKmh, 0, 50) / 50) * 220`, updated every
frame from `cockpit.update()`. 50 km/h is chosen as a clean round number
comfortably above the tuned 40km/h cap so the needle never pins during
normal driving — same "comfortable headroom" idea already used for the
fake-RPM range.

**Pedals** (static, no press animation):

```js
PEDAL_ACCEL_POS = (-0.22, -0.55, 1.05)
PEDAL_BRAKE_POS = (-0.38, -0.55, 1.05)
// BoxGeometry(0.1, 0.03, 0.16) each, rotation.x ≈ -0.3 (tilt face toward the foot)
```
Low (`y=-0.55`, above the chassis box's literal floor at `y=-0.7`) and just
forward of the driver's seat position, near the base of the steering
column.

**No coexistence concern:** since the exterior body (§2) is built
procedurally by us rather than sourced externally, there's no risk of a
bundled third-party interior conflicting with these props — `sedanBody.js`
only ever produces the five exterior panels described in §2, nothing that
could clip through or duplicate the dashboard/wheel/gauge/pedals/shifter
built here. Animation pivots (§6) stay fully known/controlled by
construction, not by convention.

## 4. Mirrors — decorative + functional, runtime toggle

New `car/mirrors.js`:

```js
createMirrors() -> {
  group,                           // vehicle.js does mesh.add(mirrors.group)
  setMode(mode),                   // 'decorative' | 'functional'
  renderMirrors(renderer, scene),  // no-op in decorative mode
}
```

**Positions** (local, relative to chassis origin; chassis half-extents are
0.85 × 0.7 × 2.1):

```js
REARVIEW_POS = (0, 0.42, 0.75)        // windshield header, centered, near roof
REARVIEW_LOOK = local -Z              // straight back
REARVIEW_FOV = 60
REARVIEW_RT_SIZE = [320, 180]

LEFT_MIRROR_POS  = (-0.95, 0.15, 0.95) // 0.10m beyond half-width
RIGHT_MIRROR_POS = ( 0.95, 0.15, 0.95)
SIDE_MIRROR_LOOK = local -Z, yawed 25° outward per side
SIDE_MIRROR_FOV = 80                   // wider than the main 72° FOV
SIDE_MIRROR_RT_SIZE = [200, 200]
```
Far plane for all 3 mirror cameras: **150** (vs. the main camera's 500) —
the largest level footprint (40×32) is well inside that; cheap perf win.

**Decorative mode (default):** mirror "glass" is
`MeshStandardMaterial({ color: 0xaeb8c2, metalness: 0.9, roughness: 0.15 })`
— a tinted, semi-reflective-reading flat surface. Zero extra render passes.

**Functional mode:** per mirror, a `THREE.PerspectiveCamera` +
`THREE.WebGLRenderTarget` (sizes above) whose `.texture` becomes the glass
mesh's `.map`. Each frame, only while `mode === 'functional'`:
1. Position/orient each mirror camera from `chassisMesh` transform + fixed
   local offset/look direction.
2. Set all 3 mirror-glass meshes `.visible = false` (avoids the mirror
   rendering itself / infinite-mirror artifact — no `THREE.Layers` needed).
3. Per mirror: `renderer.setRenderTarget(rt); renderer.render(scene, mirrorCamera); renderer.setRenderTarget(null);`
4. Restore glass mesh visibility before the main render.

**Deliberately not flipped left-right** (not a true mirror reflection) —
explicit simplification per product decision; flag as an easy, clearly
optional future polish item if it bothers playtesters.

**Render-loop integration**, via the new `core/engine.js` `onPreRender`
hook:

```js
// core/engine.js loop, updated:
for (const fn of updateCallbacks) fn(dt, elapsed);       // physics, car, camera, scoring, hud
for (const fn of preRenderCallbacks) fn(renderer, dt);   // NEW — mirror RTT passes
if (activeCamera) renderer.render(scene, activeCamera);  // existing
```
`main.js` (wiring only):
```js
engine.onPreRender((renderer, dt) => car.renderMirrors(renderer, engine.scene));
```

**HUD toggle**, following the existing `onSelectLevel`/`setActiveLevel`
shape:
```js
createHud({ container, levels, onSelectLevel, onMirrorModeChange, initialMirrorMode = 'decorative' })
  -> { ..., setMirrorMode(mode) }
```
`main.js`: `onMirrorModeChange: (mode) => car.setMirrorMode(mode)`.
**Default: decorative** — performance-conscious default for
possibly-modest hardware; functional is opt-in via the HUD control.

**Performance budget (flagged, unverified against real hardware in this
spec):** 3 extra `renderer.render()` calls per frame in functional mode is
real added cost, and it compounds with the sourced sedan model's
(unknown-until-sourced) triangle count. Low-res render targets and reduced
far plane are starting mitigations, not guarantees. If functional mode
measurably drops FPS during implementation, try in order: (1) fewer than 3
mirrors active at once, (2) lower RT resolution (e.g. 128×128), (3) render
mirrors at half framerate, reusing the previous frame's texture on skipped
frames.

## 5. Gear-cycle key

**Key: `E`.** Single unused key, next to the WASD cluster (no hand
movement needed while driving), no collision with any existing binding
(W/S/A/D/arrows/Space/1-4/right-mouse are all taken). `Tab` was considered
and rejected (strong browser-reserved feel); scroll wheel was considered
and rejected (risks colliding with trackpad OS gestures, needs an extra
up/down design decision with no precedent here).

**Order: P → R → N → D → P** (cyclic). Matches the fixed physical gate
order of a real automatic selector, so repeated presses read as "clicking
down one notch," and D→P (not D→R) on wraparound means the key can never
accidentally cycle back into R while moving.

`input/keyboard.js` — one new one-shot signal, exact same shape as the
existing `pendingGearSelect`/`consumeGearSelect()`:
```js
// keydown: if (e.code === 'KeyE') pendingCycleGear = true;
consumeCycleGear() { const v = pendingCycleGear; pendingCycleGear = false; return v; }
```

`main.js` (wiring only, no new car API needed):
```js
if (input.consumeCycleGear()) {
  const order = ['P', 'R', 'N', 'D'];
  const next = order[(order.indexOf(car.getState().gear) + 1) % order.length];
  car.setGear(next);
}
```
Reuses `getState()`/`setGear()` as-is — the cycle key is therefore subject
to the **exact same R↔D shift guard** as direct 1–4 presses, with no
special-casing needed.

`ui/hud.js`'s `#controls-hint` string should append `· E cycles gear`.

## 6. Steering + shifter animation (objects only, no hands)

**Nested-group refactor** (part of the `cockpit.js` extraction in §3).
Today's wheel rim/hub/spoke are loose siblings sharing one
position/rotation via `.copy()`. Restructure to:

```
steeringMount (Group)            // fixed: pos (-0.3, -0.1, 0.95), rot.x = PI/2.3 — unchanged from today
  └─ steeringWheelSpin (Group)   // local rotation.z ANIMATED — the only thing that moves
        ├─ rim (Torus)
        ├─ hub (Cylinder)
        └─ spoke (Box)
```
Rotating the child's own local Z spins the wheel correctly regardless of
the parent's fixed tilt: the mount encodes "where and how tilted" (static),
the inner group encodes "how far rotated around its own consistent spin
axis" (animated).

**Ratio:** `STEER_WHEEL_RATIO = 12`. `MAX_STEER_RAD = 35°` → max visual
wheel rotation = `35 × 12 = 420°` (~1.17 turns lock-to-lock) — deliberately
below the realistic 14–20:1 range because the physics steer ramp is fast
(0.35s to full lock); a full real-car ratio would look chaotic over that
short a ramp. Still reads as one clean, legible turn.

**No separate smoothing** on the wheel's own rotation — apply
`steeringWheelSpin.rotation.z = steerAngle * STEER_WHEEL_RATIO` directly
every frame in `cockpit.update()`. `steerAngle` (the module-local value
already computed in `vehicle.js`) is already eased via the existing
`STEER_RAMP_TIME`/`STEER_RETURN_TIME`; a second smoothing pass on top
would double-smooth and add lag. **Sign is cosmetic-only** — verify
visually that turning spins the wheel the way a driver would expect, flip
if backwards. Unlike the v1 physics/camera sign bugs, this has zero
gameplay consequence either way.

**Gear shifter** (new geometry, doesn't exist in v1):

```
shifterMount (Group)      // fixed: pos (0.05, -0.25, 0.85) — center console
  └─ shifterStick (Group) // local rotation.x ANIMATED between 4 gate angles
        ├─ stalk (thin Cylinder)
        └─ knob (small rounded cap)
```
A rotating gate lever, not spring-back — reads as a modern shift-by-wire
selector without needing a hand:
```js
SHIFTER_GATE_ANGLES = { P: -20, R: -6.67, N: 6.67, D: 20 } // degrees, rotation.x, evenly spaced ±20° gate
```

**Animation:** reuse the existing exponential-decay pattern already used
for fake RPM (`fakeRpm += (target - fakeRpm) * min(1, dt*4)`), not a new
tween/timestamp abstraction:
```js
shifterAngle += (shifterTargetAngle - shifterAngle) * Math.min(1, dt * 12);
```
Rate `12` chosen because exponential decay reaches ~95% of target in
`~3/rate` seconds → `3/12 ≈ 0.25s`, matching the ~0.2–0.3s target with one
tunable constant.

**Event wiring:** `cockpit.animateShifterTo(gear)` is called **directly
from inside `vehicle.js`'s `setGear()`**, in the same accepted-shift branch
that already does `emitter.emit('gearChanged', ...)` — not via
`cockpit.js` subscribing to the public `gearChanged` event. `cockpit.js` is
an internal sibling within `/car`'s own closure, not an external consumer;
the public event stays reserved for external subscribers (the HUD's gear
highlight).

---

# Cross-cutting concerns

- **Module boundaries:** `sedanBody.js`, `cockpit.js`, `mirrors.js` are
  wired together only inside `vehicle.js`'s `createCar()`. `main.js` never
  imports them directly. `car`'s public surface grows by exactly
  `.renderMirrors()` and `.setMirrorMode()` — everything else is invisible
  to callers.
- **No asset-loading error handling needed:** with the sedan body built
  procedurally (§2), there's no file to fail to load, no missing-asset
  fallback branch, and no async wiring — one less failure mode than the
  GLTF-import approach this spec originally called for.
- **Performance budget:** with the sedan body's polycount fixed and known
  at build time (five simple boxes, not an unknown sourced asset), the
  only real performance unknown left is functional mirrors' up to 3 extra
  scene renders per frame. The decorative-default mirror choice is the
  mitigation for that one remaining unknown.

---

# Recommended build order

1. **Reverse tuning (§1) + gear-cycle key (§5)** — independent, quick wins,
   no dependencies on anything else. Do first.
2. **`core/engine.js`'s `onPreRender` hook** — small, additive,
   non-breaking. Foundational for mirrors.
3. **`car/cockpit.js` extraction** + nested-group refactor of the existing
   wheel + new gauge/pedals/shifter props (§3).
4. **§6's animation wiring** — steering spin, shifter tween/event hookup.
   Needs #3's structure to exist first.
5. **`car/sedanBody.js` + wiring (§2)** — independent of #3/#4, can slot in
   any time after #1, even in parallel with the others.
6. **`car/mirrors.js` (§4)** — build/verify decorative mode first (cheap,
   low-risk), then functional RTT passes last (highest-risk, most novel,
   most likely to need perf follow-up).
7. **`ARCHITECTURE.md` + `NOTES.md`** documentation pass for all new
   modules/events/assumptions, matching v1's own convention of recording
   real state honestly (what's tuned, what's still a starting guess, what
   hasn't been playtested).

---

# Verification checklist (manual, same solo-scale spirit as v1)

- [ ] R accelerates and caps noticeably slower/weaker than D (~20 km/h vs.
      ~38-40 km/h ceiling); HUD speed readout confirms.
- [ ] R↔D shift guard (blocked above 2 km/h) still works after the
      per-gear split.
- [ ] App loads, drives, and shows **zero console errors**.
- [ ] The procedural sedan body appears in place of the old plain box,
      correctly sized to the physics chassis box, silhouette reads as a
      sedan (hood/greenhouse/trunk distinguishable, not a uniform block).
- [ ] From the driver's eye position, the interior reads as "inside the
      car" — no body panel surfaces visibly intrude on the view.
- [ ] Only the procedural wheel cylinders are visible, correctly seated
      against the body's wheel-arch area.
- [ ] Speedometer dial needle visually tracks the HUD's numeric speed.
- [ ] Pedals visible near the bottom of the first-person view, no clipping
      through dash/wheel.
- [ ] Steering wheel prop rotates proportional to real steering input,
      no visible lag/desync.
- [ ] Gear shifter animates to a distinct position per P/R/N/D within
      ~0.2–0.3s of a gear change, for both direct 1-4 keys and the new E
      cycle key.
- [ ] E cycles P→R→N→D→P, one step per press (not held-repeat), correctly
      rejected by the shift guard when cycling R→D/D→R above 2 km/h.
- [ ] Existing 1/2/3/4 direct gear select unaffected by the new E key.
- [ ] All 3 mirrors visible and sensibly positioned in both decorative and
      functional modes.
- [ ] Decorative mode: no extra render calls, no FPS regression vs.
      pre-mirror baseline.
- [ ] Functional mode: each mirror shows a live, correctly-updating
      rear/side view; no infinite-mirror/self-render artifact.
- [ ] Runtime HUD toggle switches mirror mode without a page reload; no
      leaked `WebGLRenderTarget`s on repeated toggling.
- [ ] Frame rate stays subjectively acceptable with functional mirrors on
      — flagged as the item most likely to need follow-up perf tuning.

---

# Rules

- No copyrighted/unlicensed 3D assets, ever. The sedan body is procedural
  specifically to keep this a non-issue — if that decision is ever
  revisited, any replacement must be CC0 or clearly-documented-permissive
  only, never a ripped/sourced-without-rights model.
- Nothing from the Out-of-Scope list, even if it looks trivial. Log it in
  `NOTES.md` instead.
- State assumptions inline (code comments) and in `NOTES.md`, same
  convention as v1 — keep building, don't stop to ask for routine
  implementation choices.
- Keep the dev server running and the app loadable throughout.
- Report real state honestly in `NOTES.md`: which new values are untuned
  starting guesses, what hasn't actually been playtested yet (mirrors'
  real-hardware performance impact, in particular).
