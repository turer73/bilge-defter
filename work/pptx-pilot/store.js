import {LIMITS, failure, validateMeta, validateNotebook, normalizeStrokes, noteBytes, sanitizeName, copyBytes, sha256} from './model.js';

const PREFIX = 'bilge-defter-pptx-pilot-v1::';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const STORES = ['documents', 'assets', 'notes', 'control'];
function checked(condition, message) { if (!condition) throw failure('CORRUPT', message); }
function exact(value, fields, optional = []) {
  checked(value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every(key => fields.includes(key) || optional.includes(key))
    && fields.every(key => Object.hasOwn(value, key)), 'Saklanan kayıt şeması bozuk.');
}
function errorOf(error) {
  if (['INVALID', 'CORRUPT', 'CONFLICT', 'QUOTA', 'CLOSED'].includes(error?.code)) return error;
  return failure(error?.name === 'QuotaExceededError' ? 'QUOTA' : 'CLOSED',
    error?.name === 'QuotaExceededError' ? 'Cihaz depolama alanı yetersiz; mevcut kayıtlar korunuyor.' : 'PPTX deposu işlemi tamamlanamadı.');
}
function validId(id) { if (typeof id !== 'string' || !UUID.test(id)) throw failure('INVALID', 'Kayıt kimliği geçersiz.'); }
function documentMeta(doc) {
  exact(doc, ['id', 'name', 'revision', 'meta', 'updated', 'created', 'hash', 'byteLength'], ['notebook']);
  if (Object.hasOwn(doc, 'notebook')) {
    try { validateNotebook(doc.notebook); } catch { throw failure('CORRUPT', 'Sunumun defter bağı bozuk.'); }
  }
  checked(UUID.test(doc.id) && typeof doc.name === 'string' && typeof doc.hash === 'string' && /^[a-f0-9]{64}$/.test(doc.hash), 'Sunum üst bilgisi eksik veya bozuk.');
  let name;
  try { name = sanitizeName(doc.name); } catch { throw failure('CORRUPT', 'Saklanan dosya adı geçersiz.'); }
  checked(doc.name === name && Number.isSafeInteger(doc.byteLength)
    && doc.byteLength > 0 && doc.byteLength <= LIMITS.FILE_BYTES, 'Sunum boyut/ad bilgisi bozuk.');
  checked(Number.isSafeInteger(doc.revision) && doc.revision >= 1 && typeof doc.created === 'string'
    && typeof doc.updated === 'string' && Number.isFinite(Date.parse(doc.created)) && Number.isFinite(Date.parse(doc.updated)), 'Kayıt sürümü veya zamanı bozuk.');
  try { validateMeta(doc.meta); } catch { throw failure('CORRUPT', 'Sunum slayt bilgisi bozuk.'); }
  return doc;
}
function checkedNotes(doc, entry) {
  exact(entry, ['id', 'hash', 'revision', 'notes', 'noteBytes']);
  checked(entry && entry.id === doc.id && entry.hash === doc.hash && entry.revision === doc.revision, 'Not/sunum bağı veya sürümü uyuşmuyor.');
  let notes;
  try { notes = normalizeStrokes(entry.notes, doc.meta); } catch { throw failure('CORRUPT', 'Saklanan not biçimi bozuk.'); }
  checked(entry.noteBytes === noteBytes(notes), 'Saklanan not boyutu uyuşmuyor.');
  return notes;
}
function ledger(value) {
  exact(value, ['key', 'bytes', 'records']);
  checked(value?.key === 'usage' && Number.isSafeInteger(value.bytes) && value.bytes >= 0 && value.bytes <= LIMITS.TOTAL_BYTES
    && Number.isSafeInteger(value.records) && value.records >= 0 && value.records <= LIMITS.RECORDS, 'Kota kaydı bozuk.');
  return value;
}

