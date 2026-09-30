# Parking Precision — retention pass ("one more try")

Brief: `prompt-retention.md`. Branch `feat/retention`, cut from the tip of
`audit/popularity` (`f800ed7`) on 28 September 2026. **Nothing here has been
pushed, merged or deployed.** Pushing `main` deploys the live site.

Status (29 Sep 2026): **built and verified.** Sign-off answers are in
`GOAL-retention.md`: privacy update and live ghost approved; levels and
retries keep starting in Park; no daily leaderboard. Same day the owner also
asked for **no creep** (the car moves only while W is held) — built too.

## 1. Facts re-checked at the start (brief §1)

| Fact | Found | Receipt |
|---|---|---|
| Live production branch | `main` (unchanged) | `npx vercel api /v9/projects/parking-precision` → `link.productionBranch: "main"` |
| `audit/popularity` merged? | **No.** 19 commits ahead of `main` (`d93d9dd`), 0 behind. Working tree clean apart from the untracked `prompt-retention.md`. | `git rev-list --count main..audit/popularity` |
| Base for this pass | Tip of `audit/popularity` (`f800ed7`), per the brief's default, because the results-card work would conflict with the audit's `Hud.js` changes. No worktree needed (clean tree). | `git checkout -b feat/retention audit/popularity` |
| Restart keys | `KeyB` in play (`src/input/Input.js:50`); `R` is Reverse (`Input.js:39`); card uses hard-coded `KeyR`/`Enter` (`src/ui/Hud.js:1240-1262`) | line numbers moved since the brief was written; content matches |
| Card keys dead during the flight | `if (currentReview.phase !== 'shown') return;` at `Hud.js:1246`; `FLIGHT_SECONDS = 2.0` at `src/game/ParkingReview.js:53`; `DWELL_SEC = 0.5` at `src/game/ParkCheck.js:24` | confirmed, and measured below (A3) |
| Restart rebuilds the level | `restart` and the in-drive key call `loadLevel()` → `teardown()` + `buildLevel()` (`src/core/Game.js:210-214`, `466-469`, `310-340`) | confirmed; **cost measured for the first time** (A1) |
| Scoring constants | `WEIGHTS` 30/20/25/15/10, `PENALTY` 4/2/3, `STAR_CUTOFFS [88, 68]` (`src/game/Scoring.js:31-33`); time decays to 0 at 2.5× par (`Scoring.js:122`) | unchanged |
| Progress | key `parking-precision:progress:v4`, best-by-score, failed runs record nothing, `readAll()` drops unknown fields (`src/ui/progress.js`) | confirmed |
| PB ghost | static footprint, off by default (`ParkingReview.js:207`), button only when a best pose exists | confirmed; **plus a bug:** `completeLevel` records the run *before* handing `record.bestPose` to the review (`Game.js:395-421`), so on a new best the "personal best" ghost is the run you just made |
| Leaderboard level-id cap | `LEVEL_COUNT = 17` (`api/_lib/board.js:34`, check at `:231`) | confirmed |
| Levels | 17; four timed (B6 110 s, Roof Three 45 s, Final Exam 120 s, City Drive 420 s) | confirmed |
| Autopilot coverage | `tools/autodrive.mjs` routes levels 1, 2, 6 **and 13 (City Drive)** — 4/4 in the baseline | the brief says 1, 2, 6; City Drive has had a route since the audit |

**Doc conflicts found (trust the code):**
- Brief §1 says par times "run from 30 s to 100 s". City Drive's par is **240 s** (`CITY13.parTime`); the 30–100 s range is true of the 16 hand-authored lots.
- CLAUDE.md §8 "Last results" already says 17/17 on this branch (the audit fixed it); `main`'s copy is the stale one.
- CLAUDE.md §7.4 "levels 1-12 only" is wrong, as the brief says: the rule is `level.style === 'city'` (`ParkingReview.js:288`), so 16 of 17 levels fly.

## 2. Baseline regression (before any change)

All green. Logs: `tools/shots/retention/regress-baseline/*.log`.

