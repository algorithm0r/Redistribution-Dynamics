/**
 * Model V — village layer.
 *
 * `applyGenomePolicy` / `pourWaterFill` are the within-village redistribution
 * (shared with the single-population `genome` regime). `Village` wraps a
 * population in a grid cell and runs its per-tick economy; the grid-level
 * dynamics (reproduction, fission, extinction, migration) live in World.
 */

/**
 * The enacted policy = per-gene median of the ENFRANCHISED residents (Model V vote).
 *
 * The franchise gene psi decides *who* votes: the electorate is everyone with
 * `stock >= psi * (richest stock)`, so psi=0 is universal suffrage (everyone votes,
 * the original behaviour) and psi=1 leaves only the wealthiest voting. It's the
 * same wealth-line idea as theta's "who pays", but with `>=` (not theta's strict
 * `>`) so psi=1 still enfranchises the richest rather than emptying the electorate.
 *
 * psi is itself a voted gene, so "who votes on who-votes?" is circular. The
 * PARAMETERS.franchiseMode setting resolves it three ways:
 *   'off' disabled  — psi is ignored; the electorate is always everyone (the pre-psi
 *                     model). psi still drifts as an inert gene and is recorded, so
 *                     'off' is a clean control against A/B in the same collection.
 *   'A' universal   — psi is set by universal suffrage (median over EVERYONE); that
 *                     psi then gates the vote on the other genes. A village only
 *                     narrows its franchise if the whole population's median psi rises.
 *   'B' entrenched  — LAST tick's enacted psi (passed in as `prevPolicy`) gates this
 *                     tick's whole vote, psi included. A restrictive electorate keeps
 *                     itself restrictive: the wealthy can vote to stay in charge.
 * `prevPolicy` is only consulted in mode B (pass the village's cached policy); at
 * bootstrap (no prior policy) the franchise line is 0, i.e. universal suffrage.
 */
/**
 * The stock cutoff that gates both wealth-lines: theta's "who pays" and psi's "who
 * votes". `PARAMETERS.thresholdMode` decides how the fraction `frac` becomes a cutoff:
 *
 *   'relative'   — frac * richest stock (the original rule). The single richest agent
 *                  sets the scale, so under heavy skew (one rich, many poor) a wide
 *                  band of frac values all cut at that lone agent and everyone else
 *                  sits far below — the knob goes numb in exactly the unequal regime
 *                  the model is built to produce, and it lurches whenever the identity
 *                  of the richest agent flips.
 *   'percentile' — the frac-th quantile of the stock distribution. frac maps evenly
 *                  onto "what fraction of the population is below the line" whatever the
 *                  distribution's shape, and being a rank it's robust to one runaway
 *                  agent. Cost: it's decoupled from absolute wealth (under near-equality
 *                  frac=0.5 still taxes the top half even though they're barely richer).
 *
 * Both modes share the same edges: frac=0 -> 0 (line below everyone) and frac=1 ->
 * richest stock (line at the top). Ties at the cutoff fall together — agents of equal
 * wealth are gated identically, never split by identity. Free function: no `this`.
 */
function wealthLine(agents, frac) {
    if (PARAMETERS.thresholdMode === 'percentile') {
        return quantile(agents.map(a => a.stock), frac);
    }
    return frac * agents.reduce((m, a) => Math.max(m, a.stock), 0);
}

/**
 * The set of agents that PASS a wealth-line gate on gene value `g` — the shared primitive
 * behind θ's "who pays" and ψ's "who votes".
 *
 *   signedThreshold OFF (original): a one-sided cut. Keep agents at/above (`useGe`) or
 *     strictly above (`!useGe`) `wealthLine(g)`. g=0 keeps everyone; g=1 keeps only the top.
 *   signedThreshold ON: g maps to the signed selector s = 2g−1 (0.5 = neutral). s>0 keeps
 *     the TOP, dropping the poorest |s| (progressive/plutocratic — the one-sided default);
 *     s<0 keeps the BOTTOM, dropping the richest |s| (regressive/proletarian — the new half);
 *     s=0 keeps everyone. Cleanest in thresholdMode 'percentile' (see wealthLine note).
 *
 * `fallbackAll` (default true): if the gate comes out empty, return everyone — right for the
 * franchise (an empty electorate is meaningless). Pass false for the tax base (an empty one
 * just collects nothing). Returns `agents` itself (no allocation) whenever the gate admits all.
 * Free function: no `this`.
 */
