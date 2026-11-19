---
name: run-the-media-plan-cycle
description: Runbook for the end-to-end cycle that takes one media plan to Google Flow orders and to a deterministic render, with the checks between steps, the stop points that need a person, and how to roll back.
type: skill
skill-closure-kind: process
requires-capabilities:
  - office
  - agency-record
id: run-the-media-plan-cycle

---
# Run the media plan cycle (runbook)

> Form gap: there is no runbook form yet (a norm-triggered sequence that composes skills). This
> instance is written as a `process` skill, the closest existing shape. See the system-debt record
> `no-runbook-form-for-norm-triggered-skill-sequences`.

**Office:** media plan steward (proposed in this section; no incumbent established). **Duty:** compile media plans for every renderer.
**Trigger (norm):** whenever a source document (a script, a lesson report, a research paper such as a
Climate Place-By-Place paper) is to become a video, or an existing plan changes. A plan's content
address (`planId`) identifies the admitted content. Pure recompilation is replayable; preventing repeated
external ordering or rendering effects remains the relevant consumer's responsibility, not a guarantee
of this process skill or of the plan identity alone.

## Skills composed, in order

| # | Step | Skill / script | Kind | Reads | Writes (protocol file) |
|---|---|---|---|---|---|
| 1 | Author the plan from the source | *(authoring: LLM judgment, no script)* | judgment | source document | `PLAN.json` |
| 2 | Admit and compile | [compile-a-media-plan](../compile-a-media-plan/SKILL.md) `compile-media-plan.mjs` | deterministic | `PLAN.json`, optional Flow journal | `media-plan.admitted.json`, `media-plan.compile-receipt.json` or `media-plan.refusals.json` |
| 3 | Audit the receipt | `verify-compile-receipt.mjs` | deterministic | the two files above and the same completion journal, if used | one JSON line, exit code |
| 4a | Prepare Flow orders | `prepare-flow-orders-from-a-media-plan` (google-flow section) | deterministic | `media-plan.admitted.json`, observed model catalog | `flow-orders.prepared.json` |
| 4b | Render deterministically | `render-a-media-plan-deterministically` (media-engineering section) | deterministic | `media-plan.admitted.json` | `preview.mp4`, `captions.srt`, `render-receipt.json` |
| 5 | Queue the Flow orders | `flow-media-plan --queue` | **effect: writes orders/pending** | `flow-orders.prepared.json` | queued JSONL (still unspent) |
| 6 | Review the render and any Flow clips | independent reviewer | judgment (person) | outputs | review record |
| 7 | Publish | *(out of scope: youtube / google-drive sections)* | person-authorized | description, captions, end card from the receipt | publication receipt |

Steps 4a and 4b are independent and may run in parallel; both consume the same `media-plan.admitted.json`.
Step 5 is a separate, explicit act: preparing orders spends nothing, queueing writes a file, and only
`flow-generate --queue` (its allowance, pacing and circuit breaker) can spend credits.

## Checks between steps

- Before 2: establish actual [`media-inert-svg/1`](../../../../data/schema/media-inert-svg-profile.md) admission for every carried inline asset; a producer's “self-contained” claim alone is insufficient. On episode migration, compare source shot/beat IDs, sequence, frames and dialogue against the plan, including returning beat runs and generated scene-ID collisions.
- After 2: preserve the exact completion journal used for this compilation; a new journal requires a new receipt.
- After 3: exit 0 from whole-receipt replay, including warnings, checks, effects, options and outputs.
  Only then read `warnings`; no `GENERATIVE_TEXT_REQUEST` remains unaddressed for a text-bearing graphic.
  A warning-driven plan change requires recompilation and a new successful audit. Never hand an unaudited
  or failed receipt to a renderer or queue.
- Also after 3: compare the full selected URL/DOI/NI against visible end-card text, and verify the required paper locator really appears. Whole-receipt replay proves consistency, not that an independently required source or consumer invariant was modeled correctly. A closure, locator or migration defect returns to the governing requirements and architecture before another implementation; do not accumulate one-string patches.
- After 4a: `status` is `PREPARED_NOT_QUEUED_NOT_SUBMITTED`; `estimate.units` is within the ceiling the person set. `HELD_CREDIT_CEILING` is a stop, not a trim.
- After 4b: every check in `render-receipt.json` is `ok`; verify admitted asset bytes/roles, complete locator visibility and source shot/beat/timeline associations against the actual rendered receiver, not just compiler self-replay.
- Before 5: the person has said to queue. A runbook never queues on its own.

## Rollback

- Steps 1-4 write only into the working directory: delete it.
- Step 5: remove the queued file from `orders/pending` before the next `flow-generate --queue` run
  claims it (it names the plan: `...-plan-<plan-slug>.jsonl`). After a claim, the orders are Flow's,
  and the allowance ledger records any spend; do not edit the journal.
- A plan fix is a new plan (new `planId`); generations already journaled for unchanged prompts are
  reused through `--completions` only with compatible video evidence (text-to-video, video/mp4,
  positive bytes, NI identities and exact aspect). Missing or conflicting evidence never suppresses an order.

## Stop points that need a person

Plan authorship sign-off for rights and source claims; the credit ceiling; queueing; review of any
generated or rendered media; publication to any channel.

## Current receiving limits

`procedural-previs/1` accepts 9:16, at most 100 output shots including the collision-safe end card,
5 cast and 12 dialogue lines per shot, and one frame asset per shot. These are target-specific
refusals, not restrictions on the shared plan or Flow. Passing source tests does not close the
existing music-forwarding, consumer frozen-lock/test-enrollment, supplier publication, toolchain,
installation or independent render-receiving obligations. The eleven system debts remain open.
