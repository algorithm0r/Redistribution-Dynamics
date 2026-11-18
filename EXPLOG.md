# EXPLOG — Redistribution Dynamics experiment ledger

Append-only, newest on top. DEVLOG says what changed in the code; this file says what was
learned from runs and how to reproduce it (conventions §1, "EXPLOG.md"). Each entry gives
**Question / Settings / Method / RAW RESULTS**. Conclusions go in separate, later entries.
Mark trials *current / historic / invalid*.

The ledger started late (2026-11-18), so the two existing sweeps are backfilled below as
RETROSPECTIVE blocks. They were not pre-registered. Their settings come from the grid generators
and their provenance from Mongo insert times (ObjectId timestamps) matched against `git log`.
Future experiments follow conventions §4: numbered `expNNN_slug` collections, pre-registered
here before launch.

**Run-name grammar (legacy sweeps).** `balance_grid`: `{indiv}_g{rate}_f{off|A|B}_s{pSexual}`,
with indiv ∈ {base, b0.5, b1, b2, b4, i8, i6, i4, i2}. `constitution_grid`:
`{indiv}_g{rate}_{foff_T1|foff_T100|foff_T50k|fA|fB}`. The run name is the cell; replicates
share it, and none carries a seed.

Raw numbers below come from `../analysis/` (separate repo). Regenerate with
`node scripts/extract.mjs <collection>` (read-only Mongo pull to `analysis/data/`), then
`node scripts/cells.mjs`, `node scripts/confound.mjs`, `node scripts/timing.mjs`,
`node scripts/gap.mjs`. Tables are written to `analysis/results/*.csv`.

---

## 2026-11-18 (evening) — CONCLUSIONS from the syndrome tests

Written by the analysis session after the raw block below. Details: `../analysis/FINDINGS.md`,
lead section.

1. The core of the syndrome, robust in both sweeps and at every pSexual level, is **λ high,
   κ low, φ high**. θ is part of it only under the one-sided gate (balance_grid); under the
   signed gate (constitution_grid) θ ≈ 0.70 in every rep, whatever the outcome. τ is part of it
   only in constitution_grid; in the matched balance_grid families, failing reps end with τ as
   high as or higher than established reps.
2. The syndrome survives free recombination at unchanged strength, and its spread across reps
   narrows. Linkage does not build it.
3. Under recombination there is almost no agent-level association among the syndrome genes, or
   between them and coop. The package is co-occurring directional selection on each element, not
   a genetic complex held by correlational selection. Between villages it has little covariance
   beyond each element tracking cooperation: τ–λ trade off, and θ–λ and τ–θ go together weakly.
4. Policy assembles before cooperation. λ separates the eventual outcomes first (within 100
   ticks at every pSexual level; at pSexual 0 partly from the initial draw), and the package
   reaches its poles 10–20k ticks before mean coop crosses 0.5. Failing worlds lock into a mirror
   package: λ ≈ 0.1, κ ≈ 0.8, θ ≈ 0.2–0.3.
5. Selection on λ is not relaxed after establishment, because cooperation never completes
   (coop ≈ 0.8, so λ keeps firing).
6. Open: why the package is favoured. Short-term village size selects slightly against λ, τ and
   low κ. Villages never go extinct, and the records hold no births or migrant flows per village.
   The wealth-proxy hypothesis gets no support at the endpoint. Instrumentation:
   `../analysis/SPECS.md` S4; control runs: S5.

## 2026-11-18 (evening) — SYNDROME TESTS on the existing sweeps · RAW · re-analysis, no new runs

**Question.** Is the policy–cooperation syndrome built by selection or by draft? Does it survive
free recombination? Is it a package or separate shifts? What assembles first? (Tests 1–5 of
`../lit/SYNDROME_TEST_DESIGN.md`.)

**Data.**
- constitution_grid (1801 reps, all pSexual 0) and balance_grid (2223 reps), as in the
  retrospective blocks below.
- A second read-only pull covers the five balance_grid families that establish at all three
  pSexual levels: `{base_g2, base_g4, i6_g2, i8_g2, i8_g4}_foff_s{0, 0.5, 1}`, 15 cells, 568 reps.
  It took full `geneMeans` and `geneCovariance` series for all 568 reps, and full
  `villageRecords` for 155 of them (per cell ≤ 8 established + ≤ 4 not, in insertion order).

