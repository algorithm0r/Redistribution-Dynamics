// regress.mjs — the fixed-seed output baseline every refactor/instrumentation step must
// reproduce byte for byte with its switch off (conventions §5: a refactor proves it changed
// no output).
//
//   node regress.mjs --capture     write regress.baseline.json from the current code
//   node regress.mjs               check the current code against regress.baseline.json
//   node regress.mjs --check-twice run the scenarios twice and diff (volatility check)
//
// What it compares, per scenario: a SHA-256 of every top-level key of the data packet
// (population, geneMeans, villageRecords, populationSample, ...), so a difference is
// localised to the key(s) that moved. `parameters` is compared field by field: every
// baseline field must be unchanged; fields ADDED since the baseline (new switches with
// their default values) are listed, not counted as a difference — a new PARAMETERS key
// necessarily changes the serialized packet, and that is the only change it may make.
// It also hashes the stdout of `SEED=<seed> node worldsmoke.js` and `... smoketest.js`.
//
// Scenarios run in the main V8 realm through sweep/headless.mjs (the sweep path), with
// PARAMETERS.seed set. They span Model 1 (Population) and Model V (World) and the switches
// that existed at capture: franchise off/A/B, signed θ/ψ, fixed and voted term, pSexual,
// individual births, wealth-biased births, random migration.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runConfig } from './sweep/headless.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const BASELINE = path.join(DIR, 'regress.baseline.json');
const SEED = 20261118;

const V = { spatial: true, regime: 'genome', randomizeGenes: true, reportingPeriod: 100,
            gridRows: 10, gridCols: 10, seedVillages: 10, seedPop: 30, cap: 100, birthThreshold: 0,
            pMigrateRandom: 0.02, pMigrateMisfit: 0.2, pMigrateStarve: 0.2, collection: 'regress' };
const SMALL = { spatial: true, regime: 'genome', epoch: 500, gridRows: 6, gridCols: 6, cap: 40, birthThreshold: 20,
                seedVillages: 4, seedPop: 15, initialStock: 5, pNoGather: 0.10, pNoConsume: 0.11, collection: 'regress' };

export const SCENARIOS = [
    // Model V, production-like (balance/constitution grid BASE), 3000 ticks each
    { name: 'V_off_T1_g2',        config: { ...V, epoch: 3000, franchiseMode: 'off', birthThresholdRate: 2 } },
    { name: 'V_A_signed_pct',     config: { ...V, epoch: 3000, franchiseMode: 'A', signedThreshold: true, thresholdMode: 'percentile', birthThresholdRate: 1 } },
    { name: 'V_B_relative_i6',    config: { ...V, epoch: 3000, franchiseMode: 'B', birthThresholdRate: 2, individualBirthThreshold: 6 } },
    { name: 'V_off_T100_sex05',   config: { ...V, epoch: 3000, franchiseMode: 'off', constitutionTerm: 100, pSexual: 0.5, birthThresholdRate: 1 } },
    { name: 'V_off_beta2_sex1',   config: { ...V, epoch: 3000, franchiseMode: 'off', birthWealthBias: 2, pSexual: 1, birthThresholdRate: 3, cloneFounders: true } },
    // Model V, the worldsmoke scenarios (small grid)
    { name: 'S_coop_pool',        config: { ...SMALL, randomizeGenes: false, tau: 0.7, theta: 0.2, phi: 1, kappa: 0, lambda: 0, coop: 1.0 } },
    { name: 'S_defector_pool',    config: { ...SMALL, randomizeGenes: false, tau: 0.7, theta: 0.2, phi: 1, kappa: 0, lambda: 0.3, coop: 0.4 } },
    { name: 'S_random_founders',  config: { ...SMALL, randomizeGenes: true, pMigrateMisfit: 0.05, pMigrateStarve: 0.05 } },
    // Model 1 (single population)
    { name: 'P_pool_evo',         config: { spatial: false, regime: 'pool', evolveTraits: true, epoch: 2000 } },
    { name: 'P_theft',            config: { spatial: false, regime: 'theft', epoch: 2000 } },
    { name: 'P_g_defectors',      config: { spatial: false, regime: 'genome', tau: 0.5, theta: 0.5, phi: 1, kappa: 0, lambda: 0.5, coop: 0.5, epoch: 2000 } },
];

const sha = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);

