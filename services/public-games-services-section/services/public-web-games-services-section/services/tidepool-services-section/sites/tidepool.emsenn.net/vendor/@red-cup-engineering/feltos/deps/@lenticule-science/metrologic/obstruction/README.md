# @lenticule-science/metrologic/obstruction

**The temporal firing cohomology of settlings — H¹ of the settling-associated sheaf, on `@lenticule-science/metrologic/bilattice`.**

The bilattice floor computes a descent's determined apex (`settle`); this package reads the **obstruction** that apex carries.
A **settling** is a monotone sequence of stages; each stage designates a set of predication cells, and knowledge only accumulates (`D_σ ⊆ D_τ` for `σ ≤ τ`).
Some stages are **limit** ordinals.

The settling-associated sheaf is `𝓕_U(τ) = ℤ^{Δ⁺_τ}`, the free abelian group on the cells **newly** designated at `τ` (`Δ⁺_τ = D_τ \ D_{<τ}`).
A **firing** is a stage with `Δ⁺_τ ≠ ∅`; a firing is **non-Scott-continuous** iff it happens at a limit stage — a cell obtainable from no finite sub-stage.
A successor firing is a coboundary (contributes 0 to H¹); a limit firing is a cocycle that is not a coboundary (contributes a generator).
Hence

```
H¹  =  the free abelian group on the cells first designated at a LIMIT stage.
rank H¹ = the number of such cells.
```

The **classifying invariant** `cl-inv(v) = [𝟙_𝓕]` is the complete invariant up to **mutual local derivability (MLD)**: two settlings are MLD-equivalent iff their limit-firing structures agree up to a settling-shift (a monotone reindexing of stages).
It places every settling into one of **four regimes** — `finite` (no limit stage; H¹ = 0), `scott` (a limit stage but no firing at it; H¹ = 0), `transfinite` (a non-Scott-continuous firing at a countable limit; H¹ ≠ 0), and `aperiodic` (a declared ω₁-cofinal firing; H¹ ≠ 0, never stabilizes).

A **bilattice (finite) settling has H¹ = 0** — exactly the dichotomy's finite regime: the floor represents only finite data, so every floor settling has no limit stage.
The non-zero regimes are reached by settlings carrying limit firings, constructed as data.

> Everything here is finite ℤ-linear reading over arbitrary data.
> This is the first piece to migrate OUT of the playground (`math/playground/src/obstruction/`) once it fully settled.
> The cellular cochain construction (ker δ⁰ / im δ⁰ of the settled relation), which depends on a linear-algebra core not yet migrated, stays in the playground.

## Install

A private workspace package (Node ≥ 20, ESM only).
From the repo root:

```sh
pnpm install
```

## Usage

```js
import { settling, h1, classify, clInv } from "@lenticule-science/metrologic/obstruction";

const c = (s, p, o) => ({ subject: s, predicate: p, object: o });

// a transfinite-bounded settling: one cell first appears AT a limit stage — one NSC firing.
const v = settling([
  { designated: [c("a", "r", "b")] },
  { designated: [c("a", "r", "b"), c("L", "r", "L")], limit: true },
]);

h1(v).rank;             // → 1   (one generator per non-Scott-continuous firing)
classify(v).regime;     // → "transfinite"
```

Through the floor — a bilattice settling is finite, so its H¹ vanishes:

```js
import { articulate, predicate, posit } from "@lenticule-science/metrologic/bilattice";
import { settlingOf, h1, apexVoidMatch } from "@lenticule-science/metrologic/obstruction";

const posited = posit(predicate(articulate(["socrates", "mortal"])));
h1(settlingOf(posited)).vanishes;   // → true   (the finite regime)
apexVoidMatch(settlingOf(posited)); // → true   (rank H¹ = rank gr(Void), here 0 = 0)
```

The pure temporal reading is also available via a narrower subpath: `@lenticule-science/metrologic/obstruction/settling`.

## API (by module)

### `settling` — the temporal firing cohomology (pure, zero imports)

- `settling(stages, { cofinal })` — build and validate a monotone settling
- `increments` (Δ⁺_τ), `firings`, `nscFirings` (the limit firings, L_ns)
- `h1` — H¹ = the count of cells first designated at a limit stage
- `clInv`, `mldEquivalent` — the classifying invariant and MLD-equivalence
- `classify`, `depth` — the four-regime classification and the closure ordinal κ

### `floor` — the bridge to the bilattice floor, and the void-dual read

- `designatedCells` — the `[T,F]`-valued cells of a floor valuation
- `settlingOf` — read a floor category's closure trace as a finite settling
- `voidCone` — the floor's `vanish` (the gap `settle` and `brim` disagree on)
- `gradedVoid`, `apexVoidMatch` — the void's associated graded, and `rank H¹ = rank gr(Void)`

## Testing

```sh
pnpm test            # node --test
```

Tests are law-style: H¹ is the free abelian group on the cells first designated at a limit stage (one generator per non-Scott-continuous firing); a finite settling has H¹ = 0; the classifying invariant is complete up to settling-shift (MLD); a bilattice settling is a finite settling; and the apex H¹ matches the void's associated graded.

## License

Follows the repository.
(The repo declares no top-level license yet; this package ships none and is marked `private`.)
