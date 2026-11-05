// write-wav-file.mjs -- the one effect of writing an encoded WAV to disk.

import { encodeWav } from '../src/dsp/wav-writer.mjs';
import { writeFileBytes } from '@red-cup-engineering/computer-file-engineering-services-section/write-file';

/**
 * @param {string} filePath
 * @param {Parameters<typeof encodeWav>[0]} wavOpts
 * @returns {Promise<{path:string, bytes:number}>}
 */
export async function writeWavFile(filePath, wavOpts) {
  return writeFileBytes(filePath, encodeWav(wavOpts));
}
