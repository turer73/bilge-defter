'use strict';
// Pure harness contracts, not raster/browser acceptance. Root executes tests.
// Pinned real gesture/commit/cancel/touchPage functions run in a VM, but DOM hit
// testing is target injection and constrainMedia is mocked for interior points.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const experiment=require('./diagnose-ink-close-timing.cjs'),two=require('./diagnose-ink-two-commit.cjs'),history=require('./diagnose-ink-history.cjs');
const canonical=fs.readFileSync(path.join(__dirname,'verify-slide-flow.cjs'),'utf8'),media=fs.readFileSync(path.join(__dirname,'bilge-defter-invited-v78/media-workspace.js'),'utf8'),index=fs.readFileSync(path.join(__dirname,'bilge-defter-invited-v78/index.html'),'utf8'),gestureFixture=fs.readFileSync(path.join(__dirname,'test-ink-gesture.cjs'),'utf8'),twoFixture=fs.readFileSync(path.join(__dirname,'test-ink-two-commit.cjs'),'utf8');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex'),plain=value=>JSON.parse(JSON.stringify(value)),names=['A','M','T','S','E','L'],cells=['S','E','L'];
function variant(name){const v=experiment.VARIANTS.find(x=>x.name===name);assert.ok(v,'Declared timing variant');return v;}
function changed(name){return experiment.transformRunner(canonical,variant(name));}
function between(source,start,end){assert.equal(source.split(start).length,2,'Unique start '+start);const from=source.indexOf(start),to=source.indexOf(end,from);assert.ok(to>from,'Ordered end '+end);return source.slice(from,to);}
function metric(label,failed=false){return{label,alphaMax:failed?64:0,compositedMax:0,compositedMeanForeground:0,compositedOver16:0,foregroundPixels:1000};}
function checkList(name,failed=false){return['initial','pen','eraser',variant(name).label,...(name==='A'?['zoom']:[])].map(label=>metric(label,label===variant(name).label&&failed));}
function failure(name){return'AssertionError [ERR_ASSERTION]: '+variant(name).label+': alpha deviation\n    at original quality loop';}
function record(trace,phase,label,n=0){const matches=trace.filter(x=>x.kind==='gesture-history'&&x.phase===phase&&x.label===label);assert.ok(matches[n]);return matches[n];}
function makeHarness(name){
  assert.equal(sha(gestureFixture),'e7fb70eaddf0864cb8d29f172613c4617c6d83b7461c7ce81245089b912f55f6');const helper=between(gestureFixture,'function oneLineFunction(','\nasync function runEvents('),h=vm.runInNewContext(helper+'\neventHarness;',{assert,structuredClone,Math,Map,Set,JSON,media,index,between,changed,vm},{timeout:1000})(name),s=h.sandbox;
  // Simulated old backing size only. These VM dimensions are not browser proof;
  // endpoint geometry below is the independent fixed closed-size fixture.
  h.host.width=2260;h.host.height=1482;
  h.observed={evaluations:0,before:null,after:null,cancelBefore:null,cancelAfter:null,closeDraws:[],insideCancel:false,touches:0};
  const snapshot=()=>({list:h.page.strokes,strokes:[...h.page.strokes],points:h.page.strokes.map(x=>x.points),pointRefs:h.page.strokes.flatMap(x=>x.points),ink:JSON.stringify(h.page.strokes),revision:s.pageRevs.get(h.page),editRevision:s.editRevision,updated:h.page.updated,undo:s.mediaUndo.get('p0'),undoEntries:[...(s.mediaUndo.get('p0')||[])],selection:s.mediaSelection,selecting:s.mediaSelecting,gesture:s.mediaGesture,pending:s.mediaPending,saves:h.calls.saves,draws:h.calls.draws});
  const touch=s.touchPage;s.touchPage=p=>{h.observed.touches++;return touch(p);};const draw=s.drawAll;s.drawAll=()=>{if(h.observed.insideCancel)h.observed.closeDraws.push(snapshot());return draw();};
  const cancel=s.cancelMediaMode;s.cancelMediaMode=()=>{h.observed.cancelBefore=snapshot();h.observed.insideCancel=true;try{return cancel();}finally{h.observed.insideCancel=false;h.observed.cancelAfter=snapshot();}};
  const evaluate=s.p.evaluate;s.p.evaluate=async(fn,arg)=>{h.observed.evaluations++;const closing=fn.toString().includes("__recordInkSurface('before media close')");if(closing)h.observed.before=snapshot();const result=await evaluate(fn,arg);if(closing)h.observed.after=snapshot();return result;};return h;
}
const runFunction=between(twoFixture,'\nasync function runEvents(name,fault={}){','\nfunction normalize(h){');
async function runEvents(name){assert.equal(sha(twoFixture),'40fe1977e9450012d1abe309dc902e94095e5d4e058868d805086de07dd9f6fe');const h=await vm.runInNewContext(runFunction+'\nrunEvents;',{assert,makeHarness,metric,variant,between,plain,vm},{timeout:1000})(name);const collect=between(h.source,'diagnostic.trace=await p.evaluate(','if(!diagnostic.operations)');vm.runInContext('globalThis.collectUnderTest=async()=>{'+collect+'};',h.sandbox,{timeout:1000});await h.sandbox.collectUnderTest();h.records=plain(h.sandbox.diagnostic.trace);h.receipt=h.records.find(x=>x.kind==='close-timing-receipt')?.receipt||null;return h;}
function normalize(h){const adapter={normalizeAudit:value=>history.normalizeAudit(plain(value))};return vm.runInNewContext(between(twoFixture,'\nfunction normalize(h){','\nfunction rehash(e){')+'\nnormalize;',{history:adapter},{timeout:1000})(h);}
function rehash(e){e.normalizedInkSha256=sha(JSON.stringify(e.normalizedInk));e.geometrySha256=sha(JSON.stringify(e.geometry));}
// Metadata fixture, not a raster oracle: execute the ACTUAL canonical observer
// over mock Canvas2D calls. No pixels are created/read and no browser is involved.
function rasterOperations(early){
  class Surface{constructor(width,height){this.width=width;this.height=height;}}
  class Context{constructor(canvas){Object.assign(this,{canvas,t:[2,0,0,2,0,0],globalAlpha:1,globalCompositeOperation:'source-over',lineWidth:3,lineCap:'round',lineJoin:'round',miterLimit:10,lineDashOffset:0,filter:'none',shadowColor:'rgba(0,0,0,0)',shadowBlur:0,shadowOffsetX:0,shadowOffsetY:0,imageSmoothingEnabled:true,imageSmoothingQuality:'low'});}getTransform(){const[a,b,c,d,e,f]=this.t;return{a,b,c,d,e,f};}getLineDash(){return[];}drawImage(){}stroke(){}fill(){}beginPath(){}rect(){}clip(){}save(){}restore(){}}
  const canvas=new Surface(2260,1482),ctx=new Context(canvas),pdfCanvas=new Surface(2260,1482),pages=[223,200].map((n,row)=>({id:'p'+row,strokes:Array.from({length:n},(_,i)=>({tool:'pen',width:3,color:'#000',points:[{x:i,y:row+1,p:.5}]}))}));
  const scope={window:{},CanvasRenderingContext2D:Context,HTMLCanvasElement:Surface,canvas,ctx,pdfCanvas,notebookPages:()=>pages,mediaSelecting:false,mediaGesture:null,drawing:false,drawStroke:(stroke,target)=>{target.fill();target.stroke();}};vm.createContext(scope);vm.runInContext(between(canonical,'function traceInkFixture(){','\nfunction controlledInkRaster(){')+'\ntraceInkFixture();',scope,{timeout:1000});
  function phase(label,width,height,rowCounts,copies){scope.window.__inkTracePhase=label;canvas.width=width;canvas.height=height;const scratch=new Context(new Surface(width,height));
    rowCounts.forEach((n,row)=>{scratch.t=[1.676,0,0,1.676,0,row?983.812:0];scratch.save();scratch.beginPath();scratch.rect(0,0,1000,563);scratch.clip();for(let i=0;i<n;i++)scope.drawStroke(pages[row].strokes[i],scratch);
      for(let i=0;i<copies[row];i++){const tile=new Surface(100,100),tileContext=new Context(tile);tileContext.drawImage(scratch.canvas,0,0,100,100,0,0,100,100);ctx.drawImage(tile,0,0,100,100,0,0,100,100);}scratch.restore();});
  }
  if(early)phase('before media close',2260,1482,[223],[15]);
  phase('after media close sync',1676,1318,[223,200],[8,4]);return plain(scope.window.__finishInkTrace());
}

