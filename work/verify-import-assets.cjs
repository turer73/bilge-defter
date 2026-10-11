'use strict';
// Local actual-importer acceptance. No PPTX renderer substitution: this narrower
// suite exercises its real raster commit boundary with deterministic PNG inputs.
// The separate PPTX staging suite covers the upstream picker/renderer/preview UI.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const crypto = require('node:crypto'), zlib = require('node:zlib'), assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const repo = path.resolve(__dirname, '..');
const root = path.resolve(process.env.BILGE_TEST_ROOT || path.join(__dirname, 'bilge-defter-test'));
const args = process.argv.slice(2), arg = name => args.find(v => v.startsWith('--' + name + '='))?.slice(name.length + 3);
assert.ok(args.every(v => /^--(?:out|engine|case)=.+$/.test(v)), 'Unknown argument');
const engineFilter = arg('engine'), caseFilter = arg('case');
assert.ok(!engineFilter || ['chromium', 'webkit'].includes(engineFilter), 'Unknown engine');
const out = path.resolve(arg('out') || path.join(repo, 'outputs/import-assets', new Date().toISOString().replace(/[:.]/g, '-') + '-' + crypto.randomUUID()));
assert.ok(out.startsWith(path.join(repo, 'outputs') + path.sep), 'Evidence must stay under repository outputs');
assert.ok(!fs.existsSync(out), 'Refuse to overwrite evidence'); fs.mkdirSync(out, { recursive: true });
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
function sourceFiles(dir, prefix = '') {
  const files = new Map();
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    assert.ok(!entry.isSymbolicLink(), 'No symlink source traversal');
    const name = prefix + entry.name, file = path.join(dir, entry.name);
    if (entry.isDirectory()) for (const pair of sourceFiles(file, name + '/')) files.set(...pair);
    else { assert.ok(entry.isFile()); files.set('/' + name, fs.readFileSync(file)); }
  }
  return files;
}
const hashes = files => Object.fromEntries([...files].map(([k, v]) => [k, sha(v)]).sort(([a], [b]) => a.localeCompare(b)));
const files = sourceFiles(root), source = hashes(files), resources = new Set();
const report = { ok: false, startedAt: new Date().toISOString(), root, source, runnerSha256: sha(fs.readFileSync(__filename)), results: [], releaseEligible: false,
  boundaries: [
    'Synthetic approved account, fresh context per case, loopback GET-only network. No student file, remote service, live database or production change.',
    'The real BilgeRasterImport capture/commit, save worker, IndexedDB, JSON export and startup hydration are exercised. Direct raster API entry is not the PPTX file-picker/renderer UI.',
    'PNG fixture bytes are deterministic Node zlib/CRC outputs and frozen once per run; every engine and BILGE_TEST_ROOT receives the same bytes.',
    'Measurements are first import worker-message JSON bytes, fallback native app-put JSON bytes and committed app-row JSON bytes. They are overlapping representations, not additive total disk I/O.',
    'Asset payload writes are reported separately. Hashing/JSON inspection has observer overhead. No elapsed-time, RAM/RSS/GC/GPU or physical iPad performance claim.',
    'All encoded images still exist in the candidate and runtime. This is not lazy runtime loading or a peak-memory reduction acceptance.',
    'Fault injection occurs at native IDB request/transaction boundaries. Lost acknowledgement throws after a genuine successful dbPut; it is not an OS crash or actual worker death.',
    'Partial promotion may leave unreferenced assets. Failure equality applies to app, app-writer, before-import and sync-state-v2, not every asset row.',
    'MissingAsset intentionally retains the existing one-time inline fallback, so an exceptional final notebook write can remain large.'
  ] };
fs.copyFileSync(__filename, path.join(out, 'runner.cjs'));
fs.writeFileSync(path.join(out, 'source.json'), JSON.stringify({ source, runnerSha256: report.runnerSha256 }, null, 2));