**Method.**
- Commands: `../analysis/scripts/{syndrome,wealth,extract2,series,outcome_traj,village}.mjs`
  (run lines in FINDINGS).
- Established = final mean coop > 0.5.
- t* = start of the final unbroken run of mean coop > 0.5. Timed reps have 5k ≤ t* ≤ 45k:
  94 / 114 / 141 at pSexual 0 / 0.5 / 1.

**RAW RESULTS.**

Test 1. Share of established reps with the final gene mean > 0.5:

| sweep | λ | φ | κ | τ | θ | ψ | ω |
|---|---|---|---|---|---|---|---|
| constitution_grid (1049 est.) | 1.00 | 0.99 | 0.03 | 1.00 | 1.00 | 0.51 | 0.50 |
| balance_grid foff (577 est.) | 1.00 | 1.00 | 0.03 | 0.94 | 0.94 | 0.53 | 0.51 |

- constitution_grid sd across established reps: λ 0.045, φ 0.054, θ 0.039, ω 0.165.
- Established − not:
  - constitution_grid: θ −0.012 [−0.018, −0.005]; τ +0.065 to +0.115 by level
  - balance_grid franchise off: θ +0.129 [0.109, 0.149]

Test 2. Matched families, family-stratified mean of established reps at pSexual 0 / 0.5 / 1
(n est. 129 / 135 / 161):

| gene | stratified mean | sd across reps |
|---|---|---|
| λ | 0.89 / 0.89 / 0.88 | 0.039 / 0.021 / 0.027 |
| φ | 0.90 / 0.90 / 0.90 | 0.035 / 0.013 / 0.015 |
| κ | 0.10 / 0.09 / 0.09 | 0.122 / 0.011 / 0.011 |
| θ | 0.55 / 0.58 / 0.58 | 0.123 / 0.025 / 0.016 |
| τ | 0.63 / 0.61 / 0.60 | not listed |
| ω | 0.50 / 0.51 / 0.50 | 0.197 / 0.120 / 0.126 |

- Stratified established − not:
  - λ +0.31 / +0.52 / +0.41
  - κ −0.28 / −0.48 / −0.40
  - φ +0.22 / +0.16 / +0.11
  - θ +0.07 / +0.23 / +0.17
  - τ +0.03 [−0.01, 0.08] / −0.05 [−0.07, −0.03] / −0.03 [−0.07, 0.02]
- At pSexual 0, 4/129 established reps have κ > 0.5 and 9/129 have θ < 0.4. At pSexual 0.5 and
  1: 0 and 0.

Test 3. Within-population variance relative to ω's, before t* → last 5k ticks:
- λ 0.34 → 0.16 / 0.18 → 0.11 / 0.19 → 0.11
- |mean drift| from t* + 2k to the end: λ 0.022 / 0.017 / 0.017; ω 0.076 / 0.068 / 0.059.

Test 4, agent level. Sign-adjusted correlation with coop, window t* ± 5k:

| pSexual | λ | τ | κ | φ | ω |
|---|---|---|---|---|---|
| 0 | 0.157 | 0.196 | 0.091 | 0.081 | −0.014 |
| 0.5 | 0.017 | 0.036 | 0.008 | 0.006 | 0.000 |
| 1 | 0.010 | 0.021 | 0.003 | 0.003 | −0.001 |

Largest gene–gene r: 0.068 / 0.019 / 0.010.

Test 4, village level, at pSexual 0 / 0.5 / 1:
- V1, corr(village coop, enacted gene):
  - λ 0.37 / 0.20 / 0.10
  - θ 0.14 / 0.12 / 0.06
  - κ 0.15 / 0.06 / 0.03
  - φ 0.08 / 0.04 / 0.03
  - τ 0.17 / 0.03 / 0.04
  - ψ 0.01 / −0.01 / 0.01
- V2, partial on coop:
  - τ–λ −0.10 / −0.06 / −0.04
  - θ–λ +0.12 / +0.06 / +0.03
  - τ–θ +0.10 / +0.07 / +0.06
  - all other pairs within ±0.04
- V4, β on relative village size 500 ticks later (model 2, per SD):
  - λ −0.021 / −0.017 / −0.016
  - τ −0.021 / −0.029 / −0.028
  - κ (flipped) −0.007 / −0.006 / −0.004
  - φ −0.003 / −0.004 / −0.004
  - θ +0.018 / +0.016 / +0.017
  - coop +0.019 / −0.000 / −0.001
  - quadratic |γ| ≤ 0.004
  - at 2 000 ticks all |β| ≤ 0.010
