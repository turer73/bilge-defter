'use strict';
// Actual application source + native IndexedDB, synthetic approved account.
// Instrumentation observes requests; it does not replace inflateRecord or IDB.
// Root owns execution. Never use this runner against a live/student origin.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const crypto = require('node:crypto'), assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const repo = path.resolve(__dirname, '..');
const root = path.resolve(process.env.BILGE_TEST_ROOT || path.join(__dirname, 'bilge-defter-test'));
const args = process.argv.slice(2), arg = name => args.find(x => x.startsWith('--' + name + '='))?.slice(name.length + 3);
assert.ok(args.every(x => /^--(?:out|engine|case)=.+/.test(x)), 'Unknown argument');
const filter = arg('case'), engineFilter = arg('engine');
assert.ok(!engineFilter || ['chromium', 'webkit'].includes(engineFilter), 'Unknown engine');
const runId = new Date().toISOString().replace(/[:.]/g, '-') + '-' + crypto.randomUUID().slice(0, 8);
const out = path.resolve(arg('out') || process.env.BILGE_ASSET_READING_OUT || path.join(repo, 'outputs/asset-reading-20261011', runId));
assert.ok(out.startsWith(path.join(repo, 'outputs') + path.sep), 'Evidence must stay under repo outputs');
assert.ok(!fs.existsSync(out), 'Refuse to reuse an evidence directory');
fs.mkdirSync(out, { recursive: true });
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
function sourceFiles(dir, prefix = '') {
  const result = new Map();
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    assert.ok(!entry.isSymbolicLink(), 'No symlink source traversal');
    const name = prefix + entry.name, file = path.join(dir, entry.name);
    if (entry.isDirectory()) for (const pair of sourceFiles(file, name + '/')) result.set(...pair);
    else result.set('/' + name, fs.readFileSync(file));
  }
  return result;
}
const hashes = files => Object.fromEntries([...files].map(([k, v]) => [k, sha(v)]).sort(([a], [b]) => a.localeCompare(b)));
const files = sourceFiles(root), source = hashes(files), servers = new Set(), contexts = new Set();
const report = { startedAt: new Date().toISOString(), root, runnerSha256: sha(fs.readFileSync(__filename)), source,
  results: [], releaseEligible: false, boundaries: [
    'Local synthetic account and data only. HTTP is loopback GET only; no external requests are allowed.',
    'Actual source is served byte-for-byte. Native IndexedDB prototypes are observed/fault-injected only in isolated browser contexts.',
    'Request concurrency is not total RAM, RSS, GPU or physical iPad acceptance.',
    'Fully materialized notebook schema remains unchanged; this is not lazy runtime storage or staged import.'
  ] };
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm' };
async function deadline(promise, ms, label) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error(label + ' exceeded ' + ms + 'ms')), ms); })]); }
  finally { clearTimeout(timer); }
}
async function fixture(browser, name) {
  const external = [], errors = [], methods = [];
  const server = http.createServer((req, res) => {
    methods.push(req.method);
    if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
    const url = new URL(req.url, 'http://loopback');
    if (url.pathname === '/api/v1/bilge-defter/whoami') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ account_protocol: 'approval-v1', identity: { type: 'access', id: '11111111-1111-4111-8111-111111111111', status: 'approved', role: 'student', email: 'asset-reading@example.test' } })); return;
    }
    const filename = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname), content = files.get(filename);
    res.writeHead(content ? 200 : 404, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(content || '');
  });
  servers.add(server); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  let context;
  try {
    context = await browser.newContext({ viewport: { width: 1180, height: 820 }, serviceWorkers: 'block', acceptDownloads: true }); contexts.add(context);
    context.setDefaultTimeout(20000);
    await context.tracing.start({ snapshots: true, screenshots: false, sources: true });
    await context.addInitScript(() => { window.__accountRequired = true; localStorage.setItem('bilge_defter_onboarding_v1', 'true'); try { delete Navigator.prototype.serviceWorker; } catch {} });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (['http:', 'https:'].includes(url.protocol) && url.origin !== origin) { external.push(url.href); return route.abort(); }
      return route.continue();
    });
    const p = await context.newPage(); p.on('pageerror', error => errors.push(error.message));
    await p.goto(origin); await p.waitForFunction(() => typeof ready !== 'undefined' && ready && window.__v2UI);
    await p.evaluate(async () => {
      if (!await flushSave()) throw Error('Initial save failed');
      if (assetSweep) await assetSweep;
      // Keep unrelated automatic migration out of precise registry assertions.
      ASSET_WRITE = false; clearTimeout(assetTimer); assetTimer = null; clearTimeout(assetRetryTimer); assetRetryTimer = null;
    });
    await p.evaluate(installHarness);
    return { p, context, external, errors, methods,
      async finish() {
        try { await context.tracing.stop({ path: path.join(out, name + '-trace.zip') }); }
        finally { try { await context.close(); contexts.delete(context); }
          finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); servers.delete(server); } }
      } };
  } catch (error) {
    if (context) { await context.close().catch(() => {}); contexts.delete(context); }
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); servers.delete(server); throw error;
  }
}

