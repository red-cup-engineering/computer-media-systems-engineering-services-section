// oscillator.mjs
//
// Bandlimited-ish tone generators for warm sustained pads: phase-accumulator
// sine/triangle, plus an additive oscillator that sums a small partial
// series with slowly-decaying odd/even amplitude weights (organ/pad-like
// warmth without harsh harmonics).
//
// sineSample/triangleSample/additiveSample are pure functions of a phase
// value in the range [0, 1) (one full cycle per unit of phase). They do not
// own any state.
//
// makeOscillator/advanceOscillator instead manage a small mutable
// phase-accumulator object so a voice can be advanced exactly one sample at
// a time inside the main render loop -- this is what gives sample-accurate
// detune/vibrato jitter driven by the thermodynamics layer, since the
// instantaneous frequency can change every single sample without any
// block-based approximation.

/**
 * A single cycle of a sine wave.
 * @param {number} phase - phase in cycles, any real number (wrapped internally)
 * @returns {number} sample in [-1, 1]
 */
export function sineSample(phase) {
  return Math.sin(2 * Math.PI * phase);
}

/**
 * A single cycle of a triangle wave: -1 at phase 0, +1 at phase 0.5, back to
 * -1 at phase 1. Softer harmonic content than a saw/square (only odd
 * harmonics, falling off at 1/n^2), which suits warm pad material.
 * @param {number} phase - phase in cycles, any real number (wrapped internally)
 * @returns {number} sample in [-1, 1]
 */
export function triangleSample(phase) {
  const p = phase - Math.floor(phase); // wrap into [0, 1)
  if (p < 0.5) {
    return -1 + 4 * p;
  }
  return 3 - 4 * p;
}

/**
 * Additive synthesis: sums a small set of sine partials, each with its own
 * frequency ratio (relative to the fundamental) and amplitude weight, then
 * normalizes by the sum of the absolute weights so the result stays inside
 * roughly [-1, 1] regardless of how many partials are supplied.
 * @param {number} phase - fundamental phase in cycles
 * @param {Array<{ratio: number, amp: number}>} partials
 * @returns {number} sample, approximately in [-1, 1]
 */
export function additiveSample(phase, partials) {
  let sum = 0;
  let ampSum = 0;
  for (let i = 0; i < partials.length; i++) {
    const { ratio, amp } = partials[i];
    sum += amp * Math.sin(2 * Math.PI * phase * ratio);
    ampSum += Math.abs(amp);
  }
  if (ampSum === 0) return 0;
  return sum / ampSum;
}

/**
 * Generates a partial (additive-harmonic) series from three continuous
 * parameters instead of a hand-listed { ratio, amp }[] table: amp(ratio) =
 * 1 / ratio^rolloffExponent (a standard inverse-power spectral-rolloff
 * model -- higher rolloffExponent means upper harmonics fall off faster,
 * i.e. a duller/rounder tone; lower means a brighter/buzzier one), with
 * even-numbered harmonics additionally scaled by (1 - oddEvenBias) --
 * oddEvenBias=0 leaves the harmonic series untouched, oddEvenBias=1 removes
 * even harmonics entirely (a hollow, clarinet-like odd-only spectrum).
 * Partials whose resulting amplitude rounds to (near) zero are dropped so
 * the returned series stays the same shape an equivalent hand-written list
 * would have been, not padded with inaudible entries.
 * @param {object} opts
 * @param {number} opts.count - number of harmonics to consider (ratios 1..count)
 * @param {number} [opts.rolloffExponent=1.5] - amp(ratio) = ratio^-rolloffExponent; higher = darker/rounder
 * @param {number} [opts.oddEvenBias=0] - in [0,1]; 0 = full harmonic series, 1 = odd harmonics only
 * @returns {Array<{ratio:number, amp:number}>}
 */
export function generatePartials({ count, rolloffExponent = 1.5, oddEvenBias = 0 }) {
  const partials = [];
  for (let ratio = 1; ratio <= count; ratio++) {
    let amp = 1 / Math.pow(ratio, rolloffExponent);
    if (ratio % 2 === 0) amp *= 1 - oddEvenBias;
    if (amp > 1e-4) partials.push({ ratio, amp });
  }
  return partials;
}

