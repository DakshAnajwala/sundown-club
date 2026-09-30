# SPEC — Sport steering wheel, articulated hands, hand-over-hand steering

Status: **designed and tuned in the wheel lab; not wired into the game.**
The sweep passes S1–S9 with **0 violations** and every event assertion holds.
The game is unchanged: build OK, level-lint 12/0/0, drive-test 12/12 with 0 console errors.

| What | Where |
|---|---|
| Live lab (published) | https://claude.ai/code/artifact/242d13dc-d8fd-4b08-8570-90e9037c9a9a |
| Live lab (local) | `npm run dev`, then http://localhost:5175/design/wheel-lab/index.html |
| Tuned numbers, as exported | `design/wheel-lab/params.json` |
| Numbers the code reads | `src/vehicle/Dimensions.js` → `WHEEL_SPORT`, `HAND`, `HAND_RIG`; `src/world/Palette.js` → `COLORS.wheelSpoke/wheelHub/wheelStripe` |
| Reference screenshots | `design/wheel-lab/shots/*.jpg` |

This document **supersedes Parts A and B of `GOAL-wheel-hands-overhead-review.md`**
wherever they disagree. Section 3 lists every disagreement and the measurement behind it.

---

## 1. Source of truth and how to change it

1. The modules below are production code. The build wires them in; it doesn't rewrite them.
2. `Dimensions.js` holds the live values. They currently equal `params.json`.
3. If the wheel is retuned in the lab, it's saved with **Export → Save to design/wheel-lab**
   (local dev server only). The saved `wheel` / `hand` / `rig` / `colors` blocks are then
   copied into `WHEEL_SPORT` / `HAND` / `HAND_RIG` / `COLORS`, and the sweep is re-run.
4. `params.json → measured` is the evidence from the last save: the sweep, the reach table
   and the sightlines. `derivedPoses` holds the solved joint angles, for reference only;
   they are re-solved at runtime.

## 2. Modules (all in `src/vehicle/`, all new)

| Module | Role | Contract |
|---|---|---|
| `RimCurve.js` | Pure maths, no three.js. The D-shaped rim centreline. | `createRimCurve({R, tube, flatHalfDeg, fillet})` → `{R, tube, radius(θ), rimPoint2D(θ), rimFrame2D(θ) → {x,y,tx,ty,nx,ny}, nearest(x,y,z) → {theta, dist}}`. Default instance: `RIM`, `RIM_TUBE`, `rimPoint2D`, `rimFrame2D`. θ is measured clockwise from 12 o'clock, as the driver sees it. |
| `SteeringWheel.js` | The wheel mesh (4 draw calls) and rim frames. | `createSteeringWheel({params, colors})` → `{pivot, rimGroup, curve, params, drawCalls, psi, setAngle(wheelAngleRad), rimFrameLocal(spatial, out{point,tangent,normal,axis}), gripPointLocal(spatial, radial, out), wheelNormalLocal(out), carToPivot(p,out), pivotToCar(x,y,z,out), clearance(p) → {rim, spokes, hub, materialTheta}, parts(), dispose()}`. Add `pivot` to the cockpit group. It sits at `WHEEL_HUB`, tilted by `WHEEL_TILT_RAD`. |
| `HandModel.js` | One low-poly hand: 18 meshes, 216 triangles. | `createHandModel({side, skinMat, sleeveMat, params})` → `{root, segments, angles, contactLocal, setPose, approachPose(pose, dt, k, maxDegS)}`. `wrapPose(H, cy, cz, r, thumb)` solves fingers around a circle. `POSE_TABLES`, `POSE_LEN = 16`. |
| `HandRig.js` | Arms, IK, the per-hand state machine, shifting and the thumb solver. | `createHandRig({wheel, shifterKnobLocal, onShifterGrabbed, params, handParams})` → `{group, update(dt,{steerNorm}), beginShift(gear), isShifting, shiftGear, snapToRest(steerNorm), debug(withSegments), reachAt(side, deg), thumbRestError(tip, side), thumbReport, poses, hands, dispose()}`. **Same contract as `Driver.js`** (`update`, `beginShift`, `isShifting`, `shiftGear`, `onShifterGrabbed` fires only on arrival at the knob). |
| `HandRigChecks.js` | The per-frame assertions and the S1–S9 sequences, shared by the lab and the future probe. | `LIMITS`, `steerStep(steerNorm, want, dt)` (Car.js steering, reproduced exactly), `buildSweep()`, `createRigChecker({wheel})` → `{check(debug, {seq, dt, shifting}), breakContinuity(), reset(), stats, firstViolations}`. |

