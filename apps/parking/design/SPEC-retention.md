# SPEC — retention: the "one more try" loop

Design for `prompt-retention.md` Phase B. Evidence for every choice is in
`RETENTION-REPORT.md` §3 (Phase A, measured with `tools/loop-probe.mjs`).
Prototypes: `design/retention/*.html` (open through the dev server:
`/design/retention/index.html`). Build order and per-step verification go in
`GOAL-retention.md`, written after sign-off (§12).

Status: **designed, waiting on sign-off (§12). Nothing here is built yet.**

---

## 0. Rules this design keeps

- **Existing scores keep their meaning.** `WEIGHTS`, `PENALTY`,
  `STAR_CUTOFFS`, `DWELL_SEC`, every level's tolerance, par, limit and
  geometry are untouched. Every new number below is additive.
- **`Car.js` handling constants are untouched.** M1's "ready in gear" adds an
  optional `gear` field to the spawn object `respawn()` already takes; the
  brake hold goes through the existing `brake` input.
- **No new server data, no new level ids, no `LEVEL_COUNT` change.** Dailies
  are never posted. The daily board (§6.8) is specified, not built.
- **Nothing on the §2.2 forbidden list**: no streak, no timer to a reward, no
  "last chance", no random reward, no notification, no auto-advance.
- **Keys:** every new key reads its code through `codesFor()` (rebindable);
  no new hard-coded key except extending the card's existing local handler.
- **Numbers live in one module:** `src/game/Retention.js` (new), house-style
  header comment, pure (no DOM, no three.js), importable by probes and lint.

## 1. Constants — `src/game/Retention.js`

```js
export const MEDALS = {
  gold:     { minScore: 95 },                   // on top of ★★★ (88)
  platinum: { minScore: 98, authorTime: true }, // AND timeSec <= AUTHOR_TIMES[id].sec
};

// Author times, seconds of game time. Provenance is load-bearing: see §4.3.
export const AUTHOR_TIMES = {
  1:  { sec: 21.3, source: 'autodrive' },   // Deck One   (autodrive, 29 Sep 2026, no creep; was 20.7 with creep)
  2:  { sec: 29.0, source: 'autodrive' },   // Deck Two
  6:  { sec: 15.7, source: 'autodrive' },   // Deck Four
  3:  { sec: 64,   source: 'provisional' }, // Deck Three  par 80  x 0.8
  4:  { sec: 68,   source: 'provisional' }, // Level B1    par 85
  5:  { sec: 80,   source: 'provisional' }, // Level B2    par 100
  14: { sec: 52,   source: 'provisional' }, // Deck Five   par 65
  7:  { sec: 60,   source: 'provisional' }, // Level B3    par 75
  15: { sec: 40,   source: 'provisional' }, // Level B5    par 50
  8:  { sec: 72,   source: 'provisional' }, // Level B4    par 90
  17: { sec: 56,   source: 'provisional' }, // Level B6    par 70
  9:  { sec: 48,   source: 'provisional' }, // Roof One    par 60
  10: { sec: 68,   source: 'provisional' }, // Roof Two    par 85
  16: { sec: 76,   source: 'provisional' }, // Roof Four   par 95
  11: { sec: 24,   source: 'provisional' }, // Roof Three  par 30
  12: { sec: 56,   source: 'provisional' }, // Final Exam  par 70
  13: { sec: 192,  source: 'provisional' }, // City Drive  par 240 (autodrive took 241.3 s: slower than par, so not used)
};

export const SHARE_CELL = { green: 0.9, yellow: 0.6 }; // fraction of the part's maximum
export const DAILY_EPOCH_UTC = Date.UTC(2026, 8, 28);   // 28 Sep 2026 = Daily #1
export const LAUNCH_HOLD_RELEASE = ['throttle', 'brake', 'steerLeft', 'steerRight', 'handbrake']; // + any gear press
export const JUICE = { pulseMs: 600, pulseMinScore: 88 };
export const GHOST = { hz: 20, maxBytesPerLevel: 30_000, maxBytesTotal: 400_000, opacity: 0.35, fadeNearM: [2.0, 5.0] };
```

Every table above is checked by `retention-probe` (§11): author-time keys
equal the set of level ids, every `sec > 0`, every provisional one equals
`round(par × 0.8)`.

---

## 2. M1 — Instant retry

**Mechanism:** mastery curve. A precision game is compulsive only if a
failed attempt costs almost nothing to repeat.
**Moves:** leaks 1, 2, 3, 6, 9 → G1, G2, G3, G4.

