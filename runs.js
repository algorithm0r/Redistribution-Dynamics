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
    { runName: "none-evolve-coupled", regime: "none", evolveTraits: true, coupleTraits: true, collection: "stage2" },

    // Model 2 genome policies as coordinates (within-village mechanic).
    { runName: "g-pool",     regime: "genome", tau: 1, theta: 0, phi: 0, kappa: 0, lambda: 0, coop: 1, collection: "stage3" },
    { runName: "g-floor",    regime: "genome", tau: 1, theta: 0.7, phi: 1, kappa: 0, lambda: 0, coop: 1, collection: "stage3" },
    { runName: "g-chiefdom", regime: "genome", tau: 1, theta: 0, phi: 1, kappa: 0.5, lambda: 0, coop: 1, collection: "stage3" },
    { runName: "g-welfare",  regime: "genome", tau: 0.5, theta: 0.5, phi: 1, kappa: 0, lambda: 0, coop: 1, collection: "stage3" },
];

if (typeof module !== "undefined" && module.exports) module.exports = { runs };
