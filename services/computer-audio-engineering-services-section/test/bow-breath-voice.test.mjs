// bow-breath-voice.test.mjs
//
// Checks bow-breath-voice.mjs's sustained noise-excited voice against its
// actual claimed character, measured: a real, non-instantaneous, non-pad-
// slow attack swell, and a genuine noise component (measurable energy at a
// frequency that is not part of the harmonic series) that is proportionally
// heavier during the attack than during the sustain -- the concrete,
// checkable form of "breath/bow noise, not a static breathy-sounding
// spectrum."

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  makeBowBreathVoice,
  triggerBowBreathAttack,
  triggerBowBreathRelease,
  advanceBowBreathVoice,
  BOW_BREATH_SHAPES,
} from '../src/dsp/bow-breath-voice.mjs';
import { PARTIAL_PRESETS } from '../src/dsp/oscillator.mjs';

const SAMPLE_RATE = 44100;

function makeSeededNoise(seed) {
  let state = seed >>> 0;
  return function nextSample() {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    return (state / 4294967296) * 2 - 1;
  };
}

function goertzelMagnitude(signal, freqHz, sampleRate) {
  const n = signal.length;
  const k = Math.round((n * freqHz) / sampleRate);
  const w = (2 * Math.PI * k) / n;
  const cosine = Math.cos(w);
  const coeff = 2 * cosine;
  let q0 = 0;
  let q1 = 0;
  let q2 = 0;
  for (let i = 0; i < n; i++) {
    q0 = coeff * q1 - q2 + signal[i];
    q2 = q1;
    q1 = q0;
  }
  const real = q1 - q2 * cosine;
  const imag = q2 * Math.sin(w);
  return Math.sqrt(real * real + imag * imag) / n;
}

function rmsOf(arr) {
  let s = 0;
  for (const v of arr) s += v * v;
  return Math.sqrt(s / arr.length);
}

function renderNote(freqHz, seconds, shape, seed = 1) {
  const voice = makeBowBreathVoice({ freqHz, sampleRate: SAMPLE_RATE, partials: PARTIAL_PRESETS.breathyFlute, shape, noiseSample: makeSeededNoise(seed) });
  triggerBowBreathAttack(voice, 0);
  const n = Math.round(SAMPLE_RATE * seconds);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = advanceBowBreathVoice(voice, i / SAMPLE_RATE);
  return out;
}

test('the attack is a real, measurable swell: level near t=0 is much quieter than level once past attackSec, and the rise is not instantaneous', () => {
  const shape = BOW_BREATH_SHAPES.flute; // attackSec = 0.22
  const signal = renderNote(440, 1.0, shape);
  const windowHalf = 220;

  function localRms(centerSec) {
    const center = Math.round(centerSec * SAMPLE_RATE);
    const start = Math.max(0, center - windowHalf);
    const end = Math.min(signal.length, center + windowHalf);
    return rmsOf(signal.subarray(start, end));
  }

  const veryEarly = localRms(0.005);
  const midAttack = localRms(shape.attackSec / 2);
  const pastAttack = localRms(shape.attackSec + 0.1);

  assert.ok(veryEarly < pastAttack * 0.5, `expected level right at onset (${veryEarly}) to be well below the settled sustain level (${pastAttack})`);
  assert.ok(midAttack > veryEarly, `expected level to have risen partway through the attack (${midAttack}) versus right at onset (${veryEarly})`);
  assert.ok(midAttack < pastAttack, `expected mid-attack level (${midAttack}) to still be below the fully-settled sustain level (${pastAttack}) -- a real ramp, not an instant jump`);
});

test('the attack is genuinely faster than the ambient pad bed\'s multi-second attack, but not instantaneous like a percussive hit', () => {
  // Both named shapes' attackSec should sit well under 1 second (distinctly
  // faster than dsp/envelope.mjs's pad preset, attackSec=5) and well above
  // ~30ms (distinctly slower than a percussive/chime onset).
  for (const shape of [BOW_BREATH_SHAPES.flute, BOW_BREATH_SHAPES.bowedString]) {
    assert.ok(shape.attackSec < 1.0, `attackSec ${shape.attackSec} should be well under the pad bed's multi-second attack`);
    assert.ok(shape.attackSec > 0.05, `attackSec ${shape.attackSec} should be well above a percussive/chime onset`);
  }
});

