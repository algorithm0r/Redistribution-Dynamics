/** Human-readable description of what each gene controls (0 -> 1). */
const GENE_INFO = {
    tau:    "tau  tax rate  (0 none -> 1 take all)",
    theta:  "theta  who pays  (0 everyone -> 1 only the rich)",
    phi:    "phi  who receives  (0 all equally -> 1 neediest first)",
    kappa:  "kappa  chief's cut  (0 none -> 1 all to the hub)",
    lambda: "lambda  punish defectors  (0 never -> 1 always destroy)",
    coop:   "coop  pay in when asked?  (0 always defect -> 1 always comply)",
};

/** Short gene labels for the (narrow) histograms. */
const GENE_SHORT = {
    tau: "tau (tax rate)", theta: "theta (who pays)", phi: "phi (who gets it)",
    kappa: "kappa (chief cut)", lambda: "lambda (punish)", coop: "coop (comply)",
};

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
            // Seed the founders. With `cloneFounders`, the first agent is the
            // founder and the rest are mutated genetic clones of it (low within-
            // village variance, high between-village variance — the structure
            // group selection acts on). Otherwise each villager is independent.
            const agents = [];
            let founder = null;
            for (let i = 0; i < PARAMETERS.seedPop; i++) {
                let a;
                if (PARAMETERS.cloneFounders && founder) {
                    a = founder.spawnChild();          // mutated clone of the founder
                } else {
                    a = new Agent();
                    if (PARAMETERS.randomizeGenes) a.randomizeGenome();
                    if (PARAMETERS.cloneFounders) founder = a;   // first agent founds the line
                }
                agents.push(a);
            }
            this.grid[r][c] = new Village(r, c, agents);
            seeded++;
        }

        this.tick = 0;
        // Migration tallies: per-tick (reset each tick) and cumulative, by vector.
        this.migCount = { starve: 0, misfit: 0, random: 0, total: 0 };
        this.migCum   = { starve: 0, misfit: 0, random: 0, total: 0 };
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
        this.applyCatastrophes();
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

    /** Per-tick wipeout chance, scaled by crowding: `catastropheChance` times the
     *  number of populated neighbours (0 for an isolated village → never wiped, up
     *  to 4× when fully surrounded). Victims are chosen from the pre-pass state so
     *  one wipeout doesn't lower a neighbour's count mid-pass. */
    applyCatastrophes() {
        const p = PARAMETERS.catastropheChance;
        if (p <= 0) return;
        const victims = [];
        for (let r = 0; r < this.rows; r++)
            for (let c = 0; c < this.cols; c++) {
                if (!this.grid[r][c]) continue;
                const crowd = this.neighbors(r, c).reduce((n, [nr, nc]) => n + (this.grid[nr][nc] ? 1 : 0), 0);
                if (crowd > 0 && Math.random() < p * crowd) victims.push([r, c]);
            }
        for (const [r, c] of victims) this.grid[r][c] = null;
    }

    /** Growth points needed for the next birth/fission, affine in village size:
     *  base + rate * pop. Rate 0 is a flat cost (exponential growth); a positive
     *  rate adds a per-villager cost that brakes growth toward linear — a
     *  density-dependent check on how fast the grid fills. */
    birthCost(v) {
        return Math.max(1, Math.round(PARAMETERS.birthThreshold + PARAMETERS.birthThresholdRate * v.pop));
    }

    /** Spend growth points: birth below cap, fission at/above cap. */
    reproduceOrFission(v) {
        const cap = PARAMETERS.cap;
        let guard = 10000;
        while (guard-- > 0) {
            const th = this.birthCost(v);   // recomputed each step: pop changes as it grows
            if (v.growthPoints < th) break;
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
        this.migCount = { starve: 0, misfit: 0, random: 0, total: 0 };   // reset this tick's tally
        // Skip entirely when no migration vector is active (the common case).
        if (PARAMETERS.pMigrateRandom <= 0 && PARAMETERS.pMigrateMisfit <= 0 && PARAMETERS.pMigrateStarve <= 0) return;

        // Cache each village's enacted policy once per tick (misfit needs it);
        // migrationDest would otherwise recompute the 5 medians for every agent.
        const villages = this.villages();
        if (PARAMETERS.pMigrateMisfit > 0) villages.forEach(v => v.cachedPolicy = v.policy || v.enactedPolicy());

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

    /** Count one migration of the given vector (per-tick + cumulative). */
    tallyMigration(vector) {
        this.migCount[vector]++; this.migCount.total++;
        this.migCum[vector]++;   this.migCum.total++;
    }

    /** Resolve an agent's migration to one destination cell (priority starve > misfit > random). */
    migrationDest(v, a) {
        if (a.starved && Math.random() < PARAMETERS.pMigrateStarve) {
            this.tallyMigration('starve');
            return this.bestFoodNeighbor(v) || this.randomNeighbor(v);
        }
        if (PARAMETERS.pMigrateMisfit > 0) {
            const mismatch = policyDistance(a, v.cachedPolicy);
            if (Math.random() < PARAMETERS.pMigrateMisfit * mismatch) {
                this.tallyMigration('misfit');
                return this.bestFitNeighbor(v, a);
            }
        }
        if (Math.random() < PARAMETERS.pMigrateRandom) {
            this.tallyMigration('random');
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
            const d = n ? policyDistance(a, n.cachedPolicy || n.policy || (n.cachedPolicy = n.enactedPolicy())) : 0;
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

        // Migrations per reporting period, by vector (diffed from cumulative tallies).
        this.migStarve = []; this.migMisfit = []; this.migRandom = [];
        this._lastMig = { starve: 0, misfit: 0, random: 0 };

        // Per gene, over time: mean + 20-bucket distribution, at BOTH the agent
        // level (every individual) and the village level (each village's median).
        this.geneNames = ['tau', 'theta', 'phi', 'kappa', 'lambda', 'coop'];
        this.geneMean = {}; this.geneHist = {};
        this.geneVillageMean = {}; this.geneVillageHist = {};
        this.geneNames.forEach(g => {
            this.geneMean[g] = []; this.geneHist[g] = [];
            this.geneVillageMean[g] = []; this.geneVillageHist[g] = [];
        });

        // Per gene, within each coop tercile (lo=defectors, mid, hi=cooperators) over
        // time: the mean and the 20-bucket distribution — exposes genes that correlate
        // with cooperation, and the within-group spread.
        this.geneCoopMean = {}; this.geneCoopHist = {};
        this.geneNames.forEach(g => {
            this.geneCoopMean[g] = { lo: [], mid: [], hi: [] };
            this.geneCoopHist[g] = { lo: [], mid: [], hi: [] };
        });
    }

    record() {
        const villages = this.world.villages();
        const agents = villages.flatMap(v => v.agents);
        const n = agents.length, nv = villages.length;
        this.popSeries.push(n);
        this.villageSeries.push(nv);

        // Migrations since the last sample, by vector.
        const mc = this.world.migCum;
        this.migStarve.push(mc.starve - this._lastMig.starve);
        this.migMisfit.push(mc.misfit - this._lastMig.misfit);
        this.migRandom.push(mc.random - this._lastMig.random);
        this._lastMig = { starve: mc.starve, misfit: mc.misfit, random: mc.random };

        // Each village's per-gene value, computed once: reuse the tick's cached
        // policy for the 5 voted genes; coop is medianed here (it isn't voted).
        const villageVals = villages.map(v => {
            const pol = v.policy || genePolicy(v.agents);
            return { tau: pol.tau, theta: pol.theta, phi: pol.phi, kappa: pol.kappa,
                     lambda: pol.lambda, coop: median(v.agents.map(a => a.coop)) };
        });

        this.geneNames.forEach(g => {
            // Agent-level distribution across every individual.
            const counts = new Array(20).fill(0);
            let sum = 0;
            agents.forEach(a => { sum += a[g]; counts[Math.min(19, Math.floor(a[g] * 20))]++; });
            this.geneMean[g].push(n ? sum / n : 0);
            this.geneHist[g].push(counts);

            // Village-level distribution from the precomputed village values.
            const vcounts = new Array(20).fill(0);
            let vsum = 0;
            villageVals.forEach(vv => { vsum += vv[g]; vcounts[Math.min(19, Math.floor(vv[g] * 20))]++; });
            this.geneVillageMean[g].push(nv ? vsum / nv : 0);
            this.geneVillageHist[g].push(vcounts);
        });

        // Split living agents by coop rank into thirds, then each gene's mean within
        // each third. Empty third -> NaN (the overlay line skips it).
        const byCoop = [...agents].sort((a, b) => a.coop - b.coop);
        const t1 = Math.floor(n / 3), t2 = Math.floor(2 * n / 3);
        const groups = { lo: byCoop.slice(0, t1), mid: byCoop.slice(t1, t2), hi: byCoop.slice(t2) };
        this.geneNames.forEach(g => {
            const gm = this.geneCoopMean[g], gh = this.geneCoopHist[g];
            for (const k of ['lo', 'mid', 'hi']) {
                const grp = groups[k];
                const counts = new Array(20).fill(0);
                let s = 0;
                grp.forEach(a => { s += a[g]; counts[Math.min(19, Math.floor(a[g] * 20))]++; });
                gm[k].push(grp.length ? s / grp.length : NaN);
                gh[k].push(counts);
            }
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
                migrations: { starve: this.migStarve, misfit: this.migMisfit, random: this.migRandom },
                geneMeans: this.geneMean,
                geneHistograms: this.geneHist,
                geneVillageMeans: this.geneVillageMean,
                geneVillageHistograms: this.geneVillageHist,
                geneCoopMeans: this.geneCoopMean,
                geneCoopHistograms: this.geneCoopHist,
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
        const gx = 1350;
        const colW = 292, gap = 16, xA = gx, xB = gx + colW + gap;
        this.graphs = [
            new Graph(xA, 36, colW, 70, [dm.popSeries], "Total population", 0, 0, true),
            new Graph(xB, 36, colW, 70, [dm.migStarve, dm.migMisfit, dm.migRandom],
                      "Migr/period: starve·misfit·random", 0, 0, true),
        ];

        // Per gene, a row of value-distribution heat-strips (low at bottom, high at
        // top), each with its mean traced as a white line. Five columns:
        //   all agents | defectors | middlers | cooperators | villages
        // The three middle columns are the gene's distribution within each coop
        // tercile, so a gene that correlates with cooperation shows its heat (and
        // mean line) shifting up from the defector column to the cooperator column.
        const hy = 150, hstep = 158, hh = 128;
        const ncol = 5, cgap = 6, hx0 = 1350;
        const cW = Math.floor((1994 - hx0 - (ncol - 1) * cgap) / ncol);
        const cols = [
            { key: 'all',  tag: 'all',  color: "#000000" },
            { key: 'lo',   tag: 'def',  color: "#cc2222" },
            { key: 'mid',  tag: 'mid',  color: "#9a7a00" },
            { key: 'hi',   tag: 'coop', color: "#1f9e1f" },
            { key: 'vil',  tag: 'vil',  color: "#000000" },
        ];
        const COOP_LINE = { lo: "#ff4d4d", mid: "#ffd400", hi: "#46e646" };
        this.geneHistograms = [];
        dm.geneNames.forEach((g, i) => {
            const y = hy + i * hstep;
            cols.forEach((col, ci) => {
                const x = hx0 + ci * (cW + cgap);
                let data, opts = { label: g + ' ' + col.tag, labelColor: col.color, width: cW, height: hh };
                if (col.key === 'all') {
                    data = dm.geneHist[g];
                    opts.overlays = [
                        { values: dm.geneCoopMean[g].lo,  color: COOP_LINE.lo },
                        { values: dm.geneCoopMean[g].mid, color: COOP_LINE.mid },
                        { values: dm.geneCoopMean[g].hi,  color: COOP_LINE.hi },
                    ];
                } else if (col.key === 'vil') {
                    data = dm.geneVillageHist[g];
                    opts.means = dm.geneVillageMean[g];
                } else {
                    data = dm.geneCoopHist[g][col.key];
                    opts.means = dm.geneCoopMean[g][col.key];
                }
                this.geneHistograms.push(new Histogram(x, y, data, opts));
            });
        });
    }

    update() {}

    draw(ctx) {
        const w = this.world;
        const gene = GENE_INFO[PARAMETERS.gridColorGene] ? PARAMETERS.gridColorGene : 'tau';
        const cell = Math.min(115, Math.floor(1180 / Math.max(w.rows, w.cols)));
        const x0 = 30, y0 = 130;

        const agents = w.villages().flatMap(v => v.agents);
        const n = agents.length;
        const mean = f => (n ? agents.reduce((s, a) => s + f(a), 0) / n : 0);
        const meanStock = mean(a => a.stock);
        const levels = Math.max(2, PARAMETERS.wealthLevels || 10);

        // Readout.
        ctx.textAlign = "left";
        ctx.fillStyle = "#222";
        ctx.font = "16px monospace";
        ctx.fillText(`Model V — tick ${w.tick} / ${PARAMETERS.epoch}`, 30, 30);
        ctx.fillText(`villages ${w.villages().length}   pop ${n}   ` +
                     `mean coop ${mean(a => a.coop).toFixed(2)}   tau ${mean(a => a.tau).toFixed(2)}`, 30, 52);

        // Colour legend for the grid: a red->green bar = the chosen gene 0 -> 1.
        const lx = 30, ly = 66, lw = 200, lh = 14;
        for (let i = 0; i < lw; i++) {
            ctx.fillStyle = hsl(Math.round(120 * i / lw), 75, 50);
            ctx.fillRect(lx + i, ly, 1, lh);
        }
        ctx.strokeStyle = "#000"; ctx.lineWidth = 1; ctx.strokeRect(lx, ly, lw, lh);
        ctx.fillStyle = "#222"; ctx.font = "12px monospace";
        const villagerView = PARAMETERS.displayMode === 'villagers';
        if (villagerView) {
            ctx.fillText(`each cell = its villagers; colour = absolute wealth on one shared scale`, lx + lw + 12, ly + 8);
            ctx.fillText(`(red = 0  ·  middle = global average  ·  green = >= 2x average; same colour = same wealth anywhere)`, lx, ly + lh + 14);
        } else {
            ctx.fillText(`cell colour = ${GENE_INFO[gene]}`, lx + lw + 12, ly + 8);
            ctx.fillText(`square size = village population (tiny = sparse, fills the cell = at cap)`, lx, ly + lh + 14);
        }

        // Migration readout: this tick's fires by vector + the running totals.
        const m = w.migCount, mc = w.migCum;
        ctx.fillStyle = "#222"; ctx.font = "13px monospace";
        ctx.fillText(`migrations this tick — starve ${m.starve}  misfit ${m.misfit}  random ${m.random}` +
                     `   (total so far ${mc.total})`, 30, 112);

        // Grid.
        for (let r = 0; r < w.rows; r++) {
            for (let c = 0; c < w.cols; c++) {
                const v = w.grid[r][c];
                const x = x0 + c * cell, y = y0 + r * cell;
                if (!v) {
                    ctx.fillStyle = "#eeeeee";
                    ctx.fillRect(x, y, cell - 2, cell - 2);
                } else if (villagerView) {
                    this.drawVillagers(ctx, v, x, y, cell - 2, meanStock, levels);
                } else {
                    // Policy genes (tau..lambda) come from the enacted policy (the vote);
                    // coop isn't voted, so colour by the village's median compliance.
                    const value = gene === 'coop'
                        ? median(v.agents.map(a => a.coop))
                        : (v.policy || v.enactedPolicy())[gene];
                    const hue = Math.round(120 * value);   // red = 0, green = 1
                    // Square AREA scales with population (full cell = at cap); the
                    // colour shows the gene at full strength, centred in the cell.
                    const full = cell - 2;
                    const size = full * Math.sqrt(Math.min(1, v.pop / PARAMETERS.cap));
                    const off = (full - size) / 2;
                    // Backing is a neutral grey at the SAME lightness as the square,
                    // so cell brightness doesn't track pop — only the coloured area does.
                    ctx.fillStyle = "#808080";
                    ctx.fillRect(x, y, full, full);
                    ctx.fillStyle = hsl(hue, 75, 50);
                    ctx.fillRect(x + off, y + off, size, size);
                }
            }
        }

        this.graphs.forEach(g => g.draw(ctx));

        // Legend for the per-gene histogram columns (one row per gene).
        ctx.font = "11px monospace"; ctx.textAlign = "left";
        ctx.fillStyle = "#222";    ctx.fillText("per-gene columns:  all", 1350, 146);
        ctx.fillStyle = "#cc2222"; ctx.fillText("defectors", 1505, 146);
        ctx.fillStyle = "#222";    ctx.fillText("·", 1576, 146);
        ctx.fillStyle = "#9a7a00"; ctx.fillText("middlers", 1586, 146);
        ctx.fillStyle = "#222";    ctx.fillText("·", 1650, 146);
        ctx.fillStyle = "#1f9e1f"; ctx.fillText("cooperators", 1660, 146);
        ctx.fillStyle = "#222";    ctx.fillText("· villages   (coop terciles)", 1748, 146);

        this.geneHistograms.forEach(h => h.draw(ctx));
    }

    /** Render one cell as a sub-grid of villagers, coloured by ABSOLUTE wealth on a
     *  scale shared across all villages: 0 -> 2x the global average, quantized into
     *  `levels` discrete bands. Same colour = same wealth in any cell. Box count
     *  shows population. */
    drawVillagers(ctx, v, x, y, size, meanStock, levels) {
        const k = v.pop;
        const side = Math.ceil(Math.sqrt(k));
        const sub = size / side;
        const band = meanStock > 0 ? (2 * meanStock / levels) : 1;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(x, y, size, size);
        for (let i = 0; i < k; i++) {
            const sr = Math.floor(i / side), sc = i % side;
            const level = Math.min(levels - 1, Math.floor(v.agents[i].stock / band));
            ctx.fillStyle = hsl(Math.round(120 * level / (levels - 1)), 75, 50);
            ctx.fillRect(x + sc * sub, y + sr * sub, sub - 0.5, sub - 0.5);
        }
    }
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { World, WorldDataManager };
}
