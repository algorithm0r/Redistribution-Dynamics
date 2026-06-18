/**
 * Observer — on-canvas visualization of a run: a grid of agents coloured by
 * stock, a text readout, and live graphs of Gini, stock, and hunger plus a
 * stock-distribution heat-strip. Reads straight from the DataManager's series.
 */
class Observer {
    constructor(population, dataManager) {
        this.population = population;
        this.dataManager = dataManager;

        const dm = dataManager;
        const gx = 1350, gw = 600, gh = 130;
        this.graphs = [
            new Graph(gx, 40,  gw, gh, [dm.giniTimeSeries], "Stock Gini", 0, 1, false),
            new Graph(gx, 210, gw, gh, [dm.avgStockTimeSeries, dm.maxStockTimeSeries], "Avg / Max Stock", 0, 0, true),
            new Graph(gx, 380, gw, gh, [dm.hungerTimeSeries], "Cumulative Hunger", 0, 0, true),
            new Graph(gx, 550, gw, gh, [dm.avgPNoGatherTimeSeries, dm.avgPNoConsumeTimeSeries],
                      "Avg traits: pNoGather (red) / pNoConsume (green)", 0, 1, false, ["#BB0000", "#00AA00"]),
        ];
        this.histogram = new Histogram(gx, 740, dm.stockDistribution,
            { label: "Stock distribution (low -> high)", width: gw, height: 150 });
    }

    update() {}

    draw(ctx) {
        this.drawReadout(ctx);
        this.drawAgents(ctx);
        this.graphs.forEach(g => g.draw(ctx));
        if (this.dataManager.stockDistribution.length > 1) this.histogram.draw(ctx);
    }

    drawReadout(ctx) {
        const dm = this.dataManager;
        const last = arr => arr.length ? arr[arr.length - 1] : 0;
        ctx.fillStyle = "#222";
        ctx.font = "16px monospace";
        ctx.fillText(`Run: ${PARAMETERS.runName}   regime: ${PARAMETERS.regime}`, 20, 28);
        ctx.fillText(`Tick: ${this.population.tick} / ${PARAMETERS.epoch}`, 20, 50);
        ctx.fillText(`Gini: ${last(dm.giniTimeSeries).toFixed(3)}   ` +
                     `Avg stock: ${last(dm.avgStockTimeSeries).toFixed(1)}   ` +
                     `Hunger: ${last(dm.hungerTimeSeries)}`, 20, 72);
        if (PARAMETERS.evolveTraits) {
            ctx.fillText(`Deaths: ${this.population.deaths}   ` +
                         `pNoGather: ${last(dm.avgPNoGatherTimeSeries).toFixed(3)}   ` +
                         `pNoConsume: ${last(dm.avgPNoConsumeTimeSeries).toFixed(3)}`, 20, 94);
        }
    }

    drawAgents(ctx) {
        const agents = this.population.agents;
        const maxStock = Math.max(1, ...agents.map(a => a.stock));
        const cols = Math.ceil(Math.sqrt(agents.length));
        const cell = Math.min(28, Math.floor(1280 / cols));
        const x0 = 20, y0 = 120, r = Math.max(3, cell / 2 - 2);

        agents.forEach((a, i) => {
            const cx = x0 + (i % cols) * cell + cell / 2;
            const cy = y0 + Math.floor(i / cols) * cell + cell / 2;
            // hue 0 (red, empty) -> 120 (green, richest), relative to current max
            const hue = a.stock === 0 ? 0 : Math.round(120 * Math.min(1, a.stock / maxStock));
            ctx.fillStyle = a.stock === 0 ? "#c62828" : hsl(hue, 70, 50);
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, 2 * Math.PI);
            ctx.fill();
        });
    }
}
