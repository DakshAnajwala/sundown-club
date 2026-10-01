# SPEC — Blackjack

Status: **design, v0.1 (29 Sep 2026)**. Waiting on sign-off (§16).
Prototype: `apps/blackjack/index.html` (look, light, camera, pacing; simplified rules).
Lives in the Sundown Club monorepo: `apps/blackjack/`.

This is the first game of a future game hub. The hub is out of scope for this
spec except for the contract Blackjack must honour (§13).

---

## 1. Decisions from the owner interview (29 Sep 2026)

| # | Topic | Decision |
|---|---|---|
| 1 | Hub location | `/` becomes the hub later. Parking homepage moves to `/parking/`, game stays `/play/`. Blackjack at `/blackjack/`. |
| 2 | Hub name | Working name "afterglow"; see `SPEC-hub.md`. |
| 3 | Hub look | Dark premium gallery (console-dashboard feel), per-game colours on tiles. |
| 4 | Hub content | Shared profile + stats, "continue where you left off", coming-soon tiles, about + legal. |
| 5 | Future games | More casino/card games and more 3D driving. |
| 6 | Rules | Vegas Strip (§3). |
| 7 | Actions | Split (to 4 hands), double, insurance / even money, late surrender. |
| 8 | Seats | One seat, solo against the dealer. |
| 9 | Side bets | None at launch. |
| 10 | Bankroll | Persistent, free refill to 1,000 when broke (§5). **1 Oct: one club bankroll shared with Hold'em and Video Poker** (`packages/shared/chips.js`, key `club.v1.chips`). |
| 11 | Progression | Cosmetic unlocks, table tiers, achievements (§6). |
| 12 | Leaderboard | Later. Design keeps it possible (main mode only). |
| 13 | Hub currency | Hub XP only; no shared money. |
| 14 | Look | slowroads.io-style graphics (§8), indoors for now. Other venues later (back alley, terrace). |
| 15 | Camera | Cinematic by default, fixed camera in settings. |
| 16 | Dealer | Faceless mannequin in a charcoal suit, HEAT / Time Shooter style (owner, 30 Sep; replaces "hands only"). |
| 17 | Assets | CC0 assets allowed (credited in notices). Procedural still preferred where it looks as good. |
| 18 | Time of day | Golden hour by default (owner, 30 Sep). Live day/night cycle stays as a setting. |
| 19 | QOL | Speed + skip, keyboard shortcuts, hand history + stats, undo/clear bet. |
| 20 | Strategy help | Hint, mistake flag and card-count trainer, **only in a separate Practice mode**. Main mode is clean and is the one that feeds stats, achievements, XP and a future leaderboard. |
| 21 | Platform | Laptop/desktop browser. No touch layout. |
| 22 | Navigation | Hub button in the pause menu + shared settings (once the hub exists). |
| 23 | Rollout | Blackjack standalone first at `/blackjack/`; hub after. |
| 24 | Cards/chips | Stylised to match the room (soft, flat, minimal). |
| 25 | Audio | Table SFX, result stings, chill music. No room ambience. |
| 26 | Title | "Blackjack". |
| 27 | Deadline | None. Quality over speed. |

## 2. Anti-reference: what it must not look like

Reference image: `apps/blackjack/refs/not-this-247blackjack.png` (24/7
Blackjack title screen). The owner rejected this look. The build must avoid:

- Saturated flat "casino green" felt filling the screen.
- Glossy, bevelled, drop-shadowed title lettering (red serif with white outline).
- Heavy black pill buttons with white caps text; clip-art icons (wrench, plus sign, rosettes, medals).
- Money shouted in yellow with exclamation marks ("$2,700!").
- Patterned banner header bars and dead side columns.
- 2D flat table seen from straight above.

What it should feel like instead: a quiet, sunlit room in a slowroads.io
palette; soft flat-shaded shapes; hazy distance; a UI that stays small and
out of the way; numbers set calmly in a mono face.

## 3. Rules (Vegas Strip)

