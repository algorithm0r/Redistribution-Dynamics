// worker.mjs — claim a (cell, seed) from the coordinator serving <identity>, run it seeded,
// save the packet through db.js v2 into that experiment's collection, report coop back.
//
//   node worker.mjs <identity> [--once] [--scratch]
//
//   <identity>  the experiment collection, e.g. exp012_shuffle (REQUIRED). The worker finds
//               the coordinator serving exactly that identity (ports.mjs discover via /whoami)
//               and EXITS if it can't — it never enrolls with whatever answers on a port, the
//               bug that could file runs into another sweep's collection. COORD=http://host:port
//               pins a coordinator (remote workers, e.g. mint); a pinned one serving a different
//               identity is refused.
//   --once      run one rep and exit (the cpuslot mode: launch.mjs submits one-shot workers, so
//               every slot is released between runs and projects keep taking turns).
//               Without it, loop until the coordinator says done (direct mode, e.g. on mint).
//   --scratch   write to redistribution_dynamics_scratch (smoke tests); no EXPLOG needed.
//
// Every run is seeded (PARAMETERS.seed = the coordinator's seed for that cell), named
// `<cell>_s<seed>` (unique within the experiment; db.js refuses a duplicate), and stamped with
// PARAMETERS.id = {project, exp, run, seed, commit, dirty, host, started} before it starts.
// The Mongo document keeps the legacy keys (`run` = cell id, `parameters`) beside db.js's
// `_run`/`_parameters`, so the coordinator resume and figserver read it unchanged.
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { discover } from './ports.mjs';
import { runConfig, coopOf, serverIp } from './headless.mjs';

const require = createRequire(import.meta.url);
const { createDB } = require('../db.js');

export const PROJECT = 'Redistribution Dynamics';
const SIM_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const IDENTITY = args.find(a => !a.startsWith('--'));
const ONCE = args.includes('--once'), SCRATCH = args.includes('--scratch');
if (!IDENTITY) { console.error('usage: node worker.mjs <identity: the expNNN_slug collection> [--once] [--scratch]'); process.exit(2); }

const LABEL = (/^(exp\d{3,})_/.exec(IDENTITY) || [])[1];
if (!LABEL) { console.error(`worker: '${IDENTITY}' is not an expNNN_slug collection; refusing (data protocol, conventions §4)`); process.exit(2); }

const WID = `${os.hostname()}:${process.pid}`, HOST = os.hostname();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const tag = `worker@${process.pid}`;
const HB = process.env.CPUSLOT_HEARTBEAT;   // cpuslot progress file (absent outside cpuslot)
const writeHb = obj => { if (HB) try { fs.writeFileSync(HB, JSON.stringify(obj)); } catch {} };

let COORD;
// Identity = <database>/<collection>, matching coordinator.mjs: a --scratch worker never joins a
// production coordinator, nor the reverse.
const DB_BASE = process.env.MONGO_DB || 'redistribution_dynamics';
const WHO = `${DB_BASE}${SCRATCH ? '_scratch' : ''}/${IDENTITY}`;
try { COORD = await discover({ project: PROJECT, identity: WHO }); }
catch (e) { console.error(`${tag}: ${e.message}`); process.exit(3); }

const db = createDB({ transport: 'socket', server: serverIp(), db: DB_BASE, scratch: SCRATCH,
    project: PROJECT, repo: SIM_DIR, results: path.join(SIM_DIR, 'results', SCRATCH ? '_scratch' : '') });
let ex;
try { ex = await db.experiment(LABEL); }
catch (e) { console.error(`${tag}: ${e.message}`); process.exit(3); }
if (ex.collection !== IDENTITY) { console.error(`${tag}: ${LABEL} is registered as ${ex.collection}, not ${IDENTITY}; refusing`); process.exit(3); }

const post = (p, body) => fetch(COORD + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
console.log(`${tag} on ${HOST}: ${IDENTITY} via ${COORD}, Mongo ${serverIp()} db ${db.dbName}${ONCE ? ' (one rep)' : ''}`);

let ran = 0, waited = 0;
while (true) {
    let claim;
    try { claim = await (await fetch(COORD + '/claim?w=' + encodeURIComponent(WID))).json(); }
    catch { if (ONCE && ++waited > 60) break; await sleep(5000); continue; }   // coordinator restarting / transient
    if (claim.done) break;
    if (claim.wait) { if (ONCE && ++waited > 8) break; await sleep(4000); continue; }   // one-shot: give up after ~30 s (past the startup grace) rather than hold a cpuslot slot idle
    if (claim.config.collection !== IDENTITY) {   // belt and braces: never write another sweep's cell
        console.error(`${tag}: claim for collection ${claim.config.collection}, not ${IDENTITY}; refusing`);
        process.exit(3);
    }

    const t0 = Date.now(), name = `${claim.id}_s${claim.seed}`;
    let lastHb = 0, run = null;
    const onProgress = (tick, total, pop) => {
        writeHb({ done: tick, total, note: `${name} pop ${pop}` });
        const now = Date.now();
        if (now - lastHb < 5000) return;
        lastHb = now;
        post('/heartbeat', { worker: WID, host: HOST, cell: claim.id, seed: claim.seed, tick, total, pop }).catch(() => {});
    };
    let ok = false, coop = NaN;
    try {
        const packet = await runConfig({ ...claim.config, seed: claim.seed }, onProgress,
            { beforeRun: P => { run = ex.run(P, { name, seed: claim.seed }); } });
        coop = coopOf(packet);
        const saved = await run.save(packet.data);
        ok = true;
        console.log(`${tag}: ${name}  coop=${Number.isFinite(coop) ? coop.toFixed(3) : 'NaN'}  ${((Date.now() - t0) / 1000).toFixed(0)}s  ${(saved.bytes / 1048576).toFixed(1)} MB BSON`);
    } catch (e) { console.error(`${tag}: ${name} not saved: ${e.message}`); }
    await post('/complete', { id: claim.id, seed: claim.seed, coop: ok ? coop : null, ok, worker: WID }).catch(() => {});
    ran++;
    if (ONCE) break;
}
console.log(`${tag}: exiting after ${ran} run(s).`);
await db.close();
process.exit(0);
