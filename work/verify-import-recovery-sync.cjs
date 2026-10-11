'use strict';
// Synthetic loopback boundary acceptance. This does not model a worker crash:
// the public quarantine entry point is injected after deterministic native
// crypto/IDB boundaries. Real sync handlers, fetch, crypto and IDB still run.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const crypto = require('node:crypto'), assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const repo = path.resolve(__dirname, '..');
const root = path.resolve(process.env.BILGE_TEST_ROOT || path.join(__dirname, 'bilge-defter-test'));
const args = process.argv.slice(2), arg = name => args.find(v => v.startsWith('--' + name + '='))?.slice(name.length + 3);
assert.ok(args.every(v => /^--(?:out|engine|case)=.+$/.test(v)), 'Unknown argument');
const engineFilter = arg('engine'), caseFilter = arg('case');
assert.ok(!engineFilter || ['chromium', 'webkit'].includes(engineFilter), 'Unknown engine');
const out = path.resolve(arg('out') || path.join(repo, 'outputs/import-recovery-sync', new Date().toISOString().replace(/[:.]/g, '-') + '-' + crypto.randomUUID()));
assert.ok(out.startsWith(path.join(repo, 'outputs') + path.sep), 'Evidence must be under repository outputs');
assert.ok(!fs.existsSync(out), 'Refuse to overwrite evidence');
fs.mkdirSync(out, { recursive: true });
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
function readSource(dir, prefix = '') {
  const files = new Map();
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    assert.ok(!entry.isSymbolicLink(), 'Refuse symlink source');
    const name = prefix + entry.name, file = path.join(dir, entry.name);
    if (entry.isDirectory()) for (const pair of readSource(file, name + '/')) files.set(...pair);
    else { assert.ok(entry.isFile(), 'Regular source file required'); files.set('/' + name, fs.readFileSync(file)); }
  }
  return files;
}
const hashes = files => Object.fromEntries([...files].map(([name, data]) => [name, sha(data)]).sort(([a], [b]) => a.localeCompare(b)));
const files = readSource(root), source = hashes(files), resources = new Set();
const report = { ok: false, startedAt: new Date().toISOString(), root, source, runnerSha256: sha(fs.readFileSync(__filename)), results: [], releaseEligible: false,
  boundaries: [
    'Both desktop browser engines, fresh synthetic account/storage per case, loopback server only; no live account, classroom or iPad acceptance.',
    'Real sync button handlers, real AES-GCM encryption, actual HTTP requests and native IndexedDB are used. No source response is patched.',
    'quarantineImport is injected directly to isolate downstream write boundaries; the real importer uncertainty chain is covered by the separate PPTX staging suite.',
    'For an old source without quarantineImport the injection is a recorded no-op. Negative controls must fail by actual POST or receipt writes, not a missing symbol.',
    'A request dispatched before quarantine is not undone. The late-ack case deliberately permits one prior POST and rejects only its later local receipt write.',
    'Native crypto result promises are held after genuine computation; the IDB request hook injects quarantine synchronously before the product success handler, keeping the native transaction active.',
    'Button onclick is invoked directly to capture its returned settlement promise; passphrase form submission and automatic visibility trigger use the real UI handlers.'
  ] };
fs.writeFileSync(path.join(out, 'source.json'), JSON.stringify({ source, runnerSha256: report.runnerSha256 }, null, 2));
fs.copyFileSync(__filename, path.join(out, 'runner.cjs'));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm', '.woff2': 'font/woff2' };
async function deadline(promise, ms, label) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error(label + ' exceeded ' + ms + 'ms')), ms); })]); }
  finally { clearTimeout(timer); }
}

