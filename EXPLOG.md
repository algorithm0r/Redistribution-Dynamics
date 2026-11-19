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

## 2026-11-19 — exp001–exp004: coordinator outage, queue drained; oversized exp001 packets · RAW

**What happened.** All four coordinators stopped within 7 s of each other at 22:37:40 on
2026-11-18 (last writes to `sweep/logs/coord/*.out`), cause not found. They had been started
with `Start-Process` from the steward's agent shell. The Windows Update restart at 23:35
(System event 1074, "Service pack (Planned)") came an hour later and is not the cause. With no
coordinator, every queued one-shot worker exited 3 ("no coordinator found") in about a second,
so cpuslot drained the whole queue by 22:59.

**Where each experiment stood (2026-11-19 07:48).**
- exp001: 699 workers exited 0. Mongo holds 684 runs. Every pre-registered seed (s1–s30; s1–s10
  for `shufown`) exists in Mongo or as a JSON copy, except **s30 in 13 cells** (cut off at 22:37).
- exp002, exp003, exp004: **no runs.** Every worker exited 3 (14 of exp003's and 3 of exp004's
  were `killed` by cpuslot instead).

**Oversized packets (exp001).** 16 runs, almost all `base_g4_*_shuffle`, made packets of
16.2–19.3 MB BSON, over Mongo's 16 MB limit. The pre-run probe was 12.4 MB from one seed. `db.js`
did not store them in Mongo and wrote the JSON copy only
(`results/exp001_syndrome-controls/<run>.json`). One more run (`i8_g2_foff_s0_shuffle_s9`) hit
an ack timeout but is in Mongo. Because a run missing from Mongo counts as not done, the
coordinator issued replacement seeds (s31–s35) to those cells.
- **For analysis:** use seeds 1–30 (1–10 for `shufown`) from Mongo **plus** the JSON copies, and
  ignore the replacement seeds. Packet size grows with population, and population grows with
  cooperation. So dropping the oversized runs, or swapping in replacements, would bias p(establish)
  in the shuffle arm, which is the primary control.
- Fixing storage of packets over 16 MB is a `db.js` (scaffold) change; open.

**Restart.** Coordinators restarted 2026-11-19 07:48, this time detached through WMI
(`Win32_Process.Create`, hidden window, `CPUSLOT_LIGHT=1`). A first try at 07:46 used visible
console windows; all four received Ctrl+C within a minute (`^C` in their stderr) and stopped.
All four experiments were re-queued at 07:49: exp001 16 runs (fills s30), exp002 800, exp003
≤3240, exp004 450. The runs now stamp `v0.1.0-36-g2fb5cc4` (docs-only change since `29098b6`).

---

## Paper runs exp001–exp004 — PRE-REGISTERED 2026-11-18 (steward), before any run

