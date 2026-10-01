# Texas Hold'em (`apps/holdem`)

Served at `/holdem/`. Root `CLAUDE.md` rules apply. `SPEC.md` is the source
of truth (rules, seats, bot styles, keys, saving, checks).

## Files

| Path | What |
|---|---|
| `index.html` | The page: table, seats, HUD, animation of engine events, your turn, saving |
| `engine.js` | Pure No-Limit Hold'em table: blinds, betting, streets, side pots, showdown. Returns event lists |
| `bots.js` | The five regulars: Monte Carlo equity + style table |

Shared code it uses: `packages/shared/lounge/*` (room, cards, chips, figures,
timeline, SFX), `cards.js` (deck, ranking), `chips.js` (club bankroll),
`leave-guard.js`, `profile.js`.

## Rules for this app

- The engine decides, the page animates. Never put game rules in `index.html`;
  never touch the DOM or three.js in `engine.js`/`bots.js` (they run in node).
- `node tools/holdem-sim.mjs 3000` must pass after any engine or bot change
  (chips conserved, no negative stacks, every hand ends).
- Chips: the club bankroll is `chips off the table + your stack`. Write it
  with `setBankroll` after every hand; never keep chips anywhere else.
- Seat order is clockwise from above, seat 0 = you at 90°. The dealer stands
  at 295.7° and is not a seat.
- Static page: imports go through the import map (`three` → `/vendor/three/`,
  `@sundown/shared/` → `/shared/`), so open it from the built site
  (`npm run build && npm run serve`), not as a loose file.

## Tutorial (1 Oct 2026)

Owner's brief: "idiot proof, no complex jargon, proper English". Offered the
first time someone sits down (`coach.offerOnce('holdem')`, remembered in
`tut.v1.holdem`), and any time with `T` or the "Learn to play" button. Uses
`packages/shared/coach.js`. One set-up hand (`LESSON_ORDER`, dealt with `startHand({ deck, button: 0 })`): you hold two Aces, Marlow plays a fixed script to the showdown, everyone else folds. Starting it mid-hand calls that hand off and returns everyone's chips. Pretend chips: nothing is saved while the
tutorial runs, and the real bankroll is put back after. Only the button the
current step asks for works; anything else shakes the card. Keep every new
line of tutorial text short, plain and free of unexplained poker or casino words.

## State (1 Oct 2026)

Playable prototype. Open items in SPEC §9.
