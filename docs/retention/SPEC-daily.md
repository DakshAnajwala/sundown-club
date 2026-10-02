# SPEC — The daily habit: Daily Table, forgiving streak, after-round note

Loops served: habit (primary), progress. Status: built on `feat/retention`, 2 Oct 2026. Brief: `GOAL.md` §3.
Code: `packages/shared/{daily,streak,retention,roundpanel}.js`, `data/quests.js`, hub "Tonight's table". Checks: `tools/daily-check.mjs` (in `npm run check`), browser probes `tools/daily-probe.mjs`, `tools/rounds-probe.mjs`.

## 1. Decisions (recommended options taken)

| Question | Choice |
|---|---|
| Day boundary | The player's local midnight (quests, streak, reward). The Daily Seed (not built yet, §7) uses the UTC date so everyone shares it. |
| Quest source | 63 templates in `data/quests.js` (a JS module, not JSON, so no browser needs import attributes to load a game). Same shape and rules as JSON. |
| Quests per day | 3: a cards quest, a driving quest, a wild card (any-game, or the game the player has touched least, kept easy). Seeded by `player id + local date`, so a reload never reshuffles. |
| Difficulty | Tier 1-3. Three clean sweeps in a row raise it; two empty days in a row lower it. New players start at 1. Never impossible: every game has tier-1 quests. |
| Reroll | One free swap a day, only for an unfinished quest. |
| Rewards | Quest: 40 / 70 / 110 XP by tier. All three: +60 XP and 1 token. Daily claim (one click on the hub, no round needed): 100 XP, 250 chips, 1 token. Rounds also pay XP (table in `daily.js` `roundXp`), halved after 400 round-XP a day. |
| Streak day | 5 minutes of play, OR one finished quest, OR claiming the daily reward. |
| Chips from the claim | Added to the shared bankroll through `chips.js give()`; Play money only. |

## 2. Where it lives

`hub.v2.profile.daily` (day, tier, quests, rerolled, claimed, bonus, playMs, roundXp, rounds, hist) and `.streak` (days, last, best, freezes, rest, broke, restored, covered, weekly). A one-time `notices` list carries "a freeze covered Tuesday" / "your run ended" to the hub. Telemetry events: `quest_seen`, `quest_completed`, `daily_claimed`, `reward_claimed`, `streak_extended`, `streak_saved`, `streak_broken`, `level_up`, `round_end`.

## 3. Forgiving streak (`streak.js`)

- A missed day is covered by a **freeze** when there is one. You earn 1 freeze each time the run hits a multiple of 7 days; hold at most 3. It is spent automatically; the hub says so afterwards, calmly.
- A **rest day** (one weekday chosen by the player) never breaks the run and never costs a freeze.
- A run that cannot be covered ends. The record stays ("Best run N"), and the next play starts a new run. No loss-framed animation or copy.
- **Restore**: within 2 days of the break, once per calendar month, for 1 Evening Token; the run comes back as it was.
- **Weekly streak**: a week (Monday to Sunday) with 4+ counted days counts; consecutive such weeks build a weekly streak. A skipped week resets it, no freeze.
- Pure functions, all dates are local `YYYY-MM-DD` strings, DST safe.

## 4. Round events (the vocabulary a game speaks)

Each finished round calls `reportRound(game, kind, data)`; `kind+game` = event type. Field names are checked against the templates by `daily-check`:

| Event | Fields |
|---|---|
| `blackjack:hand` | result (natural, win, lose, push), total, cards, doubled, bust, net, bet |
| `holdem:hand` | won, pot, showdown, cat (0 high card .. 8 straight flush), folded |
| `videopoker:hand` | hand (name or "none"), rank (1 jacks or better .. 9 royal), win, won (chips), bet (coins) |
| `parking:park` | stars, score, level, timeSec, underPar, clean |
| `racing:run` | topKmh, driftSec. A run is set-off to stop (3 s+ moving, 20 km/h+) |

Tutorials and the Parking tutorial lot never report. Blackjack's design-panel "practice" never reports.

## 5. Hub

- Lobby: a quiet strip under the facts: "Tonight: your daily reward is waiting · 0 of 3 quests" (accent dot while unclaimed), linking to the section. The header chip gets a dot too.
- Your evening: **Tonight's table** card: 3 quests with progress bars and XP, free swap, claim button, streak (days, freezes, best, weeks, rest-day picker, restore button when it applies), a calm note line, and the time to reset.
- The first screen and its look are untouched (taste record).

## 6. After-round note (`roundpanel.js`)

A small card in a corner, `pointer-events: none`, fades by itself after 7 s: XP gained, level (and "Level up!"), each quest with its bar (or "Done +N"), and one footer line (all done / day N / how to count today). `role="status"`, text via `textContent`, `prefers-reduced-motion` honoured. Placement: card games bottom-left, Parking top-right below its buttons, Night Drive bottom-left.

## 7. Daily Seed (built for Video Poker and Parking; the rest come with Phase 4 events)

`seed.js`: one 32-bit seed per game per **UTC** day (`seedFor(game)`), a seeded Fisher-Yates (`seededShuffle`), and the day number shared with Parking's own daily (28 Sep 2026 = #1; 2 Oct = #5). No server: every browser derives the same thing.

- **Video Poker, "Today's hand"** (button or key D, or the hub link `/videopoker/?daily=1`): the same shuffled deck for everyone, five coins, one draw, free play (no chips move, no stats change). One go per day: the first result is kept (`hub.v2.profile.seeds`), pays +50 XP and counts the day. Leaving mid-hand counts for nothing and does not use the go. A second try shows what you got.
- **Parking, today's daily**: Parking already has a daily lot (its menu "Today's daily"); it is never posted (owner, 29 Sep: no daily board). Parking a daily reports the seed: +50 XP the first time, shown on the hub card.
- **Hub**: a "Sundown Daily #N" card inside Tonight's table with both entries and the result once done; counts down to UTC midnight.
- **Blackjack** has the Daily tournament (20 hands from one seeded shoe), see `SPEC-modes.md`. Not built: Hold'em fixed deal, Night Drive route. There is no daily leaderboard: results are personal and shareable (share card in Phase 3).
- Next-step hook (§3.3) is covered by the after-round note; "borrow from the house" is unnecessary because chips refill to 1,000 below 10.

## 8. Acceptance (all pass)

`daily-check`: pool size and schema (every template names only real event fields; every game has tier-1 quests), picking determinism over 9,000 seeds, slots and no repeats, recent-game weighting, progress for where/gte/sum/distinct/any, tiers, reroll rules, XP and soft cap, once-only bonus and claim, junk input, and 12 streak groups (freeze cap, spend, break, rest day, restore rules, weekly). `daily-probe`: hub draws 3 quests, swap, claim once (+100 XP, +1 token, chips 1,250), freeze covers a missed day with the calm note, broken run offers restore. `seed-probe`: two browsers get the same five cards, one go, chips untouched, hub card shows the result. `rounds-probe`: Video Poker, Blackjack and Hold'em rounds reach the profile and the telemetry, panel shows; Parking verified with `autodrive` against a worktree dev server (XP 60 = quest 40 + round 20).
