/**
 * Run dashboard for Redistribution Dynamics. Connects to the shared DB (socket.io
 * -> Mongo), lists the run names in a collection, fetches all replicates of a run,
 * aggregates them (time series averaged across reps; histogram buckets summed/pooled
 * across reps), and draws the population/migration line graphs and the per-gene
 * histogram grid (all | defectors | middlers | cooperators | villages). "Next Run"
 * steps through the runs. Pattern adapted from Domestication/graphs.js.
 */

const GENES = ['tau', 'theta', 'phi', 'kappa', 'lambda', 'coop'];
const COOP_COL = { lo: '#d11', mid: '#a80', hi: '#1a1' };  // defectors / middlers / cooperators

let socket, CTX, docs = [], agg = null, reportingPeriod = 100;

document.addEventListener('DOMContentLoaded', () => {
    CTX = document.getElementById('chart').getContext('2d');

    socket = io.connect(PARAMETERS.ip);
    socket.on('connect', () => { databaseConnected(); document.getElementById('db').textContent = 'DB ✓'; loadRuns(); });
    socket.on('disconnect', () => { databaseDisconnected(); document.getElementById('db').textContent = 'DB ✗'; });
    socket.on('error', e => console.log('socket error', e));

    socket.on('distinct', names => populateRuns(names));

    document.getElementById('loadRuns').onclick = loadRuns;
    document.getElementById('query').onclick = () => querySelected();
    document.getElementById('nextRun').onclick = () => {
        const sel = document.getElementById('runSelect');
        if (sel.options.length) { sel.selectedIndex = (sel.selectedIndex + 1) % sel.options.length; querySelected(); }
    };
    document.getElementById('coopOverview').onclick = coopOverview;
    document.getElementById('download').onclick = downloadCSV;
});

function collection() { return document.getElementById('collection').value.trim(); }

function loadRuns() {
    socket.emit('distinct', { db: PARAMETERS.db, collection: collection(), key: 'run' });
    setInfo('Loading run names…');
}

function populateRuns(names) {
    const sel = document.getElementById('runSelect');
    sel.innerHTML = '';
    (names || []).sort().forEach(n => {
        const o = document.createElement('option');
        o.value = n; o.textContent = n; sel.appendChild(o);
    });
    setInfo(`${(names || []).length} runs in ${collection()}. Pick one and Query (or Next Run).`);
    if (sel.options.length) querySelected();
}

function querySelected() {
    const name = document.getElementById('runSelect').value;
    if (!name) return;
    setInfo(`Querying "${name}"…`);
    socket.emit('find', { db: PARAMETERS.db, collection: collection(), query: { run: name }, limit: 200, page: 0 },
        res => { if (res && res.ok) receiveDocs(res.results); else setInfo('Query failed (no ack).'); });
}

/** Overlay plot of mean cooperation over time for every run in the collection,
 *  each run averaged across its replicates. One find per run (projected to the
 *  coop series only, via socket ack so responses don't collide). */
function coopOverview() {
    let names = Array.from(document.getElementById('runSelect').options).map(o => o.value);
    const go = () => {
        if (!names.length) { setInfo('No runs found.'); return; }
        setInfo(`Fetching coop series for ${names.length} runs…`);
        const series = [];
        let pending = names.length;
        names.forEach(name => {
            socket.emit('find', {
                db: PARAMETERS.db, collection: collection(), query: { run: name },
                projection: { run: 1, 'geneMeans.coop': 1, 'parameters.individualBirthThreshold': 1, 'parameters.wealthProportionalBirth': 1, 'parameters.reportingPeriod': 1 },
                limit: 200, page: 0,
            }, res => {
                if (res && res.ok && res.results.length) {
                    const r = res.results, p = r[0].parameters || {};
                    series.push({ name, coop: avgArrays(r.map(x => x.geneMeans && x.geneMeans.coop)),
                                  th: p.individualBirthThreshold, wp: p.wealthProportionalBirth, reps: r.length });
                    if (p.reportingPeriod) reportingPeriod = p.reportingPeriod;
                }
                if (--pending === 0) drawOverview(series);
            });
        });
    };
    if (names.length) go();
    else socket.emit('distinct', { db: PARAMETERS.db, collection: collection(), key: 'run' },
        res => { if (res && res.ok) { populateRuns(res.values); names = (res.values || []).slice(); go(); } });
}

