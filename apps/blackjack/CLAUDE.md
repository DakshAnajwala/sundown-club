# Blackjack (`apps/blackjack`)

Served at `/blackjack/`. Root `CLAUDE.md` rules apply. `SPEC.md` is the
source of truth (rules, modes, progression, look, motion timings, storage,
verification) and records all 27 interview decisions in §1.

## State (30 Sep 2026)

- `index.html` is the **prototype**, not the finished game: 3D room, day/night,
  cameras, faceless dealer with IK arms, stylised cards/chips, synthesised SFX,
  and a cut-down round (hit, stand, double; S17; 3:2; dealer peek). It loads
  three.js 0.186 from jsDelivr. It still shows the "Design review" panel.
- Not built yet (all specced): split, insurance, surrender, Practice mode
  (hint, mistake flag, count trainer), persistent bankroll and refill, rooms
  unlocking, cosmetics, achievements, hub XP, hand history and stats,
  rebindable keys, CC0 audio, the node probes in SPEC §14.

## Look (owner's calls, do not drift)

- slowroads.io-style: low-poly, flat-shaded, soft haze, pastel. Indoor lounge
  with a big window; other venues (back alley, terrace) later.
- Golden hour by default; live day/night cycle is a setting.
- Dealer: faceless mannequin in a charcoal suit (Heat / Time Shooter style).
- Stylised cards and chips. Laptop only.
- Anti-reference: `refs/not-this-247blackjack.png`.

## Build plan

The real game follows SPEC §12: `src/rules/` (pure engine, shoe, strategy,
count; no DOM, runnable in node), `src/scene/`, `src/anim/Timeline.js`
(engine decides, timeline plays, skip = drain), `src/ui/`, `src/audio/`,
`src/store.js`, bundled with Vite like Parking. The prototype's numbers
(positions, colours, timings) are the starting point.

## Escape to leave (built 30 Sep)

First Esc opens the shared "Leave Blackjack?" card (`/shared/leave-guard.js`),
second Esc voids a round still waiting on the player (stake returned), saves
`bj.v1.main` (bankroll, peak, hands, naturals) and the hub summary, then goes
to `/`. The page imports `/shared/*.js` by site path, so open it through the
built site (`npm run build && npm run serve`), not as a loose file.
