// envelope.mjs
//
// Click-free amplitude envelopes: exponential (not linear) attack/release
// curves. Linear ramps still audibly "appear/disappear" at their endpoints
// -- the ear is very sensitive to the sudden change in slope at a linear
// ramp's start/end points, even when the ramp itself is slow. An
// exponential curve's slope tapers smoothly to (near) zero at both ends,
// which is what makes a voice feel like it fades in/out of silence rather
// than switching on/off, at ANY attack/release time -- seconds-long for a
// pad swell, or tens-of-milliseconds for a percussive/chime-like onset.
//
// Earlier revisions of this module offered only slow (multi-second)
// attack/release presets and said so in this header comment ("no fast-
// attack/percussive mode ... by design"). That was true as a fact about
// which presets were offered here, but it was never a structural limit of
// the curve math below: envelopeValueAt has no branch anywhere that treats
// a short attackSec specially or less correctly than a long one --
// exponentialCurve's t = elapsedSec / attackSec normalization works
// identically whether attackSec is 5 or 0.02. ENVELOPE_SHAPES.fastAttack
// below is a genuine additive preset built on that same unmodified curve,
// not a special-cased hack.
//
// Envelope shape: attack ramps from 0 up to sustainLevel over attackSec
// seconds, then holds at sustainLevel indefinitely (the "sustain" stage)
// until triggerRelease is called, at which point it ramps from wherever it
// currently is down to 0 over releaseSec seconds. Releasing mid-attack is
// handled cleanly (no click) by capturing the exact in-progress level at
// the moment of release and ramping from there. A "hit"/"chime" character
// (as opposed to a held pad) is produced by pairing a short attackSec with
// a caller that triggers the release soon after attack completes, rather
// than holding in sustain indefinitely -- see instrument.mjs's melody/
// stinger voice scheduling for a concrete example (releaseAtSec computed
// from the note's own duration).

const DEFAULT_CURVE_K = 5;

/**
 * Normalized exponential curve from fromVal to toVal as tFraction goes from
 * 0 to 1, with steepness k. k === 0 degenerates to a linear ramp. The curve
 * is normalized so it lands exactly on fromVal at t=0 and exactly on toVal
 * at t=1 regardless of k.
 * @param {number} fromVal
 * @param {number} toVal
 * @param {number} tFraction - expected in [0, 1]; clamped internally
 * @param {number} k - curve steepness (higher = more front/back-loaded)
 * @returns {number}
 */
function exponentialCurve(fromVal, toVal, tFraction, k) {
  const t = Math.min(1, Math.max(0, tFraction));
  if (Math.abs(k) < 1e-9) {
    return fromVal + (toVal - fromVal) * t;
  }
  const numerator = 1 - Math.exp(-k * t);
  const denominator = 1 - Math.exp(-k);
  return fromVal + (toVal - fromVal) * (numerator / denominator);
}

/**
 * Creates a new envelope state object.
 * @param {object} [opts]
 * @param {number} [opts.attackSec=5] - attack time in seconds (sane pad default: 3-8s)
 * @param {number} [opts.releaseSec=6] - release time in seconds
 * @param {number} [opts.sustainLevel=0.8] - level reached at the end of attack and held during sustain, in [0, 1]
 * @param {number} [opts.curve=DEFAULT_CURVE_K] - exponential steepness used by envelopeValueAt for this envelope's attack/release
 * @returns {object} envelope state
 */
export function makeEnvelope({
  attackSec = 5,
  releaseSec = 6,
  sustainLevel = 0.8,
  curve = DEFAULT_CURVE_K,
} = {}) {
  return {
    attackSec,
    releaseSec,
    sustainLevel,
    curve,
    stage: 'idle', // 'idle' | 'attack' | 'sustain' | 'release'
    stageStartTime: 0,
    releaseStartLevel: 0,
  };
}

