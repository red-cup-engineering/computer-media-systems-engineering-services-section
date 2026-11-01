# @lenticule-science/metrologic

The one logic kernel every 561-group and family-engine package imports: bilattice
predication as the floor, an opt-in categorical hyperdoctrine over it, a charge
readout utility, Chu spaces over FOUR, and the settled math modules that computer
packages import as their semantic substrate.

This package is ESM-only, Node >=20, and organized by explicit subpath exports.
It does not provide a broad default import.
Consumers should import the math surface they actually descend through.

## The three families

- **`@lenticule-science/metrologic/bilattice`** — the floor. The four-regime descent
  (`articulate → predicate → posit → settle`) over a lossless four-valued
  evidence carrier, charge value-algebra (`joinKnowledge`, `meetTruth`,
  `negate`, `conflate`, `isTop`, ...), both cone pairs (`brim`/`adjudicate`/
  `presume`), and the void reads (`saturate`, `precipitate`, `estrange`,
  `vanish`, ...). Zero dependencies. Everything else in this package is built
  on top of it, or is independent of it — nothing upstream of it depends on
  anything else here. Narrower modules: `@lenticule-science/metrologic/bilattice/charge`,
  `@lenticule-science/metrologic/bilattice/descent`, `@lenticule-science/metrologic/bilattice/cone`,
  `@lenticule-science/metrologic/bilattice/void`.
- **`@lenticule-science/metrologic/hyperdoctrine`** — opt-in. The categorical hyperdoctrine
  over the bilattice floor: quantifier adjoints (`existsAlong`/`forallAlong`),
  Frobenius reciprocity, Beck-Chevalley, and Lawvere comprehension, over a
  general finite fibration. A from-scratch recreation of legacy `voidmath`'s
  `predication-fibration`/`predication-hyperdoctrine` theorems, restated with
  hand-rolled validation in place of `voidmath`'s `ajv`-based schema checking
  — zero runtime dependencies here too. Nothing in `bilattice` depends on this;
  pull it in only if you need the categorical layer. Narrower modules:
  `@lenticule-science/metrologic/hyperdoctrine/order`, `@lenticule-science/metrologic/hyperdoctrine/adjoints`,
  `@lenticule-science/metrologic/hyperdoctrine/comprehension`.
- **`@lenticule-science/metrologic/readout`** — a charge-to-style utility, derived from the
  bilattice order rather than an ad-hoc switch statement: `place` classifies
  any charge into one of the four regimes, `knowledgeWeight` and `salience`
  give a total order over them (absurd < active < potential < stable),
  and `styleFor`/`assertStyleTable` look a charge up in a caller-supplied,
  validated style table. Written to absorb the FOUR-to-style tables that were
  hand-duplicated in the `abrash` and `tsander` renderers.

## Other surfaces

- `@lenticule-science/metrologic/chu` - Chu spaces over FOUR and Chu transforms.
- `@lenticule-science/metrologic/type-theory` - type-theoretic utilities.
- `@lenticule-science/metrologic/obstruction` - temporal firing cohomology of settlings.
- `@lenticule-science/metrologic/number` - the number tower and exact integer matrices.
- `@lenticule-science/metrologic/spectral` - spectral location and inversion.
- `@lenticule-science/metrologic/verdier` - Verdier and gauge machinery.
- `@lenticule-science/metrologic/dframe` - d-frame cohomology.
- `@lenticule-science/metrologic/dgen` - d-generator tools.
- `@lenticule-science/metrologic/closure` - closure ordinals and fixed-point iteration.

Each surface has its own README in the corresponding directory.

## Use From Computer

Computer packages should name their descent explicitly:

```js
import { settle } from "@lenticule-science/metrologic/bilattice";
import { existsAlong } from "@lenticule-science/metrologic/hyperdoctrine";
import { place, styleFor } from "@lenticule-science/metrologic/readout";
import { fromMatrix } from "@lenticule-science/metrologic/chu";
```

Do not rederive bilattice, hyperdoctrine, readout, or Chu operations locally.
If a computer package needs new mathematics, build it in the lowest owning computer package first, document the boundary, and upstream only after the math itself has settled.

## Development

```sh
pnpm test
```

The package has no runtime dependencies.
