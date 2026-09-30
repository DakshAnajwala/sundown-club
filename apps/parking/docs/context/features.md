# Built features: design sources, decisions and history

Read the section for a feature before changing it. Design index:
`design/README.md`.

Published design artifacts (private links, owner-only):
- Wheel Lab: https://claude.ai/code/artifact/242d13dc-d8fd-4b08-8570-90e9037c9a9a
- Level 13 Sheet: https://claude.ai/code/artifact/f360b773-dae2-4268-b4cc-6b01a2242493
- Homepage directions: A https://claude.ai/code/artifact/49b25419-b4a2-40c7-96b9-4e2da1015200 · B https://claude.ai/code/artifact/3aa830ef-11a5-4faa-a2c5-0e773b6d84d9 · C https://claude.ai/code/artifact/5bd89925-8214-409b-b3f4-4bec807ebcf2
- Older playable game artifact: https://claude.ai/code/artifact/0e41f7f4-78bd-46e4-8e80-c81cad5fa63f
  (republish: `npm run build && node tools/artifact-page.mjs`, publish
  `dist/artifact.html` with the new `assets/play-*.js` in `files`;
  artifact-page reads `dist/play/index.html`).

## Site layout and build

| URL | Source | What |
|---|---|---|
| `/` | `index.html`, `src/site/home.js`, `src/site/home.css`, `public/media/*.webp` | Homepage, Design "A — Rooftop dusk" |
| `/play/` | `play/index.html` → `src/main.js` | The game |
| `/privacy.html`, `/terms.html`, `/notices.html` | `public/` | Legal pages (back links to `/` and `/play/`) |
| `/design/` | `design/index.html` | Index of design previews |
| `/design/wheel-lab/index.html` | `design/wheel-lab/` | Live 3D wheel/hand tuning bench |
| `/design/level13/sheet.html` | `design/level13/` | Level 13 layout sheet |
| `/design/homepage/directions/*.html` | copied by `tools/design-pages.mjs` | Homepage direction prototypes |

- `vite.config.js` multi-page inputs: `home`, `play`, `design`, `wheelLab`,
  `level13`. `base: './'`. A dev-only plugin serves `POST /__wheel-lab/save`
  (writes `design/wheel-lab/params.json`).
- `npm run build` = `vite build && node tools/design-pages.mjs` (copies
  `params.json` and the direction pages into `dist/design/`).
- In-game legal links point at `../privacy.html` / `../terms.html` because the
  game is under `/play/`.
- Legal docs: `LICENSE` (all rights reserved), `PRIVACY.md`, `TERMS.md`,
  `THIRD_PARTY_NOTICES.md`, web copies in `public/`. `LAUNCH_CHECKLIST.md` is
  the earlier legal/compliance checklist.
- History: `legacy-v3/` holds superseded v1–v3.

## Homepage (Design A)

Origin story used on the homepage: the author was studying for a physics test,
got bored, couldn't find a good parking game, and made his own. About section:
name, story, GitHub profile link, contact email `daksh.anajwala@gmail.com`.

