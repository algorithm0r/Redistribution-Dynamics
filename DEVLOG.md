# DEVLOG — Employment Simulator

Newest entries at the top.

## 2026-06-17

- **Reframed Model 1 regimes as a dimension space.** Chris's point: the five
  dictated regimes are spanning *examples*, not a list; my additions were
  variants along hidden axes. Identified primary axes — Trigger, Return, Control
  (+ Consent overlay, Allocation secondary) — and placed all regimes as
  coordinates; the axes generate institutions in neither original list
  (debt-bondage, chiefdom, collective-labor commune). Added the two run modes:
  Mode 1 (fixed N, hunger = non-lethal counter, regimes as treatments) and Mode 2
  (evolutionary group selection, where the axes *are* the strategy space).
  Proposed a derived run collection: named anchors + two single-axis transects
  through the Mode-2 battleground. DEVPLAN updated; still draft.
- **Drafted Model 1** (gather–consume with exchange regimes) into `DEVPLAN.md`
  from Chris's dictation. Captured the core loop, the two experimental params
  (boon = chance-not-consume; bane = chance-not-gather), five exchange regimes
  (none / altruism / gift-reputation / employment / community), candidate
  additional regimes (credit-debt, predation, central tax, insurance pool,
  potlatch), and the load-bearing open questions (hunger stakes, luck vs. traits,
  regime-as-treatment vs. competing strategies, intra-tick timing). Not frozen.
- Process note: DEVLOG is append-only, newest entry at top — prepend new dated
  entries; do not rewrite prior ones.
- **Stood up the bare framework.** Studied the games-class framework lineage
  (`../HexPipes`, `../Random Exchange`, `../Server`). Decision: reuse the generic
  machinery, leave the domain layer as stubs for the dictated models ("bare
  framework only").
  - Framework: `gameengine.js`, `timer.js`, `util.js`, `graph.js`,
    `histogram.js`, `assetmanager.js`, `index.html`, `style.css`.
  - Params + data machinery: `parameters.js` (PARAMETERS + load/save UI),
    `datamanager.js` (sample → epoch → `socket.emit("insert")`), `main.js`
    (socket connect + run cycling), `runs.js`, `runner.js` (headless worker-thread
    batch runner → MongoDB). DB name: `employment_simulator`; points at the
    shared `../Server`, which is not copied.
  - Domain stubs awaiting Model 1: `agent.js`, `population.js`, `observer.js`.
  - All 14 JS files pass `node --check`. App loads and shows a placeholder
    Observer (tick / agent count / run name).
  - Recorded the architecture in `DEVPLAN.md`.
- Initialized the project: git repo, `README.md`, `DEVPLAN.md`, `DEVLOG.md`,
  `.gitignore`. Framed the project as a simulation of employment within a
  broader model of *exchanges* between agents.
- Next: Chris dictates Model 1 into `DEVPLAN.md`; we then implement it across the
  domain layer.
