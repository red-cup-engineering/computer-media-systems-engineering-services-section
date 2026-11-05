// delay.mjs
//
// Circular-buffer delay line with linear-interpolated fractional-sample
// read. Used both as a feedback delay (the reverb network's comb filters,
// see reverb.mjs) and, modulated by a slow LFO, as a chorus/ensemble-width
// effect that gives pads gentle stereo movement without pitch-shifting
// artifacts (a modulated fractional delay is exactly how analog
// chorus/ensemble units work).
//
// Convention: writeDelay(line, s) writes s at the current write position
// and advances the write position by one. readDelay(line, d) with d=1
// returns the most recently written sample ("1 sample ago" relative to the
// next write); d=2 returns the sample before that, and so on. This matches
// the typical per-sample usage pattern:
//
//   const delayed = readDelayInterpolated(line, delaySamples);
//   const out = input + feedback * delayed;
//   writeDelay(line, out);

/**
 * Creates a circular delay line able to hold up to maxDelaySamples of
 * history.
 * @param {number} maxDelaySamples
 * @returns {{buffer: Float64Array, writeIndex: number, size: number}}
 */
export function makeDelayLine(maxDelaySamples) {
  const size = Math.max(1, Math.ceil(maxDelaySamples));
  return {
    buffer: new Float64Array(size),
    writeIndex: 0,
    size,
  };
}

/**
 * Writes one sample into the delay line and advances the write position.
 * @param {{buffer: Float64Array, writeIndex: number, size: number}} line
 * @param {number} sample
 * @returns {void}
 */
export function writeDelay(line, sample) {
  line.buffer[line.writeIndex] = sample;
  line.writeIndex = (line.writeIndex + 1) % line.size;
}

/**
 * Reads a sample delaySamples ago (integer, rounded), wrapping correctly
 * within the circular buffer.
 * @param {{buffer: Float64Array, writeIndex: number, size: number}} line
 * @param {number} delaySamples
 * @returns {number}
 */
export function readDelay(line, delaySamples) {
  const d = Math.round(delaySamples);
  let idx = line.writeIndex - d;
  idx = ((idx % line.size) + line.size) % line.size;
  return line.buffer[idx];
}

/**
 * Reads a sample at a fractional delay in samples, linearly interpolating
 * between the two nearest integer-delay samples. This is what makes
 * modulated delays (chorus/ensemble, or fine detuning of comb filters)
 * sound smooth rather than stepped.
 * @param {{buffer: Float64Array, writeIndex: number, size: number}} line
 * @param {number} delaySamplesFractional
 * @returns {number}
 */
export function readDelayInterpolated(line, delaySamplesFractional) {
  const d0 = Math.floor(delaySamplesFractional);
  const frac = delaySamplesFractional - d0;
  const s0 = readDelay(line, d0);
  const s1 = readDelay(line, d0 + 1);
  return s0 + (s1 - s0) * frac;
}
