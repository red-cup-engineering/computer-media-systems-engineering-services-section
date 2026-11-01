# @lenticule-science/metrologic/hyperdoctrine

**The categorical hyperdoctrine over the bilattice — quantifier adjoints, Frobenius reciprocity, Beck–Chevalley, and Lawvere comprehension, on zero dependencies.**

**Opt-in.** Nothing in [`@lenticule-science/metrologic/bilattice`](../bilattice) imports this; this package is a *consumer* of the bilattice floor (`charge.mjs`'s joins/meets/`≤`), not a dependency of it. Import it only where the categorical layer is actually needed.

## The model

A **fiber** over a finite index set `I` is `Map<string, Charge>` — a charge (from `@lenticule-science/metrologic/bilattice/charge`) for every key, required *complete* (every `assertFiberComplete` call checks this — a missing key is a validation error, never a silent `⊥`).

A **predicate morphism** `u: J → I` is a finite index function `{ source: string[], target: string[], map: (j) => i }`. It induces three operations at each σ-dual order (`KNOWLEDGE`, `TRUTH`):

- `reindex(u, φ)` — the pullback `u*`: `(u* φ)(j) = φ(u(j))`.
- `existsAlong(u, φ, order)` — the left adjoint `∃_u`: `(∃_u φ)(i) = ⋁{ φ(j) : u(j) = i }` (⊥ where `u⁻¹(i)` is empty).
- `forallAlong(u, φ, order)` — the right adjoint `∀_u`: `(∀_u φ)(i) = ⋀{ φ(j) : u(j) = i }` (⊤ vacuously where `u⁻¹(i)` is empty).

`reindex ⊣ existsAlong` and `forallAlong ⊣ reindex` are the defining adjunction, **proven, not assumed** — see `test/adjoints.test.mjs`. Two more properties follow from that adjunction and are proven the same way rather than exposed as separate morphisms:

- **Frobenius reciprocity**: `∃_u(u*(φ) ⊓ ψ) = φ ⊓ ∃_u(ψ)` — `test/frobenius.test.mjs`.
- **Beck–Chevalley**: for a pullback square built by `pullbackSquare(f, g)`, `∃_p(q*(φ)) = f*(∃_g(φ))` — `test/beck-chevalley.test.mjs`.

**Comprehension** (`@lenticule-science/metrologic/hyperdoctrine/comprehension`) closes the doctrine: `comprehend(φ, keys, order)` reads off `{ i : φ(i) is designated }` (the order's top value — `⊤` for knowledge, `T` for truth), and `extend(support, keys, order)` is its adjoint inverse. `extend(S) ≤ φ` iff `S ⊆ comprehend(φ)` — `test/comprehension.test.mjs`.

## Install & run

Zero dependencies, ESM only, Node ≥ 20.

```sh
node --test
```

## Usage

```js
import { KNOWLEDGE, reindex, existsAlong } from "@lenticule-science/metrologic/hyperdoctrine/adjoints";
import { comprehend, extend } from "@lenticule-science/metrologic/hyperdoctrine/comprehension";

const u = { source: ["alice", "bob"], target: ["parent"], map: () => "parent" };
const witnessed = new Map([["alice", { value: [true, false], evidence: [[], []] }], ["bob", { value: [false, false], evidence: [[], []] }]]);
existsAlong(u, witnessed, KNOWLEDGE); // Map { "parent" => potential }
```

Narrower imports: `@lenticule-science/metrologic/hyperdoctrine/order`, `/adjoints`, `/comprehension`.

## Provenance

The four properties (adjoints, Frobenius, Beck–Chevalley, comprehension) are the mathematical content of the legacy `voidmath` package's `predication-fibration`/`predication-hyperdoctrine` modules and their `tests/prove-predication-*.mjs` proof witnesses. This is a **from-scratch recreation**, in the same spirit as `@lenticule-science/metrologic/bilattice`'s recreation of `math-kernel`: voidmath's implementation is a six-level JSON-schema-validated directory tree (one file per morphism, `ajv` doing runtime validation against `.schema.json` companions for every intermediate shape). That architecture is not ported. What's ported is the *theorems* — restated directly over a general finite fibration and the real `@lenticule-science/metrologic/bilattice/charge` operations, with hand-rolled validation (`assertMorphism`, `assertFiberComplete`, `assertStyleTable`-style checks) in place of ajv, and zero runtime dependencies.

## License

Follows the repository.
