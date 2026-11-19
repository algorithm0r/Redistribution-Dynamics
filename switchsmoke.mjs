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

/** Same seed, switch on vs off: every key the OFF packet has must be byte-identical.
 *  villageRecords is compared with the switch's own `sy` field stripped. */
const stripSy = vr => vr.map(s => s.map(({ sy, ...rest }) => rest));
async function nonPerturbing(cfg, on) {
    const a = await quiet(cfg), b = await quiet({ ...cfg, ...on });
    const norm = (d, k) => k === 'villageRecords' ? stripSy(d[k]) : d[k];
    const moved = Object.keys(a.data).filter(k => k !== 'parameters' && sha(norm(a.data, k)) !== sha(norm(b.data, k)));
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

    async termVoted() {
        console.log('\n== S2 termVoted ==');
        const cfg = { ...V, epoch: 3000, recordPolicyGap: true };
        for (const fr of ['A', 'B']) for (const T of [1, 100]) {
            const p = await quiet({ ...cfg, franchiseMode: fr, termVoted: false, constitutionTerm: T }), pg = p.data.policyGap;
            const Ts = new Set(pg.termTicks.map(r => r[0])), maxAge = Math.max(...pg.electionAge.map(r => r[1]));
            const frMax = Math.max(...pg.absFranchise.map(r => Math.max(...r.slice(0, 5))));
            console.log(`  ${fr} termVoted=false T=${T}: T values seen {${[...Ts].join(',')}} | max mean age ${f3(maxAge)} | max franchise |n-f| ${f3(frMax)}`);
            check(Ts.size === 1 && Ts.has(T), `${fr}: T fixed at constitutionTerm ${T} in every sample`);
            check(maxAge <= T - 1, `${fr}: election age never exceeds T-1 = ${T - 1}`);
            check(frMax > 0, `${fr}: the franchise still acts (franchise part > 0)`);
        }
        const v = await quiet({ ...cfg, franchiseMode: 'A' });   // default termVoted: true
        check(v.data.policyGap.termTicks.at(-1)[1] > 1000, `A with termVoted default (true): T still voted (mean ${f3(v.data.policyGap.termTicks.at(-1)[1])})`);
    },

    async syndrome() {
        console.log('\n== S4 recordSyndrome ==');
        const on = { recordSyndrome: true, syndromeSampleTicks: 2000 };
        for (const [label, extra] of [['off T=1', { franchiseMode: 'off' }], ['A, T voted, pSexual 0.5', { franchiseMode: 'A', pSexual: 0.5, individualBirthThreshold: 8 }]]) {
            console.log(` -- ${label}`);
            const cfg = { ...V, epoch: 6000, ...extra };
            const p = await nonPerturbing(cfg, on), d = p.data, sy = d.syndrome;
            const G = sy.genes.length, FC = sy.flowCounts, ix = k => FC.indexOf(k);
            const recs = d.villageRecords.filter(s => s.length && s[0].sy);
            check(recs.length === sy.recordTicks.length && recs.length === 13, `syndrome records every 5th sample: ${recs.length} (ticks ${sy.recordTicks.slice(0, 3).join(',')}..${sy.recordTicks.at(-1)})`);

            // Conservation: n and member gene sums z at record t+1 = (record t) + births − deaths − emig + immig.
            let pairs = 0, nBad = 0, zErr = 0, ends = 0;
            for (let s = 1; s < recs.length; s++) {
                const prev = new Map(recs[s - 1].map(r => [r.sy.id, r]));
                const close = (r, sid, nNow, zNow) => {
                    const p0 = prev.get(sid), n0 = p0 ? p0.n : 0, z0 = p0 ? p0.sy.z : new Array(G).fill(0);
                    const c = r.fc, fsum = r.fs;
                    const n1 = n0 + c[ix('bG')] + c[ix('bI')] - c[ix('dS')] - c[ix('dB')] - c[ix('eS')] - c[ix('eM')] - c[ix('eR')] + c[ix('iS')] + c[ix('iM')] + c[ix('iR')];
                    if (n1 !== nNow) nBad++;
                    for (let g = 0; g < G; g++) {
                        const z1 = z0[g] + fsum[g] - fsum[G + g] - fsum[2 * G + g] + fsum[3 * G + g];
                        zErr = Math.max(zErr, Math.abs(z1 - zNow[g]));
                    }
                    pairs++;
                };
                for (const r of recs[s]) close(r.sy, r.sy.id, r.n, r.sy.z);
                for (const e of sy.ended[s]) { ends++; close(e, e.id, e.n, e.z); }   // ended villages close their window too
            }
            check(nBad === 0, `village size conserved through flows in ${pairs} village-windows (${ends} ended villages; ${nBad} mismatches)`);
            check(zErr < 1e-6, `member gene sums conserved through flows (max abs error ${zErr.toExponential(2)})`);

            const tot = FC.map((_, i) => recs.reduce((s, rr) => s + rr.reduce((t, r) => t + r.sy.fc[i], 0), 0)
                                       + sy.ended.reduce((s, ee) => s + ee.reduce((t, e) => t + e.fc[i], 0), 0));
            console.log(`    flow totals ${FC.map((k, i) => k + ' ' + tot[i]).join(' · ')}`);
            const mig = d.migrations, migTot = ['starve', 'misfit', 'random'].map(k => mig[k].reduce((a, b) => a + b, 0));
            check(['S', 'M', 'R'].every(k => tot[ix('e' + k)] === tot[ix('i' + k)]), 'every emigrant is someone\'s immigrant, per vector');
            const lin = recs.at(-1).map(r => r.sy.lin);
            console.log(`    last record: ${lin.length} villages, lineages per village mean ${f3(lin.reduce((s, l) => s + l[2], 0) / lin.length)}, Simpson mean ${f3(lin.reduce((s, l) => s + l[1], 0) / lin.length)}, modes {${[...new Set(lin.map(l => l[0]))].sort((a, b) => a - b).join(',')}}`);
            check(lin.every(l => l[0] >= 0 && l[0] < 10 && l[1] >= 0 && l[1] < 1), 'lineage mode is a founding-village index 0..9, Simpson in [0,1)');

            const F = sy.sampleFields, at = k => F.indexOf(k);
            check(sy.samples.length === 4 && sy.samples.every(s => s.rows.length === 256), `population samples at ticks ${sy.samples.map(s => s.tick).join(',')} × ${sy.samples[0].rows.length} agents`);
            const rows = sy.samples.slice(1).flatMap(s => s.rows);
            const cnt = (f, v) => rows.filter(r => r[at(f)] === v).length;
            const asked = rows.filter(r => r[at('out')] > 0);
            const paidFrac = cnt('out', 1) / Math.max(1, asked.length), meanCoopAsked = asked.reduce((s, r) => s + r[at('coop')], 0) / Math.max(1, asked.length);
            console.log(`    sampled flags: voted 1/0/−1 = ${cnt('voted', 1)}/${cnt('voted', 0)}/${cnt('voted', -1)} · elig 1/0 = ${cnt('elig', 1)}/${cnt('elig', 0)} · out paid/withheld/sanctioned/not-asked = ${cnt('out', 1)}/${cnt('out', 2)}/${cnt('out', 3)}/${cnt('out', 0)} · paid share of asked ${f3(paidFrac)} vs their mean coop ${f3(meanCoopAsked)} · mean received eq ${f3(rows.reduce((s, r) => s + r[at('rEq')], 0) / rows.length)} need ${f3(rows.reduce((s, r) => s + r[at('rNeed')], 0) / rows.length)}`);
            check(asked.every(r => r[at('due')] > 0) && rows.every(r => r[at('out')] === 0 ? r[at('due')] === 0 : true), 'due > 0 exactly when asked');
            check(Math.abs(paidFrac - meanCoopAsked) < 0.08, 'paid share of asked agents ≈ their mean coop');
            check(rows.every(r => r[at('rEq')] >= 0 && r[at('rNeed')] >= 0 && r[at('rHub')] >= 0), 'received amounts non-negative');
            if (extra.franchiseMode === 'off') check(cnt('voted', 0) === 0 && cnt('voted', 1) > 0 && cnt('elig', 0) === 0, 'franchise off: no member excluded from the vote (voted, elig)');
            else check(cnt('elig', 0) > 0 && cnt('elig', 1) > 0, 'franchise A: both eligible and excluded members sampled');
        }
    },

    async tracers() {
        console.log('\n== extraTracers ==');
        const cfg = { ...V, epoch: 6000, pSexual: 0.5 };
        const p = await nonPerturbing(cfg, { extraTracers: 5, recordSyndrome: true });
        const t = p.data.tracers, last = t.mean.length - 1;
        console.log(`  ${t.names.join(' ')} | agent mean ${t.mean[last].map(f3).join(' ')} | village-median mean ${t.villageMean[last].map(f3).join(' ')} | SD across villages ${t.villageSD[last].map(f3).join(' ')}`);
        console.log(`  for comparison ω (village mean) ${f3(p.data.geneVillageMeans.omega[last])}, λ ${f3(p.data.geneVillageMeans.lambda[last])}`);
        check(t.mean.length === 61 && t.mean[0].length === 5, '5 tracers recorded at all 61 samples');
        check(t.mean[0].every(x => Math.abs(x - 0.5) < 0.05), 'tracers start uniform (agent mean ≈ 0.5 at tick 0)');
        check(t.villageSD[last].every(x => x > 0), 'tracers vary between villages (drift)');
        const w = p.data.villageRecords.filter(s => s[0] && s[0].sy).at(-1)[0].sy.w;
        check(w.length === 6, `village records carry [ω, ω1..ω5] medians (${w.map(f3).join(' ')})`);
        const q = await quiet({ ...cfg, extraTracers: 5, seed: SEED + 1 });
        check(sha(q.data.tracers.mean) !== sha(t.mean), 'a different seed gives different tracer paths (the check can fail)');
    },

    async shuffle() {
        console.log('\n== S5 policyShuffle ==');
        const G = ['tau', 'theta', 'phi', 'kappa', 'lambda'];
        const corr = (xs, ys) => {
            const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
            let sxy = 0, sxx = 0, syy = 0;
            for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
            return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : NaN;
        };
        const cfg = { ...V, epoch: 6000, franchiseMode: 'off' };
        const base = await quiet(cfg);
        check(!base.data.villageRecords[1][0].go, 'shuffle off: no `go` in village records');
        for (const misfit of ['enacted', 'own']) {
            const p = await quiet({ ...cfg, policyShuffle: true, policyShuffleMisfit: misfit });
            const late = p.data.villageRecords.slice(-20);   // last 2000 ticks
            const rows = late.flat();
            const rEO = G.map((g, i) => corr(rows.map(r => r.g[i]), rows.map(r => r.go[i])));
            const gap = G.map((g, i) => rows.reduce((s, r) => s + Math.abs(r.g[i] - r.go[i]), 0) / rows.length);
            const ownCoop = G.map((g, i) => corr(rows.map(r => r.go[i]), rows.map(r => r.coop)));
            const enCoop = G.map((g, i) => corr(rows.map(r => r.g[i]), rows.map(r => r.coop)));
            // Every enacted g is some village's own vote in the same sample (the donor), unless the donor ended this tick.
            let found = 0, total = 0;
            for (const s of late) {
                const owns = new Set(s.map(r => JSON.stringify(r.go)));
                for (const r of s) { total++; if (owns.has(JSON.stringify(r.g))) found++; }
            }
            const lastCoop = p.data.geneMeans.coop.at(-1), baseCoop = base.data.geneMeans.coop.at(-1);
            console.log(`  misfit=${misfit.padEnd(7)} corr(enacted, own) ${G.map((g, i) => g + ' ' + f3(rEO[i])).join(' · ')}`);
            console.log(`  ${''.padEnd(15)} mean |enacted−own| ${gap.map(f3).join(' ')} | corr(coop, own) ${ownCoop.map(f3).join(' ')} | corr(coop, enacted) ${enCoop.map(f3).join(' ')}`);
            console.log(`  ${''.padEnd(15)} enacted = another village's own vote in ${found}/${total} records | final mean coop ${f3(lastCoop)} (no shuffle ${f3(baseCoop)})`);
            check(rEO.every(r => Math.abs(r) < 0.2), `misfit=${misfit}: enacted policy decoupled from the village's own vote (|corr| < 0.2 for τθφκλ)`);
            check(gap.every(x => x > 0.02), `misfit=${misfit}: enacted differs from own (mean |e−own| > 0.02 per gene)`);
            check(found / total > 0.95, `misfit=${misfit}: enacted policies are drawn from other villages' own votes (${f3(found / total)})`);
        }
    },

    async linked() {
        console.log('\n== S5 linkedTracers ==');
        for (const ps of [0, 1]) {
            const cfg = { ...V, epoch: 6000, franchiseMode: 'off', pSexual: ps };
            const p = await nonPerturbing(cfg, { linkedTracers: true }), L = p.data.linkedTracers, last = L.mean.length - 1;
            const lateCorr = j => { const xs = L.coopCorr.slice(-20).map(r => r[j]).filter(Number.isFinite); return xs.reduce((s, x) => s + Math.abs(x), 0) / Math.max(1, xs.length); };
            console.log(`  pSexual ${ps}: [omegaL, omegaU] agent mean ${L.mean[last].map(f3).join(', ')} | village SD ${L.villageSD[last].map(f3).join(', ')} | late mean |corr(coop, ·)| ${f3(lateCorr(0))}, ${f3(lateCorr(1))} | ω ${f3(p.data.geneMeans.omega[last])}`);
            check(L.mean.length === 61 && L.mean.flat().every(x => x >= 0 && x <= 1), `pSexual ${ps}: both tracers recorded at 61 samples, in [0,1]`);
            check(L.villageSD[last].every(x => x > 0), `pSexual ${ps}: both vary between villages`);
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
