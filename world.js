/** Human-readable description of what each gene controls (0 -> 1). */
const GENE_INFO = {
    tau:    "tau  tax rate  (0 none -> 1 take all)",
    theta:  "theta  who pays  (0 everyone -> 1 only the rich)",
    phi:    "phi  who receives  (0 all equally -> 1 neediest first)",
    kappa:  "kappa  chief's cut  (0 none -> 1 all to the hub)",
    lambda: "lambda  punish defectors  (0 never -> 1 always destroy)",
    psi:    "psi  who votes  (0 everyone -> 1 only the wealthiest)",
    coop:   "coop  pay in when asked?  (0 always defect -> 1 always comply)",
    omega:  "omega  INERT tracer  (affects nothing; the drift/draft baseline)",
    term:   "term  election period  (voted -> constitution term T; inert under franchise off)",
};

/** Short gene labels for the (narrow) histograms. */
const GENE_SHORT = {
    tau: "tau (tax rate)", theta: "theta (who pays)", phi: "phi (who gets it)",
    kappa: "kappa (chief cut)", lambda: "lambda (punish)", psi: "psi (who votes)",
    coop: "coop (comply)", omega: "omega (inert null)", term: "term (election period)",
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
        seedRNG(PARAMETERS.seed);   // start of a run: (re)seed every RNG stream (null = Math.random)
        this.rows = PARAMETERS.gridRows;
        this.cols = PARAMETERS.gridCols;
        this.grid = Array.from({ length: this.rows }, () => new Array(this.cols).fill(null));
        // S4 (recordSyndrome): every village gets a unique id `vid` (a cell can be emptied and
        // re-founded), and villages that end between syndrome records are kept here with their
        // final flows until the next record.
        this.nextVid = 0;
        this.ended = [];

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
            if (PARAMETERS.recordSyndrome) agents.forEach(a => a.lin = seeded);   // lineage = founding village index
            this.grid[r][c] = this.makeVillage(r, c, agents);
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

    /** Construct a Village (and, under recordSyndrome, give it a unique id). */
    makeVillage(r, c, agents) {
        const v = new Village(r, c, agents);
        if (PARAMETERS.recordSyndrome) v.vid = this.nextVid++;
        return v;
    }

    /** S4: close the flow window of a village that is ending (its cell nulled). Villages turn
     *  over fast — a catastrophe wipes ~0.4 villages per tick on a full grid (default
     *  catastropheChance), and the cell is re-founded by migrants the next tick — so this is
     *  frequent. Each ended village keeps a compact integer row [id, cause, n at end, ...flow
     *  counts] (ENDED_FIELDS), so its lifetime counts are complete; the gene sums are kept as
     *  one aggregate per cause per window (an emptied village's end composition is zero; a
     *  catastrophe is blind to composition). Accounting stays exact (switchsmoke checks it). */
    endVillage(v, cause) {
        if (!PARAMETERS.recordSyndrome) return;
        const f = flowOf(v);
        this.ended.push([v.vid, cause === 'empty' ? 0 : 1, v.pop].concat(f.c));
        const sums = this.endedSum || (this.endedSum = {});
        const A = sums[cause] || (sums[cause] = { count: 0, n: 0, z: new Array(SYND_GENES.length).fill(0),
            fc: new Array(FLOW_COUNTS.length).fill(0), fs: new Array(FLOW_SUMS.length * SYND_GENES.length).fill(0) });
        A.count++; A.n += v.pop;
        for (const a of v.agents) for (let i = 0; i < SYND_GENES.length; i++) A.z[i] += a[SYND_GENES[i]];
        for (let i = 0; i < f.c.length; i++) A.fc[i] += f.c[i];
        for (let i = 0; i < f.s.length; i++) A.fs[i] += f.s[i];
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
        if (!PARAMETERS.policyShuffle) vs.forEach(v => v.step(this.tick));   // thread the world tick so villages can term-limit their constitution
        else this.stepShuffled(vs);
        vs.forEach(v => this.reproduceGroup(v));
        this.applyCatastrophes();
        this.cullEmpty();
        this.migrate();
        this.cullEmpty();

        this.tick++;
        if (this.dataManager.update()) loadNextRunParameters();
    }

    /**
     * S5 policy-shuffle shadow (PARAMETERS.policyShuffle). Every village gathers and votes its
     * own constitution as usual (`ownPolicy`), then ENACTS the constitution of a uniformly
     * drawn OTHER living village, re-drawn every tick; demography (births, deaths, migration
     * rules) is unchanged. If the policy-coop association and outcome divergence survive this,
     * they are not selection on the village's own enacted policy (SPECS S5). A lone village
     * enacts its own. Draws from the sim stream (it is a model mechanism, not a diagnostic).
     */
    stepShuffled(vs) {
        vs.forEach(v => v.stepVote(this.tick));
        const n = vs.length;
        for (let i = 0; i < n; i++) {
            const v = vs[i];
            v.ownPolicy = v.constitution;
            let j = i;
            if (n > 1) { j = randomInt(n - 1); if (j >= i) j++; }
            v.policy = vs[j].constitution;
        }
        vs.forEach(v => v.stepEconomy());
    }

    cullEmpty() {
        for (let r = 0; r < this.rows; r++)
            for (let c = 0; c < this.cols; c++)
                if (this.grid[r][c] && this.grid[r][c].pop === 0) { this.endVillage(this.grid[r][c], 'empty'); this.grid[r][c] = null; }
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
                if (crowd > 0 && rand() < p * crowd) victims.push([r, c]);
            }
        for (const [r, c] of victims) { this.endVillage(this.grid[r][c], 'catastrophe'); this.grid[r][c] = null; }
    }

    /** Growth points needed for the next birth/fission, affine in village size:
     *  base + rate * pop. Rate 0 is a flat cost (exponential growth); a positive
     *  rate adds a per-villager cost that brakes growth toward linear — a
     *  density-dependent check on how fast the grid fills. */
    birthCost(v) {
        return Math.max(1, Math.round(PARAMETERS.birthThreshold + PARAMETERS.birthThresholdRate * v.pop));
    }

    /** Spend growth points on group births, gated by the soft cap. A birth costs `th`
     *  needs-met points and succeeds with prob birthProb(pop); on failure this tick's
     *  attempt stops and the points bank (no cliff, no fission — see village.birthProb). */
    reproduceGroup(v) {
        let guard = 10000;
        while (guard-- > 0) {
            const th = this.birthCost(v);   // recomputed each step: pop changes as it grows
            if (v.growthPoints < th) break;
            const fed = v.agents.filter(a => !a.starved);
            if (fed.length === 0) break;    // only needs-met villagers may parent; bank the points
            if (rand() >= birthProb(v.pop)) break;   // soft cap: no birth, keep the points
            v.growthPoints -= th;
            const parent = pickByStock(fed);   // ∝ stock^birthWealthBias (β=0 → uniform)
            const child = reproduce(parent, fed);   // sexual (recombine w/ a fed mate) w.p. pSexual, else clone
            if (PARAMETERS.linkedTracers) unlinkedFrom(child, fed);   // S5: unlinked tracer from a random fed villager
            v.agents.push(child);
            if (PARAMETERS.recordSyndrome) flowAdd(v, 'bG', 'birth', child);
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
        if (!target) { target = this.makeVillage(r, c, []); this.grid[r][c] = target; }
        movers.forEach(a => target.agents.push(a));
    }

    migrate() {
        this.migCount = { starve: 0, misfit: 0, random: 0, total: 0 };   // reset this tick's tally
        // Skip entirely when no migration vector is active (the common case).
        if (PARAMETERS.pMigrateRandom <= 0 && PARAMETERS.pMigrateMisfit <= 0 && PARAMETERS.pMigrateStarve <= 0) return;

        // Cache each village's enacted policy once per tick (misfit needs it);
        // migrationDest would otherwise recompute the 5 medians for every agent.
        const villages = this.villages();
        // Under the shuffle shadow, policyShuffleMisfit 'own' sorts migrants against the village's
        // OWN vote instead of the (shuffled) enacted policy.
        const own = PARAMETERS.policyShuffle && PARAMETERS.policyShuffleMisfit === 'own';
        if (PARAMETERS.pMigrateMisfit > 0) villages.forEach(v => v.cachedPolicy = (own && v.ownPolicy) || v.policy || v.enactedPolicy());

        // Collect moves from the pre-migration state, then apply atomically.
        const moves = [];
        const rec = PARAMETERS.recordSyndrome;
        for (const v of villages) {
            for (const a of v.agents) {
                const dest = this.migrationDest(v, a);
                if (dest) moves.push(rec ? [a, v, dest, this._lastVector] : [a, v, dest]);
            }
        }
        for (const [a, v, [r, c], vec] of moves) {
            const idx = v.agents.indexOf(a);
            if (idx === -1) continue;
            v.agents.splice(idx, 1);
            let target = this.grid[r][c];
            if (!target) { target = this.makeVillage(r, c, []); this.grid[r][c] = target; }
            target.agents.push(a);
            if (rec) { flowAdd(v, EMIG_FLOW[vec], 'emig', a); flowAdd(target, IMMIG_FLOW[vec], 'immig', a); }
        }
    }

    /** Count one migration of the given vector (per-tick + cumulative). */
    tallyMigration(vector) {
        this._lastVector = vector;   // read by migrate() for the S4 per-village flows
        this.migCount[vector]++; this.migCount.total++;
        this.migCum[vector]++;   this.migCum.total++;
    }

    /** Resolve an agent's migration to one destination cell (priority starve > misfit > random). */
    migrationDest(v, a) {
        if (a.starved && rand() < PARAMETERS.pMigrateStarve) {
            this.tallyMigration('starve');
            return this.bestFoodNeighbor(v) || this.randomNeighbor(v);
        }
        if (PARAMETERS.pMigrateMisfit > 0) {
            const mismatch = policyDistance(a, v.cachedPolicy);
            if (rand() < PARAMETERS.pMigrateMisfit * mismatch) {
                this.tallyMigration('misfit');
                return this.bestFitNeighbor(v, a);
            }
        }
        if (rand() < PARAMETERS.pMigrateRandom) {
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
            // empty cell = perfect fit (0); use the cached policy for occupied cells.
            // Squared distance: ranking only, so we skip the sqrt (monotonic → same argmin).
            const d = n ? policyDistanceSq(a, n.cachedPolicy || n.policy || (n.cachedPolicy = n.enactedPolicy())) : 0;
            if (d < bestD) { bestD = d; best = [r, c]; }
        }
        return best;
    }

    draw(ctx) {
        if (this.observer) this.observer.draw(ctx);
    }
}


