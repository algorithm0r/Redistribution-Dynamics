# STATUS — Redistribution Dynamics

Updated: 2026-07-18
Verified: never by cold `/audit` (this line moves only on a cold audit, not at session close)

Provenance stamp `<version>`: **`v0.1.0`** (commit `90a0ae0`) — first tagged release.
Since then: main-realm headless (~7–10× faster), the fig server (:8091), and the
constitutional layer (below). Later drift reads as `v0.1.0-N-g<sha>`.

## Stage
Model V live. Added a **constitutional (meta) layer**: signed θ/ψ filters (either tail) and
**termed constitutions** with a voted **term (T)** meta-gene. Distributed adaptive sweep +
fig server (:8091) both in use. `balance_grid` (243 cells) complete; `constitution_grid`
(45 cells) now running.

## State
- **Builds/runs.** `worldsmoke` **PASS** ×3: franchise-check (defaults == old mechanism),
  signed-check (proletarian ψ=.3 → poor win, plutocratic ψ=.7 → rich win), constitution-check
  (T=100 locks between elections, re-votes at term, voted term .5 → 25001).
- Defaults preserve the old model: `signedThreshold` off, `constitutionTerm` 1, `term` drifts
  inert like ω. `term` is the 9th recorded gene (genome, covariance, endpoint, dashboards).
- **Live experiment:** `constitution_grid` — 17 workers (12 `DESKTOP-QQL4VJJ` + 5 `mint`) on
  the main-realm headless. Coordinator `node coordinator.mjs constitution.json` on `:8090`.
  Data → Mongo `redistribution_dynamics.constitution_grid`.
- **Prior:** `balance_grid` complete (243/243, ~2210 reps at minN 5). Analysis: coop is rare
  (14/243), needs franchise-off + weak/no individual selection + strong group selection;
  cooperative worlds co-evolve high λ (punish), high φ (needs-first), low κ (hub-keep),
  progressive θ; ω flat (real selection, not drift). This shaped the new sweep.

## Metrics
- `constitution_grid`: 45 cells = individual {base, i8, i6} × group-rate {1,2,3} ×
  franchise/term {off@T1, off@T100, off@T50k, A(voted), B(voted)}. Fixed: signed θ/ψ on,
  thresholdMode percentile, pSexual 0. Adaptive stop minN 5, maxN 60, coop CI ±0.03.
- Term mapping: voted term gene [0,1] → [1, termMax=50000] ticks (`1 + g·(termMax−1)`).

## Branches
`main` (only). Remote `origin` = github.com/algorithm0r/Redistribution-Dynamics. Local
commits ahead of origin (unpushed).

## Open
- **Fig dashboard grid parser still expects the balance_grid id layout** (`ic_g#_f#_s#`), so
  the new cells (`base_g1_foff_T1`, `i8_g2_fA`) don't lay out in the facet view — per-cell
  `/agg` figures work, the grid navigator needs new axes. (Next.)
- Browser UI inputs for `signedThreshold`/`constitutionTerm`/`term` not added (defaults hold;
  the sweep sets them via config).
- `term` intentionally NOT in `policyDistance` (kept 6-gene, like ω) — migration-on-term is a
  future option (DEVPLAN).
- Migration ignores the cap → villages reach ~1.7× cap (accepted).

## Next action
Upgrade the fig server/dashboard grid for the constitution axes (individual × group-rate ×
franchise/term). Analyze `constitution_grid` as it fills: does signed/proletarian
redistribution or a locked constitution open new cooperative regions?

## Blockers
None. (Live-network ops require the Bash sandbox disabled — DNS/socket are blocked otherwise.)
