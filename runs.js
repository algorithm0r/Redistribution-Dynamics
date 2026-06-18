/**
 * Experiment definitions. Each entry is a set of PARAMETERS overrides applied on
 * top of the defaults for one run; cycled through by the "Start Experiment" /
 * "Next Run" buttons in the browser and by runner.js headlessly.
 *
 * Populated once Model 1 defines its parameters. Example shape:
 *   { runName: "baseline", collection: "batch_001", initialAgents: 100 },
 */
const runs = [];

if (typeof module !== "undefined" && module.exports) module.exports = { runs };
