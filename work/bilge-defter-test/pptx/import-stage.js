/* Temporary PPTX preparation only: no notebook records, manifest or commit.
 * Account names partition same-origin data; they are not an authorization wall.
 * Cooperating tabs hold one Web Lock until discard/close. Cleanup never steals
 * a lock or uses age alone. No image arrays/queues or in-memory fallback exist.
 * Limits count data-URL characters, not decoded/native or total app memory.
 * Image checks cover trusted renderer envelopes/signatures, not full decoding.
 * IDB completion is the write boundary, not an eviction/hardware guarantee.
 * STAGE_CLOSED/LOCK_LOST report an unreceived outcome: abort is not rollback proof.
 */
const PROTOCOL = 'pptx-stage-web-locks-v1';
const MAX_PAGES = 100, PAGE_CHARS = 6 * 1024 * 1024, TOTAL_CHARS = 24 * 1024 * 1024;
const TTL = 24 * 60 * 60 * 1000;
const messages = {
  INVALID_ARGUMENT: 'Sunum hazırlığı bilgileri geçersiz.',
  INVALID_IMAGE: 'Slayt görüntüsünün biçimi geçersiz.',
  PAGE_TOO_LARGE: 'Bir slayt 6 MB hazırlık sınırını aşıyor.',
  TOTAL_TOO_LARGE: 'Sunum görüntüleri 24 MB hazırlık sınırını aşıyor.',
  PAGE_SEQUENCE: 'Slaytların hazırlık sırası uyuşmuyor.',
  OP_IN_PROGRESS: 'Önceki slayt işlemi henüz bitmedi.',
  STALE_SCOPE: 'Hesap, defter veya hazırlık işlemi değişti. Sunumu yeniden seçin.',
  STAGE_CANCELED: 'Sunum hazırlığı iptal edildi.',
  STAGE_CLOSED: 'Sunumun geçici deposu kapandı. Sunumu yeniden seçin.',
  LOCKS_UNAVAILABLE: 'Bu tarayıcı güvenli sunum hazırlığını desteklemiyor.',
  STORAGE_UNAVAILABLE: 'Sunum için geçici cihaz depolaması kullanılamıyor.',
  OPEN_BLOCKED: 'Geçici depo başka bir pencere tarafından engelleniyor.',
  IMPORT_BUSY: 'Bu sunum hazırlığı başka bir pencerede kullanılıyor.',
  LOCK_REQUEST_FAILED: 'Sunum hazırlığı kilidi alınamadı.',
  LOCK_LOST: 'Sunum hazırlığı kilidi kaybedildi. Sunumu yeniden seçin.',
  STAGE_OWNERSHIP: 'Sunumun geçici kayıt sahipliği doğrulanamadı.',
  MISSING_PAGE: 'Hazırlanan slayt cihazda bulunamadı. Sunumu yeniden seçin.',
  QUOTA_EXCEEDED: 'Cihazda sunumu hazırlamak için yeterli depolama alanı yok.',
  TX_ABORTED: 'Sunumun geçici kayıt işlemi tamamlanamadı.',
  STORAGE_ERROR: 'Sunumun geçici cihaz deposuna erişilemedi.',
};
export class ImportStageError extends Error {
  constructor(code, cause) {
    super(messages[code] || code); this.name = 'ImportStageError'; this.code = code;
    if (cause !== undefined) this.cause = cause;
  }
}
const error = (code, cause) => new ImportStageError(code, cause);
const fail = code => { throw error(code); };
const mapped = cause => cause instanceof ImportStageError ? cause : error(
  cause?.name === 'QuotaExceededError' ? 'QUOTA_EXCEEDED' :
    cause?.name === 'AbortError' ? 'TX_ABORTED' : 'STORAGE_ERROR', cause);
const isId = value => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);
const randomId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)),
  value => value.toString(16).padStart(2, '0')).join('');