test('frozen source handlers and A/M/T controls remain pinned and byte-exact',()=>{
  assert.equal(sha(canonical),'f2cb459827c1d725d6df1f22c6ff12047a02d415a7d26b8eb65f3eaa769de8d0');assert.equal(sha(media),'f25586bc8d2aa2abd6bade5a5304ff31b72c8bc427a55f9afefae6ee2fb5af31');assert.equal(sha(fs.readFileSync(path.join(__dirname,'diagnose-ink-two-commit.cjs'))),'61c4e18d8cf4f56f457c042ee325677ff440708f4e45bf8a6da3f419f18543d1');assert.deepEqual(experiment.VARIANTS.map(x=>x.name),names);
  for(const name of names)assert.doesNotThrow(()=>new vm.Script(changed(name).source,{filename:'timing-'+name+'.cjs'}));for(const name of ['A','M','T'])assert.equal(changed(name).source,two.transformRunner(canonical,two.VARIANTS.find(x=>x.name===name)).source);
});
test('source drift and extra interventions reject, while complete audit and quality guards stay byte-identical',()=>{
  assert.throws(()=>experiment.transformRunner(canonical+'\n',variant('S')));assert.throws(()=>experiment.transformRunner(canonical,{name:'unknown'}));assert.throws(()=>experiment.transformRunner(canonical,{...variant('S'),extra:true}));
  const start="      window.__inkTracePhase='audit: '+label;",end='    },label);',body=between(canonical,start,end),gate=canonical.split('\n').find(x=>x.includes('for(const result of checks){assert.ok(result.foregroundPixels>0);'));assert.ok(gate);
  for(const name of names){const source=changed(name).source;assert.equal(between(source,start,end),body);assert.equal(source.split(gate).length-1,1);const good=metric(variant(name).label);vm.runInNewContext(gate,{assert,checks:[good]},{timeout:1000});for(const bad of [{foregroundPixels:0},{alphaMax:33},{compositedMax:33},{compositedMeanForeground:1.001},{compositedOver16:3}])assert.throws(()=>vm.runInNewContext(gate,{assert,checks:[{...good,...bad}]},{timeout:1000}));}
});
test('actual cancel draws see the new list only for early assignment, without added callbacks draws saves or revisions',async()=>{
  const m=await runEvents('M');for(const name of cells){const h=await runEvents(name),o=h.observed,b=o.before,a=o.after;assert.ok(b&&a&&o.cancelBefore&&o.cancelAfter);assert.equal(o.closeDraws.length,1);assert.equal(o.closeDraws.length,m.observed.closeDraws.length);
    assert.equal(o.cancelBefore.list===b.list,name!=='E');assert.equal(o.closeDraws[0].list===b.list,name!=='E');assert.equal(o.cancelAfter.list===b.list,name!=='E');assert.equal(a.list===b.list,name==='S');if(name!=='S')assert.equal(a.list===o.closeDraws[0].list,name==='E');
    assert.equal(o.cancelBefore.selecting,true);assert.equal(o.closeDraws[0].selecting,false);assert.equal(o.closeDraws[0].selection,null);assert.equal(o.cancelAfter.selecting,false);assert.equal(a.selection,null);assert.equal(a.gesture,null);assert.equal(a.pending,null);
    assert.equal(a.ink,b.ink);assert.equal(a.revision,b.revision);assert.equal(a.editRevision,b.editRevision);assert.equal(a.updated,b.updated);assert.equal(a.undo,b.undo);assert.deepEqual(a.undoEntries,b.undoEntries);a.strokes.forEach((s,i)=>assert.equal(s,b.strokes[i]));a.points.forEach((p,i)=>assert.equal(p,b.points[i]));a.pointRefs.forEach((p,i)=>assert.equal(p,b.pointRefs[i]));
    assert.equal(a.saves,b.saves);assert.equal(a.draws-b.draws,m.observed.after.draws-m.observed.before.draws);assert.equal(o.evaluations,m.observed.evaluations);assert.equal(o.touches,m.observed.touches);assert.deepEqual(plain(h.calls.actions),plain(m.calls.actions));assert.deepEqual(plain(h.page.strokes),plain(m.page.strokes));assert.equal(h.calls.realCommits,1);assert.equal(h.calls.readbacks,0);assert.equal(h.sandbox.mediaUndo.get('p0').length,1);
  }
});
test('non-A endpoints retain failure metadata but omit post-terminal draws saves zooms and screenshots',async()=>{
  for(const name of names){const h=await runEvents(name);assert.deepEqual(plain(h.calls.audits),name==='A'?['media undo','zoom']:[variant(name).label]);assert.deepEqual(plain(h.result.checks.map(x=>x.label)),checkList(name).map(x=>x.label));assert.equal(h.calls.tailSaves,name==='A'?1:0);assert.equal(h.calls.screenshots,name==='A'?1:0);assert.deepEqual(plain(h.calls.zoom),name==='A'?[1.5]:[]);assert.equal(h.calls.cold,0);
    let reads=0,pictures=0,finished=0;const report={results:[]},f={goto:async()=>{},finish:async()=>finished++,p:{evaluate:async()=>{reads++;return{};},screenshot:async()=>pictures++}},scope={caseFilter:null,assert,console:{log(){},error(){}},fixture:async()=>f,report,path,out:'/not-written'};vm.createContext(scope);vm.runInContext(between(changed(name).source,'async function check(','\nfunction traceInkFixture(')+'\nglobalThis.checkUnderTest=check;',scope,{timeout:1000});await scope.checkUnderTest({},'webkit','timing',async()=>{throw Error('original-timing-error');});assert.equal(reads,1);assert.equal(finished,1);assert.equal(pictures,name==='A'?1:0);assert.equal(report.results[0].passed,false);assert.match(report.results[0].error,/original-timing-error/);
  }
});
test('only exact terminal quality failures are diagnostic, never unrelated runtime or earlier measurement failures',()=>{
  for(const name of names){assert.equal(experiment.validateCaseOutcome({passed:true,error:null},checkList(name),variant(name)).terminalEnvelopeFailed,false);assert.equal(experiment.validateCaseOutcome({passed:false,error:failure(name)},checkList(name,true),variant(name)).terminalEnvelopeFailed,true);
    for(const [result,checks]of[[{passed:true,error:null},checkList(name,true)],[{passed:false,error:'Error: save failed'},checkList(name)],[{passed:true,error:'unexpected error'},checkList(name)],[{passed:false,error:failure(name)},checkList(name,true).slice(1)],[{passed:false,error:'Error: '+variant(name).label+': alpha deviation'},checkList(name,true)]])assert.throws(()=>experiment.validateCaseOutcome(result,checks,variant(name)));
    for(const label of ['initial','pen','eraser',...(name==='A'?['zoom']:[])]){const checks=checkList(name,true);checks.find(x=>x.label===label).alphaMax=64;assert.throws(()=>experiment.validateCaseOutcome({passed:false,error:failure(name)},checks,variant(name)));}
  }
});