Chris approved the paper runs on 2026-11-18 ("as long as you use the CPU slot app you can
go"). The four blocks below are the reimplementer's draft (`notes/preregistration-draft.md`,
which holds the CPU probes, the steward's five decisions and the review caveats in full),
moved here before launch. Specs: `../analysis/SPECS.md`. Grids: `node sweep/grid-specs.mjs
<design> <collection>` → `sweep/grids/<collection>.json`.

**Common to all.** Code: sim `main`, code as of `4a8b2d4` (the commit adding this block changes only docs and grids); each document's `PARAMETERS.id` records the exact commit and dirty flag. Model V, `regime: 'genome'`,
`randomizeGenes: true`, 10×10 torus, `seedVillages` 10, `seedPop` 30, `cap` 100,
`birthThreshold` 0, migration random 0.02 / misfit 0.2 / starve 0.2, `reportingPeriod` 100,
`epoch` 50 000 (except exp004), `catastropheChance` 0.001. Unlisted parameters at their
`parameters.js` defaults. Constitution base (exp002–exp004): `signedThreshold: true`,
`thresholdMode: 'percentile'`, `termMax` 50 000, `pSexual` 0. Balance base (exp001):
`signedThreshold: false`, `thresholdMode: 'relative'`. Individual selection `base` / `i8` / `i6`
= `individualBirthThreshold` 0 / 8 / 6, `birthWealthBias` 0; g = `birthThresholdRate`.
Seeds 1, 2, 3 … per cell (run `<cell>_s<seed>`); seed k founds the same initial villages in
every cell, so cells pair by seed. Every document carries `PARAMETERS.id`. Desktop runs go
through `cpuslot` (tag `redistribution-dynamics`, one-shot workers). Establishment = final mean
coop > 0.5, as in the retrospective blocks below.

Launch order: exp001 first (cheapest; answers the cause-vs-consequence question), then exp002,
exp003, exp004. Estimated total ≈ 141 CPU-h ± 30%.

## exp001 — syndrome instrumentation and controls (S4, S5) · status: running

- **Question:** Why is the λ/φ/κ package favoured: does it rise through village productivity,
  migration or within-village selection; how extreme does a neutral gene get per cell; how much
  is draft (linked vs unlinked tracer); and does the policy–coop association survive when
  villages enact another village's policy (policy-shuffle shadow)?
- **Collection:** `exp001_syndrome-controls`. **Design:** `syndrome-controls --misfit-own`.
- **Cells (30):** {base_g2, base_g4, i6_g2, i8_g2, i8_g4} × franchise off × pSexual {0, 1} ×
  arm {`own`; `shuffle` = `policyShuffle`, misfit migration against the enacted policy (primary
  control); `shufown` = shuffle, misfit against the village's own vote (secondary)}. Balance base.
- **Diagnostics:** `recordSyndrome`, `extraTracers` 5, `linkedTracers`, `syndromeEvery` 10,
  `villageRecordEvery` 10 (1 000-tick windows; villages live ~250 ticks, so their lives are in
  `data.syndrome.ended` / `endedSum`). Tracers and recording use their own RNG streams and leave
  the trajectory unchanged; the shuffle arms change the run by design.
- **Reps:** fixed, 30 per cell for `own` and `shuffle`, 10 for `shufown` (700 runs).
- **Reading (SPECS S5, stated before any run):** if the policy–coop association and the
  outcome divergence of FINDINGS Fig 6 survive in the `shuffle` arm, they are not selection on
  the village's own enacted policy (the package would then be a consequence of cooperation, or
  ride on something else). If they vanish under the shuffle while present in `own` at matched
  seed, selection on enacted policy is doing the work. Linked tracer more extreme than unlinked
  = draft (lowest priority; pSexual already says draft does not build the package). The flow
  decomposition (productivity / migration / within-village) is descriptive (SPECS S4).
- **CPU:** ≈ 11 CPU-h.

## exp002 — term ladder (S1 test 2) · status: queued

- **Question:** Under franchise off, does p(establish) fall along one curve of the early policy
  gap as the term T rises, and do exp003's franchise cells at T = 1 fall on that curve at
  matched gap?
- **Collection:** `exp002_term-ladder`. **Design:** `term-ladder`.
- **Cells (20):** {base_g2, i8_g1} × franchise off × T ∈ {1, 3, 10, 30, 100, 300, 1 000,
  3 000, 10 000, 50 000}. Constitution base.
- **Diagnostics:** `recordPolicyGap`, `villageRecordEvery` 5.
- **Reps:** fixed, 40 per cell (800 runs).
- **Reading (SPECS S1):** if the gap is the mechanism, the ladder and the franchise cells fall
  on one curve; franchise cells off the curve at matched gap mean something besides the gap acts.
- **CPU:** ≈ 19 CPU-h.

## exp003 — franchise without a voted term (S2; feeds S1 test 1) · status: queued

- **Question:** With the term fixed rather than voted, does restricting the franchise (A/B)
  lower p(establish) relative to franchise off at the same T, and does the franchise interact
  with a long lock?
- **Collection:** `exp003_franchise-fixed-t`. **Design:** `franchise-fixedT`.
- **Cells (54):** individual {base, i8, i6} × g {1, 2, 3} × franchise {A, B} × T {1, 100,
  50 000}, `termVoted: false`, `constitutionTerm` T. Pairs cell for cell with
  constitution_grid's `foff_T1/T100/T50k`. Constitution base.
- **Diagnostics:** `recordPolicyGap`, `villageRecordEvery` 5.
- **Reps:** adaptive (`stats.mjs`: minN 5, maxN 60, coop CI ±0.03, p ±0.10).
- **Reading (SPECS S2):** A/B vs off at T = 1 isolates the franchise; A/B vs off at
  T = 50 000 says whether franchise and lock interact. If A/B at T = 1 match off at T = 1, the
  constitution_grid deficit was the voted term's lock, not the franchise. (balance_grid's
  franchise deficit, 1/433 and 0/408, was under the one-sided gate; this grid is signed.)
- **CPU:** ≈ 58 CPU-h (bounds 7–90).

## exp004 — long runs (S3: censoring) · status: queued

- **Question:** Do the franchise/term levels differ in whether cooperation establishes
  (plateau of the time-to-establishment curve), or only in how fast?
- **Collection:** `exp004_long-200k`. **Design:** `long`.
- **Cells (15):** individual {base, i8, i6} × g 1 × {off@T1, off@T100, off@T50k, A, B}; A/B
  vote their term as in constitution_grid. Constitution base.
- **Run length:** `epoch` 200 000, `reportingPeriod` 400 (same 501 samples).
- **Diagnostics:** `recordPolicyGap`, `villageRecordEvery` 5.
- **Reps:** fixed, 30 per cell (450 runs).
- **Prediction:** none committed; the 50k censoring (median establishment T1 20.7k vs ~39k for
  the slow levels) leaves both readings open.
