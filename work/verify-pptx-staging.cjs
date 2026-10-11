'use strict';
// Local synthetic acceptance only. The renderer, import UI, stage and notebook
// persistence are the real application. Native IDB is observed/fault-injected;
// no fake image array, fake storage, renderer bridge or commit implementation.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const crypto = require('node:crypto'), assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const repo = path.resolve(__dirname, '..');
const root = path.resolve(process.env.BILGE_TEST_ROOT || path.join(__dirname, 'bilge-defter-test'));
const args = process.argv.slice(2), arg = name => args.find(v => v.startsWith('--' + name + '='))?.slice(name.length + 3);
assert.ok(args.every(v => /^--(?:out|engine|case|negative)=.+$/.test(v)), 'Unknown argument');
const engineFilter = arg('engine'), negative = arg('negative'), caseFilter = arg('case') || (negative ? 'ready-disk-and-cancel' : null);
assert.ok(!engineFilter || ['chromium', 'webkit'].includes(engineFilter), 'Unknown engine');
assert.ok(!negative || negative === 'retain-images', 'Unknown negative control');
const out = path.resolve(arg('out') || path.join(repo, 'outputs/pptx-staging', new Date().toISOString().replace(/[:.]/g, '-') + '-' + crypto.randomUUID()));
assert.ok(out.startsWith(path.join(repo, 'outputs') + path.sep), 'Evidence must be under repo outputs');
assert.ok(!fs.existsSync(out), 'Refuse to overwrite evidence');
fs.mkdirSync(out, { recursive: true });
const sha = v => crypto.createHash('sha256').update(v).digest('hex');
function readSource(dir, prefix = '') {
  const files = new Map();
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    assert.ok(!entry.isSymbolicLink(), 'Refuse symlink source');
    const name = prefix + entry.name, file = path.join(dir, entry.name);
    if (entry.isDirectory()) for (const pair of readSource(file, name + '/')) files.set(...pair);
    else { assert.ok(entry.isFile(), 'Source must be regular'); files.set('/' + name, fs.readFileSync(file)); }
  }
  return files;
}
const hashSource = files => Object.fromEntries([...files].map(([k, v]) => [k, sha(v)]).sort(([a], [b]) => a.localeCompare(b)));
const files = readSource(root), source = hashSource(files);
const report = { ok: false, startedAt: new Date().toISOString(), root, runnerSha256: sha(fs.readFileSync(__filename)), source, negative: negative || null, results: [], releaseEligible: false,
  boundaries: [
    'Loopback only, synthetic approved account, no student data or production requests.',
    'Native stage transactions and actual renderer/UI/commit/JSON backup are used. Faults are isolated prototype instrumentation.',
    'Held completion events delay acknowledgement of a real transaction; they do not simulate an uncommitted disk transaction.',
    'Lost acknowledgement injects SaveWorkerLost after a real dbPut resolves; it is not an OS crash or real worker-loss proof.',
    'Retained-image count and stage rows prove storage placement, not process RSS/GC/GPU or physical iPad acceptance.'
  ] };
fs.writeFileSync(path.join(out, 'source.json'), JSON.stringify({ source, runnerSha256: report.runnerSha256 }, null, 2));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm', '.woff2': 'font/woff2' };
const resources = new Set();
async function deadline(promise, ms, label) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error(label + ' exceeded ' + ms + 'ms')), ms); })]); }
  finally { clearTimeout(timer); }
}

