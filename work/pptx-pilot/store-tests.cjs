'use strict';
// Focused, synthetic real-IndexedDB tests. No notebook DB, user PPTX, or network.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const {chromium, webkit} = require('playwright');
const files = new Map(['/model.js', '/store.js'].map(name => [name, path.join(__dirname, name.slice(1))]));
const server = http.createServer((request, response) => {
  const file = request.method === 'GET' && files.get(request.url);
  const page = request.method === 'GET' && request.url === '/';
  response.writeHead(file || page ? 200 : 404, {'Content-Type': file ? 'text/javascript' : 'text/html',
    'Content-Security-Policy': "default-src 'none'; script-src 'self'; connect-src 'none'; base-uri 'none'", 'Cache-Control': 'no-store'});
  let body = file ? fs.readFileSync(file) : page ? '<!doctype html><title>PPTX store fixture</title>' : '';
  if (file?.endsWith('store.js') && process.env.BILGE_STORE_NEGATIVE_CLOSE === '1') {
    const needle = 'state.reject(state.reason); pending.delete(tx);', text = body.toString('utf8');
    if (text.split(needle).length !== 2) throw Error('negative control target missing');
    body = text.replace(needle, 'pending.delete(tx);');
  }
  response.end(body);
});
async function run(name, engine, origin) {
  const browser = await engine.launch(), context = await browser.newContext({serviceWorkers: 'block'});
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.text().startsWith('STORE_TEST ')) console.log(name + ': ' + message.text().slice(11)); });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin === origin && (url.pathname === '/' || files.has(url.pathname)) && route.request().method() === 'GET'
      ? route.continue() : route.abort();
  });
  try {
    await page.goto(origin);
    const result = await page.evaluate(async () => {
      const model = await import('/model.js'), {openStore} = await import('/store.js');
      const tests = [], opened = [], handles = [];
      const originalOpen = IDBFactory.prototype.open;
      IDBFactory.prototype.open = function (name, ...args) { opened.push(name); return originalOpen.call(this, name, ...args); };
      const check = (value, message) => { if (!value) throw Error(message); };
      const equal = (a, b, message) => check(JSON.stringify(a) === JSON.stringify(b), message);
      const rejects = async (fn, code) => { try { await fn(); } catch (error) { check(error.code === code, `expected ${code}, received ${error.code || error.name}`); return; } throw Error(`expected ${code} rejection`); };
      const cancellation = promise => { let timer; return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(Error('pending cancellation did not settle'), {code: 'TEST_TIMEOUT'})), 3000); })]).finally(() => clearTimeout(timer)); };
      const pass = name => { tests.push(name); console.info('STORE_TEST ' + name); };
      const meta = {slideCount: 69, width: 1000, height: 750};
      const notes = [{slide: 1, strokes: [{width: 3, color: '#C12439', points: [{x: 2, y: 3, pressure: .5}, {x: 50, y: 70}]}]}];
      const canonical = model.normalizeStrokes(notes, meta);
      const bytes = new Uint8Array([80, 75, 3, 4, 5, 6, 7, 8]).buffer;
      const scope = suffix => 'local-fixture:' + suffix + '-' + crypto.randomUUID();
      const open = async (name, options) => { const store = await openStore(name, options); handles.push(store); return store; };
      const raw = async (name, stores, mode, action) => {
        const db = await new Promise((resolve, reject) => { const req = indexedDB.open(name, 1); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
        try { return await new Promise((resolve, reject) => { const tx = db.transaction(stores, mode); let value;
          tx.oncomplete = () => resolve(value); tx.onabort = () => reject(tx.error); tx.onerror = () => {};
          action(tx, result => { value = result; });
        }); } finally { db.close(); }
      };
      try {
        equal(model.validateMeta({...meta, slideCount: 100}), {...meta, slideCount: 100}, '100 slides accepted');
        await rejects(() => model.validateMeta({...meta, slideCount: 101}), 'INVALID');
        await rejects(() => model.validateMeta({...meta, width: 0}), 'INVALID');
        check(notes[0].strokes[0].color === '#C12439' && canonical[0].strokes[0].color === '#c12439', 'no input mutation');
        for (const value of [NaN, Infinity, -1, 1001]) {
          const copy = structuredClone(notes); copy[0].strokes[0].points[0].x = value;
          await rejects(() => model.normalizeStrokes(copy, meta), 'INVALID');
        }
        await rejects(() => model.normalizeStrokes([notes[0], notes[0]], meta), 'INVALID');
        await rejects(() => model.normalizeStrokes(new Array(1), meta), 'INVALID');
        const extra = structuredClone(notes); extra[0].strokes[0].url = 'unexpected';
        await rejects(() => model.normalizeStrokes(extra, meta), 'INVALID');
        pass('model bounds, no silent drop, duplicate/sparse/unknown-field rejection');

        await rejects(() => openStore('bilge-defter'), 'INVALID');
        await rejects(() => openStore('bilge-defter-account-' + crypto.randomUUID()), 'INVALID');
        check(opened.length === 0, 'invalid scope must not open any DB');
        pass('invalid scopes rejected before IndexedDB opens');

        const dbScope = scope('primary'), first = await open(dbScope), second = await open(dbScope);
        const input = bytes.slice(0), creation = first.create({bytes: input, name: 'C:\\private\\ders.pptx', meta, notes});
        new Uint8Array(input)[0] = 9;
        const record = await creation, loaded = await first.get(record.id);
        equal([...new Uint8Array(loaded.bytes)], [...new Uint8Array(bytes)], 'source bytes immutable after call');
        check(loaded.name === 'ders.pptx' && loaded.revision === 1, 'name sanitized and revision initialized');
        equal(loaded.notes, canonical, 'notes roundtrip');
        const listed = await first.list(); check(listed.length === 1 && listed[0].hash === record.hash && !('bytes' in listed[0]) && !('notes' in listed[0]), 'small list metadata');
        pass('atomic document/notes creation, immutable original, basename-only list');

        const backup = await model.createBackup(loaded), parsed = await model.parseBackup(backup);
        equal([...new Uint8Array(parsed.bytes)], [...new Uint8Array(bytes)], 'backup exact bytes'); equal(parsed.notes, canonical, 'backup notes');
        const copy = await first.create(parsed); check(copy.id !== record.id && copy.hash === record.hash, 'restore is new ID');
        check((await first.list()).length === 2 && (await first.get(record.id)).revision === 1, 'import preserves original');
        const corrupt = new Uint8Array(await backup.arrayBuffer()); corrupt[corrupt.length - 1] ^= 1;
        await rejects(() => model.parseBackup(new Blob([corrupt])), 'CORRUPT');
        const head = new Uint8Array(await backup.arrayBuffer()), headSize = new DataView(head.buffer).getUint32(8, true);
        const text = new TextDecoder().decode(head.slice(12, 12 + headSize)), changed = text.replace('"width":3', '"width":4');
        check(changed !== text, 'tamper fixture must change notes'); head.set(new TextEncoder().encode(changed), 12);
        await rejects(() => model.parseBackup(new Blob([head])), 'CORRUPT');
        await rejects(() => model.parseBackup(backup.slice(0, backup.size - 1)), 'INVALID');
        check((await first.list()).length === 2, 'failed backups do not write anything');
        pass('binary backup roundtrip, new-ID import, payload/header tamper and truncation rejection');

        const different = [{slide: 2, strokes: canonical[0].strokes}];
        const race = await Promise.allSettled([first.saveNotes(record.id, 1, []), second.saveNotes(record.id, 1, different)]);
        check(race.filter(item => item.status === 'fulfilled').length === 1 && race.filter(item => item.status === 'rejected' && item.reason.code === 'CONFLICT').length === 1, 'exactly one CAS winner');
        const current = await first.get(record.id); check(current.revision === 2, 'single revision increment');
        pass('real concurrent connections CAS: one winner, one conflict');

        const calls = [], originals = {};
        for (const method of ['get', 'put', 'add', 'getKey']) {
          originals[method] = IDBObjectStore.prototype[method];
          IDBObjectStore.prototype[method] = function (...args) {
            if (this.name === 'assets') { calls.push(method); if (method !== 'getKey') throw Error('save touched original bytes'); }
            return originals[method].apply(this, args);
          };
        }
        let saved;
        try { saved = await first.saveNotes(record.id, 2, canonical); }
        finally { for (const method of Object.keys(originals)) IDBObjectStore.prototype[method] = originals[method]; }
        equal(calls, ['getKey'], 'notes write only checks asset key'); check(!('bytes' in saved) && saved.revision === 3, 'small save result');
        check((await first.get(record.id)).hash === record.hash, 'original unchanged');
        pass('pen save never reads/hashes/rewrites original asset');

        const a = await open('bilge-defter-account-' + crypto.randomUUID(), {guard: () => true});
        const b = await open('bilge-defter-account-' + crypto.randomUUID(), {guard: () => true});
        await a.create({bytes, name: 'a.pptx', meta}); check((await b.list()).length === 0, 'account stores isolated');
        pass('different approved account scopes use separate databases');

        console.info('STORE_TEST diagnostic: close handle begin');
        const closed = await open(scope('closed')), closeRecord = await closed.create({bytes, name: 'close.pptx', meta});
        const pending = closed.saveNotes(closeRecord.id, 1, canonical); closed.close(); await rejects(() => cancellation(pending), 'CLOSED');
        console.info('STORE_TEST diagnostic: pending save rejected; reopening raw');
        const afterClose = await raw(closed.dbName, ['notes'], 'readonly', (tx, set) => { const req = tx.objectStore('notes').get(closeRecord.id); req.onsuccess = () => set(req.result); });
        check(afterClose.revision === 1, 'close aborts pending save'); await rejects(() => closed.list(), 'CLOSED');
        console.info('STORE_TEST diagnostic: raw revision preserved; guard begin');
        let valid = true; const guarded = await open(scope('guarded'), {guard: () => valid});
        const guardRecord = await guarded.create({bytes, name: 'guard.pptx', meta});
        const changing = guarded.saveNotes(guardRecord.id, 1, canonical); valid = false; await rejects(() => cancellation(changing), 'CLOSED'); valid = true;
        console.info('STORE_TEST diagnostic: guard pending save rejected');
        await rejects(() => guarded.list(), 'CLOSED');
        const guardSaved = await raw(guarded.dbName, ['notes'], 'readonly', (tx, set) => { const req = tx.objectStore('notes').get(guardRecord.id); req.onsuccess = () => set(req.result); });
        check(guardSaved.revision === 1, 'guard change aborts atomically');
        pass('close and account epoch guard abort pending saves and permanently close handle');

        const damaged = await open(scope('damaged')), damageRecord = await damaged.create({bytes, name: 'missing.pptx', meta, notes});
        await raw(damaged.dbName, ['assets'], 'readwrite', tx => tx.objectStore('assets').delete(damageRecord.id));
        await rejects(() => damaged.get(damageRecord.id), 'CORRUPT'); await rejects(() => damaged.saveNotes(damageRecord.id, 1, []), 'CORRUPT');
        await rejects(() => damaged.list(), 'CORRUPT');
        const intactNotes = await raw(damaged.dbName, ['notes'], 'readonly', (tx, set) => { const req = tx.objectStore('notes').get(damageRecord.id); req.onsuccess = () => set(req.result); });
        equal(intactNotes.notes, canonical, 'missing original never overwrites notes');
        pass('missing original rejected by get/list/save with notes unchanged');

        const tampered = await open(scope('tampered')), tamperRecord = await tampered.create({bytes, name: 'corrupt.pptx', meta});
        await raw(tampered.dbName, ['assets'], 'readwrite', tx => { const store = tx.objectStore('assets'), req = store.get(tamperRecord.id); req.onsuccess = () => { const value = req.result; new Uint8Array(value.bytes)[0] ^= 1; store.put(value); }; });
        await rejects(() => tampered.get(tamperRecord.id), 'CORRUPT');
        pass('persisted original checksum mismatch rejected');

        const quota = await open(scope('quota')), large = new Uint8Array(model.LIMITS.FILE_BYTES).buffer;
        for (let i = 0; i < 4; i++) await quota.create({bytes: large, name: `${i}.pptx`, meta});
        await rejects(() => quota.create({bytes: large, name: 'over-budget.pptx', meta}), 'QUOTA');
        check((await quota.list()).length === 4, '96 MiB rejection is atomic');
        pass('real aggregate 96 MiB budget rejects fifth 20 MiB original atomically');

        const records = await open(scope('record-limit'));
        for (let i = 0; i < model.LIMITS.RECORDS; i++) await records.create({bytes, name: `${i}.pptx`, meta});
        await rejects(() => records.create({bytes, name: 'overflow.pptx', meta}), 'QUOTA');
        check((await records.list()).length === model.LIMITS.RECORDS, 'record-limit rollback');
        pass('20-record limit rejects extra document without overwriting');
        check(opened.every(name => name.startsWith('bilge-defter-pptx-pilot-v1::')), 'no notebook DB opened');
        return {tests, openedDatabases: new Set(opened).size, notebookDatabasesOpened: 0};
      } finally { for (const store of handles) store.close(); IDBFactory.prototype.open = originalOpen; }
    });
    if (errors.length) throw Error(errors.join('; '));
    console.log(JSON.stringify({engine: name, passed: result.tests.length, ...result}));
  } finally { await context.close(); await browser.close(); }
}
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    if (!process.env.BILGE_STORE_ENGINE || process.env.BILGE_STORE_ENGINE === 'chromium') await run('chromium', chromium, origin);
    if (!process.env.BILGE_STORE_ENGINE || process.env.BILGE_STORE_ENGINE === 'webkit') await run('webkit', webkit, origin);
  }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
