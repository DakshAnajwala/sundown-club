# NOTES — Parking Precision (v1 + v2 + v3 + v4)

## v4: full rewrite (see CLAUDE.md for conventions, plan file for what's left)

v4 replaced the whole `src/` tree. v1-v3 are preserved in `legacy-v3/`. The
scope was much larger than v3: slowroads-style art direction, 12 levels across
open-air, underground and rooftop decks, a 720-degree steering wheel, a PRND console
shifter, a reversing camera with bending guidelines, IK driver arms, a two-mode
audio system, and parking scores.

### Conventions were measured first, not guessed

`tools/physics-probe.mjs` is a headless cannon-es rig — no browser, no
renderer, runs in a second. It exists because v1 got the engine-force sign
wrong, "fixed" it against the wrong reference frame, and only caught it when a
human played the game. v4's axes, steering sign and handling numbers all came
out of the probe before a line of game code was written. Full table in
CLAUDE.md.

**The single most valuable thing it found:** the floor must be a finite Box,
never an infinite `CANNON.Plane`. With a Plane, only the two FRONT wheel
raycasts report a hit — the rear pair returns distance -1 forever, the car
settles nose-down at 7.8 degrees resting on its chassis box, and 3 s of full
throttle moves it 0.4 m. Identical tuning with a Box floor: four wheels in
contact, 35.5 km/h. This would have been days of "the physics tuning is wrong".

### The solid-car bug

The first playable v4 build put the camera in the driver's seat and the entire
lower half of the screen was flat red. The body was 43 axis-aligned boxes, and
the "shoulder band" that formed the hood ran the full length of the car
straight through the passenger compartment. The dashboard, the steering wheel
and the driver's own arms were all sealed inside a solid slab.

This is what motivated the lofted body (`BodyLoft.js` + `bodies.js`). Sections
are authored as open half-profiles running from the beltline, down the flank,
under the floor; skinning them gives a hollow tub, and the hood/roof/boot lids
close only the parts that should be closed. It is also just a much better way
to get a car shape than stacking boxes.

### Other v4 bugs found by actually looking

- **Arms could not reach the wheel.** The first cabin package put the 2 o'clock
  grip 0.88 m from the shoulder joint against 0.60 m of arm. The IK clamped and
  the hands hovered in front of the rim with the arms locked straight. Fixed by
  moving the hub to z=-0.16 and lengthening the arms to 0.66 m total.
- **Arms then filled the lower corners.** With shoulders 0.25 m from the lens
  the upper arms rendered as giant flesh-coloured blobs. Shoulders moved back
  to z=0.42 so only forearms and hands are in frame, and the capsules slimmed.
- **Every parked car looked like a convertible.** The shell is FrontSide so the
  camera is never boxed in, but the driver's eye is at 1.16 m and roofs are at
  ~1.42 — so every roof in the lot was being viewed from below and culled. The
  roof panel is now the one DoubleSide part of the bodywork.
- **The nose was a slab.** Running the beltline flat at 0.98 to the bumper made
  the front a 0.78 m vertical wall. The plan table now carries a per-station
  beltY that falls away at the nose and tucks at the tail.
- **Cluster hidden behind the wheel rim.** Centred at 1.06, exactly where the
  rim's top arc (1.062) crosses it. Raised to 1.12.
- **Sun visors removed.** At 0.3 m from the eye a 0.28 m slab fills a quarter
  of the screen, for no gameplay value.
- **A car in Park slid at a dead constant 1.45 km/h.** Found by the level
  sweep: L1 reported "come to a stop" forever. Not physics tuning — cannon's
  wheel friction only acts on wheels whose `isInContact` is true, and after a
  step that flag reads **false on all four wheels even when their raycasts
  clearly hit** (distance 0.57 against a 0.61 ray, body correctly identified as
  the ground). With no friction and nothing opposing it, any residual velocity
  glides forever, in P, with 1e6 of brake force applied. Fixed by treating P as
  what it mechanically is — a pawl — and zeroing the body's velocity outright
  below 2 m/s. Do not trust `wheelInfo.isInContact` after a step.
- **A file was destroyed by the case-insensitive filesystem.** `src/ui/Hud.js`
  (new) and `src/ui/hud.js` (v3) are the same file on macOS; writing the new
  one overwrote v3's, and deleting the v3 path then took the new one with it.

### Deliberate decisions worth not re-litigating

- **The car stays 4.20 m.** Every clearance in `Levels.js` is computed against
  it, and v1 shipped a level that was mathematically impossible to complete by
  getting a clearance wrong. Civic *proportions* carry the look; the absolute
  length does not.
- **The car is generic surfacing in the Civic idiom, with no badge or marque** —
  the same position v2 took on not importing car models.
- **Cones have no physics body at all.** Not a filter, not a flag: they are
  never in LevelBuilder's collider path, so "the car phases through cones" is
  structurally true. Scoring detects overlaps separately and tips them over.
- **Park detection is bay-local, not radial.** v3 used `hypot(dx, dz) <= 0.3`,
  which treats 0.5 m too deep and 0.5 m too far sideways as the same error. For
  a 3.0 x 5.4 m bay they are completely different situations. Tolerances are
  now derived from the bay geometry per axis.
- **The camera takes yaw only, and a constant eye height.** "Perfectly steady"
  needs more than skipping shake: the chassis pitches under braking and rolls
  in turns, and parenting to it inherits all of that. Correct on a flat deck;
  a sloped level would need this changed to a low-pass filter on chassis y.
- **No audio files.** Everything is WebAudio synthesis, same licensing logic as
  the procedural geometry.

### v4 verification

`tools/drive-test.mjs` boots the game in headless Chrome, captures every
console error, and — the important part — teleports the car onto each level's
exact target pose to prove all five are completable. v1 and v3 both only ever
tested level 1. Screenshots via `tools/car-view.mjs` and `tools/shot.mjs`.

