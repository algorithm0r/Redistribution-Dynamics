# DEVPLAN — Employment Simulator

Living design document. We add models and mechanics here as we work them out.
Nothing below is frozen; expect revision.

## Vision

Simulate **employment** as one instance of a broader class: **exchanges**
between agents. An exchange is a transfer of value (labor, goods, money,
favors, obligations) under some set of terms. We want to model how exchanges
form, what terms they settle on, and how many such exchanges aggregate into
larger economic and social patterns.

## Guiding questions

- What is the smallest set of primitives that can represent both an employment
  relationship and, say, a one-off sale or a favor?
- How do agents decide whether to enter an exchange, and on what terms?
- What state persists between exchanges (reputation, wealth, obligations)?
- How does time work — discrete ticks, events, continuous?

---

## Architecture

Built on the games-class simulation framework (lineage: HexPipes → Random
Exchange → here). We took the **bare framework** — the generic machinery — and
left the domain layer as stubs to be filled by the dictated models. The closest
cousin, `../Random Exchange`, already models employer/employee wealth transfer;
we are not copying its domain code, but it's the reference for how this
framework is specialized to exchange.

### Layers

**Framework (generic, stable):**
- `gameengine.js` — `GameEngine`: entity list, per-frame `update()`/`draw()`,
  `updatesPerDraw` fast-forward, input capture.
- `timer.js` — fixed-max-step frame timer.
- `util.js` — `randomInt`, `generateNormalSample` (Box-Muller), colour helpers,
  `requestAnimFrame`, `download`, DB-status helpers.
- `graph.js` — time-series line plot. `histogram.js` — distribution heat-strip.
- `assetmanager.js` — image preloader + uniform `downloadAll(callback)` start.
- `index.html`, `style.css` — canvas + control-panel shell.

**Parameters + data machinery (the part we deliberately reuse):**
- `parameters.js` — one flat `PARAMETERS` record (domain + framework/db
  sections) plus `loadParametersFromUI()` / `saveParametersToUI()`. Serialized
  verbatim into every saved packet, so a run reproduces from its parameters.
- `datamanager.js` — samples every `reportingPeriod` ticks, ends the run at
  `epoch` (or a model-defined absorbing state), and ships a packet to the DB via
  `socket.emit("insert", …)`.
- `main.js` — connects the socket, wires control buttons, cycles runs.
- `runs.js` — list of per-run `PARAMETERS` overrides (experiment definitions).
- `runner.js` — headless Node worker-thread batch runner; loads the *same* sim
  files in a VM context and writes straight to MongoDB.
- `../Server` — shared socket.io → MongoDB server (`insert/find/count/...`).
  **Not copied** — we point `PARAMETERS.ip` at it. (DB name:
  `employment_simulator`.)

**Domain layer (stubs — to be defined by the models):**
- `agent.js` — `Agent`: a participant's state and per-tick behaviour.
- `population.js` — `Population`: owns agents, drives tick / data / draw; holds
  population-level dynamics (matching, clearing, entry/exit, interventions).
- `observer.js` — `Observer`: on-canvas visualization (placeholder for now).

### Data flow

`main.js` makes a `Population` → each tick `Population.update()` steps every
`Agent` and applies population dynamics → `DataManager.update()` samples and,
at run end, sends the packet → server inserts into Mongo. `runner.js` replays
the identical path headlessly for batch experiments.

### Conventions (inherited)

- **Run naming / batches:** runs carry a `runName` and a `collection` (a Mongo
  collection acting as a batch, e.g. `batch_001`); distinguish runs by name
  prefix. Define the naming scheme per experiment in this file.
- **Reproducibility:** never rely on hidden state — everything a run needs lives
  in `PARAMETERS` so the stored `parameters` block fully reconstructs it.
- **Replications:** stochastic runs are repeated with `runner.js --reps N`.

---

## Models

> The first model will be dictated and recorded here.

### Model 1: (to be dictated)

_TBD — Chris dictates. We then fill in: `PARAMETERS` domain fields + UI inputs,
`Agent` state/behaviour, `Population` dynamics, `DataManager` time-series, and
`Observer` visualization._

## Open questions

- Scope of v1: a single exchange type (employment) vs. several from the start.
- What carries over between exchanges (reputation, obligations, memory of
  partners)?
- Time model: pure discrete ticks (current default) vs. event-driven.

## Roadmap

- [x] Scaffold project: repo, README, DEVPLAN, DEVLOG, .gitignore.
- [x] Stand up the bare framework (machinery copied/cleaned; domain stubbed).
- [ ] Record Model 1 (dictation).
- [ ] Implement Model 1 across the domain layer.
- [ ] Define first experiment batch in `runs.js`; verify in browser + runner.
