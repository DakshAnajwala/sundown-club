/**
 * SpeedBlur.js — a radial motion blur that only touches the edges of the
 * frame, scaled by speed. The centre (where the player is looking: the road
 * ahead, the car) stays sharp; the periphery smears toward the vanishing
 * point, which is how the eye reads speed.
 *
 * A post-processing pass for three's EffectComposer: `strength` 0 is a
 * straight copy, so it costs one extra full-screen pass when idle. Eight taps.
 */
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const SpeedBlurShader = {
  uniforms: {
    tDiffuse: { value: null },
    strength: { value: 0 },
    center: { value: [0.5, 0.52] },
    clearRadius: { value: 0.28 },
    vignette: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float strength;
    uniform vec2 center;
    uniform float clearRadius;
    uniform float vignette;
    varying vec2 vUv;
    void main() {
      vec2 d = vUv - center;
      float r = length(d * vec2(1.6, 1.0));
      float edge = smoothstep(clearRadius, clearRadius + 0.35, r);
      float amt = strength * edge;
      if (amt < 0.0005) {
        gl_FragColor = texture2D(tDiffuse, vUv) * ( 1.0 - vignette * edge );
        return;
      }
      vec4 acc = vec4(0.0);
      for (int i = 0; i < 8; i++) {
        float t = float(i) / 7.0;
        acc += texture2D(tDiffuse, vUv - d * amt * t);
      }
      // Tunnel vision: the edges darken a little as speed rises.
      gl_FragColor = acc / 8.0 * ( 1.0 - vignette * edge );
    }
  `,
};

export function createSpeedBlurPass() {
  const pass = new ShaderPass(SpeedBlurShader);
  return {
    pass,
    /** @param {number} amount 0..1 shared speed factor */
    setAmount(amount, enabled = true) {
      pass.uniforms.strength.value = enabled ? 0.11 * amount * amount : 0;
      pass.uniforms.vignette.value = enabled ? 0.35 * amount : 0;
    },
  };
}
