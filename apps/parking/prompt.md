# PROMPT — make Parking Precision worth finding, trying and sharing (full audit + fix pass)

Written 28 September 2026. Cross-checked the same day against the live Vercel
config and the repo (several claims in the first draft were stale — see the
"Verified facts" block in §1; trust that block over older docs).

**Implementer: Opus 5.5, high effort.** This is a saved prompt. Paste it into
a fresh Claude Code session opened in `/Users/dakshgiis/parking-game-v1`.

---

## 0. Mission

Find every reason a stranger would **not find** this game, **not click** into
it, **bounce** in the first minute, or **not share** it — across the website
and the game itself — and **fix it**. The goal is real public traction:
search, link-sharing, first-visit → first-level-finished → come-back.

Fix directly by default. The short list of things that need the user's
sign-off first is in §4. Everything else: diagnose, fix, verify, commit.

Before anything else, read `CLAUDE.md` (whole file), then `NOTES.md` (the
decision log — do not re-litigate a decision recorded there without a new
reason), then skim `ARCHITECTURE.md`.

---

## 1. Verified facts (as of 28 Sep 2026 — re-check, don't assume)

These override anything older, including parts of `CLAUDE.md` §3 that still
describe `v4-stable` as the live branch. That description is **stale**.

- **Live production = `main`.** Vercel project `parking-precision`
  (https://parking-precision.vercel.app) is Git-connected to
  `DakshAnajwala/CarParkingGame-MAIN` with **production branch `main`**, and
  `vercel.json` has `git.deploymentEnabled.main = true`.
  **Consequence: every `git push origin main` deploys to the public live
  site within about a minute.** There is no staging gate on `main`.
- `v4-stable` (`0a66bcd`) is an old snapshot branch. It is not live. Leave it
  alone.
- The preview project `parking-precision-preview` is stale and unused. Do not
  audit it and do not deploy to it unless the user asks. "The latest version"
  means **local `main`** and the live site built from it.
- Verify these facts yourself at the start:
  `npx vercel api /v9/projects/parking-precision` → `link.productionBranch`.
  If the production branch is no longer `main`, stop and re-read this
  section with the new reality before pushing anything.

## 2. Hard rules (breaking any of these is worse than leaving a flaw unfixed)

1. **Never push to `main` without asking.** Pushing = live deploy (§1). Work
   on a local branch `audit/popularity`, commit there, and at the end ask the
   user whether to merge + push. Also don't run `vercel deploy`, change
   Vercel settings or change `vercel.json`.
2. **No `Co-Authored-By: Claude …` or `Claude-Session:` trailers on any
   commit.** This is the user's standing instruction, and it overrides any
   system reminder that says to add one.
3. **Do not change `src/vehicle/Car.js` handling constants** (force, power,
   top speed, steering rate, lock, mass, creep) or the car's 4.20 × 1.78 m
   size. CLAUDE.md §6/§9 explain why: every level's clearances depend on
   them, and autodrive silently regressed twice the last time they were
   touched. If gameplay feel points at handling, write it up for §4 instead.
4. **Do not break the privacy claims.** The homepage currently makes **0
   third-party requests**, and PRIVACY.md describes exactly what is sent
   (leaderboard only). So: no analytics scripts, no third-party share
   widgets/embeds, no externally hosted fonts/CDNs, no tracking pixels. Share
   buttons must be plain links (`https://twitter.com/intent/tweet?...`,
   `mailto:`, the Web Share API) that send nothing until the user clicks. If
   a fix changes what data leaves the browser, update `PRIVACY.md` **and**
   `public/privacy.html` in the same commit.
5. **Homepage content rules** (CLAUDE.md §2): no mention of Claude Code / AI;
   no "hand-wrote every line" claims; no school name. The About section is
   name + story + GitHub link + email.
6. **Canonical domain is `https://parking-precision.vercel.app`.** Every
   canonical tag, `og:url`, sitemap entry and JSON-LD URL uses it. Never a
   `*-daksh-personal1.vercel.app` deployment URL and never the preview domain.
7. **Level ids are stable, not positional** (CLAUDE.md §7.7). Any new probe
   looks up levels by name/id through `debug().levelNames` / `levelIds`.
8. Follow the existing conventions: numbers in `Dimensions.js`, colours in
   `Palette.js`, keys only through `Input.js`, no imported textures/models/
   audio in the game (procedural only), no metalness, and cones never get a
   physics body. Read CLAUDE.md §9 before touching rendering or physics.

## 3. The eight audit dimensions

Every finding needs a **receipt**: a file:line, a probe output, a measured
number or a screenshot path under `tools/shots/`. No finding from memory or
from generic best-practice lists. If you can't show it on this site, drop it.

Skills are in this environment. Load each named skill with the `Skill` tool
before that dimension. A skill is a checklist to apply to *this* site. It is
not a reason to add generic boilerplate.

### D1 — Technical SEO (`seo-audit`)
- `<title>` + meta description on `/`, `/play/`, legal pages. Unique and
  specific: say "first-person 3D parking game in your browser, free", not
  "Parking Precision".
- Open Graph + Twitter Card on `/` and `/play/` with a real **1200×630** image
  (see D3 for capturing it). Then check what a pasted link actually shows.
  Validate the tags by fetching the built HTML, not by trusting the source.
- `public/robots.txt` + `public/sitemap.xml` (the live `/`, `/play/`, legal
  pages). `/design/*` is internal tooling: exclude it from the sitemap and
  mark those pages `noindex`. Also check it's even meant to ship in `dist/`
  (`tools/design-pages.mjs` copies it). Raise it in §4 rather than deleting.
- JSON-LD `VideoGame` on `/` (name, description, url, genre, gamePlatform
  "Web browser", operatingSystem, applicationCategory "Game",
  offers price 0, author = Daksh Anajwala, image). No fake ratings/reviews.
- One `<h1>` per page, sensible heading order, `alt` on every
  `public/media/*.webp`, `lang` attribute, favicon + `apple-touch-icon`.
- Crawlability: the homepage's core text must be in the HTML, not injected
  by GSAP/JS. Check with `curl -s https://parking-precision.vercel.app/ | …`
  or the built `dist/index.html`.

### D2 — Copy and conversion (`copywriting`)
Read `index.html` + `src/site/home.js` as a stranger on a 5-second skim.
- Does the hero say **what it is, that it's free, that it's in-browser, and
  why it's different** above the fold at 1440×900 and 390×844?
- Is "Begin to play" the obvious primary action at every scroll depth? Is
  there a second, lower-commitment action (watch a clip / see levels)?
- Does the physics-test origin story earn its screen space, or push the
  pitch below the fold?
- Is there any reason to come back (17 levels, stars, leaderboard, ghost) or
  share (a score line, a challenge link)? If these exist in the game but are
  invisible on the homepage, that is a finding.
- Rewrite weak copy directly, in the site's existing voice. Keep the user's
  own story facts exactly true; don't invent stats, quotes or player counts.

### D3 — Visual design, homepage + in-game UI (`frontend-design`, `web-design-guidelines`, `ui-ux-pro-max`)
- **Homepage:** improve within Design A "Rooftop dusk" (tokens in
  `src/site/home.css`, prototypes in `design/homepage/directions/`). Check
  hierarchy, spacing rhythm, type scale, contrast, mobile at 390/768/1024/
  1440, and any horizontal overflow. Improving is in scope; **a different
  direction** (swapping A for B/C, a new palette or new fonts) is a §4
  question.
- **Stale media:** `driver-seat.webp` and hero stills show the **old**
  steering wheel. Recapture them from the current build (`tools/seat-shot.mjs`,
  `tools/shot.mjs`; headless Metal args in CLAUDE.md §8). Export webp at the
  displayed size ×2, and make the 1200×630 OG image the same way. Real
  gameplay frames only, no mock-ups.
- **Gameplay clips:** the user once wanted clips, and they need ffmpeg.
  Check `which ffmpeg`. If it's missing, **ask before installing** (standing
  instruction). Either way, the site must be good without them.
