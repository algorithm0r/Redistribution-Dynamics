# DEVPLAN — Redistribution Dynamics

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

### Model 1: Gather–Consume with Exchange Regimes (DRAFT — dictated, not frozen)

**Core loop.** `N` agents, each with a resource **stock**. Every tick each agent:
1. **Gathers** — adds 1 to stock (with probability `1 − pNoGather`).
2. **Consumes** — removes 1 from stock to meet a need (with probability
   `1 − pNoConsume`). If stock is 0 when consumption is due, the agent is
   **hungry** this tick.

**Control.** `pNoGather = pNoConsume = 0`: gather 1, consume 1 every tick.
Steady state, nobody diverges — "bliss."

**Experimental parameters (one boon, one bane).**
- `pNoConsume` — chance to skip consumption. **Boon**: lower need → accumulate
  surplus.
- `pNoGather` — chance to fail gathering. **Bane**: lower output → fall behind.
- Expected per-tick drift of stock = `(1 − pNoGather) − (1 − pNoConsume)
  = pNoConsume − pNoGather`. Net **scarcity** when `pNoGather > pNoConsume`.

**Engine of divergence.** With shared parameters, inequality still emerges from
the *variance* of independent random walks — some agents get lucky and
accumulate, others hit zero. Divergence is driven by **luck, not traits** (same
spirit as the Random Exchange wealth-condensation lineage). The exchange regimes
are institutional responses to that bad luck, tested hardest under net scarcity.

**Two modes.**
- **Mode 1 — Pure dynamics (fixed N, hunger as a counter).** No death, no birth.
  Each regime is a global *treatment*. Question: in a closed pool, do hoarding
  and inequality erupt under a given structure (cf. random asset-exchange /
  wealth condensation)? Hunger accumulates as a suffering counter, never lethal.
- **Mode 2 — Evolutionary (group selection).** Agents die (starvation) and
  reproduce; groups carry an exchange structure and compete. Question: which
  structures are selected for? Here a structure is a *point in the dimension
  space below* — i.e. **the dimensions are the strategy/“genotype” space that
  selection searches.** Identifying them well is therefore doubly important.

**Initial scope — Stage 1 (build this first).** Mode 1 only, with three fully
automatic regimes (no agent decisions, no memory, no persistent relationships),
selected by `PARAMETERS.regime`. Intra-tick order: **gather → redistribute →
consume**, so a transfer can prevent hunger the same tick. The three regimes span
the **Control** axis:
- `none` — no transfers; each agent keeps what it gathers (control baseline:
  does inequality erupt from luck alone?).
- `share` — each agent that would be hungry (stock 0 after gathering) takes 1
  from the richest agent with surplus (stock > 1). One-directional, nothing owed.
- `theft` — coercive variant of `share`: the hungry seize 1 from a *random*
  surplus-holder, and with prob `conflictChance` the resource is destroyed
  (victim loses it, taker gets nothing). Isolates giver-random-vs-richest +
  conflict loss.
- `pool` — each tick, all stock is summed and redistributed equally (integer
  shares; remainder to random agents to conserve the total). "All eat or starve."

(`none` and `pool` are the endpoints of a single dial — tax fraction τ pooled and
split equally; τ=0 = none, τ=1 = pool — available later if a sweep is wanted.)
Metrics: stock Gini, avg/max/min stock, cumulative hunger, stock distribution.
Everything below is the broader map this stage is a first slice of.

**Evolution toggle (first Mode-2 cut).** `evolveTraits` makes `pNoGather` /
`pNoConsume` per-agent **heritable traits** (seeded from the globals, so Mode 1 is
unchanged). When on, a starving agent (needs to consume, empty stock) dies and is
replaced in place by a mutated offspring of a random survivor — Gaussian
mutation (σ = `mutationStdev`), clamped to [0,1], N held fixed. A per-tick random
death (`deathChance`, trait-independent) adds background turnover so the well-fed
also die — this is drift, not directional selection by itself. Selection
gradient: ↓`pNoGather`, ↑`pNoConsume`; the global optimum (0, 1) is a perfect
gatherer that never needs to eat — a degenerate attractor that argues for a
future trade-off cost on the boon. **The regime gates selection strength:** under
`none` many starve (strong selection), under `pool` ~none starve (selection
inert). Metrics add avg traits + cumulative deaths. (`epoch` is now a UI control.)

**Exchange as a dimension space.** A regime is not an item on a list but a
setting of a few axes describing *how a unit of surplus moves from a holder to
someone in need*. The originally-dictated five are spanning examples; varying
the axes recovers them and fills in the rest (incl. institutions in neither
original list — marked † below). In Mode 2 these axes are the strategy space.