function installProbe() {
  const T = window.__recoverySync = { events: [], arm: null, held: null, actionDone: false, actionError: null, ackInjection: false, putInjection: false, requestInjections: 0 };
  const encrypt = SubtleCrypto.prototype.encrypt, digest = SubtleCrypto.prototype.digest, get = IDBObjectStore.prototype.get;
  T.quarantine = (scope = DB) => {
    const available = typeof quarantineImport === 'function';
    T.events.push({ type: 'quarantine', scope, available });
    if (available) quarantineImport(scope, Object.assign(Error('Synthetic lost import acknowledgement'), { name: 'ImportCommitUnknown' }));
    return available;
  };
  T.hold = (kind, text = null) => { if (T.arm || T.held) throw Error('Only one probe barrier may be pending'); T.arm = { kind, text }; };
  const barrier = async (kind, result, text) => {
    if (T.arm?.kind !== kind || (T.arm.text !== null && T.arm.text !== text)) return result;
    T.arm = null; T.held = kind; T.events.push({ type: 'held', kind });
    await new Promise(resolve => { T.release = () => { T.release = null; T.held = null; T.events.push({ type: 'released', kind }); resolve(); }; });
    return result;
  };
  SubtleCrypto.prototype.encrypt = async function (...args) { return barrier('encrypt', await encrypt.apply(this, args)); };
  SubtleCrypto.prototype.digest = async function (...args) {
    const result = await digest.apply(this, args);
    const text = T.arm?.kind === 'digest' ? new TextDecoder().decode(args[1]) : null;
    return barrier('digest', result, text);
  };
  IDBObjectStore.prototype.get = function (...args) {
    const request = get.apply(this, args);
    if (T.ackInjection && this.transaction.db.name === DB && this.name === STORE && this.transaction.mode === 'readwrite' && args[0] === 'app') {
      T.ackInjection = false;
      request.addEventListener('success', () => { T.requestInjections++; T.events.push({ type: 'native-app-get-success-before-product' }); T.quarantine(); }, { once: true });
    }
    if (T.putInjection && this.transaction.db.name === DB && this.name === STORE && this.transaction.mode === 'readwrite' && args[0] === 'sync-state-v2') {
      T.putInjection = false;
      request.addEventListener('success', () => { T.requestInjections++; T.events.push({ type: 'native-meta-get-success-before-product' }); T.quarantine(); }, { once: true });
    }
    return request;
  };
  T.invoke = id => {
    T.actionDone = false; T.actionError = null;
    T.action = Promise.resolve().then(() => document.querySelector('#' + id).onclick()).then(
      () => { T.actionDone = true; }, error => { T.actionDone = true; T.actionError = { name: error.name, message: error.message }; }
    );
  };
  T.snapshot = async () => {
    const data = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly'), store = tx.objectStore(STORE), keys = store.getAllKeys(), values = store.getAll();
      tx.oncomplete = () => resolve(keys.result.map((key, i) => [key, values.result[i]]));
      tx.onabort = tx.onerror = () => reject(tx.error || Error('Read snapshot failed'));
    });
    return { disk: JSON.stringify(data), state: JSON.stringify(state), conflict: saveConflict, failed: saveFailed, canEdit: canEdit(), db: DB, worker: !!saveWorker, workerLost };
  };
  T.observation = () => ({ events: T.events, held: T.held, arm: T.arm, actionDone: T.actionDone, actionError: T.actionError, requestInjections: T.requestInjections,
    syncStatus: document.querySelector('#syncStatus')?.textContent, autoStatus: document.querySelector('#syncAutoStatus')?.textContent,
    recoveryMessage: document.querySelector('#saveRecoveryMessage')?.textContent });
}

