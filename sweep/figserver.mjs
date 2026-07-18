// figserver.mjs — the fig server (:8091). Click a cell in the grid → it fetches that
// run's replicates from Mongo, aggregates them (time-series averaged across reps, histogram
// buckets pooled, covariance averaged → corr(coop,gene)) exactly as the browser dashboard.js
// does, CACHES the aggregate to a file, and serves it. The page (figs.html) then renders it
// with the sim's own Graph/Histogram drawing technique (reused from dashboard.js).
//
//   node figserver.mjs [PORT]           (default 8091; runs beside the coordinator on 8090)
//
// HTTP:
//   GET /                      -> figs.html (file-served; edit live, no restart)
//   GET /lib/<file>            -> util.js / parameters.js / dashboard.js from the repo root
//   GET /grid                  -> proxied coordinator /status (grid state: mean coop, n, …)
//   GET /agg?collection=&run=  -> aggregated series JSON for one run (cached in figcache/)
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';
import { evaluate, DEFAULTS } from './stats.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');                       // sim files live one level up
const PORT = parseInt(process.argv[2] || process.env.FIG_PORT || '8091');
const COORD = process.env.COORD || 'http://localhost:8090';
const MONGO_IP = process.env.MONGO_IP || 'https://research.climbinggiants.com:8888';
const MONGO_DB = process.env.MONGO_DB || 'redistribution_dynamics';
const CACHE_DIR = path.join(HERE, 'figcache');
const FIGS = path.join(HERE, 'figs.html');
fs.mkdirSync(CACHE_DIR, { recursive: true });

const GENES = ['tau', 'theta', 'phi', 'kappa', 'lambda', 'psi', 'coop', 'omega'];
const POLICY = ['tau', 'theta', 'phi', 'kappa', 'lambda', 'psi'];

// ── Mongo (socket.io → Server → Mongo), same access pattern as coordinator.mjs ──────
let mongo = null;
async function mongoSocket() {
    if (mongo && mongo.connected) return mongo;
    mongo = io(MONGO_IP, { transports: ['websocket', 'polling'], timeout: 15000 });
    await new Promise(res => { mongo.on('connect', res); setTimeout(res, 18000); });
    return mongo.connected ? mongo : null;
}
function emitAck(socket, event, payload, ms = 30000) {
    return new Promise((resolve, reject) => {
        socket.emit(event, payload, ack => resolve(ack));
        setTimeout(() => reject(new Error(event + ' ack timeout')), ms);
    });
}
// Only the fields aggregate() reads. INCLUSION projection (the Server ignores exclusion
// {x:0} and would ship the full multi-MB docs — incl. the huge villageRecords/populationSample
// — which times out). This keeps each doc to the series + histograms + covariance we plot.
const AGG_PROJECTION = {
    run: 1, parameters: 1, population: 1, villages: 1, migrations: 1,
    geneMeans: 1, geneHistograms: 1, geneVillageMeans: 1, geneVillageHistograms: 1,
    geneCoopMeans: 1, geneCoopHistograms: 1, geneCovariance: 1, geneOrder: 1,
};
/** All replicate docs for one run, paginated (small pages + long timeout: docs are big and
 *  the run filter is an unindexed scan ~12s/page). */
async function fetchRun(collection, run) {
    const s = await mongoSocket(); if (!s) throw new Error('Mongo not connected');
    const out = [];
    for (let page = 0, limit = 10; ; page++) {
        const ack = await emitAck(s, 'find', { db: MONGO_DB, collection, query: { run }, projection: AGG_PROJECTION, limit, page }, 90000);
        const docs = (ack && ack.results) || [];
        out.push(...docs);
        if (docs.length < limit) break;
    }
    return out;
}

// ── Aggregation (Node port of dashboard.js: avgArrays / poolHist / covariance) ──────
const avgArrays = arrs => {
    arrs = arrs.filter(a => Array.isArray(a));
    if (!arrs.length) return [];
    const len = Math.min(...arrs.map(a => a.length)), out = [];
    for (let i = 0; i < len; i++) {
        let s = 0, k = 0;
        for (const a of arrs) { const v = a[i]; if (v != null && isFinite(v)) { s += v; k++; } }
        out.push(k ? s / k : NaN);
    }
    return out;
};
const poolHist = hs => {
    hs = hs.filter(h => Array.isArray(h) && h.length);
    if (!hs.length) return [];
    const len = Math.min(...hs.map(h => h.length)), nb = hs[0][0].length, out = [];
    for (let t = 0; t < len; t++) {
        const b = new Array(nb).fill(0);
        for (const h of hs) for (let k = 0; k < nb; k++) b[k] += h[t][k];
        out.push(b);
    }
    return out;
};
const lastFinite = a => { if (!Array.isArray(a)) return NaN; for (let i = a.length - 1; i >= 0; i--) if (isFinite(a[i])) return a[i]; return NaN; };

