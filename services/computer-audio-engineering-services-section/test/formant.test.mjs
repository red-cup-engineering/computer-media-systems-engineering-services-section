// formant.test.mjs
//
// Verifies the actual claims formant.mjs makes, by measurement (goertzelPower
// / goertzelPowerDb), not by asserting the filter math "should" work:
//   1. A resonant bandpass genuinely passes its target frequency and
//      attenuates far-off frequencies.
//   2. Q scales with target harmonic per qForHarmonic, and that actually
//      buys tighter neighbor-harmonic rejection at high harmonics.
//   3. The end-to-end overtone-sweep mechanism: running a real dense
//      harmonic source through a formant filter whose target sweeps across
//      three different harmonics over time, the measured energy at each
//      target harmonic's frequency is highest during the time segment when
//      the filter is actually aimed at it -- i.e. the "overtone melody" is
//      audible in the signal, not just plausible from the coefficients.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  makeHarmonicSourcePartials,
  harmonicToHz,
  qForHarmonic,
  formantMakeupGain,
  makeFormantFilter,
  retuneFormantFilter,
  processFormantFilter,
  goertzelPower,
  goertzelPowerDb,
} from '../src/dsp/formant.mjs';
import { additiveSample } from '../src/dsp/oscillator.mjs';

const SAMPLE_RATE = 44100;

function renderFilteredTone({ freqHz, targetHz, Q, seconds }) {
  const filter = makeFormantFilter({ centerHz: targetHz, Q, sampleRate: SAMPLE_RATE });
  const n = Math.round(seconds * SAMPLE_RATE);
  const out = new Float64Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const raw = Math.sin(2 * Math.PI * phase);
    out[i] = processFormantFilter(filter, raw);
    phase += freqHz / SAMPLE_RATE;
    phase -= Math.floor(phase);
  }
  return out;
}

test('makeHarmonicSourcePartials produces a dense, gently-rolling-off harmonic series (more partials, gentler rolloff than oscillator.mjs pad presets)', () => {
  const partials = makeHarmonicSourcePartials({ count: 20, rolloffExponent: 0.9 });
  assert.ok(partials.length >= 15, `expected most of 20 harmonics to survive the amplitude floor, got ${partials.length}`);
  assert.equal(partials[0].ratio, 1);
  // Odd and even both present (oddEvenBias=0) -- a real buzzy/glottal-like spectrum.
  assert.ok(partials.some((p) => p.ratio % 2 === 0), 'expected even harmonics to be present');
  assert.ok(partials.some((p) => p.ratio % 2 === 1), 'expected odd harmonics to be present');
});

test('harmonicToHz multiplies fundamental by the harmonic ratio', () => {
  assert.equal(harmonicToHz(100, 1), 100);
  assert.equal(harmonicToHz(100, 8), 800);
  assert.equal(harmonicToHz(73.4, 6.5), 73.4 * 6.5);
});

test('qForHarmonic grows with harmonic number and stays clamped within [minQ, maxQ]', () => {
  const qLow = qForHarmonic(2);
  const qMid = qForHarmonic(8);
  const qHigh = qForHarmonic(20);
  assert.ok(qLow < qMid && qMid < qHigh, `expected Q to increase with harmonic: ${qLow}, ${qMid}, ${qHigh}`);
  assert.ok(qForHarmonic(1000) <= 32, 'Q should be clamped to maxQ');
  assert.ok(qForHarmonic(0.01) >= 4, 'Q should be clamped to minQ');
});

test('a resonant bandpass measurably passes its target frequency and attenuates a far-off frequency', () => {
  const targetHz = 500;
  const nearOut = renderFilteredTone({ freqHz: targetHz, targetHz, Q: 10, seconds: 0.5 });
  const farOut = renderFilteredTone({ freqHz: targetHz * 3, targetHz, Q: 10, seconds: 0.5 });

  // Measure each output's own energy at the filter's target frequency,
  // skipping the filter's brief settling transient at the start.
  const analysisWindow = (buf) => buf.subarray(Math.round(0.05 * SAMPLE_RATE));
  const nearPowerDb = goertzelPowerDb(analysisWindow(nearOut), targetHz, SAMPLE_RATE);
  const farPowerDb = goertzelPowerDb(analysisWindow(farOut), targetHz, SAMPLE_RATE);

  assert.ok(nearPowerDb - farPowerDb > 20, `expected on-target tone to measure at least 20dB above an off-target (3x) tone at the same target frequency; got near=${nearPowerDb.toFixed(2)}dB far=${farPowerDb.toFixed(2)}dB`);
});

test('higher Q rejects a moderately-offset frequency more than lower Q does', () => {
  const targetHz = 800;
  const offsetHz = targetHz * 1.15; // a near neighbor, not a wildly different frequency

  const lowQOut = renderFilteredTone({ freqHz: offsetHz, targetHz, Q: 4, seconds: 0.5 });
  const highQOut = renderFilteredTone({ freqHz: offsetHz, targetHz, Q: 20, seconds: 0.5 });

  const analysisWindow = (buf) => buf.subarray(Math.round(0.05 * SAMPLE_RATE));
  // Measure how much of the *input* tone's own energy survives at offsetHz
  // (the tone's actual frequency) through each filter -- higher Q should
  // pass less of an off-target tone through.
  const lowQPassed = goertzelPower(analysisWindow(lowQOut), offsetHz, SAMPLE_RATE);
  const highQPassed = goertzelPower(analysisWindow(highQOut), offsetHz, SAMPLE_RATE);

  assert.ok(highQPassed < lowQPassed, `expected higher Q to pass less of an off-target neighbor tone through; lowQ passed=${lowQPassed.toExponential(3)} highQ passed=${highQPassed.toExponential(3)}`);
});

