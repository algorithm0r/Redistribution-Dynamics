/**
 * Global parameters object. One flat record of everything a run is configured
 * by; it is serialized verbatim into each saved data packet so a run is fully
 * reproducible from its stored parameters.
 *
 * Sections:
 *   - Domain: Model 1, Stage 1 — gather/consume with three automatic regimes.
 *   - Framework / data: loop, reporting, and database wiring (stable machinery).
 */
const PARAMETERS = {
    runName: "Run From Controls",

    // ── Domain (Model 1, Stage 1 — see DEVPLAN.md) ─────────────────────────
    initialAgents: 100,
    initialStock: 10,         // starting resource stock per agent

    pNoGather: 0.1,           // chance to fail gathering this tick  (bane)
    pNoConsume: 0.1,          // chance to skip consumption this tick (boon)

    // Redistribution rule, applied every tick between gather and consume:
    //   'none'  — no transfers
    //   'share' — hungry agents pull 1 from the richest agent with surplus
    //   'theft' — hungry agents seize 1 from a *random* agent with surplus;
    //             with prob conflictChance the resource is destroyed instead
    //   'pool'  — all stock pooled and split equally
    //   'genome'— Model 2: redistribution driven by the social genome below
    regime: "none",
    conflictChance: 0.25,     // 'theft' only: chance the seized resource is lost

    // Model 2 social genome (used by the 'genome' regime; see DEVPLAN.md). These
    // seed every agent's genes; uniform for now (evolution comes with the grid).
    tau: 0.5,        // collection rate
    theta: 0.5,      // progressivity threshold (fraction of richest)
    phi: 1.0,        // distribution focus: equal (0) -> neediest-first (1)
    kappa: 0.0,      // hub (richest) retained share
    lambda: 0.0,     // punishment: chance a defector's due is destroyed
    coop: 1.0,       // compliance: chance an agent pays in when asked

    // Evolution: when on, a starving agent dies and is replaced by a mutated
    // offspring of a survivor, so pNoGather/pNoConsume evolve under selection.
    evolveTraits: false,
    mutationStdev: 0.02,      // std dev of the Gaussian trait mutation
    deathChance: 0.01,        // per-tick random (trait-independent) death chance
    coupleTraits: false,      // tie pNoGather == pNoConsume as one gene (drift 0)

    // Model V — grid of villages (spatial group selection; see DEVPLAN.md).
    spatial: false,           // run the World grid instead of a single Population
    gridRows: 10,
    gridCols: 10,
    seedVillages: 10,         // founding villages on the empty grid
    seedPop: 12,              // starting population per founding village
    randomizeGenes: true,     // seed founders with random social genes (else from inputs)
    cap: 100,                 // soft carrying capacity per village
    birthThreshold: 50,       // growth points (needs-met villager-ticks) per new villager
    fissionSize: 0.5,         // fraction of a capped village that buds off
    fissionMaxFraction: 0.5,  // a target may receive a colony only if pop < this * cap
    starveDeathChance: 0.5,   // per-tick death chance for an unfed agent
    catastropheChance: 0.001, // per-tick chance an entire village is wiped out
    pMigrateRandom: 0.0,      // migration vector: relocate to a random neighbour
    pMigrateMisfit: 0.0,      // migration vector: relocate by policy mismatch (Tiebout)
    pMigrateStarve: 0.0,      // migration vector: relocate when unfed (seek food)
    gridColorGene: "tau",     // which gene paints the grid (red 0 -> green 1)
    displayMode: "policy",    // 'policy' (gene colour) or 'villagers' (within-village wealth)

    idCounter: 0,   // monotonic source of unique agent ids; reset at run start

    // ── Framework / data ───────────────────────────────────────────────────
    updatesPerDraw: 1,        // sim ticks per rendered frame (raise to fast-forward)
    reportingPeriod: 100,     // record statistics every N ticks
    epoch: 10000,             // ticks per run before data is sent and the run ends

    db: "redistribution_dynamics",
    collection: "stage1",
    ip: "https://73.19.38.112:8888",   // shared socket.io -> MongoDB server (../Server)
};

