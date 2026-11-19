/**
 * ports.mjs — deterministic, collision-tolerant port allocation for sweep servers.
 *
 * The problem this solves: three sweep projects (PopGenSim, Redistribution Dynamics,
 * Hierarchical Trades) all shipped `PORT || 8090`, and two batches of the SAME project
 * collide just as hard as two different projects. The dangerous failure was never
 * EADDRINUSE — it was a worker silently enrolling with whatever coordinator happened to
 * answer on :8090 and writing its runs into the wrong batch.
 *
 * The design, in one line: **the port is a hint; identity is the contract.**
 *
 *   1. A project's port is DERIVED from its name (FNV-1a → a 4-port block in 8200–8699).
 *      No registry to hand-maintain, no numbers to invent under pressure.
 *   2. Collisions are EXPECTED, not prevented. 26 projects into 125 blocks is a birthday
 *      problem — ~93% chance of some collision. So `bind()` probes forward on EADDRINUSE
 *      and announces the port it actually got.
 *   3. Because the port floats, nobody types one. `discover()` finds the coordinator by
 *      asking `/whoami` and matching (project, identity). A worker that cannot find its
 *      batch EXITS rather than joining the wrong one.
 *
 * That inversion is the point: with (3) in place, a port collision degrades from silent
 * data corruption to a cosmetic annoyance, which is why a merely-good hash is good enough.
 *
 * Usage — coordinator:
 *   import {bind, withWhoami} from './ports.mjs';
 *   const server = http.createServer(withWhoami(handler, {project: 'HierarchicalTrades',
 *                                                         identity: BATCH, role: 'coordinator'}));
 *   const {url} = await bind(server, {project: 'HierarchicalTrades', identity: BATCH});
 *
 * Usage — worker:
 *   import {discover} from './ports.mjs';
 *   const COORD = await discover({project: 'HierarchicalTrades', identity: BATCH});
 *
 * Escape hatches, both honoured before any hashing:
 *   PORT=8321        pin a server (the old muscle-memory override still works)
 *   COORD=http://... pin a client, skipping discovery entirely (remote workers need this)
 */

// ── Band ────────────────────────────────────────────────────────────────────────
// 8200–8699 deliberately dodges everything already spoken for on this box and mint:
// 8080 media-dashboard, 8081 Pulse, 8088/8089 Domestication (legacy), 8090/8091 (legacy),
// 8099 castd, 8123 DEM-GPU, 8787/8788 Agora, 8888 the Server, 9333 wasm-console.
const BAND_LO = 8200;
const BAND_HI = 8699;
const BLOCK = 4;                                    // coordinator, dashboard, figserver, aux
const NBLOCKS = (BAND_HI - BAND_LO + 1) / BLOCK;    // 125

// 125 = 5^3, so any stride not divisible by 5 is coprime with it and therefore visits
// every block before repeating. Separate strides so "slot 1" and "probed once" don't
// deterministically land on the same block.
const STRIDE_SLOT = 37;
const STRIDE_ATTEMPT = 53;

export const ROLES = {coordinator: 0, dashboard: 1, figserver: 2, aux: 3};

/** FNV-1a, 32-bit. Not cryptographic — just a good cheap scrambler. */
function fnv1a(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
}

/** Fold case and strip separators so 'Hierarchical Trades' === 'hierarchical-trades'. */
const canon = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * The port this (project, slot, role) lands on at a given probe attempt.
 * Pure and stable: same inputs → same port, on any machine, forever.
 */
export function portFor(project, {slot = 0, role = 'coordinator', attempt = 0} = {}) {
    const offset = ROLES[role];
    if (offset === undefined) throw new Error(`ports: unknown role '${role}' (have: ${Object.keys(ROLES).join(', ')})`);
    const block = (fnv1a(canon(project)) + slot * STRIDE_SLOT + attempt * STRIDE_ATTEMPT) % NBLOCKS;
    return BAND_LO + block * BLOCK + offset;
}

// ── Server side ─────────────────────────────────────────────────────────────────

/**
 * Wrap a request handler so it answers `/whoami` with this server's identity.
 * Everything else falls through untouched. This is the whole discovery contract —
 * uniform across projects regardless of what each one's /status happens to look like.
 */
export function withWhoami(handler, {project, identity, role = 'coordinator', slot = 0}) {
    return function (req, res) {
        if (req.method === 'GET' && (req.url === '/whoami' || req.url.startsWith('/whoami?'))) {
            res.writeHead(200, {'Content-Type': 'application/json'});
            return res.end(JSON.stringify({
                project, identity: String(identity), role, slot,
                pid: process.pid, startedAt: START,
            }));
        }
        return handler(req, res);
    };
}
const START = new Date().toISOString();

