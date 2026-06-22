// Game shell modified from Seth Ladd's "Bad Aliens" game (Google IO 2011).
// Generic entity loop: holds entities, updates and draws each frame.

class GameEngine {
    constructor(options) {
        this.ctx = null;
        this.entities = [];

        // Input state
        this.click = null;
        this.mouse = null;
        this.wheel = null;
        this.rightclick = null;
        this.keys = {};
        this.fps = 0;

        this.options = options || { debugging: false };
    }

    init(ctx) {
        this.ctx = ctx;
        this.startInput();
        this.timer = new Timer();
    }

    start() {
        this.running = true;
        const gameLoop = () => {
            this.loop();
            requestAnimFrame(gameLoop, this.ctx.canvas);
        };
        gameLoop();
    }

    startInput() {
        const getXandY = e => ({
            x: e.clientX - this.ctx.canvas.getBoundingClientRect().left,
            y: e.clientY - this.ctx.canvas.getBoundingClientRect().top
        });

        this.ctx.canvas.addEventListener("mousemove", e => this.mouse = getXandY(e));
        this.ctx.canvas.addEventListener("click", e => this.click = getXandY(e));
        this.ctx.canvas.addEventListener("wheel", e => { e.preventDefault(); this.wheel = e; });
        this.ctx.canvas.addEventListener("contextmenu", e => { e.preventDefault(); this.rightclick = getXandY(e); });
        this.ctx.canvas.addEventListener("keydown", e => this.keys[e.key] = true);
        this.ctx.canvas.addEventListener("keyup", e => this.keys[e.key] = false);
    }

    addEntity(entity) {
        this.entities.push(entity);
    }

    draw() {
        this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
        for (let i = 0; i < this.entities.length; i++) {
            this.entities[i].draw(this.ctx, this);
        }
    }

    update() {
        const entitiesCount = this.entities.length;
        for (let i = 0; i < entitiesCount; i++) {
            const entity = this.entities[i];
            if (!entity.removeFromWorld) entity.update();
        }
        for (let i = this.entities.length - 1; i >= 0; --i) {
            if (this.entities[i].removeFromWorld) this.entities.splice(i, 1);
        }
    }

    loop() {
        this.clockTick = this.timer.tick();
        let loops = PARAMETERS.updatesPerDraw || 1;
        while (loops-- > 0) this.update();
        this.draw();
        this.drawFPS();
        this.click = null;
    }

    drawFPS() {
        const dt = this.timer.wallDelta || 0.016;
        const inst = dt > 0 ? 1 / dt : 0;
        this.fps = this.fps ? this.fps * 0.9 + inst * 0.1 : inst;   // smoothed
        const ctx = this.ctx;
        ctx.save();
        ctx.fillStyle = "#000";
        ctx.font = "14px monospace";
        ctx.textAlign = "right";
        ctx.fillText(`${this.fps.toFixed(0)} fps`, ctx.canvas.width - 8, 18);
        ctx.restore();
    }
}
