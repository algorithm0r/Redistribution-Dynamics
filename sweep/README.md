# sweep/ — adaptive distributed sweep runner + fig server

An in-memory **adaptive coordinator** + worker pool that runs a grid of Model V configs
across machines and writes every run's full data packet to Mongo. Streamlined from the
domestication project's driver+coordinator+queue into one service. A **fig server** reads
those packets back and renders per-cell figures.

Instead of a fixed rep count, each cell is replicated until its **coop CI** is tight
(or it hits `maxN`). Bistable cells — some reps cooperate, some collapse — are detected
and get the `p(establish)` (Wilson) + `level|establish` (t) treatment automatically
(`stats.mjs`); unimodal cells stop at `minN`. Metric: final mean `coop`.

Same sim source as the browser: `headless.mjs` loads `../*.js` into the **main V8 realm**
by indirect `eval` (not a `vm` sandbox, which cost ~7–10× in the hot loop; DEVLOG
2026-07-17). If you add a sim file, add it to `SIM_FILES` in `headless.mjs`.

## Sweeps (both complete)

| grid file | generator | Mongo collection | cells | reps | status |
|---|---|---|---|---|---|
| `grid.json` | `grid.mjs` | `balance_grid` | 243 | ~2210 | complete 2026-07 |
| `constitution.json` | `grid-constitution.mjs` | `constitution_grid` | 45 | 1801 | complete 2026-07-18; analyzed 2026-10-20 |

- **balance_grid**: individual-selection union [9] (baseline · β-arm · ind-arm) × group-rate
  `birthThresholdRate` {2,4,6} × `franchiseMode` {off,A,B} × `pSexual` {0,0.5,1}. ω rides
  along as the inert null.
- **constitution_grid**: individual {base, i8, i6} × group-rate {1,2,3} × franchise/term
  {off@T1, off@T100, off@T50k, A (term voted), B (term voted)}. Fixed: signed θ/ψ on,
  `thresholdMode` percentile, `pSexual` 0.

Both run 50 000 ticks. Results and their reading are in `../DEVLOG.md` (2026-07-18,
2026-10-20) and `../DEVPLAN.md`.

## Run (expNNN data protocol, from 2026-11-18)

Paper-data runs are numbered experiments (conventions §4): register, pre-register, run.

```bash
cd sweep
node experiment.mjs new <slug> "<one-line question>"   # claims expNNN -> collection expNNN_<slug>
#   then: '## expNNN — ...' pre-registration in ../EXPLOG.md (the coordinator refuses without it)
#   and a grid file whose cells' config.collection is expNNN_<slug>
#   (cells may carry "reps": N for a fixed design; otherwise the adaptive rule in stats.mjs)

node coordinator.mjs <grid.json>          # binds a derived port, prints it, answers /whoami
node launch.mjs expNNN_<slug>             # desktop: queues one-shot workers in cpuslot (tag redistribution-dynamics)
COORD=http://<main-box>:<port> node launch.mjs expNNN_<slug> --direct 5   # mint: 5 looping workers

node figserver.mjs [PORT]                 # figures, default :8091
```

- Each claim carries a **seed**; the run is `<cell>_s<seed>`, stamped with `PARAMETERS.id`
  (project, exp, run, seed, commit, dirty, host, started) and saved by `db.js` to Mongo (the
  record) plus `../results/<collection>/<run>.json` (reading copy, gitignored). A saved run
  re-runs byte-identical from its stored `_parameters` (checked 2026-11-18).
- Workers find the coordinator **by identity**: one serving another collection is refused, so a
  port collision can no longer misfile runs (the old Backlog bug).
- **cpuslot:** one-shot workers release their slot after every run, so other projects keep their
  turns. Watch http://localhost:8000/cpu/; cancel with `cpuslot cancel --tag redistribution-dynamics`.
- **Smoke tests:** add `--scratch` to `experiment.mjs`, `coordinator.mjs` and `launch.mjs` (db
  `redistribution_dynamics_scratch`, JSON under `../results/_scratch/`, no EXPLOG needed);
  `node experiment.mjs drop-scratch` afterwards.
