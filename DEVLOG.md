# DEVLOG — Redistribution Dynamics

Newest entries at the top.

## 2026-07-17 — headless sim ~7–10× faster: vm sandbox → main-realm execution

**Done:** Chased down why headless sweep runs chug (15–30 min) while the browser rips
through the same high-pop configs. Root cause: `sweep/headless.mjs` ran the sim in a
`vm.createContext` sandbox, where the hot loop's constant `PARAMETERS.*`/global reads go
through the contextified global proxy V8 won't inline — vs fast native globals in the
browser. Benchmarked vm-vs-native on the same sim: **7.2×** (fair interleaved, both under
sweep contention) / **8.2×** / **10.3×** (two validations). Fixed by loading the sim into
the **main V8 realm** via indirect `eval` (same `const/let/class→var` rewrite, same
browser-global shims) instead of vm — safe because each worker is one process running one
config at a time and `runConfig()` fully resets `PARAMETERS`+`idCounter` between runs (as
the browser reuses globals across runs). Restarted the whole live fleet on it: 12 desktop
(coordinator kept up — no dupes) + 5 mint (scp'd the file, Node 18, not a git checkout).

**Changed:** `sweep/headless.mjs` (vm → main-realm indirect-eval; expanded header comment).
`runner.js` left on vm, untouched. `~/.claude/conventions.md` updated with the perf caveat
(the "share sim files via vm" convention now notes vm's ~7–10× hot-loop tax + main-realm
alternative). Project memory `vm-sandbox-7x-slowdown.md` added.

**State:** live-confirmed. Desktop cells now ~480–1270 ticks/s (were ~60–220); mint runs
finish in ~70–100s (were ~400–540s). Validation: identical packet shape (all 8 gene keys
incl ω), same coop basins vs vm path — difference is pure RNG noise (identical JS). Fix is
committed; `balance_grid` sweep still filling. Not yet applied: `runner.js` (RD) and
domestication's `runner/headless.mjs` carry the same vm tax.

**Next:** analyze `balance_grid` as it fills (now much faster); optionally port the same
fix to `runner.js` / domestication if their run times matter.

## 2026-07-17 — session close: soft-cap model + distributed adaptive sweep (also: draft controls, perf, CVD palette)

**Done:** (1) `thresholdMode` relative|percentile for θ/ψ wealth-lines. (2) CVD-safe
viridis + Okabe–Ito palette across all renders. (3) ω inert tracer gene + sexual
reproduction (`pSexual`) — proved ψ's drift-to-boundary in `off` is genetic **draft**,
not selection (recombination de-concentrates inert genes, coop stays selected). (4)
`birthWealthBias` β (P∝stock^β) replacing the `wealthProportionalBirth` boolean. (5)
Hot-path perf: quickselect median (no map+sort alloc), squared-distance ranking — ~20–25%
faster/tick. (6) **`sweep/`** — a distributed adaptive coordinator ported/streamlined from
the domestication runner: CI-driven dovetail dispatch, heartbeats + dead-worker reaping,
Mongo-resume, file-served dashboard (mean-coop viridis cells, bistable ◤, chugger 🐌,
timing/ETA), multi-machine (12 local + 5 on mint via SSH). (7) **Soft cap** — `birthProb(pop)
= (cap−pop)/(cap−1)` gates both birth channels; retired the hard cap + (dead) fission.

**Changed:** DEVPLAN status/roadmap updated (Model V live under sweep; soft cap; sweep
infra). DEVLOG per-topic entries below. New `sweep/` dir (coordinator/worker/headless/
launch/stats/grid/dashboard). `reproduceOrFission`→`reproduceGroup`; `fission*` now dead.

**State:** builds/runs. `worldsmoke` franchise-check PASS, `smoketest` Ginis stable,
`medianInPlace` == old median on 120k cases, recombination unit-checked, soft-cap pop test
(mean village ~74 < cap, total 12k→7.4k). **Live now:** `balance_grid` sweep (243 cells)
running — 17 workers / 2 hosts, no dupes, dovetailing; Mongo `redistribution_dynamics.
balance_grid`. @ `ddffe25` + this session's commit (no tags; pre-commit stamp `ddffe25-dirty`).
Caveat: migration still overflows village cap (~1.7×), accepted.

**Next:** analyze `balance_grid` as it fills; build the fig/aggregation dashboard (8091);
possibly soft-gate migration-in; Model G (village-level genome). To iterate the dashboard,
edit `sweep/dashboard.html` (file-served, no restart); coordinator *logic* changes need a
**full-fleet** restart (coordinator-only restarts risk a transient dupe).

---

- **Soft carrying-capacity replaces the hard cap + fission; sweep redesigned as an
  individual-vs-group balance grid (`balance_grid`, 243 cells).** The hard cap was a
  cliff (birth if `pop<cap` else fission), fission wasn't actually functional, and easy
  self-breeding blew villages past cap (pop ~12k, chugging). New `village.birthProb(pop)
  = (cap−pop)/(cap−1)` gates **both** group births (`reproduceGroup`, formerly
  `reproduceOrFission`) and individual self-breeding: a full village stops reproducing
  (no offspring, no resources spent) and resumes as deaths open room — logistic, no
  cliff. Verified: mean village pop settles ~74 (< cap), total pop 12k→7.4k (~35% faster
  runs), grid still fills 100/100 via migration (fission dead — `fission*` now unused).
  Caveat logged: **migration still doesn't respect the cap** (popular villages reach
  ~1.7× cap); accepted for now. Dispersal alternative rejected — in a saturated grid
  neighbors are equally full, so it collapses back to a hard cap.
  - **New sweep** `balance_grid`: individual-selection axis as a **union** (β and ind are
    the same knob, so no cross) — `base` + β-arm {0.5,1,2,4} + ind-arm {2,4,6,8} (9) ×
    **group axis** `birthThresholdRate` {2,4,6} (3) × franchise {off,A,B} (3) × pSexual
    {0,0.5,1} (3) = **243**. `pMigrateRandom` 0 → **0.02** (connectivity + colonization +
    less draft). Launched clean (12 local + 5 mint); dashboard reworked for the new axes
    (rows = individual conditions, cols = group rate, facet by franchise×pSexual — all in
    the file-served `dashboard.html`, no coordinator restart).

