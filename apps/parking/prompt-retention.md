# PROMPT — make Parking Precision the game players can't stop replaying (retention design + build)

Written 28 September 2026. The facts in §1 were checked against the repo that
day, at `main` = `d93d9dd` and branch `audit/popularity` = `9a15371`. Re-check
them before you rely on them (§1 says how).

**Implementer: Opus 5.5, high effort.** This is a saved prompt. Paste it into
a fresh Claude Code session opened in `/Users/dakshgiis/parking-game-v1`.

---

## 0. Mission

`prompt.md` (the popularity audit) got strangers to **find** the game and
**start** it. This pass covers what happens **after the first park**: the
player retries a failed level at once, replays a 3-star level for a better
tier, and comes back tomorrow. It must be a compulsive but fair "one more try"
loop, the loop Trackmania, Wordle, Geoguessr, Getting Over It, Celeste and
Flappy Bird run on. The pull comes from mastery, curiosity, fair competition
and self-expression, never from manipulation.

Measurable goals. Measure every one of them in Phase A before you change
anything, and again at the end:

| # | Goal | Target |
|---|---|---|
| G1 | Fail ("Not parked" card shown) to car accepting throttle again | **≤ 1.5 s** wall clock, **1 keypress** |
| G2 | Mid-run restart key to car accepting throttle again | **≤ 0.5 s** wall clock on the GPU harness (§5 Phase A) |
| G3 | Park to "Retry/Next" keys working on the results card | **≤ 0.5 s** (today the keys are dead for the whole 2.0 s review flight) |
| G4 | `/play/` load to first driving input, returning player | **≤ 5 s** and **≤ 1** keypress/click |
| G5 | Every results card states the **single biggest point loss** and **how many points** fixing it is worth | 100% of parked results, all 17 levels |
| G6 | Every level that already has 3 stars still shows **≥ 1 concrete next goal** (a higher tier, a time to beat, a daily) on the card **and** in level select | 17/17 levels |
| G7 | A reason to open the game tomorrow that does **not** punish skipping a day | exactly 1 (e.g. a daily), with no streak counter that can reset |
| G8 | Nothing in §2.2 (the forbidden list) exists anywhere in the build | 0 violations (checked by `retention-probe`) |

G1 to G4 are wall-clock UX numbers, which is why they are measured on the GPU
harness and not with `debugTick` (see §5 Phase A).

---

## 1. Verified facts (as of 28 Sep 2026; re-check, don't assume)

Re-verify these at the start and record what you found in `RETENTION-REPORT.md`.

**Deploy and branches**
- **Live production = `main`.** Check with
  `npx vercel api /v9/projects/parking-precision` and read
  `link.productionBranch`. Every `git push origin main` goes to
  https://parking-precision.vercel.app within about a minute. If the
  production branch is no longer `main`, stop and re-read this section.
- **`audit/popularity` is not merged.** When this prompt was written it sat
  14 commits ahead of `main`, with uncommitted edits to `CLAUDE.md` and
  `NOTES.md` from the audit session. Those commits touch `src/ui/Hud.js`,
  `src/core/Game.js`, `src/net/leaderboard.js` and the results card. The
  "Share score" button is one of them (`9a15371`).
  - **Conflict with CLAUDE.md.** CLAUDE.md §11 says to expect `main` at
    `5df34e4` or later. It also calls the audit "done", but done only means
    finished on its branch. Trust `git` over the doc.
  - **Default:** branch `feat/retention` from `main` if `audit/popularity`
    has been merged by the time you start. Otherwise branch from the tip of
    `audit/popularity` and say so in the report, because the results-card
    work would conflict with the audit's Hud.js changes.
  - If the working tree is dirty when you start, **do not stash, reset or
    commit someone else's edits.** Another session may be working in this
    folder. Ask the user, or work in a git worktree
    (`git worktree add ../pp-retention -b feat/retention <base>`).

**The loop today.** Each fact comes with its receipt. Re-read the lines.
- **Restart keys are inconsistent.**
  - While driving, restart is `KeyB` (`src/input/Input.js:50`, action
    `restart`, rebindable).
  - On the results card, `KeyR` restarts and `Enter` means next or replay
    (`src/ui/Hud.js:1248-1268`). These are hard-coded and not rebindable.
    `R` is also the Reverse gear while driving (`Input.js:39`).
  - The failed card has only a "Try again" button plus Enter/R
    (`Hud.js:1394-1412`).
