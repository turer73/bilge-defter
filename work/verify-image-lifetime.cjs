'use strict';
// Actual local notebook lifecycle contracts. This measures reachable references,
// not GC/RSS/physical-device memory. Root is the sole runner/proof owner.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const crypto = require('node:crypto'), zlib = require('node:zlib'), assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const repo = path.resolve(__dirname, '..'), root = path.resolve(process.env.BILGE_TEST_ROOT || path.join(__dirname, 'bilge-defter-test'));
const args = process.argv.slice(2), arg = key => args.find(v => v.startsWith('--' + key + '='))?.slice(key.length + 3);
assert.ok(args.every(v => /^--(?:out|engine|case)=.+$/.test(v)), 'Unknown argument');
const engineFilter = arg('engine'), caseFilter = arg('case');
assert.ok(!engineFilter || ['chromium', 'webkit'].includes(engineFilter), 'Unknown engine');
const out = path.resolve(arg('out') || path.join(repo, 'outputs/image-lifetime', new Date().toISOString().replace(/[:.]/g, '-') + '-' + crypto.randomUUID()));
assert.ok(out.startsWith(path.join(repo, 'outputs') + path.sep), 'Evidence stays inside repository outputs');
assert.ok(!fs.existsSync(out), 'Refuse to overwrite evidence'); fs.mkdirSync(out, { recursive: true });
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
function sourceFiles(dir, prefix = '') {
  const result = new Map();
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    assert.ok(!entry.isSymbolicLink(), 'No source symlink traversal');
    const filename = path.join(dir, entry.name), name = prefix + entry.name;
    if (entry.isDirectory()) for (const pair of sourceFiles(filename, name + '/')) result.set(...pair);
    else { assert.ok(entry.isFile()); result.set('/' + name, fs.readFileSync(filename)); }
  }
  return result;
}
const hashes = files => Object.fromEntries([...files].map(([k, v]) => [k, sha(v)]).sort(([a], [b]) => a.localeCompare(b)));
const files = sourceFiles(root), source = hashes(files), resources = new Set();
const report = { ok: false, startedAt: new Date().toISOString(), root, source, runnerSha256: sha(fs.readFileSync(__filename)), results: [], releaseEligible: false,
  boundaries: [
    'Fresh synthetic approved account and loopback-only GET network per case. No real account, document, remote storage or publication.',
    'Actual media insertion, undo, trash, confirmation, recovery, JSON export and startup hydration handlers run. Fixtures seed an initial notebook through replaceNotebook.',
    'No product function is mocked. Native IDB methods are forwarding observers only in the main window, not the storage worker; test snapshots open a separate readonly connection. Disk control-record hash equality is checked independently of those observers.',
    'Deterministic PNG fixtures are shared across engines and baseline/candidate sources. Source bytes are frozen before serving and checked for drift after all cases.',
    'Oracles count reachable history image strings and DOM cards. They do not measure heap collection, native bitmap release, RSS, latency, or physical iPad behavior.',
    'Recovery cancellation must read neither before-import nor asset rows. Snapshot reads are excluded from the observer interval.',
    'Invalid recovery checks use a malformed record with no asset references; broader invalid-record hydration/registry semantics are outside this patch.'
  ] };