function wealthGate(agents, g, useGe, fallbackAll = true) {
    if (!PARAMETERS.signedThreshold) {
        const line = wealthLine(agents, g);
        if (line <= 0) return agents;                                   // line below everyone
        const kept = agents.filter(useGe ? a => a.stock >= line : a => a.stock > line);
        return (kept.length === 0 && fallbackAll) ? agents : kept;
    }
    const s = 2 * g - 1;
    if (s > -1e-9 && s < 1e-9) return agents;                           // neutral center: everyone
    if (s > 0) {                                                        // keep the top; drop poorest |s|
        const line = wealthLine(agents, s);
        if (line <= 0) return agents;
        const kept = agents.filter(useGe ? a => a.stock >= line : a => a.stock > line);
        return (kept.length === 0 && fallbackAll) ? agents : kept;
    }
    const line = wealthLine(agents, 1 + s);                             // keep the bottom; drop richest |s|
    const kept = agents.filter(useGe ? a => a.stock <= line : a => a.stock < line);
    return (kept.length === 0 && fallbackAll) ? agents : kept;
}

// Reused scratch buffer for the per-gene medians below — refilled each call, so the
// vote costs no per-tick map()+sort() allocations (it ran ~2.4M times/run). Grows on
// demand; workers each get their own vm context and use is single-threaded, so sharing
// one module-level buffer is safe.
let _geneBuf = new Float64Array(256);
/** Median of agents[i][key] via the shared buffer + quickselect (no allocation). */
function medianOf(agents, key) {
    const n = agents.length;
    if (n > _geneBuf.length) _geneBuf = new Float64Array(n * 2);
    for (let i = 0; i < n; i++) _geneBuf[i] = agents[i][key];
    return medianInPlace(_geneBuf, n);
}

function genePolicy(agents, prevPolicy) {
    if (agents.length === 0) return { tau: 0, theta: 0, phi: 0, kappa: 0, lambda: 0, psi: 0, term: 0 };

    const mode = PARAMETERS.franchiseMode;
    // The electorate. 'off': everyone (psi ignored). 'A': gated by this tick's universal-
    // suffrage psi. 'B': gated by the sitting constitution's psi (prevPolicy; neutral at
    // bootstrap = universal). wealthGate applies the (possibly signed) psi wealth-line and
    // falls back to the whole village if the gate is empty (never an empty electorate).
    let voters;
    if (mode === 'off') voters = agents;
    else {
        const neutral = PARAMETERS.signedThreshold ? 0.5 : 0;   // "everyone" in each mode
        const franchise = mode === 'A' ? medianOf(agents, 'psi') : (prevPolicy ? prevPolicy.psi : neutral);
        voters = wealthGate(agents, franchise, true);
    }

    return {
        tau: medianOf(voters, 'tau'),
        theta: medianOf(voters, 'theta'),
        phi: medianOf(voters, 'phi'),
        kappa: medianOf(voters, 'kappa'),
        lambda: medianOf(voters, 'lambda'),
        // Enacted psi: in B it's the sitting electorate's own median (the franchise
        // they vote for themselves); in A/off it's the universal median (inert in off).
        psi: mode === 'B' ? medianOf(voters, 'psi') : medianOf(agents, 'psi'),
        // Voted term: the electorate's median term gene. Mapped to the constitution term T
        // (via electedTerm) only in franchise modes; inert under 'off' (T = constitutionTerm).
        term: medianOf(voters, 'term'),
    };
}

/** The constitution term T (ticks) for a village. Under franchiseMode 'off' it's the fixed
 *  PARAMETERS.constitutionTerm; otherwise the voted term gene mapped [0,1] -> [1, termMax]. */
function electedTerm(policy) {
    if (PARAMETERS.franchiseMode === 'off') return Math.max(1, PARAMETERS.constitutionTerm);
    const g = policy && Number.isFinite(policy.term) ? policy.term : 0.5;
    return Math.max(1, Math.round(1 + g * (PARAMETERS.termMax - 1)));
}

/** Apply the genome-encoded redistribution policy to one population, in place.
 *  Pass a precomputed `policy` to avoid recomputing the medians. Integer throughout. */
