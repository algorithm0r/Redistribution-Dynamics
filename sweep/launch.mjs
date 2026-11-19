// launch.mjs — put workers on a running coordinator, found by identity (its collection).
//
//   node launch.mjs <identity> [--runs N] [--scratch]        desktop: cpuslot (default)
//   COORD=http://<host>:<port> node launch.mjs <identity> --direct N [--scratch]   e.g. on mint
//
// cpuslot (conventions §4a″): submits N ONE-SHOT workers (`worker.mjs <identity> --once`) as
// queued runs under the project's one stable tag, `redistribution-dynamics`. Each claims one
// (cell, seed), runs it, saves it and exits, so its slot goes back to the pool between runs and
// other projects keep their turns. (Long-lived workers would hold slots for the whole sweep.)
// N defaults to the coordinator's upper bound on reps still needed (its /status remainingMax);
// surplus one-shots find the coordinator done and exit in a second. Logs and exit codes land in
// sweep/logs/<identity>/ (gitignored). Watch: http://localhost:8000/cpu/ ; cancel:
// `cpuslot cancel --tag redistribution-dynamics`.
//
// --direct N: spawn N looping workers here (mint is not in the desktop's cpuslot pool).
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { discover } from './ports.mjs';

const TAG = 'redistribution-dynamics';
const PROJECT = 'Redistribution Dynamics';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const IDENTITY = args.find(a => !a.startsWith('--') && !/^\d+$/.test(a));
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const SCRATCH = args.includes('--scratch');
if (!IDENTITY) { console.error('usage: node launch.mjs <identity> [--runs N | --direct N] [--scratch]'); process.exit(2); }

const COORD = await discover({ project: PROJECT, identity: IDENTITY }).catch(e => { console.error(e.message); process.exit(3); });
const worker = path.join(HERE, 'worker.mjs');
const wargs = SCRATCH ? ['--scratch'] : [];

if (args.includes('--direct')) {
    const N = parseInt(opt('--direct') || '1');
    console.log(`launching ${N} looping workers -> ${IDENTITY} at ${COORD}`);
    for (let i = 0; i < N; i++) {
        const w = spawn(process.execPath, [worker, IDENTITY, ...wargs], { stdio: 'inherit', env: { ...process.env, COORD } });
        w.on('exit', code => console.log(`worker ${i} exited (${code})`));
    }
} else {
    let N = opt('--runs') ? parseInt(opt('--runs')) : null;
    if (N == null) {
        const st = await (await fetch(COORD + '/status')).json();
        N = st.remainingMax;
        console.log(`coordinator ${IDENTITY}: ${st.sufficient}/${st.cells} cells sufficient, ${st.completed} reps done, up to ${N} still needed`);
    }
    if (!N) { console.log('nothing to submit'); process.exit(0); }
    const out = path.join(HERE, 'logs', IDENTITY);
    fs.mkdirSync(out, { recursive: true });
    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const lines = [];
    for (let i = 0; i < N; i++) {
        lines.push(JSON.stringify({ cmd: [process.execPath, worker, IDENTITY, '--once', ...wargs],
            name: `${IDENTITY}-${stamp}-${i}`, desc: `Redistribution Dynamics ${IDENTITY}: one seeded rep` }));
    }
    const r = spawnSync('cpuslot', ['submit', '--tag', TAG, '--out', out, '--list', '-'], { input: lines.join('\n') + '\n', encoding: 'utf8' });
    process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || '');
    if (r.status !== 0) { console.error(`cpuslot submit failed (exit ${r.status})`); process.exit(r.status || 1); }
    console.log(`submitted ${N} one-shot workers under tag ${TAG}; logs in ${out}`);
}
