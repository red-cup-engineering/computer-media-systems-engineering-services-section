# @lenticule-science/metrologic/closure

**The closure ordinal κ as a typed morphism — transfinite iteration of a monotone operator to its least fixed point — and the four regimes read off where it stabilizes.**

A closure is a pair `(L, Φ)`: a lattice and a monotone, inflationary operator.
`approx(L, Φ, α)` folds Φ over a constructive ordinal *notation* (zero / succ / limit-with-fundamental-sequence) to compute `F(α)`; `closureOrdinal(L, Φ)` searches the notations for the least fixed point and names the regime by the **shape** of κ — `finite` (κ<ω), `scott` (κ=ω), `transfinite` (ω<κ<ω₁), `aperiodic` (κ≥ω₁).
It is total at every finite observation and honestly non-terminating exactly when the closure is; `aperiodic` is reported by *failing to find* κ below the bound (never a fabricated κ).

This is the constructive counterpart of the floor's `settle` (the finite case, κ<ω): `fromBilattice` reads a posited category's knowledge closure as a `(lattice, phi)` pair, so `closureOrdinal(fromBilattice(c))` recovers `settle`'s depth as a finite κ and returns its glued section as `F(κ)`.

```js
import { reachability, closureOrdinal, fromBilattice } from "@lenticule-science/metrologic/closure";

closureOrdinal(...Object.values(reachability(4, [[0,1],[1,2],[2,3]]))).regime; // → "finite"
```

## API

- **ordinal** — `zero`, `succ`, `limit`, `isZero`/`isSucc`/`isLimit`, `fin`, `plusFin`, `OMEGA`, `omegaTimes`, `OMEGA_SQ`, `toFinite`, `show`
- **iterate** — `approx` (the transfinite approximant F(α)), `orbit` (the runnable ω-part), `stabilizingSup`
- **closure** — `closureOrdinal`, `leastFixedPoint`, `regimeOfOrdinal`
- **lattices** — `reachability` (finite κ), `omegaPlusOne` (κ=ω+1 via a non-Scott-continuous firing), `tower` (aperiodic, witnessed by non-termination), and `fromBilattice` (the bridge recovering `settle`)

## Testing

```sh
node --test
```

Migrated out of `math/playground/src/closure/`, on `@lenticule-science/metrologic/bilattice`.

## License

Follows the repository.
