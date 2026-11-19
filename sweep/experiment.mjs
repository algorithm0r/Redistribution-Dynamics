// experiment.mjs — the experiment registry (db.js v2, conventions §4).
//
//   node experiment.mjs new <slug> "<question>" [--scratch]   claim the next expNNN; prints its collection
//   node experiment.mjs list [--scratch]                      the registry
//   node experiment.mjs finish <expNNN> [done|abandoned] [--scratch]
//   node experiment.mjs export <expNNN> [--scratch]           rebuild results/<collection>/*.json from Mongo
//   node experiment.mjs drop-scratch                          drop redistribution_dynamics_scratch
//
// The question is the one-line question from the experiment's EXPLOG pre-registration; the
// coordinator refuses to serve an expNNN until `## expNNN` is in sim/EXPLOG.md.
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { serverIp } from './headless.mjs';

const require = createRequire(import.meta.url);
const { createDB } = require('../db.js');
const SIM_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2).filter(a => a !== '--scratch');
const SCRATCH = process.argv.includes('--scratch');
const db = createDB({ transport: 'socket', server: serverIp(), db: 'redistribution_dynamics', scratch: SCRATCH,
    project: 'Redistribution Dynamics', repo: SIM_DIR, results: path.join(SIM_DIR, 'results', SCRATCH ? '_scratch' : '') });

const [cmd, a1, a2] = args;
try {
    if (cmd === 'new') {
        if (!a1 || !a2) throw new Error('usage: new <slug> "<question>"');
        const ex = await db.experiment(a1, { question: a2 });
        console.log(`${ex.label}  collection ${ex.collection}  (db ${db.dbName})`);
        console.log(`next: pre-register '## ${ex.label} — ...' in sim/EXPLOG.md, set the grid's collection to ${ex.collection}`);
    } else if (cmd === 'list') {
        for (const e of await db.experiments()) console.log(`${e.label}  ${String(e.status).padEnd(9)} ${e.collection.padEnd(28)} ${e.created}  ${e.question}`);
    } else if (cmd === 'finish') {
        const ex = await db.experiment(a1); await ex.finish(a2 || 'done'); console.log(`${a1} -> ${a2 || 'done'}`);
    } else if (cmd === 'export') {
        const r = await db.export(a1); console.log(`wrote ${r.written} runs to ${r.dir}`);
    } else if (cmd === 'drop-scratch') {
        await db.dropScratch(); console.log(`dropped ${db.config.db}_scratch`);
    } else {
        console.log('usage: node experiment.mjs new <slug> "<question>" | list | finish <expNNN> [status] | export <expNNN> | drop-scratch   [--scratch]');
    }
} catch (e) { console.error(e.message); process.exitCode = 1; }
await db.close();
