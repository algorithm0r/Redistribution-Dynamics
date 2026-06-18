// Loads image assets before the simulation starts. Unused until a model needs
// sprites, but kept so main.js's downloadAll(callback) entry point is uniform.

class AssetManager {
    constructor() {
        this.successCount = 0;
        this.errorCount = 0;
        this.cache = [];
        this.downloadQueue = [];
    }

    queueDownload(path) {
        this.downloadQueue.push(path);
    }

    isDone() {
        return this.downloadQueue.length === this.successCount + this.errorCount;
    }

    downloadAll(callback) {
        if (this.downloadQueue.length === 0) setTimeout(callback, 10);
        for (let i = 0; i < this.downloadQueue.length; i++) {
            const img = new Image();
            const that = this;
            const path = this.downloadQueue[i];

            img.addEventListener("load", function () {
                that.successCount++;
                if (that.isDone()) callback();
            });
            img.addEventListener("error", function () {
                that.errorCount++;
                if (that.isDone()) callback();
            });

            img.src = path;
            this.cache[path] = img;
        }
    }

    getAsset(path) {
        return this.cache[path];
    }
}
