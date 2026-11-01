# Farstone

Package: `@causeway-services/farstone-561-group`. Scope migration: renamed
from `@red-cup-engineering/farstone-561-group` on 2026-08-27, per the fresh
ruling that Turntide/Farstone packages belong under @causeway-services.

Farstone is the reference authored world built directly on current FeltOS. Its
58-room harbor Bible is inert data; climate, the Director, the Underfarr,
progression, and civic arcs are explicit capabilities composed into
`FARSTONE_RUNTIME`.

There is no Farstone scene subclass or legacy adapter. Player commands enter the
ordered FeltOS engine, capability ticks reduce to immutable world assertions,
and the standard FeltOS HTTP/MUD service owns transport and sessions.

The public root is a server-rendered TUFTE document. In a capable browser it
upgrades through QwzSpace's browser client into the same room and the same
FeltOS world used by JSON and terminal clients; there is no browser-only game
state and no second engine.

## Layout

- `src/farstone-game.mts` converts the authored Bible into a defined FeltOS game.
- `src/farstone-climate.mts`, `director.mts`, `depths.mts`,
  `farstone-progression.mts`, and `farstone-arcs.mts` define capabilities.
- `src/catalogs.mts` and `src/thoughts.mts` are Farstone-owned content.
- `docs/world/harbor.json` is the live authored world.
- `src/serve.mts` is a thin composition of `@red-cup-engineering/world-hosting`'s
  generic `serve` runtime (persistence backend selection, request-driven
  catch-up, the outer HTTP server) with Farstone's own game, room, page, and
  telnet wiring — see "Persistence" below.
- `src/farstone-tufte.mts` and `src/web/` own Farstone's QwzSpace/TUFTE
  presentation. Generic room-to-document shaping remains in QwzSpace.
- `node_modules/` is lockfile-resolved from the internal registry and carried
  in the Cloud Build context because that workstation registry is not exposed
  to Cloud Build. It is deployment material, not source authority.

## Verify and run

```sh
npm test
npm run serve
```

`PORT`/`FELTOS_PORT` and `HOST` configure the HTTP listener; `FELTOS_SAVE_MS`
and `FELTOS_TICK_MS` configure the autosave and world-tick cadence. The suite
includes a complete player campaign, deterministic autonomous simulation, an
exact eight-year replay with bounded checkpoints, and the same eight-year
replay proven byte-exact through a real save/load round trip over the GCS
bucket-store path (against a fake-GCS double — see
`@red-cup-engineering/world-hosting`'s own `test/world-store.test.mjs` for the
generic backend, and this package's `src/world-store-replay.test.mts` for the
Farstone-specific replay).

## World time

**The harbor sleeps between visitors — it does not pretend otherwise.** Cloud Run at
`--min-instances 0` only guarantees CPU scheduling while a request is actually in flight; the
2026-08-19 deploy runbook found the real consequence of assuming otherwise, live: a `setInterval`
world-tick loop and a `setInterval` autosave loop both went quiet between requests, a player's
dropped item was lost, and the world's own tick/assertion counters were observed going
**backward** on reload — an unbounded loss, not the "one autosave interval" the deploy report had
assumed.