| Tool | Result |
|---|---|
| level-lint | 17 levels, 0 failures, 0 warnings |
| physics-probe | done, clean |
| drive-test | **17/17**, 0 console errors |
| sensor-probe | 0 failures |
| tutorial-probe | PASS (19.5 s game time) |
| shell-probe | 0 failures |
| autodrive | 4/4 (L1 20.7 s, L2 28.1 s, L6 15.4 s, L13 241.3 s game time) |
| review-probe | 61 PASS, 0 FAIL, 0 console errors |
| leaderboard-probe | 26/26 |
| radar / chase / rebind / telemetry | 9/9, 14/14, 13/13, 12/12 |
| city-lint | 11/11 |
| needle-probe | clean (settled min 0.020 km/h) |

## 3. Phase A — where the loop loses players

Tool: **`tools/loop-probe.mjs`** (new). GPU harness: headless Chrome with
`--use-angle=metal --enable-gpu --ignore-gpu-blocklist`, AO on, 1440×900,
dev server. Keys are dispatched as `KeyboardEvent`s inside the page and timed
with `performance.now()` in the game's own frame loop, so there is no
DevTools latency in A1–A3. Outcomes (park, fail, score) are produced with
`debugTeleport`/`debugTick`, never with sleeps. Levels are looked up by
name/id. Output: `tools/shots/retention/loop-before.log` and `loop-before.json`.

### Raw numbers

**A1 — mid-run restart** (restart key → reloaded level drawn → throttle moving the car), median of 5:

| | Reload drawn | To throttle | Keys | Gear after restart |
|---|---|---|---|---|
| 16 hand-authored lots | **33–54 ms** (Roof One 54, Deck Five 46, rest 33–36) | 66–85 ms | **2** (`B`, then `F`) | **P** |
| City Drive | 331 ms (worst 374) | 366 ms (worst 401) | 2 | P |

The full rebuild is cheap. No level comes near G2's 0.5 s. The cost is the
second key: every restart puts the car back in P (`Car.js` `applySpawn` sets
`gear = 'P'`), so throttle does nothing until the player shifts.

**A2 — "Not parked" card visible → throttle** (timed levels; untimed ones cannot fail):

| Level | Card → driving | Card → throttle | Restart key (`B`) on the card | Effective keys | Presses incl. dead ones |
|---|---|---|---|---|---|
| Level B6 | 2213 ms | 2252 ms | dead | 2 (`Enter`, `F`) | 19 |
| Roof Three | 2004 ms | 2048 ms | dead | 2 | 19 |
| Final Exam | 2012 ms | 2055 ms | dead | 2 | 19 |
| City Drive | **never** | never | dead | — | 58, none worked |

The probe presses `Enter` at once and every 100 ms. Everything pressed in the
first ~2 s is swallowed (the flight). **City Drive's fail card ignores the
keyboard entirely**: the review never runs on `style: 'city'`, and
`Hud.js:516` only routes keys to the card `if (currentReview?.active)`. A
keyboard player who runs out of time on City Drive has to find the mouse.

**A3 — park completes → first card key that works:** the card itself appears
in 3–12 ms, but its keys work only after **2022–2353 ms** on the 16 lots
(18–19 dead presses each). **City Drive: never** (same bug as A2). The
buttons work with a mouse from the first frame; only the keyboard is dead.

**A4 — returning player, cold `/play/` load** (tutorial done, two levels on
record; dev server, machine time, no human reaction): start menu ready with
"Start driving" focused at **570–591 ms**; car moving at **1262–1278 ms**.
Keys: `Enter` (Start driving) and `F` (out of Park) before throttle does
anything, so **2** non-driving presses. AUDIT-REPORT.md has no load-to-input
number to reuse; its closest is `/play/` Lighthouse desktop 85 / TBT 280 ms
(live site).

