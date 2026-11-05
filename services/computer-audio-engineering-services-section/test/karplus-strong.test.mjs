// karplus-strong.test.mjs
//
// Checks karplus-strong.mjs's plucked-string synthesis against its actual
// claimed character, measured, not assumed: exponential-shaped amplitude
// decay, a comb-filtered harmonic spectrum (energy concentrated at the
// fundamental and its integer multiples, not at arbitrary frequencies), and
// the "damping filter removes high harmonics faster than the fundamental"
// physics that gives Karplus-Strong its characteristic darkening tail.
//
// Spectral measurement uses a small local Goertzel single-frequency DFT
// (goertzelMagnitude below) rather than a full FFT -- cheap, dependency-free,
// and exactly what's needed to check magnitude at a handful of specific
// probe frequencies (the fundamental, a couple of harmonics, a couple of
// inharmonic frequencies), matching this module's own no-dependencies
// discipline.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makeKarplusString, advanceKarplusString, repluck } from '../src/dsp/karplus-strong.mjs';

const SAMPLE_RATE = 44100;

/** Small deterministic LCG, local to this test file only (dsp/ itself must not depend on the generative layer's PRNG -- see karplus-strong.mjs's header comment). */
function makeSeededExciter(seed) {
  let state = seed >>> 0;
  return function nextSample() {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    return (state / 4294967296) * 2 - 1;
  };
}

/**
 * Goertzel single-frequency DFT magnitude -- O(n) per probe frequency, exact
 * for a frequency that lands on a bin boundary of the analysis window
 * length (chosen below so the probe frequencies used in these tests do).
 */
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

function renderString(freqHz, seconds, opts = {}) {
  const str = makeKarplusString({ freqHz, sampleRate: SAMPLE_RATE, exciteSample: makeSeededExciter(opts.seed ?? 1), ...opts });
  const n = Math.round(SAMPLE_RATE * seconds);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = advanceKarplusString(str);
  return out;
}

test('a plucked string decays: RMS in later windows is much lower than in early windows (real exponential-character decay, not a sustained tone)', () => {
  const signal = renderString(220, 2.0, { decay: 0.996, dampingHz: 4500 });
  const windowSamples = Math.round(SAMPLE_RATE * 0.1);
  const windows = [];
  for (let start = 0; start + windowSamples <= signal.length; start += windowSamples) {
    windows.push(rmsOf(signal.subarray(start, start + windowSamples)));
  }
  assert.ok(windows.length >= 10, 'expected at least 10 windows over 2s');

  // Monotonic-ish decay: each window's RMS should not exceed the previous
  // window's RMS by more than a small tolerance (the noise-excited pluck is
  // not a perfectly smooth curve sample-to-sample, but the trend must be
  // strictly downward across the whole tail).
  for (let i = 1; i < windows.length; i++) {
    assert.ok(windows[i] <= windows[i - 1] * 1.05, `window ${i} RMS (${windows[i]}) rose above window ${i - 1} RMS (${windows[i - 1]}) by more than 5%`);
  }

  const earlyMean = (windows[0] + windows[1] + windows[2]) / 3;
  const lateMean = (windows[windows.length - 1] + windows[windows.length - 2] + windows[windows.length - 3]) / 3;
  assert.ok(lateMean < earlyMean * 0.2, `expected the last three 100ms windows' mean RMS (${lateMean}) to have dropped below 20% of the first three windows' mean RMS (${earlyMean})`);
});

test('a plucked string has a real comb-filtered harmonic spectrum: energy at the fundamental and its integer multiples far exceeds energy at inharmonic frequencies', () => {
  const freqHz = 220;
  const signal = renderString(freqHz, 0.5, { decay: 0.999, dampingHz: 6000 });
  // 4410-sample window at 44.1kHz gives exact-bin resolution of 10Hz, so
  // 220/440/660Hz and the inharmonic probes below all land on exact bins.
  const window = signal.subarray(0, 4410);

  const magFundamental = goertzelMagnitude(window, freqHz, SAMPLE_RATE);
  const mag2nd = goertzelMagnitude(window, freqHz * 2, SAMPLE_RATE);
  const mag3rd = goertzelMagnitude(window, freqHz * 3, SAMPLE_RATE);
  const magInharmonicA = goertzelMagnitude(window, freqHz * 1.5, SAMPLE_RATE); // 330Hz, exactly between the 1st and 2nd harmonic
  const magInharmonicB = goertzelMagnitude(window, freqHz * 0.5, SAMPLE_RATE); // 110Hz, below the fundamental, not a harmonic

  assert.ok(magFundamental > magInharmonicA * 3, `fundamental magnitude (${magFundamental}) should far exceed an inharmonic probe's (${magInharmonicA})`);
  assert.ok(mag2nd > magInharmonicA * 3, `2nd-harmonic magnitude (${mag2nd}) should far exceed an inharmonic probe's (${magInharmonicA})`);
  assert.ok(mag3rd > magInharmonicB * 3, `3rd-harmonic magnitude (${mag3rd}) should far exceed an inharmonic probe's (${magInharmonicB})`);
});

