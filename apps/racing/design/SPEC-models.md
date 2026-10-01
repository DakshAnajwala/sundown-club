# SPEC — Story models

Status: **built for the whole storyline's cast and cars, and for the chapter 1
sets (1 Oct 2026). Waiting on the owner's look-over.** Owner's request, 1 Oct
2026: "design all the models you need for a storyline".

Open: `npm run dev`, then http://localhost:5177/design/models/index.html (the
Model Lab). Check: `node tools/models-shot.mjs` (§5).

This spec lists every model the story in `SPEC-game.md` §4 needs, chapter by
chapter, with the numbers they are built to. What is built is marked
**built**. Sets for chapters 2–4 and the finale are only listed: their scenes
are not written yet (SPEC-game §4.4: "Later chapters get their scenes written
when they're specced").

---

## 1. What the story needs, by chapter

| Chapter | People | Cars | Places and props |
|---|---|---|---|
| Prologue *The Valet* | You (valet), Tidewater driver ×2 | Jax's car (starter), 2 Tidewater cars, parked cars | Valet booth with key board and barrier, Jax's key, multi-storey |
| 1 *Low Tide* | Mara, You (street), Jax, Juno, Pike, Tidewater crew, crowd, officers | Mara's tow truck, Juno's coupe, Pike's hatch, Tidewater sedan and hatch, police cruisers | Mara's garage, rooftop car park, roadblock |
| 2 *Lanterns* | Kai, Lantern crew | Kai's drift coupe, Lantern coupe and hatch | Old Town streets, lantern strings *(later)* |
| 3 *Iron* | Brandt, Ironside crew, Lt. Hale | Brandt's fastback, Ironside fastback and pickup, Hale's unmarked car | Rail yard, drag strip *(later)* |
| 4 *Ridge* | Selene, Summit crew | Selene's hatch, Summit hatch and coupe | Hill road, lookout *(later)* |
| Finale *Harbour Street* | Voss, everyone | Voss's grand tourer, police at full heat | Multi-storey roof (rooftop, built) |

Built: all 14 cast members, the crowd, all 19 story cars, and every chapter 1
set. The multi-storey interior comes with the district builder (SPEC-game §8.2,
Parking Precision's `Garage.js` + `CityBuilder.js`).

## 2. People (`src/story/cast.js`, `Figure.js`, `poses.js`) — built

### 2.1 The figure

One faceless mannequin (SPEC-game §1 #6), built from code with no imported
assets, flat-shaded, Lambert only (no metal). Authored at 1.76 m and scaled
uniformly to each character's height. Proportions are standard fractions of
height:

| Landmark (at 1.76 m) | Height | | Segment | Length |
|---|---|---|---|---|
| Ankle joint | 0.08 m | | Thigh | 0.42 m |
| Knee | 0.49 m | | Shin | 0.41 m |
| Hip joint | 0.91 m | | Upper arm | 0.30 m |
| Shoulder joint | 1.44 m | | Forearm | 0.26 m |
| Head centre | 1.645 m | | Hand (mitten) | 0.18 m |
| Top of head | 1.76 m | | Foot | 0.27 m |

Build multipliers per character: `shoulders`, `hips`, `girth` (0.9–1.18).
Heads and hands are one matte mannequin tone (`#bdb5aa`) for everyone, so
characters are told apart by clothes, colour, hair and headwear, as the spec
asks. 16 joints (pelvis, spine, neck, head, shoulders, elbows, wrists, hips,
knees, ankles); sockets on both hands and the head for props.

Clothes are the body: a jacket is the torso in the jacket's colour, trousers
are the legs. Garments: tee, shirt, jacket, bomber, hoodie, suit (shirt V and
tie), uniform; long coat open at the front; valet waistcoat; hi-vis vest with
reflective bands; overalls with the sleeves tied round the waist; cargo
pockets; shoes, boots, trainers. Hair: short, bun, ponytail, long. Headwear:
cap, backwards cap, beanie, peaked police cap, hood up. Extras: gloves, scarf,
tie, badge, name badge, belt.

### 2.2 The cast

| Who | Height | Look | Car | Subtitle colour |
|---|---|---|---|---|
| You (valet, prologue) | 1.76 | white shirt, red waistcoat, name badge | starter (Jax's) | — |
| You (street, ch. 1 on) | 1.76 | charcoal jacket, red collar, jeans, white trainers | starter, then coupe | — |
| Mara | 1.68 | orange overalls, sleeves tied, charcoal tee, grey bun, gloves, boots | tow truck | `#f0a060` |
| Jax | 1.80 | mustard bomber, purple trim, backwards cap, light jeans | — | `#e6c85a` |
| Juno | 1.72 | teal bomber with white trim, ponytail, gloves | Juno's coupe | `#5fd0c8` |
| Pike | 1.82 | grey hoodie, teal beanie, cargo trousers, broad | Pike's hatch | `#8fd6cf` |
| Tidewater driver A | 1.78 | dark teal jacket, teal cap | Tidewater sedan | `#8fd6cf` |
| Tidewater driver B | 1.70 | teal hoodie, hood up | Tidewater hatch | `#8fd6cf` |
| Kai | 1.75 | burgundy long coat, amber scarf, long hair, slim | Kai's coupe | `#f0b860` |
| Brandt | 1.92 | rust work jacket, cargo trousers, bald, broadest build | Brandt's fastback | `#e08a6a` |
| Selene | 1.70 | ice-white jacket, slate scarf, long silver hair | Selene's hatch | `#c9d9ec` |
| Voss | 1.86 | charcoal suit, ivory shirt, dark tie, long black coat | Voss's GT | `#e6dfcf` |
| Lt. Hale | 1.78 | navy uniform, grey-blue long coat, peaked cap, badge | unmarked car | `#8fb4e6` |
| Officer | 1.80 | navy uniform, hi-vis vest, peaked cap, belt | police cruiser | `#8fb4e6` |

Crowd: `crowdOutfit(index, crew)` gives the Nth onlooker (1.64–1.90 m,
varied build, hair, headwear, top), deterministic from the index like parked
cars; crew members wear their crew's colours.

Crew colours: Tidewater teal `#3fa7a0`, Lantern amber `#e0a043` on burgundy,
Ironside rust `#a5573a`, Summit ice `#c9d6e3` on slate, Voss charcoal and
ivory, police navy `#23324a` and white.

### 2.3 Poses

`stand`, `relaxed`, `armsCrossed`, `handsInPockets`, `holdKey` (scene "Keys"),
`point`, `talk`, `handsOnHips`, `lean` (against a car), `kneel` (Mara at a
wheel), `seated` (driving), `armsUp` (race starter), plus `walkPose(phase)` for
any point in a stride. `setPose(pose, { blend })` eases between poses; a 4 s
breath moves the chest by a few millimetres. Angle conventions are at the top
of `poses.js`.

## 3. Cars (`src/vehicle/bodies.js`, `StoryCars.js`) — built

### 3.1 New body tables

All keep the shared 4.20 m chassis, axles and wheel arches (the sedan's rule:
proportions, not length). This replaces SPEC-game §6's 4.35 × 1.82 m for the
coupe: the collider and arches are shared, and the coupe reads as a coupe
from its roof and cab, not its length.

| Body | Roof | Belt | Cowl | Cues | Used by |
|---|---|---|---|---|---|
| `coupe` | 1.30 m (sedan 1.42) | 0.97 | −0.72 | peak aft, fastback glass into a short deck, one long door and a quarter window, wider haunches, lower nose | Tide coupe (player), Juno, Kai, Lantern, Summit |
| `fastback` | 1.33 | 1.00 | −0.72 | blunt tall nose, long flat hood, screen raked to +0.02, one sloping glass to a kicked ducktail, full-width tail lamps | Brandt, Ironside (chapter 3 car) |
| `gt` | 1.30 | 0.95 | −0.40 | longest hood in the game, small cab over the rear axle, seats 25 cm back | Voss |
| `tow` | pickup cab | — | — | flat deck, no bed walls | Mara's tow truck |

The coupe and fastback keep the sedan's cowl at z = −0.72 so the cockpit
works in them: the coupe is now the player's Tide coupe in the Handling Lab
(`cars.js` `body: 'coupe'`). In the coupe's cockpit view the lower roof shows:
the headliner fills about the top third of the screen. The GT's cowl is behind
the cockpit's dial cluster, so it cannot be driven from the cockpit; move its
cowl to −0.72 first if Voss's car is ever given to the player.

### 3.2 Story cars

| Id | Body | Paint / livery | Seated driver |
|---|---|---|---|
| `starter` | sedan | Parking Precision red | — |
| `coupe` | coupe | teal, white shoulder stripe, lip spoiler | you |
| `juno` | coupe | Tidewater teal, white stripe, lip | Juno |
| `pike` | hatchback | dark teal, teal stripes over hood/roof/deck, roof spoiler | Pike |
| `tidewaterSedan`, `tidewaterHatch` | sedan, hatch | teal tones, shoulder stripe | driver A, B |
| `kai`, `lanternCoupe`, `lanternHatch` | coupe ×2, hatch | burgundy/amber, stripe, rear wing on the coupes | Kai |
| `brandt`, `ironsideFastback`, `ironsidePickup` | fastback ×2, pickup | rust/charcoal, twin stripes, ducktail | Brandt |
| `selene`, `summitHatch`, `summitCoupe` | hatch ×2, coupe | ice white, slate roof and stripe, roof spoiler | Selene |
| `voss` | gt | charcoal, ivory pinstripe | Voss |
| `police` | sedan | navy, white roof, white door band with POLICE, light bar, push bar, antenna | officer |
| `unmarked` | sedan | dark grey, strobes in the grille and on the parcel shelf, pillar spotlight, antenna | Hale |
| `tow` | tow | Mara orange, MARA'S GARAGE on the doors, A-frame boom, hook, wheel-lift, toolboxes, amber beacon bar | Mara |

Liveries follow the bodywork (sampled from the same tables CarModel lofts)
and stand 5 mm proud of it. Light bars, strobes and beacons flash
(`setLights(true)`, `update(dt)`) on materials cloned per car. Story cars get
seats and a dash, so a car seen close up in a scene is not an empty shell.

Seated driver (`seatDriver`): hip over the seat cushion (z = 0.55 m, plus the
GT's 0.25 m), lowered until the head clears the roof by at least 4 cm. A plain
steering wheel is placed at the driver's hands.

## 4. Sets and props (`src/story/StorySets.js`) — chapter 1 built

| Set | Size | Contents | Scene |
|---|---|---|---|
| Car key | fob 58 × 32 × 14 mm | fob, blade, ring, valet tag no. 47 on a loop | "Keys" close-up |
| Valet booth | 1.8 × 1.5 m, 2.45 m walls | glazed 1.0–2.1 m on three sides, counter, door, lit VALET sign, key board with 24 hooks (no. 47 empty), stool, ceiling light; striped barrier arm 3.4 m (`setBarrier(0..1)`) | "Keys", prologue escape |
| Mara's garage | 10 × 8 m, 4.5 m to the roof | roll-up door 3.4 × 3.2 m (`setDoor(0..1)`), MARA'S sign, two-post lift, bench and pegboard, tool chest, tyre stack, drums, desk and lamp, shelving, three hanging work lamps | "Mara's", tuning screen backdrop |
| Rooftop | 36 × 28 m | Parking Precision's rooftop deck (parapets, lamp posts) plus bay lines | "Juno", finale ending |
| Roadblock | across a 16 m road | two striped A-frame barriers with flashers, a car-width gap for the police cars, a line of cones | heat 3 (SPEC-game §9.2) |

Each set returns `colliders` (boxes, all at least 0.6 m thick) and `lights`
(where a scene should put real lights; the sets only carry glowing fittings,
so each scene chooses how many real lights it can afford).

Not built yet: rain on the garage door (an effect for the scene player), the
multi-storey interior (comes with the district builder), sets for chapters 2–4
and the finale.

## 5. Checks (`node tools/models-shot.mjs`)

Boots the Model Lab on the GPU, runs `__models.checks()`, writes
`tools/shots/models/checks.json`, takes 32 screenshots, and exits 1 on any
failure or console error.

| Check | Rule | Measured 1 Oct 2026 |
|---|---|---|
| Height | top of the bare head = cast height ± 1 cm | every character +4 to +5 mm |
| Figure budget | ≤ 4,000 triangles, ≤ 70 meshes | 1,634–2,198 triangles, 28–38 meshes |
| Driver fits | head clears the roof ≥ 3.5 cm; hip ≥ 12 cm above the floor; head ≥ 15 cm above the belt (shows in the glass) | clearance 4.0–18.1 cm, hip 17–32 cm, head 28–42 cm over the belt |
| Car budget | ≤ sedan + 9,000 triangles (driver and cabin included) | 4,532–5,708 |
| Nothing flush | no two plain boxes in a model share a face plane facing the same way and overlapping (z-fighting); faces resting on the ground excluded | 0 |
| Colliders | every set collider ≥ 0.6 m thick | 0 thinner |
| No metal | no material with metalness > 0 | 0 |
| Console | 0 errors | 0 |

Lofted surfaces (bodywork, liveries, figures) are judged in the screenshots;
the flush check only reads axis-aligned boxes.

## 6. Waiting on the owner

- Look over the cast and cars in the Model Lab. Each character is meant to be
  recognisable from across a car park by colour and silhouette alone. Say who
  looks wrong.
- The coupe body: SPEC-game §6 asked for 4.35 m; it is 4.20 m (shared
  chassis). The low roof in the cockpit view is on purpose; say if it's too
  much.
- Which cars should the player be able to win later (SPEC-game §6 lists the
  hatch and the fastback)?
