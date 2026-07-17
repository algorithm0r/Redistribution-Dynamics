// coordinator.mjs — one in-memory adaptive dispatcher (streamlines the domestication
// driver + coordinator + queue into a single service). Holds the grid, hands cells to
// workers fewest-dispatched-first, and grows each cell's rep budget from the live coop
// CIs until it's sufficient (stats.mjs) or hits maxN.
//
//   node coordinator.mjs [grid.json] [PORT]        (defaults grid.json, 8090)
//
// HTTP (workers talk to this):
//   GET  /claim              -> { id, config, rep } | { wait: true } | { done: true }
//   POST /complete {id,coop} -> { ok: true }
//   GET  /status             -> { cells, dispatched, completed, sufficient, ... }
// RD uses 8090/8091 so it can run beside domestication's 8088/8089.
import fs from 'node:fs';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';
import { evaluate, DEFAULTS } from './stats.mjs';

const GRID = process.argv[2] || fileURLToPath(new URL('./grid.json', import.meta.url));
const PORT = parseInt(process.argv[3] || process.env.PORT || '8090');
const DASH = fileURLToPath(new URL('./dashboard.html', import.meta.url));   // dashboard served from this file (edit live, no restart)

const STALE_MS = parseInt(process.env.STALE_MS || '300000');   // no heartbeat this long -> worker is dead, reclaim its cell. Well above a run (~2.5min) + heartbeat lag under load, so a slow-but-alive worker is never reaped (which would dupe its cell)
const SYNC_MS  = parseInt(process.env.SYNC_MS  || '180000');   // re-load results from Mongo this often (source of truth)
const GRACE_MS = parseInt(process.env.GRACE_MS || '15000');    // on startup, wait for in-flight workers' heartbeats to re-register before dispatching (anti-dupe on coordinator-only restart)
const MONGO_IP = process.env.MONGO_IP || 'https://research.climbinggiants.com:8888';
const MONGO_DB = process.env.MONGO_DB || 'redistribution_dynamics';

const grid = JSON.parse(fs.readFileSync(GRID, 'utf8'));
const cells = grid.map(c => ({ id: c.id, config: c.config, dispatched: 0, samples: [], done: false }));
const byId = new Map(cells.map(c => [c.id, c]));
const COLLECTION = (grid[0] && grid[0].config && grid[0].config.collection) || 'select_draft_grid';
const workers = new Map();       // wid -> { host, cell, rep, tick, total, pop, ts }  (live progress)
const assignments = new Map();   // wid -> { cellId, ts }  (open dispatch, for orphan reaping)
console.log(`coordinator: ${cells.length} cells, minN=${DEFAULTS.minN}, maxN=${DEFAULTS.maxN}, target coop CI ±${DEFAULTS.eLevel} / p ±${DEFAULTS.eP}`);