fs.copyFileSync(__filename, path.join(out, 'runner.cjs'));
fs.writeFileSync(path.join(out, 'source.json'), JSON.stringify({ source, runnerSha256: report.runnerSha256 }, null, 2));
const crcTable = Array.from({ length: 256 }, (_, n) => { for (let i = 0; i < 8; i++) n = (n >>> 1) ^ ((n & 1) ? 0xedb88320 : 0); return n >>> 0; });
function crc(bytes) { let n = 0xffffffff; for (const b of bytes) n = (n >>> 8) ^ crcTable[(n ^ b) & 255]; return (n ^ 0xffffffff) >>> 0; }
function chunk(type, bytes) { const tag = Buffer.from(type), length = Buffer.alloc(4), sum = Buffer.alloc(4); length.writeUInt32BE(bytes.length); sum.writeUInt32BE(crc(Buffer.concat([tag, bytes]))); return Buffer.concat([length, tag, bytes, sum]); }
function fixtureImage(seed) {
  const width = 1000, height = 200, stride = width * 3 + 1, pixels = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const value = (x >>> 3) * 17 + (y >>> 2) * 23 + seed * 43, i = y * stride + x * 3 + 1;
    pixels[i] = value & 255; pixels[i + 1] = (value * 3) & 255; pixels[i + 2] = (value * 7) & 255;
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  const bytes = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
  const image = 'data:image/png;base64,' + bytes.toString('base64');
  fs.writeFileSync(path.join(out, 'fixture-' + seed + '.png'), bytes);
  return { image, width, height, chars: image.length, sha256: sha(image), pngSha256: sha(bytes) };
}
const images = [fixtureImage(17), fixtureImage(53), fixtureImage(89)];
report.fixtures = images.map(({ image, ...metadata }) => metadata);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.woff2': 'font/woff2' };
async function deadline(promise, ms, label) { let timer; try { return await Promise.race([promise, new Promise((_, no) => { timer = setTimeout(() => no(Error(label + ' exceeded ' + ms + 'ms')), ms); })]); } finally { clearTimeout(timer); } }

function installObserver() {
  const T = window.__imageLifetime = { active: false, scope: DB, reads: [], writes: [], ids: state.pages.map(p => p.id) };
  const native = { open: IDBFactory.prototype.open, transaction: IDBDatabase.prototype.transaction, get: IDBObjectStore.prototype.get, put: IDBObjectStore.prototype.put, delete: IDBObjectStore.prototype.delete };
  const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('');
  IDBObjectStore.prototype.get = function (key) { if (T.active && this.transaction.db.name === T.scope) T.reads.push(String(key)); return native.get.call(this, key); };
  IDBObjectStore.prototype.put = function (value, key, ...rest) { if (T.active && this.transaction.db.name === T.scope) T.writes.push({ kind: 'put', key: String(key) }); return native.put.call(this, value, key, ...rest); };
  IDBObjectStore.prototype.delete = function (key) { if (T.active && this.transaction.db.name === T.scope) T.writes.push({ kind: 'delete', key: String(key) }); return native.delete.call(this, key); };
  T.start = () => { T.reads.length = 0; T.writes.length = 0; T.active = true; };
  T.stop = () => { T.active = false; return { reads: [...T.reads], writes: [...T.writes] }; };
  T.rows = async () => {
    const connection = await new Promise((ok, no) => { const request = native.open.call(indexedDB, T.scope, 1); request.onsuccess = () => ok(request.result); request.onerror = () => no(request.error); });
    try { return await new Promise((ok, no) => { const tx = native.transaction.call(connection, STORE, 'readonly'), store = tx.objectStore(STORE), keys = store.getAllKeys(), values = store.getAll(); tx.oncomplete = () => ok(keys.result.map((k, i) => [k, values.result[i]])); tx.onabort = tx.onerror = () => no(tx.error || Error('Snapshot failed')); }); }
    finally { connection.close(); }
  };
  T.snapshot = async () => {
    const rows = new Map(await T.rows()), controls = {};
    for (const key of ['app', 'app-writer', 'before-import', 'sync-state-v2']) controls[key] = rows.has(key) ? await hash(JSON.stringify(rows.get(key))) : null;
    const histories = [];
    for (const [id, history] of mediaUndo) {
      const refs = new Set(history.flatMap(h => [...h.before, ...h.after]).filter(s => s.tool === 'image').map(s => s.image));
      histories.push({ id, entries: history.length, imageChars: [...refs].reduce((n, src) => n + src.length, 0), imageHashes: await Promise.all([...refs].map(hash)) });
    }
    const live = new Set(state.pages.map(p => p.id)), trash = new Set((state.trash || []).map(t => t.page.id));
    return { controls, runtime: await hash(JSON.stringify(state)), runtimeValid: validState(state), pageIds: [...live], trashIds: [...trash],
      histories, orphanHistoryIds: histories.filter(h => !live.has(h.id) && !trash.has(h.id)).map(h => h.id),
      registry: { sha256: await hash(JSON.stringify([...assetRefs])), stored: [...storedAssets].sort(), epoch: assetEpoch },
      trashOpen: trashDialog.open, trashCards: [...document.querySelectorAll('#trashList .trash-card')].map(card => card.dataset.trashId), trashChildren: document.querySelector('#trashList').childElementCount };
  };
  T.settle = async () => { if (assetSweep) await assetSweep; if (!await flushSave()) throw Error('Save failed'); await ensureAssets(); if (!await flushSave()) throw Error('Asset save failed'); clearTimeout(assetTimer); assetTimer = null; };
}

