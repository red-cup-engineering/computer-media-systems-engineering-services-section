// formant.mjs
//
// The real synthesis technique behind overtone/throat singing (Tuvan
// khoomei and its relatives): overtone singing is NOT a melody of different
// fundamental pitches. A performer holds a (near-)constant low fundamental
// and shapes their vocal tract into a sequence of resonant formant
// positions, each of which reinforces one specific harmonic already present
// in the fundamental's own rich overtone series -- so what the ear hears
// sweep up and down like a melody is which overtone is currently emphasized,
// not a changing fundamental. Concretely, this needs:
//
//   1. A source with a genuinely rich, dense harmonic series (a
//      sawtooth-adjacent spectrum), because a formant filter can only
//      emphasize a harmonic that's actually present in the source to begin
//      with -- makeHarmonicSourcePartials below is tuned for that (many
//      partials, gentle rolloff), distinct from oscillator.mjs's
//      PARTIAL_PRESETS, which are tuned for warm/rounded pad tone (few
//      partials, faster rolloff) and would leave nothing for a formant
//      sweep to grab onto above roughly the 6th harmonic.
//   2. One or more narrow resonant bandpass ("formant") filters run in
//      parallel on that source, each swept in center frequency to track a
//      target harmonic multiple of the fundamental over time -- this is
//      filter.mjs's 'bandpass' biquad type (constant 0dB peak gain, so
//      sweeping the target harmonic doesn't also sweep the overall
//      loudness), re-tuned as its target moves. makeFormantFilter/
//      retuneFormantFilter/processFormantFilter are thin, semantically-named
//      wrappers over filter.mjs's own constructor/process functions, kept
//      here (rather than reusing a private helper elsewhere) so this module
//      has no dependency on any one caller and is independently testable.
//
// Harmonics are evenly spaced in absolute Hz -- each one exactly one
// fundamental (f0) above the last -- but the *ratio* of that spacing to the
// center frequency shrinks going up the series (spacing/center = f0/(n*f0)
// = 1/n), so isolating harmonic n cleanly from its neighbors
// needs a filter bandwidth well under f0, which for a constant-Q bandpass
// (bandwidth ~= centerHz/Q) means Q needs to grow roughly proportional to n.
// qForHarmonic below computes that directly rather than using one fixed Q
// for every target harmonic, which would either be too wide to isolate high
// harmonics or needlessly (and less stably) narrow for low ones.
//
// goertzelPower is a single-frequency energy-detection utility (the
// Goertzel algorithm -- an efficient way to compute one DFT bin without a
// full FFT) used both by this module's own tests and by the render-time
// verification script to *measure*, not assume, that a formant sweep is
// actually emphasizing the harmonic it's supposed to at any given moment.

import { generatePartials } from './oscillator.mjs';
import { computeBiquadCoeffs, makeBiquad, processBiquad } from './filter.mjs';

/**
 * A dense harmonic-series partial set suited as the raw source for
 * formant/overtone emphasis: many harmonics, gentle rolloff, so a swept
 * formant filter has real energy to find out past the low single-digit
 * harmonics oscillator.mjs's pad-tuned PARTIAL_PRESETS would have already
 * rolled off. Odd and even harmonics both present (oddEvenBias=0), matching
 * a real (sawtooth-like) glottal-source spectrum -- overtone singing's
 * source is a buzzy vocal-fold tone, not a hollow/odd-only one.
 * @param {object} [opts]
 * @param {number} [opts.count=20] - number of harmonics to generate
 * @param {number} [opts.rolloffExponent=0.9] - see oscillator.mjs's generatePartials; kept below 1 so upper harmonics stay audible enough to sweep across
 * @returns {Array<{ratio:number, amp:number}>}
 */
export function makeHarmonicSourcePartials({ count = 20, rolloffExponent = 0.9 } = {}) {
  return generatePartials({ count, rolloffExponent, oddEvenBias: 0 });
}