// Basin classification of one replicate by the SHAPE of its final coop distribution.
const coopFracs = (doc, loEdge = 0.3, hiEdge = 0.7) => {
    const h = doc.geneHistograms && doc.geneHistograms.coop;
    if (!h || !h.length) return null;
    const snap = h[h.length - 1], nb = snap.length, tot = snap.reduce((a, b) => a + b, 0) || 1;
    let lo = 0, hi = 0, mid = 0;
    for (let b = 0; b < nb; b++) { const v = (b + 0.5) / nb; if (v < loEdge) lo += snap[b]; else if (v > hiEdge) hi += snap[b]; else mid += snap[b]; }
    return { lo: lo / tot, hi: hi / tot, mid: mid / tot };
};
const basinOf = (doc, pole = 0.9, polar = 0.2) => {
    const f = coopFracs(doc);
    if (!f) return 'middling';
    if (f.hi >= pole) return 'coop';
    if (f.lo >= pole) return 'defect';
    if (f.lo >= polar && f.hi >= polar) return 'polar';
    return 'middling';
};

function aggregate(docs) {
    const avgSeries = pick => avgArrays(docs.map(pick));
    const poolOf = pick => poolHist(docs.map(pick));
    const a = {
        population: avgSeries(d => d.population),
        villages: avgSeries(d => d.villages),
        mig: { starve: avgSeries(d => d.migrations && d.migrations.starve),
               misfit: avgSeries(d => d.migrations && d.migrations.misfit),
               random: avgSeries(d => d.migrations && d.migrations.random) },
        geneMean: {}, geneHist: {}, geneVillageMean: {}, geneVillageHist: {}, coopMean: {}, coopHist: {},
    };
    GENES.forEach(g => {
        a.geneMean[g] = avgSeries(d => d.geneMeans && d.geneMeans[g]);
        a.geneHist[g] = poolOf(d => d.geneHistograms && d.geneHistograms[g]);
        a.geneVillageMean[g] = avgSeries(d => d.geneVillageMeans && d.geneVillageMeans[g]);
        a.geneVillageHist[g] = poolOf(d => d.geneVillageHistograms && d.geneVillageHistograms[g]);
        a.coopMean[g] = { lo: avgSeries(d => d.geneCoopMeans && d.geneCoopMeans[g] && d.geneCoopMeans[g].lo),
                          mid: avgSeries(d => d.geneCoopMeans && d.geneCoopMeans[g] && d.geneCoopMeans[g].mid),
                          hi: avgSeries(d => d.geneCoopMeans && d.geneCoopMeans[g] && d.geneCoopMeans[g].hi) };
        a.coopHist[g] = { lo: poolOf(d => d.geneCoopHistograms && d.geneCoopHistograms[g] && d.geneCoopHistograms[g].lo),
                          mid: poolOf(d => d.geneCoopHistograms && d.geneCoopHistograms[g] && d.geneCoopHistograms[g].mid),
                          hi: poolOf(d => d.geneCoopHistograms && d.geneCoopHistograms[g] && d.geneCoopHistograms[g].hi) };
    });
    // corr(coop, gene) over time from the replicate-averaged 6x6 covariance.
    a.coopCorr = {}; POLICY.forEach(g => a.coopCorr[g] = []);
    const covDocs = docs.map(d => d.geneCovariance).filter(c => Array.isArray(c) && c.length);
    a.hasCov = covDocs.length > 0;
    if (a.hasCov) {
        const order = (docs.find(d => d.geneOrder) || {}).geneOrder || GENES;
        const ng = order.length, ci = order.indexOf('coop'), len = Math.min(...covDocs.map(c => c.length));
        for (let t = 0; t < len; t++) {
            const M = Array.from({ length: ng }, () => new Array(ng).fill(0));
            covDocs.forEach(c => { for (let i = 0; i < ng; i++) for (let j = 0; j < ng; j++) M[i][j] += c[t][i][j]; });
            for (let i = 0; i < ng; i++) for (let j = 0; j < ng; j++) M[i][j] /= covDocs.length;
            const vc = M[ci][ci];
            POLICY.forEach(g => { const gi = order.indexOf(g), denom = Math.sqrt(vc * M[gi][gi]); a.coopCorr[g].push(denom > 1e-9 ? M[ci][gi] / denom : NaN); });
        }
    }
    // Basin split (per-rep) → counts + each class's mean coop trajectory (drives the class graph).
    const groups = { coop: [], defect: [], polar: [], middling: [] };
    docs.forEach(d => groups[basinOf(d)].push(d));
    a._cats = { counts: {}, means: {} };
    for (const c of Object.keys(groups)) { a._cats.counts[c] = groups[c].length; a._cats.means[c] = avgArrays(groups[c].map(d => d.geneMeans && d.geneMeans.coop)); }
    return a;
}

