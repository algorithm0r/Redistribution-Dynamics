# Redistribution Dynamics

**Live demo:** https://algorithm0r.github.io/Redistribution-Dynamics/

An agent-based simulation of how scarcity and luck produce inequality — and how
different **redistribution regimes** reshape it. Agents gather and consume a
resource each tick; stochastic shortfalls leave some lucky and some hungry. The
question is what happens at the boundary between those with a surplus and those
in need, under institutions ranging from laissez-faire to full pooling.

(Formerly "Employment Simulator." The broader aim is still to situate employment
within a wider space of exchange — see [`DEVPLAN.md`](./DEVPLAN.md).)

## Status

Two models run in the browser and headless:

- **Model 1** — one population under fixed regimes (`none`, `share`, `theft`, `pool`,
  plus an evolved `genome` regime), with Gini, stock and hunger readouts.
- **Model V** — a torus grid of villages, each voting its redistribution policy from
  its members' evolved genes (τ rate, θ who pays, φ focus, κ hub share, λ punishment,
  ψ franchise, T term, plus a `coop` behaviour gene and an inert ω tracer).
  Selection acts within villages and between them (soft-cap reproduction, migration,
  catastrophe). This is the multilevel-selection model and the current frontier.

Two headless sweeps of Model V are complete (`balance_grid`, 243 cells; `constitution_grid`,
45 cells). Cooperation establishes only with no franchise restriction, weak or no
individual selection, and strong group selection; the constitutional layer (signed θ/ψ,
termed constitutions, voted franchise) opens no new cooperative region. Details in
[`STATUS.md`](./STATUS.md) and [`DEVLOG.md`](./DEVLOG.md).

## Run

Open `index.html` in a browser. Use the control panel to pick a model and
parameters; **Start Experiment** cycles through the runs in `runs.js`. Saving results
to MongoDB needs the shared Server (`PARAMETERS.ip`); the visual demo runs without it.

- Run dashboard (aggregate a collection's replicates): open `dashboard.html`
- Headless batch → MongoDB: `node runner.js`
- Distributed adaptive sweeps + figure server: see [`sweep/README.md`](./sweep/README.md)
- No-database checks: `node smoketest.js` (Model 1), `node worldsmoke.js` (Model V)

## Structure

- `DEVPLAN.md` — the evolving design; `DEVLOG.md` — append-only record (newest first);
  `STATUS.md` — where things stand now.
- Framework: `gameengine.js`, `timer.js`, `util.js`, `graph.js`, `histogram.js`, `assetmanager.js`.
- Domain: `agent.js`, `population.js`, `village.js`, `world.js`, `observer.js`,
  `datamanager.js`, `parameters.js`, `runs.js`.
- Headless: `runner.js`, `smoketest.js`, `worldsmoke.js`, `fillcompare.js`,
  `migstats.js`, and `sweep/`.
- Run dashboard: `dashboard.html` / `dashboard.js`.