test('a real noise component is present: energy at an inharmonic probe frequency is measurably nonzero, unlike a pure additive tone', () => {
  const signal = renderNote(440, 0.3, BOW_BREATH_SHAPES.flute);
  const window = signal.subarray(0, 4410); // exact-bin resolution at 44.1kHz/4410 samples = 10Hz bins
  // 733Hz sits between the 1st (440) and 2nd (880) harmonics of a 440Hz tone.
  const magProbe = goertzelMagnitude(window, 730, SAMPLE_RATE);
  assert.ok(magProbe > 1e-4, `expected measurable energy at an inharmonic probe frequency (got ${magProbe}) -- evidence of a real noise component, not a pure tone`);
});

test('the noise component is proportionally heavier during the attack than during the sustain (noiseMixAttack > noiseMixSustain, checked against actual rendered audio)', () => {
  const shape = BOW_BREATH_SHAPES.flute;
  const signal = renderNote(440, 1.2, shape, 5);

  const attackWindow = signal.subarray(0, 4410);
  const sustainWindow = signal.subarray(Math.round(0.9 * SAMPLE_RATE), Math.round(0.9 * SAMPLE_RATE) + 4410);

  const attackFund = goertzelMagnitude(attackWindow, 440, SAMPLE_RATE);
  const attackProbe = goertzelMagnitude(attackWindow, 730, SAMPLE_RATE);
  const sustainFund = goertzelMagnitude(sustainWindow, 440, SAMPLE_RATE);
  const sustainProbe = goertzelMagnitude(sustainWindow, 730, SAMPLE_RATE);

  const attackRatio = attackProbe / attackFund;
  const sustainRatio = sustainProbe / sustainFund;

  assert.ok(attackRatio > sustainRatio, `expected the noise-probe/fundamental ratio during the attack (${attackRatio}) to exceed the ratio during the sustain (${sustainRatio})`);
});

test('a released voice fades to (near) silence rather than cutting off abruptly', () => {
  const voice = makeBowBreathVoice({ freqHz: 440, sampleRate: SAMPLE_RATE, partials: PARTIAL_PRESETS.breathyFlute, shape: BOW_BREATH_SHAPES.flute, noiseSample: makeSeededNoise(9) });
  triggerBowBreathAttack(voice, 0);
  const preRelease = [];
  for (let i = 0; i < Math.round(SAMPLE_RATE * 0.5); i++) preRelease.push(advanceBowBreathVoice(voice, i / SAMPLE_RATE));
  triggerBowBreathRelease(voice, 0.5);
  const postRelease = [];
  const releaseSamples = Math.round(SAMPLE_RATE * (BOW_BREATH_SHAPES.flute.releaseSec + 0.05));
  for (let i = 0; i < releaseSamples; i++) postRelease.push(advanceBowBreathVoice(voice, 0.5 + i / SAMPLE_RATE));

  const sustainedRms = rmsOf(preRelease.slice(-2000));
  const tailRms = rmsOf(postRelease.slice(-500));
  assert.ok(tailRms < sustainedRms * 0.1, `expected the released tail's RMS (${tailRms}) to have dropped well below the sustained level (${sustainedRms})`);
});

test('every produced sample is finite across a range of pitches and both named shapes', () => {
  for (const freqHz of [110, 220, 440, 880]) {
    for (const shape of [BOW_BREATH_SHAPES.flute, BOW_BREATH_SHAPES.bowedString]) {
      const signal = renderNote(freqHz, 0.2, shape);
      for (const s of signal) assert.ok(Number.isFinite(s), `freqHz=${freqHz} shape=${JSON.stringify(shape)}: non-finite sample`);
    }
  }
});