async function fixture(browser, f) {
  f.errors = []; f.external = []; f.requests = []; f.consoleErrors = []; f.serviceWorkers = []; f.closed = false; f.dialogs = [];
  f.server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://loopback'); f.requests.push({ method: req.method, path: url.pathname });
    if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
    if (url.pathname === '/api/v1/bilge-defter/whoami') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ account_protocol: 'approval-v1', identity: { type: 'access', id: '11111111-1111-4111-8111-111111111111', status: 'approved', role: 'student', email: 'lifetime@example.test' } })); return; }
    const name = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname), data = files.get(name);
    res.writeHead(data ? 200 : 404, { 'Content-Type': mime[path.extname(name)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(data || '');
  });
  await new Promise((ok, no) => { f.server.once('error', no); f.server.listen(0, '127.0.0.1', ok); });
  if (f.closed) throw Error('Fixture canceled'); f.origin = 'http://127.0.0.1:' + f.server.address().port;
  f.context = await browser.newContext({ viewport: { width: 1180, height: 920 }, acceptDownloads: true });
  if (f.closed) { await f.context.close(); throw Error('Fixture canceled'); }
  f.context.setDefaultTimeout(15000); f.context.on('page', p => { p.on('pageerror', e => f.errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') f.consoleErrors.push(m.text()); }); });
  f.context.on('serviceworker', w => f.serviceWorkers.push(w.url()));
  await f.context.tracing.start({ screenshots: false, snapshots: true, sources: true });
  await f.context.addInitScript(origin => { if (top !== window || location.origin !== origin) return; window.__accountRequired = true; localStorage.setItem('bilge_defter_onboarding_v1', 'true'); try { delete Navigator.prototype.serviceWorker; } catch {} }, f.origin);
  await f.context.route('**/*', route => { const url = new URL(route.request().url()); if (['http:', 'https:'].includes(url.protocol) && url.origin !== f.origin) { f.external.push(url.href); return route.abort(); } return route.continue(); });
  f.p = await f.context.newPage(); f.acceptConfirm = true;
  f.p.on('dialog', async d => { f.dialogs.push({ type: d.type(), message: d.message() }); if (d.type() === 'confirm' && !f.acceptConfirm) await d.dismiss(); else await d.accept(); });
  await f.p.goto(f.origin); await f.p.waitForFunction(() => typeof ready !== 'undefined' && ready && window.__v2UI);
  await f.p.evaluate(async source => {
    if (!await flushSave()) throw Error('Initial save failed');
    const id = newPageId(), other = newPageId(), notebookId = newPageId(), stamp = '2026-10-11T00:00:00Z';
    const book = { version: 3, pages: [
      { id, title: 'Yaşam döngüsü A', notebookId, strokes: [], viewY: 0, updated: stamp, pdf: { image: source.image, width: source.width, height: source.height, name: 'özgün.pdf', number: 1, total: 1 } },
      { id: other, title: 'Yaşam döngüsü B', notebookId, strokes: [], updated: stamp }
    ], active: id, activeNotebook: notebookId, notebooks: [{ id: notebookId, title: 'Deneme' }], trash: [] };
    if (!await replaceNotebook(book, 'Synthetic fixture', { preservePrevious: false })) throw Error('Fixture replacement failed');
    if (assetSweep) await assetSweep; await ensureAssets(); if (!await flushSave()) throw Error('Fixture save failed'); clearTimeout(assetTimer); assetTimer = null;
  }, images[0]);
  await f.p.evaluate(installObserver); f.ids = await f.p.evaluate(() => __imageLifetime.ids); f.before = await snapshot(f);
  assert.equal(f.before.runtimeValid, true); assert.equal(f.before.histories.length, 0);
}
async function cleanup(f) {
  f.closed = true; const errors = [];
  if (f.context) { try { await deadline(f.context.tracing.stop({ path: path.join(out, f.name + '-trace.zip') }), 8000, 'Trace stop'); } catch (e) { errors.push(e); } try { await deadline(f.context.close(), 8000, 'Context close'); } catch (e) { errors.push(e); } }
  if (f.server) try { f.server.closeAllConnections(); await deadline(new Promise(ok => f.server.close(ok)), 8000, 'Server close'); } catch (e) { errors.push(e); }
  resources.delete(f); if (errors.length) throw new AggregateError(errors, 'Cleanup failed');
}
const snapshot = f => f.p.evaluate(() => __imageLifetime.snapshot());
const settle = f => f.p.evaluate(() => __imageLifetime.settle());
async function addMedia(f, id) {
  await f.p.evaluate(id => {
    const target = state.pages.find(p => p.id === id); if (!target) throw Error('Missing test page');
    const button = [...document.querySelectorAll('#pages button')].find(b => b.textContent === target.title); if (!button) throw Error('Page selection button missing'); button.click();
  }, id);
  await f.p.waitForFunction(() => typeof mediaAvailable === 'function' && mediaAvailable());
  await f.p.evaluate(source => {
    beginPendingMedia({ tool: 'image', image: source.image, imageWidth: source.width, imageHeight: source.height, width: 320, points: [{ x: 20, y: 20 }] });
    if (!mediaPending) throw Error('Actual media insertion did not open'); document.querySelector('#layoutDone').click();
  }, images[2]);
  await settle(f);
  await f.p.evaluate(id => { if (!mediaUndo.get(id)?.length || !state.pages.find(p => p.id === id).strokes.some(s => s.tool === 'image')) throw Error('Actual media add did not produce history'); }, id);
}
async function moveToTrash(f, id) { f.acceptConfirm = true; await f.p.evaluate(id => { openPageActions(id); document.querySelector('#deletePage').click(); }, id); await settle(f); }
async function openTrash(f) { await f.p.evaluate(() => document.querySelector('#openTrash').click()); assert.equal(await f.p.evaluate(() => trashDialog.open), true); }
async function removeTrash(f, id, accepted = true) {
  await openTrash(f); f.acceptConfirm = accepted;
  await f.p.evaluate(id => { const card = [...document.querySelectorAll('#trashList .trash-card')].find(n => n.dataset.trashId === id); if (!card) throw Error('Trash card missing'); card.querySelector('.danger').click(); }, id);
  f.acceptConfirm = true; await settle(f);
}
async function closeTrash(f, reopen = false) {
  await f.p.evaluate(reopen => new Promise(resolve => {
    trashDialog.addEventListener('close', () => resolve(), { once: true }); document.querySelector('#trashClose').click();
    if (reopen) document.querySelector('#openTrash').click();
  }), reopen);
}
async function seedPrevious(f, invalid = false) {
  return f.p.evaluate(async ({ source, invalid }) => {
    const id = newPageId(), notebookId = activeNotebook, imageKey = 'asset:' + Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source.image))), b => b.toString(16).padStart(2, '0')).join('');
    const previous = invalid ? { version: 2, pages: [], active: 'invalid' } : { version: 2, pages: [{ id, notebookId, title: 'Önceki bağımsız defter', strokes: [], updated: '2026-10-10T00:00:00Z', pdf: { image: imageKey, width: source.width, height: source.height, name: 'önceki.pdf', number: 1, total: 1 } }], active: id, activeNotebook: notebookId, notebooks: state.notebooks, trash: [] };
    await new Promise((ok, no) => { const tx = db.transaction(STORE, 'readwrite'), store = tx.objectStore(STORE); if (!invalid) store.put({ data: source.image, t: Date.now() }, imageKey); store.put(previous, 'before-import'); tx.oncomplete = ok; tx.onabort = tx.onerror = () => no(tx.error || Error('Recovery fixture failed')); });
    await refreshRecovery(); return { id, imageKey };
  }, { source: images[1], invalid });
}

