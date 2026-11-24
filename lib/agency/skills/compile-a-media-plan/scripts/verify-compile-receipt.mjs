#!/usr/bin/env node
/**
 * Skill script: verify a compile receipt against the plan it names (the postcondition audit
 * a receiving party runs before it trusts the orders or the render job).
 *
 *   input   media-plan.admitted.json  media-plan.compile-receipt.json  [--completions FILE.jsonl]
 *   output  one JSON line {ok, reason}; exit 0 when the receipt is exactly what the plan compiles to,
 *           2 when it is not (tampered, stale, or the plan no longer compiles), 1 on usage.
 *   effects none.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { verifyCompilationRecord } from '../../../../../src/media-plan-compile.mjs';

try {
  const [planFile, recordFile, ...rest] = process.argv.slice(2);
  if (!planFile || !recordFile || (rest.length && (rest[0] !== '--completions' || rest.length !== 2))) throw new TypeError('usage: verify-compile-receipt.mjs media-plan.admitted.json media-plan.compile-receipt.json [--completions FILE.jsonl]');
  const completions = rest.length ? readFileSync(resolve(rest[1]), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  const result = verifyCompilationRecord(JSON.parse(readFileSync(resolve(planFile), 'utf8')), JSON.parse(readFileSync(resolve(recordFile), 'utf8')), { completions });
  process.stdout.write(`${JSON.stringify({ ok: result.ok, reason: result.reason ?? null })}\n`);
  process.exitCode = result.ok ? 0 : 2;
} catch (error) {
  process.stderr.write(`${error?.message ?? error}\n`);
  process.exitCode = 1;
}
