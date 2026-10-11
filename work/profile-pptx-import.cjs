'use strict';
// Actual UI profiler; product bytes, renderer, stage and commit implementations
// are unchanged. Only forwarding browser observers and synthetic input are used.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const crypto = require('node:crypto'), zlib = require('node:zlib'), assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const repo = path.resolve(__dirname, '..');
const app = path.resolve(process.env.BILGE_TEST_ROOT || path.join(__dirname, 'bilge-defter-test'));
const args = process.argv.slice(2), option = name => args.find(v => v.startsWith('--' + name + '='))?.slice(name.length + 3);
assert.ok(args.every(v => /^--(?:out|engine|case|writer)=.+$/.test(v)), 'Unknown argument');
assert.ok(!option('engine') || ['chromium', 'webkit'].includes(option('engine')), 'Unknown engine');
assert.ok(!option('writer') || ['worker', 'fallback'].includes(option('writer')), 'Unknown writer');
assert.ok(!option('case') || ['small', 'populated'].includes(option('case')), 'Unknown case');
const out = path.resolve(option('out') || path.join(repo, 'outputs/pptx-import-profile-20261011', new Date().toISOString().replace(/[:.]/g, '-') + '-' + crypto.randomUUID()));
assert.ok(out.startsWith(path.join(repo, 'outputs') + path.sep), 'Evidence must stay below outputs');
assert.ok(!fs.existsSync(out), 'Refuse to overwrite evidence'); fs.mkdirSync(out, { recursive: true });
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
function readFiles(dir, prefix = '') {
  const map = new Map();
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    assert.ok(!e.isSymbolicLink(), 'No symlink traversal'); const name = prefix + e.name, file = path.join(dir, e.name);
    if (e.isDirectory()) for (const pair of readFiles(file, name + '/')) map.set(...pair);
    else { assert.ok(e.isFile()); map.set('/' + name, fs.readFileSync(file)); }
  }
  return map;
}
const hashes = map => Object.fromEntries([...map].map(([name, bytes]) => [name, sha(bytes)]).sort(([a], [b]) => a.localeCompare(b)));
const files = readFiles(app), source = hashes(files), runnerSha256 = sha(fs.readFileSync(__filename));
const report = { ok: false, releaseEligible: false, startedAt: new Date().toISOString(), app, source, runnerSha256, results: [],
  boundaries: [
    'Synthetic approved account, loopback GET-only server, fresh browser process/context per matrix case, no user files or live services.',
    'Same immutable product responses, no renderer/frame/CSP patches. Actual file input, preparation, native temporary stage, Apply button and raster commit run.',
    'Forwarding wrappers add calls, Promise reactions, native event listeners and timestamps. Reported bookkeeping is only a lower bound on observer cost; scheduling is not proven identical.',
    'Elapsed spans are nested and overlapping: never add validators, decode, hash, native transaction and commit durations to claim total latency.',
    'IDB get latency includes scheduling/deserialization up to the success observer; it is not isolated disk time. Image.decode includes browser/codec work.',
    'Main heartbeat gaps include browser work, automation waits and instrumentation. Two requestAnimationFrame callbacks plus 20ms tail are a settle convention, not physical display or iPad acceptance.',
    'Image occurrence characters, distinct values and owned decoded pixel estimates are logical accounting, not JS backing allocation, process RSS, RAM, GC or GPU measurements.',
    'No image contents, decoded pixels, full notebook JSON or SHA work are captured inside timed regions. Payload character counts do not claim UTF-8 disk byte totals.',
    'The small/populated fixtures compare the same current code; they are not an optimization A/B result. One run per matrix cell is exploratory, not a latency distribution across independent runs.',
    'JSON backup and cancellation/fault acceptance remain covered by the separate regression suites. This profiler checks actual append, original-page preservation and reload outside timing.'
  ] };
fs.copyFileSync(__filename, path.join(out, 'runner.cjs'));
fs.writeFileSync(path.join(out, 'source.json'), JSON.stringify({ source, runnerSha256 }, null, 2));