- Villages gone 2 000 ticks later: 0.04% / 0.05% / 0.06%. Mean village size: 31.5 / 28.4 / 27.8.

Assembly. First tick with standardised outcome difference > 0.5, held for 500 ticks, at
pSexual 0 / 0.5 / 1:
- λ 100 / 100 / 100
- κ 100 / 100 / 800
- coop 300 / 200 / 400
- θ 900 / 200 / 1 100
- φ 800 / 2 300 / 1 500
- τ and ω never

λ at tick 0: mean difference +0.011 / +0.008 / −0.001 (d 0.70 / 0.46 / −0.04).

Median half-move lead over coop's half-move (ticks):
- λ −14 500 / −17 750 / −19 700
- κ −12 000 / −16 650 / −17 900
- φ −10 050 / −14 600 / −16 200
- τ −1 400 / −4 700 / −6 950

V3b. Villages turning cooperative vs same-rep stayers, share on the syndrome side 2 000 ticks
before:
- κ +0.20 / +0.13 / +0.09
- λ +0.16 / +0.13 / +0.09
- θ +0.10 / +0.11 / +0.08
- φ +0.07 / +0.11 / +0.12
- τ +0.07 / +0.18 / +0.13
- ψ −0.03 / +0.11 / +0.04
- Crossers 759 / 283 / 187, in 36–38 reps with both kinds.

Failing reps (matched families, medians at 20k ticks, pSexual 0 / 0.5 / 1):
- λ 0.08 / 0.09 / 0.09
- κ 0.83 / 0.84 / 0.83
- θ 0.23 / 0.18 / 0.23
- τ 0.61 / 0.71 / 0.70

Test 5. Within-village r(stock, coop) in the final 256-agent sample:
- established reps: −0.005 to −0.023 by level
- failing reps: −0.017 to −0.100

---

## 2026-11-18 — CONCLUSIONS from the re-analysis of constitution_grid and balance_grid

Written by the analysis session after the raw blocks below. Interpretation lives here, not there.
Details, figures and commands: `../analysis/FINDINGS.md`.

1. **The 2026-10-20 headline numbers reproduce.** The franchise/term pEst 0.81 / 0.72 / 0.34 /
   0.24 / 0.30 are equal-weight cell averages, and they reproduce to two decimals.
   balance_grid gives 16/243 cells under the pEst ≥ .5 rule and 14/243 under the Wilson-lower or
   mean rule, all franchise-off. Pooled over reps instead, the gradient is flatter
   (0.75 / 0.74 / 0.49 / 0.41 / 0.48), because adaptive stopping puts n = 60 in bistable cells
   and n = 5 in failing ones. The cell average is the design-faithful summary. Each n = 5 cell
   (0/5) is bounded only at p < 0.43.
2. **In constitution_grid, franchise A/B are long-term locks.** The term gene is not
   selected. It stays at ~0.50 in A/B, as it does where it is inert, so voted T ≈ 24 000–27 000
   ticks. A/B match off-T50k in pEst (paired diffs −0.09 [−0.21, 0.02] and −0.04 [−0.14, 0.07]),
   in establishment timing, and in endpoint policy gap. Beyond the lock, only franchise A shows a
   modest extra delay (log-rank HR 0.77 vs T50k, p 0.02). B shows none (HR 0.98).
3. **The term-free franchise contrast is in balance_grid, and it is stark.** At T = 1, franchise
   A/B establish in 1 of 841 reps, against 577/1382 with everyone voting. The ψ gate there is
   one-sided ("relative" line, excludes the poor). The constitution_grid gate is signed and
   starts neutral. So the franchise effect is real, but its size depends on the gate's form.
4. **The gradient is partly a speed effect.** Establishment is nearly absorbing (11 of 917
   lost), and no level has plateaued at 50 000 ticks: the last-10k rise is 0.08–0.14 at every
   level. The data show that insulation **delays** establishment, and that within 50 000 ticks
   fewer worlds cooperate. They do not show a smaller eventual basin.
5. **Syndrome.** Establishing worlds have high λ, high φ, low κ and higher τ. ω (and ψ under
   franchise off) do not differ. θ does not distinguish them in constitution_grid, where it is
   ≈ 0.70 in both groups, so it is not part of the syndrome there. It does distinguish them in
   balance_grid (0.56 vs 0.43; the one-sided θ has a different meaning).
