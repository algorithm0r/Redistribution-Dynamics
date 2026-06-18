/**
 * Population — the top-level simulation entity registered with the GameEngine.
 * It owns the agents and drives each tick in the Stage 1 order:
 *   gather -> redistribute (per regime) -> consume
 * so a transfer can prevent hunger the same tick.
 */
class Population {
    constructor() {
        this.agents = [];
        for (let i = 0; i < PARAMETERS.initialAgents; i++) {
            this.agents.push(new Agent());
        }

        this.dataManager = new DataManager(this);
        this.observer = new Observer(this, this.dataManager);
        this.tick = 0;
        this.deaths = 0;   // cumulative starvation deaths (evolution mode)
    }

    update() {
        this.agents.forEach(agent => agent.gather());
        this.redistribute();
        this.agents.forEach(agent => agent.consume());
        if (PARAMETERS.evolveTraits) this.replaceStarved();

        this.tick++;
        if (this.dataManager.update()) loadNextRunParameters();
    }

    /**
     * Evolution: every agent that starved this tick dies and is replaced in place
     * by a mutated offspring of a random survivor (keeping N fixed). If everyone
     * starved at once there is no survivor to reproduce from, so replacement is
     * skipped that tick.
     */
    replaceStarved() {
        const survivors = this.agents.filter(a => !a.starved);
        if (survivors.length === 0) return;
        for (let i = 0; i < this.agents.length; i++) {
            if (this.agents[i].starved) {
                const parent = survivors[randomInt(survivors.length)];
                this.agents[i] = parent.spawnChild();
                this.deaths++;
            }
        }
    }

    /** Apply the selected automatic redistribution rule for this tick. */
    redistribute() {
        switch (PARAMETERS.regime) {
            case "share": this.shareToNeed(); break;
            case "theft": this.theft();       break;
            case "pool":  this.equalPool();   break;
            case "none":
            default:      break;
        }
    }

    /**
     * Each agent with no stock takes 1 from the currently richest agent that has
     * surplus (stock > 1, so the donor keeps at least its own need). Nothing is
     * owed in return. If no donor has surplus, the needy agent stays empty.
     */
    shareToNeed() {
        const needy = this.agents.filter(a => a.stock === 0);
        for (const n of needy) {
            let donor = null;
            for (const a of this.agents) {
                if (a.stock > 1 && (donor === null || a.stock > donor.stock)) donor = a;
            }
            if (donor === null) break;   // no surplus left anywhere
            donor.stock -= 1;
            n.stock += 1;
        }
    }

    /**
     * Coercive variant of shareToNeed: each agent with no stock seizes 1 from a
     * *random* surplus-holder (stock > 1) rather than the richest. With
     * probability conflictChance the resource is destroyed in the taking — the
     * victim loses it but the taker gets nothing (and stays hungry this tick).
     */
    theft() {
        const needy = this.agents.filter(a => a.stock === 0);
        for (const n of needy) {
            const donors = this.agents.filter(a => a.stock > 1);
            if (donors.length === 0) break;
            const donor = donors[randomInt(donors.length)];
            donor.stock -= 1;
            if (Math.random() >= PARAMETERS.conflictChance) n.stock += 1;
            // else: resource lost to conflict
        }
    }

    /**
     * Pool all stock and split it equally. Integer shares; the remainder is
     * handed to random agents so the total is conserved exactly.
     */
    equalPool() {
        const N = this.agents.length;
        if (N === 0) return;
        const total = this.agents.reduce((sum, a) => sum + a.stock, 0);
        const share = Math.floor(total / N);
        let remainder = total - share * N;
        this.agents.forEach(a => a.stock = share);
        while (remainder-- > 0) this.agents[randomInt(N)].stock += 1;
    }

    draw(ctx) {
        this.observer.draw(ctx);
    }
}
