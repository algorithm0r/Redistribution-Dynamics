// packetsize.mjs — run one config at full length and report the BSON size of the document
// worker.mjs would save (per data key and total), with wall time, final population and coop.
// A probe for sizing diagnostics before a sweep commits to them (conventions §4: the client
// warns above 4 MB of BSON; 16 MB is Mongo's hard limit). Nothing is written to Mongo.
//
//   node packetsize.mjs <name> [JSON overrides]     e.g.  node packetsize.mjs syndrome '{"recordSyndrome":true}'
//
// Base config = the constitution_grid BASE, cell base_g2_foff_T1, seed 1, 50 000 ticks.
// Writes results/_scratch/packetsize/<name>.json and prints one summary line. Long (minutes):
// run it through cpuslot.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { runConfig } from './headless.mjs';

const require = createRequire(import.meta.url);
const { bsonSize } = require('../db.js');
const SIM_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export const BASE = {
    collection: 'packetsize', spatial: true, regime: 'genome', randomizeGenes: true,
    epoch: 50000, reportingPeriod: 100,
    gridRows: 10, gridCols: 10, seedVillages: 10, seedPop: 30, cap: 100, birthThreshold: 0,
    pMigrateRandom: 0.02, pMigrateMisfit: 0.2, pMigrateStarve: 0.2,
    signedThreshold: true, thresholdMode: 'percentile', termMax: 50000, pSexual: 0,
    birthWealthBias: 0, individualBirthThreshold: 0, birthThresholdRate: 2, franchiseMode: 'off', constitutionTerm: 1,
    seed: 1,
};

const name = process.argv[2] || 'base';
const over = process.argv[3] ? JSON.parse(process.argv[3]) : {};
const hb = process.env.CPUSLOT_HEARTBEAT;
const t0 = Date.now();
const log = console.log; console.log = () => {};
const pkt = await runConfig({ ...BASE, ...over, runName: name }, (tick, total, pop) => {
    if (hb) try { fs.writeFileSync(hb, JSON.stringify({ done: tick, total, note: `${name} pop ${pop}` })); } catch {}
});
console.log = log;
const secs = (Date.now() - t0) / 1000;
// The document worker.mjs saves: data + db.js's bookkeeping fields (+17 for Mongo's _id).
const doc = { ...pkt.data, _run: name + '_s1', _parameters: pkt.data.parameters, started: new Date().toISOString(), finished: new Date().toISOString(), complete: true };
const total = bsonSize(doc) + 17;
const byKey = {};
for (const k of Object.keys(pkt.data)) byKey[k] = bsonSize({ [k]: pkt.data[k] }) - 5;
const pop = pkt.data.population, coop = pkt.data.geneMeans.coop;
const out = { name, overrides: over, seconds: secs, ticks: BASE.epoch === over.epoch ? BASE.epoch : (over.epoch || BASE.epoch),
    samples: pop.length, finalPop: pop.at(-1), meanPop: pop.reduce((a, b) => a + b, 0) / pop.length, finalCoop: coop.at(-1),
    bsonMB: total / 1048576, jsonMB: JSON.stringify(doc).length / 1048576, byKeyMB: Object.fromEntries(Object.entries(byKey).map(([k, v]) => [k, +(v / 1048576).toFixed(3)])) };
const dir = path.join(SIM_DIR, 'results', '_scratch', 'packetsize');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, name + '.json'), JSON.stringify(out, null, 1));
const top = Object.entries(out.byKeyMB).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k} ${v}`).join(', ');
log(`${name.padEnd(14)} ${out.bsonMB.toFixed(2)} MB BSON (${out.jsonMB.toFixed(2)} MB JSON) | ${secs.toFixed(0)} s | mean pop ${out.meanPop.toFixed(0)} final coop ${out.finalCoop.toFixed(3)} | largest: ${top}`);
