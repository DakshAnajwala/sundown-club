# SPEC — Texas Hold'em

Status: **design + playable prototype, v0.1 (1 Oct 2026)**. Waiting on the owner (§9).
Page: `apps/holdem/index.html` (served at `/holdem/`). Engine `engine.js`, bots `bots.js`.

## 1. Decisions (owner, 1 Oct 2026)

| # | Topic | Decision |
|---|---|---|
| 1 | Game | No-Limit Texas Hold'em, cash game |
| 2 | Table | Six seats: you + five bots ("the regulars") |
| 3 | Look | Same lounge, palette, faceless figures and stylised cards as Blackjack (`packages/shared/lounge/`) |
| 4 | Chips | One club bankroll shared with Blackjack and Video Poker (`packages/shared/chips.js`) |
| 5 | Depth | Spec + playable prototype now; full game after review |
| 6 | Leaving | Esc once asks, Esc again saves and goes to the hub |

## 2. What must not change

Taste record from the root `CLAUDE.md` applies: no casino-green felt, no glossy
logos, no clip-art, no trophies. Faces stay blank.

## 3. Rules

| Rule | Value |
|---|---|
| Format | No-limit cash game, 6-max |
| Blinds | 5 / 10 in The Lounge. Later rooms: Salon 25 / 50, Upper Room 100 / 200 |
| Buy-in | 500 (50 big blinds) or the whole club bankroll if less; if the bankroll is under 20 the club refills it to 1,000 first |
| Bots' stacks | 400–880 at the start; a bot that busts buys in again for 500 next hand ("Rebuys") |
| Dealing | Burn one before each street. Button moves left every hand. Heads-up: button posts the small blind and acts first pre-flop |
| Betting | Min raise = the last full raise (at least the big blind). A short all-in does not reopen raising in real poker; the prototype lets players re-raise after it (noted, fix in the full build) |
| Showdown | Best five of seven; side pots by contribution level; odd chip to the first winner left of the button |
| Rake | None |

### 3.4 Flow

`startHand → (bots think 0.45–1.1 s each | your turn) → collect → flop/turn/river → showdown or last player standing → 2.2 s pause → next hand`.
`Space` fast-forwards every animation and bot until it is your turn or the next hand.

## 4. Look

### 4.1 Table
Oval, felt ellipse 2.30 × 1.24 m (semi-axes 1.15 × 0.62), felt top at 0.76 m,
leather rail (tube r 0.05), two pedestals. Felt `#4f7f73`, printed with
"sundown club" (Young Serif), "NO-LIMIT HOLD'EM · BLINDS 5 / 10", a betting
line and five card outlines for the board at z = −0.06.

### 4.2 Seats
Seven even slots (51.43° apart) around the ellipse; angle grows clockwise from
above, which is the order of play.

| Seat | Angle | Who | Suit | Style |
|---|---|---|---|---|
| 0 | 90° (nearest the camera) | You | — | — |
| 1 | 141.4° | Marlow | charcoal | Sharp (shark) |
| 2 | 192.9° | Ilse | navy | Tight (rock) |
| 3 | 244.3° | Teodor | olive | Wild (maniac) |
| — | 295.7° | Dealer (standing) | charcoal | — |
| 4 | 347.1° | Juno | cream | Sticky (calling station) |
| 5 | 38.6° | Vance | burgundy | Steady (pro) |

Each regular sits in a leather chair (`createFigure({ seated: true })`), hands on
the rail; reaches to push chips on a bet and taps the felt on a check. Each
seat has a hole-card spot, a bet spot, a chip stack and a dealer-button spot.
Labels (name, stack, style, last action) sit on the rail in front of the seat.

### 4.3 Camera
Seated behind seat 0: cinematic (1.62 m high, 1.86 m back, looking at the board,
FOV 58) with the shared drift; a small push toward the pot when you win.
Fixed overhead option exists in code (`rig.mode = 'fixed'`), no setting yet.

### 4.4 HUD
Top-left: room, blinds, your stack, club chips off the table. Top-right: keys.
Bottom: your hand in words ("Pocket Jacks", "AK suited", "Two pair, Kings and
Sevens"), then the action bar: Fold, Check/Call (with amount), Min, ½ pot, Pot,
All-in, slider + Raise to.

## 5. The regulars (bots.js)

Every decision: Monte Carlo equity against the players still in (160 runs
pre-flop, 220 after), pot odds, style and a little randomness.

| Style | loose | agg | bluff | stick |
|---|---|---|---|---|
| Sharp | 0 | 0.70 | 0.07 | 0.02 |
| Tight | −0.06 | 0.30 | 0.02 | 0 |
| Wild | +0.08 | 0.85 | 0.24 | 0.04 |
| Sticky | +0.10 | 0.15 | 0.01 | 0.14 |
| Steady | +0.02 | 0.55 | 0.10 | 0.03 |

Pre-flop a bot folds to a bet unless its equity is at least `1.25 − 2.5·loose −
1.5·stick` times a fair share. Over 800 simulated hands the sharp players win
and the wild and sticky ones lose, which is the point: they can be read.

## 6. Keys

| Key | Action |
|---|---|
| `F` | Fold |
| `C` | Check / call |
| `1` `2` `3` `A` | Raise min / ½ pot / pot / all-in |
| `R` | Raise to the slider amount |
| `Space` | Skip animations (to your turn or the next hand) |
| `Esc` | Leave (asks first) |

## 7. Saving

- Club bankroll = chips off the table + your stack, written at the buy-in,
  after every hand, on `pagehide` and when leaving. Chips you have already put
  into a pot when you leave mid-hand are lost (you fold).
- `holdem.v1`: hands, hands won, biggest pot won. Hub summary via
  `updateGame('holdem', …)`; play time via `trackPlaytime('holdem')`.

## 8. Verification

| Check | Pass |
|---|---|
| `node tools/holdem-sim.mjs 3000` | chips conserved every hand, no negative stacks, every hand finishes |
| `node tools/cards-check.mjs` | hand ranking + 7-card frequencies match the textbook |
| Headless play (`/holdem/`, call every street) | no console errors, bankroll saved after each hand |

## 9. Waiting on the owner

- Are five regulars with visible styles ("Sharp", "Wild"…) right, or should
  styles be hidden so you have to read them?
- Rooms with bigger blinds (Salon 25/50, Upper Room 100/200) unlocking like Blackjack's?
- Hand history panel and stats (VPIP, win rate) like Blackjack's QOL list?
- Full build: short all-in reopening rule, sit-out, rebuy limits, time bank.
