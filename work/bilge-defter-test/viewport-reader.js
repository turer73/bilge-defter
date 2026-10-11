/* Viewport-owned raster cache. No storage schema, import limit or image-quality
 * change. The notebook still owns hydrated source strings; this only controls
 * decoded background resources. All visible pages are required, irrespective of
 * how many short slides fit. Only up to two optional neighbors share the old
 * 12,000,000-pixel prefetch policy. There is no fixed three-page/24 MiB promise.
 * Account/state ownership is supplied by the adapter, not by this generic cache.
 *
 * One read/decode runs globally per reader, including stale work after clear(),
 * suspend(), open() and close(). Never replace this reader while an old job is
 * pending. No timer pretends that an unresolved native decoder has stopped.
 * Accounting is width*height*4 for owned resources plus one reserved pending
 * job. The viewport target may shrink below a stale reservation; that transition
 * is reported separately and waits for completion before another decode starts.
 * This is NOT overall browser/RSS/GPU memory: strings, Blob copies, decoder
 * scratch, ink, and drawing surfaces also consume memory. close() releases an
 * ImageBitmap graphics resource, not necessarily immediate process memory.
 */
(function () {
  'use strict';
  const PAGE_CHARS = 6 * 1024 * 1024;
  class ReaderError extends Error {
    constructor(code, cause) { super(code); this.name = 'ViewportReaderError'; this.code = code;
      if (cause !== undefined) this.cause = cause; }
  }
  const fail = code => { throw new ReaderError(code); };
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  function integer(value, min, max, code = 'INVALID_ARGUMENT') {
    if (!Number.isSafeInteger(value) || value < min || value > max) fail(code);
    return value;
  }
  function key(value) {
    // Existing notebook validation accepts arbitrary string page IDs. These are
    // local Map keys, not storage paths or authorization credentials.
    if (typeof value !== 'string') fail('INVALID_ARGUMENT');
    return value;
  }
  function record(input, names, code = 'INVALID_ARGUMENT') {
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail(code);
    const proto = Object.getPrototypeOf(input);
    if (proto !== null && proto !== Object.prototype) fail(code);
    const keys = Reflect.ownKeys(input);
    if (keys.length !== names.length || keys.some(name => !names.includes(name))) fail(code);
    const result = Object.create(null);
    for (const name of names) {
      const descriptor = Object.getOwnPropertyDescriptor(input, name);
      if (!descriptor || !own(descriptor, 'value')) fail(code);
      result[name] = descriptor.value;
    }
    return result;
  }
  function requests(input, maximum = Number.MAX_SAFE_INTEGER) {
    if (!Array.isArray(input) || input.length > maximum ||
        Reflect.ownKeys(input).length !== input.length + 1) fail('INVALID_ARGUMENT');
    const result = [], keys = new Set();
    for (let i = 0; i < input.length; i++) {
      const descriptor = Object.getOwnPropertyDescriptor(input, String(i));
      if (!descriptor || !own(descriptor, 'value')) fail('INVALID_ARGUMENT');
      const value = record(descriptor.value, ['key', 'version', 'width', 'height']);
      key(value.key); integer(value.version, 1, Number.MAX_SAFE_INTEGER);
      integer(value.width, 1000, 1000); integer(value.height, 100, 3000);
      if (keys.has(value.key)) fail('INVALID_ARGUMENT');
      keys.add(value.key);
      result.push(Object.freeze({ key: value.key, version: value.version,
        width: value.width, height: value.height, bytes: value.width * value.height * 4 }));
    }
    return result;
  }
  function envelope(image) {
    if (typeof image !== 'string' || image.length > PAGE_CHARS) fail('INVALID_IMAGE');
    const png = 'data:image/png;base64,', jpeg = 'data:image/jpeg;base64,';
    const prefix = image.startsWith(png) ? png : image.startsWith(jpeg) ? jpeg : null;
    if (!prefix || image.length - prefix.length < 12) fail('INVALID_IMAGE');
    const pad = image.indexOf('=', prefix.length), end = pad < 0 ? image.length : pad;
    // atob (and existing notebook images) permits omitted padding. A residual
    // group of one character is invalid; explicit padding must fill a quartet.
    const length = image.length - prefix.length;
    if (length % 4 === 1 || (pad >= 0 && length % 4 !== 0)) fail('INVALID_IMAGE');
    if (pad >= 0 && (image.length - pad > 2 || !/^={1,2}$/.test(image.slice(pad)))) fail('INVALID_IMAGE');
    for (let i = prefix.length; i < end; i += 8192) {
      if (/[^A-Za-z0-9+/]/.test(image.slice(i, Math.min(i + 8192, end)))) fail('INVALID_IMAGE');
    }
    const head = image.slice(prefix.length, prefix.length + 12);
    if (prefix === png ? !head.startsWith('iVBORw0KGgo') : !head.startsWith('/9j/')) fail('INVALID_IMAGE');
    return { offset: prefix.length, type: prefix === png ? 'image/png' : 'image/jpeg' };
  }
  function rowValue(input, meta) {
    if (input == null) fail('MISSING_ASSET');
    const row = record(input, ['image', 'width', 'height'], 'INVALID_IMAGE');
    if (row.width !== meta.width || row.height !== meta.height) fail('IMAGE_DIMENSIONS');
    envelope(row.image);
    return Object.freeze({ image: row.image, width: row.width, height: row.height });
  }
  function header(bytes, type) {
    if (type === 'image/png') {
      if (bytes.length < 33 || bytes[0] !== 137 || bytes[1] !== 80 || bytes[2] !== 78 ||
          bytes[3] !== 71 || bytes[4] !== 13 || bytes[5] !== 10 || bytes[6] !== 26 || bytes[7] !== 10) fail('INVALID_IMAGE');
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      if (view.getUint32(8) !== 13 || view.getUint32(12) !== 0x49484452) fail('INVALID_IMAGE');
      return { width: view.getUint32(16), height: view.getUint32(20) };
    }
    if (bytes[0] !== 255 || bytes[1] !== 216) fail('INVALID_IMAGE');
    let i = 2, size = null;
    while (i < bytes.length) {
      if (bytes[i++] !== 255) fail('INVALID_IMAGE');
      while (bytes[i] === 255) i++;
      if (i >= bytes.length) fail('INVALID_IMAGE');
      const marker = bytes[i++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 1 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (!marker || i + 2 > bytes.length) fail('INVALID_IMAGE');
      const length = bytes[i] * 256 + bytes[i + 1];
      if (length < 2 || i + length > bytes.length) fail('INVALID_IMAGE');
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        if (length < 8) fail('INVALID_IMAGE');
        const next = { height: bytes[i + 3] * 256 + bytes[i + 4], width: bytes[i + 5] * 256 + bytes[i + 6] };
        if (size && (size.width !== next.width || size.height !== next.height)) fail('INVALID_IMAGE');
        size = next;
      }
      i += length;
    }
    if (!size) fail('INVALID_IMAGE');
    return size;
  }
  async function defaultDecode(input, meta) {
    integer(meta?.width, 1000, 1000, 'IMAGE_DIMENSIONS');
    integer(meta?.height, 100, 3000, 'IMAGE_DIMENSIONS');
    const row = rowValue(input, meta), format = envelope(row.image);
    let binary;
    try { binary = atob(row.image.slice(format.offset)); }
    catch (error) { throw new ReaderError('INVALID_IMAGE', error); }
    let bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    binary = null;
    const size = header(bytes, format.type);
    if (size.width !== meta.width || size.height !== meta.height) fail('IMAGE_DIMENSIONS');
    // Header checks reject oversized declarations before native decode, but do
    // not bound native codec scratch or prove complete image-file safety.
    let image;
    if (typeof globalThis.createImageBitmap === 'function') {
      let blob = new Blob([bytes], { type: format.type }); bytes = null;
      try { image = await createImageBitmap(blob); }
      catch (error) { throw new ReaderError('DECODE_FAILED', error); }
      finally { blob = null; }
    } else {
      // Compatibility path stays under the same one-job scheduler. No quality
      // conversion and no timeout-based release of a potentially live decoder.
      bytes = null;
      image = new Image();
      Object.defineProperty(image, 'close', { value() { this.onload = this.onerror = null; this.src = ''; } });
      try {
        await new Promise((resolve, reject) => {
          image.onload = () => resolve(); image.onerror = () => reject(new ReaderError('DECODE_FAILED'));
          image.src = row.image;
        });
      } catch (error) { image.close(); throw error; }
      finally { image.onload = image.onerror = null; }
    }
    if (image.width !== meta.width || image.height !== meta.height) { image.close(); fail('IMAGE_DIMENSIONS'); }
    return image;
  }

  function create({ readPage, decode = defaultDecode, onChange, prefetchPixels = 12000000 } = {}) {
    if (typeof readPage !== 'function' || typeof decode !== 'function' ||
        (onChange !== undefined && typeof onChange !== 'function')) fail('INVALID_ARGUMENT');
    integer(prefetchPixels, 0, 12000000);
    let scope = null, epoch = 0, closed = false, visible = [], wanted = [], targetBytes = 0;
    let pending = null, running = false, pumpQueued = false, notifyQueued = false, notifying = false, drawDepth = 0;
    let onChangeErrors = 0, disposalErrors = 0, fatalError = null, idlePromise = null, resolveIdle = null;
    const cache = new Map(), retired = new Set(), errors = new Map(), seen = new WeakSet();
    const assertOpen = () => { if (closed) fail('READER_CLOSED'); };
    const current = job => !closed && scope !== null && epoch === job.epoch;
    const desired = meta => wanted.some(value => value.key === meta.key && value.version === meta.version);
    const needed = job => current(job) && desired(job.meta);
    const ready = meta => cache.get(meta.key)?.version === meta.version;
    function totals() {
      let bytes = 0; for (const entry of cache.values()) bytes += entry.bytes;
      for (const entry of retired) bytes += entry.bytes;
      return { bytes, count: cache.size + retired.size };
    }
    function snapshot() {
      const used = totals(), reservedBytes = pending?.meta.bytes || 0, reservedCount = pending ? 1 : 0;
      const transitionBytes = (pending && !needed(pending) ? reservedBytes : 0) +
        Array.from(retired).reduce((sum, entry) => sum + entry.bytes, 0);
      const transitionCount = (pending && !needed(pending) ? 1 : 0) + retired.size;
      return { scope, epoch, closed, visible: visible.map(value => value.key), wanted: wanted.map(value => value.key),
        planned: wanted.map(value => value.key), resident: Array.from(cache.values(), entry => ({ key: entry.key,
          version: entry.version, width: entry.width, height: entry.height, bytes: entry.bytes })),
        pending: pending ? { key: pending.meta.key, version: pending.meta.version, epoch: pending.epoch,
          bytes: reservedBytes, stale: !needed(pending), phase: pending.phase } : null,
        errors: Array.from(errors, ([key, value]) => ({ key, version: value.version, code: value.code })),
        residentBytes: used.bytes, reservedBytes, totalBytes: used.bytes + reservedBytes,
        residentCount: used.count, reservedCount, totalCount: used.count + reservedCount, retiredCount: retired.size,
        targetBytes, targetCount: wanted.length, transitionBytes, transitionCount,
        maxBytes: targetBytes + transitionBytes, maxPages: wanted.length + transitionCount,
        onChangeErrors, disposalErrors, fatalError };
    }
    function notify() {
      if (!onChange || notifyQueued || notifying) return;
      notifyQueued = true;
      queueMicrotask(() => {
        notifyQueued = false; notifying = true;
        try {
          const result = onChange(snapshot());
          if (result && (typeof result === 'object' || typeof result === 'function')) Promise.resolve(result).catch(() => {
            onChangeErrors = Math.min(Number.MAX_SAFE_INTEGER, onChangeErrors + 1);
          });
        } catch { onChangeErrors = Math.min(Number.MAX_SAFE_INTEGER, onChangeErrors + 1); }
        finally { notifying = false; }
      });
    }
    function dispose(entry) {
      retired.add(entry);
      if (drawDepth || entry.failedClose || entry.closing) return;
      entry.closing = true;
      try {
        if (typeof entry.close !== 'function') fail('INVALID_BITMAP');
        entry.close.call(entry.bitmap); retired.delete(entry); entry.bitmap = null;
      } catch { entry.failedClose = true; disposalErrors++; fatalError = 'BITMAP_CLOSE_FAILED'; }
      finally { entry.closing = false; }
    }
    function clearCache() {
      const entries = [...cache.values()]; for (const entry of entries) retired.add(entry);
      cache.clear(); for (const entry of entries) dispose(entry);
    }
    function candidate() {
      if (closed || scope === null || fatalError) return null;
      return wanted.find(meta => !ready(meta) && errors.get(meta.key)?.version !== meta.version) || null;
    }
    function settleIdle() {
      if (running || pending || pumpQueued || candidate()) return;
      if (resolveIdle) { const resolve = resolveIdle; resolveIdle = null; idlePromise = null; resolve(snapshot()); }
    }
    function kick() {
      if (pumpQueued) return;
      pumpQueued = true;
      queueMicrotask(() => {
        pumpQueued = false;
        if (running || pending || drawDepth) { settleIdle(); return; }
        const meta = candidate(); if (!meta) { settleIdle(); return; }
        const used = totals();
        if (used.bytes + meta.bytes > targetBytes || used.count + 1 > wanted.length) { settleIdle(); return; }
        const job = { epoch, scope, meta, phase: 'read' };
        pending = job; running = true; notify();
        run(job).catch(() => { fatalError = 'READER_INTERNAL'; notify(); settleIdle(); });
      });
    }
    async function run(job) {
      let row = null, bitmap = null, entry = null, phase = 'read';
      try {
        row = await readPage(job.meta, job.scope);
        if (!needed(job)) return;
        row = rowValue(row, job.meta); if (!needed(job)) return;
        job.phase = 'decode'; phase = 'decode'; notify();
        bitmap = await decode(row, job.meta); row = null;
        if (!bitmap || (typeof bitmap !== 'object' && typeof bitmap !== 'function')) fail('INVALID_BITMAP');
        if (seen.has(bitmap)) { bitmap = null; fail('DECODER_OWNERSHIP'); }
        seen.add(bitmap);
        entry = { ...job.meta, bitmap, close: null, failedClose: false };
        entry.close = bitmap.close;
        if (typeof entry.close !== 'function') fail('INVALID_BITMAP');
        if (bitmap.width !== job.meta.width || bitmap.height !== job.meta.height) fail('IMAGE_DIMENSIONS');
        if (pending === job) pending = null;
        if (needed(job) && !fatalError) { cache.set(entry.key, entry); entry = null; }
      } catch (error) {
        if (current(job) && desired(job.meta)) {
          const allowed = ['MISSING_ASSET', 'INVALID_IMAGE', 'IMAGE_DIMENSIONS', 'INVALID_BITMAP', 'DECODER_OWNERSHIP', 'DECODE_FAILED'];
          errors.set(job.meta.key, { version: job.meta.version,
            code: allowed.includes(error?.code) ? error.code : phase === 'read' ? 'READ_FAILED' : 'DECODE_FAILED' });
        }
      } finally {
        row = null; bitmap = null; if (pending === job) pending = null;
        if (entry) dispose(entry);
        running = false; notify(); kick();
      }
    }
    function changeScope(next) {
      epoch++; scope = next; visible = []; wanted = []; targetBytes = 0; errors.clear();
      clearCache(); notify(); kick(); return snapshot();
    }
    function open(next) { assertOpen(); key(next); return changeScope(next); }
    function clear() { assertOpen(); return changeScope(null); }
    function setViewport(input, neighbors = []) {
      assertOpen(); if (scope === null) fail('NO_DOCUMENT');
      const next = requests(input), optional = requests(neighbors, 2), selected = [...next];
      const keys = new Set(next.map(meta => meta.key));
      let bytes = next.reduce((sum, meta) => sum + meta.bytes, 0);
      for (const meta of optional) {
        if (!keys.has(meta.key) && bytes / 4 + meta.bytes / 4 <= prefetchPixels) {
          selected.push(meta); keys.add(meta.key); bytes += meta.bytes;
        }
      }
      if (!Number.isSafeInteger(bytes)) fail('INVALID_ARGUMENT');
      const changed = visible.length !== next.length || wanted.length !== selected.length ||
        visible.some((meta, i) => meta.key !== next[i]?.key || meta.version !== next[i]?.version) ||
        wanted.some((meta, i) => meta.key !== selected[i]?.key || meta.version !== selected[i]?.version);
      visible = next; wanted = selected; targetBytes = bytes;
      // A supplied resource.close can re-enter the reader. Move every old entry
      // into transition accounting before the first external callback executes.
      const retiring = [];
      for (const [key, entry] of cache) if (!desired(entry)) { cache.delete(key); retired.add(entry); retiring.push(entry); }
      for (const entry of retiring) dispose(entry);
      for (const [key, error] of errors) if (!wanted.some(meta => meta.key === key && meta.version === error.version)) errors.delete(key);
      if (changed) notify(); kick(); return snapshot();
    }
    function status(id, version) {
      if (closed || scope === null) return null;
      if (cache.get(id)?.version === version) return 'ready';
      if (errors.get(id)?.version === version || fatalError) return 'error';
      return wanted.some(meta => meta.key === id && meta.version === version) ? 'loading' : null;
    }
    function retry(id) {
      assertOpen(); key(id); if (!wanted.some(meta => meta.key === id)) fail('NOT_REQUESTED');
      if (errors.delete(id)) { notify(); kick(); } return snapshot();
    }
    function draw(id, version, context, ...rect) {
      if (closed || drawDepth || cache.get(id)?.version !== version) return false;
      const entry = cache.get(id), drawEpoch = epoch;
      if (![2, 4, 8].includes(rect.length) || rect.some(value => typeof value !== 'number' || !Number.isFinite(value))) fail('INVALID_ARGUMENT');
      drawDepth++;
      try {
        const drawImage = context?.drawImage;
        if (closed || epoch !== drawEpoch || cache.get(id) !== entry) return false;
        if (typeof drawImage !== 'function') fail('INVALID_ARGUMENT');
        drawImage.call(context, entry.bitmap, ...rect); return true;
      } catch (error) { if (error instanceof ReaderError) throw error; throw new ReaderError('DRAW_FAILED', error); }
      finally { drawDepth--; const retiring = retired.size > 0; for (const item of [...retired]) dispose(item);
        if (retiring) notify(); kick(); }
    }
    function whenIdle() {
      if (!running && !pending && !pumpQueued && !candidate()) return Promise.resolve(snapshot());
      if (!idlePromise) idlePromise = new Promise(resolve => { resolveIdle = resolve; });
      return idlePromise;
    }
    function close() {
      if (!closed) { closed = true; changeScope(null); }
      return snapshot();
    }
    return Object.freeze({ open, clear, suspend: clear, setViewport, status, retry, draw, snapshot, whenIdle, close });
  }
  window.BilgeViewportReader = Object.freeze({ create, defaultDecode });
})();
