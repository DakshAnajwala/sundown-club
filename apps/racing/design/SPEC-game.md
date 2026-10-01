# SPEC — Street racing game (working title)

Status: **design, v0.2 (30 Sep 2026)**. Signed off by the owner on 30 Sep 2026
(story, cars, events and the §1 defaults as written). The Handling Lab
(`design/handling/`) and the race car model are built; the numbers in §6 are
now measured (§6.1). Next: the owner drives the Lab, then `GOAL-slice.md`
(build order and checks) is written.

This is a new game by the author of Parking Precision
(`github.com/DakshAnajwala/CarParkingGame-MAIN`). It reuses that game's car
models, cockpit, driver rig, renderer, audio synthesis and art direction. The
code is **copied** into this repo, not imported, at the owner's choice (§12).

---

## 1. Decisions from the owner interview (30 Sep 2026)

| # | Topic | Decision |
|---|---|---|
| 1 | Home | New, separate private repo `DakshAnajwala/StreetRacingGame`, local `~/street-racing-game`. Code copied from Parking Precision, not shared. |
| 2 | Story shape | Underground career: start with a slow car in one city, race named rivals and crews, climb to a final boss race. |
| 3 | Events | Sprint, circuit, drag, drift, time trial, police chases. |
| 4 | Camera | Chase camera by default; the first-person cockpit (wheel, hands, mirrors) is one key away. |
| 5 | Setting | One fictional city at night: wet streets, sodium lights, neon. Parking Precision's slowroads-style soft, flat-shaded look. |
| 6 | Storytelling | Short in-engine scenes between races, dialogue as subtitles. Faceless stylised characters. No voice acting. |
| 7 | Garage | Few cars, deep tuning (gearing, grip, suspension and more; §7). |
| 8 | Controls | Keyboard and gamepad (browser Gamepad API). |
| 9 | Plot | Claude drafts it (§4); the owner edits before anything is built. |
| 10 | First goal | Vertical slice (§3): one district, 2 cars, chapter 1, story scenes, save game. |
| 11 | Title | Decide later. Working title in this file. |

Defaults taken where the interview did not reach (change any of them in §16):

- Laptop/desktop browser only, no touch layout (same as Parking Precision).
- Single player. No leaderboard or server in the slice.
- Light ambient traffic on sprint routes only (§8.4). Street racing without any
  traffic feels empty; traffic on circuits breaks lap times.
- No real car brands, badges or model names (same rule as Parking Precision).
- Procedural geometry and Web Audio synthesis first. CC0 assets only where a
  procedural version would look clearly worse, credited in the notices.
- Licence: all rights reserved, like Parking Precision.

## 2. What it must feel like

