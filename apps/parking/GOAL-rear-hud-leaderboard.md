# GOAL — rear-end fix, chase-camera telemetry HUD, public leaderboard

Status: **design brief, not yet built.** Written 21 September 2026.
Target implementer: Sonnet at medium effort, working from this file alone.

Read `/Users/dakshgiis/parking-game-v1/CLAUDE.md` in full first, then
`NOTES.md`'s "September 2026" entry — the previous pass (`GOAL-graphics-hud-camera.md`)
added the parked-car detail, the proximity radar, HUD customisation, the track
cluster, the chase camera and key rebinding, and some of what this brief fixes
was introduced by it.

Three parts, in dependency order. **Part C is much larger than A and B put
together**, changes the project from a static site into one with a server, and
contradicts a promise the current privacy policy makes. Do A and B, show the
user, and do not start C until the §C.1 decisions are answered.

---

## Part A — the back of the car looks wrong

### A.1 The report

The user's screenshot is the player's own car seen from the chase camera. The
rear end reads as broken: a wing-like bar floating across the top, a nub
sticking out of the rear bumper, and flat pale slabs where the tail lamps
should be.

### A.2 What is already known (do not re-derive)

Reference shots are in `tools/shots/rear-a.png` and `tools/shots/rear-b.png`,
taken with:

```
node tools/shots/pc-cmp.mjs rear-a 0 -6 6 0 0 6.5 2.2
node tools/shots/pc-cmp.mjs rear-b 0 -6 6 0 20 5.5 1.3
```

Suspects, in the order they are likely to matter. **Prove each one by
toggling it off and re-rendering — do not fix by guesswork.** The cheapest way
to isolate is to temporarily force a tier in `TIERS` (`src/vehicle/CarModel.js`)
or comment a single block, re-shoot, and compare.

1. **Exhaust tip — added last pass, almost certainly wrong.**
   `CarModel.js`, in the `tier.exhaust` block: a cylinder r 0.035, length 0.09,
   at `x -0.34`, `y fromGround(spec.yRocker - 0.06)`, `z spec.bumperRearZ * 0.99`.
   For `SEDAN` that is `y = 0.28`, `z = 2.099`, and the plan's last station is
   `z = 2.1` — so the pipe's rear face lands at ~2.14, **protruding past the
   bodywork**, below and behind the bumper, unsupported. It reads as a broken-off
   part rather than a tailpipe. Fix: tuck it under the bumper (inboard of the
   rear face, not past it), give it a short body-coloured or dark valance to
   emerge from, and keep the ≥ 4 mm separation rule (CLAUDE.md / last pass's
   z-fighting lesson).
2. **Tail lamps — pre-existing, and the weakest part of the rear.**
   `CarModel.js`, the `spec.taillamp` loop: a single `glow(COLORS.lampRed, 0.45)`
   box, 0.07 deep, sitting proud of the tail at `plan[last][0] + 0.01`. The
   HEADLAMPS already solve this properly (a dark `0x1f2226` housing with the
   lit lens recessed into it, with the comment "a bare bright box on the nose
   reads as a sticker rather than a lamp") — the tail never got the same
   treatment. Give it one: dark housing, lens recessed, and consider splitting
   the lamp into a lit band plus a darker reversing/fog block so it is not one
   flat rectangle.
3. **The "wing" across the top.** From directly behind you see a horizontal bar
   spanning the greenhouse with two arms ending in blocks. The arms and blocks
   are the **door mirrors** (correct, at `z = -0.5`), seen past the roof. The
   bar is either the **wipers** added last pass (`tier.wipers`: 0.42 × 0.014 ×
   0.022 at `y = spec.yBelt + 0.035 = 1.015`, `z = spec.cowlZ + 0.09 = -0.63`,
   rotated `±0.21` rad) seen through both screens, or the roof panel's leading
   edge. **Determine which**, then: if the wipers, they are too long, too high
   off the cowl and too prominent in silhouette — shorten, drop them to sit in
   the cowl gutter, and make sure they read as wipers from the driver's seat
   (where they should be barely visible) rather than as a spoiler from behind.
4. **The tail cap / boot shape.** The rear reads bulbous and slab-sided in
   `rear-b.png`. This is the lofted tail (`capProfile` on the last plan station
   plus the `deck` lid). If 1–3 do not account for the user's reaction, look at
   whether the deck-to-tail transition needs an extra station.
5. **High-level stop lamp — added last pass.** `tier.stopLamp`: 0.30 × 0.032 ×
   0.04 at `y = roof[last][1] - 0.045`, `z = spec.roofRearZ - 0.03`. Check it is
   actually on the glass line and not floating above the roof or buried in it.

### A.3 Scope rule

This is the **player's** car as much as the parked ones — `createSedanShell`
builds both, and `detail` defaults to `'full'`, so everything added last pass
is on the player's car too. Check the fix from **both** the chase camera and
the driver's seat, and on at least two body types (`SEDAN` and one of
`SUV`/`PICKUP`, which have different `yRocker` and `bumperRearZ`).