// ── Cache: figcache/<collection>/<run>.json (keyed by run → instant hits; ?force=1 re-aggregates).
// Not keyed on rep count, because learning the count is itself the slow unindexed scan; while the
// sweep fills, the grid shows the live n and `force` refreshes. Most cells are already sufficient.
const sane = s => s.replace(/[^\w.-]/g, '_');
const cachePath = (collection, run) => path.join(CACHE_DIR, sane(collection), `${sane(run)}.json`);
function readCache(collection, run) { try { return fs.readFileSync(cachePath(collection, run), 'utf8'); } catch { return null; } }
function writeCache(collection, run, json) {
    const p = cachePath(collection, run);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, json);
}

async function aggForRun(collection, run, force) {
    if (!force) { const hit = readCache(collection, run); if (hit) { const o = JSON.parse(hit); o.cached = true; return o; } }
    const docs = await fetchRun(collection, run);
    if (!docs.length) return { run, reps: 0, empty: true };
    const agg = aggregate(docs);
    const parameters = docs[0].parameters || {};
    const payload = { run, reps: docs.length, parameters, finalCoop: lastFinite(agg.geneMean.coop), agg };
    writeCache(collection, run, JSON.stringify(payload));
    return payload;
}

// Grid state direct from Mongo — so the fig server works AFTER the sweep (when the coordinator
// has exited). Mirrors coordinator.syncFromMongo: one projected pass over the collection, group
// final coop by run, then per grid.json cell compute n / mean coop / sufficiency. Cached ~30s.
// Each sweep collection has its own generated cell-list file (see sweep/*.mjs generators).
const GRID_FILES = { balance_grid: 'grid.json', constitution_grid: 'constitution.json' };
const gridCells = collection => {
    try { return JSON.parse(fs.readFileSync(fileURLToPath(new URL('./' + (GRID_FILES[collection] || 'grid.json'), import.meta.url)), 'utf8')); }
    catch { return []; }
};
const gridCachePath = collection => path.join(CACHE_DIR, `_grid__${sane(collection)}.json`);
// Instant, no Mongo: the cell layout from the collection's grid file, coop uncoloured. The page
// colours cells lazily from each /agg click; a full scan (?full=1) fills them all in and caches.
function bareGrid(collection) {
    const cells = gridCells(collection);
    return { cells: cells.length, sufficient: 0, source: GRID_FILES[collection] || 'grid.json',
        detail: cells.map(c => ({ id: c.id, n: 0, done: false, coop: null, bistable: false })) };
}
let gridCache = { at: 0, collection: null, data: null };
async function gridFromMongo(collection) {
    if (gridCache.data && gridCache.collection === collection && Date.now() - gridCache.at < 30000) return gridCache.data;
    const s = await mongoSocket(); if (!s) throw new Error('Mongo not connected');
    const byRun = {};
    // $slice:-1 returns only the final coop per doc (small transfer; the Server still reads full
    // docs from Mongo, so this is ~one 1-min scan). Paginated at 500 (proven page size), and only
    // run once — preloaded at startup and cached to a file — so the cost is paid invisibly.
    for (let page = 0, limit = 500; ; page++) {
        const ack = await emitAck(s, 'find', { db: MONGO_DB, collection, query: {}, projection: { run: 1, 'geneMeans.coop': { $slice: -1 } }, limit, page }, 90000);
        const docs = (ack && ack.results) || [];
        for (const d of docs) { const c = d.geneMeans && d.geneMeans.coop, v = Array.isArray(c) ? lastFinite(c) : c; if (d.run != null && isFinite(v)) (byRun[d.run] ||= []).push(v); }
        if (docs.length < limit) break;
    }
    const cells = gridCells(collection);
    let sufficient = 0;
    const detail = cells.map(c => {
        const S = byRun[c.id] || [], n = S.length, ev = evaluate(S);
        if (ev.enough) sufficient++;
        return { id: c.id, n, done: ev.enough,
            coop: n ? S.reduce((a, b) => a + b, 0) / n : null,
            bistable: n >= DEFAULTS.minN && ev.regime === 'BISTABLE',
            p: n ? S.filter(v => v > DEFAULTS.threshold).length / n : null };
    });
    const data = { cells: cells.length, sufficient, source: 'mongo', workers: [], detail };
    gridCache = { at: Date.now(), collection, data };
    try { fs.writeFileSync(gridCachePath(collection), JSON.stringify(data)); } catch {}   // persist so /grid is instant next time
    return data;
}