// ── Mongo as source of truth ────────────────────────────────────────────────
// Seed cell samples from what's already in the collection (so restarts never re-run
// completed reps) and re-sync periodically. Each cell's samples = final coop of each of
// its docs; a rep that failed to persist simply isn't counted (it gets re-run). /complete
// still adds live for immediacy — the next sync reconciles to Mongo.
const lastFinite = a => { if (!Array.isArray(a)) return NaN; for (let i = a.length - 1; i >= 0; i--) if (Number.isFinite(a[i])) return a[i]; return NaN; };
function emitAck(socket, event, payload, ms = 30000) {
    return new Promise((resolve, reject) => {
        socket.emit(event, payload, ack => resolve(ack));
        setTimeout(() => reject(new Error(event + ' ack timeout')), ms);
    });
}
let mongo = null;
async function mongoSocket() {
    if (mongo && mongo.connected) return mongo;
    mongo = io(MONGO_IP, { transports: ['websocket', 'polling'], timeout: 15000 });
    await new Promise(res => { mongo.on('connect', res); setTimeout(res, 18000); });
    return mongo.connected ? mongo : null;
}
async function syncFromMongo(tag = 'sync') {
    try {
        const s = await mongoSocket();
        if (!s) { console.log(`[${tag}] Mongo not connected — skipping`); return; }
        const byRun = {};
        for (let page = 0, limit = 500; ; page++) {
            const ack = await emitAck(s, 'find', { db: MONGO_DB, collection: COLLECTION, query: {}, projection: { run: 1, 'geneMeans.coop': 1 }, limit, page });
            const docs = (ack && ack.results) || [];
            for (const d of docs) { const v = lastFinite(d.geneMeans && d.geneMeans.coop); if (d.run != null && Number.isFinite(v)) (byRun[d.run] ||= []).push(v); }
            if (docs.length < limit) break;
        }
        let reps = 0, done = 0;
        for (const c of cells) { c.samples = byRun[c.id] || []; c.done = evaluate(c.samples).enough; reps += c.samples.length; if (c.done) done++; }
        console.log(`[${tag}] loaded ${reps} reps from Mongo (${COLLECTION}) across ${Object.keys(byRun).length} cells; ${done}/${cells.length} already sufficient`);
    } catch (e) { console.log(`[${tag}] Mongo sync failed: ${e.message}`); }
}

// A cell needs more while not sufficient and under its (adaptively growing) rep budget.
// Keyed on COMPLETED reps (samples, from Mongo) — durable across restarts, unlike the
// per-session dispatch counter.
const budget = c => Math.min(DEFAULTS.maxN, Math.max(DEFAULTS.minN, evaluate(c.samples).nNeeded));
const needsMore = c => !c.done && c.samples.length < budget(c);

// Cells with a rep in flight RIGHT NOW, derived from live heartbeats + open claims. This
// is the fix for restart-duping: the previous coordinator's dispatch counters are gone,
// but workers keep heartbeating the cell they're running, so we always know what's busy.
function inFlightCells() {
    const now = Date.now(), busy = new Set();
    for (const w of workers.values()) if (w.cell && now - w.ts < STALE_MS) busy.add(w.cell);
    for (const a of assignments.values()) busy.add(a.cellId);   // just-claimed, pre-first-heartbeat
    return busy;
}

// Dispatch policy: DOVETAIL — hand out the cell with the fewest COMPLETED reps that isn't
// already running, so every setting gets its Nth rep before any gets its (N+1)th and no
// cell is run in parallel while others still need a rep. Only when every remaining needy
// cell is already in flight (end-game) do we allow a parallel rep.
function nextCell() {
    const busy = inFlightCells();
    let best = null;
    for (const c of cells) {
        if (!needsMore(c) || busy.has(c.id)) continue;
        if (!best || c.samples.length < best.samples.length) best = c;
    }
    if (best) return best;
    for (const c of cells) {   // end-game: everything needy is in flight — allow a parallel rep
        if (!needsMore(c)) continue;
        if (!best || c.samples.length < best.samples.length) best = c;
    }
    return best;
}

function readBody(req) {
    return new Promise(res => { let b = ''; req.on('data', d => b += d); req.on('end', () => res(b)); });
}
const json = (res, obj) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };

