# @lenticule-science/metrologic/chu

**Chu spaces over the four-valued bilattice — a clean Node API on `@lenticule-science/metrologic/bilattice`.**

A [Chu space](https://en.wikipedia.org/wiki/Chu_space) is a relation `r : A × X → K` valued in an alphabet `K`, presented as a carrier you can read two ways (rows and columns) and dualize.
Here `K` is **FOUR**, the Belnap–Ginsberg four-valued bilattice (`t` / `f` / `⊥` / `⊤`).
Many things in this repository are exactly this shape:

| Chu space | points `A` | states `X` | value |
| --- | --- | --- | --- |
| EAVT memory | Entity | ⟨Predicate, Object⟩ | charge |
| an office table | Office | Capability | holds |
| readiness | Work | Check | FOUR |

This package lifts those one-off carriers — previously hand-rolled per consumer, each re-deriving the four-valued logic inline — into one reusable, kernel-backed implementation.

> **No re-derived logic.** Every bilattice operation (`negate`, `conflate`, the two joins, the two meets) delegates to a morphism in [`@lenticule-science/metrologic/bilattice`](../bilattice).
> FOUR is the floor's charge algebra wearing Belnap's names; this package adds the naming, the charge⇄name codec, and the Chu structure on top — nothing more.

## Install

A private workspace package (Node ≥ 20, ESM only).
From the repo root:

```sh
pnpm install
```

## Usage

```js
import {
  FOUR, knowledgeJoin, negate,            // the bilattice (a reading of the kernel)
  fromMatrix, row, col, extension, dual,  // Chu spaces
  chuTransform, composeTransforms,        // the category Chu(FOUR)
} from "@lenticule-science/metrologic/chu";

// An office table as a Chu space: Office × Capability → holds.
const table = fromMatrix(
  ["leader", "worker"],
  ["read", "write"],
  { leader: { read: FOUR.T, write: FOUR.T }, worker: { read: FOUR.T, write: FOUR.F } },
);

row(table, "worker");        // → [{ state:"read", value:"t" }, { state:"write", value:"f" }]
extension(table, "write");   // → ["leader"]            (the positive column)
dual(table);                 // → transpose + linear negation (dual ∘ dual = id)
```

Narrower imports are available via subpaths: `@lenticule-science/metrologic/chu/four`, `@lenticule-science/metrologic/chu/chu`, `@lenticule-science/metrologic/chu/transform`.

## API

### `four` — the bilattice (kernel-backed)

- `FOUR`, `GLYPH`, `isFour`, `asFour`
- `toCharge`, `fromCharge` — the charge⇄name codec (FOUR ≅ the kernel charge's value bits)
- `negate`, `conflate` — the two involutions (the Klein gauge)
- `knowledgeJoin` ⊕, `knowledgeMeet` ⊗ — the knowledge order (identity ⊥ / ⊤)
- `truthJoin` ∨, `truthMeet` ∧ — the truth order (identity f / t)

### `chu` — the spaces

- `chuSpace(points, states, valueAt, { absent })`, `fromMatrix(points, states, matrix, { absent })`
- `row`, `col`, `extension` — the two reads and a state's positive extension
- `transpose`, `dual` — the duality (`dual` is transpose + linear negation; both are involutions)
- `settleColumn`, `settleRow` — fold a line through a bilattice join (default ⊕)
- `isChuSpace`

A cell outside the matrix reads as `absent`: `FOUR.
F` by default (closed-world — absence is the negative charge), or `FOUR.
BOT` for an open-world carrier such as EAVT memory (absence is unwitnessed).

### `transform` — the category Chu(FOUR)

A morphism `C → D` is an adjoint pair `(forward : A → B, backward : Y → X)` satisfying `s(f a, y) = r(a, g y)`.

- `checkChuTransform` → `{ ok, failures }`, `chuTransform` (throws on a non-adjoint pair)
- `idTransform`, `composeTransforms` (re-checks adjointness), `dualTransform` (the dual functor)
- `isChuTransform`

## Testing

```sh
pnpm test            # node --test
```

Tests are property/law-style over the exhaustive 4-element alphabet: the bilattice laws (commutativity, associativity, idempotency, identities, the involutions, de Morgan), the Chu involutions (`transpose² = id`, `dual² = id`), and the category laws (adjointness, composition typing, the dual functor).

## License

Follows the repository.
(The repo declares no top-level license yet; this package ships none and is marked `private`.)