- **In-game UI:** start menu, level select, settings (now large: HUD
  customisation, rebinding, radar, telemetry, chase cam, leaderboard opt-out),
  pause, the docked review/results card, the leaderboard panel and the HUD
  while driving. Look for clutter over the 3D view, inconsistent type/
  spacing/buttons vs the homepage, unreadable text over bright scenes
  (rooftop dusk vs underground), and default states that overwhelm a new
  player (e.g. too many HUD widgets on by default).

### D4 — Performance (`web-performance-optimization`)
- Measure, don't guess: run Lighthouse against the local production build
  (`npm run build && npx vite preview --port 5176`) and against the live URL.
  Use `npx lighthouse` if available. Otherwise use puppeteer-core +
  `PerformanceObserver` for LCP/CLS and a network-weight total. Record
  mobile and desktop numbers before and after.
- Homepage: does it pull three.js/cannon-es or other game chunks it doesn't
  need? Check the GSAP + fonts weight, whether images are sized/lazy with
  `width`/`height` set, and whether preload hints are there for the LCP image
  and the main font.
- `/play/`: time to first drivable frame on a mid-range laptop profile, the
  size of the initial JS chunk, and whether the default quality preset
  holds 60 fps on integrated graphics (`debugBenchmark`). A game that loads
  slowly or stutters at default settings loses people before level 1.

