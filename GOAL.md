# GOAL: Make Sundown Club the site people open every day

You are the lead engineer and game designer on Sundown Club, working with the
owner (project manager). Read `CLAUDE.md`, then each app's `CLAUDE.md` and
`apps/hub/SPEC.md`, `apps/hub/SPEC-leaderboard.md`, `docs/deploy.md`,
`docs/seo.md`, before you change anything. Where this file and a repo rule
conflict, the repo rule wins (see "Hard rules").

## 0. North star

Maximise **retention**: D1, D7, D30 return rate; DAU, WAU, MAU; DAU/MAU
stickiness; sessions per user per week; session length; games tried per user.

Targets to design for (these are design targets, not claims; you cannot
measure them until a real audience exists):

| Metric | Today (assumed) | Target |
|---|---|---|
| D1 return | unknown, low | 40% |
| D7 return | unknown, low | 20% |
| D30 return | unknown, low | 10% |
| DAU/MAU | unknown | 25% |
| Games tried per new user in session 1 | 1 | 2 |
| Median session | unknown | 12 min |
| Share of new users who set a name / finish onboarding | unknown | 70% |

Retention comes from four loops. Every task below feeds at least one:

1. **Habit loop** (daily): a reason to return today, small and finishable.
2. **Progress loop** (weekly): visible growth the player does not want to lose.
3. **Social loop** (any time): other people, ranks, rivals, things to show.
4. **Content loop** (monthly): new things to find, so the club is never "done".

## 1. Hard rules (do not break; these override everything below)

- Play money only. Never the word "$", never real-money purchase, ads,
  loot boxes, paid randomised rewards, or anything that works like gambling
  for value. The casino games stay a toy economy.
- The audience includes teenagers. No dark patterns: no guilt or shame copy
  ("you'll lose your streak!!"), no fake scarcity or fake countdowns, no
  forced-return pressure, no notification spam, no pay-to-skip. Streaks
  must be forgiving (see 3.2). Add a visible "take a break" nudge after
  90 minutes of continuous play and a "pause streak" setting. A stickiness
  gain that needs a dark pattern is not allowed. Find another way.
- Never commit, push or deploy unless asked. Work on a branch
  (`feat/retention`). Deploying needs an explicit yes from the owner. No
  `Co-Authored-By` or `Claude-Session` trailers on commits.
- Site copy never mentions Claude, AI, or the school. About = name, story,
  GitHub link, email.
- Nothing from another company's server: no CDN, no Google Fonts, no
  third-party analytics SDK, no external embeds. Self-hosted only.
- Any new network request, stored key, or third-party file updates
  `apps/hub/legal/privacy.html` in the same commit (repo rule). Analytics
  must be first-party, anonymous, and opt-out (see 2.1).
- Never read or change `.env*` files.
- Assets use relative `./` paths inside an app. Pages never scroll sideways
  at 400 px. Respect `prefers-reduced-motion` everywhere. Laptop/desktop is
  the main target; phones must at least work.
- One club bankroll (`club.v1.chips`). Each game owns its own keys. Shared
  keys are `hub.v1.*`. Never write another game's keys.
- Keep the taste record: no flat bright casino green, glossy bevelled
  logos, heavy black buttons, clip-art icons, bento dashboards, arched
  window tiles. Same room, day cycle, stylised deck, pastel chips, faceless
  figures. New UI must look like it belongs to what exists. Read
  `apps/hub/design/` and screenshot before and after.
- Design first: each phase writes a spec with real numbers, timings, and
  acceptance criteria into the app's folder (or `docs/retention/`) BEFORE
  code. Follow it. When a decision is open, take the option the spec marks
  recommended, record it in the spec, and keep going.
- Site is currently local-save only. Keep the **local-first** principle:
  everything must work with no account and no server. The server adds
  sync, boards, and ghosts; it never gates play.

## 2. Phase 0: Foundations (build these first; everything depends on them)

### 2.1 Measurement (first-party, anonymous, opt-out)

You cannot raise retention you cannot see. Build:

- `packages/shared/telemetry.js`: `track(event, props)` with a tiny queue,
  batched `navigator.sendBeacon` to `/api/club/event`, flush on
  `visibilitychange`/`pagehide`. No cookies. Anonymous random `player` id
  (the same id the leaderboard spec uses). Respect a "Send anonymous
  usage stats" toggle in settings (default on, one-click off, and
  respect `navigator.doNotTrack === "1"` as off). Off = send nothing.
- Events (names fixed so dashboards stay stable): `session_start`
  (props: game, referrer-type, day_index, is_new), `session_end` (duration,
  games_played), `game_open`, `game_leave`, `round_end` (game, result,
  duration), `onboarding_step`, `quest_seen/started/completed`,
  `daily_claimed`, `streak_extended/saved/broken`, `reward_claimed`,
  `level_up`, `unlock`, `share_click`, `invite_open`, `challenge_sent/accepted`,
  `board_view`, `install_prompt_shown/accepted`, `notif_prompt_shown/accepted`.
  Never send anything the player typed.
- Server (Vercel function or the existing `/api` project; follow
  `docs/deploy.md`): append-only event store, per-IP rate limit, drop
  anything malformed, IP never stored with events.
- `/admin/metrics` (password via env var configured by the owner, never read
  `.env` yourself; ask the owner to set it): D1/D7/D30 cohort table, DAU/WAU/MAU,
  DAU/MAU, sessions/user, session length histogram, funnel
  (landing -> game_open -> round_end -> second game -> return next day),
  per-game retention, quest completion rate, streak length distribution.
  A tiny chart style that matches the club look. Use the `dataviz` skill.
- A local `?debug=metrics` overlay for dev that prints events to the screen.
- Update privacy page: what is sent, why, how to turn it off, retention
  period (delete events after 180 days).

Acceptance: you can open a fresh browser, play a round, and see the events
land in a local store and show on the metrics page; toggle off and nothing
is sent (verify in the network panel with a headless probe).

### 2.2 The meta-progression spine (one profile, one currency of "reputation")

Today: `hub.v1.profile` has summary, play time, streak; `club.v1.chips` is
the bankroll. Extend, do not replace, behind a versioned migration
(`hub.v2.profile` with a one-time upgrade from v1 that loses nothing):

- **Club Level** (1-100) from **Evenings** XP (see 3.1). One level bar visible
  on every page header chip.
- **Title** + **Handle** (generated, never typed) + **Badge slot** (pick 3).
- **Cosmetic inventory**: card backs, chip sets, table felts, figure
  accessories, car liveries (Night Drive), parking-lot skins, profile frames,
  hub backdrops (time-of-day variants). All cosmetic, none changes odds,
  physics, or payouts.
- **Collection log**: every unlockable has a silhouette until found (see 6).
- Export / import of the whole save as a short code or file (cheap
  "account" with no server; also the sync fallback).

Acceptance: migration test with real v1 data; save corruption never crashes
a page (try/catch + safe defaults + one-click reset on a settings screen).

### 2.3 Optional identity and sync (after 2.2)

- Anonymous by default. Optional "Save my club" = magic code (no email, no
  password): server keeps one blob per random id. Cross-device via typing a
  8-word code. Rate limit, size cap 64 KB, conflict rule: highest
  `updatedAt` wins per section, additive merge for collections and XP.
- Ship it only if the privacy page and deletion ("forget me" button deletes
  server rows) land in the same change.

## 3. Phase 1: The daily habit (biggest D1/D7 lever, do this next)

### 3.1 "Tonight at the Club": the daily page

The hub's first screen answers one question: *what do I do tonight?*

- **Daily Table** (resets at local midnight, shows a countdown to reset
  as plain information, not pressure): 3 quests, one per game family, always
  completable in under 10 minutes total, always at least one doable in
  every game. Examples: "Win a hand of Blackjack with a 5-card total",
  "Park on a green line in under 40 s", "Finish a Night Drive run without
  braking in the first corner", "Hit a straight or better in Video Poker",
  "Win a pot at Hold'em with a bluff". Generated from a seeded template pool of
  at least 60 quests, difficulty scaled to the player's recent skill (use
  last-14-days results; never offer an impossible quest; reroll one quest
  per day for free).
