/**
 * AudioSystem.js — all sound, synthesised at runtime with WebAudio.
 *
 * There are no audio files anywhere in this project. That is a deliberate
 * choice with the same reasoning as the procedural car geometry (see NOTES.md):
 * synthesis has no licensing surface, no download weight, and no attribution to
 * get wrong. It also means the engine note can be driven continuously by RPM
 * instead of crossfading between a handful of sample loops.
 *
 * Two soundscapes, switchable at runtime per spec:
 *
 *   'mechanical'  A four-oscillator sawtooth stack at the engine's firing
 *                 frequency and its harmonics, through a lowpass whose cutoff
 *                 opens with load, plus filtered noise for intake roar and
 *                 tyre roll. Sounds like a small four-cylinder.
 *
 *   'lofi'        A slow detuned pad, tape hiss and vinyl crackle. The car is
 *                 still audible — road speed opens a filter and lifts a soft
 *                 hum — but it sits under the music rather than over it.
 *
 * Both share the same SFX bus (gear clicks, bumps, chimes) so switching mode
 * never costs you gameplay feedback.
 *
 * Browsers refuse to start an AudioContext without a user gesture, so nothing
 * here makes noise until start() is called from a click.
 */

const MODES = ['mechanical', 'lofi'];

/** Pentatonic-ish pad voicing. Fmaj9 spelt low so it doesn't fight the engine. */
const PAD_HZ = [87.31, 130.81, 174.61, 220.0, 261.63];