| Rule | Value |
|---|---|
| Decks | 6 (312 cards) |
| Shuffle | Cut card at 75% penetration (234 cards dealt). The round in progress finishes, then a fresh shuffle. |
| Shuffle RNG | Fisher–Yates driven by `crypto.getRandomValues`. Practice and probes can pass a seed (mulberry32). |
| Dealer soft 17 | Stands (S17) |
| Blackjack pays | 3:2 (payouts round down to the smallest chip, 1) |
| Dealer peek | Yes: with an Ace or ten-value upcard the dealer checks for blackjack before the player acts. Dealer blackjack ends the round; player loses only the original bet (or pushes with a blackjack). |
| Double | On any first two cards, including after a split (DAS). One card only. |
| Split | Any two cards of equal **rank** (K+Q is not a pair; 10+K is not). Re-split to 4 hands total. |
| Split aces | Once only (no re-split of aces), one card each, no hitting. A+10 after a split is 21, pays 1:1, not a blackjack. |
| Surrender | Late surrender, first two cards only, not after a split. Returns half the bet. |
| Insurance | Offered when the upcard is an Ace, before the peek. Costs up to half the bet (UI offers exactly half). Pays 2:1. With a player blackjack it is shown as "Even money" (pays 1:1 at once). |
| Five-card Charlie | No (not a payout rule; appears only as an achievement). |
| Bet limits | Per tier (§6.2). Double and split cost the original bet and are allowed when the bankroll covers them, even if it takes the total over the table max. |

Expected house edge with perfect basic strategy for this rule set: about
**0.28%**. The simulator (§14) must land in 0.15–0.45% over 10 million hands.

### 3.1 Round state machine

```
BETTING → DEALING → (INSURANCE) → (PEEK) → PLAYER_TURN (per hand) → DEALER_TURN → SETTLE → BETTING
```

- Deal order: player, dealer up, player, dealer hole (face down).
- `PLAYER_TURN` skips when the player has blackjack or the dealer peeked a blackjack.
- `DEALER_TURN` is skipped when every player hand is bust or surrendered (the hole card is still revealed).
- Dealer draws to hard 17 or soft 18+. Soft 17 stands.
- Settle order: each player hand right to left from the player's view, then insurance.

### 3.2 Basic strategy (6D, S17, DAS, late surrender)

Used by the Practice hint, the mistake flag, and the simulator. Codes: H hit,
S stand, D double (else hit), Ds double (else stand), P split, Rh surrender
(else hit). Dealer upcard columns 2–A.

**Hard totals**

| Hand | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | A |
|---|---|---|---|---|---|---|---|---|---|---|
| 5–8 | H | H | H | H | H | H | H | H | H | H |
| 9 | H | D | D | D | D | H | H | H | H | H |
| 10 | D | D | D | D | D | D | D | D | H | H |
| 11 | D | D | D | D | D | D | D | D | D | H |
| 12 | H | H | S | S | S | H | H | H | H | H |
| 13–14 | S | S | S | S | S | H | H | H | H | H |
| 15 | S | S | S | S | S | H | H | H | Rh | H |
| 16 | S | S | S | S | S | H | H | Rh | Rh | Rh |
| 17+ | S | S | S | S | S | S | S | S | S | S |

**Soft totals**

| Hand | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | A |
|---|---|---|---|---|---|---|---|---|---|---|
| A,2 / A,3 | H | H | H | D | D | H | H | H | H | H |
| A,4 / A,5 | H | H | D | D | D | H | H | H | H | H |
| A,6 | H | D | D | D | D | H | H | H | H | H |
| A,7 | S | Ds | Ds | Ds | Ds | S | S | H | H | H |
| A,8 / A,9 | S | S | S | S | S | S | S | S | S | S |

**Pairs**

| Pair | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | A |
|---|---|---|---|---|---|---|---|---|---|---|
| A,A | P | P | P | P | P | P | P | P | P | P |
| 10,10 | S | S | S | S | S | S | S | S | S | S |
| 9,9 | P | P | P | P | P | S | P | P | S | S |
| 8,8 | P | P | P | P | P | P | P | P | P | P |
| 7,7 | P | P | P | P | P | P | H | H | H | H |
| 6,6 | P | P | P | P | P | H | H | H | H | H |
| 5,5 | as hard 10 |||||||||| 
| 4,4 | H | H | H | P | P | H | H | H | H | H |
| 3,3 / 2,2 | P | P | P | P | P | P | H | H | H | H |

- A pair at the 4-hand limit is played by its hard/soft total.
- Surrender not available (after split, or 3+ cards): Rh becomes H.
- Insurance: never (basic strategy). The count trainer flags it as correct at true count ≥ +3.

## 4. Modes