export async function runAll(extra = {}) {
    const out = { scenarios: {}, stdout: {} };
    for (const s of SCENARIOS) {
        const t0 = Date.now();
        const pkt = await runConfig({ ...s.config, ...extra, runName: s.name, seed: SEED });
        const keys = {};
        for (const k of Object.keys(pkt.data)) if (k !== 'parameters') keys[k] = sha(JSON.stringify(pkt.data[k]));
        out.scenarios[s.name] = { keys, parameters: pkt.data.parameters, ms: Date.now() - t0 };
        process.stderr.write(`  ${s.name.padEnd(20)} ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
    }
    for (const f of ['worldsmoke.js', 'smoketest.js']) {
        const txt = execFileSync(process.execPath, [path.join(DIR, f)], { env: { ...process.env, SEED: String(SEED) } }).toString();
        out.stdout[f] = { sha: sha(txt), text: txt };
    }
    return out;
}

/** Compare a run against the baseline; returns { identical, lines }. */
export function compare(base, cur) {
    const lines = [];
    let identical = true;
    for (const [name, b] of Object.entries(base.scenarios)) {
        const c = cur.scenarios[name];
        if (!c) { lines.push(`${name}: MISSING`); identical = false; continue; }
        const diff = [], added = [], gone = [];
        for (const [k, h] of Object.entries(b.keys)) {
            if (!(k in c.keys)) gone.push(k);
            else if (c.keys[k] !== h) diff.push(k);
        }
        for (const k of Object.keys(c.keys)) if (!(k in b.keys)) added.push(k);
        const pdiff = [], padded = [];
        for (const [k, v] of Object.entries(b.parameters)) {
            if (JSON.stringify(c.parameters[k]) !== JSON.stringify(v)) pdiff.push(`${k}: ${JSON.stringify(v)} -> ${JSON.stringify(c.parameters[k])}`);
        }
        for (const k of Object.keys(c.parameters)) if (!(k in b.parameters)) padded.push(`${k}=${JSON.stringify(c.parameters[k])}`);
        const same = !diff.length && !gone.length && !added.length && !pdiff.length;
        if (!same) identical = false;
        lines.push(`${name.padEnd(20)} ${same ? 'IDENTICAL' : 'DIFFERS'}` +
            `  (${Object.keys(b.keys).length} data keys)` +
            (diff.length ? `  changed: ${diff.join(',')}` : '') +
            (gone.length ? `  removed: ${gone.join(',')}` : '') +
            (added.length ? `  new keys: ${added.join(',')}` : '') +
            (pdiff.length ? `  PARAMETERS changed: ${pdiff.join('; ')}` : '') +
            (padded.length ? `  [params added: ${padded.join(' ')}]` : ''));
    }
    for (const [f, b] of Object.entries(base.stdout)) {
        const c = cur.stdout[f];
        const same = c && c.sha === b.sha;
        if (!same) identical = false;
        lines.push(`${('SEED=' + SEED + ' ' + f).padEnd(20)} ${same ? 'IDENTICAL' : 'DIFFERS'} stdout`);
    }
    return { identical, lines };
}

const describe = () => { try { return execFileSync('git', ['describe', '--tags', '--always', '--dirty'], { cwd: DIR }).toString().trim(); } catch { return 'no-git'; } };

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    const mode = process.argv[2] || '--check';
    if (mode === '--capture') {
        const r = await runAll();
        fs.writeFileSync(BASELINE, JSON.stringify({ seed: SEED, captured: new Date().toISOString(), commit: describe(), ...r }, null, 1));
        console.log(`captured ${Object.keys(r.scenarios).length} scenarios + 2 stdouts @ ${describe()} -> regress.baseline.json`);
    } else if (mode === '--check-twice') {
        const a = await runAll(), b = await runAll();
        const { identical, lines } = compare(a, b);
        console.log(lines.join('\n'));
        console.log(identical ? 'TWICE: IDENTICAL (nothing volatile)' : 'TWICE: DIFFERS (something volatile)');
        process.exit(identical ? 0 : 1);
    } else {
        const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
        const r = await runAll();
        const { identical, lines } = compare(base, r);
        console.log(`baseline @ ${base.commit} (seed ${base.seed})  vs  current @ ${describe()}`);
        console.log(lines.join('\n'));
        console.log(identical ? 'REGRESS: IDENTICAL' : 'REGRESS: DIFFERS');
        process.exit(identical ? 0 : 1);
    }
}