/** Row layout of an ended village in data.syndrome.ended (cause 0 = emptied, 1 = catastrophe). */
const ENDED_FIELDS = ['id', 'cause', 'n'].concat(FLOW_COUNTS);

/** S4 flow names for each migration vector. */
const EMIG_FLOW = { starve: 'eS', misfit: 'eM', random: 'eR' };
const IMMIG_FLOW = { starve: 'iS', misfit: 'iM', random: 'iR' };

/** Fields of each agent row in the S4 periodic population samples (data.syndrome.samples). */
const SAMPLE_FIELDS = ['r', 'c', 'vid', 'lin', 'stock', 'tau', 'theta', 'phi', 'kappa', 'lambda', 'psi',
    'coop', 'omega', 'term', 'voted', 'elig', 'due', 'out', 'rEq', 'rNeed', 'rHub'];

/**
 * S4 per-village syndrome record (appended to that sample's villageRecords entry as `sy`),
 * closing the village's flow window:
 *   id   unique village id (a cell can be emptied and re-founded)
 *   lin  [mode lineage, Simpson diversity 1 - sum p^2, number of lineages] of the members
 *   w    member medians of the inert tracers [omega, omega1..omegak]
 *   z    member gene sums, SYND_GENES order (mean = z / n)
 *   fc   flow counts since the last syndrome record, FLOW_COUNTS order
 *   fs   flow gene sums, FLOW_SUMS blocks x SYND_GENES
 * Free function: no `this`.
 */
