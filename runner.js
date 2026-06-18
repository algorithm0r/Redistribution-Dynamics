/**
 * Headless simulation runner.
 * Runs batches of simulations in parallel Node.js worker threads, saving results
 * directly to MongoDB (bypassing the browser and the socket.io server).
 *
 * Usage:
 *   node runner.js                     # every run in runs.js, 4 workers
 *   node runner.js --workers 8         # 8 workers
 *   node runner.js --batch batch_001   # only runs whose collection matches
 *   node runner.js --reps 100          # repeat the run list N times (replications)
 *   node runner.js --skip-existing     # skip runs already present in MongoDB
 *
 * The same simulation source files are loaded into a sandboxed VM context, so the
 * browser and the runner execute identical logic.
 */

'use strict';

const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

let MongoClient;
try {
    ({ MongoClient } = require('mongodb'));
} catch {
    ({ MongoClient } = require('../Server/node_modules/mongodb'));
}

const MONGO_URL = 'mongodb://127.0.0.1:27017';
const DIR = __dirname;

// ── Simulation context (each worker gets its own) ─────────────────────────────
function createSimContext() {
    const ctx = vm.createContext({
        Math, Number, Array, Object, JSON, Infinity, NaN, isNaN, isFinite,
        parseInt, parseFloat, setTimeout, clearTimeout,

        window:   { requestAnimationFrame: () => {}, io: undefined },
        document: { getElementById: () => ({ classList: { remove: () => {}, add: () => {} }, innerHTML: '', innerText: '', value: '', checked: false }),
                    createElement: () => ({ setAttribute: () => {}, click: () => {} }) },

        socket:  { emit: () => {} },
        console: { log: () => {}, warn: () => {}, error: () => {} },

        saveParametersToUI:    () => {},
        loadParametersFromUI:  () => {},
        loadNextRunParameters: () => {},

        // Visualization is a no-op headlessly.
        Observer: class { constructor() {} draw() {} update() {} },
    });

    function load(filename) {
        let code = fs.readFileSync(path.join(DIR, filename), 'utf8');
        code = code.replace(/^const\s+/gm, 'var ');
        code = code.replace(/^let\s+/gm, 'var ');
        code = code.replace(/^class\s+(\w+)/gm, 'var $1 = class $1');
        vm.runInContext(code, ctx);
    }

    load('util.js');
    load('parameters.js');
    load('agent.js');
    load('datamanager.js');
    load('population.js');
    load('runs.js');

    return ctx;
}

// ── Worker ────────────────────────────────────────────────────────────────────
if (!isMainThread) {
    (async () => {
        const { runs } = workerData;
        const ctx = createSimContext();
        const PARAMETERS = ctx.PARAMETERS;
        const BASE = Object.assign({}, PARAMETERS);

        const client = new MongoClient(MONGO_URL);
        await client.connect();

        for (const run of runs) {
            const t0 = Date.now();

            Object.assign(PARAMETERS, BASE, run);
            PARAMETERS.idCounter = 0;

            let capturedData = null;
            ctx.socket.emit = (event, packet) => {
                if (event === 'insert') capturedData = JSON.parse(JSON.stringify(packet));
            };

            let runComplete = false;
            ctx.loadNextRunParameters = () => { runComplete = true; };

            const pop = vm.runInContext('new Population()', ctx);
            while (!runComplete) pop.update();

            if (capturedData) {
                const col = client.db(capturedData.db).collection(capturedData.collection);
                await col.insertOne(capturedData.data);
            }

            parentPort.postMessage({ runName: run.runName, ms: Date.now() - t0 });
        }

        await client.close();
    })();
}

// ── Main ──────────────────────────────────────────────────────────────────────
if (isMainThread) {
    function parseArgs() {
        const args = process.argv.slice(2);
        const get  = flag => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
        return {
            workers:      parseInt(get('--workers') ?? '4'),
            reps:         parseInt(get('--reps')    ?? '1'),
            batch:        get('--batch'),
            skipExisting: args.includes('--skip-existing'),
        };
    }

    async function main() {
        const { workers: numWorkers, reps, batch: batchName, skipExisting } = parseArgs();

        const ctx  = createSimContext();
        const runs = ctx.runs;
        const defaultDb = ctx.PARAMETERS.db;
        const defaultCollection = ctx.PARAMETERS.collection;

        let baseRuns = batchName
            ? runs.filter(r => (r.collection || defaultCollection) === batchName)
            : runs;

        if (!baseRuns.length) { console.error('No matching runs found in runs.js.'); process.exit(1); }

        let toRun = [];
        for (let r = 0; r < reps; r++) toRun = toRun.concat(baseRuns);

        if (skipExisting) {
            const client = new MongoClient(MONGO_URL);
            await client.connect();
            const existing = new Set();
            const seenCount = {};
            for (const r of baseRuns) {
                const db = r.db || defaultDb;
                const col = r.collection || defaultCollection;
                const key = `${db}::${col}::${r.runName}`;
                if (seenCount[key] !== undefined) continue;
                seenCount[key] = 0;
                const n = await client.db(db).collection(col).countDocuments({ run: r.runName });
                for (let i = 0; i < n; i++) existing.add(`${key}::${i}`);
            }
            const seen = {};
            let skipped = 0;
            toRun = toRun.filter(r => {
                const key = `${r.db || defaultDb}::${r.collection || defaultCollection}::${r.runName}`;
                seen[key] = seen[key] || 0;
                const skip = existing.has(`${key}::${seen[key]}`);
                seen[key]++;
                if (skip) skipped++;
                return !skip;
            });
            console.log(`Skipping ${skipped} existing | ${toRun.length} remaining`);
            await client.close();
            if (!toRun.length) { console.log('Nothing to do.'); return; }
        }

        const n = Math.min(numWorkers, toRun.length);
        const repStr = reps > 1 ? ` × ${reps} reps` : '';
        console.log(`\n${baseRuns.length} runs${repStr} = ${toRun.length} total | ${n} workers\n`);

        const chunks = Array.from({ length: n }, () => []);
        toRun.forEach((run, i) => chunks[i % n].push(run));

        let done = 0;
        const total = toRun.length;
        const startTime = Date.now();

        await Promise.all(chunks.map(chunk => new Promise((resolve, reject) => {
            const worker = new Worker(__filename, { workerData: { runs: chunk } });
            worker.on('message', msg => {
                done++;
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                const perRun  = (Date.now() - startTime) / done;
                const eta     = ((perRun * (total - done)) / 1000).toFixed(0);
                process.stdout.write(
                    `\r[${String(done).padStart(4)}/${total}] ${String(msg.runName).padEnd(44)} ${String(msg.ms).padStart(5)}ms | ${elapsed}s | ~${eta}s left  `
                );
            });
            worker.on('error', reject);
            worker.on('exit', resolve);
        })));

        const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
        const avg = ((Date.now() - startTime) / done) | 0;
        console.log(`\n\nDone — ${done} runs in ${totalTime}s  (avg ${avg}ms/run)\n`);
    }

    main().catch(err => { console.error(err); process.exit(1); });
}
