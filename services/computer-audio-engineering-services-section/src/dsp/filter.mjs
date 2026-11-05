// filter.mjs
//
// Timbral shaping. Two families of filter are provided here because they
// serve two different jobs:
//
// 1. A cheap one-pole lowpass (makeOnePoleLowpass/processOnePole) for fast
//    per-sample smoothing of *control* signals -- e.g. smoothing the
//    temperature-driven jitter that modulates detune, so it doesn't
//    "zipper" (audible stepping from sudden control-value changes). It has
//    no resonance and costs one multiply-add per sample.
//
// 2. RBJ-cookbook biquad lowpass/highpass/bandpass (computeBiquadCoeffs/
//    makeBiquad/processBiquad) for actual audio-band filtering with
//    resonance (Q). lowpass/highpass are used as each voice's slowly-
//    automatable brightness control. bandpass (constant 0dB peak-gain
//    variant) is used by dsp/formant.mjs as a swept resonant "formant"
//    filter: run a harmonically-rich source through it and sweep its center
//    frequency across the harmonic series to emphasize one overtone at a
//    time, which is the actual synthesis technique behind overtone/throat
//    singing (see formant.mjs's header comment). These are the standard
//    "Audio EQ Cookbook" (Robert Bristow-Johnson) formulas, implemented as
//    Direct Form I biquads.

/**
 * Creates a one-pole lowpass filter state. The coefficient is derived from
 * the standard one-pole smoothing formula a = 1 - exp(-2*pi*fc/fs), which
 * gives an exponential step response matching the requested cutoff.
 * @param {number} cutoffHz
 * @param {number} sampleRate
 * @returns {{a:number, cutoffHz:number, sampleRate:number, prev:number}}
 */
export function makeOnePoleLowpass(cutoffHz, sampleRate) {
  const a = 1 - Math.exp((-2 * Math.PI * cutoffHz) / sampleRate);
  return { a, cutoffHz, sampleRate, prev: 0 };
}

/**
 * Processes one sample through a one-pole lowpass, mutating its state.
 * @param {{a:number, prev:number}} state - from makeOnePoleLowpass
 * @param {number} input
 * @returns {number} filtered sample
 */
export function processOnePole(state, input) {
  state.prev = state.prev + state.a * (input - state.prev);
  return state.prev;
}

/**
 * Computes normalized RBJ-cookbook biquad coefficients (a0 divided through,
 * so the returned a1/a2 already account for it and no separate a0 is
 * needed at process time).
 * @param {object} opts
 * @param {'lowpass'|'highpass'|'bandpass'} opts.type
 * @param {number} opts.cutoffHz - for 'bandpass' this is the center frequency, not a cutoff
 * @param {number} [opts.Q=0.707] - quality factor / resonance (0.707 = Butterworth, no resonant peak). For 'bandpass', Q directly sets selectivity: bandwidth (in Hz) is approximately cutoffHz/Q, so isolating a single harmonic partial out of a dense series needs Q roughly proportional to that harmonic's number (see formant.mjs)
 * @param {number} opts.sampleRate
 * @returns {{b0:number, b1:number, b2:number, a1:number, a2:number}}
 */
export function computeBiquadCoeffs({ type, cutoffHz, Q = 0.707, sampleRate }) {
  const w0 = (2 * Math.PI * cutoffHz) / sampleRate;
  const cosW0 = Math.cos(w0);
  const sinW0 = Math.sin(w0);
  const alpha = sinW0 / (2 * Q);

  let b0;
  let b1;
  let b2;
  let a0;
  let a1;
  let a2;

  if (type === 'lowpass') {
    b0 = (1 - cosW0) / 2;
    b1 = 1 - cosW0;
    b2 = (1 - cosW0) / 2;
    a0 = 1 + alpha;
    a1 = -2 * cosW0;
    a2 = 1 - alpha;
  } else if (type === 'highpass') {
    b0 = (1 + cosW0) / 2;
    b1 = -(1 + cosW0);
    b2 = (1 + cosW0) / 2;
    a0 = 1 + alpha;
    a1 = -2 * cosW0;
    a2 = 1 - alpha;
  } else if (type === 'bandpass') {
    // RBJ cookbook BPF, constant 0dB peak gain variant: the passband peak
    // stays at unity gain regardless of Q, so sweeping cutoffHz (the center
    // frequency here) across the harmonic series doesn't also sweep the
    // overall loudness up and down -- important for a formant sweep, where
    // the emphasized-overtone effect should read as a timbral/spectral
    // change, not a volume swell.
    b0 = alpha;
    b1 = 0;
    b2 = -alpha;
    a0 = 1 + alpha;
    a1 = -2 * cosW0;
    a2 = 1 - alpha;
  } else {
    throw new Error(`Unknown biquad type: ${type}. Use 'lowpass', 'highpass', or 'bandpass'.`);
  }

  return {
    b0: b0 / a0,
    b1: b1 / a0,
    b2: b2 / a0,
    a1: a1 / a0,
    a2: a2 / a0,
  };
}

/**
 * Creates a biquad filter state (Direct Form I) from a coefficient set.
 * @param {{b0:number, b1:number, b2:number, a1:number, a2:number}} coeffs - from computeBiquadCoeffs
 * @returns {object} biquad state
 */
export function makeBiquad(coeffs) {
  return {
    b0: coeffs.b0,
    b1: coeffs.b1,
    b2: coeffs.b2,
    a1: coeffs.a1,
    a2: coeffs.a2,
    x1: 0,
    x2: 0,
    y1: 0,
    y2: 0,
  };
}

/**
 * Processes one sample through a biquad filter (Direct Form I), mutating
 * its state.
 * @param {object} state - from makeBiquad
 * @param {number} input
 * @returns {number} filtered sample
 */
export function processBiquad(state, input) {
  const y =
    state.b0 * input +
    state.b1 * state.x1 +
    state.b2 * state.x2 -
    state.a1 * state.y1 -
    state.a2 * state.y2;

  state.x2 = state.x1;
  state.x1 = input;
  state.y2 = state.y1;
  state.y1 = y;

  return y;
}