function syndromeVillage(v) {
    const counts = new Map();
    for (const a of v.agents) counts.set(a.lin, (counts.get(a.lin) || 0) + 1);
    let mode = null, best = -1, simpson = 1;
    for (const [lin, k] of counts) {
        if (k > best || (k === best && lin < mode)) { best = k; mode = lin; }
        simpson -= (k / v.pop) * (k / v.pop);
    }
    const w = [medianOf(v.agents, 'omega')];
    const k = PARAMETERS.extraTracers || 0;
    for (let j = 0; j < k; j++) w.push(medianOfTracer(v.agents, j));
    const z = new Array(SYND_GENES.length).fill(0);
    for (const a of v.agents) for (let i = 0; i < SYND_GENES.length; i++) z[i] += a[SYND_GENES[i]];
    const f = flowOf(v);
    v.flow = null;   // open a new window
    return { id: v.vid, lin: [mode === undefined ? null : mode, v.pop ? simpson : 0, counts.size], w, z, fc: f.c, fs: f.s };
}

/** One agent's row for a population sample (SAMPLE_FIELDS order, then its tracers).
 *  voted: 1/0 = in / excluded from the electorate of the SITTING constitution's election,
 *  -1 = not a member then (born or arrived since; common under long terms).
 *  elig: 1/0 = in / out of the electorate a vote held NOW would use (`electorate`, a Set). */
