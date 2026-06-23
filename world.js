/**
 * Model V — the grid world. A 10x10 grid of cells, each empty or holding a
 * Village. Each tick: villages run their economy; then reproduction (birth below
 * cap / fission at cap), extinction of empty cells, and agent migration across
 * the grid. Multilevel selection: coop selected within villages (survival),
 * policy genes between villages (needs-met growth -> fission/extinction).
 */
class World {
    constructor() {
        this.rows = PARAMETERS.gridRows;
        this.cols = PARAMETERS.gridCols;
        this.grid = Array.from({ length: this.rows }, () => new Array(this.cols).fill(null));

        // Seed founding villages at random cells.
        let seeded = 0;
        while (seeded < PARAMETERS.seedVillages) {
            const r = randomInt(this.rows), c = randomInt(this.cols);
            if (this.grid[r][c]) continue;
            const agents = [];
            for (let i = 0; i < PARAMETERS.seedPop; i++) {
                const a = new Agent();
                if (PARAMETERS.randomizeGenes) a.randomizeGenome();
                agents.push(a);
            }
            this.grid[r][c] = new Village(r, c, agents);
            seeded++;
        }

        this.tick = 0;
        this.dataManager = new WorldDataManager(this);
        this.observer = (typeof gameEngine !== "undefined" && gameEngine && gameEngine.ctx)
            ? new WorldObserver(this, this.dataManager) : null;
    }

    villages() {
        const out = [];
        for (let r = 0; r < this.rows; r++)
            for (let c = 0; c < this.cols; c++)
                if (this.grid[r][c]) out.push(this.grid[r][c]);
        return out;
    }

    /** Four neighbours on a torus (edges wrap around). */
    neighbors(r, c) {
        const R = this.rows, C = this.cols;
        return [
            [(r - 1 + R) % R, c],
            [(r + 1) % R, c],
            [r, (c - 1 + C) % C],
            [r, (c + 1) % C],
        ];
    }

    update() {
        const vs = this.villages();
        vs.forEach(v => v.step());
        vs.forEach(v => this.reproduceOrFission(v));
        this.cullEmpty();
        this.migrate();
        this.cullEmpty();

        this.tick++;
        if (this.dataManager.update()) loadNextRunParameters();
    }

    cullEmpty() {
        for (let r = 0; r < this.rows; r++)
            for (let c = 0; c < this.cols; c++)
                if (this.grid[r][c] && this.grid[r][c].pop === 0) this.grid[r][c] = null;
    }

    /** Spend growth points: birth below cap, fission at/above cap. */
    reproduceOrFission(v) {
        const th = PARAMETERS.birthThreshold;
        const cap = PARAMETERS.cap;
        let guard = 10000;
        while (v.growthPoints >= th && guard-- > 0) {
            if (v.pop < cap) {
                v.growthPoints -= th;
                const fed = v.agents.filter(a => !a.starved);
                const pool = fed.length ? fed : v.agents;
                if (pool.length === 0) break;
                v.agents.push(pool[randomInt(pool.length)].spawnChild());
            } else {
                const target = this.fissionTarget(v);
                if (!target) break;          // nowhere to send a colony; sit at cap
                v.growthPoints -= th;
                this.fission(v, target);
            }
        }
    }

    /** An eligible neighbour: empty, or under `fissionMaxFraction * cap`. Prefer empty. */
    fissionTarget(v) {
        const limit = PARAMETERS.fissionMaxFraction * PARAMETERS.cap;
        const empties = [], underfull = [];
        for (const [r, c] of this.neighbors(v.row, v.col)) {
            const n = this.grid[r][c];
            if (!n) empties.push([r, c]);
            else if (n.pop < limit) underfull.push([r, c]);
        }
        if (empties.length) return empties[randomInt(empties.length)];
        if (underfull.length) return underfull[randomInt(underfull.length)];
        return null;
    }