function applyGenomePolicy(agents, policy) {
    const N = agents.length;
    if (N === 0) return;

    const { tau, theta, phi, kappa, lambda } = policy || genePolicy(agents);

    // Collect a flat tau of WHOLE wealth from the theta "who pays" tax base. One-sided
    // theta: 0 -> everyone, 1 -> only the very richest. Signed theta: 0.5 -> everyone,
    // >0.5 -> tax the top (progressive), <0.5 -> tax the bottom (regressive). No empty-
    // fallback — an empty tax base simply collects nothing. Progressivity lives in the
    // eligibility line. Cooperators pay; defectors withhold and may be punished (due destroyed).
    const payers = wealthGate(agents, theta, false, false);
    let pot = 0;
    for (const a of payers) {
        const due = Math.min(a.stock, stochasticRound(tau * a.stock));
        if (due <= 0) continue;
        if (Math.random() < a.coop) { a.stock -= due; pot += due; }
        else if (Math.random() < lambda) { a.stock -= due; }
    }
    if (pot <= 0) return;

    // Hub (richest) keeps a share.
    if (kappa > 0) {
        const hub = agents.reduce((best, a) => (a.stock > best.stock ? a : best), agents[0]);
        const keep = Math.min(pot, stochasticRound(kappa * pot));
        hub.stock += keep;
        pot -= keep;
    }

    // Distribute: phi fraction by need (water-fill), the rest equally.
    const needs = Math.min(pot, stochasticRound(phi * pot));
    const equal = pot - needs;
    if (equal > 0) {
        const share = Math.floor(equal / N);
        let rem = equal - share * N;
        agents.forEach(a => a.stock += share);
        while (rem-- > 0) agents[randomInt(N)].stock += 1;
    }
    if (needs > 0) pourWaterFill(agents, needs);
}

/** Distribute `units` integer units into the lowest stocks first (level the floor). */
function pourWaterFill(agents, units) {
    const order = [...agents].sort((x, y) => x.stock - y.stock);
    const n = order.length;
    while (units > 0) {
        const minH = order[0].stock;
        let width = 1;
        while (width < n && order[width].stock === minH) width++;
        if (width === n) {
            let j = 0;
            while (units-- > 0) order[j++ % n].stock += 1;
            return;
        }
        const rise = order[width].stock - minH;
        const cost = rise * width;
        if (cost <= units) {
            for (let j = 0; j < width; j++) order[j].stock = order[width].stock;
            units -= cost;
        } else {
            const step = Math.floor(units / width);
            for (let j = 0; j < width; j++) order[j].stock += step;
            units -= step * width;
            let j = 0;
            while (units-- > 0) order[j++ % width].stock += 1;
            return;
        }
    }
}

/** Pick an agent with probability ∝ stock^β, β = PARAMETERS.birthWealthBias (or the
 *  passed `beta`). β=0 → uniform (wealth-blind); β=1 → linear in stock; β>1 → steeper
 *  in favour of the wealthy. Scale-invariant (depends only on wealth ratios). Falls
 *  back to uniform if the weights sum to 0 (e.g. everyone fed but broke). */
function pickByStock(agents, beta) {
    const b = beta == null ? PARAMETERS.birthWealthBias : beta;
    if (b <= 0) return agents[randomInt(agents.length)];
    let total = 0;
    for (const a of agents) total += Math.pow(a.stock, b);
    if (total <= 0) return agents[randomInt(agents.length)];
    let r = Math.random() * total;
    for (const a of agents) { r -= Math.pow(a.stock, b); if (r < 0) return a; }
    return agents[agents.length - 1];
}

/** Normalized [0,1] distance between an agent's policy genes and a village policy.
 *  Includes the franchise gene psi: an agent is a "misfit" if it disagrees about
 *  who should vote as well as about the economic policy. */
function policyDistance(a, pol) {
    return Math.sqrt(policyDistanceSq(a, pol)) / Math.sqrt(6);
}

/** The un-normalized SUM OF SQUARES behind policyDistance. sqrt and the /√6 scaling are
 *  monotonic, so for merely RANKING neighbours (bestFitNeighbor) the squared form gives
 *  the same argmin at a fraction of the cost — dropping a sqrt from the hot migration
 *  path. Use policyDistance where the actual [0,1] value is needed (the misfit probability). */