function ovRank(s) { return s.wp ? -1 : (s.th === 0 ? -2 : s.th); }
function ovLabel(s) { return s.wp ? 'wealth-parent' : (s.th === 0 ? 'baseline' : 'th=' + s.th); }
function ovColor(s) { return s.wp ? '#a0a' : (s.th === 0 ? '#000' : hsl(Math.round(240 * (s.th - 1) / 9), 70, 45)); }

function drawOverview(series) {
    const ctx = CTX;
    ctx.clearRect(0, 0, 2400, 1300);
    series = series.filter(s => s.coop && s.coop.length).sort((a, b) => ovRank(a) - ovRank(b));
    ctx.fillStyle = '#000'; ctx.textAlign = 'left'; ctx.font = 'bold 18px monospace';
    ctx.fillText(`Mean cooperation over time — all runs in "${collection()}"  (low threshold = red → high = blue; baseline black, wealth-parent magenta)`, 20, 26);

    const x = 60, y = 60, w = 2280, h = 1150;
    const maxLen = Math.max(...series.map(s => s.coop.length), 1);
    const epoch = (maxLen - 1) * reportingPeriod;
    ctx.fillStyle = '#fff'; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#eee'; ctx.fillStyle = '#888'; ctx.font = '11px monospace';
    for (let cc = 0; cc <= 10; cc++) {
        const yy = y + h - cc / 10 * h;
        ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); ctx.stroke();
        ctx.textAlign = 'right'; ctx.fillText((cc / 10).toFixed(1), x - 4, yy + 4);
    }
    ctx.textAlign = 'center';
    for (let f = 0; f <= 10; f++) ctx.fillText(Math.round(f / 10 * epoch), x + f / 10 * w, y + h + 16);

    series.forEach(s => {
        ctx.strokeStyle = ovColor(s); ctx.lineWidth = 2; ctx.beginPath(); let started = false;
        for (let i = 0; i < s.coop.length; i++) {
            const v = s.coop[i]; if (!isFinite(v)) { started = false; continue; }
            const px = x + (maxLen > 1 ? i / (maxLen - 1) * w : 0), py = y + h - v * h;
            if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
        }
        ctx.stroke();
    });
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.strokeRect(x, y, w, h);

    ctx.textAlign = 'left'; ctx.font = '13px monospace';
    let ly = y + 16;
    series.forEach(s => {
        ctx.strokeStyle = ovColor(s); ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x + w - 240, ly - 4); ctx.lineTo(x + w - 216, ly - 4); ctx.stroke();
        ctx.fillStyle = '#000';
        ctx.fillText(`${ovLabel(s).padEnd(14)} ${lastFinite(s.coop).toFixed(2)}  (${s.reps}r)`, x + w - 208, ly);
        ly += 17;
    });
}

function receiveDocs(arr) {
    if (!arr || !arr.length) { setInfo('No data for this run.'); return; }
    docs = arr;
    reportingPeriod = (docs[0].parameters && docs[0].parameters.reportingPeriod) || 100;
    agg = aggregate(docs);
    draw();
    setInfo(`"${docs[0].run}" — ${docs.length} replicate(s) aggregated.`);
}

// ── Aggregation ───────────────────────────────────────────────────────────────
/** Average a list of per-timestep arrays, skipping null/NaN entries. */
function avgArrays(arrs) {
    arrs = arrs.filter(a => Array.isArray(a));
    if (!arrs.length) return [];
    const len = Math.min(...arrs.map(a => a.length));
    const out = [];
    for (let i = 0; i < len; i++) {
        let s = 0, k = 0;
        for (const a of arrs) { const v = a[i]; if (v != null && isFinite(v)) { s += v; k++; } }
        out.push(k ? s / k : NaN);
    }
    return out;
}
/** Average a series picked from each loaded doc (replicates of one run). */
function avgSeries(pick) { return avgArrays(docs.map(pick)); }

