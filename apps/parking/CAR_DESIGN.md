# Car design — why the car is the shape and size it is

Read this before changing the car's dimensions or surfacing. The numbers are
not aesthetic choices that happen to live in code; most of them are holding up
something else.

## Brief

A contemporary compact sedan in the Civic idiom, rendered slowroads-style:
low-poly, flat-shaded, matte pastel, no textures. **No badge, marque or model
name, and not a replica.** The geometry is generic surfacing in that style —
the same position `NOTES.md` records for the whole project (procedural
geometry only; no imported, ripped or informally licensed models).

## The length is 4.20 m, not 4.69 m — on purpose

A real Civic sedan is ~4.69 m long. This car is **4.20 × 1.78 m**, and that
must not be "corrected".

Every clearance in `src/world/Levels.js` is computed against a 4.2 m car:

| Rule | Value | Against a 4.69 m car |
|---|---|---|
| Bay pitch | ≥ 2.55 m | unchanged (width-driven) |
| Parallel gap | ≥ 6.2 m (Level B2 sits exactly on it) | 1.51 m of slack instead of 2.0 |
| Aisle depth in front of a bay mouth | ≥ 7.5 m for reverse parks | the swing grows with length |
| Nose clearance to pilasters | 0.54 m on several levels | overlaps |

v1 shipped a level that was mathematically impossible to complete because two
parked cars left a 3.4 m gap for a 4.2 m car. Lengthening the car by half a
metre would quietly do the same thing to several levels at once.
`tools/level-lint.mjs` would catch it; the point of this note is that nobody
has to find out that way.

**What carries the Civic read is proportion, not length:**

- long, low hood with the cowl far forward (`cowlZ = -0.72`)
- deeply raked windscreen
- cab-rearward stance: roof peak at `z = +0.45`, well aft of centre
- fastback roof that holds its height to the C-pillar, then drops fast
- short deck from `z = +1.20`
- one straight beltline at `y = 0.98`
- widest point below the belt (shoulder at `y = 0.78`) — planted stance
- blacked-out B-pillar so the side glass reads as one graphic
- slim horizontal lamps linked by a dark bar

The visible body (1.74 m) is slightly narrower than the 1.78 m collision box,
which is normal and slightly forgiving.

## Station table (sedan, ground frame, half-widths)

`src/vehicle/bodies.js` is authoritative; this is the shape in brief.

| z | Station | Belt y | Belt half-width | Notes |
|---|---|---|---|---|
| −2.10 | bumper face | 0.900 | 0.676 | belt falls away: no slab nose |
| −1.92 | nose | 0.928 | 0.772 | |
| −1.55 | hood leading edge | 0.951 | 0.809 | |
| −1.10 | front axle | 0.969 | 0.815 | |
| −0.30 → +0.60 | cabin | 0.980 | 0.815 | dead straight belt |
| +1.20 | deck | 0.982 | 0.813 | |
| +1.65 | tail | 0.984 | 0.793 | |
| +2.10 | rear bumper | 0.944 | 0.676 | belt tucks |

Roof: `z −0.05 y 1.40`, `z +0.45 y 1.42` (peak), `z +1.05 y 1.38`.
Backlight base: `z 1.55, y 1.02`.

## How it is built: a lofted tub

The body is **not boxes**. Each station is an *open* half-profile running from
the beltline down the flank and under the floor; `BodyLoft.js` mirrors it and
skins consecutive stations into flat-shaded quads. That produces a hollow tub
with nothing across the top. Hood, roof and deck lids close only what should
be closed, and the cabin aperture between cowl and deck is genuinely open.

This replaced a 43-box body whose "shoulder band" ran the full length of the
car through the passenger compartment and sealed the dashboard, steering wheel
and the driver's arms inside a solid slab.

## Materials

- **Bodywork is FrontSide.** From inside, its back faces cull away, so the
  shell never boxes the camera in.
- **Except the roof, which is DoubleSide.** The eye is at 1.20 m and other
  cars' roofs are at ~1.42 m: seen from below, a single-sided roof culls and
  every car in the lot reads as a convertible.
- **Cabin interior is DoubleSide + emissive.** It receives no light from any
  source and is a black void without the emissive term.
- **Glass is 36% opaque, DoubleSide.**
- **No `metalness` anywhere.** There is no environment map, and PBR metals
  render nearly black without one (a v2 bug).

## Mirrors

Door-mirror housings are body colour, 0.20 × 0.11 × 0.075 m at
`x = ±(belt + 0.13), y = belt + 0.10, z = −0.50`, with the glass on the **rear**
face. Parked cars get static grey glass; the player car gets live glass from
`Mirrors.js` at exactly that face (the two would z-fight), turned toward the
driver by at most 0.3 rad so it doesn't sink into the housing.
`Mirrors.doorMirror()` and the housing block in `CarModel.js` must stay in sync.

## Body types

`bodies.js` defines sedan, hatchback, SUV, van and pickup from the same helper
and the same 4.2 × 1.78 footprint. Parked cars pick a type deterministically
from their paint index, so a lot looks identical on every load; a level can
force one with `body: 'van'` where the type is the point of the level.

## Cabin package — also load-bearing

| Datum | Value | Held up by |
|---|---|---|
| Eye | `x −0.36, y 1.20, z 0.32`, tilted −6° | Road over the nose visible above the cluster; player-adjustable within `SEAT_ADJUST` |
| Dash shelf | top `y 0.92`, sloped scuttle up to the glass base | Keeps the lower view open and the reversing screen clear of the dash |
| Wheel hub | `y 0.86, z −0.16`, rim radius 0.175, 22° tilt | Arm reach (~0.62 m at 10/2 vs 0.66 m of arm) and the rim sightline under the cluster |
| Shoulders | `z 0.42` | Upper arms mostly behind the lens |
| Cluster | `y 1.02, z −0.62`, 0.42 × 0.15 m | Top below the eye-to-nose sightline; bottom 5 cm above the rim's sightline |
| Reversing screen | `x −0.02, y 1.03, z −0.50`, 0.30 × 0.18 m | 2.6 cm above the dash shelf, nothing in front of it |

Move the wheel or the shoulders and the IK breaks; move the cluster up and it
blocks the road, down and the rim hides it (all three happened). The player's
seat adjustment moves only the camera, never the shoulders.