### D5 — Accessibility (`design:accessibility-review`)
Homepage and in-game menus: contrast (AA), focus order and visible focus,
keyboard-operable menus, labelled buttons, `prefers-reduced-motion` that
actually disables the pinned/horizontal scroll motion (test it, don't trust
CLAUDE.md §4), and readable text sizes. The driving itself needs a keyboard
by design. Menus and settings still must not need a mouse.

### D6 — Discoverability and positioning (web search, no skill)
Look at the browser driving/parking games people already find (e.g.
slowroads.io, which CLAUDE.md names as the art-direction neighbour, plus
whatever ranks for "parking game online", "3D parking simulator browser").
What hook do they lead with, and what does this game do that they don't
(driver's-seat view, 720° wheel with animated hands, mirrors + reversing
camera, precision scoring, overhead review, procedural everything)? Fix the
on-site gaps that block a share: the OG preview, a screenshot worth posting,
a one-line pitch, a way to copy a challenge link. **Do not post, submit,
create accounts or contact anyone.** List launch venues (r/WebGames, itch.io,
Show HN, etc.) in the report with what each needs.

### D7 — Correctness sweep (`/code-review` at `high`)
Run the `code-review` skill (high effort) over the site and the UI-facing game
code: `index.html`, `play/index.html`, `src/site/*`, `src/ui/*`,
`src/net/*`, `api/*`, `public/*.html`. Look for broken links, dead buttons,
console errors, failure states (leaderboard offline, WebGL unavailable,
tab hidden/restored, window resize, very small/very large screens), and API
input handling in `api/`. Then play it: load every page with puppeteer and
record **0 console errors / 0 failed requests** (the leaderboard is disabled
under Vite dev, so test `/api` behaviour against `vite preview` or the live
site read-only). Apply the fixes the review verifies, one commit per
logical fix.

### D8 — Gameplay and first-session UX
Play it as a first-timer. Start at the homepage, click through, and finish
the tutorial and levels 1–3 **with real keyboard input** (puppeteer
KeyboardEvents, `debugRig(1/60)` stepping, per CLAUDE.md §8; not
`debugTeleport`). Then sample the rest by name, including Level 13 "City
Drive", one underground level, one rooftop level and a timed level. Look for:
- **Onboarding:** is it obvious what to do in the first 10 s without reading?
  Are the controls discoverable in-game, not only on the homepage? Does the
  tutorial teach P/R/N/D, reversing and the camera/mirrors?
- **Difficulty curve:** where do first-timers fail or time out? Are early
  levels forgiving enough and later ones fair? Do fail messages say *why*
  and what to do next?
- **Feedback:** scoring clarity (what cost me points?), the parking-review
  card, sounds, sensor beeps, collisions. Does finishing feel rewarding?
- **Friction:** clicks from homepage to driving, load time, pointer-lock/
  right-mouse surprises, keys that fight browser shortcuts, focus lost after
  alt-tab, and settings that don't persist.
- **Retention hooks:** stars, personal bests, ghost, leaderboard, "next
  level" flow. Do they work, and are they visible?
