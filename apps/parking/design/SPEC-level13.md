# SPEC — Level 13 "City Drive": across town, up a multi-storey, park on the roof

Status: **layout designed; every layout check passes; not built into the game.**

| What | Where |
|---|---|
| Layout sheet (published) | https://claude.ai/code/artifact/f360b773-dae2-4268-b4cc-6b01a2242493 |
| Layout sheet (local) | `npm run dev`, then http://localhost:5175/design/level13/sheet.html |
| **Source of truth** | `design/level13/layout-model.mjs`: `buildLayout()` (geometry) and `checkLayout()` (the rules) |
| Generated data | `design/level13/layout.json` (`node design/level13/build-layout.mjs`, which exits 1 if any check fails) |
| Ramp-grade measurement | `design/level13/ramp-probe.json` |

The build **imports `layout-model.mjs`** (or reads `layout.json`) rather than retyping
coordinates. To change the level, change `DEFAULTS` in the model and re-run
`build-layout.mjs` until it's green. The sheet then redraws itself from the same data.

---

## 1. The level in one paragraph

The player spawns on the city's south boundary street, 150 m of street from the car park.
The drive:

1. East, then left at the first junction, north for 67 m.
2. Right onto the car park's street, then left through the ground-floor entrance, past a raised barrier.
3. Inside, a one-way zigzag up four 12% ramps: up lane A (west), hairpin at the north landing, up lane B (east), hairpin at the south landing, and so on.
4. The last ramp lands on the roof. The player turns west, weaves three cones up the west aisle, and pulls nose-first into a 2.75 m bay between two parked cars.

| | |
|---|---|
| Route | **427 m**, 12 turns |
| Estimated drive | **171 s** (street 20 km/h, deck 9, ramps 11, plus 1.5 s a turn and 25 s to park) |
| Par / time limit | **240 s / 420 s** |
| Target | Roof (y 12.8), west row, bay 5 of 19 at (−18.8, −14.0); heading +90° (nose west); `bayHeading` +90°; tolerance 0.50 m / 10° |

## 2. Ramp grade: measured, not guessed

`ramp-probe` (design scratch, not in the repo) ran the real `Car.js` + `PhysicsWorld.js` in
Node on tilted static boxes at 60 Hz. Each ramp climbs one storey (3.2 m), with 3 m transitions at half grade.

| Grade | Ramp length | P drift | Brake drift | Roll-back, D, no pedal, 2 s | Restart roll-back | Ascent (12 km/h cap) | Min wheels in contact | Chassis scrapes | Coast down |
|---|---|---|---|---|---|---|---|---|---|
| 8% | 43.0 m | 0 | 0 | 40 cm | 0 | 17.1 s | 4 | 0 | 4.0 km/h |
| 10% | 35.0 | 0 | 0 | 78 | 0 | 14.7 | 4 | 0 | 4.0 |
| **12%** | **29.7** | **0** | **0** | **116** | **0** | **13.2** | **4** | **0** | **4.1** |
| 14% | 25.9 | 0.1 | 0.1 | 140 | 0 | 12.0 | 4 | 0 | 4.1 |
| 16% | 23.0 | 0.1 | 0.1 | 155 | 0 | 11.2 | 4 | 0 | 4.1 |
| 20% | 19.0 | 0.1 | 0.1 | 172 | 0 | 10.0 | 4 | 0 | 4.1 |

The same holds with 4 m transitions. **Chosen: 12% main grade, 6% transitions.** Every grade
passes mechanically. 12% keeps the no-pedal roll-back moderate, keeps first-person pitch
comfortable (6.8°), and a 29.7 m ramp fits the 40 m spine. Up to 20% would still work.

**Roll-back matters.** Creep (260 N × 2 rear wheels) is weaker than gravity along any
of these grades (900 kg · 9.82 · sin 6.8° ≈ 1047 N), so a car in D with no pedal rolls back
about 1.2 m in 2 s. Hence **hill-hold** (§5.6).

## 3. The layout

Coordinates follow Levels.js: x east, z south, y up; heading 0 = north. All numbers below come from `DEFAULTS`.

**City**

- 222 × 222 m.
- A 3 × 3 grid of blocks between 12 m streets (centrelines x = ±35, ±105; z = ±38, ±105), with 2.5 m sidewalks.
- Eight blocks each hold 4 buildings (9–32 m tall; seeded, deterministic). The centre block is the car park.
- Boundary walls at ±111.5. Cars drive on the right, 2.2 m from the centreline.
- Seven kerbside parked cars, 5.0 m from the centreline (1.0 m clear of the driving line).

**Car park**