### 2.1 One retry key

The `restart` action (default `B`, already rebindable, `Input.js:50`) works:

| Where | Today | After |
|---|---|---|
| Driving | reloads the level | unchanged |
| Results card, during the 2.0 s flight | dead | **retry at once** |
| Results card, settled | dead (only `R`) | **retry** |
| Fail card, during the flight | dead | **retry at once** |
| Fail card, settled | dead (only `R`/`Enter`) | **retry** |
| City Drive results/fail card (no flight) | dead, all keys | **retry** |

`Hud.js`'s card handler reads the codes with
`codesFor('restart', settings.get('bindings'))`, so a remap follows.

**Why not move retry to `R`:** `R` is Reverse while driving. A timed level
runs out while the player is often mid-manoeuvre, sometimes with a hand on
`R`; if `R` were live the instant the fail card appears, a Reverse press
meant for the car would throw the card away before it was read. `B` is not a
driving key, so it is safe in every state. **`R` stays on the card as it is
today** (legacy alias, only once the card has settled) — nothing is removed,
so no default binding changes.

### 2.2 Keys during the flight (skippable review)

The flight stays the default for players who wait. Any card key ends it:

| Key (default) | Flight (0–2.0 s) | Settled |
|---|---|---|
| retry (`B`) | retry now | retry |
| `Enter` | results: **Next level** (Replay on the last level); fail: **Try again** — acts now, does not just skip | same |
| `H`, `V`, `Esc` | skip to settled (`review.skip()`), no other effect | today's meaning (hide card / drone view / re-show a hidden card) |
| `R` | ignored (see above) | today's meaning (Replay / Try again) |

`Enter` acts at once because the card is already on screen from the first
frame (A3: 3–12 ms) — the player has read it; making them press twice would
keep half the dead time.

City Drive: the card opens with no review (`review.phase === null`). The
handler treats `null` as "settled", and routes keys whenever **a card is
open**, not only when `review.active` (fixes leak 1).

### 2.3 Ready in gear (sign-off item S3)

After any retry (retry key, "Replay", "Try again", `Enter` on a fail card)
the car respawns **in the gear the player first selected on the previous
attempt of this level** (D or R; D if they never left P), with a **launch
hold**: `Game.js` passes `brake: true` to `car.update()` until the first of
throttle, brake, steer, handbrake or any gear press. The existing brake lock
(below 0.3 m/s) keeps it still, so there is no creep before input.

A fresh level load (Start driving, Level select, Next level) for a player
with `tutorialDone` also spawns in **D with the launch hold**. The tutorial
still starts in P and still teaches P → D.

- `Car.js`: `applySpawn(s)` sets `gear = s.gear ?? 'P'` (one line; no
  handling constant). `Game.js` calls `cockpit.setGear(gear)` and
  `input.syncGear(gear)` after respawn so the lever and the `G` cycle agree,
  and does **not** emit `gearChanged` (no shift animation or click on load).