// Live dashboard: a summary, a per-worker progress panel (heartbeats: cell + tick bar +
// pop, grouped by host), and 9 facets (franchiseMode × pSexual) of 5×5 β×ind grids
// coloured by state. Polls /status every 3s. CVD-safe blue/orange.
const PAGE = `<!doctype html><meta charset=utf8><title>select_draft_grid — coordinator</title>
<style>body{font:13px system-ui,sans-serif;margin:16px;background:#fafafa;color:#222}
h1{font-size:16px;margin:0 0 4px}#sum{margin:6px 0 12px;color:#444}h3{font-size:12px;margin:14px 0 6px;color:#555}
.facets{display:flex;flex-wrap:wrap;gap:18px}.facet{border:1px solid #ddd;border-radius:6px;padding:8px;background:#fff}
.facet h2{font-size:12px;margin:0 0 6px;font-weight:600}
table.g{border-collapse:collapse}table.g td,table.g th{width:36px;height:26px;text-align:center;font-size:10px;border:1px solid #eee}
th{color:#888;font-weight:500}.cell{font-weight:600;position:relative}.ax{color:#888;font-size:9px}
.rn{position:absolute;right:1px;bottom:-1px;font-size:8px;font-weight:400;opacity:.6}
.done{outline:2px solid #111;outline-offset:-2px}
.act{box-shadow:inset 0 0 0 2px #E69F00}
.bi::before{content:'';position:absolute;top:0;left:0;border:6px solid transparent;border-top-color:#CC79A7;border-left-color:#CC79A7}
.leg{display:inline-block;vertical-align:middle;width:120px;height:10px;border:1px solid #ccc;
background:linear-gradient(90deg,rgb(68,1,84),rgb(59,82,139),rgb(33,145,140),rgb(94,201,98),rgb(253,231,37))}
.wk{display:flex;flex-wrap:wrap;gap:6px}.w{width:150px;border:1px solid #e2e2e2;border-radius:5px;padding:5px 7px;background:#fff;font-size:11px}
.w .c{font-weight:600}.w .m{color:#999;font-size:10px}.bar{height:5px;background:#eee;border-radius:3px;margin:3px 0;overflow:hidden}
.bar>i{display:block;height:100%;background:#E69F00}.stale{opacity:.4}</style>
<h1>select_draft_grid — adaptive coordinator</h1><div id=sum>connecting…</div>
<h3 id=wkh>workers</h3><div class=wk id=wk></div>
<h3>grid — cell = mean coop <span class=leg></span> 0…1 · small number = reps · boxed = sufficient · <span style="color:#CC79A7">◤</span> = bistable (hover for %)</h3><div class=facets id=f></div>
<script>
const BETA=['0','0.5','1','2','4'], IND=['0','2','5','7','9'], FRAN=['off','A','B'], PSEX=['0','0.5','1'];
function parse(id){const m=id.match(/^b(.+?)_i(.+?)_f(.+?)_s(.+)$/);return{b:m[1],i:m[2],f:m[3],s:m[4]};}
const VIR=[[68,1,84],[59,82,139],[33,145,140],[94,201,98],[253,231,37]];
function vir(t){t=Math.max(0,Math.min(1,t));const x=t*4,i=Math.floor(x),f=x-i,a=VIR[i],b=VIR[Math.min(4,i+1)];
 return 'rgb('+Math.round(a[0]+(b[0]-a[0])*f)+','+Math.round(a[1]+(b[1]-a[1])*f)+','+Math.round(a[2]+(b[2]-a[2])*f)+')';}
function col(c){return c.coop==null?'#e8e8e8':vir(c.coop);}   // cell = mean coop (viridis, CVD-safe)
async function tick(){let st;try{st=await(await fetch('/status')).json();}catch{document.getElementById('sum').textContent='coordinator not responding';return;}
 const active=new Set((st.workers||[]).map(w=>w.cell));
 document.getElementById('sum').innerHTML=\`<b>\${st.sufficient}/\${st.cells}</b> cells sufficient · \${st.completed} reps done · \${(st.workers||[]).length} running (\${active.size} distinct cells) · \${st.bistable} bistable\`;
 // workers
 const hs=Object.entries(st.hosts||{}).map(([h,n])=>h+' '+n).join(' · ')||'none';
 document.getElementById('wkh').textContent='workers ('+(st.workers||[]).length+' live: '+hs+')';
 const ws=(st.workers||[]).slice().sort((a,b)=>(a.host+a.cell).localeCompare(b.host+b.cell));
 document.getElementById('wk').innerHTML=ws.map(w=>{const pc=w.total?Math.min(100,100*w.tick/w.total):0;
  return \`<div class="w \${w.ageMs>20000?'stale':''}"><div class=c title="\${w.cell}">\${w.cell}</div>
   <div class=bar><i style="width:\${pc.toFixed(0)}%"></i></div>
   <div class=m>\${(w.tick||0)}/\${w.total} · pop \${w.pop||0} · \${w.host}</div></div>\`;}).join('')||'<i style="color:#999">no live workers yet</i>';
 // grid
 const by={};for(const c of st.detail){const p=parse(c.id);(by[p.f+'|'+p.s]||=({}))[p.b+'|'+p.i]=c;}
 let html='';for(const f of FRAN)for(const s of PSEX){html+=\`<div class=facet><h2>franchise \${f} · pSexual \${s}</h2><table class=g><tr><th class=ax>β→<br>ind↓</th>\`;
  for(const b of BETA)html+='<th>'+b+'</th>';html+='</tr>';
  for(const i of IND){html+='<tr><th>'+i+'</th>';for(const b of BETA){const c=(by[f+'|'+s]||{})[b+'|'+i]||{n:0,done:false,coop:null};
   const cid='b'+b+'_i'+i+'_f'+f+'_s'+s;const txt=c.coop!=null?c.coop.toFixed(2):'';const tc=c.coop!=null&&c.coop>0.6?'#222':'#fff';
   const ttl=cid+' n='+c.n+(c.bistable?' BISTABLE '+Math.round(c.p*100)+'% cooperate':'');
   html+=\`<td class="cell \${c.done?'done':''} \${active.has(cid)?'act':''} \${c.bistable?'bi':''}" style="background:\${col(c)};color:\${tc}" title="\${ttl}">\${txt}<span class=rn>\${c.n||''}</span></td>\`;}html+='</tr>';}
  html+='</table></div>';}
 document.getElementById('f').innerHTML=html;}
tick();setInterval(tick,3000);
</script>`;

