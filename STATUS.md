# STATUS — Redistribution Dynamics

Updated: 2026-07-17
Verified: never by cold `/audit` (this line moves only on a cold audit, not at session close)

Provenance stamp `<version>`: **`v0.1.0`** (commit `90a0ae0`) — first tagged release,
pushed to `origin`. Later drift reads as `v0.1.0-N-g<sha>`.

## Stage
Model V (grid of villages, evolved redistribution genome) fully built and **live under a
distributed adaptive parameter sweep**. Reproduction model just switched hard cap → **soft
cap**. Draft-vs-selection controls (ω tracer, sexual reproduction) added.

## State
- **Builds/runs.** `worldsmoke` franchise-check **PASS**; `smoketest` Ginis stable @ session work.
- `medianInPlace` verified == old `median` on 120k random cases (odd/even/dupes/sorted/all-equal).
- Recombination unit-checked (per-gene 50/50; `pSexual`=0 → 100% clones).
- Soft-cap headless test: mean village pop ~74 (< cap 100), total 12k→7.4k, grid fills 100/100.
- **Live experiment:** `balance_grid` sweep running — 17 workers (12 `DESKTOP-QQL4VJJ` + 5
  `mint`), no dupes, dovetailing. Coordinator on `:8090` (dashboard at http://localhost:8090/).
  Data → Mongo `redistribution_dynamics.balance_grid` via `research.climbinggiants.com:8888`.

## Metrics
- Sweep: 243 cells = individual union (9: base + β{0.5,1,2,4} + ind{2,4,6,8}) × group-rate
  {2,4,6} × franchise{off,A,B} × pSexual{0,0.5,1}. Adaptive stop: minN 3, maxN 60, coop CI
  target ±0.03 (two-regime Wilson-p + t-level, handles bistable cells).
- Perf: genePolicy −~20%/call, applyGenomePolicy −~22%/call → ~20–25% faster/tick.

## Branches
`main` (only). Remote `origin` = github.com/algorithm0r/Redistribution-Dynamics.

## Open
- Migration ignores the cap → villages reach ~1.7× cap (accepted for now; could soft-gate migration-in).
- `fission`/`fissionTarget`/`fissionSize`/`fissionMaxFraction` are dead code/params post-soft-cap.
- Fig/aggregation dashboard (8091) not built.

## Next action
Analyze `balance_grid` as cells fill; build the fig dashboard (coop/gene-means/ω heatmaps
over the grid). Iterate UI via `sweep/dashboard.html` (file-served, no restart); coordinator
logic changes need a **full-fleet** restart (coordinator-only risks a transient dupe).

## Blockers
None. (Live-network ops require the Bash sandbox disabled — DNS/socket are blocked otherwise.)
