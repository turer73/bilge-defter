// TDK Güncel Türkçe Sözlük (12. baskı) verisinden tıp ağırlıklı alt küme üretici.
// Kaynak: ogun/guncel-turkce-sozluk (MIT repo; içerik TDK'ya aittir).
const fs = require('fs');
const readline = require('readline');

const SRC = 'C:/Users/sevdi/AppData/Local/Temp/opencode/gts/gts.json';
const OUT = 'D:/Projelerim/bilge-defter/work/bilge-defter-test/dictionary-data.js';

const markers = /(tıp|hastalık|hastalığ|anatomi|organ|iltihap|iltihabı|ameliyat|bakteri|virüs|mikrop|ilaç|ilaçlar|kemik|kas |kası|sinir|hücre|doku|dokularda|ağrı|ateş|aşı|salgı|bezi|enfeksiyon|tümör|tumor|kanser|kan |kanı|kalp|böbrek|karaciğer|akciğer|mide|bağırsak|deri|eklem|tedavi|tanı|hasta|hekim|cerrahi|sal gın|epidem|pandemi|mikroorganizma|antikor|bağışıklık|solunum|dolaşım|sindirim|boşaltım|üreme|hormon|enzim|protein|kromozom|gen |ağrı kesici|antibiyotik|vitamin|eksikliği|sendromu|kisti|iltihabı|yanması|yetmezliği|tıkanıklığı|kanaması|kırığı|çıkığı|felç|nöbet|koma|şok |alerji|astım|diyabet|şeker hastalığı|tansiyon|kolesterol|anemi|kansızlık|sıtma|verem|kızamık|çiçek|kolera|tifo|veba|cüzzam|kuduz|tetanos|difteri|boğmaca|grip|nezle|zatürre|bronşit|ülser|gastrit|siroz|safra|pankreas|apandis|fıtık|hemoroid|egzama|sedef|uyuz|mantar hastalığı|kanserli)/i;

const seen = new Map();
let total = 0;

function cleanDef(m) {
  const a = (m.anlam || '').trim();
  if (!a) return null;
  return a;
}

const rl = readline.createInterface({ input: fs.createReadStream(SRC), crlfDelay: Infinity });
rl.on('line', (line) => {
  total++;
  let rec;
  try { rec = JSON.parse(line); } catch { return; }
  const headword = (rec.madde || '').trim();
  if (!headword || headword.length > 60 || /\d/.test(headword)) return;
  const meanings = rec.anlamlarListe || [];
  if (!meanings.length) return;
  const tagStr = meanings.flatMap(m => (m.ozelliklerListe || []).map(o => (o.tam_adi || '') + ' ' + (o.kisa_adi || ''))).join(' ').toLocaleLowerCase('tr-TR');
  const isTip = /tıp|tip terimi/.test(tagStr);
  const defs = meanings.map(cleanDef).filter(Boolean);
  const real = defs.filter(d => !/^►/.test(d));
  const def = (real.length ? real : defs).join('; ');
  const hay = (headword + ' ' + def).toLocaleLowerCase('tr-TR');
  if (!isTip && !markers.test(hay)) return;
  const trimmedDef = def.length > 380 ? def.slice(0, 377) + '…' : def;
  if (!trimmedDef || trimmedDef.length < 6) return;
  const key = headword.toLocaleLowerCase('tr-TR');
  if (!seen.has(key)) seen.set(key, { term: headword, def: trimmedDef });
});
rl.on('close', () => {
  const entries = [...seen.values()].sort((a, b) => a.term.localeCompare(b.term, 'tr'));
  console.log('tarandi:', total, '| secilen benzersiz:', entries.length);
  const esc = s => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, ' ');
  const lines = [
    '// Bilge Defter sözlüğü — TDK Güncel Türkçe Sözlük (12. baskı) verisinden seçilmiş',
    '// tıp ağırlıklı alt küme. Kaynak: ogun/guncel-turkce-sozluk; içerik TDK\'ya aittir.',
    '// Eğitim amaçlıdır; tıbbi karar desteği DEĞİLDİR. Tanımlar kısaltılmış olabilir.',
    'window.BILGE_SOZLUK=[',
  ];
  for (const e of entries) lines.push(`{term:'${esc(e.term)}',def:'${esc(e.def)}'},`);
  lines.push('];');
  fs.writeFileSync(OUT, lines.join('\n') + '\n', 'utf8');
  console.log('YAZILDI:', OUT, '|', fs.statSync(OUT).size, 'bayt');
});
