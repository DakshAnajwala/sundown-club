/**
 * Game.js — the orchestrator. Owns the scene, the loop, and all the wiring
 * between subsystems that otherwise know nothing about each other.
 *
 * ONE scene and ONE camera object for the lifetime of the process. Levels swap
 * the contents of a group inside the scene rather than replacing the scene.
 * This is not a micro-optimisation: RenderPass and SAOPass capture references
 * to the scene and camera when they are constructed, so replacing either would
 * mean rebuilding the whole post-processing stack per level, and forgetting to
 * would silently render the previous level's depth buffer.
 *
 * Frame order matters and is deliberate:
 *   1. input        drain keys, resolve the steer axis
 *   2. physics      fixed-step the world
 *   3. car          forces from input, then push transforms into the scene
 *   4. rig          camera, cockpit, driver IK, instruments
 *   5. rear view    render the reversing camera INTO its texture...
 *   6. main render  ...before the composer draws the frame that samples it
 * Rendering the rear view after the main pass would show a one-frame-stale
 * picture on the dash.
 */
import * as THREE from 'three';
import { createRenderStack } from '../render/Renderer.js';
import { createPhysicsWorld } from '../physics/PhysicsWorld.js';
import { createInput, codesFor, keyLabel } from '../input/Input.js';
import { createProximityScan } from '../vehicle/ProximityScan.js';
import { createRunTracker } from '../net/leaderboard.js';
import { createProximityRadar } from '../ui/ProximityRadar.js';
import { createCar } from '../vehicle/Car.js';
import { createParkingSensors } from '../vehicle/ParkingSensors.js';
import { createCockpit } from '../vehicle/Cockpit.js';
import { createMirrors } from '../vehicle/Mirrors.js';
import { createDriver } from '../vehicle/Driver.js';
import { createDriverCamera } from '../camera/DriverCamera.js';
import { createChaseCamera } from '../camera/ChaseCamera.js';
import { createBackupCamera } from '../camera/BackupCamera.js';
import { createDashCluster } from '../ui/DashCluster.js';
import { createHud } from '../ui/Hud.js';
import { createAudioSystem } from '../audio/AudioSystem.js';
import { createParkCheck } from '../game/ParkCheck.js';
import { createScoring } from '../game/Scoring.js';
import { createParkingReview, stopWords } from '../game/ParkingReview.js';
import {
  medalFor,
  explain,
  nextTier,
  shareText,
  tierLevel,
  JUICE,
  DAILY_POOL,
  dailyFor,
  dailyLevel,
  dailyIndex,
  daySeed,
  nextDailyText,
} from '../game/Retention.js';
import { createGhost } from '../game/Ghost.js';
import { createDailyStore } from '../ui/daily.js';
import { buildLevel } from '../world/LevelBuilder.js';
import { LEVELS } from '../world/Levels.js';
import { createProgress } from '../ui/progress.js';
import { WHEEL_HUB, EYE, RIDE_HEIGHT } from '../vehicle/Dimensions.js';
import { createSettings } from '../ui/settings.js';
import { createTutorial, TUTORIAL_LEVEL } from '../game/Tutorial.js';
import { nearestRoutePoint } from '../../design/level13/layout-model.mjs';

/** Clamp on frame delta: a tab that was backgrounded for 10 s must not try to
 *  simulate 10 s of driving in one step and fire the car through a wall. */
const MAX_DT = 0.05;

