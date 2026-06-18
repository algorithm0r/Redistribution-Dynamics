/**
 * Collects per-run statistics and ships them to the database.
 *
 * Contract with Population:
 *   - update() is called once per tick. It samples every reportingPeriod ticks.
 *   - It returns true exactly once, when the run is complete (epoch reached or a
 *     model-defined termination), after sending the data packet. Population uses
 *     that signal to advance to the next run.
 *
 * The framework plumbing (sampling cadence, termination, packet send) is fixed;
 * Model 1 fills in record()'s time-series and lists them in sendDataToServer().
 */
class DataManager {
    constructor(population) {
        this.population = population;
        this.agents = population.agents;

        this.tick = 0;
        this.reportingPeriod = PARAMETERS.reportingPeriod;

        // Model 1: declare time-series arrays here, e.g.
        //   this.populationTimeSeries = [];
    }

    /** Sample statistics for the current reporting period. Filled by Model 1. */
    record() {
        // Model 1: push this period's statistics into the time-series arrays.
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

    /** Termination test. Default: fixed epoch. Model 1 may add absorbing states. */
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
                // Model 1: include recorded time-series here, e.g.
                //   population: this.populationTimeSeries,
            },
        };
        if (typeof socket !== "undefined" && socket) {
            socket.emit("insert", packet);
            console.log("Data sent:", PARAMETERS.runName);
        }
    }

    draw(ctx) {}
}
