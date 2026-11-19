#!/usr/bin/env node
/**
 * Skill script: compile-a-media-plan. The deterministic part of the skill.
 *
 *   input     PLAN.json  (data/schema/media-plan.schema.json, plus admitMediaPlan's cross-field rules)
 *             [--targets flow,deterministic]   default: the plan's render.targets
 *             [--completions generations.jsonl]  Flow journal lines already on file (skips re-ordering)
 *             [--model KEY] [--max-clip-seconds N]
 *             --out DIR
 *   outputs   DIR/media-plan.admitted.json         the admitted, default-filled plan (protocol file for every consumer)
 *             DIR/media-plan.compile-receipt.json  MediaPlanCompilationReceipt (protocol file the adapters read)
 *          or DIR/media-plan.refusals.json         coded refusals, and NOTHING else is written
 *   exit      0 compiled; 2 refused by the contract; 1 usage / unreadable input
 *   effects   writes only the files above inside DIR. No queue, no Flow, no network, no render.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { admitMediaPlan } from '../../../../../src/media-plan.mjs';
import { compileMediaPlan } from '../../../../../src/media-plan-compile.mjs';

const usage = 'usage: compile-media-plan.mjs PLAN.json --out DIR [--targets flow,deterministic] [--completions FILE.jsonl] [--model KEY] [--max-clip-seconds N]';
try {
  const argv = process.argv.slice(2);
  const file = argv.shift();
  if (!file || file.startsWith('--')) throw new TypeError(usage);
  const opt = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!['--out', '--targets', '--completions', '--model', '--max-clip-seconds'].includes(argv[i]) || argv[i + 1] === undefined) throw new TypeError(usage);
    opt[argv[i].slice(2)] = argv[i + 1];
  }
  if (!opt.out) throw new TypeError(usage);
  const out = resolve(opt.out);
  const input = JSON.parse(readFileSync(resolve(file), 'utf8'));
  const options = {
    ...(opt.targets ? { targets: opt.targets.split(',') } : {}),
    ...(opt.model ? { model: opt.model } : {}),
    ...(opt['max-clip-seconds'] ? { maxClipSeconds: Number(opt['max-clip-seconds']) } : {}),
    ...(opt.completions ? { completions: readFileSync(resolve(opt.completions), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) } : {}),
  };
  const compiled = compileMediaPlan(input, options);
  mkdirSync(out, { recursive: true });
  if (!compiled.ok) {
    writeFileSync(join(out, 'media-plan.refusals.json'), `${JSON.stringify({ refusals: compiled.refusals }, null, 2)}\n`);
    process.stderr.write(`refused: ${compiled.refusals.map((r) => `${r.code} ${r.path}`).join('; ')}\n`);
    process.exitCode = 2;
  } else {
    writeFileSync(join(out, 'media-plan.admitted.json'), `${JSON.stringify(admitMediaPlan(input).plan, null, 2)}\n`);
    writeFileSync(join(out, 'media-plan.compile-receipt.json'), `${JSON.stringify(compiled.receipt, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify({ planId: compiled.receipt.planId, outputId: compiled.receipt.outputId, targets: compiled.receipt.targets, flowOrders: compiled.receipt.outputs.flow?.orders.length ?? null, warnings: compiled.receipt.warnings.map((w) => w.code) })}\n`);
  }
} catch (error) {
  process.stderr.write(`${error?.message ?? error}\n`);
  process.exitCode = 1;
}
