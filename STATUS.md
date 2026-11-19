# STATUS — Redistribution Dynamics

Updated: 2026-11-18 evening (steward; reimplementer code landed)
Verified: never by cold `/audit` (this line moves only on a cold audit, not at session close).
The reimplementer's diff `a165835..cc458f1` had an independent code review on 2026-11-18. It
found no data-corrupting bug and verified all four claims; its five plumbing fixes are in
`37ed0d7..0020a62`.

Provenance stamp `<version>`: **`v0.1.0`** (commit `90a0ae0`) — first tagged release.
Drift since reads as `v0.1.0-N-g<sha>`. HEAD now `0020a62`. The reimplementer commits change
sim code (instrumentation and controls, every one behind a switch defaulting off).

## Stage
**Manuscript under a steward.** The lead is now the policy–cooperation syndrome; see
`../paper/STORY.md`, the source of truth for the story. The constitutional result is
secondary. Instrumentation and controls for the next experiments are built, reviewed and
smoke-tested. **The paper runs (expA–expD, ~140 CPU-h; draft in
`notes/preregistration-draft.md`) are not started and wait on Chris's timing.**

## State
- **Builds/runs.** With every new switch off, `regress.mjs` is IDENTICAL to the fixed-seed
  baseline (11 scenarios + seeded smoke stdout), checked by the steward @ `0020a62`.
  `switchsmoke.mjs all` passes (reimplementer). `worldsmoke` PASS ×3. Browser page not checked.
- **Villages turn over fast** (~0.4 catastrophe wipes per tick on a full grid, ~250-tick
  lifespans; reimplementer's direct count). Earlier "never go extinct" statements described cells.
- The constitutional-layer text below is from 2026-10-20 and is kept as history. The current
  reading, including the corrections, is in STORY.md and `../analysis/FINDINGS.md`.
- **`constitution_grid` complete + ANALYZED 2026-10-20:** 1801 reps / 45 cells (~40/cell), all
  written 2026-07-18 (confirmed in Mongo; nothing since). **Negative result:** neither signed
  θ/ψ, nor locking a constitution (term T), nor enfranchising voters (A/B) opens any new
  cooperation region beyond the franchise-off basin; the new knobs *suppress* coop where they
  act. Franchise/term pEst: off-continuous 0.81 → off-locked 0.72 → off-founding 0.34 →
  franchise A 0.24 / B 0.30. Syndrome unchanged (high λ/φ, low κ, progressive θ); ω flat = real
  selection. (Numbers from cached final-tick gene means; raw caches are throwaway scratchpad.)
- **`balance_grid` complete:** 243 cells (~2210 reps); recomputed 16/243 cooperating (all
  franchise-off), consistent with the 14/243 logged 2026-07-18 (threshold-method difference).
  Coop needs franchise-off + weak/no individual selection + strong group selection.

## Metrics
- `constitution_grid`: 45 cells = individual {base, i8, i6} × group-rate {1,2,3} ×
  franchise/term {off@T1, off@T100, off@T50k, A(voted), B(voted)}. Fixed: signed θ/ψ on,
  thresholdMode percentile, pSexual 0. Adaptive stop minN 5, maxN 60, coop CI ±0.03.
- Establishment metric used in analysis: final mean coop > 0.5; cell pEst = fraction of reps
  establishing. Term mapping: voted term gene [0,1] → [1, termMax=50000] ticks.

## Branches
`main` (only). Remote `origin` = github.com/algorithm0r/Redistribution-Dynamics. In sync with
origin through `809cdfd` (pushed 2026-11-18).

## Open
- Browser UI inputs for `signedThreshold`/`constitutionTerm`/`term` not added (defaults hold;
  sweeps set them via config).
- `term` intentionally NOT in `policyDistance` (kept 6-gene, like ω) — migration-on-term is a
  future option.
- Migration ignores the cap → villages reach ~1.7× cap (accepted gap).
- ρ (signed "who receives" allocation gate) still unbuilt (deferred).
- The 2026-10-20 analysis numbers have no in-tree script behind them (session-scratch caches,
  now gone). Commit an analysis script and re-derive before the write-up cites them (Backlog).
- No literature pass yet; positioning/novelty depends on it (Backlog), as do the
  paper-readiness items (bistability stats, sensitivity sweeps, ODD).
- Sweep port/collection safety bug carried to DEVPLAN Backlog (workers can file into the wrong
  Mongo collection on a port collision).

## Next action
**Manuscript, under a steward (since 2026-11-18).** Chris made the manager session the steward
of this project until a manuscript exists. The agreed story is `../paper/STORY.md` (owned by the
steward). Three sessions launched 2026-11-18, each in its own folder:
- **rd-lit** → `../lit/`: novelty verdict on the constitutional negative result, method
  precedents for ω, venue analysis.
- **rd-analysis** → `../analysis/` (new repo) + `EXPLOG.md` here: re-derive both sweeps with the
  two-regime stats, the franchise×term confound, the policy-gap test (or its instrumentation
  spec), draft figures. No new runs.
- **rd-author** → `../paper/` (new repo): LaTeX, ODD + Methods first, in Chris's voice.
A reimplementer (instrumentation, ports fix, `expNNN` data protocol, paper-data runs through
`cpuslot`) comes later, once analysis specifies what is needed and the CPU is free.

## Blockers
None. (Live-network / Mongo ops require the Bash sandbox disabled — DNS/socket blocked otherwise.)
