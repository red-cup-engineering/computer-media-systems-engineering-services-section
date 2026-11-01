# @lenticule-science/metrologic/verdier

**Verdier duality on substitution settlings — the Anderson–Putnam direct-limit homology, as exact integer linear algebra over our own numbers.**

A substitution over an alphabet `A` is a rule `A → A*`; it IS a morphism — the unique monoid endomorphism `σ*: A* → A*` extending the rule by concatenation.
The substitution **matrix** is not primary: it is the **abelianization** of that morphism, its commutative shadow on `ℤ^A`.
The cohomology of the resulting settling is the Anderson–Putnam direct limit of `ℤⁿ` under `M`:

```
H¹ (sheaf side)   = colim(ℤⁿ, Mᵀ)
H₁ (cosheaf side) = colim(ℤⁿ, M)
```

**Verdier duality** is `H¹ ≅ H₁` as `ℤ`-modules — true because `M` and `Mᵀ` share a Smith normal form.
This package computes both sides and the isomorphism, plus the spectral facts the regime turns on (primitivity, the Pisot test via `@lenticule-science/metrologic/spectral`) and the **d-frame Klein-four gauge** (the value-category self-duality on `FOUR`).
The categorical derived equivalence stays out of scope.

```js
import { verdierDual, abelianize, isPisot, GAUGE } from "@lenticule-science/metrologic/verdier";

const M = abelianize({ a: ["a", "b"], b: ["a"] }, ["a", "b"]).map((r) => r.map(/* → host */));
verdierDual([[1, 1], [1, 0]]);   // → { sheaf, cosheaf, holds: true }
isPisot([[1, 1], [1, 0]]);       // → { pisot: true, outside: 1 }  (Fibonacci)
```

## API

### `substitution` — the morphism `σ*: A* → A*` - `substitute`, `iterate`, `orbit`, `fixedPointClosure`, `abelianize` (the matrix DERIVED, over our ℤ)

### `spectral` — the regime's spectral tests - `charPoly`, `isPrimitive`, `isPisot`, `perronPoly`, `perronConvergent` (exact over our ℚ; the Pisot test delegates to `@lenticule-science/metrologic/spectral/location`)

### `verdier` — the Anderson–Putnam colimit and the duality - `colimStructure`, `verdierDual`, `verdierHolds`, `stepNInvariant`

### `gauge` — the Klein-four value-category gauge on `FOUR` - `FOUR`, `GAUGE`, `fixedSet`, `firingPatternSelfDual`, `inducedPermutation`, `substitutionRuleSelfDual`

The integer linear algebra (`transpose`, `determinant`, `rank`, `smithNormalForm`, `matmul`, `matEqual`) is re-exported from `@lenticule-science/metrologic/number/matrix`.

## Testing

```sh
node --test
```

Property/law tests over named structural substitution fixtures (`test/`).
Migrated out of `math/playground/src/verdier/` onto the stable `@lenticule-science/metrologic/{number,spectral}`.

## License

Follows the repository.
