// switchsmoke.mjs — one short smoke per diagnostic/control switch (a few thousand ticks),
// printing the new fields and asserting they are populated and sane.
//
//   node switchsmoke.mjs [policyGap|termVoted|syndrome|tracers|shuffle|linked|all]
//
// For a pure DIAGNOSTIC switch it also runs the same seeded config with the switch off and
// requires every pre-existing packet key to be byte-identical: recording must not perturb
// the trajectory (diagnostics draw from their own RNG stream, util.js diagRand/tracerRand).
// Exits non-zero if any check fails. Smoke only: nothing is written to Mongo.
import crypto from 'node:crypto';
import { runConfig } from './sweep/headless.mjs';

const SEED = 20261118;
const V = { spatial: true, regime: 'genome', randomizeGenes: true, reportingPeriod: 100,
            gridRows: 10, gridCols: 10, seedVillages: 10, seedPop: 30, cap: 100, birthThreshold: 0,
            pMigrateRandom: 0.02, pMigrateMisfit: 0.2, pMigrateStarve: 0.2, birthThresholdRate: 1,
            collection: 'smoke', seed: SEED };
const sha = x => crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0, 12);
const f3 = x => (x == null || !Number.isFinite(x)) ? String(x) : x.toFixed(3);
const quiet = async cfg => { const log = console.log; console.log = () => {}; try { return await runConfig(cfg); } finally { console.log = log; } };

let failures = 0;
const check = (ok, msg) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) failures++; };

/** Same seed, switch on vs off: every key the OFF packet has must be byte-identical. */
async function nonPerturbing(cfg, on) {
    const a = await quiet(cfg), b = await quiet({ ...cfg, ...on });
    const moved = Object.keys(a.data).filter(k => k !== 'parameters' && sha(a.data[k]) !== sha(b.data[k]));
    check(moved.length === 0, `switch on leaves every existing key identical${moved.length ? ' — moved: ' + moved.join(',') : ''}`);
    return b;
}

const SMOKES = {
    async policyGap() {
        console.log('\n== S1 recordPolicyGap ==');
        const row = (name, pg) => {
            const last = pg.absTotal.length - 1, mx = k => Math.max(...pg[k].map(r => Math.max(...r)));
            console.log(`  ${name.padEnd(22)} samples ${pg.absTotal.length} | max|e-f| ${f3(mx('absTotal'))} lag ${f3(mx('absLag'))} fr ${f3(mx('absFranchise'))}` +
                ` | last absTotal[${pg.genes.join(' ')}] = ${pg.absTotal[last].map(f3).join(' ')}` +
                ` | rankRMS ${pg.rankTotal[last].map(f3).join(' ')} | T [med,mean] ${pg.termTicks[last].map(f3).join(',')} | age ${pg.electionAge[last].map(f3).join(',')}`);
        };
        const cfg = { ...V, epoch: 3000, franchiseMode: 'off', constitutionTerm: 1 };
        const p0 = await nonPerturbing(cfg, { recordPolicyGap: true });
        const pg0 = p0.data.policyGap;
        row('off T=1', pg0);
        const maxTot = Math.max(...pg0.absTotal.map(r => Math.max(...r.slice(0, 5))));   // τ θ φ κ λ (ψ/term are universal medians in off too)
        check(pg0.absTotal.length === 31, `31 samples at period 100 / 3000 ticks (ticks 0..3000) (got ${pg0.absTotal.length})`);
        check(maxTot < 0.05, `off, T=1: |enacted − membership median| ~ 0 at every sample (max over τθφκλ ${f3(maxTot)}; not exactly 0: births/deaths/migration follow the vote)`);
        check(pg0.electionAge.every(r => r[0] === 0), 'off, T=1: election age 0 at every sample');
        check(Math.max(...pg0.absFranchise.flat()) === 0, 'off: franchise part exactly 0 (everyone votes)');

        const p1 = await quiet({ ...cfg, constitutionTerm: 500, recordPolicyGap: true }), pg1 = p1.data.policyGap;
        row('off T=500', pg1);
        const lag1 = pg1.absLag.slice(5).reduce((s, r) => s + r[2], 0) / pg1.absLag.slice(5).length;   // φ, after the first term
        check(lag1 > 0.005, `off, T=500: a lag part appears (mean |e−n| for φ after tick 500 = ${f3(lag1)})`);
        check(pg1.termTicks.every(r => r[0] === 500), 'off, T=500: T = 500 in every sample');
        const ages = pg1.electionAge.map(r => r[1]);
        check(Math.max(...ages) <= 499 && Math.max(...ages) > 50, `off, T=500: election age within [0, 499] and grows (max mean ${f3(Math.max(...ages))})`);

        for (const fr of ['A', 'B']) {
            const p = await quiet({ ...cfg, franchiseMode: fr, recordPolicyGap: true }), pg = p.data.policyGap;
            row(`franchise ${fr}, T voted`, pg);
            const frMax = Math.max(...pg.absFranchise.map(r => Math.max(...r.slice(0, 5))));
            check(frMax > 0, `franchise ${fr}: a franchise part appears (max |n−f| over τθφκλ ${f3(frMax)})`);
            check(pg.termTicks.at(-1)[1] > 1000, `franchise ${fr}: voted T is large (mean ${f3(pg.termTicks.at(-1)[1])} ticks)`);
        }
    },
};

const which = process.argv[2] || 'all';
const names = which === 'all' ? Object.keys(SMOKES) : [which];
const t0 = Date.now();
for (const n of names) {
    if (!SMOKES[n]) { console.log(`unknown smoke '${n}' (have: ${Object.keys(SMOKES).join(', ')})`); process.exit(2); }
    await SMOKES[n]();
}
console.log(`\n${failures ? failures + ' FAILED' : 'ALL PASS'}  (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
process.exit(failures ? 1 : 0);
