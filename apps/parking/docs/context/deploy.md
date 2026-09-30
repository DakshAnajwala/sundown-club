# Repository, branches and deployment

> **30 Sep 2026: Parking Precision moved into the Sundown Club monorepo**
> (`apps/parking/`). How the one site deploys now: `docs/deploy.md` at the repo
> root. Everything below describes the OLD repo `CarParkingGame-MAIN` and its
> live project `parking-precision`, which keeps running (and serving `/api/*`
> for the new site) until the owner approves retiring it.

Read before any push, deploy, Vercel or GitHub repo operation.

## Repository

- Only repo: `github.com/DakshAnajwala/CarParkingGame-MAIN` (private). It was
  renamed from `CarParkingGame-Priv`. That old name now belongs to a different,
  unrelated private repo (`CarParkingGame-IGNORE`), so do not use the old name
  from memory. Local path `~/parking-game-v1`, remote `origin`.
- Branches:
  - `main`: the live version. Every push auto-deploys to production.
  - `v4-stable`: old v4 snapshot (commit `0a66bcd`). Not deployed anywhere. It
    still carries old `Co-Authored-By: Claude` trailers; stripping them is
    low-risk but ask first.
  - `v4-rewrite-and-legal`: old branch, untouched.
- Orphan repo `DakshAnajwala/CarParkingGame-Preview` (private) was a temporary
  copy and is no longer used. Deleting it needs a GitHub scope Claude does not
  have: the user must run `gh auth refresh -h github.com -s delete_repo` or
  delete it in GitHub Settings → Danger Zone. The user chose "skip for now".

## Vercel

Team `daksh-personal1` (team id `team_kOMTsplE4DJ2LKmNPebhdiyA`), CLI logged in
as `dakshanajwala`.

### Live site

- Project `parking-precision` → https://parking-precision.vercel.app
  (project id `prj_5DifemxfYcvX4AtszCDJfw9SSMAl`).
- Git-connected to `CarParkingGame-MAIN`. Production branch = `main` (verified
  28 Sep 2026 via `npx vercel api /v9/projects/parking-precision` →
  `link.productionBranch`). `vercel.json` has `git.deploymentEnabled.main = true`.
  Every push to `main` deploys to the public site within about a minute.
- History: production was pinned to `v4-stable` on 15 Sep, then switched back to
  `main` in the "going live" commit `2d8ed6a`.
- The repo folder's `.vercel/project.json` links to this live project. Do not
  run `vercel deploy --prod` from the repo folder unless the user wants the live
  site changed.

### Preview site

- Project `parking-precision-preview` → https://parking-precision-preview.vercel.app
  (project id `prj_WWBsj870QVkWnddycYPt5g4HsBQu`). Not Git-connected; deployed
  with the CLI from a separate clone linked to the preview project.
- To redeploy the preview:
  1. `git clone https://github.com/DakshAnajwala/CarParkingGame-MAIN.git <dir>`
     in a scratch directory (or reuse an existing clone and run
     `git fetch && git checkout -B main origin/main`; for a branch, check that
     branch out instead).
  2. `cd <dir> && npx vercel link --yes --project parking-precision-preview`
  3. `npx vercel deploy --prod --yes`
  A first attempt once returned `"Not authorized"`; an immediate retry
  succeeded.
- Last preview deploy recorded: commit `3feef57` (homepage + game at `/play/` +
  new wheel/hands), verified live.

## Rules

- Never read or change `.env.local` (Vercel OIDC token; `.env*` is gitignored).
- Vercel SSO / deployment protection must stay off for the public URLs.
- The privacy policy discloses Vercel Web Analytics. If analytics settings
  change, update the policy in the same change.
- The `vercel` CLI in a fresh clone downloads its own copy; old versions have
  polluted `package.json` before. Check `git diff package.json` after CLI use.

## Search Console

- `index.html` carries `<meta name="google-site-verification" ...>` (added
  29 Sep 2026). Do not remove it: Google re-checks it, and losing it drops
  the verified property. Keep `public/sitemap.xml` lastmod dates current when
  a listed page changes.