function pageValue(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(input))) fail('INVALID_ARGUMENT');
  const names = ['number', 'width', 'height', 'image'];
  if (Reflect.ownKeys(input).length !== 4) fail('INVALID_ARGUMENT');
  const page = {};
  for (const name of names) {
    const descriptor = Object.getOwnPropertyDescriptor(input, name);
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) fail('INVALID_ARGUMENT');
    page[name] = descriptor.value;
  }
  if (!Number.isSafeInteger(page.number) || page.number < 1 || page.number > MAX_PAGES ||
      page.width !== 1000 || !Number.isSafeInteger(page.height) || page.height < 100 || page.height > 3000)
    fail('INVALID_ARGUMENT');
  const image = page.image;
  if (typeof image !== 'string') fail('INVALID_IMAGE');
  if (image.length > PAGE_CHARS) fail('PAGE_TOO_LARGE');
  const prefix = image.startsWith('data:image/png;base64,') ? 'data:image/png;base64,' :
    image.startsWith('data:image/jpeg;base64,') ? 'data:image/jpeg;base64,' : null;
  if (!prefix) fail('INVALID_IMAGE');
  const size = image.length - prefix.length, pad = image.indexOf('=', prefix.length);
  if (size < 12 || size % 4 === 1 || (pad !== -1 &&
      (size % 4 !== 0 || image.length - pad > 2 || !/^={1,2}$/.test(image.slice(pad))))) fail('INVALID_IMAGE');
  const head = image.slice(prefix.length, prefix.length + 12);
  if (prefix.includes('/png;') ? !head.startsWith('iVBORw0KGgo') : !head.startsWith('/9j/')) fail('INVALID_IMAGE');
  const end = pad === -1 ? image.length : pad;
  for (let pos = prefix.length; pos < end; pos += 8192) {
    if (/[^A-Za-z0-9+/]/.test(image.slice(pos, Math.min(end, pos + 8192)))) fail('INVALID_IMAGE');
  }
  return page;
}