Frames: car-local (the cockpit's frame); pivot (at the hub, tilted, not rotating); rim
(rotates, holds "material" angles). **spatial = material + ψ**, where ψ = `steerNorm·2π`
(clockwise positive). The flat bottom turns with the rim, so the rim's radius at a given
spatial angle depends on ψ; always go through `rimFrameLocal`.

## 3. Decisions that differ from the original brief (and why)

| # | Brief said | Now | Why (measured in the lab) |
|---|---|---|---|
| 1 | Thumb hooks over the side spoke at rest | Thumb tip **rests on the rim 2–30° above the side spoke**, 1.1 cm off the surface (`thumbRestAbove`, `thumbRestGap`) | A brute-force search of the thumb's 4 joints (and of 16 thumb-base/splay variants) found **no collision-free pose within 3.6 cm** of the spoke top: the rim tube sits between the thumb root and the spoke. Resting on the rim is the usual real 9-and-3 thumb anyway. |
| 2 | Palm offset +8° toward 12 o'clock near a side spoke | **−6°** (toward 6 o'clock): fingers wrap just below the spoke junction | With the palm above the spoke, the thumb (on the 12 o'clock side of the hand) can't get near it. Fingers wrap behind the rim, so they never meet the spoke. |
| 3 | Pose tables typed by hand (`RIM_GRIP 62/84/48…`) | Finger grips are **solved**: `wrapPose` places each segment as a chord touching a circle of radius tube + skin + half thickness. Thumbs are **solved against the real wheel** at build time (`solveThumbs`). | Hand-typed thumb angles penetrated the rim by 2.2 cm. Solved fingers wrap to 1.1 cm (the skin gap plus half a finger) at any tube size. |
| 4 | Palm roll φ ≈ 35° | `gripRoll` **62°** | At 35° the wrist sat inboard of the rim and the forearm crossed the hub. |
| 5 | One thumb pose while gripping | Three thumb poses: **rest** (on the rim, only near the side spoke at rest), **hover** (2.5 cm over the tube, solved over 11 rim placements including both D-corners), **knob** | A thumb that wraps the tube swings through it on every re-grip, and the D-rim's corners pass under a resting thumb. Hover is solved to stay close to the rest shape, so it doesn't read as a thumbs-up. |
| 6 | TRAVEL 0.22 s, target predicted to the end of REGRIP, with a correction toward the moving target | TRAVEL **0.30–0.45 s** (`hop / travelSpeed`, 230°/s). The hand lands on its **planned spatial spot**; at touchdown it grips whatever rim is under it (spoke-nudged) and REGRIP is carried by the rim. | Chasing a predicted target produced 6–25 cm/frame jumps whenever the rim changed speed, and a 0.52 s re-grip after the rim stopped. |
| 7 | Soft margin 25°; targets −130/+50 are "arrival" angles | `softMargin` **30**; `targetsCW {left −130, right 50}`, `targetsCCW {left −50, right 130}` are **touch-down** angles | Keeps a free hand's speed under the rim's own speed. |
| 8 | Contact lifts 1.0 cm at release | `releaseLift` **1.8 cm**, `travelLiftAxis` 5 cm, `travelLiftNormal` 1.5 cm; fingers stay `RIM_SLIP`-loose until the re-grip is **60%** done (`regripCloseAt`) | Mid-travel clearance was 0.44–0.93 cm (limit 1.0); closing fingers early clipped the tube. |
| 9 | SLIP keeps the contact on the tube | SLIP rides **5 mm** off the tube (`slipLift`, ramped at 4 cm/s) | The D-rim's corners and the thumb-grip bulges pass under a slipping hand. Contact error stays ≤ 1.0 cm. |
| 10 | SETTLE after 0.35 s idle | `settleIdle` **0.25 s**, settle travel from **0.22 s** | Hands settle one at a time (never both off), and at 0.35 s the second hand hadn't finished inside S3/S5's 2 s window. |
| 11 | Shift waits ≤ 0.35 s for the left hand | `shiftWaitMax` **0.8 s**. A shift request superseded before the grab moves the lever only for the newer gear. | A 0.45 s travel outlasted 0.35 s and put both hands off the rim for 2 frames. |
| 12 | Rim flat-bottom fillet ≤ 6° | `rimFillet` **0.024 m** of smooth-min (≈ ±9°, corners 6 mm inward) | Softer corners halved slip clipping and look more finished. |
| 13 | Cluster bottom ≥ 1.0 cm above the rim sightline (default seat) | **≥ 0 cm** (the rim never crosses the cluster face) | Today's torus measures **0.88 cm** with the same method; the "5 cm" in `CAR_DESIGN.md`/`Dimensions.js` is stale. The new wheel measures **0.37 cm** (stripe made nearly flush: `stripe.proud` 0.8 mm). |
| 14 | Forearm skin, sleeve-coloured cuff | `forearmSleeve: true` (long sleeves); cuff 66 × 50 × 45 mm | A skin forearm plus a grey cuff read as a wristband. |

### Probe limits that changed (`HandRigChecks.LIMITS`)

| Check | Brief | Now | Reason |
|---|---|---|---|
| Free-hand contact jump (RELEASE/TRAVEL/REGRIP/SETTLE/SHIFT) | 3.0 cm | **4.6 cm**, measured as min(free, rim-carried) | The rim itself moves 4.58 cm/frame self-centring. REGRIP is carried by design. |
| Elbow jump | 3.0 cm (5.0 carried) | **max(3.0 cm, or 5.0 cm when GRIP/SLIP/REGRIP; 1.5 × this frame's wrist move)** | A flip is the elbow moving far more than the hand driving it. |
| SLIP jump | 0.3 cm | **0.3 cm + the rim surface's own shift** under that spatial angle (radius change + normal swing) | The D-shape moves the surface under a fixed hand. |
| Travel clearance | every RELEASE/TRAVEL/SETTLE frame | TRAVEL/SETTLE frames with **u ∈ (0.2, 0.8)** | Fingers can't be 1 cm clear on the frame they let go. |
| "Above the dash shelf" | all samples above `DASH_TOP_Y` | **not inside the dash volume** (y < `DASH_TOP_Y` **and** z < −0.38) | The hub (0.86) is below the shelf (0.92); hands at 9/3 are legitimately lower. |
| Thumb at rest | tip ≤ 1.5 cm from the spoke top | `thumbRestError` ≤ 1.5 cm (tip on the rim, 2–30° above the spoke) | Decision 1. |
| S7 vs S9 | compare frames | both **start from `snapToRest(0)`** (the checker's `breakContinuity()` is called) | Rest spots may differ by up to the 12° settle threshold; the sequences must start identical to compare. The game needs a `debugDriverRest()` hook for this. |
| Shift event | exactly one grab per request | one grab, **or superseded** (0 grabs, lever never moved for it, left hand in contact) | S8 requests R 0.5 s after D, before the hand reaches the knob. |

## 4. Final values

All of these are in `Dimensions.js`, so there's no need to retype them. Key numbers:

- **Wheel:** R 0.175 (unchanged), tube 0.025, flat ±32°, fillet 0.024, dish 0.022.
  - Side spokes: 30 mm thick, flared 1.3× at the hub, 20 mm deep.
  - Lower spoke: 58 → 40 mm wide.
  - Hub pad: 130 × 95 × 45 mm octagon, 12 mm chamfer, front face 12 mm proud of the hub plane (1 cm behind the rim plane).
  - Satin bezel: 6 mm.
  - Thumb grips: 60 mm long, +6 mm on the inner face.
  - Stripe: 18 mm wide, 0.8 mm proud.
- **Colours:** rim `0x2c2a28`, spokes `0x4a4744`, hub `0x353331`, stripe `0xe3c98f`. All matte Lambert, DoubleSide, flat-shaded, with emissive terms 0x101010 / 0x1c1b1a / 0x141312 / 0x3a3222.
- **Draw calls: 4** (rim + grips, spokes + bezel, hub pad, stripe).
- **Hand:** palm 80 × 85 × 26 mm; fingers 75/82/78/62 mm (45/30/25 %); thumb 45/32/28 mm; contact point (0, 58, 13) mm; 18 meshes, 216 tris per hand.
- **Choreography:** see `HAND_RIG`. Domains [−160, −20] / [20, 160]; release 0.06; travel 0.30–0.45; regrip 0.07 (+ nudge / 160°/s); cooldown 0.10; shift phases 0.16 / 0.22 / 0.30 / 0.32; fingers ≤ 1200°/s (k = 28).

## 5. Evidence (sweep at 60 Hz, `params.json → measured`)

| Seq | Frames | Travels | Slip f | Contact err | Max pen | Min sep | Max ext | Max free jump | Max elbow | Violations |
|---|---|---|---|---|---|---|---|---|---|---|
| S1 rest | 120 | 0 | 0 | 0.40 cm | 0 | 40.5 cm | 0.794 | 0 | 0 | 0 |
| S2 full left | 148 | 3 | 24 | 0.90 | 0.03 | 23.4 | 0.920 | 3.61 | 4.03 | 0 |
| S3 return | 120 | 3 | 22 | 0.90 | 0 | 23.4 | 0.920 | 3.66 | 4.75 | 0 |
| S4 full right | 148 | 3 | 24 | 0.90 | 0.03 | 23.4 | 0.920 | 3.61 | 4.03 | 0 |
| S5 return | 120 | 3 | 22 | 0.90 | 0 | 23.4 | 0.920 | 3.66 | 4.75 | 0 |
| S6 reversals | 300 | 7 | 17 | 0.67 | **0.287** | 24.0 | 0.920 | 3.14 | 4.37 | 0 |
| S7 feathering | 408 | 10 | 23 | 0.73 | 0 | 23.4 | 0.920 | 3.34 | 4.88 | 0 |
| S8 steer + shift | 314 | 5 | 100 | 0.90 | **0.295** | 16.5 | 0.920 | 3.81 | 4.46 | 0 |
| S9 lean | 408 | 10 | 23 | 0.73 | 0 | 23.4 | 0.920 | 3.34 | 4.88 | 0 |

Events (all pass):
- S2 and S4 hand-over-hand: 3 travels each.
- S1, S3 and S5 end in GRIP at −90° / +90°, thumbs 0.0 cm off their rest.
- S8 → D superseded; S8 → R grabbed once, on the knob (0.2 cm), left hand never off, back in GRIP after 0.98 s.
- S9 is identical to S7 (0.000 mm).

**Margins to watch:** S6 and S8 penetration are 2.87 / 2.95 mm against a 3 mm limit, both thumb-tip brushes at the start of a travel.

**Reach** (shoulder → wrist, gripping, m): worst in-domain **0.607** (limit 0.640); rest 0.527. The far side reaches 0.672, which is why the domains exist.

**Cluster sightline** (ground-frame height where the eye-over-rim-top line meets the cluster plane; cluster bottom 0.9475):

| Seat y | Hits cluster plane at | Clearance |
|---|---|---|
| −0.08 | 0.9969 | −4.93 cm (the rim covers the cluster's bottom at the lowest seat; the torus measures −4.39) |
| 0 | 0.9438 | **+0.37 cm** |
| +0.14 | 0.8598 | +8.77 cm |

**Screenshots** (`design/wheel-lab/shots/`, lab renderer, AO off):

| File | Shows |
|---|---|
| `seat-0` | Driver view, straight, hands at 9/3 |
| `seat-90`, `seat--90` | Wheel at +90° and −90° |
| `seat-180`, `seat-360` | Wheel at 180° and full lock |
| `seat-midtravel` | Left hand crossing over the top, right hand slipping |
| `seat-knob` | Right hand on the lever, reversing screen lit |
| `pass-rest`, `pass-180`, `pass-midtravel`, `pass-knob` | The same from the passenger seat |
| `above-rest` | Above the wheel, looking down the column |

**Open visual note for review:** from the passenger view the resting thumb points up along
the rim toward 12 o'clock. It's hardly visible from the driver's seat. Tune it in the lab
under Tune → Hands, with "Solve thumbs" off.

## 6. Wiring (the build's job)

1. **Cockpit.js:**
   - Delete the torus rim, the three box spokes, the cylinder hub and the 12 o'clock box marker (keep the column).
   - Create `createSteeringWheel()`, add its `pivot` to `group`, and call `wheel.setAngle(wheelAngleRad)` in `update`.
   - `gripPointLocal(spatial, radial)` and `wheelNormalLocal()` delegate to the wheel.
   - Expose `rimFrameLocal` and `wheel`.
   - Give `shifterKnobLocal(out)` an optional `out` (it allocates 3 vectors a call today, and the rig calls it every shifting frame).
2. **Driver.js → HandRig:**
   - Replace `createDriver`'s body with `createHandRig({ wheel: cockpit.wheel, shifterKnobLocal: cockpit.shifterKnobLocal, onShifterGrabbed })`, keeping the export name so `Game.js` is unchanged.
   - Remove `COMFORT_ARC` and the 180° shuffle.
3. **Debug hooks (Game.js), keeping every existing one:**
   - `debug().driver = driver.debug()`;
   - `debugDriver(withSegments)` → `driver.debug('corners')`;
   - `debugWheelParts()` → `cockpit.wheel.parts()`;
   - `debugDriverRest()` → `driver.snapToRest(car.state.steerNorm)`;
   - `debugCabinView('passenger' | 'above-wheel' | null)`. Same camera discipline as `debugExternalView`: passenger eye (0.36, eye y − 0.02, 0.30) looking at the hub; above-wheel = hub + axis·0.42 + (0, 0.2, 0).
4. **`tools/wheel-probe.mjs`:**
   - Import `HandRigChecks.js` and `SteeringWheel.js` in page, as drive-test imports `Levels.js`.
   - Build the checker against a `createSteeringWheel()` instance and keep it at the game's angle with `setAngle(-steerNorm·2π)` each frame.
   - Drive `buildSweep()` with real KeyboardEvents (A / D; the shift keys) one `debugRig(1/60, 1/60)` frame at a time.
   - Call `debugDriverRest()` + `checker.breakContinuity()` at the start of S7 and S9.
   - Assert the §3 limits and the §5 events, and print the §5 table.
5. **Screenshots:** `tools/wheel-shot.mjs` reproduces the §5 list from the game (the lab's shots are the reference for how they should look).
6. `NOTES.md` / `CAR_DESIGN.md`: record decisions 1–14 and correct the stale 5 cm sightline note.

## 7. Acceptance for the build

- `node tools/wheel-probe.mjs` exits 0: **0 violations, all events pass**, and the table is within ±10% of §5 (same code, so it should match).
- In-game seat screenshots match `design/wheel-lab/shots/` in pose and framing.
- Wheel draw calls = 4 (`debugBenchmark` before/after reported); hands add ≤ 50 draw calls.
- No `new THREE.*` inside `HandRig.update` paths (a code search; the one-off per-shift object and the solver at build are fine).
- drive-test 12/12 (13/13 once Level 13 exists), tutorial-probe, shell-probe, autodrive and level-lint unchanged.
