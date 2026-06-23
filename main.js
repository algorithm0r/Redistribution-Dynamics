// Browser entry point: wires up the database socket, the control-panel buttons,
// and the GameEngine, then starts a first run from the UI parameters.

const gameEngine = new GameEngine();
const ASSET_MANAGER = new AssetManager();

let runIndex = 0;

let socket = null;
if (window.io !== undefined) {
    socket = io.connect(PARAMETERS.ip);
    socket.on("connect", databaseConnected);
    socket.on("disconnect", databaseDisconnected);
    socket.addEventListener("error", console.log);
    socket.addEventListener("log", console.log);
}

function startRun() {
    gameEngine.entities = [];
    gameEngine.addEntity(PARAMETERS.spatial ? new World() : new Population());
}

/** Switch the control panel between the spatial and single-population parameter
 *  sets, and set the hidden `spatial` flag read by loadParametersFromUI. */
function selectModel(isSpatial) {
    const spatial = document.getElementById("spatial");
    if (spatial) spatial.checked = isSpatial;
    const tabS = document.getElementById("tabSpatial");
    const tabN = document.getElementById("tabSingle");
    const panelS = document.getElementById("panelSpatial");
    const panelN = document.getElementById("panelSingle");
    if (tabS) tabS.classList.toggle("active", isSpatial);
    if (tabN) tabN.classList.toggle("active", !isSpatial);
    if (panelS) panelS.style.display = isSpatial ? "" : "none";
    if (panelN) panelN.style.display = isSpatial ? "none" : "";
}

function setupTabs() {
    const tabS = document.getElementById("tabSpatial");
    const tabN = document.getElementById("tabSingle");
    if (tabS) tabS.onclick = () => selectModel(true);
    if (tabN) tabN.onclick = () => selectModel(false);
    selectModel(true);   // default to the spatial (Model V) tab
}

function loadFirstRunParameters() {
    if (runs.length === 0) { console.warn("No runs defined in runs.js."); return; }
    runIndex = 0;
    Object.assign(PARAMETERS, runs[runIndex]);
    PARAMETERS.idCounter = 0;
    saveParametersToUI();
    startRun();
}

function loadNextRunParameters() {
    if (runs.length === 0) { startRun(); return; }
    runIndex = (runIndex + 1) % runs.length;
    Object.assign(PARAMETERS, runs[runIndex]);
    PARAMETERS.idCounter = 0;
    saveParametersToUI();
    startRun();
}

ASSET_MANAGER.downloadAll(() => {
    setupTabs();

    // Pure display/speed controls — apply live (no reset needed).
    const upd = document.getElementById("updatesPerDraw");
    if (upd) upd.oninput = () => { PARAMETERS.updatesPerDraw = Math.max(1, parseInt(upd.value) || 1); };
    const dmode = document.getElementById("displayMode");
    if (dmode) dmode.onchange = () => { PARAMETERS.displayMode = dmode.value; };
    const gcg = document.getElementById("gridColorGene");
    if (gcg) gcg.onchange = () => { PARAMETERS.gridColorGene = gcg.value; };
    const wl = document.getElementById("wealthLevels");
    if (wl) wl.oninput = () => { PARAMETERS.wealthLevels = Math.max(2, parseInt(wl.value) || 10); };

    const resetButton = document.getElementById("resetButton");
    if (resetButton) resetButton.onclick = () => { loadParametersFromUI(); startRun(); };

    const runExperimentButton = document.getElementById("runExperimentButton");
    if (runExperimentButton) runExperimentButton.onclick = () => loadFirstRunParameters();

    const nextRunButton = document.getElementById("nextRunButton");
    if (nextRunButton) nextRunButton.onclick = () => loadNextRunParameters();

    const canvas = document.getElementById("gameWorld");
    const ctx = canvas.getContext("2d");

    loadParametersFromUI();
    gameEngine.init(ctx);
    startRun();
    gameEngine.start();
});
