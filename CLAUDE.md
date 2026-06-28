# CLAUDE.md — Redistribution Dynamics

Session bootstrap for any instance working in this directory. Read top-to-bottom
before touching code.

## Read this first (in order)

1. `DEVPLAN.md` — the living design. Vision, the dimension-space framing of
   redistribution regimes, Model 1 / Model 2 (genome) / Model V (village grid).
   This is current truth; amend it in place as the design moves.
2. `DEVLOG.md` — what happened, newest at top. Read the top few entries to learn
   the state of play before doing anything.
3. `~/.claude/conventions.md` — the cross-project engineering standard this repo
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
| `agent.js` | `Agent`: stock, hunger, frozen boon/bane genes, social genome (τ,θ,φ,κ,λ,coop), gather/consume/spawnChild. |
| `population.js` | Single-population model (Model 1 regimes + `genome` regime). |
| `village.js` | Model V village layer: `genePolicy` (the vote), `applyGenomePolicy`, `pourWaterFill`, `Village`. |
| `world.js` | Model V grid: `World` (torus), reproduction/fission/extinction/migration/catastrophe, `WorldDataManager`, `WorldObserver`. |
| `datamanager.js` / `observer.js` | Single-population data + render entities. |
| `gameengine.js` `timer.js` `util.js` `graph.js` `histogram.js` `assetmanager.js` | Generic framework (GameEngine lineage). |
| `main.js` | Browser entry: socket connect, tab/button wiring, run cycling. Loads last. |
| `runs.js` | Per-run `PARAMETERS` overrides (experiment definitions). |
| `runner.js` | Headless Node worker-thread batch runner; loads the **same** sim files via `vm`, writes to MongoDB. |
| `smoketest.js` / `worldsmoke.js` | Headless, no-Mongo sanity runs with printed verification numbers. |
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
- **The shared `../Server` (socket.io → Mongo) is referenced, never copied.**
  Point `PARAMETERS.ip` at it (currently `research.climbinggiants.com:8888`).
- **No build step, no modules, no frameworks.** `<script>` tags in dependency
  order; everything global. `main.js` is wired last.
- **Browser and headless share the exact sim files** via the `vm` context in
  `runner.js`/smoke loaders — never fork the sim core. If you add a sim file,
  add it to those loaders too.
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

## Collaboration & gotchas

- **Ground in live state before asserting** — read DEVLOG/source, don't trust
  stale memory. Hand Chris the experiential checks (the live page, visual feel)
  that can't be verified headlessly; verify the rest with the smoke runs.
- The live site is HTTPS (Pages); the DB socket must be HTTPS with a valid cert or
  the browser blocks it. The visual sim runs fine with the DB indicator red —
  logging is optional for the demo.
- `runner.js` rewrites top-level `const`/`let`/`class` → `var` so the sim files
  load in a `vm` context. Keep new top-level declarations rewrite-safe.
- Confirm irreversible ops (DB drops, file overwrites) before running them.