- **Card keys are dead during the review flight.**
  `if (currentReview.phase !== 'shown') return;` (`Hud.js:1254`) ignores
  H/R/Enter/Esc until the flight settles. The flight lasts
  `FLIGHT_SECONDS = 2.0` (`src/game/ParkingReview.js:53`). The park itself
  needs a `DWELL_SEC = 0.5` hold (`src/game/ParkCheck.js:24`).
- **Restart rebuilds the level from scratch.** `restart` and the in-drive key
  both call `loadLevel(levelIndex)`, which runs `teardown()` and then
  `buildLevel(...)` (`src/core/Game.js:208-211, 462-465, 278-330`). Nobody
  has measured the cost.
- **Scoring** (`src/game/Scoring.js`):
  - `WEIGHTS = { placement: 30, depth: 20, alignment: 25, time: 15, finesse: 10 }`
    (line 31)
  - `PENALTY = { bump: 4, cone: 2, kerb: 3 }` (line 32)
  - `STAR_CUTOFFS = [88, 68]` (line 33)
  - Time gives full marks at or under par and decays to 0 at 2.5× par
    (line 122).
  - The breakdown shows the points each part earned. It does not show the
    points each part lost, and it does not say which loss was biggest.
- **Progress** (`src/ui/progress.js`, key `parking-precision:progress:v4`):
  - Stores the best run per level: `{stars, timeSec, bumps, score, bestPose}`.
  - Ranks by score first, then by stars and time.
  - A failed run records nothing (`Game.js:366`).
  - `readAll()` rebuilds every record field by field, so an unknown field is
    dropped on read. Any new stored field needs its own validator.
- **The personal-best "ghost" is a static footprint, not a driving ghost.**
  - It is drawn in the review overlay only, and it is off by default
    (`showBestGhost = false`, `ParkingReview.js:207`).
  - The card shows the "See your personal best" button only when a best pose
    exists (`Hud.js:1384-1386`).
  - There is no recorded trajectory anywhere.
- **Level select** (`Hud.js:605-625`) shows stars and "best N" per level.
  **All levels are unlocked**, a recorded decision (NOTES.md, "Levels are
  all unlocked"). Do not add gating.
- **Share.** On `audit/popularity`, "Share score" copies one line
  (`Hud.js:1368-1382`), e.g. `I parked Deck One in Parking Precision:
  82/100 ★★☆ in 31.4 s. Free in your browser: <url>`. It uses the share
  sheet only on coarse pointers, and the page sends nothing.
- **Leaderboard.**
  - Best run per browser per level, labelled **unverified**.
  - Posting is automatic unless the player opts out (`leaderboardAutoPost`,
    `src/ui/settings.js:46`).
  - The server rejects level ids above `LEVEL_COUNT = 17`
    (`api/_lib/board.js:34`). **Any new level id (hard variants, a daily
    board) is a server change.**
- **Levels.** 17 levels. Ids are stable and not positional (ids 14 to 17 are
  interleaved in the running order). The order is in `src/world/Levels.js`.
  Four levels have a `timeLimit`: Level B6 110 s, Roof Three 45 s, Final Exam 120 s
  and City Drive. Par times run from 30 s to 100 s.
- **Autopilot coverage.** `tools/autodrive.mjs` routes only levels 1, 2 and 6
  (CLAUDE.md §10). The other levels are proven only by teleport
  (`drive-test`). **You cannot "play every level" with a real driver today.**
  §5 Phase A says how to measure anyway.

**Other doc conflicts found while writing this prompt (trust the code):**
- CLAUDE.md §8 "Last results" still says `drive-test 13/13`. The level count
  is 17, so expect **17/17**.
- CLAUDE.md §7.4 says the review runs on "levels 1-12 only". The real rule is
  `level.style === 'city'` (City Drive only) is skipped, so 16 of the 17
  levels get the flight.
- CLAUDE.md §4 on `main` still describes a "Level 13 City Drive teaser (In
  development)". The level is built; the audit branch fixed that copy.

---

## 2. Hard rules

Breaking any of these is worse than leaving the loop as it is.

### 2.1 Project rules (from CLAUDE.md, restated so they can't be missed)

