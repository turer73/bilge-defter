'use strict';
// Real application validators, not substituted verdicts. Author-only handoff;
// runtime/proof belongs to the root agent. No physical-device performance claim.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const crypto = require('node:crypto'), zlib = require('node:zlib'), assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const repo = path.resolve(__dirname, '..'), root = path.resolve(process.env.BILGE_TEST_ROOT || path.join(__dirname, 'bilge-defter-test'));
const args = process.argv.slice(2), arg = key => args.find(value => value.startsWith('--' + key + '='))?.slice(key.length + 3);
assert.ok(args.every(value => /^--(?:out|engine|case)=.+$/.test(value)), 'Unknown argument');
assert.equal(new Set(args.map(value => value.split('=')[0])).size, args.length, 'Duplicate argument');
const engineFilter = arg('engine'), caseFilter = arg('case');
assert.ok(!engineFilter || ['chromium', 'webkit'].includes(engineFilter), 'Unknown engine');
const out = path.resolve(arg('out') || path.join(repo, 'outputs/pdf-validation', new Date().toISOString().replace(/[:.]/g, '-') + '-' + crypto.randomUUID()));
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
    'Fresh synthetic approved account and loopback-only GET network. No real account, document, remote storage or publication.',
    'The served product files are unchanged. Actual validState, validStateCached and validPdfBackground run on detached ordinary synthetic records; they are not replaced.',
    'A synchronous try/finally forwarding observer counts actual pdfImageSize calls and preserves arguments, this, return values and exceptions. No validator verdict is mocked.',
    'The 128-entry bound is observed through parser calls for uncached suffix images; no private Map or garbage-collector instrumentation is used.',
    'PNG bytes are deterministic and identical across engines. JPEG is generated from fixed canvas content by each browser; format decisions, not cross-engine encoder bytes, are compared.',
    'These contracts do not decode every corrupt pixel stream, benchmark latency, measure retained heap/RSS or claim physical iPad performance.'
  ] };