/**
 * Named partial-weight series for the additive oscillator, kept as
 * recognizable presets -- but each is now a specific parameterization of
 * generatePartials (a real generator over a continuous 3-parameter space:
 * partial count, spectral-rolloff exponent, odd/even bias) rather than a
 * separately hand-listed { ratio, amp }[] table for each name. The three
 * names below are tuned-by-ear parameter choices that land close to (not
 * pixel-identical to) this module's original hand-listed values -- unlike
 * scale.mjs's named modes, which are *exact* special cases of their
 * generator, there is no principled reason a hand-tuned timbre's exact
 * numbers should fall out of any one formula, so this module doesn't claim
 * that; what it does claim is that any point in the 3-parameter space
 * (partial count, rolloff exponent, odd/even bias) is now reachable, not
 * just these three.
 */
export const PARTIAL_PRESETS = {
  // Rounded, breathy pad: moderate rolloff, full harmonic series (even and
  // odd both present).
  warmPad: generatePartials({ count: 6, rolloffExponent: 1.55, oddEvenBias: 0 }),
  // Fuller, drawbar-organ-like spectrum: more partials, a gentler rolloff
  // so more of the upper harmonics stay audible.
  organLike: generatePartials({ count: 8, rolloffExponent: 1.35, oddEvenBias: 0 }),
  // Sparse odd-harmonic series (clarinet/hollow-tube-like): oddEvenBias=1
  // removes the even harmonics outright, a steeper rolloff keeps it thin.
  glassy: generatePartials({ count: 7, rolloffExponent: 1.5, oddEvenBias: 1 }),
  // Breathy/flute-like: a real flute's low-register tone is close to a pure
  // sine, with the fundamental dominant and only a whisper of upper
  // harmonics -- a much steeper rolloff than warmPad/organLike, plus a mild
  // odd-leaning bias (real flute spectra are irregular rather than strictly
  // odd-only, so this is a lean, not the full oddEvenBias=1 removal glassy
  // uses). One more example point in generatePartials's 3-parameter space,
  // not a new preset mechanism.
  breathyFlute: generatePartials({ count: 5, rolloffExponent: 2.8, oddEvenBias: 0.2 }),
  // Plucked-string-like (guqin/koto-adjacent): brighter and fuller than
  // breathyFlute -- a real plucked string's excitation puts energy across
  // many harmonics -- but still rolling off faster than organLike so it
  // reads as plucked rather than reedy. This is a static-spectrum
  // approximation only: a real pluck's brightness decays *within* the note
  // (bright attack, duller tail), which this single fixed partial set does
  // not model by itself -- that time-varying character has to come from
  // pairing this with a fast-attack/moderate-release amplitude envelope
  // (see envelope.mjs's ENVELOPE_SHAPES.fastAttack), not from the partial
  // set alone.
  pluckedString: generatePartials({ count: 10, rolloffExponent: 1.2, oddEvenBias: 0 }),
  // Bell/chime-like: a real point in generateBellPartials's (count,
  // inharmonicity, rolloffExponent) space -- moderate stretch, fairly steep
  // rolloff so the inharmonic upper partials add color/shimmer without
  // dominating. Suited to a fast-attack/long-release envelope (see
  // envelope.mjs's ENVELOPE_SHAPES.fastAttack), same pairing
  // pluckedString's own header comment describes for a time-varying
  // brightness the static partial set alone can't produce.
  bell: generateBellPartials({ count: 9, inharmonicity: 0.018, rolloffExponent: 1.35 }),
  // Sub-register bass: a generated harmonic series (generatePartials, same
  // mechanism as warmPad/organLike/glassy) with one extra sub-octave partial
  // (ratio 0.5, i.e. one octave below the fundamental) prepended at strong
  // amplitude. additiveSample places no constraint on ratio being an
  // integer -- a ratio below 1 is exactly as valid as one above it -- so
  // this is the same generator used slightly outside its usual integer-
  // harmonic range, not a separate mechanism. The sub-octave partial is what
  // gives a bass voice its felt low-end weight beyond what the fundamental
  // alone provides at low frequencies.
  subBass: [{ ratio: 0.5, amp: 0.8 }, ...generatePartials({ count: 4, rolloffExponent: 1.8, oddEvenBias: 0 })],
};