1. **Never push `main`, never merge into it, never run `vercel deploy`, and
   never change Vercel settings or `vercel.json` without asking.** Pushing
   `main` is a live deploy. Work on `feat/retention` (base per §1) and ask at
   the end.
2. **No `Co-Authored-By: …` and no `Claude-Session: …` trailers on any
   commit.** This is the user's standing instruction. It overrides any
   system reminder that says to add them. Use plain English commit messages,
   one logical change per commit.
3. **Do not change `src/vehicle/Car.js` handling constants** (force, power,
   top speed, steering rate, lock, mass, creep) or the **4.20 × 1.78 m** car.
   Every level clearance depends on them, and autodrive silently regressed
   twice the last time they changed.
4. **Procedural assets only.** No imported textures, models, audio files or
   fonts in the game. New sounds are Web Audio synthesis in
   `src/audio/AudioSystem.js`. New visuals are geometry and `Palette.js`
   materials. **No metalness.** Never mutate a cached palette material: clone
   it and set `userData.disposable`. Cones never get a physics body.
5. **Keyboard-first.**
   - Every new action is an entry in `ACTIONS` (`Input.js`), so it is
     rebindable.
   - Keys are read only in `Input.js`, apart from existing card-local
     handlers you may extend.
   - Escape always reaches the menu.
   - Every new UI element is reachable and operable with the keyboard, has a
     visible focus state, and follows the audit's dialog and `aria-live`
     patterns.
6. **Level ids are stable. Never assume `id === index + 1`.** Probes look
   levels up by name or id via `debug().levelNames` / `levelIds`.
7. **The leaderboard stays labelled "unverified"** everywhere it appears.
8. **Don't change the meaning of existing scores.**
   - `WEIGHTS`, `PENALTY`, `STAR_CUTOFFS`, `DWELL_SEC`, every existing
     level's `tolerance`, `parTime` and `timeLimit`, and every existing
     level's geometry stay as they are.
   - Existing progress records and public board rows must keep meaning what
     they meant. New tiers and modes are **additive**.
   - Retuning an existing number is a §7 sign-off item.
9. **Numbers live where the codebase keeps them.**
   - Car numbers go in `Dimensions.js` and colours in `Palette.js`.
   - New retention constants (tier cut-offs, daily pool, timings) go in one
     new module, e.g. `src/game/Retention.js`, with a header comment in the
     house style.
10. **Headless timing.** Assert simulation outcomes with
    `window.__game.debugTick(s)` / `debugRig(s)`, never with wall-clock
    sleeps. The only exception is the G1 to G4 latency measurements, which
    run on the GPU harness (§5 Phase A).

### 2.2 The forbidden list

The audience includes school-age players. None of the following may be
designed, built or even stubbed:

- Loot boxes, gacha, mystery rewards, random drops, or any reward gated by
  real time or by money. **No monetisation of any kind.**
- **Streaks that can be lost.** No consecutive-day counters, no "don't break
  your streak" copy, no grace-period tokens.
  - A plain cumulative count that only goes up ("dailies parked: 12") is
    allowed.
- FOMO: countdown timers to a reward, "only today" or "last chance" copy,
  expiring rewards, fake scarcity, push or browser notifications,
  `Notification.requestPermission`, service-worker push, or email capture.
  - Showing when the next daily unlocks (e.g. "new daily in 7 h") is allowed
    as plain information: small, and not on the results card.
- **Manufactured near-misses.** The score, the stars, the tiers and every
  "so close" message must come from the real run. Never inflate, round up,
  fake a close call or adjust difficulty in secret.
- **Auto-advance.** Never load the next level, or restart, without a player
  input. Every continuation is one deliberate key or click.
- **No new tracking or analytics**: no measurement script, no event logging,
  no third-party requests, no fingerprinting, no accounts, no free-text
  names or messages.
  - Any **new data sent to the server** (a new API field, endpoint or level
    id) needs `PRIVACY.md`, `public/privacy.html`, `TERMS.md` and
    `public/terms.html` updated in the same commit, **plus the user's
    sign-off first** (§7).
  - Any **new `localStorage` key or field** must be added to PRIVACY.md §2.
    That section lists everything stored and ends "That's the lot", so it
    would become false. Update `public/privacy.html` in the same commit.
