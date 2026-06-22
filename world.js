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
            for (let i = 0; i < PARAMETERS.seedPop; i++) agents.push(new Agent());
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

    neighbors(r, c) {
        const out = [];
        if (r > 0) out.push([r - 1, c]);
        if (r < this.rows - 1) out.push([r + 1, c]);
        if (c > 0) out.push([r, c - 1]);
        if (c < this.cols - 1) out.push([r, c + 1]);
        return out;
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
        // Collect moves from the pre-migration state, then apply atomically.
        const moves = [];
        for (const v of this.villages()) {
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
        const mismatch = policyDistance(a, v.enactedPolicy());
        if (Math.random() < PARAMETERS.pMigrateMisfit * mismatch) {
            return this.bestFitNeighbor(v, a);
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
            const d = n ? policyDistance(a, n.enactedPolicy()) : 0;  // empty = perfect fit
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
        this.coopSeries = [];
        this.tauSeries = [];
        this.phiSeries = [];
    }

    record() {
        const agents = this.world.villages().flatMap(v => v.agents);
        const n = agents.length;
        const mean = f => (n ? agents.reduce((s, a) => s + f(a), 0) / n : 0);
        this.popSeries.push(n);
        this.villageSeries.push(this.world.villages().length);
        this.coopSeries.push(mean(a => a.coop));
        this.tauSeries.push(mean(a => a.tau));
        this.phiSeries.push(mean(a => a.phi));
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
                coop: this.coopSeries,
                tau: this.tauSeries,
                phi: this.phiSeries,
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
        const gx = 1350, gw = 600, gh = 150;
        this.graphs = [
            new Graph(gx, 40,  gw, gh, [dm.popSeries], "Total population", 0, 0, true),
            new Graph(gx, 240, gw, gh, [dm.villageSeries], "Living villages", 0, 0, true),
            new Graph(gx, 440, gw, gh, [dm.coopSeries, dm.tauSeries, dm.phiSeries],
                "mean coop (g) / tau (r) / phi (c)", 0, 1, false, ["#00AA00", "#BB0000", "#00BBBB"]),
        ];
    }

    update() {}

    draw(ctx) {
        const w = this.world;
        const cell = Math.min(95, Math.floor(1180 / Math.max(w.rows, w.cols)));
        const x0 = 30, y0 = 110;

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
    }
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { World, WorldDataManager };
}
