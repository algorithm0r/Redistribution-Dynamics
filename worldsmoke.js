// Headless smoke test for Model V (no MongoDB, no canvas). Loads the sim files
// in a VM context and runs the World grid for a few scenarios, printing the
// population / village / gene trajectories. Run: node worldsmoke.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function createCtx() {
    const ctx = vm.createContext({
        Math, Number, Array, Object, JSON, Infinity, NaN, isNaN, isFinite,
        parseInt, parseFloat, setTimeout, clearTimeout,
        window: { requestAnimationFrame: () => {}, io: undefined },
        document: { getElementById: () => ({ classList: { remove(){}, add(){} }, value: '', innerText: '', checked: false }) },
        socket: { emit: () => {} },
        console: { log: () => {}, warn: () => {}, error: () => {} },
        saveParametersToUI: () => {}, loadParametersFromUI: () => {}, loadNextRunParameters: () => {},
        // gameEngine intentionally undefined so World skips the canvas observer.
    });
    const load = f => {
        let code = fs.readFileSync(path.join(__dirname, f), 'utf8');
        code = code.replace(/^const\s+/gm, 'var ').replace(/^let\s+/gm, 'var ')
                   .replace(/^class\s+(\w+)/gm, 'var $1 = class $1');
        vm.runInContext(code, ctx);
    };
    ['util.js', 'parameters.js', 'agent.js', 'village.js', 'world.js'].forEach(load);
    return ctx;
}

const UNIFORM = { randomizeGenes: false };
const scenarios = [
    { label: 'cooperative-pool', genes: { tau: 0.7, theta: 0.2, phi: 1, kappa: 0, lambda: 0, coop: 1.0 }, extra: UNIFORM },
    { label: 'laissez-faire',    genes: { tau: 0.0, theta: 0.5, phi: 1, kappa: 0, lambda: 0, coop: 1.0 }, extra: UNIFORM },
    { label: 'defector-pool',    genes: { tau: 0.7, theta: 0.2, phi: 1, kappa: 0, lambda: 0.3, coop: 0.4 }, extra: UNIFORM },
    { label: 'migration-mix',    genes: { tau: 0.6, theta: 0.3, phi: 1, kappa: 0, lambda: 0, coop: 0.9 },
                                 extra: { ...UNIFORM, pMigrateRandom: 0.02, pMigrateMisfit: 0.05, pMigrateStarve: 0.1 } },
    // Randomized founders + Tiebout sorting — the intended Model V starting state.
    { label: 'random-founders',  genes: {}, extra: { randomizeGenes: true, pMigrateMisfit: 0.05, pMigrateStarve: 0.05 } },
];

const EPOCH = 500;
for (const s of scenarios) {
    const ctx = createCtx();
    const P = ctx.PARAMETERS;
    Object.assign(P, {
        spatial: true, epoch: EPOCH, idCounter: 0,
        gridRows: 6, gridCols: 6, cap: 40, birthThreshold: 20, seedVillages: 4, seedPop: 15,
        initialStock: 5, pNoGather: 0.10, pNoConsume: 0.11,   // thin buffer, ~1% net positive
    }, s.genes, s.extra || {});

    let captured = null;
    ctx.socket.emit = (e, pkt) => { if (e === 'insert') captured = pkt; };
    let done = false;
    ctx.loadNextRunParameters = () => { done = true; };

    const world = vm.runInContext('new World()', ctx);
    let guard = EPOCH + 50;
    while (!done && guard-- > 0) world.update();

    const d = captured.data;
    const last = a => a[a.length - 1];
    const tauHist = d.geneHistograms.tau;
    const lastBins = tauHist[tauHist.length - 1];
    console.log(
        `${s.label.padEnd(17)} | villages ${String(last(d.villages)).padStart(3)} | ` +
        `pop ${String(last(d.population)).padStart(5)} | ` +
        `coop ${last(d.geneMeans.coop).toFixed(3)} | tau ${last(d.geneMeans.tau).toFixed(3)} | psi ${last(d.geneMeans.psi).toFixed(3)} | phi ${last(d.geneMeans.phi).toFixed(3)} | ` +
        `tauHist[${tauHist.length} snaps, sum ${lastBins.reduce((a, b) => a + b, 0)}]`
    );
}