- **Daily Seed**: the same challenge for everyone that day: one Parking level
  variant, one Night Drive route + weather, one Video Poker starting
  bankroll, one Hold'em table with a fixed deal. Everyone's result goes to
  the daily board, and the result is shareable (see 5.2). Seeded from the UTC
  date through a deterministic RNG so every client sees the same thing
  without a server.
- **Daily reward**: claim = chips + XP + 1 "Evening Token" (see 3.4). Claiming
  is one click on the hub, no streak penalty for missing it.
- **Hub ordering**: if the player has an unclaimed or unfinished daily thing,
  the hub's "Your evening" shows it first. A returning player lands on
  "Continue where you left off" (last game, one click). A new player gets
  the onboarding path (see 4).

### 3.2 Forgiving streaks

- Streak counts days with >= 5 server-credited (or locally measured when
  offline) minutes OR one completed Daily Quest.
- **Streak freezes**: earn 1 every 7 days, hold max 3, spent automatically on a
  missed day (tell the player afterwards, calmly: "Your freeze covered
  Tuesday"). A weekly "rest day" the player can set (streak unaffected).
- A broken streak shows "Best: N days. New run: 0" and a one-tap "Restore
  yesterday" using the Evening Token (once a month). No sad animation, no
  loss-framed copy.
- Weekly streak as well as daily (play on 4 of 7 days = weekly streak
  continues), so casual players still bank progress.

### 3.3 Session-loop design (inside each game)

Every game must end each round with a **next-step hook**, not a dead end:

- Blackjack, Hold'em, Video Poker: after a round, show one line of "Tonight:
  2 of 3" quest progress, XP gained, and the single most relevant next
  button ("Deal again" is default focus; Space or Enter works).
- Parking, Night Drive: after a run, show delta vs personal best and vs
  yesterday, a one-key retry (R), and "Try the Daily Seed" if not done.
- Bankroll empty: never a dead end. Offer "Borrow from the house" (small
  chips, cooldown 4 h, no shame copy) or a free **Practice** round that
  earns XP at half rate. Never block play.
- Near-miss feedback only where it is true information (a straight flush
  you missed by one card is shown plainly). Do not fake near-misses or tune
  outcomes to hold attention. RNG and payout tables stay fair and
  unchanged; `npm run check` must stay green.

### 3.4 Evening Tokens (a soft meta-currency)

- Earned by quests, streak milestones, level-ups, challenges.
- Spent on: cosmetic crates that are **not random** (pick from 3 shown items),
  streak restore, rerolls, and one "double XP hour" per week.
- Cap 99. No real-money path. Ever.

## 4. Phase 2: First-session onboarding (the D0 -> D1 bridge)

Goal: a new visitor reaches a first win and a reason to return within 3
minutes.

1. Landing: one clear primary action ("Take a seat"), not a menu of six
   games. Pick the game by referrer and by a 1-question picker ("Cards,
   cars, or both?") and remember the answer.
2. **First 90 seconds are scripted, not random**: Blackjack gets a guaranteed
   gentle first hand with a coach callout (`packages/shared/coach.js` exists,
   use it); Parking opens on a short level with a forgiving 3-star line;
   Night Drive opens on the test drive's friendliest stretch. Later rounds
   are fully fair.
3. After the first win: show the **Welcome table**: name it (pick from
   generated handles, reroll free), pick a favourite table/felt, see Level 2
   in one more round. Plant the return hook: "Tomorrow: a new Daily Table
   and your first streak freeze."
4. Show the **Collection log** with 40% silhouettes on the first visit, so
   there is something to find.
5. Soft install prompt (PWA, see 7.1) only after the second session, never
   on first load.
6. Instrument every step (`onboarding_step`) and write down the drop-off
   after each, so the owner can see where people leave.

Acceptance: a headless probe walks the new-user path with cleared storage and
reaches "Level 2 + first daily claimed" in under 4 minutes of simulated play.

## 5. Phase 3: Social loop

### 5.1 The Board (ship the existing leaderboard spec first)

Finish `apps/hub/SPEC-leaderboard.md` as written (server-measured play time,
generated handles, opt-out, privacy), then extend with:

- Tabs: Play time, Daily Seed (today), Weekly XP, Streak, per-game bests.
- **Friends board**: share a 6-character club code; people who enter it see
  each other's rank on a private board (still generated handles; the owner
  never moderates free text because there is none).
- **Seasonal ladders**: every 4 weeks a Season (see 6.2). Season rank resets,
  lifetime stats do not. End-of-season gives a permanent cosmetic by tier
  (not by pay).
- Anti-cheat: server rejects the impossible; suspicious scores go to a
  "pending" state and stay off public boards until they pass a sanity check
  (physics replay for Parking and Night Drive if feasible, delta-time bounds
  for cards). Honest labelling of unverified boards.

### 5.2 Share and invite

- **Share card**: one click renders a 1200x630 PNG via canvas (client side,
  no server): game, result, Daily Seed number ("Sundown Daily #212"), Level,
  streak, in club style, plus a spoiler-free emoji grid for quick pasting
  into group chats. `navigator.share` where available, else copy link.
- **Challenge link**: `/c/<code>` encodes a seeded round + the sender's
  score. The receiver plays the exact same deal/route and sees "beat Amber
  Heron 42's 3:12.4". No sign-up needed. Seed + score signed (HMAC) so a
  link cannot be edited into a fake record.
- **Ghosts**: Night Drive and Parking record a compressed input trace of the
  best run (<= 20 KB) and race a friend's or a top-10 ghost. Ghosts are the
  strongest solo-to-social retention tool for the racing and parking games;
  build this properly.
- **Invite reward**: when a friend finishes their first round from your link,
  both get Evening Tokens (once per friend, cap 5 a month). No pressure
  copy.

### 5.3 Live presence (light)

- A "Who's at the club now" count (anonymous, number only) on the hub, from
  the heartbeat data. Hide it below 3 so an empty room never advertises
  itself. Optional later: 6-seat Hold'em with real friends instead of bots
  (WebSocket/room code), only after everything above ships.

## 6. Phase 4: Content loop (reasons to come back in week 3 and month 2)

### 6.1 Collection and mastery

- **Mastery tracks** per game (levels 1-20 each) with named milestones and
  cosmetic rewards: e.g. "Blackjack: Sharp (basic-strategy accuracy 90% over
  200 hands)", "Parking: Valet (all levels 3 stars)", "Night Drive: Ghost
  (beat 3 friend ghosts)". Show accuracy/skill stats to players who want
  them (the coach already knows basic strategy).
