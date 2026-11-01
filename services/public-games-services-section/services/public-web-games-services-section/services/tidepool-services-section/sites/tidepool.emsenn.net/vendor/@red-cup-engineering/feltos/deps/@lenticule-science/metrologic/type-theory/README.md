# @lenticule-science/metrologic/type-theory

**The theory of terms, types, functions, and programs — over the 561-group math floor.**

`type-theory` collects the foundational notions the rest of the repository's Curry–Howard typing presupposes — what a **term**, a **type**, a **function**, and a **program** are.
Where [`@lenticule-science/metrologic/bilattice`](../bilattice) is the four-valued predication floor and [`@lenticule-science/metrologic/chu`](../chu) is the Chu-space layer over it, `type-theory` is the metatheory that names the objects those layers are *about*.

> **Scaffold.** The concept definitions live in [`docs/`](docs) (`term`, `function`, `program`), seeded from the typed-resource-catalog's `composting/typing` holding area.
> The implementation — `src/` morphisms and a `test/` law suite — is **not yet written**; this package is staged on the [`@lenticule-science/metrologic/chu`](../chu) model so the implementation drops straight in, delegating to bilattice morphisms rather than re-deriving any logic.

## Install

A private workspace package (Node ≥ 20, ESM only).
From the repo root:

```sh
pnpm install
```

## Layout

- [`docs/term.md`](docs/term.md) — a **term**: an element of the free algebra T(Σ, X) over a signature.
- [`docs/function.md`](docs/function.md) — a **function**: a rule assigning each element of one set exactly one element of another.
- [`docs/program.md`](docs/program.md) — a **program**.
- `src/` — the implementation barrel (`index.mjs` / `index.d.ts`); empty until the morphisms land.

## Status

Scaffold, `0.0.x` unreleased.
No API is exported yet — `import … from "@lenticule-science/metrologic/type-theory"` resolves to an empty module by design.
Tracked in [`CHANGELOG.md`](CHANGELOG.md).
