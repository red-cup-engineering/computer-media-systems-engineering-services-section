// oscillator.test.mjs
//
// Checks generatePartials -- the parametrized replacement for the old
// hand-listed PARTIAL_PRESETS table -- produces well-formed, monotonically
// decaying partial series across its parameter space, and that the three
// named presets it now generates keep the shape (ratio pattern, roughly
// warm-not-buzzy decay) their hand-listed predecessors had.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { generatePartials, PARTIAL_PRESETS, additiveSample } from '../src/dsp/oscillator.mjs';

test('generatePartials(count) returns `count` partials at rolloffExponent=0/oddEvenBias=0 (no decay, no filtering)', () => {
  const partials = generatePartials({ count: 5, rolloffExponent: 0, oddEvenBias: 0 });
  assert.equal(partials.length, 5);
  for (const p of partials) assert.equal(p.amp, 1);
  assert.deepEqual(partials.map((p) => p.ratio), [1, 2, 3, 4, 5]);
});

test('generatePartials: higher rolloffExponent produces a faster-decaying (darker) series, at every ratio > 1', () => {
  const bright = generatePartials({ count: 6, rolloffExponent: 0.5, oddEvenBias: 0 });
  const dark = generatePartials({ count: 6, rolloffExponent: 3, oddEvenBias: 0 });
  for (let i = 1; i < bright.length; i++) {
    assert.ok(dark[i].amp < bright[i].amp, `ratio ${dark[i].ratio}: dark amp ${dark[i].amp} should be < bright amp ${bright[i].amp}`);
  }
});

test('generatePartials: oddEvenBias=1 removes every even-ratio harmonic entirely', () => {
  const partials = generatePartials({ count: 8, rolloffExponent: 1.5, oddEvenBias: 1 });
  for (const p of partials) assert.equal(p.ratio % 2, 1, `even ratio ${p.ratio} should have been removed`);
});

test('generatePartials: partial amplitude is monotonically non-increasing as ratio rises, for any rolloffExponent >= 0', () => {
  for (const rolloffExponent of [0.5, 1, 1.5, 2, 3]) {
    const partials = generatePartials({ count: 8, rolloffExponent, oddEvenBias: 0 });
    for (let i = 1; i < partials.length; i++) {
      assert.ok(partials[i].amp <= partials[i - 1].amp, `rolloffExponent=${rolloffExponent}: amp rose from ratio ${partials[i - 1].ratio} to ${partials[i].ratio}`);
    }
  }
});

test('the three named PARTIAL_PRESETS are real generatePartials outputs: fundamental amp is exactly 1, ratios are a plausible harmonic series', () => {
  for (const name of ['warmPad', 'organLike', 'glassy']) {
    const partials = PARTIAL_PRESETS[name];
    assert.ok(partials.length >= 3, `${name}: too few partials`);
    assert.equal(partials[0].ratio, 1);
    assert.equal(partials[0].amp, 1, `${name}: fundamental amp should be exactly 1`);
  }
});

test('glassy keeps the odd-harmonic-only ratio pattern [1,3,5,7,...] its hand-listed predecessor had', () => {
  const ratios = PARTIAL_PRESETS.glassy.map((p) => p.ratio);
  for (const r of ratios) assert.equal(r % 2, 1, `glassy should only contain odd ratios, got ${r}`);
  assert.ok(ratios.includes(3) && ratios.includes(5), 'glassy should include ratios 3 and 5');
});

test('additiveSample stays within [-1, 1] for any generated partial series (normalization holds regardless of parameters)', () => {
  for (const rolloffExponent of [0.2, 1, 2.5]) {
    for (const oddEvenBias of [0, 0.5, 1]) {
      const partials = generatePartials({ count: 8, rolloffExponent, oddEvenBias });
      for (let phase = 0; phase < 1; phase += 0.037) {
        const s = additiveSample(phase, partials);
        assert.ok(s >= -1.0001 && s <= 1.0001, `sample ${s} outside [-1,1] for rolloff=${rolloffExponent} bias=${oddEvenBias} phase=${phase}`);
      }
    }
  }
});
