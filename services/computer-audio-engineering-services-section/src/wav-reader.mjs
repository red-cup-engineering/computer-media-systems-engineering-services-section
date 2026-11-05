// wav-reader.mjs -- pure WAV decoding: RIFF/WAVE bytes in, per-channel
// sample buffers out. No I/O; disk reads are a thin effect in
// scripts/read-wav-file.mjs. Walks chunks (skipping any but 'fmt '/'data',
// so a LIST/fact/etc. chunk from another encoder doesn't break parsing) and
// decodes 16- or 24-bit signed integer PCM into Float64Arrays in [-1, 1],
// the range every DSP/analysis function here expects.

/**
 * @typedef {object} WavAudio
 * @property {number} sampleRate
 * @property {number} numChannels
 * @property {number} bitDepth
 * @property {Float64Array} bufferL
 * @property {Float64Array} [bufferR] - present when numChannels is 2
 */

/**
 * Decodes a WAV file's bytes into per-channel sample buffers.
 * @param {Buffer} buffer
 * @returns {WavAudio}
 */
export function parseWavBuffer(buffer) {
  if (buffer.length < 12 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('parseWavBuffer: not a RIFF/WAVE file');
  }

  let fmt = null;
  let dataChunk = null;
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    if (chunkId === 'fmt ') {
      fmt = {
        audioFormat: buffer.readUInt16LE(chunkStart),
        numChannels: buffer.readUInt16LE(chunkStart + 2),
        sampleRate: buffer.readUInt32LE(chunkStart + 4),
        bitsPerSample: buffer.readUInt16LE(chunkStart + 14),
      };
    } else if (chunkId === 'data') {
      dataChunk = buffer.subarray(chunkStart, chunkStart + chunkSize);
    }
    offset = chunkStart + chunkSize + (chunkSize % 2); // chunks are word-aligned
  }
  if (!fmt) throw new Error('parseWavBuffer: no fmt chunk found');
  if (!dataChunk) throw new Error('parseWavBuffer: no data chunk found');
  if (fmt.audioFormat !== 1) throw new Error(`parseWavBuffer: unsupported audioFormat ${fmt.audioFormat} (only PCM=1 is supported)`);
  if (fmt.bitsPerSample !== 16 && fmt.bitsPerSample !== 24) {
    throw new Error(`parseWavBuffer: unsupported bitsPerSample ${fmt.bitsPerSample} (only 16 or 24)`);
  }

  const { numChannels, sampleRate, bitsPerSample } = fmt;
  const bytesPerSample = bitsPerSample / 8;
  const numFrames = Math.floor(dataChunk.length / (bytesPerSample * numChannels));
  const bufferL = new Float64Array(numFrames);
  const bufferR = numChannels === 2 ? new Float64Array(numFrames) : undefined;

  const readSample = bitsPerSample === 16
    ? (pos) => dataChunk.readInt16LE(pos) / 32768
    : (pos) => {
        let intVal = dataChunk[pos] | (dataChunk[pos + 1] << 8) | (dataChunk[pos + 2] << 16);
        if (intVal & 0x800000) intVal -= 0x1000000;
        return intVal / 8388608;
      };

  let pos = 0;
  for (let i = 0; i < numFrames; i++) {
    bufferL[i] = readSample(pos);
    pos += bytesPerSample;
    if (numChannels === 2) {
      bufferR[i] = readSample(pos);
      pos += bytesPerSample;
    }
  }

  return { sampleRate, numChannels, bitDepth: bitsPerSample, bufferL, ...(bufferR ? { bufferR } : {}) };
}