/**
 * Bind `server`, probing forward through the band while the port is taken.
 * Resolves {port, url}. Announces the real port loudly — with the port floating,
 * this log line is how you know where the dashboard actually is.
 */
export function bind(server, {project, identity, role = 'coordinator', slot = 0,
                              host = '127.0.0.1', maxAttempts = NBLOCKS} = {}) {
    const pinned = process.env.PORT ? parseInt(process.env.PORT) : null;

    return new Promise((resolve, reject) => {
        let attempt = 0;

        const tryNext = () => {
            const port = pinned ?? portFor(project, {slot, role, attempt});

            // Both listeners must be `once` AND mutually removed. `server.listen(port, host, cb)`
            // would register cb as a durable 'listening' listener that survives a failed attempt
            // and then fires — with a stale port closed over — when a later probe succeeds.
            const onError = err => {
                server.removeListener('listening', onListening);
                if (err.code !== 'EADDRINUSE') return reject(err);
                if (pinned) {
                    return reject(new Error(
                        `ports: PORT=${pinned} is pinned but already in use. Free it, or drop PORT ` +
                        `and let ${project} pick its own port.`));
                }
                if (++attempt >= maxAttempts) {
                    return reject(new Error(`ports: no free block for ${project} after ${maxAttempts} probes`));
                }
                setImmediate(tryNext);                    // next block in the probe order
            };

            const onListening = () => {
                server.removeListener('error', onError);
                const url = `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`;
                const via = pinned ? 'pinned via PORT' : attempt === 0 ? 'first choice' : `probe ${attempt}`;
                console.log(`[ports] ${project}/${identity} ${role} → ${url}  (${via})`);
                resolve({port, url});
            };

            server.once('error', onError);
            server.once('listening', onListening);
            server.listen(port, host);
        };

        tryNext();
    });
}

// ── Client side ─────────────────────────────────────────────────────────────────

async function whoami(host, port, timeoutMs) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
        const r = await fetch(`http://${host}:${port}/whoami`, {signal: ctl.signal});
        if (!r.ok) return null;
        return await r.json();
    } catch {
        return null;                                     // closed port, timeout, or not one of ours
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Find the coordinator serving (project, identity) and return its base URL.
 *
 * THROWS if it can't find one. That refusal is the safety property — a worker that
 * can't locate its own batch must die, not attach to a stranger's coordinator and
 * quietly poison their results file.
 *
 * `COORD` in the environment (or an explicit `url`) bypasses all of this, which is how
 * a worker on another machine reaches a coordinator it can't scan for.
 */
export async function discover({project, identity, role = 'coordinator', slot = 0,
                                host = '127.0.0.1', url = null, maxAttempts = NBLOCKS,
                                timeoutMs = 400, concurrency = 24} = {}) {
    const pinned = url || process.env.COORD;
    if (pinned) {
        const who = await whoami(new URL(pinned).hostname, new URL(pinned).port, timeoutMs * 4);
        if (who && String(who.identity) !== String(identity)) {
            throw new Error(
                `ports: COORD=${pinned} is serving '${who.identity}', not '${identity}'.\n` +
                `  Refusing to enroll — this is exactly the mix-up that corrupts a batch.`);
        }
        return pinned.replace(/\/$/, '');                // unreachable-but-pinned stays allowed (remote, starting up)
    }

    const candidates = [];
    for (let a = 0; a < maxAttempts; a++) candidates.push(portFor(project, {slot, role, attempt: a}));

    const seen = [];
    for (let i = 0; i < candidates.length; i += concurrency) {
        const batch = candidates.slice(i, i + concurrency);
        const results = await Promise.all(batch.map(async p => [p, await whoami(host, p, timeoutMs)]));
        for (const [port, who] of results) {
            if (!who) continue;
            if (who.project === project && String(who.identity) === String(identity)) {
                return `http://${host}:${port}`;
            }
            seen.push(`  :${port} — ${who.project}/${who.identity}`);
        }
    }

    throw new Error(
        `ports: no ${role} found for ${project}/${identity}.\n` +
        (seen.length ? `Live servers in the band:\n${seen.join('\n')}\n` : 'Nothing is listening in the band.\n') +
        `Start it first, or pass COORD=http://host:port to target one explicitly.`);
}

/** Human-readable map of where a project's servers would land, for docs and --help. */
export function describe(project, slot = 0) {
    return Object.keys(ROLES)
        .map(role => `${role.padEnd(12)} ${portFor(project, {slot, role})}`)
        .join('\n');
}
