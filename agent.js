/**
 * Agent — a participant in exchanges. In Stage 1 it holds a resource stock and
 * does two things per tick: gather (production) and consume (need). Both can
 * stochastically not happen, per the boon/bane parameters. Hunger is a
 * non-lethal counter in Mode 1.
 */
class Agent {
    constructor() {
        this.id = PARAMETERS.idCounter++;
        this.stock = PARAMETERS.initialStock;
        this.hungerCount = 0;   // cumulative ticks this agent went hungry
    }

    /** Production: add 1 to stock unless gathering fails this tick (the bane). */
    gather() {
        if (Math.random() >= PARAMETERS.pNoGather) this.stock += 1;
    }

    /**
     * Need: remove 1 from stock unless consumption is skipped this tick (the
     * boon). If the agent needs to consume but has nothing, it goes hungry.
     */
    consume() {
        if (Math.random() < PARAMETERS.pNoConsume) return;   // no need this tick
        if (this.stock > 0) this.stock -= 1;
        else this.hungerCount += 1;
    }

    draw(ctx) {}
}