const crcTable = Array.from({ length: 256 }, (_, n) => { for (let i = 0; i < 8; i++) n = (n >>> 1) ^ ((n & 1) ? 0xedb88320 : 0); return n >>> 0; });
function crc32(bytes) { let n = 0xffffffff; for (const b of bytes) n = crcTable[(n ^ b) & 255] ^ (n >>> 8); return (n ^ 0xffffffff) >>> 0; }
function chunk(type, bytes) { const tag = Buffer.from(type), size = Buffer.alloc(4), crc = Buffer.alloc(4); size.writeUInt32BE(bytes.length); crc.writeUInt32BE(crc32(Buffer.concat([tag, bytes]))); return Buffer.concat([size, tag, bytes, crc]); }
function png(width, height, seed, noisy) {
  let rng = seed >>> 0;
  const random = () => { rng ^= rng << 13; rng ^= rng >>> 17; rng ^= rng << 5; return rng >>> 0; };
  const stride = width * 3 + 1, pixels = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const v = noisy ? random() : (((x >>> 4) * 13 + (y >>> 3) * 29 + seed * 17) >>> 0), i = y * stride + 1 + x * 3;
    pixels[i] = v & 255; pixels[i + 1] = noisy ? (v >>> 8) & 255 : (v * 3) & 255; pixels[i + 2] = noisy ? (v >>> 16) & 255 : (v * 7) & 255;
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(pixels, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
}
function imageFixture(name, width, height, seed, noisy) {
  const bytes = png(width, height, seed, noisy), image = 'data:image/png;base64,' + bytes.toString('base64');
  fs.writeFileSync(path.join(out, name + '.png'), bytes);
  return { name, width, height, image, dataURLChars: image.length, pngBytes: bytes.length, pngSha256: sha(bytes), dataURLSha256: sha(image) };
}
const oldImage = imageFixture('existing-note', 1000, 200, 37, false);
const large = [101, 211, 307, 419].map((seed, i) => imageFixture('large-' + (i + 1), 1000, 600, seed, true));
const small = [503, 601, 701].map((seed, i) => imageFixture('small-' + (i + 1), 1000, 200, seed, false));
const fixtureSummary = f => ({ name: f.name, width: f.width, height: f.height, pngBytes: f.pngBytes, dataURLChars: f.dataURLChars, pngSha256: f.pngSha256, dataURLSha256: f.dataURLSha256 });
report.fixtures = { existing: fixtureSummary(oldImage), large: large.map(fixtureSummary), small: small.map(fixtureSummary), largeOrder: [0, 1, 2, 3, 0, 2] };
const ink = i => [{ tool: 'pen', color: '#24567a', width: 2 + i / 10, points: [{ x: 100 + i, y: 50, p: .5 }, { x: 140 + i, y: 80, p: .7 }] }];
function candidate(big = false) {
  const images = big ? [large[0], large[1], large[2], large[3], large[0], large[2]] : small;
  return { name: 'Sentetik Öğrenim – sunum.pptx', newNotebook: false, pages: images.map((f, i) => ({ image: f.image, width: f.width, height: f.height, number: i + 1, total: images.length, strokes: ink(i) })) };
}
const bigCandidate = candidate(true), smallCandidate = candidate(false);
assert.ok(bigCandidate.pages.reduce((n, p) => n + p.image.length, 0) > 8 * 1024 * 1024, 'Large fixture must not accidentally become a tiny solid image');
assert.ok(bigCandidate.pages.reduce((n, p) => n + p.image.length, 0) < 24 * 1024 * 1024, 'Fixture remains within existing import limit');
fs.writeFileSync(path.join(out, 'fixtures.json'), JSON.stringify(report.fixtures, null, 2));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm', '.woff2': 'font/woff2' };
async function deadline(promise, ms, label) { let timer; try { return await Promise.race([promise, new Promise((_, no) => { timer = setTimeout(() => no(Error(label + ' exceeded ' + ms + 'ms')), ms); })]); } finally { clearTimeout(timer); } }

function installProbe() {
  const T = window.__importAssetsTest = { active: false, scope: DB, fault: null, events: [], transactions: [], workerPuts: [], appPuts: [], dbCalls: [], gates: [],
    assetAttempts: 0, assetCompleted: 0, openAssetTransactions: 0, maxOpenAssetTransactions: 0, injected: 0, deletedAsset: null, leaseCurrent: true, opens: [] };
  const original = { transaction: IDBDatabase.prototype.transaction, put: IDBObjectStore.prototype.put, open: IDBFactory.prototype.open, workerPost: window.Worker?.prototype.postMessage, dbPut };
  const infos = new WeakMap(); let sequence = 0;
  const hash = T.hash = async text => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), b => b.toString(16).padStart(2, '0')).join('');
  T.registryRaw = () => JSON.stringify({ refs: [...assetRefs], stored: [...storedAssets].sort(), epoch: assetEpoch });
  T.registry = async () => ({ sha256: await hash(T.registryRaw()), entries: await Promise.all([...assetRefs].map(async ([data, ref]) => ({ sha256: await hash(data), ref }))), stored: [...storedAssets].sort(), epoch: assetEpoch });
  T.jsonStats = async text => ({ chars: text.length, utf8Bytes: new TextEncoder().encode(text).byteLength, sha256: await hash(text),
    inlineImages: (text.match(/"image":"data:image\//g) || []).length, refImages: (text.match(/"image":"asset:[0-9a-f]{64}"/g) || []).length,
    uniqueRefs: [...new Set((text.match(/"image":"asset:[0-9a-f]{64}"/g) || []).map(x => x.slice(9, -1)))].sort() });
  T.readRows = async () => {
    const connection = await new Promise((ok, no) => { const r = original.open.call(indexedDB, T.scope, 1); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
    try { return await new Promise((ok, no) => { const tx = original.transaction.call(connection, STORE, 'readonly'), os = tx.objectStore(STORE), k = os.getAllKeys(), v = os.getAll(); tx.oncomplete = () => ok(k.result.map((key, i) => [key, v.result[i]])); tx.onabort = tx.onerror = () => no(tx.error || Error('Read rows failed')); }); }
    finally { connection.close(); }
  };
  T.runtime = async book => {
    const describe = async p => ({ id: p.id, title: p.title, notebookId: p.notebookId, strokes: p.strokes,
      ...(p.pdf ? { image: { sha256: await hash(p.pdf.image), chars: p.pdf.image.length, width: p.pdf.width, height: p.pdf.height, name: p.pdf.name, number: p.pdf.number, total: p.pdf.total } } : {}) });
    return { valid: validState(book), notebooks: book.notebooks || [], pages: await Promise.all(book.pages.map(describe)),
      trash: await Promise.all((book.trash || []).map(async t => ({ ...t, page: await describe(t.page) }))) };
  };
  T.snapshot = async () => {
    const rows = await T.readRows(), values = new Map(rows), controls = {};
    for (const key of ['app', 'app-writer', 'before-import', 'sync-state-v2']) controls[key] = values.has(key) ? await T.jsonStats(JSON.stringify(values.get(key))) : null;
    const assets = []; for (const [key, value] of rows) if (/^asset:[0-9a-f]{64}$/.test(key)) assets.push({ key, sha256: await hash(value.data), chars: value.data.length, t: value.t });
    return { controls, assets, registry: await T.registry(), runtime: await T.runtime(state), canEdit: canEdit(), conflict: saveConflict, worker: !!saveWorker, workerLost, scope: DB };
  };
  IDBFactory.prototype.open = function (name, ...args) { if (T.active) T.opens.push(String(name)); return original.open.call(this, name, ...args); };
  IDBDatabase.prototype.transaction = function (...args) {
    const tx = original.transaction.apply(this, args);
    if (!T.active || this.name !== T.scope) return tx;
    const info = { id: ++sequence, scope: this.name, mode: args[1] || 'readonly', assetPuts: 0, appPuts: 0, outcome: 'pending' }; infos.set(tx, info); T.transactions.push(info);
    tx.addEventListener('complete', () => {
      info.outcome = 'complete'; if (info.assetPuts) { T.openAssetTransactions--; T.assetCompleted += info.assetPuts; }
      T.events.push({ type: 'tx-complete', id: info.id, assetPuts: info.assetPuts, appPuts: info.appPuts });
      if (info.assetPuts && !T.injected && ['account-lock', 'scope-switch'].includes(T.fault)) {
        T.injected++; T.events.push({ type: T.fault, afterCompletedAssets: T.assetCompleted });
        if (T.fault === 'account-lock') dispatchEvent(new StorageEvent('storage', { key: 'bilge-defter-account-logout', newValue: 'synthetic-asset-test' }));
        else DB = T.scope + '-switched';
      }
    });
    tx.addEventListener('abort', () => { info.outcome = 'abort'; if (info.assetPuts) T.openAssetTransactions--; T.events.push({ type: 'tx-abort', id: info.id, assetPuts: info.assetPuts, appPuts: info.appPuts }); });
    return tx;
  };
  IDBObjectStore.prototype.put = function (value, key, ...rest) {
    const info = infos.get(this.transaction);
    if (!T.active || this.transaction.db.name !== T.scope || this.name !== STORE) return original.put.call(this, value, key, ...rest);
    if (typeof key === 'string' && /^asset:[0-9a-f]{64}$/.test(key)) {
      const attempt = ++T.assetAttempts;
      T.events.push({ type: 'asset-put-attempt', attempt, key, chars: value.data?.length, transaction: info?.id });
      if (T.fault === 'quota' && attempt >= 2) { T.injected++; throw new DOMException('Synthetic asset quota exhaustion', 'QuotaExceededError'); }
      const request = original.put.call(this, value, key, ...rest);
      if (info && !info.assetPuts++) { T.openAssetTransactions++; T.maxOpenAssetTransactions = Math.max(T.maxOpenAssetTransactions, T.openAssetTransactions); }
      if (T.fault === 'abort' && attempt >= 2) request.addEventListener('success', () => { T.injected++; T.events.push({ type: 'explicit-native-abort', transaction: info?.id }); this.transaction.abort(); }, { once: true });
      return request;
    }
    if (key === 'app') { if (info) info.appPuts++; T.appPuts.push({ transaction: info?.id, text: JSON.stringify(value) }); }
    return original.put.call(this, value, key, ...rest);
  };
  if (window.Worker) Worker.prototype.postMessage = function (message, ...args) {
    if (T.active && message?.type === 'put' && message.db === T.scope) T.workerPuts.push({ id: message.id, preservePrevious: message.preservePrevious, text: message.json });
    return original.workerPost.call(this, message, ...args);
  };
  dbPut = async (...args) => {
    if (!T.active || args[1]?.preservePrevious !== true) return original.dbPut(...args);
    const call = { outcome: 'pending', suppliedJson: typeof args[1].json === 'string' }; T.dbCalls.push(call);
    T.gates.push({ registry: await T.registry(), assetCompleted: T.assetCompleted, appPuts: T.appPuts.length, workerPuts: T.workerPuts.length });
    if (T.fault === 'missing' && T.dbCalls.length === 1) {
      const text = args[1]?.json || storedText(args[0]), refs = [...new Set((text.match(/"image":"asset:[0-9a-f]{64}"/g) || []).map(x => x.slice(9, -1)))];
      const key = refs.find(ref => T.newRefs.includes(ref));
      if (key) {
        await new Promise((ok, no) => { const tx = original.transaction.call(db, STORE, 'readwrite'); tx.objectStore(STORE).delete(key); tx.oncomplete = ok; tx.onabort = tx.onerror = () => no(tx.error || Error('Delete injection failed')); });
        T.deletedAsset = key; T.injected++; T.events.push({ type: 'deleted-before-final-write', key });
      }
    }
    try {
      await original.dbPut(...args); call.outcome = 'resolved';
      if (T.fault === 'lost-ack' && !T.injected) { T.injected++; T.events.push({ type: 'lost-ack-after-real-dbPut' }); throw Object.assign(Error('Synthetic lost reply after persisted import'), { name: 'SaveWorkerLost' }); }
    } catch (error) { call.outcome = 'rejected'; call.name = error.name; call.message = error.message; throw error; }
  };
  T.start = ({ fault, refs, disabled }) => { T.fault = fault; T.newRefs = refs; if (disabled) ASSET_WRITE = false; T.beforeRegistry = T.registryRaw(); T.active = true; };
  T.commit = async value => {
    const lease = BilgeRasterImport.capture({ guard: () => T.leaseCurrent }); if (!lease) throw Error('Real import lease unavailable');
    if (T.fault === 'closed-before-preparation') { db.close(); db = null; T.injected++; T.events.push({ type: 'native-close-and-null-after-lease' }); }
    try { const result = await BilgeRasterImport.commit(value, lease); return { resolved: true, result }; }
    catch (error) { return { resolved: false, name: error.name, message: error.message }; }
  };
  T.stop = () => { T.active = false; if (DB === T.scope + '-switched') DB = T.scope; };
  T.summary = async () => ({ assetAttempts: T.assetAttempts, assetCompleted: T.assetCompleted, maxOpenAssetTransactions: T.maxOpenAssetTransactions, injected: T.injected, deletedAsset: T.deletedAsset,
    transactions: T.transactions, events: T.events, dbCalls: T.dbCalls, gates: T.gates, opens: T.opens,
    workerPuts: await Promise.all(T.workerPuts.map(async ({ text, ...info }) => ({ ...info, ...(await T.jsonStats(text)) }))),
    appPuts: await Promise.all(T.appPuts.map(async ({ text, ...info }) => ({ ...info, ...(await T.jsonStats(text)) }))) });
}

async function fixture(browser, f) {
  f.external = []; f.errors = []; f.consoleErrors = []; f.requests = []; f.workers = []; f.closed = false;
  f.server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://loopback'); f.requests.push({ method: req.method, path: url.pathname });
    if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
    if (url.pathname === '/api/v1/bilge-defter/whoami') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ account_protocol: 'approval-v1', identity: { type: 'access', id: '11111111-1111-4111-8111-111111111111', status: 'approved', role: 'student', email: 'asset-promotion@example.test' } })); return; }
    const name = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname), bytes = files.get(name);
    res.writeHead(bytes ? 200 : 404, { 'Content-Type': mime[path.extname(name)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(bytes || '');
  });
  await new Promise((ok, no) => { f.server.once('error', no); f.server.listen(0, '127.0.0.1', ok); }); if (f.closed) throw Error('Fixture canceled');
  f.origin = 'http://127.0.0.1:' + f.server.address().port;
  f.context = await browser.newContext({ viewport: { width: 1180, height: 920 }, acceptDownloads: true }); if (f.closed) { await f.context.close(); throw Error('Fixture canceled'); }
  f.context.setDefaultTimeout(20000); f.context.on('page', p => { p.on('pageerror', e => f.errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') f.consoleErrors.push(m.text()); }); });
  f.context.on('serviceworker', w => f.workers.push(w.url())); await f.context.tracing.start({ screenshots: false, snapshots: true, sources: true });
  await f.context.addInitScript(({ origin, fallback }) => { if (top !== window || location.origin !== origin) return; window.__accountRequired = true; localStorage.setItem('bilge_defter_onboarding_v1', 'true'); try { delete Navigator.prototype.serviceWorker; } catch {} if (fallback) Object.defineProperty(window, 'Worker', { configurable: true, value: undefined }); }, { origin: f.origin, fallback: f.writer === 'fallback' });
  await f.context.route('**/*', route => { const url = new URL(route.request().url()); if (['http:', 'https:'].includes(url.protocol) && url.origin !== f.origin) { f.external.push(url.href); return route.abort(); } return route.continue(); });
  f.p = await f.context.newPage(); await f.p.goto(f.origin); await f.p.waitForFunction(() => typeof ready !== 'undefined' && ready && window.__v2UI);
  await f.p.evaluate(async source => {
    if (!await flushSave()) throw Error('Initial flush failed');
    const notebookId = newPageId(), id = newPageId(), stamp = '2026-10-11T00:00:00Z';
    const oldPage = { id, title: 'Korunacak özgün not', notebookId, updated: stamp, viewY: 0,
      strokes: [{ tool: 'pen', color: '#173b36', width: 3, points: [{ x: 20, y: 30, p: .5 }, { x: 80, y: 70, p: .7 }] }],
      pdf: { image: source.image, width: source.width, height: source.height, name: 'önceki.pdf', number: 1, total: 1 } };
    const book = { version: 2, pages: [oldPage], active: id, notebooks: [{ id: notebookId, title: 'Deneme defteri' }], activeNotebook: notebookId,
      trash: [{ page: { ...oldPage, id: newPageId(), title: 'Çöpteki eski kopya', strokes: [] }, notebookTitle: 'Deneme defteri', deletedAt: stamp, position: 0 }] };
    if (!await replaceNotebook(book, 'Synthetic fixture', { preservePrevious: false })) throw Error('Fixture replacement failed');
    await ensureAssets(); if (!await flushSave()) throw Error('Fixture migration save failed');
    if (assetSweep) await assetSweep; if (!await flushSave()) throw Error('Fixture final flush failed');
    clearTimeout(assetTimer); assetTimer = null;
  }, { image: oldImage.image, width: oldImage.width, height: oldImage.height });
  await f.p.evaluate(installProbe); f.before = await f.p.evaluate(() => __importAssetsTest.snapshot());
  assert.equal(f.before.canEdit, true); assert.equal(f.before.runtime.valid, true); assert.equal(f.before.assets.length, 1, 'Existing live and trashed image share one asset');
  assert.equal(f.before.controls.app.inlineImages, 0, 'Existing notebook begins keyed');
  assert.equal(f.before.worker, f.writer === 'worker', 'Exercise selected actual save backend'); assert.equal(f.before.workerLost, false);
}
async function cleanup(f) {
  f.closed = true; const errors = [];
  if (f.context) { try { await deadline(f.context.tracing.stop({ path: path.join(out, f.name + '-trace.zip') }), 8000, 'Trace stop'); } catch (e) { errors.push(e); } try { await deadline(f.context.close(), 8000, 'Context close'); } catch (e) { errors.push(e); } }
  if (f.server) try { f.server.closeAllConnections(); await deadline(new Promise(ok => f.server.close(ok)), 8000, 'Server close'); } catch (e) { errors.push(e); }
  resources.delete(f); if (errors.length) throw new AggregateError(errors, 'Fixture cleanup failed');
}
const expectedImported = value => value.pages.map(p => ({ sha256: sha(p.image), chars: p.image.length, width: p.width, height: p.height, name: value.name.trim(), number: p.number, total: p.total }));
function assertRuntime(runtime, before, value) { assert.equal(runtime.valid, true); assert.deepEqual(runtime.notebooks, before.notebooks); assert.deepEqual(runtime.trash, before.trash); assert.equal(runtime.pages.length, before.pages.length + value.pages.length); assert.deepEqual(runtime.pages.slice(0, before.pages.length), before.pages); assert.deepEqual(runtime.pages.slice(before.pages.length).map(p => p.image), expectedImported(value)); assert.deepEqual(runtime.pages.slice(before.pages.length).map(p => p.strokes), value.pages.map(p => p.strokes)); }
async function runImport(f, { value = smallCandidate, fault = null, disabled = false } = {}) {
  f.value = value;
  await f.p.evaluate(options => __importAssetsTest.start(options), { fault, disabled, refs: [...new Set(value.pages.map(p => 'asset:' + sha(p.image)))] });
  const outcome = await f.p.evaluate(value => __importAssetsTest.commit(value), value);
  // Freeze only the probe interval. Product follow-up work is not replaced.
  await f.p.evaluate(() => __importAssetsTest.stop());
  const after = await f.p.evaluate(() => __importAssetsTest.snapshot()), probe = await f.p.evaluate(() => __importAssetsTest.summary());
  f.evidence = { outcome, before: f.before, after, probe, fixture: { pages: value.pages.length, uniqueImages: new Set(value.pages.map(p => p.image)).size, occurrenceChars: value.pages.reduce((n, p) => n + p.image.length, 0) } };
  return f.evidence;
}
function firstPayload(f, e) {
  const writes = f.writer === 'worker' ? e.probe.workerPuts.filter(x => x.preservePrevious) : e.probe.appPuts;
  assert.ok(writes.length, 'A genuine first import notebook payload must be observed'); return writes[0];
}
function assertNoNotebookCommit(e) {
  assert.equal(e.outcome.resolved, false, 'Asset preparation failure must reject the actual importer');
  assert.deepEqual(e.after.controls, e.before.controls, 'Notebook, writer marker, before-import and sync receipt must remain unchanged');
  assert.deepEqual(e.after.runtime, e.before.runtime, 'Preparation failure must not alter displayed notebook');
  assert.deepEqual(e.after.registry, e.before.registry, 'Prepared assets must not leak into global save registries');
  assert.equal(e.probe.dbCalls.length, 0, 'No final notebook dbPut after preparation failure');
  assert.equal(e.probe.workerPuts.length, 0); assert.equal(e.probe.appPuts.length, 0);
}
async function backupAndReload(f, e, value, { uncertain = false } = {}) {
  const pendingDownload = f.p.waitForEvent('download'); await f.p.evaluate(() => exportNotebook()); const download = await pendingDownload;
  const filename = path.join(out, f.name + '-backup.json'); await download.saveAs(filename); const bytes = fs.readFileSync(filename), backup = JSON.parse(bytes);
  const expectedPages = uncertain ? e.before.runtime.pages : e.after.runtime.pages;
  const describe = p => ({ id: p.id, title: p.title, notebookId: p.notebookId, strokes: p.strokes,
    ...(p.pdf ? { image: { sha256: sha(p.pdf.image), chars: p.pdf.image.length, width: p.pdf.width, height: p.pdf.height, name: p.pdf.name, number: p.pdf.number, total: p.pdf.total } } : {}) });
  const downloaded = backup.pages.map(describe);
  assert.deepEqual(downloaded, expectedPages, 'Actual JSON download preserves every displayed image and pen point');
  assert.deepEqual((backup.trash || []).map(t => ({ ...t, page: describe(t.page) })), e.before.runtime.trash, 'JSON download preserves shared image in trash');
  assert.deepEqual(backup.notebooks, e.before.runtime.notebooks, 'JSON download preserves original notebook identity');
  assert.ok(!bytes.toString().includes('"image":"asset:'), 'Independent backup must contain image data, not local asset references');
  e.backup = { path: path.basename(filename), bytes: bytes.length, sha256: sha(bytes), pages: backup.pages.length, uncertainOldRuntimeCopy: uncertain };
  await f.p.reload(); await f.p.waitForFunction(() => typeof ready !== 'undefined' && ready && canEdit());
  // Reload recreates actual storage/runtime. Only read-only digest helper is reinstalled.
  await f.p.evaluate(installProbe); const reloaded = await f.p.evaluate(() => __importAssetsTest.snapshot());
  assertRuntime(reloaded.runtime, e.before.runtime, value); e.reloaded = reloaded;
  assert.equal(reloaded.controls['before-import'].sha256, e.before.controls.app.sha256, 'Reload preserves the original before-import copy');
  const previous = await f.p.evaluate(async () => __importAssetsTest.runtime(await inflateRecord(await dbGet('before-import'))));
  assert.deepEqual(previous, e.before.runtime, 'Before-import copy hydrates the exact original image and pen data'); e.previousHydrated = previous;
}

const definitions = [
  ['first-commit-compact', async f => {
    const e = await runImport(f, { value: bigCandidate }); const first = firstPayload(f, e); e.firstPayload = first;
    // This is the behavioral old-source gate. Do not substitute the eventual
    // app row: old code also compacts it after the background asset sweep.
    assert.equal(first.inlineImages, 0, 'The FIRST import notebook write must not carry inline image data');
    assert.equal(e.outcome.resolved, true); assert.equal(first.refImages, 8, 'Six new slides plus existing live/trash background references');
    assert.ok(first.utf8Bytes < 64 * 1024, 'Simple six-slide notebook payload remains metadata-sized');
    assert.ok(first.utf8Bytes < e.fixture.occurrenceChars / 100, 'First-write size reduction is relative to the fixed fixture bytes');
    assert.equal(e.probe.assetAttempts, 4, 'Four distinct images, not six duplicate writes'); assert.equal(e.probe.assetCompleted, 4);
    assert.equal(e.probe.maxOpenAssetTransactions, 1, 'Promotion writes one asset transaction at a time');
    assert.ok(e.probe.transactions.filter(t => t.assetPuts).every(t => t.assetPuts === 1 && t.outcome === 'complete'));
    assert.equal(e.probe.dbCalls.length, 1); assert.deepEqual(e.probe.gates[0].registry, e.before.registry, 'Registry publication cannot precede notebook acknowledgement');
    assert.equal(e.probe.gates[0].assetCompleted, 4, 'Every prepared image is durable before the final notebook write');
    assert.equal(e.after.controls.app.inlineImages, 0); assert.equal(e.after.assets.length, 5);
    assert.deepEqual(e.after.assets.map(a => a.key).sort(), ['asset:' + oldImage.dataURLSha256, ...large.map(x => 'asset:' + x.dataURLSha256)].sort());
    assert.ok(e.after.assets.every(a => a.key === 'asset:' + a.sha256), 'Native asset contents match their content-addressed keys');
    assertRuntime(e.after.runtime, e.before.runtime, bigCandidate);
    assert.equal(e.after.controls['before-import'].sha256, e.before.controls.app.sha256);
    await backupAndReload(f, e, bigCandidate); return e;
  }],
  ['asset-quota-no-notebook-write', async f => {
    const e = await runImport(f, { fault: 'quota' }); assertNoNotebookCommit(e);
    assert.equal(e.outcome.name, 'QuotaExceededError'); assert.equal(e.probe.assetAttempts, 2, 'Quota is final; do not retry asset writes'); assert.equal(e.probe.injected, 1);
    assert.equal(e.probe.assetCompleted, 1); assert.equal(e.after.assets.length, 2, 'Only first successful new asset may remain orphaned'); return e;
  }],
  ['asset-abort-no-notebook-write', async f => {
    const e = await runImport(f, { fault: 'abort' }); assertNoNotebookCommit(e);
    assert.equal(e.probe.assetAttempts, 2, 'Explicit transaction abort must not reopen and retry'); assert.equal(e.probe.injected, 1);
    assert.equal(e.probe.assetCompleted, 1); assert.equal(e.after.assets.length, 2, 'Aborted second asset is absent');
    assert.equal(e.probe.transactions.filter(t => t.assetPuts && t.outcome === 'abort').length, 1); return e;
  }],
  ['account-lock-after-asset-commit', async f => {
    const e = await runImport(f, { fault: 'account-lock' }); assertNoNotebookCommit(e);
    assert.equal(e.probe.injected, 1); assert.equal(e.probe.assetAttempts, 1); assert.equal(e.after.assets.length, 2);
    assert.equal(e.after.canEdit, false); assert.equal(e.after.conflict, false, 'Definite precommit stale failure is not uncertain-commit quarantine'); return e;
  }],
  ['scope-switch-after-asset-commit', async f => {
    const e = await runImport(f, { fault: 'scope-switch' }); assertNoNotebookCommit(e);
    assert.equal(e.probe.injected, 1); assert.equal(e.probe.assetAttempts, 1); assert.equal(e.after.assets.length, 2);
    assert.equal(e.after.canEdit, true); assert.equal(e.after.conflict, false, 'Obsolete scope must not quarantine the unchanged synthetic account'); return e;
  }],
  ['missing-asset-inline-recovery', async f => {
    const e = await runImport(f, { fault: 'missing' });
    assert.equal(e.probe.injected, 1, 'Delete a genuinely prepared key before final native existence check');
    assert.equal(e.outcome.resolved, true, 'Native MissingAsset must reach the existing safe inline retry');
    assert.equal(e.probe.dbCalls.length, 2); assert.equal(e.probe.dbCalls[0].name, 'MissingAsset'); assert.equal(e.probe.dbCalls[1].outcome, 'resolved');
    if (f.writer === 'worker') { assert.equal(e.probe.workerPuts.length, 2); assert.equal(e.probe.workerPuts[0].inlineImages, 0); assert.equal(e.probe.workerPuts[1].inlineImages, 3); }
    else { assert.equal(e.probe.appPuts.length, 1); assert.equal(e.probe.appPuts[0].inlineImages, 3); assert.ok(e.probe.transactions.some(t => t.mode === 'readwrite' && t.assetPuts === 0 && t.appPuts === 0 && t.outcome === 'abort'), 'Observe real failed native notebook transaction, not a synthetic thrown error'); }
    assert.equal(e.after.controls.app.inlineImages, 3); assert.equal(e.after.conflict, false);
    assert.equal(e.after.controls['before-import'].sha256, e.before.controls.app.sha256, 'Failed first attempt must not replace recovery copy');
    assertRuntime(e.after.runtime, e.before.runtime, smallCandidate); await backupAndReload(f, e, smallCandidate); return e;
  }],
  ['lost-ack-after-reference-commit', async f => {
    const e = await runImport(f, { fault: 'lost-ack' });
    assert.equal(e.outcome.resolved, false); assert.equal(e.outcome.name, 'ImportCommitUnknown'); assert.equal(e.probe.injected, 1);
    assert.equal(e.after.controls.app.inlineImages, 0); assert.equal(e.after.controls.app.refImages, 5);
    assert.deepEqual(e.after.registry, e.before.registry, 'Unknown outcome must not publish prepared registry'); assert.deepEqual(e.after.runtime, e.before.runtime);
    assert.equal(e.after.canEdit, false); assert.equal(e.after.conflict, true); assert.equal(e.probe.dbCalls.length, 1);
    const persisted = e.after.controls;
    const guarded = await f.p.evaluate(async () => { markChanged(false); const saved = await flushSave(); return { saved, after: await __importAssetsTest.snapshot() }; });
    assert.equal(guarded.saved, false); assert.deepEqual(guarded.after.controls, persisted, 'Uncertain import cannot be overwritten by old runtime');
    await backupAndReload(f, e, smallCandidate, { uncertain: true }); return e;
  }],
  ['asset-write-disabled-keeps-legacy-inline', async f => {
    const e = await runImport(f, { disabled: true }); assert.equal(e.outcome.resolved, true);
    assert.equal(e.probe.assetAttempts, 0); assert.equal(firstPayload(f, e).inlineImages, 3, 'ASSET_WRITE=false retains the compatible inline first write');
    assert.equal(e.after.controls.app.inlineImages, 3); assert.deepEqual(e.after.registry, e.before.registry);
    assertRuntime(e.after.runtime, e.before.runtime, smallCandidate); await backupAndReload(f, e, smallCandidate); return e;
  }],
  ['closed-main-connection-before-preparation', async f => {
    const e = await runImport(f, { fault: 'closed-before-preparation' });
    assert.equal(e.probe.injected, 1); assert.equal(e.outcome.resolved, true, 'A closed idle connection must reopen before pinning asset preparation');
    assert.deepEqual(e.probe.opens, [e.before.scope], 'Exactly one native main connection reopening, still in the original scope');
    assert.equal(e.probe.assetAttempts, 3); assert.equal(e.probe.assetCompleted, 3); assert.equal(firstPayload(f, e).inlineImages, 0);
    assert.deepEqual(e.probe.gates[0].registry, e.before.registry); assertRuntime(e.after.runtime, e.before.runtime, smallCandidate);
    await backupAndReload(f, e, smallCandidate); return e;
  }],
  ['known-assets-upsert-and-refresh', async f => {
    const shared = { ...smallCandidate, pages: smallCandidate.pages.map((p, i) => i ? p : { ...p, image: oldImage.image }) };
    const missing = small[1], oldRef = 'asset:' + oldImage.dataURLSha256, missingRef = 'asset:' + missing.dataURLSha256;
    const seededAt = await f.p.evaluate(async ({ old, oldRef, missing, missingRef }) => {
      // Deliberately stale hints, but use a genuine native row for the old hash.
      // That hash is already referenced by both the live and trashed old page.
      await new Promise((ok, no) => {
        const tx = db.transaction(STORE, 'readwrite'), os = tx.objectStore(STORE);
        os.put({ data: old, t: 0 }, oldRef); os.delete(missingRef);
        tx.oncomplete = ok; tx.onabort = tx.onerror = () => no(tx.error || Error('Known asset fixture failed'));
      });
      assetRefs.set(missing, missingRef); storedAssets.add(missingRef); assetEpoch++;
      return Date.now();
    }, { old: oldImage.image, oldRef, missing: missing.image, missingRef });
    f.before = await f.p.evaluate(() => __importAssetsTest.snapshot());
    assert.equal(f.before.assets.length, 1); assert.equal(f.before.assets[0].key, oldRef); assert.equal(f.before.assets[0].t, 0);
    assert.ok(f.before.registry.stored.includes(missingRef), 'Missing row is nevertheless advertised by the stored hint');
    const e = await runImport(f, { value: shared }); e.seededAt = seededAt;
    assert.equal(e.outcome.resolved, true); assert.equal(e.probe.assetAttempts, 3, 'Known hints must not skip any of the three native upserts');
    assert.equal(e.probe.assetCompleted, 3); assert.equal(e.probe.maxOpenAssetTransactions, 1);
    assert.equal(firstPayload(f, e).inlineImages, 0); assert.equal(firstPayload(f, e).refImages, 5);
    assert.deepEqual(e.probe.gates[0].registry, e.before.registry, 'Private preparation does not publish or clear stale global hints before final acknowledgement');
    assert.deepEqual(e.after.assets.map(a => a.key).sort(), [oldRef, missingRef, 'asset:' + small[2].dataURLSha256].sort());
    assert.ok(e.after.assets.every(a => a.key === 'asset:' + a.sha256 && a.t >= seededAt), 'Upserts restore missing content and refresh even the shared existing hash timestamp');
    assert.equal(e.after.controls['before-import'].sha256, e.before.controls.app.sha256);
    assertRuntime(e.after.runtime, e.before.runtime, shared); await backupAndReload(f, e, shared); return e;
  }]
];
const cases = ['worker', 'fallback'].flatMap(writer => definitions.map(([name, test]) => ({ name: writer + '-' + name, writer, test })));
async function run() {
  const selected = cases.filter(c => !caseFilter || c.name.includes(caseFilter)); assert.ok(selected.length, 'No matching cases');
  const engines = Object.entries({ chromium, webkit }).filter(([name]) => !engineFilter || engineFilter === name); report.expectedCases = selected.length * engines.length;
  for (const [engine, type] of engines) {
    const browser = await deadline(type.launch({ headless: true }), 30000, engine + ' launch');
    try { for (const c of selected) {
      const started = Date.now(), f = { name: engine + '-' + c.name, writer: c.writer }; resources.add(f);
      const result = { engine, name: c.name, writer: c.writer, ok: false, startedAt: new Date(started).toISOString() };
      try {
        result.evidence = await deadline((async () => { await fixture(browser, f); return c.test(f); })(), 120000, f.name);
        assert.deepEqual(f.external, []); assert.deepEqual(f.errors, [], 'No uncaught page errors'); assert.deepEqual(f.workers, []); assert.equal(f.context.serviceWorkers().length, 0);
        assert.ok(f.requests.every(r => r.method === 'GET')); assert.ok(!f.requests.some(r => /(?:^|\/)sw\.js$/i.test(r.path))); result.ok = true;
      } catch (error) {
        result.error = error.stack || String(error); if (f.evidence) result.evidence = f.evidence;
        if (f.p && !f.p.isClosed()) try { result.diagnostics = await deadline(f.p.evaluate(async () => window.__importAssetsTest ? { probe: await __importAssetsTest.summary(), snapshot: await __importAssetsTest.snapshot() } : { initialized: typeof ready !== 'undefined' && ready }), 7000, 'Diagnostics'); } catch (e) { result.diagnosticsError = e.message; }
      } finally {
        result.network = { external: f.external, requests: f.requests, pageErrors: f.errors, consoleErrors: f.consoleErrors, serviceWorkerEvents: f.workers };
        try { await cleanup(f); } catch (e) { result.ok = false; result.cleanupError = e.stack || String(e); }
        result.elapsedMs = Date.now() - started; report.results.push(result); fs.writeFileSync(path.join(out, f.name + '.json'), JSON.stringify(result, null, 2));
        console.log((result.ok ? 'PASS ' : 'FAIL ') + f.name + ' ' + result.elapsedMs + 'ms');
      }
    } } finally { await deadline(browser.close(), 15000, engine + ' close'); }
  }
  const after = hashes(sourceFiles(root)); report.drift = [...new Set([...Object.keys(source), ...Object.keys(after)])].filter(n => source[n] !== after[n]);
  assert.deepEqual(report.drift, [], 'Source drift during acceptance'); assert.equal(sha(fs.readFileSync(__filename)), report.runnerSha256, 'Runner drift');
  assert.equal(report.results.length, report.expectedCases, 'All selected cases must run'); report.ok = report.results.length > 0 && report.results.every(r => r.ok);
}
run().catch(error => { report.ok = false; report.fatal = error.stack || String(error); }).finally(async () => {
  for (const f of [...resources]) try { await cleanup(f); } catch (e) { report.ok = false; (report.cleanupErrors ||= []).push(e.message); }
  report.finishedAt = new Date().toISOString(); report.passed = report.results.filter(r => r.ok).length; report.failed = report.results.filter(r => !r.ok).length;
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify({ ok: report.ok, passed: report.passed, failed: report.failed, fatal: report.fatal, out })); process.exitCode = report.ok ? 0 : 1;
});