export async function openStore(scope, options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw failure('INVALID', 'Depo seçenekleri geçersiz.');
  const {guard} = options;
  const account = typeof scope === 'string' && scope.startsWith('bilge-defter-account-') && UUID.test(scope.slice(21));
  const fixture = typeof scope === 'string' && /^local-fixture:[a-z0-9][a-z0-9_-]{0,63}$/.test(scope);
  if ((!account && !fixture) || (account && typeof guard !== 'function') || (guard !== undefined && typeof guard !== 'function')) {
    throw failure('INVALID', 'Doğrulanmış hesap kapsamı ve koruması veya yerel fixture kapsamı gerekli.');
  }
  const allowed = guard || (() => true), dbName = PREFIX + scope;
  let closed = false, db;
  const pending = new Map();
  function alive() {
    let valid = false;
    try { valid = allowed() === true; } catch {}
    if (closed || !valid) {
      if (!closed) close();
      throw failure('CLOSED', 'Hesap kapsamı veya PPTX deposu kapandı.');
    }
  }
  function close() {
    if (closed) return;
    closed = true;
    for (const [tx, state] of [...pending]) {
      state.reason = failure('CLOSED', 'PPTX deposu kapandı; işlem iptal edildi.');
      try { tx.abort(); }
      catch { state.reason = failure('CLOSED', 'PPTX deposu kapandı; son kayıt sonucu yeniden açılarak doğrulanmalı.'); }
      // WebKit may defer abort events after the connection is closed. The
      // caller's cancellation must settle without waiting on that acknowledgement.
      state.reject(state.reason); pending.delete(tx);
    }
    db?.close();
  }
  alive();
  db = await new Promise((resolve, reject) => {
    let settled = false;
    const request = indexedDB.open(dbName, 1);
    const rejectOnce = error => { if (!settled) { settled = true; reject(error); } };
    request.onblocked = () => { closed = true; rejectOnce(failure('CLOSED', 'PPTX deposunun açılması başka pencere tarafından engelleniyor. Diğer pilot penceresini kapatın.')); };
    request.onupgradeneeded = event => {
      try {
        alive();
        if (event.oldVersion !== 0) throw failure('CORRUPT', 'Bilinmeyen PPTX depo sürümü.');
        const opened = request.result;
        opened.createObjectStore('documents', {keyPath: 'id'});
        opened.createObjectStore('assets', {keyPath: 'id'});
        opened.createObjectStore('notes', {keyPath: 'id'});
        const control = opened.createObjectStore('control', {keyPath: 'key'});
        control.put({key: 'scope', value: scope}); control.put({key: 'usage', bytes: 0, records: 0});
      } catch (error) { rejectOnce(errorOf(error)); request.transaction.abort(); }
    };
    request.onerror = () => rejectOnce(errorOf(request.error));
    request.onsuccess = () => {
      if (settled) { request.result.close(); return; }
      try { alive(); checked(STORES.every(name => request.result.objectStoreNames.contains(name)) && request.result.objectStoreNames.length === STORES.length, 'PPTX depo şeması bozuk.'); }
      catch (error) { request.result.close(); rejectOnce(error); return; }
      settled = true; resolve(request.result);
    };
  });
  db.onversionchange = close;
  db.onclose = () => { closed = true; };

  function transaction(mode, stores, body) {
    return new Promise((resolve, reject) => {
      try { alive(); } catch (error) { reject(error); return; }
      let tx;
      try { tx = db.transaction(stores, mode); } catch (error) { reject(errorOf(error)); return; }
      const state = {reason: null, result: undefined, reject}; pending.set(tx, state);
      const abort = error => { state.reason ||= errorOf(error); try { tx.abort(); } catch {} };
      tx.onabort = () => { pending.delete(tx); reject(state.reason || errorOf(tx.error)); };
      tx.onerror = () => { state.reason ||= errorOf(tx.error); };
      tx.oncomplete = () => { pending.delete(tx); try { alive(); resolve(state.result); } catch (error) { reject(error); } };
      const request = (req, callback) => {
        req.onerror = () => { state.reason ||= errorOf(req.error); };
        req.onsuccess = () => { try { alive(); callback(req.result); } catch (error) { abort(error); } };
      };
      const collect = (requests, callback) => {
        const keys = Object.keys(requests), values = {}; let left = keys.length;
        for (const key of keys) request(requests[key], value => { values[key] = value; if (--left === 0) callback(values); });
      };
      const writes = requests => {
        let left = requests.length;
        for (const req of requests) request(req, () => { if (--left === 0) { alive(); if (typeof tx.commit === 'function') tx.commit(); } });
      };
      try { body({tx, store: name => tx.objectStore(name), collect, writes, result: value => { state.result = value; }}); }
      catch (error) { abort(error); }
    });
  }
  try {
    await transaction('readonly', ['control'], ({store, collect}) => collect({scope: store('control').get('scope'), usage: store('control').get('usage')}, data => {
      checked(data.scope?.value === scope, 'Depo hesap kapsamı uyuşmuyor.'); ledger(data.usage);
    }));
  } catch (error) { close(); throw error; }

  async function list() {
    return transaction('readonly', STORES, ({store, collect, result}) => collect({docs: store('documents').getAll(), notes: store('notes').getAll(), assets: store('assets').getAllKeys(), usage: store('control').get('usage')}, data => {
      const usage = ledger(data.usage);
      checked(data.docs.length === usage.records && data.notes.length === usage.records && data.assets.length === usage.records, 'Eksik veya sahipsiz sunum/not kaydı.');
      const notes = new Map(data.notes.map(item => [item.id, item])), assets = new Set(data.assets); let bytes = 0;
      const items = data.docs.map(doc => {
        documentMeta(doc); checked(assets.has(doc.id), 'Özgün sunum eksik.'); checkedNotes(doc, notes.get(doc.id));
        bytes += doc.byteLength + notes.get(doc.id).noteBytes;
        return {...doc};
      });
      checked(bytes === usage.bytes, 'Toplam kota kaydı uyuşmuyor.');
      result(items.sort((a, b) => b.updated.localeCompare(a.updated)));
    }));
  }
  async function create(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw failure('INVALID', 'Yeni sunum kaydı geçersiz.');
    const {bytes: inputBytes, name: inputName, meta: inputMeta, notes: inputNotes = []} = input;
    alive(); const bytes = copyBytes(inputBytes), name = sanitizeName(inputName), meta = validateMeta(inputMeta), notes = normalizeStrokes(inputNotes, meta);
    const notebook = input.notebook === undefined ? undefined : validateNotebook(input.notebook);
    const hash = await sha256(bytes); alive();
    const id = crypto.randomUUID(), now = new Date().toISOString(), size = noteBytes(notes);
    const doc = {id, name, revision: 1, meta, updated: now, created: now, hash, byteLength: bytes.byteLength,
      ...(notebook ? {notebook} : {})};
    return transaction('readwrite', STORES, ({store, collect, writes, result}) => collect({usage: store('control').get('usage'), documents: store('documents').count(), assets: store('assets').count(), notes: store('notes').count()}, data => {
      const usage = ledger(data.usage);
      checked(data.documents === usage.records && data.assets === usage.records && data.notes === usage.records, 'Eksik veya sahipsiz kayıt; yeni sunum eklenmedi.');
      if (usage.records >= LIMITS.RECORDS || usage.bytes + bytes.byteLength + size > LIMITS.TOTAL_BYTES) throw failure('QUOTA', 'PPTX pilot kayıt veya toplam 96 MiB sınırı aşıldı.');
      result({...doc, bytes, notes});
      writes([store('documents').add(doc), store('assets').add({id, hash, bytes}),
        store('notes').add({id, hash, revision: 1, notes, noteBytes: size}),
        store('control').put({key: 'usage', records: usage.records + 1, bytes: usage.bytes + bytes.byteLength + size})]);
    }));
  }
  async function get(id) {
    validId(id);
    const record = await transaction('readonly', ['documents', 'assets', 'notes'], ({store, collect, result}) => collect({doc: store('documents').get(id), asset: store('assets').get(id), notes: store('notes').get(id)}, data => {
      const doc = documentMeta(data.doc), notes = checkedNotes(doc, data.notes);
      exact(data.asset, ['id', 'hash', 'bytes']);
      checked(data.asset?.id === id && data.asset.hash === doc.hash && data.asset.bytes instanceof ArrayBuffer
        && data.asset.bytes.byteLength === doc.byteLength, 'Özgün sunum eksik veya bozuk.');
      result({...doc, notes, bytes: data.asset.bytes});
    }));
    const hash = await sha256(record.bytes); alive();
    checked(hash === record.hash, 'Özgün sunum özeti uyuşmuyor.'); return record;
  }
  async function saveNotes(id, expectedRevision, inputNotes) {
    validId(id); alive();
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) throw failure('INVALID', 'Beklenen kayıt sürümü geçersiz.');
    // Clone before entering IDB so the caller cannot change a pending save.
    let snapshot;
    try { snapshot = structuredClone(inputNotes); } catch { throw failure('INVALID', 'Notlar kopyalanamadı.'); }
    return transaction('readwrite', STORES, ({store, collect, writes, result}) => collect({doc: store('documents').get(id), key: store('assets').getKey(id), old: store('notes').get(id), usage: store('control').get('usage')}, data => {
      const doc = documentMeta(data.doc), usage = ledger(data.usage); checkedNotes(doc, data.old);
      checked(usage.records >= 1, 'Kota kayıt sayısı tutarsız.');
      checked(data.key === id, 'Özgün sunum eksik; notlar yazılmadı.');
      if (doc.revision !== expectedRevision) throw failure('CONFLICT', 'Sunum notları başka pencerede değişmiş. Yeniden açın; bu notlar üzerine yazılmadı.');
      if (doc.revision >= Number.MAX_SAFE_INTEGER) throw failure('CORRUPT', 'Kayıt sürümü sınırı aşıldı.');
      const notes = normalizeStrokes(snapshot, doc.meta), size = noteBytes(notes), total = usage.bytes - data.old.noteBytes + size;
      checked(total >= doc.byteLength + size, 'Kota kaydı tutarsız.');
      if (total > LIMITS.TOTAL_BYTES) throw failure('QUOTA', 'PPTX ve notların toplam 96 MiB sınırı aşıldı.');
      const updated = {...doc, revision: doc.revision + 1, updated: new Date().toISOString()};
      // Intentionally omit bytes: saving pen notes NEVER gets or puts assets.
      result({...updated, notes});
      writes([store('documents').put(updated), store('notes').put({id, hash: doc.hash, revision: updated.revision, notes, noteBytes: size}),
        store('control').put({...usage, bytes: total})]);
    }));
  }
  return Object.freeze({dbName, list, create, get, saveNotes, close});
}
