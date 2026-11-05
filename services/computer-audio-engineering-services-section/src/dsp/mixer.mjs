// mixer.mjs
//
// Buffer plumbing and safety utilities shared by the render loop: stereo
// buffer allocation, equal-power panning, additive mixing of a voice's mono
// output into the stereo bus, a soft (tanh) limiter used only as a final
// safety net (not as a sound-shaping distortion -- the render pipeline
// should be gain-staged low enough that it rarely engages), and the
// peak/RMS measurement functions the render CLI uses for self-verification.

/**
 * Allocates a pair of zero-filled Float64Array buffers for a stereo bus.
 * @param {number} numSamples - length of each channel, in samples
 * @returns {{left: Float64Array, right: Float64Array}}
 */
export function allocateStereoBuffer(numSamples) {
  return {
    left: new Float64Array(numSamples),
    right: new Float64Array(numSamples),
  };
}

/**
 * Equal-power pan law: returns the L/R gain pair for a pan position, such
 * that L^2 + R^2 stays constant across the pan range (so a centered signal
 * doesn't appear to dip in perceived loudness relative to hard-panned).
 * @param {number} panMinusOneToOne - -1 = hard left, 0 = center, 1 = hard right
 * @returns {{left:number, right:number}}
 */
export function equalPowerPan(panMinusOneToOne) {
  const p = Math.max(-1, Math.min(1, panMinusOneToOne));
  const angle = (p + 1) * 0.25 * Math.PI; // 0 -> hard left, pi/4 -> center, pi/2 -> hard right
  return {
    left: Math.cos(angle),
    right: Math.sin(angle),
  };
}

/**
 * Additively mixes one mono sample (after applying gain and an equal-power
 * pan) into a single stereo sample frame's running accumulator. This is a
 * pure function: it takes the bus's current L/R accumulator values for
 * *this one sample frame* and returns the updated pair -- it does not know
 * about or index into a whole buffer. Typical use inside a render loop:
 *
 *   let l = busL[i];
 *   let r = busR[i];
 *   for (const voice of voices) {
 *     ({ left: l, right: r } = mixInto(l, r, voice.render(), voice.gain, voice.pan));
 *   }
 *   busL[i] = l;
 *   busR[i] = r;
 *
 * @param {number} busL - current left accumulator value for this sample
 * @param {number} busR - current right accumulator value for this sample
 * @param {number} monoSample - the voice's mono output sample
 * @param {number} gain - linear gain applied to monoSample before panning
 * @param {number} panMinusOneToOne - -1 = hard left, 0 = center, 1 = hard right
 * @returns {{left:number, right:number}} updated accumulator values
 */
export function mixInto(busL, busR, monoSample, gain, panMinusOneToOne) {
  const { left, right } = equalPowerPan(panMinusOneToOne);
  const g = monoSample * gain;
  return {
    left: busL + g * left,
    right: busR + g * right,
  };
}

/**
 * Creates a stem mix channel: the per-stem level/pan/reverb-send controls
 * arrangement.mjs's stems (bed/pulse/ornament/lead) each get, layered on top
 * of mixInto's existing per-voice gain/pan rather than replacing it -- a
 * voice's own gain/pan handles its individual placement, while a stem
 * channel handles the whole stem's contribution to the mix as a group (its
 * overall level relative to other stems, its own pan bias, and how much of
 * it goes to the shared reverb send versus straight to the dry bus).
 * @param {object} [opts]
 * @param {number} [opts.level=1] - linear gain applied to this stem's contribution before mixInto's own per-voice gain
 * @param {number} [opts.pan=0] - -1..1, this stem's overall pan bias (summed with a voice's own instantaneous pan by the caller, not replacing it)
 * @param {number} [opts.space=0] - 0..1, fraction of this stem's signal routed to the reverb send bus instead of straight to the dry bus (0 = fully dry/present, 1 = fully wet/distant -- the "how far back in the mix" control per stem)
 * @returns {{level:number, pan:number, space:number}}
 */
export function makeStemChannel({ level = 1, pan = 0, space = 0 } = {}) {
  return { level, pan, space };
}

