# Shared code (`packages/shared`)

Code more than one app needs. Root `CLAUDE.md` rules apply. Package name
`@sundown/shared`; apps import it by that name once it has modules.

## Rules

- No DOM access at import time; no global side effects. Export functions.
- No dependency on any one game. A game may depend on this package, never
  the other way round.
- Every `localStorage` read and write in try/catch; bad data falls back to
  defaults. Keys are `hub.v1.*` (spec: `apps/hub/SPEC.md` §8).
- Changing an exported function's shape means updating every app that uses
  it in the same change.

## Planned modules (none built yet, 30 Sep 2026)

| Module | Purpose |
|---|---|
| `profile.js` | Read/update `hub.v1.profile`: handle, XP, level curve (`250 × L` to go from L to L+1), streak, per-game summary (`lastPlayed`, `resume`, `facts`, `ledger`, `timeMs`) |
| `leave-guard.js` | Esc once: "Leave?" confirmation; Esc again: save (game callback) and go to `/`. Owner request 30 Sep |
| `leaderboard.js` | Client for a club-wide leaderboard (play time and more). Not designed yet; any network use updates the privacy policy |