function installHarness() {
  const T = window.__assetTest = {};
  T.registry = () => JSON.stringify({ refs: [...assetRefs], stored: [...storedAssets], epoch: assetEpoch });
  T.lock = () => dispatchEvent(new StorageEvent('storage', { key: 'bilge-defter-account-logout', newValue: 'synthetic-test' }));
  T.freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) T.freeze(child); } return value; };
  T.put = rows => withDB(d => new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, 'readwrite'), store = tx.objectStore(STORE);
    for (const [key, value] of rows) { if (value === undefined) store.delete(key); else store.put(value, key); }
    tx.oncomplete = resolve; tx.onabort = () => reject(tx.error || Error('Seed transaction aborted')); tx.onerror = () => {};
  }));
  T.seed = async ({ count = 3, unpadded = false } = {}) => {
    const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 100;
    const c = canvas.getContext('2d'), rows = [], refs = [], images = [];
    for (let i = 0; i < count; i++) {
      c.fillStyle = `rgb(${i % 256},${Math.floor(i / 256)},113)`; c.fillRect(0, 0, 1000, 100);
      c.fillStyle = '#fafafa'; c.fillRect(i % 1000, 0, 1, 1);
      let image = canvas.toDataURL('image/png');
      if (unpadded) {
        for (let n = 0; n < 30 && !/=+$/.test(image); n++) { c.fillStyle = `rgb(${n},49,75)`; c.fillRect(n + 1, 1, 1, 1); image = canvas.toDataURL('image/png'); }
        if (!/=+$/.test(image)) throw Error('Unpadded fixture requires a padded source');
        image = image.replace(/=+$/, '');
      }
      const ref = 'asset:' + await sha256Hex(image); refs.push(ref); images.push(image); rows.push([ref, { data: image, t: Date.now() }]);
    }
    canvas.width = canvas.height = 1;
    if (new Set(refs).size !== count) throw Error('Fixture sources are not distinct');
    await T.put(rows);
    const pages = refs.map((ref, i) => ({ id: 'synthetic-page-' + i, title: 'Synthetic ' + i, strokes: [], viewY: 0,
      pdf: { image: ref, width: 1000, height: 100, name: 'synthetic.pdf', number: 1, total: 1 }, updated: '2026-10-11T00:00:00.000Z' }));
    pages[0].strokes.push({ tool: 'image', image: refs[0], imageWidth: 1000, imageHeight: 100, width: 120, points: [{ x: 20, y: 20 }] });
    const book = { version: 4, pages, active: pages[0].id, trash: [{ page: { ...pages[0], id: 'synthetic-trash', strokes: [] }, notebookTitle: 'Synthetic', deletedAt: '2026-10-11T00:00:00.000Z', position: 0 }] };
    const expected = structuredClone(book);
    for (let i = 0; i < count; i++) expected.pages[i].pdf.image = images[i];
    expected.pages[0].strokes[0].image = images[0]; expected.trash[0].page.pdf.image = images[0];
    const sentinel = 'asset:' + 'f'.repeat(64);
    assetRefs.set('data:image/png;base64,c2VudGluZWw=', sentinel); storedAssets.add(sentinel);
    T.book = T.freeze(book); T.refs = refs; T.images = images; T.expected = expected; T.raw = JSON.stringify(book); T.before = T.registry();
    return { count, chars: images.reduce((sum, x) => sum + x.length, 0), validExpected: validState(expected), padded: images.filter(x => /=+$/.test(x)).length };
  };
  T.probe = (options = {}) => {
    const nativeGet = IDBObjectStore.prototype.get, nativeTx = IDBDatabase.prototype.transaction, nativeOpen = IDBFactory.prototype.open;
    const scope = DB, records = [], ids = new WeakMap(); let next = 0;
    const q = T.observation = { gets: [], transactions: [], events: [], active: 0, peak: 0, successes: 0, opens: 0, earlyPublication: false, injected: 0, writer: null };
    const register = tx => {
      let id = ids.get(tx); if (id) return id;
      id = ++next; ids.set(tx, id); const record = { id, mode: tx.mode, gets: 0, completed: false, aborted: false }; records.push(record); q.transactions.push(record);
      return id;
    };
    IDBFactory.prototype.open = function (...args) { if (args[0] === scope) q.opens++; return nativeOpen.apply(this, args); };
    IDBDatabase.prototype.transaction = function (...args) {
      const tx = nativeTx.apply(this, args);
      // Register before product oncomplete. Reading all rows is not yet a
      // committed transaction, even if the last success callback has run.
      // Both status observers must precede product handlers: engines may run a
      // Promise checkpoint between event listeners, before a late observer.
      if (this.name === scope) {
        tx.addEventListener('complete', () => {
          const id = ids.get(tx); if (!id) return;
          records.find(record => record.id === id).completed = true; q.events.push('complete:' + id);
          if (T.registry() !== T.before) q.earlyPublication = true;
        });
        tx.addEventListener('abort', () => {
          const id = ids.get(tx); if (!id) return;
          records.find(record => record.id === id).aborted = true; q.events.push('abort:' + id);
        });
      }
      return tx;
    };
    IDBObjectStore.prototype.get = function (key) {
      if (T.failNextAssetGet && this.transaction.db.name === scope && typeof key === 'string' && /^asset:/.test(key)) {
        const fault = T.failNextAssetGet; T.failNextAssetGet = false;
        if (fault.closeObserved) {
          const connection = this.transaction.db;
          connection.close(); connection.dispatchEvent(new Event('close'));
          q.observedCloseClearedConnection = db == null;
        }
        throw new DOMException('Injected recoverable asset-read connection error', fault.name || 'AbortError');
      }
      const request = nativeGet.call(this, key);
      if (this.transaction.db.name !== scope || typeof key !== 'string' || !/^asset:[a-f0-9]{64}$/.test(key)) return request;
      const tx = this.transaction, id = register(tx), record = records.find(x => x.id === id);
      record.gets++; q.gets.push({ key, tx: id }); q.events.push('get:' + id + ':' + key); q.active++; q.peak = Math.max(q.peak, q.active);
      let pending = true;
      const settled = () => { if (pending) { pending = false; q.active--; } };
      request.addEventListener('error', settled);
      request.addEventListener('success', () => {
        settled(); q.successes++; q.events.push('success:' + id + ':' + key);
        if (T.registry() !== T.before) q.earlyPublication = true;
        const trigger = options.at === key || options.at === q.successes;
        if (!trigger || (!options.repeat && q.injected)) return;
        q.injected++;
        if (options.action === 'abort') tx.abort();
        else if (options.action === 'lock') T.lock();
        else if (options.action === 'generation') dispatchEvent(new Event('bilge-account-locked'));
        else if (options.action === 'db') DB = 'bilge-defter-account-synthetic-drift';
        else if (options.action === 'mutate') {
          T.book.pages[0].pdf.image = 'asset:' + 'e'.repeat(64);
          T.mutatedInput = JSON.stringify(T.book);
        }
        else if (options.action === 'connection') { db = T.replacementConnection; T.failNextAssetGet = true; }
        else if (options.action === 'observed-close') T.failNextAssetGet = { name: 'UnknownError', closeObserved: true };
        else if (options.action === 'writer') {
          const writer = T.writerConnection.transaction(STORE, 'readwrite'), store = writer.objectStore(STORE);
          q.writer = { queued: true, completed: false, atReadCount: q.successes };
          for (const ref of T.refs) store.put({ data: T.replacementImage, t: Date.now() }, ref);
          T.writerDone = new Promise((resolve, reject) => { writer.oncomplete = () => { q.writer.completed = true; q.events.push('writer-complete'); resolve(); }; writer.onabort = () => reject(writer.error || Error('Writer aborted')); writer.onerror = () => {}; });
        }
      });
      return request;
    };
    T.stopProbe = () => { IDBObjectStore.prototype.get = nativeGet; IDBDatabase.prototype.transaction = nativeTx; IDBFactory.prototype.open = nativeOpen; };
    return q;
  };
  T.run = async () => {
    let result, error;
    try { result = await inflateRecord(T.book); T.result = result; }
    catch (e) { error = { name: e?.name, message: e?.message }; }
    return { resolved: !error, error, exact: result !== undefined && JSON.stringify(result) === JSON.stringify(T.expected),
      unchangedInput: JSON.stringify(T.book) === T.raw, sameRegistry: T.registry() === T.before,
      registryEntries: assetRefs.size, storedCount: storedAssets.size, epoch: assetEpoch,
      observation: T.observation, valid: result !== undefined && validState(result) };
  };
}