Primary axes:
- **Trigger** — what causes a transfer: `none` · `give` (holder's choice) ·
  `take` (recipient seizes) · `pool` (automatic among members) · `levy`
  (central authority).
- **Return** — the claim the transfer creates on the recipient: `none` ·
  `reputation` (diffuse, socially enforced) · `debt` (quantified, scheduled) ·
  `bond` (perpetual claim on future output).
- **Control** — who governs accumulated/pooled surplus: `owner` (each keeps
  title) · `principal` (one boss) · `collective` (members jointly) · `central`
  (authority).
- **Consent** (overlay) — who may refuse: `mutual` · `coerce-holder` ·
  `coerce-recipient`.

Secondary axis (refines Control's distribution rule): **Allocation** — `equal` ·
`by-need` · `by-contribution` · `keep-excess`.

Regimes as coordinates:

| Regime | Trigger | Return | Control | Consent |
|---|---|---|---|---|
| None / laissez-faire | none | — | owner | — |
| Altruism | give | none | owner | mutual |
| Gift + reputation | give | reputation | owner | mutual |
| Potlatch (status race) | give | reputation | owner | mutual |
| Credit / debt | give | debt | owner | mutual |
| Employment | give | bond | principal | mutual |
| Debt-bondage † | give | bond | principal | coerce-recipient |
| Chiefdom / big-man † | pool | none | principal | mutual |
| Community / commons | pool | none | collective | mutual |
| Mutual-aid / insurance | pool | debt | collective | mutual |
| Collective-labor commune † | pool | bond | collective | mutual |
| Tax / UBI | levy | none | central | coerce-holder |
| Theft / predation | take | none | owner | coerce-holder |

The † rows are produced by the axes, not by either of our lists — evidence the
axes are *generative*, not just descriptive (their combinations yield real,
recognizable institutions). Many cells are degenerate or duplicate and are
dropped.

**Derived collection (proposed runs).** Not the full factorial (mostly empty).
Instead: the named anchors above, plus two single-axis **transects** through the
mode-2 battleground —
- vary **Return** `none → reputation → debt → bond` at fixed `Control=principal`
  (how much claim on the recipient before it becomes servitude?);
- vary **Control** `owner → principal → collective → central` at fixed
  `Return=none` (where does surplus governance concentrate?).
Each anchor/transect cell is one `runs.js` entry; in Mode 2 each is a competing
group structure.

**Structural note.** With a single homogeneous good and a single need, there is
no spot market — the only tradeable things are *time* (→ employment/debt) or
nothing. Genuine price-mediated exchange would require heterogeneous goods or
credit. (Explains why the typology jumps from gifts straight to employment.)

**Open questions (load-bearing — resolve before implementing):**
- **Hunger stakes:** resolved by mode — Mode 1: a non-lethal suffering counter;
  Mode 2: starvation kills (death after stock stays empty for k ticks?).
- **Axis set:** are Trigger / Return / Control (+ Consent) the right primaries,
  or prune/rename? These become Mode-2 genes, so settle them early.
- **Mode 2 specifics:** how is a group defined and can agents leave/join? What is
  the group-selection mechanism (differential group growth, migration, group
  fissioning)? Reproduction trigger and cost; death threshold.
- **Storage:** is stock unbounded? Any spoilage/decay (which caps hoarding)?
- **Gather source:** independent infinite environment, or a finite/shared commons
  (adds competition pre-exchange; cf. `../FishingNorms`)?
- **Topology:** global matching (any rich ↔ any hungry) or networks (à la Random
  Exchange employer/employee lists)?
- **Intra-tick timing:** gather → resolve transfers → consume (transfers can
  prevent hunger this tick), or some other order?

**Metrics to compare regimes:** deaths / survival rate, total produced & consumed
(efficiency), hunger-ticks (suffering), Gini of stock (inequality), and
regime-specific concentration (ownership in 4, reputation spread in 3, pool
dynamics in 5).

## Open questions

- Scope of v1: a single exchange type (employment) vs. several from the start.
- What carries over between exchanges (reputation, obligations, memory of
  partners)?
- Time model: pure discrete ticks (current default) vs. event-driven.

## Roadmap

- [x] Scaffold project: repo, README, DEVPLAN, DEVLOG, .gitignore.
- [x] Stand up the bare framework (machinery copied/cleaned; domain stubbed).
- [x] Record Model 1 (dictation) and reframe regimes as a dimension space.
- [ ] **Stage 1: implement Mode 1 with three automatic regimes** (none / share /
      pool); visualize Gini, stock, hunger; verify in browser + runner.
- [ ] Broaden the regime set along the dimension axes.
- [ ] Mode 2: evolutionary group selection over the dimension space.
