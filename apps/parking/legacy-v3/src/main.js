import { createEngine } from './core/engine.js';
import { createPhysicsWorld } from './physics/world.js';
import { createInputState } from './input/keyboard.js';
import { createCar } from './car/vehicle.js';
import { createFirstPersonCamera } from './camera/firstPerson.js';
import { loadLevel } from './level/loader.js';
import { LEVELS } from './level/levels.js';
import { createHud } from './ui/hud.js';
import { createSettings } from './ui/settings.js';
import { createProgress } from './ui/progress.js';
import { createScoring } from './scoring/scoring.js';

// Wiring only — no game logic lives here.

const container = document.getElementById('app');

const engine = createEngine({ container });
const physicsWorld = createPhysicsWorld();
const input = createInputState();

let currentLevel = null;
let car = null;
let cameraRig = null;
let scoring = null;
let currentLevelIndex = 0;

// Level completion records, persisted to localStorage by /ui.
const progress = createProgress();

const hud = createHud({
  container,
  levels: LEVELS,
  onSelectLevel: (index) => selectLevel(index),
  onNextLevel: () => selectLevel(Math.min(currentLevelIndex + 1, LEVELS.length - 1)),
  onReplay: () => selectLevel(currentLevelIndex),
  onMirrorModeChange: (mode) => car.setMirrorMode(mode),
});

function selectLevel(index) {
  currentLevelIndex = index;
  const levelData = LEVELS[index];

  if (currentLevel) currentLevel.dispose();
  if (scoring) scoring.dispose();
  if (car) engine.scene.remove(car.mesh);

  currentLevel = loadLevel(levelData, { scene: engine.scene, physicsWorld });

  if (!car) {
    car = createCar({ physicsWorld, spawn: currentLevel.spawn });
    cameraRig = createFirstPersonCamera({ chassisMesh: car.mesh });
    engine.setActiveCamera(cameraRig.camera);
    car.on('gearRejected', ({ attempted }) => hud.flashGearRejected(attempted));
  } else {
    car.resetSpawn(currentLevel.spawn);
  }
  engine.scene.add(car.mesh);

  scoring = createScoring({ physicsWorld, car, level: currentLevel, levelId: levelData.id });
  scoring.on('parked', (result) => {
    const rec = progress.record(levelData.id, result);
    hud.setProgress(progress.all());
    const hasNext = index + 1 < LEVELS.length;
    hud.showResult({
      ...result,
      isBest: rec.improved,
      hasNext,
      nextName: hasNext ? LEVELS[index + 1].name : null,
    });
  });

  hud.setActiveLevel(index);
  hud.setProgress(progress.all());
}

selectLevel(0);

// Camera settings (FOV / eye offset), persisted in localStorage by /ui.
// Created after selectLevel(0) because cameraRig only exists once the first
// level has built the car.
function applyCameraSettings(v) {
  cameraRig.setFov(v.fov);
  cameraRig.setEyeOffset(v.eyeX, v.eyeY, v.eyeZ);
}
const settings = createSettings({ container, onChange: applyCameraSettings });
applyCameraSettings(settings.getValues()); // restore whatever was stored

engine.onUpdate((dt) => {
  physicsWorld.step(dt);

  const gearSelect = input.consumeGearSelect();
  if (gearSelect) car.setGear(gearSelect);

  // F steps forward through P->R->N->D->P, R steps back, additive alongside
  // the direct 1-4 select. Reuses getState()/setGear() as-is, so cycling is
  // subject to the exact same R<->D shift guard as direct key presses.
  const cycleDir = input.consumeGearCycleDir();
  if (cycleDir) {
    const order = ['P', 'R', 'N', 'D'];
    const i = order.indexOf(car.getState().gear);
    car.setGear(order[(i + cycleDir + order.length) % order.length]);
  }

  car.update(dt, input);
  cameraRig.update(dt, input);
  scoring.update(dt);
  hud.update(car.getState(), scoring.getState());
});

// v2: mirror render-to-texture passes run after this frame's transforms
// are updated (onUpdate above) but before the main camera render.
engine.onPreRender((renderer) => car.renderMirrors(renderer, engine.scene));

engine.start();
