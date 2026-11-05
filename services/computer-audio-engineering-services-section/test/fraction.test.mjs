import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeFraction, fromInt, addFractions, multiplyFractions,
  multiplyFractionByInt, divideFractionByInt, fractionsEqual, toNumber,
} from '../src/fraction.mjs';

test('makeFraction reduces to lowest terms and normalizes sign onto num', () => {
  assert.deepEqual(makeFraction(2, 4), { num: 1, den: 2 });
  assert.deepEqual(makeFraction(3, -6), { num: -1, den: 2 });
  assert.deepEqual(makeFraction(-3, -6), { num: 1, den: 2 });
});

test('makeFraction rejects a zero denominator', () => {
  assert.throws(() => makeFraction(1, 0));
});

test('addFractions and multiplyFractions compute exact results', () => {
  assert.deepEqual(addFractions(makeFraction(1, 4), makeFraction(1, 4)), { num: 1, den: 2 });
  assert.deepEqual(multiplyFractions(makeFraction(2, 3), makeFraction(3, 4)), { num: 1, den: 2 });
});

test('multiplyFractionByInt / divideFractionByInt round-trip exactly', () => {
  const half = makeFraction(1, 2);
  assert.deepEqual(multiplyFractionByInt(half, 4), fromInt(2));
  assert.deepEqual(divideFractionByInt(fromInt(2), 4), half);
  assert.throws(() => multiplyFractionByInt(half, 1.5));
  assert.throws(() => multiplyFractionByInt(half, 0));
});

test('fractionsEqual compares by cross-multiplication, not identity', () => {
  assert.ok(fractionsEqual(makeFraction(2, 4), makeFraction(1, 2)));
  assert.ok(!fractionsEqual(makeFraction(1, 3), makeFraction(1, 2)));
});

test('toNumber converts to the expected float', () => {
  assert.equal(toNumber(makeFraction(3, 4)), 0.75);
});
