'use strict';
// Pure diagnostic contracts, not product acceptance. Root owns execution.
// Pinned real handlers/touchPage run in a VM; target injection and interior-only
// constrainMedia are mocks, so this does not establish browser hit-test behavior.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const experiment=require('./diagnose-ink-stamp.cjs'),two=require('./diagnose-ink-two-commit.cjs'),history=require('./diagnose-ink-history.cjs');
const canonical=fs.readFileSync(path.join(__dirname,'verify-slide-flow.cjs'),'utf8'),media=fs.readFileSync(path.join(__dirname,'bilge-defter-invited-v78/media-workspace.js'),'utf8'),index=fs.readFileSync(path.join(__dirname,'bilge-defter-invited-v78/index.html'),'utf8'),gestureFixture=fs.readFileSync(path.join(__dirname,'test-ink-gesture.cjs'),'utf8'),twoFixture=fs.readFileSync(path.join(__dirname,'test-ink-two-commit.cjs'),'utf8');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex'),plain=value=>JSON.parse(JSON.stringify(value)),names=['A','M','T','S00','L10','R01','B11'],interventions=['S00','L10','R01','B11'];
function variant(name){const found=experiment.VARIANTS.find(x=>x.name===name);assert.ok(found,'Known stamp variant');return found;}
function changed(name){return experiment.transformRunner(canonical,variant(name));}
function between(source,start,end){assert.equal(source.split(start).length,2,'Unique start '+start);const from=source.indexOf(start),to=source.indexOf(end,from);assert.ok(to>from,'Ordered end '+end);return source.slice(from,to);}
function metric(label,failed=false){return{label,alphaMax:failed?64:0,compositedMax:0,compositedMeanForeground:0,compositedOver16:0,foregroundPixels:1000};}
function checkList(name,failed=false){return['initial','pen','eraser',variant(name).label,...(name==='A'?['zoom']:[])].map(label=>metric(label,label===variant(name).label&&failed));}
function failure(name){return'AssertionError [ERR_ASSERTION]: '+variant(name).label+': alpha deviation\n    at original quality loop';}
function record(trace,phase,label,n=0){const rows=trace.filter(x=>x.kind==='gesture-history'&&x.phase===phase&&x.label===label);assert.ok(rows[n]);return rows[n];}
function makeHarness(name){
  assert.equal(sha(gestureFixture),'e7fb70eaddf0864cb8d29f172613c4617c6d83b7461c7ce81245089b912f55f6');
  const helpers=between(gestureFixture,'function oneLineFunction(','\nasync function runEvents('),h=vm.runInNewContext(helpers+'\neventHarness;',{assert,structuredClone,Math,Map,Set,JSON,media,index,between,changed,vm},{timeout:1000})(name);
  h.observed={evaluations:0,closeBefore:null,closeAfter:null,touchCalls:0};const touch=h.sandbox.touchPage;h.sandbox.touchPage=p=>{h.observed.touchCalls++;return touch(p);};
  const snapshot=()=>({list:h.page.strokes,strokes:[...h.page.strokes],points:h.page.strokes.map(s=>s.points),pointRefs:h.page.strokes.flatMap(s=>s.points),ink:JSON.stringify(h.page.strokes),pageRevision:h.sandbox.pageRevs.get(h.page),editRevision:h.sandbox.editRevision,updated:h.page.updated,undo:h.sandbox.mediaUndo.get('p0'),undoEntries:[...(h.sandbox.mediaUndo.get('p0')||[])],saves:h.calls.saves,draws:h.calls.draws,touchCalls:h.observed.touchCalls});
  const evaluate=h.sandbox.p.evaluate;h.sandbox.p.evaluate=async(fn,arg)=>{h.observed.evaluations++;const close=fn.toString().includes("__recordInkSurface('before media close')");if(close)h.observed.closeBefore=snapshot();const result=await evaluate(fn,arg);if(close)h.observed.closeAfter=snapshot();return result;};return h;
}
const runFunction=between(twoFixture,'\nasync function runEvents(name,fault={}){','\nfunction normalize(h){');
async function runEvents(name){
  assert.equal(sha(twoFixture),'40fe1977e9450012d1abe309dc902e94095e5d4e058868d805086de07dd9f6fe');const h=await vm.runInNewContext(runFunction+'\nrunEvents;',{assert,makeHarness,metric,variant,between,plain,vm},{timeout:1000})(name);
  const collect=between(h.source,'diagnostic.trace=await p.evaluate(','if(!diagnostic.operations)');vm.runInContext('globalThis.collectUnderTest=async()=>{'+collect+'};',h.sandbox,{timeout:1000});await h.sandbox.collectUnderTest();h.records=plain(h.sandbox.diagnostic.trace);h.receipt=h.records.find(x=>x.kind==='stamp-receipt')?.receipt||null;return h;
}
function normalize(h){const historyAdapter={normalizeAudit:value=>history.normalizeAudit(plain(value))};return vm.runInNewContext(between(twoFixture,'\nfunction normalize(h){','\nfunction rehash(e){')+'\nnormalize;',{history:historyAdapter},{timeout:1000})(h);}
function rehash(e){e.normalizedInkSha256=sha(JSON.stringify(e.normalizedInk));e.geometrySha256=sha(JSON.stringify(e.geometry));}
async function preparedM(){
  const h=makeHarness('M'),s=h.sandbox,init=between(h.source,'await p.evaluate(()=>{window.__inkSurfaceTrace=[];',';await p.evaluate(traceInkFixture);');vm.runInContext('globalThis.initUnderTest=async()=>{'+init+';};',s,{timeout:1000});await s.initUnderTest();
  const pointer=between(h.source,'async function pointer(','\n// Desktop WebKit'),actions=between(h.source,"await p.evaluate(()=>{window.__recordInkSurface('before media open');","await p.evaluate(()=>{window.__recordInkSurface('before media close');");
  vm.runInContext(pointer+'\nglobalThis.prepareUnderTest=async()=>{'+actions+'};',s,{timeout:1000});await s.prepareUnderTest();assert.equal(s.mediaSelecting,true);assert.equal(s.mediaGesture,null);assert.equal(s.mediaUndo.get('p0').length,1);return h;
}

