/**
 * Generic helpers shared across simulations (from the games-class framework).
 * Nothing here is domain-specific.
 */

/**
 * @param {Number} n
 * @returns Random integer in [0, n-1]
 */
const randomInt = n => Math.floor(Math.random() * n);

/**
 * Box-Muller transform.
 * @returns A normally-distributed sample with the given mean and std dev.
 */
const generateNormalSample = (mean = 0, stdDev = 1) => {
    const u1 = Math.random();
    const u2 = Math.random();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return z0 * stdDev + mean;
};

/** Clamp a number into [0, 1]. */
const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Round x to an integer stochastically: floor(x), plus 1 with prob = frac(x).
 *  Keeps integer stocks while honouring continuous rates in expectation. */
const stochasticRound = x => {
    const f = Math.floor(x);
    return f + (Math.random() < x - f ? 1 : 0);
};

/** Median of a numeric array (0 if empty). */
const median = arr => {
    if (arr.length === 0) return 0;
    const s = [...arr].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** @returns String usable as an rgb web color */
const rgb = (r, g, b) => `rgb(${r}, ${g}, ${b})`;

/** @returns String usable as an rgba web color */
const rgba = (r, g, b, a) => `rgba(${r}, ${g}, ${b}, ${a})`;

/** @returns String usable as an hsl web color */
const hsl = (h, s, l) => `hsl(${h}, ${s}%, ${l}%)`;

/** @returns Euclidean distance between two {x, y} points */
const distance = (p1, p2) => Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);

/** Alias for requestAnimationFrame with old-browser fallback. */
window.requestAnimFrame = (() => {
    return window.requestAnimationFrame ||
        window.webkitRequestAnimationFrame ||
        window.mozRequestAnimationFrame ||
        window.oRequestAnimationFrame ||
        window.msRequestAnimationFrame ||
        ((callback, element) => window.setTimeout(callback, 1000 / 60));
})();

/** Trigger a client-side text-file download. */
function download(filename, text) {
    const pom = document.createElement('a');
    pom.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
    pom.setAttribute('download', filename);
    pom.click();
}

function databaseConnected() {
    const dbDiv = document.getElementById("db");
    if (!dbDiv) return;
    dbDiv.classList.remove("db-disconnected");
    dbDiv.classList.add("db-connected");
}

function databaseDisconnected() {
    const dbDiv = document.getElementById("db");
    if (!dbDiv) return;
    dbDiv.classList.remove("db-connected");
    dbDiv.classList.add("db-disconnected");
}