try { if (!fs.existsSync(DASH)) fs.writeFileSync(DASH, PAGE); } catch {}   // seed the editable dashboard file once; thereafter edit dashboard.html directly (no restart)

await syncFromMongo('resume');   // seed from Mongo before accepting claims (restart-safe)
const startTs = Date.now();

let started = 0, sessionCompletes = 0;   // completions since this coordinator started (for throughput)
http.createServer(async (req, res) => {
    const url = req.url.split('?')[0];
    if (req.method === 'GET' && url === '/') {   // live status dashboard (served from dashboard.html — editable without restart)
        let html; try { html = fs.readFileSync(DASH, 'utf8'); } catch { html = PAGE; }
        res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(html); return;
    }
    if (req.method === 'GET' && url === '/claim') {
        if (Date.now() - startTs < GRACE_MS) return json(res, { wait: true });   // let heartbeats reveal in-flight cells first
        const w = new URL(req.url, 'http://x').searchParams.get('w');
        const c = nextCell();
        if (c) {
            c.dispatched++; started++;
            if (w) assignments.set(w, { cellId: c.id, ts: Date.now() });   // just-claimed -> busy until first heartbeat
            return json(res, { id: c.id, config: c.config, rep: c.samples.length + 1 });
        }
        // nothing claimable now: done if no cell needs more, else reps are still in flight
        return json(res, cells.some(needsMore) ? { wait: true } : { done: true });
    }
    if (req.method === 'POST' && url === '/heartbeat') {
        const h = JSON.parse(await readBody(req) || '{}');
        if (h.worker != null) {
            const prev = workers.get(h.worker);
            const startTs = (prev && prev.cell === h.cell) ? prev.startTs : Date.now();   // reset the run timer when the cell changes
            workers.set(h.worker, { host: h.host, cell: h.cell, rep: h.rep, tick: h.tick, total: h.total, pop: h.pop, ts: Date.now(), startTs });
            const a = assignments.get(h.worker); if (a) a.ts = Date.now();   // keep the dispatch alive
        }
        return json(res, { ok: true });
    }
    if (req.method === 'POST' && url === '/complete') {
        const { id, coop, worker } = JSON.parse(await readBody(req) || '{}');
        const c = byId.get(id);
        if (c && Number.isFinite(coop)) {
            c.samples.push(coop); sessionCompletes++;
            if (evaluate(c.samples).enough) c.done = true;
        }
        if (worker != null) { assignments.delete(worker); workers.delete(worker); }
        return json(res, { ok: true });
    }
    if (req.method === 'GET' && url === '/status') {
        const completed = cells.reduce((s, c) => s + c.samples.length, 0);
        const sufficient = cells.filter(c => c.done).length;
        const bistable = cells.filter(c => c.samples.length >= DEFAULTS.minN && evaluate(c.samples).regime === 'BISTABLE').length;
        const now = Date.now();
        const live = [...workers.entries()].map(([wid, w]) => ({ worker: wid, host: w.host, cell: w.cell,
            rep: w.rep, tick: w.tick, total: w.total, pop: w.pop, ageMs: now - w.ts, runMs: now - (w.startTs || w.ts) }));
        const hosts = {}; for (const w of live) hosts[w.host] = (hosts[w.host] || 0) + 1;
        // Throughput + ETA from this coordinator session. remainingReps = reps still needed
        // across not-done cells at current (adaptive) budgets; grows if cells turn bistable.
        const uptimeMs = now - startTs;
        const ratePerMin = uptimeMs > 1000 ? sessionCompletes / (uptimeMs / 60000) : 0;
        let remainingReps = 0;
        for (const c of cells) if (!c.done) remainingReps += Math.max(0, budget(c) - c.samples.length);
        const etaMs = ratePerMin > 0 ? (remainingReps / ratePerMin) * 60000 : null;
        return json(res, { cells: cells.length, sufficient, bistable, dispatched: started, completed,
            running: live.length, workers: live, hosts,
            uptimeMs, sessionCompletes, ratePerMin, remainingReps, etaMs,
            detail: cells.map(c => {
                const S = c.samples, n = S.length;
                return { id: c.id, n, done: c.done,
                    coop: n ? S.reduce((s, x) => s + x, 0) / n : null,
                    bistable: n >= DEFAULTS.minN && evaluate(S).regime === 'BISTABLE',
                    p: n ? S.filter(v => v > DEFAULTS.threshold).length / n : null };   // fraction that cooperated
            }) });
    }
    res.writeHead(404); res.end('not found');
}).listen(PORT, () => console.log(`listening on http://0.0.0.0:${PORT}  (workers: --coord http://<this-host>:${PORT})`));

// Periodic: prune dead workers/claims (they drop out of the busy set, so their cell is
// re-claimable), progress line, auto-exit.
setInterval(() => {
    const now = Date.now();
    let reaped = 0;
    for (const [wid, w] of workers) if (now - w.ts > STALE_MS) { workers.delete(wid); reaped++; }
    for (const [wid, a] of assignments) if (now - a.ts > STALE_MS) assignments.delete(wid);
    const completed = cells.reduce((s, c) => s + c.samples.length, 0);
    const done = cells.filter(c => c.done).length;
    const hostStr = [...new Set([...workers.values()].map(w => w.host))].join(',') || 'none';
    console.log(`[status] ${done}/${cells.length} sufficient | ${completed} reps | ${workers.size} running (${hostStr})${reaped ? ` | reaped ${reaped} dead` : ''}`);
    if (done === cells.length) { console.log('\nALL CELLS SUFFICIENT — done.'); process.exit(0); }
}, 15000);

// Re-sync from Mongo (source of truth): reconciles /complete tallies, picks up any
// external inserts, and drops reps whose persist failed so they get re-run.
setInterval(() => syncFromMongo('resync'), SYNC_MS);
