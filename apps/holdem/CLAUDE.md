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
- Static page: imports go through the import map (`three`,
  `@sundown/shared/` → `/shared/`), so open it from the built site
  (`npm run build && npm run serve`), not as a loose file.

## State (1 Oct 2026)

Playable prototype. Open items in SPEC §9.