- Sharing stays passive. Share output is text or an image produced on the
  device and handed to the clipboard, the OS share sheet or a download.
  The page itself never uploads anything.

---

## 3. Before you start: read these (mandatory)

- In full: `CLAUDE.md`, `NOTES.md` (the decision log; don't re-litigate an
  entry without a new reason), `prompt.md`, `AUDIT-REPORT.md` (don't redo
  its findings), `src/game/Scoring.js`, `src/ui/progress.js`,
  `src/world/Levels.js`, `src/net/leaderboard.js`, `PRIVACY.md`.
- Skim `ARCHITECTURE.md`, `design/README.md`, `src/game/ParkingReview.js`
  (flight and ghost), `src/core/Game.js` (`loadLevel`, `completeLevel`,
  `failLevel`, `simulate`), `src/ui/Hud.js` (`showReviewResults`,
  `showReviewFailed`, `reviewKeyboard`, `showLevelSelect`) and
  `src/input/Input.js`.

**Out of scope, because the audit owns it:** SEO, homepage copy and layout,
first-visit bounce, touch controls, and portal or community launch. If a
retention feature needs a homepage mention, that is a §7 item.

---

## 4. Setup and baseline

1. `git status` and `git log --oneline -5` on both `main` and
   `audit/popularity`. Pick the base per §1, then create `feat/retention`
   (or a worktree).
2. `npm install && npm install --no-save puppeteer-core`. Any later
   `npm install <pkg>` prunes puppeteer, so reinstall it after one.
3. `npx vite --port 5175 --strictPort --force` in the background. The game
   is at `http://localhost:5175/play/`.
4. Run the full regression from §6 and record the results as the baseline.
   If something is already red, say so, and don't later blame your own
   changes for it.

---

## 5. Work phases

### Phase A — Diagnose the current loop (measure, don't guess)

Write `tools/loop-probe.mjs`. It runs on the **GPU harness**: headless Chrome
with `--use-angle=metal --enable-gpu --ignore-gpu-blocklist`, AO on, ~60 fps
on this M1 Pro. Wall-clock numbers are meaningful there, unlike under
swiftshader. For **all 17 levels**, resolved by name or id, it measures:

| Metric | How |
|---|---|
| A1 restart latency | `performance.now()` from dispatching the restart key to the first frame with `debug().state === 'driving'` and throttle producing wheel force. Take the median of 5 runs and the worst. |
| A2 fail to driving | Force a fail on each timed level: teleport away from the bay in N, then `debugTick` past the limit. Time from "Not parked" card visible to driving, counting both keypresses and milliseconds. Skip untimed levels and note that they are untimed. |
| A3 park to card usable | Teleport onto the target pose (this completes the level; see the §8 probe traps in CLAUDE.md), then time until Enter/R have an effect. |
| A4 load to input | Cold `/play/` load with stored progress (a returning player) to the first accepted driving input. Count the clicks and keys needed. Reuse the audit's numbers if AUDIT-REPORT.md already has them, and cite them. |
| A5 card clarity | For each level, park at 3 deliberate poses via teleport: dead centre, 30 cm lateral, 8° heading. Record whether the card (a) names the biggest loss, (b) gives points recoverable, (c) gives a concrete fix. Today all three are expected to be "no". Confirm it. |
| A6 3-star dead end | Seed progress with a 3-star, score-95 record on every level. Check whether the card and level select show anything left to do. |
| A7 dead time | Total seconds per attempt spent not driving: dwell, flight, card, reload. Compare each with the time spent driving. |

- Drive the levels autodrive supports (1, 2, 6) for real as a sanity check
  that teleport-based numbers match a genuine run.
- **Do not author new autodrive routes** for this pass. They are useful but
  out of scope.

**Deliverable:** a ranked table in `RETENTION-REPORT.md` of where the loop
loses players. Each row names the leak, gives the measured number and its
receipt (probe output or file:line), and estimates the player-seconds lost
per attempt. This table drives Phase B's choices.

**Optional, owned by the user:** a local-only `?playtest` overlay that shows
the A1 to A7 numbers live, for the user to watch friends play. It must log
only to the on-screen overlay and the console, never to storage or the
network. Build it only if it is cheap.

### Phase B — Design (design-first; spec before code)