/** Pool histograms across docs: sum bucket counts per snapshot (one big histogram). */
function poolHist(pick) {
    const hs = docs.map(pick).filter(h => Array.isArray(h) && h.length);
    if (!hs.length) return [];
    const len = Math.min(...hs.map(h => h.length));
    const nb = hs[0][0].length;
    const out = [];
    for (let t = 0; t < len; t++) {
        const b = new Array(nb).fill(0);
        for (const h of hs) for (let k = 0; k < nb; k++) b[k] += h[t][k];
        out.push(b);
    }
    return out;
}

function aggregate() {
    const a = {
        population: avgSeries(d => d.population),
        villages: avgSeries(d => d.villages),
        mig: {
            starve: avgSeries(d => d.migrations && d.migrations.starve),
            misfit: avgSeries(d => d.migrations && d.migrations.misfit),
            random: avgSeries(d => d.migrations && d.migrations.random),
        },
        geneMean: {}, geneHist: {}, geneVillageMean: {}, geneVillageHist: {},
        coopMean: {}, coopHist: {},
    };
    GENES.forEach(g => {
        a.geneMean[g] = avgSeries(d => d.geneMeans && d.geneMeans[g]);
        a.geneHist[g] = poolHist(d => d.geneHistograms && d.geneHistograms[g]);
        a.geneVillageMean[g] = avgSeries(d => d.geneVillageMeans && d.geneVillageMeans[g]);
        a.geneVillageHist[g] = poolHist(d => d.geneVillageHistograms && d.geneVillageHistograms[g]);
        a.coopMean[g] = {
            lo: avgSeries(d => d.geneCoopMeans && d.geneCoopMeans[g] && d.geneCoopMeans[g].lo),
            mid: avgSeries(d => d.geneCoopMeans && d.geneCoopMeans[g] && d.geneCoopMeans[g].mid),
            hi: avgSeries(d => d.geneCoopMeans && d.geneCoopMeans[g] && d.geneCoopMeans[g].hi),
        };
        a.coopHist[g] = {
            lo: poolHist(d => d.geneCoopHistograms && d.geneCoopHistograms[g] && d.geneCoopHistograms[g].lo),
            mid: poolHist(d => d.geneCoopHistograms && d.geneCoopHistograms[g] && d.geneCoopHistograms[g].mid),
            hi: poolHist(d => d.geneCoopHistograms && d.geneCoopHistograms[g] && d.geneCoopHistograms[g].hi),
        };
    });
    return a;
}

