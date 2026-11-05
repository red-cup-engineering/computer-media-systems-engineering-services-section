#!/usr/bin/env node
// parse-wav-info.mjs -- reads one WAV file and prints its header/summary
// facts as JSON. One transformation: file path in, description out.

import { readWavFile } from './read-wav-file.mjs';

/**
 * @param {string} filePath
 * @returns {Promise<{sampleRate:number, numChannels:number, bitDepth:number, numFrames:number, durationSec:number}>}
 */
export async function parseWavInfo(filePath) {
  const { sampleRate, numChannels, bitDepth, bufferL } = await readWavFile(filePath);
  return { sampleRate, numChannels, bitDepth, numFrames: bufferL.length, durationSec: bufferL.length / sampleRate };
}

async function main(argv) {
  const [filePath] = argv;
  if (!filePath) throw new Error('usage: parse-wav-info.mjs <path-to.wav>');
  process.stdout.write(`${JSON.stringify(await parseWavInfo(filePath), null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`parse-wav-info: ${error.message}\n`);
    process.exitCode = 1;
  });
}
