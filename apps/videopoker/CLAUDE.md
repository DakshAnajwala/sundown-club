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

## Tutorial (1 Oct 2026)

Owner's brief: "idiot proof, no complex jargon, proper English". Offered the
first time someone sits down (`coach.offerOnce('videopoker')`, remembered in
`tut.v1.videopoker`), and any time with `T` or the "Learn to play" button. Uses
`packages/shared/coach.js`. One set-up deal (`machine.deal(coins, { deck })`): a pair of Jacks, hold both, draw a third. Pretend chips: nothing is saved while the
tutorial runs, and the real bankroll is put back after. Only the button the
current step asks for works; anything else shakes the card. Keep every new
line of tutorial text short, plain and free of unexplained poker or casino words.

## State (1 Oct 2026)

Playable prototype. Open items in SPEC §7.
