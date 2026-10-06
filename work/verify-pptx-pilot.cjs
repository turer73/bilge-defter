'use strict';

// Independent, loopback-only acceptance checks. The approved teacher file is
// selected through the browser file input and is never copied into this repo.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { chromium, webkit } = require('playwright');

const root = path.resolve(__dirname, '..');
const pilot = path.join(root, 'work', 'pptx-pilot');
const out = path.join(root, 'outputs', 'pptx-pilot-20261006');
const expectedHash = '955170ca7d7ca2093bdbf6871a764c29d2717df345be12b75fa065c607329ca7';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const segment = process.argv.find(value => value.startsWith('--segment='))?.split('=')[1] || 'all';
const engineFilter = process.argv.find(value => value.startsWith('--engine='))?.split('=')[1];
assert.ok(['all','store','host','renderer','launcher'].includes(segment),'unknown test segment');
assert.ok(!engineFilter||['chromium','webkit'].includes(engineFilter),'unknown browser engine');
const playwrightVersion=require('playwright/package.json').version;
assert.equal(playwrightVersion,'1.62.1','test with the repository-pinned Playwright version');
const report = { startedAt: new Date().toISOString(), segment, nodeVersion:process.version,playwrightVersion,testRunnerSha256: hash(fs.readFileSync(__filename)), results: [], engines: [], boundaries: [
  'Local pilot only: no production deployment, migration, sync, remote conversion, or upload.',
  'Playwright WebKit is an automated browser check, not physical iPad/stylus acceptance.',
  'Document-count quota rollback is tested; physical disk-full/browser quota exhaustion is not simulated.',
  'Storage contract tests use tiny byte buffers; renderer and host tests use only the approved real teacher PPTX.',
] };
const headers = {
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data: blob:; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'private, no-store, no-transform',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const provenanceFile = path.join(pilot, 'vendor', 'PROVENANCE.json');
const provenance = fs.existsSync(provenanceFile) ? JSON.parse(fs.readFileSync(provenanceFile, 'utf8')) : null;
if(provenance)headers['Content-Security-Policy']=headers['Content-Security-Policy'].replace("script-src 'self'", "script-src 'self' '"+provenance.runtimeIntegrity+"' '"+provenance.frameIntegrity+"'");
const assets = new Map();
const assetBodies = new Map();
function inventory(directory, prefix) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) inventory(path.join(directory, entry.name), `${prefix}/${entry.name}`);
    else if (types[path.extname(entry.name)]) { const file=path.join(directory,entry.name);assets.set(`${prefix}/${entry.name}`,file);assetBodies.set(file,fs.readFileSync(file)); }
  }
}
inventory(pilot, '/work/pptx-pilot');
const served = [];
const server = http.createServer((request, response) => {
  const requestPath = request.url === '/' ? '/work/pptx-pilot/index.html' : request.url;
  const file = request.method === 'GET' && assets.get(requestPath);
  const testPage = request.method === 'GET' && requestPath === '/tests.html';
  served.push({ method: request.method, path: file || testPage ? requestPath : '[blocked]', status: file || testPage ? 200 : 404 });
  const responseHeaders = { ...headers, 'Content-Type': file ? types[path.extname(file)] : testPage ? types['.html'] : 'text/plain' };
  if (requestPath === '/work/pptx-pilot/renderer-frame.html' && provenance) responseHeaders['Content-Security-Policy'] = provenance.csp;
  response.writeHead(file || testPage ? 200 : 404, responseHeaders);
  response.end(file ? assetBodies.get(file) : testPage ? '<!doctype html><html><head><meta charset="utf-8"><title>Local independent tests</title></head><body><main id="testMount"></main></body></html>' : 'Not found');
});

function record(engine, name, passed, detail) {
  const row = { engine, name, passed, ...(detail === undefined ? {} : { detail }) };
  report.results.push(row);
  console.log(`${passed ? 'PASS' : 'FAIL'} ${engine}: ${name}${passed ? '' : `: ${detail}`}`);
}
async function check(engine, name, fn) {
  try { const detail = await fn(); record(engine, name, true, detail); return true; }
  catch (error) { record(engine, name, false, String(error.message || error).slice(0, 1000)); return false; }
}
function approvedSource() {
  const sourceArgument=process.argv.find(value=>value.startsWith('--source='))?.slice('--source='.length);
  let file;
  if(sourceArgument)file=path.resolve(sourceArgument);
  else {const desktop = path.join(os.homedir(), 'Desktop');const matches = fs.readdirSync(desktop).filter(name => name.endsWith('aaad6c7cfc701c526b43bc97412a48ca.pptx'));assert.equal(matches.length, 1, 'one approved source file must exist');file=path.join(desktop,matches[0]);}
  const bytes = fs.readFileSync(file);
  assert.equal(bytes.length, 16184486);
  assert.equal(hash(bytes), expectedHash);
  report.source = { bytes: bytes.length, sha256: hash(bytes), slides: 69 };
  return file;
}

