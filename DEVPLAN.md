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
gradient (uncoupled): ↓`pNoGather`, ↑`pNoConsume`; the global optimum (0, 1) is a
perfect gatherer that never needs to eat — a degenerate attractor. `coupleTraits`
removes that attractor: the boon and bane become one gene held equal
(`pNoGather == pNoConsume`), so per-tick drift is 0 by construction and the
traits cannot diverge — the gene then tunes activity/variance, not a systematic
advantage. (A future trade-off cost on the boon is the other way to add tension.) **The regime gates selection strength:** under
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

---

### Model 2 — Villages & Group Selection (built; grid live under sweep)

A grid of **villages**, each running the within-village exchange over its own
population every tick. Selection acts at two levels: *within* villages (defectors
out-earn cooperators) and *between* villages (which institutions let a village
persist and spread on the grid). This is the multilevel-selection model; the grid
+ migration rate is the dial that decides which level wins.

**The genome (7 genes, every value in [0,1]).** Six define the *institution* (five
economic + one *constitutional*); one is *behavioral*.

| gene | role | meaning |
|---|---|---|
| **τ** rate | policy | fraction of an eligible agent's **whole** stock collected |
| **θ** threshold | policy | who pays: only agents above the θ **wealth-line** are taxed (θ=0 everyone, θ=1 only the very top) — progressivity lives here. The line is set by `PARAMETERS.thresholdMode` (see note below) |
| **φ** focus | policy | distribute equally (0) ↔ neediest-first (1) |
| **κ** hub | policy | share the hub (= current richest) keeps before the rest is distributed |
| **λ** punish | policy | chance a defector's withheld due is destroyed (costly punishment) |
| **ψ** franchise | policy (meta) | **who votes**: only agents at/above the ψ wealth-line are enfranchised (ψ=0 universal suffrage, ψ=1 only the wealthiest). Same wealth-line as θ but with `≥` so ψ=1 keeps the richest, not nobody. A *constitutional* gene — it doesn't move resources, it reshapes the electorate that decides the other five |
| **coop** | behavioral | chance the agent actually pays in when the enacted policy asks |
| **ω** omega | **null** | INERT tracer: mutates and is recorded exactly like a real gene but read by no dynamics (not voted, redistributed, migrated, or scored). The drift/draft baseline — whatever ω does under a regime is *pure* drift/draft, so any real gene that merely tracks ω is drifting, not being selected. See *Genetic draft* below |
| **T** term | policy (meta) | **how often we vote**: the voted election period. In franchise modes the median `term` gene maps [0,1] → [1, `termMax`] ticks and locks the constitution for that many ticks (institutional hysteresis); under franchiseMode 'off' the term is the fixed `constitutionTerm` and `term` drifts inert like ω. Sibling of ψ (who decides). See *Constitutional layer* below |

