# Sundown Club design audit: before the overhaul

Phase 1 of `docs/prompts/design-overhaul.md`. This is the "before" baseline: what
every surface looks like and how it behaves on the live site today (1 Oct 2026,
deploy of commit 4062e5d), what to keep, and what fails, ranked by how much a
player would notice.

## How this was made

- **Screens.** Every surface was opened on https://sundown-club.vercel.app in
  Chrome (DevTools MCP) at 1440×900; the hub also at 1280×800 and 390×844. Each
  game was played through its states: first load, tutorial, betting or driving,
  result, settings, leave card. 48 screenshots are in
  [`screens/before/`](screens/before/) (index at the end of this file).
- **Critique and audit.** `/impeccable critique` and `/impeccable audit` were run
  for each surface. Each surface got its own isolated design review, which read
  the source and the screenshots. A separate detector pass ran
  `impeccable detect` over every page's source and injected the live detector
  into every built page. The full critique of each surface is stored under
  `.impeccable/critique/`.
- **Numbers.** Frame rate is a 3 s `requestAnimationFrame` count on an M1 Pro
  (120 Hz display). Hub load metrics come from a Chrome performance trace and a
  Lighthouse desktop run. `npm run check` was run as the logic baseline.

## Scorecard

Critique: Nielsen's 10 heuristics, each scored 0–4. Audit: 5 dimensions, each 0–4. For both scores, higher is better.

| Surface | Critique | Audit /20 (a11y · perf · responsive · theming · integrity) | Detector (source / live page) | Frame rate |
|---|---|---|---|---|
| Hub `/` | 23/36 (64%, acceptable) | 12 (2·3·2·2·3), acceptable | 14 / 38 findings, most of them deliberate scenery | n/a. LCP 525 ms, CLS 0.00 trace / 0.069 Lighthouse, Lighthouse a11y 97 |
| Blackjack | 22/40 (55%, acceptable) | 7 (1·2·2·1·1), poor | 4 / 5 | 120 fps |
| Hold'em | 25/40 (63%, acceptable) | 9 (1·2·2·2·2), poor | 5 / 10 | 119 fps |
| Video Poker | 24/40 (60%, acceptable) | 7 (1·2·1·1·2), poor | 4 / 4 | 120 fps |
| Parking homepage `/parking/` | 24/36 (67%, acceptable) | 10 (2·2·3·1·2), acceptable (one audit for both Parking pages) | 1 / 12 | n/a |
| Parking game `/parking/play/` | 28/40 (70%, good) | see above | 0 / 3 (its UI is built in JS, so the source scan sees nothing) | **45 fps** in chase view, default High preset |
| Night Drive `/racing/` | 17/40 (43%, poor) | 9 (1·3·2·2·1), poor | 0 / 69 | 120 fps |

`npm run check`: all pass (hand ranking, 7-card frequencies, Hold'em 1,500-hand
sim, video poker pay table and frequencies).

## What works: keep it

These are the things every review agreed carry the club. The redesign builds on
them, it does not replace them.

1. **The 3D rooms are the brand.** The golden-hour window and flat-shaded hills,
   the faceless dealer reaching with IK arms, the regulars who tap the felt to
   check, the pastel chips, "sundown club" printed on muted felt, the video
   poker cabinet with its Young Serif topper and the drink on the side table.
   Night Drive's lamplit road and follow camera are the best moment on the
   site at speed. (bj-03, he-01, vp-03, nd-02)
2. **The setting sky as the spine of the hub.** Golden hour to moonrise as you
   scroll, the per-game accent tint, the full-bleed Blackjack card falling into
   night, and the closing line "The lamp stays on. Pick a game whenever you're
   ready." (hub-04, hub-12)
3. **The approved lobby pattern.** A real game frame fills the screen, with a
   rail of games and ← → Enter. It painted in 525 ms. Fix its bugs; do not
   replace the idea. (hub-01)
4. **The voice.** "A dealer in a charcoal suit who has never once shown his
   face." In-world buttons: "Take a seat", "Sit in", "Pull up a stool", "Find
   the glowing bay." Plain-English tutorials with pretend chips, one set-up
   hand, and only the asked-for button working.