/**
 * Mixes one mono sample into a stem's dry-bus and reverb-send-bus
 * accumulators for this sample frame, applying the stem channel's level/pan/
 * space on top of the voice's own gain and instantaneous pan (mirrors
 * mixInto's calling convention: pass this sample frame's current
 * accumulator values in, get the updated ones back). The dry and send
 * fractions are complementary (dry = 1 - space), so raising a stem's space
 * (pushing it further into the reverb) proportionally reduces how much of it
 * reaches the dry bus directly, rather than adding reverb on top of an
 * unchanged dry level.
 * @param {{dryL:number, dryR:number, sendL:number, sendR:number}} bus - this sample frame's current accumulator values for both buses
 * @param {number} monoSample - the voice's mono output sample (already through its own DSP chain -- oscillator/envelope/filter etc.)
 * @param {number} voiceGain - the individual voice's own linear gain
 * @param {number} voicePan - the individual voice's own instantaneous pan (-1..1), summed with the stem channel's pan bias and clamped
 * @param {{level:number, pan:number, space:number}} channel - from makeStemChannel
 * @returns {{dryL:number, dryR:number, sendL:number, sendR:number}}
 */
export function mixStemSample(bus, monoSample, voiceGain, voicePan, channel) {
  const combinedPan = Math.max(-1, Math.min(1, voicePan + channel.pan));
  const { left, right } = equalPowerPan(combinedPan);
  const g = monoSample * voiceGain * channel.level;
  const dry = 1 - channel.space;
  return {
    dryL: bus.dryL + g * left * dry,
    dryR: bus.dryR + g * right * dry,
    sendL: bus.sendL + g * left * channel.space,
    sendR: bus.sendR + g * right * channel.space,
  };
}

/**
 * Soft (tanh) limiter. Used only as a last-resort safety net against
 * inter-sample overs from summed voices/reverb tails -- the pipeline's gain
 * staging should keep normal signal well inside the linear region of tanh
 * (roughly |x| < 0.5) so this rarely does more than round off rare peaks.
 * @param {number} sample
 * @returns {number} soft-clipped sample, always in (-1, 1)
 */
export function softClip(sample) {
  return Math.tanh(sample);
}

/**
 * Finds the peak absolute sample value across both channels.
 * @param {Float64Array|Float32Array|number[]} bufferL
 * @param {Float64Array|Float32Array|number[]} bufferR
 * @returns {number}
 */
export function peakOf(bufferL, bufferR) {
  let peak = 0;
  for (let i = 0; i < bufferL.length; i++) {
    const a = Math.abs(bufferL[i]);
    if (a > peak) peak = a;
  }
  for (let i = 0; i < bufferR.length; i++) {
    const a = Math.abs(bufferR[i]);
    if (a > peak) peak = a;
  }
  return peak;
}

/**
 * Computes the combined RMS level across both channels (both channels'
 * samples pooled into one mean-square before the square root).
 * @param {Float64Array|Float32Array|number[]} bufferL
 * @param {Float64Array|Float32Array|number[]} bufferR
 * @returns {number}
 */
export function rmsOf(bufferL, bufferR) {
  let sumSquares = 0;
  const n = bufferL.length + bufferR.length;
  for (let i = 0; i < bufferL.length; i++) sumSquares += bufferL[i] * bufferL[i];
  for (let i = 0; i < bufferR.length; i++) sumSquares += bufferR[i] * bufferR[i];
  return n > 0 ? Math.sqrt(sumSquares / n) : 0;
}

/**
 * Scans both channels for NaN or +/-Infinity samples -- a render-time
 * sanity check to catch DSP bugs (e.g. a filter blowing up) before writing
 * a corrupt WAV file.
 * @param {Float64Array|Float32Array|number[]} bufferL
 * @param {Float64Array|Float32Array|number[]} bufferR
 * @returns {boolean} true if any sample in either channel is non-finite
 */
export function hasNonFinite(bufferL, bufferR) {
  for (let i = 0; i < bufferL.length; i++) {
    if (!Number.isFinite(bufferL[i])) return true;
  }
  for (let i = 0; i < bufferR.length; i++) {
    if (!Number.isFinite(bufferR[i])) return true;
  }
  return false;
}
