/**
 * Agent — a participant in exchanges. It holds a resource stock and does two
 * things per tick: gather (production) and consume (need). Both can
 * stochastically not happen, governed by per-agent heritable traits seeded from
 * the global defaults: pNoGather (the bane) and pNoConsume (the boon).
 *
 * In Mode 1 every agent shares the global trait values, so nothing evolves. When
 * PARAMETERS.evolveTraits is on, a starving agent dies and is replaced by a
 * mutated offspring of a survivor, so the traits evolve under selection.
 */
class Agent {
    constructor() {
        this.id = PARAMETERS.idCounter++;
        this.stock = PARAMETERS.initialStock;
        this.hungerCount = 0;
        this.starved = false;   // went hungry with empty stock this tick

        // Heritable traits (seeded from the global defaults).
        this.pNoGather = PARAMETERS.pNoGather;     // bane: chance to fail gathering
        this.pNoConsume = PARAMETERS.pNoConsume;   // boon: chance to skip consuming

        // Model 2 social genome (used by the 'genome' regime; see DEVPLAN.md).
        // Five policy genes (voted into the village policy) + one behavioral gene.
        this.tau = PARAMETERS.tau;       // preferred collection rate
        this.theta = PARAMETERS.theta;   // preferred progressivity (exempt below theta*richest)
        this.phi = PARAMETERS.phi;       // preferred distribution: equal (0) <-> neediest (1)
        this.kappa = PARAMETERS.kappa;   // preferred hub retention (centralization)
        this.lambda = PARAMETERS.lambda; // preferred punishment: chance a defector's due is destroyed
        this.coop = PARAMETERS.coop;     // behavioral: chance to actually pay in when asked

        // When coupled, the two traits are one gene held equal (so the boon and
        // bane can't diverge); seed both from their average. Net drift is then 0.
        if (PARAMETERS.evolveTraits && PARAMETERS.coupleTraits) {
            this.pNoGather = this.pNoConsume = (this.pNoGather + this.pNoConsume) / 2;
        }
    }

    /** Production: add 1 to stock unless gathering fails this tick (the bane). */
    gather() {
        this.starved = false;
        if (Math.random() >= this.pNoGather) this.stock += 1;
    }

    /**
     * Need: remove 1 from stock unless consumption is skipped this tick (the
     * boon). If the agent needs to consume but has nothing, it goes hungry — and
     * under evolution that hunger is fatal (flagged via `starved`).
     */
    consume() {
        if (Math.random() < this.pNoConsume) return;   // no need this tick
        if (this.stock > 0) this.stock -= 1;
        else { this.hungerCount += 1; this.starved = true; }
    }

    /**
     * A mutated offspring. The boon/bane traits are inherited unchanged (frozen
     * environment); the social genome (tau,theta,phi,kappa,lambda,coop) is
     * inherited with Gaussian mutation — this is what evolves under selection.
     */
    spawnChild() {
        const child = new Agent();
        const m = () => generateNormalSample(0, PARAMETERS.mutationStdev);

        child.pNoGather = this.pNoGather;     // frozen
        child.pNoConsume = this.pNoConsume;   // frozen

        child.tau    = clamp01(this.tau + m());
        child.theta  = clamp01(this.theta + m());
        child.phi    = clamp01(this.phi + m());
        child.kappa  = clamp01(this.kappa + m());
        child.lambda = clamp01(this.lambda + m());
        child.coop   = clamp01(this.coop + m());
        return child;
    }

    draw(ctx) {}
}
