---
name: compile-a-media-plan
description: Admit one media plan (script, scenes, shots, assets, captions, audio, render target, publication metadata) and compile it, without side effects, into Google Flow queue orders, a deterministic render job and publication metadata, with a receipt a receiving party can audit.
type: skill
skill-closure-kind: operation
requires-capabilities:
  - office
  - agency-record
id: compile-a-media-plan

---
# Compile a media plan

**Owner:** media plan steward (proposed office; no incumbent established), under the duty *compile media plans for every renderer*.
**When:** a plan exists or changed and some renderer (Flow orders, the deterministic renderer, a
publisher) must consume it. **Done when:** `media-plan.compile-receipt.json` exists and verifies, or
`media-plan.refusals.json` names every reason it cannot.

## Hoare contract (`compile-media-plan/1`)

| | |
|---|---|
| **Input** | `PLAN.json` against [`data/schema/media-plan.schema.json`](../../../../data/schema/media-plan.schema.json) |
| **Precondition** | `admitMediaPlan` accepts its closed schema shape (unknown fields refuse; defaults apply only to absence): references resolve, cues sit inside shots and speakers inside casts, SVG establishes the closed `media-inert-svg/1` profile, source revision is exact, every source document is addressed (NI, https URL or DOI), a paper link exists when `publication.requirePaperLink`, and per target: no reference conditioning or over-long clips for `flow`; no timing drift or unresolved assets, only 9:16, at most 100 total shots including the end card, 5 cast and 12 dialogue lines per shot, and one frame asset per shot for `deterministic` |
| **Script** | [`scripts/compile-media-plan.mjs`](scripts/compile-media-plan.mjs) |
| **Output protocol files** | `media-plan.admitted.json` (the plan every consumer reads), `media-plan.compile-receipt.json` ([schema](../../../../data/schema/media-plan-compilation-receipt.schema.json)), or `media-plan.refusals.json` |
| **Postcondition** | effects none; every shot accounted for once (ordered, satisfied by an accepted generation, or deterministic-only); frames conserved; every dialogue line captioned; the paper link is in the description and on the end card; same plan and compilation inputs give the same bytes |
| **Refusals** | coded, with a path: see `MEDIA_PLAN_CONTRACT.refusals` in [`src/media-plan-compile.mjs`](../../../../src/media-plan-compile.mjs) |
| **Audit** | [`scripts/verify-compile-receipt.mjs`](scripts/verify-compile-receipt.mjs): recompiles with the same completion journal and compares every carried receipt field, including warnings, checks, options, effects and outputs |

## Steps

1. Before compiling, establish the actual inline asset profile: [`media-inert-svg/1`](../../../../data/schema/media-inert-svg-profile.md), not a producer's generic “safe SVG” label. Unsupported syntax refuses; do not strip it or substitute an unchecked asset. When migrating an episode, compare source and candidate shot IDs, raw beat IDs, order, frames and dialogue. Returning beat runs have distinct generated scene IDs; the author associations must remain unchanged.
2. Run `node scripts/compile-media-plan.mjs PLAN.json --out DIR` (add `--completions generations.jsonl`
   with the Flow journal so only compatible video completions satisfy shots). A journal row needs text-to-video capability, video/mp4 output with positive bytes, completion/prompt/output NIs and exact aspect; prompt text, when supplied, must match its NI. This does not independently verify bytes, rights or editorial acceptance.
3. Exit 2 means refusals: read `DIR/media-plan.refusals.json`. Fix invalid **plan data** (never the output), then recompile. `RENDERER_UNSUPPORTED` instead identifies a selected receiver limit: choose a supported target or carry a change through that renderer's owner; do not silently narrow the common plan. `SVG_NOT_SELF_CONTAINED` means the supported profile was not established, not that every refused SVG is unsafe. A model/composition defect requires returning to requirements and architecture before a coherent repair, not a crash/trace/patch loop.
4. Exit 0: run `node scripts/verify-compile-receipt.mjs DIR/media-plan.admitted.json DIR/media-plan.compile-receipt.json`
   with the same `--completions FILE.jsonl` when one was used at compilation. Stop on a failed audit.
5. Independently compare the selected complete locator (URL, else DOI resolver URL, else full NI) with the visible generated card text and the paper locator. No digest abbreviation, lost scheme, hidden-metadata shortcut or successful self-replay substitutes for this check. Overlong locators and actually different selected paper locators refuse. Then confirm the actual consumer receives unchanged admitted SVG bytes and conserved source shot/beat/timeline associations.
6. Only after a successful whole-receipt audit, review `warnings`. `GENERATIVE_TEXT_REQUEST` means a prompt
   asks the video model to draw text or labelled graphics; move that text into an `overlay` SVG asset
   (exact source data composited afterward), then recompile and verify. Hand the admitted plan and
   verified receipt together to the next skill. Reuse of any changed journal requires fresh compilation.

The generated end-card shot uses `end-card`, or the first free `end-card-N` starting at 2; author shot
IDs and their caption/asset associations remain unchanged. A plan may retain broader Flow capacities
than `procedural-previs/1`. A valid compiler receipt is not renderer installation or useful receiving.

## Where judgment is needed

Everything above is deterministic. **LLM judgment** (not this script) is reserved for *authoring*
the plan from a script or paper: how to break a paper into scenes and shots, which shots are
`generative` and which `deterministic`, prompt wording, and which statements are quoted as `claim`.
**Human/independent review** is reserved for accepting renders and for any publication.

## When stuck

A refusal you disagree with is a defect in the contract, not in the plan: record it as a system-debt
record against `computer-media-engineering-services-section` rather than loosening the output.