/** Pull parameters from the control-panel inputs into PARAMETERS. */
const loadParametersFromUI = () => {
    PARAMETERS.initialAgents = parseInt(document.getElementById("numAgents").value);
    PARAMETERS.initialStock  = parseInt(document.getElementById("initialStock").value);
    PARAMETERS.pNoGather     = parseFloat(document.getElementById("pNoGather").value);
    PARAMETERS.pNoConsume    = parseFloat(document.getElementById("pNoConsume").value);
    PARAMETERS.regime        = document.getElementById("regime").value;
    PARAMETERS.conflictChance = parseFloat(document.getElementById("conflictChance").value);
    PARAMETERS.tau    = parseFloat(document.getElementById("tau").value);
    PARAMETERS.theta  = parseFloat(document.getElementById("theta").value);
    PARAMETERS.phi    = parseFloat(document.getElementById("phi").value);
    PARAMETERS.kappa  = parseFloat(document.getElementById("kappa").value);
    PARAMETERS.lambda = parseFloat(document.getElementById("lambda").value);
    PARAMETERS.coop   = parseFloat(document.getElementById("coop").value);
    PARAMETERS.evolveTraits  = document.getElementById("evolveTraits").checked;
    PARAMETERS.mutationStdev = parseFloat(document.getElementById("mutationStdev").value);
    PARAMETERS.deathChance   = parseFloat(document.getElementById("deathChance").value);
    PARAMETERS.coupleTraits  = document.getElementById("coupleTraits").checked;
    PARAMETERS.epoch         = parseInt(document.getElementById("epoch").value);
    PARAMETERS.reportingPeriod = parseInt(document.getElementById("reportingPeriod").value);
    PARAMETERS.updatesPerDraw  = parseInt(document.getElementById("updatesPerDraw").value);

    PARAMETERS.spatial            = document.getElementById("spatial").checked;
    const gridSize                = parseInt(document.getElementById("gridSize").value);
    PARAMETERS.gridRows = gridSize;
    PARAMETERS.gridCols = gridSize;
    PARAMETERS.cap                = parseInt(document.getElementById("cap").value);
    PARAMETERS.birthThreshold     = parseInt(document.getElementById("birthThreshold").value);
    PARAMETERS.starveDeathChance  = parseFloat(document.getElementById("starveDeathChance").value);
    PARAMETERS.catastropheChance  = parseFloat(document.getElementById("catastropheChance").value);
    PARAMETERS.fissionSize        = parseFloat(document.getElementById("fissionSize").value);
    PARAMETERS.fissionMaxFraction = parseFloat(document.getElementById("fissionMaxFraction").value);
    PARAMETERS.randomizeGenes      = document.getElementById("randomizeGenes").checked;
    PARAMETERS.pMigrateRandom     = parseFloat(document.getElementById("pMigrateRandom").value);
    PARAMETERS.pMigrateMisfit     = parseFloat(document.getElementById("pMigrateMisfit").value);
    PARAMETERS.pMigrateStarve     = parseFloat(document.getElementById("pMigrateStarve").value);
    PARAMETERS.gridColorGene      = document.getElementById("gridColorGene").value;
    PARAMETERS.displayMode        = document.getElementById("displayMode").value;

    PARAMETERS.runName = "Run From Controls";
    const runNameEl = document.getElementById("runName");
    if (runNameEl) runNameEl.innerText = PARAMETERS.runName;
};

/** Push PARAMETERS back into the control-panel inputs (e.g. when loading a run). */
const saveParametersToUI = () => {
    document.getElementById("numAgents").value    = PARAMETERS.initialAgents;
    document.getElementById("initialStock").value = PARAMETERS.initialStock;
    document.getElementById("pNoGather").value    = PARAMETERS.pNoGather;
    document.getElementById("pNoConsume").value   = PARAMETERS.pNoConsume;
    document.getElementById("regime").value       = PARAMETERS.regime;
    document.getElementById("conflictChance").value = PARAMETERS.conflictChance;
    document.getElementById("tau").value    = PARAMETERS.tau;
    document.getElementById("theta").value  = PARAMETERS.theta;
    document.getElementById("phi").value    = PARAMETERS.phi;
    document.getElementById("kappa").value  = PARAMETERS.kappa;
    document.getElementById("lambda").value = PARAMETERS.lambda;
    document.getElementById("coop").value   = PARAMETERS.coop;
    document.getElementById("evolveTraits").checked = PARAMETERS.evolveTraits;
    document.getElementById("mutationStdev").value = PARAMETERS.mutationStdev;
    document.getElementById("deathChance").value   = PARAMETERS.deathChance;
    document.getElementById("coupleTraits").checked = PARAMETERS.coupleTraits;
    document.getElementById("epoch").value         = PARAMETERS.epoch;
    document.getElementById("reportingPeriod").value = PARAMETERS.reportingPeriod;
    document.getElementById("updatesPerDraw").value  = PARAMETERS.updatesPerDraw;

    if (typeof selectModel === "function") selectModel(PARAMETERS.spatial);
    document.getElementById("gridSize").value           = PARAMETERS.gridRows;
    document.getElementById("cap").value                = PARAMETERS.cap;
    document.getElementById("birthThreshold").value     = PARAMETERS.birthThreshold;
    document.getElementById("starveDeathChance").value  = PARAMETERS.starveDeathChance;
    document.getElementById("catastropheChance").value  = PARAMETERS.catastropheChance;
    document.getElementById("fissionSize").value        = PARAMETERS.fissionSize;
    document.getElementById("fissionMaxFraction").value = PARAMETERS.fissionMaxFraction;
    document.getElementById("randomizeGenes").checked   = PARAMETERS.randomizeGenes;
    document.getElementById("pMigrateRandom").value     = PARAMETERS.pMigrateRandom;
    document.getElementById("pMigrateMisfit").value     = PARAMETERS.pMigrateMisfit;
    document.getElementById("pMigrateStarve").value     = PARAMETERS.pMigrateStarve;
    document.getElementById("gridColorGene").value      = PARAMETERS.gridColorGene;
    document.getElementById("displayMode").value        = PARAMETERS.displayMode;

    const runNameEl = document.getElementById("runName");
    if (runNameEl) runNameEl.innerText = PARAMETERS.runName;
};
