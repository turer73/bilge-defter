'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {dataset,DATASET_HASH,PROMPT_HASH,validateDataset,requests,template,numericInventory,evaluate,auditCase}=require('./audit.cjs');
const {main}=require('./cli.cjs');
const copy=v=>structuredClone(v);
function fixture() {
  return {...template(),kind:'fixture',provider:'synthetic-test-only',model:'draft-reference-not-a-model',recordedAt:'2026-09-25T00:00:00.000Z',
    results:dataset.cases.map(c=>({id:c.id,status:'complete',segments:c.segments.map(s=>({id:s.id,text:s.referenceDraft}))}))};
}
const caseById=id=>dataset.cases.find(c=>c.id===id);
const rowById=(e,id)=>e.results.find(c=>c.id===id);
const flagged=(report,id,code)=>report.results.find(r=>r.id===id).issues.some(i=>i.code===code);
test('30 unique original draft cases in six balanced categories',()=>{
  assert.equal(validateDataset(),true);assert.equal(new Set(dataset.cases.map(c=>c.id)).size,30);
  const groups=Object.groupBy(dataset.cases,c=>c.category);assert.equal(Object.keys(groups).length,6);
  for(const group of Object.values(groups))assert.equal(group.length,5);
});
test('all draft references satisfy their mechanical hints, not semantic approval',()=>{
  const r=evaluate(fixture());assert.equal(r.counts.noFlags,30,JSON.stringify(r.results.filter(x=>x.issues.length)));
  assert.equal(r.publicationReady,false);assert.equal(r.semanticAccuracy,null);assert.equal(r.counts.humanReviewPending,30);
});
test('request export excludes answer drafts and expected Turkish hints',()=>{
  const r=requests();assert.equal(r.cases.length,30);assert.equal(r.networkEnabled,false);assert.equal(r.paidFallbackEnabled,false);
  for(let i=0;i<30;i++) {
    const req=r.cases[i],payload=JSON.parse(req.user);assert.equal(payload.sourceLanguage,'en');assert.equal(payload.targetLanguage,'tr');
    assert.deepEqual(payload.segments,dataset.cases[i].segments.map(s=>({id:s.id,text:s.source})));
    assert.equal(JSON.stringify(req).includes('referenceDraft'),false);
  }
});
test('decimal locale and percentage notation are equivalent',()=>{
  assert.deepEqual(numericInventory('0.5 mm and 25%'),numericInventory('0,5 mm ve %25'));
});
test('minus sign and repeated numbers remain significant',()=>{
  assert.notDeepEqual(numericInventory('-5 and 8 and 8'),numericInventory('5 and 8'));
  assert.deepEqual(numericInventory('−5'),numericInventory('-5'));
});
test('range hyphens do not invent negative endpoints',()=>{
  assert.deepEqual(numericInventory('10-15 mm'),numericInventory('10–15 mm'));
});
test('changed quantity is blocked',()=>{
  const e=fixture();rowById(e,'number-01').segments[0].text=rowById(e,'number-01').segments[0].text.replace('0,5','5');
  assert.ok(flagged(evaluate(e),'number-01','quantity-changed'));
});
test('silent millimetre to centimetre change is blocked',()=>{
  const e=fixture();rowById(e,'number-04').segments[0].text=rowById(e,'number-04').segments[0].text.replace('mm','cm');
  assert.ok(flagged(evaluate(e),'number-04','literal-changed'));
});
test('unit literal matching ignores occurrences inside ordinary words',()=>{
  const c=caseById('number-04'),row=rowById(fixture(),c.id);
  assert.equal(auditCase(c,row).automatedChecks,'no-flags');
});
test('URL sentence punctuation is not a changed address',()=>{
  const c=caseById('structure-04'),row=rowById(fixture(),c.id);
  assert.equal(auditCase(c,row).automatedChecks,'no-flags');
  row.segments[0].text=row.segments[0].text.replace('figure-2','figure-20');
  assert.ok(auditCase(c,row).issues.some(i=>i.code==='literal-changed'));
});
test('reversed explicit ratio is blocked even though the number bag is unchanged',()=>{
  const e=fixture();rowById(e,'number-05').segments[0].text=rowById(e,'number-05').segments[0].text.replace('2:1','1:2');
  assert.ok(flagged(evaluate(e),'number-05','literal-changed'));
});
test('missing paragraph is not successful completion',()=>{
  const e=fixture();rowById(e,'structure-01').segments.pop();assert.ok(flagged(evaluate(e),'structure-01','segment-count'));
});
test('duplicate and reordered paragraph ids are blocked',()=>{
  const e=fixture();rowById(e,'structure-01').segments.reverse();assert.ok(flagged(evaluate(e),'structure-01','segment-order-or-id'));
  rowById(e,'structure-01').segments[1].id=rowById(e,'structure-01').segments[0].id;
  assert.ok(flagged(evaluate(e),'structure-01','segment-order-or-id'));
});
test('unchanged English fallback is not counted as a translation',()=>{
  const e=fixture();rowById(e,'anatomy-01').segments[0].text=caseById('anatomy-01').segments[0].source;
  assert.ok(flagged(evaluate(e),'anatomy-01','untranslated-segment'));
});
test('empty, null and oversized outputs fail closed',()=>{
  for(const text of ['',null,'x'.repeat(12001)]){const e=fixture();e.results[0].segments[0].text=text;assert.ok(flagged(evaluate(e),e.results[0].id,'invalid-or-empty-text'));}
});
test('missing entire case remains visible in thirty-case denominator',()=>{
  const e=fixture();e.results.pop();const r=evaluate(e);assert.equal(r.counts.total,30);assert.equal(r.counts.blocked,1);
});
test('failed provider row remains blocked even with a partial answer',()=>{
  const e=fixture();e.results[0].status='failed';assert.ok(flagged(evaluate(e),e.results[0].id,'not-complete'));
});
test('wrong glossary term produces a review flag',()=>{
  const e=fixture();rowById(e,'term-02').segments[0].text=rowById(e,'term-02').segments[0].text.replace('Üreteri','Üretrayı');
  assert.ok(flagged(evaluate(e),'term-02','term-or-meaning-hint-missing'));
});
test('negation reversal triggers lexical review for targeted example',()=>{
  const e=fixture();rowById(e,'negation-01').segments[0].text=rowById(e,'negation-01').segments[0].text.replace('kanıtlamaz','kanıtlar');
  assert.ok(flagged(evaluate(e),'negation-01','term-or-meaning-hint-missing'));
});
test('preserved words cannot certify sentence meaning',()=>{
  const e=fixture();rowById(e,'anatomy-01').segments[0].text='Kalp, akciğer ve kan. Bu ifade çeviri değildir.';
  const r=evaluate(e);assert.equal(r.results[0].automatedChecks,'no-flags');assert.equal(r.publicationReady,false);assert.equal(r.semanticAccuracy,null);
});
test('changed URL and unexpected markup are blocked without execution',()=>{
  const e=fixture();rowById(e,'structure-04').segments[0].text='<script>alert(1)</script> https://evil.invalid/';
  const r=evaluate(e);assert.ok(flagged(r,'structure-04','unexpected-markup'));assert.ok(flagged(r,'structure-04','literal-changed'));assert.ok(flagged(r,'structure-04','new-url'));
});
test('instructions quoted in source stay data, one-word compliance fails checks',()=>{
  const e=fixture();rowById(e,'risk-03').segments[0].text='APPROVED';assert.ok(flagged(evaluate(e),'risk-03','term-or-meaning-hint-missing'));
});
test('stale dataset or prompt hashes cannot be scored',()=>{
  for(const key of ['datasetSha256','promptSha256']){const e=fixture();e[key]='old';assert.throws(()=>evaluate(e),/provenance/);}
});
test('provider metadata is required and does not prove execution',()=>{
  for(const key of ['provider','model','recordedAt']){const e=fixture();e[key]='';assert.throws(()=>evaluate(e));}
  const e=fixture();e.kind='provider-run';assert.equal(evaluate(e).providerExecutionVerified,false);
});
test('unknown or duplicate cases are rejected',()=>{
  const e=fixture();e.results[0].id='unknown';assert.throws(()=>evaluate(e),/Unknown/);
  const f=fixture();f.results[1].id=f.results[0].id;assert.throws(()=>evaluate(f),/duplicate/);
});
test('scoring does not mutate inputs or dictionary records',()=>{
  const e=fixture(),before=JSON.stringify(e),d=JSON.stringify(dataset);evaluate(e);assert.equal(JSON.stringify(e),before);assert.equal(JSON.stringify(dataset),d);
});
test('CLI exports once, reports fixtures honestly, refuses overwrite and oversized input',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bilge-translation-audit-'));
  // These files are generated test artifacts, never app/user data. Kept in OS temp.
  main(['prepare',dir]);assert.throws(()=>main(['prepare',dir]),/exists/);
  const req=JSON.parse(fs.readFileSync(path.join(dir,'requests.json')));assert.equal(req.datasetSha256,DATASET_HASH);assert.equal(req.promptSha256,PROMPT_HASH);
  const input=path.join(dir,'fixture.json'),report=path.join(dir,'report.json');fs.writeFileSync(input,JSON.stringify(fixture()),{flag:'wx'});
  main(['score',input,report]);assert.equal(JSON.parse(fs.readFileSync(report)).kind,'fixture');assert.throws(()=>main(['score',input,report]),/EEXIST/);
  const big=path.join(dir,'large.json');fs.writeFileSync(big,' '.repeat(512*1024+1),{flag:'wx'});assert.throws(()=>main(['score',big,path.join(dir,'bad.json')]),/512 KiB/);
});