5. **Keyboard-first play.** Every button shows its key, Space skips
   animations, and Esc twice leaves and saves. The leave card defaults to
   Stay, returns focus, and refunds a hand in play. (bj-06)
6. **Parking's coaching with real numbers.** The overhead review in cm and
   degrees, plus one fix sentence ("18 cm right of centre cost you 10
   points"). Parking also keeps its instruments inside the car: dials, sensors
   and radar on the dashboard, with a screen readout only in chase view.
   (pk-13, pk-17)
7. **Fair play built in.** The engines decide and the pages only animate. One
   pay table. Leaving Video Poker draws your hand for you. No real-money
   language, and no requests to other servers.

## What fails, ranked by how much a player would notice

P0 means it breaks the game or its trust. P1 is a major problem. P2 is minor.
P3 is polish. Each line names the surface, the evidence and the fix direction.

### Tier 1: every player notices, in the first minute

| # | Pri | Surface | What | Evidence | Fix direction |
|---|---|---|---|---|---|
| 1 | **P0** | Blackjack | A developer panel ("Design review", open) is live on the public page. It names `SPEC-blackjack.md` and has a time slider and a room switcher. **The room switcher mints chips:** picking a room raises the bankroll to 20× its minimum (20,000 in the Upper Room), and that is saved into the shared club bankroll. | bj-01; `apps/blackjack/index.html:136-169, 1189` | Remove it from the public build (keep it behind `?dev`). Camera, speed, sound and shadows move to a real settings sheet. |
| 2 | **P0** | Hold'em | **The showdown tells you nothing, and its numbers are wrong.** There is no result for you when you lose. The winner's label shows only the last side-pot slice ("Wins 162" from a 237 pot), and the winner's stack is counted twice during the pause (Marlow shows 768; the truth is 531). The engine is right; the display is wrong. | he-04, he-05; `apps/holdem/engine.js:130-143`, `index.html:350, 391` | Sum the wins per seat. Apply the real stacks after the chip slides. Add one line for you: "Marlow wins 237 with a pair of Jacks · your Queen high · −106". |
| 3 | **P1** | Hub | **Every visitor is greeted as the developer:** "daksh · Lv 7", "Continue · 2,450 chips", "So far tonight, daksh." with sample stats. Blackjack then opens with 1,000 chips. | hub-01, hub-10; `apps/hub/index.html:298, 408-425, 471-483` | Read the real profile and bankroll (`profile.js`, `chips.js`). Empty state: no level and no Continue; ledger cells show "—" and "Not played yet". |
| 4 | **P1** | Night Drive | **The public page is an engineering lab.** A full-height panel of 37 controls ("Final drive 3.55 :1", "drive / drag 2221 / 834 N") covers the road. There is no goal or prompt. The hub sold a clean photo of the same page with the panels hidden. | nd-01, nd-02; `apps/racing/design/handling/handling.js:415-461` | Start with the panel closed. Open a garage drawer with 2 cars and 4 presets; put the sliders under "Fine tune". Give the player one challenge on screen ("Hold W: quarter mile. Best —"). |
| 5 | **P1** | All four | **Four different brands.** The hub is warm espresso with Young Serif. The card games use cream paper panels with a teal primary. Parking uses a condensed all-caps face, slate and a third mint, and its menus are in the system font. Night Drive is a teal engineering lab. The shared tutorial and leave cards hard-code Blackjack's orange in every game. | hub-01, bj-03, pk-01, pk-10, nd-01; three mints `#8fe3cf` / `#76d6a8` / `#8fe6bb` | One token source in `packages/shared/design/` (Phase 2). Shared overlays take the game's accent. |
| 6 | **P1** | Blackjack | **The game bets for you.** Return visits deal a 50 bet by themselves 0.9 s after load. A first visit shows "Rebet 50" beside "Bet 0". | bj-01; `index.html:1191, 1310` | No auto-deal. Show "Deal" until a hand has been played, then "Deal again · 50". |
| 7 | **P1** | Video Poker | **The machine's screen is unreadable.** It is about 373 px wide at 1440×900: the pay table is 7.6 px, and HELD and the result are about 9 px. Every decision and every outcome lives on that screen. | vp-03, vp-04; `apps/videopoker/index.html:98, 118-122` | Sit the player at the machine: the camera eases in on the first deal so the screen fills about 60% of the height. |

### Tier 2: players notice while playing

| # | Pri | Surface | What | Evidence | Fix direction |
|---|---|---|---|---|---|
| 8 | **P1** | Video Poker, Blackjack | **The first Enter or Space spends chips.** Space and Enter are taken over page-wide. On the auto-focused "Show me how", Enter deals a real 25-chip hand. A keyboard player cannot get past step 1 of the tutorial. | `videopoker/index.html:271`, `blackjack/index.html:1232` | Ignore game keys when the target is a button or an overlay. |
| 9 | **P1** | Video Poker | **Pressing T mid-hand loses the bet.** Starting the tutorial draws the hand and throws away the payout after the stake was already saved. This breaks the rule "a bet is never lost to leaving". | `videopoker/index.html:318` | Settle the hand before starting the tutorial. |
| 10 | **P1** | Blackjack, Hold'em | **Your own cards are the least visible thing.** In Blackjack the action bar covers the bottom third of your cards and your bet at 1440 and 1280. In Hold'em your two cards lie flat at about 48×34 px; your stack sits in the far top-left. | bj-04, bj-07, he-03 | Frame the camera per aspect ratio above a reserved HUD band. Hold'em: tilt and enlarge the hole cards, or show a 2D pair beside the bar. |
| 11 | **P1** | Hold'em, Video Poker | **The action bars wrap to two rows at every size.** `left:50%` plus `translateX(-50%)` caps the bar at half the viewport. In Video Poker, Hold 5 lands under Hold 1. | he-03, vp-03; `holdem/index.html:37`, `videopoker/index.html:32` | `inset-inline` / `width: max-content`. Cut Hold'em to Fold · Check/Call · Bet, with sizing on demand. |
| 12 | **P1** | Blackjack | **Running out of chips is a dead end.** It shows dev copy, "Out of chips. In the build: Refill to 1,000.", for 2.6 s, with no button. `refill()` exists and the other games call it. | `blackjack/index.html:1134` | Add a "Refill to 1,000" button, plus "Move to The Lounge" when you are below the room minimum. |
| 13 | **P1** | Parking | **Pause and results ask too much.** Pause has 8 equal buttons, including both "Main menu" and "Leave to Sundown Club". Results have 7 to 10 buttons. The results card contradicts itself (−9 in the table, "cost you 10 points" in the sentence), and its review labels overlap ("18 cm right" under "10 cm short"). | pk-15, pk-17; `src/game/Retention.js:165, 192`, `ParkingReview.js:708-737` | Pause: Resume, Restart, Level select, then a quiet row and one Leave. Results: Next (Enter), Retry (B), then a text row. One rounding rule. Measured labels. |
| 14 | **P1** | Parking | **45 fps by default.** The game starts on High: 2× pixel ratio, full-resolution ambient occlusion, 4× MSAA on HalfFloat, 2048 px shadows, and no adaptive quality. The card games run at 120 fps on the same laptop. | pk-14; `src/ui/settings.js:20-24, 39`, `src/render/Renderer.js:25-60` | Measure on first run and step down. Half-resolution AO. Cap the pixel ratio at 1.5. |
| 15 | **P2** | Blackjack, Video Poker, Hold'em | **Outcomes have no moment.** A blackjack gets the same 12 px tag as a bust. A Video Poker loss is a 9 px line, and a break-even at max bet reads "+25" while the chip count does not rise. | bj-05, vp-04 | Keep losses quiet but name them ("Pair of 8s. Jacks or better pays."). Wins get a larger figure in the game's accent for about 1.5 s. Shown static under reduced motion. |
| 16 | **P2** | Hub | **Wayfinding goes wrong.** The nav stays on "Workshop" over Your evening and on "Parking" at the footer. The header accent stays Parking teal to the end. The page loads already scrolled about 28 px. | hub-10, hub-12; `index.html:556-561` | One scroll-spy over every section. Accents from one game registry. Set `history.scrollRestoration`. |
| 17 | **P2** | Hub | **The rail is cut off.** The last tile reads "TEST DRI" at 1440 and 1280, and "Parking Precision" wraps at 1280. The rail's scrollbar is hidden. | hub-01, hub-14; `index.html:103-104` | Size the tiles from the container while there are 6 games or fewer. Names on one line. |
| 18 | **P2** | Hub | **The story is long, with dead frames.** About 14 screens of pinned scroll before the Workshop. Some frames are empty (a dark void with half a card; an empty starfield). | hub-03, hub-07; chapters 340 / 320 / 420vh | Trim to roughly 220 / 240 / 300vh. Show a heading and a button on every frame. |
| 19 | **P2** | Night Drive | **The panel steals the driving keys.** After you touch a slider, W does nothing and the arrows move the slider. Leaving also overwrites the hub's bests with this session ("Top speed 1 km/h"). | `handling.js:207-215, 960-969` | Blur controls after use. Keep the max of stored and new bests. |
| 20 | **P2** | Parking | **Level select and settings scroll inside a modal.** Level 17 is cut off. Level select is cards inside a card, with a pill inside each. Volume sits at the bottom of the settings. | pk-11, pk-16 | Make level select a full-screen page grouped by floor (a lift directory). Settings in tabs, with Sound first. |
| 21 | **P2** | Hold'em | **Seat labels sit on the figures and the near regulars are cropped.** The Keys card wraps with an orphan "leave" and leaves out R. | he-01, he-03 | Anchor the labels below the rail. Choose the field of view from the aspect ratio. Fold the keys behind `?` after a few hands. |

### Tier 3: some players notice (keyboard, screen reader, phone, slower laptops)

| # | Pri | Surface | What | Fix direction |
|---|---|---|---|---|
| 22 | **P1** | All games | **A screen-reader user cannot play any game.** Cards, totals, turns and results exist only in WebGL or canvas. The live regions are on the wrong elements: whole headers re-read every chip count, and the hub hero re-reads about 40 words on every arrow press. | One `role="status"` line per game ("You 16, dealer shows 4"; "Bust, you lose 50"). Take `aria-live` off the headers. |
| 23 | **P1** | Night Drive, Parking game | **`prefers-reduced-motion` is ignored.** Night Drive's rumble, blur and streaks default on, and the racing app never checks the setting. Parking's speed FOV stays on. | Turn these off under `reduce` (a club rule). |
| 24 | **P2** | Shared leave card | **Tab can't reach "Leave".** The card swallows every key. The page's keycap styles leak in ("Enter" at about 1.8:1). The copy never says what happens to a hand in play (Hold'em: it folds and the chips are lost). | Let Tab cycle the two buttons. Isolate the styles. Add "A hand in play is cancelled and your bet comes back" (or "…folds, −106"). |
| 25 | **P2** | Parking game | **Settings controls have no accessible names.** Every change rebuilds the panel and moves focus to "Done". Focus can Tab out of an open dialog. Look-back is right-mouse only. | `htmlFor`/`id`, update in place, `inert` behind dialogs, a bindable look-back key. |
| 26 | **P2** | Many | **Contrast failures.** Unlit manifesto words 1.29:1 (hub). Keycaps inside the Play button 3.3–4.2:1. The 500 chip label 2.8:1 (Blackjack). Night Drive's 11 px help text 4.3:1, and lower over lane lines. Parking's key legend over asphalt is about 2.8:1. Folded Hold'em seats 2.1–3.3:1. | Tokens with measured pairs (Phase 2). No opacity-based hierarchy. |
| 27 | **P2** | All card games | **The scene renders at 120 fps while nothing moves.** Video Poker also redraws and re-uploads a 4.9 MB screen texture every frame (about 590 MB/s). This is battery and fan noise in a calm card game. | Render on change, cap at 60, draw the screen texture only when its state changes. |
| 28 | **P3** | Hub on a phone | The profile chip wraps "Lv / 7". Key hints show on a touch screen. Play leads straight into a keyboard-only game with no warning on the page (only in the FAQ). | `mobile-native` pass on the hub only. Say "needs a keyboard" near Play on touch devices. |

### Tier 4: nobody sees it, but it costs us

| # | What | Where |
|---|---|---|
| 29 | Paper tokens are copied into each card game. `--ink` means dark ink in the games and light ink in the hub (same name, opposite colour). Each accent is defined 3–5 times. The game registry in hub SPEC §6 (`games.js`) does not exist. | `holdem:14`, `videopoker:13`, `blackjack:14-16`, `hub:16, 23-24, 360-483` |
| 30 | The static pages ship three.js unminified (about 2.1 MB). Parking (560 KB) and Night Drive (798 KB) each bundle their own copy instead of reusing `/vendor/`. The hub loads all five 1600 px backdrops and nine chapter images at once (about 1.0 MB, against a 600 KB budget). | `tools/build-site.mjs:38`, hub `:334-390, 487` |
| 31 | Per-frame DOM writes (`left`/`top` on tags, `innerHTML` at 20 Hz), `backdrop-filter` blur on panels over a moving canvas, and `preserveDrawingBuffer: true`. | lounge.js:45-48, Hud.js:1672, lab.css:38 |
| 32 | Console warnings: `THREE.Clock` is deprecated, and `PCFSoftShadowMap` has been removed (the soft shadows in the Blackjack spec are not rendering). The Parking homepage has four font preloads that 404, and canonical/OG tags that still point at parking-precision.vercel.app. | Blackjack console; `apps/parking/index.html:50-53` |
| 33 | **Copy drift:** the FAQ says "Blackjack uses play chips only". The Parking menu says "Sixteen lots" (there are 17). The gear order is P R N F on the homepage but F R N P in the game. "Finesse" / "Clean run" / "Bumps" all mean the same thing. Video Poker uses coins vs chips. Blackjack's felt advertises insurance that is not built. | hub `:440`, Hud.js:599, `blackjack:756` |

## Detector notes

- **Real:**
  - Night Drive: 30× low contrast and 23× 11 px text.
  - The 10 px text on hub tiles, Hold'em style tags and the Parking HUD units.
  - The Blackjack chip label at 2.8:1.
  - The hub header's padding transition (layout thrash).
  - The Design review panel shipped open.
- **False positives:**
  - Privacy page, 46× low contrast: the detector read the gradient tint as the background. The real ratios are 8.2–15.5:1.
  - Parking homepage, flat type hierarchy: its CSS is imported in JS, so the source scan did not see it.
  - Hub buried rasters: deliberate opacity-0 crossfade images.
  - Stars, sun and moon glows: deliberate scenery.
  - The Parking mint flagged as "cyan neon": it is the game's accent.
- **Coverage gap:** a "clean" source scan of a JS-built UI means nothing was
  scanned. Night Drive went from 0 findings in the source scan to 69 on the
  live page.

## Baselines the rebuild must not fall below

| Measure | Today | Where measured |
|---|---|---|
| Blackjack, Hold'em, Video Poker frame rate | 120 / 119 / 120 fps | M1 Pro, 1280–1440 wide, Chrome 154 |
| Parking frame rate | 45 fps in chase view, High preset (default) | same machine |
| Night Drive frame rate | 120 fps at 140 km/h | same machine |
| Hub LCP / CLS | 525 ms / 0.00 (trace); CLS 0.069 in a Lighthouse run | 1440×900, no throttling |
| Hub Lighthouse | Accessibility 97, Best practices 100, SEO 100 | desktop |
| Logic checks | `npm run check`: all pass | node |

Still to record before the React work starts (Phase 3): draw calls per scene;
Parking's regression set (`level-lint`, `physics-probe`, `drive-test` 17/17,
`sensor-probe`, `tutorial-probe`, `shell-probe`, `autodrive`); and Night
Drive's `race-physics-probe`, `handling-shot`, `models-shot` and `site-check`.

## Where the prompt and the CLAUDE.md files disagree (CLAUDE.md wins)

1. **Fonts.** The prompt allows a new font "if it is on Google Fonts". The root
   `CLAUDE.md` says never add a Google Fonts link: every font is self-hosted
   from npm (`@fontsource`) into `/vendor/`. So a new font must be available
   as a self-hostable package and still needs your yes.
2. **Commit trailers.** The session's harness asks for a `Co-Authored-By:
   Claude` line on commits. `CLAUDE.md` and the prompt both say no trailer;
   none will be added.
3. **Deploying.** The prompt says to deploy only from a clean clone of committed
   `main`, "per `docs/deploy.md`". `docs/deploy.md` says to deploy with the CLI
   from the repo root and never mentions a clean clone. I will follow the
   stricter of the two (a clean clone) and update `docs/deploy.md` when we get
   there.

## Live bugs found that do not need to wait for the redesign

Four of the findings are bugs on the live site today. Fixing them is small, but
each one touches game behaviour, so they wait for your call:

1. The Blackjack room switcher mints chips into the shared bankroll (#1).
2. The Hold'em showdown shows wrong numbers and no result for you (#2).
3. Pressing T mid-hand in Video Poker loses the bet (#9).
4. Enter and Space on a focused button deal a hand in Video Poker and
   Blackjack (#8).

## Owner's decisions at sign-off (1 Oct 2026)

- **Phase 1 approved.** Phase 2 (product, design system) starts.
- **The four live bugs above are fixed now,** on the branch `fix/live-bugs`, one commit each. They are not merged or deployed yet:
  - 44d3661: Enter and Space press the focused button instead of dealing.
  - ac7f6c8: Blackjack's room switch no longer adds chips.
  - ffd2897: Hold'em showdown numbers are correct, and a result line says who won.
  - 51eeef0: Video Poker never loses a hand's result to the tutorial or to leaving.
  
  `npm run check` passes, and every fix was checked in Chrome on the built site.
- **Night Drive: no tuning in public.** The public test drive becomes car and
  camera only. The Handling Lab (sliders, presets, telemetry) stays on the dev
  server. This removes the tuning panel players can see today, on your
  instruction. It is built in Phase 5 (Night Drive UI).

## Screenshot index (`screens/before/`)

| Surface | Files |
|---|---|
| Hub | `hub-01-lobby-1440`, `hub-14-lobby-1280`, `hub-13-lobby-390`, `hub-02-door`, `hub-03/04-blackjack-a/b`, `hub-05/06-cardroom-a/b`, `hub-07/08-parking-a/b`, `hub-09-workshop`, `hub-10-evening`, `hub-11-house`, `hub-12-footer`, `hub-15-keyboard-focus` |
| Blackjack | `bj-01-first-load` (tutorial offer + Design review panel), `bj-02-tutorial`, `bj-03-betting`, `bj-04-player-turn`, `bj-05-result`, `bj-06-leave-card`, `bj-07-play-1280` |
| Hold'em | `he-01-first-load`, `he-02-tutorial`, `he-03-your-turn`, `he-04-flop`, `he-05-showdown`, `he-06-leave-card` |
| Video Poker | `vp-01-first-load`, `vp-02-tutorial`, `vp-03-hold`, `vp-04-result` |
| Parking homepage | `pk-01-home-hero`, `pk-02-home-story`, `pk-03-home-lots`, `pk-04-home-how`, `pk-05-home-who` |
| Parking game | `pk-10-start-menu`, `pk-11-settings`, `pk-12-controls`, `pk-13-driving-seat`, `pk-14-driving-chase`, `pk-15-pause-leave`, `pk-16-level-select`, `pk-17-results` |
| Night Drive | `nd-01-first-load`, `nd-02-at-speed`, `nd-03-leave-card` |
| Lighthouse | `lighthouse/report.html` (hub, desktop) |
