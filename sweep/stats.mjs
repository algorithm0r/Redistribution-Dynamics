// stats.mjs — the adaptive stopping rule. Ported and streamlined from the domestication
// "sufficiency" test, which hit the same bistability we expect here.
//
// A cell's metric (default: final mean coop) can be BISTABLE — some reps cooperate, some
// collapse — so a single mean + CI is misleading. Split it into two answerable questions:
//   p_estab = fraction of reps where cooperation established (metric > threshold)  [Wilson CI]
//   level   = mean metric AMONG established reps                                   [t CI]
// In a clear regime (all establish, or none) this reduces to a plain mean-CI on the level.
// `enough` = the CI that matters in the current regime is within its target half-width AND
// we have >= minN reps; nNeeded tells the coordinator how many total reps to aim for.
//
// To switch metrics later (e.g. a basin-probability measure for the bistable cells you
// flagged), just feed a different sample array — the two-regime logic is metric-agnostic.

// two-sided t for a 95% CI, df = n-1 (indexed by n-2); 1.96 beyond df = 30
const TT = [12.71, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201,
    2.179, 2.160, 2.145, 2.131, 2.120, 2.110, 2.101, 2.093, 2.086, 2.080, 2.074, 2.069,
    2.064, 2.060, 2.056, 2.052, 2.048, 2.045, 2.042];
const tcrit = n => (n <= 1 ? Infinity : (n - 1 <= 30 ? TT[n - 2] : 1.96));
const Z = 1.96;
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const sd = a => (a.length > 1 ? Math.sqrt(a.reduce((s, x) => s + (x - mean(a)) ** 2, 0) / (a.length - 1)) : 0);

export const DEFAULTS = { threshold: 0.5, eLevel: 0.03, eP: 0.10, minN: 3, maxN: 60 };

/** Evaluate one cell's replicate metric values. Returns { enough, n, nNeeded, regime, ... }. */
export function evaluate(vals, opt = {}) {
    const { threshold, eLevel, eP, minN, maxN } = { ...DEFAULTS, ...opt };
    const n = vals.length;
    if (n < minN) return { enough: false, n, nNeeded: minN, regime: 'seed', mean: n ? mean(vals) : NaN };

    const est = vals.filter(v => v > threshold), nEst = est.length;
    const p = nEst / n;
    const wHalf = (Z * Math.sqrt(p * (1 - p) / n + Z * Z / (4 * n * n))) / (1 + Z * Z / n);   // Wilson half-width
    const lMean = nEst ? mean(est) : 0;
    const lSd = nEst ? sd(est) : 0;
    const lHalf = nEst ? tcrit(nEst) * lSd / Math.sqrt(nEst) : Infinity;

    const regime = p >= 0.95 ? 'establish' : p <= 0.05 ? 'collapse' : 'BISTABLE';
    const pOK = regime !== 'BISTABLE' || wHalf <= eP;     // the ignite proportion only needs a tight CI at the boundary
    const lvlOK = p <= 0.05 ? true : lHalf <= eLevel;     // the level matters wherever anything establishes
    const enough = (pOK && lvlOK) || n >= maxN;

    const nP = regime === 'BISTABLE' ? Math.ceil((Z / eP) ** 2 * Math.max(p * (1 - p), 0.05)) : 0;
    const nL = (p > 0.05 && lHalf > eLevel) ? Math.ceil((tcrit(Math.max(nEst, 2)) * lSd / eLevel) ** 2) : 0;
    const nNeeded = Math.min(maxN, Math.max(nP, nL, n + 1));

    return { enough, n, nNeeded, regime, mean: mean(vals), p, pHalf: wHalf, level: lMean, levelHalf: lHalf };
}