const definitions = [
  ['permanent-delete-releases-only-gone-history', async f => {
    await addMedia(f, f.ids[0]); await addMedia(f, f.ids[1]); await moveToTrash(f, f.ids[0]);
    const before = await snapshot(f); assert.deepEqual(before.histories.map(h => h.id).sort(), [...f.ids].sort());
    await removeTrash(f, f.ids[0]); const after = await snapshot(f); f.evidence = { before, after };
    assert.ok(!after.trashIds.includes(f.ids[0])); assert.ok(!after.pageIds.includes(f.ids[0]));
    assert.ok(!after.histories.some(h => h.id === f.ids[0]), 'Permanently removed page must no longer retain media undo images');
    assert.deepEqual(after.histories.find(h => h.id === f.ids[1]), before.histories.find(h => h.id === f.ids[1]), 'Another page history must remain intact');
    assert.deepEqual(after.orphanHistoryIds, []); return f.evidence;
  }],
  ['temporary-trash-restore-keeps-undo', async f => {
    await addMedia(f, f.ids[0]); const initial = await snapshot(f); await moveToTrash(f, f.ids[0]); const trashed = await snapshot(f);
    assert.deepEqual(trashed.histories, initial.histories, 'Reversible trash movement preserves session undo');
    await openTrash(f); await f.p.evaluate(id => [...document.querySelectorAll('#trashList .trash-card')].find(n => n.dataset.trashId === id).querySelector('.primary').click(), f.ids[0]);
    await settle(f); await f.p.evaluate(() => document.querySelector('#undo').click()); await settle(f);
    const undone = await f.p.evaluate(id => ({ present: state.pages.some(p => p.id === id), imageCount: state.pages.find(p => p.id === id).strokes.filter(s => s.tool === 'image').length, remainingUndo: mediaUndo.get(id)?.length }), f.ids[0]);
    assert.deepEqual(undone, { present: true, imageCount: 0, remainingUndo: 0 }); return { initial, trashed, undone };
  }],
  ['cancel-permanent-delete-preserves-history', async f => {
    await addMedia(f, f.ids[0]); await moveToTrash(f, f.ids[0]); const before = await snapshot(f); await removeTrash(f, f.ids[0], false); const after = await snapshot(f);
    assert.deepEqual(after.controls, before.controls); assert.deepEqual(after.histories, before.histories); assert.deepEqual(after.trashIds, before.trashIds); assert.equal(after.runtime, before.runtime); assert.equal(after.trashOpen, true); return { before, after };
  }],
  ['repeated-deletion-no-unreachable-history', async f => {
    const rounds = [];
    for (let i = 0; i < 3; i++) {
      const id = await f.p.evaluate(() => { document.querySelector('#newPage').click(); return activeId; }); await settle(f); await addMedia(f, id); await moveToTrash(f, id); await removeTrash(f, id);
      const after = await snapshot(f); rounds.push(after); f.evidence = { rounds }; assert.deepEqual(after.orphanHistoryIds, [], 'Repeated permanent deletion cannot accumulate unreachable history'); assert.equal(after.histories.length, 0);
    }
    return { rounds };
  }],
  ['trash-close-clears-dom-and-reopen-renders-current', async f => {
    await addMedia(f, f.ids[0]); await moveToTrash(f, f.ids[0]); await openTrash(f); const opened = await snapshot(f); assert.deepEqual(opened.trashCards, [f.ids[0]]);
    await closeTrash(f); const closed = await snapshot(f); f.evidence = { opened, closed }; assert.equal(closed.trashOpen, false); assert.equal(closed.trashChildren, 0, 'Closed trash dialog must release its old DOM cards and item closures');
    await openTrash(f); const reopened = await snapshot(f); assert.equal(reopened.trashOpen, true); assert.deepEqual(reopened.trashCards, [f.ids[0]]); assert.deepEqual(reopened.controls, opened.controls); return { opened, closed, reopened };
  }],
  ['queued-close-does-not-clear-reopened-trash', async f => {
    await moveToTrash(f, f.ids[0]); await openTrash(f); await closeTrash(f, true); const after = await snapshot(f);
    assert.equal(after.trashOpen, true); assert.deepEqual(after.trashCards, [f.ids[0]], 'A queued close event must not clear an already reopened list'); return after;
  }],
  ['recovery-cancel-no-read-or-registry-publication', async f => {
    const previous = await seedPrevious(f), before = await snapshot(f); f.acceptConfirm = false; await f.p.evaluate(() => __imageLifetime.start());
    await f.p.evaluate(async () => { await document.querySelector('#restorePrevious').onclick(); });
    const activity = await f.p.evaluate(() => __imageLifetime.stop()); f.acceptConfirm = true; const after = await snapshot(f); f.evidence = { previous, before, after, activity };
    assert.ok(f.dialogs.some(d => d.type === 'confirm'), 'Actual recovery confirmation must be offered');
    assert.deepEqual(activity.reads, [], 'Rejected recovery must not read or hydrate the previous notebook'); assert.deepEqual(activity.writes, []);
    assert.deepEqual(after.registry, before.registry); assert.deepEqual(after.controls, before.controls); assert.equal(after.runtime, before.runtime); return f.evidence;
  }],
  ['approved-recovery-backup-and-reload', async f => {
    const previous = await seedPrevious(f), before = await snapshot(f); f.acceptConfirm = true;
    await f.p.evaluate(async () => { await document.querySelector('#restorePrevious').onclick(); }); await settle(f);
    const after = await snapshot(f); assert.equal(after.runtimeValid, true); assert.deepEqual(after.pageIds, [previous.id]); assert.equal(after.controls['before-import'], before.controls.app);
    const downloadPromise = f.p.waitForEvent('download'); await f.p.evaluate(() => exportNotebook()); const download = await downloadPromise;
    const filename = path.join(out, f.name + '-backup.json'); await download.saveAs(filename); const bytes = fs.readFileSync(filename), backup = JSON.parse(bytes);
    assert.equal(backup.pages.length, 1); assert.equal(sha(backup.pages[0].pdf.image), images[1].sha256); assert.ok(!bytes.toString().includes('"image":"asset:'), 'Independent JSON backup must materialize image content');
    await f.p.reload(); await f.p.waitForFunction(() => typeof ready !== 'undefined' && ready && canEdit()); await f.p.evaluate(installObserver); const reloaded = await snapshot(f);
    assert.equal(reloaded.runtimeValid, true); assert.deepEqual(reloaded.pageIds, [previous.id]); assert.equal(reloaded.runtime, after.runtime); assert.equal(reloaded.controls['before-import'], before.controls.app);
    return { previous, before, after, reloaded, backup: { filename: path.basename(filename), sha256: sha(bytes), bytes: bytes.length } };
  }],
  ['invalid-previous-preserves-current-notebook', async f => {
    await seedPrevious(f, true); const before = await snapshot(f); f.acceptConfirm = true; await f.p.evaluate(() => __imageLifetime.start());
    await f.p.evaluate(async () => { await document.querySelector('#restorePrevious').onclick(); }); const activity = await f.p.evaluate(() => __imageLifetime.stop()); const after = await snapshot(f);
    assert.ok(f.dialogs.some(d => d.type === 'alert' && /Geçerli/.test(d.message))); assert.deepEqual(after.controls, before.controls); assert.equal(after.runtime, before.runtime); assert.deepEqual(after.registry, before.registry); assert.deepEqual(activity.writes, []); return { before, after, activity };
  }]
];
async function run() {
  const selected = definitions.filter(([name]) => !caseFilter || name.includes(caseFilter)); assert.ok(selected.length, 'No selected cases');
  const engines = Object.entries({ chromium, webkit }).filter(([name]) => !engineFilter || name === engineFilter); report.expectedCases = engines.length * selected.length;
  for (const [engine, type] of engines) {
    const browser = await deadline(type.launch({ headless: true }), 30000, engine + ' launch');
    try { for (const [name, test] of selected) {
      const started = Date.now(), f = { name: engine + '-' + name }; resources.add(f); const result = { engine, name, ok: false, startedAt: new Date(started).toISOString() };
      try {
        result.evidence = await deadline((async () => { await fixture(browser, f); return test(f); })(), 90000, f.name);
        assert.deepEqual(f.external, []); assert.deepEqual(f.errors, []); assert.deepEqual(f.serviceWorkers, []); assert.equal(f.context.serviceWorkers().length, 0); assert.ok(f.requests.every(r => r.method === 'GET')); result.ok = true;
      } catch (error) {
        result.error = error.stack || String(error); if (f.evidence) result.evidence = f.evidence;
        if (f.p && !f.p.isClosed()) try { result.diagnostics = await deadline(snapshot(f), 6000, 'Diagnostics'); } catch (e) { result.diagnosticsError = e.message; }
      } finally {
        result.network = { external: f.external, requests: f.requests, pageErrors: f.errors, consoleErrors: f.consoleErrors, serviceWorkers: f.serviceWorkers }; result.dialogs = f.dialogs;
        try { await cleanup(f); } catch (e) { result.ok = false; result.cleanupError = e.stack || String(e); }
        result.elapsedMs = Date.now() - started; report.results.push(result); fs.writeFileSync(path.join(out, f.name + '.json'), JSON.stringify(result, null, 2)); console.log((result.ok ? 'PASS ' : 'FAIL ') + f.name + ' ' + result.elapsedMs + 'ms');
      }
    } } finally { await deadline(browser.close(), 15000, engine + ' close'); }
  }
  const after = hashes(sourceFiles(root)); report.drift = [...new Set([...Object.keys(source), ...Object.keys(after)])].filter(k => source[k] !== after[k]);
  assert.deepEqual(report.drift, [], 'Source drift'); assert.equal(sha(fs.readFileSync(__filename)), report.runnerSha256, 'Runner drift'); assert.equal(report.results.length, report.expectedCases);
  report.ok = report.results.length > 0 && report.results.every(r => r.ok);
}
run().catch(error => { report.ok = false; report.fatal = error.stack || String(error); }).finally(async () => {
  for (const f of [...resources]) try { await cleanup(f); } catch (e) { report.ok = false; (report.cleanupErrors ||= []).push(e.message); }
  report.finishedAt = new Date().toISOString(); report.passed = report.results.filter(r => r.ok).length; report.failed = report.results.filter(r => !r.ok).length;
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify({ ok: report.ok, passed: report.passed, failed: report.failed, fatal: report.fatal, out })); process.exitCode = report.ok ? 0 : 1;
});
