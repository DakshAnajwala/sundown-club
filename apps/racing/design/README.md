# design/ — source of truth for the build

| Design | Open | Spec | Status |
|---|---|---|---|
| The whole game (story, events, cars, tuning, AI, architecture) | — | `SPEC-game.md` | Signed off 30 Sep 2026 |
| Handling Lab: both slice cars on a night test ground, every tuning field live | `npm run dev`, then `/design/handling/index.html` | `SPEC-game.md` §6–7, measured in §6.1 | Built; waiting on the owner to drive it |
| Model Lab: every person, car and chapter 1 set the story needs, lineups and scene mock-ups | `npm run dev`, then `/design/models/index.html` | `SPEC-models.md` | Built 1 Oct 2026; waiting on the owner's look-over |

Rules: change the design here first, re-run its checks, then build from it.
Nothing in this folder ships in the game.