async function fixture(browser, f) {
  f.external = []; f.pageErrors = []; f.consoleErrors = []; f.requests = []; f.workers = []; f.posts = []; f.gets = 0; f.closed = false;
  f.server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://loopback'); f.requests.push({ method: req.method, path: url.pathname });
    const json = (status, data, headers = {}) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers }); res.end(JSON.stringify(data)); };
    if (url.pathname === '/api/v1/bilge-defter/whoami' && req.method === 'GET') {
      const complete = () => json(200, { account_protocol: 'approval-v1', identity: { type: 'access', id: '11111111-1111-4111-8111-111111111111', status: 'approved', role: 'student', email: 'recovery-sync@example.test' } });
      if (f.holdNextWhoami) { const notify = f.holdNextWhoami; f.holdNextWhoami = null; f.releaseWhoami = complete; notify(); } else complete();
      return;
    }
    if (url.pathname === '/api/v1/bilge-defter/backup') {
      if (req.method === 'GET') { f.gets++; json(404, { detail: 'Synthetic empty server backup' }, { 'X-Bilge-Sync-Protocol': 'cas-v1' }); return; }
      if (req.method === 'POST') {
        const chunks = []; let bytes = 0;
        req.on('data', chunk => { bytes += chunk.length; if (bytes > 6 * 1024 * 1024) req.destroy(); else chunks.push(chunk); });
        req.on('end', () => {
          const body = Buffer.concat(chunks); let value, parseError = null;
          try { value = JSON.parse(body); } catch (error) { parseError = error.message; }
          f.posts.push({ bytes, sha256: sha(body), ifNoneMatch: req.headers['if-none-match'], keys: value ? Object.keys(value).sort() : [], parseError });
          json(200, { ok: true }, { 'X-Bilge-Sync-Protocol': 'cas-v1', ETag: '"synthetic-' + f.posts.length + '"' });
        }); return;
      }
    }
    if (req.method !== 'GET') { json(405, { detail: 'Unexpected mutation' }); return; }
    const name = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname), data = files.get(name);
    res.writeHead(data ? 200 : 404, { 'Content-Type': mime[path.extname(name)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(data || '');
  });
  await new Promise((resolve, reject) => { f.server.once('error', reject); f.server.listen(0, '127.0.0.1', resolve); });
  if (f.closed) throw Error('Fixture canceled');
  f.origin = 'http://127.0.0.1:' + f.server.address().port;
  f.context = await browser.newContext({ viewport: { width: 1180, height: 920 }, acceptDownloads: true });
  if (f.closed) { await f.context.close(); throw Error('Fixture canceled'); }
  f.context.setDefaultTimeout(15000);
  f.context.on('page', page => { page.on('pageerror', error => f.pageErrors.push(error.message)); page.on('console', msg => { if (msg.type() === 'error') f.consoleErrors.push(msg.text()); }); });
  f.context.on('serviceworker', worker => f.workers.push(worker.url()));
  await f.context.tracing.start({ snapshots: true, screenshots: false, sources: true });
  await f.context.addInitScript(({ origin, fallback }) => {
    if (window.top !== window || location.origin !== origin) return;
    window.__accountRequired = true; window.__syncInvited = true; localStorage.setItem('bilge_defter_onboarding_v1', 'true');
    try { delete Navigator.prototype.serviceWorker; } catch {}
    if (fallback) Object.defineProperty(window, 'Worker', { configurable: true, value: undefined });
  }, { origin: f.origin, fallback: f.caseName.startsWith('fallback-dbput-') });
  await f.context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== f.origin) { f.external.push(url.href); return route.abort(); }
    return route.continue();
  });
  f.p = await f.context.newPage(); await f.p.goto(f.origin);
  await f.p.waitForFunction(() => typeof ready !== 'undefined' && ready && window.__v2UI);
  await f.p.evaluate(async () => {
    if (!await flushSave()) throw Error('Initial save failed');
    if (typeof ensureAssets === 'function') await ensureAssets();
    if (!await flushSave()) throw Error('Final setup save failed');
    renderSyncActions();
  });
  await f.p.evaluate(installProbe);
  f.before = await f.p.evaluate(() => __recoverySync.snapshot());
  assert.equal(f.before.canEdit, true, 'Fixture starts editable');
}
async function cleanup(f) {
  f.closed = true; const errors = [];
  if (f.context) {
    try { await deadline(f.context.tracing.stop({ path: path.join(out, f.name + '-trace.zip') }), 8000, 'Trace stop'); } catch (e) { errors.push(e); }
    try { await deadline(f.context.close(), 8000, 'Context close'); } catch (e) { errors.push(e); }
  }
  if (f.server) {
    try { f.server.closeAllConnections(); await deadline(new Promise(resolve => f.server.close(resolve)), 8000, 'Server close'); } catch (e) { errors.push(e); }
  }
  resources.delete(f); if (errors.length) throw new AggregateError(errors, 'Cleanup failed');
}
async function invokeAndPass(p, id, upload) {
  await p.evaluate(id => __recoverySync.invoke(id), id);
  await p.locator('#syncPassDialog').waitFor({ state: 'visible' });
  await p.locator('#syncPassInput').fill('synthetic-recovery-only');
  if (upload) await p.locator('#syncPassConfirm').fill('synthetic-recovery-only');
  await p.locator('#syncPassSubmit').click();
}
async function waitAction(p) { await p.waitForFunction(() => __recoverySync.actionDone); assert.equal(await p.evaluate(() => __recoverySync.actionError), null, 'Action settles through product error handling'); }
async function finish(f) {
  const after = await f.p.evaluate(() => __recoverySync.snapshot()), observation = await f.p.evaluate(() => __recoverySync.observation());
  return { before: f.before, after, observation, posts: f.posts, gets: f.gets };
}
function assertProtected(e, { posts = 0 } = {}) {
  assert.equal(e.posts.length, posts, 'No new backup POST may be dispatched after quarantine');
  assert.equal(e.after.disk, e.before.disk, 'All persistent notebook/marker/receipt rows must remain unchanged after quarantine');
  assert.equal(e.after.state, e.before.state, 'Memory notebook remains unchanged');
  assert.equal(e.after.canEdit, false, 'Quarantine denies editing');
  assert.equal(e.after.conflict, true, 'Write quarantine remains active');
}

