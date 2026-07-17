// headless.mjs — load the RD sim into a VM context and run one config to completion,
// returning the same data packet the browser/runner.js emits. Same sim source as the
// browser (loaded from ../), so results are identical. (Mirrors runner.js's loader; kept
// separate so the proven runner.js is untouched — worth DRYing into a shared module later.)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SIM_FILES = ['util.js', 'parameters.js', 'agent.js', 'village.js', 'datamanager.js', 'population.js', 'world.js', 'runs.js'];

function createSimContext() {
    const ctx = vm.createContext({
        Math, Number, Array, Object, JSON, Infinity, NaN, isNaN, isFinite, parseInt, parseFloat, setTimeout, clearTimeout,
        window: { requestAnimationFrame: () => {}, io: undefined },
        document: { getElementById: () => ({ classList: { remove: () => {}, add: () => {} }, innerHTML: '', innerText: '', value: '', checked: false }),
                    createElement: () => ({ setAttribute: () => {}, click: () => {} }) },
        socket: { emit: () => {} }, console: { log: () => {}, warn: () => {}, error: () => {} },
        saveParametersToUI: () => {}, loadParametersFromUI: () => {}, loadNextRunParameters: () => {},
        Observer: class { constructor() {} draw() {} update() {} },
    });
    for (const f of SIM_FILES) {
        let code = fs.readFileSync(path.join(DIR, f), 'utf8')
            .replace(/^const\s+/gm, 'var ').replace(/^let\s+/gm, 'var ').replace(/^class\s+(\w+)/gm, 'var $1 = class $1');
        vm.runInContext(code, ctx);
    }
    return ctx;
}

const CTX = createSimContext();
const BASE = { ...CTX.PARAMETERS };

const simTick = s => (s.tick != null ? s.tick : (s.dataManager ? s.dataManager.tick : 0));
const simPop = s => (s.villages ? s.villages().reduce((n, v) => n + v.pop, 0) : (s.agents ? s.agents.length : 0));

/** Run one config to completion; returns the captured { db, collection, data } packet.
 *  Runs in CHUNK-tick slices, calling onProgress(tick, total, pop) and yielding to the
 *  event loop between slices so heartbeat I/O can flush (the old tight loop blocked it). */
export async function runConfig(config, onProgress) {
    Object.assign(CTX.PARAMETERS, BASE, config);
    CTX.PARAMETERS.idCounter = 0;

    let packet = null;
    CTX.socket.emit = (event, p) => { if (event === 'insert') packet = JSON.parse(JSON.stringify(p)); };
    let done = false;
    CTX.loadNextRunParameters = () => { done = true; };

    const sim = vm.runInContext(CTX.PARAMETERS.spatial ? 'new World()' : 'new Population()', CTX);
    const total = CTX.PARAMETERS.epoch, CHUNK = 500;
    while (!done) {
        for (let k = 0; k < CHUNK && !done; k++) sim.update();
        if (onProgress) onProgress(simTick(sim), total, simPop(sim));
        await new Promise(r => setImmediate(r));   // yield: let pending heartbeat fetches send
    }
    return packet;
}

/** Final mean coop = the adaptive metric the coordinator stops on. */
export function coopOf(packet) {
    const c = packet && packet.data && packet.data.geneMeans && packet.data.geneMeans.coop;
    if (!Array.isArray(c)) return NaN;
    for (let i = c.length - 1; i >= 0; i--) if (Number.isFinite(c[i])) return c[i];
    return NaN;
}

export const serverIp = () => BASE.ip;