Pick **5 to 8** mechanics. For each one, write down:

- **(a) Mechanism.** One of: mastery curve, goal gradient,
  variable-but-fair challenge, social comparison, collection or completion,
  curiosity or unlock, self-expression. Add one sentence on why it fits
  **this** game.
- **(b) Phase A number.** Which Phase A row it moves, and its predicted
  after-value.
- **(c) What it costs.** Files touched, plus any server, privacy or storage
  change. Anything in §7 means it waits for sign-off.

**Candidate pool.** Evaluate every candidate and build only the chosen ones.
Record the rejected ones with a reason. The notes give today's state (§1)
and the constraints.

1. **Instant restart.** One consistent retry key everywhere: in play, on the
   failed card and on the results card, **including during the flight**
   (pressing it skips the flight).
   - Unify `B` and the card's hard-coded `R`. `R` is Reverse while driving,
     so decide explicitly and write the reason down.
   - Make it rebindable through `ACTIONS`.
   - Target G1/G2 ≤ 1.5 s / ≤ 0.5 s. If `loadLevel`'s full rebuild is the
     cost, design a reset-in-place path that respawns the car, resets
     scoring, cones and sensors, and does not rebuild geometry. Prove there
     are no leaks: equal draw calls, geometries and bodies after 20
     restarts.
2. **Skippable review flight.** Any card key within the 2.0 s flight jumps
   straight to "shown". The flight stays the default for players who wait.
3. **"Where the points went" breakdown.**
   - Per component: points lost, the biggest loss highlighted, and one
     concrete sentence built from the real numbers, e.g. "22 cm left of
     centre cost you 11 points: straighten before the final metre".
   - The card also shows the **next tier's distance**: "4 points to ★★★".
   - Everything is derived from `Scoring.finish()` output. No new scoring
     maths may change the score.
4. **Personal-best ghost.** Two tiers; spec both and pick.
   - **(i)** Make the existing static footprint ghost **on by default** in
     the review, with a PB delta readout ("+3 vs your best").
   - **(ii)** A **live driving ghost**: record the PB run's pose at 20 Hz
     (x, z, heading, quantised). About 1 min × 20 Hz × 3 floats is roughly
     10 KB as JSON; state a per-level cap and a total cap (e.g. ≤ 30 KB per
     level, ≤ 400 KB total). Replay it as a translucent car while driving.
     Toggle in Settings; decide the default in the spec.
   - Local only: new storage fields, so PRIVACY.md §2 applies and it is a
     §7 item.
   - The ghost must not collide or trigger sensors, radar or park detection.
5. **Medal tiers above 3 stars.** Additive, keeping `STAR_CUTOFFS`.
   - For example a "Gold" tier (score ≥ 95) and a "Platinum" or "author"
     tier (score ≥ 98 **and** time ≤ a per-level author time).
   - **Every threshold must be proven achievable.** Use the teleport-perfect
     score to show the score part is reachable.
   - For author times, use a real autodrive run where one exists (levels 1,
     2, 6). For the rest, use a conservative estimate (e.g. par × 0.8)
     marked **"provisional, needs a human run"**, with a table the user can
     fill in after playing.
6. **Daily challenge.** One per UTC day, the same for everyone, with **no
   streak.**
   - **Default design, which needs no server:** a deterministic seed from
     the UTC date (state the hash, e.g. mulberry32 of `YYYYMMDD`). It picks
     from an **authored, lint-validated pool** of variants on existing
     levels: an alternative target bay, a different spawn pose, or
     "no-contact" or "under par" rules.
   - Every pool entry is a data entry that `level-lint` and `drive-test`
     validate, so a daily can never be impossible.
   - Result is local only. Share line: "Daily #N".
   - A **daily leaderboard** is a server and privacy change, so it is a §7
     item. Spec it but don't build it.
7. **Shareable result, Wordle-style.** Extend the audit's one-line share with
   a 5-cell emoji row, one cell per score component, from real
   thresholds (e.g. 🟩 ≥ 90% of the component, 🟨 ≥ 60%, ⬛ below). It
   includes the level name or "Daily #N" and the tier. It contains no name
   and no identifier.
   - Optional: a device-rendered PNG result card (canvas, `toBlob`, then
     download or share sheet). Never uploaded.