// ── Franchise (psi) mechanism check ─────────────────────────────────────────
// A poor majority wants high tax (tau=0.9); a rich minority wants none (tau=0.1).
// Who votes decides which preference is enacted, so raising the franchise line
// hands the economic vote to the wealthy. Deterministic — no RNG in genePolicy.
{
    const ctx = createCtx();
    const P = ctx.PARAMETERS;
    const mk = (stock, tau, psi) => { const a = new ctx.Agent(); a.stock = stock; a.tau = tau; a.psi = psi; return a; };
    const agents = [
        mk(1, 0.9, 0.5), mk(1, 0.9, 0.5), mk(1, 0.9, 0.5),   // poor majority
        mk(100, 0.1, 0.5), mk(100, 0.1, 0.5),                // rich minority
    ];
    P.franchiseMode = 'B';
    const uni  = ctx.genePolicy(agents, { psi: 0 });   // universal suffrage -> majority wins
    const rich = ctx.genePolicy(agents, { psi: 1 });   // only the richest vote -> minority wins
    P.franchiseMode = 'A';
    const modeA = ctx.genePolicy(agents);              // psi=0.5 median gates to stock>=50 (the rich)
    P.franchiseMode = 'off';
    const off  = ctx.genePolicy(agents, { psi: 1 });   // psi ignored -> everyone votes -> majority wins
    const ok = Math.abs(uni.tau - 0.9) < 1e-9 && Math.abs(rich.tau - 0.1) < 1e-9 &&
               Math.abs(modeA.tau - 0.1) < 1e-9 && Math.abs(off.tau - 0.9) < 1e-9;
    console.log(
        `franchise-check   | universal tau ${uni.tau.toFixed(2)} (want 0.90) | ` +
        `restricted tau ${rich.tau.toFixed(2)} (want 0.10) | ` +
        `modeA(psi=.5) tau ${modeA.tau.toFixed(2)} (want 0.10) | ` +
        `off tau ${off.tau.toFixed(2)} (want 0.90) | ${ok ? 'PASS' : 'FAIL'}`
    );
}

// ── Signed wealth-line check (θ/ψ can filter EITHER tail) ────────────────────
// Distinct stocks: poor {1,2,3} want high tau (0.9), rich {100,101} want none (0.1).
// With signedThreshold, ψ<0.5 = proletarian (only the poor vote), ψ>0.5 = plutocratic
// (only the rich), ψ=0.5 = everyone. Deterministic (no RNG in genePolicy).
{
    const ctx = createCtx();
    const P = ctx.PARAMETERS;
    P.signedThreshold = true; P.thresholdMode = 'percentile'; P.franchiseMode = 'B';
    const mk = (stock, tau) => { const a = new ctx.Agent(); a.stock = stock; a.tau = tau; return a; };
    const agents = [mk(1, 0.9), mk(2, 0.9), mk(3, 0.9), mk(100, 0.1), mk(101, 0.1)];
    const prole   = ctx.genePolicy(agents, { psi: 0.3 }).tau;   // s<0: drop richest -> poor vote
    const pluto   = ctx.genePolicy(agents, { psi: 0.7 }).tau;   // s>0: drop poorest -> rich vote
    const neutral = ctx.genePolicy(agents, { psi: 0.5 }).tau;   // s=0: everyone -> poor majority
    const ok = Math.abs(prole - 0.9) < 1e-9 && Math.abs(pluto - 0.1) < 1e-9 && Math.abs(neutral - 0.9) < 1e-9;
    console.log(
        `signed-check      | proletarian(psi=.3) tau ${prole.toFixed(2)} (want 0.90) | ` +
        `plutocratic(psi=.7) tau ${pluto.toFixed(2)} (want 0.10) | ` +
        `neutral(psi=.5) tau ${neutral.toFixed(2)} (want 0.90) | ${ok ? 'PASS' : 'FAIL'}`
    );
}

// ── Constitution check (T locks the vote for a term; voted T maps 0-1 -> 1..termMax) ──
{
    const ctx = createCtx();
    const P = ctx.PARAMETERS;
    Object.assign(P, { spatial: true, franchiseMode: 'off', constitutionTerm: 100, idCounter: 0 });
    const mkA = () => { const a = new ctx.Agent(); a.stock = 10; return a; };
    const v = new ctx.Village(0, 0, [mkA(), mkA(), mkA()]);
    v.step(0);                                              // founding election at tick 0
    const c0 = v.constitution, term0 = v.term;
    v.step(1); v.step(50);                                  // within the term: no re-vote
    const locked = v.constitution === c0 && v.electedAt === 0;
    v.step(100);                                            // term elapsed: re-vote
    const revoted = v.electedAt === 100 && v.constitution !== c0;
    // Voted term under a franchise: term gene 0.5 -> ~midpoint of [1, termMax].
    P.franchiseMode = 'A';
    const va = new ctx.Village(0, 0, [mkA(), mkA(), mkA()]);   // agents' term gene defaults to 0.5
    va.step(0);
    const wantVoted = Math.round(1 + 0.5 * (P.termMax - 1));
    const votedOK = Math.abs(va.term - wantVoted) <= 1;
    const ok = term0 === 100 && locked && revoted && votedOK;
    console.log(
        `constitution-check| off T=${term0} (want 100) | locked ${locked} | re-voted@T ${revoted} | ` +
        `voted T ${va.term} (want ~${wantVoted}) | ${ok ? 'PASS' : 'FAIL'}`
    );
}