- **CPU:** ≈ 52 CPU-h (upper estimate).

---

## 2026-11-18 (night, later) — CORRECTION: villages turn over fast; "no extinction" withdrawn

Prompted by the reimplementer's count (`notes/preregistration-draft.md`, Decisions §1).
Checked against the code at the sweep commits (`applyCatastrophes`) and the stored parameters
(catastropheChance 0.001 in both sweeps).

1. A village on a full grid is wiped at 0.004 per tick, a life of about 250 ticks. About 33% of
   villages are wiped between two 100-tick records. Migrants re-found the cell within about a
   tick, so cells are almost never empty at a record.
   - The raw line "Villages gone 2 000 ticks later: 0.04% / 0.05% / 0.06%" in the syndrome-tests
     block below counts *cells*, not villages.
   - Item 6 of that entry's conclusions ("Villages never go extinct") is wrong.
2. Existing `villageRecords` cannot reliably show wipes (`../analysis/scripts/wipes_check.mjs`,
   397 pulled reps):
   - expected share of record pairs with a wipe: 0.330
   - next record empty: ≤ 0.0005
   - next size below half: 0.062–0.087
   - next size ≤ 5: 0.002–0.023
   - a cell with ≤ 5 members holds a median 18–27 members 100 ticks later

   At least about three quarters of wipes leave no size signature.
3. Withdrawn or re-read:
   - The V4 selection gradients on "village size 500 ticks later" are withdrawn as village
     fitness: the occupant is a successor village with probability ≈ 0.86.
   - The survival-fitness reading is withdrawn.
   - V3/V3b are re-read as *cell* histories.
4. Unaffected, because none treats a cell as one village over time: Tests 1, 2, 3 and 5;
   agent-level correlations; the population-level assembly order; the drift test; and V1–V2
   cross-sections.
5. Group selection very likely runs through wipe-and-recolonise. The wipe is composition-blind,
   so the selective step is which neighbours' migrants refill the cell. Measuring it needs the
   village ids and ended-village records now in `recordSyndrome`.

## 2026-11-18 (night) — CONCLUSIONS: drift after the transition (Chris's hypothesis)

Written after the raw block below. Details: `../analysis/FINDINGS.md`, "After the transition".

1. In mirror worlds under franchise A/B, the pot-acting genes τ, θ, φ and κ behave like ω: their
   variance is at ω's level and they wander at 0.7–0.8× ω's rate. The hypothesis holds there.
   Under franchise off it holds clearly only for φ.