| | Main | Practice |
|---|---|---|
| Bankroll | Persistent (`bj.v1.main`) | Separate sandbox (`bj.v1.practice`); set to any amount 100–1,000,000, reset any time |
| Hint (`?` / `F1`) | No | Yes: highlights the basic-strategy button and shows the rule ("Double 11 vs 6") |
| Mistake flag | No | Toggle. After a deviation: soft note under the hand, 3 s, and an accuracy % |
| Count trainer | No | Toggle. Hi-Lo running count, true count (RC ÷ decks left, rounded to 0.5), shoe bar. Quiz every N hands (N = 5 default): "Running count?" numeric input, answer checked. |
| Stats, history, achievements, unlocks, hub XP | Yes | No (Practice has its own accuracy/quiz stats only) |
| Future leaderboard | Eligible | Never |

Practice is visibly marked: a small "PRACTICE" tag top-left and a cooler
lamp colour (§8.4) so a screenshot can't pass for the main mode.

## 5. Bankroll

- Start: 1,000 chips. Play money only; no purchases, no real-money language
  anywhere (the word "chips", never "$").
- Refill: when bankroll < 10 (the lowest table minimum) and nothing is on
  the table, a "Refill to 1,000" button appears. `rebuys += 1`.
- `peak` = highest bankroll ever reached in main mode (after settle). It is
  the headline number on the hub tile.
- A bankroll below the current tier's minimum shows "Move to <lower room>".

## 6. Progression

### 6.1 Hub XP (main mode only)

| Event | XP |
|---|---|
| Hand settled | 1 per player hand |
| Blackjack | +5 |
| Achievement | +25 |
| First hand of a calendar day | +10 |

### 6.2 Table tiers (rooms)

Same room geometry, different dressing and window view (§8.5).

| Tier | Name | Min–max bet | Unlock |
|---|---|---|---|
| 1 | The Lounge | 10–500 | Start |
| 2 | The Salon | 100–5,000 | Peak ≥ 10,000 |
| 3 | The Upper Room | 1,000–50,000 | Peak ≥ 100,000 |

Unlocks are permanent (a later drop in bankroll does not re-lock a room).

### 6.3 Cosmetic unlocks

| Kind | Item | Unlock |
|---|---|---|
| Card back | Dune (default) | — |
| Card back | Tide | 100 hands |
| Card back | Grove | 10 blackjacks |
| Card back | Ember | Unlock The Salon |
| Card back | Aurora | 1,000 hands |
| Felt | Sage (default), Slate, Clay, Dusk | 250 / 500 / 2,000 hands |
| Chips | Pastel (default), Stone | Unlock The Upper Room |

### 6.4 Achievements (main mode)

