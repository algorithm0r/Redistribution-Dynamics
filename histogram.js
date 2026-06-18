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
            const total = snapshot.reduce((acc, x) => acc + x, 0);
            for (let j = 0; j < snapshot.length; j++) {
                this.fill(snapshot[j] / total, i, snapshot.length - 1 - j);
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

    fill(share, x, y) {
        let c = share * 99 + 1;
        c = 511 - Math.floor(Math.log(c) / Math.log(100) * 512);
        if (c > 255) {
            c = c - 256;
            this.ctx.fillStyle = rgb(c, c, 255);
        } else {
            this.ctx.fillStyle = rgb(0, 0, c);
        }
        const width = 1;
        const height = Math.floor(this.height / 20);
        this.ctx.fillRect(this.x + x * width, this.y + y * height, width, height);
    }
}