test('end-to-end overtone sweep: a formant filter swept across three target harmonics of a real harmonic-rich source measurably emphasizes each target harmonic during its own time segment', () => {
  const fundamentalHz = 110;
  const partials = makeHarmonicSourcePartials({ count: 20, rolloffExponent: 0.9 });
  const targetHarmonics = [4, 8, 13];
  const segmentSeconds = 0.4;
  const analysisWindowStartFrac = 0.5; // measure the back half of each segment, after the filter has settled onto its new target

  const filter = makeFormantFilter({
    centerHz: harmonicToHz(fundamentalHz, targetHarmonics[0]),
    Q: qForHarmonic(targetHarmonics[0]),
    sampleRate: SAMPLE_RATE,
  });

  let phase = 0;
  /** @type {Float64Array[]} */
  const segments = targetHarmonics.map(() => new Float64Array(Math.round(segmentSeconds * SAMPLE_RATE)));

  for (let seg = 0; seg < targetHarmonics.length; seg++) {
    const targetHz = harmonicToHz(fundamentalHz, targetHarmonics[seg]);
    retuneFormantFilter(filter, { centerHz: targetHz, Q: qForHarmonic(targetHarmonics[seg]), sampleRate: SAMPLE_RATE });
    const buf = segments[seg];
    for (let i = 0; i < buf.length; i++) {
      const raw = additiveSample(phase, partials);
      buf[i] = processFormantFilter(filter, raw);
      phase += fundamentalHz / SAMPLE_RATE;
      phase -= Math.floor(phase);
    }
  }

  // For each target harmonic, measure its energy in every segment's
  // settled analysis window, and assert the segment where that harmonic
  // was actually the sweep target produced the most energy at that
  // harmonic's frequency -- the direct, measured evidence that the
  // "overtone melody" the sweep schedule specifies is audible in the
  // rendered signal, not merely plausible from the filter coefficients.
  for (let targetIdx = 0; targetIdx < targetHarmonics.length; targetIdx++) {
    const targetHz = harmonicToHz(fundamentalHz, targetHarmonics[targetIdx]);
    const powersDb = segments.map((buf) => {
      const analysisStart = Math.round(buf.length * analysisWindowStartFrac);
      return goertzelPowerDb(buf.subarray(analysisStart), targetHz, SAMPLE_RATE);
    });
    const ownSegmentDb = powersDb[targetIdx];
    for (let otherIdx = 0; otherIdx < targetHarmonics.length; otherIdx++) {
      if (otherIdx === targetIdx) continue;
      assert.ok(
        ownSegmentDb > powersDb[otherIdx],
        `harmonic ${targetHarmonics[targetIdx]} (${targetHz.toFixed(1)}Hz) should measure loudest during its own sweep segment (${ownSegmentDb.toFixed(2)}dB) vs. segment targeting harmonic ${targetHarmonics[otherIdx]} (${powersDb[otherIdx].toFixed(2)}dB)`
      );
    }
  }
});

test('formantMakeupGain measurably corrects the loudness dip a formant filter would otherwise show at higher (lower-amplitude) target harmonics', () => {
  const fundamentalHz = 110;
  const partials = makeHarmonicSourcePartials({ count: 20, rolloffExponent: 0.9 });
  const seconds = 0.3;

  function settledPeak(targetHarmonic, applyMakeup) {
    const filter = makeFormantFilter({ centerHz: harmonicToHz(fundamentalHz, targetHarmonic), Q: qForHarmonic(targetHarmonic), sampleRate: SAMPLE_RATE });
    const gain = applyMakeup ? formantMakeupGain(partials, targetHarmonic) : 1;
    const n = Math.round(seconds * SAMPLE_RATE);
    let phase = 0;
    let peak = 0;
    for (let i = 0; i < n; i++) {
      const raw = additiveSample(phase, partials);
      const out = processFormantFilter(filter, raw) * gain;
      if (i > n * 0.5) peak = Math.max(peak, Math.abs(out));
      phase += fundamentalHz / SAMPLE_RATE;
      phase -= Math.floor(phase);
    }
    return peak;
  }

  const lowHarmonicRaw = settledPeak(3, false);
  const highHarmonicRaw = settledPeak(16, false);
  // Without correction, a much higher harmonic should measure noticeably
  // quieter than a low one (the effect this function exists to correct).
  assert.ok(highHarmonicRaw < lowHarmonicRaw * 0.6, `expected uncorrected high-harmonic output to be noticeably quieter than low-harmonic; low=${lowHarmonicRaw.toFixed(4)} high=${highHarmonicRaw.toFixed(4)}`);

  const lowHarmonicCorrected = settledPeak(3, true);
  const highHarmonicCorrected = settledPeak(16, true);
  const ratio = highHarmonicCorrected / lowHarmonicCorrected;
  assert.ok(ratio > 0.5 && ratio < 2, `expected formantMakeupGain to bring high- and low-harmonic peaks to a comparable loudness (ratio within [0.5, 2]); got low=${lowHarmonicCorrected.toFixed(4)} high=${highHarmonicCorrected.toFixed(4)} ratio=${ratio.toFixed(3)}`);
});

test('formantMakeupGain stays within [minGain, maxGain] even for an out-of-range or missing target ratio', () => {
  const partials = makeHarmonicSourcePartials({ count: 10, rolloffExponent: 0.9 });
  const g = formantMakeupGain(partials, 999, { minGain: 1, maxGain: 14 });
  assert.ok(g >= 1 && g <= 14, `expected clamped gain, got ${g}`);
  const g2 = formantMakeupGain([], 5);
  assert.equal(g2, 1, 'expected a safe default (1) for an empty partials list');
});
