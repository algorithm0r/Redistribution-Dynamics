/**
 * Generic helpers shared across simulations (from the games-class framework).
 * Nothing here is domain-specific.
 */

// ── Seedable RNG ────────────────────────────────────────────────────────────
// Every random draw in the sim goes through rand() (never Math.random() directly).
// With PARAMETERS.seed unset (null), rand() IS Math.random() — the original, unseeded
// behaviour, same call sequence. With a seed, rand() draws from sfc32 (Chris Doty-
// Humphrey's Small Fast Counter, 128-bit state, period ≥ 2^32 per cycle and ~2^127
// typical — mulberry32's 2^32 period is too short for a run that draws billions), so a
// run is reproducible from its stored PARAMETERS. seedRNG() is called once per run, at
// the top of the World / Population constructors.
//
// Separate STREAMS keep instrumentation from perturbing the trajectory:
//   'sim'    — the model (rand). Changing anything that draws from it changes the run.
//   'tracer' — inert tracers ω1..ωk, the linked/unlinked pair, lineage parent picks
//              (tracerRand). Turning tracers on leaves the real genes' trajectory intact.
//   'diag'   — diagnostic sampling, e.g. periodic population samples (diagRand).
// The tracer/diag streams are created lazily on first use, so a run that never uses them
// draws nothing extra. Unseeded, they are seeded once from Math.random().

/** FNV-1a over a string -> uint32. Seeds may be numbers or strings. */
function _fnv1a(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
}

/** sfc32 generator seeded from (seed, stream) via splitmix32; returns () -> [0, 1). */
function makeRNG(seed, stream) {
    let s = _fnv1a(String(seed) + '|' + (stream || 'sim'));
    const splitmix = () => {   // splitmix32: spreads one 32-bit seed over the 128-bit state
        s = (s + 0x9e3779b9) | 0;
        let z = s;
        z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
        z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
        return (z ^ (z >>> 16)) >>> 0;
    };
    let a = splitmix(), b = splitmix(), c = splitmix(), d = splitmix();
    const next = () => {
        const t = (((a + b) | 0) + d) | 0;
        d = (d + 1) | 0;
        a = b ^ (b >>> 9);
        b = (c + (c << 3)) | 0;
        c = (c << 21) | (c >>> 11);
        c = (c + t) | 0;
        return (t >>> 0) / 4294967296;
    };
    for (let i = 0; i < 15; i++) next();   // warm up past the seeding correlations
    return next;
}

let _rngSeed = null;     // the seed of the current run (null = unseeded)
let _rngSim = null;      // null -> Math.random
let _rngTracer = null;   // lazily created
let _rngDiag = null;     // lazily created

/** (Re)seed every stream for a new run. seed null/undefined/'' -> unseeded (Math.random). */
function seedRNG(seed) {
    _rngSeed = (seed === undefined || seed === null || seed === '') ? null : seed;
    _rngSim = _rngSeed === null ? null : makeRNG(_rngSeed, 'sim');
    _rngTracer = null;
    _rngDiag = null;
}

/** The sim stream: uniform [0, 1). Math.random() when unseeded. */
function rand() { return _rngSim === null ? Math.random() : _rngSim(); }

/** The tracer stream (inert genes / lineage): never touches the sim stream. */
function tracerRand() {
    if (_rngTracer === null) _rngTracer = makeRNG(_rngSeed === null ? Math.random() : _rngSeed, 'tracer');
    return _rngTracer();
}

/** The diagnostic stream (sampling for records): never touches the sim stream. */
function diagRand() {
    if (_rngDiag === null) _rngDiag = makeRNG(_rngSeed === null ? Math.random() : _rngSeed, 'diag');
    return _rngDiag();
}

/**
 * @param {Number} n
 * @returns Random integer in [0, n-1] (sim stream)
 */
const randomInt = n => Math.floor(rand() * n);

/**
 * Box-Muller transform.
 * @param r the uniform source (default: the sim stream)
 * @returns A normally-distributed sample with the given mean and std dev.
 */
const generateNormalSample = (mean = 0, stdDev = 1, r = rand) => {
    const u1 = r();
    const u2 = r();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return z0 * stdDev + mean;
};

/** Clamp a number into [0, 1]. */
const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Round x to an integer stochastically: floor(x), plus 1 with prob = frac(x).
 *  Keeps integer stocks while honouring continuous rates in expectation. */
const stochasticRound = x => {
    const f = Math.floor(x);
    return f + (rand() < x - f ? 1 : 0);
};