- Prompt while held (replaces the audit's "In Park" hint in this state),
  using the player's own keys:
  - D: **"In Drive — press W to go"**
  - R: **"In Reverse — press W to go"**
  The "In Park / In Neutral" hint stays for a player who shifts back to P/N.

### 2.4 Restart cost

**No reset-in-place path.** Measured rebuild: 33–54 ms (City Drive 331 ms),
all under G2's 500 ms. The 20-restart resource check still runs: new debug
hook `debugResources()` → `{ geometries, textures, programs, sceneObjects,
bodies, drawCalls }` (`renderer.info.memory`, `renderer.info.programs.length`,
a `scene.traverse` count, `physics.world.bodies.length`, and
`debugBenchmark(30).drawCallsPerFrame`).

### 2.5 Acceptance (retention-probe)

- AC1.1 On every level, `B` on the results card during the flight (≤ 100 ms
  after completion) returns `state === 'driving'` within 150 ms, level unchanged.
- AC1.2 Same on the fail card of all 4 timed levels.
- AC1.3 `Enter` pressed 50 ms after completion on a results card loads the
  next level (Replay on the last) within 150 ms; on a fail card, retries.
- AC1.4 `H` during the flight → `review.phase === 'shown'` next frame, state
  still `results`.
- AC1.5 `R` during the flight → no state change; `R` after settle → replay.
- AC1.6 City Drive: results and fail cards respond to `B` and `Enter`.
- AC1.7 After a retry, `car.gear` is D (or R if the previous attempt's first
  shift was R) and speed stays < 0.01 m/s for 3 s of `debugTick` with no
  input; the first `W` moves it.
- AC1.8 Remap `restart` to `KeyK`: `K` retries from the card, `B` does not.
- AC1.9 20 restarts of Level B4: every `debugResources()` count equals the
  count after the first load.
- G1: fail card visible → car moving ≤ 1.5 s with exactly 1 non-throttle key
  (GPU harness). Predicted ~0.1 s.
- G2: mid-run `B` → car moving ≤ 0.5 s. Predicted 66–85 ms (City ≤ 0.4 s).
- G3: park → a key with an effect ≤ 0.5 s. Predicted 0 ms (first press works).
- G4: cold `/play/` → car moving ≤ 5 s with ≤ 1 non-throttle key (`Enter`).

---

## 3. M2 — Where the points went

**Mechanism:** goal gradient + mastery. Naming the one thing to fix, in
points, turns a retry from "try again" into "try *that* again".
**Moves:** leak 4 → G5.

### 3.1 Scoring output (additive; score unchanged)

`Scoring.finish()` also returns:

```js
parts,                 // already computed: { placement, depth, alignment, time, finesse } (floats)
max: { ...WEIGHTS },   // { placement: 30, depth: 20, alignment: 25, time: 15, finesse: 10 }
par,                   // level.parTime ?? 60
```

`retention-probe` asserts `score === max(0, round(sum(parts)))` on every
card it opens, so nothing new can change the number.

### 3.2 Derivation — `Retention.explain(result, status, level, stop)`

- `lost[k] = max[k] − parts[k]` (float).
- `biggest` = the part with the largest `lost`; ties go to the earlier part
  in `placement, alignment, depth, finesse, time`. If the largest `lost` is
  below 0.5 → `biggest = null`.
- `worth` = `round(sum(parts with parts[biggest] = max[biggest])) − score`.
  Exact, never estimated, so the card can't promise more than fixing it gives.
- `nextTier` from **this run's** integer score and time (§4.2).
- `stop` = the same pose words the review overlay uses. To keep one formula,
  the lateral/depth/forward/heading wording in `ParkingReview.computeWords()`
  moves into an exported pure `stopWords(status, target, chassisPos)` in
  `ParkingReview.js`, called by both (City Drive has no review but still
  gets words). Output must be byte-identical (review-probe's consistency
  checks stay green).

### 3.3 Card copy (word for word)

Breakdown rows become three columns: label · what happened · points.

```
Placement in bay   22 cm left of centre     19 / 30   −11
Depth              4 cm short               19 / 20    −1
Alignment          1.2° nose right          22 / 25    −3
Time               31.4 s (par 40 s)        15 / 15
Clean run          no contact               10 / 10
Score                                            82 / 100
```

- Rows use the card's existing rounding (`Math.round` per part); the total
  is the rounded sum, as today, so the rows can differ from it by 1. The
  lost column is `round(lost)`.
- A row whose rounded loss is 0 shows no minus column.
- The biggest loss's row gets class `big` (amber, `--amber`).
- Penalty rows keep today's labels ("Bumps", "Cones flattened", "Kerb
  strikes") and fold into one "Clean run" row: `2 bumps, 1 cone` · `0 / 10` · `−10`.

Then one **fix** box (`.hud-fix`), built from real numbers:

| Biggest | Sentence |
|---|---|
| placement | "**{cm} cm {left\|right} of centre cost you {worth} points.** Aim for equal gaps both sides before you stop." |
| depth, bay | "**{cm} cm {too deep\|short} cost you {worth} points.** Finish {cm} cm further {out\|in}." |
| depth, parallel/box | "**{cm} cm too far {forward\|back} cost you {worth} points.** Finish {cm} cm further {back\|forward}." |
| alignment | "**{deg}° nose {left\|right} cost you {worth} points.** Straighten the wheel a car length before you stop." |
| time | "**{over} s over par cost you {worth} points.** Par here is {par} s." |
| finesse | "**{what} cost you {worth} points.** A clean run is worth 10." (`what`: "1 bump", "2 cones", "1 bump and 1 kerb strike") |
| none | "**Nothing to fix.** Every part scored full marks." |

`{worth}` is always ≥ 1 when shown (a loss < 0.5 is `null`). "point" not
"points" when `worth === 1`.

Under it, the **next tier** line (`.hud-next`), §4.2:
"**4 points to ★★★**" · "**3 points to Gold**" · "**Platinum: 98+ in under 20.7 s**" ·
"**Platinum earned.** Next: beat your 18.2 s."

### 3.4 Acceptance

- AC2.1 17 levels × 3 poses (centre, 30 cm lateral, 7.5° heading): every
  non-perfect card names the biggest part (row has class `big`), shows
  `worth` as an integer ≥ 1, and a fix sentence matching the table.
- AC2.2 For each, `worth` equals the probe's own recomputation from
  `result.parts`, and `score + worth ≤ 100`.
- AC2.3 Centre pose (100): "Nothing to fix." and no `big` row.
- AC2.4 `nextTier` points equal `cutoff − score` for the tier above.
- AC2.5 The pose words in the fix sentence equal `describeStop()`'s words.

---

## 4. M3 — Medals above three stars

**Mechanism:** goal gradient / completion.
**Moves:** leak 5 → G6.

### 4.1 Tiers

| Tier | Rule | Shown as |
|---|---|---|
| ★ / ★★ / ★★★ | unchanged (`STAR_CUTOFFS [88, 68]`) | unchanged |
| **Gold** | score ≥ 95 | a gold "GOLD" badge beside the stars |
| **Platinum** | score ≥ 98 **and** time ≤ `AUTHOR_TIMES[id].sec` | a pale "PLATINUM" badge |

Medals are earned per run and kept as the best medal ever earned on the
level (a Platinum run need not be the best-score run: 98 fast beats 99 slow
for Platinum). The badges are DOM, not 3D, so their colours are HUD CSS
tokens next to `--mint`/`--amber` in Hud's CSS block (`--gold: #e9c46a`,
`--plat: #d6e4ea`), not `Palette.js` materials.