// ── Drawing ───────────────────────────────────────────────────────────────────
function draw() {
    const ctx = CTX;
    ctx.clearRect(0, 0, 2400, 1300);
    const p = docs[0].parameters || {};
    const coopFinal = lastFinite(agg.geneMean.coop);

    ctx.fillStyle = '#000'; ctx.textAlign = 'left'; ctx.font = 'bold 18px monospace';
    ctx.fillText(`${docs[0].run}   (${docs.length} rep${docs.length > 1 ? 's' : ''})`, 20, 24);
    ctx.font = '13px monospace';
    ctx.fillText(`indivBirthThreshold=${p.individualBirthThreshold}   wealthPropParent=${p.wealthProportionalBirth}   ` +
        `epoch=${p.epoch}   sample=${p.reportingPeriod}   migrate r/m/s=${p.pMigrateRandom}/${p.pMigrateMisfit}/${p.pMigrateStarve}   ` +
        `→ final mean coop=${coopFinal.toFixed(3)}`, 360, 24);

    // Line graphs.
    const gy = 50, gw = 565, gh = 150;
    drawGraph(20, gy, gw, gh, [
        { values: agg.population, color: '#000', label: 'pop' },
        { values: agg.villages.map(v => v * (maxOf(agg.population) / Math.max(1, maxOf(agg.villages)))), color: '#888', label: 'villages(scaled)' },
    ], { title: 'Population (avg) & villages', min: 0 });
    drawGraph(605, gy, gw, gh, [{ values: agg.geneMean.coop, color: '#1a1', label: 'coop' }],
        { title: 'Mean cooperation', min: 0, max: 1 });
    drawGraph(1190, gy, gw, gh, GENES.filter(g => g !== 'coop').map((g, i) =>
        ({ values: agg.geneMean[g], color: ['#c33', '#3a3', '#36c', '#c80', '#90c'][i], label: g })),
        { title: 'Policy gene means', min: 0, max: 1 });
    drawGraph(1775, gy, gw, gh, [
        { values: agg.mig.starve, color: '#1a1', label: 'starve' },
        { values: agg.mig.misfit, color: '#c33', label: 'misfit' },
        { values: agg.mig.random, color: '#36c', label: 'random' },
    ], { title: 'Migrations / period (avg)', min: 0 });

    // Histogram grid: 5 columns per gene (rows), pooled across replicates.
    const cols = [
        { key: 'all', tag: 'all', color: '#000' },
        { key: 'lo', tag: 'def', color: COOP_COL.lo },
        { key: 'mid', tag: 'mid', color: COOP_COL.mid },
        { key: 'hi', tag: 'coop', color: COOP_COL.hi },
        { key: 'vil', tag: 'vil', color: '#000' },
    ];
    const x0 = 20, gridY = 250, gap = 8;
    const cW = Math.floor((2400 - 2 * x0 - 4 * gap) / 5);
    const hH = 140, hStep = 168;

    ctx.font = '11px monospace'; ctx.textAlign = 'left'; ctx.fillStyle = '#222';
    ctx.fillText('per-gene pooled histograms (value low→high, bottom→top). columns:', x0, gridY - 16);
    ctx.fillStyle = '#000'; ctx.fillText('all', x0 + 380, gridY - 16);
    ctx.fillStyle = COOP_COL.lo; ctx.fillText('defectors', x0 + 410, gridY - 16);
    ctx.fillStyle = COOP_COL.mid; ctx.fillText('middlers', x0 + 490, gridY - 16);
    ctx.fillStyle = COOP_COL.hi; ctx.fillText('cooperators', x0 + 565, gridY - 16);
    ctx.fillStyle = '#000'; ctx.fillText('villages', x0 + 660, gridY - 16);

    GENES.forEach((g, gi) => {
        const y = gridY + gi * hStep;
        cols.forEach((col, ci) => {
            const x = x0 + ci * (cW + gap);
            let snaps, lines = [];
            if (col.key === 'all') {
                snaps = agg.geneHist[g];
                lines = [
                    { values: agg.coopMean[g].lo, color: COOP_COL.lo },
                    { values: agg.coopMean[g].mid, color: COOP_COL.mid },
                    { values: agg.coopMean[g].hi, color: COOP_COL.hi },
                ];
            } else if (col.key === 'vil') {
                snaps = agg.geneVillageHist[g];
                lines = [{ values: agg.geneVillageMean[g], color: '#fff' }];
            } else {
                snaps = agg.coopHist[g][col.key];
                lines = [{ values: agg.coopMean[g][col.key], color: '#fff' }];
            }
            drawHist(x, y, cW, hH, snaps, { label: g + ' ' + col.tag, labelColor: col.color, lines });
        });
    });
}