// Fixed workload, not an illustration: deterministic RGB noise makes source
// and encoded page sizes substantial. Six full-slide backgrounds repeat across
// twenty slides; no fonts, external links, macros or personal data are present.
const crcTable = Array.from({ length: 256 }, (_, n) => { for (let i = 0; i < 8; i++) n = (n >>> 1) ^ ((n & 1) ? 0xedb88320 : 0); return n >>> 0; });
function crc32(b) { let n = 0xffffffff; for (const x of b) n = crcTable[(n ^ x) & 255] ^ (n >>> 8); return (n ^ 0xffffffff) >>> 0; }
function pngChunk(type, b) { const t = Buffer.from(type), l = Buffer.alloc(4), c = Buffer.alloc(4); l.writeUInt32BE(b.length); c.writeUInt32BE(crc32(Buffer.concat([t, b]))); return Buffer.concat([l, t, b, c]); }
function png(seed) {
  const w = 1000, h = 562, stride = w * 3 + 1, pixels = Buffer.alloc(stride * h); let x = seed >>> 0;
  for (let y = 0; y < h; y++) for (let i = 0; i < w; i++) {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    const p = y * stride + 1 + i * 3; pixels[p] = x & 255; pixels[p + 1] = (x >>> 8) & 255; pixels[p + 2] = (x >>> 16) & 255;
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(w); header.writeUInt32BE(h, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', header), pngChunk('IDAT', zlib.deflateSync(pixels, { level: 6 })), pngChunk('IEND', Buffer.alloc(0))]);
}
function zip(parts) {
  const local = [], central = []; let offset = 0;
  for (const [name, value] of Object.entries(parts)) {
    const filename = Buffer.from(name), data = Buffer.isBuffer(value) ? value : Buffer.from(value), crc = crc32(data);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50); h.writeUInt16LE(20, 4); h.writeUInt32LE(crc, 14); h.writeUInt32LE(data.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(filename.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt32LE(crc, 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(filename.length, 28); c.writeUInt32LE(offset, 42);
    local.push(h, filename, data); central.push(c, filename); offset += h.length + filename.length + data.length;
  }
  const dir = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(Object.keys(parts).length, 8); end.writeUInt16LE(Object.keys(parts).length, 10); end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, dir, end]);
}
const sources = [101, 211, 307, 419, 503, 601].map(png);
const seeds = [701, 809, 907, 1009, 1103, 1201, 1301, 1409, 1511, 1601, 1709, 1801].map(png);
function deck() {
  const P = 'http://schemas.openxmlformats.org/presentationml/2006/main', A = 'http://schemas.openxmlformats.org/drawingml/2006/main', R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships', REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const indexes = Array.from({ length: 20 }, (_, i) => i + 1), cx = 9144000, cy = 5138928;
  const parts = {
    '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>' + indexes.map(i => `<Override PartName="/ppt/slides/slide${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('') + '</Types>',
    '_rels/.rels': `<Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${R}/officeDocument" Target="ppt/presentation.xml"/></Relationships>`,
    'ppt/presentation.xml': `<p:presentation xmlns:p="${P}" xmlns:r="${R}"><p:sldIdLst>${indexes.map(i => `<p:sldId id="${255 + i}" r:id="rId${i}"/>`).join('')}</p:sldIdLst><p:sldSz cx="${cx}" cy="${cy}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`,
    'ppt/_rels/presentation.xml.rels': `<Relationships xmlns="${REL}">${indexes.map(i => `<Relationship Id="rId${i}" Type="${R}/slide" Target="slides/slide${i}.xml"/>`).join('')}</Relationships>`
  };
  sources.forEach((bytes, i) => { parts[`ppt/media/background${i}.png`] = bytes; });
  for (const i of indexes) {
    parts[`ppt/slides/_rels/slide${i}.xml.rels`] = `<Relationships xmlns="${REL}"><Relationship Id="rIdImage" Type="${R}/image" Target="../media/background${(i - 1) % sources.length}.png"/></Relationships>`;
    parts[`ppt/slides/slide${i}.xml`] = `<p:sld xmlns:p="${P}" xmlns:a="${A}" xmlns:r="${R}"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr><p:pic><p:nvPicPr><p:cNvPr id="2" name="Sentetik arka plan ${i}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rIdImage"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
  }
  return zip(parts);
}
const input = deck(), filename = 'Sentetik-20-slayt.pptx'; assert.ok(input.length < 20 * 1024 * 1024, 'Input exceeds real limit');
fs.writeFileSync(path.join(out, filename), input);
report.fixture = { filename, bytes: input.length, sha256: sha(input), slides: 20, uniqueBackgrounds: 6,
  png: sources.map(b => ({ bytes: b.length, sha256: sha(b) })), seed: seeds.map(b => ({ bytes: b.length, sha256: sha(b), dataURLSha256: sha('data:image/png;base64,' + b.toString('base64')) })),
  populated: { pages: 24, uniqueImages: 12, dimensions: [1000, 562] } };
fs.writeFileSync(path.join(out, 'fixtures.json'), JSON.stringify(report.fixture, null, 2));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.wasm': 'application/wasm' };
async function deadline(p, ms, name) { let t; try { return await Promise.race([p, new Promise((_, no) => { t = setTimeout(() => no(Error(name + ' exceeded ' + ms + 'ms')), ms); })]); } finally { clearTimeout(t); } }

function installProfile() {
  const P = window.__pptxProfile = { active: false, phase: null, spans: [], events: [], beats: [], longTasks: [], bookkeepingMs: 0, timer: null, origin: performance.timeOrigin };
  const now = () => performance.now();
  const add = (list, value) => { const t = now(); list.push(value); P.bookkeepingMs += now() - t; };
  const record = (name, begin, data, phase = P.phase) => add(P.spans, { name, phase, start: begin, end: now(), ...data });
  function sync(name, fn, meta) { return function (...args) { if (!P.active) return Reflect.apply(fn, this, args); const start = now(), data = meta?.(args) || {}; try { const v = Reflect.apply(fn, this, args); record(name, start, { ...data, ok: true }); return v; } catch (e) { record(name, start, { ...data, ok: false, error: e.name }); throw e; } }; }
  function asyncSpan(name, fn, meta) { return async function (...args) { if (!P.active) return Reflect.apply(fn, this, args); const start = now(), phase = P.phase, data = meta?.(args) || {}; try { const v = await Reflect.apply(fn, this, args); record(name, start, { ...data, ok: true }, phase); return v; } catch (e) { record(name, start, { ...data, ok: false, error: e.name }, phase); throw e; } }; }
  validState = sync('validation.book', validState, a => ({ pages: a[0]?.pages?.length || 0, trash: a[0]?.trash?.length || 0 }));
  validPdfBackground = sync('validation.pdf', validPdfBackground, a => ({ chars: a[0]?.image?.length || 0 }));
  exportImage = asyncSpan('decode.exportImage', exportImage, a => ({ chars: a[0]?.length || 0 }));
  sha256Hex = asyncSpan('asset.digest', sha256Hex, a => ({ chars: a[0]?.length || 0 }));
  dbPut = asyncSpan('notebook.dbPut', dbPut, a => ({ pages: a[0]?.pages?.length || 0, suppliedJsonChars: typeof a[1]?.json === 'string' ? a[1].json.length : null, preservePrevious: a[1]?.preservePrevious === true }));
  // Preserve all original descriptors, including the live busy getter. The one
  // replaced value is a forwarding observer around the actual commit function.
  const helper = window.BilgeRasterImport, descriptors = Object.getOwnPropertyDescriptors(helper);
  descriptors.commit = { ...descriptors.commit, value: asyncSpan('raster.commit', helper.commit, a => ({ pages: a[0]?.pages?.length || 0 })) };
  window.BilgeRasterImport = Object.freeze(Object.defineProperties({}, descriptors));
  if (!Object.isFrozen(window.BilgeRasterImport) || Object.getOwnPropertyDescriptor(window.BilgeRasterImport, 'busy').get !== Object.getOwnPropertyDescriptor(helper, 'busy').get) throw Error('Observer changed helper contract');
  const native = { tx: IDBDatabase.prototype.transaction, get: IDBObjectStore.prototype.get, put: IDBObjectStore.prototype.put, add: IDBObjectStore.prototype.add, post: window.Worker?.prototype.postMessage, port: MessagePort.prototype.postMessage, decode: HTMLImageElement.prototype.decode };
  const infos = new WeakMap(); let sequence = 0;
  const scope = database => database.name.startsWith('bilge-defter-pptx-stage-v1-') ? 'stage' : database.name === DB ? 'notebook' : 'other';
  IDBDatabase.prototype.transaction = function (...args) {
    const start = now(), tx = Reflect.apply(native.tx, this, args); if (!P.active) return tx;
    const info = { id: ++sequence, scope: scope(this), mode: args[1] || 'readonly', stageWrites: 0, stageChars: 0, assetWrites: 0, assetChars: 0, appWrites: 0, phase: P.phase }; infos.set(tx, info);
    tx.addEventListener('complete', () => record('idb.transaction', start, { ...info, ok: true }, info.phase), { once: true });
    tx.addEventListener('abort', () => record('idb.transaction', start, { ...info, ok: false, error: tx.error?.name || 'Abort' }, info.phase), { once: true });
    return tx;
  };
  IDBObjectStore.prototype.get = function (...args) {
    const start = now(), request = Reflect.apply(native.get, this, args); if (!P.active) return request;
    const kind = scope(this.transaction.db), store = this.name, phase = P.phase, info = infos.get(this.transaction);
    const label = kind === 'stage' && store === 'pages' ? 'stage.page.get' : kind === 'notebook' && typeof args[0] === 'string' && args[0].startsWith('asset:') ? 'asset.get' : null;
    if (label) { request.addEventListener('success', () => record(label, start, { transaction: info?.id, chars: (request.result?.image || request.result?.data)?.length || 0, number: request.result?.number ?? null, ok: true }, phase), { once: true }); request.addEventListener('error', () => record(label, start, { ok: false, error: request.error?.name }, phase), { once: true }); }
    return request;
  };
  for (const method of ['add', 'put']) IDBObjectStore.prototype[method] = function (value, key, ...args) {
    if (!P.active) return Reflect.apply(native[method], this, arguments);
    const start = now(), info = infos.get(this.transaction), kind = scope(this.transaction.db), isStage = kind === 'stage' && this.name === 'pages', isAsset = kind === 'notebook' && typeof key === 'string' && /^asset:[a-f0-9]{64}$/.test(key), isApp = kind === 'notebook' && key === 'app';
    if (info) { if (isStage) { info.stageWrites++; info.stageChars += value.image.length; } if (isAsset) { info.assetWrites++; info.assetChars += value.data.length; } if (isApp) info.appWrites++; }
    const request = Reflect.apply(native[method], this, arguments);
    if (isStage || isAsset || isApp) record('idb.' + method + '.dispatch', start, { scope: kind, kind: isStage ? 'stage-page' : isAsset ? 'asset' : 'app', chars: isStage ? value.image.length : isAsset ? value.data.length : null, number: isStage ? value.number : null, transaction: info?.id, ok: true });
    return request;
  };
  if (window.Worker) Worker.prototype.postMessage = function (message, ...args) {
    if (P.active && message?.type === 'put') add(P.events, { phase: P.phase, at: now(), type: 'worker-put', jsonChars: message.json.length, preservePrevious: message.preservePrevious === true });
    return Reflect.apply(native.post, this, [message, ...args]);
  };
  MessagePort.prototype.postMessage = function (message, ...args) {
    if (P.active && message?.command === 'snapshot') add(P.events, { phase: P.phase, at: now(), type: 'renderer-snapshot', index: message.index });
    return Reflect.apply(native.port, this, [message, ...args]);
  };
  HTMLImageElement.prototype.decode = asyncSpan('decode.nativeImage', native.decode);
  try { P.longTaskObserver = new PerformanceObserver(list => { if (P.active) for (const e of list.getEntries()) add(P.longTasks, { phase: P.phase, start: e.startTime, duration: e.duration }); }); P.longTaskObserver.observe({ type: 'longtask', buffered: false }); P.longTaskSupported = true; } catch { P.longTaskSupported = false; }
  P.begin = phase => {
    if (P.active) throw Error('Nested phase interval'); P.phase = phase; P.active = true;
    const start = now(), mark = { phase, start, spans: P.spans.length, events: P.events.length, beats: P.beats.length, longTasks: P.longTasks.length, bookkeepingMs: P.bookkeepingMs };
    let last = start; const beat = () => { if (!P.active) return; const end = now(); add(P.beats, { phase, start: last, end, gapMs: end - last, delayMs: Math.max(0, end - last - 16) }); last = end; P.timer = setTimeout(beat, 16); }; P.timer = setTimeout(beat, 16); return mark;
  };
  P.end = mark => { const end = now(); for (const e of P.longTaskObserver?.takeRecords() || []) add(P.longTasks, { phase: P.phase, start: e.startTime, duration: e.duration }); P.active = false; clearTimeout(P.timer); return { ...mark, end, elapsedMs: end - mark.start, spans: P.spans.slice(mark.spans), events: P.events.slice(mark.events), beats: P.beats.slice(mark.beats), longTasks: P.longTasks.slice(mark.longTasks), bookkeepingMs: P.bookkeepingMs - mark.bookkeepingMs, longTaskSupported: P.longTaskSupported }; };
}

async function digestBook(page) {
  return page.evaluate(async () => {
    const digest = async text => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(x => x.toString(16).padStart(2, '0')).join('');
    const cache = new Map(), pages = []; let occurrenceChars = 0;
    for (const p of state.pages) { let image = null; if (p.pdf) { occurrenceChars += p.pdf.image.length; if (!cache.has(p.pdf.image)) cache.set(p.pdf.image, await digest(p.pdf.image)); image = { sha256: cache.get(p.pdf.image), chars: p.pdf.image.length, width: p.pdf.width, height: p.pdf.height, name: p.pdf.name, number: p.pdf.number, total: p.pdf.total }; } pages.push({ id: p.id, title: p.title, notebookId: p.notebookId, strokes: p.strokes, image }); }
    const raw = await dbGet('app'), text = JSON.stringify(raw), before = await dbGet('before-import');
    return { pages, notebooks: state.notebooks || [], activeNotebook, canEdit: canEdit(), valid: validState(state), worker: !!saveWorker, occurrenceChars, uniqueChars: [...cache.keys()].reduce((sum, s) => sum + s.length, 0), registryEntries: assetRefs.size, appChars: text.length, appBytes: new TextEncoder().encode(text).byteLength, appSha256: await digest(text), appInlineImages: (text.match(/"image":"data:image\//g) || []).length, beforeSha256: before === undefined ? null : await digest(JSON.stringify(before)), reader: window.BilgeSlideFlow?.snapshot()?.reader || null };
  });
}
async function paintTail(page) { await page.evaluate(() => new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(ok, 20))))); }
function phaseSummary(phase) {
  const gaps = phase.beats.map(b => b.gapMs).sort((a, b) => a - b), byName = {};
  for (const s of phase.spans) { const e = byName[s.name] ||= { count: 0, inclusiveMs: 0, maxMs: 0, inputChars: 0 }; e.count++; e.inclusiveMs += s.end - s.start; e.maxMs = Math.max(e.maxMs, s.end - s.start); e.inputChars += s.chars || 0; }
  return { elapsedMs: phase.elapsedMs, byName, heartbeat: { samples: gaps.length, p95GapMs: gaps.length ? gaps[Math.min(gaps.length - 1, Math.ceil(gaps.length * .95) - 1)] : null, maxGapMs: gaps.length ? gaps.at(-1) : null, gapsOver50ms: gaps.filter(x => x > 50).length }, bookkeepingMs: phase.bookkeepingMs };
}
const resources = new Set();
async function cleanup(f) {
  f.closed = true; const errors = [];
  if (f.context) try { await deadline(f.context.close(), 10000, 'Context close'); } catch (e) { errors.push(e.message); }
  if (f.browser) try { await deadline(f.browser.close(), 15000, 'Browser close'); } catch (e) { errors.push(e.message); }
  if (f.server) try { f.server.closeAllConnections(); await deadline(new Promise(ok => f.server.close(ok)), 5000, 'Server close'); } catch (e) { errors.push(e.message); }
  resources.delete(f); if (errors.length) throw Error(errors.join('; '));
}
async function runCase(f, type) {
  f.requests = []; f.external = []; f.pageErrors = []; f.consoleErrors = []; f.networkFailures = []; f.workers = [];
  f.server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://loopback'); f.requests.push({ method: req.method, path: url.pathname });
    if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
    if (url.pathname === '/api/v1/bilge-defter/whoami') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ account_protocol: 'approval-v1', identity: { type: 'access', id: '11111111-1111-4111-8111-111111111111', status: 'approved', role: 'student', email: 'profiler@example.test' } })); return; }
    const name = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname), bytes = files.get(name);
    res.writeHead(bytes ? 200 : 404, { 'Content-Type': mime[path.extname(name)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(bytes || '');
  });
  await new Promise((ok, no) => { f.server.once('error', no); f.server.listen(0, '127.0.0.1', ok); }); if (f.closed) throw Error('Canceled');
  f.origin = 'http://127.0.0.1:' + f.server.address().port;
  f.browser = await deadline(type.launch({ headless: true }), 30000, 'Browser launch'); if (f.closed) { await f.browser.close(); throw Error('Canceled'); }
  f.context = await f.browser.newContext({ viewport: { width: 1180, height: 920 } }); f.context.setDefaultTimeout(20000);
  f.context.on('serviceworker', w => f.workers.push(w.url()));
  await f.context.addInitScript(({ origin, fallback }) => { if (top !== window || location.origin !== origin) return; window.__accountRequired = true; localStorage.setItem('bilge_defter_onboarding_v1', 'true'); try { delete Navigator.prototype.serviceWorker; } catch {} if (fallback) Object.defineProperty(window, 'Worker', { configurable: true, value: undefined }); }, { origin: f.origin, fallback: f.writer === 'fallback' });
  await f.context.route('**/*', route => { const u = new URL(route.request().url()); if (['http:', 'https:'].includes(u.protocol) && u.origin !== f.origin) { f.external.push(u.href); return route.abort(); } return route.continue(); });
  f.page = await f.context.newPage(); const p = f.page;
  p.on('pageerror', e => f.pageErrors.push(e.message)); p.on('console', m => { if (m.type() === 'error') f.consoleErrors.push(m.text()); }); p.on('requestfailed', r => f.networkFailures.push({ url: r.url(), error: r.failure()?.errorText }));
  await p.goto(f.origin); await p.waitForFunction(() => typeof ready !== 'undefined' && ready && window.__v2UI && window.BilgePptx);
  const seed = f.case === 'populated' ? seeds.map(b => 'data:image/png;base64,' + b.toString('base64')) : [];
  await p.evaluate(async images => {
    if (!await flushSave()) throw Error('Initial flush'); const notebookId = newPageId();
    const pages = Array.from({ length: images.length ? 24 : 1 }, (_, i) => ({ id: newPageId(), title: 'Önceki sayfa ' + (i + 1), notebookId, updated: '2026-10-11T00:00:00Z', viewY: 0,
      strokes: [{ tool: 'pen', color: '#173b36', width: 2, points: [{ x: 20, y: 30, p: .5 }, { x: 80, y: 70, p: .7 }] }],
      ...(images.length ? { pdf: { image: images[i % images.length], width: 1000, height: 562, name: 'Önceki-sayfalar.pdf', number: i + 1, total: 24 } } : {}) }));
    if (!await replaceNotebook({ version: 2, pages, active: pages[0].id, notebooks: [{ id: notebookId, title: 'Ölçüm defteri' }], activeNotebook: notebookId }, 'Synthetic setup', { preservePrevious: false })) throw Error('Seed replacement');
    await ensureAssets(); if (assetSweep) await assetSweep; if (!await flushSave()) throw Error('Seed flush'); clearTimeout(assetTimer); assetTimer = null;
  }, seed);
  const evidence = f.evidence = { before: await digestBook(p) }; assert.equal(evidence.before.canEdit, true); assert.equal(evidence.before.worker, f.writer === 'worker'); assert.equal(evidence.before.appInlineImages, 0, 'Seed must be fully migrated');
  await p.evaluate(installProfile);
  const opened = await p.evaluate(() => BilgePptx.importToNotebook()); assert.equal(opened.ok, true);
  await p.waitForFunction(() => { const d = document.querySelector('#pptxImportDialog'); return d?.open && !d.querySelector('#pptxNotebookFile').disabled; });
  const prep = await p.evaluate(() => __pptxProfile.begin('prepare'));
  await p.locator('#pptxNotebookFile').setInputFiles({ name: filename, mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', buffer: input });
  await p.waitForFunction(() => { const s = BilgePptx.snapshot()?.import; return s?.phase === 'ready' || s?.phase === 'error'; }, null, { timeout: 120000 });
  await paintTail(p); evidence.prepare = await p.evaluate(mark => __pptxProfile.end(mark), prep); evidence.preparedUI = await p.evaluate(() => ({ snapshot: BilgePptx.snapshot(), status: document.querySelector('#pptxNotebookStatus')?.textContent, preview: !!document.querySelector('#pptxNotebookPreview img')?.src }));
  assert.equal(evidence.preparedUI.snapshot.import.phase, 'ready', evidence.preparedUI.status);
  assert.equal(evidence.preparedUI.snapshot.import.pages, 20); assert.equal(evidence.preparedUI.snapshot.import.retainedPageImages, 0);
  const written = evidence.prepare.spans.filter(s => s.name === 'idb.add.dispatch' && s.kind === 'stage-page');
  assert.equal(written.length, 20); assert.deepEqual(written.map(s => s.number), Array.from({ length: 20 }, (_, i) => i + 1));
  const rasterChars = written.reduce((n, s) => n + s.chars, 0); evidence.rasterChars = rasterChars;
  assert.ok(rasterChars > 5 * 1024 * 1024 && rasterChars <= 24 * 1024 * 1024, 'Prepared real raster workload must be >5MiB and within 24MiB');
  assert.equal(evidence.prepare.events.filter(e => e.type === 'renderer-snapshot').length, 20);
  const apply = await p.evaluate(() => __pptxProfile.begin('apply'));
  await p.locator('#pptxNotebookApply').click();
  await p.waitForFunction(() => !document.querySelector('#pptxImportDialog') || ['error', 'uncertain'].includes(BilgePptx.snapshot()?.import?.phase), null, { timeout: 120000 });
  await p.waitForFunction(() => !document.querySelector('#pptxImportDialog') && !BilgeRasterImport.busy && canEdit(), null, { timeout: 15000 });
  await paintTail(p); evidence.apply = await p.evaluate(mark => __pptxProfile.end(mark), apply);
  assert.equal(evidence.apply.spans.filter(s => s.name === 'raster.commit' && s.ok).length, 1);
  assert.equal(evidence.apply.spans.filter(s => s.name === 'stage.page.get' && s.ok).length, 20);
  assert.equal(evidence.apply.spans.filter(s => s.name === 'notebook.dbPut' && s.ok && s.preservePrevious).length, 1);
  evidence.summaries = { prepare: phaseSummary(evidence.prepare), apply: phaseSummary(evidence.apply) };
  evidence.after = await digestBook(p); assert.equal(evidence.after.valid, true); assert.equal(evidence.after.canEdit, true);
  assert.equal(evidence.after.pages.length, evidence.before.pages.length + 20); assert.deepEqual(evidence.after.pages.slice(0, evidence.before.pages.length), evidence.before.pages);
  assert.deepEqual(evidence.after.notebooks, evidence.before.notebooks); assert.equal(evidence.after.beforeSha256, evidence.before.appSha256);
  const added = evidence.after.pages.slice(evidence.before.pages.length);
  assert.equal(added.reduce((n, r) => n + r.image.chars, 0), rasterChars); assert.ok(added.every((r, i) => r.image.width === 1000 && r.image.height === 562 && r.image.number === i + 1 && r.image.total === 20 && r.image.name === filename && r.strokes.length === 0));
  await p.screenshot({ path: path.join(out, f.name + '.png') });
  await p.reload(); await p.waitForFunction(() => typeof ready !== 'undefined' && ready && canEdit()); evidence.reloaded = await digestBook(p);
  assert.deepEqual(evidence.reloaded.pages, evidence.after.pages); assert.deepEqual(evidence.reloaded.notebooks, evidence.after.notebooks);
  assert.deepEqual(f.external, []); assert.deepEqual(f.pageErrors, []); assert.deepEqual(f.workers, []); assert.equal(f.context.serviceWorkers().length, 0);
  assert.ok(f.requests.every(r => r.method === 'GET')); assert.ok(!f.requests.some(r => /(?:^|\/)sw\.js$/i.test(r.path)));
  return evidence;
}
async function main() {
  const matrix = [];
  for (const [engine, type] of Object.entries({ chromium, webkit })) for (const writer of ['worker', 'fallback']) for (const size of ['small', 'populated']) if ((!option('engine') || option('engine') === engine) && (!option('writer') || option('writer') === writer) && (!option('case') || option('case') === size)) matrix.push({ engine, type, writer, case: size, name: engine + '-' + writer + '-' + size });
  report.expectedCases = matrix.length; assert.ok(matrix.length);
  for (const c of matrix) {
    const f = { ...c }, result = { engine: c.engine, writer: c.writer, case: c.case, name: c.name, ok: false }; resources.add(f);
    try { result.evidence = await deadline(runCase(f, c.type), 240000, c.name); result.ok = true; }
    catch (e) { result.error = e.stack || String(e); if (f.evidence) result.evidence = f.evidence; if (f.page && !f.page.isClosed()) try { result.diagnostic = await deadline(f.page.evaluate(() => ({ phase: window.BilgePptx?.snapshot?.(), status: document.querySelector('#pptxNotebookStatus')?.textContent, activeProfile: window.__pptxProfile?.phase, spans: window.__pptxProfile?.spans })), 5000, 'Diagnostic'); } catch (error) { result.diagnosticError = error.message; } }
    finally { result.network = { external: f.external, requests: f.requests, pageErrors: f.pageErrors, consoleErrors: f.consoleErrors, failures: f.networkFailures, serviceWorkers: f.workers }; try { await cleanup(f); } catch (e) { result.ok = false; result.cleanupError = e.message; } report.results.push(result); fs.writeFileSync(path.join(out, c.name + '.json'), JSON.stringify(result, null, 2)); console.log((result.ok ? 'PASS ' : 'FAIL ') + c.name); }
  }
  assert.deepEqual(hashes(readFiles(app)), source, 'Product source drift'); assert.equal(sha(fs.readFileSync(__filename)), runnerSha256, 'Runner drift'); assert.equal(report.results.length, report.expectedCases);
  report.ok = report.results.length > 0 && report.results.every(r => r.ok);
}
main().catch(e => { report.ok = false; report.fatal = e.stack || String(e); }).finally(async () => {
  for (const f of [...resources]) try { await cleanup(f); } catch (e) { report.ok = false; (report.cleanupErrors ||= []).push(e.message); }
  report.finishedAt = new Date().toISOString(); report.passed = report.results.filter(r => r.ok).length; report.failed = report.results.filter(r => !r.ok).length;
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify({ ok: report.ok, passed: report.passed, failed: report.failed, fatal: report.fatal, out })); process.exitCode = report.ok ? 0 : 1;
});