/**
 * The makeup gain needed to bring a formant filter's isolated output for one
 * specific target harmonic back up near a comparable loudness to any other
 * target harmonic. This corrects a real, load-bearing normalization fact,
 * not a cosmetic tweak: oscillator.mjs's additiveSample divides its raw
 * output by the *sum* of every partial's amplitude, so any one harmonic's
 * actual contribution to the raw (unfiltered) signal is only
 * partialAmp(ratio) / sum(partialAmps) of full scale -- once a formant
 * filter isolates that one harmonic back out, what's left is only that
 * small fraction, and it gets smaller for higher (lower-amplitude, given
 * generatePartials' rolloff) harmonics. Without this correction, sweeping a
 * formant target up the harmonic series would get quieter and quieter
 * purely as a side effect of the source's own additive normalization --
 * audible as a loudness swell/dip riding along with the overtone melody,
 * not the constant-peak-gain "spectral change, not a volume change"
 * dsp/filter.mjs's bandpass variant is meant to give. Clamped to a sane
 * range so a very high, very low-amplitude harmonic doesn't get boosted
 * into audibly amplifying the filter's own numerical noise floor.
 * @param {Array<{ratio:number, amp:number}>} partials - from makeHarmonicSourcePartials
 * @param {number} harmonicRatio - target harmonic (rounded to the nearest integer ratio present in partials)
 * @param {object} [opts]
 * @param {number} [opts.minGain=1]
 * @param {number} [opts.maxGain=70] - measured against makeHarmonicSourcePartials' own default (count=20, rolloffExponent=0.9): full correction across harmonics 1..20 needs up to roughly 60x at the top of that range, so maxGain is set with headroom above that rather than an arbitrary round number; float64 headroom makes amplifying the filter's own numerical noise floor by this much a non-issue in practice
 * @returns {number}
 */
export function formantMakeupGain(partials, harmonicRatio, { minGain = 1, maxGain = 70 } = {}) {
  if (partials.length === 0) return 1;
  const ampSum = partials.reduce((s, p) => s + Math.abs(p.amp), 0);
  const targetRatio = Math.round(harmonicRatio);
  const match = partials.find((p) => p.ratio === targetRatio);
  const amp = match ? Math.abs(match.amp) : Math.abs(partials[partials.length - 1].amp);
  const gain = amp > 1e-6 ? ampSum / amp : maxGain;
  return Math.max(minGain, Math.min(maxGain, gain));
}

/**
 * Converts a harmonic ratio (which overtone -- 1 = the fundamental itself,
 * 2 = one octave up, non-integer values are meaningful too, e.g. a glide
 * partway between two harmonics) to an absolute center frequency.
 * @param {number} fundamentalHz
 * @param {number} harmonicRatio
 * @returns {number} Hz
 */
export function harmonicToHz(fundamentalHz, harmonicRatio) {
  return fundamentalHz * harmonicRatio;
}

/**
 * The Q a formant filter needs to isolate harmonic number `harmonicRatio`
 * from its immediate neighbors (harmonicRatio-1, harmonicRatio+1) in a
 * harmonic series: bandwidth ~= centerHz/Q must stay well under one
 * fundamental-worth of Hz (the fixed spacing between any two adjacent
 * harmonics), which means Q must grow roughly proportional to the harmonic
 * number itself, not stay fixed. Clamped to a sane playable range: too low
 * and neighboring harmonics leak through (the "melody" smears), too high
 * risks an unstably narrow/ringy filter and exaggerates any per-sample
 * retuning zipper.
 * @param {number} harmonicRatio
 * @param {object} [opts]
 * @param {number} [opts.selectivity=1.8] - multiplier on harmonicRatio; higher = narrower/more isolated
 * @param {number} [opts.minQ=4]
 * @param {number} [opts.maxQ=32]
 * @returns {number}
 */
export function qForHarmonic(harmonicRatio, { selectivity = 1.8, minQ = 4, maxQ = 32 } = {}) {
  const q = Math.abs(harmonicRatio) * selectivity;
  return Math.max(minQ, Math.min(maxQ, q));
}

