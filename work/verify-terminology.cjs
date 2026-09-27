const assert=require('node:assert/strict'),{execFileSync}=require('child_process'),path=require('path');
const data=require('./bilge-defter-test/terminology-data.js'),create=require('./bilge-defter-test/terminology.js'),engine=create(data);
let passed=0;function test(name,fn){fn();passed++;console.log('PASS '+name)}
const pilot=data.concepts.filter(c=>!c.labelSource),wikidata=data.concepts.filter(c=>c.labelSource);
test('Generated block is exactly the build of the pinned Wikidata snapshot, review and page index',()=>{
  assert.match(execFileSync(process.execPath,[path.join(__dirname,'build-terminology.cjs'),'check'],{encoding:'utf8'}),/matches pinned inputs/)});
test('356 unique draft concepts: 100 independent pilot + 204 reviewed Turkish-labelled + 52 editor-selected muscles; no unearned source verification',()=>{
  assert.equal(data.concepts.length,356);assert.equal(new Set(data.concepts.map(c=>c.id)).size,356);assert.equal(pilot.length,100);assert.equal(wikidata.length,256);
  assert.equal(data.concepts.filter(c=>c.category==='kas').length,75);
  for(const c of data.concepts){assert.equal(c.reviewStatus,'draft');assert.deepEqual(c.verifiedSources,[]);for(const lang of ['tr','en','la'])assert.ok(c.labels[lang]?.trim());for(const ref of c.referenceCandidates)assert.ok(data.sources.some(s=>s.id===ref));}
});
test('Every Wikidata concept names its item and TA id and separates label edits from additions',()=>{
  assert.ok(data.sources.some(s=>s.id==='wikidata'&&/CC0/.test(s.rights)));
  for(const c of wikidata){const s=c.labelSource;assert.equal(s.id,'wikidata');assert.match(s.item,/^Q[0-9]+$/);assert.ok(s.ta98||s.ta2,c.id);for(const k of ['edited','added'])assert.ok(s[k].every(l=>['tr','en','la'].includes(l)),c.id);assert.ok(!s.edited.some(l=>s.added.includes(l)),c.id);assert.ok(!s.added.includes('en')&&!s.added.includes('la'),c.id)}
  assert.equal(new Set(wikidata.map(c=>c.labelSource.item)).size,256);
  const muscles=wikidata.filter(c=>c.labelSource.added.includes('tr'));assert.equal(muscles.length,44);assert.ok(muscles.every(c=>c.category==='kas'&&c.labelSource.ta98.startsWith('A04')));
});
test('Every concept carries a library search term from its own English labels and matching page counts',()=>{
  for(const c of data.concepts){assert.ok([c.labels.en,...c.aliases.en].includes(c.library.term),c.id);for(const [id,n] of Object.entries(c.library.books)){assert.ok(data.libraryBooks[id],id);assert.ok(Number.isSafeInteger(n)&&n>0)}}
  assert.deepEqual(data.concepts.filter(c=>!Object.keys(c.library.books).length).map(c=>c.id),['anatomy.platysma','anatomy.tensor-fasciae-latae']);
  assert.equal(Object.keys(data.libraryBooks).length,5);
  assert.equal(data.concepts.find(c=>c.id==='anatomy.oesophagus').library.term,'esophagus');
});
for(const lang of ['tr','en','la'])test('All 356 '+lang+' labels retrieve their own concept without collapsing homonyms',()=>{
  for(const c of data.concepts)assert.ok(engine.search(c.labels[lang],50).some(h=>h.concept.id===c.id),c.id+' '+lang);
});
for(const [q,id] of [['kalp','heart'],['HEART','heart'],['COR','heart'],['yürek','heart'],['on capraz bag','acl'],['ÖN ÇAPRAZ BAĞ','acl'],['BOBREK','kidney'],['ESOPHAGUS','oesophagus'],['İDRAR KESESİ','urinary-bladder'],['ÖN ÇAPRAZ BAĞ','acl'],
  ['nöron','neuron'],['sinir hücresi','neuron'],['göz bebeği','pupil'],['Willis halkası','cerebral-arterial-circle'],['kulak zarı','tympanic-membrane'],['femoral arter','femoral-artery'],['sinovyal zar','synovial-membrane'],['İÇ SALGI BEZİ','endocrine-gland'],['şakak kası','temporalis'],['temporal kas','temporalis'],['küçük göğüs kası','pectoralis-minor'],['ön dişli kas','serratus-anterior'],['iki başlı uyluk kası','biceps-femoris'],['musculus glutaeus medius','gluteus-medius'],['peroneus longus','fibularis-longus']])test('Lookup '+q,()=>assert.equal(engine.search(q)[0].concept.id,'anatomy.'+id));