test('frozen helpers and generated controls have explicit pins',()=>{
  assert.equal(sha(canonical),'f2cb459827c1d725d6df1f22c6ff12047a02d415a7d26b8eb65f3eaa769de8d0');assert.equal(sha(media),'f25586bc8d2aa2abd6bade5a5304ff31b72c8bc427a55f9afefae6ee2fb5af31');assert.equal(sha(fs.readFileSync(path.join(__dirname,'diagnose-ink-two-commit.cjs'))),'61c4e18d8cf4f56f457c042ee325677ff440708f4e45bf8a6da3f419f18543d1');assert.deepEqual(experiment.VARIANTS.map(x=>x.name),names);
});
test('A M T remain byte-exact controls and all seven complete generated runners compile',()=>{
  for(const name of names)assert.doesNotThrow(()=>new vm.Script(changed(name).source,{filename:'stamp-'+name+'.cjs'}));for(const name of ['A','M','T'])assert.equal(changed(name).source,two.transformRunner(canonical,two.VARIANTS.find(x=>x.name===name)).source);
  assert.throws(()=>experiment.transformRunner(canonical+'\n',variant('S00')));assert.throws(()=>experiment.transformRunner(canonical,{name:'unknown'}));assert.throws(()=>experiment.transformRunner(canonical,{...variant('S00'),extra:true}));
});
test('complete raster audit and strict quality loop are byte-identical including all numeric rejection guards',()=>{
  const start="      window.__inkTracePhase='audit: '+label;",end='    },label);',body=between(canonical,start,end),gate=canonical.split('\n').find(x=>x.includes('for(const result of checks){assert.ok(result.foregroundPixels>0);'));assert.ok(gate);
  for(const name of names){const source=changed(name).source;assert.equal(between(source,start,end),body);assert.equal(source.split(gate).length-1,1);const good=metric(variant(name).label);vm.runInNewContext(gate,{assert,checks:[good]},{timeout:1000});for(const bad of [{foregroundPixels:0},{alphaMax:33},{compositedMax:33},{compositedMeanForeground:1.001},{compositedOver16:3}])assert.throws(()=>vm.runInNewContext(gate,{assert,checks:[{...good,...bad}]},{timeout:1000}));}
});
test('2x2 stamp actions affect only requested list identity and real touchPage revision',async()=>{
  const m=await runEvents('M');assert.ok(m.observed.closeBefore&&m.observed.closeAfter);
  for(const name of interventions){const h=await runEvents(name),before=h.observed.closeBefore,after=h.observed.closeAfter,listChanged=['L10','B11'].includes(name),revisionChanged=['R01','B11'].includes(name);assert.ok(before&&after);
    assert.equal(after.list===before.list,!listChanged);assert.equal(after.pageRevision-before.pageRevision,revisionChanged?1:0);assert.equal(after.touchCalls-before.touchCalls,revisionChanged?1:0);
    assert.equal(after.ink,before.ink);assert.equal(after.editRevision,before.editRevision);assert.equal(after.updated,before.updated);assert.equal(after.undo,before.undo);assert.deepEqual(after.undoEntries,before.undoEntries);assert.equal(after.saves,before.saves);
    assert.equal(after.strokes.length,before.strokes.length);after.strokes.forEach((stroke,i)=>assert.equal(stroke,before.strokes[i]));after.points.forEach((points,i)=>assert.equal(points,before.points[i]));after.pointRefs.forEach((point,i)=>assert.equal(point,before.pointRefs[i]));
    assert.equal(after.draws-before.draws,m.observed.closeAfter.draws-m.observed.closeBefore.draws,'No added draw during intervention/close');assert.equal(h.observed.evaluations,m.observed.evaluations,'No added browser callback');assert.equal(h.calls.saves,m.calls.saves);assert.equal(h.calls.realCommits,1);assert.equal(h.calls.readbacks,0);assert.deepEqual(plain(h.calls.actions),plain(m.calls.actions));assert.deepEqual(plain(h.page.strokes),plain(m.page.strokes));
    assert.equal(h.sandbox.mediaGesture,null);assert.equal(h.sandbox.mediaSelection,null);assert.equal(h.sandbox.mediaSelecting,false);assert.equal(h.captures.size,0);assert.equal(h.sandbox.mediaUndo.get('p0').length,1);
  }
});
test('only A keeps the original continuation and failure screenshot; every other variant stops at measured endpoint',async()=>{
  for(const name of names){const h=await runEvents(name);assert.deepEqual(plain(h.calls.audits),name==='A'?['media undo','zoom']:[variant(name).label]);assert.deepEqual(plain(h.result.checks.map(x=>x.label)),checkList(name).map(x=>x.label));assert.equal(h.calls.tailSaves,name==='A'?1:0);assert.equal(h.calls.screenshots,name==='A'?1:0);assert.deepEqual(plain(h.calls.zoom),name==='A'?[1.5]:[]);assert.equal(h.calls.cold,0);
    let reads=0,pictures=0,finished=0;const report={results:[]},f={goto:async()=>{},finish:async()=>finished++,p:{evaluate:async()=>{reads++;return{diagnostic:'untouched'};},screenshot:async()=>pictures++}},scope={caseFilter:null,assert,console:{log(){},error(){}},fixture:async()=>f,report,path,out:'/not-written'};
    vm.createContext(scope);vm.runInContext(between(changed(name).source,'async function check(','\nfunction traceInkFixture(')+'\nglobalThis.checkUnderTest=check;',scope,{timeout:1000});await scope.checkUnderTest({},'webkit','stamp',async()=>{throw Error('original-stamp-error');});assert.equal(reads,1);assert.equal(finished,1);assert.equal(pictures,name==='A'?1:0);assert.equal(report.results[0].passed,false);assert.match(report.results[0].error,/original-stamp-error/);
  }
});
test('exact endpoint quality is distinguished from unrelated runtime and early-phase errors',()=>{
  for(const name of names){assert.equal(experiment.validateCaseOutcome({passed:true,error:null},checkList(name),variant(name)).terminalEnvelopeFailed,false);assert.equal(experiment.validateCaseOutcome({passed:false,error:failure(name)},checkList(name,true),variant(name)).terminalEnvelopeFailed,true);
    for(const [result,checks]of[[{passed:true,error:null},checkList(name,true)],[{passed:false,error:'Error: save failed'},checkList(name)],[{passed:true,error:'unexpected error'},checkList(name)],[{passed:false,error:failure(name)},checkList(name,true).slice(1)],[{passed:false,error:'Error: '+variant(name).label+': alpha deviation'},checkList(name,true)]])assert.throws(()=>experiment.validateCaseOutcome(result,checks,variant(name)));
    for(const label of ['initial','pen','eraser',...(name==='A'?['zoom']:[])]){const checks=checkList(name,true);checks.find(x=>x.label===label).alphaMax=64;assert.throws(()=>experiment.validateCaseOutcome({passed:false,error:failure(name)},checks,variant(name)));}
  }
});
test('the serialized intervention retains real shallow-copy identities equally in all cells without draw or save',async()=>{
  for(const name of interventions){const h=await preparedM(),s=h.sandbox,v=variant(name),beforeList=h.page.strokes,beforeRevision=s.pageRevs.get(h.page),beforeEdit=s.editRevision,beforeUndo=s.mediaUndo.get('p0'),beforeInk=JSON.stringify(h.page.strokes);let draws=0,saves=0;
    s.drawAll=()=>{draws++;throw Error('forbidden-intervention-draw');};s.scheduleSave=()=>{saves++;throw Error('forbidden-intervention-save');};
    const code='('+experiment.installStampIntervention.toString()+')('+v.list+','+v.revision+');';vm.runInContext(code,s,{timeout:1000});
    const keep=s.window.__inkStampRetention,r=plain(s.window.__inkStampReceipt);assert.deepEqual(Object.keys(keep).sort(),['copy','oldList','owner','refs','selection','undo','undoRefs']);assert.equal(keep.owner,h.page);assert.equal(keep.oldList,beforeList);assert.notEqual(keep.copy,beforeList);assert.equal(keep.copy.length,beforeList.length);keep.copy.forEach((stroke,i)=>assert.equal(stroke,beforeList[i]));assert.equal(h.page.strokes,v.list?keep.copy:beforeList);
    assert.equal(s.pageRevs.get(h.page),beforeRevision+(v.revision?1:0));assert.equal(s.editRevision,beforeEdit);assert.equal(s.mediaUndo.get('p0'),beforeUndo);assert.equal(JSON.stringify(h.page.strokes),beforeInk);assert.equal(draws,0);assert.equal(saves,0);assert.doesNotThrow(()=>experiment.validateStampReceipt(r,v));
    assert.throws(()=>vm.runInContext(code,s,{timeout:1000}),/Single bounded/,'The same intervention cannot execute twice');
  }
  for(const call of ['drawAll();','scheduleSave();']){const h=await preparedM(),s=h.sandbox;let caught=0;s.drawAll=s.scheduleSave=()=>{caught++;throw Error('forbidden-injected-operation');};const original=experiment.installStampIntervention.toString(),injected=original.replace('{','{'+call);assert.notEqual(injected,original);assert.throws(()=>vm.runInContext('('+injected+')(false,false);',s,{timeout:1000}),/forbidden-injected-operation/);assert.equal(caught,1);}
});
test('receipt rejects hidden data revisions identities selection undo or allocation mutations',async()=>{
  for(const name of interventions){const h=await runEvents(name),v=variant(name);assert.doesNotThrow(()=>experiment.validateStampReceipt(h.receipt,v));
    for(const mutate of[
      r=>{r.copyAllocations=0;},r=>{r.listBit=!r.listBit;},r=>{r.revisionBit=!r.revisionBit;},
      r=>{r.identities.copyDistinct=false;},r=>{r.identities.selectionSame=false;},r=>{r.identities.undoArraySame=false;},
      r=>{r.rows[0].strokeSame[0]=false;},r=>{r.rows[0].pointArraysSame[0]=false;},r=>{r.rows[0].pointSame[0][0]=false;},
      r=>{r.after.editRevision++;},r=>{r.after.updated[0]='changed timestamp';},r=>{r.after.revisions[1]++;},
      r=>{r.after.undoDepth++;},r=>{r.after.selectionTargetX+=5e-10;},r=>{r.after.gesture=true;},
      r=>{r.inkAfter+=' ';},r=>{r.undo[0].before.pointSame[0][0]=false;},r=>{r.undo[0].entrySame=false;},
    ]){const receipt=structuredClone(h.receipt);mutate(receipt);assert.throws(()=>experiment.validateStampReceipt(receipt,v));}
  }
});
test('receipt must originate from the actual finally collection and agree with raw observed close transitions',async()=>{
  for(const name of interventions){const h=await runEvents(name),v=variant(name);assert.equal(h.records.filter(x=>x.kind==='stamp-receipt').length,1);assert.deepEqual(h.records.at(-1),{kind:'stamp-receipt',receipt:h.receipt});assert.doesNotThrow(()=>experiment.validateStampEvidence(h.records,v,h.receipt));
    for(const mutate of[
      t=>t.splice(t.findIndex(x=>x.kind==='stamp-receipt'),1),
      t=>t.push(structuredClone(t.at(-1))),
      t=>{t.at(-1).receipt.copyAllocations=2;},
      t=>{record(t,'surface','before media close').revisionDelta++;},
      t=>{record(t,'surface','after media close sync').editRevisionDelta++;},
      t=>{record(t,'surface','after media close sync').selectionPresent=true;},
    ]){const trace=structuredClone(h.records);mutate(trace);assert.throws(()=>experiment.validateStampEvidence(trace,v,h.receipt));}
  }
});
async function comparisonCases(){const cases=[];for(const name of names){const h=await runEvents(name),failed=['A','T'].includes(name),checks=checkList(name,failed);cases.push({variant:name,engine:'webkit',checks,terminalMetric:checks.find(x=>x.label===variant(name).label),casePassed:!failed,caseError:failed?failure(name):null,endpoint:normalize(h),stampEvidence:experiment.validateStampEvidence(h.records,variant(name),h.receipt),receipt:h.receipt});}return cases;}
function refreshReceipt(row){const trace=row.stampEvidence.rawTrace;trace.find(x=>x.kind==='stamp-receipt').receipt=row.receipt;row.stampEvidence=experiment.validateStampEvidence(trace,variant(row.variant),row.receipt);}
test('interpretable factorial contrasts require fresh A and T failure plus clean M and clean allocation sham',async()=>{
  const cases=await comparisonCases(),[result]=experiment.classifyComparisons(cases);assert.equal(result.status,'controlled-stamp-observation');assert.equal(result.interpretable,true);assert.equal(result.realControls.AReproduced,true);assert.equal(result.realControls.MClean,true);assert.equal(result.TReproduced,true);assert.equal(result.shamClean,true);assert.equal(result.endpointsEqual,true);assert.deepEqual(result.comparisons.map(x=>[x.from,x.to]),[['S00','L10'],['S00','R01'],['L10','B11'],['R01','B11']]);assert.equal(Object.hasOwn(result,'cause'),false);
  for(const [name,failed,status]of[['A',false,'inconclusive-real-controls'],['M',true,'inconclusive-real-controls'],['T',false,'inconclusive-T-did-not-reproduce'],['S00',true,'inconclusive-sham-no-longer-clean']]){const rows=structuredClone(cases),row=rows.find(x=>x.variant===name);row.checks=checkList(name,failed);row.terminalMetric=row.checks.find(x=>x.label===variant(name).label);row.casePassed=!failed;row.caseError=failed?failure(name):null;const result=experiment.classifyComparisons(rows)[0];assert.equal(result.status,status);assert.equal(result.interpretable,false);}
});
test('internally coherent receipts are still bound to the actual measured ink and absolute revisions',async()=>{
  const cases=await comparisonCases();for(const mutate of[
    r=>{const ink=JSON.parse(r.inkBefore);ink[1].strokes[0].points[0].x++;r.inkBefore=r.inkAfter=JSON.stringify(ink);},
    r=>{r.before.revisions[0]++;r.after.revisions[0]++;},
  ]){const rows=structuredClone(cases),row=rows.find(x=>x.variant==='R01');mutate(row.receipt);assert.doesNotThrow(()=>experiment.validateStampReceipt(row.receipt,variant('R01')));refreshReceipt(row);assert.throws(()=>experiment.classifyComparisons(rows),'Equal before/after strings alone cannot replace terminal binding');}
  const receipt=structuredClone(cases.find(x=>x.variant==='S00').receipt),selection=JSON.parse(receipt.selectionBefore);selection.target.points[0].x+=5e-10;receipt.selectionBefore=receipt.selectionAfter=JSON.stringify(selection);assert.throws(()=>experiment.validateStampReceipt(receipt,variant('S00')),'Selection is bound to the actual active ink, not merely to itself');
});
test('raw tiny endpoint divergence is inconclusive even with coherent receipt and evidence; forged outcomes fail closed',async()=>{
  const cases=await comparisonCases(),rows=structuredClone(cases),row=rows.find(x=>x.variant==='S00'),point=row.endpoint.normalizedInk[0].strokes[0].points[0],oldX=point.x,oldY=point.y;point.x+=5e-10;const nextX=point.x;assert.notEqual(nextX,oldX);assert.ok(Math.abs(nextX-oldX)<1e-9);
  const rewrite=value=>{if(!value||typeof value!=='object')return;if(value.x===oldX&&value.y===oldY)value.x=nextX;for(const child of Object.values(value))rewrite(child);};
  for(const key of ['inkBefore','inkAfter','undoBefore','undoAfter','selectionBefore','selectionAfter']){const value=JSON.parse(row.receipt[key]);rewrite(value);row.receipt[key]=JSON.stringify(value);}row.receipt.before.selectionTargetX=row.receipt.after.selectionTargetX=nextX;
  let committed=false;for(const r of row.stampEvidence.rawTrace){if(r.kind!=='gesture-history')continue;if(r.phase==='after'&&r.label==='pointerup')committed=true;if(committed)r.targetX=nextX;}
  rehash(row.endpoint);refreshReceipt(row);const mismatch=experiment.classifyComparisons(rows)[0];assert.equal(mismatch.status,'inconclusive-terminal-mismatch');assert.equal(mismatch.interpretable,false);assert.equal(mismatch.endpointsEqual,false);
  for(const mutate of[
    r=>{r.stampEvidence={...r.stampEvidence,valid:true,records:[],rawTrace:[]};},
    r=>{r.stampEvidence.mode='stamp-both';},
    r=>{r.stampEvidence.records=structuredClone(r.stampEvidence.records);r.stampEvidence.records[0].targetX++;},
    r=>{r.receipt=null;},r=>{r.casePassed=false;r.caseError='Error: unrelated save failure';},r=>{r.checks[0].alphaMax=64;},
    r=>{r.terminalMetric={...r.terminalMetric,alphaMax:1};},r=>{r.endpoint.normalizedInkSha256='0'.repeat(64);},r=>{r.endpoint.geometrySha256='0'.repeat(64);},
    r=>{r.endpoint.normalizedInk[0].strokes[0].points[0].x+=5e-10;rehash(r.endpoint);},
    r=>{r.endpoint.normalizedInk[0].strokes[0].points[0].x=NaN;rehash(r.endpoint);},
  ]){const changed=structuredClone(cases);mutate(changed.find(x=>x.variant==='S00'));assert.throws(()=>experiment.classifyComparisons(changed));}
  assert.throws(()=>experiment.classifyComparisons(cases.slice(1)));const duplicate=structuredClone(cases);duplicate.at(-1).variant='S00';assert.throws(()=>experiment.classifyComparisons(duplicate));
});
