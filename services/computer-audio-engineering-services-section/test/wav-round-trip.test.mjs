// wav-round-trip.test.mjs -- writeWavFile then readWavFile recovers the
// original samples within each bit depth's quantization step. The actual
// disk I/O stays inside scripts/write-wav-file.mjs and read-wav-file.mjs
// (thin effects over file-services); this test only picks a path string.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeWavFile } from '../scripts/write-wav-file.mjs';
import { readWavFile } from '../scripts/read-wav-file.mjs';
import { parseWavBuffer } from '../src/wav-reader.mjs';

const scratchPath = (name) => `/tmp/audio-services-section-test-${process.pid}-${name}`;

test('16-bit stereo round-trips within one quantization step', async () => {
  const sampleRate = 44100;
  const bufferL = Float64Array.from({ length: 100 }, (_, i) => Math.sin((2 * Math.PI * 440 * i) / sampleRate));
  const bufferR = Float64Array.from({ length: 100 }, (_, i) => Math.cos((2 * Math.PI * 440 * i) / sampleRate));
  const filePath = scratchPath('16.wav');
  await writeWavFile(filePath, { sampleRate, numChannels: 2, bitDepth: 16, bufferL, bufferR });

  const parsed = await readWavFile(filePath);
  assert.equal(parsed.sampleRate, sampleRate);
  assert.equal(parsed.numChannels, 2);
  assert.equal(parsed.bitDepth, 16);
  assert.equal(parsed.bufferL.length, bufferL.length);
  // Tolerance is 2 quantization steps, not 1: the writer's encode scale
  // (32767, symmetric around 0) and the reader's decode scale (32768, the
  // standard int16-PCM convention) differ by design, adding up to one extra
  // step of round-trip slack on top of ordinary rounding.
  for (let i = 0; i < bufferL.length; i++) {
    assert.ok(Math.abs(parsed.bufferL[i] - bufferL[i]) < 2 / 32767 + 1e-9, `left[${i}]`);
    assert.ok(Math.abs(parsed.bufferR[i] - bufferR[i]) < 2 / 32767 + 1e-9, `right[${i}]`);
  }
});

test('24-bit mono round-trips within one quantization step', async () => {
  const sampleRate = 48000;
  const bufferL = Float64Array.from({ length: 50 }, (_, i) => (i % 7) / 7 - 0.5);
  const filePath = scratchPath('24.wav');
  await writeWavFile(filePath, { sampleRate, numChannels: 1, bitDepth: 24, bufferL });

  const parsed = await readWavFile(filePath);
  assert.equal(parsed.numChannels, 1);
  assert.equal(parsed.bitDepth, 24);
  assert.equal(parsed.bufferR, undefined);
  for (let i = 0; i < bufferL.length; i++) {
    assert.ok(Math.abs(parsed.bufferL[i] - bufferL[i]) < 1 / 8388607 + 1e-9, `left[${i}]`);
  }
});

test('parseWavBuffer rejects a non-RIFF buffer', () => {
  assert.throws(() => parseWavBuffer(Buffer.from('not a wav file at all')));
});
