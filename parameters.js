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
    regime: "none",
    conflictChance: 0.25,     // 'theft' only: chance the seized resource is lost

    // Evolution: when on, a starving agent dies and is replaced by a mutated
    // offspring of a survivor, so pNoGather/pNoConsume evolve under selection.
    evolveTraits: false,
    mutationStdev: 0.02,      // std dev of the Gaussian trait mutation

    idCounter: 0,   // monotonic source of unique agent ids; reset at run start

    // ── Framework / data ───────────────────────────────────────────────────
    updatesPerDraw: 1,        // sim ticks per rendered frame (raise to fast-forward)
    reportingPeriod: 10,      // record statistics every N ticks
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
    PARAMETERS.evolveTraits  = document.getElementById("evolveTraits").checked;
    PARAMETERS.mutationStdev = parseFloat(document.getElementById("mutationStdev").value);
    PARAMETERS.epoch         = parseInt(document.getElementById("epoch").value);
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
    document.getElementById("evolveTraits").checked = PARAMETERS.evolveTraits;
    document.getElementById("mutationStdev").value = PARAMETERS.mutationStdev;
    document.getElementById("epoch").value         = PARAMETERS.epoch;
    const runNameEl = document.getElementById("runName");
    if (runNameEl) runNameEl.innerText = PARAMETERS.runName;
};