function policyDistanceSq(a, pol) {
    return (a.tau - pol.tau) ** 2 + (a.theta - pol.theta) ** 2 + (a.phi - pol.phi) ** 2 +
           (a.kappa - pol.kappa) ** 2 + (a.lambda - pol.lambda) ** 2 + (a.psi - pol.psi) ** 2;
}

/** Soft carrying-capacity. Probability a birth succeeds, declining linearly from 1 at
 *  pop 1 to 0 at pop >= cap. Replaces the hard cap on reproduction: a full village simply
 *  stops reproducing (no offspring, no resources/points spent) and resumes as deaths open
 *  room — instead of a cliff at cap + fission. Applied to BOTH group and individual births. */
function birthProb(pop) {
    const cap = PARAMETERS.cap;
    return cap > 1 ? Math.max(0, Math.min(1, (cap - pop) / (cap - 1))) : 0;
}

class Village {
    constructor(row, col, agents) {
        this.row = row;
        this.col = col;
        this.agents = agents || [];
        this.growthPoints = 0;
        // Constitution (termed voting): the frozen enacted policy, the tick it was elected,
        // and its term T in ticks. Null until the first step elects one; T=1 re-votes each tick.
        this.constitution = null;
        this.electedAt = 0;
        this.term = 1;
    }

    get pop() { return this.agents.length; }

    /** The enacted policy = per-gene median of the enfranchised residents (Model V
     *  vote). Passes the cached policy so mode B's franchise line is last tick's psi. */
    enactedPolicy() {
        return genePolicy(this.agents, this.policy);
    }

    /** One within-village tick: gather -> redistribute -> consume -> score -> die.
     *  The enacted policy is computed once here and cached on `this.policy` for
     *  reuse by drawing, migration, and data collection this tick. */
    step(worldTick) {
        this.agents.forEach(a => a.gather());
        // Constitution: re-vote only when the term has elapsed (or at founding / if no tick
        // is threaded). Between elections the frozen constitution is applied to the evolving
        // economy — institutional hysteresis. T=1 re-votes every tick == the original
        // continuous Model V. Mode-B franchise gates on the sitting constitution's psi, so
        // entrenchment now spans the whole term, not just tick-to-tick.
        if (this.constitution == null || worldTick == null || (worldTick - this.electedAt) >= this.term) {
            this.constitution = genePolicy(this.agents, this.constitution);
            this.electedAt = worldTick == null ? 0 : worldTick;
            this.term = electedTerm(this.constitution);
        }
        this.policy = this.constitution;   // enacted policy this tick = the (frozen) constitution
        applyGenomePolicy(this.agents, this.policy);
        this.agents.forEach(a => a.consume());

        // +1 growth point per needs-met (un-starved) villager this tick.
        this.growthPoints += this.agents.reduce((s, a) => s + (a.starved ? 0 : 1), 0);

        this.applyDeaths();
        this.individualBirths();
    }

    /** Individual-level fecundity: every surviving agent rich enough spends
     *  `individualBirthThreshold` stock to spawn one child of its own this tick
     *  (outside the village growth-point budget). Bounded by the carrying capacity
     *  `cap` so it can't run away (newborns are eligible again next tick). Threshold
     *  0 disables it. */
    individualBirths() {
        const th = PARAMETERS.individualBirthThreshold;
        if (th <= 0) return;
        const parents = this.agents.filter(a => a.stock >= th);   // snapshot: newborns don't breed this tick
        for (const a of parents) {
            // Soft cap: breed with prob birthProb(pop); on failure keep the stock (bank it).
            if (Math.random() >= birthProb(this.agents.length)) continue;
            a.stock -= th;
            this.agents.push(a.spawnChild());
        }
    }

    /** Remove the dead: starvation hazard for the unfed, plus background mortality. */
    applyDeaths() {
        const sd = PARAMETERS.starveDeathChance;
        const bd = PARAMETERS.deathChance;
        this.agents = this.agents.filter(a =>
            !((a.starved && Math.random() < sd) || Math.random() < bd));
    }
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { applyGenomePolicy, pourWaterFill, policyDistance, policyDistanceSq, pickByStock, birthProb, Village };
}