    fission(v, [r, c]) {
        const k = Math.max(1, Math.floor(v.pop * PARAMETERS.fissionSize));
        const movers = [];
        for (let i = 0; i < k && v.agents.length > 0; i++) {
            movers.push(v.agents.splice(randomInt(v.agents.length), 1)[0]);
        }
        let target = this.grid[r][c];
        if (!target) { target = new Village(r, c, []); this.grid[r][c] = target; }
        movers.forEach(a => target.agents.push(a));
    }

    migrate() {
        // Skip entirely when no migration vector is active (the common case).
        if (PARAMETERS.pMigrateRandom <= 0 && PARAMETERS.pMigrateMisfit <= 0 && PARAMETERS.pMigrateStarve <= 0) return;

        // Cache each village's enacted policy once per tick (misfit needs it);
        // migrationDest would otherwise recompute the 5 medians for every agent.
        const villages = this.villages();
        if (PARAMETERS.pMigrateMisfit > 0) villages.forEach(v => v.cachedPolicy = v.enactedPolicy());

        // Collect moves from the pre-migration state, then apply atomically.
        const moves = [];
        for (const v of villages) {
            for (const a of v.agents) {
                const dest = this.migrationDest(v, a);
                if (dest) moves.push([a, v, dest]);
            }
        }
        for (const [a, v, [r, c]] of moves) {
            const idx = v.agents.indexOf(a);
            if (idx === -1) continue;
            v.agents.splice(idx, 1);
            let target = this.grid[r][c];
            if (!target) { target = new Village(r, c, []); this.grid[r][c] = target; }
            target.agents.push(a);
        }
    }

    /** Resolve an agent's migration to one destination cell (priority starve > misfit > random). */
    migrationDest(v, a) {
        if (a.starved && Math.random() < PARAMETERS.pMigrateStarve) {
            return this.bestFoodNeighbor(v) || this.randomNeighbor(v);
        }
        if (PARAMETERS.pMigrateMisfit > 0) {
            const mismatch = policyDistance(a, v.cachedPolicy);
            if (Math.random() < PARAMETERS.pMigrateMisfit * mismatch) {
                return this.bestFitNeighbor(v, a);
            }
        }
        if (Math.random() < PARAMETERS.pMigrateRandom) {
            return this.randomNeighbor(v);
        }
        return null;
    }

    randomNeighbor(v) {
        const ns = this.neighbors(v.row, v.col);
        return ns.length ? ns[randomInt(ns.length)] : null;
    }

    bestFoodNeighbor(v) {
        let best = null, bestVal = -1;
        for (const [r, c] of this.neighbors(v.row, v.col)) {
            const n = this.grid[r][c];
            const val = n ? n.agents.reduce((s, a) => s + a.stock, 0) / Math.max(1, n.pop) : 0;
            if (val > bestVal) { bestVal = val; best = [r, c]; }
        }
        return best;
    }

    bestFitNeighbor(v, a) {
        let best = null, bestD = Infinity;
        for (const [r, c] of this.neighbors(v.row, v.col)) {
            const n = this.grid[r][c];
            // empty cell = perfect fit (0); use the cached policy for occupied cells
            const d = n ? policyDistance(a, n.cachedPolicy || (n.cachedPolicy = n.enactedPolicy())) : 0;
            if (d < bestD) { bestD = d; best = [r, c]; }
        }
        return best;
    }

    draw(ctx) {
        if (this.observer) this.observer.draw(ctx);
    }
}


/** Tracks grid-level time series and ships them to the database at the epoch. */
class WorldDataManager {
    constructor(world) {
        this.world = world;
        this.tick = 0;
        this.reportingPeriod = PARAMETERS.reportingPeriod;
        this.popSeries = [];
        this.villageSeries = [];

        // Per gene: mean over time, and a 20-bucket value distribution over time.
        this.geneNames = ['tau', 'theta', 'phi', 'kappa', 'lambda', 'coop'];
        this.geneMean = {};
        this.geneHist = {};
        this.geneNames.forEach(g => { this.geneMean[g] = []; this.geneHist[g] = []; });
    }

