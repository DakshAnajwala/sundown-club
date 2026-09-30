# design/ — the source of truth for the next build

The designs Parking Precision's next features are built from. Each one is reviewable as a
private published page, openable locally, and backed by a spec with exact numbers.

| Design | Open | Spec | Status |
|---|---|---|---|
| Sport wheel, articulated hands, hand-over-hand steering | [Wheel Lab](https://claude.ai/code/artifact/242d13dc-d8fd-4b08-8570-90e9037c9a9a) · local `/design/wheel-lab/index.html` | `SPEC-wheel-hands.md` | Tuned; sweep 0 violations |
| Level 13 "City Drive" layout | [Level 13 Sheet](https://claude.ai/code/artifact/f360b773-dae2-4268-b4cc-6b01a2242493) · local `/design/level13/sheet.html` | `SPEC-level13.md` | All layout checks pass |
| Homepage: three directions | [A Rooftop dusk](https://claude.ai/code/artifact/49b25419-b4a2-40c7-96b9-4e2da1015200) · [B Physics notebook](https://claude.ai/code/artifact/3aa830ef-11a5-4faa-a2c5-0e773b6d84d9) · [C Bright sky](https://claude.ai/code/artifact/5bd89925-8214-409b-b3f4-4bec807ebcf2) · files in `homepage/directions/` | `SPEC-homepage.md` (after a direction is chosen) | Waiting on the choice |
| Retention: instant retry, where the points went, medals, mastery map, daily, share v2, PB ghost, juice | local `/design/retention/index.html` (results card v2, fail/daily cards, mastery map, share output, medals, ghost) | `SPEC-retention.md` | Designed; waiting on sign-off (SPEC §12) |

Local pages need the dev server: `npm run dev` (port 5175).

## Folders

- `wheel-lab/`: `index.html`, `lab.js`, `lab.css`, `params.json` (tuned numbers plus the last sweep), and `shots/` (reference frames).
  - The production modules it drives live in `src/vehicle/`: `RimCurve.js`, `SteeringWheel.js`, `HandModel.js`, `HandRig.js`, `HandRigChecks.js`. They're not wired into the game yet.
- `level13/`: `layout-model.mjs` (geometry + rules), `build-layout.mjs` (writes `layout.json`), `layout.json`, `ramp-probe.json`, and `sheet.html` / `sheet.js` / `sheet.css`.
- `homepage/directions/`: the three direction pages and their placeholder media (real game screenshots).
- `retention/`: static prototypes for `SPEC-retention.md`. `hud-base.css` is a verbatim copy of the CSS block in `src/ui/Hud.js`; `retention.css` holds the new classes the build copies into Hud.js; `proto.css` is page chrome only.

## Rules

- Change the design here first, re-run its checks, then build from it. Don't hand-edit numbers in the game that disagree with a spec.
- Nothing in this folder ships in the game build.