/**
 * Creates a resonant-bandpass "formant" filter tuned to centerHz.
 * @param {object} opts
 * @param {number} opts.centerHz
 * @param {number} opts.Q
 * @param {number} opts.sampleRate
 * @returns {object} biquad state, from filter.mjs's makeBiquad
 */
export function makeFormantFilter({ centerHz, Q, sampleRate }) {
  const coeffs = computeBiquadCoeffs({ type: 'bandpass', cutoffHz: centerHz, Q, sampleRate });
  return makeBiquad(coeffs);
}

/**
 * Re-tunes a formant filter's coefficients in place, preserving its x1/x2/
 * y1/y2 sample history so a moving sweep never introduces a filter-state
 * discontinuity -- the same technique compose.mjs's own retuneBiquad uses
 * for pad-voice cutoff automation, reimplemented here (not imported from
 * compose.mjs, which doesn't export it) so this module stays independent
 * and testable on its own. This is the operation that actually makes a
 * "swept" formant sweep: called every time the target center frequency
 * moves, it's what turns a static bandpass filter into a continuously
 * gliding one.
 * @param {object} state - from makeFormantFilter, mutated in place
 * @param {object} opts
 * @param {number} opts.centerHz
 * @param {number} opts.Q
 * @param {number} opts.sampleRate
 * @returns {object} state
 */
export function retuneFormantFilter(state, { centerHz, Q, sampleRate }) {
  const coeffs = computeBiquadCoeffs({ type: 'bandpass', cutoffHz: centerHz, Q, sampleRate });
  state.b0 = coeffs.b0;
  state.b1 = coeffs.b1;
  state.b2 = coeffs.b2;
  state.a1 = coeffs.a1;
  state.a2 = coeffs.a2;
  return state;
}

/**
 * Processes one sample through a formant filter. A thin, semantically-named
 * pass-through to filter.mjs's processBiquad (formant filters are ordinary
 * biquads; the "formant" name describes the role, not a different
 * algorithm).
 * @param {object} state
 * @param {number} input
 * @returns {number}
 */
export function processFormantFilter(state, input) {
  return processBiquad(state, input);
}

/**
 * The Goertzel algorithm: computes the power (squared magnitude) at exactly
 * one target frequency over a block of samples, without needing a full FFT.
 * This is the module's measurement tool -- both test/formant.test.mjs and
 * scripts/render-throat-track.mjs's verification step use it to *measure*
 * whether a formant sweep is actually concentrating energy at its intended
 * target harmonic at a given point in time, rather than assuming a filter
 * sweep "must be working" because the coefficients look right.
 * @param {Float64Array|Float32Array|number[]} samples - a block of samples (e.g. a short analysis window)
 * @param {number} targetHz
 * @param {number} sampleRate
 * @returns {number} power (not normalized against block length -- compare values computed with the same block length and sampleRate)
 */
export function goertzelPower(samples, targetHz, sampleRate) {
  const n = samples.length;
  if (n === 0) return 0;
  const k = Math.round((n * targetHz) / sampleRate);
  const omega = (2 * Math.PI * k) / n;
  const coeff = 2 * Math.cos(omega);
  let s0 = 0;
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < n; i++) {
    s0 = samples[i] + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return s1 * s1 + s2 * s2 - coeff * s1 * s2;
}

/**
 * Convenience wrapper: goertzelPower expressed in dB (10*log10(power)),
 * clamped away from -Infinity for a true-zero block. Useful for readable
 * measurement output (verification reports, test assertion messages)
 * without every caller re-deriving the same log conversion.
 * @param {Float64Array|Float32Array|number[]} samples
 * @param {number} targetHz
 * @param {number} sampleRate
 * @returns {number} dB, or -300 for a zero-power block
 */
export function goertzelPowerDb(samples, targetHz, sampleRate) {
  const power = goertzelPower(samples, targetHz, sampleRate);
  return power > 0 ? 10 * Math.log10(power) : -300;
}