| Id | Name | Condition |
|---|---|---|
| first-hand | Pull Up a Chair | Settle 1 hand |
| natural | Natural | First blackjack |
| charlie | Five-Card Charlie | Stand or hit to ≤21 with 5+ cards |
| seven-card | Seven-Card 21 | Exactly 21 with 7+ cards |
| aces | Aces High | Split aces, both hands reach 21 |
| split-sweep | Clean Sweep | Split to 3+ hands, win every hand |
| double-5 | Nerve | Win 5 doubles in a row |
| streak-7 | Hot Shoe | Win 7 hands in a row (pushes don't break it) |
| push-3 | Stalemate | 3 pushes in a row |
| sweat | Sweat | Win a hand where the dealer drew 4+ cards |
| comeback | Comeback | Reach 2,000 after dropping below 50, same bankroll life (no refill in between) |
| salon | Salon Regular | Unlock The Salon |
| upper | Upper Room | Unlock The Upper Room |
| hands-1k | Night Shift | 1,000 hands |
| accurate | By the Book | 100 main-mode hands in a row that match basic strategy (checked silently; never shown during play) |

## 7. Controls and QOL

### 7.1 Keyboard (defaults, rebindable like parking's `Input.js`)

| Key | Action |
|---|---|
| `Space` | Deal / Rebet & deal / skip current animations |
| `H` | Hit |
| `S` | Stand |
| `D` | Double |
| `P` | Split |
| `R` | Surrender |
| `I` / `N` | Insurance yes / no |
| `1`–`5` | Add a chip of the tier's 1st–5th denomination (Lounge 5/25/100/500, Salon 25/100/500/1K/5K, Upper Room 1K/5K/25K) |
| `Backspace` / `Z` | Undo last chip |
| `C` | Clear bet |
| `X` | Double the previous bet and deal |
| `Esc` | Pause menu |
| `?` | Hint (Practice only) |
| `Tab` | Hand history panel |

Every button shows its key as a small keycap. Mouse: left-click chip to add,
right-click the bet stack to remove its top chip.

### 7.2 QOL

- Deal speed: 1×, 1.5×, 2×, 3×, 4× (all §9 durations ÷ speed).
- Skip: `Space` or click during an animation completes the queued animations
  instantly (state is already decided by the engine; §12).
- Auto-rebet toggle: after settle, the previous bet is placed again (if the
  bankroll covers it) and the deal starts after 600 ms ÷ speed.
- Undo last chip, clear bet, "×2 previous", "Min", "Max".
- Hand history: last 100 main hands (cards, actions, dealer, result, net).
- Stats: hands, win/push/loss %, net, biggest win, blackjacks, doubles won %,
  splits, surrenders, rebuys, peak, time played.
- Hand totals shown as small tags; soft totals as "7 / 17".
- Confirm-free: nothing asks "are you sure" except resetting Practice and
  resetting all data.

## 8. Look: slowroads.io style

### 8.1 What "slowroads style" means here

- Geometry is low-poly and **flat-shaded** (`flatShading: true`); no image
  textures on the room except the felt print and card faces.
- Light is soft: sky hemisphere light + one sun through the window + one
  warm pendant lamp over the table. Soft shadows (PCFSoft).
- Strong **atmospheric haze** outside: distant layers fade into the horizon
  colour, which is also the fog colour. The sky is a vertical gradient.
- Muted, pastel, slightly desaturated palette. Nothing neon, nothing pure black.
- A winding road on the nearest hill outside the window (a nod to slowroads).
- Tone mapping ACES Filmic, exposure 1.0, sRGB output.

### 8.2 Room layout (metres; table centre at origin, floor y = 0)

| Item | Value |
|---|---|
| Room | 7.0 wide (x −3.5…3.5), 6.0 deep (z −2.6…3.4), 3.0 high |
| Back wall | z = −2.6, behind the dealer |
| Window | in the back wall, 3.6 wide × 1.6 high, sill at 0.85; 3 vertical mullions |
| Table top (felt) | y = 0.76. Shape: flat dealer edge at z = −0.42, arc toward the player, radius 1.02, x-scale 1.05 |
| Rail | leather-padded tube, radius 0.045, along the arc |
| Pendant lamp | cone shade at (0, 2.25, −0.05), light 0.35 below it |
| Player betting circle | (0, 0.761, 0.40), radius 0.075 |
| Player cards | first card centre (0, 0.762, 0.20); each next card +0.030 x, −0.038 z; split hands spread 0.22 apart in x |
| Dealer cards | first card centre (−0.10, 0.762, −0.17); step 0.070 in x |
| Shoe | (0.60, 0.76, −0.26), angled 20° toward the table |
| Discard tray | (−0.62, 0.76, −0.26) |
| Chip rack (dealer) | centre (0, 0.76, −0.36), 0.52 × 0.10 |
| Card size | 1.5 × poker size: 0.095 × 0.132, corner radius 0.006 (readability from the seat) |
| Chip size | 1.3 × real: radius 0.0254, height 0.0043 |

### 8.3 Cameras

| | Position | Look at | FOV |
|---|---|---|---|
| Cinematic (default) | (0, 1.42, 1.05) | (0, 0.92, −0.70) | 56 |
| Fixed | (0, 1.62, 0.92) | (0, 0.74, −0.16) | 48 |

Cinematic extras (off in Fixed and with `prefers-reduced-motion`):

| Beat | Move | Duration (1×) |
|---|---|---|
| Idle | head drift ±0.006 m x/y, ±0.15° yaw, period 7 s | loop |
| Hole card reveal when it decides the hand | dolly 0.12 m toward (0, 0.76, −0.18), FOV −3° | 600 ms in, hold to settle, 900 ms out |
| Player blackjack | dolly 0.10 m toward player cards | 700 ms in, 1,200 ms out |
| Win ≥ 10× table min | small lift +0.03 m | 800 ms |

### 8.4 Palette (Lounge, main mode)

| Token | Hex | Use |
|---|---|---|
| felt | `#4f7f73` | Sage-teal felt (deliberately muted; see §2) |
| feltInk | `#e9e1cf` | Felt print |
| rail | `#3b2d27` | Leather rail |
| wood | `#7a5a43` | Table apron, floor planks |
| plaster | `#d9ccb8` | Walls |
| trim | `#b8a58a` | Wainscot, window frame |
| lampWarm | `#ffd7a1` | Pendant lamp, main |
| lampPractice | `#cfe3ff` | Pendant lamp, Practice |
| cardFace | `#f3ede2` | Card stock |
| cardRed | `#c0594b` | Hearts, diamonds |
| cardInk | `#2e2d35` | Spades, clubs |

Chips (Pastel set): 1 `#cfc6b8` (payout change only), 5 `#e8e1d3`, 25 `#86ad8f`, 100 `#4a5568`, 500 `#9d86b5`,
1,000 `#dcb45e`, 5,000 `#c7735e`, 25,000 `#6e9fb4`, each with 6 cream edge
stripes and an inner ring.

### 8.5 Day/night cycle

Full cycle 16 real minutes. `t` in [0, 1), 0 = midnight. Default is
**golden hour, frozen at `t = 0.755`** (owner, 30 Sep); "Live cycle" in
settings starts the clock from there. Values interpolate linearly between keys
(colours in linear space).

| t | Sun elev | Sky top | Horizon / fog | Sun colour | Sun int. | Hemi int. | Lamp int. |
|---|---|---|---|---|---|---|---|
| 0.00 | −30° | `#0e1324` | `#252c45` | `#8fa6d6` (moon) | 0.25 | 0.25 | 1.00 |
| 0.22 | −4° | `#27305a` | `#b98a8a` | `#ffb38a` | 0.30 | 0.35 | 0.85 |
| 0.27 | 6° | `#6d86b8` | `#f0c39a` | `#ffc58f` | 1.40 | 0.60 | 0.30 |
| 0.35 | 30° | `#7fa9d6` | `#d7e2e4` | `#fff1dc` | 2.20 | 0.90 | 0.00 |
| 0.50 | 55° | `#6f9fd2` | `#dfe8ea` | `#ffffff` | 2.50 | 1.00 | 0.00 |
| 0.68 | 30° | `#7fa4cf` | `#e4dccb` | `#fff0d6` | 2.00 | 0.90 | 0.00 |
| 0.755 | 6° | `#6f7fb2` | `#f4ad6e` | `#ffb068` | 1.70 | 0.60 | 0.35 |
| 0.80 | −3° | `#3f4a78` | `#d98f6f` | `#ff9a6a` | 0.40 | 0.40 | 0.80 |
| 0.86 | −12° | `#1d2544` | `#4d5078` | `#8fa6d6` | 0.25 | 0.30 | 1.00 |

Sun azimuth moves from −30° (dawn) to +30° (dusk), so the low sun stays inside the window's view. Fog
near 25 m, far 480 m (far ridges stay as faint silhouettes). Settings: "Time of day: golden hour / live". Cycle keeps
running while paused (it is scenery).

Tier dressing: The Salon = felt `#3f5f7a`, walls `#c9c0b3`, window view of
coast (sea plane + cliffs). The Upper Room = felt `#5a4a58`, walls `#b7b2ac`,
window view of mountains with snow caps.

### 8.6 Dealer

A standing, faceless mannequin in a suit (references: the crews in *Heat*,
the Time Shooter games). No face, no hair, no expressions: a smooth matte
head is the whole character.

| Part | Value |
|---|---|
| Position | stands behind the dealer edge, body centre (0, 0, −0.74), scale 0.93 |
| Head | smooth ovoid, radius 0.10 scaled (0.9, 1.16, 1.0), flat-shaded, skin `#d8d2ca`; tilted 0.32 rad toward the table, turns up to ±0.5 rad toward the busy hand |
| Suit | charcoal `#474a52`, lapels `#383a41`; 8-sided tapered torso (waist 0.92 m) |
| Shirt / tie | shirt `#ece6dc` (V, collar, cuffs), slim tie `#1b1c21` |
| Hands | same matte tone as the head; palm + four fingers + thumb |
| Arms | two-bone IK every frame, upper 0.31 m, forearm 0.29 m, elbows out and down |
| Lean | torso leans up to 0.34 rad when a hand target is past 82% of reach |
| Idle | breathing, torso scale y ±0.4%, period 3.9 s (off with reduced motion) |

The hand nearest the shoe (player's right) deals. The other hand flips the
hole card and moves chips. Hands rest on the rack edge at (±0.24, 0.80, −0.47).
A soft front fill (`#ffe2c4`, 0.45) keeps the suit charcoal when the window
backlights it.

### 8.7 Cards and chips (stylised)

- Card face: `cardFace` stock, rounded corners, large index (rank + small suit
  pip) top-left and bottom-right in Schibsted Grotesk 700; centre shows one
  large suit pip for 2–10 and A (count shown by a row of small dots under
  it), and a simple geometric emblem for J/Q/K (J = bar, Q = circle,
  K = crown of three triangles) in the suit colour.
- Card back "Dune": soft diagonal bands in felt-complementary tones with a
  cream border.
- Chips: flat cylinder, pastel top with a thin cream ring and the value in
  the centre in IBM Plex Mono 600.

### 8.8 UI (HTML overlay)

- Fonts: Schibsted Grotesk (UI), IBM Plex Mono (numbers), both already
  self-hosted via @fontsource. No display face; no logo art.
- Panels: warm translucent paper `rgba(248, 243, 234, 0.84)`, text `#2c2a30`,
  radius 10 px, 1 px border `rgba(44, 42, 48, 0.12)`, backdrop blur 8 px.
- Top-left: bankroll and current bet in mono; room name small caps.
- Bottom-centre: action row (only legal actions enabled) with keycaps.
- Bottom: chip tray (5 denominations of the tier) + Deal.
- Hand totals: small tags beside each hand, projected from 3D.
- Results: one word beside the hand ("Win +50", "Blackjack +75", "Push",
  "Bust"), fades in 200 ms. No banners.
- Start screen: the live room itself with the camera slowly settling, a small
  "Blackjack" wordmark in Schibsted Grotesk 500 with 0.2 em tracking, and
  "Play" / "Practice" / "Settings". No splash art.

## 9. Motion timing (1× speed)

| Step | Duration | Easing / notes |
|---|---|---|
| Chip onto bet | 180 ms | easeOutCubic, slides from tray |
| Deal one card, shoe → spot | 420 ms | arc peak +0.07 m, easeInOutCubic; face-up cards flip over the last 45% |
| Gap between dealt cards | 260 ms | start-to-start |
| Dealer peek (A or ten up) | 350 up + 250 hold + 250 down | left hand lifts the hole card corner 12° |
| Insurance prompt | appears after the peek conditions, waits for input | |
| Hit / double card | 420 ms | double card lands rotated 90° |
| Split | 380 ms | cards slide apart; new bet chips 180 ms |
| Hole card reveal | 360 ms flip, then 300 ms pause | |
| Dealer draw | 420 ms + 350 ms pause between draws | the pause is the tension |
| Result tags | 200 ms fade | |
| Payout chips from rack | 450 ms, stagger 60 ms | |
| Losing bet swept to rack | 400 ms | |
| Clear table to discard | 500 ms, all cards together | |
| Auto-rebet delay | 600 ms | |

A typical one-hand round at 1× is about 6–8 s; at 4× about 2 s.

## 10. Audio

| Layer | Content | Source |
|---|---|---|
| SFX | card slide, card place, flip, shuffle, chip click, chip stack, dealer tap | CC0 (e.g. Kenney "Casino Audio") or synthesised; 3–5 variations each, ±4% pitch random |
| Stings | Blackjack (rising 3-note), big win, bust (soft low thud), push (neutral tick) | Synthesised (Web Audio), ≤ 1.2 s |
| Music | Chill lo-fi/ambient loop, 2–4 tracks | CC0 only; ≤ 3 MB total OGG/Opus; fallback: the parking game's synthesised lofi pad |

Volumes: master, SFX, music, stings (0–100). Music ducks 6 dB under
stings. Every CC0 file is listed in `THIRD_PARTY_NOTICES.md` and
`public/notices.html` with its source URL in the same commit.

## 11. Performance (laptop browser)

- Target: 60 fps at 1440×900 on an integrated GPU (Intel Iris Xe, Apple M1).
- Budget: ≤ 120 draw calls, ≤ 150k triangles, one 2048 shadow map (sun),
  lamp without shadows.
- Quality: Auto / Low / Medium / High. Auto drops one level when the median
  frame time over 3 s is above 20 ms, and never raises itself.
- Low: no shadows, pixel ratio 1, 2 hill layers. High: pixel ratio up to 2.

## 12. Architecture

```
blackjack/index.html              page entry (vite input `blackjack`)
src/blackjack/main.js             wiring only
src/blackjack/rules/Shoe.js       decks, shuffle, cut card, seeded RNG
src/blackjack/rules/Engine.js     pure state machine (§3.1); no DOM, no three
src/blackjack/rules/Strategy.js   §3.2 tables; `bestAction(hand, upcard, options)`
src/blackjack/rules/Count.js      Hi-Lo running/true count (Practice)
src/blackjack/scene/Room.js       room, window, landscape, sky, day cycle
src/blackjack/scene/Table.js      table, felt print, shoe, rack, tray
src/blackjack/scene/Cards.js      card meshes, face atlas (canvas), backs
src/blackjack/scene/Chips.js      instanced chips
src/blackjack/scene/DealerHands.js
src/blackjack/scene/CameraRig.js  cinematic / fixed (§8.3)
src/blackjack/anim/Timeline.js    queue of steps; speed; skipAll()
src/blackjack/ui/                 Hud, Settings, History, Stats, Practice overlays
src/blackjack/audio/              SFX, stings, music
src/blackjack/store.js            localStorage (§13)
```

- The engine decides everything first and emits events (`deal`, `peek`,
  `flip`, `offerInsurance`, `awaitAction`, `settle`…). The timeline plays them.
  Skip = drain the timeline to the end state. The engine never waits on
  animation.
- `Engine.js`, `Strategy.js`, `Shoe.js`, `Count.js` import nothing from the
  browser so the node probes (§14) can run them.
- Shares no runtime code with the parking game. Fonts come from the same
  @fontsource packages.

## 13. Storage and hub contract

| Key | Content |
|---|---|
| `bj.v1.main` | bankroll, peak, rebuys, unlockedTiers, stats, history (100), achievements, unlocks, cosmetics, strategy streak |
| `bj.v1.practice` | bankroll, trainer toggles, accuracy, quiz stats |
| `bj.v1.settings` | speed, autoRebet, camera, quality, timeOfDay mode, volumes, keybinds |
| `hub.v1.profile` | shared: `{ xp, games: { blackjack: { lastPlayed, headline: "Peak 12,450", resume: "/blackjack/" } } }` |

Every read and write is in try/catch; a missing or corrupt value falls back
to defaults. No network traffic in v1 (so `PRIVACY.md` only needs a line
saying Blackjack keeps its data in the browser).

## 14. Verification

| Probe | Checks |
|---|---|
| `tools/bj-sim.mjs` | 10M hands, basic strategy, seeded: house edge 0.15–0.45%; blackjack frequency 4.6–4.9%; no negative bankroll path; runs in node |
| `tools/bj-rules.mjs` | Fixed-shoe scenarios: peek with A and ten; insurance + even money; split to 4; split aces one card; A+10 after split pays 1:1; DAS; surrender only on 2 cards; S17; 3:2 rounding; cut card reshuffle after the round |
| `tools/bj-strategy.mjs` | Every cell of §3.2 against `bestAction` |
| `tools/bj-probe.mjs` | puppeteer: loads `/blackjack/`, plays 50 rounds by keyboard at 4×, asserts bankroll matches engine ledger, no console errors, draw calls ≤ 120 |
| `tools/bj-shots.mjs` | Screenshots at t = 0.30, 0.50, 0.76, 0.82, 0.00 for both cameras |

## 15. Acceptance criteria (v1)

1. All probes in §14 pass.
2. Keyboard-only play of every action works; every button shows its key.
3. Skip at any moment leaves the table in the exact engine state.
4. 60 fps median on the reference laptop at Medium; Auto never flickers between levels.
5. Nothing on screen matches the §2 list.
6. Main and Practice data never mix (check: play Practice 20 hands, main stats unchanged).
7. Reload at any point restores bankroll; a round in progress on reload is voided and its bet returned.

## 16. Waiting on the owner

- Review the prototype (look, light, camera, pacing).
- Tier names (§6.2) and unlock thresholds.
- Achievement list (§6.4) and cosmetic list (§6.3).
- Music: CC0 tracks or synthesised only.
