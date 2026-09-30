# Deploying Sundown Club

Read before any push, deploy, Vercel or GitHub operation.

## Where things are

| Thing | Value |
|---|---|
| Repo | `github.com/DakshAnajwala/sundown-club` (private), local `~/sundown-club`, remote `origin` |
| Vercel project | `sundown-club` (team `daksh-personal1`, project id `prj_aRP0cbQakAAbPxL2ccCMbS0CMeAd`), linked by `.vercel/` in the repo root |
| Live URL | https://sundown-club.vercel.app |
| Build | `npm run build` → `dist/` (config in `vercel.json`) |

`dist/` layout: `/` hub (`apps/hub`), `/blackjack/` (`apps/blackjack`),
`/parking/` + `/parking/play/` (`apps/parking` Vite build).

## How it deploys (30 Sep 2026)

- The Vercel project is **not Git-connected yet**: pushing does not deploy.
  Deploy with the CLI from the repo root, only when the owner asks:
  `npx vercel deploy --prod --yes --scope daksh-personal1`.
  Vercel runs `npm install` and `npm run build` itself.
- If the project is later connected to GitHub, `main` becomes live on every
  push. Update this file and the root `CLAUDE.md` the same day.

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