Note the timing trap: under software WebGL the renderer manages a few fps, and
the loop clamps dt, so game time runs ~20x slower than wall time. The first
run reported every level as uncompletable purely because a 0.9 s wall-clock
sleep never accumulated the 0.5 s park dwell. `debugTick()` steps the
simulation without rendering and made the whole suite deterministic.

### v4, second session: instruments, sensing, content, shell

Built: analog cluster, parking sensors, live mirrors, levels 6-12 with a new
rooftop style, the tutorial, and the menu shell (level select, settings with
quality presets, pause). Each got its own verification tool (see
ARCHITECTURE.md). The bugs below were found by those tools, and several of them
were in code that predated this session.

**The instrument cluster was never visible.** Its bezel box was centred 1.2 cm
in front of the dial face with 2 cm of depth, so its front face sat 2.2 cm
nearer the driver than the dial; an "upper cowl" slab also rose over the
face's bottom edge. From the seat the cluster was a blank dark slab, and the
first-session note "raised to 1.12" had fixed the wrong thing. The binnacle is
now authored in its own frame, where nothing can sit in front of z = 0.

**Mirrors and the reversing camera rendered a white wash.** three.js does not
tone-map when rendering into a render target, and this scene's sun + sky push
lit concrete well past 1.0 in linear terms, so an 8-bit sRGB target clipped
everything to white before ACES ever saw it. The reversing camera had shipped
like this. Fixed with HalfFloat linear targets; the composer's OutputPass
tone-maps them with the frame. (Corollary: `toneMapped: false` on a material
does nothing under an EffectComposer — tone mapping happens once, at the end.)

**Every lit draw call failed on a level's first frame.** Off-screen passes skip
shadow-map updates to save cost, but shadow-map textures are created lazily
*inside* an update. On the first frame after a level load the mirror and
reversing passes ran before any shadow update existed, and WebGL rejected
every lit draw: "Mismatch between texture format and sampler type". The drive
test had reported "0 warnings" throughout, because it matched console type
'warning' and puppeteer reports 'warn'. It now counts any GL_INVALID_* driver
message as an error.

**Levels 2 and 4 painted their bays backwards.** The markings were rotated by
`target.heading`, which is where the car's nose points — for a reverse park,
out of the bay. Every U opened onto the wall. Found by the new level linter
("bay mouth: 7.5 m of aisle blocked by wall") before anyone saw it. Levels now
carry `bayHeading` separately.

**"Right bay, wrong way round" from 30 m away.** ParkCheck's wrong-way test
looked at heading only. Invisible until Roof One, the first level whose spawn
faces exactly opposite its target.

**Door-mirror glass faced sideways.** The original door mirrors had their glass
on the outboard face; from the seat you saw the arm. Rebuilt with glass on the
rear face, yaw-capped so it doesn't sink into a 7.5 cm housing.

**The brake couldn't stop the car.** The first level autopilot run parked
nothing: with S held from 0.8 m/s the car settled at a steady 0.10-0.12 m/s and
rolled 90 cm over a minute, speedo reading 0. Same `isInContact` flaw as the P
glide; a held brake now locks the car below 0.3 m/s. The drive test's "2.0 s
brake" went from 0.33 km/h to 0.00. (The autopilot's own bugs on the way: a
route tighter than the 3.56 m turning radius, and pure pursuit tracking the
front axle in reverse — the rear axle is the unsteered one in both directions.)

**Smaller ones:** `THREE.Clock` is deprecated (now `Timer` with the Page
Visibility API); `PCFSoftShadowMap` was removed from three and silently fell
back with a warning; "Skip to level 1" didn't record the choice, so the
tutorial was offered on every launch; the sensor probe's first cut teleported
onto a target pose in P, which completes the level and silences the sensors —
probe in empty bays.

### Measured this session

- **Mirror cost**, finally (open since v2): +18% draw calls with all visible
  mirrors live (871 -> 1031 per frame); frame time within noise on software
  GL. At most one mirror renders per frame, and frustum culling means the
  passenger mirror normally costs nothing. The Low preset sets mirrors static.
- **Needles**: a critically damped spring trails a ramp by 2/omega. At omega = 9
  that was 0.22 s and felt late when braking to a stop; omega = 12. No overshoot
  (settled minimum +0.19 km/h, not negative).
- **Sensors**: readings match geometry to the centimetre (1.10 / 1.40 m against
  a wall, 0.80 m to a parked car). Corner rays splay 20 degrees, not 35: at 35
  a correctly parked car caught its neighbours and beeped forever.

### Deliberate decisions

- **Sensors cannot see kerbs or cones.** Kerbs are under the 0.45 m beam, as on
  many real systems; cones have no physics body by design.
- **Levels are all unlocked.** Stars and best scores are shown, but nothing is
  gated behind them.
- **The tutorial is proved by an autopilot sending real key events**, not by
  teleporting: a tutorial nobody can finish would be worse than a level.
- **Timed levels fail outright** (`timeLimit`); `parTime` still only scores.

### v4, third session: "I can't see in front of the car"

Player report: the forward view was blocked and the reversing screen couldn't
be seen. Both were geometry bugs, not a matter of taste:

- **The cluster stood above the eye.** Eye 1.16, cluster top 1.195 plus a
  visor: dead ahead there was no road at all, only the binnacle, and the level
  camera spent the top half of the frame on headliner.
- **The reversing screen was half inside the dash.** Centred at 1.03 with the
  dash block topped at 1.02 over the same depth, with the centre stack and
  vents in front of what was left — a 2 cm strip showed.

Fixed by a stack of sightline changes, each measured: dash shelf lowered to
0.92 with a sloped scuttle to the glass (so the lowered shelf doesn't open a
see-through slot into the FrontSide tub), cluster down to 1.02 (top under the
eye-to-nose line), eye up to 1.20 with a −6° resting tilt, and the wheel hub
down 4 cm to 0.86 — at the new eye the rim's top arc and 12 o'clock marker cut
through the middle of the dials. Reach improves slightly (worst rim angle
0.691 → 0.688 m).

