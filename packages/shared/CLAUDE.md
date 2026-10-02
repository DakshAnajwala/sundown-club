# Shared code (`packages/shared`)

Code more than one app needs. Root `CLAUDE.md` rules apply. Package name
`@sundown/shared`. Vite apps import `@sundown/shared/<module>`; static pages
import `/shared/<module>.js` (copied into `dist/shared/` by `tools/build-site.mjs`).

## Rules

- No DOM access at import time; no global side effects. Export functions.
- `cards.js`, `chips.js` logic and `lounge/util.js` must stay runnable in node (the checks in `tools/` import them).
- `lounge/*` imports `three` by bare name: static pages map it with an import map, Vite apps resolve npm.
- No dependency on any one game. A game may depend on this package, never
  the other way round.
- Every `localStorage` read and write in try/catch; bad data falls back to
  defaults. Keys are `hub.v1.*` (spec: `apps/hub/SPEC.md` §8).
- Changing an exported function's shape means updating every app that uses
  it in the same change.

## Modules

| Module | Purpose |
|---|---|
| `save.js` (built) | `exportSave`, `parseSave`, `importSave`, `resetSave`: the whole club save as one code or file, club keys only. Hub "Save & settings" uses it |
| `profile.js` (built) | Read/update `hub.v2.profile` (migrates `hub.v1.profile` once; also level 1-100, titles, tokens, items, badges): identity (`ensureIdentity()` makes a random `id` and evening-name `handle` per browser, `setHandle()` renames), XP, level curve (`250 × L` to go from L to L+1), streak, per-game summary (`lastPlayed`, `resume`, `facts`, `ledger`, `timeMs`). `readProfile()` keeps the identity through every game's write |
| `leave-guard.js` (built) | `createLeaveGuard()` overlay: Esc once asks, Esc again saves (game callback) and goes to `/`. `leaveToHub()` for games with their own pause menu (Parking). Owner request 30 Sep |
| `chips.js` (built) | The club bankroll `club.v1.chips` shared by Blackjack, Hold'em and Video Poker: get, set, take, give, refill to 1,000 below 10 |
| `cards.js` (built) | Deck, crypto shuffle, poker hand ranking (`score5`, `best` of 5–7, `describe`). Checked by `tools/cards-check.mjs` |
| `lounge/lounge.js` (built) | The card room: renderer, room, window landscape, sky and day cycle, pendant lamp, `ROOMS`, `createCameraRig` |
| `lounge/cards3d.js` (built) | Stylised deck canvases (`drawFace`, `drawBack`) and 3D cards with flip |
| `lounge/chips3d.js` (built) | Pastel chip set, `breakdown`, tidy chip stacks |
| `lounge/figure.js` (built) | Faceless regulars: standing or seated, any suit (`SUITS`), two-bone IK arms, `reach`/`rest`/`look` |
| `lounge/util.js`, `lounge/sfx.js` (built) | Noise, easing, the animation timeline; synthesised card/chip/sting sounds |
| `coach.js` (built) | Tutorial card: `createCoach().show({ title, body, list, todo, pulse, buttons })`, `nudge()`, `offerOnce(key, …)`. All text via textContent |
| `telemetry.js` (built) | `initTelemetry({ game })` once per page, `track(name, props)`, `telemetryEnabled()` / `setTelemetry(on)`. Anonymous first-party counters to `/api/club/event`; off on DNT/GPC or `hub.v1.settings.telemetry === false`. Spec `docs/retention/SPEC-telemetry.md` |
| `leaderboard.js` (planned) | Client for a club-wide leaderboard (play time and more). Not designed yet; any network use updates the privacy policy |
