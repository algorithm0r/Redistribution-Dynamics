# Pre-registration draft — S1–S5 (for the steward to move into EXPLOG.md)

Drafted 2026-11-18 by the reimplementer. Nothing here has been run. Labels are placeholders
(`expA`…`expD`); the real numbers are claimed at registration (`node sweep/experiment.mjs new
<slug> "<question>"`). The coordinator refuses an `expNNN` until its `## expNNN` heading is
in `sim/EXPLOG.md`. Specs: `analysis/SPECS.md`. Grids: `node sweep/grid-specs.mjs <design>
<expNNN_slug>` writes exactly the cells below.

**Code:** sim `main` at or after the commit carrying the 2026-11-18 review fixes (the one that
adds this paragraph). Every run is seeded, and its document carries `PARAMETERS.id` (exp, run,
seed, commit, dirty, host).
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
- **Slug:** `syndrome-controls`. **Design:** `syndrome-controls --misfit-own` (steward's
  decision 2).
- **Cells (30):** families {base_g2, base_g4, i6_g2, i8_g2, i8_g4} × franchise off × pSexual
  {0, 1} × arm:
  - `own`: as normal;
  - `shuffle` (the primary control): `policyShuffle: true`, misfit migration against the
    enacted (shuffled) policy;
  - `shufown` (smaller, secondary): shuffle, misfit migration against the village's own vote.

  Balance base.
- **Diagnostics:** `recordSyndrome: true`, `extraTracers: 5`, `linkedTracers: true`,
  `syndromeEvery: 10` and `villageRecordEvery: 10` (1 000-tick windows), population samples
  every 5 000 ticks × 256 agents (defaults). Tracers and recording use their own RNG streams,
  so they leave the trajectory unchanged (checked). The shuffle arm changes the run by design.
- **Reps:** fixed; 30 per cell for `own` and `shuffle`, 10 per cell for `shufown` (700 runs).
  "Smaller" is the steward's word; 10 is my number (`--misfit-own N` changes it).
- **Run length:** 50 000 ticks.
- **Packet:** `own` 10.7 MB; `shuffle` 12.4 MB (measured; limit 16).
- **CPU:** `own` 300 × ~80 s + `shuffle` 300 × ~45 s + `shufown` 100 × ~45 s ≈ **11 CPU-h**.

## Total

≈ **141 CPU-h**. That is about 12 h of the whole 12-slot pool if
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

## Decisions (steward, 2026-11-18)

1. **Windows: keep 1 000-tick syndrome windows** (`syndromeEvery: 10`). Villages turn over
   about every 250 ticks: at the default `catastropheChance` 0.001 a full grid loses about
   0.40 villages per tick (4 033 in 10 000 ticks), and the cell is re-founded by migrants the
   next tick. So most villages begin and end inside one window. Their lives are carried by the
   ended-village rows (`data.syndrome.ended`: id, cause, size at the end, flow counts) and the
   per-cause gene-sum aggregates (`endedSum`). "Villages essentially never go extinct" (SPECS
   S4) describes cells, not villages.
2. **Shuffle: `enacted` is the primary arm**, plus a smaller `--misfit-own` arm (`shufown`).
3. **expB: 40 fixed reps** per cell, families base_g2 and i8_g1.
4. **Packets: accept the > 4 MB warnings.** Every config is between 5.4 and 12.4 MB of BSON,
   under the 16 MB limit.
5. **Grouping: the shuffle control stays in expD**, paired with its baseline by seed.

## Semantics and caveats (from the 2026-11-18 independent review)

- **The shuffle and the policy gap.** Under `policyShuffle` a village enacts another
  village's constitution, but `recordPolicyGap` measures the village's **own** sitting
  constitution against its members. In franchise mode B, the gap's "vote held now" `n` and the
  samples' `elig` also gate on the own constitution's ψ, as the real vote does. Before the
  review fix these read the shuffled policy. expD runs franchise off and does not record the
  gap; this matters only if someone combines them.
- **The shuffle and terms.** Under the shuffle a village's own constitution keeps its term,
  but what it *enacts* is re-drawn every tick, so a termed run under the shuffle has no
  persistent enacted policy. expD runs T = 1, so this does not arise there.
- **Population-sample timing.** `syndromeSampleTicks` must be a multiple of
  `reportingPeriod`: samples are taken only at record ticks, so any other value silently
  samples less often. expD uses 5 000 with period 100.
- **Tracer values depend on which tracer-stream users are on.** `extraTracers`,
  `linkedTracers` and `recordSyndrome` (lineage parent picks) all draw from the one tracer RNG
  stream. Toggling any of them changes the *values* of the inert tracers, never the dynamics
  or any real gene (checked). Compare tracer values only between runs with the same three
  settings. Within expD all three are on in every arm.
- **Where tracer medians live.** SPECS S4.2 put ω and ω1…ω5 in `villageRecords.g`. They are
  in `villageRecords[s][i].sy.w` (village medians of [ω, ω1..ω5], at syndrome records) and in
  `data.tracers` (per-sample agent mean, mean and SD of village medians). `g` stays the six
  enacted policy genes. `sy.w` exists only with `recordSyndrome` on, which it is in every expD
  arm.
- **Duplicate saves.** `db.js` `save()` checks then upserts, so it is not atomic. Since the
  review, the coordinator never re-dispatches a running seed (heartbeats register it) and
  counts each seed and run name once, so a rare duplicate cannot inflate a cell's count. Making
  `save()` atomic belongs in the scaffold `db.js`.
