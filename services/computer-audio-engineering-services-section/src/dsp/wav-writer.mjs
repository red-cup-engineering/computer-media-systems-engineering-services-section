// wav-writer.mjs -- pure WAV encoding: sample buffers in, RIFF/WAVE bytes
// out. No I/O; disk writes are a thin effect in scripts/write-wav-file.mjs.
// Default bit depth is 24 (fits the simple 44-byte header, ~48dB more
// dynamic range than 16-bit -- matters for deep-reverb ambient material's
// quiet decay tails); 16-bit is available via bitDepth: 16.

/**
 * Converts a float sample in [-1, 1] to three little-endian bytes of
 * 24-bit signed PCM (two's complement).
 * @param {number} sample
 * @returns {[number, number, number]} [byte0 (LSB), byte1, byte2 (MSB)]
 */
export function floatSampleTo24BitBytes(sample) {
  const clamped = Math.max(-1, Math.min(1, sample));
  let intVal = Math.round(clamped * 8388607); // 2^23 - 1
  if (intVal < -8388608) intVal = -8388608; // -2^23
  if (intVal > 8388607) intVal = 8388607;
  if (intVal < 0) intVal += 0x1000000; // fold into 24-bit two's complement range
  const byte0 = intVal & 0xff;
  const byte1 = (intVal >> 8) & 0xff;
  const byte2 = (intVal >> 16) & 0xff;
  return [byte0, byte1, byte2];
}

/**
 * Converts a float sample in [-1, 1] to a 16-bit signed PCM integer.
 * @param {number} sample
 * @returns {number} integer in [-32768, 32767]
 */
export function floatSampleTo16BitInt(sample) {
  const clamped = Math.max(-1, Math.min(1, sample));
  let intVal = Math.round(clamped * 32767);
  if (intVal < -32768) intVal = -32768;
  if (intVal > 32767) intVal = 32767;
  return intVal;
}

/**
 * Builds a standard 44-byte canonical RIFF/WAVE header for PCM audio
 * (format code 1).
 * @param {object} opts
 * @param {number} opts.sampleRate
 * @param {number} opts.numChannels
 * @param {number} opts.bitDepth - 16 or 24
 * @param {number} opts.dataByteLength - length in bytes of the following data chunk
 * @returns {Buffer} 44-byte header
 */
export function buildWavHeader({ sampleRate, numChannels, bitDepth, dataByteLength }) {
  const blockAlign = numChannels * (bitDepth / 8);
  const byteRate = sampleRate * blockAlign;
  const buffer = Buffer.alloc(44);

  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataByteLength, 4);
  buffer.write('WAVE', 8, 'ascii');

  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16); // fmt chunk size for PCM
  buffer.writeUInt16LE(1, 20); // audio format 1 = integer PCM
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitDepth, 34);

  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataByteLength, 40);

  return buffer;
}

/**
 * Encodes a stereo (or mono) buffer pair as a complete WAV file's bytes.
 * Pure: takes sample buffers, returns a Buffer -- no filesystem access.
 * @param {object} opts
 * @param {number} opts.sampleRate
 * @param {number} [opts.numChannels=2] - 1 (mono, uses bufferL only) or 2 (stereo)
 * @param {number} [opts.bitDepth=24] - 16 or 24
 * @param {Float64Array|Float32Array|number[]} opts.bufferL
 * @param {Float64Array|Float32Array|number[]} [opts.bufferR] - required when numChannels is 2
 * @returns {Buffer} the complete WAV file's bytes (header + data)
 */
export function encodeWav({ sampleRate, numChannels = 2, bitDepth = 24, bufferL, bufferR }) {
  if (bitDepth !== 16 && bitDepth !== 24) {
    throw new Error(`Unsupported bitDepth: ${bitDepth}. Use 16 or 24.`);
  }
  if (numChannels === 2 && !bufferR) {
    throw new Error('numChannels is 2 but bufferR was not provided.');
  }

  const numSamplesPerChannel = bufferL.length;
  const bytesPerSample = bitDepth / 8;
  const dataByteLength = numSamplesPerChannel * numChannels * bytesPerSample;

  const header = buildWavHeader({ sampleRate, numChannels, bitDepth, dataByteLength });
  const data = Buffer.alloc(dataByteLength);

  let offset = 0;
  for (let i = 0; i < numSamplesPerChannel; i++) {
    const frame = numChannels === 1 ? [bufferL[i]] : [bufferL[i], bufferR[i]];
    for (let ch = 0; ch < frame.length; ch++) {
      const sample = frame[ch];
      if (bitDepth === 24) {
        const bytes = floatSampleTo24BitBytes(sample);
        data[offset] = bytes[0];
        data[offset + 1] = bytes[1];
        data[offset + 2] = bytes[2];
        offset += 3;
      } else {
        const intVal = floatSampleTo16BitInt(sample);
        data.writeInt16LE(intVal, offset);
        offset += 2;
      }
    }
  }

  return Buffer.concat([header, data]);
}
