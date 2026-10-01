# Video Poker (`apps/videopoker`)

Served at `/videopoker/`. Root `CLAUDE.md` rules apply. `SPEC.md` is the
source of truth (pay table, machine, motion, keys, saving).

## Files

| Path | What |
|---|---|
| `index.html` | The page: lounge + machine, screen canvas, buttons, play loop, saving |
| `engine.js` | Pure Jacks or Better machine: deal, hold, draw, pay table, `classify()` |

## Rules for this app

- Pay table lives only in `engine.js` (`PAYTABLE`); the screen draws from it.
- `node tools/videopoker-check.mjs` must pass after any engine change.
- 1 coin = 5 chips in The Lounge. Bets and wins go straight to the club
  bankroll (`packages/shared/chips.js`); save after every hand.
- Leaving mid-hand draws the hand first, so a bet is never lost to leaving.
- Static page with an import map, like Hold'em: test through the built site.

## State (1 Oct 2026)

Playable prototype. Open items in SPEC §7.