### 4.2 Next goal (shared by card and level select)

`Retention.nextGoal(record, levelId)` → one string:

| State | Text |
|---|---|
| no record | "Not parked yet" |
| < ★★★ | "{88 − score} points to ★★★" |
| ★★★, no medal | "{95 − score} points to Gold" |
| Gold, score < 98 | "Platinum: 98+ in under {author} s" |
| Gold, score ≥ 98 but slower | "Platinum: beat {author} s (your fastest {fastest} s)" |
| Platinum | "Beat your {fastest} s" |

Every state from ★★★ up has a concrete target, so G6 holds for 17/17.

### 4.3 Proof the thresholds are reachable

- **Score part:** a teleport onto the exact target pose scores **100 on all
  17 levels** (Phase A, A5 centre pose). 95 and 98 are reachable on every
  level. `retention-probe` re-proves it.
- **Author time, levels 1, 2, 6:** a real driven run with key events
  (`autodrive`) parked in 20.7 / 28.1 / 15.4 s, with the route's deliberately
  slow 2.0 m/s cruise. A human driving faster can beat it.
- **Author time, the other 14:** `round(par × 0.8)`, **provisional, needs a
  human run.** Fill this in after playing (the probe accepts any value > 0
  and records the source):

| Id | Level | Par | Provisional | Your run |
|---|---|---|---|---|
| 3 | Deck Three | 80 | 64 | |
| 4 | Level B1 | 85 | 68 | |
| 5 | Level B2 | 100 | 80 | |
| 14 | Deck Five | 65 | 52 | |
| 7 | Level B3 | 75 | 60 | |
| 15 | Level B5 | 50 | 40 | |
| 8 | Level B4 | 90 | 72 | |
| 17 | Level B6 | 70 | 56 | |
| 9 | Roof One | 60 | 48 | |
| 10 | Roof Two | 85 | 68 | |
| 16 | Roof Four | 95 | 76 | |
| 11 | Roof Three | 30 | 24 | |
| 12 | Final Exam | 70 | 56 | |
| 13 | City Drive | 240 | 192 | |

Honesty: a provisional time is shown to the player exactly like a proven one
(it is a real target), but NOTES.md and this table say which is which.

### 4.4 Acceptance

- AC3.1 Teleport-perfect on each level → card shows ★★★ + badge; with
  `debugTick` time under the author time → PLATINUM, else GOLD.
- AC3.2 A 96 run → GOLD; a 94 → no badge, "1 point to Gold".
- AC3.3 `AUTHOR_TIMES` keys = level ids; provisional values = round(par × 0.8).
- AC3.4 Stars on every card equal `STAR_CUTOFFS` applied to the score
  (unchanged meaning).

---

## 5. M4 — Mastery map (level select)