async function modelStoreChecks(page, name) {
  const rows = await page.evaluate(async () => {
    const model = await import('/work/pptx-pilot/model.js');
    const { openStore } = await import('/work/pptx-pilot/store.js');
    const rows = [];
    const ok = (value, why) => { if (!value) throw new Error(why); };
    const same = (a, b, why) => ok(JSON.stringify(a) === JSON.stringify(b), why);
    const rejects = async (fn, why) => { try { await fn(); } catch (error) { return error; } throw new Error(why); };
    const test = async (label, fn) => { try { const detail = await fn(); rows.push({ label, passed: true, detail }); } catch (error) { rows.push({ label, passed: false, detail: error.message }); } };
    const tag = crypto.randomUUID().replaceAll('-', '');
    const scope = `local-fixture:test-${tag}`;
    const meta = { slideCount: 2, width: 1280, height: 720 };
    const bytes = new Uint8Array([80, 75, 3, 4, 0, 0, 0, 0]).buffer;
    const notes = [{ slide: 1, strokes: [{ width: 3, color: '#c12439', points: [{ x: 100, y: 60, pressure: 0.5 }, { x: 140, y: 85, pressure: 0.8 }] }] }];
    let store, original;
    await test('model metadata and stroke roundtrip', () => {
      same(model.validateMeta(meta), meta, 'metadata changed');
      same(model.normalizeStrokes(notes, meta), notes, 'valid coordinates changed');
    });
    await test('metadata rejects nonfinite, empty, oversize and invalid dimensions', async () => {
      for (const invalid of [{ ...meta, width: Infinity }, { ...meta, height: NaN }, { ...meta, width: 0 }, { ...meta, slideCount: 0 }, { ...meta, slideCount: 1000000 }, { ...meta, slideCount: 1.5 }]) await rejects(() => model.validateMeta(invalid), 'invalid metadata accepted');
    });
    await test('strokes reject invalid slide, shape, coordinates, pressure, color and width', async () => {
      const invalids = [null, {}, [{ slide: 0, strokes: [] }], [{ slide: 3, strokes: [] }], [{ slide: 1, strokes: [{ ...notes[0].strokes[0], width: Infinity }] }], [{ slide: 1, strokes: [{ ...notes[0].strokes[0], color: 'url(https://example.invalid/)' }] }]];
      for (const point of [{ x: NaN, y: 1 }, { x: 1001, y: 1 }, { x: 1, y: 564 }, { x: 1, y: 1, pressure: Infinity }, { x: -1, y: 1 }]) invalids.push([{ slide: 1, strokes: [{ ...notes[0].strokes[0], points: [point] }] }]);
      for (const invalid of invalids) await rejects(() => model.normalizeStrokes(invalid, meta), 'invalid stroke accepted');
    });
    await test('scope validation and required account guard', async () => {
      for (const invalid of ['', '../other', 'default', 'local-fixture:../other', 'bilge-defter-account-not-a-uuid']) await rejects(() => openStore(invalid, { guard: () => true }), 'invalid scope accepted');
      await rejects(() => openStore('bilge-defter-account-11111111-1111-4111-8111-111111111111'), 'unguarded account scope accepted');
    });
    await test('create and get preserve exact bytes and notes', async () => {
      store = await openStore(scope, { guard: () => true });
      original = await store.create({ bytes, name: 'independent-small.pptx', meta, notes });
      const loaded = await store.get(original.id);
      same([...new Uint8Array(loaded.bytes)], [...new Uint8Array(bytes)], 'source bytes changed');
      same(loaded.notes, notes, 'source notes changed');
      ok(loaded.hash === await model.sha256(bytes), 'hash does not bind stored source');
      ok(loaded.revision === original.revision, 'revision changed on read');
    });
    await test('reopen retains notes and byte identity', async () => {
      await store.close(); store = await openStore(scope, { guard: () => true });
      const loaded = await store.get(original.id);
      same(loaded.notes, notes, 'reopened notes changed');
      ok(await model.sha256(loaded.bytes) === original.hash, 'reopened bytes changed');
    });
    await test('different scopes cannot list or retrieve the other account document', async () => {
      const other = await openStore(`${scope}-other`, { guard: () => true });
      try { ok((await other.list()).length === 0, 'scope leak in list'); const value = await other.get(original.id).catch(() => null); ok(!value, 'scope leak in get'); } finally { await other.close(); }
    });
    await test('two connections race one revision with exactly one success', async () => {
      const other = await openStore(scope, { guard: () => true });
      try {
        const a = structuredClone(notes), b = structuredClone(notes); a[0].strokes[0].points[0].x = 210; b[0].strokes[0].points[0].x = 310;
        const settled = await Promise.allSettled([store.saveNotes(original.id, original.revision, a), other.saveNotes(original.id, original.revision, b)]);
        ok(settled.filter(value => value.status === 'fulfilled').length === 1, 'CAS did not select exactly one writer');
        ok(settled.filter(value => value.status === 'rejected').length === 1, 'stale writer was accepted');
        ok(settled.find(value => value.status === 'rejected').reason?.code === 'CONFLICT', 'losing writer did not report a revision conflict');
        const loaded = await store.get(original.id); ok(loaded.revision === original.revision + 1, 'CAS revision is not atomic');
        ok([210, 310].includes(loaded.notes[0].strokes[0].points[0].x), 'winner notes missing');
        ok(loaded.hash === original.hash && await model.sha256(loaded.bytes) === original.hash, 'notes update changed original document');
      } finally { await other.close(); }
    });
    await test('invalid saves are rejected without changing database revision or notes', async () => {
      const before = await store.get(original.id);
      await rejects(() => store.saveNotes(original.id, before.revision, [{ slide: 99, strokes: [] }]), 'bad notes accepted');
      await rejects(() => store.create({ bytes, name: 'bad.pptx', meta: { ...meta, height: NaN } }), 'bad metadata accepted');
      const after = await store.get(original.id); same(after.notes, before.notes, 'invalid save changed notes'); ok(after.revision === before.revision, 'invalid save changed revision'); ok((await store.list()).length === 1, 'invalid create mutated list');
    });
    await test('saving ink never reads or rewrites original document bytes', async () => {
      const before = await store.get(original.id), calls = [], originals = new Map();
      for (const method of ['get', 'getAll', 'put', 'add', 'delete', 'clear']) {
        const original = IDBObjectStore.prototype[method]; originals.set(method, original);
        IDBObjectStore.prototype[method] = function (...args) { if (this.name === 'assets') calls.push(method); return original.apply(this, args); };
      }
      try { await store.saveNotes(original.id, before.revision, before.notes); }
      finally { for (const [method, original] of originals) IDBObjectStore.prototype[method] = original; }
      same(calls, [], 'ink save touched original blob data');
      const after = await store.get(original.id); ok(after.hash === before.hash && after.revision === before.revision + 1, 'ink save changed source identity');
    });
    await test('guard revocation and closed handle reject further operations', async () => {
      let allowed = true; const guarded = await openStore(scope, { guard: () => allowed }); allowed = false;
      await rejects(() => guarded.saveNotes(original.id, original.revision + 1, notes), 'guard-denied write accepted');
      await rejects(() => guarded.list(), 'guard-denied list accepted'); await guarded.close();
      await rejects(() => guarded.get(original.id), 'closed read accepted');
      await rejects(() => guarded.create({ bytes, name: 'closed.pptx', meta }), 'closed write accepted');
    });
    await test('guard revoked while hashing prevents a pending create from committing', async () => {
      let allowed = true; const guarded = await openStore(`${scope}-race`, { guard: () => allowed });
      const pending = guarded.create({ bytes, name: 'race.pptx', meta }); allowed = false;
      await rejects(() => pending, 'guard revocation failed to cancel pending create'); guarded.close();
      const reopened = await openStore(`${scope}-race`, { guard: () => true });
      try { ok((await reopened.list()).length === 0, 'revoked pending create committed a document'); } finally { reopened.close(); }
    });
    await test('backup roundtrip binds exact source and notes; restore creates a new document', async () => {
      const source = await store.get(original.id); const blob = await model.createBackup(source); ok(blob instanceof Blob, 'backup is not a Blob');
      const parsed = await model.parseBackup(blob); same(parsed.notes, source.notes, 'backup lost notes'); same(parsed.meta, source.meta, 'backup lost dimensions'); ok(await model.sha256(parsed.bytes) === source.hash, 'backup changed document bytes');
      const restored = await store.create(parsed); ok(restored.id !== original.id, 'restore overwrote original'); ok((await store.list()).length === 2, 'restore did not add exactly one copy');
      ok((await store.get(original.id)).revision === source.revision, 'restore rewrote original revision');
    });
    await test('truncated and tampered backups are rejected without database mutation', async () => {
      const source = await store.get(original.id); const blob = await model.createBackup(source); const backupBytes = new Uint8Array(await blob.arrayBuffer());
      const before = await store.list(); await rejects(() => model.parseBackup(blob.slice(0, Math.floor(blob.size / 2))), 'truncated backup accepted');
      backupBytes[backupBytes.length - 1] ^= 255; await rejects(() => model.parseBackup(new Blob([backupBytes])), 'tampered backup accepted');
      same(await store.list(), before, 'rejected backup changed DB');
    });
    await test('backup validates altered notes, nonfinite coordinates and oversize before restore', async () => {
      const source = await store.get(original.id), blob = await model.createBackup(source), raw = new Uint8Array(await blob.arrayBuffer());
      const length = new DataView(raw.buffer).getUint32(8, true), header = JSON.parse(new TextDecoder().decode(raw.slice(12, 12 + length)));
      const sourceBytes = raw.slice(12 + length), encode = new TextEncoder();
      const pack = text => { const body = encode.encode(text), prefix = raw.slice(0, 12); new DataView(prefix.buffer).setUint32(8, body.length, true); return new Blob([prefix, body, sourceBytes]); };
      header.notes[0].strokes[0].points[0].x = 444;
      await rejects(() => model.parseBackup(pack(JSON.stringify(header))), 'modified notes with old checksum accepted');
      const core = { format: header.format, version: header.version, name: header.name, meta: header.meta, notes: header.notes, byteLength: header.byteLength, hash: header.hash };
      core.notes[0].strokes[0].points[0].x = 1001;
      header.checksum = [...new Uint8Array(await crypto.subtle.digest('SHA-256', encode.encode(JSON.stringify(core))))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
      await rejects(() => model.parseBackup(pack(JSON.stringify(header))), 'out of bounds notes with correct checksum accepted');
      const overflowText = JSON.stringify(header).replace('"x":1001', '"x":1e400');
      await rejects(() => model.parseBackup(pack(overflowText)), 'nonfinite backup coordinate accepted');
      const block = new Blob([new Uint8Array(1024 * 1024)]), oversized = new Blob(Array(30).fill(block));
      ok(oversized.size > 12 + model.LIMITS.HEADER_BYTES + model.LIMITS.FILE_BYTES, 'oversize test is below real limit');
      await rejects(() => model.parseBackup(oversized), 'oversize backup accepted');
      await rejects(() => store.create({ bytes: new ArrayBuffer(model.LIMITS.FILE_BYTES + 1), name: 'too-large.pptx', meta }), 'oversize source accepted');
      ok((await store.list()).length === 2, 'malformed restore attempts changed document list');
    });
    await test('document-count quota rolls back completely and preserves previous records', async () => {
      const full = await openStore(`${scope}-quota`, { guard: () => true });
      try {
        for (let i = 0; i < model.LIMITS.RECORDS; i++) await full.create({ bytes, name: `small-${i}.pptx`, meta });
        const before = await full.list(); const error = await rejects(() => full.create({ bytes, name: 'overflow.pptx', meta }), 'document count limit accepted another record');
        ok(error.code === 'QUOTA', 'failure was not quota related'); same(await full.list(), before, 'quota failure changed existing records');
        for (const doc of before) ok((await full.get(doc.id)).hash === original.hash, 'quota failure damaged existing bytes');
        return { limit: model.LIMITS.RECORDS, sourceBytesPerDocument: bytes.byteLength, retained: before.length };
      } finally { full.close(); }
    });
    await test('real account scope format keeps two guarded accounts isolated', async () => {
      const a = await openStore(`bilge-defter-account-${crypto.randomUUID()}`, { guard: () => true });
      const b = await openStore(`bilge-defter-account-${crypto.randomUUID()}`, { guard: () => true });
      try { const one = await a.create({ bytes, name: 'account-a.pptx', meta }); ok((await b.list()).length === 0, 'account B saw account A'); await rejects(() => b.get(one.id), 'account B retrieved account A document'); ok((await a.get(one.id)).hash === original.hash, 'account A document changed'); } finally { a.close(); b.close(); }
    });
    if (store) await store.close();
    return { rows, limits: model.LIMITS };
  });
  for (const row of rows.rows) record(name, row.label, row.passed, row.detail);
  return rows.limits;
}

async function hostChecks(page, name, source, context) {
  await page.goto(page.url().replace('/tests.html', '/work/pptx-pilot/index.html'));
  await page.waitForFunction(() => !!window.pptxPilot);
  const loaded = await check(name, 'real teacher file opens with 69 slides in isolated renderer', async () => {
    await page.locator('#pptxSource').setInputFiles(source);
    await page.waitForFunction(() => { const s = window.pptxPilot.snapshot(); return !s.busy && (!!s.documentId || s.phase === 'error'); }, null, { timeout: 120000 });
    const snapshot = await page.evaluate(() => window.pptxPilot.snapshot());
    assert.ok(snapshot.documentId, JSON.stringify(snapshot));
    const doc = await page.evaluate(async id => { const {openStore}=await import('./store.js'); const store=await openStore('local-fixture:local-pilot',{guard:()=>true}); try{const record=await store.get(id);return {meta:record.meta,hash:record.hash};}finally{store.close();}},snapshot.documentId);
    assert.equal(doc.meta.slideCount, 69); assert.equal(doc.hash, expectedHash);
    const sandbox = await page.locator('iframe').getAttribute('sandbox'); assert.equal(sandbox, 'allow-scripts');
    return { ...snapshot, meta: doc.meta, hash: doc.hash };
  });
  if (!loaded) return;
  await check(name, 'renderer opaque origin cannot access parent DOM or IndexedDB', async () => {
    const frame = page.frames().find(frame => frame !== page.mainFrame()); assert.ok(frame);
    const isolation = await frame.evaluate(async () => {
      let parentDenied = false, dbDenied = false;
      try { void parent.document.body; } catch { parentDenied = true; }
      try { const req = indexedDB.open('unreachable-parent-storage'); await new Promise((resolve,reject)=>{req.onsuccess=()=>{req.result.close();resolve();};req.onerror=()=>reject(req.error);}); } catch { dbDenied = true; }
      return { parentDenied, dbDenied };
    });
    assert.deepEqual(isolation, { parentDenied: true, dbDenied: true }); return isolation;
  });
  await check(name, 'synthetic pen and real mouse input persist as two strokes', async () => {
    const ink = page.locator('#pptxInk'); const box = await ink.boundingBox(); assert.ok(box && box.width > 100 && box.height > 100);
    await ink.evaluate(node => {
      const r=node.getBoundingClientRect(); const data={bubbles:true,cancelable:true,pointerType:'pen',pointerId:771,isPrimary:true,buttons:1,button:0,pressure:0.6};
      node.dispatchEvent(new PointerEvent('pointerdown',{...data,clientX:r.left+r.width*.2,clientY:r.top+r.height*.2}));
      node.dispatchEvent(new PointerEvent('pointermove',{...data,clientX:r.left+r.width*.35,clientY:r.top+r.height*.3}));
      node.dispatchEvent(new PointerEvent('pointerup',{...data,buttons:0,pressure:0,clientX:r.left+r.width*.4,clientY:r.top+r.height*.35}));
    });
    await page.mouse.move(box.x+box.width*.45,box.y+box.height*.45); await page.mouse.down(); await page.mouse.move(box.x+box.width*.62,box.y+box.height*.6,{steps:8}); await page.mouse.up();
    await page.evaluate(() => window.pptxPilot.flush());
    const snapshot = await page.evaluate(() => window.pptxPilot.snapshot()); assert.equal(snapshot.strokeCount, 2); assert.equal(snapshot.dirty,false);
    await page.locator('#pptxInk').screenshot({path:path.join(out,`${name}-ink.png`)});
    await page.locator('main').screenshot({path:path.join(out,`${name}-pilot.png`)});
    return snapshot;
  });
  await check(name, 'slide changes and viewport resize retain logical stroke coordinates', async () => {
    const read = () => page.evaluate(async()=>{const s=window.pptxPilot.snapshot();const {openStore}=await import('./store.js');const db=await openStore('local-fixture:local-pilot',{guard:()=>true});try{return (await db.get(s.documentId)).notes;}finally{db.close();}});
    const before=await read(); await page.locator('#pptxNext').click(); await page.waitForFunction(()=>window.pptxPilot.snapshot().slideIndex===1&&!window.pptxPilot.snapshot().busy);
    await page.locator('#pptxPrev').click(); await page.waitForFunction(()=>window.pptxPilot.snapshot().slideIndex===0&&!window.pptxPilot.snapshot().busy);
    await page.setViewportSize({width:760,height:980}); await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.evaluate(()=>window.pptxPilot.flush()); assert.deepEqual(await read(),before);
    const bounds=await page.evaluate(()=>{const ink=document.querySelector('#pptxInk').getBoundingClientRect(),frame=document.querySelector('iframe').getBoundingClientRect();return{ink:{x:ink.x,y:ink.y,width:ink.width,height:ink.height},frame:{x:frame.x,y:frame.y,width:frame.width,height:frame.height}};});
    for(const key of ['x','y','width','height']) assert.ok(Math.abs(bounds.ink[key]-bounds.frame[key])<=2,`ink/slide ${key} mismatch: ${JSON.stringify(bounds)}`);
    await page.setViewportSize({width:1200,height:960});return bounds;
  });
  await check(name, 'touch is opt-in; compatible touch ink and undo preserve previous strokes', async () => {
    const drawTouch=()=>page.locator('#pptxInk').evaluate(node=>{const r=node.getBoundingClientRect(),data={bubbles:true,cancelable:true,pointerType:'touch',pointerId:445,isPrimary:true,button:0,buttons:1,clientX:r.left+r.width*.75,clientY:r.top+r.height*.25};node.dispatchEvent(new PointerEvent('pointerdown',data));node.dispatchEvent(new PointerEvent('pointerup',{...data,buttons:0,clientX:data.clientX+30}));});
    await drawTouch();await page.evaluate(()=>window.pptxPilot.flush());assert.equal((await page.evaluate(()=>window.pptxPilot.snapshot())).strokeCount,2);
    await page.locator('#pptxTouch').check();await drawTouch();await page.evaluate(()=>window.pptxPilot.flush());assert.equal((await page.evaluate(()=>window.pptxPilot.snapshot())).strokeCount,3);
    await page.locator('#pptxUndo').click();await page.evaluate(()=>window.pptxPilot.flush());assert.equal((await page.evaluate(()=>window.pptxPilot.snapshot())).strokeCount,2);await page.locator('#pptxTouch').uncheck();
  });
  await check(name, 'pointer cancellation and two-finger gesture discard unfinished ink', async () => {
    await page.locator('#pptxTouch').check();await page.locator('#pptxInk').evaluate(node=>{
      const r=node.getBoundingClientRect(),data={bubbles:true,cancelable:true,isPrimary:true,button:0,buttons:1,clientX:r.left+r.width*.8,clientY:r.top+r.height*.4};
      node.dispatchEvent(new PointerEvent('pointerdown',{...data,pointerType:'pen',pointerId:447}));node.dispatchEvent(new PointerEvent('pointercancel',{...data,pointerType:'pen',pointerId:447}));
      node.dispatchEvent(new PointerEvent('pointerdown',{...data,pointerType:'touch',pointerId:448}));node.dispatchEvent(new PointerEvent('pointerdown',{...data,pointerType:'touch',pointerId:449,isPrimary:false,clientX:data.clientX+30}));
      node.dispatchEvent(new PointerEvent('pointerup',{...data,pointerType:'touch',pointerId:448,buttons:0}));node.dispatchEvent(new PointerEvent('pointerup',{...data,pointerType:'touch',pointerId:449,isPrimary:false,buttons:0}));
    });await page.evaluate(()=>window.pptxPilot.flush());assert.equal((await page.evaluate(()=>window.pptxPilot.snapshot())).strokeCount,2);await page.locator('#pptxTouch').uncheck();
  });
  await check(name, 'eraser removes a crossing stroke and undo restores it', async () => {
    await page.locator('#pptxEraser').click();await page.locator('#pptxInk').evaluate(node=>{const r=node.getBoundingClientRect(),data={bubbles:true,cancelable:true,pointerType:'pen',pointerId:446,isPrimary:true,button:0,buttons:1,pressure:.5,clientX:r.left+r.width*.2,clientY:r.top+r.height*.2};node.dispatchEvent(new PointerEvent('pointerdown',data));node.dispatchEvent(new PointerEvent('pointerup',{...data,buttons:0}));});
    await page.evaluate(()=>window.pptxPilot.flush());assert.equal((await page.evaluate(()=>window.pptxPilot.snapshot())).strokeCount,1);
    await page.locator('#pptxUndo').click();await page.evaluate(()=>window.pptxPilot.flush());assert.equal((await page.evaluate(()=>window.pptxPilot.snapshot())).strokeCount,2);await page.locator('#pptxPen').click();
  });
  await check(name, 'reload and reopen preserve exact notes and original file identity', async () => {
    const before=await page.evaluate(()=>window.pptxPilot.snapshot()); await page.reload(); await page.waitForFunction(()=>!!window.pptxPilot);
    await page.locator('#pptxSaved').selectOption(before.documentId); await page.locator('#pptxOpenSaved').click();
    await page.waitForFunction(()=>!!window.pptxPilot.snapshot().documentId&&!window.pptxPilot.snapshot().busy,null,{timeout:120000});
    const after=await page.evaluate(()=>window.pptxPilot.snapshot()); assert.equal(after.documentId,before.documentId); assert.equal(after.strokeCount,2); assert.equal(after.revision,before.revision); return after;
  });
  await check(name, 'downloaded backup parses and restore adds a new copy with retained notes', async () => {
    const before=await page.evaluate(()=>window.pptxPilot.snapshot()); const downloadPromise=page.waitForEvent('download'); await page.locator('#pptxBackup').click(); const download=await downloadPromise;
    const localPath=await download.path(); assert.ok(localPath); const stat=fs.statSync(localPath); assert.ok(stat.size>16184486,'backup should contain source plus notes');
    await page.locator('#pptxRestoreInput').setInputFiles(localPath);
    await page.waitForFunction(id=>{const s=window.pptxPilot.snapshot();return s.documentId&&s.documentId!==id&&!s.busy;},before.documentId,{timeout:120000});
    const after=await page.evaluate(()=>window.pptxPilot.snapshot()); assert.notEqual(after.documentId,before.documentId); assert.equal(after.strokeCount,2);
    const identities=await page.evaluate(async ids=>{const {openStore}=await import('./store.js');const db=await openStore('local-fixture:local-pilot',{guard:()=>true});try{const a=await db.get(ids[0]),b=await db.get(ids[1]);return{originalHash:a.hash,restoredHash:b.hash,notesEqual:JSON.stringify(a.notes)===JSON.stringify(b.notes),originalRevision:a.revision};}finally{db.close();}},[before.documentId,after.documentId]);
    assert.equal(identities.originalHash,expectedHash);assert.equal(identities.restoredHash,expectedHash);assert.equal(identities.notesEqual,true);assert.equal(identities.originalRevision,before.revision);
    const count=await page.locator('#pptxSaved option').count(); assert.ok(count>=2); return {backupBytes:stat.size,beforeId:before.documentId,restoredId:after.documentId,strokeCount:after.strokeCount,...identities};
  });
  await check(name, 'pending ink save and overlapping opens read only the first selected document', async () => {
    const result=await page.evaluate(async()=>{
      const ids=[...document.querySelector('#pptxSaved').options].map(option=>option.value).filter(Boolean);
      if(ids.length<2)throw new Error('two independent saved copies required');
      const current=window.pptxPilot.snapshot().documentId,other=ids.find(id=>id!==current),ink=document.querySelector('#pptxInk'),r=ink.getBoundingClientRect();
      const init={bubbles:true,cancelable:true,pointerType:'pen',pointerId:890,isPrimary:true,button:0,buttons:1,pressure:.5,clientX:r.left+r.width*.8,clientY:r.top+r.height*.8};
      ink.dispatchEvent(new PointerEvent('pointerdown',init));ink.dispatchEvent(new PointerEvent('pointerup',{...init,buttons:0,clientX:init.clientX+25}));
      const wasDirty=window.pptxPilot.snapshot().dirty,originalGet=IDBObjectStore.prototype.get;let documentReads=0;
      IDBObjectStore.prototype.get=function(...args){if(this.name==='documents')documentReads++;return originalGet.apply(this,args);};
      try{const first=window.pptxPilot.openSaved(current),second=window.pptxPilot.openSaved(other);await Promise.all([first,second]);}finally{IDBObjectStore.prototype.get=originalGet;}
      return{expectedId:current,wasDirty,documentReads,state:window.pptxPilot.snapshot()};
    });
    assert.equal(result.wasDirty,true);assert.equal(result.documentReads,1);assert.equal(result.state.documentId,result.expectedId);assert.equal(result.state.phase,'ready');assert.equal(result.state.strokeCount,3);return result;
  });
  await check(name, 'account lock aborts pending ink save and clears the displayed private document', async () => {
    const result=await page.evaluate(async()=>{
      const {openStore}=await import('./store.js'); const db=await openStore('local-fixture:local-pilot',{guard:()=>true});
      const id=window.pptxPilot.snapshot().documentId; const before=await db.get(id); const ink=document.querySelector('#pptxInk'), r=ink.getBoundingClientRect();
      const init={bubbles:true,cancelable:true,pointerType:'pen',pointerId:891,button:0,buttons:1,isPrimary:true,pressure:.6,clientX:r.left+r.width*.7,clientY:r.top+r.height*.7};
      ink.dispatchEvent(new PointerEvent('pointerdown',init)); ink.dispatchEvent(new PointerEvent('pointerup',{...init,buttons:0,clientX:init.clientX+20}));
      dispatchEvent(new Event('bilge-account-locked'));
      let rejected=false;try{await window.pptxPilot.flush();}catch{rejected=true;}
      const after=await db.get(id);db.close();return{beforeRevision:before.revision,afterRevision:after.revision,notesUnchanged:JSON.stringify(before.notes)===JSON.stringify(after.notes),rejected,state:window.pptxPilot.snapshot(),iframes:document.querySelectorAll('iframe').length};
    });
    assert.equal(result.afterRevision,result.beforeRevision);assert.equal(result.notesUnchanged,true);assert.equal(result.state.locked,true);assert.equal(result.state.documentId,null);assert.equal(result.state.strokeCount,0);assert.equal(result.iframes,0);return result;
  });
}

async function rendererChecks(page,name,source,origin) {
  await page.goto(`${origin}/tests.html`);
  await page.evaluate(()=>{const input=document.createElement('input');input.type='file';input.id='rendererSource';document.body.append(input);});
  await page.locator('#rendererSource').setInputFiles(source);
  await page.evaluate(async()=>{window.__rendererBytes=await document.querySelector('#rendererSource').files[0].arrayBuffer();window.__rendererFactory=(await import('/work/pptx-pilot/renderer-bridge.js')).createRenderer;});
  await check(name,'renderer ignores window-message spoof, returns bounded metadata and shows all 69 slides',async()=>{
    const result=await page.evaluate(async()=>{
      window.__renderer=await window.__rendererFactory(document.querySelector('#testMount'),{timeoutMs:60000});
      const loading=window.__renderer.load(window.__rendererBytes);
      for(const data of [{type:'bilge-pptx-ready',token:'wrong'},{v:1,id:1,ok:true,value:{slideCount:999,width:1,height:1,warnings:[]}}]) window.postMessage(data,'*');
      const meta=await loading, shown=[];
      for(let i=0;i<meta.slideCount;i++){const slide=await window.__renderer.show(i);shown.push(slide.index);}
      return {meta,shown,sourceBytes:window.__rendererBytes.byteLength,iframes:document.querySelectorAll('iframe').length};
    });
    assert.deepEqual(Object.keys(result.meta).sort(),['height','slideCount','warnings','width']);assert.equal(result.meta.slideCount,69);assert.equal(result.shown.length,69);assert.deepEqual(result.shown,Array.from({length:69},(_,i)=>i));assert.equal(result.sourceBytes,16184486);assert.equal(result.iframes,1);return{meta:result.meta,slidesShown:result.shown.length,sourceBytes:result.sourceBytes};
  });
  await check(name,'renderer CSP blocks a connection attempt before it reaches loopback server',async()=>{
    const frame=page.frames().find(frame=>frame!==page.mainFrame());assert.ok(frame);const before=served.length;
    const denied=await frame.evaluate(async url=>{try{await fetch(url);return false;}catch{return true;}},`${origin}/csp-blocked-probe`);
    assert.equal(denied,true);assert.equal(served.length,before,'CSP-blocked request reached HTTP server');
    const csp=await frame.evaluate(()=>window.__pilotCsp);assert.ok(csp.some(row=>row.directive==='connect-src'));return{blocked:true,directive:'connect-src'};
  });
  await check(name,'dispose rejects an in-flight real load and removes its frame; fresh instance reopens',async()=>{
    const result=await page.evaluate(async()=>{
      const renderer=window.__renderer, pending=renderer.load(window.__rendererBytes);renderer.dispose();
      let rejected=false;try{await pending;}catch{rejected=true;}
      const disposed=renderer.disposed,framesAfterDispose=document.querySelectorAll('iframe').length;
      const fresh=await window.__rendererFactory(document.querySelector('#testMount'),{timeoutMs:60000});const meta=await fresh.load(window.__rendererBytes);await fresh.show(68);fresh.dispose();
      return{rejected,disposed,framesAfterDispose,reopened:meta.slideCount,framesAfterFreshDispose:document.querySelectorAll('iframe').length};
    });
    assert.deepEqual(result,{rejected:true,disposed:true,framesAfterDispose:0,reopened:69,framesAfterFreshDispose:0});return result;
  });
  await check(name,'unsolicited protocol response id closes the channel (injected receive event)',async()=>{
    const result=await page.evaluate(async()=>{
      const NativeChannel=window.MessageChannel;let observedPort;
      window.MessageChannel=class extends NativeChannel{constructor(){super();observedPort=this.port1;}};
      let renderer;try{renderer=await window.__rendererFactory(document.querySelector('#testMount'),{timeoutMs:60000});}finally{window.MessageChannel=NativeChannel;}
      observedPort.dispatchEvent(new MessageEvent('message',{data:{v:1,id:999,ok:true,value:{slideCount:1,width:1000,height:600,warnings:[]}}}));
      return{disposed:renderer.disposed,frames:document.querySelectorAll('iframe').length};
    });
    assert.deepEqual(result,{disposed:true,frames:0});return result;
  });
  await check(name,'unconnected frame boot times out and removes the inert frame',async()=>{
    const result=await page.evaluate(async()=>{const mount=document.createElement('div');let code=null;try{await window.__rendererFactory(mount,{timeoutMs:100});}catch(error){code=error.code;}return{code,frames:mount.querySelectorAll('iframe').length};});
    assert.deepEqual(result,{code:'TIMEOUT',frames:0});return result;
  });
}

async function launcherChecks() {
  const {spawn}=require('node:child_process');
  const launcher=path.join(root,'tools','serve-pptx-pilot.cjs');
  const child=spawn(process.execPath,[launcher,'--port=0'],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let output='',port;
  const request=(url,method='GET',host)=>new Promise((resolve,reject)=>{
    const req=http.request({hostname:'127.0.0.1',port,path:url,method,headers:host?{Host:host}:{}},res=>{const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));});req.on('error',reject);req.end();
  });
  try {
    const started=await check('launcher','hash-checked server starts on an ephemeral loopback port',async()=>{
      port=await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error('launcher readiness timeout')),15000);
        child.stdout.on('data',chunk=>{output+=chunk.toString();const match=/http:\/\/127\.0\.0\.1:(\d+)\//.exec(output);if(match){clearTimeout(timer);resolve(Number(match[1]));}});
        child.stderr.on('data',chunk=>{output+=chunk.toString();});child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',code=>{clearTimeout(timer);reject(new Error(`launcher exited ${code}: ${output.slice(0,300)}`));});
      });
      report.launcher={sha256:hash(fs.readFileSync(launcher)),loopback:'127.0.0.1',ephemeralPort:true};return{loopback:'127.0.0.1',startupChecksCompleted:true};
    });
    if(!started)return;
    await check('launcher','root serves exact pilot entry with restrictive production-like headers',async()=>{
      const response=await request('/');assert.equal(response.status,200);assert.equal(hash(response.body),hash(fs.readFileSync(path.join(pilot,'index.html'))));
      assert.match(response.headers['content-security-policy'],/connect-src 'self'/);assert.ok(response.headers['content-security-policy'].includes("script-src 'self' '"+provenance.runtimeIntegrity+"' '"+provenance.frameIntegrity+"'"));assert.doesNotMatch(response.headers['content-security-policy'],/script-src[^;]*(?:unsafe-inline|unsafe-eval)/);assert.equal(response.headers['x-content-type-options'],'nosniff');assert.equal(response.headers['referrer-policy'],'no-referrer');assert.match(response.headers['cache-control'],/no-store/);assert.equal(response.headers['access-control-allow-origin'],undefined);
    });
    await check('launcher','frame serves exact self-contained bytes with matching hash CSP',async()=>{
      const response=await request('/renderer-frame.html');assert.equal(response.status,200);assert.equal(hash(response.body),hash(fs.readFileSync(path.join(pilot,'renderer-frame.html'))));assert.equal(response.headers['content-security-policy'],provenance.csp);assert.equal(response.headers['access-control-allow-origin'],undefined);assert.match(response.headers['content-type'],/^text\/html/);
    });
    await check('launcher','seven allowlisted assets and HEAD are available',async()=>{
      for(const file of ['index.html','host.js','host.css','model.js','store.js','renderer-bridge.js','renderer-frame.html']){const response=await request('/'+file);assert.equal(response.status,200,file);assert.equal(hash(response.body),hash(fs.readFileSync(path.join(pilot,file))),file);}
      const response=await request('/host.js','HEAD');assert.equal(response.status,200);assert.equal(response.body.length,0);assert.equal(Number(response.headers['content-length']),fs.statSync(path.join(pilot,'host.js')).size);
    });
    const sourceName=encodeURIComponent(path.basename(approvedSource()));
    const denied=[['POST cannot write or upload','/','POST'],['raw parent traversal','/../package.json'],['encoded parent traversal','/%2e%2e/package.json'],['repository package manifest','/package.json'],['environment file','/.env'],['original teacher source','/'+sourceName],['private evidence directory','/outputs/pptx-pilot-20261006/verification-all.json'],['nonallowlisted renderer source','/renderer-frame.js'],['vendor runtime direct path','/vendor/renderer-runtime.js'],['query-bearing asset','/host.js?raw=1']];
    for(const [label,url,method='GET'] of denied)await check('launcher',label+' is rejected',async()=>{const response=await request(url,method);assert.equal(response.status,404);assert.equal(response.body.toString(),'Not found');});
    await check('launcher','foreign Host header is rejected',async()=>{const response=await request('/','GET','foreign.example');assert.equal(response.status,404);assert.equal(response.body.toString(),'Not found');});
  } finally {
    if(child.exitCode===null){await new Promise(resolve=>{child.once('exit',resolve);child.kill();});}
  }
}

