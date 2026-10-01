# SPEC — Video Poker (Jacks or Better)

Status: **design + playable prototype, v0.1 (1 Oct 2026)**. Waiting on the owner (§7).
Page: `apps/videopoker/index.html` (served at `/videopoker/`). Engine `engine.js`.

## 1. Decisions (owner, 1 Oct 2026)

| Topic | Decision |
|---|---|
| Game | Jacks or Better (the owner's pick for "poker too", alongside Hold'em) |
| Look | Same lounge as Blackjack; a machine by the window, you on a stool |
| Chips | Shared club bankroll (`packages/shared/chips.js`) |
| Depth | Spec + playable prototype now |

## 2. Rules

- 52 cards, fresh shuffle every hand. Deal 5, hold any, draw once.
- Bet 1–5 coins; **1 coin = 5 chips** in The Lounge.
- Full-pay 9/6 table, coins paid per coin bet:

| Hand | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| Royal flush | 250 | 500 | 750 | 1000 | **4000** |
| Straight flush | 50 | 100 | 150 | 200 | 250 |
| Four of a kind | 25 | 50 | 75 | 100 | 125 |
| Full house | 9 | 18 | 27 | 36 | 45 |
| Flush | 6 | 12 | 18 | 24 | 30 |
| Straight | 4 | 8 | 12 | 16 | 20 |
| Three of a kind | 3 | 6 | 9 | 12 | 15 |
| Two pair | 2 | 4 | 6 | 8 | 10 |
| Jacks or better | 1 | 2 | 3 | 4 | 5 |

Return with perfect play: 99.54% (published figure for 9/6 JoB).

## 3. Look

- Machine 0.70 m wide: dark wood body, brass trim, slanted screen 0.60 × 0.45 m
  at 1.31 m, topper sign "Jacks or Better · SUNDOWN CLUB · FULL PAY 9 / 6" in
  Young Serif on dark wood. A side table with a drink, a stool you sit on.
- The screen is a canvas drawn every frame: pay table with the current bet's
  column highlighted (the hit line lights up), five stylised cards (same deck
  as the tables) that flip edge-on, HELD labels, chips / message / bet footer.
- Physical buttons on the deck: green BET, five cream HOLD (glow when held),
  gold DEAL; they press down 6 mm when used.
- Camera: seated, 1.45 m high, 0.92 m back, FOV 50, shared drift; small push
  toward the screen on a win.

## 4. Motion (1×)

| Step | Time |
|---|---|
| Card flip | 260 ms, edge-on squeeze |
| Deal stagger | 90 ms per card |
| Draw stagger | 120 ms per replaced card |
| Result | 420 ms after the last flip |

## 5. Keys and clicks

`1`–`5` hold · `Space`/`Enter` deal or draw · `B` bet one (cycles 1–5) · `M`
max bet and deal · `Esc` leave (asks first). Clicking a card on the screen or a
machine button does the same.

## 6. Saving

- Bet comes off the club bankroll at the deal, wins go on at the result; saved
  after every hand and on `pagehide`.
- Leaving mid-hand draws the hand for you first, so the bet is never lost to
  leaving.
- `vp.v1`: hands, best hand, coins won. Hub summary `updateGame('videopoker', …)`;
  play time `trackPlaytime('videopoker')`.

## 7. Verification and open items

- `node tools/videopoker-check.mjs`: every pay line on known hands, the
  Jacks-or-better cut-off, royal 4000 at max bet, dealt-hand frequencies over
  300,000 deals within 6% of the textbook.
- Waiting on the owner: a hold-hint / strategy trainer (Practice-style), other
  machines (Deuces Wild, Double Bonus), a "double up" gamble after a win.