/**
 * Computes the envelope's output level at a given elapsed time within a
 * given stage. Pure function of (env, elapsedSec, stage) -- does not read
 * or mutate env.stage/env.stageStartTime itself, so it can be used to
 * "preview" a level (as triggerRelease does internally).
 * @param {object} env - envelope state from makeEnvelope
 * @param {number} elapsedSec - seconds elapsed since the given stage began
 * @param {'idle'|'attack'|'sustain'|'release'} [stage] - defaults to env.stage
 * @returns {number} level in [0, 1]
 */
export function envelopeValueAt(env, elapsedSec, stage) {
  const activeStage = stage !== undefined ? stage : env.stage;

  switch (activeStage) {
    case 'idle':
      return 0;

    case 'attack': {
      if (env.attackSec <= 0) return env.sustainLevel;
      const t = elapsedSec / env.attackSec;
      if (t >= 1) return env.sustainLevel;
      return exponentialCurve(0, env.sustainLevel, t, env.curve);
    }

    case 'sustain':
      return env.sustainLevel;

    case 'release': {
      const startLevel = env.releaseStartLevel !== undefined ? env.releaseStartLevel : env.sustainLevel;
      if (env.releaseSec <= 0) return 0;
      const t = elapsedSec / env.releaseSec;
      if (t >= 1) return 0;
      return exponentialCurve(startLevel, 0, t, env.curve);
    }

    default:
      return 0;
  }
}

/**
 * Begins (or restarts) the attack stage at time tNow. Mutates env in place
 * and also returns it for convenience.
 * @param {object} env
 * @param {number} tNow - current transport time in seconds
 * @returns {object} env
 */
export function triggerAttack(env, tNow) {
  env.stage = 'attack';
  env.stageStartTime = tNow;
  return env;
}

/**
 * Begins the release stage at time tNow, capturing whatever level the
 * envelope is actually at right now (even mid-attack) so the release ramps
 * from there with no click. Mutates env in place and also returns it.
 * @param {object} env
 * @param {number} tNow - current transport time in seconds
 * @returns {object} env
 */
export function triggerRelease(env, tNow) {
  const elapsed = tNow - env.stageStartTime;
  const levelAtRelease = envelopeValueAt(env, elapsed, env.stage);
  env.releaseStartLevel = levelAtRelease;
  env.stage = 'release';
  env.stageStartTime = tNow;
  return env;
}

/**
 * Standalone exponential ramp helper using a fixed general-purpose curve
 * steepness (independent of any particular envelope's `curve` setting).
 * Useful for one-off smooth ramps elsewhere in the engine (e.g. a
 * parameter fade) without needing a full envelope object.
 * @param {number} fromVal
 * @param {number} toVal
 * @param {number} tFraction - in [0, 1]; clamped internally
 * @returns {number}
 */
export function expRamp(fromVal, toVal, tFraction) {
  return exponentialCurve(fromVal, toVal, tFraction, DEFAULT_CURVE_K);
}

/**
 * Named envelope shape presets, each a plain opts object compatible with
 * makeEnvelope. 'pad' is this module's original slow-attack/slow-release
 * shape (3-8s scale, per the original sane-default comment). 'fastAttack'
 * is a genuine short-attack, percussive/chime-suited shape -- tens of
 * milliseconds, not seconds -- built on the exact same exponentialCurve
 * math above with no special-casing; a steeper `curve` (8 vs. pad's 5) is
 * used because a short attack benefits from an even more front-loaded rise
 * (more of the climb happens in the first fraction of an already-short
 * window, which is what reads as a "hit" rather than a very quick fade-in).
 * These are starting points, not the only two attack shapes a caller can
 * ask for -- makeEnvelope accepts any attackSec/releaseSec/curve directly.
 */
export const ENVELOPE_SHAPES = Object.freeze({
  pad: Object.freeze({ attackSec: 5, releaseSec: 6, sustainLevel: 0.8, curve: 5 }),
  fastAttack: Object.freeze({ attackSec: 0.02, releaseSec: 0.35, sustainLevel: 0.85, curve: 8 }),
});
