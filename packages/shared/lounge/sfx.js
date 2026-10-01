/** Synthesised table sounds shared by the card games (stand-ins until CC0 samples land). */

export function createSfx() {
  let ac = null, noise = null, on = true;
  function ctx() {
    if (!on) return null;
    if (!ac) {
      try {
        ac = new AudioContext();
        noise = ac.createBuffer(1, ac.sampleRate * 0.3, ac.sampleRate);
        const d = noise.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      } catch { return null; }
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }
  addEventListener('pointerdown', () => ac?.state === 'suspended' && ac.resume(), { capture: true });
  return {
    set on(v) { on = v; if (!v) ac?.suspend(); else ac?.resume(); },
    get on() { return on; },
    card(vol = 0.22) {
      const a = ctx(); if (!a) return;
      const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(), t = a.currentTime;
      s.buffer = noise; s.playbackRate.value = 0.9 + Math.random() * 0.2;
      f.type = 'bandpass'; f.frequency.value = 2400 + Math.random() * 600; f.Q.value = 0.7;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
      s.connect(f).connect(g).connect(a.destination); s.start(t); s.stop(t + 0.12);
    },
    chip() {
      const a = ctx(); if (!a) return;
      const t = a.currentTime;
      [3200, 4300].forEach((hz, i) => { const o = a.createOscillator(), g = a.createGain(); o.frequency.value = hz * (0.97 + Math.random() * 0.06); g.gain.setValueAtTime(0.07, t + i * 0.018); g.gain.exponentialRampToValueAtTime(0.0008, t + i * 0.018 + 0.06); o.connect(g).connect(a.destination); o.start(t + i * 0.018); o.stop(t + i * 0.018 + 0.08); });
    },
    click() {
      const a = ctx(); if (!a) return;
      const o = a.createOscillator(), g = a.createGain(), t = a.currentTime;
      o.type = 'square'; o.frequency.value = 1800; g.gain.setValueAtTime(0.03, t); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.03);
      o.connect(g).connect(a.destination); o.start(t); o.stop(t + 0.04);
    },
    /** 'big' (three rising notes), 'win', 'lose', 'push' */
    sting(kind) {
      const a = ctx(); if (!a) return;
      const t = a.currentTime;
      const notes = kind === 'big' ? [523.25, 659.25, 783.99] : kind === 'win' ? [587.33, 783.99] : kind === 'lose' ? [146.83] : [440];
      notes.forEach((hz, i) => { const o = a.createOscillator(), g = a.createGain(); o.type = kind === 'lose' ? 'sine' : 'triangle'; o.frequency.value = hz; const t0 = t + i * 0.09; g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(kind === 'lose' ? 0.16 : 0.09, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t0 + (kind === 'lose' ? 0.45 : 0.6)); o.connect(g).connect(a.destination); o.start(t0); o.stop(t0 + 0.7); });
    },
  };
}
