/**
 * Experiment definitions. Each entry is a set of PARAMETERS overrides applied on
 * top of the defaults for one run; cycled through by the "Start Experiment" /
 * "Next Run" buttons in the browser and by runner.js headlessly.
 *
 * Stage 4 (indbirth_sweep): individual-level fecundity vs the group-based birth
 * baseline, at the current Model V defaults. epoch 20000, sample every 100.
 *   - baseline:      no individual birth policies (pure group births).
 *   - wealth-parent: group birth parent chosen ~ stock (no individual breeding).
 *   - indbirth-NN:   individual birth threshold swept 1..10 (group births still on).
 */
const COMMON = { spatial: true, collection: "indbirth_sweep2", epoch: 30000, reportingPeriod: 100 };

const runs = [
    { ...COMMON, runName: "baseline",      individualBirthThreshold: 0, birthWealthBias: 0 },
    { ...COMMON, runName: "wealth-parent", individualBirthThreshold: 0, birthWealthBias: 1 },
];
for (let t = 1; t <= 10; t++) {
    runs.push({ ...COMMON, runName: "indbirth-" + String(t).padStart(2, "0"),
                individualBirthThreshold: t, birthWealthBias: 0 });
}

/**
 * Franchise (psi) experiment — the evolvable "who votes" gene. Three conditions,
 * identical in every other respect (Model V defaults, randomized founders, migration
 * on), differing only in franchiseMode. Same 30k epoch / 100-tick cadence as the
 * indbirth sweep so the covariance & tercile machinery lines up.
 *   off — franchise disabled, everyone always votes (the pre-psi control)
 *   A   — psi set by universal suffrage, then gates the economic vote (self-corrects)
 *   B   — last tick's enacted psi gates the whole vote (entrenchment; the baseline
 *         where headless probes show autocracy taking over and coop collapsing)
 * Run: node runner.js --batch franchise_sweep --reps 5
 */
const FRANCHISE = { spatial: true, collection: "franchise_sweep", epoch: 30000, reportingPeriod: 100,
                    randomizeGenes: true, individualBirthThreshold: 0, birthWealthBias: 0 };
for (const mode of ["off", "A", "B"]) {
    runs.push({ ...FRANCHISE, runName: "franchise-" + mode, franchiseMode: mode });
}

if (typeof module !== "undefined" && module.exports) module.exports = { runs };
