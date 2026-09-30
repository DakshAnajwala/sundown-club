# GOAL — City polish: speed feel, parked-car detail, city atmosphere, Level 13 challenge

**Owner of this run:** Sonnet/medium, coding from this file.
**Source of truth:** this GOAL. Design decisions already made are marked DECIDED; open ones are marked
CHOOSE and must be resolved (reasonable default given) before that sub-task is "done".
**Prime directive:** the whole game must stay at 60 fps and keep the flat-pastel, zero-texture,
merge-by-material art direction. No image textures anywhere (Palette.js header rule). No new npm deps.
**Regression gate for every item:** `node tools/drive-test.mjs` stays 13/13 with 0 console errors;
`node tools/autodrive.mjs` routes 1/2/6/13 stay at their known-good numbers; Level 13 frame budget
stays ≤ ~2.0 ms / ≤ ~750 draw calls at spawn/entrance/roof (current baseline 1.6–1.7 ms, 613–704 calls).

Do the four items in this order. Commit each separately so a regression is bisectable.

---

## 1. Sense of speed

**Problem:** the driver camera is deliberately dead-steady (DriverCamera.js header: "perfectly steady is
a hard requirement") with a fixed `const FOV = 68`. With the new 100 km/h top end there is no visual
build of speed — 30 km/h and 90 km/h look identical from the seat.

**Hard constraint:** the "no shake / no roll / no pitch-from-chassis" rule stays. Sense of speed must
come from *smooth, framerate-independent* cues only, never jitter. Anything that adds per-frame random
motion is rejected.

**Files:**
- `src/camera/DriverCamera.js` — add speed-reactive FOV. Today `FOV` is a module const and `setFov(deg)`
  exists (used by Settings). Add an internal `speedFovKick` that is *added* on top of the user's base FOV
  each `update(dt, input)`, so it composes with the Settings FOV rather than overwriting it. Requires the
  camera to know car speed: pass `speedMs` into `update()` (Game.js already has `car.state`/chassis
  velocity — thread it through, same call site that already passes `input`).
- `src/core/Game.js` — pass current speed to `driverCamera.update()`. Speed source: chassis body velocity
  magnitude, or `car.state` speed already computed for the HUD (reuse, do not recompute).
- `src/ui/settings.js` — the FOV slider stays the *base* FOV. Add a "Speed FOV" on/off (or 0–100%
  intensity) toggle so a player prone to motion sickness can disable it. DECIDED: default ON at 100%.

**Spec (DECIDED numbers, tune in-browser):**
- Base FOV unchanged (68 default, or whatever Settings holds).
- Speed FOV kick: `+0°` at ≤ 20 km/h, ramping to `+12°` at 100 km/h, eased (smoothstep on
  `clamp((kmh-20)/80,0,1)`), and critically-damped toward the target with the existing `springTo`
  helper (~0.35 s smooth time) so gear changes and throttle lifts don't snap the lens. Never exceed
  `base + 12`.
- CHOOSE (default: yes) a matching subtle vignette/edge speed-lines effect is a *stretch*; skip for v1
  unless FOV alone reads flat. If added it must be a cheap fullscreen shader in the composer, off by
  default under Settings, and must not touch the SAO/Output pass order in Renderer.js.

**Also (DECIDED):** roadside detail density is the other half of speed feel and is delivered by items 2–3
(more parked cars/props streaming past the window). No separate work here.

**Done when:** flooring it from 0 reads as visibly accelerating (FOV widens as speed climbs, narrows as
you brake), the effect is smooth with zero jitter on a flat level, the Settings toggle disables it, and
the steady-cam regression (look-back, lean, ramp pitch) is unchanged. Verify in-browser at 20/50/90 km/h.

---

## 2. Parked-car graphics

**Reality check first:** parked cars are NOT blocky primitives — `CityBuilder.createParkedCar()` →
`CarModel.createSedanShell/buildBody` builds the *same* lofted body the player drives, and there are
already 5 silhouettes (`bodies.js`: SEDAN/HATCHBACK/SUV/VAN/PICKUP) picked deterministically by
`bodyForIndex(i)` via the `MIX` table. So "improve graphics" = **more variety and read**, not a remodel.
Confirm the perceived blockiness in-browser first (screenshot a row of parked cars at driver-eye height)
and note the actual cause before editing — it may be paint monotony, LOD flatness, or the wheels.

**Constraint:** parked cars are merged by material in `CityBuilder.js` (`byMaterial` map) to hold the draw
budget — 132 cars in Level 13. ANY per-car visual variety must still collapse to a bounded number of
shared materials, or the merge breaks and draw calls explode (the exact regression the merge was added to
fix: 2,500+ calls). Palette.js caches materials by colour, so "more paint colours" = "more merge buckets"
— keep the palette to a fixed small set (e.g. ≤ 10 `COLORS.carPaints`).

**Work (in priority order):**
1. **Paint variety** — widen `COLORS.carPaints` in `Palette.js` to a curated ~8–10 colour set (muted
   city tones: silver, graphite, white, navy, deep red, dark green, beige, black). `CityBuilder` already
   calls `carPaint(c.paint)`; layout-model already seeds `paint` per car. Verify the seeds spread across
   the new palette (currently `Math.abs(Math.round(x+z)) % 7` for kerb cars — bump the modulus to match).
2. **Body-mix variety** — review the `MIX` table weighting; make sure Level 13's 132 cars aren't 80%
   identical sedans in identical colours. Deterministic still (a lot must look identical every load).
3. **Detail read at distance** — the wheels are `createWheelMesh` (tyre + dished rim + 5 twin spokes).
   Confirm they read; if the merge is flattening normals oddly, fix the normal handling in
   `mergeBoxGeometries` (it copies normals but does not renormalize after transform — a rotated car's
   normals may be wrong, which would flatten the shading and *cause* the "blocky" look). CHOOSE: if that
   is the culprit, the fix is to recompute vertex normals after merge, or bake the normal matrix properly.
4. CHOOSE (default: skip for v1) light per-car dressing (a roof box on one van, etc.) only if cheap and
   merge-safe. Do not add if it costs draw calls.

**Done when:** a row of parked cars shows clear colour and silhouette variety, shading is correct (not
flat-blocky), and Level 13 frame budget is unchanged (≤ ~750 calls / ≤ ~2 ms). Before/after screenshots
in `tools/shots/`.

---

## 3. City atmosphere (Level 13 and future city modes)

**Problem:** the city reads as empty geometry. Signs are minimal glowing panels (`buildSign` in
CityBuilder.js: no lettering by design), there are no traffic lights, no roundabouts, and the 4×4 street
grid (`streetsX: [-105,-35,35,105]`, `streetsZ: [-105,-38,38,105]` → 16 intersections) is bare tarmac.

**Constraint:** zero textures. All signage/lights are geometry + `glow()` emissive material (as existing
signs/lamps already are). Everything static merges by material like the rest of CityBuilder. Traffic
lights that *animate* (see below) are the one exception — a handful of small glow meshes whose emissive
swaps; cap the count.

**Data lives in `design/level13/layout-model.mjs`** (pure-JS `buildLayout()`), rendered by
`src/world/CityBuilder.js`. Add new layout arrays there, render them in CityBuilder, and extend
`checkLayout()` + `tools/city-lint.mjs` with any new invariant (e.g. "every route intersection has a
control"). Keep the model/renderer split — no geometry decisions in CityBuilder that belong in the model.

**Work:**
1. **Better directional signage** — add overhead gantry / roadside direction signs along the route
   (arrows to "P", lane guidance into the car-park entrance). Geometry: post(s) + a flat glow panel with
   a chevron/arrow *shape* cut as geometry (not text). Extend the existing `L.signs` array with a new
   `kind` and a `buildSign` branch. Reuse the floor-arrow glyph approach from `Props.createFloorArrow`
   for the arrow shapes so signage matches the on-road arrows.
2. **Traffic lights** — add `L.trafficLights = [{ pos, heading, phase }]` at the route's controlled
   intersections. Geometry: a pole + a 3-lamp head (red/amber/green glow meshes). DECIDED: they animate
   on a fixed global cycle (e.g. 8 s green / 2 s amber / 8 s red, offset per intersection) driven from the
   builder's `update(elapsed, carPos)` (already called every frame) by swapping which lamp's emissive is
   lit. CHOOSE (default: NO for v1) whether running a red actually penalizes — penalties are a Parking-Rush
   feature (roadmap), so v1 traffic lights are **atmosphere only, no enforcement**. State that in the file.
3. **Roundabout** — CHOOSE (default: defer to a Level-13-v2 or a new level): a true roundabout changes the
   route geometry and the autodrive path, which is high-risk for the existing validated Level 13 route.
   For v1 atmosphere, add a **decorative central island** (raised planter cylinder + kerb ring) at ONE
   non-route intersection so the city shows a roundabout without touching the drivable route. A functional
   roundabout the player drives is a separate, larger task — note it as such, do not attempt here.
4. **Street dressing** — CHOOSE (default: light pass): road-edge kerbs already exist via sidewalks; add
   crossing stripes at intersections (merge-safe paint quads via `paintQuad`), and a few street-furniture
   props (bins, bollards) as bounded merged geometry. Keep it cheap.

**Done when:** driving the Level 13 route past the entrance shows readable direction signage, at least the
route intersections have working (animating) traffic lights, and there is at least one roundabout-island
read in the city — all at unchanged frame budget, `city-lint` green, drive-test 13/13. Screenshots.

---

## 4. Level 13 improvement (navigation challenge)

**Problem (user's words, re-scoped to L13):** the car park / city is "too easy to navigate" and needs "a
higher sense of speed" (delivered by items 1–3) plus more of a real-city challenge. Level 13 today: spawn
→ streets → entrance barrier → ramps G→L1→L2→L3→Roof → reverse-nose into roof west row bay 5; par 240 s,
limit 420 s (`design/level13/layout-model.mjs`, `Levels.js` entry, CLAUDE.md §7.2).

**Approach — make it harder to navigate WITHOUT breaking the validated route/autodrive.** The rear-axle
route and its 4 autodrive pass are load-bearing; any layout change must keep `checkLayout()` /
`city-lint` green and `autodrive.mjs` route 13 parking cleanly. Prefer changes that add navigational
*decision-making and tightness* over changes that move the target.

**Candidate changes (CHOOSE the set; defaults marked):**
1. DEFAULT YES — **denser kerb parking + tighter driving lane** on the route streets so the approach reads
   busier and demands more precise lane-keeping. Add parked cars along the route (item-2 variety applies),
   keeping the driving lane ≥ the validated clearance. Re-run autodrive 13 after.
2. DEFAULT YES — **more wayfinding load**: with better signage (item 3) the correct route to the entrance
   should be found by reading signs, not by there being only one open path. Add a plausible wrong-turn
   (a dead-end street or a "full" side lot) that a first-time player could take.
3. DEFAULT YES — **tighten the in-garage aisles / add obstacles** (a mis-parked car straddling a bay, a
   cone run) on the ramps' arrival aisles so threading G→Roof takes care. Must keep ramp headroom
   (2.42 m) and turning radius (4.0 m hairpins) — re-run `city-lint` grade/headroom/radius checks.
4. CHOOSE (default: NO) moving/parking-into a harder bay or changing park type — high risk to the
   validated route; only if 1–3 don't add enough challenge, and then re-validate the full route + autodrive.
5. DEFAULT YES — **retune time** if the added density makes 240 s par too tight/loose; keep `checkLayout`'s
   time check consistent with the new route length.

**Hard rule:** after ANY Level 13 layout change, re-run `node tools/city-lint.mjs` (all 10 checks green),
`node tools/drive-test.mjs` (L13 PASS), and `node tools/autodrive.mjs` route 13 (parks, within tolerance,
no wall bumps). If autodrive regresses, the layout change broke the route — fix the layout, don't loosen
the autodrive.

**Done when:** Level 13 demonstrably requires more navigational care (denser traffic, real wayfinding,
tighter aisles), all lint/drive-test/autodrive gates green, frame budget unchanged.

---

## Definition of Done (whole GOAL)
- [x] Items 1–4 each committed separately, each with drive-test 13/13 + autodrive 1/2/6/13 green.
      (f229556, 3ea34eb, 18b43ff, 44a2df9)
- [x] Level 13 frame budget ≤ ~2.0 ms / ≤ ~750 draw calls at spawn/entrance/roof.
      (289–385 draw calls measured across spawn/intersections/roundabout, well under budget)
- [x] No new npm deps, no image textures, flat-pastel look intact.
- [x] Settings toggle for Speed FOV present and working (Settings > View > "Speed FOV").
- [x] `city-lint` extended for any new city invariant and green.
      (new 11th check: "Route intersections with a traffic-light control", 2/2)
- [x] Before/after screenshots for items 2, 3, 4 in `tools/shots/` (gitignored, local only).
- [x] CLAUDE.md §7 / §10 updated to reflect what shipped.
- [ ] Deploy only when the user asks (CLAUDE.md standing rule) — NOT deployed yet.

---

## Out of scope for this GOAL (tracked elsewhere)
- Rear-seat delete / look-back sightline fix.
- Multiple purchasable car models with distinct stats; in-game currency; ads / real-money payments.
  Current monetization stance: currency unlocks cosmetics only; payments are a future addition needing a
  backend + accounts.
- Future game modes: taxi sim, driving/lane-cutting sim, free-roam city, more parking levels,
  Parking-Rush big-city map with roundabouts/flyovers/interchanges/traffic-light penalties.