- 44 × 58 m (x ±22, z ±29). G at y 0, then L1 3.2, L2 6.4, L3 9.6, Roof 12.8. Slabs 0.3 m thick (2.9 m clear).
- Walls: G has 3.0 m perimeter walls with an 8 m entrance at x −10…0 in the south façade. The upper floors have 1.1 m parapets.
- **Spine:**
  - Lane A: x −6…−2, centreline −4.
  - Lane B: x +2…+6, centreline +4.
  - Ramp side walls stand 1.0 m above the surface; clear width between them is 4.0 m.
  - Spine columns sit at x 0, z −14 / −6 / 2 / 10.
- **Ramps:**
  - r0 G→1 and r2 2→3 are in lane A, rising north (low end z +15, high end z −14.7).
  - r1 1→2 and r3 3→R are in lane B, rising south (low end z −14.7, high end +15).
  - Profile: 3.0 m at 6%, 23.7 m at 12%, 3.0 m at 6% (29.7 m).
- **Slab openings:** each floor has a hole over the ramp arriving at it, starting where that ramp has risen 0.48 m (5.67 m along it). Headroom there is 2.42 m. The hole has parapets on both sides and across its low end; its high end is open where the ramp lands.
- **Hairpins:** rear-axle radius 4.0 m, centred at z −21 (north landings, L1 and L3) and z +21 (south landing, L2). The swept path is shaded on the plan. The outer front corner sweeps 5.98 m from the turn centre, about 1.7 m clear of the end wall.
- **Bays:**
  - Rows at x ±18.8: 19 bays each, 5.4 m long, 2.75 m pitch (0.97 m door gap), z −25…+24.5.
  - About two-thirds are occupied (deterministic). On the roof both target neighbours are occupied.
- **Columns:** 0.6 m square at the bay-mouth lines x ±16.1, every three bays.
- **Roof:** lamp posts 5.5 m tall on the parapet line every 12 m (colliders). Three cones in the west aisle (visual only, as always).
- **Entrance:** a cosmetic barrier arm (raised, no collider) and a booth (collider) west of the opening.

