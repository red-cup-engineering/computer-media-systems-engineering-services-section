#!/usr/bin/env node
// interpret-wav-pitch.mjs -- reads one WAV file and measures its left
// channel's fundamental pitch and envelope shape. One transformation: file
// path in, a measurement description out.

import { readWavFile } from './read-wav-file.mjs';
import { estimatePitchHz, zeroCrossingRate, windowedRms, isUnimodal } from '../src/analysis.mjs';

/**
 * @param {string} filePath
 * @returns {Promise<{estimatedHz:number, zeroCrossingHz:number, unimodalEnvelope:boolean}>}
 */
export async function interpretWavPitch(filePath) {
  const { sampleRate, bufferL } = await readWavFile(filePath);
  const estimatedHz = estimatePitchHz(bufferL, sampleRate);
  const zeroCrossingHz = zeroCrossingRate(bufferL, sampleRate) / 2;
  const unimodalEnvelope = isUnimodal(windowedRms(bufferL, sampleRate));
  return { estimatedHz, zeroCrossingHz, unimodalEnvelope };
}

async function main(argv) {
  const [filePath] = argv;
  if (!filePath) throw new Error('usage: interpret-wav-pitch.mjs <path-to.wav>');
  process.stdout.write(`${JSON.stringify(await interpretWavPitch(filePath), null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`interpret-wav-pitch: ${error.message}\n`);
    process.exitCode = 1;
  });
}
