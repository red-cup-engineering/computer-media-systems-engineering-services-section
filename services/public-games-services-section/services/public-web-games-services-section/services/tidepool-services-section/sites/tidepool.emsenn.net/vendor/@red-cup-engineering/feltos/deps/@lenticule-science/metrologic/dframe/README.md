# @lenticule-science/metrologic/dframe

**The d-frame-valued (bigraded) cohomology of a substitution settling, and the composed-duality (strong-MLD) orbit classification — on `@lenticule-science/metrologic/{chu,number,verdier}`.**

The `Ab`-valued `H¹` (the obstruction/verdier rank) is a **shadow** of a finer, two-sided object. d-frame data values each cell in the bilattice `FOUR`, so each firing contributes to a **truth side** `L₊` and/or a **falsity side** `L₋` according to its value:

```
t → (1, 0)   f → (0, 1)   ⊤ → (1, 1)   ⊥ → (0, 0)
```

The d-frame cohomology is the pair `(L₊-rank, L₋-rank)`; its abelian shadow recovers the two `Ab` shadows.
The **composed Verdier duality** `D = D_sp ∘ D_val` swaps truth ↔ falsity (negation, fixing `⊤`, `⊥`); the **strong-MLD theorem** says a settling is self-dual under `D` iff every firing is `⊤` or `⊥` — which is exactly firing-pattern self-duality under negation, so it reuses the `verdier` gauge.

```js
import { dframeCohomology, classifyOrbitType } from "@lenticule-science/metrologic/dframe";

dframeCohomology([[1, 1], [1, 0]], ["t", "f"]);  // per-firing structure + the (L₊, L₋) shadow
classifyOrbitType(["top", "bot"]);               // → { orbitType: "self-dual", ... }
```

## API

### `cohomology` — the bigraded d-frame cohomology - `SIDE_CONTRIBUTION` (each value's `(L₊, L₋)`, read off the floor's charge), `classifyFiring`, `perFiringDframe`, `dframeCohomology`

### `orbits` — the composed-duality (strong-MLD) orbit type - `classifyOrbitType`, `verifyComposedSelfDuality`

## Testing

```sh
node --test
```

Property/law tests over named structural substitution fixtures (`test/`).
Migrated out of `math/playground/src/dframe/` onto the stable `@lenticule-science/metrologic/{number,verdier}`.

## License

Follows the repository.