async function runEngine(name, engine, origin, source) {
  const browser=await engine.launch({headless:true}); const context=await browser.newContext({viewport:{width:1200,height:960},deviceScaleFactor:1,acceptDownloads:true});
  const evidence={engine:name,browserVersion:browser.version(),externalRequests:[],localRequests:0,pageErrors:[],consoleWarnings:[],cspViolations:[]}; report.engines.push(evidence);
  context.on('request',request=>{const url=new URL(request.url());if(['http:','https:'].includes(url.protocol)){if(url.origin===origin)evidence.localRequests++;else evidence.externalRequests.push({origin:url.origin,method:request.method()});}});
  await context.addInitScript(()=>{window.__pilotCsp=[];document.addEventListener('securitypolicyviolation',event=>window.__pilotCsp.push({directive:event.effectiveDirective,blocked:/^(blob|data):/.test(event.blockedURI)?event.blockedURI.split(':')[0]:event.blockedURI===location.href?'self':'other'}));});
  const page=await context.newPage(); page.on('pageerror',error=>evidence.pageErrors.push({name:error.name,message:error.message.slice(0,200)})); page.on('console',message=>{if(['warning','error'].includes(message.type()))evidence.consoleWarnings.push({type:message.type(),message:message.text().slice(0,200)});});
  try {
    await page.goto(`${origin}/tests.html`);
    if(['all','store'].includes(segment)) evidence.limits=await modelStoreChecks(page,name);
    if(['all','host'].includes(segment)) await hostChecks(page,name,source,context);
    if(['all','renderer'].includes(segment)) await rendererChecks(page,name,source,origin);
    evidence.cspViolations=await page.evaluate(()=>window.__pilotCsp);
    await check(name,'no external network requests',()=>assert.equal(evidence.externalRequests.length,0));
    await check(name,'no uncaught browser errors',()=>assert.deepEqual(evidence.pageErrors,[]));
  } catch(error) { record(name,'engine completion',false,error.stack); }
  finally { await context.close(); await browser.close(); }
}

