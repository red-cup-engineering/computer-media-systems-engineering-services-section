// karplus-strong.mjs
//
// Karplus-Strong plucked-string synthesis: an excited delay line with a
// filtered feedback loop. The classic algorithm (Karplus & Strong 1983): a
// delay line whose length sets the fundamental period is seeded once with a
// burst of noise (the "pluck"), then read back into itself every sample
// through a lowpass filter and a feedback gain slightly under 1 -- the
// lowpass progressively removes energy from the upper harmonics faster than
// the fundamental (real strings do exactly this: high partials die out
// quicker than the fundamental), which is what gives Karplus-Strong its
// characteristic bright-attack/darkening-decay plucked-string envelope
// without needing any separate amplitude envelope at all -- the decay IS the
// physics of the loop, not an applied ADSR curve.
//
// Reuses this package's own delay line (dsp/delay.mjs -- the same primitive
// the reverb's comb filters are built on) and one-pole lowpass (dsp/filter.mjs
// -- the same "damping" filter the reverb's combs use) rather than
// reimplementing either. Structurally this is the same shape as
// reverb.mjs's processComb (a delay line with a one-pole-damped feedback
// path): the difference is the delay length is tuned to a musical pitch
// instead of a diffuse reverb tuning, and the loop is seeded once with noise
// (the pluck) instead of being driven continuously by an input signal.
//
// Deliberately does NOT import anything from src/generative/: this stays a
// pure DSP primitive with no dependency on the generative layer's seeded
// PRNG. Callers that want a whole render's determinism to also cover the
// string's excitation noise (so the same --seed reproduces byte-identical
// audio) pass their own seeded sample function via the exciteSample option
// -- see generative/improv-duo.mjs for a concrete caller doing exactly that.

import { makeDelayLine, readDelayInterpolated, writeDelay } from './delay.mjs';
import { makeOnePoleLowpass, processOnePole } from './filter.mjs';

/**
 * Default excitation sample function: Math.random()-based white noise in
 * [-1, 1]. Used only when a caller doesn't supply exciteSample -- any render
 * that needs full-track seeded determinism should pass its own.
 * @returns {number}
 */
function defaultExciteSample() {
  return Math.random() * 2 - 1;
}

/**
 * Creates a plucked Karplus-Strong string voice, already excited: the pluck
 * happens right here at construction time, filling the delay line with a
 * noise burst. There is no separate "trigger" step the way envelope.mjs's
 * triggerAttack works, because the string's whole amplitude contour comes
 * from the feedback loop's own decay physics, not an applied envelope --
 * advanceKarplusString alone produces the full pluck-decay shape.
 * @param {object} opts
 * @param {number} opts.freqHz - fundamental frequency; sets delay length as sampleRate/freqHz (fractional, read back with linear interpolation via readDelayInterpolated so pitch is not quantized to whole-sample delay lengths)
 * @param {number} opts.sampleRate
 * @param {number} [opts.decay=0.996] - per-sample feedback gain (< 1; closer to 1 = longer sustain). Multiplies the *damped* signal each loop, so the actual audible decay time also depends on dampingHz.
 * @param {number} [opts.dampingHz=4500] - one-pole lowpass cutoff inside the feedback loop; lower = duller pluck, faster high-harmonic loss (nylon/gut-string character); higher = brighter, more metallic, slower-darkening (steel-string character)
 * @param {number} [opts.exciteGain=1] - scales the initial noise burst's amplitude (pluck strength/velocity)
 * @param {() => number} [opts.exciteSample] - sample generator for the initial noise burst, called ~sampleRate/freqHz times, expected to return values roughly in [-1, 1]; defaults to Math.random()-based noise
 * @returns {object} string state, advanced one sample at a time by advanceKarplusString
 */
