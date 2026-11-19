// grid-specs.mjs — grids for the analysis/SPECS.md experiments S1–S5, as drafted in
// ../notes/preregistration-draft.md. One design per call; the collection is the expNNN_slug
// claimed by `node experiment.mjs new <slug> "<question>"`.
//
//   node grid-specs.mjs <design> <expNNN_slug>      -> grids/<expNNN_slug>.json
//
// designs:
//   franchise-fixedT   S2   54 cells: individual {base,i8,i6} × group rate {1,2,3} × franchise {A,B}
//                           × T {1,100,50000}, termVoted false. Adaptive reps (minN 5, maxN 60).
//   term-ladder        S1   20 cells: {base_g2, i8_g1} × franchise off × T {1,3,10,...,50000}. 40 reps.
//   long               S3   15 cells: individual {base,i8,i6} × g1 × {off@T1, off@T100, off@T50k, A, B}
//                           at 200 000 ticks, reportingPeriod 400. 30 reps.
//   syndrome-controls  S4/S5  20 cells: {base_g2, base_g4, i6_g2, i8_g2, i8_g4} franchise off × pSexual
//                           {0,1} × {own policy, policy-shuffle shadow}. 30 reps. Add --misfit-own [N] for a
//                           third arm (shuffle with misfit migration against the village's own vote).
//
// S1–S3 use the constitution_grid base (signed θ/ψ, percentile, pSexual 0); S4/S5 use the
// balance_grid base (one-sided θ/ψ, relative), matching the families they are drawn from.
// Every cell records what its question needs and thins villageRecords for packet size
// (sizes measured 2026-11-18 with sweep/packetsize.mjs; see DEVLOG).
import fs from 'node:fs';

const [design, collection] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const MISFIT_OWN = process.argv.includes('--misfit-own');
// The misfit-own arm is the smaller secondary shuffle arm (steward, 2026-11-18): N reps per cell, default 10.
const MISFIT_OWN_REPS = (() => { const i = process.argv.indexOf('--misfit-own'), v = parseInt(process.argv[i + 1]); return i >= 0 && v > 0 ? v : 10; })();
if (!design || !collection || !/^exp\d{3,}_[a-z0-9][a-z0-9-]{0,19}$/.test(collection)) {
    console.error('usage: node grid-specs.mjs <franchise-fixedT|term-ladder|long|syndrome-controls> <expNNN_slug> [--misfit-own]');
    process.exit(2);
}

const MODEL_V = {
    collection, spatial: true, regime: 'genome', randomizeGenes: true,
    epoch: 50000, reportingPeriod: 100,
    gridRows: 10, gridCols: 10, seedVillages: 10, seedPop: 30, cap: 100,
    birthThreshold: 0, pMigrateRandom: 0.02, pMigrateMisfit: 0.2, pMigrateStarve: 0.2,
};
// constitution_grid (grid-constitution.mjs) base
const CONST_BASE = { ...MODEL_V, signedThreshold: true, thresholdMode: 'percentile', termMax: 50000, pSexual: 0 };
// balance_grid (grid.mjs) base: one-sided θ/ψ, relative threshold (the PARAMETERS defaults)
const BAL_BASE = { ...MODEL_V, signedThreshold: false, thresholdMode: 'relative' };

const INDIV = { base: { birthWealthBias: 0, individualBirthThreshold: 0 },
                i8: { birthWealthBias: 0, individualBirthThreshold: 8 },
                i6: { birthWealthBias: 0, individualBirthThreshold: 6 } };
const Tk = T => T >= 1000 ? (T / 1000) + 'k' : String(T);
const cells = [];
const add = (id, config, reps) => cells.push(reps ? { id, reps, config: { ...config, runName: id } } : { id, config: { ...config, runName: id } });

if (design === 'franchise-fixedT') {
    const REC = { recordPolicyGap: true, villageRecordEvery: 5 };
    for (const ik of ['base', 'i8', 'i6']) for (const g of [1, 2, 3]) for (const fr of ['A', 'B']) for (const T of [1, 100, 50000])
        add(`${ik}_g${g}_f${fr}_T${Tk(T)}`, { ...CONST_BASE, ...INDIV[ik], ...REC, birthThresholdRate: g, franchiseMode: fr, termVoted: false, constitutionTerm: T });
} else if (design === 'term-ladder') {
    const REC = { recordPolicyGap: true, villageRecordEvery: 5 };
    const FAM = [['base', 2], ['i8', 1]];
    for (const [ik, g] of FAM) for (const T of [1, 3, 10, 30, 100, 300, 1000, 3000, 10000, 50000])
        add(`${ik}_g${g}_foff_T${Tk(T)}`, { ...CONST_BASE, ...INDIV[ik], ...REC, birthThresholdRate: g, franchiseMode: 'off', constitutionTerm: T }, 40);
} else if (design === 'long') {
    const REC = { recordPolicyGap: true, villageRecordEvery: 5 };
    const FT = [['foff_T1', 'off', 1], ['foff_T100', 'off', 100], ['foff_T50k', 'off', 50000], ['fA', 'A', 1], ['fB', 'B', 1]];
    for (const ik of ['base', 'i8', 'i6']) for (const [fk, fr, T] of FT)
        add(`${ik}_g1_${fk}_L200k`, { ...CONST_BASE, ...INDIV[ik], ...REC, epoch: 200000, reportingPeriod: 400,
            birthThresholdRate: 1, franchiseMode: fr, constitutionTerm: T }, 30);
} else if (design === 'syndrome-controls') {
    const REC = { recordSyndrome: true, extraTracers: 5, linkedTracers: true, villageRecordEvery: 10, syndromeEvery: 10 };
    const FAM = [['base', 2], ['base', 4], ['i6', 2], ['i8', 2], ['i8', 4]];
    const ARMS = [['own', {}, 30], ['shuffle', { policyShuffle: true, policyShuffleMisfit: 'enacted' }, 30]];
    if (MISFIT_OWN) ARMS.push(['shufown', { policyShuffle: true, policyShuffleMisfit: 'own' }, MISFIT_OWN_REPS]);
    for (const [ik, g] of FAM) for (const ps of [0, 1]) for (const [ak, arm, reps] of ARMS)
        add(`${ik}_g${g}_foff_s${ps}_${ak}`, { ...BAL_BASE, ...INDIV[ik], ...REC, ...arm, birthThresholdRate: g, franchiseMode: 'off', pSexual: ps }, reps);
} else { console.error(`unknown design '${design}'`); process.exit(2); }

fs.mkdirSync(new URL('./grids/', import.meta.url), { recursive: true });
const out = new URL(`./grids/${collection}.json`, import.meta.url);
fs.writeFileSync(out, JSON.stringify(cells, null, 1));
const fixed = cells.filter(c => c.reps).reduce((s, c) => s + c.reps, 0);
console.log(`wrote ${cells.length} cells -> grids/${collection}.json (${design}; ${fixed ? fixed + ' runs, fixed reps' : 'adaptive reps'})`);
