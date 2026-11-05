// read-wav-file.mjs -- the one effect of reading a WAV from disk.

import { parseWavBuffer } from '../src/wav-reader.mjs';
import { readFileBytes } from '@red-cup-engineering/computer-file-engineering-services-section/read-file';

/**
 * @param {string} filePath
 * @returns {Promise<import('../src/wav-reader.mjs').WavAudio>}
 */
export async function readWavFile(filePath) {
  return parseWavBuffer(await readFileBytes(filePath));
}
