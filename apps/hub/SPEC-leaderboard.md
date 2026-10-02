# SPEC — Club leaderboard ("The board")

Status: **built 2 Oct 2026 on `feat/retention` with the recommended answers to §9** (generated names, on by default with opt-out, tabs Play time / Blackjack / Parking / Streak). Needs the owner's Upstash env vars to be durable in production (`docs/retention/OWNER-TODO.md`). Code: `api/_lib/board.js`, `api/club/{play,board}.js`, `packages/shared/leaderboard.js`, the hub's "The board". Checks: `tools/board-check.mjs`, `tools/board-probe.mjs`.
Mock: `apps/hub/design/leaderboard.html` (sample data only).
Owner's ask: "a leaderboard of playtime and stuff like that".

## 1. What it shows

One section on the hub, "The board", between "Your evening" and "The house",
plus a full page at `/board/` later if it grows.

| Tab | Ranks by | Window | Source |
|---|---|---|---|
| **Play time** (default) | Minutes played across all games | This week (Mon 00:00 UTC) / All time toggle | Server-measured heartbeats (§4) |
| **Blackjack** | Peak chips (main mode only; Practice never counts) | All time | Client-reported, unverified (§5) |
| **Parking** | Total stars (0–51) and, on ties, total score | All time | Client-reported from the game's records; the per-level boards in the game stay as they are |
| **Streak** | Longest run of days played | All time | Server-measured (a day counts when the server saw ≥ 5 minutes of heartbeats) |

Each tab: top 10, then "You" pinned below with your rank if you're outside
the top 10. Ties share a rank. Numbers in IBM Plex Mono, tabular.

## 2. Names

- Generated, never typed (same rule and wordlists as Parking's `handles.js`:
  "Amber Heron 42"). No free text on a public board means nothing to moderate.
- One handle for the whole club, shown on the profile chip. A "New name"
  button rolls another (max 3 a day).
- Parking's existing handle is reused if the player already has one on this
  site, so their per-level entries and club entries match.

## 3. Opt-out and privacy

- On by default, like Parking's board. Settings: "Show me on the boards"
  (off = nothing is sent at all, including heartbeats).
- Sent: an anonymous random player id (made in the browser), the handle,
  heartbeats (game id only), and on leaving a game its board numbers. Never
  sent: IP stored with scores (only used transiently for rate limits),
  anything typed.
- `PRIVACY.md` / privacy page updated in the same change (repo rule). The hub
  gets its own privacy page instead of borrowing Parking's.

## 4. Play time that can't be typed in

Client-reported minutes would be trivial to fake, so play time is counted by
the server:

1. On game load: `POST /api/club/session { player, game }` → one-shot session
   token (TTL 6 h).
2. Every 60 s while the page is visible and the player pressed a key or moved
   the mouse in the last 2 minutes: `POST /api/club/beat { token }`.
3. The server credits `min(now − lastBeat, 75 s)` per beat, never more than
   the wall clock allows, max 6 h per session and 16 h per player per day.
4. Idle tabs and hidden tabs earn nothing. Leaving through Esc sends a final
   beat.

## 5. Everything else is honest about trust

Blackjack chips and Parking stars are computed in the browser and can be
forged by anyone with the console open. The server rejects the impossible
(chips > 10,000,000, stars > 51, changes faster than play time allows) and
rate-limits, and the tabs are labelled "Unverified" in small mono text, same
as Parking's board today.

## 6. Server

- Vercel functions in the `sundown-club` project: `api/club/session.js`,
  `beat.js`, `submit.js`, `board.js`, shared rules in `api/_lib/club.js`.
- Storage: the same Upstash Redis Parking uses, keys prefixed `club:`.
  Sorted sets per board (`club:time:week:<iso-week>`, `club:time:all`,
  `club:bj:peak`, `club:pk:stars`, `club:streak`), one hash per player.
- Needs the API moved into this project first (`docs/deploy.md`, "Leaderboard
  API"): the owner adds the three Upstash env vars in the Vercel dashboard.
- Limits: 12 submits / 10 min / IP, 90 beats / 10 min / IP, body ≤ 2 KB.
- Failures are silent in the games (same as Parking); the hub shows "The board
  is resting" instead of rows.

## 7. Look and motion (hub style)

- Section heading "The board" (Young Serif), eyebrow "Unverified · resets
  Mondays" for Play time.
- Tabs as small pills; the active one takes the game's accent (Play time uses
  the club amber `#f0a868`).
- Rows: rank (mono, 2 digits), handle, game dots (which games they play),
  value right-aligned. Top 3 get a thin accent bar on the left, not medals or
  trophies (see the taste record in the root `CLAUDE.md`).
- Your row: highlighted with `rgba(240,168,104,.12)` and "You".
- Scroll-in: rows rise 16 px and fade in, 40 ms stagger, once. Switching tabs:
  old rows fade out 150 ms, new rows in with the same stagger. Values count up
  over 900 ms the first time. All off with reduced motion.

## 8. Acceptance

1. A tab left open and idle for 10 minutes earns no time; 10 minutes of real
   play earns 9–11 minutes.
2. Opt-out stops every request (check the network panel).
3. Forged values above the limits are rejected with 422 and never appear.
4. Board loads in < 300 ms warm; hub still works with the API down.
5. No typed text reaches the server.

## 9. Waiting on the owner

1. Tabs: Play time, Blackjack peak, Parking stars, Streak. Add or drop any?
2. Names: generated (recommended) or let people type a name (needs a word
   filter and a report button)?
3. On by default with opt-out (recommended), or off until someone opts in?
4. Move the leaderboard API into this project: you add the three env vars in
   Vercel (Settings → Environment Variables), I do the rest.

## 10. Built differently from the design above (decisions made while building)

- Two Vercel functions, not four: `api/club/play.js` (POST: session, beat, submit, name, reroll, leave) and `api/club/board.js` (GET). The free plan allows twelve.
- Names are made by the server from the player's id (`packages/shared/names.js`), not sent by the client; one name belongs to one player. "New name" is three a day.
- Streak on the board counts **UTC** days with 5+ server-measured minutes (the hub's own streak uses local days and also counts finished quests).
- Parking ties are broken by the best single park (the profile has no total score).
- Plausibility rules (documented in `api/_lib/board.js`): Blackjack peak ≤ 1,000 + 400 × seconds of Blackjack credited; Parking stars ≤ seconds of Parking credited ÷ 20.
- Limits per IP per 10 minutes: 12 submits, 90 beats, 30 sessions; reads 240 a minute.
- Switching off calls `leave`, which removes the player from every board and frees the name.