function sampleRow(a, v, electorate) {
    const voted = (a._eV === v && a._eT === v.electedAt) ? (a._eVoted ? 1 : 0) : -1;
    const row = [v.row, v.col, v.vid, a.lin === undefined ? null : a.lin, a.stock,
        a.tau, a.theta, a.phi, a.kappa, a.lambda, a.psi, a.coop, a.omega, a.term,
        voted, electorate.has(a) ? 1 : 0, a._due || 0, a._out || 0, a._rEq || 0, a._rNeed || 0, a._rHub || 0];
    if (a.tr) for (const t of a.tr) row.push(t);
    return row;
}

/** The genes whose enacted-vs-membership gap S1 measures (the six voted policy genes + term). */
const POLICY_GAP_GENES = ['tau', 'theta', 'phi', 'kappa', 'lambda', 'psi', 'term'];

/** Population-weighted median of values[i] with weights w[i] (w > 0). */
function weightedMedian(values, w) {
    const idx = values.map((_, i) => i).sort((i, j) => values[i] - values[j]);
    let total = 0;
    for (const x of w) total += x;
    let acc = 0;
    for (const i of idx) { acc += w[i]; if (acc >= total / 2) return values[i]; }
    return idx.length ? values[idx[idx.length - 1]] : 0;
}

/**
 * S1 (analysis/SPECS.md) — one census sample of the gap between each village's ENACTED
 * policy and what its members want, split into a LAG part (the term froze an old vote) and
 * a FRANCHISE part (part of the membership doesn't vote). Per village v with members:
 *   e = the village's own sitting constitution (v.policy; under policyShuffle v.ownPolicy,
 *       since v.policy is then another village's)                 — enacted by its own vote
 *   n = genePolicy(v.agents, own)                                  — a vote held now, current electorate
 *   f = medianOf(v.agents, g)                                      — full membership (everyone votes)
 *   total |e−f| = lag |e−n| ⊕ franchise |n−f|;  rank gap q = #{members with gene > e}/pop − 0.5
 * Returns pop-weighted means over villages of |e−f|, |e−n|, |n−f| and the pop-weighted RMS of
 * q (one entry per gene in POLICY_GAP_GENES), plus [median, mean] of the term T and of the
 * election age (ticks since the sitting constitution was elected, as of the last step;
 * T = 1 gives 0), both pop-weighted. A village founded by migration this tick has not voted
 * yet: e = n (genePolicy of its members) and age 0. No RNG; uses the shared median buffer.
 * Free function: no `this`.
 */