const cases = [
  ['manual-upload-held-encrypt-cannot-post', async f => {
    await f.p.evaluate(() => __recoverySync.hold('encrypt'));
    await invokeAndPass(f.p, 'syncUpload', true);
    await f.p.waitForFunction(() => __recoverySync.held === 'encrypt');
    assert.equal(f.posts.length, 0, 'Encryption barrier must precede HTTP POST');
    await f.p.evaluate(() => { __recoverySync.quarantine(); __recoverySync.release(); }); await waitAction(f.p);
    const e = await finish(f); assertProtected(e); return e;
  }],
  ['automatic-upload-held-encrypt-cannot-post', async f => {
    await f.p.evaluate(() => __recoverySync.hold('encrypt'));
    await invokeAndPass(f.p, 'syncUnlock', false); await waitAction(f.p);
    assert.match(await f.p.locator('#syncAutoStatus').innerText(), /Eşitleme açık/);
    await f.p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await f.p.waitForFunction(() => __recoverySync.held === 'encrypt');
    assert.equal(f.posts.length, 0, 'Automatic encryption barrier must precede HTTP POST');
    await f.p.evaluate(() => { __recoverySync.quarantine(); __recoverySync.release(); });
    await f.p.waitForFunction(() => /bekliyor|son:/.test(document.querySelector('#syncAutoStatus').textContent));
    const e = await finish(f); assertProtected(e); return e;
  }],
  ['manual-upload-held-account-check-cannot-post', async f => {
    await f.p.evaluate(() => __recoverySync.hold('encrypt'));
    await invokeAndPass(f.p, 'syncUpload', true);
    await f.p.waitForFunction(() => __recoverySync.held === 'encrypt');
    const held = new Promise(resolve => { f.holdNextWhoami = resolve; });
    await f.p.evaluate(() => __recoverySync.release());
    await deadline(held, 12000, 'Final account-check request');
    assert.equal(f.posts.length, 0, 'PostRemote passed but accountFetch has not dispatched the backup yet');
    await f.p.evaluate(() => __recoverySync.quarantine());
    f.releaseWhoami(); await waitAction(f.p);
    const e = await finish(f); e.heldAccountCheck = true; assertProtected(e); return e;
  }],
  ['late-ack-held-digest-cannot-write-receipt', async f => {
    await f.p.evaluate(() => __recoverySync.hold('digest', JSON.stringify(state)));
    await invokeAndPass(f.p, 'syncUpload', true);
    await f.p.waitForFunction(() => __recoverySync.held === 'digest');
    assert.equal(f.posts.length, 1, 'This case deliberately permits the request already dispatched before quarantine');
    const atBarrier = await f.p.evaluate(() => __recoverySync.snapshot());
    assert.equal(atBarrier.disk, f.before.disk, 'ACK has not mutated local receipt while its hash is held');
    await f.p.evaluate(() => { __recoverySync.quarantine(); __recoverySync.release(); }); await waitAction(f.p);
    const e = await finish(f); assertProtected(e, { posts: 1 }); return e;
  }],
  ['native-ack-success-callback-rechecks-quarantine', async f => {
    const result = await f.p.evaluate(async () => {
      __recoverySync.ackInjection = true;
      try { await dbAcknowledgeSync(JSON.stringify(state), { tag: '"late-direct-ack"', ackHash: 'synthetic', lastSyncAt: '2026-10-11T00:00:00Z' }); return { resolved: true }; }
      catch (error) { return { resolved: false, name: error.name, message: error.message }; }
    });
    const e = await finish(f); e.ack = result;
    assert.equal(e.observation.requestInjections, 1, 'Injection occurs at native request success, before the product callback');
    assert.equal(result.resolved, false, 'Native ACK transaction must reject, not silently report acknowledgement');
    assertProtected(e); return e;
  }],
  ['different-database-quarantine-does-not-lock-current', async f => {
    const result = await f.p.evaluate(async () => {
      __recoverySync.quarantine(DB + '-old-account');
      const before = { editable: canEdit(), conflict: saveConflict, failed: saveFailed };
      const next = JSON.parse(JSON.stringify(state)); next.pages[0].title = 'Synthetic permitted current-account write';
      await dbPut(next); return { before, disk: await dbGet(), wanted: next.pages[0].title };
    });
    const e = await finish(f); e.currentAccount = result;
    assert.deepEqual(result.before, { editable: true, conflict: false, failed: false });
    assert.equal(result.disk.pages[0].title, result.wanted, 'Current account remains writable after an obsolete-account completion');
    assert.notEqual(e.after.disk, e.before.disk, 'Positive control proves this path really writes'); assert.equal(f.posts.length, 0); return e;
  }],
  ['fallback-dbput-denied-after-quarantine', async f => {
    assert.equal(f.before.worker, false); assert.equal(f.before.workerLost, false, 'Native no-Worker fallback, not lost-worker adopt path');
    const result = await f.p.evaluate(async () => {
      __recoverySync.quarantine(); const next = JSON.parse(JSON.stringify(state)); next.pages[0].title = 'MUST NOT BE PERSISTED';
      try { await dbPut(next); return { resolved: true }; } catch (error) { return { resolved: false, name: error.name, message: error.message }; }
    });
    const e = await finish(f); e.save = result;
    assert.equal(result.resolved, false, 'Fallback dbPut must reject even when called below UI/flush gates'); assertProtected(e); return e;
  }],
  ['fallback-dbput-metadata-callback-rechecks-quarantine', async f => {
    assert.equal(f.before.worker, false); assert.equal(f.before.workerLost, false);
    const result = await f.p.evaluate(async () => {
      __recoverySync.putInjection = true;
      const next = JSON.parse(JSON.stringify(state)); next.pages[0].title = 'MUST NOT BE PERSISTED AFTER META READ';
      try { await dbPut(next); return { resolved: true }; } catch (error) { return { resolved: false, name: error.name, message: error.message }; }
    });
    const e = await finish(f); e.save = result;
    assert.equal(e.observation.requestInjections, 1, 'Race is injected before the final metadata callback in the real transaction');
    assertProtected(e); assert.equal(result.resolved, false, 'Quarantined native write must abort'); return e;
  }]
];