- **`sweep/` — adaptive batch coordinator for the 225-cell selection×draft grid** (ported
  and streamlined from the domestication project's runner). The factorial is
  `birthWealthBias{0,.5,1,2,4} × individualBirthThreshold{0,2,5,7,9} × franchiseMode{off,A,B}
  × pSexual{0,.5,1}` = 225 cells (ω tracks the null in each), into a dedicated collection
  `select_draft_grid`. Collapsed domestication's driver+coordinator+queue into ONE
  in-memory `coordinator.mjs` (HTTP `/claim` fewest-dispatched-first, `/complete`,
  `/status`) that grows each cell's rep budget from the live coop CI until sufficient or
  `maxN`. Adaptive stopping (`stats.mjs`) ported from their "sufficiency" test: splits a
  bistable metric into `p(establish)` (Wilson CI) + `level|establish` (t CI) — reduces to
  a plain coop-CI when unimodal, handles the bistable cells we expect. Metric = final mean
  coop, `minN=3`. `worker.mjs` reuses the `vm` sim-loader (`headless.mjs`, same source as
  `runner.js`) → writes the full packet to the shared Mongo `../Server` → reports coop.
  `launch.mjs` spawns N workers; multi-machine (12 local + 5 on mint pointing at
  `<main-box>:8090`). **Ports 8090/8091** so it runs beside domestication's 8088/8089.
  Verified: grid = 225 unique cells; `stats.evaluate` correct on establish/collapse/
  bistable/seed; coordinator dispatch+adaptive+terminate via a mock-worker loop; headless
  runs a config end-to-end (packet + ω + coop, params applied). Fig dashboard deferred to
  a next stage (raw aggregation → heatmaps). See `sweep/README.md`.
  - **Launched live + operational hardening.** Ran it across both boxes: **12 workers local
    + 5 on mint** (deployed via `tar | ssh mint`, `npm install`, detached `launch.mjs`;
    17 workers, 2 hosts). Added **per-worker heartbeats** (chunked sim loop yields so I/O
    flushes) feeding a live dashboard panel (cell + tick/50000 bar + pop + host), **dead-
    worker reaping** (no heartbeat in `STALE_MS`=120s → reclaim the cell), and **Mongo as
    source of truth**: the coordinator seeds cell samples from existing docs on startup
    (restart-safe — never re-runs completed reps) and re-syncs every `SYNC_MS`=180s. Gotcha
    logged: the Bash tool's network sandbox silently blocked the Server (DNS failed) —
    runs need it disabled. Bistable cells already appearing (e.g. `b0_i0_fB_s0` = 0.79/0.09),
    which the two-regime stopping rule is built for.
  - **Dispatch/dupe hardening (live debugging).** (a) Dovetail: dispatch the cell with the
    fewest COMPLETED reps not currently running, so every setting gets rep 1 before any gets
    rep 2. (b) In-flight is derived from live **heartbeats + open claims**, not the
    per-session `dispatched` counter — the counter resets on coordinator restart and caused
    the new coordinator to re-hand-out cells still being run (duplicate dispatch); `needsMore`
    keyed on Mongo-durable `samples`. (c) Anti-dupe margins: 15s startup grace (in-flight
    heartbeats re-register before dispatch resumes) + 300s stale-timeout (a load-delayed
    worker is never reaped and its cell re-run). Rule: **full-fleet restarts are dupe-safe;
    coordinator-only restarts risk a transient dupe.** (d) Dashboard served from
    `sweep/dashboard.html` (read per request) so UI tweaks need no coordinator restart. (e)
    Grid cells show **mean coop** (viridis) not rep counts; **bistable** cells get a ◤ corner
    wedge (regime split, % in tooltip); running cells an orange ring; sufficient a black box.
    Grep gotcha: the tool defaulted to the `sweep/` subdir mid-session — pass explicit `path`.

- **`birthWealthBias` (β) replaces the `wealthProportionalBirth` boolean + hot-path perf.**
  Generalized wealth-weighted group births from a boolean to a continuous exponent:
  `pickByStock` now draws a parent ∝ `stock^β` (`birthWealthBias`), so β=0 is uniform
  (wealth-blind), β=1 is the old proportional behaviour, and β>1 is progressively steeper
  toward the wealthy — a scale-invariant individual-selection dial to sweep. Updated
  `parameters.js`/UI (checkbox→number), `world.js` birth site (the `? :` branch collapses),
  `runs.js` (baseline β=0, wealth-parent β=1), and `dashboard.js` (with a fallback so old
  records that stored the boolean still render). **Performance:** the per-tick vote was
  doing 6 `median(voters.map(...))` per village = ~2.4M `map()`+`sort()` allocations/run.
  Replaced with a reused scratch buffer + `medianInPlace` — a 3-way (Dutch-flag)
  quickselect with a deterministic median-of-three pivot (no `Math.random`, so the global
  RNG stream and thus run trajectories stay bit-identical). Validated against the old
  `median` on 120k random cases (odd/even/duplicates/sorted/all-equal): exact match.
  Also dropped the `sqrt` from `bestFitNeighbor` (added `policyDistanceSq` — ranking only,
  monotonic → same argmin; kept `policyDistance` for the misfit probability). Profiled
  before/after (4000 ticks, 100 villages): genePolicy −~20%/call, applyGenomePolicy
  −~22%/call (GC relief), median sorts eliminated → ~20–25% off per-tick time. Smoke
  tests unchanged (franchise-check PASS), all files `node --check` clean.

- **ω (omega) inert tracer gene + sexual reproduction — separating genetic draft from
  selection.** Investigating why ψ "selects" toward 1 (or 0) under `franchiseMode: 'off'`
  where it's causally inert, the variance decomposition showed it isn't spreading drift
  but a *concentrated* cloud sweeping to a random boundary — genetic **draft**: villages
  are small/founder-bottlenecked and reproduction was fully **asexual** (one-parent clone
  = complete linkage), so a neutral gene rides whichever village-lineage wins an economic
  sweep. Two controls added to make this legible and testable:
  - **ω**, an inert null gene (`agent.js`): mutates and is recorded through the full
    covariance/histogram/tercile machinery but read by **no** dynamics. It's the draft
    baseline — a real gene that merely tracks ω is drifting, not being selected. Added to
    `PARAMETERS` (default 0.5), the genome, `geneNames`/`GENE_INFO`, endpoint sample, both
    histogram grids (now 8 rows), UI + load/save. `POLICY` constant introduced in
    `dashboard.js` so the voted-gene graphs stay 6-wide while ω rides in the histogram grid.
  - **`pSexual`** (default 0): fraction of village group-births that are **sexual** —
    `Agent.breedWith(mate)` recombines two fed villagers with per-gene independent
    assortment; `reproduce(parent, pool)` dispatches sexual-vs-clone. Self-breeding and
    founder cloning stay asexual. Recombination dissolves the linkage that enables draft.
  - **Decisive result** (real regime, `off`, 15k ticks, 4 reps, within-pop SD; uniform
    ≈ 0.289): inert genes de-concentrate under recombination — ω 0.168→0.275, ψ
    0.141→0.253 — while the **selected** gene coop stays pinned (0.137→0.137). So the
    coherent-cloud-to-a-pole *was* draft (breaks under recombination), but coop's tight
    distribution is genuine selection (survives it). Recombination mechanics unit-checked
    (breedWith 50/50 per-gene, 0 spurious; pSexual=0 → 100% clones). Smoke tests unchanged
    (relative-mode & franchise-check PASS); all files `node --check` clean. Defaults keep
    every stored run reproducible. `policyDistance` ψ-coupling left in deliberately (it's a
    weak, non-directional nudge — see the 5-rep test — and the same draft hits every gene).

- **Colour-blind-safe palette across every render (red↔green was illegible).** A
  colleague with red/green CVD couldn't read the grid — the gene ramp, villager-wealth
  ramp, single-pop grid, and the defector/cooperator tercile colours were all red→green,
  the worst axis for the ~8% of men with the condition. Replaced the whole colour system:
  new `cvdSeq(t)` in `util.js` is a **viridis** sequential ramp (dark purple → teal →
  yellow) — perceptually uniform, CVD-safe on its discriminating endpoints, and monotonic
  in lightness (verified luminance 30→82→111→157→215) so it also survives greyscale. New
  `CVD` (Okabe–Ito qualitative palette) + `GENE_SERIES` (6 CVD-safe gene-series colours)
  centralise the categorical choices. Swapped in everywhere: `world.js` gene legend bar,
  grid cell colour, `drawVillagers` wealth, corr-graph series + legend, coop-tercile
  histogram columns/legend; `observer.js` agent-wealth grid + the pNoGather/pNoConsume
  traits graph; `dashboard.js` COOP_COL / CAT_COLOR / GENE_COL, the threshold overview
  ramp (`ovColor`, was a red→blue hsl sweep through green), and the migration series.
  Tercile scheme is now vermillion = defectors · grey = middlers · blue = cooperators
  (warm-vs-cool, intuitive and CVD-distinct). Legend text updated to match (no more
  "red"/"green" wording). Smoke tests unchanged (colour is draw-only); all render files
  `node --check` clean.

## 2026-07-16

- **Percentile wealth-line mode for θ and ψ (`PARAMETERS.thresholdMode`).** Both the
  "who pays" line (θ) and the "who votes" line (ψ) were computed as `frac · R` with
  `R` = richest stock. Chris spotted the failure mode: under heavy skew (one rich, many
  poor) — the very regime the model produces — `R` is set by the lone outlier, so a wide
  band of θ/ψ all cut at that one agent while everyone else sits far below. The gene has
  a large dead flat region exactly where it matters, and it lurches whenever the richest
  agent's identity flips. New `thresholdMode: 'relative' | 'percentile'`; `'percentile'`
  sets the line to the `frac`-th quantile of the stock distribution, so `frac` maps
  evenly onto "fraction of the population below the line" whatever the shape, robust to
  a single runaway agent. Cost: decoupled from absolute wealth (near-equality still taxes
  the top `1−θ`). Default stays `'relative'` so stored runs reproduce; percentile is the
  better-behaved parameterization for a bounded `[0,1]` evolved gene.
- **Implementation.** New generic `quantile(arr, q)` in `util.js` (linear-interpolated,
  q clamped, `quantile(a,0)=min / 1=max / 0.5=median`). New free function `wealthLine`
  in `village.js` dispatches on the mode; `genePolicy` (ψ) and `applyGenomePolicy` (θ)
  both route through it — single source for the cutoff. UI dropdown + load/save wiring;
  θ label softened to "who-pays cutoff" since the mode now decides what the fraction means.
  Ties at the cutoff fall together (equal wealth → gated identically). `worldsmoke`
  franchise-check still PASS (relative mode byte-identical); an ad-hoc skew test confirms
  the θ taxed-set now sweeps 16→12→8→4→1 across θ∈[0,0.9] in percentile mode vs a flat
  1 across θ∈[0.1,0.95] in relative.

## 2026-06-28

- **Individual-level fecundity options (+ newborns start at 0).** Two new knobs that
  add individual selection alongside group births: `wealthProportionalBirth` (group
  birth picks the parent ∝ stock instead of uniform among fed — `pickByStock`) and
  `individualBirthThreshold` (an agent with ≥ this stock spends it to spawn one child
  of its own per tick, outside the village growth-point budget; 0 = off, cap-gated so
  it can't run away). Both reward wealth accumulation = defection, the individual
  counterweight to group selection: wealth-prop drops mean coop 0.55→0.23; individual
  breeding alone crushed it to 0.05 (when newborns were minted stock). **Set
  `initialStock` 10→0** (founders AND newborns start destitute): stops per-birth
  resource minting and makes individual breeding a genuine cost (parent pays, child
  starts at 0) — it's now self-limiting (lowers pop) rather than exploding. Verified
  viable: defaults ~2.2k pop/full grid; individual th=10 ~1.6k. Also fixed: without
  initialStock=0 + cap-gate, individual breeding ran away (newborns were instantly
  rich enough to re-breed: 7k→130k+).
- **Fix: only needs-met (fed) villagers can be a birth parent.** `reproduceOrFission`
  fell back to the whole village when no agent was fed (`pool = fed.length ? fed :
  v.agents`), so a fully-starved village could still birth from a starved parent off
  *banked* growth points (most visible in tiny villages). Now: if nobody's fed,
  skip the birth and keep the points banked until someone is fed. Contradicted the
  growth-point logic (points are earned by fed villagers, so the parent should be
  one). Viability unchanged — defaults still thrive ~3.2k pop on a full grid, so the
  fallback was a rare edge, not load-bearing.
- **CORRECTION: the default config does NOT collapse.** The earlier "extinct
  ~t1900" note below was measured with migration OFF (all `pMigrate*` = 0, the
  defaults at that time). Once migration was turned on (random 0.01 / misfit 0.25 /
  starve 0.20), the current committed defaults are **viable and thriving**:
  verbatim-defaults runs settle at ~3,500–4,500 pop on a full 100-village grid and
  persist (checked 5k ticks, multiple reps). Controlled A/B (only `pMigrate*`
  toggled, 3k ticks): migration ON ≈ 3,800 pop; migration OFF ≈ 540 pop (low but
  not extinct). So migration — chiefly starve-seeking (agents flee starvation to
  richer neighbours) and misfit sorting (compatible agents concentrate into
  redistributive villages) — is the rescue; the neighbour-scaled catastrophe and
  whole-wealth tax help at the margin. Lesson: re-measure against live params; the
  collapse claim was stale after the defaults changed.
- **Coop-tercile SUB-histograms (full distributions per group).** Reworked the
  gene panel into a 5-column-per-gene grid: `all | defectors | middlers |
  cooperators | villages`, each a heat-strip with its white mean line; the `all`
  column also keeps the three coloured tercile mean-lines. The three middle columns
  are the gene's full 20-bucket distribution within each coop tercile, so a gene
  correlated with cooperation shows its heat shifting up from the defector to the
  cooperator column. Made the strips shorter/narrower (hh 160→128, two cols→five) to
  fit; `geneCoopHist` recorded + shipped (`geneCoopHistograms`). `Histogram` gained
  `labelColor` and skips empty (total=0) snapshots. Probe: the three terciles
  exactly partition the overall agent histogram (bucket-wise sum matches), and τ is
  visibly multimodal within each group (structure the mean alone hid).
- **Coop-tercile gene breakdown on the histograms.** Each record, living agents are
  split by coop rank into thirds (lo=defectors, mid, hi=cooperators); for every gene
  the mean within each third is tracked (`geneCoopMean`, shipped in the packet).
  `Histogram` gained an `overlays` option (coloured per-snapshot lines); each gene's
  agent histogram now traces three lines — defectors (red) / middlers (yellow) /
  cooperators (green) — so genes that correlate with cooperation show as a vertical
  gap between the red and green lines. Probe (clone-founders, selection on, 1500t)
  already shows cooperators preferring higher τ (hi 0.80 vs lo 0.66) and higher κ;
  θ/φ/λ ~flat. Empty third → NaN (line skips).
- **Migration on by default.** New default rates: `pMigrateRandom` 0.01,
  `pMigrateMisfit` 0.25, `pMigrateStarve` 0.20 (parameters.js + index.html).
- **Catastrophe now scales with crowding.** `applyCatastrophes` wipeout chance is
  `catastropheChance × (populated neighbours)` instead of flat — an isolated
  village (0 populated neighbours) is **never** wiped; a fully-surrounded one is
  4× the parameter. Victims are chosen from the pre-pass state so a wipeout doesn't
  lower a neighbour's count mid-pass. UI label + param comment updated.
- **Migration tracking + display.** `World` now tallies migrations by vector,
  per-tick (`migCount`) and cumulative (`migCum`), incremented in `migrationDest`.
  Observer shows a live readout line ("migrations this tick — starve/misfit/random
  + total so far") and a new **Migrations/period** graph beside the population
  graph (3 series: starve green / misfit red / random cyan). `WorldDataManager`
  records per-period counts (diffed from cumulative) and ships them in the packet
  (`migrations`). Probe (8×8, all vectors on): tallies fire and accumulate
  (random > misfit > starve), per-period sums match cumulative. NOTE: default
  migration rates are all 0 — nothing migrates until `pMigrate*` is set > 0.
- **Added `cloneFounders` village-seeding option.** When on, each founding village
  is one founder + its **mutated genetic clones** (via `spawnChild`) instead of
  independently-random villagers. Orthogonal to `randomizeGenes` (which still sets
  whether the founder's genome is random or from inputs). Default off (current
  behavior). *Why:* it concentrates genetic variance **between** villages rather
  than **within** them — the structure multilevel selection acts on. Probe at
  seeding (6×30, randomizeGenes on): within-village τ SD 0.267→**0.020** (= the
  0.02 mutation floor), between-village mean τ SD 0.073→**0.276** (≈ full uniform
  spread). Wired through PARAMETERS + UI checkbox + `World` constructor.
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