**Wayfinding** (the sheet's Drive view checks each of these from eye height)

| Where | What |
|---|---|
| Spawn street | Straight arrow; a "P 150 m ↑" street sign on the corner building's sidewalk |
| Each junction | Turn arrows 12–15 m before the turn |
| SW corner of the car park block | **"P" pylon**, 9 m tall, 2.6 m panels facing south and west |
| Façade above the entrance | "PARKING · ROOF ↑" band |
| Each ramp foot | Ramp arrow |
| Each landing | A 3.2 m painted floor number (G / 1 / 2 / 3 / R) and a "LEVEL n" sign on the end wall facing the arriving car |
| Roof | Right-turn arrow where lane B meets the south aisle |

**Floor numbers in the build:** in the blockout they're laid flat and not yawed. In the game, yaw each one so it reads the right way up to the car arriving along the route.

## 4. Checks (`checkLayout`; port to `tools/city-lint.mjs`)

| Rule | Limit | Now |
|---|---|---|
| Steepest ramp grade | ≤ 12% | 12.0% |
| Largest grade change at a break | ≤ 6.1% | 6.0% |
| Narrowest ramp between walls | ≥ 4.0 m | 4.00 m |
| Shortest landing beyond a ramp (to the wall it faces) | ≥ 8 m | 13.70 m |
| Tightest route turn (rear axle) | ≥ 3.56 m | 4.00 m |
| Lowest headroom over the car (body corners and centre, surface → slab underside) | ≥ 2.3 m | 2.42 m (r0 at the L1 slab edge) |
| Swept-path clearance to any collider on the same level (body footprint every 0.25 m; the last 7 m into the bay excluded) | ≥ 0.6 m | 1.02 m (a kerbside car) |
| Door gap beside the target, with both neighbours present | ≥ 0.77 m | 0.97 m × 2 |
| Spawn clear | ≥ 0.6 m | 2.91 m |
| Estimated drive time | ≤ par | 171 s ≤ 240 s |

The route is the **rear-axle path**: waypoints with fillet radii, sampled every 0.25 m,
with y from `surfaceAt()` (never snapping up more than 0.6 m, so a car on G never "finds"
the slab above it).

## 5. Engine prerequisites (the build's job; all measured or read from the code)

The game today assumes one flat lot at y = 0. Level 13 needs these, each behind "does
anything else still pass" (drive-test, tutorial-probe, shell-probe, autodrive, level-lint):

1. **`PhysicsWorld.addStaticBox` takes a full orientation.** Today it only rotates about Y (`rotY`). Add `pitch` (about local X, after yaw, matching the model's `{ rotY, pitch }` and Euler order `YXZ`). Ramps and ramp walls need it.
2. **Level building for `style: 'city'`.** `LevelBuilder.buildLevel` assumes one `lot` with `addGround({ width, depth })`, `ceilingHeight` pillars and a `Garage`. Add a `CityBuilder` that consumes `buildLayout()`:
   - Streets, sidewalks and buildings become visual meshes; buildings and boundary walls are also colliders.
   - Slab rects become ground boxes tagged `isGround` (so resting on them isn't a bump).
   - Ramp pieces become ground boxes tagged `isGround`, pitched.
   - Every `walls[]` entry becomes a collider with its `kind`; parked cars go through the existing parked-car path.
   - Bays get markings, and the target gets the existing bay glow at its `y`.
   - Cones, arrows, signs and lamps are visual.
3. **`DriverCamera` follows the car's height.** Today the eye y is the constant `RIDE_HEIGHT + eyeLocal.y` (line 120, to avoid suspension bob). Use a smoothed `chassisBody.position.y` instead: critically damped, about 0.12 s, which removes bob but follows ramps. Add pitch from the chassis, smoothed the same way and scaled 0.85. Flat levels must be unchanged: prove it with `seat-shot` before/after pixel equality on level 1.
4. **`ParkCheck` checks the floor.** It compares x/z only. Add `|car.y − (target.y + RIDE_HEIGHT)| ≤ 1.0 m`, so parking in the bay directly *below* the target on L3 doesn't count.
5. **Shadows follow the car.** The shadow span is `max(width, depth) × 0.72` around the origin (`Renderer.js:152`), and a 222 m city would blur it. For `city`, centre the sun's shadow camera on the car (snap to 2 m texels to avoid shimmer) with a 60 m span.
6. **Hill-hold.** In D or R, with no throttle and no brake, below 0.3 m/s, on a slope over 2% (chassis pitch), hold the car the way the brake-hold does (`BRAKE_HOLD_SPEED_MS` path), for up to 2.0 s after the brake is released or until throttle.
   - This adds behaviour; it doesn't change a handling constant.
   - Show a small "HOLD" in the cluster.
   - Flat levels are unaffected (pitch < 2%).
   - **This is the one gameplay decision here that the user should confirm.**
7. **`debugTeleport(x, z, heading, y?)`.** It currently respawns at ride height on y 0. Add an optional `y` (surface height) and pitch from `surfaceAt`, so probes can drop the car on the roof.
8. **`tools/autodrive.mjs`.** Its `project()` searches every path segment in plan view, but stacked floors overlap in plan. Project only onto segments within ±1.5 m of the car's y, and feed it `route.points` (it already follows rear-axle-ish pure pursuit).
9. **HUD distance chip.** Show the remaining route distance ("Roof · 184 m") and the current floor. Remaining distance = total − the route `s` nearest the car, same ±1.5 m y filter. Hide it once inside 10 m of the target.
10. **Mirrors, reversing camera, sensors.** They're relative to the car, so they should just work; verify on a ramp. The sensors' 5-ray fans must ignore `isGround` bodies, which ramps now are.
11. **Performance.**
    - Budget: 60 fps on the M1 Pro with AO on, measured with `debugBenchmark` at spawn, at the G entrance and on the roof.
    - Merge building geometry per palette colour. Instance parked cars where possible (132 here, versus about 20 on other levels). Frustum-cull by floor.
    - Mirrors stay round-robin.
12. **Lighting style `city`.** Daylight like `open`, with the sun shadow following the car (item 5). The decks under the slabs darken naturally from the shadows. Add ceiling light strips as `glow` materials, not lights.

## 6. Acceptance for the build

- `node design/level13/build-layout.mjs` exits 0, and `tools/city-lint.mjs` (the same rules) exits 0.
- **drive-test 13/13:** teleport onto the roof target in P → `results`.
- **autodrive 13:** the pure-pursuit autopilot drives the whole route from spawn to "Parked", with no bumps and the time recorded.
- Probes on r0 and r3:
  - hill-hold holds in D with no pedal (drift < 5 cm over 2 s);
  - the brake still holds;
  - every level's handling probe is unchanged.
- **Screenshots**, viewed and described, matching the sheet's Drive frames: spawn, facade approach with the P pylon, G ramp foot, L1 hairpin, roof arrival, the final turn into the bay.
- No new console errors or GL errors, and 60 fps as in §5.11.

## 7. Open questions for review

1. **Hill-hold** (§5.6): yes, or let the car roll back?
2. **Final park:** nose-first. An alternative is a reverse park into the same bay (heading −90°, `bayHeading` +90°), which would make it harder.
3. **Time limit:** 420 s is about 2.5× the estimate.
