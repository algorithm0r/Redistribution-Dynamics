// Headless migration instrumentation for Model V. Loads the sim files in a VM,
// replaces World.prototype.migrationDest with a faithful counting twin (identical
// Math.random() order, so the trajectory is byte-for-byte the production one), and
// reports how often each migration vector actually fires, where movers land
// (empty cell = colonizing vs occupied = shuffling), and how that changes as the
// grid saturates (early / mid / late thirds). Run: node migstats.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function createCtx(stats) {
    const ctx = vm.createContext({
        Math, Number, Array, Object, JSON, Infinity, NaN, isNaN, isFinite,
        parseInt, parseFloat, setTimeout, clearTimeout,
        window: { requestAnimationFrame: () => {}, io: undefined },
        document: { getElementById: () => ({ classList: { remove(){}, add(){} }, value: '', innerText: '', checked: false }) },
        socket: { emit: () => {} },
        console: { log: () => {}, warn: () => {}, error: () => {} },
        saveParametersToUI: () => {}, loadParametersFromUI: () => {}, loadNextRunParameters: () => {},
        MIGSTATS: stats,
    });
    const load = f => {
        let code = fs.readFileSync(path.join(__dirname, f), 'utf8');
        code = code.replace(/^const\s+/gm, 'var ').replace(/^let\s+/gm, 'var ')
                   .replace(/^class\s+(\w+)/gm, 'var $1 = class $1');
        vm.runInContext(code, ctx);
    };
    ['util.js', 'parameters.js', 'agent.js', 'village.js', 'world.js'].forEach(load);

    // Instrumented twin of World.prototype.migrationDest — defined INSIDE the vm so it
    // closes over PARAMETERS / policyDistance. RNG call order matches production exactly.
    vm.runInContext(`
        World.prototype.migrationDest = function (v, a) {
            var S = MIGSTATS, ph = S.phase, P = PARAMETERS;
            S.calls++;
            if (P.pMigrateMisfit > 0) { S.mmSum += policyDistance(a, v.cachedPolicy); S.mmCount++; }
            if (a.starved) S.starveElig++;
            function land(d) {
                if (!d) return d;
                if (grid_is_empty(d)) { S.destEmpty++; S.ph[ph].empty++; }
                else { S.destOcc++; }
                S.moves++; S.ph[ph].moves++;
                return d;
            }
            var self = this;
            function grid_is_empty(d) { return !self.grid[d[0]][d[1]]; }

            if (a.starved && Math.random() < P.pMigrateStarve) {
                S.starveFire++;
                return land(this.bestFoodNeighbor(v) || this.randomNeighbor(v));
            }
            if (P.pMigrateMisfit > 0) {
                var mismatch = policyDistance(a, v.cachedPolicy);
                if (Math.random() < P.pMigrateMisfit * mismatch) {
                    S.misfitFire++;
                    return land(this.bestFitNeighbor(v, a));
                }
            }
            if (Math.random() < P.pMigrateRandom) {
                S.randomFire++;
                return land(this.randomNeighbor(v));
            }
            return null;
        };
    `, ctx);
    return ctx;
}

function freshStats() {
    return {
        phase: 0, ph: [ {moves:0,empty:0}, {moves:0,empty:0}, {moves:0,empty:0} ],
        calls: 0, moves: 0, starveFire: 0, misfitFire: 0, randomFire: 0,
        starveElig: 0, destEmpty: 0, destOcc: 0, mmSum: 0, mmCount: 0,
    };
}

const CELLS = 8 * 8;
const EPOCH = 600;
const BASE = {
    spatial: true, epoch: EPOCH, idCounter: 0,
    gridRows: 8, gridCols: 8, cap: 40, birthThreshold: 20, seedVillages: 6, seedPop: 15,
    initialStock: 5, pNoGather: 0.10, pNoConsume: 0.11,
    catastropheChance: 0, deathChance: 0.01, starveDeathChance: 0.5,
};

const scenarios = [
    { label: 'random 0.1  (uniform)',  randomizeGenes: false, p: { pMigrateRandom: 0.1 } },
    { label: 'starve 0.1  (uniform)',  randomizeGenes: false, p: { pMigrateStarve: 0.1 } },
    { label: 'misfit 0.1  (uniform)',  randomizeGenes: false, p: { pMigrateMisfit: 0.1 } },
    { label: 'misfit 0.1  (random)',   randomizeGenes: true,  p: { pMigrateMisfit: 0.1 } },
    { label: 'all 3 mix   (random)',   randomizeGenes: true,  p: { pMigrateRandom: 0.02, pMigrateMisfit: 0.05, pMigrateStarve: 0.1 } },
];

for (const s of scenarios) {
    const stats = freshStats();
    const ctx = createCtx(stats);
    const P = ctx.PARAMETERS;
    Object.assign(P, BASE, { randomizeGenes: s.randomizeGenes }, s.p);

    let done = false;
    ctx.loadNextRunParameters = () => { done = true; };
    const world = vm.runInContext('new World()', ctx);

    const occAt = {};                 // occupancy snapshots
    const checkpoints = [25, 100, 300, EPOCH];
    let guard = EPOCH + 50, t = 0;
    let satTick = null;               // first tick the grid is >=95% full
    while (!done && guard-- > 0) {
        stats.phase = t < EPOCH / 3 ? 0 : (t < 2 * EPOCH / 3 ? 1 : 2);
        world.update();
        t++;
        const occ = world.villages().length;
        if (satTick === null && occ >= 0.95 * CELLS) satTick = t;
        if (checkpoints.includes(t)) {
            const pop = world.villages().reduce((a, v) => a + v.pop, 0);
            occAt[t] = `${occ}/${CELLS} cells, pop ${pop}`;
        }
    }

    const pct = n => (100 * n / Math.max(1, stats.calls)).toFixed(2) + '%';
    const moverPct = (100 * stats.moves / Math.max(1, stats.calls)).toFixed(2) + '%';
    console.log(`\n=== ${s.label} ===`);
    console.log(`  fill:   ` + checkpoints.map(k => `t${k}: ${occAt[k] || '-'}`).join('  |  '));
    console.log(`  saturated (>=95% cells) at tick: ${satTick ?? 'never'}`);
    console.log(`  agent-migration decisions evaluated: ${stats.calls.toLocaleString()}`);
    console.log(`  moves: ${stats.moves.toLocaleString()} (${moverPct} of decisions)  |  landed empty ${stats.destEmpty} / occupied ${stats.destOcc}`);
    console.log(`  vector fires:  starve ${stats.starveFire} (${pct(stats.starveFire)})  |  misfit ${stats.misfitFire} (${pct(stats.misfitFire)})  |  random ${stats.randomFire} (${pct(stats.randomFire)})`);
    if (stats.starveElig) console.log(`  (starved-and-eligible decisions: ${stats.starveElig}, ${(100*stats.starveElig/stats.calls).toFixed(1)}% of all)`);
    if (stats.mmCount) console.log(`  avg policy mismatch seen by misfit test: ${(stats.mmSum / stats.mmCount).toFixed(4)}  -> effective misfit rate ~ ${(P.pMigrateMisfit * stats.mmSum / stats.mmCount).toFixed(4)}`);
    const phName = ['early', 'mid', 'late'];
    console.log(`  moves by third:  ` + stats.ph.map((p, i) =>
        `${phName[i]} ${p.moves} (empty-land ${p.moves ? (100*p.empty/p.moves).toFixed(0) : 0}%)`).join('  |  '));
}