test('the damping filter removes high harmonics faster than the fundamental: the ratio of a high harmonic to the fundamental drops substantially from onset to tail (real "darkening decay" character, not a static timbre)', () => {
  const freqHz = 220;
  const signal = renderString(freqHz, 2.0, { decay: 0.996, dampingHz: 4500 });

  const earlyWindow = signal.subarray(0, 4410);
  const lateWindow = signal.subarray(signal.length - 4410, signal.length);

  const earlyFund = goertzelMagnitude(earlyWindow, freqHz, SAMPLE_RATE);
  const early3rd = goertzelMagnitude(earlyWindow, freqHz * 3, SAMPLE_RATE);
  const lateFund = goertzelMagnitude(lateWindow, freqHz, SAMPLE_RATE);
  const late3rd = goertzelMagnitude(lateWindow, freqHz * 3, SAMPLE_RATE);

  const earlyRatio = early3rd / earlyFund;
  const lateRatio = late3rd / lateFund;

  assert.ok(lateRatio < earlyRatio * 0.5, `expected the late 3rd-harmonic/fundamental ratio (${lateRatio}) to have dropped to less than half the early ratio (${earlyRatio}) -- this is the "high harmonics die faster" darkening physics`);
});

test('higher dampingHz produces a brighter (slower-darkening) string than lower dampingHz, all else equal', () => {
  const freqHz = 220;
  const bright = renderString(freqHz, 1.0, { decay: 0.997, dampingHz: 8000, seed: 7 });
  const dark = renderString(freqHz, 1.0, { decay: 0.997, dampingHz: 1500, seed: 7 });

  const lateWindowBright = bright.subarray(bright.length - 4410, bright.length);
  const lateWindowDark = dark.subarray(dark.length - 4410, dark.length);

  const brightHighHarmonic = goertzelMagnitude(lateWindowBright, freqHz * 4, SAMPLE_RATE);
  const darkHighHarmonic = goertzelMagnitude(lateWindowDark, freqHz * 4, SAMPLE_RATE);

  assert.ok(brightHighHarmonic > darkHighHarmonic, `expected the high-dampingHz ("bright") string to retain more high-harmonic (${freqHz * 4}Hz) energy late in its decay (${brightHighHarmonic}) than the low-dampingHz ("dark") string (${darkHighHarmonic})`);
});

test('makeKarplusString is deterministic given the same exciteSample function, and different exciteSample seeds produce different (but each still real/decaying) output', () => {
  const a = renderString(330, 0.2, { seed: 42 });
  const b = renderString(330, 0.2, { seed: 42 });
  assert.deepEqual(Array.from(a), Array.from(b), 'same seed should reproduce identical output');

  const c = renderString(330, 0.2, { seed: 43 });
  assert.notDeepEqual(Array.from(a), Array.from(c), 'different seeds should produce different output');
});

test('repluck re-excites an existing string voice in place, producing a fresh decay without reallocating', () => {
  // A fast decay/damping setting so the string is well decayed within a
  // short, cheap-to-render test window.
  const str = makeKarplusString({ freqHz: 220, sampleRate: SAMPLE_RATE, decay: 0.985, dampingHz: 1200, exciteSample: makeSeededExciter(1) });
  const totalPreSamples = Math.round(SAMPLE_RATE * 0.3); // 300ms
  const firstBurst = [];
  for (let i = 0; i < totalPreSamples; i++) firstBurst.push(advanceKarplusString(str));
  const firstRms = rmsOf(firstBurst.slice(-200));
  assert.ok(firstRms < 0.05, `string should have substantially decayed after ${totalPreSamples} samples, got RMS=${firstRms}`);

  repluck(str, 1, makeSeededExciter(2));
  const secondBurst = [];
  for (let i = 0; i < 200; i++) secondBurst.push(advanceKarplusString(str));
  const secondRms = rmsOf(secondBurst);
  assert.ok(secondRms > firstRms * 3, `repluck should produce a fresh, louder onset (${secondRms}) than the decayed tail just before it (${firstRms})`);
});

test('every produced sample is finite (no NaN/Infinity) across a range of pitches and decay/damping settings', () => {
  for (const freqHz of [55, 110, 220, 440, 880, 1760]) {
    for (const decay of [0.9, 0.995, 0.999]) {
      const signal = renderString(freqHz, 0.3, { decay, dampingHz: 3000 });
      for (const s of signal) assert.ok(Number.isFinite(s), `freqHz=${freqHz} decay=${decay}: non-finite sample`);
    }
  }
});
