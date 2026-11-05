// analysis.mjs -- read-only measurement helpers over rendered sample
// buffers (pitch, envelope shape), moved here from resonator so any DSP
// consumer can assert real acoustic properties of a render instead of
// trusting the graph did the right thing. Deliberately FFT-free: an
// autocorrelation pitch estimate and a windowed-RMS envelope trace are both
// simple enough to read start-to-finish for a single-fundamental signal.
// Every function here is a pure function of the buffer it's given.

/**
 * Estimates the dominant fundamental frequency of a mono buffer via
 * normalized autocorrelation, picking the smallest-lag local-maximum
 * candidate within `octaveTolerance` of the strongest one (a pure/near-pure
 * periodic signal correlates just as strongly at every integer multiple of
 * its true period, so picking the single highest-scoring lag with no other
 * check is an even-money bet between the true fundamental and its
 * subharmonics -- octave-down errors, verified against a bare sine/additive
 * signal before this fix landed). Parabolic interpolation around the chosen
 * peak then recovers sub-sample lag precision.
 * @param {Float32Array|Float64Array} buffer - mono samples
 * @param {number} sampleRate
 * @param {object} [opts]
 * @param {number} [opts.minHz=40] - lowest fundamental to search for
 * @param {number} [opts.maxHz=2000] - highest fundamental to search for
 * @param {number} [opts.octaveTolerance=0.02] - a smaller-lag local peak within this fraction of the global peak's score wins, to prefer the true fundamental over a subharmonic
 * @returns {number} estimated fundamental frequency in Hz, or 0 if the buffer is too short/silent to estimate
 */
export function estimatePitchHz(buffer, sampleRate, { minHz = 40, maxHz = 2000, octaveTolerance = 0.02 } = {}) {
  const minLag = Math.floor(sampleRate / maxHz);
  const maxLag = Math.min(Math.floor(sampleRate / minHz), buffer.length - 1);
  if (maxLag <= minLag + 1 || buffer.length < 2) return 0;

  const scores = new Float64Array(maxLag - minLag + 1);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    const n = buffer.length - lag;
    for (let i = 0; i < n; i++) sum += buffer[i] * buffer[i + lag];
    scores[lag - minLag] = sum / n;
  }

  const peaks = [];
  for (let idx = 1; idx < scores.length - 1; idx++) {
    if (scores[idx] >= scores[idx - 1] && scores[idx] >= scores[idx + 1] && scores[idx] > 0) peaks.push(idx);
  }
  if (peaks.length === 0) {
    let bestIdx = 0;
    for (let idx = 1; idx < scores.length; idx++) if (scores[idx] > scores[bestIdx]) bestIdx = idx;
    return scores[bestIdx] > 0 ? sampleRate / (bestIdx + minLag) : 0;
  }

  const globalBestPeakScore = Math.max(...peaks.map((idx) => scores[idx]));
  const threshold = globalBestPeakScore * (1 - octaveTolerance);
  const chosenIdx = peaks.find((idx) => scores[idx] >= threshold) ?? peaks[0];

  let refinedLag = chosenIdx + minLag;
  if (chosenIdx > 0 && chosenIdx < scores.length - 1) {
    const yL = scores[chosenIdx - 1], y0 = scores[chosenIdx], yR = scores[chosenIdx + 1];
    const denom = yL - 2 * y0 + yR;
    if (denom !== 0) {
      const delta = 0.5 * (yL - yR) / denom;
      if (Math.abs(delta) < 1) refinedLag += delta;
    }
  }
  return sampleRate / refinedLag;
}

/**
 * Counts zero crossings per second -- a cheap, independent cross-check for
 * estimatePitchHz on simple (single-partial, low-noise) signals: a pure
 * sine/triangle wave crosses zero exactly twice per cycle, so
 * zeroCrossingRate/2 approximates the fundamental. Deliberately not used as
 * the primary estimator (it degrades fast on additive/noisy signals, where
 * upper partials add extra crossings) -- it exists so a test can sanity
 * check estimatePitchHz against a structurally different measurement
 * rather than trusting one algorithm alone.
 * @param {Float32Array|Float64Array} buffer - mono samples
 * @param {number} sampleRate
 * @returns {number} zero crossings per second
 */
export function zeroCrossingRate(buffer, sampleRate) {
  let crossings = 0;
  for (let i = 1; i < buffer.length; i++) {
    if ((buffer[i - 1] < 0 && buffer[i] >= 0) || (buffer[i - 1] >= 0 && buffer[i] < 0)) {
      crossings++;
    }
  }
  return (crossings * sampleRate) / buffer.length;
}

/**
 * Windowed RMS envelope trace: splits buffer into non-overlapping windows
 * of windowSec seconds and returns the RMS level of each -- a coarse
 * amplitude-over-time curve suitable for asserting envelope *shape*
 * (rises through attack, holds through sustain, falls through release)
 * without needing sample-accurate envelope internals in the test.
 * @param {Float32Array|Float64Array} buffer - mono samples
 * @param {number} sampleRate
 * @param {number} [windowSec=0.02] - window size in seconds
 * @returns {Float64Array} one RMS value per window, in buffer order
 */
export function windowedRms(buffer, sampleRate, windowSec = 0.02) {
  const windowSamples = Math.max(1, Math.round(windowSec * sampleRate));
  const numWindows = Math.ceil(buffer.length / windowSamples);
  const out = new Float64Array(numWindows);
  for (let w = 0; w < numWindows; w++) {
    const start = w * windowSamples;
    const end = Math.min(buffer.length, start + windowSamples);
    let sumSquares = 0;
    for (let i = start; i < end; i++) sumSquares += buffer[i] * buffer[i];
    out[w] = Math.sqrt(sumSquares / (end - start));
  }
  return out;
}

/**
 * Index of the window holding the peak RMS value in an envelope trace from
 * windowedRms -- the attack-to-sustain "elbow" of a percussive or swelling
 * envelope. Ties resolve to the first (earliest) peak.
 * @param {Float64Array} trace - from windowedRms
 * @returns {number} window index of the peak
 */
export function peakWindowIndex(trace) {
  let bestIdx = 0;
  let bestVal = -Infinity;
  for (let i = 0; i < trace.length; i++) {
    if (trace[i] > bestVal) {
      bestVal = trace[i];
      bestIdx = i;
    }
  }
  return bestIdx;
}

/**
 * True if the given RMS trace never violates non-decreasing-then-non-
 * increasing shape by more than `tolerance` (a fraction of the trace's peak
 * value) -- i.e. it rises to one peak and falls away from it, the shape a
 * single-envelope voice (attack -> sustain/decay -> release, no
 * retriggering) should produce. Small ripple under tolerance is allowed so
 * per-sample DSP noise (filter ring, noise-mix texture) doesn't fail an
 * otherwise-correct envelope shape.
 * @param {Float64Array} trace - from windowedRms
 * @param {number} [tolerance=0.05] - allowed non-monotonic ripple, as a fraction of the trace's peak value
 * @returns {boolean}
 */
export function isUnimodal(trace, tolerance = 0.05) {
  if (trace.length < 2) return true;
  const peak = Math.max(...trace);
  const slack = peak * tolerance;
  const peakIdx = peakWindowIndex(trace);
  for (let i = 1; i <= peakIdx; i++) {
    if (trace[i] < trace[i - 1] - slack) return false;
  }
  for (let i = peakIdx + 1; i < trace.length; i++) {
    if (trace[i] > trace[i - 1] + slack) return false;
  }
  return true;
}
