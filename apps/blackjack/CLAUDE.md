# Blackjack (`apps/blackjack`)

Served at `/blackjack/`. Root `CLAUDE.md` rules apply. `SPEC.md` is the
source of truth (rules, modes, progression, look, motion timings, storage,
verification) and records all 27 interview decisions in §1.

## State (30 Sep 2026)

- `index.html` is the **prototype**, not the finished game: 3D room, day/night,
  cameras, faceless dealer with IK arms, stylised cards/chips, synthesised SFX,
  and a cut-down round (hit, stand, double; S17; 3:2; dealer peek). It loads
  three.js from `/vendor/three/` (self-hosted). The "Design review" panel (time of day,
  camera, deal speed, room, practice lamp, shadows, sound) shows only with
  `?dev` in the URL (owner, 2 Oct 2026); players get a small key list in its
  place. Player settings (sound, deal speed, camera) come with the Phase 5
  redesign (owner's call).
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

## Tutorial (1 Oct 2026)

Owner's brief: "idiot proof, no complex jargon, proper English". Offered the
first time someone sits down (`coach.offerOnce('blackjack')`, remembered in
`tut.v1.blackjack`), and any time with `T` or the "Learn to play" button. Uses
`packages/shared/coach.js`. Four set-up hands (`RIG` in `index.html`): hit on 11, stand on 13 against a dealer 5, double on 11, a blackjack. Tutorial state is `TUT` (the room code already uses `T` for wall thickness). Pretend chips: nothing is saved while the
tutorial runs, and the real bankroll is put back after. Only the button the
current step asks for works; anything else shakes the card. Keep every new
line of tutorial text short, plain and free of unexplained poker or casino words.

## Chips (1 Oct)

The bankroll is the shared club bankroll (`/shared/chips.js`); `bj.v1.main`
now only keeps Blackjack's own stats (peak, hands, naturals). The scene code
in `index.html` predates `packages/shared/lounge/`; moving Blackjack onto the
shared kit is an open task.

## Escape to leave (built 30 Sep)

First Esc opens the shared "Leave Blackjack?" card (`/shared/leave-guard.js`),
second Esc voids a round still waiting on the player (stake returned), saves
`bj.v1.main` (bankroll, peak, hands, naturals) and the hub summary, then goes
to `/`. The page imports `/shared/*.js` by site path, so open it through the
built site (`npm run build && npm run serve`), not as a loose file.
