/**
 * Global parameters object. One flat record of everything a run is configured
 * by; it is serialized verbatim into each saved data packet so a run is fully
 * reproducible from its stored parameters.
 *
 * Sections:
 *   - Domain: the model being simulated (Model 1 — to be dictated; see DEVPLAN.md)
 *   - Framework / data: loop, reporting, and database wiring (stable machinery)
 */
const PARAMETERS = {
    runName: "Run From Controls",

    // ── Domain (Model 1 — see DEVPLAN.md) ──────────────────────────────────
    initialAgents: 100,
    // Additional domain parameters will be dictated with Model 1.

    idCounter: 0,   // monotonic source of unique agent ids; reset at run start

    // ── Framework / data ───────────────────────────────────────────────────
    updatesPerDraw: 1,        // sim ticks per rendered frame (raise to fast-forward)
    reportingPeriod: 10,      // record statistics every N ticks
    epoch: 10000,             // ticks per run before data is sent and the run ends

    db: "employment_simulator",
    collection: "test",
    ip: "https://73.19.38.112:8888",   // shared socket.io -> MongoDB server (../Server)
};

/** Pull parameters from the control-panel inputs into PARAMETERS. */
const loadParametersFromUI = () => {
    PARAMETERS.initialAgents = parseInt(document.getElementById("numAgents").value);
    // Domain inputs added alongside Model 1.
    PARAMETERS.runName = "Run From Controls";
    const runNameEl = document.getElementById("runName");
    if (runNameEl) runNameEl.innerText = PARAMETERS.runName;
};

/** Push PARAMETERS back into the control-panel inputs (e.g. when loading a run). */
const saveParametersToUI = () => {
    document.getElementById("numAgents").value = PARAMETERS.initialAgents;
    // Domain inputs added alongside Model 1.
    const runNameEl = document.getElementById("runName");
    if (runNameEl) runNameEl.innerText = PARAMETERS.runName;
};
