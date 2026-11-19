# CLAUDE.md — Redistribution Dynamics

Session bootstrap for any instance working in this directory. Read top-to-bottom
before touching code.

## Read this first (in order)

1. `DEVPLAN.md` — the living design. Vision, the dimension-space framing of
   redistribution regimes, Model 1 / Model 2 (genome) / Model V (village grid).
   This is current truth; amend it in place as the design moves.
2. `STATUS.md` — where things stand right now, on one screen.
3. `DEVLOG.md` — what happened, newest at top. Read the top few entries to learn
   the state of play before doing anything.
4. `~/.claude/conventions.md` — the cross-project engineering standard this repo
   is one of the exemplars for. Read it before structural/DB/deploy work.

## What this is

A browser ABM of how scarcity + luck produce inequality, and how redistribution
regimes reshape it — culminating in a multilevel-selection model (a grid of
villages whose redistribution policy is an evolved genome). Vanilla-JS Canvas
microframework, no build step. Live: https://algorithm0r.github.io/Redistribution-Dynamics/

## Document map

| File | Role |
|---|---|
| `parameters.js` | The one `PARAMETERS` global (domain + framework/db) + load/save-UI. **Source of truth**, serialized verbatim into every saved packet. |
| `agent.js` | `Agent`: stock, hunger, frozen boon/bane genes, social genome (τ,θ,φ,κ,λ,ψ,coop + inert ω + `term`), gather/consume/spawnChild (incl. sexual recombination, `pSexual`). |
| `population.js` | Single-population model (Model 1 regimes + `genome` regime). |
| `village.js` | Model V village layer: `genePolicy` (the vote), `wealthGate` (signed θ/ψ), `applyGenomePolicy`, `pourWaterFill`, `Village` (incl. termed constitution). |
| `world.js` | Model V grid: `World` (torus), soft-cap reproduction (`birthProb`; fission code is dead)/extinction/migration/catastrophe, `WorldDataManager`, `WorldObserver`. |
| `datamanager.js` / `observer.js` | Single-population data + render entities. |
| `gameengine.js` `timer.js` `util.js` `graph.js` `histogram.js` `assetmanager.js` | Generic framework (GameEngine lineage). |
| `main.js` | Browser entry: socket connect, tab/button wiring, run cycling. Loads last. |
| `runs.js` | Per-run `PARAMETERS` overrides (experiment definitions). |
| `runner.js` | Headless Node worker-thread batch runner; loads the **same** sim files via `vm`, writes to MongoDB. |
| `smoketest.js` / `worldsmoke.js` | Headless, no-Mongo sanity runs with printed verification numbers (`worldsmoke` ends in three PASS/FAIL mechanism checks). `SEED=<n>` makes their output reproducible. |
| `regress.mjs` + `regress.baseline.json` | Fixed-seed output baseline (conventions §5): per-key hashes of 11 scenarios' packets + seeded smoke stdout. `node regress.mjs` must say IDENTICAL after any change that should not move output; `--capture` re-baselines (only for a change that moves output by design, said in DEVLOG). |
| `switchsmoke.mjs` | One short smoke per diagnostic/control switch (S1–S5): fields populated and sane, and a diagnostic switch leaves every existing key identical. |
| `db.js` | Vendored scaffold DB client v2 (experiment protocol, conventions §4). Re-vendor from `~/.claude/scaffold/`, never edit here. Not a sim file (not loaded by the browser or `SIM_FILES`). |
| `fillcompare.js` / `migstats.js` | One-off headless probes (grid fill speed; migration-vector instrumentation). |
| `dashboard.html` / `dashboard.js` | Run dashboard: aggregates a collection's replicates from Mongo and steps through runs. |
| `sweep/` | Distributed sweep: coordinator found by identity (`ports.mjs`, `/whoami`), seeded one-shot workers via `cpuslot`, runs saved through `db.js` into `expNNN_slug` collections; `experiment.mjs` (registry), `packetsize.mjs` (BSON-size probe); fig server (:8091). Own README. |
| `index.html` / `style.css` | Canvas + tabbed control panel. |

## Never violate

- **DEVLOG is append-only, newest at top.** Prepend a new dated entry; never edit
  or rewrite a past one.
