# GOAL — build the retention pass

Source of truth: `design/SPEC-retention.md` (numbers, copy, acceptance) and
the prototypes in `design/retention/`. Evidence: `RETENTION-REPORT.md`.
Branch `feat/retention`. One commit per step, plain English, **no
`Co-Authored-By` / `Claude-Session` trailers**. Never push or merge `main`.

## Decisions taken at sign-off (28 Sep 2026)

| # | Decision |
|---|---|
| S1 | Approved: PRIVACY.md §2 + `public/privacy.html` list every new stored field, in the same commit that adds it. |
| S2 | Approved: live driving ghost, **on by default** (`ghostLive: true`). |
| S3 | **Declined: levels and retries keep loading in Park.** SPEC §2.3 is not built. G1/G4 key counts are reported as measured misses (2 keys), everything else in M1 is built. The "In Park" hint stays as it is. |
| S4 | `R` stays on the card as today. |
| S5 | Daily leaderboard not built. Dailies are never posted. |
| S6 | No homepage change. |
| S7 | Provisional author times ship as in SPEC §1. |
| S8 | Built in this session. |
| — | Added the same day at the owner's request: **no creep** (`Car.js`), see NOTES.md. |

## Build order

Each step lists files, the exact behaviour, and the check to run before the
commit. The full §6 regression runs at the end (step 10), and the cheap
probes after every step: `node tools/level-lint.mjs && node tools/drive-test.mjs && node tools/review-probe.mjs`.

### Step 1 — Card keys: one retry key, live during the flight, City Drive fixed
Files: `src/ui/Hud.js`, `src/core/Game.js`.
- Hud keeps `cardOpen` (set by `showReviewResults`/`showReviewFailed`,
  cleared by `setInPlayHudVisible(true)`). The window keydown routes to
  `reviewKeyboard` whenever `cardOpen`, not only while `review.active`.
- `reviewKeyboard`: `settled = phase === 'shown' || phase === null`.
  - codes of `restart` (`codesFor('restart', bindings)`) → `actions.restart()`, any phase.
  - `Enter` → parked: next (replay on the last level / daily); failed: restart. Any phase.
  - flying: `H`/`V`/`Escape` → `review.skip()` only.
  - settled: today's `H`, `V`, `R`, `Escape` behaviour.
- Card primary buttons show key hints: "Next level ⟨Enter⟩", "Replay ⟨B⟩" /
  "Retry ⟨B⟩", "Try again ⟨B⟩" (labels from the live bindings).
- `Game.js` `debugResources()` → `{ geometries, textures, programs, sceneObjects, bodies, drawCalls }`.
- Check: `review-probe`, `rebind-probe`, `shell-probe`; `node tools/loop-probe.mjs --quick` shows A3 ≤ 150 ms and City Drive responding.

### Step 2 — Retention module, scoring output, one pose-words formula
Files: `src/game/Retention.js` (new), `src/game/Scoring.js`, `src/game/ParkingReview.js`.
- `Retention.js`: `MEDALS`, `AUTHOR_TIMES`, `SHARE_CELL`, `DAILY_EPOCH_UTC`,
  `JUICE`, `GHOST` exactly as SPEC §1; `medalFor(score, timeSec, levelId)`,
  `nextGoal(record, levelId)` (SPEC §4.2), `explain(result, words, target)`
  (SPEC §3.2/§3.3), `shareText(...)` (SPEC §7).
- `Scoring.finish()` also returns `parts`, `max`, `par`. Score unchanged.
- `ParkingReview.js` exports pure `stopWords(status, target, chassisPos)`;
  `computeWords()` calls it. Byte-identical sentences.
- Check: `review-probe` ALL PASS (its consistency checks cover the words).

### Step 3 — Progress v5
Files: `src/ui/progress.js`, `PRIVACY.md`, `public/privacy.html`.
- Key `parking-precision:progress:v5`; fields SPEC §10.1 (`medal`,
  `fastestSec`) with validators; v4 → v5 migration on first read, v4 left in
  place; `reset()` clears both.
- `record()` also takes `medal`, updates `medal` (best-ever) and `fastestSec`
  on every park regardless of whether the score improved; returns `prev`.
- Privacy §2 lists medal and fastest time.
- Check: retention-probe migration section (step 10) — until then a
  one-off evaluate in the dev server.

### Step 4 — Results card v2 + ghost footprint by default + share v2
Files: `src/ui/Hud.js`, `src/core/Game.js`, `src/game/ParkingReview.js`, `src/ui/settings.js`, `PRIVACY.md`, `public/privacy.html`.
- Card layout as `design/retention/results-card.html` (CSS from `retention.css` merged into Hud's block).
- `completeLevel` reads `prev = progress.get(id)` before recording; review
  gets `prev.bestPose`; `reviewGhost` setting (default true) turns the
  footprint on at `enter()`; card shows the PB delta (SPEC §8.1).
- "Share score" → "Share result" with the SPEC §7 text.
- Check: `review-probe`, `shell-probe`; screenshot `tools/shots/retention/built-results-card.png`.

### Step 5 — Mastery map
Files: `src/ui/Hud.js`, `src/core/Game.js`.
- Level cards per SPEC §5; summary line; `Game` passes `medal`, `fastestSec` via `getLevels`.
- Check: `shell-probe`; screenshot `built-mastery-map.png`.

### Step 6 — Daily challenge
Files: `src/game/Retention.js`, `src/game/Daily.js` (new: pool, `dailyLevel`, storage), `src/core/Game.js`, `src/ui/Hud.js`, `tools/level-lint.mjs`, `tools/drive-test.mjs`, `PRIVACY.md`, `public/privacy.html`.
- Pool = SPEC §6.2. Day/seed/index = SPEC §6.1 (`debugSetDate`).
- `level-lint` and `drive-test` also iterate every pool entry.
- Daily runs: `runTracker.clear()`, never `progress.record`, fail on contact
  (no-contact) or at par (under-par). Storage `parking-precision:daily:v1` (SPEC §6.4).
- Start menu button + line; level-select strip; daily card (SPEC §6.3/§6.5).
- Check: `level-lint` (17 + pool), `drive-test` (17 + pool), `shell-probe`.

### Step 7 — Live driving ghost
Files: `src/game/Ghost.js` (new), `src/core/Game.js`, `src/ui/Hud.js` (settings rows), `src/ui/settings.js`, `PRIVACY.md`, `public/privacy.html`.
- SPEC §8.2: 20 Hz int16 samples relative to the target, base64 in
  `parking-precision:ghost:v1`, 30 KB/level (decimate to 10 Hz, else drop),
  400 KB total (evict oldest). Stored only when the run is a new best score.
  No physics body; opacity 0.35 fading to 0 within 2 m. Not on dailies or the tutorial.
- Check: `sensor-probe`, `radar-probe`, `drive-test`.

### Step 8 — Perfect-park juice
Files: `src/audio/AudioSystem.js`, `src/world/Props.js`, `src/core/Game.js`.
- `audio.flourish(tier)` and `target.pulse(strength)` per SPEC §9; reduced motion → no pulse.

### Step 9 — Probes
- `tools/retention-probe.mjs`: every SPEC acceptance criterion that applies
  (S3 items skipped and reported), G1–G8, forbidden-list scan of a fresh `dist/`.
- Re-run `tools/loop-probe.mjs --json tools/shots/retention/loop-after.json`.

### Step 10 — Regression and docs
- Full §6 regression → `tools/shots/retention/regress-final/`.
- `RETENTION-REPORT.md` after numbers; `CLAUDE.md` §7.8, §8, §10; `NOTES.md` entry.