8. **Level-select mastery map.** Each level shows its tier, PB score, PB
   time, and the next goal. There is also a summary line: "Tiers: 9/17 gold,
   2/17 platinum". Levels stay unlocked.
9. **Skill-earned cosmetic paints.**
   - Unlocked by tiers or totals, never by chance or time.
   - Colours go in `Palette.js`, with no metalness.
   - They are visible in chase camera, the review flight and photo mode (the
     seat view barely shows your own car; say so in the spec).
   - Local storage, so a §7 item.
10. **Photo mode.** Already agreed in CLAUDE.md §10.
    - A free camera within limits, HUD hidden, the capture saved to the
      device via download.
    - Keep it small, or split it into its own spec if it grows past about a
      day of build time.
11. **"Hard" variants of existing levels.** Tighter tolerance or a time
    limit.
    - These must be **new level ids** (≥ 18) or a mode flag that is **not**
      posted to the board. New posted ids mean a `LEVEL_COUNT` and server
      change, so a §7 item.
    - Each one is linted and proven completable.
12. **Speedrun timer with splits.** The timer is already live in the HUD.
    Splits are for multi-stage levels only (City Drive: street, ramp
    storeys, roof). Compare against the PB splits stored locally.
13. **Juice.** A perfect-park moment: a synthesised chime layered on
    `audio.success()`, and a brief bay-glow pulse.
    - Respect the volume setting and `prefers-reduced-motion`.
    - **No flashing faster than 3 Hz.**
    - Scale the feedback to the real score, so a 99 feels different from a
      70.

For each chosen mechanic, **`design/SPEC-retention.md`** gives:

- exact numbers and timings (ms), and UI states with the copy, word for word
- keyboard map changes
- the `progress.js` schema change: bump to a **new versioned key**
  (e.g. `parking-precision:progress:v5`), migrate from v4 on first read, and
  keep reading v4 if v5 is absent. Every new field gets its own validator,
  in the file's re-validate-don't-trust style.
- settings fields, which need no key bump (`settings.load()` ignores unknown
  keys; NOTES.md, HUD customisation entry)
- privacy impact
- acceptance criteria, each one testable by `retention-probe`

Prototype every visual element (results card v2, mastery map, share output,
medal badges, ghost look) as static HTML in **`design/retention/`**, using
the game's real HUD CSS tokens. Add a row to `design/README.md`.

**Then stop at §7** with one batched sign-off request.

### Phase C — Build

1. **Write `GOAL-retention.md`** at the repo root. A Sonnet/medium session
   must be able to build it with **no further decisions**. It contains:
   - the build order by dependency, e.g. unified restart action, then
     reset-in-place, then skippable flight, then breakdown v2, then the
     progress v5 schema, then tiers, then the mastery map, then share v2,
     then ghost, then daily, then juice, then photo mode
   - the files touched per step
   - the exact constants
   - new debug hooks, e.g. `debugRetention()` returning tier, PB, daily
     seed and pool index; `debugSetDate('YYYY-MM-DD')`; `debugGhost()`
   - the acceptance criteria copied from the spec
   - a step-by-step verification command after each step
2. **Write `tools/retention-probe.mjs`.** It asserts **every** acceptance
   criterion plus G1 to G8.
   - It uses `debugTick`/`debugRig` for game-time assertions and the GPU
     harness for G1 to G4.
   - It checks the §2.2 forbidden list mechanically. Grep the built
     `dist/`:
     - no `Notification`
     - no `serviceWorker.register`
     - no `/streak/i`
     - no new `fetch(` targets beyond `/api/run`, `/api/score`,
       `/api/identity` and `/api/leaderboard`
     - 0 third-party requests while playing 3 levels
   - It checks that a stored v4 progress payload migrates losslessly to v5.
3. **Build it.**
   - At the sign-off stop, ask whether the user wants you to build here or
     hand `GOAL-retention.md` to a Sonnet session.
   - Default if there is no answer: build here, following the GOAL
     verbatim, one commit per step.

---

## 6. Regression (all must be green before you call anything done)

```
node tools/level-lint.mjs
node tools/physics-probe.mjs
node tools/drive-test.mjs          # expect 17/17 (plus any new ids, each proven)
node tools/sensor-probe.mjs
node tools/tutorial-probe.mjs
node tools/shell-probe.mjs
node tools/autodrive.mjs
node tools/review-probe.mjs
node tools/leaderboard-probe.mjs
node tools/retention-probe.mjs     # new, this pass
node tools/loop-probe.mjs          # new, Phase A; re-run for the after numbers
```