### A.4 Acceptance

- [ ] Each suspect confirmed or cleared by an isolation render, and the
      finding stated in the summary (not "adjusted the exhaust" but "the
      exhaust protruded 4 cm past the tail; here is the before/after").
- [ ] Rear 3/4 and straight-on rear renders, before and after, at the two
      camera set-ups in §A.2.
- [ ] Nothing protrudes past the bodywork's own plan outline except the door
      mirrors.
- [ ] Tail lamps read as lamps in a housing, matching the headlamps' idiom.
- [ ] The car is still 4.20 × 1.78 m, `CAR_BOX` untouched, `level-lint` and
      `sensor-probe` unchanged.
- [ ] No new z-fighting at Level 13 street distances (the merged-geometry
      trap — re-run the Level 13 street shot).

---

## Part B — telemetry HUD for the chase camera

### B.1 The report

"There is no speedometer in the chase camera." Correct, and by design until
now: every instrument in this game lives **in the car**, drawn onto the
dashboard (`DashCluster.js`'s header explains why). From the chase camera the
dashboard is not visible, so the player has no speed, no revs and no gear.

The user wants a compact screen-space telemetry widget in the style of the
"gearbox" module from the CMRT Essential HUD app for Assetto Corsa
(reference screenshot supplied): a rounded pill carrying a large gear numeral
in a ring, `KMH` and `RPM` labelled numerals, and a row of shift-light dots
across the top.

### B.2 What to build

New module `src/ui/TelemetryHud.js`, drawn as **DOM**, not canvas-in-world —
it is screen-space furniture like the rest of `Hud.js`, and it must scale and
fade with the existing `--hud-scale` / `--hud-opacity` variables from the HUD
customisation pass.

Layout, adapting the reference to what this car actually has:

| Element | Source | Notes |
|---|---|---|
| Gear numeral | `debug().car.gear` + `autoGear` | `P` / `R` / `N` / `D1`–`D6`. Large, inside a ring whose colour tracks revs |
| Ring fill | rpm fraction | Sweeps as revs rise, same idea as the reference's yellow ring |
| `KMH` / `MPH` | speed | **Honours the existing `units` setting** — do not hard-code km/h |
| `RPM` | rpm | Integer |
| Shift dots | rpm | Row of ~14 dots, filling from `SHIFT_FROM_RPM` to `SHIFT_FULL_RPM`. **Reuse the constants already in `DashCluster.js`** (2800 → 3400, red at 5400) rather than defining a second set that can drift |

**Do not copy the reference's branding**: no "CMRT" name, no logo, no
"ESSENTIAL HUD" wordmark. Implement the layout idiom only — same rule the last
pass applied to the track cluster and the car bodies (`bodies.js:6-11`).

**Do not invent telemetry this car does not have.** The reference shows `FUEL`
and `EST. LAP`; there is no fuel model and there are no laps. Use the second
row for values that exist and matter in a parking game: **time elapsed** (or
time remaining on a timed level) and **bumps**, both already tracked by
`Scoring.js` and already shown on the level card.

### B.3 Wiring

- New setting `hudTelemetry`: `'auto' | 'always' | 'off'`, default `'auto'`.
  `auto` = shown whenever the camera is in chase mode, hidden in the seat
  (where the real dials are visible and a screen-space duplicate would undercut
  the first-person framing the game is built on).
- Add it to the HUD panel (`showHudPanel` in `Hud.js`), in the Elements
  section, and to the `HUD_PRESETS` bundles in `settings.js`.
- Update at the same cadence discipline as everything else: recompute on the
  rig tick, but only touch the DOM when a displayed value actually changed
  (integer km/h, integer rpm, gear string, dot count). A `textContent` write
  per frame per field is what makes HUDs cost more than they should.

### B.4 Acceptance

- [ ] Visible in chase, hidden in the seat, on `auto`; both overrides work.
- [ ] Speed matches the dash cluster exactly, in both km/h and mph.
- [ ] Revs and shift dots match the track cluster's bar at the same moment
      (same constants, so this is a check that they were reused, not copied).
- [ ] Gear shows `D1`–`D6` and updates on upshift.
- [ ] Legible at 390 px wide; respects `hudScale` and `hudOpacity`; hidden
      during the overhead review and in menus, like the other clusters.
- [ ] No DOM writes on a frame where no displayed value changed (prove it with
      a counter in a scratch probe).
- [ ] `tools/shell-probe.mjs` extended over the new control; still 0 failures.

---

## Part C — public leaderboard

### C.1 Decisions the user must make before any code is written

This part cannot be safely built on assumptions. Get answers first.

1. **Does the site get a server?** Today there is none. `PRIVACY.md` §1 is
   titled **"There is no account, and no server"**, and §7 says the policy will
   be updated if that changes. A public leaderboard means a backend, a stored
   record per submission, and a rewritten privacy policy. Confirm the user
   wants this.
2. **What identifies a score?** Free-text display name (needs moderation — see
   §C.5), a generated handle (e.g. "Swift Otter 412", no moderation burden), or
   initials only. **Recommend: generated handle, with an optional 3-letter
   initials field**, arcade style. It sidesteps most of §C.5.
3. **How much cheating is acceptable?** Scores are computed in the browser
   (`src/game/Scoring.js`) and can be forged by anyone with devtools. Genuine
   prevention means server-side replay validation (large). Realistic options in
   §C.4. **Recommend: submit the full run summary plus a replay digest, do
   server-side sanity checks, and label the board "unverified" rather than
   pretending it is authoritative.**
4. **Which backend?** The site is on Vercel. Options: Vercel KV / Upstash
   Redis (simplest, generous free tier), Vercel Postgres, or Supabase.
   **Recommend: Upstash Redis via Vercel's integration** — a sorted set per
   level is exactly the data structure a leaderboard is.
5. **Age and jurisdiction.** The game is aimed at anyone, and `PRIVACY.md` §6
   currently leans on "we collect nothing from anyone". Once submissions exist,
   a name is personal data. The safest position for a solo student-run site is
   **no free-text names, no email, no accounts** — which is why (2) matters.

### C.2 Shape of the thing

- **Per level**, not one global board: a single "best score" board across 13
  levels of different difficulty is meaningless.
- Ranked by `score` (0–100 from `Scoring.js`), tie-broken by `timeSec`
  ascending.
- Top 100 per level, plus the submitting player's own rank if outside it.
- Viewable **without playing** — a `/leaderboard` page on the site, linked from
  the homepage and from the results card.

### C.3 Implementation sketch

**Server.** Vercel serverless functions under `api/`. Note the project is
currently a pure static Vite build (`vite.config.js` multi-page, `base: './'`);
adding `api/` routes changes the deployment shape, so verify a preview deploy
serves both the static pages and the functions before wiring the UI.

- `POST /api/score` — body: `{ levelId, score, stars, timeSec, bumps, cones, kerbHits, handle, digest, clientVersion }`.
- `GET /api/leaderboard?levelId=N&limit=100` — returns the ranked page.

**Storage.** One sorted set per level, `lb:v1:<levelId>`, score packed so that
score descending and time ascending order correctly in a single float; the
member is the submission id, with the row body in a hash alongside.

**Client.**
- `src/net/leaderboard.js` — the only module that talks to the API. Every call
  guarded and fully optional: **if the network fails, or the player is offline,
  the game must behave exactly as it does today.** No blocking, no error
  dialog, no retry storm.
- Results card (`Hud.js`'s `showReviewResults` area) gains a "Submit score"
  affordance and, after submission, the player's rank.
- New `/leaderboard` page: another Vite input alongside `home`, `play`,
  `design` (see `vite.config.js`), styled like the homepage.

### C.4 Anti-cheat, honestly

State plainly in the summary which of these you did.

- **Minimum (do this):** rate-limit by IP; reject impossible values
  (score outside 0–100, `timeSec` below the level's fastest physically
  possible run, `levelId` unknown, payloads over a size cap); reject a
  `clientVersion` that is not the current build; drop duplicate submissions.
- **Better:** have the client send a compact **input replay** (the key events
  and their timestamps — `Input.js` is already the single choke point for
  input) and a hash of it. Store it with the row. Even without validating every
  one, being able to re-run a suspicious submission later is most of the value.
- **Best (probably out of scope):** re-simulate the replay server-side with the
  same fixed timestep and verify it reaches the same score. `cannon-es` runs in
  Node, and `PhysicsWorld.js` already uses a fixed timestep, so this is
  *possible* — but it needs the whole level build path to run headless, which is
  a project of its own. Do not start it inside this brief.

Whatever is built, the page must say what the numbers are worth. A board that
claims to be verified when it is not is worse than one labelled honestly.

### C.5 Moderation, if free-text names are chosen after all

Only relevant if decision (2) goes against the recommendation. Then you need:
a profanity/slur filter over a maintained list, a length and character-class
limit (letters, digits, spaces, 3–16 chars), a way for the owner to delete a
row, and a stated takedown contact. This is an ongoing duty, not a one-off
feature — which is the argument for generated handles.

### C.6 Legal and policy work (not optional, and not an afterthought)

- **`PRIVACY.md` and `public/privacy.html`:** §1's "no account, and no server"
  becomes false the moment this ships. Rewrite: what is submitted, that
  submission is voluntary and opt-in, what is stored, for how long, that it is
  public, how to request deletion, and the contact for that.
- **`TERMS.md` and `public/terms.html`:** add rules for submitted content and
  the owner's right to remove entries.
- Update both "Last updated" dates.
- Re-check `LAUNCH_CHECKLIST.md`, which was written for a no-server site.
- Homepage copy currently implies a purely local game — check `src/site/home.js`
  for claims that stop being true.

### C.7 Acceptance

- [ ] The game is fully playable with the API unreachable — verified by
      blocking the endpoint in devtools and completing a level.
- [ ] Submission is explicitly opt-in, never automatic.
- [ ] `/leaderboard` renders without JavaScript errors, on desktop and at
      390 px, and is reachable from the homepage.
- [ ] Rate limiting proven with a scripted burst.
- [ ] Forged submissions rejected: score 101, negative time, unknown level,
      stale `clientVersion`, 1 MB payload.
- [ ] Privacy and terms updated, both markdown and HTML copies, dates bumped.
- [ ] The preview deployment serves both the static site and `api/` routes.
- [ ] Nothing about the offline game's behaviour changed: full regression green.

---

## Cross-cutting rules

Same as every pass on this project, repeated because each part below can break
one of them:

1. One `THREE.Scene` and one camera for the process lifetime.
2. No imported assets — procedural geometry and canvas/DOM drawing only.
3. No marque, badge, logo or product name from any reference — including CMRT.
4. Car stays 4.20 × 1.78 m; `Car.js` handling constants untouched.
5. Palette materials are cached and shared: clone before mutating, and never
   animate a cached material.
6. ≥ 4 mm between parallel surfaces on any car part (the z-fighting lesson).
7. `localStorage` may throw; every access guarded.
8. `Input.js` stays the only reader of `KeyboardEvent`.
9. Never commit, push or deploy unless the user asks.

## Regression set

```
node tools/level-lint.mjs        node tools/physics-probe.mjs
node tools/drive-test.mjs        node tools/sensor-probe.mjs
node tools/tutorial-probe.mjs    node tools/shell-probe.mjs
node tools/autodrive.mjs         node tools/city-lint.mjs
node tools/radar-probe.mjs       node tools/chase-probe.mjs
node tools/rebind-probe.mjs      node tools/needle-probe.mjs
node design/level13/build-layout.mjs
```

Dev server on 5175 (`npx vite --port 5175 --strictPort`); reinstall
`puppeteer-core --no-save` after any `npm install`. GPU screenshots use
`--use-angle=metal --enable-gpu --ignore-gpu-blocklist`.

## Definition of Done

- [ ] Part A: root cause per suspect, before/after renders, regression green.
- [ ] Part B: telemetry HUD live in chase, matching the cluster's numbers.
- [ ] Part C: only started after §C.1 is answered; shipped with its legal work
      done in the same change, never after.
- [ ] `ARCHITECTURE.md` gains `TelemetryHud.js` (and `net/leaderboard.js` +
      `api/` if C ships); `NOTES.md` gains the decisions.
- [ ] Homepage screenshots noted as stale if the car's rear changed.
- [ ] Nothing committed, pushed or deployed.