    record() {
        const agents = this.world.villages().flatMap(v => v.agents);
        const n = agents.length;
        this.popSeries.push(n);
        this.villageSeries.push(this.world.villages().length);

        this.geneNames.forEach(g => {
            const counts = new Array(20).fill(0);
            let sum = 0;
            agents.forEach(a => { sum += a[g]; counts[Math.min(19, Math.floor(a[g] * 20))]++; });
            this.geneMean[g].push(n ? sum / n : 0);
            this.geneHist[g].push(counts);
        });
    }

    update() {
        if (this.tick++ % this.reportingPeriod === 0) {
            this.record();
            if (this.tick >= PARAMETERS.epoch) { this.send(); return true; }
        }
        return false;
    }

    send() {
        const packet = {
            db: PARAMETERS.db,
            collection: PARAMETERS.collection,
            data: {
                run: PARAMETERS.runName,
                parameters: Object.assign({}, PARAMETERS),
                population: this.popSeries,
                villages: this.villageSeries,
                geneMeans: this.geneMean,
                geneHistograms: this.geneHist,
            },
        };
        if (typeof socket !== "undefined" && socket) {
            socket.emit("insert", packet);
            console.log("Data sent:", PARAMETERS.runName);
        }
    }

    draw(ctx) {}
}


/** Draws the grid (cell hue = redistribution rate, brightness = fullness) + graphs. */
class WorldObserver {
    constructor(world, dm) {
        this.world = world;
        const gx = 1350, gw = 600;
        this.graphs = [
            new Graph(gx, 36, gw, 70, [dm.popSeries], "Total population", 0, 0, true),
        ];

        // One value-distribution heat-strip per gene (low at bottom, high at top),
        // with the gene's mean traced as a white line on top.
        const labels = { tau: 'tau (rate)', theta: 'theta (progressivity)', phi: 'phi (focus)',
                         kappa: 'kappa (hub)', lambda: 'lambda (punish)', coop: 'coop (compliance)' };
        const hy = 150, hstep = 185, hh = 150;
        this.geneHistograms = dm.geneNames.map((g, i) =>
            new Histogram(gx, hy + i * hstep, dm.geneHist[g],
                { label: labels[g], width: gw, height: hh, means: dm.geneMean[g] }));
    }

    update() {}

    draw(ctx) {
        const w = this.world;
        const cell = Math.min(115, Math.floor(1180 / Math.max(w.rows, w.cols)));
        const x0 = 30, y0 = 105;

        for (let r = 0; r < w.rows; r++) {
            for (let c = 0; c < w.cols; c++) {
                const v = w.grid[r][c];
                const x = x0 + c * cell, y = y0 + r * cell;
                if (!v) {
                    ctx.fillStyle = "#eeeeee";
                } else {
                    const pol = v.enactedPolicy();
                    const hue = Math.round(120 * pol.tau);           // red = laissez-faire, green = pooling
                    const light = 88 - 55 * Math.min(1, v.pop / PARAMETERS.cap);
                    ctx.fillStyle = hsl(hue, 70, light);
                }
                ctx.fillRect(x, y, cell - 2, cell - 2);
            }
        }

        const agents = w.villages().flatMap(v => v.agents);
        const n = agents.length;
        const mean = f => (n ? agents.reduce((s, a) => s + f(a), 0) / n : 0);
        ctx.fillStyle = "#222";
        ctx.font = "16px monospace";
        ctx.fillText(`Model V — tick ${w.tick} / ${PARAMETERS.epoch}`, 30, 36);
        ctx.fillText(`villages ${w.villages().length}   pop ${n}`, 30, 58);
        ctx.fillText(`mean coop ${mean(a => a.coop).toFixed(3)}   tau ${mean(a => a.tau).toFixed(3)}   phi ${mean(a => a.phi).toFixed(3)}`, 30, 80);

        this.graphs.forEach(g => g.draw(ctx));
        this.geneHistograms.forEach(h => h.draw(ctx));
    }
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { World, WorldDataManager };
}
