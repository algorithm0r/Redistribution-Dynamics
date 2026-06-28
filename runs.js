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
const COMMON = { spatial: true, collection: "indbirth_sweep", epoch: 20000, reportingPeriod: 100 };

const runs = [
    { ...COMMON, runName: "baseline",      individualBirthThreshold: 0, wealthProportionalBirth: false },
    { ...COMMON, runName: "wealth-parent", individualBirthThreshold: 0, wealthProportionalBirth: true },
];
for (let t = 1; t <= 10; t++) {
    runs.push({ ...COMMON, runName: "indbirth-" + String(t).padStart(2, "0"),
                individualBirthThreshold: t, wealthProportionalBirth: false });
}

if (typeof module !== "undefined" && module.exports) module.exports = { runs };