function policyGapSample(villages, lastTick) {
    const G = POLICY_GAP_GENES, ng = G.length;
    const absTotal = new Array(ng).fill(0), absLag = new Array(ng).fill(0);
    const absFranchise = new Array(ng).fill(0), rank = new Array(ng).fill(0);
    const terms = [], ages = [], wts = [];
    let W = 0;
    for (const v of villages) {
        const pop = v.agents.length;
        if (pop === 0) continue;
        // The village's OWN sitting constitution: under the policy-shuffle shadow v.policy is a
        // random other village's, but the gap S1 measures is between a village's own vote and
        // its members (and mode B's franchise gate is its own constitution's psi). Off the
        // shuffle ownPolicy is unset and this is v.policy, as before.
        const own = v.ownPolicy || v.policy;
        const elected = !!own;
        const e = own || genePolicy(v.agents);
        const n = genePolicy(v.agents, own);
        for (let i = 0; i < ng; i++) {
            const g = G[i], f = medianOf(v.agents, g);
            absTotal[i] += pop * Math.abs(e[g] - f);
            absLag[i] += pop * Math.abs(e[g] - n[g]);
            absFranchise[i] += pop * Math.abs(n[g] - f);
            let above = 0;
            for (const a of v.agents) if (a[g] > e[g]) above++;
            const q = above / pop - 0.5;
            rank[i] += pop * q * q;
        }
        terms.push(v.term); ages.push(elected ? Math.max(0, lastTick - v.electedAt) : 0); wts.push(pop);
        W += pop;
    }
    const mean = (xs) => { let s = 0; for (let i = 0; i < xs.length; i++) s += xs[i] * wts[i]; return W ? s / W : 0; };
    return {
        absTotal: absTotal.map(x => W ? x / W : 0),
        absLag: absLag.map(x => W ? x / W : 0),
        absFranchise: absFranchise.map(x => W ? x / W : 0),
        rankTotal: rank.map(x => W ? Math.sqrt(x / W) : 0),
        termTicks: [weightedMedian(terms, wts), mean(terms)],
        electionAge: [weightedMedian(ages, wts), mean(ages)],
    };
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
        this.geneNames = ['tau', 'theta', 'phi', 'kappa', 'lambda', 'psi', 'coop', 'omega', 'term'];
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

        // Per sample: the full 6x6 gene covariance over the living population (exact,
        // census — captures the JOINT/pairwise structure the marginal histograms can't),
        // and a per-village summary (size, mean coop, enacted policy, growth) for the
        // spatial / multilevel (Price-equation) analyses.
        this.geneCov = [];
        this.villageRecords = [];
        this.villageRecordTicks = null;   // set only when villageRecords are thinned (see record)

        // Correlation of coop with each policy gene over time (derived from the
        // covariance) — for the live observer's leading-edge plot. NaN where coop
        // has ~no variance (a committed world).
        this.policyGenes = ['tau', 'theta', 'phi', 'kappa', 'lambda', 'psi'];
        this.coopCorr = {};
        this.policyGenes.forEach(g => this.coopCorr[g] = []);

        // S4 syndrome (PARAMETERS.recordSyndrome): flows/lineage/tracers per village every
        // `syndromeEvery` samples (as villageRecords[s][i].sy), villages that ended in between,
        // and population samples every `syndromeSampleTicks` ticks.
        const kTr = PARAMETERS.extraTracers || 0;
        this.syndrome = PARAMETERS.recordSyndrome ? {
            every: PARAMETERS.syndromeEvery, sampleTicks: PARAMETERS.syndromeSampleTicks,
            genes: SYND_GENES, flowCounts: FLOW_COUNTS, flowSums: FLOW_SUMS,
            tracers: ['omega'].concat(Array.from({ length: kTr }, (_, j) => 'omega' + (j + 1))),
            sampleFields: SAMPLE_FIELDS.concat(Array.from({ length: kTr }, (_, j) => 'omega' + (j + 1))),
            recordTicks: [],   // the tick of each syndrome record (villageRecords[s] with .sy)
            endedFields: ENDED_FIELDS,
            ended: [],         // per syndrome record: villages that ended since the previous one, one row each (ENDED_FIELDS)
            endedSum: [],      // per syndrome record: null, or { empty?, catastrophe? } each { count, n, z, fc, fs } summed over those villages
            samples: [],       // [{ tick, rows: [[SAMPLE_FIELDS...]] }]
        } : null;
        // Extra inert tracers (PARAMETERS.extraTracers > 0): per sample, per tracer, the agent
        // mean, the mean over villages of the village median, and the SD of village medians.
        this.tracers = kTr > 0 ? { names: Array.from({ length: kTr }, (_, j) => 'omega' + (j + 1)),
                                   mean: [], villageMean: [], villageSD: [] } : null;

        // S5 linked/unlinked tracer pair (PARAMETERS.linkedTracers): per sample, [omegaL, omegaU].
        this.linked = PARAMETERS.linkedTracers ? { names: ['omegaL', 'omegaU'], mean: [], coopCorr: [], villageMean: [], villageSD: [] } : null;

        // S1 policy gap (PARAMETERS.recordPolicyGap): per-sample summaries, not per-village rows.
        this.policyGap = PARAMETERS.recordPolicyGap ? {
            genes: POLICY_GAP_GENES, absTotal: [], absLag: [], absFranchise: [], rankTotal: [],
            termTicks: [], electionAge: [],
        } : null;
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
        // policy for the voted genes (incl. the enacted term gene); coop and the inert ω
        // aren't voted, so they are medianed over the members here. (Before 2026-11-18
        // omega/term were missing here, so geneVillageMeans.omega/.term were NaN -> null
        // and their village histograms all-zero.)
        const villageVals = villages.map(v => {
            const pol = v.policy || genePolicy(v.agents);
            return { tau: pol.tau, theta: pol.theta, phi: pol.phi, kappa: pol.kappa,
                     lambda: pol.lambda, psi: pol.psi, coop: median(v.agents.map(a => a.coop)),
                     omega: median(v.agents.map(a => a.omega)), term: pol.term };
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

        // 6x6 gene covariance over the whole living population (one extra pass; ~21
        // multiply-adds per agent, negligible vs the tick cost). Order = geneNames.
        const G = this.geneNames, ng = G.length;
        const gsum = new Array(ng).fill(0);
        const gsp = Array.from({ length: ng }, () => new Array(ng).fill(0));
        agents.forEach(a => {
            for (let i = 0; i < ng; i++) {
                const vi = a[G[i]]; gsum[i] += vi;
                for (let j = i; j < ng; j++) gsp[i][j] += vi * a[G[j]];
            }
        });
        const cov = Array.from({ length: ng }, () => new Array(ng).fill(0));
        for (let i = 0; i < ng && n > 0; i++) {
            for (let j = i; j < ng; j++) {
                const c = gsp[i][j] / n - (gsum[i] / n) * (gsum[j] / n);
                cov[i][j] = c; cov[j][i] = c;
            }
        }
        this.geneCov.push(cov);

        // corr(coop, gene) for the live observer (leading-edge view).
        const ciC = G.indexOf('coop'), vcoop = cov[ciC][ciC];
        this.policyGenes.forEach(g => {
            const gi = G.indexOf(g), denom = Math.sqrt(vcoop * cov[gi][gi]);
            this.coopCorr[g].push(denom > 1e-9 ? cov[ciC][gi] / denom : NaN);
        });

        // Per-village summary: position, size, mean coop, enacted policy, growth points.
        // Under recordSyndrome, every `syndromeEvery`-th sample also carries `sy` (syndromeVillage).
        const sIdx = this.popSeries.length - 1, tickNow = this.world.tick - 1;
        const synd = this.syndrome && sIdx % Math.max(1, PARAMETERS.syndromeEvery) === 0;
        // villageRecords cadence (packet size): every `villageRecordEvery`-th sample, none if
        // recordVillageRecords is false — except that a syndrome record always writes one (its
        // `sy` lives there). Thinned records carry their ticks in villageRecordTicks.
        const vrEvery = Math.max(1, PARAMETERS.villageRecordEvery);
        const thinned = !PARAMETERS.recordVillageRecords || vrEvery > 1;
        const wantVR = synd || (PARAMETERS.recordVillageRecords && sIdx % vrEvery === 0);
        if (thinned && !this.villageRecordTicks) this.villageRecordTicks = [];
        if (wantVR && thinned) this.villageRecordTicks.push(tickNow);
        if (wantVR) this.villageRecords.push(villages.map(v => {
            const pol = v.policy || genePolicy(v.agents);
            const rec = {
                r: v.row, c: v.col, n: v.pop,
                coop: v.pop ? v.agents.reduce((s, a) => s + a.coop, 0) / v.pop : 0,
                g: [pol.tau, pol.theta, pol.phi, pol.kappa, pol.lambda, pol.psi],
                gp: v.growthPoints,
            };
            if (synd) rec.sy = syndromeVillage(v);
            if (PARAMETERS.policyShuffle) {   // the village's own vote, beside the enacted (shuffled) g
                const o = v.ownPolicy || pol;
                rec.go = [o.tau, o.theta, o.phi, o.kappa, o.lambda, o.psi];
            }
            return rec;
        }));
        if (synd) {
            this.syndrome.recordTicks.push(tickNow);
            this.syndrome.ended.push(this.world.ended.splice(0));
            this.syndrome.endedSum.push(this.world.endedSum || null);
            this.world.endedSum = null;
        }
        if (this.syndrome && tickNow % Math.max(1, PARAMETERS.syndromeSampleTicks) === 0) {
            // A uniform sample of agents (diag RNG stream: does not perturb the run).
            const tagged = villages.flatMap(v => v.agents.map(a => [a, v]));
            const m = Math.min(PARAMETERS.syndromeSampleSize, tagged.length);
            for (let i = 0; i < m; i++) {
                const j = i + Math.floor(diagRand() * (tagged.length - i));
                const t = tagged[i]; tagged[i] = tagged[j]; tagged[j] = t;
            }
            const electorates = new Map();   // per sampled village: the electorate a vote now would use
            const electorateOf = v => {
                // mode B gates on the village's own sitting constitution (not a shuffled one)
                if (!electorates.has(v)) { const out = {}; genePolicy(v.agents, v.ownPolicy || v.policy, out); electorates.set(v, new Set(out.voters)); }
                return electorates.get(v);
            };
            this.syndrome.samples.push({ tick: tickNow, rows: tagged.slice(0, m).map(([a, v]) => sampleRow(a, v, electorateOf(v))) });
        }
        if (this.linked) {
            // [omegaL, omegaU]: agent mean, corr with coop across agents, mean and SD of village medians.
            const L = this.linked, mean = [0, 0], keys = ['omegaL', 'omegaU'];
            let sc = 0, scc = 0; const sx = [0, 0], sxx = [0, 0], sxc = [0, 0];
            for (const a of agents) {
                sc += a.coop; scc += a.coop * a.coop;
                for (let j = 0; j < 2; j++) { const x = a[keys[j]]; sx[j] += x; sxx[j] += x * x; sxc[j] += x * a.coop; }
            }
            const corr = [0, 1].map(j => {
                if (!n) return NaN;
                const vx = sxx[j] / n - (sx[j] / n) ** 2, vc = scc / n - (sc / n) ** 2, cxc = sxc[j] / n - (sx[j] / n) * (sc / n);
                return vx > 1e-12 && vc > 1e-12 ? cxc / Math.sqrt(vx * vc) : NaN;
            });
            const occupied = villages.filter(v => v.pop > 0);
            const vm = [0, 0], vsd = [0, 0];
            for (let j = 0; j < 2; j++) {
                mean[j] = n ? sx[j] / n : 0;
                const meds = occupied.map(v => medianOf(v.agents, keys[j]));
                const mu = meds.length ? meds.reduce((s, x) => s + x, 0) / meds.length : 0;
                vm[j] = mu; vsd[j] = meds.length ? Math.sqrt(meds.reduce((s, x) => s + (x - mu) ** 2, 0) / meds.length) : 0;
            }
            L.mean.push(mean); L.coopCorr.push(corr); L.villageMean.push(vm); L.villageSD.push(vsd);
        }
        if (this.tracers) {
            const k = this.tracers.names.length, mean = new Array(k).fill(0), vm = new Array(k).fill(0), vsd = new Array(k).fill(0);
            for (const a of agents) for (let j = 0; j < k; j++) mean[j] += a.tr[j];
            const occupied = villages.filter(v => v.pop > 0);
            for (let j = 0; j < k; j++) {
                const meds = occupied.map(v => medianOfTracer(v.agents, j));
                const mu = meds.length ? meds.reduce((s, x) => s + x, 0) / meds.length : 0;
                vm[j] = mu;
                vsd[j] = meds.length ? Math.sqrt(meds.reduce((s, x) => s + (x - mu) * (x - mu), 0) / meds.length) : 0;
                mean[j] = n ? mean[j] / n : 0;
            }
            this.tracers.mean.push(mean); this.tracers.villageMean.push(vm); this.tracers.villageSD.push(vsd);
        }

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

        if (this.policyGap) {
            const pg = policyGapSample(villages, this.world.tick - 1), out = this.policyGap;
            for (const k of ['absTotal', 'absLag', 'absFranchise', 'rankTotal', 'termTicks', 'electionAge']) out[k].push(pg[k]);
        }
    }

    update() {
        if (this.tick++ % this.reportingPeriod === 0) {
            this.record();
            if (this.tick >= PARAMETERS.epoch) { this.send(); return true; }
        }
        return false;
    }

    /** A random sample of K agents' full genomes + their village, taken once at the
     *  end of the run — preserves the JOINT distribution (clusters / conditionals)
     *  the marginal summaries can't. Genome order = geneNames. */
    endpointSample(k) {
        const tagged = this.world.villages().flatMap(v => v.agents.map(a => ({ a, r: v.row, c: v.col })));
        const m = Math.min(k, tagged.length);
        for (let i = 0; i < m; i++) {   // partial Fisher–Yates: first m are a uniform sample
            const j = i + randomInt(tagged.length - i);
            const t = tagged[i]; tagged[i] = tagged[j]; tagged[j] = t;
        }
        return tagged.slice(0, m).map(({ a, r, c }) => ({
            r, c, stock: a.stock,
            g: [a.tau, a.theta, a.phi, a.kappa, a.lambda, a.psi, a.coop, a.omega, a.term],
        }));
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
                geneOrder: this.geneNames,
                geneCovariance: this.geneCov,
                villageRecords: this.villageRecords,
                populationSample: this.endpointSample(256),
            },
        };
        // Diagnostics behind switches add their keys only when on, so a default packet is unchanged.
        if (this.villageRecordTicks) packet.data.villageRecordTicks = this.villageRecordTicks;
        if (this.policyGap) packet.data.policyGap = this.policyGap;
        if (this.syndrome) packet.data.syndrome = this.syndrome;
        if (this.tracers) packet.data.tracers = this.tracers;
        if (this.linked) packet.data.linkedTracers = this.linked;
        if (typeof socket !== "undefined" && socket) {
            socket.emit("insert", packet);
            console.log("Data sent:", PARAMETERS.runName);
        }
    }

    draw(ctx) {}
}