- **Achievements**: 120+ achievements in 4 rarity tiers, each with a
  silhouette until found, some hidden, a handful absurd and funny. Show
  global unlock percentage on each (needs the telemetry). Keep a
  `achievements.json` data file so adding more is a data change.
- **Collection log** page: grid of all cosmetics and badges, completion %
  per game, "next up" suggestions.

### 6.2 Seasons (4 weeks, theme + track)

- Each Season has a name, a palette for the hub backdrop, a free reward
  track (30 tiers, 100% free, XP-driven), and a limited cosmetic that
  returns in a later season's "Vault" so nobody is permanently locked out
  (this avoids FOMO; do not use scarcity as pressure).
- Season finale event in the last weekend: a "Grand Night" tournament (see
  6.3).

### 6.3 Events and tournaments

- **Weekly Freeroll Hold'em**: 6 seats vs bots at fixed seeded decks, one
  attempt per day, best chip-stack of the week wins. Uses the engine in
  `apps/holdem/engine.js` with a seeded deck.
- **Weekend Drift Night** (Night Drive) and **Valet Rush** (Parking): a
  weekly modifier (rain, narrow lanes, time pressure) with a leaderboard.
- Events are data-driven (`events.json` with start/end dates) so the owner
  can add a new one without touching code.

### 6.4 New game modes from existing assets (cheapest big retention win)

Pick in this order, one per two-week sprint, each with its own spec first:

1. **Endless / Roguelite Parking**: lots get tighter, add a "streak of
   perfect parks" multiplier and 3 modifiers to pick between after each lot.
2. **Night Drive career**: unlock routes in order, rival crews with distinct
   handling, car upgrade tree (cosmetic + tiny tradeoffs, not P2W).
3. **Blackjack tournaments**: fixed-hand sit-and-go versus bots, finite
   chips, 20 hands, rank by stack.
4. **Video Poker daily hand**: same 5 cards for everyone, one draw, one
   attempt, shareable.
5. **Club mini-games** (5 min each, built on shared lounge kit): darts,
   a coin-flip streak with bankroll limits and visible odds, a daily
   word/number puzzle. Short games raise sessions per day.

## 7. Phase 5: Reach and re-engagement

### 7.1 PWA and notifications

- Installable PWA (manifest, offline shell, icons, `display: standalone`),
  service worker caches the vendored three.js and each app shell, versioned
  so deploys cannot strand users on stale code. Offline: games still
  play; boards show "offline".
- Web push is **opt-in, after the third session, and capped at 1 a day**.
  Allowed messages: "Today's Daily Seed is up" and "You're 40 XP from level
  12". Never guilt, never "we miss you". A single settings page turns all of
  it off. Do not add a push provider without checking the owner and privacy
  page first; if a third-party service is needed, stop and ask.

### 7.2 SEO and discovery (follow `docs/seo.md`)

