# SPEC — New modes from what already exists (`GOAL.md` §6.4)

Loop served: content and habit (each mode ships with its own daily hook). Status: two modes built (Video Poker daily hand, Daily Blackjack tournament), three designed here. The brief lists the order Endless Parking, Night Drive career, Blackjack tournaments, Video Poker daily hand, mini-games; I built the two that need no new levels or tracks first, and say so in `OWNER-TODO.md`.

## 1. Video Poker daily hand — BUILT (`SPEC-daily.md` §7)

Same five cards and same draw for everyone each UTC day, free play, one go, +50 XP, shareable (card plus a signed challenge link a friend can race). Hook: the hub's Daily Seed card.

## 2. Daily Blackjack tournament — BUILT

- **Rules:** 20 hands from one six-deck shoe shuffled with the UTC date as the seed (`seed.js`), so every player gets the same cards in the same order. Start with 1,000 tournament chips, the Lounge table (10 to 500). Hit, stand and double as in the normal game. The final stack is the score. If your stack falls under the table minimum the tournament ends early.
- **Fair and separate:** the tournament touches nothing else. Club chips, the peak and the hand count stay as they were (`TOUR` flag beside `TUT`), the first-hand practice deal is skipped, and the shoe is never reshuffled mid-way.
- **One go a day:** the result is kept the first time (`reportSeed('blackjack')`, +50 XP, counts the day). Starting writes `bj.v1.tour`, so a reload or a second tab cannot replay the same shoe; **leaving mid-tournament counts as it stands** (Esc twice), so nobody can look at the cards and try again.
- **Board:** the weekly "Tournament" tab on the hub's board: best final stack this week. Unverified (labelled), server limits: 0 to 21,000 (1,000 start plus 20 hands of at most 1,000 won), and at least 90 seconds of Blackjack play credited by the server. Switching the boards off removes the entry.
- **Sharing:** a result card and text with the link back to the tournament (no challenge code: the shoe is already the same for everyone).
- **Entry points:** hub Daily Seed card ("Blackjack tournament"), `/blackjack/?tournament=1`, the "Daily tournament" button or key N in the game.
- **Probe:** `tools/tournament-probe.mjs` plays all 20 hands in a real page, checks separation from club chips, the same first hand for a second browser, the weekly board, one go, leaving, and the hub card.

## 3. Endless Parking — DESIGNED, not built

Why not built: it needs generated bays, a difficulty curve and its own results screen inside Parking's HUD, and Parking's owner rules (levels start in Park, no daily board) leave real design questions. Design for when it is:
- **Loop:** an endless run of short lots on the existing 17-level building blocks (bay type, neighbours, cones, a timer). Each lot you park three stars or two wins a **pick of one of three modifiers** for the next lot (tighter bays, less time for a multiplier, a mirror gone), Roguelite style. One bad park (no stars) ends the run.
- **Score:** lots parked, with a multiplier for streaks of clean parks. Stored locally as best run; the run seed (`seedFor('parking-endless')`) is shared per UTC day for the daily variant, shared as a ghost link.
- **Rewards:** XP per lot, a weekly goal ("park 25 lots in endless"), a mastery track boost, cosmetics from achievements (`pk.endless.*`).
- **Acceptance:** every generated lot is solvable (the existing `drive-test` teleport check run over 1,000 seeds), no lot repeats inside a run, the run is deterministic from the seed.

## 4. Night Drive career — DESIGNED, not built

Waiting on the racing session: the test drive has no route, lap timer or rivals. Design: routes unlocked in order (a night route each, set by weather), rival crews with distinct handling, cosmetic and tiny-tradeoff upgrades (never pay to win). Hooks: daily route seed, ghosts on the route (the Parking ghost code in `Ghost.js` is the template; `api/_lib/ghost.js` already stores any run trace), weekly goal "Night Drive week".

## 5. Club mini-games — DESIGNED, not built

Five-minute games built on the shared lounge kit: darts, a coin-flip streak with visible odds and a bankroll limit, a daily number puzzle (same for everyone, seeded). They raise sessions per day; each reports `reportRound` like any game, so quests, achievements and mastery work with one new entry in `EVENT_FIELDS`, `statDeltas` and a mastery track.

## 6. Acceptance for what is built

`tournament-probe`, `seed-probe`, `board-check` (tournament board: limits, weekly reset, leaving), `content-check`, `daily-check`.