/** Draws the grid (cell colour = the chosen gene via viridis, area = fullness) + graphs. */
class WorldObserver {
    constructor(world, dm) {
        this.world = world;
        const gx = 1350;
        const colW = 292, gap = 16, xA = gx, xB = gx + colW + gap;
        this.graphs = [
            new Graph(xA, 36, colW, 70, [dm.popSeries], "Total population", 0, 0, true),
            new Graph(xB, 36, colW, 70, [dm.migStarve, dm.migMisfit, dm.migRandom],
                      "Migr/period: starve·misfit·random", 0, 0, true),
            // corr(coop, gene) over time, in the space below the histogram grid.
            new Graph(gx, 1108, 644, 162, dm.policyGenes.map(g => dm.coopCorr[g]),
                      "corr(coop, gene):  tau theta phi kappa lambda psi", -1, 1, false,
                      GENE_SERIES),
        ];

        // Per gene, a row of value-distribution heat-strips (low at bottom, high at
        // top), each with its mean traced as a white line. Five columns:
        //   all agents | defectors | middlers | cooperators | villages
        // The three middle columns are the gene's distribution within each coop
        // tercile, so a gene that correlates with cooperation shows its heat (and
        // mean line) shifting up from the defector column to the cooperator column.
        const hy = 150, hstep = 106, hh = 88;   // 9 gene rows (omega + term) fit above the corr graph (y=1108)
        const ncol = 5, cgap = 6, hx0 = 1350;
        const cW = Math.floor((1994 - hx0 - (ncol - 1) * cgap) / ncol);
        const cols = [
            { key: 'all',  tag: 'all',  color: "#000000" },
            { key: 'lo',   tag: 'def',  color: CVD.vermillion },
            { key: 'mid',  tag: 'mid',  color: CVD.grey },
            { key: 'hi',   tag: 'coop', color: CVD.blue },
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

        // Colour legend for the grid: a viridis bar (CVD-safe) = the chosen gene 0 -> 1.
        const lx = 30, ly = 66, lw = 200, lh = 14;
        for (let i = 0; i < lw; i++) {
            ctx.fillStyle = cvdSeq(i / lw);
            ctx.fillRect(lx + i, ly, 1, lh);
        }
        ctx.strokeStyle = "#000"; ctx.lineWidth = 1; ctx.strokeRect(lx, ly, lw, lh);
        ctx.fillStyle = "#222"; ctx.font = "12px monospace";
        const villagerView = PARAMETERS.displayMode === 'villagers';
        if (villagerView) {
            ctx.fillText(`each cell = its villagers; colour = absolute wealth on one shared scale`, lx + lw + 12, ly + 8);
            ctx.fillText(`(dark purple = 0  ·  teal = global average  ·  yellow = >= 2x average; same colour = same wealth anywhere)`, lx, ly + lh + 14);
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
                    // Square AREA scales with population (full cell = at cap); the
                    // colour (viridis, CVD-safe) shows the gene 0 -> 1, centred in the cell.
                    const full = cell - 2;
                    const size = full * Math.sqrt(Math.min(1, v.pop / PARAMETERS.cap));
                    const off = (full - size) / 2;
                    // Backing is a neutral grey so cell brightness doesn't track pop —
                    // only the coloured area does.
                    ctx.fillStyle = "#808080";
                    ctx.fillRect(x, y, full, full);
                    ctx.fillStyle = cvdSeq(value);
                    ctx.fillRect(x + off, y + off, size, size);
                }
            }
        }