- Also run the feature probes for anything you touched: `radar-probe`,
  `chase-probe`, `rebind-probe` (it must pass with the new restart action),
  `telemetry-probe`, and `city-lint` if City Drive changed.
- If the base includes the audit commits, run `site-probe` as well.
- Game consoles must show 0 errors and no `GL_INVALID_*`.
- After 20 restarts on one level, the draw-call, geometry and physics-body
  counts must equal those after the first load (`debugBenchmark`).

---

## 7. Stop and get the user's sign-off before building

Batch these into **one** message at the end of Phase B. Give each item a
recommendation, the size of the work and its privacy impact:

- Anything that touches the **server or `api/`**: a daily board, new level
  ids, `LEVEL_COUNT`, or new fields.
- Anything that changes **`PRIVACY.md`/`TERMS.md` or their `public/`
  copies**, which includes **every new localStorage field**: ghost
  trajectories, tiers, daily results, paints.
- Any change to the **leaderboard format** or what a posted row means.
- Any change to the **homepage** (e.g. mentioning dailies or medals).
- **Removing or replacing an existing feature**, or changing an existing
  key's default binding (e.g. taking `R` off the card).
- Retuning any number frozen by §2.1 rule 8.
- A new npm dependency (there should be none).
- Build here, or hand off to Sonnet.

Everything else in Phase A and Phase B needs no approval: diagnose, design,
prototype, commit to `feat/retention`. **Never merge into or push `main`;
ask.**

---

## 8. Definition of Done

**Deliverables**

- [ ] `RETENTION-REPORT.md`: Phase A leak table (before), chosen and
      rejected mechanics with reasons, G1 to G8 before and after, the
      regression table, and screenshot paths under `tools/shots/retention/`
      (results card v2, failed card, mastery map, share output, ghost)
- [ ] `design/SPEC-retention.md` and `design/retention/*.html` prototypes;
      a row in `design/README.md`
- [ ] `GOAL-retention.md`
- [ ] `tools/loop-probe.mjs` and `tools/retention-probe.mjs`, both passing
- [ ] Built features, one commit per GOAL step, on `feat/retention`, with no
      trailers

**Targets and checks**

- [ ] G1 to G8 met, or each miss explained with its measured number
- [ ] §6 regression all green; 0 console errors
- [ ] Progress v4 to v5 migration proven; old saves are not lost
- [ ] `PRIVACY.md` and `public/privacy.html` (and TERMS if affected) match
      the code exactly: every new stored field is listed and nothing new
      leaves the device without sign-off
- [ ] Forbidden-list check (§2.2) passes in `retention-probe`

**Documentation**

- [ ] `CLAUDE.md`:
  - a new §7.x for the retention features
  - new keys, actions and debug hooks in §8
  - new probes in the §8 tool list
  - the §8 "Last results" numbers corrected (17/17)
  - §10 checklist updated, with "Photo mode" ticked if built
- [ ] `NOTES.md`: a "September 2026 — retention pass" entry with the
      decisions and why, especially the restart-key choice, the reset-in-place
      approach, author-time provenance, the daily seed and why there is no
      streak
- [ ] End the session with a checklist of **done / not done** (the user
      likes these), then **ask** whether to merge and push. Pushing `main`
      deploys the live site.

---

## 9. Defaults chosen so this prompt needs no answers up front

- **Daily challenge.** Client-side, seeded from the UTC date, drawing from a
  linted pool on existing levels. There is no server endpoint and no daily
  board unless the user signs off at §7.
- **Tiers.** Additive, above the existing 3 stars. Author times outside
  levels 1, 2 and 6 are provisional until the user records a run.
- **Ghost.** The static footprint turns on by default in the review. The
  live driving ghost is specced and then built only after privacy sign-off.
- **Hard variants.** Specced; if chosen, they are unposted local modes
  unless the user approves new board ids.
- **No streaks of any kind.** A cumulative count only.
- **Base branch.** As in §1: `main` if the audit has been merged, else the
  tip of `audit/popularity`, or a worktree if the tree is dirty.
