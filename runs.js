/**
 * Experiment definitions. Each entry is a set of PARAMETERS overrides applied on
 * top of the defaults for one run; cycled through by the "Start Experiment" /
 * "Next Run" buttons in the browser and by runner.js headlessly.
 *
 * Stage 1: the three automatic regimes, all else at PARAMETERS defaults.
 */
const runs = [
    { runName: "none",  regime: "none",  collection: "stage1" },
    { runName: "share", regime: "share", collection: "stage1" },
    { runName: "theft", regime: "theft", collection: "stage1" },
    { runName: "pool",  regime: "pool",  collection: "stage1" },

    // Evolution (Mode 2 seed): same regimes with trait evolution on.
    { runName: "none-evolve", regime: "none", evolveTraits: true, collection: "stage2" },
    { runName: "pool-evolve", regime: "pool", evolveTraits: true, collection: "stage2" },
];

if (typeof module !== "undefined" && module.exports) module.exports = { runs };