- Night-time, quiet and moody between races; fast and loud during them.
- Speed you can feel at 150+ km/h (owner, 30 Sep: "I need a good sense of
  speed"). Built in the Handling Lab, each cue switchable there (§2.1).
  Parking Precision's "no camera shake, no blur" rule is relaxed at the
  owner's request: a small road rumble and edge-only blur, both scaled by
  speed and both switchable in settings. The camera still never inherits
  chassis roll or suspension bob.
- Handling: arcade-leaning but readable. Grip is predictable; drifting is a
  choice (handbrake or a drift setup), not an accident.
- Story scenes are short (30–60 s), skippable, and never block a retry.

### 2.1 Speed cues (`src/camera/SpeedFeel.js`, `src/render/`)

| Cue | Numbers |
|---|---|
| Follow camera (default view, `FollowCamera.js`) | slowroads.io style (owner, 30 Sep): lens ~1.8 m off the ground, 5.6 m back (6.4 m at 200 km/h), aimed just over the roof; heading springs toward the direction of TRAVEL (55% velocity, 45% nose, 0.32 s) so the car rotates in frame before the camera swings round and shows its side in a slide; sprung on its offset from the car, so no lag at speed; banks up to 3.4° into turns; looks 3 m ahead, 9 m at 200 km/h |
| FOV | base 70°; + up to 16° (follow) / 16° (cockpit) from 40 to 240 km/h, smoothstep; + 6° per g of forward acceleration; + 5° with nitrous |
| Road rumble | smooth multi-sine wobble, grows with speed², up to 2 cm (follow) / 6 mm (cockpit) at 240 km/h; switchable |
| Edge blur | radial blur toward the vanishing point, only outside the centre of the frame, 8 taps, strength ∝ speed²; switchable |
| Wind streaks | 140 faint additive lines around the camera path, 0.06 s long, fade in from ~110 km/h; switchable |
| Audio | tyre roar keeps rising to ~235 km/h (Parking Precision's stopped at 40); wind noise ∝ speed², rising pitch |
| Street lighting (`LampLight.js`) | real lamp light, no fake discs (owner, 30 Sep): light from every lamp head baked once per level into a top-down map (E = h³/(d²+h²)^1.5, summed), sampled by every lit material incl. the car, so the road is evenly lit and the car brightens under each lamp. Road lamps 8 m high every 25 m per side, staggered, arm 2.2 m over the road; open areas 12 m lamps on a 35 m grid; small glow sprite on each head. Low ambient, night sky with warm city glow at the horizon |
| World | close repeating detail on every road: lane dashes 3 m every 9 m, cat's eyes, barrier joints every 4 m, reflector posts every 8 m, street lamps every 25 m, asphalt grain texture, buildings at 45–115 m for mid-distance parallax |

What it must not look like: chrome-and-flames tuner-magazine UI, glossy bevelled
logos, dubstep-poster neon overload, realistic photo textures next to flat
shading.

## 3. The vertical slice (v1)

| Item | Slice scope |
|---|---|
| World | One district: **Harbour** (§8), about 900 × 700 m. |
| Cars | 2: the starter saloon and one rival coupe you win (§6). |
| Story | Prologue + chapter 1 (§4.3), 3 story scenes. |
| Events | 8 (§5.6): 2 sprints, 1 circuit, 1 drag, 1 drift, 1 time trial, 1 police chase, 1 boss race. |
| AI | Racing opponents (§9.1), police (§9.2), ambient traffic (§9.3). |
| Garage | Tuning screen with every slider in §7, paint, rims, save/load setups. |
| Save | One local save slot (localStorage), versioned. |
| Menus | Title, map/event list, garage, settings (graphics, audio, controls, rebinding, gamepad). |

Out of the slice: other districts, cars 3–4, free roam between events, multiple
save slots, leaderboards, photo mode.

## 4. Story (draft — owner to edit)

### 4.1 Premise

**Port Calder**, a harbour city, after midnight. You work nights as a valet at
the **Harbour Street multi-storey** (the player's parking skill from Parking
Precision is a real skill here). One night a racer called Jax leaves his car
with you and doesn't come back for it; the next night the crew he owed money to
comes looking for it. You drive it out of the car park instead of handing it
over. By morning you're in the scene whether you like it or not.

The city's street racing is run by **Voss**, who owns half the waterfront and,
it turns out, the multi-storey you work in. Four crews each hold a district.
Beat each crew's leader to take the district; take all four and Voss has to
race you.

### 4.2 Cast

All faceless mannequins (matte, no features) in distinct clothing and colours,
recognised by their car and their colour.

| Name | Role | Car / colour | Voice in text |
|---|---|---|---|
| You | Silent. Never speaks on screen. | Starter saloon, red (the Parking Precision car) | — |
| **Mara** | Runs a small garage in Harbour. Mentor, tuning tutorial. Used to race for Voss. | Tow truck, orange | Dry, short sentences. |
| **Jax** | The racer whose car you "borrowed". Comic relief, unreliable. | — (his car is your starter) | Talks too much. |
| **Juno** | Leader of the **Tidewater** crew, Harbour district. Chapter 1 boss. | Rival coupe, teal | Confident, fair. |
| **Kai** | Leader of **Lantern**, Old Town. Drift crew. | — | Calm, philosophical. |
| **Brandt** | Leader of **Ironside**, the rail yards. Drag crew. | — | Blunt. |
| **Selene** | Leader of **Summit**, Calder Ridge. Hill runs. | — | Quiet, precise. |
| **Voss** | Runs the scene. Final boss. | — | Polite, cold. |
| **Lt. Hale** | Police. Wants Voss, settles for you. | Police cruiser | Official, tired. |

### 4.3 Chapter outline

| Chapter | District | Events | Story beat |
|---|---|---|---|
| Prologue: *The Valet* | Harbour Street multi-storey | Drive tutorial, a short park (bay), escape sprint out of the car park | You take Jax's car instead of handing it to Tidewater. |
| 1: *Low Tide* | Harbour | 8 events (§5.6) | Mara takes you in. Tidewater tests you; Juno respects a clean win. First police chase: Hale notices you. Beat Juno for her coupe. |
| 2: *Lanterns* | Old Town | drift, narrow sprints | Kai says Voss owns your car park. Mara's past with Voss comes out. |
| 3: *Iron* | Rail yards | drag, industrial circuits | Brandt races for Voss; winning makes you a target. Hale offers a deal. |
| 4: *Ridge* | Calder Ridge | hill sprints, time trials | Selene helps you if you beat her clean. |
| Finale: *Harbour Street* | Whole city | one long sprint under full police heat, ending on the multi-storey's roof | Race Voss. Choice of how it ends (§4.4). |

### 4.4 Chapter 1 scenes (slice)

1. **"Keys"** (prologue end, ~40 s). Night, valet booth. Tidewater's two cars
   pull up; one driver asks for Jax's car. Camera on you holding the key. Cut to
   the escape sprint.
2. **"Mara's"** (start of chapter 1, ~60 s). Mara's garage, rain on the door.
   She looks the car over: "Jax's car. Jax's debts. You've got both now." She
   offers garage space in return for a cut of winnings. Unlocks the tuning
   screen.
3. **"Juno"** (before the boss race, ~45 s). Rooftop car park, Tidewater's
   cars lined up. Juno: "You drive like someone who's parked a thousand cars.
   Let's see if you can do the other thing."

Later chapters get their scenes written when they're specced.

### 4.5 Endings (for later)

One choice in the finale: give Hale the evidence on Voss (clean ending, the
scene shuts down) or race Voss for the city (you run the scene). Both endings
unlock free roam. Not in the slice.

## 5. Events

### 5.1 Common rules

- Countdown 3-2-1, 0.8 s per beat. A jump start costs 1 s (sprint/circuit) or
  disqualifies (drag).
- A **checkpoint** is a gate you must pass through (7 m wide on normal streets).
  Missing one shows "Missed checkpoint" and an arrow back; there is no reset to
  the last checkpoint except the manual "reset car" key (§10), which costs 3 s.
- Results: position, time, best lap, cash won. A retry key works at once, like
  Parking Precision's retry (no confirm dialog, no forced cutscene).

### 5.2 Sprint

Point to point, 2–4 km, 3 AI opponents. Light traffic (§9.3). Finish order
decides cash.

### 5.3 Circuit

Closed loop 1.4–2.2 km, 3 laps, 3 AI, no traffic. Laps are timed; best lap is
saved per event.

### 5.4 Drag

One opponent, 402 m (quarter mile), straight, no traffic. Automatic or manual
gearbox. Manual gets a shift light and a "perfect shift" window worth +3% force
for 0.5 s (inside ±150 rpm of the car's shift point). Launch: hold throttle
in the rev band at "1"; release timing on green. Wheelspin on a bad launch.

### 5.5 Drift and time trial

- **Drift:** a marked zone. Points per second = speed (km/h) × drift angle
  factor (angle 15°–50° scales 0→1) × combo multiplier (+0.1 per 2 s held, max
  ×3). Contact with a wall ends the combo. Target score for gold/silver/bronze.
- **Time trial:** solo run of a route, gold/silver/bronze times, a ghost of
  your best (same approach as Parking Precision's `Ghost.js`).

### 5.6 Chapter 1 events (slice)

| # | Event | Type | Length | Target / rival | Reward |
|---|---|---|---|---|---|
| P1 | Out of the car park | Escape sprint (story, no AI) | 1.2 km | Beat 90 s | Unlocks chapter 1 |
| 1 | Container Run | Sprint | 2.4 km | 3 Tidewater AI | $1,500 / 800 / 400 |
| 2 | Ferry Loop | Circuit, 3 laps | 1.6 km | 3 AI | $2,000 / 1,000 / 500 |
| 3 | Pier Quarter | Drag | 402 m | Tidewater "Pike" | $1,200 |
| 4 | Warehouse Row | Drift | zone 0.8 km | 25k / 18k / 12k points | $1,000 / 600 / 300 |
| 5 | Crane Line | Time trial | 3.1 km | gold / silver / bronze times | $800 / 500 / 300 |
| 6 | Blue Lights | Police chase | escape | lose heat (§9.2) | $1,500 + scene |
| 7 | Low Tide | Boss sprint | 3.8 km | Juno | Juno's coupe + $3,000 |

Unlock order: P1 → 1 → {2, 3, 4, 5} in any order → 6 → 7.

## 6. Cars

Two in the slice, four at launch. All lofted bodies (`BodyLoft.js` +
`bodies.js` style tables), no brand, no badge.

| Car | Body | Drive | Mass | Power | 0–100 km/h | Top | Where |
|---|---|---|---|---|---|---|---|
| **Starter saloon** | Parking Precision's sedan (4.20 × 1.78 m, red) | RWD | 1,150 kg | 110 kW | ~8.5 s | 195 km/h | Prologue |
| **Tide coupe** | New coupe body: lower roof (1.30 m), 4.20 m on the shared chassis (was 4.35 × 1.82 m; see SPEC-models §3.1) | RWD | 1,250 kg | 190 kW | ~5.5 s | 245 km/h | Beat Juno |
| Hatch (later) | Parking Precision hatchback | FWD | 1,050 kg | 120 kW | ~7.5 s | 200 km/h | Chapter 2 |
| Muscle (later) | New fastback | RWD | 1,500 kg | 300 kW | ~4.8 s | 270 km/h | Chapter 3 |

Numbers in the table are the targets. What the cars actually do is in §6.1.

### 6.1 Measured (tools/race-physics-probe.mjs, 30 Sep 2026)

| | Starter saloon | Tide coupe | Band the probe enforces |
|---|---|---|---|
| Peak power (from the torque curve) | 110 kW @ 6,000 rpm | 191 kW @ 6,750 rpm | — |
| 0–100 km/h | 8.62 s | 5.23 s | 7.6–9.4 / 4.9–6.1 |
| Top speed (drag-limited, no cut-off) | 198.0 km/h | 256.1 km/h | 180–210 / 230–260 |
| Quarter mile | 16.48 s @ 142 km/h | 13.50 s @ 171 km/h | — |
| 100–0 km/h | 35.2 m | 33.5 m | 34–44 / 32–42 |
| Lateral grip at 80 km/h | 1.24 g | 1.38 g | 1.1–1.4 / 1.2–1.5 |
| Full keyboard steer held at 60 km/h: circle radius | 23.8 m | 21.7 m | 18–28 / 16–26 |
| Rear lets go at 80 km/h | never (understeers) | never | never below 60% steer |
| Turning radius (full lock, walking pace) | 3.30 m | 3.36 m | — |
| Handbrake turn, max slip | 52° | 57° | 20–90° |
| Drift caught (wheels along the slide) | 0.42 s | 0.40 s | ≤ 2 s |

Stock = the Race preset (§7.1) with base parts, and the looser gearing from
30 Sep (starter 1st to ~77 km/h, 4th to ~198 at the 6,500 rpm shift point).
Per-preset numbers: `node tools/race-physics-probe.mjs`.
| Full lock at 60 km/h | stays upright | stays upright | — |

Two handling rules were added to make drifting controllable, both measured
(details in `NOTES.md`): throttle bleeds rear grip once the car is already
sliding ("slide under power", tunable), and counter-steer may turn the front
wheels as far as the slip angle even when speed has faded the normal lock.
Without the first a road car could never slide on the throttle; without the
second every slide past ~20° became a spin.

The player car keeps the full Parking Precision cabin: steering wheel, hands,
mirrors, dials. The dials get a new face scaled to 260 km/h and 8,000 rpm.

## 7. Tuning (deep)

Every slider shows the unit, the current value, and a one-line effect ("more
front grip: turns in harder, can snap oversteer"). Changes apply on the next
event. Up to 3 saved setups per car.

| Group | Setting | Range |
|---|---|---|
| Engine | Power level (**upgrade**) | stage 0–3, +8% power per stage |
| Gearbox | Final drive | 2.6–4.8 |
| Gearbox | Gear ratios 1–6 | each ±25% of stock |
| Gearbox | Shift mode | auto / manual (paddle keys) |
| Tyres | Compound (**upgrade**) | street / sport / drift (grip ×1.00 / ×1.12 / ×0.85 rear) |
| Tyres | Front / rear grip bias | −10% to +10% |
| Tyres | Slide under power | 0–0.6 (stock 0.22 starter, 0.2 coupe) |
| Suspension | Stiffness front / rear | 35–90 (cannon suspensionStiffness) |
| Suspension | Damping | soft / medium / hard (preset relaxation/compression pairs) |
| Suspension | Ride height | −4 cm to +2 cm |
| Suspension | Anti-roll (rollInfluence) | 0.01–0.12 |
| Brakes | Brake force (**upgrade**) | 80–130% |
| Brakes | Brake bias | 40–70% front |
| Diff | Type (**upgrade**) | open / limited-slip (split drive force by wheel load) |
| Nitrous | Bottle (**upgrade**) | none / 1 / 2 (5 s at +25% force each) |
| Steering | Max lock | 30°–45° |
| Steering | Speed sensitivity | how fast lock fades with speed |

Upgrades cost cash; tuning settings are free once a part is owned. Base
parts: street tyres, 1 nitrous bottle, 100% brakes, open diff, stage 0.

### 7.1 Preset tunes (owner, 30 Sep 2026)

One tap sets every FREE tuning field; parts stay as owned. Defined in
`Tuning.js` (`PRESETS`), checked on every car by the probe.

| Preset | For | Key settings | Probe must show |
|---|---|---|---|
| **Race** (stock) | grip racing | grip bias +0.03, slide 0.10, springs 44/60 hard, −4 cm, roll 0.01, lock 45° fading by 195 km/h | never slides at the limit |
| Street | forgiving | bias −0.02, springs even, medium, lock stock | safe |
| Drift | drifting | final ×1.12, slide 0.45, springs 48/72, lock 45° fading by 220 | holds 25–45° for ≥ 2.5 s of 4 |
| Drag | straight line | final ×1.18, shift +200 rpm, soft rear, bias −0.05, calm steering | quickest ¼ mile of the four |

All presets: rear never lets go below 60% steer at 80 km/h, stays upright,
a slide can be caught within 2 s. Dedicated drift cars come later (owner).

## 8. The world

### 8.1 Look

- Parking Precision's palette logic (`Palette.js`: every colour named, shared
  materials never mutated) with a new **night** palette: deep blue-grey sky,
  sodium orange street lights, cool white shop lights, teal and magenta neon
  accents used sparingly.
- Wet road: a darker road material plus fake reflections (stretched, blurred
  emissive quads under each light). No screen-space reflections in the slice.
- Distance fog in blue-grey; hides the edge of the loaded area.

### 8.2 Harbour district layout (slice)

About 900 × 700 m. Built by a layout model with checks, like Parking
Precision's `design/level13/layout-model.mjs`:

- A waterfront **boulevard** (4 lanes, 16 m) along the south edge.
- A **container yard** grid (8 m lanes between stacks) for the sprint and drift.
- An elevated **ring road** section (2 lanes each way) for the circuit.
- A straight **pier road** (≥ 600 m: 402 m strip + run-off) for the drag.
- **Harbour Street multi-storey** (reuses Parking Precision's multi-storey
  builder) and Mara's garage as story locations.
- ~60 buildings as simple extruded blocks with lit windows (instanced).

Layout checks (§14): every route's lane width, curve radius ≥ what the car can
take at the posted target speed, checkpoint gates on the road, no building
inside a route corridor, drag strip straight within 0.5 m.

### 8.3 Loading

The slice district loads in one go (no streaming). Target: under 3 s to first
frame on an M1-class laptop. Static geometry merged per 64 m chunk (the float32
lesson from Parking Precision's City Drive: bake geometry relative to chunk
origins, never in world coordinates past ~100 m).

### 8.4 Traffic

Up to 24 ambient cars on sprint routes only, kinematic (moved along lane
splines, no physics solving), with one static-box collider each so you can
hit them. Hitting one at speed costs time, not a crash animation.

## 9. AI

### 9.1 Racing opponents

- **Racing line:** each route has an authored centre line plus a racing line
  offset (computed once from curvature: outside-inside-outside). Stored in the
  layout data.
- **Driving:** pure pursuit toward a point ahead on the racing line (the same
  approach as Parking Precision's `tools/autodrive.mjs`, measured from the rear
  axle), speed from a target-speed profile (lateral grip limit per corner).
- **Physics:** the same `RaceCar` model as the player (no cheating physics).
- **Difficulty:** a skill value per rival (0.85–1.0 of the target-speed
  profile) plus mild catch-up: max ±4% speed based on the gap to the player.
  Juno has no catch-up help in the boss race.
- **Avoidance:** look-ahead raycasts; move off the line to pass or avoid a car.

### 9.2 Police

- **Heat** 0–3. Heat starts when a patrol sees you speeding past (> 60 km/h
  over the limit within 40 m and line of sight) or at the start of a chase event.
- Heat 1: one car follows. Heat 2: two cars, try to box you in. Heat 3: plus
  one roadblock placed ahead on your route.
- **Busted:** your speed stays under 10 km/h for 3 s with a police car within
  8 m. The event fails; in the slice there are no fines.
- **Escape:** no police car has seen you for 20 s (heat 1), 30 s (heat 2),
  40 s (heat 3). "Seen" = in a 70° cone within 90 m with a clear raycast.
- Police cars use the racing AI with a pursuit target (your predicted position
  0.6 s ahead) instead of a racing line.

### 9.3 Ambient traffic

Lane splines, obeys speed 40–60 km/h, stops at red lights (reuse City Drive's
traffic-light logic), brakes for a car ahead. Never changes lane in the slice.

## 10. Controls

| Action | Keyboard | Gamepad (standard mapping) |
|---|---|---|
| Throttle | W / ↑ | Right trigger (analog) |
| Brake / reverse | S / ↓ | Left trigger (analog) |
| Steer | A D / ← → | Left stick X (analog, 8% dead zone) |
| Handbrake | Space | A (button 0) |
| Nitrous | Shift | B (button 1) |
| Shift up / down (manual) | E / Q | RB / LB |
| Camera: chase / cockpit / bumper | C | Y (button 3) |
| Look back | hold RMB or X | Right stick click / X (button 2) |
| Reset car | R (hold 0.5 s) | Back/View (button 8), hold |
| Pause | Esc | Start/Menu (button 9) |
| Retry event | B | from pause menu |

- Keyboard steering keeps Parking Precision's ramped steering (lock in 0.45 s at
  standstill), with a speed-scaled rate (slower ramp at speed) so a key tap at
  200 km/h is not a full-lock swerve.
- Every key is rebindable, stored as data, like Parking Precision's `Input.js`
  (Escape always opens the menu).
- The first gamepad that sends input is used. A "Gamepad" settings page shows
  live axis values and lets the player set dead zone and trigger curves.

## 11. UI

- Small, calm, mono numerals (IBM Plex Mono, self-hosted). No yellow money
  shouting, no exclamation marks.
- In race: position (2/4), lap (2/3), time, speed and gear (bottom right),
  mini-map (bottom left, route line and rival dots), nitrous bar. Heat meter
  only in a chase.
- Map screen: Harbour drawn from the layout data, event pins with state
  (locked, open, won with medal).
- Garage: car on a turntable under a single work light, tuning panel docked on
  the right.
- Story scenes: letterbox bars (8% top and bottom), subtitle with speaker name
  in their colour, "Hold Enter to skip".

## 12. Architecture

Same style as Parking Precision: factories (`createX(deps) -> api`), one
orchestrator, ONE `THREE.Scene` and ONE camera for the whole process (render
passes capture them), fixed-step physics.

### 12.1 Copied from Parking Precision (`CarParkingGame-MAIN` at `c04a175`)

| Module | Use | Changes |
|---|---|---|
| `vehicle/BodyLoft.js`, `bodies.js`, `CarModel.js` | Bodywork | Add coupe and fastback tables. |
| `vehicle/Cockpit.js`, `SteeringWheel.js`, `RimCurve.js`, `HandModel.js`, `HandRig.js`, `HandRigChecks.js`, `Driver.js` | Cockpit view | Wheel travel set per car (racing wheels ~540°, not 720°); hand domains re-run in the wheel lab if travel changes. |
| `vehicle/Mirrors.js` | Mirrors in cockpit view | As is. |
| `vehicle/Dimensions.js` | Car numbers | Split into per-car dimension sets. |
| `camera/DriverCamera.js`, `ChaseCamera.js` | Cameras | Chase tuned for speed: boom 5.5 m → 6.5 m with speed, spring yaw. |
| `render/Renderer.js` | Renderer, composer, AO | New night lighting rig; bloom pass for lights and neon. |
| `physics/PhysicsWorld.js` | cannon-es world | As is (120 Hz, finite Box floors, never `CANNON.Plane`). |
| `audio/AudioSystem.js` | Engine synth, SFX | Higher rev range, turbo/nitrous hiss, tyre squeal from slip, wind by speed. |
| `input/Input.js` | Keyboard, rebinding | Add gamepad source and analog axes. |
| `ui/DashCluster.js` | In-car dials | New scale. |
| `world/Palette.js`, `Props.js` | Colours, cones, markings | Night palette. |
| `world/CityBuilder.js` | Multi-storey + streets | Starting point for the district builder. |
| `game/Ghost.js` | Time-trial ghost | Longer runs (raise size caps). |
| `core/Events.js` | Emitter | As is. |

Not copied: parking levels, park check and scoring, parking review, tutorial,
retention, leaderboard client and API, homepage.

Record the source commit in `NOTES.md` when copying, so a later bug fix in
either game can be ported by hand.

### 12.2 New modules

```
src/vehicle/RaceCar.js       racing vehicle model (gearbox that drives force, torque curve, drift, nitrous, tuning)
src/vehicle/Tuning.js        setup data, validation, apply to RaceCar
src/race/Race.js             countdown, checkpoints, laps, positions, results
src/race/events/*.js         sprint, circuit, drag, drift, timeTrial, chase
src/ai/RacerAI.js            racing line pursuit + speed profile + avoidance
src/ai/PoliceAI.js           heat, pursuit, busted/escape
src/ai/Traffic.js            kinematic lane traffic
src/world/DistrictBuilder.js district layout -> geometry + colliders
src/story/Story.js           chapter state, unlocks
src/story/Scene.js           in-engine scene player (camera path, actors, subtitles)
src/save/Save.js             versioned localStorage save
src/input/Gamepad.js         Gamepad API polling -> Input axes
src/ui/*                     HUD, map, garage, menus
design/district/             layout model + checks (like level13/)
```

### 12.3 The race car is NOT Parking Precision's `Car.js`

`Car.js` is tuned for 5 km/h precision: gear never affects force, a 100 km/h
cap, brake 42, no creep, P-as-a-pawl. `RaceCar.js` is a new model on the same
cannon-es `RaycastVehicle`:

- Torque curve per car (idle → peak → redline) × gear ratio × final drive ÷
  wheel radius = wheel force. Gear matters.
- Aerodynamic drag (0.5·ρ·CdA·v²) and rolling resistance, so top speed comes
  from the physics, not a hard cut.
- Grip: `frictionSlip` per axle from tyre compound and bias; handbrake drops
  rear grip to 35%.
- Keeps the measured conventions: forward is local −Z, positive engine force
  drives forward, positive cannon steering turns left (negate once).
- Keeps the fixes that were bugs: brake-hold below 0.3 m/s (the
  `isInContact` flaw), wheel mesh transforms converted to chassis-local.

Tunneling: at 250 km/h (69 m/s) a 120 Hz step moves 0.58 m. Every collider
must be ≥ 0.6 m thick, or thin walls get a thick invisible backing box.

## 13. Save

`localStorage` key `street:save:v1`: chapter, events won (+ medal, best time,
best lap), cash, cars owned, parts owned, setups, settings, story scenes seen.
Validated field by field on load (like Parking Precision's `settings.js`); a
corrupt save falls back to a fresh one and keeps a copy under
`street:save:v1:corrupt`. No server, so the privacy policy stays "nothing leaves
your device".

## 14. Verification

No test framework; probes drive the real game with puppeteer-core, like
Parking Precision.

| Probe | Proves |
|---|---|
| `tools/race-physics-probe.mjs` | Headless cannon: 0–100 and top speed per car within ±10% of §6, braking 100–0 distance, turn radius, no flip at full lock at 60 km/h. |
| `tools/district-lint.mjs` | §8.2 layout checks. |
| `tools/ai-race.mjs` | AI finishes every race route 10 times in a row with no wall contact over 20 km/h; lap spread between skill 0.85 and 1.0 is 5–12%. |
| `tools/event-probe.mjs` | Every event: start, checkpoints, finish, results, retry, fail cases (busted, missed checkpoint). |
| `tools/story-probe.mjs` | Unlock order, scenes play and skip, save/load round trip. |
| `tools/gamepad-probe.mjs` | Mocked `navigator.getGamepads()`: analog steer/throttle reach the car, dead zone, rebinding. |
| `tools/perf-probe.mjs` | Frame time and draw calls on the GPU harness in the busiest spot of the district. |
| `tools/models-shot.mjs` | Story models (SPEC-models §5): cast heights, seated drivers fit every car, no flush faces, colliders ≥ 0.6 m, triangle budgets. Built. |

## 15. Acceptance criteria (slice)

1. From a fresh save, prologue → chapter 1 → Juno's coupe is playable start to
   finish with keyboard only, and again with a gamepad only.
2. Every event in §5.6 can be won and can be lost, and retry works at once.
3. All probes in §14 pass; 0 console errors across a full playthrough.
4. 60 fps at 1440×900 on an M1 laptop in the busiest part of Harbour, with
   3 AI and 24 traffic cars (perf-probe).
5. Save survives reload; a corrupt save does not crash the game.
6. No real brand names or logos anywhere.

## 16. Waiting on the owner

Signed off on 30 Sep 2026: story, cars, events and the §1 defaults.

- **Drive the Handling Lab** (`npm run dev`, then
  http://localhost:5177/design/handling/index.html), keyboard and gamepad, both
  cars. Say what feels wrong: too grippy, too slidey, too slow, steering too
  quick at speed. Tune with the sliders and press "Copy setup" to send one.
- **Title** ideas, for later: *Harbour Street*, *Low Tide*, *Calder Nights*,
  *Valet*.
- **Look over the story models** in the Model Lab
  (http://localhost:5177/design/models/index.html; SPEC-models §6).
- After the Lab: `GOAL-slice.md` (build order), then the Harbour layout model.
