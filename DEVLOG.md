# DEVLOG — Redistribution Dynamics

Newest entries at the top.

## 2026-06-28

- **New default parameter set (deliberately includes a collapsing config).**
  Changed defaults in `parameters.js` + `index.html`: `epoch` 10000→100000,
  bane/boon (`pNoGather`/`pNoConsume`) 0.1→0.2 (now **net-zero luck**),
  `starveDeathChance` 0.5→0.1, `deathChance` 0.01→0.001, `birthThreshold` (base)
  50→0, `birthThresholdRate` (per-villager) 0→4, `seedPop` 12→30. (Also loosened
  the birthThreshold UI input `min` 1→0.) "N" read as `seedPop`, not the single-pop
  `initialAgents`.
  - **Viability probe (recorded so this isn't rediscovered):** with these defaults
    the world **goes extinct ~t1900** on the default 10×10 / cap 100 / seedVillages
    10 grid. Cause is an *interaction*, not rate 4 alone: under a rate-4 brake a
    seed village of 30 grows toward cap 100 too slowly to fission/colonize before
    `catastropheChance` (0.001/village/tick) wipes it → the grid bleeds out. Each of
    these independently rescues it: rate→1 (fills grid, ~9.7k pop), seedPop→~cap,
    cap→~seedPop (dense fissions fast), or catastrophe→0 (~56 villages). On a dense
    6×6/cap 40/seedPop 30 grid even rate 4 survives. **Chris chose to keep rate 4
    as-is** — the default config is intentionally on the collapse side; tune
    seedPop/cap/catastrophe/rate per experiment.

## 2026-06-27

- **Tax (τ) now applies to whole wealth, not the marginal excess.** Collection
  changed from `due = τ·max(0, stock − θ·R)` to: an agent is taxed only if
  `stock > θ·R`, and then pays `due = τ·stock` (flat rate on whole stock, capped
  at stock). `θ` is now purely the "who pays" eligibility line; progressivity
  lives there, not in marginal bracketing. (At θ=0 this is identical to before —
  the change only bites for θ>0, where the rich now pay on their whole pile.)
  Updated village.js, the gene table + collect step in DEVPLAN, and the inline
  comment. Genome smoke still coordinates, more sharply: g-pool Gini 0.017,
  g-chiefdom 0.572, g-defectors collapses (avgStock 0.2, hunger 5994).
- **Birth threshold is now affine in village size (density-dependent growth
  brake).** Reproduction cost is `max(1, round(birthThreshold + birthThresholdRate
  · pop))`, recomputed each birth on live pop. New param `birthThresholdRate`
  (default 0.0 = old flat behavior, fully backward-compatible) wired through
  PARAMETERS + UI (base field + per-villager-rate field) + `World.birthCost(v)`.
  *Why:* flat cost → constant per-capita birth rate → exponential growth → grid
  saturates by tick ~40–100, which kills migration's colonizing/sorting role for
  ~85% of a run (measured — see below). A positive rate makes the absolute birth
  rate per village ~constant → linear growth → a frontier of empty cells persists.
  `fillcompare.js` (8×8, cap 40, 600t): saturation at tick **92** (rate 0) → **183**
  (0.5) → **412** (1.0); `base 0 + rate 1` ("=pop") → 152; `rate 2` over-brakes
  (stalls at ~5 villages, growth ≈ death). `worldsmoke` unchanged at rate 0 (within
  stochastic noise; capped scenarios pinned at 1440).
- **Instrumented migration firing (`migstats.js`).** Faithful counting twin of
  `migrationDest` (identical RNG order → identical trajectory). Findings on a
  saturated 8×8: **random** fires at its nominal rate (10% → reliable mixing);
  **misfit** is throttled ~10–30× by the mismatch multiplier (effective <1%, since
  avg policy mismatch is only 0.03 uniform / 0.09 random founders); **starve** is
  nearly inert (≤0.2% of agent-ticks are starved-and-eligible, and the death pass
  runs first, so starvers die before they flee). Across all vectors, movers land on
  an **empty** cell ~0% of the time once the grid is full — migration becomes pure
  shuffling, not colonizing. This is what motivated the growth-brake above.
- **Aligned with the shared conventions (added the two missing carriers).** Audited
  the repo against `~/.claude/conventions.md` (this project is one of its cited
  exemplars). Conformant on the big things — append-only DEVLOG, living DEVPLAN,
  `PARAMETERS`-as-source-of-truth serialized into every packet, Server referenced
  not copied, model/view `*Observer` split. Closed the two gaps that mattered:
  added a per-project **`CLAUDE.md`** (the convention's #1 propagation carrier:
  read-first sequence, doc map, never-violate rules, style, gotchas) and a
  **`.gitattributes`** pinning `eol=lf` on served JS/CSS/HTML/JSON/MD (we deploy to
  Pages from a CRLF machine), CRLF on `*.ps1`. Left the cosmetic drift as-is
  (`parameters.js` vs `params.js`, vestigial `assetmanager.js`, the `vm`
  `const→var` rewrite, `stage1` collection name) — low value, wide blast radius.

## 2026-06-22

- **Village-level gene histograms + cached policy (kill redundant medians).**
  For each gene, also histogram the *village* value (each village's voted median)
  alongside the agent distribution — shown as a second column of heat-strips
  (agents | villages). While adding it, fixed a real redundancy: the enacted
  policy (5 gene medians) was recomputed in `applyGenomePolicy` every tick, again
  per cell every frame in `draw()`, again in migration, and again in `record()`.
  Now `genePolicy()` is computed once per village per tick in `step()`, cached on
  `v.policy`, and reused by redistribution, drawing, migration, and data
  collection. (coop isn't voted, so its village median is still computed at
  sample time only.)
- **Fixed shared wealth scale for the villager display.** Absolute 0 → 2× global
  average, quantized into `wealthLevels` bands (default 10), cross-village
  comparable.
- **Exposed grid size, sample rate, updates-per-draw to the UI; new death-rate
  defaults.** Added controls for grid size (N×N → gridRows/gridCols), data sample
  rate (`reportingPeriod`, default 100), and updates per draw (`updatesPerDraw`,
  1). Defaults changed: `starveDeathChance` 0.1 → 0.5, `deathChance` 0.001 → 0.01.
- **Histogram polish, FPS readout, migration perf fix.** Fixed `Histogram.fill`
  to tile rows over the full height (was `floor(height/20)`, leaving ~17% blank
  at the bottom). Histograms now overlay each gene's mean as a white line; dropped
  the "living villages" and mean-line graphs, halved the population graph, and
  enlarged the six gene histograms. Added a smoothed **FPS** readout (top-right,
  via `Timer.wallDelta`). **Perf:** migration was calling `enactedPolicy()` (5
  median sorts) *per agent* — O(pop² log pop) per village; now the policy is
  cached once per tick and migration is skipped entirely when all rates are 0.
- **Added per-gene histograms over time.** Following the BioDegen convention,
  `WorldDataManager` now records, each reporting period, a 20-bucket distribution
  of every social gene (τ,θ,φ,κ,λ,coop) across all living agents; `WorldObserver`
  draws six `Histogram` heat-strips (one per gene, value low→high bottom→top) and
  the series ship in the data packet (`geneHistograms`). Repositioned the line
  graphs and shrank the grid cells so all fit on the canvas. Smoke confirms 51
  snapshots/run, each summing to the population.
- **Compacted the control panel + randomized founders.** Reworked the UI CSS so
  panels lay their fieldsets out side-by-side (two columns, ~560px) with compact
  inline label/input rows — much shorter. Added `randomizeGenes` (default on):
  the World seeds each founder with uniform-random social genes (so villages
  start diverse and selection has variation to act on), `seedPop` 30 → 12, plus a
  UI checkbox. `worldsmoke` named scenarios pinned to `randomizeGenes:false`; new
  `random-founders` scenario starts ~0.5 and drifts to tau 0.56 / phi 0.56 over
  500 ticks — a first hint of selection toward redistribution.
- **Built Model V.** New `village.js` (Village + shared `applyGenomePolicy` /
  `pourWaterFill`) and `world.js` (10×10 `World`: per-village economy → needs-met
  growth → birth-below-cap / fission-at-cap, extinction, three migration vectors,
  `WorldDataManager` + grid `WorldObserver`). `spawnChild` now inherits + mutates
  the **social genome** (boon/bane frozen). Added Model V params + control-panel
  fieldset + a `spatial` toggle (`main.js` launches `World` vs `Population`);
  runner/smoke loaders updated; `worldsmoke.js` added. `worldsmoke` (6×6, cap 40,
  500 ticks): grid saturates to 36 villages, social genes inherit + drift,
  defector-pool holds coop≈0.40, migration mixes villages. Single-pop genome smoke
  still reproduces the named policies; boon/bane stay frozen. Known wrinkle:
  migration can push a village slightly over cap (it fissions back down).
- **Finalized the Model V between-group design** (recorded in DEVPLAN). Variable
  population (removal, not replacement): starvation kills with `starveDeathChance`
  plus background `deathChance`; pop-0 villages go extinct. Reproduction via
  **needs-met growth points** (+1 per fed villager/tick → birth below cap, fission
  at/above cap) — rewards size + equity, ignores hoarding. Fission sends ~half to
  any neighbor below `fissionMaxFraction·cap` (empty included). Migration = three
  independent swept vectors (`pMigrateRandom`, `pMigrateMisfit`, `pMigrateStarve`)
  with destinations that include empty cells (misfits found their own villages).
  Luck ~1% net positive. Hard cap (no probability blend). Ready to build.
- **Wrote the Model 2 design + built the within-village genome mechanic.** DEVPLAN
  now has the Model 2 section: 6-gene genome (τ,θ,φ,κ,λ policy + coop behavioral),
  the within-village redistribution pipeline (collect on a progressive bracket →
  defectors withhold/are punished → hub keeps κ → distribute by φ water-fill),
  the two governance models (V voting / G village-genome), and integer/stochastic-
  rounding conventions. Implemented as the `genome` regime in the single-population
  sim (genes uniform, policy = per-gene median, integer water-fill); added util
  `stochasticRound`/`median`, 6 gene params + UI fieldset, genome runs, and smoke
  scenarios. Verified coordinates: g-pool≈pool (Gini 0.028), g-none≈none, g-floor
  strong leveling, g-chiefdom Gini 0.60 (entrenched hub), g-defectors collapse
  (avg stock 0.5, hunger 4868) — redistribution is fragile to defection. Grid,
  migration, village reproduction, and social-gene evolution still pending.

## 2026-06-18

- **Added `coupleTraits` toggle.** Ties `pNoGather` and `pNoConsume` into one
  gene held equal, so the boon/bane can't diverge. Per-tick drift is then 0 by
  construction (removes the uncoupled (0,1) immortal-hoarder attractor); the gene
  tunes activity/variance instead. Seeded from the average of the two globals;
  mutation/inheritance keep them equal. Added UI checkbox, a coupled run, and a
  smoke scenario. Smoke (2000 ticks): uncoupled none+evo diverges (0.080/0.109);
  coupled stays locked (0.100/0.100) with lower avg stock (no runaway).

## 2026-06-17

- **Added random death chance to evolution.** New `deathChance` (per-tick,
  trait-independent) folded into the replacement pass alongside starvation:
  `replaceStarved` → `replaceDead`. Gives background generational turnover so the
  well-fed also die (curbs the immortal-hoarder attractor). Smoke (2000 ticks,
  0.001): none+evo deaths 117→316 with traits still moving directionally;
  pool+evo 0→213 deaths but traits stay neutral — random death is drift, not
  selection. Added `deathChance` UI control.
- **Added trait evolution (first Mode-2 cut) + epoch control.** `pNoGather` /
  `pNoConsume` are now per-agent heritable traits seeded from the globals. New
  toggle `evolveTraits`: a starving agent dies and is replaced in place by a
  mutated offspring (Gaussian σ = `mutationStdev`, clamped) of a random survivor,
  N fixed. DataManager tracks avg traits + cumulative deaths; Observer adds a
  traits graph + readout. Added `evolveTraits` / `mutationStdev` / `epoch` UI
  controls and two `stage2` evolving runs. Smoke (2000 ticks): none+evo → 117
  deaths, traits move the right way (pNoGather 0.092↓, pNoConsume 0.106↑);
  pool+evo → 0 deaths, traits frozen (no starvation = no selection). The regime
  gates selection strength. Degenerate optimum (0,1) noted as a hook for a future
  trade-off cost on the boon.
- **Renamed project to "Redistribution Dynamics"** (from "Employment Simulator")
  across README, DEVPLAN/DEVLOG headers, page title, and the data DB name
  (`redistribution_dynamics`). Folder name left unchanged to avoid disrupting the
  active session path. Created a private GitHub repo and pushed:
  https://github.com/algorithm0r/Redistribution-Dynamics
- **Added the `theft` regime.** Coercive variant of `share`: hungry seize 1 from
  a *random* surplus-holder (not the richest), and with prob `conflictChance`
  (default 0.25) the resource is destroyed. New param `conflictChance` + UI +
  run entry. Smoke (2000 ticks, p=0.1): theft → Gini 0.50 (higher than none's
  0.40) with hunger 306 — random taking + conflict loss is worse than laissez-
  faire on both inequality and hunger. Confirmed pool pools *all* accumulated
  stock (not just the round's gather); tax-on-flow shelved as redundant given
  1 resource/tick.
- **Implemented Stage 1 and got a demo up.** Mode 1 with three automatic regimes
  (`none` / `share` / `pool`), intra-tick order gather → redistribute → consume.
  `Agent` holds stock + hunger counter; `Population` runs the regimes;
  `DataManager` tracks Gini / avg-max-min stock / cumulative hunger / stock
  distribution; `Observer` draws the agent grid and live graphs. Added Stage 1 UI
  controls, the three `runs.js` entries, and `smoketest.js` (headless, no Mongo).
  Headless smoke (2000 ticks, p=0.1 each): none → Gini 0.38, hunger 600; share →
  Gini 0.31, hunger 0; pool → Gini 0.05, hunger 0. Inequality erupts from luck
  under `none`; `share` ends hunger but not inequality; `pool` flattens both.
  Committed `6d3dc25`.
- **Reframed Model 1 regimes as a dimension space.** Chris's point: the five
  dictated regimes are spanning *examples*, not a list; my additions were
  variants along hidden axes. Identified primary axes — Trigger, Return, Control
  (+ Consent overlay, Allocation secondary) — and placed all regimes as
  coordinates; the axes generate institutions in neither original list
  (debt-bondage, chiefdom, collective-labor commune). Added the two run modes:
  Mode 1 (fixed N, hunger = non-lethal counter, regimes as treatments) and Mode 2
  (evolutionary group selection, where the axes *are* the strategy space).
  Proposed a derived run collection: named anchors + two single-axis transects
  through the Mode-2 battleground. DEVPLAN updated; still draft.
- **Drafted Model 1** (gather–consume with exchange regimes) into `DEVPLAN.md`
  from Chris's dictation. Captured the core loop, the two experimental params
  (boon = chance-not-consume; bane = chance-not-gather), five exchange regimes
  (none / altruism / gift-reputation / employment / community), candidate
  additional regimes (credit-debt, predation, central tax, insurance pool,
  potlatch), and the load-bearing open questions (hunger stakes, luck vs. traits,
  regime-as-treatment vs. competing strategies, intra-tick timing). Not frozen.
- Process note: DEVLOG is append-only, newest entry at top — prepend new dated
  entries; do not rewrite prior ones.
- **Stood up the bare framework.** Studied the games-class framework lineage
  (`../HexPipes`, `../Random Exchange`, `../Server`). Decision: reuse the generic
  machinery, leave the domain layer as stubs for the dictated models ("bare
  framework only").
  - Framework: `gameengine.js`, `timer.js`, `util.js`, `graph.js`,
    `histogram.js`, `assetmanager.js`, `index.html`, `style.css`.
  - Params + data machinery: `parameters.js` (PARAMETERS + load/save UI),
    `datamanager.js` (sample → epoch → `socket.emit("insert")`), `main.js`
    (socket connect + run cycling), `runs.js`, `runner.js` (headless worker-thread
    batch runner → MongoDB). DB name: `employment_simulator`; points at the
    shared `../Server`, which is not copied.
  - Domain stubs awaiting Model 1: `agent.js`, `population.js`, `observer.js`.
  - All 14 JS files pass `node --check`. App loads and shows a placeholder
    Observer (tick / agent count / run name).
  - Recorded the architecture in `DEVPLAN.md`.
- Initialized the project: git repo, `README.md`, `DEVPLAN.md`, `DEVLOG.md`,
  `.gitignore`. Framed the project as a simulation of employment within a
  broader model of *exchanges* between agents.
- Next: Chris dictates Model 1 into `DEVPLAN.md`; we then implement it across the
  domain layer.
