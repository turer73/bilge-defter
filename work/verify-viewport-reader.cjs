'use strict';
// Real application, synthetic approved account and loopback-only IndexedDB.
// Instrument native decode ownership without changing production source bytes.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const crypto = require('node:crypto'), assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { chromium, webkit } = require('playwright');
const repo = path.resolve(__dirname, '..');
const root = path.resolve(process.env.BILGE_TEST_ROOT || path.join(__dirname, 'bilge-defter-test'));
const args = process.argv.slice(2), arg = key => args.find(s => s.startsWith('--' + key + '='))?.slice(key.length + 3);
assert.ok(args.every(s => /^--(?:out|engine|case)=.+/.test(s)), 'Unknown argument');
const filter = arg('case'), engineFilter = arg('engine');
assert.ok(!engineFilter || ['chromium', 'webkit'].includes(engineFilter));
const runId = new Date().toISOString().replace(/[:.]/g, '-') + '-' + crypto.randomUUID().slice(0, 8);
const out = path.resolve(arg('out') || process.env.BILGE_VIEWPORT_READER_OUT || path.join(repo, 'outputs/viewport-integration-20261011', runId));
assert.ok(out.startsWith(path.join(repo, 'outputs') + path.sep));
assert.ok(!fs.existsSync(out) || !fs.readdirSync(out).length, 'Do not overwrite evidence');
fs.mkdirSync(out, { recursive: true });
const sha = x => crypto.createHash('sha256').update(x).digest('hex');
function snapshot(dir, prefix = '') {
  const result = new Map();
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    assert.ok(!entry.isSymbolicLink());
    const name = prefix + entry.name, file = path.join(dir, entry.name);
    if (entry.isDirectory()) for (const pair of snapshot(file, name + '/')) result.set(...pair);
    else result.set('/' + name, fs.readFileSync(file));
  }
  return result;
}
const hashes = files => Object.fromEntries([...files].map(([k, v]) => [k, sha(v)]).sort(([a], [b]) => a.localeCompare(b)));
const files = snapshot(root), source = hashes(files);
const openServers = new Set();
const baselineCommit = '918aa5796110db12cb3950588fb17d521205dbf9';
let baseline;
function baselineFiles() {
  if (baseline) return baseline;
  baseline = new Map();
  const prefix = 'work/bilge-defter-test/';
  const names = execFileSync('git', ['ls-tree', '-r', '--name-only', baselineCommit, '--', prefix], { cwd: repo, encoding: 'utf8' }).trim().split(/\r?\n/);
  assert.ok(names.length > 200);
  for (const name of names) baseline.set('/' + name.slice(prefix.length), execFileSync('git', ['show', baselineCommit + ':' + name], { cwd: repo, maxBuffer: 16 * 1024 * 1024 }));
  return baseline;
}
const report = { startedAt: new Date().toISOString(), root, runnerSha256: sha(fs.readFileSync(__filename)), source,
  baselineCommit, results: [], releaseEligible: false,
  boundaries: ['Local synthetic PNG/JPEG slide backgrounds, not actual PPTX/PDF conversion.',
    'Native resource ownership counters are not total RSS/GPU memory measurements.',
    'No account or production mutations, no external network, no physical iPad acceptance.',
    'Persistence schema and import limits must remain unchanged.'] };
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };
function decoderProbe({ fallback }) {
  const native = globalThis.createImageBitmap;
  const probe = window.__decodeProbe = { available: typeof native === 'function', starts: 0, active: 0, peak: 0, completed: 0, closed: 0, doubleClose: 0, hold: false, held: false, reject: 0, resources: [] };
  const ids = new WeakMap();
  if (typeof ImageBitmap !== 'undefined') {
    const close = ImageBitmap.prototype.close;
    ImageBitmap.prototype.close = function () {
      const row = ids.get(this);
      if (row) { if (row.closed) probe.doubleClose++; else { row.closed = true; probe.closed++; } }
      return close.call(this);
    };
  }
  if (fallback) { globalThis.createImageBitmap = undefined; return; }
  if (!probe.available) return;
  globalThis.createImageBitmap = async function (...args) {
    probe.starts++; probe.active++; probe.peak = Math.max(probe.peak, probe.active);
    try {
      if (probe.reject) { probe.reject--; throw Error('Injected synthetic decode rejection'); }
      const image = await native.apply(globalThis, args);
      const row = { id: probe.starts, width: image.width, height: image.height, closed: false };
      ids.set(image, row); probe.resources.push(row); probe.completed++;
      if (probe.hold) {
        probe.hold = false; probe.held = true;
        await new Promise(resolve => { probe.release = () => { probe.held = false; delete probe.release; resolve(); }; });
      }
      return image;
    } finally { probe.active--; }
  };
}
async function fixture(browser, options = {}) {
  let served = files;
  const external = [], errors = [], methods = [];
  const server = http.createServer((req, res) => {
    methods.push(req.method);
    const name = new URL(req.url, 'http://loopback').pathname;
    if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
    if (name === '/api/v1/bilge-defter/whoami') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ account_protocol: 'approval-v1', identity: { type: 'access', id: '11111111-1111-4111-8111-111111111111', status: 'approved', role: 'student', email: 'reader@example.test' } })); return;
    }
    const file = name === '/' ? '/index.html' : decodeURIComponent(name), bytes = served.get(file);
    res.writeHead(bytes ? 200 : 404, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(bytes || '');
  });
  // Register before asynchronous setup: even a setup deadline must not leave a
  // listening server keeping the runner alive after its report is written.
  openServers.add(server);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const context = await browser.newContext({ viewport: options.viewport || { width: 1180, height: 920 }, deviceScaleFactor: 2, hasTouch: true, serviceWorkers: 'block' });
  context.setDefaultTimeout(20000);
  await context.addInitScript(() => { window.__accountRequired = true; localStorage.setItem('bilge_defter_onboarding_v1', 'true'); try { delete Navigator.prototype.serviceWorker; } catch {} });
  await context.addInitScript(decoderProbe, { fallback: !!options.fallback });
  await context.route('**/*', route => { const url = new URL(route.request().url()); if (['http:', 'https:'].includes(url.protocol) && url.origin !== origin) { external.push(url.origin); return route.abort(); } return route.continue(); });
  const p = await context.newPage(); p.on('pageerror', e => errors.push(e.message));
  async function start() { await p.goto(origin); await p.waitForFunction(() => typeof ready !== 'undefined' && ready && window.__v2UI); await save(p); }
  return { p, context, external, errors, methods, start,
    old() { served = baselineFiles(); }, candidate() { served = files; },
    async finish() { try { await context.close(); } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); openServers.delete(server); } } };
}
async function paint(p) { await p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
async function save(p) { await p.evaluate(async () => { if (!await flushSave()) throw Error('Save failed'); await ensureAssets(); if (!await flushSave()) throw Error('Asset save failed'); }); }
async function idle(p) {
  await p.evaluate(async () => { drawAll(); await BilgeSlideFlow.whenIdle(); });
  await p.waitForFunction(() => {
    const s = BilgeSlideFlow.snapshot(), r = s?.reader;
    return r && !r.pending && s.visible.every(id => r.resident.some(x => x.key === id) || r.errors.some(x => x.key === id));
  });
  await paint(p);
}
async function setup(p, { count = 6, height = 563, newNotebook = true, jpeg = false, wait = true, noise = false } = {}) {
  const result = await p.evaluate(async ({ count, height, newNotebook, jpeg, noise }) => {
    const pages = [];
    for (let i = 0; i < count; i++) {
      const c = document.createElement('canvas'); c.width = 1000; c.height = height;
      const x = c.getContext('2d'); x.fillStyle = i % 2 ? '#32b45a' : '#dc4628'; x.fillRect(0, 0, c.width, c.height);
      if (noise) {
        const raster = x.createImageData(c.width, c.height); let seed = i + 9137 + state.pages.length;
        for (let j = 0; j < raster.data.length; j += 4) {
          for (let channel = 0; channel < 3; channel++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; raster.data[j + channel] = seed >>> 24; }
          raster.data[j + 3] = 255;
        }
        x.putImageData(raster, 0, 0);
      }
      x.fillStyle = `rgb(${i},30,90)`; x.fillRect(0, 0, 4, 4);
      pages.push({ image: c.toDataURL(jpeg ? 'image/jpeg' : 'image/png', .88), width: 1000, height, number: i + 1, total: count }); c.width = c.height = 1;
    }
    const result = await BilgeRasterImport.commit({ name: 'Synthetic reader.pptx', pages, newNotebook }, BilgeRasterImport.capture());
    return { ok: result.ok, ids: notebookPages().map(p => p.id), notebook: activeNotebook };
  }, { count, height, newNotebook, jpeg, noise });
  assert.equal(result.ok, true); if (wait) await idle(p); return result;
}
async function inspect(p) { return p.evaluate(() => ({ flow: BilgeSlideFlow.snapshot(), probe: { ...window.__decodeProbe, release: undefined }, ready: pdfBackgroundReady(), valid: validState(state), active: activeId, notebook: activeNotebook })); }
async function deadline(promise, ms, label) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error(label + ' exceeded ' + ms + 'ms')), ms); })]); }
  finally { clearTimeout(timer); }
}
async function check(browser, engine, name, fn, options) {
  if (filter && !name.includes(filter)) return;
  console.log('RUN ' + engine + ': ' + name); let f;
  try {
    f = await deadline(fixture(browser, options), 30000, 'fixture setup'); await deadline(f.start(), 30000, 'fixture start');
    const detail = await deadline(fn(f), 90000, name); assert.deepEqual(f.external, []); assert.deepEqual(f.errors, []);
    assert.ok(f.methods.every(m => m === 'GET')); assert.equal(f.context.serviceWorkers().length, 0);
    report.results.push({ engine, name, passed: true, detail }); console.log('PASS ' + engine + ': ' + name);
  } catch (error) {
    let diagnostic; try { diagnostic = await deadline(inspect(f.p), 3000, 'diagnostic'); await f.p.screenshot({ path: path.join(out, engine + '-' + name.replace(/[^a-z0-9]+/gi, '-') + '.png'), timeout: 3000 }); } catch {}
    report.results.push({ engine, name, passed: false, error: String(error.stack || error), diagnostic }); console.error('FAIL ' + engine + ': ' + name + ': ' + error.message);
  } finally { if (f) await deadline(f.finish(), 5000, 'fixture cleanup'); }
}
async function jump(p, id) {
  await p.locator('#documentPagesToggle').tap();
  await p.locator('#documentPagesList button[data-page-id="' + id + '"]').tap(); await idle(p);
}
async function notes(p) { return p.evaluate(() => JSON.stringify(notebookSnapshot().pages.map(p => ({ id: p.id, pdf: p.pdf, strokes: p.strokes })))); }
async function run(browser, engine) {
  if (filter === 'runner deadline negative control') {
    await check(browser, engine, filter, async ({ p }) => {
      await p.evaluate(() => { __decodeProbe.hold = true; }); await setup(p, { wait: false }); await p.waitForFunction(() => __decodeProbe.held);
      await deadline(p.evaluate(() => BilgeSlideFlow.whenIdle()), 250, 'Intentional never-idle negative control');
      throw Error('Negative control unexpectedly resolved');
    }); return;
  }
  await check(browser, engine, '100 slides real navigator single decode release and pixels', async ({ p }) => {
    const data = await setup(p, { count: 100 }), samples = [];
    for (const i of [0, 49, 99, 1]) {
      await jump(p, data.ids[i]); const s = await inspect(p), r = s.flow.reader;
      assert.equal(s.probe.peak, 1); assert.equal(s.probe.active, 0); assert.equal(s.probe.doubleClose, 0);
      assert.ok(s.flow.cachedImages <= s.flow.visible.length + 2); assert.ok(r.totalBytes <= r.maxBytes);
      assert.equal(s.probe.resources.filter(x => !x.closed).length, r.residentCount);
      assert.ok(r.resident.every(x => r.wanted.includes(x.key))); assert.equal(s.ready, true); samples.push(s);
    }
    assert.ok(samples.at(-1).probe.closed > 0); return { samples };
  });
  await check(browser, engine, 'all short slides visible above twelve are painted', async ({ p }) => {
    await setup(p, { count: 100, height: 100 }); const s = await inspect(p);
    assert.ok(s.flow.visible.length > 12); assert.equal(s.probe.peak, 1);
    const pixels = await p.evaluate(() => {
      const s = BilgeSlideFlow.snapshot(), scale = BilgeSlideFlow.scale(), r = pdfCanvas.getBoundingClientRect();
      return s.rows.filter(row => s.visible.includes(row.id)).map(row => {
        const y = (row.top - s.scroll + 50) * scale;
        if (y >= r.height) return null;
        return { index: s.rows.indexOf(row), pixel: Array.from(pdfCanvas.getContext('2d').getImageData(Math.floor(pdfCanvas.width / 2), Math.floor(y * pdfCanvas.height / r.height), 1, 1).data) };
      }).filter(Boolean);
    });
    for (const { index, pixel } of pixels) assert.deepEqual(pixel, index % 2 ? [50, 180, 90, 255] : [220, 70, 40, 255]);
    await p.screenshot({ path: path.join(out, engine + '-short-slides.png') }); return { s, pixels };
  }, { viewport: { width: 390, height: 1800 } });
  await check(browser, engine, 'combined imports exceed 100 and preserve repeated source numbers', async ({ p }) => {
    await setup(p, { count: 70 }); await save(p); const data = await setup(p, { count: 40, newNotebook: false });
    assert.equal(data.ids.length, 110); assert.equal((await inspect(p)).flow.rows.length, 110);
    await jump(p, data.ids[109]); const s = await inspect(p); assert.equal(s.ready, true); assert.equal(s.valid, true);
    assert.deepEqual(await p.evaluate(() => [notebookPages()[0].pdf.number, notebookPages()[70].pdf.number]), [1, 1]); return s;
  });
  await check(browser, engine, 'pending native result survives clear and cannot repaint new notebook', async ({ p }) => {
    await p.evaluate(() => { __decodeProbe.hold = true; }); const first = await setup(p, { count: 6, wait: false });
    await p.waitForFunction(() => __decodeProbe.held); const before = await inspect(p);
    await p.evaluate(() => selectNotebook(GENERAL)); await save(p);
    const next = await setup(p, { count: 3, wait: false }); await paint(p); const pending = await inspect(p);
    assert.notEqual(first.notebook, next.notebook); assert.equal(pending.probe.starts, before.probe.starts);
    assert.equal(pending.probe.active, 1); assert.equal(pending.flow.reader.pending.stale, true);
    assert.equal(pending.flow.reader.reservedCount, 1); assert.ok(pending.flow.reader.transitionBytes > 0);
    await p.evaluate(() => __decodeProbe.release()); await idle(p); const after = await inspect(p);
    assert.equal(after.probe.peak, 1); assert.equal(after.probe.resources[0].closed, true);
    assert.ok(after.flow.reader.resident.every(x => next.ids.includes(x.key))); assert.equal(after.ready, true);
    return { before, pending, after };
  });
  await check(browser, engine, 'valid combined notebook above 24 MiB keeps working', async ({ p }) => {
    await setup(p, { count: 7, noise: true }); await save(p);
    const data = await setup(p, { count: 7, noise: true, newNotebook: false });
    const bytes = await p.evaluate(() => notebookImageBytes());
    assert.ok(bytes > 24 * 1024 * 1024, 'Exceeds the isolated pilot manifest cap');
    await jump(p, data.ids[13]); const s = await inspect(p); assert.equal(s.ready, true); assert.equal(s.valid, true);
    assert.equal(s.probe.peak, 1); assert.ok(s.flow.reader.totalBytes <= s.flow.reader.maxBytes); return { bytes, s };
  });
  await check(browser, engine, 'legacy unpadded base64 accepted by native image stays readable', async ({ p }) => {
    await setup(p, { count: 1 });
    const legacy = await p.evaluate(async () => {
      const surface = document.createElement('canvas'); surface.width = 1000; surface.height = 563;
      const c = surface.getContext('2d'); c.fillStyle = '#0030aa'; c.fillRect(0, 0, 1000, 563);
      let image;
      for (let n = 0; n < 30; n++) {
        c.fillStyle = `rgb(${n},99,35)`; c.fillRect(n, 1, 1, 1); image = surface.toDataURL('image/png'); if (/=$/.test(image)) break;
      }
      if (!/=$/.test(image)) throw Error('Fixture has no padding');
      const original = image; image = image.replace(/=+$/, '');
      const native = new Image(); native.src = image; await native.decode(); const dimensions = [native.naturalWidth, native.naturalHeight]; native.src = '';
      page().pdf.image = image; touchPage(page()); drawAll(); return { valid: validState(state), dimensions, removed: original.length - image.length };
    });
    assert.equal(legacy.valid, true); assert.deepEqual(legacy.dimensions, [1000, 563]); assert.ok(legacy.removed > 0);
    await idle(p); const after = await inspect(p); assert.equal(after.ready, true, 'Existing valid source stays readable'); assert.equal(after.flow.reader.errors.length, 0); return { legacy, after };
  });
  await check(browser, engine, 'pagehide suspends decode until pageshow and preserves ink', async ({ p }) => {
    await setup(p); await p.evaluate(() => { page().strokes.push({ tool: 'pen', color: '#173b36', width: 3, points: [{ x: 10, y: 10, p: .5 }, { x: 30, y: 20, p: .5 }] }); touchPage(page()); scheduleSave(); });
    const before = await notes(p);
    const hidden = await p.evaluate(() => { dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })); drawAll(); return BilgeSlideFlow.snapshot(); });
    await paint(p); const probe = (await inspect(p)).probe;
    assert.equal(hidden.reader.residentCount, 0); assert.equal(probe.active, 0);
    assert.equal(probe.resources.filter(x => !x.closed).length, 0); assert.equal(await notes(p), before);
    await p.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))); await idle(p);
    assert.equal((await inspect(p)).ready, true); assert.equal(await notes(p), before); await save(p); return { hidden, after: await inspect(p) };
  });
  await check(browser, engine, 'pagehide while native pending retains reservation through pageshow', async ({ p }) => {
    await p.evaluate(() => { __decodeProbe.hold = true; }); await setup(p, { wait: false }); await p.waitForFunction(() => __decodeProbe.held);
    await p.evaluate(() => { dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })); drawAll(); });
    const hidden = await inspect(p); assert.equal(hidden.flow.reader.pending.stale, true); assert.equal(hidden.flow.reader.reservedCount, 1);
    await p.evaluate(() => { dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); drawAll(); }); await paint(p);
    const resumed = await inspect(p); assert.equal(resumed.probe.starts, 1); assert.equal(resumed.probe.active, 1);
    await p.evaluate(() => __decodeProbe.release()); await idle(p); const after = await inspect(p);
    assert.equal(after.probe.peak, 1); assert.equal(after.probe.resources[0].closed, true); assert.equal(after.ready, true); return { hidden, resumed, after };
  });
  await check(browser, engine, 'generic reader failure disposal reentrancy and rejected notification contracts', async ({ p }) => {
    const results = await p.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 1000; c.height = 100; const image = c.toDataURL('image/png');
      const row = { image, width: 1000, height: 100 }, meta = { key: ' page ', version: 1, width: 1000, height: 100 };
      const ok = (value, message) => { if (!value) throw Error(message); }, results = [];
      let failRead = true, closes = 0;
      const a = BilgeViewportReader.create({ readPage: () => { if (failRead) throw Error('read'); return row; }, decode: () => ({ width: 1000, height: 100, close() { closes++; } }) });
      a.open('a'); a.setViewport([meta]); await a.whenIdle(); ok(a.status(meta.key, 1) === 'error', 'Read rejects'); ok(a.snapshot().errors[0].code === 'READ_FAILED', 'Read error classified');
      failRead = false; a.retry(meta.key); await a.whenIdle(); ok(a.status(meta.key, 1) === 'ready', 'Read retries'); a.close(); ok(closes === 1, 'Successful bitmap released once'); results.push({ test: 'read-retry', snapshot: a.snapshot() });
      const b = BilgeViewportReader.create({ readPage: () => row, decode: () => ({ width: 999, height: 100, close() { closes++; } }) });
      b.open('b'); b.setViewport([meta]); await b.whenIdle(); ok(b.snapshot().errors[0].code === 'IMAGE_DIMENSIONS', 'Dimension mismatch rejected'); ok(closes === 2 && b.snapshot().totalBytes === 0, 'Bad dimensions closed'); b.close(); results.push({ test: 'dimensions', snapshot: b.snapshot() });
      let attempts = 0;
      const d = BilgeViewportReader.create({ readPage: () => row, decode: () => ({ width: 1000, height: 100, close() { attempts++; throw Error('close'); } }) });
      d.open('d'); d.setViewport([meta]); await d.whenIdle(); d.clear(); await d.whenIdle();
      ok(d.snapshot().fatalError === 'BITMAP_CLOSE_FAILED', 'Failed close fails closed'); ok(d.snapshot().totalBytes === 400000 && d.snapshot().retiredCount === 1, 'Failed close remains charged'); d.close(); ok(attempts === 1, 'No repeated failed close'); results.push({ test: 'close-throws', snapshot: d.snapshot() });
      const e = BilgeViewportReader.create({ readPage: () => row, decode: () => ({ width: 1000, height: 100, close() { closes++; } }) });
      e.open('e'); e.setViewport([meta]); await e.whenIdle(); const old = closes; let drawn = false;
      const context = { get drawImage() { e.open('new-e'); return () => { drawn = true; }; } };
      ok(e.draw(meta.key, 1, context, 0, 0) === false && !drawn, 'Reentrant scope cannot paint stale image'); ok(closes === old + 1 && e.snapshot().totalBytes === 0, 'Deferred draw disposal complete'); e.close(); results.push({ test: 'draw-reentrant', snapshot: e.snapshot() });
      const f = BilgeViewportReader.create({ readPage: () => row, decode: () => ({ width: 1000, height: 100, close() {} }), onChange: () => Promise.reject(Error('callback')) });
      f.open('f'); f.setViewport([meta]); await f.whenIdle(); await new Promise(resolve => setTimeout(resolve, 0)); ok(f.snapshot().onChangeErrors > 0 && f.status(meta.key, 1) === 'ready', 'Rejected notification isolated'); f.close(); results.push({ test: 'notification', snapshot: f.snapshot() }); return results;
    }); assert.equal(results.length, 5); return results;
  });
  for (const fallback of [false, true]) for (const jpeg of [false, true]) await check(browser, engine, (fallback ? 'fallback ' : 'native ') + (jpeg ? 'JPEG' : 'transparent gradient PNG') + ' pixels match original HTMLImage path', async ({ p }) => {
    await setup(p, { count: 1 });
    await p.evaluate(jpeg => {
      const c = document.createElement('canvas'); c.width = 1000; c.height = 563; const x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 1000, 563);
      g.addColorStop(0, 'rgba(255,0,90,0.2)'); g.addColorStop(.5, 'rgba(40,130,10,0.5)'); g.addColorStop(1, 'rgba(0,60,255,0.9)'); x.fillStyle = g; x.fillRect(0, 0, 1000, 563);
      x.fillStyle = '#001755'; x.font = '36px sans-serif'; x.fillText('Synthetic ABC 123', 80, 150);
      page().pdf.image = c.toDataURL(jpeg ? 'image/jpeg' : 'image/png', .88); touchPage(page()); drawAll();
    }, jpeg); await idle(p);
    const pixels = await p.evaluate(async () => {
      const image = new Image(); image.src = page().pdf.image; await image.decode();
      const reference = document.createElement('canvas'); reference.width = pdfCanvas.width; reference.height = pdfCanvas.height;
      const c = reference.getContext('2d'), s = BilgeSlideFlow.snapshot(), scale = BilgeSlideFlow.scale(), d = ctx.getTransform().a, row = s.rows[0];
      c.save(); c.setTransform(d * scale, 0, 0, d * scale, -s.x * d * scale, (row.top - s.scroll) * d * scale);
      // Match the existing product's row clip as well as its transform. A
      // clipped GPU draw need not round exactly like an unclipped draw.
      c.beginPath(); c.rect(0, 0, 1000, row.height); c.clip();
      c.fillStyle = page().paperColor || '#fffdf8'; c.fillRect(0, 0, 1000, row.height); c.drawImage(image, 0, 0, 1000, page().pdf.height); c.restore();
      const w = Math.max(1, Math.min(pdfCanvas.width - 4, Math.floor(1000 * d * scale) - 4)), h = Math.max(1, Math.min(pdfCanvas.height - 4, Math.floor(563 * d * scale) - 4));
      const actual = pdfCanvas.getContext('2d').getImageData(2, 2, w, h).data, expected = c.getImageData(2, 2, w, h).data;
      let max = 0, changed = 0; for (let i = 0; i < actual.length; i++) { const delta = Math.abs(actual[i] - expected[i]); max = Math.max(max, delta); if (delta) changed++; }
      return { max, changed, bytes: actual.length, width: w, height: h,
        evidence: max ? { actual: pdfCanvas.toDataURL('image/png'), reference: reference.toDataURL('image/png') } : null };
    });
    if (pixels.evidence) for (const [kind, value] of Object.entries(pixels.evidence)) fs.writeFileSync(path.join(out, `${engine}-${fallback ? 'fallback' : 'native'}-${jpeg ? 'jpeg' : 'png'}-${kind}.png`), Buffer.from(value.split(',')[1], 'base64'));
    delete pixels.evidence; (report.pixelMeasurements ||= []).push({ engine, fallback, jpeg, ...pixels });
    assert.equal(pixels.max, 0, 'Unchanged source raster quality: ' + JSON.stringify(pixels)); return pixels;
  }, { fallback });
  await check(browser, engine, 'account lock with held decode closes stale result', async ({ p }) => {
    await p.evaluate(() => { __decodeProbe.hold = true; }); await setup(p, { wait: false }); await p.waitForFunction(() => __decodeProbe.held);
    const before = await notes(p);
    await p.evaluate(() => { ready = false; dispatchEvent(new Event('bilge-account-locked')); drawAll(); __decodeProbe.release(); });
    await p.waitForFunction(() => __decodeProbe.active === 0 && __decodeProbe.closed === __decodeProbe.completed);
    assert.equal(await p.evaluate(() => BilgeSlideFlow.enabled()), false); assert.equal(await notes(p), before);
    const locked = await inspect(p); assert.equal(locked.probe.peak, 1); assert.equal(locked.probe.doubleClose, 0); return locked;
  });
  await check(browser, engine, 'decoder rejection is retryable without a loop or writing', async ({ p }) => {
    await p.evaluate(() => { __decodeProbe.reject = 1; }); const data = await setup(p);
    const failed = await inspect(p); assert.ok(failed.flow.reader.errors.some(x => x.key === data.ids[0])); assert.equal(failed.ready, false);
    const before = await notes(p), starts = failed.probe.starts; await paint(p); assert.equal((await inspect(p)).probe.starts, starts);
    await p.locator('#canvas').evaluate(c => { const r = c.getBoundingClientRect(); for (const type of ['pointerdown', 'pointerup']) c.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 55, pointerType: 'pen', button: 0, buttons: type === 'pointerdown' ? 1 : 0, pressure: .5, clientX: r.left + 50, clientY: r.top + 50 })); });
    await idle(p); const after = await inspect(p); assert.equal(after.ready, true); assert.equal(after.flow.reader.errors.length, 0); assert.equal(await notes(p), before); return { failed, after };
  });
  for (const jpeg of [false, true]) await check(browser, engine, (jpeg ? 'JPEG' : 'PNG') + ' HTMLImage fallback original colors and storage unchanged', async ({ p }) => {
    await setup(p, { count: 4, jpeg }); const s = await inspect(p); assert.equal(s.ready, true); assert.equal(s.flow.reader.errors.length, 0);
    const result = await p.evaluate(async () => {
      const image = new Image(); image.src = page().pdf.image; await image.decode();
      const reference = document.createElement('canvas'); reference.width = pdfCanvas.width; reference.height = pdfCanvas.height;
      const target = reference.getContext('2d'), s = BilgeSlideFlow.snapshot(), scale = BilgeSlideFlow.scale(), row = s.rows.find(x => x.id === activeId), d = pdfCanvas.width / pdfCanvas.getBoundingClientRect().width;
      target.setTransform(d * scale, 0, 0, d * scale, -s.x * d * scale, (row.top - s.scroll) * d * scale); target.drawImage(image, 0, 0, 1000, page().pdf.height);
      const x = Math.floor(pdfCanvas.width / 2), y = Math.floor(100 * scale * d);
      return { actual: Array.from(pdfCanvas.getContext('2d').getImageData(x, y, 1, 1).data), reference: Array.from(target.getImageData(x, y, 1, 1).data), inline: page().pdf.image.startsWith('data:image/') };
    });
    assert.deepEqual(result.actual, result.reference); assert.equal(result.inline, true); return { s, result };
  }, { fallback: true });
  await check(browser, engine, 'save reload backup restore and real v79 rollback preserve images and notes', async f => {
    const p = f.p; await setup(p, { count: 8 }); await p.evaluate(() => { page().strokes.push({ tool: 'pen', color: '#173b36', width: 3, points: [{ x: 40, y: 40, p: .5 }, { x: 90, y: 60, p: .5 }] }); touchPage(page()); scheduleSave(); }); await save(p);
    const before = await notes(p), backup = await p.evaluate(() => JSON.stringify(notebookSnapshot()));
    assert.ok(backup.includes('data:image/')); assert.equal(backup.includes('asset:'), false);
    const disk = await p.evaluate(async () => { const stored = await dbGet(); return { valid: validState(stored), compact: JSON.stringify(stored).includes('asset:') }; }); assert.equal(disk.compact, true);
    await p.reload(); await p.waitForFunction(() => typeof ready !== 'undefined' && ready); await idle(p); assert.equal(await notes(p), before);
    await p.locator('#importFile').setInputFiles({ name: 'synthetic-backup.json', mimeType: 'application/json', buffer: Buffer.from(backup) });
    await p.locator('#backupApply').click(); await p.waitForFunction(() => !pendingBackup); await idle(p); await save(p); assert.equal(await notes(p), before);
    f.old(); await p.reload(); await p.waitForFunction(() => typeof ready !== 'undefined' && ready && window.__v2UI); await p.waitForFunction(() => pdfBackgroundReady());
    assert.equal(await p.evaluate(() => typeof window.BilgeViewportReader), 'undefined', 'Actual pinned old v79 code');
    assert.equal(await notes(p), before); assert.equal(await p.evaluate(() => validState(parseBackup(notebookSnapshot()).book)), true);
    f.candidate(); await p.reload(); await p.waitForFunction(() => typeof ready !== 'undefined' && ready); await idle(p); assert.equal(await notes(p), before);
    return { notesSha256: sha(before), backupSha256: sha(backup), baselineFiles: baseline.size, disk, after: await inspect(p) };
  });
}
(async () => {
  for (const [engine, type] of Object.entries({ chromium, webkit })) {
    if (engineFilter && engine !== engineFilter) continue;
    const browser = await type.launch({ headless: true });
    try { await run(browser, engine); } finally { await deadline(browser.close(), 5000, 'browser cleanup'); }
  }
  assert.ok(report.results.length, 'No matching tests'); assert.deepEqual(hashes(snapshot(root)), source, 'Source changed during tests');
  report.passed = report.results.filter(x => x.passed).length; report.failed = report.results.length - report.passed;
  report.finishedAt = new Date().toISOString(); if (baseline) report.baselineSource = hashes(baseline);
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, failed: report.failed, out })); process.exitCode = report.failed ? 1 : 0;
})().catch(error => { report.fatal = String(error.stack || error); fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(report, null, 2)); console.error(error); process.exitCode = 1; })
  .finally(() => { for (const server of openServers) { server.closeAllConnections(); server.close(); } openServers.clear(); });