Sections (a fixed "floor" ribbon G/1/2/3/4/Roof tracks position):
1. G — Hero: rooftop screenshot, "Park it perfectly.", CTA → `./play/`; touch-device note (keyboard needed).
2. 1 — Story: the physics-test origin story; lines brighten while pinned.
3. 2 — Showcase: four lots (Roof final exam 2.6 m bay/8°/2 min; B4 underground 0.45 m to pilaster/2.75 m bays; driver's seat 720°/mirrors/dials; reverse camera beeps <1.5 m, solid <0.3 m), horizontal pinned scroll on ≥768 px.
4. 3 — How to play: controls as keycaps (W/S, A/D, P/R/N/F, Space, Q/E, right mouse, Esc; arrows; 1–4) and score bars (Placement 30, Alignment 25, Depth 20, Time 15, Finesse 10, from `Scoring.js`).
5. 4 — How it's made: three.js, cannon-es (raycast wheels, 120 Hz), Web Audio, 4.20 × 1.78 m car, 3.56 m turning radius at 42°, 10 sensor rays; Level 13 "City Drive" teaser.
6. Roof — Who made it + final CTA + footer (Privacy, Terms, Third-party notices, GitHub profile, © 2026).

- GitHub links go to the profile `github.com/DakshAnajwala` because the repo is private.
- Motion: `gsap.matchMedia` with reduced-motion and ≥768 px conditions.
  Floor-ribbon triggers use `refreshPriority: -1` (they must measure after the
  pinned sections, or the ribbon lights the wrong floor).
- Verified: 1440×900, 390×844, reduced motion; 0 console errors; 0 third-party
  requests; no horizontal overflow; fonts load locally.
- Scope every GSAP selector to its section. A bare `.cta` in the footer tween
  once hid the hero's play button on the live site. `tools/site-probe.mjs` now
  asserts the hero CTA is visible above the fold.
- Popularity audit pass (28 Sep, branch `audit/popularity`, report
  `AUDIT-REPORT.md`, brief `prompt.md`): hero CTA "Start driving" + "See the car
  parks"; "no download, no account" above the fold; touch-only visitors get
  "Send me the link" instead of a dead play button; FAQ ("Before you start") in
  the Roof section; example leaderboard captioned as an example; hero and
  showcase stills, `og-card.jpg` (1200×630), `favicon.svg`,
  `apple-touch-icon.png` regenerated from the real game by
  `tools/media-shots.mjs`; full OG/Twitter/canonical/JSON-LD, `robots.txt`,
  `sitemap.xml`.
- Not done: gameplay video clips (ffmpeg not installed; ask before installing);
  `rooftop-dusk.webp`/`underground.webp`/`open-deck.webp` are from the 15 Sep
  build (exterior shots, still accurate); `design/SPEC-homepage.md` (tokens +
  motion table) never written.

## Wheel + hands (`design/SPEC-wheel-hands.md`, built and wired in)

- Tuned numbers: `design/wheel-lab/params.json`, equal to `Dimensions.js`
  `WHEEL_SPORT`/`HAND`/`HAND_RIG`. Lab runs locally at
  `/design/wheel-lab/index.html`; Export → Save writes params.json (dev server only).
- Wiring: `Cockpit.js` → `SteeringWheel.js`; `Driver.js` (thin adapter,
  `createDriver({cockpit,onShifterGrabbed})`) → `HandRig.js`. `RimCurve.js` is
  pure maths (D-shaped rim centreline). `HandModel.js`: 18 meshes, 216 tris,
  wrapPose finger solver. `HandRigChecks.js`: per-frame assertions + S1–S9
  steering sweep, shared by the lab and a future probe.
- Wheel: R 0.175, tube 0.025, flat bottom ±32°, fillet 0.024, dish 0.022, side
  spokes 30 mm, lower spoke 58→40 mm, hub pad 130×95×45 octagon, thumb grips
  +6 mm, stripe 18 mm; 4 draw calls.
- Hands: domains left [−160°, −20°], right [20°, 160°]; states
  GRIP/SLIP/RELEASE/TRAVEL/REGRIP/SETTLE/SHIFT; never both hands off; travel
  0.30–0.45 s (230°/s); re-grip lands on the planned spot and grips the rim
  under it; thumb solved at build against the real wheel (rests on the rim
  2–30° above the side spoke, hovers 2.5 cm elsewhere); shift phases
  0.16/0.22/0.30/0.32 s, `onShifterGrabbed` fires only on arrival; left hand
  never leaves during a shift (waits up to 0.8 s).
- Lab sweep S1–S9 passes with 0 violations; worst in-domain reach 0.607 m
  (limit 0.640); tight margins: S6/S8 penetration 2.87/2.95 mm vs 3 mm.
- 14 decisions changed from the old brief (thumb rests on rim not spoke, palm
  offset −6°, solved poses, roll 62°, changed limits, cluster sightline ≥ 0 cm
  because the old torus only measured 0.88 cm, and others): all listed in SPEC §3.
- `GOAL-wheel-hands-overhead-review.md` (root) is the old brief. Parts A/B are
  superseded by the SPEC; Part C is built (overhead review below).

## Level 13 "City Drive" (`design/SPEC-level13.md`, built)

- Model: `design/level13/layout-model.mjs` (`buildLayout()` geometry +
  `checkLayout()` rules, 11 checks); `node tools/city-lint.mjs` re-runs them
  against the live model. Renderer: `src/world/CityBuilder.js` (`style: 'city'`).
- City 222×222 m, 12 m streets (lanes 2.2 m from centreline, kerb cars 5.0 m, 12
  on the route streets), 32 buildings; car park 44×58 m, G + L1 + L2 + L3 + Roof
  at 3.2 m storeys (roof y 12.8); ramps 12% main with 3 m 6% transitions
  (29.7 m), lane A (x −4, rising north) / lane B (x +4, rising south), 4.0 m
  clear; hairpins R 4.0 m; 19 bays per row at 2.75 m pitch, 137 parked cars;
  target roof west row bay 5 at (−18.8, −14.0), heading +90°, tolerance
  0.50 m/10°; route 427 m, est 171 s, par 240 s, limit 420 s.
- All 11 layout checks pass (grade, grade change, width, landing 13.7 m, radius
  4.0, headroom 2.42 m, clearance 1.02 m, door gap 0.97 m ×2, spawn 2.91 m,
  time, traffic-light control at both route intersections).
- Ramp grades measured with the real `Car.js` (`design/level13/ramp-probe.json`):
  8–20% all climb, hold and crest with 0 scrapes; hill-hold built.
- City polish (`GOAL-city-polish.md`, 15 Sep):
  - Atmosphere: overhead gantry signs + animated traffic lights (no penalty) at
    the 2 street×street crossings on the route; crosswalk stripes; decorative
    roundabout island (own static collider) at an off-route intersection.
  - Navigation: kerb parking 7→12 cars (same offset, never narrower); decoy "P"
    pylon at the first intersection. A cone run at each ramp arrival was added
    then removed at the user's request.
  - Parked-car variety: `layout-model.mjs` sets an explicit `body` per car,
    decoupled from `paint`. Previously every car fell back to
    `bodyForIndex(paint)` capped at `% 7`, so vans/pickups never appeared.
    `COLORS.carPaints` widened 8→10.
  - Speed FOV: `DriverCamera.js` widens FOV up to +12° between 20–100 km/h
    (Settings > View > "Speed FOV", default on). Engine-wide.

## Overhead ("helicopter") parking review (Part C of the old brief, built 15 Sep)

- Scope decision: C.1–C.12 built to spec; C.13 stretch built in full
  (view-again replay, opt-in personal-best ghost with a `progress.js` + privacy
  update, V-key drone view). The exhaustive C.12 probe was replaced by a lighter
  core probe (3 target styles + 1 timed-fail level) at the user's request.
- `src/game/ParkingReview.js`: camera flight (centripetal Catmull-Rom P0→P3,
  smootherstep-remapped; 3-segment orientation blend Q0 → level → pitched 60° →
  top-down), 3D measurement overlay (ghost/actual footprint, parking window,
  centres, offset lines, heading arc, clearance gaps; depthTest:false ribbons,
  `renderOrder 900`), DOM label anchors.
- `src/game/PlanGeometry.js`: `rect/axes/overlaps/segDist/gap/closestPoints/
  levelFootprints`, moved verbatim from `tools/level-lint.mjs` so the review and
  the linter share one obstacle model. `LevelBuilder.buildLevel` returns
  `footprints` and `ceiling` (Garage.js named child group, toggled by the
  review; empty on rooftop levels).
- Hud.js: the old full-screen results veil is retired.
  `showReviewResults`/`showReviewFailed` build a docked card
  (`.hud-review-card`, right-docked ≥900 px, bottom sheet below). `.hud-review`
  is a label layer Game.js repaints every frame from `review.labels`. Keys: H
  hide/show, R replay, Enter next/replay, Esc (while hidden) re-show, V drone view.
- Game.js: `review.exit()` runs before `built.dispose()` in `teardown()`
  (dispose nulls `scene.fog`, so exit restores near/far first);
  `updateRig`/`draw` skip `cameraRig.update`/mirrors/backup camera while
  `review.active` (same pattern as `freeCam`); AO off during review, restored
  after (respects `?lowfx`).
- Runs on levels 1–12 only; `enter()` no-ops for `style === 'city'`. Level 13
  still shows the docked card, without the flight.
- Bugs found by `tools/review-probe.mjs`: swapped final-basis matrix columns;
  dead orientation-blend branch; C.4's `f`/`g` mean the free area's fraction of
  the viewport, not the card's (using the card's buried the bay under the card);
  stale camera matrix before `project()`; "Where you stopped" computed at
  settle() instead of `enter()`.

