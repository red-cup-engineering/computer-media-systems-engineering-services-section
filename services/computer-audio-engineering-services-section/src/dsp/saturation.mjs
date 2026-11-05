// saturation.mjs
//
// A real, tunable soft-clip/waveshaping distortion stage for deliberate
// analog-style saturation/warmth -- distinct in purpose from mixer.mjs's
// softClip, which is a last-resort safety limiter tuned to almost never
// engage (the render pipeline is gain-staged so normal signal stays well
// inside tanh's linear region). This module is meant to be driven on
// purpose: pushing a tanh nonlinearity harder (drive > 1) adds harmonic
// content that reads as warmth/saturation rather than harshness, because a
// memoryless nonlinearity applied to a harmonic input only ever adds energy
// at integer multiples of frequencies already present -- new harmonics, not
// new (inharmonic) noise.
//
// Two real, separate knobs:
//   - drive: how hard the signal is pushed into the tanh curve before
//     clipping. Without compensation, *low* drive is the case that quietly
//     loses level: tanh(drive*x) is close to linear for small drive, so a
//     drive under 1 behaves mostly like a plain attenuator (tanh(0.1) is
//     already down to 0.0997 for a full-scale sample). makeupGainForDrive
//     corrects this by rescaling so a full-scale (+-1) sample maps back to
//     (almost exactly) +-1 output at *any* drive setting -- which pins peak
//     loudness constant and leaves drive to control only the shape/amount
//     of compression applied to everything quieter than full scale, i.e.
//     "drive" reads as added harmonic color, not as a loudness knob.
//   - asymmetryBias: shifts the waveform off-center before clipping. A
//     symmetric tanh (bias=0) only ever generates odd harmonics (a clean,
//     "solid-state" distortion character). Biasing the input before
//     clipping makes the positive and negative half-cycles clip
//     differently, which is what generates even harmonics too -- closer to
//     how a single-ended tube or tape stage behaves, and part of what gives
//     that gear its "warmer" (vs. harsher, purely-odd-harmonic) reputation.
//     dcRef below re-centers the output so a nonzero bias doesn't leave a
//     DC offset in the signal.
//   - mix: wet/dry blend. mix<1 is "parallel saturation" -- blending a
//     driven copy back in with the clean signal, a standard production
//     technique for adding harmonic color/perceived loudness without fully
//     compressing the transient/dynamic shape of the original.

/**
 * The gain that rescales tanh(drive * 1) back to exactly 1: since
 * tanh(drive) < 1 for any finite drive (approaching 1 only as drive grows
 * large), a full-scale sample run through tanh(sample*drive) alone would
 * fall short of full scale, more so at low drive than high -- 1/tanh(drive)
 * is exactly the factor that undoes that shortfall. Strictly decreasing as
 * drive rises (from arbitrarily large near drive=0, where tanh(drive*x) is
 * nearly linear and closest to a plain attenuator, toward 1 as drive grows
 * and tanh(drive) itself approaches 1) -- i.e. high drive needs little
 * makeup (it's already clipping peaks near unity), low drive needs a lot.
 * @param {number} drive
 * @returns {number}
 */
export function makeupGainForDrive(drive) {
  return drive > 1e-9 ? 1 / Math.tanh(drive) : 1;
}

/**
 * Soft-clips one sample through a driven, optionally-asymmetric tanh stage,
 * blended with the dry input by `mix`. Output is always clamped to (-1, 1):
 * makeup gain is calibrated around a full-scale (+-1) *input*, so an
 * out-of-range input (e.g. an already-hot upstream signal) combined with
 * makeup could otherwise overshoot unity -- the final clamp guarantees this
 * stage's own output never does, regardless of what it's fed.
 * @param {number} sample
 * @param {object} [opts]
 * @param {number} [opts.drive=1] - how hard the signal is pushed into tanh; >1 audibly saturates
 * @param {number} [opts.asymmetryBias=0] - DC offset applied before clipping, re-centered after (see header comment); nonzero adds even harmonics for a warmer/tube-like character
 * @param {number} [opts.mix=1] - 0..1 wet/dry blend; 1 = fully saturated, 0 = bypass
 * @param {boolean} [opts.makeup=true] - apply makeupGainForDrive to the driven (wet) signal
 * @returns {number} saturated sample, always in (-1, 1)
 */
export function saturate(sample, { drive = 1, asymmetryBias = 0, mix = 1, makeup = true } = {}) {
  const dcRef = Math.tanh(asymmetryBias * drive);
  let driven = Math.tanh((sample + asymmetryBias) * drive) - dcRef;
  if (makeup) driven *= makeupGainForDrive(drive);
  const out = sample * (1 - mix) + driven * mix;
  return Math.max(-0.999999, Math.min(0.999999, out));
}
