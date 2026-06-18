// Generic time-series line plot. `data` is an array of series (each an array of
// numbers); they are drawn together, auto-rescaling to fit unless resize=false.

class Graph {
    constructor(x, y, xSize, ySize, data, label, min, max, resize = true,
                colors = ["#00BB00", "#BB0000", "#00BBBB", "#CCCCCC"]) {
        this.x = x;
        this.y = y;
        this.data = data;
        this.label = label;
        this.resize = resize;
        this.xSize = xSize;
        this.ySize = ySize;
        this.ctx = gameEngine.ctx;
        this.colors = colors;
        this.minVal = min;
        this.maxVal = max;
    }

    update() {}

    draw(ctx) {
        if (this.resize) this.updateMinAndMax();

        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(this.x, this.y, this.xSize, this.ySize);
        this.ctx.clip();

        if (this.data && this.data.length > 0 && this.data[0].length > 1) {
            for (let j = 0; j < this.data.length; j++) {
                const data = this.data[j];
                this.ctx.strokeStyle = this.colors[j];
                this.ctx.lineWidth = 2;
                this.ctx.beginPath();

                let xPos = this.x;
                let yPos = data.length > this.xSize
                    ? this.y + this.ySize - Math.floor((data[data.length - this.xSize] - this.minVal) / (this.maxVal - this.minVal) * this.ySize)
                    : this.y + this.ySize - Math.floor((data[0] - this.minVal) / (this.maxVal - this.minVal) * this.ySize);
                this.ctx.moveTo(xPos, yPos);

                const length = data.length > this.xSize ? this.xSize : data.length;
                for (let i = 1; i < length; i++) {
                    const index = data.length > this.xSize ? data.length - this.xSize - 1 + i : i;
                    xPos++;
                    yPos = this.y + this.ySize - Math.floor((data[index] - this.minVal) / (this.maxVal - this.minVal) * this.ySize);
                    this.ctx.lineTo(xPos, yPos);
                }
                this.ctx.stroke();
                this.ctx.closePath();

                this.ctx.font = '10px Arial';
                this.ctx.fillStyle = "#000000";
                this.ctx.textAlign = "right";
                let value = data[data.length - 1];
                if (!Number.isInteger(value)) value = value.toFixed(2);
                this.ctx.fillText(value, this.x + this.xSize - 5, yPos + 10);
            }
        }

        this.ctx.restore();
        this.ctx.save();

        const firstTick = this.data[0].length > this.xSize ? this.data[0].length - this.xSize : 0;
        this.ctx.font = '10px Arial';
        this.ctx.fillStyle = "#000000";
        this.ctx.textAlign = "left";
        this.ctx.fillText(firstTick * PARAMETERS.reportingPeriod, this.x + 5, this.y + this.ySize + 8);
        this.ctx.textAlign = "right";
        this.ctx.fillText((this.data[0].length - 1) * PARAMETERS.reportingPeriod, this.x + this.xSize - 5, this.y + this.ySize + 8);
        this.ctx.textAlign = "center";
        this.ctx.fillText(this.label, this.x + this.xSize / 2, this.y + this.ySize + 8);

        this.ctx.restore();
        this.ctx.strokeStyle = "#000000";
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(this.x, this.y, this.xSize, this.ySize);
    }

    updateMinAndMax() {
        this.minVal = Math.min(this.minVal, ...[].concat(...this.data));
        this.maxVal = Math.max(this.maxVal, ...[].concat(...this.data));
    }
}
