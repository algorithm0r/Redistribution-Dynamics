/**
 * Global parameters object. One flat record of everything a run is configured
 * by; it is serialized verbatim into each saved data packet so a run is fully
 * reproducible from its stored parameters.
 *
 * Sections:
 *   - Domain: Model 1, Stage 1 — gather/consume with three automatic regimes.
 *   - Framework / data: loop, reporting, and database wiring (stable machinery).
 */
const PARAMETERS = {
    runName: "Run From Controls",

    // ── Domain (Model 1, Stage 1 — see DEVPLAN.md) ─────────────────────────
    initialAgents: 100,
    initialStock: 0,          // starting stock for a new agent (founders AND newborns)

    pNoGather: 0.2,           // chance to fail gathering this tick  (bane)
    pNoConsume: 0.2,          // chance to skip consumption this tick (boon)

    // Redistribution rule, applied every tick between gather and consume:
    //   'none'  — no transfers
    //   'share' — hungry agents pull 1 from the richest agent with surplus
    //   'theft' — hungry agents seize 1 from a *random* agent with surplus;
    //             with prob conflictChance the resource is destroyed instead
    //   'pool'  — all stock pooled and split equally
    //   'genome'— Model 2: redistribution driven by the social genome below
    regime: "none",
    conflictChance: 0.25,     // 'theft' only: chance the seized resource is lost

    // Model 2 social genome (used by the 'genome' regime; see DEVPLAN.md). These
    // seed every agent's genes; uniform for now (evolution comes with the grid).
    tau: 0.5,        // collection rate
    theta: 0.5,      // progressivity threshold (fraction of richest)
    phi: 1.0,        // distribution focus: equal (0) -> neediest-first (1)
    kappa: 0.0,      // hub (richest) retained share
    lambda: 0.0,     // punishment: chance a defector's due is destroyed
    psi: 0.0,        // franchise: who votes (0 everyone -> 1 only the wealthiest)
    coop: 1.0,       // compliance: chance an agent pays in when asked
    omega: 0.5,      // INERT null tracer gene — mutates & is recorded but read by no
                     // dynamics; the drift/draft baseline to compare real genes against
    term: 0.5,       // constitutional TERM meta-gene: preferred election period. Voted (in
                     // franchise modes) into the village constitution term T via [0,1] ->
                     // [1, termMax]; inert under franchiseMode 'off' (T = constitutionTerm).

    // Who votes on the franchise gene psi itself (breaks the self-reference):
    //   'off' disabled  — psi ignored, everyone always votes (the pre-psi control)
    //   'A' universal   — psi set by universal suffrage, then gates the other genes
    //   'B' entrenched  — last tick's enacted psi gates this tick's whole vote
    // (Only matters when psi > 0 evolves under the genome regime / Model V.)
    franchiseMode: 'B',

    // How theta's "who pays" and psi's "who votes" wealth-lines turn a [0,1] fraction
    // into a stock cutoff (see wealthLine in village.js):
    //   'relative'   — fraction of the richest agent's stock (the original rule; a
    //                  single outlier sets the scale, so the knob goes numb under skew)
    //   'percentile' — the fraction-th quantile of the stock distribution (evenly
    //                  sensitive across [0,1] and robust to one runaway agent)
    thresholdMode: 'relative',

    // Signed wealth-lines. When true, theta ("who pays") and psi ("who votes") become
    // SIGNED filters: the gene g in [0,1] maps to s = 2g-1, so 0.5 = neutral (everyone
    // included), g>0.5 filters out the poorest |s| fraction (progressive / plutocratic —
    // the one-sided default), g<0.5 filters out the richest |s| fraction (regressive /
    // proletarian — the new half). Favours thresholdMode 'percentile' (the negative side
    // is numb under 'relative' skew). false = the original one-sided [0,1] gate. See DEVPLAN.
    signedThreshold: false,

    // Constitution term T: how long an election result is locked as the village constitution
    // before re-voting. T=1 re-votes every tick (continuous Model V, the original behaviour);
    // large T is a one-shot founding vote. Under franchiseMode 'off' T is this fixed value;
    // under 'A'/'B' T is VOTED — the term gene, median of the electorate mapped [0,1] ->
    // [1, termMax]. See DEVPLAN 'Constitutions'.
    constitutionTerm: 1,
    termMax: 50000,          // the voted term gene [0,1] maps linearly to [1, termMax] ticks
    // Whether franchise modes 'A'/'B' VOTE the term (true, the original behaviour) or use the
    // fixed constitutionTerm like 'off' (false). false separates the franchise from the voted
    // term, which constitution_grid confounded (analysis/SPECS.md S2).
    termVoted: true,

    // Evolution: when on, a starving agent dies and is replaced by a mutated
    // offspring of a survivor, so pNoGather/pNoConsume evolve under selection.
    evolveTraits: false,
    mutationStdev: 0.02,      // std dev of the Gaussian trait mutation
    deathChance: 0.001,       // per-tick random (trait-independent) death chance
    coupleTraits: false,      // tie pNoGather == pNoConsume as one gene (drift 0)
    // Fraction of births that are SEXUAL (two fed parents, per-gene independent
    // assortment = free recombination) vs asexual clones. 0 = original all-asexual
    // model (complete linkage); 0.5 = a 50/50 mix. Recombination dissolves the genetic
    // draft that lets neutral genes hitchhike on selective sweeps. Self-breeding
    // (individualBirthThreshold) and founder cloning stay asexual regardless.
    pSexual: 0.0,

    // Model V — grid of villages (spatial group selection; see DEVPLAN.md).
    spatial: false,           // run the World grid instead of a single Population
    gridRows: 10,
    gridCols: 10,
    seedVillages: 10,         // founding villages on the empty grid
    seedPop: 30,              // starting population per founding village
    randomizeGenes: true,     // seed founders with random social genes (else from inputs)
    cloneFounders: false,     // each village = one founder + its mutated clones (low within-village variance)
    cap: 100,                 // soft carrying capacity per village
    // Cost (in needs-met villager-ticks) of each birth/fission, affine in village size:
    //   threshold = max(1, round(birthThreshold + birthThresholdRate * pop))
    // Rate 0 = flat cost (exponential growth); rate>0 adds a per-villager cost that
    // brakes growth toward linear (e.g. base 0 + rate 1 = "threshold equals pop").
    birthThreshold: 0,        // base cost, independent of size
    birthThresholdRate: 4,    // added cost per current villager
    birthWealthBias: 0.0,     // group births: pick the parent ∝ stock^β. β=0 uniform
                              // (wealth-blind), β=1 linear (the old wealthProportionalBirth),
                              // β>1 steeper toward the wealthy. An individual-selection dial.
    individualBirthThreshold: 0,    // an agent with >= this stock spends it to self-breed (0 = off)
    fissionSize: 0.5,         // fraction of a capped village that buds off
    fissionMaxFraction: 0.5,  // a target may receive a colony only if pop < this * cap
    starveDeathChance: 0.1,   // per-tick death chance for an unfed agent
    catastropheChance: 0.001, // per-tick wipeout chance PER populated neighbour (isolated village = 0)
    pMigrateRandom: 0.0,      // migration vector: relocate to a random neighbour
    pMigrateMisfit: 0.2,      // migration vector: relocate by policy mismatch (Tiebout)
    pMigrateStarve: 0.20,     // migration vector: relocate when unfed (seek food)
    gridColorGene: "tau",     // which gene paints the grid (red 0 -> green 1)
    displayMode: "policy",    // 'policy' (gene colour) or 'villagers' (absolute wealth)
    wealthLevels: 10,         // discrete colour bands for the villager-wealth display

    idCounter: 0,   // monotonic source of unique agent ids; reset at run start

    // ── Reproducibility ────────────────────────────────────────────────────
    // RNG seed for the run. null = unseeded: every draw is Math.random() (the original
    // behaviour). Any number/string = every draw comes from a seeded sfc32 stream
    // (util.js seedRNG), so the run reproduces exactly from its stored PARAMETERS.
    seed: null,

    // ── Diagnostics (each a named switch, so every packet shows which were on) ──
    // Per-village records (villageRecords: position, size, mean coop, enacted policy, growth
    // points). They are ~60% of a default packet (6 MB of 10 MB BSON at 50k ticks), so they can
    // be thinned: every `villageRecordEvery`-th sample, or off. A thinned packet carries
    // data.villageRecordTicks. Syndrome records always write one (their `sy` lives there).
    recordVillageRecords: true,
    villageRecordEvery: 1,
    // S1 policy gap (analysis/SPECS.md): per sample, the pop-weighted gap between each
    // village's enacted policy and its full-membership median, split into lag (term) and
    // franchise parts, plus the rank gap, term T and election age. Adds data.policyGap.
    recordPolicyGap: false,
    // S4 syndrome instrumentation (analysis/SPECS.md): per-village flows (births, deaths,
    // migrants by vector, with gene sums), lineage ids, tracer medians and member gene sums
    // (villageRecords[s][i].sy every `syndromeEvery` samples), villages that ended between
    // records, and periodic population samples with per-tick transfer/vote flags. Adds
    // data.syndrome. Recording draws only from the diag/tracer RNG streams: the run is unchanged.
    recordSyndrome: false,
    syndromeEvery: 5,           // flows + village extras every Nth sample (5 × reportingPeriod 100 = 500 ticks)
    syndromeSampleTicks: 5000,  // a population sample every N ticks (tick 0 included)
    syndromeSampleSize: 256,    // agents per population sample

    // Extra inert tracer genes ω1..ωk (S4.2/S5): like ω, read by no dynamics; their randomness
    // comes from the tracer RNG stream, so k > 0 leaves every real gene's trajectory unchanged.
    // Adds data.tracers (agent mean, mean and SD of village medians, per sample). 0 = none.
    extraTracers: 0,

    // ── Controls (analysis/SPECS.md S5) ─────────────────────────────────────
    // Policy-shuffle shadow: each village still votes its own constitution, but ENACTS that of
    // a random other village, re-drawn every tick (demography unchanged). villageRecords gain
    // `go` (the village's own vote) beside `g` (enacted). Changes the run (sim RNG + dynamics).
    policyShuffle: false,
    policyShuffleMisfit: 'enacted',   // misfit migration compares agents with the 'enacted' (shuffled) or 'own' policy
    // Linked/unlinked inert pair: omegaL inherited with coop, omegaU from a random fed villager
    // at each birth (tracer RNG stream: the run is unchanged). Adds data.linkedTracers.
    linkedTracers: false,

    // ── Framework / data ───────────────────────────────────────────────────
    updatesPerDraw: 1,        // sim ticks per rendered frame (raise to fast-forward)
    reportingPeriod: 100,     // record statistics every N ticks
    epoch: 100000,            // ticks per run before data is sent and the run ends

    db: "redistribution_dynamics",
    collection: "stage1",
    ip: "https://research.climbinggiants.com:8888",   // shared socket.io -> MongoDB server (../Server)
};