function drawGraph(x, y, w, h, series, opts) {
    opts = opts || {};
    const ctx = CTX;
    ctx.fillStyle = '#fff'; ctx.fillRect(x, y, w, h);
    let max = opts.max, min = opts.min != null ? opts.min : 0;
    if (max == null) { max = -Infinity; series.forEach(s => s.values.forEach(v => { if (isFinite(v) && v > max) max = v; })); }
    if (!isFinite(max) || max <= min) max = min + 1;
    const n = Math.max(...series.map(s => s.values.length), 1);
    series.forEach(s => {
        ctx.strokeStyle = s.color; ctx.lineWidth = 1.5; ctx.beginPath(); let started = false;
        for (let i = 0; i < s.values.length; i++) {
            const v = s.values[i];
            if (!isFinite(v)) { started = false; continue; }
            const px = x + (n > 1 ? i / (n - 1) * w : 0), py = y + h - (v - min) / (max - min) * h;
            if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
        }
        ctx.stroke();
    });
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = '#000'; ctx.font = '12px monospace'; ctx.textAlign = 'center';
    ctx.fillText(opts.title || '', x + w / 2, y - 4);
    ctx.textAlign = 'right'; ctx.font = '10px monospace'; ctx.fillText(fmt(max), x + w - 2, y + 10);
    ctx.textAlign = 'left'; let lx = x + 4;
    series.forEach(s => { ctx.fillStyle = s.color; ctx.fillText(s.label, lx, y + h - 4); lx += s.label.length * 6.5 + 12; });
}

function drawHist(x, y, w, h, snaps, opts) {
    opts = opts || {};
    const ctx = CTX;
    ctx.fillStyle = '#fff'; ctx.fillRect(x, y, w, h);
    const n = snaps ? snaps.length : 0;
    if (n) {
        const nb = snaps[0].length, dx = w / n;
        for (let i = 0; i < n; i++) {
            const snap = snaps[i]; let tot = 0; for (const v of snap) tot += v;
            if (!tot) continue;
            for (let j = 0; j < nb; j++) histFill(x + i * dx, y, dx, h, snap[j] / tot, nb - 1 - j, nb);
        }
    }
    (opts.lines || []).forEach(ln => {
        ctx.strokeStyle = ln.color; ctx.lineWidth = 1.5; ctx.beginPath(); let started = false;
        const m = Math.min(n || ln.values.length, ln.values.length);
        for (let i = 0; i < m; i++) {
            const v = ln.values[i];
            if (v == null || !isFinite(v)) { started = false; continue; }
            const px = x + (n > 1 ? i / (n - 1) * w : 0), py = y + (1 - v) * h;
            if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
        }
        ctx.stroke();
    });
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = opts.labelColor || '#000'; ctx.font = '11px monospace'; ctx.textAlign = 'center';
    ctx.fillText(opts.label || '', x + w / 2, y + h + 12);
}

function histFill(px, py, dx, h, share, yIndex, nb) {
    let c = share * 99 + 1;
    c = 511 - Math.floor(Math.log(c) / Math.log(100) * 512);
    CTX.fillStyle = c > 255 ? rgb(c - 256, c - 256, 255) : rgb(0, 0, c);
    const top = Math.floor(yIndex * h / nb), bot = Math.floor((yIndex + 1) * h / nb);
    CTX.fillRect(px, py + top, Math.ceil(dx), bot - top);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function setInfo(s) { document.getElementById('info').textContent = s; }
function maxOf(a) { let m = 0; a.forEach(v => { if (isFinite(v) && v > m) m = v; }); return m; }
function lastFinite(a) { for (let i = a.length - 1; i >= 0; i--) if (isFinite(a[i])) return a[i]; return NaN; }
function fmt(v) { return v >= 100 ? Math.round(v) : v.toFixed(2); }

function downloadCSV() {
    if (!agg) return;
    const rows = [['tick', 'population', 'villages', 'coop', ...GENES.filter(g => g !== 'coop'),
        'mig_starve', 'mig_misfit', 'mig_random']];
    const len = agg.population.length;
    for (let i = 0; i < len; i++) {
        rows.push([i * reportingPeriod, fix(agg.population[i]), fix(agg.villages[i]), fix(agg.geneMean.coop[i]),
            ...GENES.filter(g => g !== 'coop').map(g => fix(agg.geneMean[g][i])),
            fix(agg.mig.starve[i]), fix(agg.mig.misfit[i]), fix(agg.mig.random[i])]);
    }
    download(`${docs[0].run}_aggregate.csv`, rows.map(r => r.join(',')).join('\n'));
}
function fix(v) { return v == null || !isFinite(v) ? '' : (Math.round(v * 1e4) / 1e4); }
