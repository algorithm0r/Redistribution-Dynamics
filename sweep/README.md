# sweep/ — adaptive batch runner for the selection × draft grid

An in-memory **adaptive coordinator** + worker pool for the 225-cell factorial
(`birthWealthBias × individualBirthThreshold × franchiseMode × pSexual`). Streamlined
from the domestication project's driver+coordinator+queue into one service.

Instead of a fixed rep count, each cell is replicated until its **coop CI** is tight
(or it hits `maxN`). Bistable cells — some reps cooperate, some collapse — are detected
and get the `p(establish)` (Wilson) + `level|establish` (t) treatment automatically
(`stats.mjs`); unimodal cells stop at `minN`.

**Ports 8090 (coordinator) / 8091 (fig, reserved)** — chosen to sit beside
domestication's 8088/8089 so both can run at once. Metric: final mean `coop`. `minN=3`.
Collection: `select_draft_grid` (dedicated). Same sim source as the browser (loaded via
`vm` from `../`), so results match `runner.js`.

## Run

```bash
cd sweep
node grid.mjs                              # -> grid.json (225 cells)

# main box (12 workers):
node coordinator.mjs                       # listens on :8090, auto-exits when all cells sufficient
node launch.mjs 12                         # 12 workers -> localhost:8090

# on mint (5 workers), pointing at the main box:
node launch.mjs 5 http://<main-box>:8090
```

**Watch it:** open **http://localhost:8090/** — a live dashboard: a **per-worker panel**
(each worker's current cell, a tick/50000 progress bar, pop, and host — so local vs mint
are visible) fed by heartbeats every ~5s, plus 9 facets (franchiseMode × pSexual), each a
5×5 β×ind grid where **each cell shows its mean coop** coloured on a CVD-safe viridis ramp
(dark purple 0 → yellow 1); a small number = reps so far, a black box = statistically
sufficient. Grey = not yet run. Also a `[status]` console line every 15s. The coordinator
exits when every cell is sufficient; workers exit when it says `done`. Full data packets
land in Mongo (`select_draft_grid`); `coop` drives stopping.

**Dispatch is dovetailed:** the coordinator hands out the run with the fewest completed
reps that needs more (list order breaks ties), so all 225 cells get their 1st rep before
any gets its 2nd — load stays balanced across cells and machines.

**Robustness:** workers heartbeat while running; if one goes silent for `STALE_MS`
(default 120s — a hung/killed worker), the coordinator **reclaims its cell** so it gets
re-dispatched. (Note: coordinator state is in-memory — a coordinator restart currently
re-runs cells already in Mongo. A Mongo-resume on startup is the next robustness add.)

**Network:** mint needs to reach `<main-box>:8090` — open that port / check the firewall.

## Tuning

`stats.mjs` `DEFAULTS`: `threshold` (coop above which cooperation "established", 0.5),
`eLevel` (target level CI half-width, 0.03), `eP` (target ignite-proportion CI, 0.10),
`minN` (3), `maxN` (60). To switch to a basin/probability metric for bistable cells
later, feed a different sample array to `evaluate()` — the two-regime logic is
metric-agnostic.

## Files

| file | role |
|---|---|
| `grid.mjs` | generate the 225-cell factorial → `grid.json` |
| `coordinator.mjs` | adaptive HTTP dispatcher (`/claim`, `/complete`, `/status`), :8090 |
| `worker.mjs` | claim → run (`headless`) → insert to Mongo → report coop → repeat |
| `headless.mjs` | load RD sim in `vm`, run one config, return the data packet + coop |
| `launch.mjs` | spawn N workers pointed at a coordinator |
| `stats.mjs` | two-regime adaptive stopping rule (Wilson p + t level) |

## Not yet built (next stage)

The **fig dashboard** (raw aggregation → figures as runs land) is deferred per plan.
Starting point: pull `select_draft_grid` by cell → mean/CI of coop, gene means, ω →
simple heatmaps over the β×ind grid, faceted by franchise×pSexual. Port 8091.
