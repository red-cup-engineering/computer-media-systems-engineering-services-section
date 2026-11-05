// dsp-additions.test.mjs
//
// Checks the DSP-layer additions made alongside arrangement.mjs: the bell
// (inharmonic) and subBass partial generators/presets, dsp/percussion.mjs's
// noise-burst voice, dsp/karplus-strong.mjs's PLUCK_PRESETS, and
// dsp/mixer.mjs's per-stem channel mixing helpers.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { generateBellPartials, PARTIAL_PRESETS } from '../src/dsp/oscillator.mjs';
import { makeNoiseBurstVoice, advanceNoiseBurstVoice, PERCUSSION_PRESETS } from '../src/dsp/percussion.mjs';
import { PLUCK_PRESETS, makeKarplusString, advanceKarplusString } from '../src/dsp/karplus-strong.mjs';
import { makeStemChannel, mixStemSample } from '../src/dsp/mixer.mjs';

test('generateBellPartials at inharmonicity=0 degenerates to an exact harmonic series (ratio(n) = n)', () => {
  const partials = generateBellPartials({ count: 6, inharmonicity: 0, rolloffExponent: 1.2 });
  for (let i = 0; i < partials.length; i++) {
    assert.ok(Math.abs(partials[i].ratio - (i + 1)) < 1e-9, `partial ${i} ratio should be exactly ${i + 1} at inharmonicity=0`);
  }
});

test('generateBellPartials stretches upper partials sharp of their harmonic position as inharmonicity increases', () => {
  const low = generateBellPartials({ count: 6, inharmonicity: 0.005 });
  const high = generateBellPartials({ count: 6, inharmonicity: 0.03 });
  // Compare the highest common partial index: higher inharmonicity should stretch it further above its integer harmonic number.
  const n = Math.min(low.length, high.length);
  assert.ok(high[n - 1].ratio > low[n - 1].ratio, 'higher inharmonicity should stretch the upper partial further');
});

test('PARTIAL_PRESETS.bell and .subBass are real, non-empty partial series', () => {
  assert.ok(Array.isArray(PARTIAL_PRESETS.bell) && PARTIAL_PRESETS.bell.length > 0);
  assert.ok(Array.isArray(PARTIAL_PRESETS.subBass) && PARTIAL_PRESETS.subBass.length > 0);
  assert.equal(PARTIAL_PRESETS.subBass[0].ratio, 0.5, 'subBass should lead with a sub-octave partial');
});

test('noise-burst percussion voice produces a finite, decaying, non-silent signal', () => {
  const sampleRate = 44100;
  const voice = makeNoiseBurstVoice({ sampleRate, ...PERCUSSION_PRESETS.tick, atSec: 0 });
  const samples = [];
  for (let i = 0; i < sampleRate * 0.3; i++) {
    samples.push(advanceNoiseBurstVoice(voice, i / sampleRate));
  }
  assert.ok(samples.every((s) => Number.isFinite(s)));
  const earlyRms = Math.sqrt(samples.slice(0, 200).reduce((s, v) => s + v * v, 0) / 200);
  const lateRms = Math.sqrt(samples.slice(-200).reduce((s, v) => s + v * v, 0) / 200);
  assert.ok(earlyRms > 0, 'expected real signal near onset');
  assert.ok(lateRms < earlyRms * 0.5, 'expected the burst to have decayed well below its onset level by the end of decaySec');
});

test('every named PERCUSSION_PRESETS entry is directly usable', () => {
  for (const [name, preset] of Object.entries(PERCUSSION_PRESETS)) {
    const voice = makeNoiseBurstVoice({ sampleRate: 44100, ...preset, atSec: 0 });
    const s = advanceNoiseBurstVoice(voice, 0);
    assert.ok(Number.isFinite(s), `preset ${name} produced a non-finite sample`);
  }
});

test('every named PLUCK_PRESETS entry produces a real decaying plucked-string signal', () => {
  for (const [name, preset] of Object.entries(PLUCK_PRESETS)) {
    const sampleRate = 44100;
    const str = makeKarplusString({ freqHz: 220, sampleRate, decay: preset.decay, dampingHz: preset.dampingHz, exciteSample: () => Math.random() * 2 - 1 });
    const samples = [];
    for (let i = 0; i < sampleRate * 0.5; i++) samples.push(advanceKarplusString(str));
    assert.ok(samples.every((s) => Number.isFinite(s)), `preset ${name} produced a non-finite sample`);
    const earlyRms = Math.sqrt(samples.slice(0, 200).reduce((s, v) => s + v * v, 0) / 200);
    const lateRms = Math.sqrt(samples.slice(-200).reduce((s, v) => s + v * v, 0) / 200);
    assert.ok(lateRms < earlyRms, `preset ${name} should decay over 0.5s`);
  }
});

test('makeStemChannel defaults and mixStemSample splits signal between dry and reverb-send buses per `space`', () => {
  const dryChannel = makeStemChannel({ level: 1, pan: 0, space: 0 });
  const wetChannel = makeStemChannel({ level: 1, pan: 0, space: 1 });
  const bus = { dryL: 0, dryR: 0, sendL: 0, sendR: 0 };

  const dryResult = mixStemSample(bus, 1, 1, 0, dryChannel);
  assert.ok(dryResult.dryL > 0 && dryResult.dryR > 0);
  assert.equal(dryResult.sendL, 0);
  assert.equal(dryResult.sendR, 0);

  const wetResult = mixStemSample(bus, 1, 1, 0, wetChannel);
  assert.equal(wetResult.dryL, 0);
  assert.equal(wetResult.dryR, 0);
  assert.ok(wetResult.sendL > 0 && wetResult.sendR > 0);
});

test('mixStemSample combines the stem channel pan bias with the voice\'s own instantaneous pan', () => {
  const channel = makeStemChannel({ level: 1, pan: 0.5, space: 0 });
  const bus = { dryL: 0, dryR: 0, sendL: 0, sendR: 0 };
  const centeredVoice = mixStemSample(bus, 1, 1, 0, channel);
  const hardRightVoice = mixStemSample(bus, 1, 1, 1, channel); // clamps to 1 (0.5+1 clamped)
  assert.ok(hardRightVoice.dryR >= centeredVoice.dryR);
});
