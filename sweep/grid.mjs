// grid.mjs — generate the individual-vs-group balance factorial as [{ id, config }].
// Run:  node grid.mjs   ->   writes grid.json
//
// Design (soft-cap reproduction model):
//   INDIVIDUAL-selection axis — a UNION, not a product (β and ind are two knobs for the
//   same thing, so crossing them is redundant): a no-individual-selection baseline, a
//   β-arm (wealth-biased group births), and an ind-arm (self-breeding; LOWER threshold =
//   stronger).                                                                    [9]
//   GROUP-selection axis — birthThresholdRate (group-birth cost slope; lower = cheaper
//   group reproduction = stronger group selection).                              [3]
//   franchiseMode {off,A,B} [3] · pSexual {0,0.5,1} [3].
//   9 × 3 × 3 × 3 = 243 cells. ω rides along as the inert null in every cell.
import fs from 'node:fs';

const COLLECTION = 'balance_grid';   // dedicated collection (new soft-cap model + new axes)
const EPOCH = 50000;

// Individual-selection conditions (id, β, ind). Baseline + β-arm + ind-arm.
const INDIV = [
    { k: 'base', b: 0,   i: 0 },   // no individual selection (pure group)
    { k: 'b0.5', b: 0.5, i: 0 },
    { k: 'b1',   b: 1,   i: 0 },
    { k: 'b2',   b: 2,   i: 0 },
    { k: 'b4',   b: 4,   i: 0 },   // strong wealth-biased births
    { k: 'i8',   b: 0,   i: 8 },   // weak self-breeding
    { k: 'i6',   b: 0,   i: 6 },
    { k: 'i4',   b: 0,   i: 4 },
    { k: 'i2',   b: 0,   i: 2 },   // strong self-breeding
];
const GRATE = [2, 4, 6];           // birthThresholdRate  (group-selection axis)
const FRAN  = ['off', 'A', 'B'];
const PSEX  = [0, 0.5, 1];

// Model V base. Soft cap is in the sim now (village.birthProb); migration may break cap
// (accepted). 2% random migration for baseline connectivity + colonization.
const BASE = {
    collection: COLLECTION,
    spatial: true, regime: 'genome', randomizeGenes: true,
    epoch: EPOCH, reportingPeriod: 100,
    gridRows: 10, gridCols: 10, seedVillages: 10, seedPop: 30, cap: 100,
    birthThreshold: 0,            // flat base 0; the swept `birthThresholdRate` is the group cost
    pMigrateRandom: 0.02, pMigrateMisfit: 0.2, pMigrateStarve: 0.2,
};

const cells = [];
for (const ic of INDIV) for (const g of GRATE) for (const fr of FRAN) for (const ps of PSEX) {
    const id = `${ic.k}_g${g}_f${fr}_s${ps}`;
    cells.push({ id, config: { ...BASE, runName: id,
        birthWealthBias: ic.b, individualBirthThreshold: ic.i,
        birthThresholdRate: g, franchiseMode: fr, pSexual: ps } });
}

fs.writeFileSync(new URL('./grid.json', import.meta.url), JSON.stringify(cells));
console.log(`wrote ${cells.length} cells -> grid.json  (collection "${COLLECTION}", epoch ${EPOCH})`);
console.log(`axes: individual ${INDIV.length} (union) × group-rate ${GRATE.length} × franchise ${FRAN.length} × pSexual ${PSEX.length}`);