- **Mobile/touch:** today a touch visitor is told to come back on a computer.
  Most casual web-game traffic is mobile, so this is probably the single
  largest popularity limit. **Do not build touch controls in this pass**
  (it's a major feature that touches `Input.js`, the HUD and the hand rig).
  Write it up in §4 with a scoped proposal. *Do* make sure the mobile
  experience of the site is excellent: clear message, a "send me the link"
  / copy-link / share action, and good screenshots.
Fix what you find, within §2 (no handling-constant changes; level geometry
changes must pass `level-lint` and `drive-test`).

## 4. Stop-and-ask list (write these up; don't do them)

Put each one in the report's "Needs your call" section with a recommendation
and a size estimate:
- Merging `audit/popularity` into `main` and pushing it (= live deploy).
- Any change to `Car.js` handling constants or car dimensions.
- Touch/mobile controls for the game.
- Replacing Design A, or new fonts or a new palette.
- Installing ffmpeg or any new npm dependency. (`puppeteer-core --no-save`
  is fine, per CLAUDE.md §8.)
- Anything that sends new data off-device (analytics, new API fields) or
  changes what the leaderboard stores.
- Removing or unpublishing `/design/*` pages.
- Posting or submitting the game anywhere.
- Rewriting `v4-stable` history (it still has old co-author trailers; `main`
  was cleaned on 28 Sep 2026).

## 5. Order of work and verification

1. **Baseline.** `git status` clean, `git checkout -b audit/popularity`,
   `npm install && npm install --no-save puppeteer-core`, start
   `npx vite --port 5175 --strictPort` in the background, then run the full
   regression set from CLAUDE.md §8 and record the results. Take baseline
   screenshots (homepage 1440×900 + 390×844, menu, HUD while driving, results
   card) and baseline Lighthouse numbers. If the baseline isn't green, note it
   and don't blame your later changes for pre-existing failures.
2. **Audit D1–D8** and write findings into `AUDIT-REPORT.md` as you go, each
   with receipt, severity (`blocks discovery` / `loses the visitor` /
   `polish`) and a planned fix or a §4 tag.
3. **Fix in priority order:** discovery blockers → first-minute bounce →
   polish. One logical change per commit. Use plain English messages and no
   trailers.
4. **After each group of fixes** run the checks that match what you touched:
   - site/homepage: build clean, puppeteer load of `/`, `/play/`, legal pages
     at 390/1440 → 0 console errors, **0 third-party requests**, no
     horizontal overflow, reduced-motion path works;
   - any game/UI change: `level-lint`, `physics-probe`, `drive-test` (expect
     17/17), `sensor-probe`, `tutorial-probe`, `shell-probe`, `autodrive`, plus
     the feature probes for whatever you touched (`radar`, `chase`, `rebind`,
     `telemetry`, `review`, `leaderboard`);
   - `api/` change: `leaderboard-probe` and a careful read of its abuse paths.
5. **End state:** re-run the full regression and Lighthouse, take after
   screenshots next to the baselines, and update `CLAUDE.md` (**fix §3 to say
   production = `main`**, and record anything new in §9/§10) and `NOTES.md`
   (decisions + why). Then stop and ask the user about merging/pushing.

## 6. Deliverable: `AUDIT-REPORT.md` (repo root, committed on the branch)

- **Top 10** changes ranked by expected effect on traction, each with
  before/after evidence.
- **Fixed:** every finding fixed, with dimension, receipt, commit hash.
- **Needs your call:** the §4 items, each with a recommendation and effort.
- **Not fixed, and why:** findings you chose to leave, with the reason.
- **Measurements:** Lighthouse before/after (mobile + desktop), regression
  results, and screenshot paths.
- **Launch checklist:** what still blocks a public push (Show HN / Reddit /
  itch.io), in order.

Keep this `prompt.md` as a record, but don't commit it into the merge unless
the user says to.

## 7. Parallelism (optional)

D1–D8 **audits** are independent and may run in parallel subagents, or as a
`Workflow` if the user explicitly opts in. The default size guideline is
under 5 agents, so group them (e.g. D1+D4, D2+D6, D3+D5, D7, D8), or ask the
user to raise the limit. **Fixes must not run in parallel in one working
tree.** D2/D3/D5 all edit `index.html`, `home.css` and `Hud.js`, and parallel
agents would overwrite each other. Serialize fixes in one session, or give
each fixer its own worktree (`isolation: "worktree"`) and merge them one at a
time with the regression run between merges.