**Mechanism:** completion. **Moves:** leak 5 → G6 (level select half).

Each level card, top to bottom (levels stay unlocked; no gating):

```
LEVEL 1                     OPEN DECK
Deck One
Forward pull-in
★★★  GOLD            best 96 · 31.4 s
→ Platinum: 98+ in under 20.7 s
```

- Line 4: stars, medal badge (if any), `best {score} · {timeSec} s` (the
  best-score run's time, one decimal).
- Line 5 (`.goal`, mint, prefixed "→ "): `nextGoal()`; hidden only when there
  is no record ("Not parked yet" is shown dimmed instead).

Above the grid, one summary line and the daily strip:

```
★★★ 12/17 · Gold 5/17 · Platinum 1/17
[ Today's daily · Daily #12 · Deck Two — no contact · your best 91 ]   new daily in 7 h
```

The "new daily in N h" text is plain information: 11 px, 50 % opacity, only
here and in the start menu, never on a results card, no seconds, no
animation. `N = ceil(hours to next 00:00 UTC)`; under 1 h it reads "new
daily within the hour".

### Acceptance

- AC4.1 Seed every level 3★/95 → every card shows a `.goal` line (17/17).
- AC4.2 Summary counts equal the seeded records.
- AC4.3 Cards are `<button>`s, keyboard-focusable, visible focus (existing
  `.hud-lv:focus-visible`), and `Enter` on one plays it.

---

## 6. M5 — Daily challenge

**Mechanism:** variable-but-fair challenge + curiosity. Same for everyone,
different each day, and nothing is lost by skipping a day.
**Moves:** leak 7 → G7.

### 6.1 Which daily

- `day = floor((todayUTC − DAILY_EPOCH_UTC) / 86 400 000) + 1` → "Daily #day".
- `seed(d) = YYYYMMDD` of that UTC date as an integer (e.g. `20261003`).
- `raw(d) = floor(mulberry32(seed(d))() × POOL.length)` with the standard
  mulberry32 (`t += 0x6D2B79F5; t = imul(t ^ t >>> 15, t | 1); t ^= t + imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 2 ** 32`).
- No two days in a row repeat: iterate from day 1,
  `index(d) = raw(d) === index(d − 1) ? (raw(d) + 1) % n : raw(d)`.
  O(days), microseconds for decades.
- The pool is **append-only**. Appending changes future dailies; deploy pool
  changes just after 00:00 UTC.

### 6.2 The pool (23 entries, all on existing lots, City Drive excluded)

Three kinds, all data:

- `bay`: the glowing target moves to another **empty painted bay** in the
  same row (same heading, bay size, tolerance, par, limit). Title: "{Level}
  — the glowing bay has moved".
- `no-contact`: any bump, cone or kerb strike (the ones `Scoring` already
  counts) fails the run: "Contact — this daily is no-contact." Title:
  "{Level} — no contact".
- `under-par`: the level's par becomes a hard limit (fails at `parTime`).
  **Only on levels a real driven run beat par** (1, 2, 6: 20.7/40, 28.1/60,
  15.4/45 s). Title: "{Level} — beat par: park within {par} s".

| # | Level (id) | Kind | Target / rule |
|---|---|---|---|
| 0 | Deck One (1) | bay | (10, −13.8) |
| 1 | Deck One (1) | no-contact | |
| 2 | Deck Two (2) | bay | (4, −13.8), reverse in |
| 3 | Deck Two (2) | under-par | 60 s |
| 4 | Deck Three (3) | no-contact | |
| 5 | Level B1 (4) | no-contact | |
| 6 | Level B2 (5) | no-contact | |
| 7 | Deck Four (6) | under-par | 45 s |
| 8 | Deck Five (14) | no-contact | |
| 9 | Level B3 (7) | bay | (3, −11.8) |
| 10 | Level B3 (7) | bay | (−6, −11.8) |
| 11 | Level B5 (15) | no-contact | |
| 12 | Level B4 (8) | bay | (9.6, −10.8), reverse in |
| 13 | Level B4 (8) | bay | (1.35, −10.8), reverse in |
| 14 | Level B6 (17) | bay | (4, −13.8), keeps its 110 s limit |
| 15 | Roof One (9) | no-contact | |
| 16 | Roof Two (10) | bay | (11.3, −11.8), reverse in |
| 17 | Roof Two (10) | no-contact | |
| 18 | Roof Four (16) | no-contact | |
| 19 | Roof Three (11) | bay | (14, −14.8), keeps its 45 s limit |
| 20 | Final Exam (12) | bay | (9.2, −12.8), keeps its 120 s limit |
| 21 | Final Exam (12) | no-contact | |
| 22 | Deck One (1) | under-par | 40 s |

Bays were extracted from `Levels.js`: painted (in the level's `bayRow`), in
the target's own row, with no parked car in them. Any entry
that fails `level-lint` or `drive-test` in the build is **removed, not
fixed by moving cars**, and recorded in NOTES.md.

### 6.3 How it runs

- `Retention.dailyLevel(entry, day)` returns a full level object derived
  from the base level: `{ ...base, id: base.id, daily: { day, index, kind },
  name: \`Daily #${day}\`, target: { ...base.target, pos }, timeLimit }`.
  `level-lint` and `drive-test` iterate `DAILY_POOL.map(dailyLevel)` in
  addition to `LEVELS`, so a daily can never be impossible (**0 console
  errors, every entry completable by teleport**).
- A daily is never posted: `runTracker.clear()` on load, no leaderboard block
  on its card. It never writes `progress` (it is not the level).
- Result card: tag "DAILY #12", title the entry's title, breakdown v2, fix
  box, next line "Your best today: 91" (after a replay), buttons **Retry
  (B)** (primary), **Share**, **Main menu**. `Enter` = retry. No "Next level".

### 6.4 Storage — `parking-precision:daily:v1` (new key, sign-off S1)

```json
{ "parked": 12, "lastDay": 41, "best": { "day": 41, "score": 91, "stars": 3, "timeSec": 38.2 } }
```

- `parked` — a **cumulative** count of distinct days with a parked daily.
  It only goes up. There is no "consecutive days" field and no code that
  could compute one from this record.
- `best` — today's best only; replaced when `day` changes.
- Validators: `parked` integer ≥ 0; `lastDay` integer ≥ 1 or null; `best`
  fields finite, `score` 0–100, `stars` 0–3; anything else → field dropped.

### 6.5 Where it shows (copy)

- Start menu (tutorial done): a second button under "Start driving":
  **"Today's daily"**; under the buttons, 12 px: "Daily #12: Deck Two — no
  contact · dailies parked: 12 · new daily in 7 h".
- Level select: the strip in §5.
- Never: a counter of consecutive days, "don't lose", "only today", a
  countdown with seconds, a badge for days in a row, a notification.

### 6.6 Acceptance

- AC5.1 `debugSetDate('2026-10-03')` → `debugRetention().daily` =
  `{ day: 6, index: <pinned value>, seed: 20261003 }`; the same date always
  gives the same entry, and a 400-day sweep never repeats on consecutive days.
- AC5.2 Every pool entry loads, completes by teleport, and lints.
- AC5.3 No-contact: a cone strike fails with the exact reason text.
- AC5.4 Under-par: `debugTick(par + 0.2)` fails.
- AC5.5 Parking a daily twice on the same day → `parked` +1 once; next day +1.
- AC5.6 `grep -ri streak` over `dist/` = 0 matches; the daily record has no
  field besides `parked`, `lastDay`, `best`.
- AC5.7 A parked daily sends no request (network log during the run = only
  the dev server's own files).

### 6.7 Daily leaderboard (specified, NOT built — sign-off S5)

A board per daily would need `api/` to accept a `daily` id (`day`, `index`)
next to `levelId`, a new storage key per day with a 7-day TTL, and
PRIVACY/TERMS text for it. Same generated-name rules, same unverified label.
~1 session plus review. **Recommendation: not now** — first see whether
anyone plays dailies (the cumulative count is local, so this needs a real
signal the user can see, e.g. asking players).

---

## 7. M6 — Share v2

**Mechanism:** social comparison / self-expression.

Built from the run's real numbers, handed to the clipboard (or the share
sheet on touch) by the existing `share()`; the page sends nothing.

```
Parking Precision · Deck One
96/100 ★★★ GOLD · 31.4 s
🟩🟩🟨🟩🟩
Free in your browser: https://parking-precision.vercel.app/
```

- Cells in order Placement, Depth, Alignment, Time, Clean run.
  `parts[k] / max[k] ≥ 0.9` → 🟩, `≥ 0.6` → 🟨, else ⬛.
- Medal word only if earned (GOLD / PLATINUM).
- Daily: first line "Parking Precision · Daily #12", second line the entry
  title, then the same three lines.
- No name, no handle, no identifier, no level id beyond the name.
- The button reads **"Share result"**; after copying: "Copied to clipboard".

### Acceptance

- AC6.1 Clipboard text for a seeded result equals the expected string
  exactly (probe grants clipboard permission and reads it back).
- AC6.2 Cell colours equal the thresholds applied to `result.parts`.
- AC6.3 The text contains no `getHandle()` value and no device token.

---

## 8. M7 — Personal-best ghost

**Mechanism:** mastery by racing yourself.

### 8.1 Tier (i) — static footprint, on by default (build)

- Fix: `completeLevel` reads `prev = progress.get(id)` **before**
  `progress.record()`, and gives the review `prev.bestPose` — the best you
  had *before* this run. On a first park there is no ghost.
- `showBestGhost` starts `true` when a previous best pose exists, controlled
  by a new setting `reviewGhost` (default `true`, Settings → Review →
  "Show my personal best in the review").
- Card, under the stars (`.hud-delta`):
  - first park: "First park on this level"
  - better: "**+{d}** on your best ({prev})" (mint)
  - worse: "**−{d}** on your best ({prev})" (amber)
  - equal: "Equal to your best ({prev})"
- The button becomes "Hide your personal best" / "Show your personal best".

### 8.2 Tier (ii) — live driving ghost (spec; build only on sign-off S2)

- Recording: every run samples the chassis at 20 Hz: x, z relative to the
  target (cm, int16), heading (0.1°, int16). ~6 bytes/sample → 7.2 KB per
  60 s, base64 in storage ≈ 9.6 KB. Runs over 30 KB are decimated to 10 Hz;
  over that again, not stored. Total cap 400 KB: when exceeded, the level
  with the oldest ghost loses its ghost.
- Stored only when the run becomes the new best score, under
  `parking-precision:ghost:v1` → `{ "<id>": "<base64>" }` (sign-off S1/S2).
- Replay while driving: a translucent car (the real body geometry, one
  cloned material, `opacity 0.35`, `depthWrite false`, `userData.disposable`),
  interpolated between samples. **No physics body** → sensors, radar and
  ParkCheck cannot see it (they only query the physics world). Opacity fades
  from 0 at 2.0 m to 0.35 at 5.0 m from your car, so it never fills the
  seat view at the start line.
- Setting `ghostLive` (default `true`), Settings → Review → "Race my best
  run". Off → nothing recorded or drawn.
- Acceptance: AC7.4 the ghost has no body (`bodies` count unchanged);
  AC7.5 sensor readings identical with ghost on/off at the same pose;
  AC7.6 stored bytes ≤ caps after 17 × 120 s runs.

### 8.3 Acceptance, tier (i)

- AC7.1 Park twice, second better: the ghost shows the first run's pose, the
  delta reads "+N on your best (M)" with N = score2 − score1.
- AC7.2 First park: no ghost, "First park on this level".
- AC7.3 `reviewGhost = false` → no ghost meshes visible.

---

## 9. M8 — Perfect-park juice

**Mechanism:** mastery feedback: a 99 must feel different from a 70.

| Result | Sound (after the existing 3-note `success()`) | Bay pulse |
|---|---|---|
| < 88 | nothing extra | none |
| ★★★ (88–94) | one note, 1568 Hz, 0.30 s, at +0.36 s | 1 pulse, strength 0.4 |
| Gold | two notes, 1318.5 + 1568 Hz, +0.36 / +0.48 s | 1 pulse, strength 0.7 |
| Platinum | three notes 1318.5 / 1568 / 2093 Hz at +0.36/+0.48/+0.60 s, plus a 2637 Hz sine at gain 0.03, 0.8 s decay | 1 pulse, strength 1.0 |

- New `audio.flourish(level)` (0–3) on the existing `sfxBus` → `master`, so
  the volume setting applies. Gains ≤ 0.16 (same as `success()`).
- Pulse: the target fill and posts lerp from white toward the glow colour
  over `JUICE.pulseMs = 600` ms, **once** (1.7 Hz equivalent, below the
  3 Hz flash limit). `prefers-reduced-motion: reduce` → no pulse; sound is
  unaffected. Implemented on the target's own cloned material (already
  `disposable`, `Props.js:131`).
- Acceptance: AC8.1 `debugRetention().lastFlourish` equals the tier;
  AC8.2 with reduced motion emulated, `lastPulse === null`.

---

## 10. Storage and settings summary

### 10.1 Progress v5 — `parking-precision:progress:v5`

```json
{ "1": { "stars": 3, "timeSec": 31.4, "bumps": 0, "score": 96,
         "bestPose": { "lateral": 0.04, "longitudinal": -0.02, "headingErrDeg": 0.6 },
         "medal": "gold", "fastestSec": 28.9 } }
```

- v4 fields keep their exact meaning (the best-by-score run).
- `medal`: `'gold' | 'platinum' | null`, the best ever earned (platinum >
  gold). Validator: one of the two strings, else `null`.
- `fastestSec`: fastest parked time on the level, any score. Validator:
  finite and > 0, else `null`.
- **Migration:** on first read, if v5 is absent and v4 is present, convert
  every v4 record: `medal = medalFor(score, timeSec, id)` (the only run v4
  kept), `fastestSec = timeSec`; write v5 once. **v4 is left in place**
  (read-only from then on), so rolling the build back loses nothing.
  `reset()` clears both keys.
- Acceptance: AC10.1 a stored v4 payload (all 17 levels, mixed fields,
  one hand-broken record) migrates with every v4 field equal and the broken
  record dropped exactly as `readAll()` drops it today; AC10.2 v5 present →
  v4 ignored; AC10.3 neither → `{}`.

### 10.2 Settings (no key bump; `load()` ignores unknown keys)

| Field | Default | Validator |
|---|---|---|
| `reviewGhost` | `true` | bool |
| `ghostLive` | `true` | bool (only if S2 is approved) |

### 10.3 New keys, all local (PRIVACY.md §2 must list them — S1)

`parking-precision:progress:v5`, `parking-precision:daily:v1`, and (S2)
`parking-precision:ghost:v1`. Nothing new is sent anywhere.

---

## 11. Probes

- `tools/retention-probe.mjs` (new): every AC above plus G1–G8. Game-time
  assertions with `debugTick`/`debugRig`; G1–G4 on the GPU harness (reusing
  `loop-probe`'s in-page timers). Forbidden-list checks on a fresh
  `npm run build` of `dist/`: no `Notification`, no
  `serviceWorker.register`, no `/streak/i`, `fetch(` targets only
  `/api/run`, `/api/score`, `/api/identity`, `/api/leaderboard`; and 0
  third-party requests while playing 3 levels.
- `tools/loop-probe.mjs` (Phase A): re-run for the after numbers.
- New debug hooks (dev only, like the rest of `window.__game`):
  - `debugRetention()` → `{ medal, nextGoal, lastExplain, daily: { day, index, seed, entry }, lastFlourish, lastPulse, launchHold, gear }`
  - `debugSetDate('YYYY-MM-DD' | null)` — overrides "today" for the daily
  - `debugPlayDaily(index?)` — loads today's daily, or a pool entry
  - `debugGhost()` → `{ recording, samples, bytes, visible, opacity }` (S2)
  - `debugResources()` — §2.4

## 12. Sign-off needed (brief §7)

| # | Item | Recommendation | Size | Privacy impact |
|---|---|---|---|---|
| S1 | PRIVACY.md §2 and `public/privacy.html`: list progress v5's new fields (`medal`, `fastestSec`), the new `daily:v1` key and the `reviewGhost` setting; keep "That's the lot" true | **Yes** (required for M2–M5, M7 i) | small | local only; nothing leaves the device |
| S2 | Live driving ghost (M7 ii): new `ghost:v1` key, up to 400 KB of trajectories, `ghostLive` setting default on | **Yes, default on** | ~½ session | local only; policy lists it |
| S3 | Ready in gear (M1 §2.3): retries come back in the gear you last drove off in, and level loads start in D, both held on the brake until your first input. Changes today's "every level starts in P" | **Yes, both** (G1 needs the retry part; G4 needs the load part). Fallback: retries only, G4 stays at 2 keys | small | none |
| S4 | `R` on the card: kept as it is (no removal). Nothing to approve unless you want it removed | keep | — | none |
| S5 | Daily leaderboard (server + policy) | **Not now** | ~1 session | new data sent: day/entry id with the run |
| S6 | Homepage mention of dailies and medals | later, after you've played them | copy | none |
| S7 | Author times for the 14 provisional levels | accept provisional now; fill §4.3's table after playing | — | none |
| S8 | Build here, or hand `GOAL-retention.md` to a Sonnet session | **build here** (default) | — | — |

Not needed, stated for completeness: no new npm dependency, no frozen number
retuned, no leaderboard format or `api/` change, no new level id.
