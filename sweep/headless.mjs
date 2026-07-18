// headless.mjs — load the RD sim into the *main V8 realm* (exactly as the browser runs it)
// and run one config to completion, returning the same data packet the browser/runner.js
// emit. Same sim source as the browser (loaded from ../), so results are identical.
//
// Why not vm.createContext (as runner.js still does)? The sim reads PARAMETERS.* and other
// globals in its hottest loops — every agent, every tick (gather/consume/spawnChild,
// genePolicy, applyGenomePolicy, migration). Inside a vm sandbox each of those reads goes
// through the contextified global proxy, an interceptor path V8 refuses to inline or cache;
// measured ~7x slower per agent-tick than native execution. That isolation buys us nothing
// here: each worker is its own process running ONE config at a time, and runConfig() fully
// resets state between runs (precisely as the browser reuses globals across successive runs).
// So we run in the main realm and reclaim the ~7x. runner.js is left on vm, untouched.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SIM_FILES = ['util.js', 'parameters.js', 'agent.js', 'village.js', 'datamanager.js', 'population.js', 'world.js', 'runs.js'];

// Browser globals the sim references, installed on globalThis so the sim resolves them
// exactly as it does in the browser. Observer/canvas are stubbed (headless: no rendering).
// parameters.js/runs.js redefine save/load/loadNext at load; runConfig re-hijacks loadNext.
Object.assign(globalThis, {
    window: { requestAnimationFrame: () => {}, io: undefined },
    document: { getElementById: () => ({ classList: { remove() {}, add() {} }, innerHTML: '', innerText: '', value: '', checked: false }),
                createElement: () => ({ setAttribute() {}, click() {} }) },
    socket: { emit: () => {} },
    saveParametersToUI: () => {}, loadParametersFromUI: () => {}, loadNextRunParameters: () => {},
    Observer: class { constructor() {} draw() {} update() {} },
});

// Load the exact browser sim files into global scope. Indirect eval executes in the global
// lexical environment; the const/let/class -> var rewrite (browser scripts aren't modules)
// makes their top-level declarations global vars reachable by `new World()`. Loaded once —
// runs reuse the globals, same as the browser cycling runs without a page reload.
const geval = eval;   // indirect eval -> global scope
for (const f of SIM_FILES) {
    const code = fs.readFileSync(path.join(DIR, f), 'utf8')
        .replace(/^const\s+/gm, 'var ').replace(/^let\s+/gm, 'var ').replace(/^class\s+(\w+)/gm, 'var $1 = class $1');
    geval(code);
}

const BASE = { ...globalThis.PARAMETERS };

const simTick = s => (s.tick != null ? s.tick : (s.dataManager ? s.dataManager.tick : 0));
const simPop = s => (s.villages ? s.villages().reduce((n, v) => n + v.pop, 0) : (s.agents ? s.agents.length : 0));

/** Run one config to completion; returns the captured { db, collection, data } packet.
 *  Runs in CHUNK-tick slices, calling onProgress(tick, total, pop) and yielding to the
 *  event loop between slices so heartbeat I/O can flush (the old tight loop blocked it). */
export async function runConfig(config, onProgress) {
    Object.assign(globalThis.PARAMETERS, BASE, config);
    globalThis.PARAMETERS.idCounter = 0;

    let packet = null;
    globalThis.socket.emit = (event, p) => { if (event === 'insert') packet = JSON.parse(JSON.stringify(p)); };
    let done = false;
    globalThis.loadNextRunParameters = () => { done = true; };

    const sim = geval(globalThis.PARAMETERS.spatial ? 'new World()' : 'new Population()');
    const total = globalThis.PARAMETERS.epoch, CHUNK = 500;
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