Added Settings > Driving position: seat height, forward/back, left/right and
look-down, applied to the camera only (shoulders stay put, so the IK stays
valid). It is a docked card with no veil, so the view moves as you drag, and it
lights the reversing screen while open. Mirrors re-aim at the new eye.

### v4 gaps

- Levels 1, 2 and 6 are driven to completion by `tools/autodrive.mjs`; the
  rest are proved by teleport and lint. No human has driven the new levels.
- Gamepad input is not implemented.
- The front bumper/intake area is still visually blank; the A-pillar reads as
  two thin strips from the seat.
- Mirror and sensor audio have only been verified headless (audio is muted in
  the test browser).

---

## Parking bays, level progression, saved progress

Park *detection* already existed since v1 (target tolerance + heading +
speed, held 0.5s). What was added here: painted bay markings instead of a
flat decal, Replay / Next-level buttons on the result banner, and per-level
best results saved to localStorage (`ui/progress.js`), shown as star badges
on the level switcher.

### Lot A was uncompletable, and Lot C nearly so

Found while testing by teleporting the car onto the target pose: it still
never registered as parked. The chassis is **4.2m long**, but Lot A's two
flanking parked cars left a **3.4m gap** — at the target pose the car
intersected both neighbours, so the physics solver shoved it out and the
dwell timer never ran. That level could not be completed by any input.
Lot C left 4.8m (0.3m at each end), technically possible but far too tight
to swing into for a parallel park.

Widened to 5.6m (Lot A) and 6.0m (Lot C); Lot B was already fine at 6.0m.
**Bay gaps are load-bearing geometry, not decoration** — if a `parkedCar`
moves, re-check the gap against the 4.2m chassis. There is no automated
guard on this.

The painted bay is 2.5 x 5.0m, deliberately a bit larger than
`posTolerance` (0.3m) so it doesn't imply pixel-perfect alignment — the bay
is a visual cue, scoring.js remains the sole authority on passing.



## v3: peek/lean controls, real sedan body, cabin interior

- **Q/E peek, C lean-out.** Q/E swing the view ±70° (eased). C leans the eye
  toward the right-side window with a downward pitch and slight right yaw —
  the kerb-sighting view for parallel parking, and the only pitch this rig
  has. Gear cycling moved off E onto **F** (forward) / **R** (back).
- **Sedan rebuilt properly.** The old 5-box blob became a stepped tub
  (hood / cabin / boot), a greenhouse of A/B/C pillars + roof + cant rails,
  tinted glazing, rocker, bumpers and lamps. Wheels gained rims and spokes.
- **Cabin interior added.** Floor, door cards, headliner, firewall, rear
  bulkhead, parcel shelf, two front seats with headrests, rear bench, centre
  console.

### Why the interior became necessary

Opening real window apertures **retired v1's central visual trick**. That
trick relied on the camera sitting inside a sealed convex box whose inner
faces backface-culled away. With genuine openings the cabin is no longer
sealed, so single-sided panels vanish from inside and you see straight out
through the doors. Hence `DoubleSide` on the shell plus a real interior
shell. This is the one v1 design assumption v3 deliberately discards.

### Fixed during v3 browser verification

- Lean-out put the head level with the B-pillar, filling the frame with a
  black column — lean distance cut from 0.42 to 0.30.
- Roof at y=0.50 sat only 0.18 above the eye and cropped the top ~20% of the
  forward view; raised to 0.58.
- Interior rendered as a black void: the scene has one directional light and
  no bounce, and the headliner faces straight down. Fixed with a small
  emissive term on the cabin materials.
- Fully open apertures read as an open-top buggy from outside; adding tinted
  glass (22% opacity) made it read as a saloon while keeping ~80%
  transmission for the driver.
- Cabin extended rearward to -1.4 — the original left a ~0.95m flat rear
  deck that looked like a pickup bed.

### v3 gaps

- **Pedals still aren't visible in play.** They sit ~58° below the sightline,
  outside the 72° FOV, and the rig has no general pitch control (the lean is
  the only pitch, and it points at the kerb). Geometry exists for a future
  look-down control.
- Windscreen and glass are flat vertical planes, not raked.
- Only level 1 was driven after these changes.
- The car is generic sedan geometry, deliberately not modelled on any
  specific production car.



## v2 implemented (see parking-game-v2-prompt.md for the spec)

All six v2 features are built and verified in a headless browser (scripted
Puppeteer, installed with `--no-save` and removed after — not a project
dependency):

1. **Reverse tuned weaker/slower** — R now has its own force and top-speed
   constants (2000N total / 20 km/h cap) vs D's (4000N / 40 km/h).
2. **Procedural low-poly sedan body** (`car/sedanBody.js`) — five boxes
   (lower hull, hood, trunk, greenhouse) replacing the plain box.
   **Deliberately procedural, not an imported model** — see the
   licensing note below.
3. **Cockpit** (`car/cockpit.js`) — dash, steering wheel, speedometer gauge
   with a live needle, pedals, gear shifter.
4. **Mirrors** (`car/mirrors.js`) — rear-view + 2 side, with a HUD toggle
   between decorative and functional (live render-to-texture) modes.
5. **E cycles gears** P→R→N→D→P, alongside the existing 1-4 direct select.
6. **Steering + shifter animation** — wheel rotates with steer input
   (12:1 ratio), shifter tweens between 4 gate positions on gear change.
   Objects only, no hands/arm rig (still out of scope).

### Bugs found and fixed during v2 browser verification

Each of these looked fine in code and only showed up when actually rendered:

- **Speedometer occluded, then oversized.** First placement sat directly
  behind the (solid) steering wheel hub; moving it up fixed that but a
  0.1-radius disc that close to the eye filled most of the frame. Settled
  at radius 0.045, pulled back to z=1.05.
- **Sedan hood punched the driver in the face.** The first hood fractions
  put its rear face ~0.18m from the eye position, filling the screen with
  flat red. Pushed forward so the rear face sits ~0.8m out, past the dash.
- **Rear-view mirror unreachable, then black, then black again.** Three
  separate causes in sequence: (a) positioned ~65° above the forward view,
  which this camera can never see since free-look is yaw-only with no
  pitch; (b) moved into view but placed right on the greenhouse's front
  face, so it rendered point-blank into its own dark glass; (c) the glass
  plane's face normal pointed away from the driver, so `FrontSide`
  backface-culled it and what showed was the dark housing box behind it.
  Pixel-readback (`readRenderTargetPixels`) proved the render-to-texture
  pipeline was working the whole time — it was purely a display bug.
  Fixed with `DoubleSide` on the glass materials.
- **Decorative mirrors rendered black.** `metalness: 0.9` with no
  environment map renders nearly black under PBR — metals get their look
  from environment reflections, which this scene doesn't have. Dropped to
  `metalness: 0.2`.

### Post-v2 playthrough fixes (reported from an actual session)

- **Four wheels floating in the sky.** Pre-existing since v1, only became
  visible once the car body was something you could see past. The wheel
  meshes are children of `mesh`, which already carries the chassis
  transform, but the sync loop copied `wheelInfos[i].worldTransform`
  straight in — applying the chassis transform twice and flinging them off.
  Fixed by converting world→chassis-local (`pointToLocalFrame` + inverse
  quaternion) before assigning.
- **Couldn't see the ground or the target bay.** The eye sat only ~0.07m
  above the hood's top surface, so the view sighted almost exactly along
  the hood plane — it stretched to the horizon and covered everything
  below it. Fixed by raising the eye (0.1 → 0.32), dropping the hood/trunk
  (y fraction -0.06 → -0.15), and raising the cockpit props and rear-view
  mirror to match so the composition held together.
- Gauge/dash heights took a couple of passes to settle: seating the gauge
  directly on the dash put it behind the wheel rim, and raising the dash to
  meet the gauge turned the dash into a black wall that swallowed the
  wheel. Settled on the gauge as a separate raised pod with a small gap.

### Asset licensing note (why the sedan is procedural)

The v2 spec originally called for importing a GLTF sedan model. That was
reversed after a discussion about sourcing: procedural geometry sidesteps
licensing entirely and needs no external asset. Ripped or informally
"licensed" car models (sim-racing mods, extracted game/DLC content) were
explicitly declined and are not acceptable here — the underlying vehicle
design generally isn't the mod author's to license in the first place. If
this is ever revisited, the replacement must be CC0 or
clearly-documented-permissive (e.g. Kenney.nl's CC0 Car Kit).

### v2 gaps / not verified

- **Functional mirror performance is unmeasured.** Three extra
  `renderer.render()` calls per frame is real cost; no FPS profiling was
  done. Decorative is the default for this reason. If it bites: fewer
  mirrors, lower RT resolution, or render mirrors at half framerate.
- **Mirrors aren't left-right flipped** (deliberate simplification — plain
  rear-facing cameras, not true planar reflection).
- **Side mirrors need free-look to see.** They sit ~62° off the forward
  axis, outside the 72° FOV, so they're only visible while right-click
  free-looking. Only the rear-view mirror is in the default view.
- **Sedan proportions are a first pass.** Hood/trunk are nearly flush with
  the hull, so the silhouette reads as "low body + cabin" rather than a
  stepped three-box sedan profile. Fine for low-poly, easy to tune.
- **Levels 2 and 3 weren't re-driven after the v2 changes** — only level 1
  was exercised.

---

# v1 notes (below)

## Update: post-playtest user report, two more real bugs fixed

The user actually played it (not just the automated headless tests below)
and reported two things:

1. **A/D steering was swapped** — D turned the car visually left, A turned
   it right. Root cause: the earlier automated verification (see "Status"
   section below) checked whether positive `rotationY` moved the forward
   vector toward world `+X` and called that "right" — but that check didn't
   account for the camera's `FORWARD_FIX` (a 180° yaw applied in
   `camera/firstPerson.js` to align the view with the chassis's forward
   axis). Screen-right actually corresponds to world `-X` at zero yaw, not
   `+X`. Re-derived via explicit rotation-matrix math (not just re-asserting
   the old conclusion) and fixed by negating `steerInput` in
   `car/vehicle.js` before it's used. This is a good example of why the
   "verified" claims below should be read as "verified against the wrong
   reference frame once" — a lesson for trusting a single self-check.
