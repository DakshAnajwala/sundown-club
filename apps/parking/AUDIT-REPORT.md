# Parking Precision — popularity audit and fix pass

Branch `audit/popularity`, 28 September 2026, from `main` at `d93d9dd`.
Brief: `prompt.md`. **Nothing here has been pushed, merged or deployed**:
pushing `main` deploys the live site (CLAUDE.md §3).

Severity key: **blocks discovery** (search/share never happens) ·
**loses the visitor** (they arrive and leave) · **polish**.

## Top 10, ranked by expected effect on traction

| # | Change | Before | After |
|---|---|---|---|
| 1 | The hero's only call to action was **invisible** (opacity 0) until the visitor scrolled to the footer, on the live site | `before-home-1440.png`: no button above the fold | "Start driving" visible and clickable on arrival at 1440 and 390; asserted by `site-probe` |
| 2 | Link previews: relative `.webp` `og:image`, no Twitter card, stock Vite favicon | pasted link showed no image; tab showed Vite's logo | real 1200×630 `og-card.jpg`, full OG/Twitter tags, P-sign favicon + touch icon |
| 3 | Search basics: no `robots.txt`/`sitemap.xml`, no canonical, `/play/` untitled, no structured data | live 404s, `/play/` title "Parking Precision" | all present; JSON-LD `VideoGame`; site-probe 68/68 on the production build |
| 4 | Phones: a touch visitor hit a green play button into a game they can't drive | no touch handling anywhere | homepage and start menu say "keyboard needed" up front and offer "Send me the link" |
| 5 | Players who skip the tutorial start in P, press W, and nothing happens | prompt only "Get the car inside the bay" | "In Park: press F for Drive or R for Reverse" (their own keys) |
| 6 | No way to share a result | — | "Share score" copies "I parked ‹level› in Parking Precision: ‹score›/100 ‹stars› in ‹time› s. Free in your browser: ‹link›" (verified via clipboard) |
| 7 | Hero copy: vague CTA, "free / no download" buried, no lower-commitment path, no FAQ | 1 button, footer-only "no account" | "Start driving" + "See the car parks", "no download, no account" above the fold, "Before you start" FAQ |
| 8 | Stale visuals: old wheel/hands/dials in two showcase stills, old hero with the bay behind the headline, and "static" on the wheel hub | screenshots in `tools/shots/audit/` | recaptured from the current build (`tools/media-shots.mjs`); the hub "static" was z-fighting, fixed at the source |
| 9 | Leaderboard: restarts silently used up the 12-per-10-min start budget; `?debug` could post teleported runs | code review | separate start budget; a page with debug hooks never posts |
| 10 | Privacy text vs code: a server identity was created for every visitor on page load, and the run-token request was undisclosed | `Game.js`, PRIVACY.md §2/§4 | identity only on first post; policy (both copies) now describes the run-token request |

## Fixed — every finding, in the order found

Each row: dimension (D1–D8 from `prompt.md` §3), severity, what was wrong, the evidence, and the commit. Rows marked "Not fixed" are explained in the next-but-one section.

