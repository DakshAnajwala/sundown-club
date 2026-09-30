# Status

Last full review: 29 September 2026. Update this file at the end of a task.

## Waiting on the user

- Live on `main` (`1bece85`, 29 Sep 2026): the popularity audit, the retention
  pass and the no-creep change, all merged and deployed. `CHANGELOG.md` lists
  every version.
- Author times for 14 levels are provisional (par x 0.8): replace them with
  human runs (`design/SPEC-retention.md` §4.3 table).
- Search: Google Search Console verified 29 Sep (tag in `index.html`),
  sitemap submitted and indexing requested by the user. Next steps are his:
  itch.io page, r/WebGames post, GitHub profile link (backlinks). Check the
  Performance tab for which queries the site appears for.
- Still his call (from `AUDIT-REPORT.md`): touch controls, portal launch
  (CrazyGames/Poki), gameplay video clips (needs ffmpeg), daily leaderboard
  (server change), homepage mention of medals and the daily.

## Not done (roughly in priority order)

- [ ] Full pass on `ARCHITECTURE.md` (Driver/HandRig/SteeringWheel, site split,
      later modules); correct the stale 5 cm sightline note in `CAR_DESIGN.md`
      and `Dimensions.js`; add recent decisions to `NOTES.md` (current through
      the 4-levels session).
- [ ] Server-side replay verification for the leaderboard (deliberately
      deferred; board stays labelled "unverified" until it exists).
- [ ] Delete orphan repo `CarParkingGame-Preview` (user must grant
      `delete_repo` scope or delete it in the GitHub UI).
- [ ] `tools/wheel-probe.mjs`: in-game S1–S9 sweep using `HandRigChecks.js`
      (`buildSweep`, `createRigChecker`) with real KeyboardEvents and
      `debugRig(1/60)` per frame; call `debugDriverRest()` +
      `checker.breakContinuity()` before S7 and S9; assert SPEC §3 limits and §5
      events. Also `tools/wheel-shot.mjs` (seat 0/±90/±180/±360, mid-travel,
      knob, passenger, above-wheel).
- [ ] Measure wheel/hand draw-call delta vs the old rig with `debugBenchmark`
      (spec: wheel ≤ 4 calls, hands ≤ +50). Current level-1 frame: 895 calls,
      2.58 ms (no baseline recorded).
- [ ] Audit per-frame allocations in `HandRig.update`.
      (`HandRig.solveThumbs` calls `Cockpit.shifterKnobLocal()` without an out
      argument; build-time only, fine.)
- [ ] Photo mode (screenshots saved to the device, never uploaded): agreed, not
      designed, not built.
- [ ] Merged `GOAL.md` for a Sonnet build run (site split → multi-floor
      prerequisites → CameraDirector → wheel/hands probes → photo mode → media
      capture → homepage polish → regression → docs → Definition of Done).
      Never written. When written, delete `GOAL-wheel-hands-overhead-review.md`.
- [ ] Homepage polish: gameplay video clips (ask before installing ffmpeg);
      `design/SPEC-homepage.md` (tokens + motion table).
- [ ] Known v4 gaps: autodrive only routes levels 1, 2, 6 and 13 (parallel
      and three-point routes not authored); no gamepad; front bumper/intake blank;
      A-pillar reads thin; passenger door mirror edge-on when leaning right;
      audio only verified headless and muted.
- Leave `parking-game-v2-prompt.md` and `graphify-out/` (old artefacts at the
  root) unless the user asks.

## Done

- v4 game: 12 original levels (open/underground/rooftop), linted and
  completable; 720° wheel, PRND, analog cluster, parking sensors, live mirrors,
  reversing camera, audio, scoring, time limits, tutorial, menus, settings,
  progress/stars.
- Legal: LICENSE, PRIVACY.md, TERMS.md, THIRD_PARTY_NOTICES.md (incl. GSAP +
  fonts), public privacy/terms/notices pages.
- Design phase: homepage directions A/B/C; wheel lab + tuned params; Level 13
  layout model/sheet/checks/ramp probe; SPEC-wheel-hands.md, SPEC-level13.md.
- Repos merged into one (`main` new, `v4-stable` old).
- Sport wheel + articulated hands wired into the game.
- Homepage Design A at `/`, game moved to `/play/`, self-hosted fonts, GSAP
  from npm, notices page.
- Live on parking-precision.vercel.app from `main` (verified 28 Sep 2026);
  privacy policy discloses Vercel Web Analytics.
- 6-speed automatic, 100 km/h top speed, torque/power engine curve.
- Level 13 "City Drive" + city polish (speed FOV, car variety, atmosphere,
  navigation density).
- Overhead parking review.
- Reverse camera + wheel hub fixes (`7c093f0`, `2283ea4`): hub dithering,
  shared `BUMPER_Z` origin, rail-edge chevron marker. Both bugs from the old
  `GOAL-hud-fixes.md` are fixed (that file has since been deleted).
- Parked-car detail, proximity radar, HUD customisation, telemetry, chase
  camera, key remapping.
- Leaderboard with automatic posting, server-issued browser identity, run-token
  anti-cheat.
- Four more levels (17 total) with stable level ids.
- Homepage/legal copy accuracy pass (`635cb31`).
