// Headless smoke test for Model V (no MongoDB, no canvas). Loads the sim files
// in a VM context and runs the World grid for a few scenarios, printing the
// population / village / gene trajectories. Run: node worldsmoke.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function createCtx() {
    const ctx = vm.createContext({
        Math, Number, Array, Object, JSON, Infinity, NaN, isNaN, isFinite,
        parseInt, parseFloat, setTimeout, clearTimeout,
        window: { requestAnimationFrame: () => {}, io: undefined },
        document: { getElementById: () => ({ classList: { remove(){}, add(){} }, value: '', innerText: '', checked: false }) },
        socket: { emit: () => {} },
        console: { log: () => {}, warn: () => {}, error: () => {} },
        saveParametersToUI: () => {}, loadParametersFromUI: () => {}, loadNextRunParameters: () => {},
        // gameEngine intentionally undefined so World skips the canvas observer.
    });
    const load = f => {
        let code = fs.readFileSync(path.join(__dirname, f), 'utf8');
        code = code.replace(/^const\s+/gm, 'var ').replace(/^let\s+/gm, 'var ')
                   .replace(/^class\s+(\w+)/gm, 'var $1 = class $1');
        vm.runInContext(code, ctx);
    };
    ['util.js', 'parameters.js', 'agent.js', 'village.js', 'world.js'].forEach(load);
    return ctx;
}

const UNIFORM = { randomizeGenes: false };
const scenarios = [
    { label: 'cooperative-pool', genes: { tau: 0.7, theta: 0.2, phi: 1, kappa: 0, lambda: 0, coop: 1.0 }, extra: UNIFORM },
    { label: 'laissez-faire',    genes: { tau: 0.0, theta: 0.5, phi: 1, kappa: 0, lambda: 0, coop: 1.0 }, extra: UNIFORM },
    { label: 'defector-pool',    genes: { tau: 0.7, theta: 0.2, phi: 1, kappa: 0, lambda: 0.3, coop: 0.4 }, extra: UNIFORM },
    { label: 'migration-mix',    genes: { tau: 0.6, theta: 0.3, phi: 1, kappa: 0, lambda: 0, coop: 0.9 },
                                 extra: { ...UNIFORM, pMigrateRandom: 0.02, pMigrateMisfit: 0.05, pMigrateStarve: 0.1 } },
    // Randomized founders + Tiebout sorting — the intended Model V starting state.
    { label: 'random-founders',  genes: {}, extra: { randomizeGenes: true, pMigrateMisfit: 0.05, pMigrateStarve: 0.05 } },
];

const EPOCH = 500;
for (const s of scenarios) {
    const ctx = createCtx();
    const P = ctx.PARAMETERS;
    Object.assign(P, {
        spatial: true, epoch: EPOCH, idCounter: 0,
        gridRows: 6, gridCols: 6, cap: 40, birthThreshold: 20, seedVillages: 4, seedPop: 15,
        initialStock: 5, pNoGather: 0.10, pNoConsume: 0.11,   // thin buffer, ~1% net positive
    }, s.genes, s.extra || {});

    let captured = null;
    ctx.socket.emit = (e, pkt) => { if (e === 'insert') captured = pkt; };
    let done = false;
    ctx.loadNextRunParameters = () => { done = true; };

    const world = vm.runInContext('new World()', ctx);
    let guard = EPOCH + 50;
    while (!done && guard-- > 0) world.update();

    const d = captured.data;
    const last = a => a[a.length - 1];
    const tauHist = d.geneHistograms.tau;
    const lastBins = tauHist[tauHist.length - 1];
    console.log(
        `${s.label.padEnd(17)} | villages ${String(last(d.villages)).padStart(3)} | ` +
        `pop ${String(last(d.population)).padStart(5)} | ` +
        `coop ${last(d.geneMeans.coop).toFixed(3)} | tau ${last(d.geneMeans.tau).toFixed(3)} | phi ${last(d.geneMeans.phi).toFixed(3)} | ` +
        `tauHist[${tauHist.length} snaps, sum ${lastBins.reduce((a, b) => a + b, 0)}]`
    );
}
