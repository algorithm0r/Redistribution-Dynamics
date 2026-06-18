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
const scenarios = [
    { regime: 'none' }, { regime: 'share' }, { regime: 'theft' }, { regime: 'pool' },
    { regime: 'none', evolveTraits: true, label: 'none+evo' },
    { regime: 'pool', evolveTraits: true, label: 'pool+evo' },
    { regime: 'none', evolveTraits: true, coupleTraits: true, label: 'none+evo+cpl' },
];
for (const scenario of scenarios) {
    const regime = scenario.regime;
    const ctx = createCtx();
    const P = ctx.PARAMETERS;
    Object.assign(P, { epoch: EPOCH, idCounter: 0 }, scenario);

    let captured = null;
    ctx.socket.emit = (event, packet) => { if (event === 'insert') captured = packet; };
    let done = false;
    ctx.loadNextRunParameters = () => { done = true; };

    const pop = vm.runInContext('new Population()', ctx);
    while (!done) pop.update();

    const d = captured.data;
    const lastOf = a => a[a.length - 1];
    const label = scenario.label || regime;
    let line =
        `${label.padEnd(9)} | finalGini=${lastOf(d.gini).toFixed(3)} | ` +
        `avgStock=${lastOf(d.avgStock).toFixed(1).padStart(5)} | ` +
        `cumHunger=${String(lastOf(d.hunger)).padStart(6)}`;
    if (scenario.evolveTraits) {
        line += ` | deaths=${String(lastOf(d.deaths)).padStart(6)}` +
                ` | pNoGather=${lastOf(d.avgPNoGather).toFixed(3)}` +
                ` | pNoConsume=${lastOf(d.avgPNoConsume).toFixed(3)}`;
    }
    console.log(line);
}