export async function createImportStage({scope, guard} = {}) {
  const match = typeof scope === 'string' && /^bilge-defter-account-([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i.exec(scope);
  if (!match || !scope.startsWith('bilge-defter-account-') || typeof guard !== 'function') fail('INVALID_ARGUMENT');
  if (typeof globalThis.navigator?.locks?.request !== 'function') fail('LOCKS_UNAVAILABLE');
  if (!globalThis.indexedDB || !globalThis.IDBKeyRange || !globalThis.crypto?.getRandomValues) fail('STORAGE_UNAVAILABLE');
  const requestLock = navigator.locks.request.bind(navigator.locks);
  const name = 'bilge-defter-pptx-stage-v1-' + match[1];
  let importId, token;
  try { importId = randomId(); token = randomId(); }
  catch (cause) { throw error('STORAGE_UNAVAILABLE', cause); }
  const transactions = new Set(), leases = new Set();
  let db, ownLease, state = 'opening', stopped, busy = false, count = 0, chars = 0, discarding;
  const checkGuard = () => {
    try { if (guard() !== true) fail('STALE_SCOPE'); }
    catch (cause) { throw cause?.code === 'STALE_SCOPE' ? cause : error('STALE_SCOPE', cause); }
  };
  const check = (lease, external = true) => {
    if (state === 'closed') throw stopped || error('STAGE_CLOSED');
    lease?.assert();
    if (external) { if (state === 'discarding') fail('STAGE_CANCELED'); checkGuard(); }
    if (state === 'closed') throw stopped || error('STAGE_CLOSED');
    lease?.assert();
  };
  function shutdown(reason = error('STAGE_CLOSED')) {
    if (state === 'closed') return;
    stopped = reason; state = 'closed';
    for (const tx of transactions) tx.stop(reason);
    for (const lease of leases) lease.stop(reason);
    db?.close();
  }
  function acquire(id) {
    check();
    const key = JSON.stringify(['bilge-defter-pptx-stage', name, id]);
    let phase = 'pending', resolveReady, rejectReady, releaseHold, resolveReleased;
    const released = new Promise(resolve => { resolveReleased = resolve; });
    const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
    const lease = {
      assert() { if (phase !== 'held') fail('LOCK_LOST'); },
      release() {
        if (phase === 'held') { phase = 'released'; releaseHold(); releaseHold = null; }
        return released;
      },
      stop(reason) {
        if (!['pending', 'held', 'released'].includes(phase)) return;
        phase = 'lost'; rejectReady(reason); releaseHold?.(); releaseHold = null;
        resolveReleased(); leases.delete(lease);
      },
    };
    leases.add(lease);
    let request;
    try {
      request = requestLock(key, {mode:'exclusive', ifAvailable:true}, lock => {
        if (phase !== 'pending' || state === 'closed') return;
        try { check(); } catch (cause) { lease.stop(cause); return; }
        if (!lock) { phase = 'busy'; rejectReady(error('IMPORT_BUSY')); resolveReleased(); return; }
        if (lock.name !== key || lock.mode !== 'exclusive') {
          lease.stop(error('LOCK_REQUEST_FAILED')); return;
        }
        phase = 'held';
        const hold = new Promise(resolve => { releaseHold = resolve; });
        resolveReady(lease); return hold;
      });
    } catch (cause) { lease.stop(error('LOCK_REQUEST_FAILED', cause)); return ready; }
    Promise.resolve(request).then(() => {
      if (phase === 'pending' || phase === 'held') {
        const reason = error(phase === 'pending' ? 'LOCK_REQUEST_FAILED' : 'LOCK_LOST');
        lease.stop(reason); shutdown(reason);
      }
      leases.delete(lease); resolveReleased();
    }, cause => {
      if (phase === 'pending' || phase === 'held') {
        const reason = error(phase === 'pending' ? 'LOCK_REQUEST_FAILED' : 'LOCK_LOST', cause);
        lease.stop(reason); shutdown(reason);
      }
      leases.delete(lease); resolveReleased();
    });
    return ready;
  }
  // Dependent requests remain in native callbacks, not across unrelated awaits.
  function transaction(stores, mode, lease, external, work) {
    check(lease, external);
    return new Promise((resolve, reject) => {
      let tx, result, failure, settled = false;
      try { tx = db.transaction(stores, mode); } catch (cause) { reject(mapped(cause)); return; }
      const finish = (ok, value) => {
        if (settled) return;
        settled = true; result = undefined; transactions.delete(entry);
        tx.oncomplete = tx.onabort = tx.onerror = null;
        if (ok) resolve(value); else reject(mapped(value));
      };
      const entry = {stop(reason) {
        try { tx.abort(); } catch { /* no assertion that a completed write rolled back */ }
        finish(false, reason); // WebKit may omit abort after a connection closes.
      }};
      transactions.add(entry);
      const abort = cause => { failure = cause; try { tx.abort(); } catch { finish(false, cause); } };
      const context = {
        store: key => tx.objectStore(key), result: value => { result = value; },
        on(request, callback) {
          request.onsuccess = () => {
            if (settled) return;
            try { check(lease, external); callback(request.result); } catch (cause) { abort(cause); }
          };
          request.onerror = () => { if (!settled) failure ||= request.error; };
        },
      };
      tx.oncomplete = () => {
        try { check(lease, external); finish(true, result); } catch (cause) { finish(false, cause); }
      };
      tx.onabort = () => finish(false, failure || tx.error || error('TX_ABORTED'));
      tx.onerror = () => { failure ||= tx.error; };
      try { check(lease, external); work(context); } catch (cause) { abort(cause); }
    });
  }
  function owned(row, id = importId, expectedToken = token) {
    if (!row || row.scope !== scope || row.importId !== id || row.token !== expectedToken ||
        row.protocol !== PROTOCOL || row.status !== 'staging' ||
        !Number.isSafeInteger(row.count) || row.count < 0 || row.count > MAX_PAGES ||
        !Number.isSafeInteger(row.chars) || row.chars < 0 || row.chars > TOTAL_CHARS) fail('STAGE_OWNERSHIP');
    return row;
  }
  function deleteRows(context, id, expectedToken, done) {
    context.on(context.store('pages').index('byImport').openCursor(IDBKeyRange.only(id)), cursor => {
      if (!cursor) { done(); return; }
      if (cursor.value.scope !== scope || cursor.value.importId !== id || cursor.value.token !== expectedToken)
        fail('STAGE_OWNERSHIP');
      context.on(cursor.delete(), () => cursor.continue());
    });
  }
  async function cleanup() {
    const cutoff = Date.now() - TTL;
    const candidates = await transaction(['sessions'], 'readonly', null, true, context => {
      const selected = []; let scanned = 0;
      context.on(context.store('sessions').openCursor(), cursor => {
        if (!cursor || scanned++ >= 256 || selected.length >= 64) { context.result(selected); return; }
        const row = cursor.value;
        if (row.scope === scope && row.protocol === PROTOCOL && row.status === 'staging' &&
            isId(row.importId) && isId(row.token) && Number.isSafeInteger(row.updatedAt) &&
            row.updatedAt >= 0 && row.updatedAt <= cutoff) {
          selected.push({importId:row.importId, token:row.token, updatedAt:row.updatedAt});
        }
        cursor.continue();
      });
    });
    for (const candidate of candidates) {
      let lease;
      try { lease = await acquire(candidate.importId); }
      catch (cause) { if (cause.code === 'IMPORT_BUSY') continue; throw cause; }
      try {
        await transaction(['sessions','pages'], 'readwrite', lease, true, context => {
          const sessions = context.store('sessions');
          context.on(sessions.get(candidate.importId), row => {
            if (!row || row.scope !== scope || row.protocol !== PROTOCOL || row.status !== 'staging' ||
                row.importId !== candidate.importId || row.token !== candidate.token ||
                row.updatedAt !== candidate.updatedAt || row.updatedAt > cutoff) return;
            owned(row, candidate.importId, candidate.token);
            deleteRows(context, candidate.importId, candidate.token, () => sessions.delete(candidate.importId));
          });
        });
      } finally { await lease.release(); }
    }
    check();
  }
  try {
    checkGuard();
    db = await new Promise((resolve, reject) => {
      let rejected = false, request;
      try { request = indexedDB.open(name, 1); } catch (cause) { reject(mapped(cause)); return; }
      const stop = cause => { rejected = true; reject(mapped(cause)); };
      request.onupgradeneeded = () => {
        try {
          if (rejected) fail('STAGE_CLOSED');
          check(); const opened = request.result;
          opened.createObjectStore('sessions', {keyPath:'importId'});
          opened.createObjectStore('pages', {keyPath:['importId','number']}).createIndex('byImport','importId');
        } catch (cause) { request.transaction.abort(); stop(cause); }
      };
      request.onerror = () => stop(request.error);
      request.onblocked = () => stop(error('OPEN_BLOCKED'));
      request.onsuccess = () => {
        if (rejected) { request.result.close(); return; }
        try { check(); resolve(request.result); }
        catch (cause) { request.result.close(); stop(cause); }
      };
    });
    db.onversionchange = () => shutdown(error('STAGE_CLOSED'));
    db.onclose = () => shutdown(error('STAGE_CLOSED'));
    check(); await cleanup(); check();
    ownLease = await acquire(importId); check(ownLease);
    await transaction(['sessions'], 'readwrite', ownLease, true, context => {
      const now = Date.now();
      context.store('sessions').add({scope, importId, token, protocol:PROTOCOL,
        status:'staging', createdAt:now, updatedAt:now, count:0, chars:0});
    });
    check(ownLease); state = 'active';
  } catch (cause) { shutdown(mapped(cause)); throw mapped(cause); }
  function active() { check(ownLease); if (busy) fail('OP_IN_PROGRESS'); }
  async function add(input) {
    active(); busy = true; let page;
    try {
      page = pageValue(input); input = null;
      const next = await transaction(['sessions','pages'], 'readwrite', ownLease, true, context => {
        const sessions = context.store('sessions');
        context.on(sessions.get(importId), row => {
          owned(row);
          if (page.number !== row.count + 1) fail('PAGE_SEQUENCE');
          if (row.chars + page.image.length > TOTAL_CHARS) fail('TOTAL_TOO_LARGE');
          context.store('pages').add({...page, scope, importId, token});
          row.count++; row.chars += page.image.length; row.updatedAt = Date.now();
          sessions.put(row); context.result({count:row.count, chars:row.chars});
        });
      });
      check(ownLease); count = next.count; chars = next.chars;
      return Object.freeze({count, chars});
    } finally { input = page = null; busy = false; }
  }
  async function read(number) {
    active(); busy = true;
    try {
      if (!Number.isSafeInteger(number) || number < 1 || number > MAX_PAGES) fail('INVALID_ARGUMENT');
      const page = await transaction(['sessions','pages'], 'readonly', ownLease, true, context => {
        context.on(context.store('sessions').get(importId), row => {
          owned(row); if (number > row.count) fail('MISSING_PAGE');
          context.on(context.store('pages').get([importId, number]), stored => {
            if (!stored || stored.scope !== scope || stored.importId !== importId ||
                stored.token !== token || stored.number !== number) fail('MISSING_PAGE');
            context.result(pageValue({number:stored.number, width:stored.width, height:stored.height, image:stored.image}));
          });
        });
      });
      check(ownLease); return page;
    } finally { busy = false; }
  }
  function discard() {
    if (discarding) return discarding;
    if (state === 'closed') return Promise.resolve();
    state = 'discarding';
    for (const tx of transactions) tx.stop(error('STAGE_CANCELED'));
    // Do not consult the account/notebook guard: it may change after successful
    // app commit or cancellation. Our own lease+token still authorize cleanup.
    discarding = (async () => {
      try {
        await transaction(['sessions','pages'], 'readwrite', ownLease, false, context => {
          context.on(context.store('sessions').get(importId), row => {
            if (!row) return;
            owned(row); deleteRows(context, importId, token, () => context.store('sessions').delete(importId));
          });
        });
        count = chars = 0;
      } finally {
        const released = ownLease.release(); shutdown(); await released;
      }
    })();
    return discarding;
  }
  return Object.freeze({add, read, discard, close:() => shutdown(), get count() { return count; }, get chars() { return chars; }});
}