test('Accent neighbours stay apart: exact kaş and kas each come first',()=>{assert.equal(engine.search('kaş')[0].concept.id,'anatomy.eyebrow');assert.equal(engine.search('kas')[0].concept.id,'anatomy.muscle')});
test('Latin os keeps both meanings (mouth, bone) with explaining notes',()=>{const hits=engine.search('os').filter(h=>h.score===0);assert.deepEqual(new Set(hits.map(h=>h.concept.id)),new Set(['anatomy.mouth','anatomy.bone']));for(const h of hits)assert.match(h.concept.note,/os/)});
test('Abbreviations from the review are marked as abbreviations',()=>{for(const [q,id] of [['MSS','central-nervous-system'],['BOS','cerebrospinal-fluid'],['RCA','right-coronary-artery']]){const h=engine.search(q)[0];assert.equal(h.concept.id,'anatomy.'+id);assert.equal(h.match,'abbreviation')}});
test('Slang and wrong Wikidata aliases were not imported',()=>{const all=JSON.stringify(data.concepts).toLocaleLowerCase('tr-TR');for(const w of ['göt','toto','bızır','pıtış','taşak','bağdemcik','menüsküs','femoral sinir','sinovit','xiphoid işlemi'])assert.ok(!all.includes('"'+w+'"'),w)});
test('Misspelling yields explicit suggestion, not a rewrite',()=>{const hits=engine.search('kallp');assert.equal(hits[0].concept.id,'anatomy.heart');assert.equal(hits[0].match,'suggestion')});
test('Femur retains separate bone and region meanings',()=>{const hits=engine.search('femur').filter(h=>h.score===0);assert.deepEqual(new Set(hits.map(h=>h.concept.id)),new Set(['anatomy.femur','anatomy.thigh']))});
test('Abbreviations marked, never treated as globally unique',()=>assert.equal(engine.search('ACL')[0].match,'abbreviation'));
test('Existing exact term wins over a similar medical term',()=>{assert.equal(engine.search('üretra')[0].concept.id,'anatomy.urethra');assert.equal(engine.search('üreter')[0].concept.id,'anatomy.ureter')});
test('Unknown, empty and oversized inputs fail without generated answers',()=>{for(const q of ['',null,'   ','bilinmeyen bir ders sorusu','a'.repeat(121),'<script>alert(1)</script>'])assert.deepEqual(engine.search(q),[])});
test('Input, aliases and drafts do not mutate the dataset',()=>{const before=JSON.stringify(data);const d=engine.expansion('anatomy.acl','ön çapraz bağ görevi');assert.equal(d.original,'ön çapraz bağ görevi');assert.equal(d.requiresConfirmation,true);assert.ok(d.terms.includes('anterior cruciate ligament'));assert.equal(d.reviewStatus,'draft');d.terms.push('test');engine.search('kallp');assert.equal(JSON.stringify(data),before)});
test('Missing Latin stays absent; no invented counterpart',()=>{const fixture=structuredClone(data.concepts[0]);fixture.labels.la=null;const local=create({concepts:[fixture]});assert.equal(local.search('kalp')[0].concept.labels.la,null);assert.ok(!local.expansion(fixture.id,'kalp').terms.includes('cor'))});
test('Unknown concept cannot be expanded',()=>assert.equal(engine.expansion('not-a-concept','kalp'),null));
test('Different concepts sharing an abbreviation remain separate',()=>{const fixtures=structuredClone(data.concepts.slice(0,2));fixtures.forEach(c=>c.abbreviations=['XX']);const local=create({concepts:fixtures});assert.equal(local.search('XX').length,2)});
test('Search result limits are bounded',()=>{assert.ok(engine.search('musculus',1).length<=1);assert.ok(engine.search('musculus',Infinity).length<=20)});
console.log(JSON.stringify({passed,concepts:engine.count,wikidataConcepts:wikidata.length,labelRoundTrips:1068,expertReviewed:0,liveDeployment:false}));