const httpGet = url => new Promise((resolve, reject) => {
    http.get(url, r => { let b = ''; r.on('data', d => b += d); r.on('end', () => resolve(b)); }).on('error', reject);
});
const sendJSON = (res, obj, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
const MIME = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json' };

http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x'); const p = u.pathname;
    try {
        if (p === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(fs.readFileSync(FIGS, 'utf8')); return; }
        if (p.startsWith('/lib/')) {                       // serve the exact sim files the page renders with
            const name = p.slice(5);
            if (!/^[\w.-]+\.js$/.test(name)) { res.writeHead(400); res.end('bad'); return; }
            const file = path.join(ROOT, name);
            if (!fs.existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
            res.writeHead(200, { 'Content-Type': MIME['.js'] }); res.end(fs.readFileSync(file)); return;
        }
        if (p === '/grid') {
            const collection = u.searchParams.get('collection') || 'balance_grid';
            if (u.searchParams.get('full') === '1') {      // explicit full scan (slow; persists so later /grid is instant)
                try { return sendJSON(res, await gridFromMongo(collection)); }
                catch (e) { console.log(`[grid] full scan failed: ${e.message}`); return sendJSON(res, { error: 'scan failed: ' + e.message }, 502); }
            }
            try { const s = await httpGet(COORD + '/status'); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(s); return; }  // live sweep
            catch {}
            const cached = (() => { try { return fs.readFileSync(gridCachePath(collection), 'utf8'); } catch { return null; } })();
            if (cached) { const o = JSON.parse(cached); o.source = 'cache'; return sendJSON(res, o); }   // last full scan
            return sendJSON(res, bareGrid(collection));    // instant: layout only, colour fills in on click / full scan
        }
        if (p === '/agg') {
            const collection = u.searchParams.get('collection') || 'balance_grid';
            const run = u.searchParams.get('run');
            if (!run) return sendJSON(res, { error: 'run required' }, 400);
            const payload = await aggForRun(collection, run, u.searchParams.get('force') === '1');
            return sendJSON(res, payload);
        }
        res.writeHead(404); res.end('not found');
    } catch (e) { console.log(`[error] ${p} — ${e.message}`); sendJSON(res, { error: e.message }, 500); }
}).listen(PORT, () => {
    console.log(`figserver on http://0.0.0.0:${PORT}  (grid <- ${COORD}, data <- Mongo ${MONGO_DB}, cache -> ${path.relative(HERE, CACHE_DIR)}/)`);
    // Preload cell colours once in the background (the Server reads full docs, so the scan is
    // ~1 min) → /grid is instant and coloured from cache thereafter. Skipped if already cached.
    const dc = process.env.PRELOAD_COLLECTION || 'constitution_grid';
    if (!fs.existsSync(gridCachePath(dc))) {
        console.log(`[preload] scanning "${dc}" to colour the grid (one-time)…`);
        gridFromMongo(dc).then(g => console.log(`[preload] grid ready: ${g.sufficient}/${g.cells} cells sufficient, cached`)).catch(e => console.log(`[preload] failed (grid still works, colours fill on click): ${e.message}`));
    }
});
