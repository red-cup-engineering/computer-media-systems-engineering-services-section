# @561-group/okaga

**An ELITE-like space-flight game on [Tsander](../../tools/tsander/) — a terminal wireframe cockpit where the galaxy is the FOLD of the trace.** You are a pilot.
You fly between star systems in 3D wireframe, trade commodities, and program your ship's flight computer in a little [Horsetail](../../../computer/horsetail/) snippet.
The twist Elite could not do: the galaxy is **not** a seeded RNG — it is **settled from a contested trace**.

> Named okaga; rides Tsander as **Tsander←Tsander as Bussard←Bussard** — the homage shape the [design note](../../../computer/docs/dev/notes/tsander-design.md) opens with.
> Tsander is the engine; **okaga is the game.**

## What it is — the four off-classical mechanics

Everything strange about okaga is a direct readout of the computer's bilattice.
The four charges are **content**, not errors:

- **t — a settled system.** A clean federation star you can dock at and trade.
  Solid `#` wireframe.
- **⊥ — FOG.** A system nobody has visited is **unvisited = ⊥**: no evidence, a dim flicker on the scope.
  You cannot trade there; you must **go to settle it**. *Exploration creates the map.* (In the seed, `okaga-reach` is fog until you fly the lane to it.)
- **⊤ — a CONTESTED Schrödinger star.** When two pilots' traces **disagree** about a system — one says `controlled-by federation`, the other the converse — the substrate keeps **both**, and the fold is **⊤, HELD with both witnesses**.
  The star is owned by *both* factions, neither erased.
  On the wireframe it is drawn **TWICE — two offset hulls shivering frame-to-frame** (the shiver is driven by the turn phase, never an RNG, so it is replay-identical).
  In the seed, `vega-prime` is this star.
- **f — a wreck/hazard.** A denied or hostile reading; the autopilot flees it.

THE LAW: ⊤ is **HELD** (a *designed game mechanic* — games are the exception where ⊤ is shown as play, per the audit-is-the-feature note), the trace is **append-only**, evidence is **linear** (a jump burns a fuel witness that cannot be free-duplicated).

## The four modules

1. **`galaxy.mjs`** — the navigable star map read off the federated trace: visit-to-discover (⊥ fog), jump-lanes as relational edges, and **cost-graph chokepoints** (a cut-vertex system is a monopoly, a bridge-edge lane a blockade — the economy *is* the graph topology).
  `contestedSystems` enumerates every Schrödinger star with both witnesses.
2. **`trade.mjs`** — basic commodity trade: a station's market is its `buys`/`sells` predications; `buy` and `sell` **append** rows; your purse and hold are the **fold** of your own trace.
  `arbitrage` finds the buy-low/sell-high spreads and tags the ones a monopoly gates.
3. **`ship.mjs`** — the flight computer you **program in Horsetail**. okaga reads the situation in front of you as a four-valued charge, splices it into your snippet's `*situation*` token, and the snippet's settled charge steers the autopilot.
  The killer move: a **⊤ situation runs BOTH arms HELD** — the ship honestly both-docks-and-flees, and you **cannot select away from it** (the evaluator propagates ⊤ and ⊥ through `if`; you may only reshape the classical t/f faces).
4. **`game.mjs`** — the cockpit loop: **settle** the current system → run the **autopilot** → **jump = federate** (burn fuel, move the ship append-only, *settle* a ⊥ destination) → **project** a Tsander wireframe frame.
  No global clock; a turn advances only when rows are appended.

## Quick start

```sh
node <red-cup-engineering/public-media-services-section>/services/public-fiction-media-services-section/services/public-paracosm-media-services-section/services/okaga-paracosm-services-section/services/okaga-games-services-section/services/okaga-computer-games-services-section/lib/legacy/2026-06-17-okaga/scripts/okaga.mjs --headless      # fly the scripted route as plain text (CI / pipe / audit)
node <red-cup-engineering/public-media-services-section>/services/public-fiction-media-services-section/services/public-paracosm-media-services-section/services/okaga-paracosm-services-section/services/okaga-games-services-section/services/okaga-computer-games-services-section/lib/legacy/2026-06-17-okaga/scripts/okaga.mjs                 # the Arnold alt-screen cockpit (auto-flies the route; q to quit)
npm test                           # galaxy + trade + ship + game proofs
```

The scripted flight runs `sol-iii → barnard-gate → vega-prime → okaga-reach`: out to the **contested ⊤ star** (where the autopilot settles ⊤ and the ship renders doubled beside the doubled star), then on into the **⊥ fog leaf**, which the visit settles.
Watch the `%` glyph: it is the doubled, shivering contradiction the substrate **holds**.

## Programming your ship

The default autopilot is `*situation*` — "trust the bilattice": fly by the charge of the system in front of you.
Rewrite the snippet to fly differently.
A coward who flees even a safe station:

```lisp
(not *situation*)        ; maps a t (safe station) situation to f (flee)
```

But a ⊤ contested star is **always** flown both-arms-held, and ⊥ fog is **always** scanned: you cannot collapse a held contradiction or a held unknown.
That is the law, not a limitation.

## Dependencies

- **[`@561-group/tsander`](../../tools/tsander/)** — the game engine: the federated-trace world substrate, the wireframe renderer, and the Horsetail flight-computer hook.
- **[`@561-group/computer`](../../../computer/)** — the substrate underneath: federation (the galaxy is the tensor ∥ of pilots' traces), the cost-graph (chokepoints), and Horsetail (the ship's language).
- **[`@561-group/arnold`](../../tools/arnold/)** — the terminal the interactive cockpit draws into (imported lazily; headless mode needs only the two above).

THE LAW kept throughout: ⊤ held, append-only trace, evidence linear.
Pure where possible; the only imperative shell is the bin's render loop.