export function createAudioSystem() {
  let ctx = null;
  let started = false;
  let mode = 'mechanical';
  let masterVolume = 0.7;
  let lastFlourish = null;
  let muted = false;

  // Node graph handles, built lazily in start().
  let master = null;
  let sfxBus = null;
  let engineBus = null;
  let lofiBus = null;
  let noiseBuffer = null;

  const engine = {};
  const lofi = {};

  /** One second of white noise, reused by every noise voice. */
  function makeNoiseBuffer() {
    const len = ctx.sampleRate;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function buildEngine() {
    engineBus = ctx.createGain();
    engineBus.gain.value = 0;
    engineBus.connect(master);

    // Body resonance: everything the engine makes goes through this, which is
    // what stops a raw sawtooth stack from sounding like a synth lead.
    engine.lowpass = ctx.createBiquadFilter();
    engine.lowpass.type = 'lowpass';
    engine.lowpass.frequency.value = 500;
    engine.lowpass.Q.value = 1.4;
    engine.lowpass.connect(engineBus);

    // Harmonic stack. A four-cylinder four-stroke fires twice per revolution,
    // so the fundamental is rpm/60 * 2; the upper partials give it the edge.
    engine.oscs = [];
    const harmonics = [
      { mult: 1, gain: 0.5, type: 'sawtooth' },
      { mult: 2, gain: 0.32, type: 'sawtooth' },
      { mult: 3, gain: 0.16, type: 'square' },
      { mult: 4.02, gain: 0.1, type: 'sawtooth' }, // slightly detuned: beats
    ];
    for (const h of harmonics) {
      const osc = ctx.createOscillator();
      osc.type = h.type;
      osc.frequency.value = 60;
      const g = ctx.createGain();
      g.gain.value = h.gain;
      osc.connect(g).connect(engine.lowpass);
      osc.start();
      engine.oscs.push({ osc, gain: g, mult: h.mult });
    }

    // Intake / induction noise, gated by throttle.
    engine.intake = ctx.createBufferSource();
    engine.intake.buffer = noiseBuffer;
    engine.intake.loop = true;
    engine.intakeFilter = ctx.createBiquadFilter();
    engine.intakeFilter.type = 'bandpass';
    engine.intakeFilter.frequency.value = 900;
    engine.intakeFilter.Q.value = 0.8;
    engine.intakeGain = ctx.createGain();
    engine.intakeGain.gain.value = 0;
    engine.intake.connect(engine.intakeFilter).connect(engine.intakeGain).connect(engineBus);
    engine.intake.start();
  }

  /** Tyre roll — shared by both modes, because silence at speed feels broken. */
  function buildRoad() {
    engine.road = ctx.createBufferSource();
    engine.road.buffer = noiseBuffer;
    engine.road.loop = true;
    engine.roadFilter = ctx.createBiquadFilter();
    engine.roadFilter.type = 'lowpass';
    engine.roadFilter.frequency.value = 380;
    engine.roadGain = ctx.createGain();
    engine.roadGain.gain.value = 0;
    engine.road.connect(engine.roadFilter).connect(engine.roadGain).connect(master);
    engine.road.start();

    // Wind (street racing): a band of noise that rises in pitch and grows
    // with the square of speed, like real aerodynamic noise. Nothing below
    // ~40 km/h; at 200+ it is most of what you hear besides the engine.
    engine.wind = ctx.createBufferSource();
    engine.wind.buffer = noiseBuffer;
    engine.wind.loop = true;
    engine.windFilter = ctx.createBiquadFilter();
    engine.windFilter.type = 'bandpass';
    engine.windFilter.Q.value = 0.7;
    engine.windFilter.frequency.value = 500;
    engine.windGain = ctx.createGain();
    engine.windGain.gain.value = 0;
    engine.wind.connect(engine.windFilter).connect(engine.windGain).connect(master);
    engine.wind.start();
  }

  function buildLofi() {
    lofiBus = ctx.createGain();
    lofiBus.gain.value = 0;
    lofiBus.connect(master);

    // Pad: two detuned oscillators per note, through a slow filter sweep.
    lofi.filter = ctx.createBiquadFilter();
    lofi.filter.type = 'lowpass';
    lofi.filter.frequency.value = 700;
    lofi.filter.Q.value = 0.7;
    lofi.filter.connect(lofiBus);

    lofi.oscs = [];
    PAD_HZ.forEach((hz, i) => {
      for (const detune of [-6, 6]) {
        const osc = ctx.createOscillator();
        osc.type = i % 2 === 0 ? 'triangle' : 'sine';
        osc.frequency.value = hz;
        osc.detune.value = detune;
        const g = ctx.createGain();
        g.gain.value = 0.075 / (1 + i * 0.35); // roll off the upper voices
        osc.connect(g).connect(lofi.filter);
        osc.start();
        lofi.oscs.push(osc);
      }
    });

    // Slow LFO breathing the filter, so the pad never sits still.
    lofi.lfo = ctx.createOscillator();
    lofi.lfo.frequency.value = 0.055;
    lofi.lfoGain = ctx.createGain();
    lofi.lfoGain.gain.value = 260;
    lofi.lfo.connect(lofi.lfoGain).connect(lofi.filter.frequency);
    lofi.lfo.start();

    // Tape hiss.
    lofi.hiss = ctx.createBufferSource();
    lofi.hiss.buffer = noiseBuffer;
    lofi.hiss.loop = true;
    const hissFilter = ctx.createBiquadFilter();
    hissFilter.type = 'highpass';
    hissFilter.frequency.value = 3800;
    lofi.hissGain = ctx.createGain();
    lofi.hissGain.gain.value = 0.012;
    lofi.hiss.connect(hissFilter).connect(lofi.hissGain).connect(lofiBus);
    lofi.hiss.start();

    // Vinyl crackle: sparse impulses, scheduled in blocks rather than per-tick.
    lofi.crackleGain = ctx.createGain();
    lofi.crackleGain.gain.value = 0.5;
    lofi.crackleGain.connect(lofiBus);
    lofi.nextCrackle = 0;
  }

  function start() {
    if (started) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return; // no WebAudio: the game stays silent but fully playable
    ctx = new AC();

    master = ctx.createGain();
    master.gain.value = muted ? 0 : masterVolume;
    master.connect(ctx.destination);

    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.9;
    sfxBus.connect(master);

    noiseBuffer = makeNoiseBuffer();
    buildEngine();
    buildRoad();
    buildLofi();

    started = true;
    setMode(mode);
  }

  function resume() {
    if (ctx?.state === 'suspended') ctx.resume();
  }

  function setMode(next) {
    if (!MODES.includes(next)) return;
    mode = next;
    if (!started) return;
    const t = ctx.currentTime;
    const fade = 0.4;
    const toEngine = mode === 'mechanical' ? 1 : 0.16; // the engine ducks under
    // the pad rather than vanishing: a silent car feels broken even in lofi.
    const toLofi = mode === 'lofi' ? 1 : 0;
    engineBus.gain.cancelScheduledValues(t);
    engineBus.gain.setTargetAtTime(toEngine, t, fade);
    lofiBus.gain.cancelScheduledValues(t);
    lofiBus.gain.setTargetAtTime(toLofi, t, fade);
  }

  function toggleMode() {
    setMode(mode === 'mechanical' ? 'lofi' : 'mechanical');
    return mode;
  }

  function setVolume(v) {
    masterVolume = Math.max(0, Math.min(1, v));
    if (started && !muted) master.gain.setTargetAtTime(masterVolume, ctx.currentTime, 0.05);
  }

  function setMuted(m) {
    muted = m;
    if (started) master.gain.setTargetAtTime(muted ? 0 : masterVolume, ctx.currentTime, 0.05);
  }

  /**
   * Per-frame update from the car's live state.
   * @param {number} dt
   * @param {{rpm:number, speedMs:number, throttle:boolean, gear:string}} s
   */
  function update(dt, s) {
    if (!started) return;
    const t = ctx.currentTime;

    // Firing frequency of a four-cylinder four-stroke.
    const fundamental = Math.max(18, (s.rpm / 60) * 2);
    for (const o of engine.oscs) {
      // setTargetAtTime rather than direct assignment: stepping the frequency
      // once a frame produces audible zipper noise.
      o.osc.frequency.setTargetAtTime(fundamental * o.mult, t, 0.05);
    }

    // Load opens the filter. Idling is muffled; on throttle it snarls.
    const load = s.throttle ? 1 : 0.35;
    const rpmFrac = Math.min(1, (s.rpm - 700) / 5000);
    engine.lowpass.frequency.setTargetAtTime(340 + rpmFrac * 2100 * load, t, 0.09);
    engine.intakeGain.gain.setTargetAtTime(s.throttle ? 0.035 + rpmFrac * 0.05 : 0.006, t, 0.12);

    // Tyre roll rises with speed in both modes. Parking Precision stopped
    // growing at 40 km/h (11 m/s); racing keeps growing to ~235 km/h, or
    // everything above 40 sounds the same.
    const speedFrac = Math.min(1, s.speedMs / 11);
    const fastFrac = Math.min(1, s.speedMs / 65);
    engine.roadGain.gain.setTargetAtTime(speedFrac * 0.06 + fastFrac * 0.06, t, 0.15);
    engine.roadFilter.frequency.setTargetAtTime(260 + speedFrac * 700 + fastFrac * 1100, t, 0.15);
    const windFrac = Math.max(0, Math.min(1, (s.speedMs - 11) / 60));
    engine.windGain.gain.setTargetAtTime(0.2 * windFrac * windFrac, t, 0.2);
    engine.windFilter.frequency.setTargetAtTime(450 + 1500 * windFrac, t, 0.2);

    if (mode === 'lofi') {
      // Movement nudges the pad brighter, so driving still feels connected.
      lofi.filter.detune.setTargetAtTime(speedFrac * 900, t, 0.4);
      scheduleCrackle(t);
    }
  }

  /** Vinyl crackle: short filtered noise bursts at random intervals. */
  function scheduleCrackle(now) {
    if (now < lofi.nextCrackle) return;
    lofi.nextCrackle = now + 0.04 + Math.random() * 0.22;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const offset = Math.random() * 0.9;
    const g = ctx.createGain();
    const dur = 0.006 + Math.random() * 0.012;
    g.gain.setValueAtTime(0.03 + Math.random() * 0.05, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1600 + Math.random() * 2600;
    src.connect(f).connect(g).connect(lofi.crackleGain);
    src.start(now, offset, dur);
    src.stop(now + dur + 0.01);
  }

  // --- one-shot SFX ----------------------------------------------------------

  /** Short pitched blip: gear gate clicks, UI confirmations. */
  function blip({ freq = 440, dur = 0.05, type = 'square', gain = 0.12, delay = 0 } = {}) {
    if (!started) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(sfxBus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** Filtered noise burst: impacts and scrapes. */
  function thud({ level = 1 } = {}) {
    if (!started) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.playbackRate.value = 0.6;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(420, t);
    f.frequency.exponentialRampToValueAtTime(90, t + 0.22);
    const g = ctx.createGain();
    const peak = Math.min(0.55, 0.12 + level * 0.4);
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    src.connect(f).connect(g).connect(sfxBus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + 0.3);

    // A little body thump underneath so it reads as mass, not just noise.
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(90, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.18);
    const og = ctx.createGain();
    og.gain.setValueAtTime(peak * 0.6, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    osc.connect(og).connect(sfxBus);
    osc.start(t);
    osc.stop(t + 0.22);
  }

  // --- parking sensors ---------------------------------------------------------
  // The cadence is the information, so it is driven from here with its own
  // clock: beeps every 0.55 s at the edge of range, closing to 0.07 s, then a
  // solid tone inside SENSOR_SOLID_M. A continuous oscillator is gated for the
  // solid tone rather than spamming blips, which would click.
  const SENSOR_SOLID_M = 0.3;
  const SENSOR_FAR_M = 1.5;
  let sensorClock = 0;
  let sensorTone = null;

  function setSensorTone(on) {
    if (!started) return;
    if (!sensorTone) {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = 1320;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2400;
      const g = ctx.createGain();
      g.gain.value = 0;
      osc.connect(lp).connect(g).connect(sfxBus);
      osc.start();
      sensorTone = g;
    }
    sensorTone.gain.setTargetAtTime(on ? 0.045 : 0, ctx.currentTime, 0.012);
  }

  /**
   * @param {number} dt
   * @param {number|null} distance nearest sensor reading in metres, null = clear
   */
  function updateSensor(dt, distance) {
    if (distance == null || distance > SENSOR_FAR_M) {
      setSensorTone(false);
      sensorClock = 0;
      return;
    }
    if (distance <= SENSOR_SOLID_M) {
      setSensorTone(true);
      return;
    }
    setSensorTone(false);
    const t = (distance - SENSOR_SOLID_M) / (SENSOR_FAR_M - SENSOR_SOLID_M);
    const interval = 0.07 + t * 0.48;
    sensorClock -= dt;
    if (sensorClock <= 0) {
      sensorClock = interval;
      blip({ freq: 1320, dur: Math.min(0.06, interval * 0.5), type: 'square', gain: 0.05 });
    }
  }

  return {
    start,
    resume,
    update,
    setMode,
    toggleMode,
    setVolume,
    setMuted,
    get mode() {
      return mode;
    },
    get isStarted() {
      return started;
    },
    get muted() {
      return muted;
    },

    // --- named game events -------------------------------------------------
    gearClick: () => blip({ freq: 320, dur: 0.045, type: 'square', gain: 0.1 }),
    gearRejected: () => blip({ freq: 150, dur: 0.13, type: 'sawtooth', gain: 0.09 }),
    bump: (speedMs) => thud({ level: Math.min(1, speedMs / 4) }),
    /** Rising three-note chime on a successful park. */
    success: () => {
      [523.25, 659.25, 783.99].forEach((f, i) =>
        blip({ freq: f, dur: 0.34, type: 'sine', gain: 0.16, delay: i * 0.12 })
      );
    },
    /**
     * Layered on success() for a good park, scaled to the real result
     * (design/SPEC-retention.md §9): tier 1 = three stars, 2 = Gold,
     * 3 = Platinum. Same sfx bus, so the volume setting applies.
     */
    flourish: (tier) => {
      lastFlourish = tier;
      const notes = [[], [[1568, 0.36]], [[1318.5, 0.36], [1568, 0.48]], [[1318.5, 0.36], [1568, 0.48], [2093, 0.6]]][tier] ?? [];
      for (const [f, delay] of notes) blip({ freq: f, dur: 0.3, type: 'sine', gain: 0.12, delay });
      if (tier === 3) blip({ freq: 2637, dur: 0.8, type: 'sine', gain: 0.03, delay: 0.6 });
    },
    /** Last tier passed to flourish(), for verification. */
    get lastFlourish() {
      return lastFlourish;
    },
    sensor: updateSensor,
    uiClick: () => blip({ freq: 620, dur: 0.035, type: 'triangle', gain: 0.07 }),
  };
}
