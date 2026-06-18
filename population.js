/**
 * Population — the top-level simulation entity registered with the GameEngine.
 * It owns the agents, advances them each tick, and drives data collection and
 * visualization. Per-tick population-level dynamics (matching, market clearing,
 * entry/exit, interventions) are added here by Model 1.
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
    }

    update() {
        this.agents.forEach(agent => agent?.update());

        // Model 1: population-level dynamics (matching, clearing, entry/exit) here.

        this.tick++;
        if (this.dataManager.update()) loadNextRunParameters();
    }

    draw(ctx) {
        this.observer.draw(ctx);
    }
}