- **DEVPLAN is amended in place** (it's the bible, not a log). Strike deferrals
  through with a forward pointer; don't delete them.
- **`PARAMETERS` is the single source of truth.** Every configurable lives there,
  concern-grouped and inline-commented; it ships verbatim in each data packet so a
  run reproduces from its stored parameters. No hidden state.
- **Boon/bane (`pNoGather`/`pNoConsume`) are frozen during a run** once evolution
  of the social genome is in play — only the social genes mutate in `spawnChild`.
- **The shared Server (socket.io → Mongo) is referenced, never copied.** It is not
  in this tree; point `PARAMETERS.ip` at it (currently `research.climbinggiants.com:8888`).
- **No build step, no modules, no frameworks.** `<script>` tags in dependency
  order; everything global. `main.js` is wired last.
- **Browser and headless share the exact sim files** — never fork the sim core.
  `runner.js` and the smoke/probe scripts load them in a `vm` context;
  `sweep/headless.mjs` loads them into the main realm by indirect `eval` (~7–10×
  faster). If you add a sim file, add it to every loader, including `SIM_FILES`
  in `sweep/headless.mjs`.
- **Secrets never committed.** No keys/certs/tokens in-tree.

## Style

- One class per file; the GameEngine entity contract is `update()` + `draw(ctx)`.
- High comment density explaining *why*; JSDoc on classes/functions; box-drawing
  section banners in `parameters.js`.
- "If a method doesn't use `this`, it's a function" — `genePolicy`,
  `applyGenomePolicy`, `pourWaterFill` are free functions for exactly this reason.
- Integer stocks throughout; use `stochasticRound` to keep transfers integer
  without bias.
- Compute a village's enacted policy **once per tick** (`genePolicy` → cached on
  `v.policy`) and reuse it for redistribution, drawing, migration, and recording.
  Don't recompute medians per-agent or per-frame.

## Ports — APPLIED 2026-11-18 (the note below is the history)

`sweep/coordinator.mjs` now binds through `sweep/ports.mjs` (vendored from the scaffold) with
`/whoami` = {project: 'Redistribution Dynamics', identity: <collection>}; `worker.mjs` and
`launch.mjs` find it by identity and refuse any other (`COORD=` pins a remote one, still
identity-checked). The figserver still defaults to :8091 (it only reads). The original note:


The sweep servers here default to ``PORT || 8090` (coordinator) and `8091` (figserver)`, and so do two sibling projects
(PopGenSim, Hierarchical Trades). Seen live on 2026-09-04: Hierarchical Trades and PopGenSim were both occupying 8090/8190 while this project's sweep code still defaults to 8090.

Two consequences, in ascending order of how much they should worry you:

1. Batches collide on startup and get hand-shifted (`PORT=8190`) to get around it. Annoying.
2. Quieter and much worse: `sweep/worker.mjs` defaults to a fixed coordinator URL and enrolls with
   **whatever answers**, never checking which collection it reached. Point a worker at a box
   where a different sweep holds that port and its runs are filed into the wrong
   Mongo collection (these workers write straight to Mongo, so the pollution is in the data itself) — no error, nothing in any log. That is a data-integrity bug wearing a
   port-conflict costume, and it is the one worth fixing.

**Suggested, when this code is next touched:** adopt `~/.claude/scaffold/ports.mjs`
(written and tested 2026-09-04 against a harness; not wired into this project).

- **Use a range, not a number.** Derive the port from (project, collection) into the
  **8200–8699** band, probe forward when a port is taken, and print the URL actually bound
  instead of assuming one. The band dodges what is already spoken for on this box and mint
  (8080 media-dashboard, 8081 Pulse, 8099 castd, 8123 DEM-GPU, 8787 Agora, 8888 the Server).
- **Then make collisions harmless.** Servers answer `/whoami` with `{project, identity}`;
  clients call `discover({project, identity})` and **exit if their collection isn't found**
  rather than attaching to a stranger. This is the half that actually matters — a hash alone
  will not save you (26 projects into 125 blocks is a birthday problem: ~93% chance of some
  collision, and 3 real collided pairs across the current project list).

Full rationale: `~/.claude/conventions.md` §4a.

## Collaboration & gotchas

- **Ground in live state before asserting** — read DEVLOG/source, don't trust
  stale memory. Hand Chris the experiential checks (the live page, visual feel)
  that can't be verified headlessly; verify the rest with the smoke runs.
- The live site is HTTPS (Pages); the DB socket must be HTTPS with a valid cert or
  the browser blocks it. The visual sim runs fine with the DB indicator red —
  logging is optional for the demo.
- `runner.js` and `sweep/headless.mjs` rewrite top-level `const`/`let`/`class` →
  `var` so the sim files load headless. Keep new top-level declarations rewrite-safe.
- Confirm irreversible ops (DB drops, file overwrites) before running them.