test('serialized checkpoints and shallow-copy retention distinguish assignment from real close cleanup',async()=>{
  for(const name of cells){const h=await runEvents(name),v=variant(name),keep=h.sandbox.window.__inkCloseTimingRetention,r=h.receipt;
    assert.deepEqual(Object.keys(keep).sort(),['copy','oldList','owner','refs','selection','undo','undoRefs']);assert.equal(keep.owner,h.page);assert.equal(keep.oldList,h.observed.before.list);assert.notEqual(keep.copy,keep.oldList);keep.copy.forEach((stroke,i)=>assert.equal(stroke,keep.oldList[i]));assert.equal(h.page.strokes,name==='S'?keep.oldList:keep.copy);assert.equal(keep.undo,h.observed.before.undo);assert.equal(keep.selection,h.observed.before.selection);
    assert.equal(r.initial.scalar.mediaSelecting,true);assert.equal(r.beforeClose.scalar.mediaSelecting,true);assert.equal(r.afterClose.scalar.mediaSelecting,false);assert.equal(r.final.scalar.mediaSelecting,false);assert.equal(r.afterClose.selection,'null');assert.equal(r.final.selection,'null');assert.doesNotThrow(()=>experiment.validateTimingReceipt(r,v));assert.doesNotThrow(()=>experiment.validateTimingEvidence(h.records,v,r));
    assert.throws(()=>vm.runInContext('('+experiment.installCloseTimingIntervention.toString()+')('+JSON.stringify(v.timing)+');',h.sandbox,{timeout:1000}),/Single bounded/);
    const p=changed(name).provenance;assert.equal(p.timingObserverBrowserCallsAdded,0);assert.equal(p.timingObserverDrawCallsAdded,0);assert.equal(p.timingObserverRasterReadsAdded,0);assert.equal(p.allocationCount,1);assert.equal(p.MByteExact,false);assert.equal(p.ancestorMByteExact,true);assert.deepEqual(p.mutation,{assignment:v.timing,touchPage:false,scheduleSave:false});
  }
});
test('four-checkpoint validation rejects disguised data revision undo reference timing and cleanup changes',async()=>{
  for(const name of cells){const h=await runEvents(name);for(const mutate of[
    r=>{r.timing='invalid';},r=>{r.copyAllocations=2;},r=>{r.strokeCount++;},r=>{r.pointCount++;},
    r=>{r.beforeClose.scalar.revisions[0]++;},r=>{r.afterClose.scalar.editRevision++;},r=>{r.final.scalar.updated[0]='different';},
    r=>{r.beforeClose.scalar.undoDepth=0;},r=>{r.afterClose.scalar.mediaSelecting=true;},r=>{r.final.scalar.selectionPresent=true;},
    r=>{r.beforeClose.scalar.gesture=true;},r=>{r.afterClose.scalar.pending=true;},r=>{r.final.scalar.placement=true;},
    r=>{r.initial.scalar.selectionTargetX=NaN;},r=>{r.beforeClose.scalar.selectionTargetX+=5e-10;},
    r=>{r.afterClose.selection=r.initial.selection;},r=>{r.beforeClose.identities.currentIsCopy=!r.beforeClose.identities.currentIsCopy;},
    r=>{r.final.identities.undoArraySame=false;},r=>{r.afterClose.rows[0].listSame=!r.afterClose.rows[0].listSame;},
    r=>{r.final.rows[0].strokeSame[0]=false;},r=>{r.final.rows[0].pointArraysSame[0]=false;},r=>{r.final.rows[0].pointSame[0][0]=false;},
    r=>{r.final.undoRefs[0].entrySame=false;},r=>{r.afterClose.undoRefs[0].before.pointSame[0][0]=false;},
    r=>{r.final.ink+=' ';},r=>{r.final.undo+=' ';},
  ]){const r=structuredClone(h.receipt);mutate(r);assert.throws(()=>experiment.validateTimingReceipt(r,variant(name)));}}
});
test('the real finally receipt is mandatory and cannot hide missing gestures or unexpected close state',async()=>{
  for(const name of cells){const h=await runEvents(name);assert.deepEqual(h.records.at(-1),{kind:'close-timing-receipt',receipt:h.receipt});for(const mutate of[
    t=>t.pop(),t=>t.push(structuredClone(t.at(-1))),t=>t.push({label:'unexpected later record'}),
    t=>{record(t,'after','pointermove').gestureMoved=false;},t=>{record(t,'after','pointerup').undoDepth=0;},
    t=>{record(t,'surface','before media close').revisionDelta++;},t=>{record(t,'surface','after media close sync').editRevisionDelta++;},
    t=>{record(t,'surface','after media close sync').selectionPresent=true;},t=>{record(t,'surface','after media close sync').pending=true;},
    t=>{t.at(-1).receipt.initial.scalar.selectionTargetX+=5e-10;},
  ]){const trace=structuredClone(h.records);mutate(trace);assert.throws(()=>experiment.validateTimingEvidence(trace,variant(name),h.receipt));}}
});
test('actual canonical metadata hooks join old and final row replays to clips and bounded copies',async()=>{
  for(const name of cells){const h=await runEvents(name),ops=rasterOperations(name==='E'),result=experiment.validateRasterPhases(ops,h.records,normalize(h),variant(name));assert.equal(result.valid,true);assert.equal(result.oldRebuild,name==='E');assert.equal(result.finalRebuild,true);assert.equal(result.dropped,0);assert.equal(result.droppedCalls,0);assert.deepEqual(result.joined.map(x=>[x.width,x.height,x.row,x.calls,x.copyEntries.length]),name==='E'?[[2260,1482,0,223,15],[1676,1318,0,223,8],[1676,1318,1,200,4]]:[[1676,1318,0,223,8],[1676,1318,1,200,4]]);}
});
test('labels alone cannot substitute for ordered correct-size clips replay calls and actual integer copy chains',async()=>{
  const h=await runEvents('E'),endpoint=normalize(h),base=rasterOperations(true),finalPhase='after media close sync';
  const scratchCopy=o=>o.entries.find(e=>e.op==='drawImage'&&e.target.canvas!=='main');const mainCopy=o=>o.entries.find(e=>e.op==='drawImage'&&e.target.canvas==='main');
  const check=(o,trace=h.records,e=endpoint,v=variant('E'))=>experiment.validateRasterPhases(o,trace,e,v);
  for(const mutate of[
    o=>{o.dropped=1;},o=>{o.droppedCalls=1;},o=>{o.callCount++;},o=>{o.entries=[];},o=>{o.callGroups=[];o.callCount=0;},
    o=>{o.callGroups[0].calls[0]=[0,1];},o=>{o.callGroups[0].transform[0]='NaN';},
    o=>{o.entries.find(e=>e.op==='clip').state.width++;},o=>{o.entries.find(e=>e.op==='clip').state.clip.at(-1).rects[0].rect[3]++;},
    o=>{o.entries.find(e=>e.op==='fill').state.height++;},o=>{o.entries.find(e=>e.op==='fill').phase='fake-phase';},
    o=>{scratchCopy(o).source.width++;},o=>{scratchCopy(o).source.id='nonexistent';},o=>{scratchCopy(o).coordinates[0]=.5;},
    o=>{scratchCopy(o).coordinates[6]++;},o=>{scratchCopy(o).coordinates[0]=99999;},o=>{mainCopy(o).source.id='unrelated-tile';},
    o=>{o.entries.splice(o.entries.findIndex(e=>e.op==='drawImage'&&e.target.canvas==='main'),1);},
    o=>{o.entries.push(structuredClone(o.entries.find(e=>e.op==='drawImage'&&e.target.canvas==='main')));},
    o=>{o.callGroups=o.callGroups.filter(g=>g.phase!==finalPhase);o.callCount=o.callGroups.reduce((n,g)=>n+g.calls.length,0);},
    o=>{const i=o.entries.findIndex(e=>e.phase==='before media close'&&e.op==='fill');o.entries.push(o.entries.splice(i,1)[0]);},
  ]){const o=structuredClone(base);mutate(o);assert.throws(()=>check(o));}
  assert.throws(()=>check(rasterOperations(false)));for(const name of ['S','L'])assert.throws(()=>check(base,h.records,endpoint,variant(name)));
  for(const mutate of[t=>{t.find(x=>x.width!==undefined&&x.label==='before media close').width=1676;},t=>{t.find(x=>x.width!==undefined&&x.label==='after media close sync').mediaSelecting=true;},t=>t.push(structuredClone(t.find(x=>x.width!==undefined&&x.label==='before media close')))]){const trace=structuredClone(h.records);mutate(trace);assert.throws(()=>check(base,trace));}
  // A matching tile ID is insufficient if composition predates its write or
  // changes its sample geometry. These are independent of phase-label checks.
  for(const mutate of[
    o=>{const i=o.entries.findIndex(e=>e.op==='drawImage'&&e.target.canvas==='main'),entry=o.entries.splice(i,1)[0],j=o.entries.findIndex(e=>e.op==='drawImage'&&e.target.canvas!=='main');o.entries.splice(j,0,entry);},
    o=>{mainCopy(o).coordinates[0]=NaN;},o=>{mainCopy(o).coordinates[6]++;},o=>{mainCopy(o).coordinates[4]=99999;},
    o=>{mainCopy(o).coordinates[4]++;},
    o=>{const c=mainCopy(o).coordinates;c[0]=1;c[2]=99;c[6]=99;},
  ]){const o=structuredClone(base);mutate(o);assert.throws(()=>check(o));}
});
async function comparisonCases(){const cases=[];for(const name of names){const h=await runEvents(name),failed=['A','T','E'].includes(name),checks=checkList(name,failed),endpoint=normalize(h),ops=cells.includes(name)?rasterOperations(name==='E'):null;cases.push({variant:name,engine:'webkit',checks,terminalMetric:checks.find(x=>x.label===variant(name).label),casePassed:!failed,caseError:failed?failure(name):null,endpoint,timingEvidence:experiment.validateTimingEvidence(h.records,variant(name),h.receipt),receipt:h.receipt,operations:ops,rasterEvidence:ops?experiment.validateRasterPhases(ops,h.records,endpoint,variant(name)):null});}return cases;}
function refreshReceipt(row){const trace=row.timingEvidence.rawTrace;trace.find(x=>x.kind==='close-timing-receipt').receipt=row.receipt;row.timingEvidence=experiment.validateTimingEvidence(trace,variant(row.variant),row.receipt);}
function setOutcome(row,failed){row.checks=checkList(row.variant,failed);row.terminalMetric=row.checks.find(x=>x.label===variant(row.variant).label);row.casePassed=!failed;row.caseError=failed?failure(row.variant):null;}
test('timing interpretation requires reproduced A and T failing early clean M and clean balanced sham',async()=>{
  const cases=await comparisonCases(),result=experiment.classifyComparisons(cases)[0];assert.equal(result.status,'controlled-close-timing-observation');for(const key of ['interpretable','TReproduced','shamClean','earlyReproduced','endpointsEqual'])assert.equal(result[key],true);assert.equal(result.realControls.AReproduced,true);assert.equal(result.realControls.MClean,true);assert.equal(result.lateEnvelopeFailed,false);assert.equal(Object.hasOwn(result,'cause'),false);assert.equal(Object.hasOwn(result,'releaseEligible'),false);
  for(const [name,failed,status]of[['A',false,'inconclusive-real-controls'],['M',true,'inconclusive-real-controls'],['T',false,'inconclusive-real-controls'],['S',true,'inconclusive-sham-no-longer-clean'],['E',false,'inconclusive-early-did-not-reproduce']]){const rows=structuredClone(cases);setOutcome(rows.find(x=>x.variant===name),failed);const r=experiment.classifyComparisons(rows)[0];assert.equal(r.status,status);assert.equal(r.interpretable,false);}
  const lateFails=structuredClone(cases);setOutcome(lateFails.find(x=>x.variant==='L'),true);assert.equal(experiment.classifyComparisons(lateFails)[0].lateEnvelopeFailed,true,'Either late outcome is reported, not forced clean');
});
test('internally consistent receipt values and revisions must also match the measured endpoint',async()=>{
  const cases=await comparisonCases();for(const mutate of[
    r=>{const ink=JSON.parse(r.initial.ink);ink[1].strokes[0].points[0].x++;for(const key of ['initial','beforeClose','afterClose','final'])r[key].ink=JSON.stringify(ink);},
    r=>{for(const key of ['initial','beforeClose','afterClose','final'])r[key].scalar.revisions[0]++;},
  ]){const rows=structuredClone(cases),row=rows.find(x=>x.variant==='L');mutate(row.receipt);assert.doesNotThrow(()=>experiment.validateTimingReceipt(row.receipt,variant('L')));refreshReceipt(row);assert.throws(()=>experiment.classifyComparisons(rows),'Self-consistent receipt is not measured endpoint evidence');}
});
test('coherent subpixel final-model drift remains inconclusive without rounding or normalization',async()=>{
  const cases=await comparisonCases(),row=cases.find(x=>x.variant==='L'),point=row.endpoint.normalizedInk[0].strokes[0].points[0],oldX=point.x,oldY=point.y;point.x+=5e-10;const nextX=point.x;assert.notEqual(nextX,oldX);assert.ok(Math.abs(nextX-oldX)<1e-9);
  const rewrite=value=>{if(!value||typeof value!=='object')return;if(value.x===oldX&&value.y===oldY)value.x=nextX;for(const child of Object.values(value))rewrite(child);};
  for(const name of ['initial','beforeClose','afterClose','final']){const cp=row.receipt[name];for(const key of ['ink','undo','selection']){const value=JSON.parse(cp[key]);rewrite(value);cp[key]=JSON.stringify(value);}if(cp.scalar.selectionTargetX!==null)cp.scalar.selectionTargetX=nextX;}
  let committed=false;for(const r of row.timingEvidence.rawTrace){if(r.kind!=='gesture-history')continue;if(r.phase==='after'&&r.label==='pointerup')committed=true;if(committed)r.targetX=nextX;}
  rehash(row.endpoint);refreshReceipt(row);const result=experiment.classifyComparisons(cases)[0];assert.equal(result.status,'inconclusive-terminal-mismatch');assert.equal(result.interpretable,false);assert.equal(result.endpointsEqual,false);
});
test('classifier revalidates raw receipt operations outcomes and hashes instead of trusting valid flags',async()=>{
  const cases=await comparisonCases();for(const mutate of[
    r=>{r.timingEvidence={...r.timingEvidence,valid:true,records:[],rawTrace:[]};},r=>{r.timingEvidence.mode='wrong-mode';},
    r=>{r.timingEvidence.records=structuredClone(r.timingEvidence.records);r.timingEvidence.records[0].targetX++;},
    r=>{r.receipt=null;},r=>{r.rasterEvidence={valid:true};},r=>{r.operations=null;},r=>{r.operations.droppedCalls=1;},
    r=>{r.casePassed=false;r.caseError='Error: unexpected save failure';},r=>{r.checks[0].alphaMax=64;},r=>{r.terminalMetric={...r.terminalMetric,alphaMax:1};},
    r=>{r.endpoint.normalizedInkSha256='0'.repeat(64);},r=>{r.endpoint.geometrySha256='0'.repeat(64);},
    r=>{r.endpoint.normalizedInk[0].strokes[0].points[0].x+=5e-10;rehash(r.endpoint);},
    r=>{r.endpoint.geometry.width++;rehash(r.endpoint);},r=>{r.endpoint.mediators.pageRevisions[0].revision++;},
  ]){const rows=structuredClone(cases);mutate(rows.find(x=>x.variant==='L'));assert.throws(()=>experiment.classifyComparisons(rows));}
  assert.throws(()=>experiment.classifyComparisons(cases.slice(1)));const duplicates=structuredClone(cases);duplicates.at(-1).variant='S';assert.throws(()=>experiment.classifyComparisons(duplicates));
});