- A page per game with real content (how to play, strategy guide, rules)
  that targets honest search terms ("free browser blackjack with strategy
  coach", "online parking game"). Add `schema.org/Game` JSON-LD, correct
  `<title>`, meta, canonical, OG/Twitter images generated from the share-card
  renderer, sitemap updated, hreflang only if you translate.
- A `/blog` or `/guides` of 10 short guides (basic strategy chart, drift
  tips, parking technique) as static pages: long-tail traffic that lands
  people straight in a game.
- Performance budget: LCP <= 2.5 s on throttled 4G on the hub, first game
  playable in <= 5 s; lazy-load three.js scenes; check with Lighthouse
  headless. Fix regressions before adding features.

### 7.3 Lifecycle moments inside the site (no email needed)

- Returning after 3+ days: a quiet "Welcome back" panel with what changed
  (new Daily Seed, new season tier, friends' new ranks), a one-click
  catch-up, and a streak freeze already applied. Never a guilt message.
- Milestones (day 7, 30, 100; level 10, 25, 50): short celebratory screen
  with a share card and a cosmetic.
- Birthday of the club (site anniversary) as a yearly event.

## 8. Experimentation framework

- `packages/shared/flags.js`: deterministic bucket by player id hash for
  A/B tests, flags stored in `flags.json` (remote-updatable from the same
  origin), logged on every event as `flags`.
- First experiments (write hypothesis + metric + stop rule in
  `docs/retention/experiments.md` before turning each on):
  1. Daily reward 1 click on hub vs inside a game.
  2. 3 quests vs 4 quests.
  3. Onboarding pick-a-game vs auto-start.
  4. Streak freeze earn rate 7d vs 5d.
  5. Post-round next-step panel on vs off.
- Run an experiment only when the traffic can answer it; document "not
  enough users yet" and ship the recommended default instead of guessing.

## 9. Delivery plan (do in this order; each phase ends green and demoed)

| Phase | Deliverable | Spec written first | Done when |
|---|---|---|---|
| 0a | Telemetry + metrics page + privacy update | `docs/retention/SPEC-telemetry.md` | events visible, opt-out verified |
| 0b | Profile v2 migration, level/XP/title/inventory, save export | `docs/retention/SPEC-profile-v2.md` | v1 save migrates losslessly |
| 1 | Daily Table, Daily Seed, forgiving streak, post-round hooks, Evening Tokens | `docs/retention/SPEC-daily.md` | a day of play updates all of them; midnight rollover tested |
| 2 | Onboarding + Welcome table | `docs/retention/SPEC-onboarding.md` | new-user probe passes |
| 3a | Leaderboard (existing spec) + Friends board | `apps/hub/SPEC-leaderboard.md` (extend) | server-measured time works |
| 3b | Share card + challenge links + ghosts | `docs/retention/SPEC-social.md` | friend beats a link in a fresh browser |
| 4 | Achievements, mastery, collection log, seasons, events | `docs/retention/SPEC-content.md` | data-driven; one season fully playable |
| 5 | PWA, opt-in push, SEO pages, perf budget | `docs/retention/SPEC-reach.md` | Lighthouse budgets met |
| 6 | New modes, one per sprint (6.4) | one spec each | each mode has its own daily hook |

Rules for the plan:

- One phase at a time on the branch. After each phase: run `npm run check`,
  `npm run build`, the headless probes, view the assembled site with
  `npm run serve` (port 5180), screenshot the changed screens, and fix what
  looks wrong. Never claim a feature works because it compiled.
- Keep each commit small and described in plain English. No trailers.
- If something needs the owner (a password env var, a push provider, a
  decision with real cost or privacy impact), stop that item, write it in
  `docs/retention/OWNER-TODO.md`, and continue with the rest.
- Do not delete or regress any existing game behaviour. Parking's own
  regression probes (see `apps/parking/CLAUDE.md`) must still pass; check
  `lsof -iTCP:5175` before running them.

## 10. Quality bar for every feature

- Works with no account and with storage blocked (degrades, never crashes).
- Keyboard-first (Space/Enter/Esc/R conventions already in the games),
  focus order sane, contrast AA, `prefers-reduced-motion` honoured, all
  tap targets >= 40 px, ARIA on interactive overlays, no sideways scroll at
  400 px.
- 60 fps on a mid laptop in game; no layout shift on the hub; no new
  dependency over 30 KB without a written reason.
- Sound: add a shared, muted-by-default audio layer with small tasteful
  cues (claim, level up, streak, win); a clear mute toggle remembered.
- Copy: warm, dry, short, plain English. Same voice as the existing hub.
  No exclamation spam, no emoji walls, no mention of AI.
- Every new data table (quests, achievements, cosmetics, events, seasons) is
  a JSON file with a schema check added to `npm run check`.
- Unit tests for pure logic (quest generation, streak math, XP curve, seed
  RNG determinism, save migration, merge rules). Add them to `npm run check`.

## 11. Metrics review ritual (build the habit into the repo)

- `docs/retention/WEEKLY.md` template: DAU/WAU/MAU, D1/D7/D30 per cohort,
  best/worst funnel step, top 3 quests by completion, one insight, one
  change, one experiment status. After shipping, the owner fills it in
  every Monday from `/admin/metrics`.
- When a metric moves, the question is "which loop moved?" (habit,
  progress, social, content). Tie every future task back to a loop in its
  spec's first line.

## 12. Definition of done for this goal

- [ ] Telemetry live, opt-out works, privacy page updated, metrics page shows cohorts.
- [ ] Profile v2 + level, XP, titles, inventory, save export/import, lossless migration.
- [ ] Daily Table, Daily Seed, forgiving streak with freezes, Evening Tokens.
- [ ] Post-round next-step hooks in all six games; bankroll-empty never blocks play.
- [ ] New-user onboarding probe passes; welcome table ships.
- [ ] Leaderboard + friends board + seasonal ladders with honest trust labelling.
- [ ] Share card, challenge links, ghosts for Night Drive and Parking.
- [ ] 120+ achievements, mastery tracks, collection log, one full Season, weekly events.
- [ ] PWA installable, opt-in capped push, SEO pages, Lighthouse budgets met.
- [ ] Flags + first 5 experiment specs written.
- [ ] At least two new game modes from 6.4 specced and the first one built.
- [ ] `npm run check` and `npm run build` pass; Parking probes pass; headless new-user probe passes.
- [ ] No hard rule in section 1 broken (check each line before declaring done).
- [ ] Final report: done / not done checklist, what the owner must do (env vars, deploy yes), and the first three experiments to run once traffic exists.

Do not stop at the first phase. Keep going through the plan, taking the
recommended default whenever a decision is open, until the checklist above is
done or you hit something only the owner can decide.
