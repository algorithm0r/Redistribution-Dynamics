# Pre-registration draft — S1–S5 (for the steward to move into EXPLOG.md)

Drafted 2026-11-18 by the reimplementer. Nothing here has been run. Labels are placeholders
(`expA`…`expD`); the real numbers are claimed at registration (`node sweep/experiment.mjs new
<slug> "<question>"`). The coordinator refuses an `expNNN` until its `## expNNN` heading is
in `sim/EXPLOG.md`. Specs: `analysis/SPECS.md`. Grids: `node sweep/grid-specs.mjs <design>
<expNNN_slug>` writes exactly the cells below.

**Code:** sim `main` at the commit that adds `sweep/grid-specs.mjs` (after `0c7af5d`). Every
run is seeded, and its document carries `PARAMETERS.id` (exp, run, seed, commit, dirty, host).
A saved run re-runs byte-identical from its stored `_parameters` (checked 2026-11-18).

**Seeds (all experiments):** the coordinator gives each cell seeds 1, 2, 3, … (run name
`<cell>_s<seed>`). Seed k founds the same initial villages in every cell (founders are drawn
before any cell-specific mechanism acts), so cells are paired by seed (common random
numbers). A reaped or failed run leaves a gap in its cell's seeds rather than a name clash.

**Run discipline:** desktop runs go through `cpuslot` (tag `redistribution-dynamics`,
one-shot workers); mint runs use `launch.mjs --direct`. Mongo collection = the label.

## Settings common to all

Model V, `regime: 'genome'`, `randomizeGenes: true`, 10×10 torus, `seedVillages` 10,
`seedPop` 30, `cap` 100, `birthThreshold` 0, migration random 0.02 / misfit 0.2 /
starve 0.2, `reportingPeriod` 100, `epoch` 50 000 (except expC), `catastropheChance` 0.001
(default). Unlisted parameters are at their `parameters.js` defaults.

- **Constitution base** (expA–expC, as `grid-constitution.mjs`): `signedThreshold: true`,
  `thresholdMode: 'percentile'`, `termMax` 50 000, `pSexual` 0.
- **Balance base** (expD, as `grid.mjs`): `signedThreshold: false`, `thresholdMode:
  'relative'`.
- Individual selection: `base` (none), `i8`, `i6` (`individualBirthThreshold` 8 / 6);
  `birthWealthBias` 0. Group rate g = `birthThresholdRate`.

## expA — franchise without a voted term (S2; also feeds S1 test 1)

- **Question:** With the term fixed rather than voted, does restricting the franchise (A/B)
  lower p(establish) relative to franchise off at the same T, and does the franchise interact
  with a long lock?
- **Slug:** `franchise-fixed-t`. **Design:** `franchise-fixedT`.
- **Cells (54):** individual {base, i8, i6} × g {1, 2, 3} × franchise {A, B} × T {1, 100,
  50 000}; `termVoted: false`, `constitutionTerm: T`. They pair cell for cell with
  constitution_grid's `foff_T1/T100/T50k`.
- **Diagnostics:** `recordPolicyGap: true` (the early gap for S1 test 1);
  `villageRecordEvery: 5`.
- **Reps:** adaptive, `stats.mjs` (minN 5, maxN 60, coop CI ±0.03, p ±0.10).
- **Run length:** 50 000 ticks.
- **Packet:** 5.6 MB BSON (measured, comparable config).
- **CPU:** if these cells stop like constitution_grid's A/B cells (12 of 18 ran to 60, 6
  stopped at 5–20), about 2 300 runs × ~90 s ≈ **58 CPU-h**. Bounds: 54 × 5 = 270 runs
  (≈ 7 CPU-h) to 54 × 60 = 3 240 runs (≈ 90 CPU-h).

## expB — term ladder (S1 test 2: one curve or several)

- **Question:** Under franchise off, does p(establish) fall along one curve of the early
  policy gap as the term T rises, and do the expA franchise cells at T = 1 fall on that curve
  at matched gap?
- **Slug:** `term-ladder`. **Design:** `term-ladder`.
- **Cells (20):** families {base_g2, i8_g1} × franchise off × T ∈ {1, 3, 10, 30, 100, 300,
  1 000, 3 000, 10 000, 50 000}.
  - Chosen because both span the bistable range on both axes in constitution_grid: base_g2
    goes from T1 0.97 to T50k 0.62 (A 0.40, B 0.58); i8_g1 from 0.97 to 0.57 (A 0.50,
    B 0.53).
  - expA has the same two families at franchise A/B, T = 1.
- **Diagnostics:** `recordPolicyGap: true`, `villageRecordEvery: 5`.
- **Reps:** fixed 40 per cell (800 runs), so every rung has the same precision.
- **Run length:** 50 000 ticks.
- **Packet:** 5.6 MB.
- **CPU:** 800 × ~85 s ≈ **19 CPU-h**.

## expC — long runs (S3: censoring)

- **Question:** Do the franchise/term levels differ in whether cooperation establishes
  (plateau of the time-to-establishment curve), or only in how fast?
- **Slug:** `long-200k`. **Design:** `long`.
- **Cells (15):** individual {base, i8, i6} × g 1 × {off@T1, off@T100, off@T50k, A, B}. As
  constitution_grid, A/B vote their term (`termVoted` default true).