async function run() {
  const selected = cases.filter(([name]) => !caseFilter || name.includes(caseFilter)); assert.ok(selected.length, 'No matching cases');
  const engines = Object.entries({ chromium, webkit }).filter(([name]) => !engineFilter || name === engineFilter);
  report.expectedCases = selected.length * engines.length;
  for (const [engine, type] of engines) {
    const browser = await deadline(type.launch({ headless: true }), 30000, engine + ' launch');
    try {
      for (const [name, test] of selected) {
        const started = Date.now(), f = { name: engine + '-' + name, caseName: name }; resources.add(f);
        const result = { engine, name, ok: false, startedAt: new Date(started).toISOString() };
        try {
          result.evidence = await deadline((async () => { await fixture(browser, f); return test(f); })(), 60000, f.name);
          assert.deepEqual(f.external, [], 'No external request'); assert.deepEqual(f.pageErrors, [], 'No uncaught browser page error');
          assert.deepEqual(f.workers, [], 'No service worker events'); assert.equal(f.context.serviceWorkers().length, 0);
          assert.ok(!f.requests.some(x => /(?:^|\/)sw\.js$/i.test(x.path)), 'No service worker script requests');
          assert.ok(f.requests.every(x => x.method === 'GET' || (x.method === 'POST' && x.path === '/api/v1/bilge-defter/backup')), 'Only synthetic backup endpoint may receive a mutation');
          assert.ok(f.posts.every(x => !x.parseError && x.ifNoneMatch === '*' && x.keys.includes('ciphertext') && !x.keys.includes('pages')), 'Server receives actual encrypted CAS backup, not notebook plaintext');
          result.ok = true;
        } catch (error) {
          result.error = error.stack || String(error);
          if (f.p && !f.p.isClosed()) try { result.diagnostics = await deadline(f.p.evaluate(async () => ({ observation: window.__recoverySync?.observation(), snapshot: window.__recoverySync ? await __recoverySync.snapshot() : null })), 5000, 'Diagnostics'); } catch (e) { result.diagnosticsError = e.message; }
        } finally {
          result.network = { external: f.external, requests: f.requests, posts: f.posts, gets: f.gets, pageErrors: f.pageErrors, consoleErrors: f.consoleErrors, serviceWorkerEvents: f.workers };
          try { await cleanup(f); } catch (e) { result.ok = false; result.cleanupError = e.stack || String(e); }
          result.elapsedMs = Date.now() - started; report.results.push(result);
          fs.writeFileSync(path.join(out, f.name + '.json'), JSON.stringify(result, null, 2));
          console.log((result.ok ? 'PASS ' : 'FAIL ') + f.name + ' ' + result.elapsedMs + 'ms');
        }
      }
    } finally { await deadline(browser.close(), 15000, engine + ' close'); }
  }
  const after = hashes(readSource(root)); report.drift = [...new Set([...Object.keys(source), ...Object.keys(after)])].filter(name => source[name] !== after[name]);
  assert.deepEqual(report.drift, [], 'Source drift during acceptance');
  assert.equal(sha(fs.readFileSync(__filename)), report.runnerSha256, 'Runner drift during acceptance');
  assert.equal(report.results.length, report.expectedCases, 'All selected cases must run');
  report.ok = report.results.length > 0 && report.results.every(x => x.ok);
}
run().catch(error => { report.ok = false; report.fatal = error.stack || String(error); }).finally(async () => {
  for (const f of [...resources]) try { await cleanup(f); } catch (error) { report.ok = false; (report.cleanupErrors ||= []).push(error.message); }
  report.finishedAt = new Date().toISOString(); report.passed = report.results.filter(x => x.ok).length; report.failed = report.results.filter(x => !x.ok).length;
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: report.ok, passed: report.passed, failed: report.failed, fatal: report.fatal, out })); process.exitCode = report.ok ? 0 : 1;
});
