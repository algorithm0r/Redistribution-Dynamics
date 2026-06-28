// Generic distribution heat-strip: `data` is an array of snapshots, each snapshot
// an array of bucket counts. Time runs along x; buckets stack along y; colour
// encodes (log-scaled) share of the snapshot total.

class Histogram {
    constructor(x, y, data, options) {
        this.x = x;
        this.y = y;
        this.data = data;

        const defaults = { label: "", width: 1000, height: 100 };
        Object.assign(this, defaults, options);

        this.ctx = gameEngine.ctx;
        this.maxVal = 0;
    }

    update() {}

    draw(ctx) {
        this.ctx.save();
        const length = this.data.length > this.width ? Math.floor(this.width) : this.data.length;
        const start = this.data.length > this.width ? this.data.length - this.width : 0;

        for (let i = 0; i < length; i++) {
            const snapshot = this.data[i + start];
            const nb = snapshot.length;
            const total = snapshot.reduce((acc, x) => acc + x, 0);
            for (let j = 0; j < nb; j++) {
                this.fill(snapshot[j] / total, i, nb - 1 - j, nb);
            }
        }

        // Optional white line tracing a per-snapshot mean value in [0,1] (high at top).
        if (this.means && this.means.length > 1) {
            this.ctx.strokeStyle = "#ffffff";
            this.ctx.lineWidth = 1.5;
            this.ctx.beginPath();
            for (let i = 0; i < length; i++) {
                const m = this.means[i + start];
                const px = this.x + i;
                const py = this.y + (1 - m) * this.height;
                if (i === 0) this.ctx.moveTo(px, py); else this.ctx.lineTo(px, py);
            }
            this.ctx.stroke();
        }

        // Optional extra coloured lines, each {values:[0..1 per snapshot], color}.
        // Used to trace subgroup means (e.g. coop terciles) over the distribution.
        if (this.overlays) {
            for (const ov of this.overlays) {
                this.ctx.strokeStyle = ov.color;
                this.ctx.lineWidth = 1.5;
                this.ctx.beginPath();
                let started = false;
                for (let i = 0; i < length; i++) {
                    const m = ov.values[i + start];
                    if (m == null || isNaN(m)) { started = false; continue; }
                    const px = this.x + i, py = this.y + (1 - m) * this.height;
                    if (!started) { this.ctx.moveTo(px, py); started = true; }
                    else this.ctx.lineTo(px, py);
                }
                this.ctx.stroke();
            }
        }

        this.ctx.font = '10px Arial';
        this.ctx.fillStyle = "#000000";
        this.ctx.textAlign = "center";
        this.ctx.fillText(this.label, this.x + this.width / 2, this.y + this.height + 10);

        this.ctx.strokeStyle = "#000000";
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(this.x, this.y, this.width, this.height);
        this.ctx.restore();
    }

    fill(share, x, yIndex, nBuckets) {
        let c = share * 99 + 1;
        c = 511 - Math.floor(Math.log(c) / Math.log(100) * 512);
        if (c > 255) {
            c = c - 256;
            this.ctx.fillStyle = rgb(c, c, 255);
        } else {
            this.ctx.fillStyle = rgb(0, 0, c);
        }
        // Tile rows over the full height so no strip is left blank at the bottom.
        const top = Math.floor(yIndex * this.height / nBuckets);
        const bot = Math.floor((yIndex + 1) * this.height / nBuckets);
        this.ctx.fillRect(this.x + x, this.y + top, 1, bot - top);
    }
}
