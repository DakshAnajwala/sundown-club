# Deploying Sundown Club

Read before any push, deploy, Vercel or GitHub operation.

## Where things are

| Thing | Value |
|---|---|
| Repo | `github.com/DakshAnajwala/sundown-club` (public since 2 Oct 2026, the owner's choice), local `~/sundown-club`, remote `origin` |
| Vercel project | `sundown-club` (team `daksh-personal1`, project id `prj_aRP0cbQakAAbPxL2ccCMbS0CMeAd`), linked by `.vercel/` in the repo root |
| Live URL | https://sundown-club.vercel.app |
| Build | `npm run build` → `dist/` (config in `vercel.json`) |

`dist/` layout: `/` hub (`apps/hub`), `/blackjack/` (`apps/blackjack`),
`/holdem/`, `/videopoker/`, `/parking/` + `/parking/play/` (`apps/parking`
Vite build), `/racing/` (`apps/racing` Vite build: the Night Drive test
drive only; its story previews are dev-server only).

## How it deploys (30 Sep 2026)

- The Vercel project is **not Git-connected yet**: pushing does not deploy.
  Deploy with the CLI from the repo root, only when the owner asks:
  `npx vercel deploy --prod --yes --scope daksh-personal1`.
  Vercel runs `npm install` and `npm run build` itself.
- If the project is later connected to GitHub, `main` becomes live on every
  push. Update this file and the root `CLAUDE.md` the same day.

## Deploy log

- 2 Oct 2026, commit fc41d62: search engine work (`docs/seo.md`): robots.txt, sitemap, page titles and descriptions, canonical URLs, share cards, JSON-LD, crawlable hub game links. Deployed from a clean clone of `main` (`sundown-club-9pm7d27bc`); the CLI worked first time. Live check, which also covers the 9c52a12 deploy: 21 routes 200 (every page, robots.txt, sitemap.xml, favicon, share images, shared modules); the hub has no sample profile; two fresh browser contexts got different ids and names; Blackjack's review panel is hidden; JSON-LD parses; 0 console errors on the hub, Blackjack, Hold'em and Video Poker; `node apps/racing/tools/site-check.mjs https://sundown-club.vercel.app` 8/8.
- 2 Oct 2026, commit 9c52a12: `fix/live-bugs` fast-forwarded into `main` and deployed from a clean clone of `main` (with `.vercel/` copied in). Six fixes: Enter/Space press the focused button; Blackjack room switch no longer adds chips; Hold'em showdown numbers; Video Poker keeps a hand's result; every visitor gets their own hub profile (random id and name); Blackjack's Design review panel only with `?dev`. First CLI attempt answered "Not authorized" again; the immediate retry worked. Deployment `sundown-club-n71upia2c`. The live check ran with the next deploy (fc41d62).
- 1 Oct 2026, commit 4062e5d: club privacy policy, terms and notices at the site root; `/parking/{privacy,terms,notices}.html` redirect there; fonts, three.js and GSAP self-hosted under `/vendor/`. Every page checked live: no request to any other host.
- 1 Oct 2026, commit e851fc4: hub, Blackjack, Hold'em, Video Poker, Parking, Esc-to-leave, tutorials. All routes 200, every page loaded headless with no errors. First CLI attempt answered "Not authorized"; an immediate retry worked (same as before).
  That deploy also carried Night Drive (052279e): `/racing/` test drive and the
  playable hub tile. Verified live the same day with
  `node apps/racing/tools/site-check.mjs https://sundown-club.vercel.app` (8/8).

## Leaderboard API

- `/api/*` is a rewrite to https://parking-precision.vercel.app/api/*. The
  old project `parking-precision` (repo `CarParkingGame-MAIN`) still owns the
  Upstash env vars and runs `api/`. Source copy: `apps/parking/api/`.
- To move it here: add the env vars (`KV_REST_API_URL`, `KV_REST_API_TOKEN`,
  `LEADERBOARD_SECRET`) to the `sundown-club` project in the Vercel dashboard
  (owner does this; never read or print secrets), move `apps/parking/api/` to
  a root `api/`, drop the rewrite, and update `PRIVACY.md`.

## Old site

- https://parking-precision.vercel.app keeps deploying from
  `CarParkingGame-MAIN` `main`. Plan (owner's choice): redirect it to
  `https://sundown-club.vercel.app/parking/` once the API has moved. Needs an
  explicit yes; it changes the public site.

## Rules

- Never read or change `.env*` files.
- Vercel SSO / deployment protection stays off for public URLs.
- After any `vercel` CLI use, check `git diff package.json`.
- Any new network request updates the privacy text in the same commit.