/** Median of a numeric array (0 if empty). */
const median = arr => {
    if (arr.length === 0) return 0;
    const s = [...arr].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Quickselect: reorder buf[lo..hi] so buf[k] holds the k-th smallest of that range
 *  (0-indexed), and return it. Three-way (Dutch-flag) partition so runs of equal
 *  values — a converged village where everyone shares a gene — stay O(n) instead of
 *  degrading to O(n²). Deterministic median-of-three pivot: no Math.random(), so the
 *  global RNG stream is untouched and simulation trajectories stay bit-identical. */
function quickSelect(buf, lo, hi, k) {
    while (lo < hi) {
        const mid = (lo + hi) >>> 1;   // median-of-three of buf[lo], buf[mid], buf[hi]
        let t;
        if (buf[mid] < buf[lo]) { t = buf[lo]; buf[lo] = buf[mid]; buf[mid] = t; }
        if (buf[hi] < buf[lo])  { t = buf[lo]; buf[lo] = buf[hi];  buf[hi] = t; }
        if (buf[hi] < buf[mid]) { t = buf[mid]; buf[mid] = buf[hi]; buf[hi] = t; }
        const pivot = buf[mid];
        let lt = lo, gt = hi, i = lo;   // [lo..lt-1] < pivot, [lt..gt] == pivot, [gt+1..hi] > pivot
        while (i <= gt) {
            const v = buf[i];
            if (v < pivot)      { buf[i] = buf[lt]; buf[lt] = v; lt++; i++; }
            else if (v > pivot) { buf[i] = buf[gt]; buf[gt] = v; gt--; }
            else i++;
        }
        if (k < lt) hi = lt - 1;
        else if (k > gt) lo = gt + 1;
        else return buf[k];            // k landed in the == band
    }
    return buf[k];
}

/** Median of buf[0..len-1] IN PLACE (reorders buf) via quickselect — matches median()
 *  exactly, including the even-length mean of the two central order statistics. Fill a
 *  reused buffer and call this to avoid the per-call map()+sort() allocations. */
function medianInPlace(buf, len) {
    if (len <= 0) return 0;
    const mid = len >>> 1;
    const hi = quickSelect(buf, 0, len - 1, mid);
    if (len & 1) return hi;                       // odd → the single middle element
    let lo = buf[0];                              // even → also the (mid-1)-th = max of buf[0..mid-1]
    for (let i = 1; i < mid; i++) if (buf[i] > lo) lo = buf[i];
    return (lo + hi) / 2;
}

/** Linear-interpolated quantile of a numeric array; q clamped to [0, 1]; 0 if empty.
 *  quantile(a, 0) = min, quantile(a, 1) = max, quantile(a, 0.5) = median. Unlike a
 *  fraction-of-max cutoff, it's a rank, so a single runaway value can't warp it. */
const quantile = (arr, q) => {
    if (arr.length === 0) return 0;
    const s = [...arr].sort((a, b) => a - b);
    const idx = clamp01(q) * (s.length - 1);
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (idx - lo);
};

/** @returns String usable as an rgb web color */
const rgb = (r, g, b) => `rgb(${r}, ${g}, ${b})`;

/** @returns String usable as an rgba web color */
const rgba = (r, g, b, a) => `rgba(${r}, ${g}, ${b}, ${a})`;

/** @returns String usable as an hsl web color */
const hsl = (h, s, l) => `hsl(${h}, ${s}%, ${l}%)`;

// ── Colour-vision-deficiency (CVD) safe palettes ────────────────────────────
// The old grid ramps were red→green, illegible to the ~8% of men with red/green
// CVD. These replace them everywhere colour encodes a value or a category.

/** Viridis colormap anchors (dark purple → blue → teal → green → yellow). It's
 *  perceptually uniform, CVD-safe (the discriminating endpoints purple/yellow read
 *  fine under red/green deficiency), and monotonic in lightness so it also survives
 *  greyscale printing. */
const VIRIDIS = [
    [68, 1, 84], [72, 40, 120], [62, 74, 137], [49, 104, 142], [38, 130, 142],
    [31, 158, 137], [53, 183, 121], [109, 205, 89], [180, 222, 44], [253, 231, 37],
];

/** Sequential CVD-safe colour for t ∈ [0, 1] (clamped): viridis, interpolated
 *  between anchors. Drop-in replacement for the old `hsl(120*t, ...)` ramp. */
const cvdSeq = t => {
    const x = clamp01(t) * (VIRIDIS.length - 1);
    const i = Math.floor(x), f = x - i;
    const a = VIRIDIS[i], b = VIRIDIS[Math.min(i + 1, VIRIDIS.length - 1)];
    return rgb(Math.round(a[0] + (b[0] - a[0]) * f),
               Math.round(a[1] + (b[1] - a[1]) * f),
               Math.round(a[2] + (b[2] - a[2]) * f));
};

/** Okabe–Ito qualitative palette — the standard CVD-safe categorical set. Named
 *  so callers read as intent (defector = vermillion, cooperator = blue, …). */
const CVD = {
    blue: '#0072B2', orange: '#E69F00', green: '#009E73', purple: '#CC79A7',
    vermillion: '#D55E00', sky: '#56B4E9', yellow: '#F0E442', grey: '#999999', black: '#111111',
};

/** Six distinct CVD-safe series colours for the six policy genes (τ θ φ κ λ ψ),
 *  omitting yellow (too faint on white). Order matches GENE_INFO / corr legends. */
const GENE_SERIES = [CVD.blue, CVD.orange, CVD.green, CVD.purple, CVD.vermillion, CVD.sky];

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
