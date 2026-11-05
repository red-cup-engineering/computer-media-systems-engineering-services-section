// percussion.mjs
//
// A filtered-noise-burst percussion voice: seeded white noise through an RBJ
// bandpass biquad (filter.mjs -- the same primitive dsp/formant.mjs's
// overtone sweep uses, here fixed at one center frequency instead of swept)
// with a fast-attack/exponential-decay amplitude envelope (envelope.mjs).
// This is the standard "subtractive noise percussion" technique (a shaker/
// tick/rim-click/soft-mallet character depending on bandHz/Q/decaySec), not
// a physical model the way dsp/karplus-strong.mjs's plucked string is -- it
// is offered as the engine's percussion-family voice specifically because
// the existing DSP core had a pitched-sustain voice (additive oscillator), a
// pitched-decay voice (Karplus-Strong), and a sustain-plus-noise voice
// (bow-breath-voice.mjs), but nothing built to read as a short, unpitched
// (or only vaguely pitched) hit -- the fourth idiomatic character
// arrangement.mjs's pulse/ornament stems need.
//
// Deliberately does NOT import anything from src/generative/: like
// karplus-strong.mjs, this stays a pure DSP primitive with no dependency on
// the generative layer's seeded PRNG. Callers that need a whole render's
// determinism to also cover this voice's excitation noise pass their own
// seeded sample function via exciteSample, exactly mirroring
// karplus-strong.mjs's exciteSample convention.

import { makeBiquad, computeBiquadCoeffs, processBiquad } from './filter.mjs';
import { makeEnvelope, envelopeValueAt, triggerAttack } from './envelope.mjs';

function defaultExciteSample() {
  return Math.random() * 2 - 1;
}

/**
 * Creates a noise-burst percussion voice, already triggered (attack begins
 * at atSec).
 * @param {object} opts
 * @param {number} opts.sampleRate
 * @param {number} [opts.bandHz=1200] - bandpass center frequency; lower reads as a duller tick/rim-click, higher as a brighter shaker/hi-hat-like tick
 * @param {number} [opts.Q=1.2] - bandpass selectivity; higher narrows the resulting timbre toward a single ringing pitch-ish tone, lower stays closer to broadband noise
 * @param {number} [opts.decaySec=0.15] - envelope release time; the whole audible character is a fast attack into this decay, no sustain stage
 * @param {number} [opts.attackSec=0.002] - envelope attack time; kept very short (a few ms) so the voice reads as a hit, not a swell
 * @param {number} [opts.atSec=0] - transport time the hit's attack begins at
 * @param {() => number} [opts.exciteSample] - seeded noise sample generator, called once per output sample for the voice's lifetime; defaults to Math.random()-based noise
 * @returns {object} percussion voice state, advanced one sample at a time by advanceNoiseBurstVoice
 */
export function makeNoiseBurstVoice({ sampleRate, bandHz = 1200, Q = 1.2, decaySec = 0.15, attackSec = 0.002, atSec = 0, exciteSample = defaultExciteSample }) {
  const coeffs = computeBiquadCoeffs({ type: 'bandpass', cutoffHz: bandHz, Q, sampleRate });
  const biquad = makeBiquad(coeffs);
  const envelope = makeEnvelope({ attackSec, releaseSec: decaySec, sustainLevel: 1, curve: 7 });
  triggerAttack(envelope, atSec);
  return { biquad, envelope, exciteSample, bandHz, Q, decaySec };
}

/**
 * Advances a noise-burst percussion voice by exactly one sample.
 * @param {object} voice - from makeNoiseBurstVoice, mutated in place
 * @param {number} sampleTimeSec - current transport time, used to read the envelope's attack-stage progress (this voice never leaves 'attack'/'release' -- there is no sustain stage to hold, so the caller does not need to call triggerRelease at all: the fixed decaySec release begins immediately once the short attack completes, per the envelope's own attack->sustain->release stage machine reaching 'sustain' at sustainLevel=1 then being released once, right here)
 * @returns {number} output sample, roughly in [-1, 1]
 */
export function advanceNoiseBurstVoice(voice, sampleTimeSec) {
  const noise = voice.exciteSample();
  const filtered = processBiquad(voice.biquad, noise);
  const elapsedSinceAttack = sampleTimeSec - voice.envelope.stageStartTime;
  if (voice.envelope.stage === 'attack' && elapsedSinceAttack >= voice.envelope.attackSec) {
    voice.envelope.stage = 'release';
    voice.envelope.stageStartTime = sampleTimeSec;
    voice.envelope.releaseStartLevel = voice.envelope.sustainLevel;
  }
  const elapsed = sampleTimeSec - voice.envelope.stageStartTime;
  const level = envelopeValueAt(voice.envelope, elapsed);
  return filtered * level;
}

/**
 * Named (bandHz, Q, decaySec) starting points spanning this one algorithm's
 * character range -- the same "named points in a real parameter space"
 * discipline as dsp/karplus-strong.mjs's PLUCK_PRESETS.
 */
export const PERCUSSION_PRESETS = Object.freeze({
  shaker: Object.freeze({ bandHz: 6500, Q: 0.8, decaySec: 0.09, attackSec: 0.001 }),
  tick: Object.freeze({ bandHz: 3200, Q: 2.5, decaySec: 0.05, attackSec: 0.001 }),
  softMallet: Object.freeze({ bandHz: 700, Q: 1.4, decaySec: 0.35, attackSec: 0.004 }),
  rimClick: Object.freeze({ bandHz: 1800, Q: 3.5, decaySec: 0.07, attackSec: 0.001 }),
});
