// grid-constitution.mjs — the constitution sweep: signed θ/ψ + termed constitutions, aimed
// at the coop-permissive corner the balance_grid prelims found (franchise-off + no/weak
// individual selection + strong group selection). Writes constitution.json (kept separate
// from balance_grid's grid.json). Run:  node grid-constitution.mjs
//
// Axes (45 cells):
//   individual   [3]  base (no indiv sel) · i8 · i6 (weak self-breeding — the ones that cooperated)
//   group-rate   [3]  birthThresholdRate 1/2/3 (lower = cheaper group birth = stronger group sel.)
//   franchise/T  [5]  off@T1, off@T100, off@T50k  +  A(term voted), B(term voted)
// Fixed: signed θ/ψ ON, thresholdMode 'percentile', pSexual 0.
import fs from 'node:fs';

const COLLECTION = 'constitution_grid';
const EPOCH = 50000;

const INDIV = [
    { k: 'base', b: 0, i: 0 },   // no individual selection (pure group)
    { k: 'i8',   b: 0, i: 8 },   // weak self-breeding
    { k: 'i6',   b: 0, i: 6 },
];
const GRATE = [1, 2, 3];         // birthThresholdRate (group-selection axis; lower = stronger)

// Franchise × constitution-term. Under 'off', T is the fixed constitutionTerm (swept 1/100/50k);
// under 'A'/'B', T is VOTED (the term gene) so constitutionTerm is inert (left at 1).
const FT = [
    { k: 'foff_T1',   fr: 'off', term: 1 },
    { k: 'foff_T100', fr: 'off', term: 100 },
    { k: 'foff_T50k', fr: 'off', term: 50000 },
    { k: 'fA',        fr: 'A',   term: 1 },   // term voted
    { k: 'fB',        fr: 'B',   term: 1 },   // term voted
];

const BASE = {
    collection: COLLECTION,
    spatial: true, regime: 'genome', randomizeGenes: true,
    epoch: EPOCH, reportingPeriod: 100,
    gridRows: 10, gridCols: 10, seedVillages: 10, seedPop: 30, cap: 100,
    birthThreshold: 0,
    pMigrateRandom: 0.02, pMigrateMisfit: 0.2, pMigrateStarve: 0.2,
    // The new mechanics, on for the whole sweep:
    signedThreshold: true,        // θ/ψ are signed filters (0.5 = neutral); needs percentile
    thresholdMode: 'percentile',
    termMax: 50000,               // voted term gene [0,1] -> [1, 50000] ticks
    pSexual: 0,
};

const cells = [];
for (const ic of INDIV) for (const g of GRATE) for (const ft of FT) {
    const id = `${ic.k}_g${g}_${ft.k}`;
    cells.push({ id, config: { ...BASE, runName: id,
        birthWealthBias: ic.b, individualBirthThreshold: ic.i,
        birthThresholdRate: g, franchiseMode: ft.fr, constitutionTerm: ft.term } });
}

fs.writeFileSync(new URL('./constitution.json', import.meta.url), JSON.stringify(cells));
console.log(`wrote ${cells.length} cells -> constitution.json  (collection "${COLLECTION}", epoch ${EPOCH})`);
console.log(`axes: individual ${INDIV.length} × group-rate ${GRATE.length} × franchise/term ${FT.length}  |  signed θ/ψ, percentile, pSexual 0`);