6. **Policy gap (STORY claim 4).** It is measurable only at the endpoint, from stored data. It
   is ordered as predicted (T1 0 < T100 0.09 < T50k/A/B 0.15–0.16 < balance A/B 0.22), and
   lower gap goes with higher pEst. But the gap is almost a relabelling of the design levels, and
   endpoint values are downstream of the outcome. Untested as a mechanism. Instrumentation spec:
   `../analysis/SPECS.md` S1.

---

## constitution_grid — RETROSPECTIVE, not pre-registered (backfilled 2026-11-18) · status: current

**Question (as logged in DEVLOG 2026-07-18).** Do signed θ/ψ, a locked constitution (term T) or
an enfranchised electorate (franchise A/B) open cooperation regions beyond the franchise-off basin?

**Settings.** Generator `sweep/grid-constitution.mjs` → `sweep/constitution.json`, 45 cells:
individual {base (β 0, ind 0), i8 (ind 8), i6 (ind 6)} × `birthThresholdRate` {1, 2, 3} ×
franchise/term {off & `constitutionTerm` 1, off & 100, off & 50000, A (term voted), B (term
voted)}. Fixed: `signedThreshold: true`, `thresholdMode: 'percentile'`, `termMax: 50000`,
`pSexual: 0`, `epoch: 50000`, `reportingPeriod: 100`, 10×10 grid, `seedVillages: 10`,
`seedPop: 30`, `cap: 100`, `birthThreshold: 0`, migration random/misfit/starve 0.02/0.2/0.2,
`randomizeGenes: true`. Defaults otherwise (`mutationStdev` 0.02). Verified in Mongo: all
1801 docs carry these values and 9-gene endpoint samples. Seeds were not set or recorded.

**Code in force.** Sim core = the constitutional-layer commit `b44d48d` (2026-07-18 11:04 PDT).
**13 of 1801 reps were inserted 10:58–10:59 PDT, before that commit**, so they ran on the
uncommitted working tree that became `b44d48d`. The packets carry no commit stamp, so the tree
and the commit cannot be proven identical. Headless runner: main-realm `sweep/headless.mjs`
(`cc718e6`). Stopping rule: `sweep/stats.mjs` with minN 5 (`4021ba8`). Hosts: desktop + mint (17
workers, DEVLOG 07-18). Mint ran copied files, not a git checkout. No later sim-core commit
exists (`git log -- agent.js village.js world.js parameters.js` ends at `b44d48d`).

**Collection.** `redistribution_dynamics.constitution_grid`. 1801 reps over 45 cells, inserted
2026-07-18 10:58 → 17:33 PDT. Reps per cell (adaptive): 5 ×11 cells, 14, 20 ×3, 30, 34, 37,
38 ×2, 42, 57, 58, 60 ×20, 68, 70. Run length 50 000 ticks.

**Method.** Establishment = final population-mean coop > 0.5 (`stats.mjs` threshold). Per cell:
x/n, Wilson 95% CI, `stats.mjs` regime, and coop level among establishing reps (t CI).
Marginal per franchise/term level: equal-weight mean of the 9 cell proportions (CI from
Agresti–Coull-adjusted cell variances), and the pooled x/N (Wilson).

**RAW RESULTS.**

| level | cells pEst ≥ .5 | cell-avg pEst [95% CI] | pooled x/N = p [Wilson 95%] | n per cell |
|---|---|---|---|---|
| off, T = 1 | 8/9 | 0.81 [0.77, 0.84] | 313/418 = 0.75 [0.71, 0.79] | 30/34/20/37/42/60/57/68/70 |
| off, T = 100 | 7/9 | 0.72 [0.67, 0.76] | 262/353 = 0.74 [0.69, 0.79] | 38/14/20/58/38/60/60/60/5 |
| off, T = 50 000 | 3/9 | 0.34 [0.28, 0.40] | 182/375 = 0.49 [0.44, 0.54] | 60/60/60/60/60/5/60/5/5 |
| A, T voted | 2/9 | 0.24 [0.18, 0.31] | 131/320 = 0.41 [0.36, 0.46] | 60/60/60/60/5/5/60/5/5 |
| B, T voted | 3/9 | 0.30 [0.24, 0.36] | 161/335 = 0.48 [0.43, 0.53] | 60/60/60/60/5/5/60/20/5 |