export function makeKarplusString({ freqHz, sampleRate, decay = 0.996, dampingHz = 4500, exciteGain = 1, exciteSample = defaultExciteSample }) {
  if (!(freqHz > 0)) throw new Error('makeKarplusString: freqHz must be positive');
  const delaySamples = sampleRate / freqHz;
  const lineLength = Math.max(4, Math.round(delaySamples) + 2);
  const line = makeDelayLine(lineLength);
  const damper = makeOnePoleLowpass(dampingHz, sampleRate);

  const str = { line, delaySamples, decay, damper, freqHz, sampleRate };
  pluck(str, exciteGain, exciteSample);
  return str;
}

/**
 * Fills the delay line with a fresh noise burst (the pluck excitation).
 * Shared by makeKarplusString (initial construction) and repluck (reusing an
 * existing string voice for a new note attack at the same pitch).
 * @param {object} str
 * @param {number} exciteGain
 * @param {() => number} exciteSample
 */
function pluck(str, exciteGain, exciteSample) {
  const burstLength = Math.max(1, Math.round(str.delaySamples));
  for (let i = 0; i < burstLength; i++) {
    writeDelay(str.line, exciteSample() * exciteGain);
  }
}

/**
 * Advances a Karplus-Strong string by exactly one sample: reads the delayed
 * signal back (the audible output for this sample), damps it with the
 * feedback loop's one-pole lowpass, scales by the decay gain, and writes it
 * back into the delay line for the next cycle around.
 * @param {object} str - from makeKarplusString, mutated in place
 * @returns {number} output sample, roughly in [-1, 1] right after the pluck, settling toward 0 as the string decays
 */
export function advanceKarplusString(str) {
  const delayed = readDelayInterpolated(str.line, str.delaySamples);
  const damped = processOnePole(str.damper, delayed);
  writeDelay(str.line, damped * str.decay);
  return delayed;
}

/**
 * Named (decay, dampingHz) starting points for makeKarplusString, spanning
 * the plucked-string-family character range this one algorithm already
 * covers via its two continuous parameters -- not a separate synthesis
 * mechanism per name, exactly the same "named points in a real parameter
 * space" discipline dsp/oscillator.mjs's PARTIAL_PRESETS and
 * dsp/reverb.mjs's REVERB_PRESETS already follow. `decay` trades sustain
 * length (closer to 1 = longer); `dampingHz` trades brightness/darkening
 * speed (lower = duller, faster-darkening nylon/gut character; higher =
 * brighter, slower-darkening steel character).
 */
export const PLUCK_PRESETS = Object.freeze({
  // Warm, quick-darkening nylon-string character -- suited to a lounge/
  // ambient bed's pulse layer.
  nylon: Object.freeze({ decay: 0.994, dampingHz: 3200 }),
  // Brighter, longer-sustaining steel-string character -- cuts through more
  // as a foreground/lead voice.
  steel: Object.freeze({ decay: 0.997, dampingHz: 6500 }),
  // Short, heavily-damped, almost percussive pluck (a "mute"/palm-mute
  // character) -- suited to a dense rhythmic ostinato where individual
  // plucks need to stay short and separated rather than ringing together.
  muted: Object.freeze({ decay: 0.985, dampingHz: 1800 }),
  // Bright, glassy, guqin/koto-adjacent character -- fuller high end than
  // nylon, less sustain than steel; paired with dsp/oscillator.mjs's
  // pluckedString partial preset elsewhere in spirit, though this preset is
  // for the Karplus-Strong physical model, not the additive approximation.
  guqinAdjacent: Object.freeze({ decay: 0.995, dampingHz: 5200 }),
});

/**
 * Re-plucks an already-created string voice in place (same delay length /
 * frequency, fresh noise burst) -- lets a caller reuse one string voice
 * object across many discrete note attacks at the same pitch without
 * reallocating a new delay line each time. For a different pitch, call
 * makeKarplusString again instead.
 * @param {object} str - from makeKarplusString, mutated in place
 * @param {number} [exciteGain=1]
 * @param {() => number} [exciteSample=defaultExciteSample]
 */
export function repluck(str, exciteGain = 1, exciteSample = defaultExciteSample) {
  pluck(str, exciteGain, exciteSample);
}
