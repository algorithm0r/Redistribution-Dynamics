/**
 * Observer — owns the on-canvas visualization of a run: agent rendering plus any
 * live graphs/histograms. The placeholder below just reports run progress so the
 * bare framework shows something; Model 1 replaces it with a real visualization.
 */
class Observer {
    constructor(population, dataManager) {
        this.population = population;
        this.dataManager = dataManager;
        // Model 1: construct Graph / Histogram instances here, e.g.
        //   this.popGraph = new Graph(x, y, w, h, [series], "Population", 0, 0);
    }

    update() {}

    draw(ctx) {
        const living = this.population.agents.filter(a => a).length;
        ctx.fillStyle = "#222";
        ctx.font = "16px monospace";
        ctx.fillText(`Run: ${PARAMETERS.runName}`, 20, 30);
        ctx.fillText(`Tick: ${this.population.tick} / ${PARAMETERS.epoch}`, 20, 52);
        ctx.fillText(`Agents: ${living}`, 20, 74);
        ctx.fillStyle = "#888";
        ctx.font = "13px monospace";
        ctx.fillText("Bare framework — awaiting Model 1 (see DEVPLAN.md)", 20, 104);

        if (this.dataManager) this.dataManager.draw(ctx);
    }
}