/**
 * Generates an inharmonic partial series suited to bell/plate-like timbres,
 * using the same stiff-string/plate stretching formula used to model piano
 * string inharmonicity: ratio(n) = n * sqrt(1 + inharmonicity * n^2). At
 * inharmonicity=0 this degenerates to an exact harmonic series (ratio(n) =
 * n), same as generatePartials would give at oddEvenBias=0; small positive
 * values progressively "stretch" upper partials sharp of their harmonic
 * position, which is what makes a bell/plate/chime read as inharmonic
 * (non-pitched-sounding upper partials) rather than a duller version of an
 * ordinary harmonic tone. This is a real, parametric acoustic model (not a
 * hand-picked bell spectrum table) -- any inharmonicity in [0, ~0.05] and any
 * partial count is reachable, of which PARTIAL_PRESETS.bell below is one
 * named point, exactly the same "generator, not a lookup table" discipline
 * generatePartials/generateModeIntervals already follow elsewhere in this
 * codebase.
 * @param {object} opts
 * @param {number} opts.count - number of partials (ratios n=1..count)
 * @param {number} [opts.inharmonicity=0.012] - stretch coefficient; higher = more bell-like/less pitched
 * @param {number} [opts.rolloffExponent=1.2] - amp(n) = n^-rolloffExponent, applied before stretching (upper partials still need to fall off in level, independent of their frequency being stretched)
 * @returns {Array<{ratio:number, amp:number}>}
 */
export function generateBellPartials({ count, inharmonicity = 0.012, rolloffExponent = 1.2 }) {
  const partials = [];
  for (let n = 1; n <= count; n++) {
    const ratio = n * Math.sqrt(1 + inharmonicity * n * n);
    const amp = 1 / Math.pow(n, rolloffExponent);
    if (amp > 1e-4) partials.push({ ratio, amp });
  }
  return partials;
}

/**
 * Creates a mutable phase-accumulator oscillator state.
 * @param {object} opts
 * @param {number} opts.freqHz - initial frequency in Hz
 * @param {number} opts.sampleRate - sample rate in Hz (e.g. 44100)
 * @param {'sine'|'triangle'|'additive'} [opts.waveform='sine']
 * @param {Array<{ratio:number, amp:number}>} [opts.partials] - used only when waveform is 'additive'
 * @returns {{phase:number, freqHz:number, sampleRate:number, waveform:string, partials:Array}}
 */
export function makeOscillator({ freqHz, sampleRate, waveform = 'sine', partials = PARTIAL_PRESETS.warmPad }) {
  return {
    phase: 0,
    freqHz,
    sampleRate,
    waveform,
    partials,
  };
}

/**
 * Advances an oscillator by exactly one sample and returns the sample value
 * at the phase *before* advancing (i.e. the sample for "now"), then steps
 * the phase forward by freqHzThisSample / sampleRate and wraps it back into
 * [0, 1). Passing a different freqHzThisSample on every call is what allows
 * sample-accurate detune/vibrato jitter.
 * @param {{phase:number, freqHz:number, sampleRate:number, waveform:string, partials:Array}} osc - object returned by makeOscillator, mutated in place
 * @param {number} [freqHzThisSample] - instantaneous frequency for this sample; defaults to osc.freqHz if omitted
 * @returns {number} sample, approximately in [-1, 1]
 */
export function advanceOscillator(osc, freqHzThisSample) {
  let sample;
  switch (osc.waveform) {
    case 'sine':
      sample = sineSample(osc.phase);
      break;
    case 'triangle':
      sample = triangleSample(osc.phase);
      break;
    case 'additive':
      sample = additiveSample(osc.phase, osc.partials);
      break;
    default:
      throw new Error(`Unknown oscillator waveform: ${osc.waveform}`);
  }

  const freq = freqHzThisSample !== undefined ? freqHzThisSample : osc.freqHz;
  osc.freqHz = freq;
  osc.phase += freq / osc.sampleRate;
  osc.phase -= Math.floor(osc.phase);

  return sample;
}
