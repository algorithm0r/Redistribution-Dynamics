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

Stage 1 runs in the browser: Mode 1 (fixed population, hunger as a counter) with
four automatic regimes — `none`, `share`, `theft`, `pool`. Live readout of stock
inequality (Gini), stock levels, and cumulative hunger.

## Run

Open `index.html` in a browser. Use the control panel to pick a regime and
parameters; **Start Experiment** cycles through the defined runs. Saving results
to MongoDB requires the shared `../Server` running (optional for the visual demo).

- Headless batch → MongoDB: `node runner.js`
- Quick no-database check: `node smoketest.js`

## Structure

- `DEVPLAN.md` — the evolving design: model, regimes as a dimension space, modes.
- `DEVLOG.md` — append-only chronological record (newest first).
- Framework: `gameengine.js`, `timer.js`, `util.js`, `graph.js`, `histogram.js`.
- Domain: `agent.js`, `population.js`, `observer.js`, `datamanager.js`,
  `parameters.js`, `runs.js`, `runner.js`.