export function createGame({ container }) {
  const scene = new THREE.Scene();
  const physics = createPhysicsWorld();
  const audio = createAudioSystem();
  const progress = createProgress();
  const dailyStore = createDailyStore();
  const settings = createSettings();
  // After settings: Input reads the player's key bindings from it and rebuilds
  // its lookup whenever they change.
  const input = createInput(container, settings);

  // --- car, built once and reused across levels ------------------------------
  const car = createCar({
    physics,
    spawn: { pos: [0, 0.72, 0], heading: 0 },
  });
  scene.add(car.mesh);
  const sensors = createParkingSensors({ physics, chassisBody: car.chassisBody });
  const mirrors = createMirrors({ carMesh: car.mesh, beltHalfWidth: car.beltAt(-0.5) });

  const cameraRig = createDriverCamera({ chassisBody: car.chassisBody });
  // Third-person rig. It writes into cameraRig's camera rather than owning one
  // — the render stack captured that camera at construction.
  const chaseRig = createChaseCamera({
    camera: cameraRig.camera,
    chassisBody: car.chassisBody,
    physics,
  });
  const backup = createBackupCamera({ carMesh: car.mesh });

  const cluster = createDashCluster();
  const clusterTexture = new THREE.CanvasTexture(cluster.canvas);
  clusterTexture.colorSpace = THREE.SRGBColorSpace;

  // Proximity radar (F2): one canvas, shown either on the dash screen or as a
  // DOM overlay, never both.
  const radar = createProximityRadar();
  const radarTexture = new THREE.CanvasTexture(radar.canvas);
  radarTexture.colorSpace = THREE.SRGBColorSpace;
  const proximity = createProximityScan({ physics, chassisBody: car.chassisBody });
  // Leaderboard. Entirely optional: with no network the tracker simply never
  // gets a token and the results card shows no submit control.
  // No identity is claimed until a score is actually posted (submit() does
  // it): PRIVACY.md promises the name and identifier leave the device only
  // then, so a visitor who never finishes a level never gets a server record.
  const runTracker = createRunTracker();
  // Personal-best ghost car (retention pass). Meshes only, never a body.
  const ghost = createGhost({ scene });

  const cockpit = createCockpit({
    clusterTexture,
    screenTexture: backup.feedTexture,
    guidelineTexture: backup.guidelineTexture,
    radarTexture,
  });
  car.mesh.add(cockpit.group);

  // The driver only moves the lever once a hand is actually on the knob, which
  // is why the cockpit is told about the gear change by the DRIVER, not by the
  // car. The car changes gear instantly (input responsiveness); the visible
  // stick follows the hand.
  const driver = createDriver({
    cockpit,
    onShifterGrabbed: (gear) => cockpit.setGear(gear),
  });
  car.mesh.add(driver.group);

  const render = createRenderStack({ container, scene, camera: cameraRig.camera });

  // The review needs `level`/`built` at call time, not at construction time
  // (both are reassigned by loadLevel below) — plain closures over the `let`
  // bindings do that safely regardless of declaration order, same as every
  // other callback in this file that reads `level`/`built`/`car`.
  const review = createParkingReview({
    scene,
    camera: cameraRig.camera,
    renderer: render.renderer,
    getLevel: () => level,
    getBuilt: () => built,
    getSettings: () => settings.all(),
  });

  // --- per-level state --------------------------------------------------------
  let levelIndex = 0;
  let level = null;
  let built = null;
  let parkCheck = null;
  let scoring = null;
  let tutorial = null; // non-null while the tutorial is the loaded "level"
  let state = 'menu'; // 'menu' | 'driving' | 'paused' | 'results'
  let elapsed = 0;
  let movedSinceLoad = false;
  let stuckPrompt = null; // { gear, text } while the 'In Park' hint shows
  let lastPark = null;
  let freeCam = null; // verification-only external camera
  /** Main-pass frames drawn since the last level load. Off-screen passes may
   *  only reuse shadow maps once this is > 0. */
  let framesSinceLoad = 0;
  /** Lights the reversing screen outside R, while the seat tuner is open, so
   *  the player can check they can actually see it. */
  let screenPreview = false;
  /** AO state before the review forced it off, restored on exit (C.3). */
  let aoBeforeReview = null;
  /** { status, chassisPos, chassisQuat, carHeading } at the moment the review
   *  started (C.11: window.__game.debugReviewSnapshot()). */
  let reviewSnapshot = null;
  /** { day, index } while today's daily is the loaded level, else null. */
  let currentDaily = null;
  /** Verification only: overrides "today" for the daily (debugSetDate). */
  let dateOverride = null;
  /** Last juice fired, for verification: { tier, pulse } */
  let lastJuice = null;
  /** Last results-card payload's retention parts, for verification. */
  let lastRetention = null;

  const today = () => dateOverride ?? new Date();

  /** Everything the menus show about today's daily. */
  function dailyInfo() {
    const d = dailyFor(today());
    return {
      day: d.day,
      title: d.title,
      parked: dailyStore.parked,
      bestToday: dailyStore.bestFor(d.day),
      nextText: nextDailyText(today()),
    };
  }

  function drive() {
    audio.start();
    audio.resume();
    hud.setAudioMode(audio.mode);
    hud.hidePanel();
    state = 'driving';
    input.setEnabled(true);
  }

  function pause() {
    if (state !== 'driving') return;
    state = 'paused';
    input.setEnabled(false);
    hud.showPause({ tutorial: Boolean(tutorial) });
  }

  const hud = createHud({
    container,
    settings,
    input,
    getLevels: () =>
      LEVELS.map((l, index) => ({
        index,
        id: l.id,
        name: l.name,
        subtitle: l.subtitle,
        style: l.style,
        timeLimit: l.timeLimit ?? null,
        best: progress.get(String(l.id)),
      })),
    actions: {
      // "Start driving": resume where the player is up to — the first level
      // without a record, or the last level if every one has been parked.
      continueGame: () => {
        const next = LEVELS.findIndex((l) => !progress.isCompleted(String(l.id)));
        loadLevel(next === -1 ? LEVELS.length - 1 : next);
        drive();
      },
      startTutorial: () => {
        loadTutorial();
        drive();
      },
      skipTutorial: () => {
        settings.set('tutorialDone', true);
        loadLevel(0);
        drive();
      },
      playLevel: (i) => {
        loadLevel(i);
        drive();
      },
      playDaily: () => {
        loadDaily();
        drive();
      },
      getDaily: () => dailyInfo(),
      restart: () => {
        retry();
        drive();
      },
      next: () => {
        if (currentDaily) loadDaily(currentDaily.index);
        else loadLevel(Math.min(LEVELS.length - 1, levelIndex + 1));
        drive();
      },
      resume: () => drive(),
      pause,
      quitToMenu: () => {
        loadLevel(levelIndex);
        state = 'menu';
        input.setEnabled(false);
        hud.showStart();
      },
      toggleAudio: () => {
        audio.start();
        hud.setAudioMode(audio.toggleMode());
      },
      // "Reset progress" clears everything the game has learned about your
      // driving: records, medals, dailies parked and stored ghosts.
      resetProgress: () => {
        progress.reset();
        dailyStore.reset();
        ghost.clearAll();
      },
      previewScreen: (on) => {
        screenPreview = on;
      },
    },
  });

  // --- settings -> subsystems ----------------------------------------------------
  function applySettings(changed) {
    if ('ao' in changed && !lowfx) render.setAO(changed.ao);
    if ('shadows' in changed) render.setShadows(changed.shadows);
    if ('pixelRatio' in changed) render.setPixelRatio(changed.pixelRatio);
    if ('mirrors' in changed) mirrors.setMode(changed.mirrors);
    if ('fov' in changed) {
      cameraRig.setFov(changed.fov);
      chaseRig.setFov(changed.fov);
    }
    // Switching into chase snaps the boom to the car rather than flying it in
    // from wherever the seat camera's lens happened to be.
    if (changed.cameraMode === 'chase') chaseRig.reset();
    if ('clusterTheme' in changed) cluster.setTheme(changed.clusterTheme);
    if ('speedFov' in changed) cameraRig.setSpeedFov(changed.speedFov ? 1 : 0);
    if ('lookSensitivity' in changed) cameraRig.setSensitivity(changed.lookSensitivity);
    if ('volume' in changed) audio.setVolume(changed.volume);
    if ('units' in changed) cluster.setUnits(changed.units);
    if ('sensors' in changed) sensors.setEnabled(changed.sensors);
    if ('seatX' in changed || 'seatY' in changed || 'seatZ' in changed) {
      const s = settings.all();
      cameraRig.setSeat({ x: s.seatX, y: s.seatY, z: s.seatZ });
      mirrors.aimAt(cameraRig.restingEyeLocal);
    }
    if ('tilt' in changed) cameraRig.setTilt(changed.tilt);
  }
  // ?lowfx forces ambient occlusion off regardless of settings. Useful on weak
  // hardware, and required for headless verification on software GL, where
  // the AO pass alone costs seconds a frame.
  const lowfx = typeof location !== 'undefined' && /[?&]lowfx/.test(location.search);
  settings.onChange((changed) => applySettings(changed));

  // --- events ------------------------------------------------------------------
  car.on('gearChanged', ({ gear }) => {
    input.syncGear(gear);
    driver.beginShift(gear);
    audio.gearClick();
  });
  car.on('gearRejected', () => audio.gearRejected());
  car.on('bump', ({ speedMs }) => audio.bump(speedMs));

  // --- level lifecycle ----------------------------------------------------------
  function teardown() {
    // Must exit BEFORE built.dispose() (C.10): dispose() sets scene.fog =
    // null, and restoring fog near/far after that would write the old
    // level's numbers onto nothing (or onto the next level's fog object).
    review.exit();
    if (aoBeforeReview !== null) {
      if (!lowfx) render.setAO(aoBeforeReview);
      aoBeforeReview = null;
    }
    hud.setInPlayHudVisible(true);
    if (built) {
      built.dispose();
      scoring?.dispose();
    }
    tutorial?.dispose();
    tutorial = null;
    lastPark = null;
    currentDaily = null;
    ghost.stop();
  }

  /** The retry action, from the key in play, the card key or a button. */
  function retry() {
    if (tutorial) loadTutorial();
    else if (currentDaily) loadDaily(currentDaily.index);
    else loadLevel(levelIndex);
  }

  /**
   * How much headroom the chase camera has on this level. Rooftops are open
   * sky; a city's car-park decks are one storey apart, and its streets are
   * open but capping them costs nothing since the camera rides at 2.4 m.
   */
  function ceilingHeightFor(l) {
    if (l.style === 'rooftop') return null;
    if (l.style === 'city') return l.layout?.params?.park?.storey ?? 3.2;
    return l.lot?.ceilingHeight ?? null;
  }

  function loadLevel(index) {
    teardown();
    levelIndex = index;
    setupLevel(LEVELS[index], index);
  }

  /**
   * Today's daily challenge (design/SPEC-retention.md §6), or a given pool
   * entry. A daily is a variant of an existing lot that keeps the lot's id,
   * but it is never posted to the leaderboard and never written to progress.
   * `levelIndex` stays where it was, so "Main menu" returns to your level.
   */
  function loadDaily(poolIndex = null) {
    teardown();
    const d = dailyFor(today());
    const index = poolIndex ?? d.index;
    currentDaily = { day: d.day, index };
    setupLevel(dailyLevel(DAILY_POOL[index], d.day, index), LEVELS.findIndex((l) => l.id === DAILY_POOL[index].level));
  }

  function setupLevel(lvl, index) {
    level = lvl;
    built = buildLevel({ level, scene, physics });
    chaseRig.setCeiling(ceilingHeightFor(level));
    // Ask the server to time this run. Fire and forget — a failure just means
    // the run cannot be submitted, which is the right outcome. Dailies are
    // never posted, so they never ask.
    if (level.daily) runTracker.clear();
    else runTracker.begin(level.id);
    ghost.begin(level.daily ? null : level.id, level.target.pos, settings.get('ghostLive'));
    parkCheck = createParkCheck({ level });
    scoring = createScoring({ level, physics, cones: built.cones });
    car.respawn(built.spawn);
    sensors.reset();
    framesSinceLoad = 0;
    elapsed = 0;
    movedSinceLoad = false;
    stuckPrompt = null;

    hud.setLevel({
      name: level.daily ? level.daily.title : level.name,
      tag: level.daily ? `Daily #${level.daily.day} · not posted to the leaderboard` : null,
      subtitle: level.subtitle,
      hint: level.hint,
      index,
      // The id is NOT index + 1: levels added later keep their own ids so
      // saved progress and leaderboard rows stay attached to the right level.
      levelId: level.id,
      total: LEVELS.length,
      timeLimit: level.timeLimit ?? null,
    });
    hud.setPrompt(null);
  }

  /**
   * The tutorial runs on an empty deck built like any level, but with no park
   * check: the step machine decides what "done" means. Scoring is still
   * created so the gate's cones tip over when clipped.
   */
  function loadTutorial() {
    teardown();
    level = TUTORIAL_LEVEL;
    built = buildLevel({ level, scene, physics });
    chaseRig.setCeiling(ceilingHeightFor(level));
    runTracker.clear(); // the tutorial is not a scored run
    built.target.group.visible = false;
    parkCheck = null;
    scoring = createScoring({ level, physics, cones: built.cones });
    tutorial = createTutorial({ scene });
    car.respawn(built.spawn);
    sensors.reset();
    framesSinceLoad = 0;
    elapsed = 0;
    showTutorialStep();
    hud.setPrompt(null);
  }

  function showTutorialStep() {
    const st = tutorial.step;
    hud.setTutorial({ index: tutorial.index, total: tutorial.total, title: st.title, detail: st.detail });
  }

  /** A timed level ran out. Nothing is recorded; the only way on is a retry. */
  function failLevel(reason) {
    ghost.stop();
    state = 'results';
    input.setEnabled(false);
    audio.gearRejected();
    hud.setInPlayHudVisible(false);
    aoBeforeReview = render.aoEnabled;
    if (!lowfx) render.setAO(false);
    const carHeading = headingOf(car.chassisBody);
    const distanceM = Math.hypot(
      car.chassisBody.position.x - level.target.pos[0],
      car.chassisBody.position.z - level.target.pos[1]
    );
    reviewSnapshot = {
      status: lastPark,
      chassisPos: { ...car.chassisBody.position },
      chassisQuat: { ...car.chassisBody.quaternion },
      carHeading,
    };
    review.enter('failed', lastPark, { chassisBody: car.chassisBody, carHeading, distanceM });
    hud.showReviewFailed({ levelName: level.name, reason, distanceM, daily: level.daily ?? null }, review);
  }

  function completeLevel(status) {
    const result = scoring.finish(status);
    const daily = level.daily ?? null;
    // A daily is not the level: it never touches the level's record, medal
    // or ghost. Its own record is today's best and the cumulative count.
    const medal = daily ? null : medalFor(result.score, result.timeSec, level.id);
    let record = null;
    let prevScore;
    let ghostBytes = 0;
    if (daily) {
      const d = dailyStore.record(daily.day, result);
      prevScore = d.prev ? d.prev.score : null;
      record = { improved: d.improved, bestPose: null, prev: null, fastestSec: null };
    } else {
      record = progress.record(String(level.id), {
        stars: result.stars,
        timeSec: result.timeSec,
        bumps: result.bumps,
        score: result.score,
        pose: { lateral: status.lateral, longitudinal: status.longitudinal, headingErrDeg: status.headingErrDeg },
        medal,
      });
      prevScore = record.prev ? record.prev.score : null;
      if (record.improved) ghostBytes = ghost.saveBest(level.id);
    }
    ghost.stop();

    // Juice scaled to the real result (SPEC §9): a sound layer from three
    // stars up, and one bay pulse unless the player prefers reduced motion.
    const tier = tierLevel(result.score, medal);
    audio.success();
    if (tier > 0) audio.flourish(tier);
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const pulse = tier > 0 && !reduced ? [0, 0.4, 0.7, 1][tier] : null;
    if (pulse) built.target.pulse?.(pulse, JUICE.pulseMs);
    lastJuice = { tier, pulse };
    built.target.setSatisfied(true);
    state = 'results';
    input.setEnabled(false);
    hud.setInPlayHudVisible(false);
    aoBeforeReview = render.aoEnabled;
    if (!lowfx) render.setAO(false);
    const carHeading = headingOf(car.chassisBody);
    reviewSnapshot = {
      status,
      chassisPos: { ...car.chassisBody.position },
      chassisQuat: { ...car.chassisBody.quaternion },
      carHeading,
    };
    review.enter('parked', status, {
      chassisBody: car.chassisBody,
      carHeading,
      score: result.score,
      // The best BEFORE this run. (Until the retention pass this was the
      // record just written, so on a new best the "personal best" ghost was
      // the run you had just made.)
      bestPose: record.prev?.bestPose ?? null,
      showBestGhost: settings.get('reviewGhost'),
    });

    // Where the points went, from the same pose words the review uses —
    // computed here too so City Drive, which has no review, gets them.
    const words = stopWords(status, level.target, car.chassisBody.position);
    const explained = explain(result, words, level.target);
    const next = daily ? null : nextTier({ score: result.score, timeSec: result.timeSec, levelId: level.id, fastestSec: record.fastestSec });
    const stopSentence = review.active ? null : [words.lateral, words.depth, words.forward, words.heading].filter(Boolean).join(', ');
    lastRetention = { medal, explain: explained, next, prevScore, ghostBytes, words };
    hud.showReviewResults(
      {
        ...result,
        levelName: level.name,
        isBest: !daily && record.improved,
        hasNext: !daily && levelIndex < LEVELS.length - 1,
        medal,
        prevScore,
        explain: explained,
        next,
        stopSentence: stopSentence ? `${stopSentence}.` : words.perfect ? 'Dead centre.' : null,
        daily: daily ? { day: daily.day, title: daily.title } : null,
        shareText: shareText({
          levelName: level.name,
          daily: daily ? { day: daily.day, title: daily.title } : null,
          score: result.score,
          stars: result.stars,
          medal,
          timeSec: result.timeSec,
          parts: result.parts,
          max: result.max,
        }),
        // Posting is automatic unless switched off. Present only when the
        // server actually timed this run (never for a daily).
        leaderboard:
          runTracker.token && !daily
            ? {
                autoPost: settings.get('leaderboardAutoPost'),
                post: () => runTracker.submit(level.id, result),
              }
            : null,
        levelId: daily ? null : level.id,
      },
      review
    );
  }

  // --- frame --------------------------------------------------------------------
  // Split into simulate / rig / draw rather than one monolithic frame(), so a
  // headless test can advance the simulation deterministically without paying
  // for rendering. That matters more than it sounds: under software WebGL the
  // renderer manages a few fps, and with dt clamped to MAX_DT the game clock
  // then runs ~20x slower than wall time, which makes any wall-clock-based
  // assertion (like "hold the pose for 0.5 s") fail for the wrong reason.
  // Timer, not the deprecated Clock. connect(document) uses the Page
  // Visibility API so a backgrounded tab resumes with a small delta instead of
  // a 10-second one (MAX_DT still clamps, as a second line of defence).
  const timer = new THREE.Timer();
  timer.connect(document);

  function simulate(dt) {
    elapsed += dt;

    input.update();

    if (state === 'driving') {
      if (input.takeAction('cameraMode')) {
        const next = settings.get('cameraMode') === 'chase' ? 'seat' : 'chase';
        settings.set('cameraMode', next);
      }
      if (input.takeAction('pause')) pause();
      if (input.takeAction('restart')) retry();
      if (input.takeAction('toggleAudioMode')) {
        hud.setAudioMode(audio.toggleMode());
      }

      const requested = input.takeGearRequest();
      if (requested) car.setGear(requested);

      physics.step(dt);
      car.update(dt, {
        steer: input.state.steer,
        throttle: input.state.throttle,
        brake: input.state.brake,
        handbrake: input.state.handbrake,
      });
      sensors.update(dt, { gear: car.state.gear, speedMs: car.state.speedMs });
    } else {
      // Paused or in a menu: keep the world alive visually but frozen, and keep
      // the car's transforms in sync so the view doesn't drift.
      car.update(0, {
        steer: 0,
        throttle: false,
        brake: false,
        handbrake: false,
      });
    }

    const cs = car.state;

    // --- tutorial -------------------------------------------------------------
    if (state === 'driving' && tutorial) {
      scoring.update(dt, car);
      const r = tutorial.update(
        dt,
        {
          car: cs,
          pos: car.chassisBody.position,
          input: input.state,
          camera: { lookingBack: cameraRig.isLookingBack, lean: cameraRig.leanAmount },
        },
        elapsed
      );
      if (r.done) {
        settings.set('tutorialDone', true);
        audio.success();
        state = 'results';
        input.setEnabled(false);
        hud.showTutorialDone();
      } else {
        if (r.changed && !tutorial.confirming) {
          showTutorialStep();
          audio.uiClick();
        }
        hud.setPrompt(
          tutorial.confirming ? '✓ Nice' : tutorial.step.prompt,
          tutorial.confirming ? 'good' : null
        );
      }
    }

    // --- route distance chip (Level 13 only; SPEC-level13.md §5.9) -----------
    if (state === 'driving' && level?.layout) {
      const p = car.chassisBody.position;
      const near = nearestRoutePoint(level.layout.route.points, p.x, p.z, p.y);
      const distToTarget = Math.hypot(p.x - level.target.pos[0], p.z - level.target.pos[1]);
      if (near && distToTarget > 10) {
        const remaining = Math.max(0, level.layout.route.length - near.s);
        const destFloor = level.layout.floors[level.layout.floors.length - 1];
        const destName = destFloor.name === 'R' ? 'Roof' : `Level ${destFloor.name}`;
        hud.setRouteDistance({ floorName: destName, metres: remaining });
      } else {
        hud.setRouteDistance(null);
      }
    }

    // --- park detection -------------------------------------------------------
    if (state === 'driving' && parkCheck) {
      lastPark = parkCheck.update(dt, {
        position: car.chassisBody.position,
        heading: headingOf(car.chassisBody),
        speedMs: cs.speedMs,
        gear: cs.gear,
      });
      scoring.update(dt, car);
      built.target.setSatisfied(lastPark.inBay && lastPark.aligned);
      // Every level starts in P. A player who skipped the tutorial presses W,
      // nothing moves, and the prompt only says where to go: say how to go.
      // Only for that case (not moved yet), or throttle held in P/N — not for
      // someone who stopped short of the bay on purpose, whose "Get the car
      // inside the bay" is the more useful message.
      if (cs.speedMs > 0.5) movedSinceLoad = true;
      const stuckInGear =
        !lastPark.inBay &&
        (cs.gear === 'P' || cs.gear === 'N') &&
        cs.speedMs < 0.3 &&
        (input.state.throttle || (!movedSinceLoad && elapsed > 4));
      if (stuckInGear) {
        if (stuckPrompt?.gear !== cs.gear) {
          const key = (id) => keyLabel(codesFor(id, settings.get('bindings'))[0]);
          stuckPrompt = {
            gear: cs.gear,
            text: `In ${cs.gear === 'P' ? 'Park' : 'Neutral'}: press ${key('gearD')} for Drive or ${key('gearR')} for Reverse`,
          };
        }
        hud.setPrompt(stuckPrompt.text, 'warn');
      } else {
        stuckPrompt = null;
        hud.setPrompt(
          lastPark.prompt,
          lastPark.settled ? 'good' : lastPark.wrongWay ? 'warn' : null
        );
      }
      hud.setStats(scoring.state);
      ghost.sample(dt, scoring.state.timeSec, car.chassisBody.position, headingOf(car.chassisBody));
      const sc = scoring.state;
      if (lastPark.complete) completeLevel(lastPark);
      else if (level.daily?.kind === 'no-contact' && sc.bumps + sc.cones + sc.kerbHits > 0) {
        failLevel('Contact — this daily is no-contact.');
      } else if (level.timeLimit && sc.timeSec >= level.timeLimit) {
        failLevel(
          level.daily?.kind === 'under-par'
            ? `Over par — this daily ends at ${level.timeLimit} s.`
            : `Out of time — the limit on this level is ${level.timeLimit} s.`
        );
      }
    }
  }

  function updateRig(dt) {
    const cs = car.state;
    // --- rig ------------------------------------------------------------------
    if (review.active) {
      // The review drives cameraRig.camera directly (position/quaternion set
      // absolutely); calling cameraRig.update too would overwrite that pose
      // every frame (Part C §3). On exit the rig takes over again next frame.
      review.update(dt);
      hud.setReviewLabels(review.labels);
    } else if (freeCam) {
      // Verification only: park the camera outside the car so the bodywork can
      // actually be judged. There is no in-game third-person view — the spec
      // locks the player to the driver's seat.
      cameraRig.camera.position.set(freeCam.pos[0], freeCam.pos[1], freeCam.pos[2]);
      cameraRig.camera.lookAt(freeCam.at[0], freeCam.at[1], freeCam.at[2]);
    } else if (settings.get('cameraMode') === 'chase') {
      chaseRig.update(dt, input, cs.speedMs, { reversing: cs.gear === 'R' });
    } else {
      cameraRig.update(dt, input, cs.speedMs);
    }
    driver.update(dt, { steerNorm: cs.steerNorm });
    // Radar: scanned on its own clock, drawn on its own clock, and only while
    // driving — a menu or the results card has nothing to be close to.
    const radarOn = settings.get('hudRadar') && settings.get('sensors');
    proximity.setEnabled(radarOn && state === 'driving');
    proximity.update(dt);
    if (radar.update(dt, proximity.blips)) radarTexture.needsUpdate = true;
    hud.setRadarCanvas(radarOn && settings.get('hudRadarPlace') === 'overlay' ? radar.canvas : null);

    // Telemetry pill: the only screen-space instrument, and by default it
    // shows only in chase view, where the dashboard is behind the player.
    const telMode = settings.get('hudTelemetry');
    const telOn =
      state === 'driving' &&
      (telMode === 'always' || (telMode === 'auto' && settings.get('cameraMode') === 'chase'));
    hud.telemetry.setVisible(telOn);
    if (telOn) {
      hud.telemetry.update({
        gear: cs.gear,
        autoGear: cs.autoGear,
        rpm: cs.rpm,
        speedKmh: cs.speedKmh,
        units: settings.get('units'),
        timeSec: elapsed,
        bumps: scoring?.state.bumps ?? 0,
      });
    }

    cockpit.update(dt, {
      wheelAngleRad: cs.wheelAngleRad,
      throttle: input.state.throttle,
      brake: input.state.brake,
      reversing: cs.gear === 'R' || screenPreview,
      radarOnScreen: radarOn && settings.get('hudRadarPlace') === 'screen',
    });
    const readings = state === 'driving' ? sensors.readings : { front: null, rear: null };
    if (cluster.update(dt, { ...cs, handbrake: input.state.handbrake, sensors: readings })) {
      clusterTexture.needsUpdate = true;
    }
    built?.update(elapsed, car.chassisBody.position);
    ghost.update(scoring?.state.timeSec ?? 0, car.chassisBody.position, state === 'driving' && !review.active);
    audio.update(dt, {
      rpm: cs.rpm,
      speedMs: cs.speedMs,
      throttle: input.state.throttle,
      gear: cs.gear,
    });
    audio.sensor(dt, state === 'driving' ? sensors.nearest : null);

    // Rear view first, into its own target, so the dash screen shows THIS
    // frame rather than the last one.
    backup.update(cockpit.screenActive, cs.roadWheelRad, readings.rear);
  }

  function draw() {
    // Off-screen passes first, so the main pass samples THIS frame's pictures.
    // The camera's world matrix is needed for the mirrors' visibility test.
    cameraRig.camera.updateMatrixWorld();
    const reuseShadows = framesSinceLoad > 0;
    // During the review the camera is high above the car looking down: from
    // there the mirror glass and reversing screen are both in frustum (wasted
    // renders) and the screen is dark anyway if the gear is P (Part C §3).
    if (!review.active) {
      mirrors.render(render.renderer, scene, cameraRig.camera, { reuseShadows });
      if (cockpit.screenActive) backup.render(render.renderer, scene, { reuseShadows });
    }
    render.render();
    framesSinceLoad++;
  }

  function frame() {
    requestAnimationFrame(frame);
    timer.update();
    const dt = Math.min(MAX_DT, timer.getDelta());
    simulate(dt);
    updateRig(dt);
    draw();
  }

  function start() {
    applySettings(settings.all());
    if (lowfx) render.setAO(false);
    loadLevel(0);
    input.setEnabled(false);
    hud.showStart();
    timer.reset();
    frame();
  }

  return {
    start,
    loadLevel,
    get levelIndex() {
      return levelIndex;
    },

    // ----------------------------------------------------------------------
    // Verification hooks, used by tools/drive-test.mjs.
    //
    // debugTeleport is the important one: it drops the car at an exact pose so
    // every level can be proved completable without hand-driving it. v1
    // shipped a level whose two flanking cars left a 3.4 m gap for a 4.2 m car
    // — impossible by any input — and it was found by exactly this technique.
    // Cheap insurance against re-introducing that.
    // ----------------------------------------------------------------------
    debug: () => ({
      state,
      levelIndex,
      levelId: level?.id,
      levelName: level?.name,
      levelTotal: LEVELS.length,
      // Names in play order, so a probe can find a level instead of hard-coding
      // an index that a newly inserted level silently invalidates.
      levelNames: LEVELS.map((l) => l.name),
      levelIds: LEVELS.map((l) => l.id),
      tutorial: tutorial ? { index: tutorial.index, total: tutorial.total, title: tutorial.step.title, confirming: tutorial.confirming } : null,
      car: car.state,
      wheels: car.wheelDebug(),
      pos: {
        x: car.chassisBody.position.x,
        y: car.chassisBody.position.y,
        z: car.chassisBody.position.z,
      },
      heading: headingOf(car.chassisBody),
      park: lastPark,
      review: review.active || review.phase ? review.debugState() : null,
      scoring: scoring?.state,
      needles: cluster.needles,
      sensors: sensors.readings,
      mirrors: { mode: mirrors.mode, renders: mirrors.stats, visible: mirrors.visibility(cameraRig.camera) },
      // What the settings actually reached, read back from the subsystems
      // themselves rather than from the settings store.
      applied: {
        fov: cameraRig.camera.fov,
        shadows: render.renderer.shadowMap.enabled,
        ao: render.aoEnabled,
        pixelRatio: render.renderer.getPixelRatio(),
        sensors: sensors.enabled,
        cameraY: +cameraRig.camera.position.y.toFixed(4),
        screenLit: cockpit.screenActive,
      },
      target: level ? { pos: level.target.pos, heading: level.target.heading, y: level.target.y } : null,
      driver: driver.debug(),
    }),

    /**
     * Full hand-rig state, car-local (design/SPEC-wheel-hands.md B.9). Pass
     * true (or 'corners') to include per-segment OBBs for penetration/reach
     * checks — the future tools/wheel-probe.mjs.
     */
    debugDriver(withSegments = false) {
      return driver.debug(withSegments);
    },

    /** Wheel geometry as OBBs, for checking spoke/hub placement (A.8). */
    debugWheelParts() {
      return cockpit.wheel.parts();
    },

    /** Snap both hands to rest at the current wheel angle (probes, S7/S9). */
    debugDriverRest() {
      driver.snapToRest(car.state.steerNorm);
    },

    /** Load a level and drop straight into driving, skipping the menu. */
    debugPlay(index) {
      loadLevel(index);
      hud.hidePanel();
      state = 'driving';
      input.setEnabled(true);
    },

    /** Start the tutorial directly, skipping the menu. */
    debugTutorial() {
      loadTutorial();
      hud.hidePanel();
      state = 'driving';
      input.setEnabled(true);
    },

    /** Jump the review straight to 'shown' — same code path a key press uses. */
    debugReviewSkip() {
      review.skip();
    },

    /** The status and chassis pose captured at completeLevel/failLevel. */
    debugReviewSnapshot() {
      return reviewSnapshot;
    },

    settings,

    /**
     * @param {number} y  optional surface height (ground frame, from
     *   surfaceAt()) — a flat lot never needs this, but a probe dropping the
     *   car onto Level 13's roof does (SPEC-level13.md §5.7).
     */
    debugTeleport(x, z, heading, y) {
      const rideY = y != null ? y + RIDE_HEIGHT : undefined;
      car.respawn({ pos: [x, rideY, z], heading });
    },

    /**
     * Advance the simulation without rendering. Lets a test run 2 s of game
     * time in milliseconds and get the same answer the player would get,
     * instead of depending on how fast the host can rasterise.
     */
    debugTick(seconds, dt = 1 / 60) {
      const steps = Math.max(1, Math.round(seconds / dt));
      for (let i = 0; i < steps; i++) simulate(dt);
      return this.debug();
    },

    /** Render all mirrors now and return their pictures as data URLs. */
    debugMirrorImages() {
      cameraRig.camera.updateMatrixWorld();
      mirrors.renderAll(render.renderer, scene);
      const out = {};
      for (const [name, rt] of Object.entries(mirrors.targets)) {
        const { width: w, height: h } = rt;
        // Targets are HalfFloat (HDR). Read them back as half floats and apply
        // the same ACES + sRGB encode the OutputPass would, so the PNG shows
        // what the glass shows rather than raw linear values.
        const raw = new Uint16Array(w * h * 4);
        render.renderer.readRenderTargetPixels(rt, 0, 0, w, h, raw);
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const img = c.getContext('2d').createImageData(w, h);
        const aces = (x) => Math.min(1, Math.max(0, (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14)));
        const srgb = (x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const src = ((h - 1 - y) * w + x) * 4; // GL rows run bottom-up
            const dst = (y * w + x) * 4;
            for (let k = 0; k < 3; k++) {
              img.data[dst + k] = Math.round(255 * srgb(aces(THREE.DataUtils.fromHalfFloat(raw[src + k]) * 0.6)));
            }
            img.data[dst + 3] = 255;
          }
        }
        c.getContext('2d').putImageData(img, 0, 0);
        out[name] = c.toDataURL('image/png');
      }
      return out;
    },

    /**
     * Time `frames` full frames (rig + off-screen passes + composer) with the
     * mirrors in a given mode. Software GL numbers are only meaningful
     * RELATIVE to each other, not as absolute frame times.
     */
    debugBenchmark(frames = 30, mirrorMode = 'live') {
      const prev = mirrors.mode;
      mirrors.setMode(mirrorMode);
      const renderer = render.renderer;
      const gl = renderer.getContext();
      // autoReset clears the counters at every render() call, and the composer
      // makes several — left on, "draw calls" reports only the final pass.
      renderer.info.autoReset = false;
      for (let i = 0; i < 4; i++) draw(); // warm-up: shader compiles, first uploads
      gl.finish();
      renderer.info.reset();
      const t0 = performance.now();
      for (let i = 0; i < frames; i++) {
        updateRig(1 / 60);
        draw();
      }
      gl.finish();
      const ms = (performance.now() - t0) / frames;
      const calls = renderer.info.render.calls / frames;
      renderer.info.reset();
      renderer.info.autoReset = true;
      mirrors.setMode(prev);
      return { msPerFrame: +ms.toFixed(2), drawCallsPerFrame: Math.round(calls) };
    },

    /**
     * Resource counts that must not grow across restarts (retention pass:
     * 20 restarts must end where the first load did). Draw calls come from a
     * short benchmark so they include the off-screen passes.
     */
    debugResources() {
      let sceneObjects = 0;
      scene.traverse(() => sceneObjects++);
      const info = render.renderer.info;
      return {
        geometries: info.memory.geometries,
        textures: info.memory.textures,
        programs: info.programs?.length ?? null,
        sceneObjects,
        bodies: physics.world.bodies.length,
        drawCalls: this.debugBenchmark(30).drawCallsPerFrame,
      };
    },

    /** Retention state for tools/retention-probe.mjs (SPEC §11). */
    debugRetention() {
      const d = dailyFor(today());
      const rec = level && !level.daily ? progress.get(String(level.id)) : null;
      return {
        record: rec,
        last: lastRetention,
        juice: lastJuice,
        lastFlourish: audio.lastFlourish,
        daily: {
          day: d.day,
          index: d.index,
          seed: daySeed(Math.max(1, d.day)),
          title: d.title,
          entry: d.entry,
          poolSize: DAILY_POOL.length,
          parked: dailyStore.parked,
          bestToday: dailyStore.bestFor(d.day),
          current: currentDaily,
        },
        dailyIndexFor: (day) => dailyIndex(day),
      };
    },

    /** Override "today" for the daily ('YYYY-MM-DD', UTC), or null for the real date. */
    debugSetDate(iso) {
      dateOverride = iso ? new Date(`${iso}T12:00:00Z`) : null;
      return dailyFor(today());
    },

    /** Load today's daily (or pool entry `index`) and drop into driving. */
    debugPlayDaily(index = null) {
      loadDaily(index);
      hud.hidePanel();
      state = 'driving';
      input.setEnabled(true);
    },

    debugGhost: () => ghost.debug(),

    setMirrorMode: (m) => mirrors.setMode(m),

    /** Scan both bumpers immediately, ignoring gear. */
    /**
     * Current camera mode, and where the one shared camera actually is —
     * everything tools/chase-probe.mjs needs to prove the boom behaves.
     */
    debugCameraMode(mode) {
      if (mode) settings.set('cameraMode', mode);
      const c = cameraRig.camera;
      const p = car.chassisBody.position;
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(c.quaternion);
      return {
        mode: settings.get('cameraMode'),
        pos: { x: +c.position.x.toFixed(3), y: +c.position.y.toFixed(3), z: +c.position.z.toFixed(3) },
        car: { x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3) },
        boom: +Math.hypot(c.position.x - p.x, c.position.y - p.y, c.position.z - p.z).toFixed(3),
        /** Positive when the lens is pointed at the car rather than away. */
        facingCar: +new THREE.Vector3(p.x - c.position.x, p.y - c.position.y, p.z - c.position.z)
          .normalize()
          .dot(dir)
          .toFixed(3),
        fov: +c.fov.toFixed(2),
      };
    },

    /** DOM writes the telemetry pill has made, for tools/telemetry-probe.mjs. */
    debugTelemetryWrites: () => hud.telemetry.writes,

    /** Proximity radar blips, in car-local metres (x right, z forward). */
    debugRadar() {
      proximity.update(1); // force a scan rather than waiting for the clock
      return proximity.blips.map((b) => ({
        kind: b.kind,
        distance: +b.distance.toFixed(3),
        corners: b.corners.map(([x, z]) => [+x.toFixed(3), +z.toFixed(3)]),
      }));
    },

    debugSensors() {
      return sensors.measure();
    },

    debugSetGear(g) {
      car.setGear(g, { force: true });
    },

    /** The instrument cluster canvas as a PNG data URL, at full resolution. */
    debugClusterImage() {
      return cluster.canvas.toDataURL('image/png');
    },

    /**
     * Run the rig (camera, cockpit, instruments) for `seconds` of game time
     * without rendering, so springs and fades reach the state a player would
     * see. debugTick alone advances physics but not the needles.
     */
    debugRig(seconds, dt = 1 / 60) {
      const steps = Math.max(1, Math.round(seconds / dt));
      for (let i = 0; i < steps; i++) {
        simulate(dt);
        updateRig(dt);
      }
      clusterTexture.needsUpdate = true;
      return this.debug();
    },

    /**
     * Park the camera outside the car, orbiting the chassis. Verification only
     * — there is no third-person view in the game itself.
     * @param {number|null} angleDeg  null restores the driver's camera
     */
    debugExternalView(angleDeg, distance = 7, height = 2.4) {
      if (angleDeg === null) {
        freeCam = null;
        return;
      }
      const a = (angleDeg * Math.PI) / 180;
      const c = car.chassisBody.position;
      freeCam = {
        pos: [c.x + Math.sin(a) * distance, height, c.z + Math.cos(a) * distance],
        at: [c.x, c.y + 0.1, c.z],
      };
    },

    /**
     * Camera inside the cabin, car-local offsets rotated by the chassis's full
     * orientation (unlike debugExternalView, which ignores heading). Verification
     * only — same freeCam mechanism, so it restores exactly like the external view.
     * @param {'passenger'|'above-wheel'|null} preset
     */
    debugCabinView(preset) {
      if (preset === null) {
        freeCam = null;
        return;
      }
      const q = new THREE.Quaternion(
        car.chassisBody.quaternion.x,
        car.chassisBody.quaternion.y,
        car.chassisBody.quaternion.z,
        car.chassisBody.quaternion.w
      );
      const p = car.chassisBody.position;
      const toWorld = (v) => v.clone().applyQuaternion(q).add(new THREE.Vector3(p.x, p.y, p.z));
      let posLocal;
      let atLocal;
      if (preset === 'passenger') {
        posLocal = new THREE.Vector3(0.36, EYE[1] - 0.02, 0.3);
        atLocal = new THREE.Vector3(WHEEL_HUB[0] + 0.02, WHEEL_HUB[1] + 0.02, WHEEL_HUB[2]);
      } else if (preset === 'above-wheel') {
        const axis = cockpit.wheelNormalLocal(new THREE.Vector3());
        posLocal = new THREE.Vector3(...WHEEL_HUB).addScaledVector(axis, 0.42).add(new THREE.Vector3(0, 0.2, 0));
        atLocal = new THREE.Vector3(...WHEEL_HUB);
      } else {
        throw new Error(`debugCabinView: unknown preset "${preset}"`);
      }
      const pos = toWorld(posLocal);
      const at = toWorld(atLocal);
      freeCam = { pos: [pos.x, pos.y, pos.z], at: [at.x, at.y, at.z] };
    },
  };
}

/** Yaw of a cannon body, in the same convention level data uses. */
function headingOf(body) {
  const q = body.quaternion;
  return Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z));
}