// Deterministic, two-slide OOXML with no external relationships or personal data.
function deck(alternate = false) {
  const P = 'http://schemas.openxmlformats.org/presentationml/2006/main', A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships', REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const parts = {
    '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>' + [1, 2].map(i => `<Override PartName="/ppt/slides/slide${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('') + '</Types>',
    '_rels/.rels': `<Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${R}/officeDocument" Target="ppt/presentation.xml"/></Relationships>`,
    'ppt/presentation.xml': `<p:presentation xmlns:p="${P}" xmlns:r="${R}"><p:sldIdLst><p:sldId id="256" r:id="rId1"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst><p:sldSz cx="9144000" cy="5143500"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`,
    'ppt/_rels/presentation.xml.rels': `<Relationships xmlns="${REL}">` + [1, 2].map(i => `<Relationship Id="rId${i}" Type="${R}/slide" Target="slides/slide${i}.xml"/>`).join('') + '</Relationships>'
  };
  for (const i of [1, 2]) parts[`ppt/slides/slide${i}.xml`] = `<p:sld xmlns:p="${P}" xmlns:a="${A}" xmlns:r="${R}"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="${(alternate ? ['FCE4D6', 'E4DFEC'] : ['D9EAF7', 'E2F0D9'])[i - 1]}"/></a:solidFill></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
  const local = [], central = []; let offset = 0;
  for (const [name, xml] of Object.entries(parts)) {
    const filename = Buffer.from(name), data = Buffer.from(xml); let crc = 0xffffffff;
    for (const byte of data) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); } crc = (crc ^ 0xffffffff) >>> 0;
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt32LE(crc, 14); h.writeUInt32LE(data.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(filename.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt32LE(crc, 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(filename.length, 28); c.writeUInt32LE(offset, 42);
    local.push(h, filename, data); central.push(c, filename); offset += h.length + filename.length + data.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(parts).length, 8); end.writeUInt16LE(Object.keys(parts).length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
const decks = [deck(), deck(true)];
report.fixtures = decks.map(bytes => ({ sha256: sha(bytes), bytes: bytes.length, slides: 2 }));

function installProbe() {
  const prefix = 'bilge-defter-pptx-stage-v1-', T = window.__stageTest = { options: {}, events: [], names: new Set(), held: null, writes: 0, reads: 0, commits: 0, notebookWrites: 0 };
  const original = { open: IDBFactory.prototype.open, transaction: IDBDatabase.prototype.transaction, add: IDBObjectStore.prototype.add, put: IDBObjectStore.prototype.put, get: IDBObjectStore.prototype.get, delete: IDBObjectStore.prototype.delete, postMessage: MessagePort.prototype.postMessage };
  const transactions = new WeakMap();
  const stageStore = store => store.transaction.db.name.startsWith(prefix);
  const txInfo = tx => transactions.get(tx);
  T.lock = () => dispatchEvent(new StorageEvent('storage', { key: 'bilge-defter-account-logout', newValue: 'synthetic-test' }));
  MessagePort.prototype.postMessage = function (message, ...args) {
    // Observe command/index only: no transferred PPTX or notebook payloads.
    if (message?.command === 'snapshot') T.events.push({ type: 'snapshot-command', index: message.index });
    return original.postMessage.call(this, message, ...args);
  };
  IDBFactory.prototype.open = function (name, ...args) {
    if (String(name).startsWith(prefix) && T.options.failOpen) { T.events.push({ type: 'open-fault' }); throw new DOMException('Injected stage open fault', 'UnknownError'); }
    const request = original.open.call(this, name, ...args);
    if (String(name).startsWith(prefix)) request.addEventListener('success', () => T.names.add(String(name)));
    return request;
  };
  IDBDatabase.prototype.transaction = function (...args) {
    const tx = original.transaction.apply(this, args);
    if (!this.name.startsWith(prefix)) return tx;
    const info = { reads: 0, writes: 0, numbers: [], mode: args[1] || 'readonly', delayed: false }; transactions.set(tx, info);
    tx.addEventListener('complete', event => {
      const kind = info.writes && T.options.holdWrite ? 'write' : info.reads && T.options.holdRead ? 'read' : null;
      if (kind && !info.delayed) {
        info.delayed = true; T.options[kind === 'write' ? 'holdWrite' : 'holdRead'] = false;
        event.stopImmediatePropagation(); T.held = { kind, writes: info.writes, reads: info.reads };
        T.events.push({ type: 'hold-complete', ...T.held });
        T.release = () => { T.held = null; T.release = null; tx.dispatchEvent(new Event('complete')); };
        return;
      }
      T.commits++; T.events.push({ type: 'complete', ...info });
    });
    tx.addEventListener('abort', () => T.events.push({ type: 'abort', ...info }));
    return tx;
  };
  for (const method of ['add', 'put']) IDBObjectStore.prototype[method] = function (value, ...args) {
    if (stageStore(this) && this.name === 'pages') {
      const info = txInfo(this.transaction); info.writes++; info.numbers.push(value.number); T.writes++;
      T.events.push({ type: 'page-write', importId: value.importId, number: value.number, chars: value.image?.length || 0 });
      if (T.options.quotaAt === T.writes) throw new DOMException('Injected stage quota exhaustion', 'QuotaExceededError');
      const request = original[method].call(this, value, ...args);
      if (T.options.lockAtWrite === T.writes) request.addEventListener('success', () => { T.options.lockAtWrite = null; T.lock(); });
      return request;
    }
    return original[method].call(this, value, ...args);
  };
  IDBObjectStore.prototype.get = function (...args) {
    if (stageStore(this) && this.name === 'pages') {
      txInfo(this.transaction).reads++; T.reads++; T.events.push({ type: 'page-read', key: args[0] });
      if (T.options.readFailAt === T.reads) throw new DOMException('Injected stage read failure', 'UnknownError');
    }
    return original.get.apply(this, args);
  };
  IDBObjectStore.prototype.delete = function (...args) {
    if (stageStore(this) && this.name === 'sessions' && T.options.failDiscard) {
      // Fail the final owned session deletion after real page cursor deletions.
      // The module must abort the native transaction; this is not a fake
      // successful discard or an erased notebook record.
      T.events.push({ type: 'discard-fault', importId: args[0] });
      throw new DOMException('Injected stage discard failure', 'UnknownError');
    }
    return original.delete.apply(this, args);
  };
  T.hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))).map(v => v.toString(16).padStart(2, '0')).join('');
  T.rows = async () => {
    const result = { sessions: [], pages: [] };
    for (const name of T.names) {
      const db = await new Promise((resolve, reject) => { const r = original.open.call(indexedDB, name); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
      try {
        if (!db.objectStoreNames.contains('pages')) continue;
        const rows = await new Promise((resolve, reject) => {
          const tx = original.transaction.call(db, ['sessions', 'pages'], 'readonly'); let sessions, pages;
          const s = tx.objectStore('sessions').getAll(), p = tx.objectStore('pages').getAll(); s.onsuccess = () => { sessions = s.result; }; p.onsuccess = () => { pages = p.result; };
          tx.oncomplete = () => resolve({ sessions, pages }); tx.onabort = tx.onerror = () => reject(tx.error || Error('Inspect stage failed'));
        });
        result.sessions.push(...rows.sessions.map(r => ({ db: name, importId: r.importId, count: r.count, chars: r.chars })));
        for (const r of rows.pages) result.pages.push({ db: name, importId: r.importId, number: r.number, width: r.width, height: r.height, chars: r.image.length, sha256: await T.hash(r.image) });
      } finally { db.close(); }
    }
    return result;
  };
  T.summary = async () => ({ writes: T.writes, reads: T.reads, commits: T.commits, notebookWrites: T.notebookWrites, held: T.held, rows: await T.rows(), events: T.events });
  T.originalDbPut = dbPut;
  dbPut = async (...args) => { T.notebookWrites++; return T.originalDbPut(...args); };
  T.failLostAcknowledgement = ({ failDiscard = false } = {}) => {
    dbPut = async (...args) => {
      T.notebookWrites++; await T.originalDbPut(...args);
      if (failDiscard) T.options.failDiscard = true;
      throw Object.assign(Error('Injected lost reply after real commit'), { name: 'SaveWorkerLost' });
    };
  };
  T.restoreDbPut = () => { dbPut = async (...args) => { T.notebookWrites++; return T.originalDbPut(...args); }; };
}

async function fixture(browser, resource) {
  const f = resource; f.external = []; f.errors = []; f.methods = []; f.requests = []; f.workers = []; f.closed = false;
  const server = f.server = http.createServer((req, res) => {
    f.methods.push(req.method); const url = new URL(req.url, 'http://loopback'); f.requests.push(url.pathname);
    if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
    if (url.pathname === '/__stage_probe__.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end('<!doctype html><title>Synthetic stage-only tab</title>'); return; }
    if (url.pathname === '/api/v1/bilge-defter/whoami') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ account_protocol: 'approval-v1', identity: { type: 'access', id: '11111111-1111-4111-8111-111111111111', status: 'approved', role: 'student', email: 'staging@example.test' } })); return; }
    const name = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname), data = files.get(name);
    const headers = { 'Content-Type': mime[path.extname(name)] || 'application/octet-stream', 'Cache-Control': 'no-store' };
    if (name === '/pptx/renderer-frame.html' && data) {
      const csp = data.toString().match(/<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]+content="([^"]+)"/i);
      if (csp) headers['Content-Security-Policy'] = csp[1];
    }
    res.writeHead(data ? 200 : 404, headers); res.end(data || '');
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  if (f.closed) throw Error('Fixture canceled');
  f.origin = 'http://127.0.0.1:' + server.address().port;
  // Playwright 1.62.1's serviceWorkers:'block' init script reads the SW getter
  // in every frame, which itself throws in the real opaque renderer sandbox.
  // Match the existing PPTX notebook fixture: disable only in the trusted top
  // document, then assert zero worker events/instances/script requests below.
  const context = await browser.newContext({ viewport: { width: 1180, height: 920 }, hasTouch: true, acceptDownloads: true });
  f.context = context; if (f.closed) { await context.close(); throw Error('Fixture canceled'); }
  context.on('page', page => page.on('pageerror', error => f.errors.push(error.message)));
  context.on('serviceworker', worker => f.workers.push(worker.url()));
  context.setDefaultTimeout(20000); await context.tracing.start({ snapshots: true, screenshots: false, sources: true });
  await context.addInitScript(({ origin }) => { if (window.top !== window || location.origin !== origin) return; window.__accountRequired = true; localStorage.setItem('bilge_defter_onboarding_v1', 'true'); try { delete Navigator.prototype.serviceWorker; } catch {} }, { origin: f.origin });
  await context.route('**/*', route => { const url = new URL(route.request().url()); if (['http:', 'https:'].includes(url.protocol) && url.origin !== f.origin) { f.external.push(url.href); return route.abort(); } return route.continue(); });
  f.p = await context.newPage();
  await f.p.goto(f.origin); await f.p.waitForFunction(() => typeof ready !== 'undefined' && ready && window.__v2UI);
  await settle(f.p); await f.p.evaluate(installProbe);
  // Preserve a real existing pen note in every failure/cancel case, not merely
  // an empty notebook whose data loss could be invisible to the assertion.
  await draw(f.p);
  return f;
}
async function cleanup(f) {
  f.closed = true;
  const errors = [];
  try {
    if (f.context) {
      try { await deadline(f.context.tracing.stop({ path: path.join(out, f.name + '-trace.zip') }), 10000, 'Stop trace'); } catch (e) { errors.push(e); }
      try { await deadline(f.context.close(), 10000, 'Close context'); } catch (e) { errors.push(e); }
    }
  } finally {
    try { if (f.server) { f.server.closeAllConnections(); await deadline(new Promise(resolve => f.server.close(resolve)), 10000, 'Close server'); } } catch (e) { errors.push(e); }
    resources.delete(f);
  }
  if (errors.length) throw new AggregateError(errors, 'Fixture cleanup failed');
}
async function settle(p) { await p.evaluate(async () => { if (!await flushSave()) throw Error('Save failed'); if (typeof ensureAssets === 'function') await ensureAssets(); if (!await flushSave()) throw Error('Final save failed'); }); }
async function baseline(p) { return p.evaluate(async () => ({ state: JSON.stringify(state), disk: JSON.stringify(await dbGet()), writes: __stageTest.notebookWrites })); }
async function unchanged(p, before, { locked = false } = {}) {
  const after = await baseline(p); if (!locked) assert.equal(after.state, before.state, 'In-memory notebook changed before commit');
  assert.equal(after.disk, before.disk, 'Stored notebook changed without Apply'); assert.equal(after.writes, before.writes, 'Unexpected notebook write');
}
async function openImport(p) {
  await p.locator('bilge-defter-ui [data-panel="insert"]').click();
  await p.locator('bilge-defter-ui [data-command="presentation.native"]').click();
  await p.locator('#pptxImportDialog[open]').waitFor(); await p.waitForFunction(() => BilgePptx.snapshot().import?.phase === 'idle');
}
async function choose(p, name = 'synthetic-a.pptx', alternate = false) {
  const event = p.waitForEvent('filechooser'); await p.locator('#pptxNotebookChoose').click();
  await (await event).setFiles({ name, mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', buffer: decks[alternate ? 1 : 0] });
}
async function prepared(p) {
  await p.waitForFunction(() => ['ready', 'error', 'uncertain'].includes(BilgePptx.snapshot().import?.phase));
  const value = await p.evaluate(() => ({ import: BilgePptx.snapshot().import, text: document.querySelector('#pptxNotebookStatus')?.textContent }));
  assert.equal(value.import.phase, 'ready', value.text); assert.equal(value.import.pages, 2); assert.equal(value.import.staged, true);
  assert.equal(value.import.preparationStorage, 'disk'); assert.equal(value.import.retainedPageImages, 0, 'Ready page array must not retain encoded slide images');
  assert.equal(await p.locator('#pptxNotebookApply').isEnabled(), true);
  const rows = await p.evaluate(() => __stageTest.rows()); assert.equal(rows.pages.length, 2); assert.equal(rows.sessions.length, 1);
  assert.deepEqual(rows.pages.map(x => x.number).sort(), [1, 2]); assert.equal(rows.sessions[0].count, 2);
  const preview = await p.locator('#pptxNotebookPreview img').getAttribute('src'); assert.equal(sha(preview), rows.pages.find(x => x.number === 1).sha256);
  return { ...value, rows };
}
async function emptyStage(p) { await p.waitForFunction(async () => { const r = await __stageTest.rows(); return r.sessions.length === 0 && r.pages.length === 0; }); }
async function errorUI(p) {
  await p.waitForFunction(() => BilgePptx.snapshot().import?.phase === 'error');
  assert.equal(await p.locator('#pptxNotebookApply').isEnabled(), false); assert.equal(await p.locator('#pptxNotebookCancel').isEnabled(), true);
  const text = await p.locator('#pptxNotebookStatus').innerText(); assert.match(text, /depo|depolama|alan|cihaz|slayt/i); assert.match(text, /eklenmedi/i);
  assert.equal(await p.locator('#pptxNotebookPreview img').getAttribute('src'), null); await emptyStage(p); return text;
}
async function imported(p) { await p.waitForFunction(() => !document.querySelector('#pptxImportDialog')?.open && canEdit() && pdfBackgroundReady()); await settle(p); await emptyStage(p); }
async function draw(p) {
  await p.evaluate(() => document.querySelector('[data-tool="pen"]').click()); await p.waitForFunction(() => canEdit() && pdfBackgroundReady());
  const old = await p.evaluate(() => page().strokes.length);
  await p.locator('#canvas').evaluate(canvas => { const r = canvas.getBoundingClientRect(); for (const [type, dx] of [['pointerdown', 0], ['pointermove', 30], ['pointerup', 60]]) canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 73, pointerType: 'pen', button: 0, buttons: type === 'pointerup' ? 0 : 1, isPrimary: true, pressure: .5, clientX: r.left + 140 + dx, clientY: r.top + 130 })); });
  await p.waitForFunction(n => page().strokes.length === n + 1, old); await settle(p);
}

async function closedImportRecovery(f, failureMode) {
  const { p } = f, before = await baseline(p);
  await openImport(p); await choose(p); const ready = await prepared(p);
  await p.evaluate(mode => {
    // Model a save callback queued before the import outcome was known. Keep
    // references to the real functions, not a new recovery-only test API.
    const queuedMark = markChanged, queuedSchedule = scheduleSave, queuedFlush = flushSave;
    __stageTest.staleQueuedSave = async () => { queuedMark(false); queuedSchedule(); return queuedFlush(); };
    if (mode === 'lost-ack') __stageTest.failLostAcknowledgement();
    else {
      const original = renderPages; __stageTest.renderFailureHits = 0;
      renderPages = (...args) => {
        renderPages = original; __stageTest.renderFailureHits++;
        throw Error('Injected renderPages failure after real import commit');
      };
    }
  }, failureMode);
  await p.locator('#pptxNotebookApply').click(); await p.waitForFunction(() => BilgePptx.snapshot().import?.phase === 'uncertain');
  const committed = await p.evaluate(async () => ({ disk: await dbGet(), writes: __stageTest.notebookWrites, runtimePages: state.pages.length, strokes: state.pages.map(row => row.strokes.length), status: document.querySelector('#pptxNotebookStatus').textContent }));
  await p.locator('#pptxNotebookCancel').click(); await p.waitForFunction(() => !BilgePptx.active);
  await p.evaluate(() => __stageTest.restoreDbPut());
  // Do not call draw(): its canEdit precondition would skip precisely the
  // unsafe interaction under test. Send the usual pen sequence to real app
  // listeners, then drain every real save path without first asserting a lock.
  await p.locator('#canvas').evaluate(canvas => {
    const r = canvas.getBoundingClientRect();
    for (const [type, dx] of [['pointerdown', 0], ['pointermove', 30], ['pointerup', 60]]) canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 91, pointerType: 'pen', button: 0, buttons: type === 'pointerup' ? 0 : 1, isPrimary: true, pressure: .5, clientX: r.left + 180 + dx, clientY: r.top + 160 }));
  });
  const after = await p.evaluate(async mode => {
    const penFlush = await flushSave();
    const queuedFlush = await __stageTest.staleQueuedSave();
    dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    const leaveFlush = await flushSave();
    dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    const disk = await dbGet(), diskText = JSON.stringify(disk);
    const probe = { failureMode: mode, diskPages: disk.pages.length, diskSha256: await __stageTest.hash(diskText), writes: __stageTest.notebookWrites, runtimePages: state.pages.length, runtimeStrokes: state.pages.map(row => row.strokes.length), canEdit: canEdit(), flushResults: { penFlush, queuedFlush, leaveFlush }, renderFailureHits: __stageTest.renderFailureHits || 0 };
    __stageTest.recoveryProbe = probe;
    return { disk, probe };
  }, failureMode);
  // Behavioral negative control comes first. Old source loses the two imported
  // pages on the lost-ACK path, or writes edited content after render failure.
  // Neither failure can be attributed to a missing new helper/DOM/API name.
  assert.equal(after.disk.pages.length, 3, 'Closing uncertain import allowed stale runtime to overwrite the committed three-page notebook');
  assert.equal(JSON.stringify(after.disk), JSON.stringify(committed.disk), 'Pen/queued/lifecycle save changed a notebook whose import outcome requires recovery');
  assert.equal(committed.disk.pages.length, 3); assert.equal(committed.writes, before.writes + 1);
  assert.equal(after.probe.writes, committed.writes, 'No post-uncertainty notebook write is permitted before recovery');
  assert.equal(after.probe.canEdit, false); assert.deepEqual(after.probe.runtimeStrokes, committed.strokes, 'Pen input must not mutate the uncertain runtime');
  if (failureMode === 'render-failure') assert.equal(after.probe.renderFailureHits, 1, 'Exercise actual post-commit render failure');
  assert.doesNotMatch(committed.status, /hiçbir sayfa eklenmedi/i);
  assert.equal(await p.locator('#saveRecovery').isVisible(), true); assert.equal(await p.locator('#reloadSaved').isVisible(), true); assert.equal(await p.locator('#reloadSaved').isEnabled(), true);
  await emptyStage(p);
  // Use the actual visible recovery action and its confirmation, not a hidden
  // state reset or an immediate test reload that would conceal the stale save.
  p.once('dialog', dialog => dialog.accept());
  await Promise.all([p.waitForNavigation(), p.locator('#reloadSaved').click()]);
  await p.waitForFunction(() => typeof ready !== 'undefined' && ready && canEdit() && pdfBackgroundReady());
  const recovered = await p.evaluate(() => state); assert.equal(recovered.pages.length, 3);
  assert.deepEqual(recovered.pages.filter(row => row.pdf).map(row => sha(row.pdf.image)), ready.rows.pages.sort((a, b) => a.number - b.number).map(row => row.sha256));
  assert.deepEqual(recovered.pages[0].strokes, JSON.parse(before.state).pages[0].strokes);
  assert.equal(await p.locator('#saveRecovery').isVisible(), false);
  const strokesBefore = await p.evaluate(() => page().strokes.length); await draw(p);
  const edited = await p.evaluate(async () => ({ pages: (await dbGet()).pages.length, strokes: page().strokes.length, editable: canEdit() }));
  assert.equal(edited.pages, 3); assert.equal(edited.strokes, strokesBefore + 1); assert.equal(edited.editable, true);
  return { failureMode, committed: { pages: committed.disk.pages.length, runtimePages: committed.runtimePages, writes: committed.writes, status: committed.status }, after: after.probe, recoveredPages: recovered.pages.length, normalEditingRestored: edited };
}

const cases = [
  ['stage-contract', async ({ p }) => {
    return p.evaluate(async () => {
      const { createImportStage } = await import('./pptx/import-stage.js'), scope = 'bilge-defter-account-11111111-1111-4111-8111-111111111111';
      const expect = async (fn, code) => { try { await fn(); } catch (e) { if (e.code === code) return e.code; throw e; } throw Error('Expected ' + code); };
      const errors = [await expect(() => createImportStage({ scope: 'bilge-defter', guard: () => true }), 'INVALID_ARGUMENT')];
      const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 100; canvas.getContext('2d').fillRect(0, 0, 1000, 100);
      const image = canvas.toDataURL('image/png'); let valid = true;
      const a = await createImportStage({ scope, guard: () => valid });
      try {
        errors.push(await expect(() => a.add({ number: 2, width: 1000, height: 100, image }), 'PAGE_SEQUENCE'));
        await a.add({ number: 1, width: 1000, height: 100, image });
        if (a.count !== 1 || a.chars !== image.length || (await a.read(1)).image !== image) throw Error('Stage roundtrip mismatch');
        errors.push(await expect(() => a.read(2), 'MISSING_PAGE'));
        const b = await createImportStage({ scope, guard: () => true });
        try { errors.push(await expect(() => b.read(1), 'MISSING_PAGE')); } finally { await b.discard(); }
        if ((await a.read(1)).image !== image) throw Error('Another stage removed active rows');
        valid = false; errors.push(await expect(() => a.read(1), 'STALE_SCOPE'));
      } finally { await a.discard(); }
      const rows = await __stageTest.rows(); if (rows.pages.length || rows.sessions.length) throw Error('Discard must ignore invalid account guard');
      return { errors, rows, imageSha256: await __stageTest.hash(image) };
    });
  }],
  ['ready-disk-and-cancel', async ({ p }) => {
    const before = await baseline(p); await openImport(p); await choose(p); const ready = await prepared(p); await unchanged(p, before);
    const probe = await p.evaluate(() => __stageTest.summary()); assert.equal(probe.writes, 2); assert.equal(probe.reads, 1, 'Only first slide needed for preview');
    assert.deepEqual(probe.events.filter(x => x.type === 'snapshot-command').map(x => x.index), [0, 1]);
    const firstCommit = probe.events.findIndex(x => x.type === 'complete' && x.writes === 1 && x.numbers.includes(1));
    const secondSnapshot = probe.events.findIndex(x => x.type === 'snapshot-command' && x.index === 1);
    assert.ok(firstCommit >= 0 && firstCommit < secondSnapshot, 'Second snapshot must follow first native stage completion');
    await p.locator('#pptxNotebookCancel').click(); await p.waitForFunction(() => !BilgePptx.active && canEdit()); await emptyStage(p);
    assert.equal(await p.locator('#pptxNotebookPreview img[src]').count(), 0); await unchanged(p, before); return { ready, probe };
  }],
  ['active-aged-stage-cross-tab-and-closed-orphan', async ({ p, context, origin }) => {
    await p.evaluate(async () => {
      const { createImportStage } = await import('./pptx/import-stage.js');
      const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 100; canvas.getContext('2d').fillRect(0, 0, 1000, 100);
      __stageTest.activeImage = canvas.toDataURL('image/png');
      __stageTest.activeStage = await createImportStage({ scope: 'bilge-defter-account-11111111-1111-4111-8111-111111111111', guard: () => true });
      await __stageTest.activeStage.add({ number: 1, width: 1000, height: 100, image: __stageTest.activeImage });
      const rows = await __stageTest.rows(), row = rows.sessions[0];
      const db = await new Promise((resolve, reject) => { const r = indexedDB.open(row.db); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
      try { await new Promise((resolve, reject) => {
        const tx = db.transaction('sessions', 'readwrite'), store = tx.objectStore('sessions'), request = store.get(row.importId);
        request.onsuccess = () => { const value = request.result; value.updatedAt = Date.now() - 48 * 60 * 60 * 1000; store.put(value); };
        tx.oncomplete = resolve; tx.onabort = tx.onerror = () => reject(tx.error || Error('Age fixture failed'));
      }); } finally { db.close(); }
    });
    const old = await p.evaluate(() => __stageTest.rows()); assert.equal(old.pages.length, 1);
    const other = await context.newPage();
    try {
      await other.goto(origin + '/__stage_probe__.html');
      await other.evaluate(async () => { const { createImportStage } = await import('./pptx/import-stage.js'); const stage = await createImportStage({ scope: 'bilge-defter-account-11111111-1111-4111-8111-111111111111', guard: () => true }); await stage.discard(); });
      assert.equal(await p.evaluate(async () => (await __stageTest.activeStage.read(1)).image === __stageTest.activeImage), true, 'Other tab cleanup must not steal an active aged stage');
      const active = await p.evaluate(() => __stageTest.rows()); assert.deepEqual(active, old);
      await p.evaluate(() => __stageTest.activeStage.close());
      await p.waitForFunction(async id => !(await navigator.locks.query()).held.some(lock => lock.name.includes(id)), old.sessions[0].importId);
      const closed = await p.evaluate(async () => { try { await __stageTest.activeStage.read(1); return 'unexpected-read'; } catch (e) { return e.code; } }); assert.equal(closed, 'STAGE_CLOSED');
      await other.evaluate(async () => { const { createImportStage } = await import('./pptx/import-stage.js'); const stage = await createImportStage({ scope: 'bilge-defter-account-11111111-1111-4111-8111-111111111111', guard: () => true }); await stage.discard(); });
      await emptyStage(p); return { activeRetained: true, closed, oldImportId: old.sessions[0].importId, orphanCollected: true };
    } finally { await other.close(); }
  }],
  ['apply-backup-restore-reload', async ({ p, name }) => {
    await draw(p); const before = await baseline(p); await openImport(p); await choose(p); const ready = await prepared(p); await unchanged(p, before);
    await p.locator('#pptxNotebookApply').click(); await imported(p);
    const actual = await p.evaluate(async () => ({ state, previous: await dbGet('before-import'), reads: __stageTest.reads }));
    assert.equal(actual.state.pages.length, 3); assert.deepEqual(actual.state.pages[0], JSON.parse(before.state).pages[0]); assert.equal(JSON.stringify(actual.previous), before.disk);
    assert.deepEqual(actual.state.pages.slice(-2).map(x => sha(x.pdf.image)), ready.rows.pages.sort((a, b) => a.number - b.number).map(x => x.sha256));
    assert.equal(actual.reads, 3, 'Apply reads each staged slide once, after single preview read');
    await draw(p); const noteState = await p.evaluate(() => state);
    const event = p.waitForEvent('download'); await p.evaluate(() => exportNotebook()); const download = await event;
    const backupFile = path.join(out, name + '-notebook.json'); await download.saveAs(backupFile); const backup = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
    assert.equal(backup.pages.length, 3); assert.ok(backup.pages.filter(x => x.pdf).every(x => x.pdf.image.startsWith('data:image/')));
    assert.deepEqual(backup.pages.map(x => x.strokes.length), noteState.pages.map(x => x.strokes.length));
    assert.deepEqual(backup.pages.filter(x => x.pdf).map(x => sha(x.pdf.image)), ready.rows.pages.map(x => x.sha256));
    await p.evaluate(async backup => { const parsed = parseBackup(backup); await validatePdfImages(parsed.book); if (!await replaceNotebook(blank(), 'Synthetic blank')) throw Error('Blank replacement failed'); if (!await replaceNotebook(parsed.book, 'Synthetic restore')) throw Error('Restore failed'); }, backup);
    await settle(p); await p.reload(); await p.waitForFunction(() => typeof ready !== 'undefined' && ready && canEdit() && pdfBackgroundReady());
    const reloaded = await p.evaluate(() => state); assert.equal(reloaded.pages.length, 3);
    assert.deepEqual(reloaded.pages.map(x => x.strokes), backup.pages.map(x => x.strokes)); assert.deepEqual(reloaded.pages.filter(x => x.pdf).map(x => sha(x.pdf.image)), ready.rows.pages.map(x => x.sha256));
    return { ready, finalPages: reloaded.pages.length, strokes: reloaded.pages.map(x => x.strokes.length), backupSha256: sha(fs.readFileSync(backupFile)) };
  }],
  ['quota-preserves-notebook', async ({ p }) => {
    const before = await baseline(p); await openImport(p); await p.evaluate(() => { __stageTest.options.quotaAt = 2; }); await choose(p);
    const text = await errorUI(p); assert.match(text, /yeterli|alan/i); await unchanged(p, before); return { text, probe: await p.evaluate(() => __stageTest.summary()) };
  }],
  ['open-fault-preserves-notebook', async ({ p }) => {
    const before = await baseline(p); await openImport(p); await p.evaluate(() => { __stageTest.options.failOpen = true; }); await choose(p);
    const text = await errorUI(p); await unchanged(p, before); return { text, probe: await p.evaluate(() => __stageTest.summary()) };
  }],
  ['web-locks-unavailable-fails-closed', async ({ p }) => {
    const before = await baseline(p); await openImport(p);
    await p.evaluate(() => {
      __stageTest.locksDescriptor = Object.getOwnPropertyDescriptor(navigator, 'locks');
      Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
    });
    let text, probe;
    try {
      assert.equal(await p.evaluate(() => navigator.locks === undefined), true, 'Actual capability must be absent');
      await choose(p); await p.waitForFunction(() => BilgePptx.snapshot().import?.phase === 'error');
      text = await p.locator('#pptxNotebookStatus').innerText(); assert.match(text, /tarayıcı.*güvenli sunum hazırlığını desteklemiyor/i); assert.match(text, /eklenmedi/i);
      assert.equal(await p.locator('#pptxNotebookApply').isEnabled(), false); assert.equal(await p.locator('#pptxNotebookCancel').isEnabled(), true);
      assert.equal(await p.locator('#pptxNotebookPreview img').getAttribute('src'), null);
      await emptyStage(p); await unchanged(p, before); probe = await p.evaluate(() => __stageTest.summary());
      assert.equal(probe.writes, 0); assert.equal(probe.reads, 0); assert.equal(probe.events.some(e => e.type === 'snapshot-command'), false, 'Do not rasterize without safe staging');
    } finally {
      await p.evaluate(() => { const descriptor = __stageTest.locksDescriptor; if (descriptor) Object.defineProperty(navigator, 'locks', descriptor); else delete navigator.locks; });
    }
    await p.locator('#pptxNotebookCancel').click(); await unchanged(p, before); return { text, probe, capabilityAbsenceInjected: true };
  }],
  ['read-fault-before-commit', async ({ p }) => {
    const before = await baseline(p); await openImport(p); await choose(p); await prepared(p);
    await p.evaluate(() => { __stageTest.options.readFailAt = __stageTest.reads + 1; }); await p.locator('#pptxNotebookApply').click();
    const text = await errorUI(p); await unchanged(p, before); return { text, probe: await p.evaluate(() => __stageTest.summary()) };
  }],
  ['missing-last-slide-before-commit', async ({ p }) => {
    const before = await baseline(p); await openImport(p); await choose(p); const ready = await prepared(p);
    const last = ready.rows.pages.find(row => row.number === 2);
    await p.evaluate(async row => {
      const db = await new Promise((resolve, reject) => { const r = indexedDB.open(row.db); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
      try { await new Promise((resolve, reject) => { const tx = db.transaction('pages', 'readwrite'); tx.objectStore('pages').delete([row.importId, row.number]); tx.oncomplete = resolve; tx.onabort = tx.onerror = () => reject(tx.error || Error('Synthetic deletion failed')); }); }
      finally { db.close(); }
    }, last);
    await p.locator('#pptxNotebookApply').click(); const text = await errorUI(p); assert.match(text, /bulunamadı/i);
    await unchanged(p, before); return { text, probe: await p.evaluate(() => __stageTest.summary()) };
  }],
  ['account-lock-during-stage-write', async ({ p }) => {
    const before = await baseline(p); await openImport(p); await p.evaluate(() => { __stageTest.options.lockAtWrite = 1; }); await choose(p);
    await p.waitForFunction(() => BilgeAccount.locked === true); await emptyStage(p);
    assert.equal(await p.locator('#pptxImportDialog[open]').count(), 0); await unchanged(p, before, { locked: true }); return p.evaluate(() => __stageTest.summary());
  }],
  ['replace-ready-source-cleans-old-stage', async ({ p }) => {
    const before = await baseline(p); await openImport(p); await choose(p); const a = await prepared(p);
    await choose(p, 'synthetic-b.pptx', true); const b = await prepared(p);
    assert.notEqual(a.rows.sessions[0].importId, b.rows.sessions[0].importId); assert.notEqual(a.rows.pages.find(x => x.number === 1).sha256, b.rows.pages.find(x => x.number === 1).sha256);
    assert.match(await p.locator('#pptxNotebookFilename').innerText(), /synthetic-b/); await unchanged(p, before);
    await p.locator('#pptxNotebookCancel').click(); await emptyStage(p); return { a, b };
  }],
  ['replace-source-during-write-ack', async ({ p }) => {
    const before = await baseline(p); await openImport(p); await p.evaluate(() => { __stageTest.options.holdWrite = true; }); await choose(p);
    await p.waitForFunction(() => __stageTest.held?.kind === 'write'); const a = await p.evaluate(() => __stageTest.rows()); assert.equal(a.pages.length, 1);
    assert.deepEqual(await p.evaluate(() => __stageTest.events.filter(x => x.type === 'snapshot-command').map(x => x.index)), [0], 'Await native stage acknowledgement before requesting next snapshot');
    await choose(p, 'replacement-b.pptx', true); await p.evaluate(() => __stageTest.release?.()); const b = await prepared(p);
    assert.ok(b.rows.pages.every(x => x.importId !== a.pages[0].importId)); assert.notEqual(b.rows.pages.find(x => x.number === 1).sha256, a.pages[0].sha256);
    assert.match(await p.locator('#pptxNotebookFilename').innerText(), /replacement-b/); await unchanged(p, before);
    await p.locator('#pptxNotebookCancel').click(); await emptyStage(p); return { a, b, probe: await p.evaluate(() => __stageTest.summary()) };
  }],
  ['cancel-during-stage-read', async ({ p }) => {
    const before = await baseline(p); await openImport(p); await choose(p); await prepared(p);
    await p.evaluate(() => { __stageTest.options.holdRead = true; }); await p.locator('#pptxNotebookApply').click();
    await p.waitForFunction(() => __stageTest.held?.kind === 'read'); assert.equal(await p.evaluate(() => BilgePptx.snapshot().import.phase), 'reading');
    assert.equal(await p.locator('#pptxNotebookCancel').isEnabled(), true); assert.equal(await p.locator('#pptxNotebookChoose').isEnabled(), false);
    await p.locator('#pptxNotebookCancel').click(); await p.evaluate(() => __stageTest.release?.()); await p.waitForFunction(() => !BilgePptx.active && canEdit());
    await emptyStage(p); await unchanged(p, before); assert.equal(await p.locator('#pptxNotebookPreview img[src]').count(), 0); return p.evaluate(() => __stageTest.summary());
  }],
  ['pagehide-cancels-reading-stage', async ({ p }) => {
    const before = await baseline(p); await openImport(p); await choose(p); await prepared(p);
    await p.evaluate(() => { __stageTest.options.holdRead = true; }); await p.locator('#pptxNotebookApply').click();
    await p.waitForFunction(() => __stageTest.held?.kind === 'read');
    await p.evaluate(() => { dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })); __stageTest.release?.(); dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); });
    await p.waitForFunction(() => !BilgePptx.active); await emptyStage(p); await unchanged(p, before);
    assert.equal(await p.locator('#pptxNotebookPreview img[src]').count(), 0);
    return { eventSimulationOnly: true, probe: await p.evaluate(() => __stageTest.summary()) };
  }],
  ['lost-commit-ack-is-uncertain-no-duplicate', async ({ p }) => {
    const before = await baseline(p); await openImport(p); await choose(p); const ready = await prepared(p);
    await p.evaluate(() => __stageTest.failLostAcknowledgement()); await p.locator('#pptxNotebookApply').click();
    await p.waitForFunction(() => BilgePptx.snapshot().import?.phase === 'uncertain'); const text = await p.locator('#pptxNotebookStatus').innerText(); assert.match(text, /kesin|kontrol|tekrar/i);
    assert.doesNotMatch(text, /hiçbir sayfa eklenmedi/i, 'Uncertain commit must not claim that no pages were added');
    assert.equal(await p.locator('#pptxNotebookApply').isEnabled(), false); assert.equal(await p.locator('#pptxNotebookPrepare').isEnabled(), false);
    await p.locator('#pptxNotebookApply').evaluate(button => { button.click(); button.click(); });
    const evidence = await p.evaluate(async () => ({ writes: __stageTest.notebookWrites, disk: await dbGet(), previous: await dbGet('before-import'), state: JSON.stringify(state) }));
    assert.equal(evidence.writes, before.writes + 1); assert.equal(evidence.disk.pages.length, 3); assert.equal(evidence.state, before.state); assert.equal(JSON.stringify(evidence.previous), before.disk);
    await p.evaluate(() => __stageTest.restoreDbPut()); await p.locator('#pptxNotebookCancel').click(); await emptyStage(p);
    await p.reload(); await p.waitForFunction(() => typeof ready !== 'undefined' && ready && canEdit());
    const after = await p.evaluate(() => state); assert.equal(after.pages.length, 3); assert.deepEqual(after.pages.filter(x => x.pdf).map(x => sha(x.pdf.image)), ready.rows.pages.sort((a, b) => a.number - b.number).map(x => x.sha256));
    return { text, persistedPages: evidence.disk.pages.length, notebookWrites: evidence.writes - before.writes, reloadedPages: after.pages.length };
  }],
  ['closed-uncertain-lost-ack-blocks-stale-save', async f => closedImportRecovery(f, 'lost-ack')],
  ['closed-uncertain-render-failure-blocks-stale-save', async f => closedImportRecovery(f, 'render-failure')],
  ['lost-commit-ack-and-discard-fault-stays-uncertain', async ({ p }) => {
    const before = await baseline(p); await openImport(p); await choose(p); const ready = await prepared(p);
    await p.evaluate(() => __stageTest.failLostAcknowledgement({ failDiscard: true })); await p.locator('#pptxNotebookApply').click();
    await p.waitForFunction(() => BilgePptx.snapshot().import?.phase === 'uncertain' && __stageTest.events.some(e => e.type === 'discard-fault') && __stageTest.events.some(e => e.type === 'abort'));
    const text = await p.locator('#pptxNotebookStatus').innerText(); assert.match(text, /kesin|kontrol|tekrar/i); assert.doesNotMatch(text, /Injected stage discard failure/);
    assert.doesNotMatch(text, /hiçbir sayfa eklenmedi/i, 'Cleanup failure cannot turn uncertainty into a no-pages-added claim');
    assert.equal(await p.locator('#pptxNotebookApply').isEnabled(), false); assert.equal(await p.locator('#pptxNotebookPrepare').isEnabled(), false);
    assert.equal(await p.locator('#pptxNotebookCancel').isEnabled(), true);
    await p.locator('#pptxNotebookApply').evaluate(button => { button.click(); button.click(); });
    await p.locator('#pptxNotebookPrepare').evaluate(button => button.click());
    const evidence = await p.evaluate(async () => ({ phase: BilgePptx.snapshot().import.phase, probe: await __stageTest.summary(), disk: await dbGet(), previous: await dbGet('before-import'), state: JSON.stringify(state) }));
    assert.equal(evidence.phase, 'uncertain', 'Cleanup failure must not turn uncertain commit into a retryable preparation error');
    assert.equal(evidence.probe.notebookWrites, before.writes + 1); assert.equal(evidence.disk.pages.length, 3);
    assert.equal(evidence.state, before.state); assert.equal(JSON.stringify(evidence.previous), before.disk);
    assert.equal(evidence.probe.events.filter(e => e.type === 'discard-fault').length, 1);
    assert.deepEqual(evidence.probe.rows, ready.rows, 'Failed cleanup must leave only its owned stage orphan, not partial stage deletion');
    await p.evaluate(() => __stageTest.restoreDbPut()); await p.locator('#pptxNotebookCancel').click();
    assert.equal(await p.locator('#pptxNotebookPreview img[src]').count(), 0);
    assert.equal(await p.evaluate(() => __stageTest.notebookWrites), before.writes + 1, 'Closing uncertainty must not overwrite committed notebook');
    await p.reload(); await p.waitForFunction(() => typeof ready !== 'undefined' && ready && canEdit());
    const after = await p.evaluate(() => state); assert.equal(after.pages.length, 3, 'Reload must expose exactly one imported copy');
    assert.deepEqual(after.pages[0].strokes, JSON.parse(before.state).pages[0].strokes);
    assert.deepEqual(after.pages.filter(x => x.pdf).map(x => sha(x.pdf.image)), ready.rows.pages.sort((a, b) => a.number - b.number).map(x => x.sha256));
    return { text, persistedPages: evidence.disk.pages.length, reloadedPages: after.pages.length, notebookWrites: evidence.probe.notebookWrites - before.writes, probe: evidence.probe, orphanExpectedAfterInjectedCleanupFailure: true };
  }]
];

async function diagnostics(f) {
  if (!f.p || f.p.isClosed()) return { closed: true };
  return deadline(f.p.evaluate(async () => ({ import: window.BilgePptx?.snapshot(), text: document.querySelector('#pptxNotebookStatus')?.textContent, locked: window.BilgeAccount?.locked, recoveryProbe: window.__stageTest?.recoveryProbe || null, probe: window.__stageTest ? await __stageTest.summary() : null })), 5000, 'Diagnostics');
}
async function run() {
  if (negative === 'retain-images') {
    // Defect injection only into immutable server bytes, never a workspace edit.
    // Public snapshot then counts the real retained image fields; failure must
    // be the memory invariant, not missing APIs or an intentionally false flag.
    const name = '/pptx-workspace.js', content = files.get(name).toString();
    const needle = 'pages.push({width:slide.width, height:slide.height, number:index + 1, total:meta.slideCount, strokes:ink.get(index + 1) || []});';
    assert.equal(content.split(needle).length - 1, 1, 'Negative injection must match exactly once');
    files.set(name, Buffer.from(content.replace(needle, needle.replace('pages.push({', 'pages.push({image:slide.image, '))));
    report.injection = { file: name, kind: 'retain real slide.image in ready metadata array', originalSha256: source[name], servedSha256: sha(files.get(name)) };
  }
  report.servedSource = hashSource(files);
  fs.writeFileSync(path.join(out, 'source.json'), JSON.stringify({ source, servedSource: report.servedSource, runnerSha256: report.runnerSha256, injection: report.injection }, null, 2));
  const selected = cases.filter(([name]) => !caseFilter || name.includes(caseFilter)); assert.ok(selected.length, 'No matching cases');
  for (const [engine, type] of Object.entries({ chromium, webkit })) {
    if (engineFilter && engineFilter !== engine) continue;
    const browser = await deadline(type.launch({ headless: true }), 30000, engine + ' launch');
    try {
      for (const [name, test] of selected) {
        const started = Date.now(), f = { name: engine + '-' + name }; resources.add(f);
        const result = { engine, name, ok: false, startedAt: new Date(started).toISOString() };
        try {
          result.evidence = await deadline((async () => { await fixture(browser, f); return test(f); })(), 120000, f.name);
          assert.deepEqual(f.external, [], 'External network request'); assert.deepEqual(f.errors, [], 'Browser page error');
          assert.deepEqual(f.workers, [], 'Unexpected service worker event'); assert.equal(f.context.serviceWorkers().length, 0, 'No service worker may remain in the context');
          assert.ok(!f.requests.some(x => /(?:^|\/)sw\.js$/i.test(x)), 'No service worker script may be requested');
          assert.ok(f.methods.every(x => x === 'GET'), 'Unexpected network mutation'); assert.ok(!f.requests.some(x => x.includes('pdf-tools')), 'Server converter must not be used');
          result.ok = true;
        } catch (error) { result.error = error.stack || String(error); try { result.diagnostics = await diagnostics(f); } catch (e) { result.diagnosticsError = e.message; } }
        finally {
          result.network = { external: f.external, methods: [...new Set(f.methods || [])], errors: f.errors, serviceWorkerEvents: f.workers, serviceWorkerScriptRequests: (f.requests || []).filter(x => /(?:^|\/)sw\.js$/i.test(x)) };
          try { await cleanup(f); } catch (e) { result.ok = false; result.cleanupError = e.stack || String(e); }
          result.elapsedMs = Date.now() - started; report.results.push(result);
          fs.writeFileSync(path.join(out, f.name + '.json'), JSON.stringify(result, null, 2));
          console.log((result.ok ? 'PASS ' : 'FAIL ') + f.name + ' ' + result.elapsedMs + 'ms');
        }
      }
    } finally { await deadline(browser.close(), 15000, engine + ' close'); }
  }
  const after = hashSource(readSource(root)); report.drift = [...new Set([...Object.keys(source), ...Object.keys(after)])].filter(name => source[name] !== after[name]);
  assert.deepEqual(report.drift, [], 'Source drifted during acceptance');
  report.ok = report.results.length > 0 && report.results.every(x => x.ok);
}
run().catch(error => { report.ok = false; report.fatal = error.stack || String(error); }).finally(async () => {
  for (const f of [...resources]) { try { await cleanup(f); } catch (error) { report.ok = false; (report.cleanupErrors ||= []).push(error.message); } }
  report.finishedAt = new Date().toISOString(); report.passed = report.results.filter(x => x.ok).length; report.failed = report.results.filter(x => !x.ok).length;
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: report.ok, passed: report.passed, failed: report.failed, fatal: report.fatal, out })); process.exitCode = report.ok ? 0 : 1;
});