fs.copyFileSync(__filename, path.join(out, 'runner.cjs'));
fs.writeFileSync(path.join(out, 'source.json'), JSON.stringify({ source, runnerSha256: report.runnerSha256 }, null, 2));
const crcTable = Array.from({ length: 256 }, (_, n) => { for (let i = 0; i < 8; i++) n = (n >>> 1) ^ ((n & 1) ? 0xedb88320 : 0); return n >>> 0; });
function crc(bytes) { let n = 0xffffffff; for (const b of bytes) n = (n >>> 8) ^ crcTable[(n ^ b) & 255]; return (n ^ 0xffffffff) >>> 0; }
function chunk(type, bytes) { const tag = Buffer.from(type), length = Buffer.alloc(4), sum = Buffer.alloc(4); length.writeUInt32BE(bytes.length); sum.writeUInt32BE(crc(Buffer.concat([tag, bytes]))); return Buffer.concat([length, tag, bytes, sum]); }
function png(seed) {
  const width = 1000, height = 100, stride = width * 3 + 1, pixels = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { const i = y * stride + x * 3 + 1; pixels[i] = seed; pixels[i + 1] = x < 500 ? 40 : 180; pixels[i + 2] = y < 50 ? 20 : 160; }
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
}
const pngs = Array.from({ length: 130 }, (_, i) => png(i + 1)), images = pngs.map(bytes => 'data:image/png;base64,' + bytes.toString('base64'));
assert.equal(new Set(images).size, 130, 'Unique deterministic fixtures');
report.fixtures = pngs.map((bytes, i) => ({ seed: i + 1, width: 1000, height: 100, chars: images[i].length, pngSha256: sha(bytes), dataUrlSha256: sha(images[i]) }));
fs.writeFileSync(path.join(out, 'fixture-first.png'), pngs[0]);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.woff2': 'font/woff2' };
async function deadline(promise, ms, label) { let timer; try { return await Promise.race([promise, new Promise((_, no) => { timer = setTimeout(() => no(Error(label + ' exceeded ' + ms + 'ms')), ms); })]); } finally { clearTimeout(timer); } }
function installFixture(images) {
  const T = window.__pdfValidation = { images };
  T.book = (sources = [images[0]], trashCount = 0) => {
    const pages = sources.map((image, i) => ({ id: 'pdf-validation-page-' + i, notebookId: 'pdf-validation-book', title: 'Sayfa ' + (i + 1), strokes: [], pdf: { image, width: 1000, height: 100, name: 'deneme.pdf', number: 1, total: 1 } }));
    const live = pages.slice(0, pages.length - trashCount), trash = pages.slice(pages.length - trashCount).map((page, position) => ({ page, notebookTitle: 'Deneme', deletedAt: '2026-10-11T00:00:00Z', position }));
    return { version: 2, pages: live, trash, active: live[0].id, activeNotebook: 'pdf-validation-book', notebooks: [{ id: 'pdf-validation-book', title: 'Deneme' }] };
  };
  T.observe = fn => {
    const original = pdfImageSize, parsed = new Set(); let calls = 0;
    pdfImageSize = function (...args) { calls++; parsed.add(args[0]); return original.apply(this, args); };
    try { return { value: fn(), calls, unique: parsed.size }; } finally { pdfImageSize = original; }
  };
}
async function fixture(browser, f) {
  f.errors = []; f.external = []; f.requests = []; f.consoleErrors = []; f.serviceWorkers = []; f.closed = false;
  f.server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://loopback'); f.requests.push({ method: req.method, path: url.pathname });
    if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
    if (url.pathname === '/api/v1/bilge-defter/whoami') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ account_protocol: 'approval-v1', identity: { type: 'access', id: '11111111-1111-4111-8111-111111111111', status: 'approved', role: 'student', email: 'validation@example.test' } })); return; }
    const name = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname), data = files.get(name);
    res.writeHead(data ? 200 : 404, { 'Content-Type': mime[path.extname(name)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(data || '');
  });
  await new Promise((ok, no) => { f.server.once('error', no); f.server.listen(0, '127.0.0.1', ok); });
  if (f.closed) throw Error('Fixture canceled'); f.origin = 'http://127.0.0.1:' + f.server.address().port;
  f.context = await browser.newContext({ viewport: { width: 1180, height: 920 } });
  if (f.closed) { await f.context.close(); throw Error('Fixture canceled'); }
  f.context.setDefaultTimeout(10000);
  f.context.on('page', p => { p.on('pageerror', e => f.errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') f.consoleErrors.push(m.text()); }); });
  f.context.on('serviceworker', w => f.serviceWorkers.push(w.url()));
  await f.context.tracing.start({ screenshots: false, snapshots: true, sources: true });
  await f.context.addInitScript(origin => { if (top !== window || location.origin !== origin) return; window.__accountRequired = true; localStorage.setItem('bilge_defter_onboarding_v1', 'true'); try { delete Navigator.prototype.serviceWorker; } catch {} }, f.origin);
  await f.context.route('**/*', route => { const url = new URL(route.request().url()); if (['http:', 'https:'].includes(url.protocol) && url.origin !== f.origin) { f.external.push(url.href); return route.abort(); } return route.continue(); });
  f.p = await f.context.newPage(); f.p.on('dialog', d => d.dismiss());
  await f.p.goto(f.origin); await f.p.waitForFunction(() => typeof ready !== 'undefined' && ready && typeof validState === 'function' && typeof validStateCached === 'function' && window.__v2UI);
  await f.p.evaluate(installFixture, images);
}
async function cleanup(f) {
  f.closed = true; const errors = [];
  if (f.context) { try { await deadline(f.context.tracing.stop({ path: path.join(out, f.name + '-trace.zip') }), 6000, 'Trace stop'); } catch (e) { errors.push(e); } try { await deadline(f.context.close(), 6000, 'Context close'); } catch (e) { errors.push(e); } }
  if (f.server) try { f.server.closeAllConnections(); await deadline(new Promise(ok => f.server.close(ok)), 6000, 'Server close'); } catch (e) { errors.push(e); }
  resources.delete(f); if (errors.length) throw new AggregateError(errors, 'Cleanup failed');
}
const definitions = ['width', 'height', 'number', 'total'].map(field => ['warm-cache-rejects-string-' + field, async f => {
  const evidence = await f.p.evaluate(field => { const T = __pdfValidation, book = T.book(), b = book.pages[0].pdf; const warm = validStateCached(book); b[field] = String(b[field]); return { warm, full: validState(book), cached: validStateCached(book), field, type: typeof b[field] }; }, field);
  f.evidence = evidence; assert.equal(evidence.warm, true); assert.equal(evidence.full, false); assert.equal(evidence.cached, false, 'Warm PDF cache must preserve strict metadata types'); return evidence;
}]);
definitions.push(
  ['same-image-1000-pages-and-trash-parse-once', async f => {
    const evidence = await f.p.evaluate(() => { const T = __pdfValidation, book = T.book(Array(1000).fill(T.images[0]), 500), before = JSON.stringify(book); const first = T.observe(() => validState(book)), second = T.observe(() => validState(book)); return { first, second, live: book.pages.length, trash: book.trash.length, unchanged: before === JSON.stringify(book) }; });
    f.evidence = evidence; assert.deepEqual(evidence.first, { value: true, calls: 1, unique: 1 }); assert.deepEqual(evidence.second, evidence.first, 'A new full validation must create a fresh memo'); assert.equal(evidence.live, 500); assert.equal(evidence.trash, 500); assert.equal(evidence.unchanged, true); return evidence;
  }],
  ['cold-cached-state-forwards-call-local-image-memo', async f => {
    const evidence = await f.p.evaluate(() => { const T = __pdfValidation, book = T.book(Array(200).fill(T.images[0]), 100); return { cold: T.observe(() => validStateCached(book)), warm: T.observe(() => validStateCached(book)), full: T.observe(() => validState(book)) }; });
    f.evidence = evidence; assert.deepEqual(evidence.cold, { value: true, calls: 1, unique: 1 }); assert.deepEqual(evidence.warm, { value: true, calls: 0, unique: 0 }); assert.deepEqual(evidence.full, evidence.cold); return evidence;
  }],
  ['memo-cap-128-preserves-validation-after-cap-and-across-calls', async f => {
    const evidence = await f.p.evaluate(() => { const T = __pdfValidation, sources = [...T.images, T.images[0], T.images[128], T.images[129]], book = T.book(sources); const first = T.observe(() => validState(book)), second = T.observe(() => validState(book)); book.pages.at(-1).pdf.height = 101; const invalidAfterCap = T.observe(() => validState(book)); return { first, second, invalidAfterCap, pages: sources.length }; });
    f.evidence = evidence; assert.equal(evidence.pages, 133); assert.deepEqual(evidence.first, { value: true, calls: 132, unique: 130 }, 'Only the first 128 distinct parser results may be retained'); assert.deepEqual(evidence.second, evidence.first); assert.equal(evidence.invalidAfterCap.value, false, 'Pages outside the memo cap still compare actual and declared dimensions'); return evidence;
  }],
  ['new-call-and-same-header-tail-mutations-revalidate', async f => {
    const evidence = await f.p.evaluate(() => {
      const T = __pdfValidation, book = T.book([T.images[0], T.images[0]]), good = T.observe(() => validState(book));
      book.pages[1].pdf.image = T.images[0].slice(0, -1) + '!'; const invalidTail = T.observe(() => validState(book));
      book.pages[1].pdf.image = T.images[0]; const restored = T.observe(() => validState(book));
      book.pages[1].pdf.height = 101; const invalidMetadata = T.observe(() => validState(book));
      const cachedBook = T.book(), cachedWarm = validStateCached(cachedBook); cachedBook.pages[0].pdf.image = T.images[0].slice(0, -1) + '!'; const cachedTail = validStateCached(cachedBook);
      return { good, invalidTail, restored, invalidMetadata, cachedWarm, cachedTail };
    });
    f.evidence = evidence; assert.deepEqual(evidence.good, { value: true, calls: 1, unique: 1 }); assert.deepEqual(evidence.invalidTail, { value: false, calls: 2, unique: 2 }); assert.deepEqual(evidence.restored, evidence.good); assert.equal(evidence.invalidMetadata.value, false); assert.equal(evidence.cachedWarm, true); assert.equal(evidence.cachedTail, false); return evidence;
  }],
  ['shared-image-never-skips-per-page-or-book-guards', async f => {
    const evidence = await f.p.evaluate(() => {
      const T = __pdfValidation, checks = [
        ['width', b => { b.pages[1].pdf.width = 999; }], ['height', b => { b.pages[1].pdf.height = 101; }],
        ['name-type', b => { b.pages[1].pdf.name = 7; }], ['name-length', b => { b.pages[1].pdf.name = 'n'.repeat(201); }],
        ['number-zero', b => { b.pages[1].pdf.number = 0; }], ['number-above-total', b => { b.pages[1].pdf.number = 2; }],
        ['total-over-limit', b => { b.pages[1].pdf.total = 101; }], ['total-fraction', b => { b.pages[1].pdf.total = 1.5; }],
        ['image-over-limit', b => { b.pages[1].pdf.image = T.images[0] + 'A'.repeat(6 * 1024 * 1024); }],
        ['pdf-view', b => { b.pages[1].pdfZoom = 4; }], ['duplicate-page-id', b => { b.pages[1].id = b.pages[0].id; }],
        ['unknown-notebook', b => { b.pages[1].notebookId = 'missing'; }], ['old-version-pdf', b => { b.version = 1; }],
        ['trash-metadata', b => { const page = b.pages.pop(); page.pdf.number = 0; b.trash.push({ page, position: 0, notebookTitle: 'Deneme', deletedAt: '2026-10-11T00:00:00Z' }); }]
      ];
      return checks.map(([name, mutate]) => { const b = T.book([T.images[0], T.images[0]]); mutate(b); return { name, full: validState(b), cached: validStateCached(b) }; });
    });
    f.evidence = evidence; assert.equal(evidence.length, 14); for (const row of evidence) { assert.equal(row.full, false, row.name); assert.equal(row.cached, false, row.name + ' cached'); } return evidence;
  }],
  ['png-jpeg-and-unpadded-format-decisions-agree', async f => {
    const evidence = await f.p.evaluate(async () => {
      const T = __pdfValidation, canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 100; const ctx = canvas.getContext('2d'); ctx.fillStyle = '#297c46'; ctx.fillRect(0, 0, 1000, 100); ctx.fillStyle = '#ffdd11'; ctx.fillRect(50, 20, 200, 40);
      const jpeg = canvas.toDataURL('image/jpeg', .88), paddedPng = T.images.find(s => /=+$/.test(s));
      if (!paddedPng || !jpeg.startsWith('data:image/jpeg;base64,')) throw Error('Required actual format fixtures unavailable');
      const rows = [['png', paddedPng, true], ['png-unpadded', paddedPng.replace(/=+$/, ''), true], ['jpeg', jpeg, true], ['jpeg-unpadded', jpeg.replace(/=+$/, ''), true],
        ['illegal-tail', paddedPng.slice(0, -1) + '!', false], ['internal-whitespace', paddedPng.slice(0, 90) + '\n' + paddedPng.slice(90), false], ['remote-url', 'https://example.test/image.png', false], ['wrong-mime', paddedPng.replace('image/png', 'image/gif'), false], ['empty-base64', 'data:image/png;base64,', false]];
      const result = [];
      for (const [name, image, expected] of rows) {
        const book = T.book([image, image]), direct = validPdfBackground(book.pages[0].pdf), full = validState(book), cached = validStateCached(book);
        const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(image))), b => b.toString(16).padStart(2, '0')).join('');
        result.push({ name, expected, direct, full, cached, chars: image.length, sha256: digest });
      }
      canvas.width = canvas.height = 0; return result;
    });
    f.evidence = evidence; assert.equal(evidence.length, 9); for (const row of evidence) for (const key of ['direct', 'full', 'cached']) assert.equal(row[key], row.expected, row.name + ' ' + key); return evidence;
  }]
);
async function run() {
  const selected = definitions.filter(([name]) => !caseFilter || name.includes(caseFilter)); assert.ok(selected.length, 'No selected cases');
  const engines = Object.entries({ chromium, webkit }).filter(([name]) => !engineFilter || name === engineFilter); report.expectedCases = engines.length * selected.length;
  for (const [engine, type] of engines) {
    const browser = await deadline(type.launch({ headless: true }), 30000, engine + ' launch');
    try { for (const [name, test] of selected) {
      const started = Date.now(), f = { name: engine + '-' + name }; resources.add(f); const result = { engine, name, ok: false, startedAt: new Date(started).toISOString() };
      try {
        result.evidence = await deadline((async () => { await fixture(browser, f); return test(f); })(), 45000, f.name);
        assert.deepEqual(f.external, []); assert.deepEqual(f.errors, []); assert.deepEqual(f.serviceWorkers, []); assert.equal(f.context.serviceWorkers().length, 0); assert.ok(f.requests.every(r => r.method === 'GET')); result.ok = true;
      } catch (error) { result.error = error.stack || String(error); if (f.evidence) result.evidence = f.evidence; }
      finally {
        result.network = { external: f.external, requests: f.requests, pageErrors: f.errors, consoleErrors: f.consoleErrors, serviceWorkers: f.serviceWorkers };
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
