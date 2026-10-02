# SPEC — The content loop: cosmetics, achievements, mastery, seasons, weekly goals

Loop served: content (primary), progress. Status: built on `feat/retention`, 2 Oct 2026. Brief: `GOAL.md` §6.1 to 6.3. New game modes (§6.4) are in `SPEC-modes.md`.
Code: data in `packages/shared/data/{achievements,mastery,seasons,events}.js`, items in `catalog.js`, rules in `progression.js`, profile edits in `rewards.js`, wiring in `retention.js`, the hub's "Your collection". Checks: `tools/content-check.mjs` (in `npm run check`), browser probe `tools/content-probe.mjs`.

## 1. Cosmetics (all visible, none changes odds, payouts, physics)

34 items. Four slots that actually change something on screen: **card back** (Blackjack, Hold'em, Video Poker), **table felt** (Blackjack, Hold'em), **hub chip frame**, **hub backdrop** (a tint over the sky). Plus **badges** (shown beside your name, up to three). `cosmetics.js` reads what is equipped; the games paint it; a missing or unknown id falls back to the club default. Everything is reachable: `content-check` fails if any item has no source. A reward you already own pays 2 tokens instead.

Where items come from: season tiers, achievements, mastery milestones, and the Vault. The collection shows owned items, and silhouettes with a "how to get it" hint for the rest.

## 2. Achievements

149 in four rarities (54 common, 45 uncommon, 36 rare, 14 epic), 12 hidden. Three rule kinds: a **lifetime counter** (`bj.wins >= 25`), a **single round** (win a hand with five cards), a **time of day** (a round after midnight). Ladders always get rarer as they get harder (checked). Paying: 25 / 60 / 150 / 400 XP by rarity, some give a cosmetic. Unlocks show in the after-round note. Counters live in `hub.v2.profile.stats` and are incremented from finished rounds and a few club events (claims, quests, clean sweeps, seeds, shares, invites, joining a club, finishing a season or weekly goal).

Global percentages: the `unlock` telemetry event (achievement id only) feeds a per-achievement set; `GET /api/club/board?tab=unlocks` gives the share of players who have each. The hub shows it once at least 20 players are counted.

## 3. Mastery

A 20-level track per game, filled by the game's round XP. Level L to L+1 costs 80 + 40 L (9,120 in all). Milestones at 5, 10, 15, 20: tokens at each, a badge at 10, 300 XP at 20. Skill accuracy tracking (such as basic-strategy accuracy) is not built; it needs per-decision logging in the games.

## 4. Seasons

28 days from a Monday (UTC), four built (First Light from 5 Oct 2026, Long Shadows, Lamp Oil, Last Call). A free 30-tier track at 250 season XP a tier; every XP gain counts. Rewards: tokens most tiers, a cosmetic at tiers 5, 10, 15, 20, 25, and a limited badge with 3 tokens at tier 30. **Nothing is lost:** when a new season starts, unclaimed tiers of the last one are paid automatically with a calm note. **The Vault** sells each finished season's limited badge for 12 tokens, so no one is locked out and nothing runs on a countdown or costs money. Between seasons the hub says when the next starts.

Seasonal ladders on the board: not built (the per-season XP is client-side; a server-side check needs the plausibility rule from `SPEC-leaderboard.md` §10 extended). Waiting on the owner (OWNER-TODO).

## 5. Weekly goal and the weekend boost

One long goal a week (UTC Monday to Sunday), rotating Hold'em, Valet, Night Drive, Card night; done pays 300 XP and 2 tokens automatically. Round XP is x1.5 on Saturday and Sunday (UTC); quest and bonus XP are not boosted. Events are data (`data/events.js`); adding a week is adding a line. Weekly freeroll tournaments and per-event leaderboards are Phase 6 (`SPEC-modes.md`).

## 6. Not built here

- The collection has no search or filter; at 149 achievements it lists found ones first, then by rarity.
- No new cosmetics for Night Drive liveries or Parking cars (the Night Drive file is under another session's edits).

## 7. Acceptance (all pass)

`content-check`: schema of all 149 achievements (known stats, real event fields, real reward items), harder steps are rarer, every item reachable, mastery math and milestone crossing, season dates contiguous, top tier is the limited badge, tier math, weekly rotation and progress, stats from rounds for every game, unlock rules including time of day. `content-probe`: season card and claims, equipping and un-equipping, silhouettes and hints, 149 listed with hidden ones masked, badges, auto-pay at season end with a note, the Vault buys once for 12 tokens, felt and card back reach the games. `telemetry-check`: unlock percentages.
