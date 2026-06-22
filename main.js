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
