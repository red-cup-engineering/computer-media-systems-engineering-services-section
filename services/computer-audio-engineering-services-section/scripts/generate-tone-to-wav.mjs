#!/usr/bin/env node
// generate-tone-to-wav.mjs -- renders one steady tone (sine oscillator or
// Karplus-Strong pluck) through a click-free envelope and writes it to a
// WAV file. One transformation: params in, a written file's receipt out.

import { makeOscillator, advanceOscillator } from '../src/dsp/oscillator.mjs';
import { makeKarplusString, advanceKarplusString } from '../src/dsp/karplus-strong.mjs';
import { makeEnvelope, envelopeValueAt, triggerAttack, triggerRelease, ENVELOPE_SHAPES } from '../src/dsp/envelope.mjs';
import { writeWavFile } from './write-wav-file.mjs';

/**
 * @param {object} opts
 * @param {number} opts.freqHz
 * @param {number} [opts.durationSec=1]
 * @param {number} [opts.sampleRate=44100]
 * @param {'sine'|'pluck'} [opts.source='sine']
 * @param {string} opts.outPath
 * @returns {Promise<{filePath:string, byteLength:number}>}
 */
export async function generateToneToWav({ freqHz, durationSec = 1, sampleRate = 44100, source = 'sine', outPath }) {
  const numSamples = Math.round(durationSec * sampleRate);
  const voice = source === 'pluck'
    ? makeKarplusString({ freqHz, sampleRate, decay: 0.996, dampingHz: 4500 })
    : makeOscillator({ freqHz, sampleRate, waveform: 'sine' });
  const nextRawSample = source === 'pluck' ? () => advanceKarplusString(voice) : () => advanceOscillator(voice, freqHz);

  const shape = source === 'pluck' ? { attackSec: 0.002, releaseSec: Math.max(0.05, durationSec - 0.05), sustainLevel: 1, curve: 8 } : ENVELOPE_SHAPES.fastAttack;
  const env = makeEnvelope(shape);
  triggerAttack(env, 0);
  const releaseAtSec = Math.max(0, durationSec - shape.releaseSec);

  const out = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const tSec = i / sampleRate;
    if (env.stage !== 'release' && tSec >= releaseAtSec) triggerRelease(env, tSec);
    const level = envelopeValueAt(env, tSec - env.stageStartTime);
    out[i] = nextRawSample() * level;
  }
  return writeWavFile(outPath, { sampleRate, numChannels: 1, bitDepth: 16, bufferL: out });
}

async function main(argv) {
  const [freqHzStr, outPath, source] = argv;
  if (!freqHzStr || !outPath) throw new Error('usage: generate-tone-to-wav.mjs <freqHz> <outPath.wav> [sine|pluck]');
  const receipt = await generateToneToWav({ freqHz: Number(freqHzStr), outPath, source: source ?? 'sine' });
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`generate-tone-to-wav: ${error.message}\n`);
    process.exitCode = 1;
  });
}