Cells with pEst ≥ 0.5: 23/45 (off 18, A 2, B 3). Regimes: establish 5, BISTABLE 28,
collapse 12. All 45 cells meet the `stats.mjs` stopping rule. The 11 cells stopped at n = 5 are
0/5, Wilson upper bound 0.43. Per-cell table: `analysis/results/cells_constitution_grid.csv`.

Term gene (voted in A/B, inert under off), mean over reps at ticks 0 / 10k / 25k / 50k:
off-T1 0.50/0.49/0.48/0.49; off-T100 0.50/0.49/0.49/0.49; off-T50k 0.50/0.50/0.51/0.51;
A 0.50/0.49/0.50/0.50; B 0.50/0.49/0.51/0.52. Final agent-median term gene → T: A 23 826
ticks, B 26 859 ticks (`analysis/results/confound_term.csv`).

Cell-average share of reps with mean coop > 0.5 at ticks 10k / 20k / 30k / 40k / 50k:
off-T1 0.28/0.43/0.59/0.73/0.81; off-T100 0.08/0.17/0.39/0.59/0.72;
off-T50k 0.01/0.02/0.08/0.19/0.34; A 0.00/0.02/0.07/0.17/0.24; B 0.01/0.02/0.07/0.19/0.30.
Of 917 reps that held coop > 0.5 for ≥ 5 000 consecutive ticks, 11 ended below 0.5.

Stratified log-rank on time to establishment (9 strata; censored at 50 000): T100 vs T1 HR
0.60, χ² 40.3; T50k vs T100 HR 0.38, χ² 152.0; A vs T50k HR 0.77, χ² 5.4 (p 0.020); B vs T50k
HR 0.98, χ² 0.0 (p 0.83); A vs B HR 0.78, χ² 4.6 (p 0.032)
(`analysis/results/logrank_constitution.csv`).

Endpoint RMS rank gap, enacted policy vs full-membership median (5 economic genes; mean of
cell values): off-T1 0.000, off-T100 0.087, off-T50k 0.151, A 0.160, B 0.150
(`analysis/results/gap_cells.csv`).

Final gene means, franchise-off cells, establishing (n 757) vs not (n 389) reps:
τ 0.69/0.60, θ 0.70/0.72, φ 0.89/0.72, κ 0.12/0.31, λ 0.89/0.73, ψ 0.50/0.50, ω 0.49/0.50,
term 0.50/0.48 (`analysis/results/syndrome.csv`). θ established − not over all 1801 reps: −0.012.

Added 2026-11-18 (second pass, `analysis/scripts/psi.mjs` → `results/psi.csv`). Final
population-mean ψ across reps, sd and count polar (< .2 / > .8), established | not:
off-T1 sd 0.325 | 0.288, polar 98/94 | 28/24 (n 313 | 105); off-T100 0.271 | 0.227, 49/55 | 7/13;
off-T50k 0.175 | 0.139, 9/10 | 4/2; A 0.155 | 0.143, 3/1 | 3/5; B 0.174 | 0.148, 4/7 | 4/2.
ω sd at the same levels: 0.177 | 0.190, 0.164 | 0.152, 0.159 | 0.140, 0.151 | 0.135, 0.155 | 0.137.
ψ means 0.48–0.53 at every level.
Establishment tick, establishing reps, median of (i) start of the final run > 0.5 vs (ii) first
entry into a ≥ 5 000-tick run > 0.5: T1 20 700 vs 19 100 (n 313 / 299); T100 31 300 vs 28 700
(262 / 234); T50k 39 500 vs 35 700 (182 / 142); A 38 400 vs 34 200 (131 / 107); B 39 300 vs
35 300 (161 / 124).

---

## balance_grid — RETROSPECTIVE, not pre-registered (backfilled 2026-11-18) · status: current

**Question (as logged in DEVLOG 2026-07-17).** Where in individual-vs-group selection
strength (× franchise × recombination) does cooperation establish under the soft-cap model?

**Settings.** Generator `sweep/grid.mjs` → `sweep/grid.json`, 243 cells: individual-selection
union {base, β 0.5/1/2/4 (`birthWealthBias`), ind 8/6/4/2 (`individualBirthThreshold`)} ×
`birthThresholdRate` {2, 4, 6} × `franchiseMode` {off, A, B} × `pSexual` {0, 0.5, 1}.
Same base as constitution_grid except: `thresholdMode` default `'relative'`, no `signedThreshold`
(one-sided θ/ψ), and **no term gene or constitution**. The code predates them, so every
village re-votes every tick under all three franchise modes. Seeds were not set or recorded.

