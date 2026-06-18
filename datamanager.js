/**
 * Collects per-run statistics and ships them to the database.
 *
 * Contract with Population:
 *   - update() is called once per tick. It samples every reportingPeriod ticks.
 *   - It returns true exactly once, when the run is complete (epoch reached),
 *     after sending the data packet. Population uses that signal to advance runs.
 *
 * Stage 1 metrics: stock inequality (Gini), avg/max stock, cumulative hunger,
 * and a stock distribution snapshot.
 */
class DataManager {
    constructor(population) {
        this.population = population;
        this.agents = population.agents;

        this.tick = 0;
        this.reportingPeriod = PARAMETERS.reportingPeriod;

        this.giniTimeSeries = [];
        this.avgStockTimeSeries = [];
        this.maxStockTimeSeries = [];
        this.minStockTimeSeries = [];
        this.hungerTimeSeries = [];       // cumulative hunger events across agents
        this.stockDistribution = [];      // per-period histogram of stock buckets

        this.gini = 0;
    }

    calculateGini(values) {
        const n = values.length;
        if (n === 0) return 0;
        const sorted = [...values].sort((a, b) => a - b);
        const total = sorted.reduce((sum, v) => sum + v, 0);
        if (total === 0) return 0;
        const numerator = 2 * sorted.reduce((sum, v, i) => sum + (i + 1) * v, 0) - (n + 1) * total;
        return numerator / (n * total);
    }

    record() {
        const stocks = this.agents.map(a => a.stock);
        const n = stocks.length;
        const total = stocks.reduce((sum, s) => sum + s, 0);

        this.gini = this.calculateGini(stocks);
        this.giniTimeSeries.push(this.gini);
        this.avgStockTimeSeries.push(n > 0 ? total / n : 0);
        this.maxStockTimeSeries.push(stocks.reduce((m, s) => Math.max(m, s), 0));
        this.minStockTimeSeries.push(stocks.reduce((m, s) => Math.min(m, s), Infinity));
        this.hungerTimeSeries.push(this.agents.reduce((sum, a) => sum + a.hungerCount, 0));

        // 20-bucket histogram, bucket width relative to the starting stock.
        const counts = new Array(20).fill(0);
        const bucketSize = Math.max(1, PARAMETERS.initialStock / 5);
        stocks.forEach(s => {
            const index = Math.min(19, Math.floor(s / bucketSize));
            counts[index]++;
        });
        this.stockDistribution.push(counts);
    }

    /** @returns true when the run is finished (caller should advance runs). */
    update() {
        if (this.tick++ % this.reportingPeriod === 0) {
            this.record();
            if (this.runComplete()) {
                this.sendDataToServer();
                return true;
            }
        }
        return false;
    }

    runComplete() {
        return this.tick >= PARAMETERS.epoch;
    }

    sendDataToServer() {
        const packet = {
            db: PARAMETERS.db,
            collection: PARAMETERS.collection,
            data: {
                run: PARAMETERS.runName,
                parameters: Object.assign({}, PARAMETERS),
                gini: this.giniTimeSeries,
                avgStock: this.avgStockTimeSeries,
                maxStock: this.maxStockTimeSeries,
                minStock: this.minStockTimeSeries,
                hunger: this.hungerTimeSeries,
                stockDistribution: this.stockDistribution,
            },
        };
        if (typeof socket !== "undefined" && socket) {
            socket.emit("insert", packet);
            console.log("Data sent:", PARAMETERS.runName);
        }
    }

    draw(ctx) {}
}