The fix is not a bigger timer or a paid always-on CPU flag (see "Deploy" below for that
alternative, and why it wasn't taken here) — it's an honest model that stops pretending a
background clock is running when nothing guarantees it is:

- **Catch-up on request.** World time does not advance on a timer at all. Every incoming request
  first asks "how many real ticks are owed since the world was last advanced?" — computed from a
  persisted `lastTickAt` timestamp (`@red-cup-engineering/world-hosting`'s `clock-store`), not a
  live in-process clock — and runs
  exactly that many ticks, in-request, before the route itself is handled. No request ever *skips*
  elapsed time; it catches up on it, honestly.
- **Capped per request.** A world idle for hours does not make one unlucky visitor's request stall
  for the equivalent wall-clock time. Catch-up is capped at `FELTOS_MAX_CATCHUP_TICKS` (default
  **30** ticks) per request; any remainder is simply left owed and finished by whichever request
  arrives next — a few requests in a row, each bounded, rather than one that hangs. The cap was
  chosen from a direct benchmark of `FARSTONE_GAME`'s own per-tick cost (see the measured numbers
  in `src/world-runtime-live.test.mts`'s benchmark test) so that 30 ticks stays comfortably under a
  second even at the slowest observed per-tick cost — independent of how long the world sat idle
  beforehand.
- **Flush-on-mutation.** Durability no longer depends on a periodic timer firing. Every request
  that actually changes engine state — a catch-up that ran at least one real tick, an explicit
  `POST /tick`, or `POST /connect` joining a new actor — is followed immediately by a save
  (`@red-cup-engineering/world-hosting`'s `world-runtime`'s `postRequestFlush`). `POST /command` alone does not flush: it only
  enqueues, matching feltos's own existing async command/tick/drain pipeline (a queued command
  takes effect, and is saved, at the next tick that admits it — the same small, already-documented
  gap as before, not widened). The `FELTOS_SAVE_MS` interval save in `serve.mts` still runs, but
  it is now a **backstop only** — for the rare case an instance stays warm across idle real-time
  ticks with nothing forcing a flush in between — never the thing correctness depends on.
- **Measured, not assumed.** A real save against a real (loopback) fake-GCS bucket store, driven
  by `FARSTONE_GAME`'s real engine, most recently averaged **~479ms per flush** (10 tick-flushes)
  with the world's engine snapshot at roughly **562KB** JSON-encoded
  (`src/world-runtime-live.test.mts`'s benchmark test reports the live numbers on every run —
  treat the figures here as illustrative of one run, not a guarantee; see the test's own
  `[measured]` console line for the current machine's numbers). The live churn
  proof from the same file also confirms directly: a mutating command survives an idle gap with no
  timer running, and tick/assertion counters never go backward on reload — the exact failure this
  whole model exists to close.

This means the world's apparent passage of time is *discovered* by whichever request happens to
arrive after a gap, not maintained continuously in the background — a world nobody visits for a
day genuinely does not "run" for that day. That is the honest, load-bearing trade this model
makes for `--min-instances 0`'s zero standing cost, not a hidden compromise.

## Persistence

Backend is chosen by `FELTOS_BUCKET`/`FELTOS_SAVE`
(`@red-cup-engineering/world-hosting`'s `world-store`):

- Neither set: in-memory only (no change from before persistence existed).
- `FELTOS_SAVE` set, `FELTOS_BUCKET` unset (local dev, unchanged): a local
  filesystem path, via feltos's own `saveEngine`/`loadEngine`.
- `FELTOS_BUCKET` set (Cloud Run): a GCS bucket, via
  `@red-cup-engineering/footing`'s `gcs-client` (ambient Cloud Run
  service-account credentials through the metadata server — no key file, no
  credential env var). `FELTOS_SAVE`, if also set, becomes the *object name*
  inside that bucket (default `world.json`), not a filesystem path.

The world is one mutable JSON snapshot (feltos's own `encodeSnapshot`
envelope), overwritten with a GCS conditional write guarded by the object's
current generation, retried on a losing race. That's only a genuine
multi-writer hazard if two instances tick the same world concurrently — the
Cloud Run deploy pins `--max-instances 1` specifically so that never happens.

## Deploy

```sh
gcloud storage buckets create gs://<bucket> --location us-central1 --uniform-bucket-level-access
gcloud storage buckets add-iam-policy-binding gs://<bucket> \
  --member="serviceAccount:<project-number>-compute@developer.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"

gcloud run deploy farstone --source . \
  --region us-central1 --platform managed --allow-unauthenticated \
  --min-instances 0 --max-instances 1 --cpu 1 --memory 256Mi \
  --set-env-vars "FELTOS_BUCKET=<bucket>"
```

`--max-instances 1` is load-bearing (see "Persistence" above), not a cost
choice — `--min-instances 0` is the cost choice, safe here because the
world's own state survives scale-to-zero in the bucket.

**Durability model (current, see "World time" above for the full account):**
flush-on-mutation is the guarantee — every request that changes engine state
flushes before it returns, so there is no "up to one autosave interval" gap
to lose. `FELTOS_SAVE_MS` is a backstop only. The genuine remaining gap is
narrower and already named where it applies: `--no-cpu-throttling` is **not**
set (a deliberate cost decision, not an oversight — see below), so between
requests this instance's CPU is not guaranteed scheduled at all; a flush that
is still in flight (rare — flushes are fast, sub-second per the measured
figure above) when the process receives `SIGTERM` on an abrupt scale-down could be
cut short. This is a materially smaller and better-understood exposure than
the interval-timer gap it replaces, not a claim of perfect durability.

**Standing-cost alternative, not taken here, named for the owner:** setting
`run.googleapis.com/cpu-throttling: false` (`--no-cpu-throttling`) would let a
background timer run reliably between requests again, at the cost of the
instance billing for idle CPU time whenever it's warm — a real, small standing
cost increase. The request-driven catch-up/flush model above was chosen
instead specifically so `--min-instances 0`'s zero-cost-at-rest posture stays
true without silently weakening the durability claim; `--no-cpu-throttling` is
a legitimate alternative posture if the owner ever prefers paying for it over
the "no request stalls, but the harbor sleeps between visitors" trade this
model makes.
