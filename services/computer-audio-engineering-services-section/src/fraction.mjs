// fraction.mjs -- exact rational arithmetic (num/den, always reduced) for
// audio/music math that is genuinely a ratio of small integers -- note
// durations, harmonic-partial ratios, tempo/meter -- where a float would add
// rounding error a ratio doesn't have. Generalized out of
// music-engineering-services-section's generative/melody.mjs, which had this
// same arithmetic private to itself.

/**
 * @typedef {object} Fraction
 * @property {number} num
 * @property {number} den - always > 0; sign lives on num
 */

function gcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    [a, b] = [b, a % b];
  }
  return a || 1;
}

/**
 * Builds a fraction in lowest terms, with the sign normalized onto num and
 * den always positive.
 * @param {number} num
 * @param {number} den
 * @returns {Fraction}
 */
export function makeFraction(num, den) {
  if (den === 0) throw new Error('makeFraction: den must not be 0');
  if (den < 0) { num = -num; den = -den; }
  const g = gcd(num, den);
  return { num: num / g, den: den / g };
}

/** @param {number} n @returns {Fraction} */
export function fromInt(n) {
  return { num: n, den: 1 };
}

/** @param {Fraction} a @param {Fraction} b @returns {Fraction} */
export function addFractions(a, b) {
  return makeFraction(a.num * b.den + b.num * a.den, a.den * b.den);
}

/** @param {Fraction} a @param {Fraction} b @returns {Fraction} */
export function multiplyFractions(a, b) {
  return makeFraction(a.num * b.num, a.den * b.den);
}

/**
 * Multiplies a fraction by a positive integer factor (e.g. rhythmic
 * augmentation). Exact: no floating-point rounding anywhere in this
 * operation.
 * @param {Fraction} frac
 * @param {number} factor - positive integer
 * @returns {Fraction}
 */
export function multiplyFractionByInt(frac, factor) {
  if (!Number.isInteger(factor) || factor <= 0) throw new Error('multiplyFractionByInt: factor must be a positive integer');
  return makeFraction(frac.num * factor, frac.den);
}

/**
 * Divides a fraction by a positive integer factor (e.g. rhythmic
 * diminution). Exact for the same reason multiplyFractionByInt is.
 * @param {Fraction} frac
 * @param {number} factor - positive integer
 * @returns {Fraction}
 */
export function divideFractionByInt(frac, factor) {
  if (!Number.isInteger(factor) || factor <= 0) throw new Error('divideFractionByInt: factor must be a positive integer');
  return makeFraction(frac.num, frac.den * factor);
}

/** @param {Fraction} a @param {Fraction} b @returns {boolean} */
export function fractionsEqual(a, b) {
  return a.num * b.den === b.num * a.den;
}

/** @param {Fraction} f @returns {number} */
export function toNumber(f) {
  return f.num / f.den;
}
