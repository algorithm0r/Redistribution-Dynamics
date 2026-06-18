// Headless smoke test (no MongoDB). Loads the sim files in a VM context like
// runner.js, runs each regime for a short epoch, and prints summary metrics.
// Run: node smoketest.js   (safe to delete; not part of the simulation)
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
        Observer: class { constructor(){} draw(){} update(){} },
    });
    const load = f => {
        let code = fs.readFileSync(path.join(__dirname, f), 'utf8');
        code = code.replace(/^const\s+/gm, 'var ').replace(/^let\s+/gm, 'var ')
                   .replace(/^class\s+(\w+)/gm, 'var $1 = class $1');
        vm.runInContext(code, ctx);
    };
    ['util.js','parameters.js','agent.js','datamanager.js','population.js','runs.js'].forEach(load);
    return ctx;
}

const EPOCH = 2000;
for (const regime of ['none', 'share', 'pool']) {
    const ctx = createCtx();
    const P = ctx.PARAMETERS;
    Object.assign(P, { regime, epoch: EPOCH, idCounter: 0 });

    let captured = null;
    ctx.socket.emit = (event, packet) => { if (event === 'insert') captured = packet; };
    let done = false;
    ctx.loadNextRunParameters = () => { done = true; };

    const pop = vm.runInContext('new Population()', ctx);
    while (!done) pop.update();

    const d = captured.data;
    const lastGini = d.gini[d.gini.length - 1];
    const lastHunger = d.hunger[d.hunger.length - 1];
    const lastAvg = d.avgStock[d.avgStock.length - 1];
    const lastMax = d.maxStock[d.maxStock.length - 1];
    const totalStock = pop.agents.reduce((s, a) => s + a.stock, 0);
    console.log(
        `regime=${regime.padEnd(5)} | finalGini=${lastGini.toFixed(3)} | ` +
        `avgStock=${lastAvg.toFixed(1)} | maxStock=${String(lastMax).padStart(4)} | ` +
        `cumHunger=${String(lastHunger).padStart(6)} | totalStock=${totalStock}`
    );
}
