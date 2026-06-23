/**
 * Model V — village layer.
 *
 * `applyGenomePolicy` / `pourWaterFill` are the within-village redistribution
 * (shared with the single-population `genome` regime). `Village` wraps a
 * population in a grid cell and runs its per-tick economy; the grid-level
 * dynamics (reproduction, fission, extinction, migration) live in World.
 */

/** The enacted policy = per-gene median of the population (Model V voting). */
function genePolicy(agents) {
    if (agents.length === 0) return { tau: 0, theta: 0, phi: 0, kappa: 0, lambda: 0 };
    return {
        tau: median(agents.map(a => a.tau)),
        theta: median(agents.map(a => a.theta)),
        phi: median(agents.map(a => a.phi)),
        kappa: median(agents.map(a => a.kappa)),
        lambda: median(agents.map(a => a.lambda)),
    };
}

/** Apply the genome-encoded redistribution policy to one population, in place.
 *  Pass a precomputed `policy` to avoid recomputing the medians. Integer throughout. */
function applyGenomePolicy(agents, policy) {
    const N = agents.length;
    if (N === 0) return;

    const { tau, theta, phi, kappa, lambda } = policy || genePolicy(agents);

    // Collect on a progressive bracket; cooperators pay, defectors withhold and
    // may be punished (their due destroyed).
    const R = agents.reduce((m, a) => Math.max(m, a.stock), 0);
    const threshold = theta * R;
    let pot = 0;
    for (const a of agents) {
        let due = stochasticRound(tau * Math.max(0, a.stock - threshold));
        due = Math.min(due, a.stock);
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

/** Normalized [0,1] distance between an agent's policy genes and a village policy. */
function policyDistance(a, pol) {
    const d = Math.sqrt(
        (a.tau - pol.tau) ** 2 + (a.theta - pol.theta) ** 2 + (a.phi - pol.phi) ** 2 +
        (a.kappa - pol.kappa) ** 2 + (a.lambda - pol.lambda) ** 2);
    return d / Math.sqrt(5);
}

class Village {
    constructor(row, col, agents) {
        this.row = row;
        this.col = col;
        this.agents = agents || [];
        this.growthPoints = 0;
    }

    get pop() { return this.agents.length; }

    /** The enacted policy = per-gene median of the residents (Model V vote). */
    enactedPolicy() {
        return genePolicy(this.agents);
    }

    /** One within-village tick: gather -> redistribute -> consume -> score -> die.
     *  The enacted policy is computed once here and cached on `this.policy` for
     *  reuse by drawing, migration, and data collection this tick. */
    step() {
        this.agents.forEach(a => a.gather());
        this.policy = genePolicy(this.agents);
        applyGenomePolicy(this.agents, this.policy);
        this.agents.forEach(a => a.consume());

        // +1 growth point per needs-met (un-starved) villager this tick.
        this.growthPoints += this.agents.reduce((s, a) => s + (a.starved ? 0 : 1), 0);

        this.applyDeaths();
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
    module.exports = { applyGenomePolicy, pourWaterFill, policyDistance, Village };
}