- **Old sweeps:** `LEGACY=1 node coordinator.mjs grid.json` resumes `balance_grid` /
  `constitution_grid` (generators `grid.mjs`, `grid-constitution.mjs`). Their documents predate
  seeds and `PARAMETERS.id`.
- **Packet size:** `node packetsize.mjs <name> '<json overrides>'` runs one config at full length
  and prints its BSON size by key (through cpuslot: it takes minutes).

**Watch it:** the coordinator's URL as printed at startup — live dashboard: a per-worker panel (current cell,
tick progress bar, pop, host) fed by heartbeats every ~5s, plus the grid with each cell's
mean coop on a CVD-safe viridis ramp (dark purple 0 → yellow 1); small number = reps so far,
black box = statistically sufficient, grey = not yet run. Served from `dashboard.html`
(edit live, no restart). Also a `[status]` console line every 15s. The coordinator exits
when every cell is sufficient; workers exit when it says `done`.

**Figs:** **http://localhost:8091/** — click a cell → `figserver.mjs` pulls that run's reps
from Mongo, aggregates them as `../dashboard.js` does (time series averaged, histogram
buckets pooled, covariance → corr(coop, gene)), caches to `figcache/` (gitignored,
regenerated on demand), and `figs.html` renders it. Lays out both the balance_grid and the
constitution_grid id schemes.

**Dispatch is dovetailed:** the coordinator hands out the run with the fewest completed
reps that needs more (list order breaks ties), so every cell gets its 1st rep before any
gets its 2nd — load stays balanced across cells and machines.

**Robustness:** Mongo is the source of truth. On startup the coordinator loads completed
reps from Mongo (`syncFromMongo('resume')`) and re-syncs every `SYNC_MS` (default 180s),
so a restart does not re-run finished cells. Workers heartbeat while running; one silent
for `STALE_MS` (default 300s) is reaped and its cell reclaimed. Coordinator *logic*
changes need a full-fleet restart (a coordinator-only restart can transiently dupe a cell).

**Network:** mint needs to reach `<main-box>:<port>` (the port the coordinator printed) — open it / check the firewall.
Mongo is reached through the shared Server at `research.climbinggiants.com:8888`.

## Tuning

`stats.mjs` `DEFAULTS`: `threshold` (coop above which cooperation "established", 0.5),
`eLevel` (target level CI half-width, 0.03), `eP` (target ignite-proportion CI, 0.10),
`minN` (5), `maxN` (60). The two-regime logic is metric-agnostic: feed a different sample
array to `evaluate()` to stop on another metric.

## Files

| file | role |
|---|---|
| `grid.mjs` | generate the 243-cell balance factorial → `grid.json` |
| `grid-constitution.mjs` | generate the 45-cell constitution grid → `constitution.json` |
| `coordinator.mjs` | HTTP dispatcher (`/claim` with seed, `/complete`, `/status`, `/whoami`, `/`), port via `ports.mjs`, EXPLOG gate, Mongo-resume, adaptive or fixed reps |
| `dashboard.html` | coordinator's live status page (file-served) |
| `worker.mjs` | find coordinator by identity → claim (cell, seed) → seeded run → `db.js` save → report coop; `--once` for cpuslot |
| `headless.mjs` | load the RD sim in the main realm, run one config, return the data packet + coop |
| `launch.mjs` | queue one-shot workers in cpuslot (default) or spawn `--direct N` looping workers (mint) |
| `experiment.mjs` | experiment registry: `new` / `list` / `finish` / `export` / `drop-scratch` |
| `ports.mjs` | vendored scaffold port derivation + `/whoami` discovery (do not edit; re-vendor) |
| `packetsize.mjs` | probe: one full-length run, BSON size per key + wall time |
| `stats.mjs` | two-regime adaptive stopping rule (Wilson p + t level) |
| `figserver.mjs` / `figs.html` | fig server (:8091) and its page: per-cell aggregated figures from Mongo |
| `figcache/` | fig server's aggregate cache (gitignored) |
