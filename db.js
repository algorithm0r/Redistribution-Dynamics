'use strict';
/**
 * Standard DB client v2 — vendored into every project so nobody relearns the connection.
 * Canonical copy lives in ~/.claude/scaffold/db.js; `/new-project` copies it in, and
 * `/refresh-db` re-stamps it when the Server API evolves.
 *
 * v2 (2026-11-13) adds the experiment data protocol (conventions.md §4): numbered experiments,
 * a run's identity stamped into its PARAMETERS, and a JSON reading copy of every saved run.
 * Everything from v1 still works unchanged.
 *
 * One API, two transports:
 *   - 'socket' : via the mint research Server (socket.io over TLS). Use from browser sims
 *                and any remote/cross-machine client. Uses the Server's ack envelopes.
 *   - 'direct' : a direct MongoClient to mongodb://127.0.0.1:27017 (the Mint Tunnel forwards
 *                it on the desktop). Use from headless runners.
 *
 * Every method resolves to a normalised envelope: { ok: true, ... } or throws.
 *
 * ---- EXPERIMENTS (v2) -----------------------------------------------------------------
 *   const db  = createDB({ transport: 'direct', db: 'goatDB', project: 'Animal Domestication' });
 *   const ex  = await db.experiment('fodder', { question: 'Does rationed fodder ...?' });
 *                                    // NEW experiment: claims the next number -> ex.label 'exp047',
 *                                    // collection 'exp047_fodder', results/exp047_fodder/
 *   const ex  = await db.experiment('exp047');      // REOPEN an existing one to add runs
 *   const run = ex.run(PARAMETERS, { name: 'HmaxH_s1', seed: 1 });
 *                                    // stamps PARAMETERS.id = {project, exp, run, seed, commit,
 *                                    //   dirty, host, started}  (sync; do this BEFORE the run)
 *   await run.start();               // optional: writes a placeholder {complete:false} so a
 *                                    //   crashed/killed run is visible in the collection
 *   ... run the sim ...
 *   await run.save({ years, hist }); // writes Mongo (the record) + results/<coll>/<run>.json
 *                                    //   (the reading copy), complete:true
 *   await ex.finish();               // registry status 'done' (or finish('abandoned'))
 *   await db.export('exp047');       // rebuild the JSON copies from Mongo
 *   await db.experiments();          // the registry: [{_id:'exp047', slug, question, ...}]
 *
 *   Numbers are claimed by inserting {_id:'expNNN'} into the `experiments` collection, so two
 *   concurrent claims can never get the same number (on either transport). The floor is the
 *   highest number found in the registry, in collection names and in results/ folder names.
 *   Packets should stay small (conventions §4): sizes are measured in BSON, which is what
 *   Mongo's 16 MB limit counts (about 1.8x the JSON for long numeric series). The client warns
 *   above 4 MB; above 16 MB, or if Mongo refuses the document as too large, save() keeps the
 *   JSON copy, marks the run's placeholder {complete:false, storeError}, and throws.
 *   require('./db.js').bsonSize(doc) gives a packet's BSON size before a long run commits to it.
 *   Top-level data keys may not contain '.' or start with '$' (save() stores with $set).
 *
 * ---- v1 VERBS (unchanged) -------------------------------------------------------------
 *   await db.insert('runs', docs);                          // -> { ok, inserted }
 *   await db.find('runs', { gen: 5 }, { projection: { fitness: 1 }, limit: 50 });  // { ok, results }
 *   await db.count('runs', {});                             // -> { ok, count }
 *   const tmp = db.scratch();  await tmp.insert('roundtrip', { probe: 1 });  await db.dropScratch();
 *   await db.nextBatch();  db.packet(PARAMETERS, sample);   // legacy batch_NNN helpers
 *
 * Config: { transport, server, mongoUrl, db, project, results, files, repo, host, commit, run, scratch }
 *   transport 'socket'|'direct' (default 'socket')
 *   server    socket-mode Server URL (default https://localhost:8888)
 *   mongoUrl  direct-mode Mongo URL (default mongodb://127.0.0.1:27017)
 *   db        database name (required in practice)
 *   project   project name stamped into PARAMETERS.id (default: db name)
 *   results   folder for JSON reading copies (node; default <cwd>/results)
 *   files     write JSON reading copies (node default true; always false in a browser)
 *   repo      git working dir for the commit stamp (node; default cwd)
 *   host      host label (node default os.hostname(); browser default 'browser')
 *   commit    commit label for browsers, which can't run git (default 'unknown')
 *   run       optional run-name stamped into legacy packet()
 *   scratch   if true, ALL ops target <db>_scratch
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.createDB = factory().createDB;
})(typeof self !== 'undefined' ? self : this, function () {

  const isNode = typeof module !== 'undefined' && !!module.exports;
  const scratchName = (name) => name + '_scratch';
  const nowISO = () => new Date().toISOString();
  const EXP_RE = /^exp(\d{3,})(?:_|$)/;
  const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,19}$/;
  const WARN_BYTES = 4 * 1024 * 1024;
  const MAX_BYTES = 16 * 1024 * 1024;
  const pad = (n) => String(n).padStart(3, '0');

  // Exact BSON size of a JSON-like document, as the node driver serializes it: integers in
  // int32 range are int32 (4 bytes), other numbers doubles (8); every array element carries a
  // type byte and its index as a key. Mongo's 16 MB limit is on BSON, which runs ~1.8x the JSON
  // for long numeric series (goat sim, 2026-11-13: 12 MB JSON = 21.2 MB BSON). Pure JS so it
  // works in the browser too; tests check it against the driver's BSON.calculateObjectSize.
  function utf8Len(s) {
    let n = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c < 0x80) n += 1;
      else if (c < 0x800) n += 2;
      else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) { n += 4; i++; }
      else n += 3;
    }
    return n;
  }
  function bsonValueSize(v) {
    if (v === null || v === undefined) return 0;
    switch (typeof v) {
      case 'boolean': return 1;
      case 'number': return (Number.isInteger(v) && v >= -2147483648 && v <= 2147483647) ? 4 : 8;
      case 'string': return 4 + utf8Len(v) + 1;
      case 'object':
        if (v instanceof Date) return 8;
        if (v._bsontype === 'ObjectId' || v._bsontype === 'ObjectID') return 12;
        if (typeof v.toJSON === 'function' && !Array.isArray(v)) return bsonValueSize(v.toJSON());
        return bsonDocSize(v);
      default: return 0;   // functions/symbols are not stored
    }
  }
  function bsonDocSize(doc) {
    let n = 5;   // int32 length + trailing 0x00
    if (Array.isArray(doc)) {
      for (let i = 0; i < doc.length; i++) {
        const v = doc[i];
        if (typeof v === 'function' || typeof v === 'symbol') continue;
        n += 1 + String(i).length + 1 + bsonValueSize(v === undefined ? null : v);
      }
    } else {
      for (const k in doc) {
        if (!Object.prototype.hasOwnProperty.call(doc, k)) continue;
        const v = doc[k];
        if (typeof v === 'function' || typeof v === 'symbol') continue;
        n += 1 + utf8Len(k) + 1 + bsonValueSize(v);
      }
    }
    return n;
  }
  const isTooLarge = (e) => /BSONObjectTooLarge|too large|exceeds|16793600|maximum allowed/i.test(String(e && (e.message || e)));

  function createDB(config) {
    const cfg = Object.assign({
      transport: 'socket',
      server: 'https://localhost:8888',
      mongoUrl: 'mongodb://127.0.0.1:27017',
      db: 'test',
      project: null,
      results: null,
      files: isNode,
      repo: null,
      host: null,
      commit: null,
      run: null,
      scratch: false,
    }, config || {});
    if (!isNode) cfg.files = false;

    const dbName = cfg.scratch ? scratchName(cfg.db) : cfg.db;

    // ---- socket transport (browser global `io`, or node socket.io-client) ----
    let socketPromise = null;
    function getSocket() {
      if (socketPromise) return socketPromise;
      socketPromise = new Promise((resolve, reject) => {
        let io;
        if (isNode) { const m = require('socket.io-client'); io = m.io || m.connect || m; }
        else io = (typeof self !== 'undefined' ? self : globalThis).io;   // browser: the page's socket.io global
        if (!io) return reject(new Error('socket.io client not available'));
        const socket = io(cfg.server, { rejectUnauthorized: false, transports: ['websocket', 'polling'] });
        socket.on('connect', () => resolve(socket));
        socket.on('connect_error', (e) => reject(new Error('connect_error: ' + (e && e.message || e))));
      });
      return socketPromise;
    }
    function emitAck(event, payload) {
      return getSocket().then((socket) => new Promise((resolve, reject) => {
        let done = false;
        const t = setTimeout(() => { if (!done) { done = true; reject(new Error(event + ' ack timeout (Server without acks?)')); } }, 15000);
        socket.emit(event, payload, (res) => {
          if (done) return;
          done = true; clearTimeout(t);
          if (res && res.ok === false) reject(new Error(event + ': ' + res.error));
          else resolve(res);
        });
      }));
    }

    // ---- direct transport (node mongodb driver, lazy singleton) ----
    let clientPromise = null;
    function getMongo() {
      if (clientPromise) return clientPromise;
      const { MongoClient } = require('mongodb');
      const client = new MongoClient(cfg.mongoUrl);
      clientPromise = client.connect().then(() => client);
      return clientPromise;
    }
    const coll = (name) => getMongo().then((c) => c.db(dbName).collection(name));

    // ---- verbs (dispatch on transport, normalise to { ok, ... }) ----
    async function insert(collection, data) {
      if (cfg.transport === 'socket') return emitAck('insert', { db: dbName, collection, data });
      const c = await coll(collection);
      const arr = Array.isArray(data) ? data : [data];
      let inserted = 0;
      for (let i = 0; i < arr.length; i += 500) {
        const r = await c.insertMany(arr.slice(i, i + 500));
        inserted += r.insertedCount;
      }
      return { ok: true, inserted };
    }
    async function find(collection, query, opts) {
      opts = opts || {};
      if (cfg.transport === 'socket')
        return emitAck('find', { db: dbName, collection, query, projection: opts.projection, limit: opts.limit, page: opts.page });
      const c = await coll(collection);
      const cur = c.find(query || {}, { projection: opts.projection });
      if (opts.limit != null || opts.page != null) {
        const limit = opts.limit != null ? opts.limit : 20, page = opts.page || 0;
        cur.skip(page * limit).limit(limit);
      }
      return { ok: true, results: await cur.toArray() };
    }
    async function count(collection, query) {
      if (cfg.transport === 'socket') return emitAck('count', { db: dbName, collection, query });
      const c = await coll(collection);
      const n = (query && Object.keys(query).length) ? await c.countDocuments(query) : await c.estimatedDocumentCount();
      return { ok: true, count: n };
    }
    async function distinct(collection, key, query) {
      if (cfg.transport === 'socket') return emitAck('distinct', { db: dbName, collection, key, query });
      const c = await coll(collection);
      return { ok: true, values: await c.distinct(key, query || {}) };
    }
    async function update(collection, query, change, options) {
      if (cfg.transport === 'socket') return emitAck('update', { db: dbName, collection, query, change, options });
      const c = await coll(collection);
      const r = await c.updateMany(query, change, options || {});
      return { ok: true, matched: r.matchedCount, modified: r.modifiedCount, upserted: r.upsertedCount || 0 };
    }
    async function listCollections() {
      if (cfg.transport === 'socket') return (await emitAck('listCollections', { db: dbName })).collections || [];
      const client = await getMongo();
      return (await client.db(dbName).listCollections().toArray()).map((c) => c.name);
    }

    // ---- legacy helpers (v1) ----
    function packet(parameters, data) {
      return Object.assign({}, data, { _parameters: parameters, _ts: nowISO(), _run: cfg.run });
    }
    async function nextBatch(prefix) {
      prefix = prefix || 'batch';
      const names = await listCollections();
      const nums = names.filter((n) => n.indexOf(prefix + '_') === 0)
        .map((n) => parseInt(n.slice(prefix.length + 1), 10)).filter((n) => !isNaN(n));
      const next = (nums.length ? Math.max.apply(null, nums) : 0) + 1;
      return prefix + '_' + String(next).padStart(3, '0');
    }
    function scratch() {
      return createDB(Object.assign({}, cfg, { scratch: true }));
    }
    async function dropScratch() {
      const target = scratchName(cfg.db);
      if (cfg.transport === 'socket') return emitAck('dropDatabase', { db: target });
      const client = await getMongo();
      await client.db(target).dropDatabase();
      return { ok: true, dropped: target };
    }

    // ---- v2: experiment protocol (conventions.md §4) ----
    const REGISTRY = 'experiments';
    const node = isNode ? { fs: require('fs'), path: require('path'), os: require('os'), cp: require('child_process') } : null;
    const resultsDir = () => node ? (cfg.results || node.path.join(process.cwd(), 'results')) : null;

    function stamp() {
      let commit = cfg.commit || 'unknown', dirty = null;
      const host = cfg.host || (node ? node.os.hostname() : 'browser');
      if (node && !cfg.commit) {
        try {
          commit = node.cp.execSync('git describe --always --dirty --tags', { cwd: cfg.repo || process.cwd(), stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
          dirty = /-dirty$/.test(commit);
        } catch (e) { commit = 'no-git'; }
      }
      return { commit, dirty, host };
    }
    function isDupKey(e) { return /E11000|duplicate key/i.test(String(e && (e.message || e))); }
    // The Server's find defaults to 20 results and turns a string _id into an ObjectId, so
    // v2 queries the registry by `label` (never _id) and pages through every list.
    async function findAll(collection, query, projection) {
      const out = [];
      for (let page = 0; ; page++) {
        const got = (await find(collection, query, { projection, limit: 500, page })).results;
        out.push.apply(out, got);
        if (got.length < 500) return out;
      }
    }
    const byLabel = async (label) => (await find(REGISTRY, { label }, { limit: 1 })).results[0];

    async function highestNumber() {
      let hi = 0;
      const take = (s) => { const m = EXP_RE.exec(String(s)); if (m) hi = Math.max(hi, parseInt(m[1], 10)); };
      (await listCollections()).forEach(take);
      (await findAll(REGISTRY, {}, { label: 1 })).forEach((d) => take(d.label));
      const dir = resultsDir();
      if (dir && node.fs.existsSync(dir)) node.fs.readdirSync(dir).forEach(take);
      return hi;
    }

    async function experiment(slugOrLabel, opts) {
      opts = opts || {};
      // REOPEN: 'exp047'
      if (/^exp\d{3,}$/.test(slugOrLabel)) {
        const got = await byLabel(slugOrLabel);
        if (!got) throw new Error('experiment ' + slugOrLabel + ' is not in ' + dbName + '.' + REGISTRY);
        return handle(got);
      }
      // NEW: claim the next number
      const slug = slugOrLabel;
      if (!SLUG_RE.test(String(slug))) throw new Error('experiment slug must be 1-20 chars of a-z, 0-9, "-" (got "' + slug + '")');
      if (!opts.question) throw new Error('experiment("' + slug + '") needs { question }: the one-line question from its EXPLOG pre-registration');
      const st = stamp();
      let n = (await highestNumber()) + 1;
      for (let tries = 0; tries < 50; tries++, n++) {
        const label = 'exp' + pad(n);
        const claim = Math.random().toString(36).slice(2) + Date.now().toString(36);
        const doc = { _id: label, label, exp: n, slug, collection: label + '_' + slug, question: opts.question,
          project: cfg.project || cfg.db, created: nowISO(), commit: st.commit, host: st.host, status: 'running', claim };
        try { await insert(REGISTRY, doc); }
        catch (e) {
          if (isDupKey(e)) continue;
          // the Server hides the duplicate-key reason behind a generic message: look the label up
          const there = await byLabel(label);
          if (there && there.claim !== claim) continue;   // someone else claimed this number
          if (!there) throw e;                            // a real failure, not a race
        }
        return handle(doc);
      }
      throw new Error('could not claim an experiment number after 50 tries');
    }

    function handle(meta) {
      const collName = meta.collection, label = meta.label;
      const fileDir = () => { const d = resultsDir(); return d ? node.path.join(d, collName) : null; };
      if (cfg.files) node.fs.mkdirSync(fileDir(), { recursive: true });

      function run(parameters, ropts) {
        ropts = ropts || {};
        if (!parameters || typeof parameters !== 'object') throw new Error('run() needs the PARAMETERS object');
        const name = ropts.name;
        if (!name || !/^[A-Za-z0-9._-]+$/.test(name)) throw new Error('run() needs { name } of letters, digits, . _ - (the project run-name grammar, including the seed)');
        const seed = ropts.seed != null ? ropts.seed : parameters.seed;
        const st = stamp();
        parameters.id = { project: cfg.project || cfg.db, exp: label, run: name, seed: seed == null ? null : seed,
          commit: st.commit, dirty: st.dirty, host: st.host, started: nowISO() };
        const key = { _run: name };

        async function guard() {
          if (ropts.overwrite) return;
          const r = (await find(collName, { _run: name, complete: true }, { projection: { _run: 1 }, limit: 1 })).results;
          if (r.length) throw new Error(label + ': run "' + name + '" already exists (pass { overwrite: true } to replace it)');
        }
        async function start() {
          await guard();
          await update(collName, key, { $set: { _run: name, _parameters: parameters, complete: false, started: parameters.id.started } }, { upsert: true });
          return { ok: true };
        }
        async function save(data) {
          await guard();
          data = data || {};
          for (const k of Object.keys(data)) if (k.indexOf('.') >= 0 || k[0] === '$') throw new Error('save(): top-level data key "' + k + '" may not contain "." or start with "$"');
          const doc = Object.assign({}, data, { _run: name, _parameters: parameters, started: parameters.id.started, finished: nowISO(), complete: true });
          let file = null;
          if (cfg.files) { file = node.path.join(fileDir(), name + '.json'); node.fs.writeFileSync(file, JSON.stringify(doc)); }
          // the limit is on BSON (plus the _id Mongo adds), not on the JSON text
          const bytes = bsonDocSize(doc) + 17;
          const mb = (bytes / 1048576).toFixed(1);
          const refuse = async (why) => {
            const msg = label + '/' + name + ': ' + why + ', NOT stored in Mongo' +
              (file ? ' (JSON copy written to ' + file + ')' : '') + '. Shrink it: turn off unused diagnostics, sample at larger gaps (conventions §4).';
            try { await update(collName, key, { $set: { _run: name, _parameters: parameters, complete: false, storeError: why } }, { upsert: true }); } catch (e) {}
            console.error('[db] ' + msg);
            throw new Error(msg);
          };
          if (bytes > MAX_BYTES) await refuse('packet is ' + mb + ' MB of BSON, over Mongo\'s 16 MB limit');
          if (bytes > WARN_BYTES) console.warn('[db] ' + label + '/' + name + ': packet is ' + mb + ' MB of BSON (> 4 MB). Consider thinning diagnostics or sampling (conventions §4).');
          try { await update(collName, key, { $set: doc, $unset: { storeError: '' } }, { upsert: true }); }
          catch (e) { if (isTooLarge(e)) await refuse('Mongo refused the packet as too large (' + mb + ' MB of BSON by the client\'s count)'); throw e; }
          return { ok: true, exp: label, collection: collName, run: name, bytes, file };
        }
        return { start, save, name, parameters };
      }

      async function finish(status) {
        return update(REGISTRY, { label }, { $set: { status: status || 'done', updated: nowISO() } });
      }
      return { label, slug: meta.slug, collection: collName, question: meta.question, run, finish, meta };
    }

    async function experiments() {
      return (await findAll(REGISTRY, {})).sort((a, b) => a.exp - b.exp);
    }

    async function exportExperiment(label, dir) {
      if (!node) throw new Error('export() runs in node only');
      const meta = await byLabel(label);
      if (!meta) throw new Error('experiment ' + label + ' is not in ' + dbName + '.' + REGISTRY);
      const out = node.path.join(dir || resultsDir(), meta.collection);
      node.fs.mkdirSync(out, { recursive: true });
      const names = (await findAll(meta.collection, {}, { _run: 1 })).map((d) => d._run);
      let written = 0;
      for (const name of names) {
        const doc = (await find(meta.collection, { _run: name }, { limit: 1 })).results[0];
        if (!doc) continue;
        delete doc._id;
        node.fs.writeFileSync(node.path.join(out, name + '.json'), JSON.stringify(doc));
        written++;
      }
      return { ok: true, dir: out, written };
    }

    async function close() {
      if (clientPromise) { try { (await clientPromise).close(); } catch (e) {} clientPromise = null; }
      if (socketPromise) { try { const s = await socketPromise; s.close && s.close(); } catch (e) {} socketPromise = null; }
    }

    return { insert, find, count, distinct, update, listCollections, packet, nextBatch, scratch, dropScratch,
      experiment, experiments, export: exportExperiment, close, dbName, config: cfg };
  }

  return { createDB, bsonSize: bsonDocSize };
});
