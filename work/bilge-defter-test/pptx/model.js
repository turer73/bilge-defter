// Separate PPTX pilot format. No notebook schema, database, or migration imports.
const MiB = 1024 * 1024;
export const LIMITS = Object.freeze({
  FILE_BYTES: 20 * MiB, SLIDES: 100, TOTAL_BYTES: 96 * MiB, RECORDS: 20,
  NOTES_BYTES: 8 * MiB, HEADER_BYTES: 8 * MiB + 65536,
  STROKES: 20000, POINTS: 500000, POINTS_PER_STROKE: 5000,
  LOGICAL_WIDTH: 1000, MAX_NAME: 200,
});
const encoder = new TextEncoder();
const magic = encoder.encode('BDPPTX01');
export function failure(code, message) { return Object.assign(new Error(message), {code}); }
function requireValue(condition, message) { if (!condition) throw failure('INVALID', message); }
function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}
function keys(value, required, optional = []) {
  requireValue(plain(value), 'Nesne biçimi geçersiz.');
  const actual = Object.keys(value);
  requireValue(required.every(key => Object.hasOwn(value, key))
    && actual.every(key => required.includes(key) || optional.includes(key)), 'Beklenmeyen veya eksik alan.');
}
const finite = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
function array(value, min, max, message) {
  requireValue(Array.isArray(value) && value.length >= min && value.length <= max, message);
  requireValue(Object.keys(value).length === value.length, 'Seyrek veya ek alanlı dizi kabul edilmez.');
  for (let i = 0; i < value.length; i++) requireValue(Object.hasOwn(value, i), 'Eksik dizi öğesi.');
}
export function validateMeta(meta) {
  keys(meta, ['slideCount', 'width', 'height']);
  requireValue(Number.isSafeInteger(meta.slideCount) && meta.slideCount >= 1 && meta.slideCount <= LIMITS.SLIDES, 'Slayt sınırı geçersiz.');
  requireValue(finite(meta.width, 1, 200000) && finite(meta.height, 1, 200000)
    && meta.height / meta.width >= 0.1 && meta.height / meta.width <= 10, 'Slayt boyutları geçersiz.');
  return {slideCount: meta.slideCount, width: meta.width, height: meta.height};
}
export function sanitizeName(name) {
  requireValue(typeof name === 'string', 'Dosya adı geçersiz.');
  const value = name.split(/[\\/]/).at(-1).normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, LIMITS.MAX_NAME);
  requireValue(value.length > 0 && value !== '.' && value !== '..', 'Dosya adı boş olamaz.');
  return value;
}
export function validateNotebook(notebook) {
  keys(notebook, ['id', 'title']);
  requireValue(typeof notebook.id === 'string' && notebook.id.length > 0 && notebook.id.length <= 200
    && !/[\u0000-\u001f\u007f]/.test(notebook.id), 'Defter kimliği geçersiz.');
  requireValue(typeof notebook.title === 'string' && notebook.title.trim().length > 0
    && notebook.title.length <= 200 && !/[\u0000-\u001f\u007f]/.test(notebook.title), 'Defter başlığı geçersiz.');
  return {id: notebook.id, title: notebook.title};
}
export function normalizeStrokes(notes, inputMeta) {
  const meta = validateMeta(inputMeta), height = LIMITS.LOGICAL_WIDTH * meta.height / meta.width;
  array(notes, 0, meta.slideCount, 'Slayt notları geçersiz.');
  const seen = new Set(); let strokeCount = 0, pointCount = 0;
  const result = notes.map(entry => {
    keys(entry, ['slide', 'strokes']);
    requireValue(Number.isSafeInteger(entry.slide) && entry.slide >= 1 && entry.slide <= meta.slideCount && !seen.has(entry.slide), 'Slayt numarası geçersiz veya yinelenmiş.');
    seen.add(entry.slide);
    array(entry.strokes, 0, LIMITS.STROKES, 'Çizgi listesi geçersiz.');
    strokeCount += entry.strokes.length;
    requireValue(strokeCount <= LIMITS.STROKES, 'Çizgi sınırı aşıldı.');
    return {slide: entry.slide, strokes: entry.strokes.map(stroke => {
      keys(stroke, ['width', 'color', 'points']);
      requireValue(finite(stroke.width, 0.25, 64) && typeof stroke.color === 'string'
        && /^#[0-9a-fA-F]{6}$/.test(stroke.color), 'Çizgi görünümü geçersiz.');
      array(stroke.points, 1, LIMITS.POINTS_PER_STROKE, 'Çizgi nokta sınırı aşıldı.');
      pointCount += stroke.points.length;
      requireValue(pointCount <= LIMITS.POINTS, 'Toplam nokta sınırı aşıldı.');
      const points = stroke.points.map(point => {
        keys(point, ['x', 'y'], ['pressure']);
        requireValue(finite(point.x, 0, LIMITS.LOGICAL_WIDTH) && finite(point.y, 0, height), 'Nokta slayt sınırlarının dışında.');
        if (Object.hasOwn(point, 'pressure')) requireValue(finite(point.pressure, 0, 1), 'Kalem basıncı geçersiz.');
        return {x: point.x, y: point.y, ...(Object.hasOwn(point, 'pressure') ? {pressure: point.pressure} : {})};
      });
      return {width: stroke.width, color: stroke.color.toLowerCase(), points};
    })};
  }).sort((a, b) => a.slide - b.slide);
  requireValue(noteBytes(result) <= LIMITS.NOTES_BYTES, 'Not boyutu sınırı aşıldı.');
  return result;
}
export function noteBytes(notes) { return encoder.encode(JSON.stringify(notes)).byteLength; }
export function copyBytes(bytes) {
  requireValue(bytes instanceof ArrayBuffer && bytes.byteLength > 0 && bytes.byteLength <= LIMITS.FILE_BYTES, 'PPTX dosyası boş veya 20 MiB sınırının üzerinde.');
  return bytes.slice(0);
}
export async function sha256(bytes) {
  requireValue(bytes instanceof ArrayBuffer, 'Hash için ArrayBuffer gerekli.');
  const digest = await crypto.subtle.digest('SHA-256', bytes.slice(0));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
const headerHash = value => sha256(encoder.encode(JSON.stringify(value)).buffer);
export async function createBackup(record) {
  const bytes = copyBytes(record?.bytes), name = sanitizeName(record?.name);
  const meta = validateMeta(record?.meta), notes = normalizeStrokes(record?.notes, meta);
  const hash = await sha256(bytes);
  if (record.hash !== hash) throw failure('CORRUPT', 'Özgün sunum özeti uyuşmuyor; yedek üretilmedi.');
  const core = {format: 'bilge-defter-pptx', version: 1, name, meta, notes, byteLength: bytes.byteLength, hash,
    ...(record.notebook === undefined ? {} : {notebook: validateNotebook(record.notebook)})};
  const header = encoder.encode(JSON.stringify({...core, checksum: await headerHash(core)}));
  requireValue(header.byteLength <= LIMITS.HEADER_BYTES, 'Yedek başlığı sınırı aşıldı.');
  const prefix = new Uint8Array(12); prefix.set(magic); new DataView(prefix.buffer).setUint32(8, header.byteLength, true);
  return new Blob([prefix, header, bytes], {type: 'application/x-bilge-defter-pptx'});
}
export async function parseBackup(blob) {
  requireValue(blob instanceof Blob && blob.size >= 13
    && blob.size <= 12 + LIMITS.HEADER_BYTES + LIMITS.FILE_BYTES, 'Yedek boyutu geçersiz.');
  const prefix = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  requireValue(magic.every((byte, index) => byte === prefix[index]), 'Bu dosya Bilge PPTX yedeği değil.');
  const length = new DataView(prefix.buffer).getUint32(8, true);
  requireValue(length > 0 && length <= LIMITS.HEADER_BYTES && 12 + length < blob.size, 'Yedek başlığı geçersiz.');
  let header;
  try { header = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(await blob.slice(12, 12 + length).arrayBuffer())); }
  catch { throw failure('INVALID', 'Yedek başlığı okunamadı.'); }
  keys(header, ['format', 'version', 'name', 'meta', 'notes', 'byteLength', 'hash', 'checksum'], ['notebook']);
  requireValue(header.format === 'bilge-defter-pptx' && header.version === 1, 'Yedek sürümü desteklenmiyor.');
  requireValue(Number.isSafeInteger(header.byteLength) && header.byteLength >= 1
    && header.byteLength <= LIMITS.FILE_BYTES && blob.size === 12 + length + header.byteLength, 'Sunum uzunluğu uyuşmuyor.');
  requireValue(typeof header.hash === 'string' && /^[a-f0-9]{64}$/.test(header.hash)
    && typeof header.checksum === 'string' && /^[a-f0-9]{64}$/.test(header.checksum), 'Yedek özeti geçersiz.');
  const name = sanitizeName(header.name), meta = validateMeta(header.meta), notes = normalizeStrokes(header.notes, meta);
  requireValue(name === header.name, 'Yedek dosya adı kanonik değil.');
  const core = {format: header.format, version: header.version, name: header.name, meta: header.meta,
    notes: header.notes, byteLength: header.byteLength, hash: header.hash,
    ...(header.notebook === undefined ? {} : {notebook: validateNotebook(header.notebook)})};
  if (await headerHash(core) !== header.checksum) throw failure('CORRUPT', 'Yedek not veya başlık özeti uyuşmuyor.');
  const bytes = await blob.slice(12 + length).arrayBuffer();
  if (await sha256(bytes) !== header.hash) throw failure('CORRUPT', 'Yedek sunum özeti uyuşmuyor.');
  return {bytes, name, meta, notes, hash: header.hash, ...(core.notebook ? {notebook: core.notebook} : {})};
}
