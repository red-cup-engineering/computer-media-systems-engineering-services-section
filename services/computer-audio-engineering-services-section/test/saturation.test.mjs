// saturation.test.mjs
//
// Checks saturate()'s actual behavior: it stays bounded, a silent input
// stays silent, higher drive pushes output amplitude up toward the
// tanh ceiling (measurably, via RMS, not just "should" from the formula),
// asymmetryBias breaks odd-symmetry (the mechanism that adds even
// harmonics) while bias=0 preserves it exactly, and mix blends linearly
// between dry and fully-wet.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { saturate, makeupGainForDrive } from '../src/dsp/saturation.mjs';

function rms(values) {
  const sumSquares = values.reduce((s, v) => s + v * v, 0);
  return Math.sqrt(sumSquares / values.length);
}

test('saturate(0) is 0 regardless of drive (no DC offset introduced by symmetric clipping)', () => {
  for (const drive of [0.5, 1, 2, 5]) {
    assert.equal(saturate(0, { drive }), 0);
  }
});

test('saturate output stays within (-1, 1) for large inputs and high drive', () => {
  for (const drive of [1, 3, 8]) {
    for (const sample of [-5, -1, 1, 5, 100]) {
      const out = saturate(sample, { drive });
      assert.ok(out > -1 && out < 1, `saturate(${sample}, drive=${drive}) = ${out}, expected within (-1, 1)`);
    }
  }
});

test('with makeup gain, driving a full-scale (+-1) sample harder keeps output amplitude close to full scale rather than shrinking toward 0', () => {
  const lowDrive = Math.abs(saturate(1, { drive: 1, makeup: true }));
  const highDrive = Math.abs(saturate(1, { drive: 6, makeup: true }));
  assert.ok(highDrive > 0.9, `expected makeup-compensated high-drive output near full scale, got ${highDrive}`);
  assert.ok(lowDrive > 0.5, `expected makeup-compensated low-drive output reasonably close to full scale, got ${lowDrive}`);
});

test('without makeup gain, higher drive measurably compresses a sine tone toward a lower RMS-to-peak ratio (audible "squashing")', () => {
  const n = 2000;
  const tone = Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * i) / 50));
  const mild = tone.map((s) => saturate(s, { drive: 1, makeup: false }));
  const hard = tone.map((s) => saturate(s, { drive: 8, makeup: false }));
  // Harder drive pushes more of the waveform toward +-1 (square-wave-like),
  // which raises RMS relative to the mild version despite peak being capped
  // the same for both (just under 1).
  assert.ok(rms(hard) > rms(mild), `expected harder-driven tone to have higher RMS (more time spent near the clipped ceiling): mild rms=${rms(mild).toFixed(4)} hard rms=${rms(hard).toFixed(4)}`);
});

test('asymmetryBias=0 preserves odd symmetry exactly: saturate(-x) === -saturate(x)', () => {
  for (const drive of [1, 2, 4]) {
    for (const sample of [0.1, 0.5, 1, 2]) {
      const pos = saturate(sample, { drive, asymmetryBias: 0 });
      const neg = saturate(-sample, { drive, asymmetryBias: 0 });
      assert.ok(Math.abs(pos + neg) < 1e-12, `expected saturate(-x) = -saturate(x) at bias=0; got saturate(${sample})=${pos} saturate(${-sample})=${neg}`);
    }
  }
});

test('a nonzero asymmetryBias breaks odd symmetry (adds the even-harmonic-generating asymmetric clipping the header comment describes)', () => {
  const drive = 2;
  const bias = 0.3;
  const pos = saturate(0.6, { drive, asymmetryBias: bias });
  const neg = saturate(-0.6, { drive, asymmetryBias: bias });
  assert.ok(Math.abs(pos + neg) > 1e-6, `expected asymmetryBias to break exact odd symmetry; got saturate(0.6)=${pos} saturate(-0.6)=${neg}`);
});

test('a nonzero asymmetryBias still maps 0 to 0 (dcRef re-centering removes the DC offset the bias would otherwise introduce)', () => {
  for (const bias of [-0.4, 0.2, 0.5]) {
    const out = saturate(0, { drive: 2, asymmetryBias: bias });
    assert.ok(Math.abs(out) < 1e-12, `expected saturate(0, bias=${bias}) to stay at 0 (re-centered), got ${out}`);
  }
});

test('mix blends linearly between dry (mix=0) and fully saturated (mix=1)', () => {
  const sample = 0.7;
  const opts = { drive: 3, asymmetryBias: 0, makeup: false };
  const dry = saturate(sample, { ...opts, mix: 0 });
  const wet = saturate(sample, { ...opts, mix: 1 });
  const half = saturate(sample, { ...opts, mix: 0.5 });
  assert.equal(dry, sample);
  assert.ok(Math.abs(half - (dry + wet) / 2) < 1e-9, `expected mix=0.5 to be the midpoint of dry/wet; dry=${dry} wet=${wet} half=${half}`);
});

test('makeupGainForDrive decreases toward 1 as drive increases (high drive already clips peaks near unity on its own, so needs little makeup; low drive is closer to a plain attenuator and needs much more)', () => {
  const gTiny = makeupGainForDrive(0.05);
  const g1 = makeupGainForDrive(1);
  const g4 = makeupGainForDrive(4);
  assert.ok(gTiny > g1 && g1 > g4, `expected makeup gain to fall as drive rises: drive=0.05 -> ${gTiny}, drive=1 -> ${g1}, drive=4 -> ${g4}`);
  assert.ok(g4 - 1 < 0.01, `expected makeup gain to have settled close to 1 by drive=4, got ${g4}`);
});