**A5 — card clarity**, 17 levels × 3 teleported poses (dead centre; 30 cm
lateral; 8° heading, capped at 7.5° to stay inside Final Exam's 8°):

| Pose | Scores | Names the biggest loss | Gives points recoverable | Gives a concrete fix |
|---|---|---|---|---|
| Dead centre | 100 on all 17 | 0/17 | 0/17 | 0/17 |
| 30 cm lateral | 76–84 | 0/17 | 0/17 | 0/17 |
| 7.5–8° heading | 77–84 | 0/17 | 0/17 | 0/17 |

The card lists points *earned* per part ("30 cm off centre · 14") and a
"Where you stopped" sentence ("30 cm right, 0.0°. Gaps: gap 81 cm, gap 92
cm"). A player has to know that placement is out of 30 to see they lost 16
there, and nothing says how far they are from the next star.

**A6 — 3-star dead end** (every level seeded 3 stars / 95): results card with
a next goal **0/17**; level-select card with a next goal **0/17** (a card
reads `LEVEL 1 | Deck One | Forward pull-in | OPEN DECK | ★★★ | best 95`).
Screenshot `tools/shots/retention/loop-levelselect.png`.

**A7 — dead time per attempt** (park dwell + card keys dead + restart to throttle):
2.59–2.92 s on the 16 lots, which is **2.6–8.8 % of a par-length attempt**
(Roof Three worst: 2.64 s against a 30 s par). City Drive: not finite by
keyboard.

**Leak check** (20 restarts of Level B4, `debugBenchmark(30)`): 1558 → 1559
draw calls per frame, 4.22 → 4.17 ms. Draw calls are flat. Geometry,
texture and body counts are not reachable from today's debug hooks; Phase C
adds `debugResources()` so the 20-restart check can assert them too.

**Genuine-run sanity:** `autodrive` parks levels 1, 2, 6 and 13 with real
key events (baseline 4/4). It ends through the same `completeLevel()` →
`review.enter()` → `showReviewResults()` path the teleported runs use, and
the flight length does not depend on how the car got there, so A3's numbers
hold for a driven park. Its game times (20.7 / 28.1 / 15.4 s) are the only
human-independent driven times on record and become the author times for
levels 1, 2 and 6 (§5).

### Ranked leak table

Ranked by player-seconds lost per attempt, then by how often it bites.

| # | Leak | Measured | Receipt | Player cost per attempt |
|---|---|---|---|---|
| 1 | **City Drive's results and fail cards ignore the keyboard** | A2/A3: 0 of 58 and 0 of 54 presses worked | `Hud.js:516` routes keys only while `currentReview?.active`; `ParkingReview.js:288` never activates on `style: 'city'` | Unbounded: the player must reach for the mouse at the end of a 4-minute level |
| 2 | **Card keys dead for the 2 s flight**, after every park and every fail | A3 2022–2353 ms; A2 2004–2213 ms; 18–19 dead presses | `Hud.js:1246`, `ParkingReview.js:53` | ~2.1 s, plus the "is it broken?" moment when Enter does nothing; 100 % of attempts |
| 3 | **Every restart leaves the car in Park** | A1/A2: 2 keys every time; gear after restart = P | `Car.js` `applySpawn` → `gear = 'P'` | 1 extra key and the time to remember it; 100 % of retries. The audit already had to add an "In Park" hint for the first run (AUDIT #19) |
| 4 | **The card never says what cost the points or what the next star needs** | A5: 0/51 poses name the biggest loss, 0/51 give points recoverable, 0/51 give a fix | `Scoring.js:138-165` (points earned only) | The retry has no target. A 76 and an 84 look alike unless you do the subtraction per part |
| 5 | **Nothing to do on a 3-star level** | A6: 0/17 card, 0/17 level select | `Hud.js:597-625` | Replay value of a finished level ≈ 0; with all levels unlocked, a good player runs out of goals in 17 parks |
| 6 | **Three different retry keys** (`B` in play, `R`/`Enter` on the card, nothing on the card for `B`) | A2: `B` on the card is dead | `Input.js:50`, `Hud.js:1250-1257` | Players who learn `B` press it on the card and nothing happens |
| 7 | **No reason to open the game tomorrow** | G7 = 0 | no daily, no rotating content | Return visits rely on the player remembering the game exists |
| 8 | **The "personal best" ghost is off by default, and wrong on a new best** | `showBestGhost = false`; `completeLevel` passes the just-written record | `ParkingReview.js:207`, `Game.js:395-421` | The one self-comparison tool is hidden, and misleading when found |
| 9 | Returning player needs 2 keys before throttle (`Enter`, `F`) | A4: 0.59 s to menu, 1.27 s to moving (machine time) | `Game.js:192-196` + `applySpawn` | 1 extra key; time is already well under 5 s |
| 10 | The rebuild itself | A1: 33–54 ms, City 331 ms | `Game.js:310-340` | ~0. **Reset-in-place is not worth building** (see §4) |

## 4. Phase B — chosen and rejected mechanics

Full spec: `design/SPEC-retention.md`. Prototypes: `design/retention/`.

### Chosen (8)

| # | Mechanic | Mechanism | Moves | Predicted after |
|---|---|---|---|---|
| M1 | **Instant retry**: one retry key (`restart`, default `B`, rebindable) everywhere, including both cards and during the flight; `Enter` acts at once during the flight; the car comes back **in the gear you last drove off in, held on the brake** until your first input; City Drive cards get keyboard control | Mastery curve (fast, cheap iteration is what makes a precision game compulsive) | Leaks 1, 2, 3, 6, 9 | G1 ≤ 0.2 s / 1 key; G2 ≤ 0.1 s (City ≤ 0.4 s); G3 0 ms; G4 1 key |
| M2 | **Where the points went**: points lost per part, the biggest loss highlighted, one sentence with the fix and its value, and the distance to the next tier | Goal gradient + mastery | Leak 4 | G5 17/17 |
| M3 | **Medals above 3 stars**: Gold (≥ 95) and Platinum (≥ 98 **and** under an author time) | Goal gradient / completion | Leak 5 | G6 17/17 |
| M4 | **Mastery map** in level select: medal, PB score, PB time, next goal per level; summary line | Completion | Leak 5 | G6 17/17 in level select |
| M5 | **Daily challenge**: one per UTC day, same for everyone, from a linted pool of variants of existing lots; a cumulative count, never a streak | Variable-but-fair challenge + curiosity | Leak 7 | G7 = 1 |
| M6 | **Share v2**: the audit's line plus a 5-cell result row from real per-part thresholds, medal, and "Daily #N" | Social comparison / self-expression | (word of mouth) | Every share carries the run's shape, not just a number |
| M7 | **Personal-best ghost, tier (i)**: the PB footprint on by default in the review, fixed to show the *previous* best, with a "+3 vs your best" readout. **Tier (ii)** (live driving ghost) is fully specified but built only after privacy sign-off | Mastery (racing yourself) | Leak 8 | PB delta on 16/16 flown levels |
| M8 | **Perfect-park juice**: a chime layered on the existing success sound and a single bay-glow pulse, both scaled to the real score and medal | Mastery feedback | (feel) | A 99 sounds and looks different from a 70 |

### Rejected

| Candidate | Why not |
|---|---|
| Reset-in-place restart (part of candidate 1) | Measured: the full rebuild costs 33–54 ms (City 331 ms), all under G2's 500 ms. A second restart path would add leak risk for no player-visible gain. The 20-restart resource check is kept anyway. |
| Skippable flight *as its own mechanic* (candidate 2) | Folded into M1: the flight stays the default for players who wait; any card key ends it. |
| Skill-earned paints (9) | The seat view barely shows your own car (only chase camera, review and a photo mode would), so the reward is mostly invisible; it also adds a stored field and a settings surface. Medals carry the same "earned by skill" signal where the player actually looks. Revisit with photo mode. |
| Photo mode (10) | Agreed in CLAUDE.md §10, but it is a camera + capture feature, not a loop mechanic, and it would push this pass past its size. Kept for its own spec. |
| Hard variants (11) | Medals give a "harder goal" on every level with no new level ids, no `LEVEL_COUNT`/server change and no new lint surface. The daily pool already reuses the "no contact" / "under par" rules as variants. |
| Speedrun splits (12) | Only City Drive has stages; one level does not justify the UI. The PB time and author time cover the speed goal everywhere. |
| PNG result card (optional part of 7) | Canvas rendering and a download flow for something the text row already does; revisit if players ask for images. |
| `?playtest` overlay (optional, Phase A) | Not cheap: it would need the loop-probe timers inside the game loop. `loop-probe` gives the same numbers on demand. |

## 5. Targets G1–G8

Before: `loop-before.json`. After: `loop-after.json` (same probe, same GPU
harness) and `tools/retention-probe.mjs` (54/54).

| # | Target | Before | After | Met? |
|---|---|---|---|---|
| G1 | Fail card → throttle ≤ 1.5 s, 1 key | 2048–2252 ms, 2 keys; City Drive: never by keyboard | **66–348 ms**, 2 keys (`B`, then `F`); City Drive fixed | Time **yes**. Keys **no — 2**: levels and retries start in Park by the owner's decision (S3 declined) |
| G2 | Mid-run restart → throttle ≤ 0.5 s | 66–85 ms (City 366 ms) | 66–85 ms (City 333 ms) | **Yes** |
| G3 | Park → Retry/Next keys working ≤ 0.5 s | 2022–2353 ms, 18–19 dead presses; City never | **30–312 ms** (the time to load the next level), 0 dead presses; City fixed | **Yes** |
| G4 | `/play/` → first driving input ≤ 5 s, ≤ 1 key | 1.27 s, 2 keys | 1.57 s (dev server), 2 keys (`Enter`, `F`) | Time **yes**. Keys **no — 2**, same Park decision |
| G5 | Card names biggest loss + its value, 17/17 | 0/17 | **34/34** off-centre parks (17 levels × 2 poses); centre parks say "Nothing to fix." | **Yes** |
| G6 | 3-star level shows a next goal on card and level select | 0/17, 0/17 | **17/17, 17/17** | **Yes** |
| G7 | Exactly 1 no-punishment reason to return | 0 | 1: the daily challenge (cumulative count, no streak) | **Yes** |
| G8 | 0 forbidden-list items | 0 by hand | retention-probe on a fresh `dist/`: no `Notification`, no `serviceWorker.register`, no "streak", `fetch` only to `/api/*`; 0 third-party requests | **Yes** |

Dead time per attempt (A7): 2.59–2.92 s before (2.6–8.8 % of a par run),
**0.60–1.14 s** after (at most 2 % of a par run; City Drive now finite).

## 5b. Phase C — what was built

One commit per logical change on `feat/retention`, no trailers:

- `6c7a951` No creep (owner's request): D/R move only while W is held;
  engine braking above 1.1 m/s, then a 0.8 m/s² roll-down and a dead stop
  under 0.1 m/s on the flat. A first version that stopped dead at every
  lift-off made autodrive clip a parked car on City Drive — replaced.
- `946f6bd` Retention pass: card keys (retry + Enter live during the flight,
  City Drive cards fixed), results card v2, medals, mastery map, daily
  challenge (23 variants), share v2, PB footprint fix + default on, live
  ghost car, juice, progress v5 migration, privacy text.
- `29d05a2` Probes: level-lint and drive-test cover every daily variant;
  `retention-probe.mjs`; autodrive no longer counts a time-out as a park.

Author times after the creep change (real autodrive runs): Deck One 21.3 s,
Deck Two 29.0 s, Deck Four 15.7 s. The other 14 are provisional (par × 0.8).

## 5c. Regression (after)

| Tool | Result |
|---|---|
| level-lint | 17 levels + 23 daily variants, 0 failures, 0 warnings |
| physics-probe | clean |
| drive-test | **17/17** + **23/23** daily variants, 0 console errors |
| sensor / tutorial / shell | 0 failures / PASS / 0 failures |
| autodrive | 4/4, all real parks (L1 21.3 s, L2 29.0 s, L6 15.7 s, L13 244.7 s) |
| review-probe | ALL PASS |
| retention-probe | 54/54 |
| loop-probe | 0 console errors; 20 restarts: geometries 294, textures 145, programs 26, objects 1699, bodies 37, draw calls 1559 — identical to the first load |
| radar / chase / rebind / telemetry / needle | 9/9, 14/14, 13/13, 12/12, clean |
| leaderboard-probe / city-lint | 26/26, 11/11 |
| site-probe | 66/66 (dev) |

## 6. Sign-off (answered 29 Sep 2026)

See `GOAL-retention.md`. Still open for the owner: replace the 14
provisional author times with real runs (SPEC §4.3), and decide later on a
daily leaderboard (server change) and a homepage mention.

## 7. Screenshots

All under `tools/shots/retention/` (gitignored; regenerate with
`node tools/loop-probe.mjs` and `node tools/shots/retention/protoshots.mjs`).

- Phase A: `loop-levelselect.png` (today's level select, 3-star dead end).
- Phase B prototypes: `proto-results-card.png` (results card v2),
  `proto-failed-card.png` (fail card + daily card), `proto-mastery-map.png`
  (+ `-390`), `proto-share.png` (share output), `proto-medals.png`,
  `proto-ghost.png`, `proto-results-card-390.png`.
- Phase C (built, GPU harness): `built-results-card.png` (card v2 on Deck
  Two: biggest loss, fix, next tier, PB delta), `built-failed-card.png`,
  `built-mastery-map.png`, `built-ghost.png` (regenerate with
  `node tools/shots/retention/builtshots.mjs`). Share output is plain text,
  checked verbatim by retention-probe AC6.1.