## Parked cars, radar, HUD, chase camera, rebinding (`GOAL-graphics-hud-camera.md`, built 21 Sep)

- F1 parked-car detail: Level 13 cars rendered as grey boxes with a duplicate
  collider (clearance-check boxes were baked as visible concrete); geometry now
  baked relative to 16 m chunk origins (world coords caused float32 z-fighting
  at 110–160 m); rear-end pass; stop lamp, exhaust valance, wipers, roof rails,
  3 wheel patterns, deterministic per-car ride-height/steer variation.
- F2 `ProximityScan.js` + `ProximityRadar.js`: radar HUD, distinct from bumper sensors.
- F3 HUD customisation (`settings.js`, `Hud.js`): substrate the other toggles plug into.
- F4 `TelemetryHud.js`: track-style cluster telemetry.
- F5 `ChaseCamera.js`: third-person camera option.
- F6 `Input.js` rewritten for key remapping. The rebinding panel and the
  how-to-play panel were both declared as `showControls`; the later one
  silently won.
- `window.__game` removed from production builds: it exposed `debugTeleport`, a
  leaderboard-integrity risk.

## Leaderboard (`GOAL-rear-hud-leaderboard.md`, built 21 Sep)

- `api/run.js` issues a signed, one-shot, level-bound token; `api/score.js`
  requires it and cross-checks claimed run length against server wall-clock
  time, plus value sanity, plausibility, body-size cap and per-IP rate limits;
  `api/leaderboard.js` reads; `api/_lib/board.js` holds shared storage/scoring
  logic, covered by `tools/leaderboard-probe.mjs` (26/26).