async function check(browser, engine, name, fn, timeout = 90000) {
  if (filter && !name.includes(filter)) return;
  console.log('RUN ' + engine + ': ' + name); let f, result;
  const label = engine + '-' + name.replace(/[^a-z0-9]+/gi, '-');
  try {
    f = await deadline(fixture(browser, label), 30000, 'fixture');
    const detail = await deadline(fn(f), timeout, name);
    assert.deepEqual(f.external, []); assert.deepEqual(f.errors, []); assert.ok(f.methods.every(x => x === 'GET'));
    assert.equal(f.context.serviceWorkers().length, 0);
    result = { engine, name, passed: true, detail };
  } catch (error) {
    let observation;
    if (f) try { observation = await deadline(f.p.evaluate(() => __assetTest.observation || null), 2000, 'failure diagnostic'); } catch {}
    result = { engine, name, passed: false, error: String(error.stack || error), observation };
  } finally {
    if (f) try { await deadline(f.finish(), 5000, 'fixture cleanup'); }
    catch (error) { result = { ...(result || { engine, name }), passed: false, cleanupError: String(error.stack || error) }; }
  }
  report.results.push(result); console.log((result.passed ? 'PASS ' : 'FAIL ') + engine + ': ' + name);
  if (!result.passed) console.error(result.error || result.cleanupError);
}
const assertSuccess = result => { assert.equal(result.resolved, true, JSON.stringify(result.error)); assert.equal(result.exact, true); assert.equal(result.unchangedInput, true); assert.equal(result.valid, true); };
const assertSerial = (result, count) => {
  const q = result.observation; assert.equal(q.peak, 1, 'At most one unresolved native asset get'); assert.equal(q.active, 0);
  assert.equal(q.gets.length, count, 'Each unique reference is read once'); assert.equal(new Set(q.gets.map(x => x.key)).size, count);
  assert.equal(q.transactions.length, 1, 'One consistent readonly transaction'); assert.equal(q.transactions[0].mode, 'readonly');
  assert.equal(q.transactions[0].completed, true); assert.equal(q.earlyPublication, false, 'Registry publishes only after transaction completion');
};
const assertFailure = (result, error) => { assert.equal(result.resolved, false); if (error) assert.equal(result.error.name, error); assert.equal(result.unchangedInput, true); assert.equal(result.sameRegistry, true, 'No partial global registry side effects'); };