**Code in force.** Sim core = `90a0ae0` (2026-07-17 16:37 PDT, soft-cap reproduction +
sweep). Insert times split the 2223 reps as follows:
- **108 inserted before `90a0ae0`** (from 14:59 PDT), on the uncommitted working tree.
- 550 between `90a0ae0` and `cc718e6` (22:34 PDT): the vm-sandbox headless runner.
- 1565 after `cc718e6`: the main-realm runner. Same sim JS, so the change was speed only (DEVLOG 07-17).

The stopping rule changed mid-sweep. `4021ba8` (2026-07-18 08:05 PDT) raised `stats.mjs` minN
3 → 5, and 516 reps were inserted after it. Last insert 09:33 PDT, before the constitutional
layer (`b44d48d`, 11:04). Verified in Mongo: 0 of 2223 docs carry `termMax`/`signedThreshold`,
and every endpoint sample has 8 genes (no `term`). Hosts: desktop + mint. Mint ran copied files.

**Collection.** `redistribution_dynamics.balance_grid`. 2223 reps over 243 cells, inserted
2026-07-17 14:59 PDT → 2026-07-18 09:33 PDT. Reps per cell (adaptive): 5 ×210 cells, 6 ×7,
9, 11, 13, 15, 16, 17, 18, 20, 21, 35, 41 ×2, 51, 60 ×7, 61, 62, 67, 69, 71, 73. Run length
50 000 ticks.

**Method.** As constitution_grid.

**RAW RESULTS.**

Cells counted as cooperating, by rule: pEst ≥ 0.5: 16/243. Regime establish (p ≥ 0.95):
7/243. Wilson lower bound > 0.5: 14/243. Mean final coop > 0.5: 14/243. Any establishing rep:
25/243. Every cell under the first four rules is franchise-off. Regimes: establish 7, BISTABLE
17, collapse 219. All 243 meet the `stats.mjs` stopping rule.

| franchise (T = 1 throughout) | cells pEst ≥ .5 | cell-avg pEst [95% CI] | pooled x/N = p [Wilson 95%] |
|---|---|---|---|
| off | 16/81 | 0.19 [0.17, 0.22] | 577/1382 = 0.42 [0.39, 0.44] |
| A | 0/81 | 0.00 [0.00, 0.03] | 1/433 = 0.00 [0.00, 0.01] |
| B | 0/81 | 0.00 [0.00, 0.03] | 0/408 = 0.00 [0.00, 0.01] |

Cells with any establishing rep (x/n): base_g2_foff_s0 18/18, _s0.5 15/15, _s1 11/11;
base_g4_foff_s0 9/9, _s0.5 32/35, _s1 37/41; base_g6_foff_s0 13/13, _s0.5 38/60;
b0.5_g4_foff_s0 15/60; b0.5_g6_foff_s0 15/60; b1_g4_foff_s0 4/69; i8_g2_foff_s0 16/16, _s0.5
20/21, _s1 38/41; i8_g2_fA_s0 1/20; i8_g4_foff_s0 43/61, _s0.5 31/67, _s1 31/60; i8_g6_foff_s0
28/60, _s0.5 8/60; i6_g2_foff_s0 43/51, _s0.5 37/60, _s1 44/62; i6_g4_foff_s0 11/71;
i4_g2_foff_s0 20/73. Per-cell table: `analysis/results/cells_balance_grid.csv`.

Endpoint RMS rank gap (5 economic genes; mean of cell values): off 0.000, A 0.220, B 0.218.

Final gene means, franchise-off cells, establishing (n 577) vs not (n 805) reps:
τ 0.60/0.51, θ 0.56/0.43, φ 0.89/0.67, κ 0.12/0.51, λ 0.87/0.35, ψ 0.51/0.49, ω 0.51/0.50.
θ established − not over all 2223 reps: 0.184.

Added 2026-11-18 (second pass, `analysis/scripts/psi.mjs`). Final population-mean ψ: off
established | not: sd 0.301 | 0.261, polar (< .2 / > .8) 159/172 | 170/134 (n 577 | 805); ω sd
0.165 | 0.166, polar 17/24 | 26/20. Franchise A (not established, n 432): ψ mean 0.82, sd 0.080,
1 < .2, 352 > .8; the one established A rep: ψ 0.12. Franchise B (n 408, none established):
ψ mean 0.81, sd 0.049, 0 < .2, 255 > .8.
