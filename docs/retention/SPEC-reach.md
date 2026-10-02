# SPEC — Reach: installable app, offline play, reminders, guides, performance

Loop served: habit (a way back) and discovery. Status: built on `feat/retention`, 2 Oct 2026, except where marked. Brief: `GOAL.md` §7.
Probes: `tools/pwa-probe.mjs`, `tools/seo-check.mjs` (`npm run check:site`, after a build), `tools/perf-probe.mjs`. Pure checks in `npm run check` (`board-check` covers push signing, `daily-check` covers the break timer).

## 1. Installable and offline

- `apps/hub/manifest.webmanifest` (standalone, dusk colours, three icons including a maskable one, three shortcuts), icons drawn by `tools/make-icons.mjs`, head tags on every page of the shell (hub, games, Parking pages, Night Drive).
- `apps/hub/sw.js`, built into `dist/sw.js` with the build id and a precache list of about 60 files (every page, the shared modules, three.js, GSAP, fonts). Pages: network first with a 3.5 s wait, then the cached copy; code, styles, fonts, images: stale while revalidate; hashed Parking and Night Drive files: cache first; `/api/` is never touched. Each build's caches are named for it and older ones are deleted on activate, so a deploy cannot strand anyone on old code. `vercel.json` sends `sw.js` with no-cache.
- Offline: the hub, Tonight's table (from the saved profile), the guides and the games all open and play; the board says it is resting instead of breaking.
- **Install offer** (`packages/shared/pwa.js` + the hub's "offer" card): only from the second visit, never on the first; "Not now" is final. **Reminder offer**: from the third visit, and only if the server says push is on. Both are local counters (`hub.v1.pwa`).

## 2. Reminders (built, off until the owner decides)

Web Push without a library (`api/_lib/push.js`): VAPID signing with Node's crypto and payload-less pushes, so the service worker writes the words itself ("Tonight's table is set, and today's Daily Seed is up.") and nothing needs encrypting. At most one per subscription per UTC day; dead subscriptions are dropped; a daily Vercel cron calls `/api/club/push-run` with `CRON_SECRET`. **It does nothing until the owner sets** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` and `CRON_SECRET`, and until then the hub shows no reminder offer or switch. Browser push goes through the browser maker's push service (Google, Mozilla, Apple), which is another company's server, so this is **the owner's call** (the brief says to stop and ask): the privacy page already describes it, and `docs/retention/OWNER-TODO.md` has the steps. Not built: the personalised message ("you are 40 XP from level 12"), which needs encrypted payloads.

## 3. Take a break

`packages/shared/wellbeing.js`: after 90 minutes of the page on screen (hidden time not counted; ten minutes away starts again) a note says so, and again after each further 90 minutes. The counting is a pure timer, checked in node.

## 4. Guides and search

Ten guides from `apps/hub/guides/guides.js` rendered at build time to `/guides/<slug>/` plus an index, all in the sitemap. Each has title, description, canonical, share tags, `Article` and breadcrumb JSON-LD (no ratings, nothing invented), real content (336 to 600 words), and links to the game it teaches. Accuracy: the Blackjack chart is the basic-strategy chart in `apps/blackjack/SPEC.md`, cut to what the club's table offers (hit, stand, double); Video Poker figures are the game's own paytable; Parking and Night Drive figures come from `Scoring.js` and the lab's drift rules. `tools/seo-check.mjs` checks every page: tags, lengths, canonical, og image exists, JSON-LD parses, one h1, no dollar sign, no mention of AI, every internal link resolves, in the sitemap, at least 280 words.

## 5. Performance (budgets and what was done)

Budgets (`GOAL.md` §7.2): hub LCP at most 2.5 s on throttled 4G; first game playable within 5 s. Measured by `tools/perf-probe.mjs` in headless Chrome with a cold cache, 1.6 Mbit/s down, 150 ms round trip, CPU x4, against `H2=1 node tools/dev-api.mjs 5184` (HTTP/2 and compression, like Vercel). Lighthouse itself is not installed here, so this probe uses the same browser APIs (LCP observer, resource timing).

| | Before | After |
|---|---|---|
| Hub, bytes on first load | 1.48 MB | 0.41 MB |
| Hub, LCP | about 5 to 8 s | 0.8 s |
| Video Poker, bytes on first load | 2.4 MB (uncompressed server) / 0.52 MB | 0.33 MB |
| Video Poker, playable | about 12 s | 5.7 s (software WebGL; see below) |

The game number is a **ceiling**: this machine renders WebGL in software (SwiftShader), which adds about two seconds of scene setup that a real GPU does not pay, so the probe's pass line is 6.5 s here for the 5 s target on a real device. The network part is done by about 3.5 s.

What changed:
- **Hub:** only the selected game's full-size backdrop loads first (an inline script in the head also preloads it); the rail uses 5 to 13 KB thumbnails (`tools/make-thumbs.mjs`); every picture below the fold is `loading="lazy"`; GSAP is `defer`; three fonts are preloaded; the first headline is in the HTML so it paints before the script runs.
- **All static pages:** `tools/modulepreload.mjs` reads each page's import statements at build time and adds `<link rel="modulepreload">` for the whole graph, so it downloads at once instead of four levels deep (each level cost a round trip).
- **three.js:** the games import a tree-shaken build (`tools/build-three-lite.mjs`): the 47 classes the pages use, about 118 KB compressed instead of about 306 KB. The build fails if a page uses a name that is not in the bundle or reads `THREE[...]` by a computed name. Parking and Night Drive are bundled by Vite, which already shakes.
- **Fonts:** the weights each game uses are preloaded, so the game does not wait for them to be discovered late.
- `dev-api.mjs` now compresses text and can speak HTTP/2 (`H2=1`), so size and timing checks look like production.