/** Pull parameters from the control-panel inputs into PARAMETERS. */
const loadParametersFromUI = () => {
    PARAMETERS.initialAgents = parseInt(document.getElementById("numAgents").value);
    PARAMETERS.initialStock  = parseInt(document.getElementById("initialStock").value);
    PARAMETERS.pNoGather     = parseFloat(document.getElementById("pNoGather").value);
    PARAMETERS.pNoConsume    = parseFloat(document.getElementById("pNoConsume").value);
    PARAMETERS.regime        = document.getElementById("regime").value;
    PARAMETERS.conflictChance = parseFloat(document.getElementById("conflictChance").value);
    PARAMETERS.tau    = parseFloat(document.getElementById("tau").value);
    PARAMETERS.theta  = parseFloat(document.getElementById("theta").value);
    PARAMETERS.phi    = parseFloat(document.getElementById("phi").value);
    PARAMETERS.kappa  = parseFloat(document.getElementById("kappa").value);
    PARAMETERS.lambda = parseFloat(document.getElementById("lambda").value);
    PARAMETERS.psi    = parseFloat(document.getElementById("psi").value);
    PARAMETERS.coop   = parseFloat(document.getElementById("coop").value);
    PARAMETERS.omega  = parseFloat(document.getElementById("omega").value);
    PARAMETERS.franchiseMode = document.getElementById("franchiseMode").value;
    PARAMETERS.thresholdMode = document.getElementById("thresholdMode").value;
    PARAMETERS.evolveTraits  = document.getElementById("evolveTraits").checked;
    PARAMETERS.mutationStdev = parseFloat(document.getElementById("mutationStdev").value);
    PARAMETERS.deathChance   = parseFloat(document.getElementById("deathChance").value);
    PARAMETERS.coupleTraits  = document.getElementById("coupleTraits").checked;
    PARAMETERS.pSexual       = parseFloat(document.getElementById("pSexual").value);
    PARAMETERS.epoch         = parseInt(document.getElementById("epoch").value);
    PARAMETERS.reportingPeriod = parseInt(document.getElementById("reportingPeriod").value);
    PARAMETERS.updatesPerDraw  = parseInt(document.getElementById("updatesPerDraw").value);

    PARAMETERS.spatial            = document.getElementById("spatial").checked;
    const gridSize                = parseInt(document.getElementById("gridSize").value);
    PARAMETERS.gridRows = gridSize;
    PARAMETERS.gridCols = gridSize;
    PARAMETERS.cap                = parseInt(document.getElementById("cap").value);
    PARAMETERS.birthThreshold     = parseInt(document.getElementById("birthThreshold").value);
    PARAMETERS.birthThresholdRate = parseFloat(document.getElementById("birthThresholdRate").value);
    PARAMETERS.birthWealthBias          = parseFloat(document.getElementById("birthWealthBias").value);
    PARAMETERS.individualBirthThreshold = parseInt(document.getElementById("individualBirthThreshold").value);
    PARAMETERS.starveDeathChance  = parseFloat(document.getElementById("starveDeathChance").value);
    PARAMETERS.catastropheChance  = parseFloat(document.getElementById("catastropheChance").value);
    PARAMETERS.fissionSize        = parseFloat(document.getElementById("fissionSize").value);
    PARAMETERS.fissionMaxFraction = parseFloat(document.getElementById("fissionMaxFraction").value);
    PARAMETERS.randomizeGenes      = document.getElementById("randomizeGenes").checked;
    PARAMETERS.cloneFounders       = document.getElementById("cloneFounders").checked;
    PARAMETERS.pMigrateRandom     = parseFloat(document.getElementById("pMigrateRandom").value);
    PARAMETERS.pMigrateMisfit     = parseFloat(document.getElementById("pMigrateMisfit").value);
    PARAMETERS.pMigrateStarve     = parseFloat(document.getElementById("pMigrateStarve").value);
    PARAMETERS.gridColorGene      = document.getElementById("gridColorGene").value;
    PARAMETERS.displayMode        = document.getElementById("displayMode").value;
    PARAMETERS.wealthLevels       = parseInt(document.getElementById("wealthLevels").value);

    PARAMETERS.runName = "Run From Controls";
    const runNameEl = document.getElementById("runName");
    if (runNameEl) runNameEl.innerText = PARAMETERS.runName;
};