(async()=>{
  fs.mkdirSync(out,{recursive:true});
  const source=['all','host','renderer'].includes(segment)?approvedSource():null;
  report.headers=headers;report.frameCsp=provenance?.csp;report.assetSnapshot='HTTP serves immutable bytes captured at test startup'; report.assets=[...assets].map(([url,file])=>({url,sha256:hash(assetBodies.get(file))}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve)); const origin=`http://127.0.0.1:${server.address().port}`;
  try { if(segment==='launcher')await launcherChecks();else for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]) if(!engineFilter||name===engineFilter) await runEngine(name,engine,origin,source); }
  finally { server.close(); report.completedAt=new Date().toISOString();report.sourceFilesChangedAfterCapture=report.assets.filter(row=>hash(fs.readFileSync(assets.get(row.url)))!==row.sha256).map(row=>row.url); report.served=served; report.passed=report.results.filter(row=>row.passed).length; report.failed=report.results.filter(row=>!row.passed).length; fs.writeFileSync(path.join(out,`verification-${segment}${engineFilter?`-${engineFilter}`:''}.json`),JSON.stringify(report,null,2)); console.log(JSON.stringify({passed:report.passed,failed:report.failed,sourceFilesChangedAfterCapture:report.sourceFilesChangedAfterCapture,evidence:path.relative(root,out)})); }
  process.exitCode=report.failed?1:0;
})().catch(error=>{console.error(error.stack);server.close();process.exitCode=1;});
