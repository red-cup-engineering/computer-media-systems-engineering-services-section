// cli.test.mjs -- exercises the audio-engine CLI's three commands end to
// end: generate a real tone, then parse and interpret the file it wrote.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runAudioEngine } from '../src/cli.mjs';

const scratchPath = `/tmp/audio-engine-cli-test-${process.pid}.wav`;

test('generate writes a WAV file with the expected shape', async () => {
  const receipt = await runAudioEngine(['generate', '440', scratchPath, 'sine']);
  assert.equal(receipt.path, scratchPath);
  assert.ok(receipt.bytes > 44);
});

test('parse reports the generated file\'s header facts', async () => {
  const info = await runAudioEngine(['parse', scratchPath]);
  assert.equal(info.sampleRate, 44100);
  assert.equal(info.numChannels, 1);
  assert.equal(info.bitDepth, 16);
  assert.ok(Math.abs(info.durationSec - 1) < 0.01);
});

test('interpret measures the generated tone\'s pitch close to 440Hz', async () => {
  const measured = await runAudioEngine(['interpret', scratchPath]);
  assert.ok(Math.abs(measured.estimatedHz - 440) < 5, `expected ~440Hz, got ${measured.estimatedHz}`);
});

test('an unknown command rejects with usage', async () => {
  await assert.rejects(() => runAudioEngine(['bogus']), /unknown command/);
});
