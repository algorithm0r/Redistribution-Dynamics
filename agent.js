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
        // Six policy genes (voted into the village policy) + one behavioral gene + one
        // inert null tracer.
        this.tau = PARAMETERS.tau;       // preferred collection rate
        this.theta = PARAMETERS.theta;   // preferred progressivity (exempt below theta*richest)
        this.phi = PARAMETERS.phi;       // preferred distribution: equal (0) <-> neediest (1)
        this.kappa = PARAMETERS.kappa;   // preferred hub retention (centralization)
        this.lambda = PARAMETERS.lambda; // preferred punishment: chance a defector's due is destroyed
        this.psi = PARAMETERS.psi;       // preferred franchise: who votes (0 everyone <-> 1 only the wealthiest)
        this.coop = PARAMETERS.coop;     // behavioral: chance to actually pay in when asked
        // Inert tracer: mutates and is recorded exactly like a real gene but is read by
        // NO dynamics (not voted, not redistributed, not in migration/fitness). It is the
        // null baseline — whatever omega does under a regime is pure drift/draft, so any
        // real gene that merely tracks omega is drifting, not being selected. See DEVPLAN.
        this.omega = PARAMETERS.omega;
        // Constitutional TERM meta-gene: preferred election period. In franchise modes it is
        // voted into the village's constitution term T (median term gene -> ticks via
        // [0,1] -> [1, termMax]); under franchiseMode 'off' T is the fixed
        // PARAMETERS.constitutionTerm and term drifts inert (recorded like omega). Sibling of
        // psi: psi is *who* decides, term is *how often* they decide. See DEVPLAN 'Constitutions'.
        this.term = PARAMETERS.term;

        // When coupled, the two traits are one gene held equal (so the boon and
        // bane can't diverge); seed both from their average. Net drift is then 0.
        if (PARAMETERS.evolveTraits && PARAMETERS.coupleTraits) {
            this.pNoGather = this.pNoConsume = (this.pNoGather + this.pNoConsume) / 2;
        }
    }

    /** Replace the social genome with uniform-random values (founder diversity). */
    randomizeGenome() {
        this.tau = Math.random();
        this.theta = Math.random();
        this.phi = Math.random();
        this.kappa = Math.random();
        this.lambda = Math.random();
        this.psi = Math.random();
        this.coop = Math.random();
        this.omega = Math.random();
        this.term = Math.random();
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
     * An ASEXUAL mutated offspring (one parent). The boon/bane traits are inherited
     * unchanged (frozen environment); every social gene (tau,theta,phi,kappa,lambda,
     * psi,coop) plus the inert omega tracer is inherited with Gaussian mutation. With
     * one parent the whole genome is inherited as a block — complete linkage — so a
     * selective sweep at one locus drags every other locus (including neutral ones)
     * along with it (genetic draft). `breedWith` breaks that linkage.
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
        child.psi    = clamp01(this.psi + m());
        child.coop   = clamp01(this.coop + m());
        child.omega  = clamp01(this.omega + m());
        child.term   = clamp01(this.term + m());
        return child;
    }

    /**
     * A SEXUAL offspring of `this` and `mate`: each gene is inherited independently
     * from one parent or the other with equal probability (free recombination /
     * independent assortment), then the social genome is mutated. Because loci
     * re-assort each generation, a neutral gene no longer rides along with a selected
     * one — this is the recombination that dissolves genetic draft. The frozen
     * boon/bane pair is taken together from a single parent so a coupled pair stays
     * coupled.
     */
    breedWith(mate) {
        const child = new Agent();
        const m = () => generateNormalSample(0, PARAMETERS.mutationStdev);
        const from = key => (Math.random() < 0.5 ? this : mate)[key];   // independent per gene

        const boonParent = Math.random() < 0.5 ? this : mate;   // keep boon/bane together
        child.pNoGather = boonParent.pNoGather;                  // frozen
        child.pNoConsume = boonParent.pNoConsume;                // frozen

        child.tau    = clamp01(from('tau')    + m());
        child.theta  = clamp01(from('theta')  + m());
        child.phi    = clamp01(from('phi')    + m());
        child.kappa  = clamp01(from('kappa')  + m());
        child.lambda = clamp01(from('lambda') + m());
        child.psi    = clamp01(from('psi')    + m());
        child.coop   = clamp01(from('coop')   + m());
        child.omega  = clamp01(from('omega')  + m());
        child.term   = clamp01(from('term')   + m());
        return child;
    }

    draw(ctx) {}
}

/**
 * Produce one child of `parent`, drawn from `pool` (its village's fed residents).
 * With probability PARAMETERS.pSexual the birth is sexual — `parent` recombines with
 * a distinct random mate from the pool (`breedWith`); otherwise it's an asexual clone
 * (`spawnChild`). A 50/50 mix (pSexual = 0.5) is the usual setting; pSexual = 0 is the
 * original all-asexual model. Self-breeding (individual birth) and founder cloning stay
 * asexual by nature and don't route through here. Free function: it uses no `this`.
 */
function reproduce(parent, pool) {
    if (PARAMETERS.pSexual > 0 && pool && pool.length > 1 && Math.random() < PARAMETERS.pSexual) {
        let mate = parent;
        for (let i = 0; i < 8 && mate === parent; i++) mate = pool[randomInt(pool.length)];
        if (mate !== parent) return parent.breedWith(mate);
    }
    return parent.spawnChild();
}