**Wealth-line mode** (`PARAMETERS.thresholdMode`, gates both θ and ψ; `wealthLine`
in `village.js`). `'relative'` (default, original): the line = `frac · R`, `R` =
richest stock. `'percentile'`: the line = the `frac`-th **quantile** of the stock
distribution. Relative is anchored to absolute wealth but goes *numb under skew* —
with one rich agent and many poor, a wide band of θ/ψ all cut at that lone agent, so
the gene has a large flat region exactly in the unequal regime the model produces (and
it lurches when the richest agent's identity flips). Percentile makes `frac` map evenly
onto "fraction of the population below the line" whatever the shape, and is robust to a
single runaway agent — at the cost of decoupling from absolute wealth (under near-equality
it still taxes the top `1−θ` even though they're barely richer). Default stays `relative`
so stored runs reproduce; percentile is the better-behaved parameterization for a bounded
`[0,1]` evolved gene.

**Within-village redistribution** (per tick, between gather and consume):
1. **Enact policy.** Each policy gene is set for the village. Two governance
   models below; the resulting `(τ,θ,φ,κ,λ)` is applied uniformly this tick.
2. **Collect.** An agent is taxed only if `stock >` the θ wealth-line (see
   *Wealth-line mode* above; default `θ·R`, R = richest); an
   eligible agent's due = `τ·stock` — a flat rate on **whole** wealth, not just the
   excess above the line (stochastically rounded to an integer, capped at stock). A
   **cooperator** (roll < `coop`) pays it into the pot. A **defector** withholds;
   with prob `λ` the due is destroyed (deadweight), else kept.
3. **Hub.** If `κ>0`, the richest agent keeps `κ·pot`; the rest is distributable.
4. **Distribute.** Split the pot: `φ` fraction goes by **water-filling** (pour
   units into the lowest stocks first), `1−φ` fraction equally to all. Integer
   throughout (per-unit / floor+random-remainder).

Named policies are coordinates: `none` = τ0; `pool` = τ1,θ0,φ0,κ0; `floor` ≈
τ1,θ hi,φ1; `chiefdom` = τ1,φ1,κ>0; `tax` = τ partial; `theft`/`share` differ
only by who defects and `λ`.

**Two governance models (identical genome & partition; differ only in where the
policy genes live and how they're inherited):**
- **Model V (voting).** Policy genes live on **agents** as preferences; the
  village's enacted policy is the per-gene **median** of its **enfranchised**
  residents (single-peaked scalars → stable, no Condorcet cycles). Inherited by
  individual reproduction; policy is an emergent phenotype that drifts as the
  population turns over.
  - **Who is enfranchised** is itself voted, via ψ: the electorate is everyone
    with `stock ≥ ψ·R`. Since ψ is both the gate and a thing being voted, a
    `franchiseMode` param breaks the self-reference:
    - **A (universal).** ψ is set by universal suffrage (median over *everyone*);
      that ψ then gates the vote on the other genes. A village only narrows its
      franchise if the whole population's median ψ rises — no minority capture.
    - **B (entrenched, default).** *Last* tick's enacted ψ gates *this* tick's
      whole vote, ψ included (bootstraps at ψ=0). A restrictive electorate keeps
      itself restrictive — the wealthy can vote to stay in charge. This is the
      thematically potent mode; A is the control. ψ is included in the migration
      `policyDistance` (a misfit disagrees about *who votes* too). The live
      question: does disenfranchisement co-evolve with lower redistribution —
      i.e. is `corr(ψ, τ)` negative across villages?
- **Model G (village genome).** Policy genes live on the **village** as a
  heritable unit (no voting); villagers are born into it. Inherited by village
  reproduction/colonization.
- In both, `coop` is individual (within-group selection); the policy genes are
  the between-group force, via ballot (V) or village replicator (G). Build both
  on the same policy space to compare: *does bottom-up voting evolve different
  institutions than top-down group selection?*

**Conventions.** Stocks are **integers**; continuous genes act through
**stochastic rounding** (floor, +1 with prob = fractional part), conserved in
expectation. `pNoGather`/`pNoConsume` are **frozen** (the luck environment, not
under selection).

**Between-group engine — Model V (design complete; building next).** A **10×10**
grid; each cell is empty or holds a village (a variable-size population). Per
tick, each village: gather → enact policy (per-gene median vote) → `genome`
redistribute → consume → **death** → **reproduction** → **fission**; then agents
**migrate** across the grid.

- **Death (variable population, removal not replacement).** An agent whose needs
  went unmet this tick dies with prob `starveDeathChance`; every agent also dies
  with the background `deathChance`. Dead agents are removed. A village at pop 0
  goes **extinct**, freeing the cell.
- **Reproduction (needs-met growth points).** Each tick a village gains +1 point
  per **needs-met** villager (rewards size *and* equity; hoarding earns nothing
  because the starving aren't counted). When `growthPoints ≥ threshold`, a **birth**
  is attempted: it **succeeds with prob `birthProb(pop) = (cap − pop)/(cap − 1)`**
  (linear from 1 at pop 1 to 0 at pop ≥ cap — the *soft cap*), spending the threshold
  points and adding one villager — a random needs-met parent (∝ `stock^birthWealthBias`),
  genes inherited with mutation, endowed `initialStock`. On failure **no birth and no
  points spent** (they bank until pop falls). The birth is
  **asexual** (a mutated clone of the one parent) with prob `1 − pSexual`, or
  **sexual** with prob `pSexual` (recombine with a second random needs-met villager —
  each gene drawn independently from either parent, then mutated; see *Genetic draft*).
  The threshold is **affine in village size**: `threshold = max(1, round(birthThreshold
  + birthThresholdRate · pop))` — with the soft cap in place, `birthThresholdRate` is
  now the **group-reproduction cost / group-selection strength** lever (lower = cheaper
  group births = stronger group selection; swept in `balance_grid`).
- **Soft cap** (`village.birthProb`, 2026-07 — replaced the hard cap + fission below).
  A full village simply stops reproducing (no offspring, no resources spent) and resumes
  as deaths open room — logistic, no cliff. Applies to **both** group births and
  **individual** self-breeding (`individualBirths`, same `birthProb` gate — this also
  fixed the pop-overflow where easy self-breeding blew villages past cap). Colonization
  no longer needs fission: the grid fills via **migration** to empty cells (verified —
  10 seed villages → 100/100). Note: **migration itself does not respect the cap**, so
  popular villages can still exceed it (~1.7× cap observed); accepted for now.
- ~~**Fission.**~~ *(deprecated 2026-07 by the soft cap — group births no longer trigger
  fission; `reproduceGroup` replaced `reproduceOrFission`. `fission`/`fissionTarget`/
  `fissionSize`/`fissionMaxFraction` are dead code/params, kept for now.)* Was: send a
  `fissionSize` fraction to an eligible neighbor as a budding colony.
- **Migration (3 independent vectors, each its own swept probability; one move
  per tick, priority starve → misfit → random).** Destinations may be **empty
  cells** (an empty cell = zero mismatch, so a misfit founds its own village):
  - `pMigrateRandom` → a random neighbor.
  - `pMigrateMisfit` → fires at `pMigrateMisfit · mismatch` (mismatch = policy
    gene distance, normalized); go to the lowest-mismatch neighbor (voice+exit /
    Tiebout sorting).
  - `pMigrateStarve` → if unfed this tick, go to the highest per-capita-stock
    neighbor (fallback random).
- **Luck** set ~1% net positive (`pNoConsume − pNoGather ≈ 0.01`) so villages
  creep upward while starvation still bites (keeps `coop` under selection).
- **Cap** is now a **soft** gate via `birthProb` (see *Soft cap* above), not the old
  hard birth/fission cliff. Defaults: cap 100, social-gene mutation σ 0.02.

This rule set *is* the multilevel selection: `coop` is selected within villages
(via differential survival), the policy genes between villages (needs-met growth
→ fission/extinction). The migration probabilities tune which level wins.

**Genetic draft (why a gene can look selected when it isn't), and the ω/sexual
controls.** Reproduction is asexual (one parent → whole-genome clone) and villages are
small, founded by few, and turn over by fission/extinction. That gives every locus a
*tiny* effective population size and, crucially, **complete linkage**: with no
recombination the whole genome is inherited as a block, so when one successful village
lineage sweeps the grid its *entire* genome — including any neutral gene — sweeps with
it. A neutral trait therefore doesn't diffuse and spread (as panmictic drift would); it
**coheres as a low-variance cloud and fixes at a random boundary** (0 or 1, differing
run to run), which is easy to misread as selection. Two controls disentangle this:
- **ω (omega)** is an inert tracer — it drifts/drafts with zero causal effect, so it
  marks the null. If a "real" gene's trajectory looks like ω's, it's draft, not
  selection. (Confirmed empirically: in `franchiseMode: 'off'`, ψ is causally inert and
  drafts to random poles exactly like ω; a single `off` run's ψ value is meaningless —
  average replicates, which sit near 0.5.)
- **`pSexual`** turns on sexual reproduction (per-gene independent assortment between
  two fed villagers), which restores recombination and dissolves the linkage. Under
  recombination a genuinely selected gene (e.g. `coop`) keeps its signal while a drafting
  neutral gene relaxes back toward 0.5 and spreads. A 50/50 asexual/sexual mix is the
  usual setting. (Within-village homogenization may still blunt this — an open question.)

**Model G** then adds a village-level policy genome (no voting; village-replicator
inheritance on fission) over the identical mechanics, for the V-vs-G comparison.

**Status:** Model V grid fully built, evolving, and under a live distributed sweep.
Social genome τ,θ,φ,κ,λ,ψ,coop + inert tracer ω evolves; **soft-cap** reproduction
(`birthProb`, replaced the hard cap + dead fission); sexual reproduction (`pSexual`);
percentile/relative wealth-line modes. A headless adaptive coordinator (`sweep/`) runs
parameter grids across machines (12 local + 5 mint), Mongo as source of truth. **Now
running:** `balance_grid` (243 cells: individual-selection union × group-rate × franchise
× pSexual). **Next:** analyze `balance_grid`; build the fig/aggregation dashboard (8091);
Model G (village-level genome) for the V-vs-G comparison.

---

### Constitutional layer — signed θ/ψ + termed constitutions (BUILT 2026-07-18)

Two ideas that both push on the *constitutional* (meta) layer — the genes that
reshape *who decides and how* rather than move resources. **Both are now built** and live
under the `constitution_grid` sweep: signed filters (`signedThreshold` + `wealthGate`,
village.js) on θ/ψ only (ρ deferred), and termed constitutions (the `term` meta-gene in
agent.js + `Village.constitution`/`electedTerm` in village.js, world tick threaded in
world.js). Defaults preserve the old model (`signedThreshold` off, `constitutionTerm` 1).
The design notes below stand as the rationale; ρ (signed who-receives) remains unbuilt.

#### 1. Signed wealth-line filters (filter either tail, not just the poor)

Today every wealth-line gate is **one-sided on [0,1]**: raising the gene only ever
filters out the **poor**. θ taxes only agents *above* its line (only the rich pay); ψ
enfranchises only agents *at/above* its line (only the rich vote). We can never say
"only the **poor** pay" or "only the **poor** vote." Generalize the gate to a **signed
selector**: sign = which tail is excluded, magnitude = what fraction of that tail is cut.

**Store it normalized to [0,1] for uniformity** (decided 2026-07-18) — every other gene
lives in [0,1], and keeping this one there means mutation, clamping, `policyDistance`, and
the load/save UI all stay unchanged. The gene `g ∈ [0,1]` maps to the signed selector
`s = 2g − 1` internally:

- `g = 0.5` (`s = 0`) → everyone included (the **neutral center**; symmetric mutation sits
  here, so drift has no directional bias — matches the ω/inert-tracer logic).
- `g > 0.5` (`s > 0`) → keep the **top**; filter out the poorest `|s|` fraction (today's
  behaviour: only the rich pay / vote).
- `g < 0.5` (`s < 0`) → keep the **bottom**; filter out the richest `|s|` fraction (the new
  half: only the poor pay / vote).

The [−1,1] framing above is just the readable form of `s`; on the genome and the wire the
value is the plain [0,1] `g`.

**What variables this works for.** It fits exactly the genes that are *already* a stock
cutoff, and invents one more:

- **θ (who pays)** — native fit. `+θ` = progressive (tax the rich, current); `−θ` =
  **regressive** (tax only the poor — a head-tax / burden-on-the-bottom institution).
- **ψ (who votes)** — native fit. `+ψ` = **plutocratic** franchise (wealth-restricted
  suffrage, current); `−ψ` = **proletarian** franchise (disenfranchise the wealthy — only
  the non-rich vote). The franchise can now be captured from *either* class; the live
  `corr(ψ,τ)` question doubles.
- **A new "who receives" gate (`ρ`?)** — does not exist yet, and is the most novel of the
  three. Distribution currently always flows down (equal share + water-fill to the
  poorest). A signed recipient gate makes `+ρ` = transfer to the poor (current) and
  `−ρ` = **transfer upward** (bailouts / regressive capture — the pot redistributed *to*
  the rich). Worth adding precisely because it's the institution the model can't
  currently express.

**Does NOT fit:** κ (hub concentration, not a population filter — the hub is by
definition the single richest) and β/`birthWealthBias` (already a *continuous* wealth
weighting, not a hard tail cut).

**Tradeoffs to settle before building.**
- Convention preserved: because the gene is stored as [0,1] `g` (mapped to `s = 2g − 1`
  only where it's *used*), the "every gene ∈ [0,1]" convention holds — mutation σ,
  clamping, `policyDistance` (√6 normalizer), and the load/save UI need **no** change. The
  one cost is interpretive: 0.5, not 0, is "no filter," so read plots through the `s`
  mapping.
- **Strongly favours `thresholdMode: 'percentile'`.** The signed cut is clean as a
  quantile (`+f` drops the bottom `f`, `−f` drops the top `f`). In `'relative'` mode the
  negative side ("keep agents below `f·R`") is numb under exactly the skew the model
  produces — it becomes "everyone except the one runaway," mirroring the known
  relative-mode numbness. So this feature and percentile mode go together.

#### 2. Constitutions (slow voting) + meta-voting on the term

Right now `genePolicy` re-votes the median **every tick**, so the enacted policy tracks
the median voter continuously and drifts smoothly with turnover. Instead: hold an
election, **lock the result as the village constitution for a term of `T` ticks**, then
re-elect. ("Burn in a vote for ~100 days" = `T ≈ 100`.)

- **Why it's interesting — institutional hysteresis.** The sitting policy is fixed by the
  electorate *and* wealth distribution *at election time*, then frozen while the economy
  evolves under it. It grows steadily less representative until the next election — a
  poor-elected floor persists as some voters get rich, a restrictive franchise outlives
  the conditions that voted it in. Institutions become **sticky**, which is both more
  realistic and a new source of dynamics (path dependence, mismatch pressure → migration).
- **`T` is a dial between models.** `T = 1` recovers continuous Model V exactly. `T → ∞`
  is a one-shot **founding vote** that never revisits — a democratically *chosen* fixed
  village genome, a bridge toward Model G's heritable genome but set by ballot instead of
  selection.
- **Amplifies ψ entrenchment (mode B).** A constitution locks *who votes* for the whole
  term, not just tick-to-tick — the wealthy can entrench a restrictive franchise for `T`
  ticks at a stroke. The `corr(ψ,τ)` question gains a timescale axis.

**Meta-voting: make `T` itself a voted constitutional gene.** `T` (the *term* gene) is
the meta-gene for **how often we decide** — the sibling of ψ, the meta-gene for **who
decides**. It inherits ψ's self-reference (do you vote on the term under the current
constitution's frozen electorate?) and therefore the same `franchiseMode`-style **A /
B / off** resolution and ω-style inert control.

**The emerging constitutional layer.** These stack into a coherent meta-structure of
genes that reshape the *decision process* rather than move resources:

| meta-gene | question it decides |
|---|---|
| **ψ** franchise | *who* decides (the electorate) |
| **T** term | *how often* they decide (constitutional stickiness) |
| signed θ / ψ / ρ | *which class* each rule binds (incidence, franchise, receipt) |

**Implementation sketch.** Village caches `constitution` + `electedAt`; `enactedPolicy()`
returns the constitution unless `worldTick − electedAt ≥ T`, then re-votes and resets
(needs the World tick threaded to the village). `T` mutates as an integer term (or a
[0,1] gene scaled to a max term). Migration `policyDistance` may want to include `T`
(a misfit disagrees about *how often to vote* too).

## Open questions

- Scope of v1: a single exchange type (employment) vs. several from the start.
- What carries over between exchanges (reputation, obligations, memory of
  partners)?
- Time model: pure discrete ticks (current default) vs. event-driven.

## Roadmap

- [x] Scaffold project: repo, README, DEVPLAN, DEVLOG, .gitignore.
- [x] Stand up the bare framework (machinery copied/cleaned; domain stubbed).
- [x] Record Model 1 (dictation) and reframe regimes as a dimension space.
- [x] Stage 1: Mode 1 with automatic regimes (none / share / theft / pool);
      Gini / stock / hunger; verified in browser + smoke.
- [x] Trait evolution (boon/bane) + random death + couple-traits — explored, then
      froze `pNoGather`/`pNoConsume` for runs.
- [x] Model 2 genome: continuous policy genes (τ,θ,φ,κ,λ) + coop; within-village
      mechanic implemented as the `genome` regime and verified.
- [x] Model V grid built: villages, needs-met growth → birth/fission, extinction,
      three migration vectors, social-gene evolution; headless + browser.
- [x] Soft-cap reproduction (`birthProb`) replacing the hard cap + fission; ω tracer
      gene + sexual reproduction (`pSexual`) to separate genetic draft from selection.
- [x] Headless adaptive batch coordinator (`sweep/`): CI-driven dovetail dispatch,
      heartbeats, Mongo-resume, multi-machine (local + mint), live dashboard.
- [~] Tune luck/params for a clear selection signal; run sweeps. **In progress:**
      `balance_grid` (243-cell individual-vs-group balance sweep) running.
- [ ] Fig/aggregation dashboard (8091): coop/gene-means/ω heatmaps from `balance_grid`.
- [ ] Model G: village-level policy genome (no voting) for the V-vs-G comparison.
- [ ] Signed wealth-line filters (−1…1) for θ / ψ + a new "who receives" gate ρ, so a
      rule can filter *either* tail (regressive tax, proletarian franchise, upward
      transfer); favours percentile mode. *(Proposed 2026-07-18.)*
- [ ] Constitutions: lock the vote for a term `T` (institutional hysteresis; `T=1`
      recovers continuous Model V, `T→∞` = founding vote), then make `T` a meta-voted
      constitutional gene. *(Proposed 2026-07-18.)*