/** Push PARAMETERS back into the control-panel inputs (e.g. when loading a run). */
const saveParametersToUI = () => {
    document.getElementById("numAgents").value    = PARAMETERS.initialAgents;
    document.getElementById("initialStock").value = PARAMETERS.initialStock;
    document.getElementById("pNoGather").value    = PARAMETERS.pNoGather;
    document.getElementById("pNoConsume").value   = PARAMETERS.pNoConsume;
    document.getElementById("regime").value       = PARAMETERS.regime;
    document.getElementById("conflictChance").value = PARAMETERS.conflictChance;
    document.getElementById("tau").value    = PARAMETERS.tau;
    document.getElementById("theta").value  = PARAMETERS.theta;
    document.getElementById("phi").value    = PARAMETERS.phi;
    document.getElementById("kappa").value  = PARAMETERS.kappa;
    document.getElementById("lambda").value = PARAMETERS.lambda;
    document.getElementById("psi").value    = PARAMETERS.psi;
    document.getElementById("coop").value   = PARAMETERS.coop;
    document.getElementById("omega").value  = PARAMETERS.omega;
    document.getElementById("franchiseMode").value = PARAMETERS.franchiseMode;
    document.getElementById("thresholdMode").value = PARAMETERS.thresholdMode;
    document.getElementById("evolveTraits").checked = PARAMETERS.evolveTraits;
    document.getElementById("mutationStdev").value = PARAMETERS.mutationStdev;
    document.getElementById("deathChance").value   = PARAMETERS.deathChance;
    document.getElementById("coupleTraits").checked = PARAMETERS.coupleTraits;
    document.getElementById("pSexual").value        = PARAMETERS.pSexual;
    document.getElementById("epoch").value         = PARAMETERS.epoch;
    document.getElementById("reportingPeriod").value = PARAMETERS.reportingPeriod;
    document.getElementById("updatesPerDraw").value  = PARAMETERS.updatesPerDraw;

    if (typeof selectModel === "function") selectModel(PARAMETERS.spatial);
    document.getElementById("gridSize").value           = PARAMETERS.gridRows;
    document.getElementById("cap").value                = PARAMETERS.cap;
    document.getElementById("birthThreshold").value     = PARAMETERS.birthThreshold;
    document.getElementById("birthThresholdRate").value = PARAMETERS.birthThresholdRate;
    document.getElementById("birthWealthBias").value = PARAMETERS.birthWealthBias;
    document.getElementById("individualBirthThreshold").value  = PARAMETERS.individualBirthThreshold;
    document.getElementById("starveDeathChance").value  = PARAMETERS.starveDeathChance;
    document.getElementById("catastropheChance").value  = PARAMETERS.catastropheChance;
    document.getElementById("fissionSize").value        = PARAMETERS.fissionSize;
    document.getElementById("fissionMaxFraction").value = PARAMETERS.fissionMaxFraction;
    document.getElementById("randomizeGenes").checked   = PARAMETERS.randomizeGenes;
    document.getElementById("cloneFounders").checked    = PARAMETERS.cloneFounders;
    document.getElementById("pMigrateRandom").value     = PARAMETERS.pMigrateRandom;
    document.getElementById("pMigrateMisfit").value     = PARAMETERS.pMigrateMisfit;
    document.getElementById("pMigrateStarve").value     = PARAMETERS.pMigrateStarve;
    document.getElementById("gridColorGene").value      = PARAMETERS.gridColorGene;
    document.getElementById("displayMode").value        = PARAMETERS.displayMode;
    document.getElementById("wealthLevels").value       = PARAMETERS.wealthLevels;

    const runNameEl = document.getElementById("runName");
    if (runNameEl) runNameEl.innerText = PARAMETERS.runName;
};
