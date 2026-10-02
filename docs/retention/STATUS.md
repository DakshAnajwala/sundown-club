# Retention programme: status (2 Oct 2026)

Brief: `GOAL.md`. Branch `feat/retention` (a git worktree at `~/sundown-retention`, cut from `main` at c8cbf91), **nothing pushed, merged or deployed**. Specs: `SPEC-*.md` beside this file. What only the owner can do: `OWNER-TODO.md`.

## Definition of done (`GOAL.md` §12)

- [x] Telemetry live, opt-out works, privacy page updated, metrics page shows cohorts. (`SPEC-telemetry.md`; durable only once the owner sets the Upstash variables and `METRICS_PASSWORD`.)
- [x] Profile v2 with level 1 to 100, titles, items, save export/import, lossless migration. (`SPEC-profile-v2.md`.) **Not built: cross-device sync** (`GOAL.md` §2.3, optional; needs the owner's go on a server store for saves).
- [x] Daily Table, forgiving streak with freezes, rest day, restore, weekly streak, pause, Evening Tokens. (`SPEC-daily.md`.)
- [x] Daily Seed: Video Poker daily hand, Parking daily, **Blackjack daily tournament**. **Not built:** a Hold'em fixed deal and a Night Drive route seed (`SPEC-modes.md`).
- [x] After-round note in all five playable games; chips never dead-end (the club refills below 10 chips). The "borrow from the house" cooldown was judged unnecessary.
- [x] New-user path: one question, gentle first hand, first-win bonus, welcome table, Level 2 in the first sitting (about 30 s in the probe).
- [x] Leaderboard (play time, Blackjack peak, Parking stars, streak, Blackjack tournament), friends boards, honest "unverified" labels. **Not built:** seasonal ladders on the board (see `SPEC-content.md` §4).
- [x] Share card, signed challenge links (Video Poker), invite tokens for both sides, Parking ghost links. **Not built: Night Drive ghosts** (no lap or route to race).
- [x] 149 achievements, mastery for five games, collection log, four seasons with a free 30-tier track and a Vault, weekly goals and a weekend boost.
- [x] PWA installable and offline; reminders built but **off** (they use browser makers' push services, so the owner decides); ten guides with schema; performance budgets met in the probe.
- [x] Flags and five experiment specs (four wired, one specced only), all off.
- [x] Two new modes from §6.4 specced and built (Video Poker daily hand, Daily Blackjack tournament); three more designed (`SPEC-modes.md`). Endless Parking, the first on the brief's list, was not built (see that file for why).
- [x] `npm run check`, `npm run check:site`, `npm run build` pass; every probe passes: telemetry 12, save 13, daily 18, rounds 8, seed 11, onboarding 20, social 22, content 26, tournament 14, pwa 27, board 16, perf 4. Parking was driven with its own `autodrive` (XP and ghost sharing checked against the real game).
- [x] No hard rule broken: play money only, no dark patterns (streaks forgive, break note after 90 minutes, pause and rest day, no countdown scarcity, the Vault sells nothing for money), no third-party files in the pages, privacy page changed in the same commits as every new network request or stored key, no commit trailers, nothing deployed.

## Numbers a reader will want

| | |
|---|---|
| Quests | 63 templates, 3 a day, difficulty follows the player |
| Achievements / items | 149 / 34 |
| Seasons | 4 built (First Light from 5 Oct 2026) |
| Hub first load | 0.42 MB, LCP 0.8 s on throttled 4G |
| Game first load | 0.32 MB (tree-shaken three.js) |
| New server files | `api/club/{event,metrics,play,board,push-run}`, 5 of 12 allowed on the free plan |

## What the owner must do before it means anything (details in `OWNER-TODO.md`)

1. Set `KV_REST_API_URL`, `KV_REST_API_TOKEN` (the Upstash database the Parking board uses is fine) and `METRICS_PASSWORD`, `CLUB_SECRET` in the `sundown-club` Vercel project. Without the store everything runs on memory that resets.
2. Say "deploy" (the privacy page changed a lot: read sections 6 to 8 first).
3. Decide on reminders (web push) and which mode to build next.

## First three experiments to run once traffic exists

1. `onboarding_start` (ask or auto): the biggest lever on first-session success.
2. `freeze_rate` (7 or 5): the slowest metric, so start it early.
3. `round_panel` (on or off): checks that the note helps rather than distracts.
