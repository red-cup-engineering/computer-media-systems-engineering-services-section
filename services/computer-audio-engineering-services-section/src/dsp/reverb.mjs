// reverb.mjs
//
// Schroeder/Freeverb-style algorithmic reverb: a bank of parallel feedback
// comb filters (slightly mistuned lengths per channel for stereo
// decorrelation/width) feeding a short series of allpass filters, built
// entirely on top of delay.mjs (and filter.mjs for the per-comb damping
// lowpass). This is the single biggest lever for the "deep reverb space"
// quality bar the affective-ambient genre target needs, so it's tuned
// toward long (4-8s) decay, heavy damping, and a high wet mix rather than a
// short, bright room verb.
//
// Each comb filter has a one-pole lowpass inside its feedback path (the
// "damping" filter), so the reverb tail darkens as it decays instead of
// ringing metallically forever -- this is the key trick that separates a
// Freeverb-style algorithm from a plain comb-filter bank.

import { makeDelayLine, readDelay, writeDelay } from './delay.mjs';
import { makeOnePoleLowpass, processOnePole } from './filter.mjs';

// Comb delay tunings, in seconds, chosen with irregular spacing so the
// combs' resonant peaks don't line up and reinforce each other (which is
// what causes a metallic/ringing character). Expressed in seconds rather
// than hardcoded sample counts so they scale correctly to any sampleRate,
// unlike the classic Freeverb constants which are only valid at 44.1kHz.
const COMB_TUNINGS_SEC = [0.0297, 0.0371, 0.0411, 0.0437, 0.0459, 0.0491, 0.0513, 0.0537];

// Series allpass delay tunings, in seconds: short diffusers that smear the
// comb output into a denser texture without adding their own coloration
// (an ideal allpass has a flat magnitude response).
const ALLPASS_TUNINGS_SEC = [0.0126, 0.01, 0.0077];
const ALLPASS_G = 0.5;

// Maximum per-channel comb/allpass length offset used to decorrelate L/R
// for stereo width (about 100 samples at 44.1kHz at stereoSpread=1).
const STEREO_SPREAD_MAX_SEC = 0.0023;

function makeComb(delaySec, sampleRate, decaySec, dampingHz) {
  const delaySamples = Math.max(1, Math.round(delaySec * sampleRate));
  const line = makeDelayLine(delaySamples + 1);
  // RT60-style feedback gain: after decaySec seconds, a signal circulating
  // through a comb of length delaySec should have dropped by 60dB (a factor
  // of 10^-3). g^(decaySec/delaySec) = 10^-3  =>  g = 10^(-3*delaySec/decaySec).
  const feedback = Math.pow(10, (-3 * delaySec) / Math.max(decaySec, 0.001));
  const damper = makeOnePoleLowpass(dampingHz, sampleRate);
  return { line, delaySamples, feedback, damper };
}

function processComb(comb, input) {
  const delayed = readDelay(comb.line, comb.delaySamples);
  const damped = processOnePole(comb.damper, delayed);
  writeDelay(comb.line, input + damped * comb.feedback);
  return delayed;
}

function makeAllpass(delaySec, sampleRate) {
  const delaySamples = Math.max(1, Math.round(delaySec * sampleRate));
  const line = makeDelayLine(delaySamples + 1);
  return { line, delaySamples, g: ALLPASS_G };
}

function processAllpass(allpass, input) {
  const delayed = readDelay(allpass.line, allpass.delaySamples);
  const output = -allpass.g * input + delayed;
  writeDelay(allpass.line, input + delayed * allpass.g);
  return output;
}

/**
 * Creates a stereo Schroeder/Freeverb-style reverb.
 * @param {object} [opts]
 * @param {number} [opts.sampleRate=44100]
 * @param {number} [opts.decaySec=6] - approximate RT60 tail length in seconds
 * @param {number} [opts.dampingHz=3500] - lowpass cutoff inside each comb's feedback path; lower = darker, faster-darkening tail
 * @param {number} [opts.stereoSpread=0.5] - 0..1, how much the R channel's comb/allpass lengths are offset from L for stereo width
 * @param {number} [opts.wetMix=0.35] - 0..1, wet/dry balance used by processReverbSample
 * @returns {object} reverb state
 */
export function makeReverb({
  sampleRate = 44100,
  decaySec = 6,
  dampingHz = 3500,
  stereoSpread = 0.5,
  wetMix = 0.35,
} = {}) {
  const spreadSec = Math.max(0, Math.min(1, stereoSpread)) * STEREO_SPREAD_MAX_SEC;

  const combsL = COMB_TUNINGS_SEC.map((t) => makeComb(t, sampleRate, decaySec, dampingHz));
  const combsR = COMB_TUNINGS_SEC.map((t) => makeComb(t + spreadSec, sampleRate, decaySec, dampingHz));

  const allpassesL = ALLPASS_TUNINGS_SEC.map((t) => makeAllpass(t, sampleRate));
  const allpassesR = ALLPASS_TUNINGS_SEC.map((t) => makeAllpass(t + spreadSec, sampleRate));

  return {
    sampleRate,
    decaySec,
    dampingHz,
    stereoSpread,
    wetMix,
    combsL,
    combsR,
    allpassesL,
    allpassesR,
  };
}

/**
 * Processes one stereo sample frame through the reverb network and returns
 * the wet/dry-mixed output. Mutates the reverb's internal delay/filter
 * state.
 * @param {object} reverb - from makeReverb
 * @param {number} inputL
 * @param {number} inputR
 * @returns {{outL:number, outR:number}}
 */
export function processReverbSample(reverb, inputL, inputR) {
  const monoIn = (inputL + inputR) * 0.5;

  let wetL = 0;
  for (let i = 0; i < reverb.combsL.length; i++) {
    wetL += processComb(reverb.combsL[i], monoIn);
  }
  let wetR = 0;
  for (let i = 0; i < reverb.combsR.length; i++) {
    wetR += processComb(reverb.combsR[i], monoIn);
  }

  const combScale = 1 / reverb.combsL.length;
  wetL *= combScale;
  wetR *= combScale;

  for (let i = 0; i < reverb.allpassesL.length; i++) {
    wetL = processAllpass(reverb.allpassesL[i], wetL);
  }
  for (let i = 0; i < reverb.allpassesR.length; i++) {
    wetR = processAllpass(reverb.allpassesR[i], wetR);
  }

  const wet = reverb.wetMix;
  const dry = 1 - wet;

  return {
    outL: inputL * dry + wetL * wet,
    outR: inputR * dry + wetR * wet,
  };
}

/**
 * Named starting points for makeReverb, matching the "deep reverb space"
 * affective-ambient target as well as a couple of shorter alternatives.
 */
export const REVERB_PRESETS = {
  deepAmbient: { decaySec: 8, dampingHz: 2800, stereoSpread: 0.7, wetMix: 0.45 },
  hall: { decaySec: 4.5, dampingHz: 4500, stereoSpread: 0.5, wetMix: 0.35 },
  chamber: { decaySec: 2.5, dampingHz: 5500, stereoSpread: 0.3, wetMix: 0.25 },
};
