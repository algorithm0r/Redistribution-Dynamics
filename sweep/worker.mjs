// worker.mjs — claim a cell from the coordinator, run it, write the full packet to the
// shared Mongo Server (same path runner.js uses), report coop back, repeat.
//
//   node worker.mjs [COORD_URL]        (default http://localhost:8090)
// Runs on any machine that can reach the coordinator (e.g. mint pointing at this host).
import os from 'node:os';
import { io } from 'socket.io-client';
import { runConfig, coopOf, serverIp } from './headless.mjs';

const COORD = process.argv[2] || process.env.COORD || 'http://localhost:8090';
const IP = serverIp();
const WID = process.pid, HOST = os.hostname();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const tag = `worker@${WID}`;

// Fresh socket per insert (a held-open socket starves socket.io's pings during the
// blocking sim loop and the insert never acks — same lesson as runner.js).
function insert(packet) {
    return new Promise((resolve, reject) => {
        const socket = io(IP, { transports: ['websocket', 'polling'], timeout: 15000 });
        const fail = e => { socket.close(); reject(e); };
        socket.on('connect_error', fail);
        setTimeout(() => fail(new Error('connect timeout')), 20000);
        socket.on('connect', () => {
            socket.emit('insert', packet, ack => {
                socket.close();
                if (ack && ack.ok) resolve(); else reject(new Error((ack && ack.error) || 'insert failed'));
            });
        });
    });
}
const post = (path, body) => fetch(COORD + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

(async () => {
    console.log(`${tag} on ${HOST}: coordinator ${COORD}, Mongo ${IP}`);
    let ran = 0;
    while (true) {
        let claim;
        try { claim = await (await fetch(COORD + '/claim?w=' + WID)).json(); }
        catch { await sleep(5000); continue; }             // coordinator not up yet / transient
        if (claim.done) break;
        if (claim.wait) { await sleep(4000); continue; }

        const t0 = Date.now();
        // Heartbeat (throttled to ~5s) so the coordinator/dashboard sees live progress and
        // can tell a working process from a dead one.
        let lastHb = 0;
        const onProgress = (tick, total, pop) => {
            const now = Date.now();
            if (now - lastHb < 5000) return;
            lastHb = now;
            post('/heartbeat', { worker: WID, host: HOST, cell: claim.id, rep: claim.rep, tick, total, pop }).catch(() => {});
        };
        const packet = await runConfig(claim.config, onProgress);
        const coop = coopOf(packet);
        try { if (packet) await insert(packet); } catch (e) { console.log(`${tag}: insert failed for ${claim.id}: ${e.message}`); }
        await post('/complete', { id: claim.id, coop, worker: WID }).catch(() => {});
        ran++;
        console.log(`${tag}: ${claim.id} rep ${claim.rep}  coop=${Number.isFinite(coop) ? coop.toFixed(3) : 'NaN'}  ${((Date.now() - t0) / 1000).toFixed(0)}s  (${ran} done)`);
    }
    console.log(`${tag}: coordinator says done — ran ${ran} cells. exiting.`);
})();
