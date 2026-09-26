const assert=require('node:assert/strict');
const data=require('./bilge-defter-test/terminology-data.js'),create=require('./bilge-defter-test/terminology.js'),engine=create(data);
let passed=0;function test(name,fn){fn();passed++;console.log('PASS '+name)}
test('100 unique draft concepts; no unearned source verification',()=>{
  assert.equal(data.concepts.length,100);assert.equal(new Set(data.concepts.map(c=>c.id)).size,100);
  for(const c of data.concepts){assert.equal(c.reviewStatus,'draft');assert.deepEqual(c.verifiedSources,[]);for(const lang of ['tr','en','la'])assert.ok(c.labels[lang]?.trim());for(const ref of c.referenceCandidates)assert.ok(data.sources.some(s=>s.id===ref));}
});
for(const lang of ['tr','en','la'])test('All 100 '+lang+' labels retrieve their own concept without collapsing homonyms',()=>{
  for(const c of data.concepts)assert.ok(engine.search(c.labels[lang],50).some(h=>h.concept.id===c.id),c.id+' '+lang);
});
for(const [q,id] of [['kalp','heart'],['HEART','heart'],['COR','heart'],['yürek','heart'],['on capraz bag','acl'],['ÖN ÇAPRAZ BAĞ','acl'],['BOBREK','kidney'],['ESOPHAGUS','oesophagus'],['İDRAR KESESİ','urinary-bladder'],['O\u0308N C\u0327APRAZ BAG\u0306','acl']])test('Lookup '+q,()=>assert.equal(engine.search(q)[0].concept.id,'anatomy.'+id));
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
console.log(JSON.stringify({passed,concepts:engine.count,labelRoundTrips:300,expertReviewed:0,liveDeployment:false}));