2. **No car/dashboard/steering wheel visible** — by the original spec, v1
   deliberately has no interior mesh (HUD substitutes for a dashboard,
   driver/hand IK rig explicitly out of scope). But combined with the eye
   being positioned *inside* the solid chassis box (see bug #1 in the
   "Status" section), the view was fully empty — no car, no dashboard,
   nothing. The user asked for this fixed; given the explicit user request
   (a scope decision, confirmed via AskUserQuestion — "simple static
   dashboard + wheel"), added a minimal non-animated cockpit prop group in
   `car/vehicle.js` (dash box + steering wheel rim/hub/spoke, all static
   geometry, no hands, no wheel-turn animation) positioned just ahead of the
   driver's eye offset. This is a deliberate scope addition beyond the
   original prompt's literal "no steering wheel model" line, done on
   explicit user request rather than assumed.

Both fixes verified via the same headless-Chromium approach as below
(scripted key input + a temporary `window.__debug()` hook, removed after).

## Status: playtested via headless browser (Puppeteer), real bugs found and fixed

`npm run build` succeeds with no errors. The Claude-in-Chrome extension tool
was unresponsive all session, so verification was done by scripting a
headless Chromium (Puppeteer, installed temporarily with `--no-save` and
removed afterward — not a project dependency) to actually load the page,
send keyboard input, and read back live game state through a temporary
`window.__debug()` hook (removed before finishing). This caught three real
bugs that static/build-only checks could not have found:

1. **Camera was inside/against the car's own hood.** The spec's literal eye
   offset `(-0.35, 1.05, 0.15)` assumed the chassis origin was near ground
   level; in this implementation the chassis origin is the physics center
   (~1.2m off the ground once resting on suspension), so `+1.05` put the
   camera just above the solid chassis box's roof, filling most of the
   frame with the car's own body. Fixed in `src/camera/firstPerson.js` by
   moving the eye offset *inside* the box's volume — since there's no
   interior cutout mesh, the box's inward faces are backface-culled and
   invisible from inside, giving the unobstructed "empty space cabin" view
   the spec intended.
2. **Fake RPM formula produced 5-digit nonsense** (e.g. `10515`). It divided
   a per-substep `wheelInfo.deltaRotation` by frame `dt`, which isn't a
   valid rate. Replaced with a simple speed-fraction-based formula in
   `src/car/vehicle.js` that stays in a plausible 800–5000 range by
   construction.
3. **Engine force direction didn't match level layout.** Gear D drove the
   chassis toward local **-Z**, but every level's spawn/target/obstacle data
   was placed assuming **+Z** is forward (matching the camera's own
   forward-alignment math). This meant "drive forward" actually drove
   *away* from the target and into the (also newly-added) perimeter wall
   behind the spawn point — reproducible at the exact same world position
   regardless of suspension tuning, which is what made it diagnosable as a
   sign error rather than a physics instability. Fixed by flipping the sign
   in the gear→engineForce mapping in `src/car/vehicle.js` (one line),
   rather than rewriting three levels' geometry.
4. **Also found (not a bug, a missing feature): no perimeter walls.** A
   sustained turn could drive the car off a level's ground plane edge with
   nothing to stop it, and it would fall through empty space indefinitely.
   Not in the spec's obstacle list, but clearly needed — added invisible
   static boundary walls around each level's footprint in
   `src/level/loader.js`, excluded from bump-counting like the ground.

After these fixes, verified via the same headless script:

- **Acceleration curve**: clean and monotonic, ~28 km/h at 2.5s of throttle
  (spec target: 0→30km/h in ~2.5s) — close to spec, slightly conservative;
  reaches a ~38–40 km/h ceiling consistent with the 40 km/h cap.
- **Braking**: 18.8 km/h → 0.5 km/h in 800ms of S — strong and functional.
- **Steering direction**: confirmed correct by both empirical test (holding
  D produced a rotationY change consistent with a rightward turn) and by
  hand-checking the cross-product math for the "right" vector given
  forward=+Z, up=+Y in a right-handed frame.
- **PRND shift guard**: confirmed — attempting R while moving at 6 km/h
  (above the 2 km/h threshold) was correctly rejected; gear stayed D.
- **Camera**: confirmed showing the world (ground plane, horizon) ahead of
  the car, not the car's own body.

## Still not fully verified (honest gaps)

- **High-speed head-on wall impact can pitch/flip the car.** In one stress
  test (full throttle, no braking, straight into the north perimeter wall
  at ~40 km/h) the chassis ended up in a bad orientation (camera showed
  sky + wheels, i.e. the car likely rolled). This is a secondary concern
  relative to the spec's actual goal (low-speed parking precision, not
  high-speed crash robustness) and wasn't chased further given session
  budget — noted here rather than silently left unverified. A player
  driving normally (braking before obstacles, as the HUD timer/bump
  counter incentivizes) is unlikely to hit this; only tested here because
  the automated test held throttle with no braking.
- **Steering ramp/return feel** (0.35s ramp, 0.25s return), **handbrake
  pivot feel**, and **actual level navigability** (can each level's 2-4
  obstacle layout actually be threaded at the current ±35° max steer / 4.2m
  chassis length?) were not exercised by the automated tests above — those
  need a human actually trying to park, not just scripted key-holds.
- **Bump counter double-count avoidance** relies on cannon-es's
  `beginContact` firing once per continuous contact (not per physics
  substep) — confirmed via source read, not via an actual multi-bump
  playtest.
- **Levels 2 and 3** (reverse, parallel) were not individually driven in
  this session's testing — only level 1 (pull-in) was exercised. Given the
  engine-force sign bug affected level 1's geometry assumption identically
  everywhere `forward = +Z` is used, the same fix should apply uniformly,
  but this wasn't re-verified per-level due to session budget.

## Assumptions made (per "state assumptions, don't stop to ask")

- **Gear-select keys**: 1/2/3/4 = P/R/N/D, per spec's own stated assumption.
  Trivially rebindable via the `GEAR_KEYS` map in `src/input/keyboard.js`.
- **W/S pedal semantics**: single gas pedal (W, direction follows gear) and
  single brake pedal (S, always decelerates, never itself reverses) — this
  is what makes the R↔D shift guard meaningful.
