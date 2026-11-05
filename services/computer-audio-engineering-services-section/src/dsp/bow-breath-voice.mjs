// bow-breath-voice.mjs
//
// A second, contrasting instrument-synthesis model to karplus-strong.mjs's
// plucked string: a sustained bowed/blown-style voice. It reuses this
// package's existing additive oscillator (dsp/oscillator.mjs -- same
// primitive every other voice in this engine uses) for the harmonic tone,
// but layers it with genuine breath/bow noise -- lowpass-filtered white
// noise, shaped by its own envelope-relative mix curve and crossfaded
// against the tone -- rather than being a pure tone with a breathy-sounding
// static spectrum.
//
// Why this is a different technique from just picking oscillator.mjs's
// breathyFlute partial preset: that preset (see oscillator.mjs's own header
// comment) is a *static* spectral shape only -- one fixed set of harmonic
// weights, the same at the loudest moment of a note as at its quietest. Real
// sustained wind/bowed-string instruments are not pure harmonic oscillators
// at all: a flute's tone carries audible breath turbulence, a bowed string
// carries audible bow-hair friction noise, and that noise is strongest right
// at the onset (the "chiff"/bow "catch" transient) and present at a lower,
// steadier level throughout the sustain. This module models that
// *time-varying noise component* directly -- a second, independent signal
// path mixed against the tone, whose mix ratio itself moves as the note
// progresses -- which a static partial-weight table cannot produce by
// itself no matter how it's tuned.
//
// Attack character: a real, audible swell (typically 150-400ms depending on
// the shape preset) -- much faster than the ambient pad bed's 2-8 second
// attack (dsp/envelope.mjs's ENVELOPE_SHAPES.pad) and clearly not the
// instantaneous pluck-and-decay of karplus-strong.mjs, but also not a
// percussive/chime onset (dsp/envelope.mjs's ENVELOPE_SHAPES.fastAttack,
// ~20ms) -- matching how a real bow draw or breath onset actually takes a
// perceptible, but not slow, fraction of a second to speak.
//
// Deliberately does NOT import anything from src/generative/: stays a pure
// DSP primitive. Callers that want a whole render's determinism to also
// cover this voice's noise component pass their own seeded sample function
// via the noiseSample option -- see generative/improv-duo.mjs for a
// concrete caller doing exactly that.

import { makeOscillator, advanceOscillator } from './oscillator.mjs';
import { makeEnvelope, envelopeValueAt, triggerAttack, triggerRelease } from './envelope.mjs';
import { makeOnePoleLowpass, processOnePole } from './filter.mjs';

function defaultNoiseSample() {
  return Math.random() * 2 - 1;
}

/**
 * Named starting points for makeBowBreathVoice's `shape` option. Both are
 * genuine points in the same continuous parameter space (attack/release
 * time, noise mix at attack vs. sustain, noise lowpass cutoff, envelope
 * curve) -- not a hardcoded enum callers are limited to; any of these fields
 * can be overridden directly.
 */
export const BOW_BREATH_SHAPES = Object.freeze({
  // Flute-like: brighter noise band (closer to real breath turbulence's
  // higher-frequency hiss), a slightly quicker attack.
  flute: Object.freeze({ attackSec: 0.22, releaseSec: 0.5, noiseMixAttack: 0.42, noiseMixSustain: 0.11, noiseCutoffHz: 3200, curve: 4 }),
  // Bowed-string-like: darker/lower noise band (bow-hair friction noise
  // sits lower than breath hiss), a slightly slower attack (a real bow draw
  // takes a bit longer to "catch" than a breath onset).
  bowedString: Object.freeze({ attackSec: 0.35, releaseSec: 0.7, noiseMixAttack: 0.3, noiseMixSustain: 0.08, noiseCutoffHz: 2200, curve: 3 }),
});

/**
 * Creates a bow/breath voice. Does not trigger the envelope's attack --
 * callers trigger it once they know the voice's actual onset time (same
 * division of labor as dsp/envelope.mjs's own makeEnvelope/triggerAttack
 * split, and as compose.mjs's existing voice builders).
 * @param {object} opts
 * @param {number} opts.freqHz
 * @param {number} opts.sampleRate
 * @param {Array<{ratio:number, amp:number}>} opts.partials - additive-oscillator partial series for the harmonic tone (e.g. dsp/oscillator.mjs's PARTIAL_PRESETS.breathyFlute)
 * @param {object} [opts.shape=BOW_BREATH_SHAPES.flute] - see BOW_BREATH_SHAPES
 * @param {() => number} [opts.noiseSample=defaultNoiseSample] - sample generator for the breath/bow noise, expected to return values roughly in [-1, 1]
 * @returns {object} voice state, advanced one sample at a time by advanceBowBreathVoice
 */
export function makeBowBreathVoice({ freqHz, sampleRate, partials, shape = BOW_BREATH_SHAPES.flute, noiseSample = defaultNoiseSample }) {
  const oscillator = makeOscillator({ freqHz, sampleRate, waveform: 'additive', partials });
  const envelope = makeEnvelope({ attackSec: shape.attackSec, releaseSec: shape.releaseSec, sustainLevel: 0.85, curve: shape.curve });
  const noiseFilter = makeOnePoleLowpass(shape.noiseCutoffHz, sampleRate);
  return { oscillator, envelope, noiseFilter, shape, noiseSample, freqHz, sampleRate };
}

/** @param {object} voice @param {number} tNow @returns {object} voice */
export function triggerBowBreathAttack(voice, tNow) {
  triggerAttack(voice.envelope, tNow);
  return voice;
}

/** @param {object} voice @param {number} tNow @returns {object} voice */
export function triggerBowBreathRelease(voice, tNow) {
  triggerRelease(voice.envelope, tNow);
  return voice;
}

/**
 * Advances the voice by exactly one sample: mixes the harmonic tone with
 * envelope-relative, lowpass-filtered breath/bow noise (heaviest right at
 * the attack, settling to a lower sustained level via the
 * noiseMixAttack -> noiseMixSustain crossfade below), all under the shared
 * amplitude envelope.
 * @param {object} voice - from makeBowBreathVoice, mutated in place
 * @param {number} sampleTimeSec - current transport time, for envelope evaluation
 * @param {number} [freqHzThisSample] - instantaneous frequency (enables sample-accurate detune/vibrato, same convention as dsp/oscillator.mjs's advanceOscillator)
 * @returns {number} output sample, roughly in [-1, 1]
 */
export function advanceBowBreathVoice(voice, sampleTimeSec, freqHzThisSample) {
  const raw = advanceOscillator(voice.oscillator, freqHzThisSample);
  const filteredNoise = processOnePole(voice.noiseFilter, voice.noiseSample());

  const elapsed = sampleTimeSec - voice.envelope.stageStartTime;
  const level = envelopeValueAt(voice.envelope, elapsed);

  // Noise mix crossfades from noiseMixAttack toward noiseMixSustain as the
  // attack stage progresses -- most audible right at onset (the breath
  // "chiff" / bow "catch"), settling to a steady lower-level texture under
  // the sustained tone. Once past the attack stage (sustain/release), the
  // mix stays at noiseMixSustain.
  const attackFrac =
    voice.envelope.stage === 'attack' && voice.shape.attackSec > 0
      ? Math.min(1, elapsed / voice.shape.attackSec)
      : 1;
  const noiseMix = voice.shape.noiseMixAttack + (voice.shape.noiseMixSustain - voice.shape.noiseMixAttack) * attackFrac;

  const mixed = raw * (1 - noiseMix) + filteredNoise * noiseMix;
  return mixed * level;
}