- **Run length:** `epoch` 200 000, `reportingPeriod` 400 (the same 501 samples).
- **Diagnostics:** `recordPolicyGap: true`, `villageRecordEvery: 5` (a record every 2 000
  ticks).
- **Reps:** fixed 30 per cell (450 runs).
- **Packet:** ~5.6 MB (the 200k probe with full village records was 10.24 MB, the same as a
  50k packet).
- **CPU:** 450 × ~420 s ≈ **52 CPU-h**, an upper estimate: 419 s was a cooperating
  base_g1 run, and failing cells are smaller and faster.

## expD — syndrome instrumentation and controls (S4, S5)

- **Question:** Why is the λ/φ/κ package favoured? Specifically:
  - Per-village flows: does it rise through village productivity, migration or
    within-village selection?
  - Inert tracers: how extreme does a neutral gene get, per cell?
  - Linked/unlinked pair: how much is draft?
  - Policy-shuffle shadow: does the policy–coop association survive when villages enact
    another village's policy?
- **Slug:** `syndrome-controls`. **Design:** `syndrome-controls` (add `--misfit-own` for the
  optional third arm).
- **Cells (20, or 30 with the third arm):** families {base_g2, base_g4, i6_g2, i8_g2, i8_g4}
  × franchise off × pSexual {0, 1} × arm:
  - `own`: as normal;
  - `shuffle`: `policyShuffle: true`, misfit migration against the enacted (shuffled) policy;
  - optional `shufown`: shuffle, misfit migration against the village's own vote.

  Balance base.
- **Diagnostics:** `recordSyndrome: true`, `extraTracers: 5`, `linkedTracers: true`,
  `syndromeEvery: 10` and `villageRecordEvery: 10` (1 000-tick windows), population samples
  every 5 000 ticks × 256 agents (defaults). Tracers and recording use their own RNG streams,
  so they leave the trajectory unchanged (checked). The shuffle arm changes the run by design.
- **Reps:** fixed 30 per cell (600 runs; 900 with the third arm).
- **Run length:** 50 000 ticks.
- **Packet:** `own` 10.7 MB; `shuffle` 12.4 MB (measured; limit 16).
- **CPU:** `own` 300 × ~80 s + `shuffle` 300 × ~45 s ≈ **10 CPU-h**; the third arm adds
  ≈ 4 CPU-h.

## Total

≈ **140 CPU-h** (≈ 155 with the third arm). That is about 12 h of the whole 12-slot pool if
nothing else runs; cpuslot interleaves other projects, so expect longer wall time. mint can
take a share through `launch.mjs --direct`.

**How the CPU estimates were made.** Single full-length runs (seed 1), each run
concurrently with 5–11 others through cpuslot on 2026-11-18 (`sweep/packetsize.mjs`; numbers
in DEVLOG). Run time scales with mean population, about 0.45–0.5 µs per agent-tick:

| probe | mean pop | final coop | s / run |
|---|---|---|---|
| constitution base_g2 off T1, full records | 3 564 | 0.73 | 86 |
| same, village records every 5th, + policyGap | 3 564 | 0.73 | 70 |
| constitution base_g2 fA T1 (termVoted false) + gap | 4 212 | 0.81 | 108 |
| balance base_g2 s0 | 4 803 | 0.88 | 103 |
| balance i8_g4 s1 | 1 624 | 0.24 | 31 |
| expD `own` config (balance base_g2 s0) | 4 803 | 0.88 | 101 |
| expD `shuffle` config | 1 772 | 0.89 | 42 |
| constitution base_g1 off T1, 200 000 ticks | 5 334 | 0.79 | 419 |

These are one seed each. Cooperating cells are larger and slower, so treat the totals as
±30%.

## Decisions for the steward / analysis session before registering

1. **S4's premise does not hold: villages turn over fast.**
   - At the default `catastropheChance` 0.001 (per populated neighbour per tick), a full grid
     loses about 0.40 villages per tick to catastrophe: 4 033 wiped in 10 000 ticks, mean 28.6
     members at the wipe.
   - The cell is re-founded by migrants the next tick (median 1 tick), so a village lives
     about 250 ticks.
   - "Villages essentially never go extinct (0.04–0.06%)" is what cell-level (r, c) records
     show, not what happens to villages.
   - So group selection here probably runs largely through wipe-and-recolonise. A 1 000-tick
     syndrome window is longer than most village lives.
   - The instrumentation records every ended village (id, cause, size, flow counts) and gives
     every village a unique id, so this is measurable. Decide whether 1 000-tick windows are
     right, or whether to trade other records for finer windows (500-tick windows put the
     shuffle arm at 16.3 MB, over the limit).
2. **Shuffle arm, misfit migration.** Whether migrants sort against the enacted (shuffled)
   policy or the village's own vote changes what "demography unchanged" means. The draft runs
   `enacted`; `--misfit-own` adds the other.
3. **expB families and reps** (base_g2, i8_g1; 40 fixed), or the adaptive rule.
4. **Packet warnings.** Every config is above db.js's 4 MB warning (the constant 2 MB of
   `geneCoopHistograms` alone keeps even a thinned default packet at 5.4 MB); all are under
   16 MB. Accept the warnings, or ask for a histogram-thinning switch.
5. **Grouping.** expD puts the shuffle control in the same experiment as its baseline (same
   model and measures, paired by seed); split it if the EXPLOG should number it separately.
