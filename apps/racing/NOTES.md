# NOTES — decisions, measurements and bugs

Running log. Newest section last. Read before re-opening a decision.

## 30 Sep 2026 — code copied from Parking Precision

Source: `github.com/DakshAnajwala/CarParkingGame-MAIN` at commit `c04a175`
(`main`). Copied as files, not shared (owner's choice). When a bug is fixed in
either game, port it by hand; this list is the map.

Copied unchanged: `src/vehicle/BodyLoft.js`, `bodies.js`, `CarModel.js`,
`Cockpit.js`, `SteeringWheel.js`, `RimCurve.js`, `HandModel.js`, `HandRig.js`,
`HandRigChecks.js`, `Driver.js`, `Mirrors.js`, `Dimensions.js`,
`src/camera/DriverCamera.js`, `ChaseCamera.js`, `src/render/Renderer.js`,
`src/physics/PhysicsWorld.js`, `src/audio/AudioSystem.js`,
`src/input/Input.js`, `src/world/Palette.js`, `Props.js`, `src/core/Events.js`.

Copied and changed: `src/ui/DashCluster.js` — dials rescaled for racing
(tacho 0–8k, red from 7k; speed 0–300 km/h in steps of 50, mph 0–180; track
theme shift lights 5,400 → 6,400, red 6,800). The speed numerals crowd at the
top of the small dial; the slice gets a new dial face (SPEC §6).

Not copied yet (SPEC §12.1): `CityBuilder.js` (needs the Level 13 layout
model; comes with the district builder), `Ghost.js` (imports Parking
Precision's `Retention.js`; comes with time trials).

## 30 Sep 2026 — the race car model and the Handling Lab

New: `src/vehicle/RaceCar.js`, `cars.js`, `Tuning.js`,
`design/handling/` (the Lab), `tools/race-physics-probe.mjs`,
`tools/handling-shot.mjs`.

**Wheel force comes from the engine and the gear.** torque(rpm) × gear ×
final drive × efficiency ÷ wheel radius, with aerodynamic drag and rolling
resistance applied on every physics substep. Top speed is where drag meets
power; there is no speed cut-off. Drag must ride on cannon's `preStep` event:
cannon clears forces after each internal step, so a force applied once per
frame acts on only the first of several substeps.

**cannon's friction, measured.** Per wheel and step the tyre delivers at most
suspensionForce × dt × frictionSlip, shared by side and forward in a circle
that counts forward force at HALF weight. Consequences:
- `frictionSlip` ≈ lateral grip in g. Parking Precision's 4.2 would be ~4 g;
  the race cars use 0.97–1.1.
- Longitudinal grip is about twice lateral, so a road car can never spin its
  driven wheels or break the rear loose on the throttle (the starter uses ~40%
  of its rear grip in 2nd). Hence "slide under power" below.

**Drifting needed two rules; both are measured by the probe.**
1. *Slide under power* (`slideSustain`): once the car slides past 8°, throttle
   bleeds rear grip (full effect by 20°). Lift and it grips up. Stock 0.22
   starter, 0.2 coupe: with 0.3 the starter held a drift but over-rotated to
   72° once the gearbox held its gear through slides.
2. *Counter-steer authority*: speed-faded lock (a tap at 200 km/h must not be
   a swerve) also stopped the front wheels pointing where a sliding car goes,
   so every slide past ~20° became a spin, even with full counter-steer.
   Steering into the direction of travel may now turn the wheels up to the slip
   angle + 6°, capped at full lock. After this change firm counter-steer
   catches a slide in under 0.5 s.

**The auto gearbox holds its gear while sliding (> 12°).** Road rpm comes from
forward speed, which collapses at a big drift angle; the box hunted down to
1st and bounced off the limiter mid-drift (seen in the Lab: drive force 0 at
59 km/h in 1st).

**Step order: physics first, then the car.** `update()` sets forces for the
next step and syncs meshes to this one. The Lab first ran them the other way
round: the body moved after the meshes were placed, the seat camera (which
follows the body) ran one step ahead of the dashboard, 0.5 m at 114 km/h, and
the cockpit view showed a giant cluster with the wheel pushed out of frame.
Parking Precision's `Game.js` already had the right order.

**Open:**
- The starter reaches top speed in 5th; 6th is an overdrive it never uses.
  Decide when the owner has driven it (gear 6 ratio up, or keep as cruise).
- Handbrake grip is 0.5 of normal rear grip; the probe's handbrake turn gives
  44–49° with steer 0.6.
- Dev server is port 5177: 5175 is Parking Precision and 5176 the Blackjack
  worktree.

## 30 Sep 2026 — first owner setup, and two measurement fixes

The owner's first Lab setup for the starter is saved as
`design/handling/setups/owner-starter-2026-09-30.json`. Measured with
`node tools/race-physics-probe.mjs --setup <file>`: 0–100 8.3 s, 195 km/h,
100–0 in 27 m, 1.10 g, very little drift (slide under power 0.10).

**Grip bias is the most sensitive slider in the car.** Isolated one field at
a time: grip bias +0.05 alone turns a car that only ever understeers into one
whose rear lets go at 26% steering at 80 km/h and spins (179°). +0.03 is the
highest value that stays stable with the rest of that setup. Stock front/rear
grip is already 1.00/0.97, so +0.05 makes it 1.05/0.92.

**Drift angle is now measured at the rear axle** (`RaceCar.slipAngleDeg`).
At the chassis centre, a car turning tightly with no slide at all reads
~20° of "slip" (pure geometry), which switched on slide-under-power,
counter-steer authority and the gear hold in every tight low-speed turn. The
rear axle does not steer, so it tracks its heading unless the car is really
sliding. Stock probe results barely moved (drift held 3.0 / 2.6 s, caught in
0.37 s).

**Probe fixes.** Lateral grip used the body's yaw rate, which a spinning car
inflates (it reported 1.81 g for a car that was spinning); it now uses the
turn rate of the velocity vector and only counts samples with the rear axle
under 6° of slip. The turning radius used the extent of the path, which
under-reads when the car does not finish the circle; it is now distance
travelled / heading turned (stock 4.63 m, was 4.64). With `--setup`, only the
safety rows (snap oversteer, stays upright, drift can be caught) can fail; a
player's setup may legitimately be quicker or less slidey than stock.

## 30 Sep 2026 — presets, looser gearing, sense of speed

Owner: "make it for racing; separate drift cars later; preset tunes (street,
race, drift…); sport tyres, 2 bottles and max brakes are upgrades; the gear
ratios have to be a lot looser; even on the loosest gear it feels like I'm
not going fast."

**Stock is now the Race preset** (from the owner's setup, grip bias +0.03)
with base parts. Parts are marked `upgrade: true` in `Tuning.FIELDS`
(power stage, compound, brakes, diff, nitrous); presets never touch them.
Gearing: starter final 4.1 → 3.55 and 1st 3.3 → 2.95 (1st to ~77 km/h,
4th ~198 at the shift point); coupe final 3.9 → 3.6. Slider ranges widened
(final 2.6–4.8, each gear ±25%).

**The drift test was unfair, twice.** A driver model that sets a STICK
position counter-steers harder on a car with more lock, so the 45° Drift
preset "could not hold a drift" while the forgiving Street one could. The
probe now aims a WHEEL ANGLE (RaceCar exposes `state.lockDeg`), and the
"hold" driver aims for a 30° drift (half the slip angle plus 1.2 × the error
from 30) instead of just counter-steering, which with any fixed gain either
killed every slide or spun. With that, every preset holds a drift for a
skilled driver, and the Drift preset is the one that holds it NEAR 30°.

**Drag preset:** shortest gearing and the latest shift are quickest. Shifting
at the limiter was slower (torque falls after 4,000 rpm); ×1.18 final and
+200 rpm beat ×1.06 at the limiter by 0.3 s over the quarter mile. The probe
fails if Drag is not the quickest preset over the quarter mile.

**Sense of speed was the camera, not the car.** At 200 km/h the car really
was doing 200; the copied rigs finish their speed FOV at 100 km/h and hold a
fixed boom, so 100 and 200 looked alike. `SpeedFeel.js` replaces the rigs'
speed FOV (keeps widening to 240), drops and closes the chase camera at
speed and lags it under acceleration; plus road rumble, edge blur, wind
streaks, wind audio and dense roadside detail (SPEC §2.1). The "no shake,
no blur" rule from Parking Precision is relaxed at the owner's request; all
three are switchable. First pass of the lamp light pools overlapped every
12.5 m and turned the road orange; opacity 0.16 → 0.07.

`AudioSystem.js` (copied) changed: tyre roar kept growing only to 40 km/h;
now to ~235, plus a wind voice. The Lab no longer clamps rpm to 6,000 for
the engine note.

## 30 Sep 2026 — real street light, a follow camera, and turning

Owner, on a screenshot of the Lab: "I don't want this kind of lighting. I
want well illuminated street lights. The sense of speed is still horrible.
Make it like slowroads.io camera. It has to follow. The turning radius of
the car is also really bad."

**Turning: the car plowed at full steer.** Keyboard steer is full lock, and
speed-faded lock at 40 km/h was still ~37°, far past what the front tyres
can use, so they slid: the car circled 18 m wide at 0.68 g instead of ~1 g
(60 km/h: 38.6 m). Fixes: (1) grip-limited lock — while gripping, lock is
capped at atan(wheelbase × grip × g / v²) × 1.3, the tightest circle the
tyres allow; the cap fades out from 4° to 12° of rear slip and on the
handbrake, or drift entries lose their lock; (2) grip raised to ~1.25 g
starter / ~1.38 g coupe (arcade racing, not road car); (3) keyboard steer
ramp at speed 0.9 s → 0.6 s. Full steer at 60 km/h now circles 23.8 m.
Drift preset slide sustain 0.45 → 0.5 to keep holding its drift at the
higher grip. `RaceCar.state.lockDeg` now reports the capped lock.

**Lighting: baked lamp map.** The additive discs were fake and looked it.
`LampLight.js` bakes every lamp head's light (inverse square × cosine) into
a 1 m/texel top-down map; `useLampLight()` patches Lambert/Standard
materials (onBeforeCompile, before `opaque_fragment`) to add it by world
x/z, with a height falloff and a facing term (up-facing surfaces get the
most). Shared Palette materials get patched once, so parked cars will be lit
by it too in the city. Paint lines switched from Basic to Lambert so they
are lit like the road. Sky dome and fog now sit inside the camera's 400 m
far plane (a 1,400 m dome was simply clipped).

**Camera: FollowCamera replaces ChaseCamera in the Lab.** The old boom
(6 m back, 2.4 m up, 14° down) never let the car move in the frame. The new
one follows the direction of travel through a spring and is sprung on its
offset from the car (a spring on world position would lag v × smoothTime:
6.6 m at 200 km/h). SpeedFeel's chase dolly/drop/lag are now zero; it only
widens the FOV and adds rumble. ChaseCamera.js is kept (still copied from
Parking Precision) but unused in the Lab.

**Open:** from the new low camera, the rear valance under the bumper shows
z-fighting stripes (copied bodywork, CarModel.js). Fix at the source like
Parking Precision's hub fix: nothing may end flush with a visible face.

## 30 Sep 2026 — the rear "thingy", a quicker camera, more speed cues

- **Rear skirt:** the lamp map lit DOWNWARD-facing surfaces at 35%, so the
  lofted underbody tuck under the rear bumper glowed like a skirt from the
  low follow camera. Facing term is now clamp(0.4 + 0.6 × n·up): tops full,
  sides 40%, undersides none.
- **Bumper stripes:** the bumper strips' outer face was flush with the body's
  tail (and nose) face and z-fought. Now 4 mm proud (`CarModel.js`, copied
  code: port this fix back to Parking Precision, whose chase camera sits too
  high to have shown it).
- **Camera "too slow":** yaw spring 0.32 → 0.14 s, offset spring 0.10 →
  0.06 s, velocity weight 0.55 → 0.45. Lower and closer (5.0 m back, lens
  ~1.6 m up; 5.5 m / ~1.4 m at 200 km/h). New surge: the boom lengthens up to
  1 m per g of forward acceleration (sprung 0.3 s), so a launch or nitrous
  makes the car leap away from the camera.
- **More cues:** base FOV 72°, +20° at speed; rumble 3.5 cm; edge blur 0.085
  → 0.11 plus a speed vignette (edges darken up to 35%); a line of trees
  4.5–9.5 m beyond each barrier every ~9 m, the nearest tall things to the
  lens, so they whip past fastest.
- Still true: the starter really does top out at ~198 km/h and reaches 160
  after ~22 s. If the owner still finds it slow, the remaining lever is the
  car itself (power), not the camera.

## 1 Oct 2026 — story models and the Model Lab

Owner: "design all the models you need for a storyline". Spec:
`design/SPEC-models.md`. New: `src/story/cast.js`, `Figure.js`, `poses.js`,
`StorySets.js`; `src/vehicle/StoryCars.js`; body tables `COUPE`,
`FASTBACK`, `GT`, `TOW` and the `BODIES` map in `bodies.js`;
`design/models/` (the Model Lab); `tools/models-shot.mjs`.

**Copied from Parking Precision:** `src/world/Garage.js` at `c04a175`
(the rooftop deck for scene "Juno"; the multi-storey for the prologue).

**Changes to copied code** (port the bug fixes back by hand):
- `CarModel.js`: `profileHalf` and `lidHalf` exported; body tables may set
  `mirrorZ`, `handleZ`, `shutZ` (two-door bodies) and `seatShift` / `deckZ`
  (the GT's cab sits 25 cm back); `roofPaint` and `staticMirrorGlass`
  options on `createSedanShell`. Interior: the console and its top were the
  same length (ends flush) and the rear bulkhead's top and ends met the door
  cards and floor flush on the hatchback; now 1 cm apart. *Bug fix: port
  back.*
- `Garage.js`: walls 0.5 → 0.6 m (racing tunnelling rule); lamp-post
  colliders 0.22 → 0.6 m; the parapet cap rails were flush at every corner
  (tops, bottoms and ends) and the 0.12 m lamp poles were flush with the
  rails' inner faces. Side rails are now 8 mm shallower, end rails 5 mm
  longer, poles 0.13 m. *Bug fix: port back.*
- `RaceCar.js` builds the shell from `BODIES[car.body]`; `cars.js` coupe
  `body: 'sedan'` → `'coupe'`. Physics unchanged:
  `race-physics-probe` re-run, every number identical, all inside target.

**The coupe is 4.20 m, not SPEC-game §6's 4.35 m.** The collider, axles and
arches are shared with the sedan (the sedan's "proportions, not length"
rule). The coupe's 12 cm lower roof puts the headliner across about the top
third of the cockpit view; the eye stays at 1.20 m, 7 cm under the
headliner.

**Two-door and long-hood bodies needed CarModel overrides.** CarModel put door
handles at z = −0.1 and +0.78 and mirrors at z = −0.5 for every body: a
two-door body grew a handle on its rear quarter, and the GT (cowl at −0.40)
got its mirrors on the hood.

**Seated drivers are sized, not guessed.** `seatDriver` poses the figure,
measures its head above the hip, and lowers the hip until the head clears the
roof by 4 cm (coupe, fastback, GT, sedan). The first pass put the hip at
roof peak z + 0.15, which sat the hatchback driver inside the seat back
(seat back at z = 0.70); the hip is now over the cushion at z = 0.55.

**A flush-face check finds z-fighting automatically.** `models-shot` tests
every plain box in a model for a face plane shared with another box, facing
the same way and overlapping. First run: 111 hits. Most were real: Parking
Precision's rooftop corners, its car interior, the police push bar's
crossbars and the garage's dado bands. The rest were false positives: boxes
with a rotation baked into the geometry (`beamGeometry`), and undersides
resting on the ground. Both are now skipped. Lofted surfaces are only judged
in the screenshots.

**Mannequin details that mattered in the screenshots:** the shoulder ball at
the joint stood 6 cm above the shoulder line like a pad (now smaller and
1.4 cm lower, and the shoulder ring is raised); a box for Voss's shirt read as
a white frame round the tie (now a V); `handsOnHips` needs the upper arm
twisted inward about 80° before the elbow bends, or the forearms point
outward.

## 1 Oct 2026 — moved into Sundown Club, test drive on the site

Owner: "put it up in the sundown club". The game now lives in
`~/sundown-club/apps/racing` (`@sundown/racing`), copied from
`~/street-racing-game` at `a5d626f` PLUS that repo's uncommitted work of
1 Oct (story models, Model Lab, scenes, `src/story/`, `StoryCars.js`,
`Rain.js`); all of it passed race-physics-probe, handling-shot and
models-shot before the move and again after. The old repo is left as is.

On the site: `/racing/` = `index.html` = the Handling Lab, retitled "Night
Drive · test drive, early build", with `createLeaveGuard` (Esc asks, Esc
again saves and goes to the hub; held keys are released when the card opens)
and `updateGame('racing', …)` (resume "Test drive", top speed, best 0–100)
plus `trackPlaytime('racing')`. The public build is that one page; the labs
and story previews are dev-only (`DESIGN=1` builds them). The hub's "Night
Drive" coming-soon slot (same accent #9aa6ff) became the playable tile and the
workshop teaser gained a "Test drive" button; picture
`apps/hub/media/nightdrive.jpg` from `tools/hub-still.mjs` (a real frame at
speed, panels hidden). `tools/site-check.mjs` checks the assembled site.

## 1 Oct 2026 — public test drive: no tuning (owner's call)

From the design audit (`docs/design/AUDIT.md`, item 4): the public `/racing/`
page is the Handling Lab, with 37 controls and engineering read-outs over the
road and no goal. Owner's decision at the audit sign-off: **no tuning in
public**. The public test drive becomes car and camera only; the Lab (sliders,
presets, telemetry, "Copy setup") stays on the dev server. Built in the design
overhaul's Night Drive UI step, on the branch `design/overhaul`.