- Identity: the server issues each browser a signed random id and a generated
  name from a curated word list (no free text, no moderation). Claimed on the
  first post only, never on page load (PRIVACY.md promises this; site-probe
  checks it). `?debug` pages never start or submit a run. The client cannot
  choose or reroll its name; editing localStorage does not buy extra rows.
- Posting is automatic on finishing a level (`8ccff22`), with a Settings opt-out
  and a one-time first-post notice.
- Rejected identity approaches: IP (shared by households/schools, changes on
  mobile, binding it to a public row stores personal data) and device
  fingerprinting (tracking, needs consent, collides, breaks on updates). The
  token honestly "identifies a browser", not a person.
- Scores are computed client-side, so the board is labelled "unverified" in the
  UI, PRIVACY.md and TERMS.md. Server-side replay verification is deliberately
  not built.
- Offline is normal: `src/net/leaderboard.js` swallows every failure and is
  disabled under the Vite dev server.
- PRIVACY.md/TERMS.md and their `public/` copies were rewritten for the
  leaderboard, automatic posting and the server-owned name.

## Levels (17, built 21 Sep)

- Original 12 + Level 13 "City Drive" + four more: Deck Five (open, three-point;
  lane dead-ends, same 7.8 m lane as Roof One), Level B5 (underground, angled;
  Deck Four's echelon mirrored, 2.9 m ceiling), Level B6 (underground, reverse,
  110 s limit; only timed underground level; 0.92 m door gap against the 0.35 m
  floor), Roof Four (rooftop, parallel; 6.6 m clear kerb vs 6.2 m minimum, kerb
  doubles as parapet).
- Level ids are stable, not positional: the new levels are ids 14–17 but sit
  interleaved in the running order, so saved progress and leaderboard rows stay
  attached. The `id === index + 1` assumption broke `Hud.setLevel` and four
  probes before it was fixed.
- Homepage copy, menu copy and the API's `LEVEL_COUNT` updated for 17.

## Retention pass (`design/SPEC-retention.md`, built 29 Sep)

- Modules: `src/game/Retention.js` (medals, author times, next goals,
  `explain()` for "where the points went", share text, daily pool and seed —
  pure, importable by probes), `src/game/Ghost.js` (live PB ghost car, no
  physics body), `src/ui/daily.js` (daily results store).
- Card keys: `restart` (B) and Enter act during the review flight; H/V/Esc
  skip it; R only once settled. Cards take keys whenever open (City Drive has
  no review).
- Card v2: earned/max/lost per part, biggest loss, one fix sentence with its
  exact value, next tier, medal badge, PB delta. Pose words come from
  `stopWords()` in `ParkingReview.js` — the one formula.
- Medals: Gold >= 95, Platinum >= 98 and time <= `AUTHOR_TIMES[id]`. Levels
  1, 2, 6 are autodrive times; the rest are provisional (par x 0.8).
- Daily: `dailyFor(date)`, 23 variants on existing lots, never posted, never
  written to progress. No streaks anywhere (retention-probe greps `dist/`).
- Storage: `progress:v5` (adds `medal`, `fastestSec`; migrates from v4 and
  leaves v4), `daily:v1`, `ghost:v1`; settings `reviewGhost`, `ghostLive`.
  All listed in PRIVACY.md §2. Reset progress clears all three.
- Levels and retries still start in Park (owner's call, 29 Sep).
- No creep since 29 Sep: see `Car.js` coast-down and NOTES.md.