async function run(browser, engine) {
  if (filter === 'runner deadline negative control') {
    await check(browser, engine, filter, async ({ p }) => { await deadline(p.evaluate(() => new Promise(() => {})), 250, 'Intentional never-resolving negative control'); }, 5000); return;
  }
  await check(browser, engine, 'serial one transaction unique refs include duplicate trash and media', async ({ p }) => {
    const seeded = await p.evaluate(() => __assetTest.seed({ count: 4 })); assert.equal(seeded.validExpected, true);
    const result = await p.evaluate(async () => { __assetTest.probe(); return __assetTest.run(); });
    assertSuccess(result); assertSerial(result, 4); assert.equal(result.registryEntries, 5); assert.equal(result.storedCount, 5); return result;
  });
  await check(browser, engine, 'exact materialization and independent downloaded JSON backup', async ({ p }) => {
    await p.evaluate(() => __assetTest.seed());
    const result = await p.evaluate(async () => { __assetTest.probe(); return __assetTest.run(); }); assertSuccess(result); assertSerial(result, 3);
    const expected = await p.evaluate(() => { __assetTest.stopProbe(); state = __assetTest.result; activeId = state.active; activeNotebook = GENERAL; return __assetTest.expected; });
    const [download] = await Promise.all([p.waitForEvent('download'), p.evaluate(() => exportNotebook())]);
    const filename = path.join(out, engine + '-independent-backup.json'); await download.saveAs(filename);
    const text = fs.readFileSync(filename, 'utf8'), backup = JSON.parse(text);
    assert.deepEqual(backup.pages, expected.pages); assert.deepEqual(backup.trash, expected.trash); assert.equal(text.includes('asset:'), false);
    assert.ok(text.includes('data:image/png;base64,')); return { result, backupSha256: sha(text), backupBytes: Buffer.byteLength(text) };
  });
  for (const invalid of ['missing', 'nonobject', 'nonstring', 'not-image']) await check(browser, engine, 'later ' + invalid + ' asset rejects with no registry publication and no retry', async ({ p }) => {
    await p.evaluate(() => __assetTest.seed());
    await p.evaluate(async invalid => {
      const value = invalid === 'missing' ? undefined : invalid === 'nonobject' ? 5 : invalid === 'nonstring' ? { data: 19 } : { data: 'https://example.test/not-an-image' };
      await __assetTest.put([[__assetTest.refs.at(-1), value]]); __assetTest.probe();
    }, invalid);
    const result = await p.evaluate(() => __assetTest.run()); assertFailure(result, 'MissingAsset');
    assert.equal(result.observation.transactions.length, 1); assert.equal(result.observation.opens, 0); assert.equal(result.observation.earlyPublication, false); return result;
  });
  await check(browser, engine, 'abort after last read never publishes before tx complete', async ({ p }) => {
    await p.evaluate(() => __assetTest.seed());
    const result = await p.evaluate(async () => { __assetTest.probe({ action: 'abort', at: __assetTest.refs.at(-1), repeat: true }); return __assetTest.run(); });
    assertFailure(result); assert.equal(result.observation.earlyPublication, false);
    assert.ok(result.observation.transactions.length >= 1 && result.observation.transactions.length <= 2);
    assert.ok(result.observation.transactions.every(tx => tx.aborted && !tx.completed)); assert.ok(result.observation.injected >= 1); return result;
  });
  await check(browser, engine, 'already locked account rejects before asset reading', async ({ p }) => {
    await p.evaluate(() => __assetTest.seed());
    const result = await p.evaluate(async () => { __assetTest.probe(); __assetTest.lock(); if (!BilgeAccount.locked) throw Error('Real account lock did not activate'); return __assetTest.run(); });
    assertFailure(result, 'AssetReadStale'); assert.equal(result.observation.gets.length, 0); assert.equal(result.observation.opens, 0); return result;
  });
  for (const action of ['lock', 'generation', 'db']) await check(browser, engine, 'mid-read ' + action + ' invalidates ownership without registry side effects', async ({ p }) => {
    await p.evaluate(() => __assetTest.seed());
    const result = await p.evaluate(async action => { __assetTest.probe({ action, at: 1 }); return __assetTest.run(); }, action);
    assertFailure(result, 'AssetReadStale'); assert.equal(result.observation.opens, 0);
    assert.equal(result.observation.transactions.length, 1); assert.equal(result.observation.earlyPublication, false); return result;
  });
  await check(browser, engine, 'closed native connection reopens once and publishes complete result', async ({ p }) => {
    await p.evaluate(() => __assetTest.seed());
    const result = await p.evaluate(async () => { __assetTest.probe(); db.close(); return __assetTest.run(); });
    assertSuccess(result); assertSerial(result, 3); assert.equal(result.observation.opens, 1); return result;
  });
  await check(browser, engine, 'replacement same-name connection is not closed or adopted by old retry', async ({ p }) => {
    await p.evaluate(() => __assetTest.seed());
    const detail = await p.evaluate(async () => {
      const T = __assetTest, oldConnection = db;
      T.replacementConnection = await new Promise((resolve, reject) => { const r = indexedDB.open(DB, 1); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
      T.probe({ action: 'connection', at: 1 });
      try {
        const result = await T.run(); T.stopProbe();
        let replacementUsable = false;
        try {
          const tx = T.replacementConnection.transaction(STORE, 'readonly'); tx.objectStore(STORE).get('app');
          await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); }); replacementUsable = true;
        } catch {}
        return { result, replacementUsable, sameGlobalConnection: db === T.replacementConnection };
      } finally { oldConnection.close(); T.replacementConnection.close(); }
    });
    assertFailure(detail.result); assert.equal(detail.result.observation.opens, 0);
    assert.equal(detail.result.observation.transactions.length, 1); assert.equal(detail.result.observation.gets.length, 1);
    assert.equal(detail.replacementUsable, true); assert.equal(detail.sameGlobalConnection, true); return detail;
  });
  await check(browser, engine, 'close-event ordering fault injection reopens cleared connection once', async ({ p }) => {
    await p.evaluate(() => __assetTest.seed());
    const result = await p.evaluate(async () => { __assetTest.probe({ action: 'observed-close', at: 1 }); return __assetTest.run(); });
    // A native connection is closed, but dispatch of the close event and the
    // UnknownError are injected. This is not an OS/storage-process-loss test.
    assertSuccess(result);
    const q = result.observation;
    assert.equal(q.observedCloseClearedConnection, true, 'Application close callback cleared its old handle');
    assert.equal(q.opens, 1); assert.equal(q.injected, 1); assert.equal(q.peak, 1); assert.equal(q.active, 0);
    assert.equal(q.earlyPublication, false); assert.equal(q.transactions.length, 2);
    assert.equal(q.transactions[0].aborted, true); assert.equal(q.transactions[0].completed, false);
    assert.equal(q.transactions[1].completed, true); assert.equal(q.transactions[1].aborted, false);
    assert.equal(q.gets.length, 4, 'First request plus complete three-asset retry');
    assert.equal(new Set(q.gets.map(x => x.key)).size, 3); return result;
  });
  await check(browser, engine, 'concurrent writer queues behind one coherent read snapshot', async ({ p }) => {
    await p.evaluate(() => __assetTest.seed({ count: 5 }));
    const detail = await p.evaluate(async () => {
      const T = __assetTest;
      T.writerConnection = await new Promise((resolve, reject) => { const r = indexedDB.open(DB, 1); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
      const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 100;
      canvas.getContext('2d').fillRect(0, 0, 1000, 100); T.replacementImage = canvas.toDataURL('image/png'); canvas.width = canvas.height = 1;
      T.probe({ action: 'writer', at: 1 });
      try {
        const result = await T.run(); if (!T.writerDone) throw Error('Concurrent writer was not queued'); await T.writerDone; T.stopProbe();
        const stored = await dbGet(T.refs.at(-1)); return { result, replacementOnDisk: stored.data === T.replacementImage };
      } finally { T.writerConnection.close(); }
    });
    assertSuccess(detail.result); assertSerial(detail.result, 5); assert.equal(detail.replacementOnDisk, true);
    const events = detail.result.observation.events;
    assert.ok(events.findIndex(x => x.startsWith('complete:')) >= 0);
    assert.ok(events.findIndex(x => x.startsWith('complete:')) < events.indexOf('writer-complete')); return detail;
  });
  await check(browser, engine, 'legacy unpadded base64 bytes survive without normalization', async ({ p }) => {
    const seeded = await p.evaluate(() => __assetTest.seed({ unpadded: true })); assert.equal(seeded.padded, 0); assert.equal(seeded.validExpected, true);
    const result = await p.evaluate(async () => { __assetTest.probe(); return __assetTest.run(); }); assertSuccess(result); assertSerial(result, 3); return result;
  });
  await check(browser, engine, 'caller ref mutation cannot substitute unread assets during hydration', async ({ p }) => {
    await p.evaluate(() => __assetTest.seed());
    const detail = await p.evaluate(async () => {
      const T = __assetTest; T.book = structuredClone(T.book);
      T.probe({ action: 'mutate', at: 1 }); const result = await T.run();
      return { result, mutatedByFixture: T.book.pages[0].pdf.image === 'asset:' + 'e'.repeat(64),
        inputOnlyFixtureMutation: JSON.stringify(T.book) === T.mutatedInput,
        originalImage: T.result?.pages[0].pdf.image === T.images[0],
        noUndefinedRegistry: [...assetRefs].every(([source, ref]) => typeof source === 'string' && typeof ref === 'string') && [...storedAssets].every(ref => typeof ref === 'string') };
    });
    assert.equal(detail.result.resolved, true, JSON.stringify(detail.result.error)); assert.equal(detail.result.exact, true);
    assert.equal(detail.result.valid, true); assertSerial(detail.result, 3);
    assert.equal(detail.mutatedByFixture, true); assert.equal(detail.inputOnlyFixtureMutation, true);
    assert.equal(detail.originalImage, true); assert.equal(detail.noUndefinedRegistry, true); return detail;
  });
  await check(browser, engine, 'malformed record shape behavior and source immutability stay compatible', async ({ p }) => {
    await p.evaluate(() => __assetTest.seed({ count: 1 }));
    const result = await p.evaluate(async () => {
      const T = __assetTest, unchanged = [];
      for (const value of [undefined, null, 7, 'plain', {}, { pages: null }, { pages: [] }, { pages: [{ strokes: [], pdf: { image: 'inline' } }] }]) {
        T.freeze(value); unchanged.push(await inflateRecord(value) === value);
      }
      const input = T.freeze({ pages: [null, 7, { pdf: { image: T.refs[0] }, strokes: null }], trash: [null, { extra: 1 }, { page: { pdf: { image: T.refs[0] }, strokes: [] } }] });
      const before = JSON.stringify(input); T.probe(); const inflated = await inflateRecord(input);
      return { unchanged, rawUnchanged: before === JSON.stringify(input), nullPage: inflated.pages[0], primitivePage: inflated.pages[1], malformedRefKept: inflated.pages[2].pdf.image === T.refs[0], trashNull: inflated.trash[0], trashExtra: inflated.trash[1], materializedTrash: inflated.trash[2].page.pdf.image === T.images[0], observation: T.observation };
    });
    assert.ok(result.unchanged.every(Boolean)); assert.equal(result.rawUnchanged, true); assert.equal(result.nullPage, null); assert.equal(result.primitivePage, 7);
    assert.equal(result.malformedRefKept, true); assert.equal(result.trashNull, null); assert.deepEqual(result.trashExtra, { extra: 1 }); assert.equal(result.materializedTrash, true);
    assert.equal(result.observation.gets.length, 1); return result;
  });
  await check(browser, engine, 'existing notebook over 100 distinct assets has no import cap', async ({ p }) => {
    const seeded = await p.evaluate(() => __assetTest.seed({ count: 105 })); assert.equal(seeded.validExpected, true);
    const result = await p.evaluate(async () => { __assetTest.probe(); return __assetTest.run(); }); assertSuccess(result); assertSerial(result, 105);
    assert.equal(result.registryEntries, 106); assert.equal(result.storedCount, 106); return { seeded, result };
  });
}

(async () => {
  for (const [engine, type] of Object.entries({ chromium, webkit })) {
    if (engineFilter && engineFilter !== engine) continue;
    const browser = await type.launch({ headless: true });
    try { await run(browser, engine); } finally { await deadline(browser.close(), 5000, 'browser cleanup'); }
  }
  assert.ok(report.results.length, 'No matching test cases');
  assert.deepEqual(hashes(sourceFiles(root)), source, 'Application source changed during execution');
  report.passed = report.results.filter(x => x.passed).length; report.failed = report.results.length - report.passed;
  report.finishedAt = new Date().toISOString(); fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, failed: report.failed, out })); process.exitCode = report.failed ? 1 : 0;
})().catch(error => {
  report.fatal = String(error.stack || error); fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(report, null, 2)); console.error(error); process.exitCode = 1;
}).finally(async () => {
  for (const context of contexts) await deadline(context.close().catch(() => {}), 3000, 'remaining context cleanup').catch(() => {});
  contexts.clear(); for (const server of servers) { server.closeAllConnections(); server.close(); } servers.clear();
});