2. λ is held low in mirror worlds (0.3–0.5× ω's drift rate, no movement off the boundary). The
   sanction destroys 1.6–3.2× what the pot collects. The steward's qualification holds: low λ is
   kept by selection, not drift.
3. In established worlds θ, φ and κ are held, and λ is held in balance_grid. τ wanders like ω in
   both sweeps. λ also wanders like ω in established constitution worlds (54 reps, slow cells:
   flagged, not leaned on).
4. The syndrome-pole failures are still under directional selection, not post-transition.
5. The instrument has limits. Variance trends are flat for every gene, ω included, so the test
   rests on standardised drift and variance level. "Held" and "released but not yet regrown"
   cannot be told apart for genes near 0.7× ω. The calibration needed is SPECS S4.5.

## 2026-11-18 (night) — DRIFT AFTER THE TRANSITION · RAW · re-analysis, no new runs

**Question.** After the transition, do policy genes drift (Chris: in defector worlds the pot is
~0, so τ, θ, φ and κ have nothing to act on) or stay under selection? Steward's qualification:
λ acts on withheld dues and may be selected low.

**Data.** Three more read-only pulls (commands in FINDINGS):
- series for balance_grid franchise A/B in the five matched families (166 reps)
- series for 18 constitution_grid cells `{i6_g1, i8_g1, base_g1, base_g2, base_g3, i8_g2}` ×
  `{fA, fB, foff_T50k}` (970 reps)
- village records for 90 A/B reps and 152 constitution reps

The earlier matched-family franchise-off pulls are reused.

**Method.** `../analysis/scripts/drift.mjs`.
- Window: 30k → 50k ticks.
- Groups:
  - established: coop > .5, with t* ≤ 25k
  - mirror: λ < .3 and κ > .6, with coop < .1 for good from ≤ 25k
  - syndrome-pole failure: λ > .7, κ < .4, coop ≤ .5
- Measures: standardised drift = |Δmean| ÷ within-population sd at 30k (median over reps);
  within-population variance ÷ ω's; across-village variance 50k ÷ 30k.
- Pot proxy from the final sample.

**RAW RESULTS.** Standardised drift (ω's value first), at 30k → 50k:

| group | n reps | ω | τ | θ | φ | κ | λ | ψ | coop |
|---|---|---|---|---|---|---|---|---|---|
| established, balance off | 227 | 0.24 | 0.30 | 0.11 | 0.13 | 0.11 | 0.15 | 0.32 | 0.23 |
| established, constitution | 54 | 0.26 | 0.27 | 0.12 | 0.19 | 0.13 | 0.26 | 0.35 | 0.28 |
| mirror, balance off | 106 | 0.34 | 0.26 | 0.24 | 0.43 | 0.19 | 0.11 | 0.27 | 0.06 |
| mirror, balance A/B | 122 | 0.19 | 0.13 | 0.15 | 0.16 | 0.13 | 0.10 | 0.12 | 0.07 |
| syndrome-pole failure, constitution | 433 | 0.32 | 0.18 | 0.10 | 0.37 | 0.33 | 0.15 | 0.32 | 0.59 |
| syndrome-pole failure, balance off | 33 | 0.42 | 0.30 | 0.25 | 0.40 | 0.32 | 0.32 | 0.54 | 0.71 |

Variance ÷ ω's at 30k:
- mirror, A/B: τ 1.21, θ 1.31, φ 1.26, κ 1.18, λ 0.06, ψ 0.29
- mirror, off: τ 0.42, θ 0.31, φ 0.41, κ 0.24, λ 0.10
- established, balance off: 0.10–0.25 for τ, θ, φ, κ and λ

Across-village variance, 50k ÷ 30k:
- mirror, off: φ 1.62, κ 1.25
- mirror, A/B: 0.93–1.03
- established: 0.87–1.20
- syndrome-pole failures: φ 0.41–0.68, κ 0.57–0.60

Pot ≤ τ·coop·stock per agent per tick, and sanction destruction τ·(1−coop)·λ·stock:

| group | pot | destroyed |
|---|---|---|
| established | 0.142–0.147 | 0.027–0.032 |
| mirror | 0.013–0.016 | 0.026–0.042 |
| syndrome-pole failures | 0.041–0.046 | 0.073–0.084 |

Mean stock: mirror 0.98–1.69; elsewhere 0.24–0.29.

## 2026-11-18 (late evening) — CORRECTIONS to the syndrome conclusions (after a cold review)

A cold reviewer recomputed the syndrome claims from `analysis/data` with independent code. I
recomputed each point with my own script, and every one reproduces: `../analysis/scripts/review_checks.mjs`,
output `analysis/results/review_checks.out.md`. These corrections amend items 4 and 2 of the
conclusions entry below.

1. **The mirror package is a subset of failures, not a general attractor.** Mirror = λ < .3 and
   κ > .6 at 50k.
   - balance_grid: 679/840 (81%) of franchise A/B failures and 333/805 (41%) of franchise-off
     failures are mirror.
   - constitution_grid: 71/752 (9%) are mirror, with median θ 0.65; 2 have θ < .4.
   - In constitution_grid, 557/752 (74%) of failures sit at the syndrome pole (λ > .7, κ < .4)
     with median coop 0.32. Of those, 323 were above .5 at some sample, and 424 have higher coop
     in the last 1 000 ticks than 5 000 ticks earlier.
2. **"At its poles 10–20k ticks before" overstated it.** Median leads over coop's half-move, at
   pSexual 0 / 0.5 / 1:
   - half-move: λ −14.5k / −17.8k / −19.7k
   - 90% move: λ −4.5k / −7.0k / −8.5k; κ −2.4k / −6.3k / −6.1k; φ −1.4k / −3.8k / −3.4k

   Restated: half-way 10–20k ticks before, at the poles by about t*.
3. **"λ separates the outcomes first, within 100 ticks" holds only when families are pooled.**
   - Within families: λ separates at 100–1 100 ticks and coop at 100–1 400; κ is first in
     i8_g4 at pSexual 0; θ is first in base_g4 at pSexual 0.5.
   - At tick 0, before any dynamics, d already reaches λ +0.73, τ +0.52 and ω −0.41 (pooled,
     pSexual 0), and ω −0.49 to −0.59 within families.
   - ω crosses d > 0.5 at tick 200 in i6_g2 at pSexual 0.
   - The early order is not resolvable above this noise floor. Claim withdrawn.
4. **The recombination test has per-family gaps.**
   - λ established − not is +0.03 in i6_g2 at pSexual 0, and +0.10 / +0.04 in base_g4 at
     pSexual 0.5 / 1. There the failing reps carry the syndrome too.
   - The κ sd drop (0.122 → 0.011) is mostly 4 off-pole reps: 0.052 without them.
   - The five families were selected because they establish at every pSexual level.
5. **constitution_grid final coop is a continuum, not bimodal.** Per 0.1 bin: 139 / 170 / 180 /
   226 across [0.3, 0.7). Its established-vs-not contrasts split that continuum at 0.5.

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