        this.graphs.forEach(g => g.draw(ctx));

        // Colour legend for the corr(coop, gene) graph (+1 = cooperators want more,
        // -1 = defectors want more; blank = a committed world, coop variance ~0).
        const corrCols = GENE_SERIES, corrNames = ["tau", "theta", "phi", "kappa", "lambda", "psi"];
        ctx.font = "12px monospace"; ctx.textAlign = "left";
        let clx = 1360;
        corrNames.forEach((nm, i) => { ctx.fillStyle = corrCols[i]; ctx.fillText(nm, clx, 1102); clx += nm.length * 7.5 + 14; });
        ctx.fillStyle = "#888"; ctx.fillText("(+1 coop wants more · -1 defectors want more)", clx + 6, 1102);

        // Legend for the per-gene histogram columns (one row per gene).
        ctx.font = "11px monospace"; ctx.textAlign = "left";
        ctx.fillStyle = "#222";        ctx.fillText("per-gene columns:  all", 1350, 146);
        ctx.fillStyle = CVD.vermillion; ctx.fillText("defectors", 1505, 146);
        ctx.fillStyle = "#222";        ctx.fillText("·", 1576, 146);
        ctx.fillStyle = CVD.grey;      ctx.fillText("middlers", 1586, 146);
        ctx.fillStyle = "#222";        ctx.fillText("·", 1650, 146);
        ctx.fillStyle = CVD.blue;      ctx.fillText("cooperators", 1660, 146);
        ctx.fillStyle = "#222";        ctx.fillText("· villages   (coop terciles)", 1748, 146);

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
            ctx.fillStyle = cvdSeq(level / (levels - 1));
            ctx.fillRect(x + sc * sub, y + sr * sub, sub - 0.5, sub - 0.5);
        }
    }
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { World, WorldDataManager };
}
