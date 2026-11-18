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
  `birthThresholdRate` {1,2,3} × `franchiseMode` {off,A,B} × `pSexual` {0,0.5,1}. ω rides
  along as the inert null.
- **constitution_grid**: individual {base, i8, i6} × group-rate {1,2,3} × franchise/term
  {off@T1, off@T100, off@T50k, A (term voted), B (term voted)}. Fixed: signed θ/ψ on,
  `thresholdMode` percentile, `pSexual` 0.

Both run 50 000 ticks. Results and their reading are in `../DEVLOG.md` (2026-07-18,
2026-10-20) and `../DEVPLAN.md`.

## Run

```bash
cd sweep
node grid.mjs                              # -> grid.json (243 cells, balance_grid)
node grid-constitution.mjs                 # -> constitution.json (45 cells, constitution_grid)

# main box (12 workers):
node coordinator.mjs [grid.json] [PORT]    # default grid.json on :8090; auto-exits when all cells sufficient
node launch.mjs 12                         # 12 workers -> localhost:8090

# on mint (5 workers), pointing at the main box:
node launch.mjs 5 http://<main-box>:8090

# figures:
node figserver.mjs [PORT]                  # default :8091; COORD env = coordinator URL
```

**Port warning.** 8090/8091 are also defaults in PopGenSim and Hierarchical Trades, and
`worker.mjs` enrolls with whatever answers on the coordinator URL without checking which
collection it reached, so a collision can file runs into the wrong Mongo collection with
no error. Check the port is free (or pass another) before starting a sweep. The fix is in
`../DEVPLAN.md` Backlog and `../CLAUDE.md` ("Ports").

**Watch it:** **http://localhost:8090/** — live dashboard: a per-worker panel (current cell,
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

**Network:** mint needs to reach `<main-box>:8090` — open that port / check the firewall.
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
| `coordinator.mjs` | adaptive HTTP dispatcher (`/claim`, `/complete`, `/status`, `/`), :8090, Mongo-resume |
| `dashboard.html` | coordinator's live status page (file-served) |
| `worker.mjs` | claim → run (`headless`) → insert to Mongo → report coop → repeat |
| `headless.mjs` | load the RD sim in the main realm, run one config, return the data packet + coop |
| `launch.mjs` | spawn N workers pointed at a coordinator |
| `stats.mjs` | two-regime adaptive stopping rule (Wilson p + t level) |
| `figserver.mjs` / `figs.html` | fig server (:8091) and its page: per-cell aggregated figures from Mongo |
| `figcache/` | fig server's aggregate cache (gitignored) |