| # | Dim | Severity | Finding | Receipt | Status |
|---|---|---|---|---|---|
| 1 | D7 | loses the visitor | Hero "Begin to play" button invisible (opacity 0, scale 0.92) until the visitor scrolls ~10,700 px to the footer: the final-CTA GSAP tween selected `.cta`, which also matched the hero button. Reproduced on the live site. | `tools/shots/audit/cta.mjs` → `op: '0'` at top 702 px on 1440×900 and 621 px on 390×844, live and local | Fixed `698d81d` |
| 2 | D1 | blocks discovery | `favicon.svg` was Vite's stock purple logo | `public/favicon.svg` (Vite template) | Fixed `e2ecebd` |
| 3 | D1 | blocks discovery | `og:image` was a relative `.webp` path; no `og:url`, `og:type`, `twitter:card`, canonical | live `curl` of `/` head | Fixed `0e2be00` |
| 4 | D1 | blocks discovery | `/play/` title just "Parking Precision", no description, no OG | live `curl` of `/play/` | Fixed `0e2be00` |
| 5 | D1 | blocks discovery | `robots.txt` and `sitemap.xml` 404 on live | `curl` → 404 | Fixed `0e2be00` |
| 6 | D1 | polish | Wheel Lab and Level 13 sheet ship in `dist/` without `noindex` | site-probe | Fixed `0e2be00` |
| 7 | D1 | blocks discovery | No structured data | site-probe | Fixed `0e2be00` (JSON-LD VideoGame) |
| 8 | D3 | loses the visitor | `driver-seat.webp`, `reverse-camera.webp` show the old wheel/hands and the old 60 km/h dials | image vs current build | Fixed `e2ecebd` (recaptured, `tools/media-shots.mjs`) |
| 9 | D8 | loses the visitor | Wheel hub "static": steering column end face coplanar with hub pad face (z = −0.010) → z-fighting. The 15 Sep dithering fix misdiagnosed it as tone-mapping banding. | hub captured with shadows off / AO off / both off: stripes in all four, pattern changes per frame | Fixed `9e82fa9` |
| 10 | D7 | polish (integrity) | `?debug` on a production build exposes `debugTeleport` and the leaderboard still accepted runs | `src/main.js`, `src/net/leaderboard.js` | Fixed `8ade132` |
| 11 | D7 | polish (privacy accuracy) | `ensureIdentity()` ran on every `/play/` load, creating a server identity for every visitor; PRIVACY.md said the identifier leaves the device only when a score is posted, and that nothing is sent with auto-post off (run-token request undisclosed) | `Game.js:99`, PRIVACY.md §2/§4 | Fixed `f9c9fe9` (code + both policy copies) |
| 12 | D7 | polish (tooling) | `review-probe` hard-coded level indices 9/10, which now point at Level B4/B6; its timed-fail check had been failing | baseline `review-probe`: 3 FAIL | Fixed `486e519` |
| 13 | D2 | loses the visitor | Homepage calls City Drive "Level 13" (3 places); the game numbers it Level 17 of 17 | `index.html` `.next`, `Hud.js:1433` | Fixed `78d58c2` |
| 14 | D2 | loses the visitor | Hero never said "no download / no account" above the fold (only in the footer); CTA "Begin to play" is vague; no lower-commitment secondary action | 1440×900 screenshot | Fixed `78d58c2` ("Start driving", "See the car parks") |
| 15 | D2/D8 | loses the visitor | Phones: a touch visitor was told to come back on a computer but given no way to take the link with them, and the green play button led into a game they can't drive | 390×844 screenshot; no touch handling anywhere in `src/` | Fixed `78d58c2` (homepage "Send me the link"), `54ae067` (in-game start menu) |
| 16 | D2 | polish (honesty) | The example leaderboard rows had no visible "example" label and could read as real players | `index.html` `.board-rows` (aria-label only) | Fixed `78d58c2` |
| 17 | D2 | loses the visitor | No objection handling (free? download? phone? too hard? data?) | page structure | Fixed `78d58c2` ("Before you start" FAQ) |
| 18 | D3 | polish | On phones the hero copy ran up under the absolutely positioned nav (kicker touching the wordmark) | 390×844 screenshot | Fixed `78d58c2` |
| 19 | D8 | loses the visitor | Every level starts in P; a player who skipped the tutorial presses W, nothing moves, prompt says only "Get the car inside the bay" | `tools/shots/audit/stuck.mjs` | Fixed `54ae067` ("In Park: press F for Drive or R for Reverse", after throttle or 4 s) |
| 20 | D6 | blocks discovery | Head terms ("parking game online", "3D parking game") are owned by portals (Poki, CrazyGames, PacoGames, LittleGames); a standalone site won't outrank them. Distribution has to come from portals/communities, and SEO from long-tail terms the portals don't target (first-person, driver's seat, reversing camera, parallel/bay parking practice) | web search, 28 Sep 2026 | Reported; see Launch checklist and Needs your call |
| 21 | D5 | loses the visitor | In-play key legend `.hud-keys` at opacity 0.48 / 11.5 px over the 3D scene: the one on-screen controls reference is barely legible | `Hud.js:91`, `first-4-level1.png` | Fixed `9a15371` |
| 22 | D5 | polish | Menus: no `role="dialog"`, focus not moved into the panel (keyboard users tab from the top of the page to reach Start) | `Hud.js` `showPanel` | Fixed `9a15371` |
| 23 | D5 | polish | Live prompt changes not announced to screen readers (`aria-live`) | `Hud.js` `.hud-prompt` | Fixed `9a15371` |
| 24 | D3 | polish | Results card is pinned top+bottom, so it is always full-height with a large empty area; "Not parked" tag styled in success mint | `review-Deck-One-bay.png`, `review-failed.png` | Fixed `9a15371` |
| 25 | D6 | blocks discovery | No way to share a result: the cheapest word-of-mouth loop (a Wordle-style score line) is missing | results card | Fixed `9a15371` ("Share score") |
| 26 | D5 | loses the visitor | `--ink-faint` small text 3.5:1 (the one Lighthouse accessibility failure on live) | Lighthouse mobile, `.fine` | Fixed `88a738a` (5.9:1) |
| 27 | D3 | loses the visitor | Hero still from the previous build; its red car and glowing bay sat behind "PERFECTLY." at 1440 | `before-home-1440.png` | Fixed `22a4026` (recaptured, bay in the right third; phones crop at 70%) |
| 28 | D4 | loses the visitor | My own touch-note reorder produced mobile CLS 0.21, and web-font swap on the bottom-aligned hero 0.36 | Lighthouse mobile on the local build | Fixed `f0f85f0` (above-the-fold fonts preloaded; CLS 0) |
| 29 | D7 | polish | Code review of this branch: aria-live prompt rewritten every tick (screen readers repeat it); "In Park" hint fired for anyone stopped outside the bay after 4 s; review-card label culling still assumed a full-height card; dismissing the share sheet showed "Could not copy"; three drifting share implementations; `?debug` guard didn't match main.js's hook condition; site-probe identity check vacuous under dev; sitemap lastmod stale | `/code-review high main...audit/popularity` | Fixed `9596d96` |
| 30 | D7 | loses the visitor | Run starts and score posts shared one 12-per-10-min-per-IP budget: a player restarting a bay 12 times, or a class behind one school IP, silently lost posting | `api/run.js`, `api/_lib/board.js` | Fixed `547505c` (starts get their own 120 / 10 min budget) |
| 31 | D4 | polish | `/play/` ships ~95 KiB of JS unused at level 1 (City Drive's layout model is imported statically); Lighthouse desktop performance 85, TBT 280 ms (three.js boot + level build) | Lighthouse `/play/` on live | Not fixed; see "Not fixed, and why" |

## Needs your call

Each needs a decision only you can make; none has been started.

| Item | Recommendation | Size |
|---|---|---|
| **Merge `audit/popularity` into `main` and push** (= live deploy) | Merge. Everything is verified locally on the dev server and a production build; after the push, run `node tools/site-probe.mjs https://parking-precision.vercel.app` and paste the homepage URL into a link-preview checker. | 5 min + checks |
| **Touch controls for phones/tablets** | The single biggest remaining limit on reach: most casual web-game traffic is mobile, and portal "mobile homepage" slots need it. Scoped proposal: on-screen pedals (throttle/brake) and a drag-to-turn wheel mapped into `Input.js` state (no new physics), P/R/N/D as big buttons, chase camera by default on touch, HUD scaled up; the hand rig follows the same steer value. Needs its own GOAL + regression (`rebind`, `tutorial`, `autodrive` stay green). | 2–4 sessions |
| **Submit to game portals** (CrazyGames "Basic Launch" needs no SDK; itch.io; Poki later) | Yes, after touch controls if possible; CrazyGames Basic Launch first to measure retention. It means a second build hosted elsewhere, so the privacy policy and leaderboard wording need checking for that host. | 1 session + review |
| **Post to communities** (r/WebGames, Show HN, r/threejs) | Yes, after the merge. The procedural-everything angle ("no models, no textures, 137 cars in a handful of draw calls") suits r/threejs and Show HN; r/WebGames wants the playable link and one great screenshot. | your time |
| **Gameplay video clips** for the homepage | Worth it for conversion; needs ffmpeg installed (standing rule: ask first). | 1 session |
| **Strip old co-author trailers from `v4-stable`** | Low risk now (it isn't deployed), but it rewrites a pushed branch. | 5 min |
| **Positioning line for learners** ("the manoeuvres a driving test asks for: bay, parallel, three-point") | Strong long-tail hook that the portals don't target. Copy only, but it's a claim about the game's purpose, so your wording. | copy |

## Not fixed, and why

- **`/play/` loads City Drive's layout model for every level** (~95 KiB unused at level 1; Lighthouse desktop 85, TBT 280 ms). Fix is a lazy-loaded City Drive: `Levels.js` imports `CITY13` statically, and the level-select card needs its name/par before load. A real refactor across `Levels.js`/`LevelBuilder`/`Game.js` with full regression; left for its own session.
- **In-game fonts** stay system fonts (the game's "0 assets" rule), so the menus don't match the homepage's display type. By design.
- **Timed levels** can't be extended for accessibility: they're real-time game challenges (WCAG 2.2.1 essential exception). A "relaxed timer" setting would be a gameplay decision.
- **Server-side replay verification** for the leaderboard: still the only thing that would make it trustworthy (NOTES.md); out of scope.
- **Old showcase stills** (`rooftop-dusk.webp`, `underground.webp`) are exterior shots from 15 Sep and still accurate, so they weren't regenerated.

## Measurements

Lighthouse (desktop preset / default mobile), homepage. *Before* = live site
(current `main`). *After* = this branch's production build on `vite preview`
(no CDN or compression, so LCP isn't comparable; CLS and scores are).

| | Perf | A11y | Best pr. | SEO | LCP | CLS |
|---|---|---|---|---|---|---|
| Before, mobile | 98 | 96 | 100 | 100 | 2.0 s | 0 |
| After, mobile | 95–96 | **100** | 100 | 100 | 2.6–2.8 s (local) | 0 |
| Before, desktop | 100 | 96 | 100 | 100 | 0.5 s | 0.014 |
| After, desktop | 100 | **100** | 100 | 100 | 0.5 s | 0.014 |
| `/play/` before, desktop | 85 | 100 | 100 | 90 (no description) | 1.0 s | — |

`tools/site-probe.mjs`: before 46/64 (dev); after 66/66 (dev, 1 skip) and
68/68 (production build).

Final regression on this branch (dev server, 28 Sep): level-lint 17/0/0,
physics-probe OK, city-lint 11/11, leaderboard-probe 26/26, drive-test
**17/17, 0 console errors**, sensor-probe 0 failures, tutorial-probe PASS,
shell-probe 0 failures, autodrive 4/4, needle-probe OK, radar 9/9, chase
14/14, rebind 13/13, telemetry 12/12, review-probe ALL PASS (was 3 FAIL at
baseline — index bug, fixed). Baseline runs are in
`tools/shots/audit/regress-baseline*.log`, the final run in
`regress-final.log`.

`prompt.md` was committed on this branch (as instructed when the run
started); drop it from the merge if you don't want it in `main`.

Screenshots (gitignored, `tools/shots/`): `audit/before-home-1440.png`,
`audit/before-home-390.png`, `audit/hero-home-1440.png`,
`audit/hero-home-390.png`, `audit/copy2-home-390.png`, `audit/roof-1440.png`,
`audit/board-1440.png`, `audit/touch-menu-390.png`,
`audit/first-2-tutorial.png`, `audit/first-4-level1.png`,
`audit/hub-grid.png` (hub z-fighting) vs `audit/hubfix-grid.png`,
`review-Deck-One-bay.png`, `review-failed.png`, `media-og-card.jpg`.

## Launch checklist (what still blocks a public push, in order)

1. Merge + push `audit/popularity` (live deploy), then run `node tools/site-probe.mjs https://parking-precision.vercel.app` and check the link preview on one real platform.
2. Submit `https://parking-precision.vercel.app/sitemap.xml` in Google Search Console (needs your Google account).
3. One short gameplay clip or GIF for posts (needs ffmpeg — ask).
4. Post: r/threejs and Show HN (technical angle), then r/WebGames (the game).
5. Touch controls, then CrazyGames Basic Launch.
