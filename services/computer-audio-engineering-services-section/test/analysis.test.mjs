// analysis.test.mjs -- estimatePitchHz against known-frequency sine waves,
// including a regression check for the octave (2x/0.5x) error a pure/near-
// pure periodic signal invites from naive single-peak autocorrelation.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimatePitchHz, zeroCrossingRate } from '../src/analysis.mjs';

const SR = 44100;

function sineBuffer(freqHz, durationSec) {
  const n = Math.round(durationSec * SR);
  const buf = new Float64Array(n);
  for (let i = 0; i < n; i++) buf[i] = Math.sin((2 * Math.PI * freqHz * i) / SR);
  return buf;
}

test('estimatePitchHz tracks a range of frequencies without octave error', () => {
  for (const freqHz of [110, 220, 261.63, 440, 523.25, 880]) {
    const buf = sineBuffer(freqHz, 0.3).subarray(Math.floor(0.05 * SR), Math.floor(0.2 * SR));
    const measured = estimatePitchHz(buf, SR, { minHz: 40, maxHz: 2000 });
    const errFrac = Math.abs(measured - freqHz) / freqHz;
    assert.ok(errFrac < 0.02, `freqHz=${freqHz}: measured ${measured}, error fraction ${errFrac}`);
  }
});

test('estimatePitchHz on a silent buffer returns 0, not a spurious lag', () => {
  const buf = new Float64Array(4410);
  assert.equal(estimatePitchHz(buf, SR), 0);
});

test('zeroCrossingRate/2 roughly agrees with estimatePitchHz on a clean sine', () => {
  const buf = sineBuffer(330, 0.2).subarray(Math.floor(0.05 * SR), Math.floor(0.15 * SR));
  const measured = estimatePitchHz(buf, SR, { minHz: 40, maxHz: 2000 });
  const zcr = zeroCrossingRate(buf, SR) / 2;
  assert.ok(Math.abs(zcr - measured) < 5, `zcr=${zcr} vs estimatePitchHz=${measured}`);
});