- **Chassis "forward" = local +Z** is the fixed convention used by level
  spawn/target data and the camera; the car's actual drive-force sign was
  corrected to match this (see bug #3 above) rather than the other way
  around.
- **Star thresholds**: placeholder per-level `threeStarSec` values (30/40/50s)
  in `src/scoring/thresholds.js` — round numbers, not derived from actual
  timed clears (no full park-to-completion run was recorded this session).
- **Chassis spawn height** (`y=1.2` in `levels.js`): derived analytically
  from wheel radius, suspension rest length, and wheel connection point
  height so the chassis sits correctly on its suspension at spawn — matched
  the ~1.14–1.16m resting height actually observed in testing.
- **RPM**: explicitly fake/cosmetic, derived from speed fraction + a
  throttle blip — commented in code as not a real engine model.
- **3-level design**: obstacle density (2-4 obstacles) is the difficulty
  lever, maneuver type (pull-in/reverse/parallel) is the independent
  variety lever, per spec's explicit instruction not to conflate the two.

## Untuned / likely needs iteration

- `SUSPENSION_STIFFNESS` (45, up from the spec's literal 30) and damping
  (3.2 / 6.5) were bumped up during debugging, plus `chassisBody.
  angularDamping = 0.6` / `linearDamping = 0.05` were added — none of these
  turned out to be the actual fix (the real bug was the engine-force sign),
  but they're a reasonable, slightly-more-stable starting point than the
  spec's literal numbers for this chassis mass and are left in place rather
  than reverted, since reverting was not re-tested.
- `ENGINE_FORCE` is now correctly split across the two rear wheels (2000N
  each, 4000N total) rather than applied at 4000N to each (8000N total,
  doubling the intended acceleration) — this was a real bug fixed alongside
  the direction fix, see `src/car/vehicle.js`.
- Free-look clamp (±140°) and steering ramp/return timing are spec
  defaults, not yet iterated by feel.
- Level obstacle layouts are a first pass — navigability at current turning
  radius is unverified (see gaps above).

## Noticed opportunities (explicitly out of scope — not built)

- The rear-facing 2D guideline overlay (allowed as a stretch item after
  everything else is verified) — not attempted, core verification only
  just completed.
- Basic shadow mapping — skipped, deferred until core loop is confirmed
  smooth.
- No level-select persistence (localStorage) — restarting the dev server
  always starts back on level 1.
- The high-speed wall-flip behavior noted above could use a speed-based
  impact damping or a lower max speed near boundaries in a later pass, if
  it turns out to matter in practice (it's an edge case outside the spec's
  core precision-parking goal).

## September 2026 — graphics, HUD, camera and controls pass

Six features, built from `GOAL-graphics-hud-camera.md`.

- **Parked cars.** The "glitchy boxes" turned out to be two separate bugs.
  First, `CityBuilder` bakes merged car geometry in WORLD coordinates; at
  110-160 m out float32 quantises to ~20 um, which is enough for flush body
  surfaces to z-fight into a checkerboard. Fixed by baking relative to 16 m
  chunk origins (`CAR_CHUNK`). Second, and bigger: the layout model lists a
  collider box per parked car inside `L.walls` (its own clearance checks need
  them), and `CityBuilder` was baking every wall as visible concrete — so a
  featureless grey box was drawn over all 137 cars, with a duplicate static
  body to match. Both fixed. Cars then gained a stop lamp, exhaust, wipers,
  roof rails, three wheel patterns and per-car ride-height/steer variation,
  behind a three-tier LOD chosen by distance from the route.
- **Proximity radar.** Deliberately NOT built on `ParkingSensors` (1.5 m,
  ±20° — far too narrow for a 360° display). `ProximityScan` reads the
  physics world's static bodies and projects their footprints into car-local
  space. The floor filter is load-bearing: without it the deck above you
  renders as a wall all around. Note the car's forward axis is local -Z, so
  the scan flips z once so the display can treat forward as +z.
- **Track instruments.** Implements the idiom, not a marque — no badge, no
  model name, consistent with `bodies.js`'s position. The dial maps to
  Car.js's REAL range (idle 780, redline 6000); the shift lights fill over
  the 600 rpm approaching the gearbox's 3400 rpm upshift, because a bar
  keyed to "70% of redline" would essentially never have lit on this car.
- **Chase camera.** Writes into the one shared camera — a second camera
  would not be picked up by RenderPass/SAOPass. First build put the lens
  above the deck roof on Level 1, because the ceiling is visual-only
  geometry with no collider, so the boom's collision test could not see it;
  the rig is now told each level's ceiling height explicitly.
- **HUD customisation and rebinding.** New settings fields only — no
  STORAGE_KEY bump, because `load()` already ignores unknown keys and
  re-validates every known one, so a pre-change v4 payload still loads
  (verified). Escape always stays bound to the menu no matter what the
  player does, so a bad remap can never lock them out.

New probes: `tools/radar-probe.mjs`, `tools/chase-probe.mjs`,
`tools/rebind-probe.mjs`.

## September 2026 — rear-end fix and chase telemetry

From `GOAL-rear-hud-leaderboard.md`, Parts A and B. Part C (public
leaderboard) is deliberately not started: it needs a server, and `PRIVACY.md`
§1 is currently titled "There is no account, and no server".

- **The rear of the car.** Four separate faults, found by rendering the car
  with each part switched off in turn rather than by guessing. The exhaust tip
  added in the previous pass ran from z 2.054 to 2.144 while the bodywork ends
  at 2.10, so it hung past and below the tail with nothing behind it. The rear
  bumper strip was a fixed 1.45 m wide against a 1.351 m tail, standing ~5 cm
  proud of each rear quarter and 3.8 cm past the tail. The boot lid overhung
  the beltline by 2.0-4.7 cm on EVERY body type, which is what produced the
  shelf sticking out of each rear quarter. And the tail lamps were bare glow
  boxes 4.5 cm proud of the tail — the headlamps had used a dark housing with
  a recessed lens all along, with a comment explaining that a bare bright box
  "reads as a sticker rather than a lamp"; the tail never got the same
  treatment. Fixes: lid widths are now clamped to the flank in code (`fitLid`)
  rather than trusting five hand-authored tables, strips and lamps follow the
  body's own `noseZ`/`tailZ`, and the exhaust tucks under a dark valance.
  The wipers and the high-level stop lamp were both cleared by isolation.
- **Telemetry pill.** The chase camera left the player with no instruments at
  all, since every gauge in this game lives on the dashboard. `TelemetryHud.js`
  is the one exception, and by default it appears only in chase view. Its
  shift-light thresholds are IMPORTED from `DashCluster.js`, not copied — two
  sets of the same constants drift the moment either is tuned. The reference
  the user supplied lists fuel and lap estimates; this car has neither, so
  that row shows elapsed time and bumps instead of inventing telemetry.
  Revs are quantised to 10 rpm with a 20 rpm deadband, because the engine
  model jitters at idle and was rewriting the DOM nearly every frame of a
  stationary car.
- **Fixed in passing:** the HUD-customisation pass had added
  `.hud-bc { transform: scale(...) }`, which overwrote that element's own
  `translateX(-50%)` and silently un-centred the live prompt and the key
  legend.

New probe: `tools/telemetry-probe.mjs`.

## September 2026 — public leaderboard

`GOAL-rear-hud-leaderboard.md` Part C, built after the owner confirmed the
site may have a server.

- **Names are generated, never typed** (`src/net/handles.js`). That is the
  whole moderation strategy: a curated word list cannot produce a slur, so
  there is no filter to maintain, no report queue and no takedown process for
  one person to staff. The server re-checks the name against the same list,
  so a hand-crafted POST cannot put arbitrary text on a public page.
- **Cheating.** The score is computed in the browser and cannot be fully
  trusted without re-simulating the run server-side, which is its own project.
  What was done instead: `window.__game` no longer ships in production builds
  (it exposed `debugTeleport`, which parks the car on the target pose — by far
  the cheapest cheat, and it was live); `/api/run` issues a signed, one-shot,
  level-bound token that `/api/score` requires, which kills console submits,
  replayed requests and spraying; the server compares the claimed run length
  against wall-clock time it measured itself, catching both a sped-up and a
  grossly slowed-down game clock; plus value sanity, a plausibility rule, a
  body-size cap and per-IP rate limits on both routes. The board is labelled
  **unverified** in the UI, the privacy policy and the terms, because it is.
  A bot that genuinely drives well remains indistinguishable from a good
  player, by design.
- **Offline is the normal case.** `src/net/leaderboard.js` swallows every
  failure and the game behaves exactly as before. It is also switched off
  entirely under the Vite dev server, which has no serverless functions —
  without that every probe counted the resulting 404s as console errors.
- **Legal shipped in the same change**, not after: `PRIVACY.md` §1 used to be
  titled "There is no account, and no server", which the leaderboard makes
  false. Privacy and terms both rewritten, in markdown and in the `public/`
  HTML copies, with deletion-by-email and the unverified warning spelled out.
- **Caught in passing:** the rebinding panel had been named `showControls`,
  colliding with the existing how-to-play panel of the same name — the later
  declaration won, so the start menu's "Controls" button silently opened the
  wrong panel and the how-to-play list was unreachable.

New probe: `tools/leaderboard-probe.mjs` (pure logic, no browser, no database).

**Not done, and deliberately:** server-side replay verification. It is the
only thing that would make the board trustworthy.

## September 2026 — automatic posting, one name per player

- **Posting is now automatic**, with an opt-out in Settings and a one-time
  notice on the first post so nobody finds out after the fact that their runs
  go somewhere public. The privacy policy's section 4 was rewritten to match;
  it previously promised nothing was sent unless a button was pressed.
- **The server owns the name.** It issues each browser a signed random id and
  stores the generated name against it; `/api/score` looks the name up rather
  than accepting one, so editing localStorage no longer buys extra rows. The
  client cannot choose a name at all, and the reroll button is gone.
- **Why not IP or fingerprinting.** IP is wrong in both directions — a school
  or household shares one, and a phone changes its own hourly — and binding it
  to a public row turns it into stored personal data. Fingerprinting is
  tracking, needs consent, collides between identical devices, and breaks on
  browser updates. Both cost real privacy to stop an attack that is only worth
  a little. The browser token stops casual name-swapping for nothing, and is
  honest that it identifies a browser rather than a person; the policy says so.
  Genuinely stopping a determined player needs accounts, which are not wanted.

## September 2026 — four more levels

Seventeen levels now. The four new ones fill gaps the first twelve left:

- **Deck Five** (open, three-point) — the manoeuvre only appeared once, and
  only in open floor. Here the lane dead-ends, so the turn has to happen at
  the tight end. Same proven 7.8 m lane as Roof One: rows at +/-6.0 put their
  lane-side bumpers at +/-3.9, and the measured kerb-to-kerb circle is ~8.9 m,
  so a U-turn cannot fit.
- **Level B5** (underground, angled) — Deck Four's echelon mirrored, so the
  swing is to the right, under a 2.9 m ceiling.
- **Level B6** (underground, reverse, 110 s limit) — the only timed level
  below ground. Flanking cars at +/-2.7 give 0.92 m of door gap against the
  0.35 m the lint enforces.
- **Roof Four** (rooftop, parallel) — parallel parking had never appeared on a
  roof. 6.6 m of clear kerb against the 6.2 m floor, and the kerb is the
  parapet, so overshooting is a wall.

**Ids are stable and no longer match play order.** The new levels are ids
14-17 but sit interleaved through the running order, so saved progress and
leaderboard rows stay attached to the right level. Nothing may assume
`id === index + 1` — `Hud.setLevel` did, and the leaderboard panel opened the
wrong board because of it.

That assumption was also baked into four probes, which had silently stopped
testing what they claimed: `shell-probe` asserted Final Exam was at index 11,
and `telemetry-probe`, `chase-probe`, `radar-probe` and `autodrive` all used
index 12 for City Drive, which is now Roof One. They look levels up by name
or id now, via `debug().levelNames` / `levelIds`.

## September 2026 — popularity audit (branch audit/popularity)

Brief in `prompt.md`, full findings and evidence in `AUDIT-REPORT.md`. The
decisions and traps worth remembering:

- **The live site deploys from `main`.** CLAUDE.md §3 had said production was
  pinned to `v4-stable`; the Vercel API says `productionBranch: main`. Every
  push to `main` is a public deploy. Audit work stays on the branch.
- **The hero's only call to action was invisible.** A GSAP tween for the
  footer CTA selected `.cta`, which also matched the hero button, so it sat at
  opacity 0 until the visitor reached the footer — on the live site, for
  everyone. `tools/site-probe.mjs` now asserts the hero button is visible and
  hit-testable above the fold at 1440 and 390. Scope GSAP selectors to their
  section.
- **Wheel hub "static" was z-fighting.** The steering column's end face sat at
  exactly the pad's front face (z = -0.010 in the wheel pivot). The 15 Sep
  "dithering" fix was a misdiagnosis: it only ruled out AO. Ruling out shadows
  too (and seeing the stripes change pattern frame to frame) is what separates
  depth fighting from banding. Nothing may end flush with a visible face.
- **Privacy text must follow the code.** `ensureIdentity()` ran on every
  `/play/` load, contradicting PRIVACY.md ("the identifier leaves your device
  only when a score is posted"). It now runs on the first post. The run-token
  request at level start (level number only) is now disclosed. site-probe
  asserts no `/api/identity` on page load.
- **`?debug` never submits.** It exposes `debugTeleport` on a production
  build; `leaderboard.js` now refuses to start or submit runs with it.
- **Phones:** the game has no touch controls (deliberately not built in this
  pass — a stop-and-ask item). Instead, touch-only visitors are told up front,
  on the homepage and in the start menu, and given "Send me the link".
- **Levels start in P.** Holding W in P or N (or idling 4 s out of the bay)
  now prompts "press F for Drive or R for Reverse", with the player's own keys.
- **Distribution:** portals (Poki, CrazyGames, PacoGames) own the head search
  terms. Standalone SEO can only win long-tail terms; the realistic traffic
  channels are portals and communities. Recorded as a user decision.
- **Probes:** `review-probe` had the same index-not-name bug as the four fixed
  on 21 Sep (indices 9/10 had become Level B4/B6). A dev server left running
  for days goes stale after a lockfile change and makes probes time out on
  `page.goto` — restart it (`npx vite --port 5175 --strictPort --force`).
- New tools: `tools/site-probe.mjs` (site smoke + SEO + privacy),
  `tools/media-shots.mjs` (homepage stills, OG card, touch icon from the real
  game, GPU).

## September 2026 — retention pass (branch feat/retention)

Brief `prompt-retention.md`, measurements `RETENTION-REPORT.md`, design
`design/SPEC-retention.md`, build order `GOAL-retention.md`.

- **Measure first.** `tools/loop-probe.mjs` times the retry loop on the GPU
  harness. The surprise: rebuilding a level on restart costs 33-54 ms (City
  Drive ~330 ms), so the planned "reset in place" path was not built — a
  second restart path would be leak risk for nothing. The real leaks were the
  2 s of dead card keys during the review flight, a card that never said what
  cost the points, and nothing left to do on a 3-star level.
- **City Drive's results and fail cards ignored the keyboard.** Keys were
  routed to the card only while `review.active`, and the review never runs on
  City Drive. Cards now take keys whenever one is open.
- **One retry key.** The `restart` action (B, rebindable) works in play, on
  both cards and during the flight. It was not moved to R: R is Reverse, and a
  Reverse press that lands as a timed level runs out would throw the fail card
  away unread. R keeps its old card meaning once the flight has settled.
- **Levels and retries still start in Park** (owner's call). So fail-to-driving
  and load-to-driving stay at 2 keys; the report records those as misses.
- **No creep** (owner's request, same day). D/R move only while W is held.
  Engine braking above 1.1 m/s as before; below that the car rolls down at
  0.8 m/s² and stops dead under 0.1 m/s on the flat (hill-hold covers slopes).
  First attempt stopped the car dead at every lift-off below 0.3 m/s: crawling
  became stop-go and autodrive clipped a parked car on City Drive's roof —
  and autodrive still reported a pass, because it counted any `results` state
  (a time-out included) as parked. Both fixed.
- **Where the points went** reads `Scoring.finish()`'s parts; "cost you N
  points" is the exact gain from re-summing with that part at full marks, never
  an estimate. The pose words moved into one exported `stopWords()` so the
  overlay, the sentence and the card can't disagree.
- **Medals are additive.** Gold >= 95, Platinum >= 98 and under an author
  time. Author times for levels 1, 2, 6 are real autodrive runs (re-run after
  creep was removed: 21.3 / 29.0 / 15.7 s); the other 14 are par x 0.8 and
  provisional until a human run.
- **Daily challenge, no streak.** Seeded from the UTC date (mulberry32 of
  YYYYMMDD, never the same variant two days running), drawn from 23 variants of
  existing lots (moved bay, no contact, under par — the last only on levels a
  real driven run beat par). level-lint and drive-test check every variant.
  Stored: a cumulative count and today's best, nothing that could compute
  consecutive days. Never posted: a daily board would be a server change.
- **The personal-best ghost was wrong on a new best:** `completeLevel` handed
  the review the record it had just written. It now passes the best from
  before the run, and the footprint is on by default. The live ghost car is two
  meshes with no body, fades out within 2 m of you, and is capped at 30 KB per
  level / 400 KB total in localStorage.
- **Probe isolation:** puppeteer pages in one browser share localStorage, so a
  probe section that parks a level changes what the next section reads. Each
  retention-probe section now runs in its own browser context.

## How to run

```
cd parking-game-v1
npm install   # already done
npm run dev   # starts Vite; open the printed localhost URL
```

Controls: W/S throttle-brake, A/D or arrows steer, Space handbrake (hold),
1/2/3/4 shift P/R/N/D, right-click hold for free-look. Level buttons are in
the top-right HUD corner.
