/**
 * Agent — a participant in exchanges (worker, employer, buyer, seller, ...).
 *
 * STUB awaiting Model 1 (see DEVPLAN.md). Model 1 will define an agent's state
 * (what it holds and remembers) and its update() (how it acts each tick).
 */
class Agent {
    constructor() {
        this.id = PARAMETERS.idCounter++;
        // Model 1: agent state goes here.
    }

    /** One step of agent behaviour. Defined by Model 1. */
    update() {
        // Model 1: decide whether to enter an exchange and on what terms.
    }

    draw(ctx) {}
}
