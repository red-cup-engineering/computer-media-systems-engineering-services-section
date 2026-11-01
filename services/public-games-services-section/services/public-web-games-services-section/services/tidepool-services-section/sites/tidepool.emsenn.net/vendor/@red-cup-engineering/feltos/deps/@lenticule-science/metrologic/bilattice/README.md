# @lenticule-science/metrologic/bilattice

**The bilattice predication floor — the four-regime descent over a lossless evidence carrier, on zero dependencies.**

An utterance `[token, claim]` settles to a finite fixed point through `articulate → predicate → posit → settle`, and the bilattice supplies the charge value-operations — all as ordinary functions returning ordinary objects.
Nothing is seeded: every cell's state is **measured** from what was given.
`⊥` (absurd) is only ever *reached* (by the meet, under contradiction), never stamped; the evidence carrier only ever **grows** (knowledge never falls).

> This is a from-scratch, best-practices recreation of [`@561/development.active.math-kernel`](../../development/active/math-kernel) — the same math, verified byte-for-byte against it, packaged as clean named-export modules.
> It is a *recreation, not a move*: the old kernel stays in place so consumers migrate when they choose.

## The model

A **charge** is `{ value: [a₊, a₋], evidence: [pos-witnesses, neg-witnesses] }`.
The `value` is the bilattice pair `⟨a₊, a₋⟩ ∈ FOUR`:

```
   [F,F] absurd  (no side)        [T,F] potential (has-potential, not active)
   [F,T] potential  (engaged)        [T,T] stable    (both — "told both", ⊤)
```

Two σ-dual orders run on the pair — **knowledge** (`absurd ↕ stable`, "how determined") and **truth** (`potential ↔ potential`, "which way").
The `value` is what the Klein gauge (`negate`, `conflate`) reflects; the `evidence` is the lossless carrier every op accumulates.

## Install & run

Zero dependencies, ESM only, Node ≥ 20.

```sh
pnpm test      # node --test
```

## Usage

```js
import { articulate, predicate, posit, settle, brim, vanish } from "@lenticule-science/metrologic/bilattice";

const posited = settle(posit(predicate(articulate(["socrates", "mortal"]))));
posited.sheaf.section;   // the knowledge-least fixed point (what is known)

const undetermined = vanish(posit(predicate(articulate(["socrates", "mortal"]))));
undetermined.apex;       // the cells settle and brim disagree on — the void cone
```

Narrower imports via subpaths: `@lenticule-science/metrologic/bilattice/charge`, `/descent`, `/cone`, `/void`.

## API (by module)

### `charge` — the carrier and its value-algebra

`present`, `isTop`, `negate`, `conflate`, `joinKnowledge` ⊕, `meetKnowledge` ⊗, `joinTruth` ∨, `meetTruth` ∧, `leqKnowledge`, `compareKnowledge`, `aggregate`.

### `descent` — the four-regime descent

`articulate`, `predicate`, `cohere`, `posit`, `commutate`, the modal generators (`possibilizeKnowledge`/`necessitateKnowledge`, `possibilizeTruth`/`necessitateTruth`, with their `raise*`/`lower*` steps), `settle`, and `compare` (the consistent / paraconsistent split).

### `cone` — the counit/dual cones

`brim` (knowledge GFP), `adjudicate` (truth LFP → verdict), `presume` (truth GFP).

### `void` — the void reads and non-finite duals

`gap`, `vanish` (the knowledge void cone), `estrange` (the transfinite complement), and the aperiodic monad `saturate` / `transfer` / `twistor` / `precipitate`.

## Learning the math

In-depth docs live under [`docs/learning/`](docs/learning) (Diátaxis: tutorials, how-to guides, reference, explanation), carried over from the kernel and rewritten for this package's layout.

## Verification

The test suite is property/law-style: the bilattice laws (commutativity, associativity, idempotency, identities, the two involutions, de Morgan, lossless evidence), the descent end-to-end (measured-not- seeded, the cones bracketing the free bits, the void gap), and the aperiodic monad.
The recreation was additionally checked byte-for-byte against the original kernel across the charge algebra, the descent, the cones, the void, and the monad.

## License

Follows the repository.
(The repo declares no top-level license yet; this package ships none and is marked `private`.)
