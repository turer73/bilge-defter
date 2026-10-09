'use strict';
// Pure contracts for the diagnostic copy. Root owns execution, never this file.
// Reuse pinned real application handlers; no browser, server or app bootstrap.
// VM event delivery injects the selected text target directly (no DOM hit test)
// and uses identity constrainMedia for interior geometry. Browser evidence must
// independently validate the real hit-test path and exact final raw coordinates.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const experiment=require('./diagnose-ink-return.cjs'),endpoint=require('./diagnose-ink-endpoint.cjs'),history=require('./diagnose-ink-history.cjs');
const canonical=fs.readFileSync(path.join(__dirname,'verify-slide-flow.cjs'),'utf8'),media=fs.readFileSync(path.join(__dirname,'bilge-defter-invited-v78/media-workspace.js'),'utf8'),index=fs.readFileSync(path.join(__dirname,'bilge-defter-invited-v78/index.html'),'utf8');
const priorFixture=fs.readFileSync(path.join(__dirname,'test-ink-gesture.cjs'),'utf8');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex'),plain=value=>JSON.parse(JSON.stringify(value)),names=['A','R'];
function variant(name){const found=experiment.VARIANTS.find(x=>x.name===name);assert.ok(found,'Declared return variant');return found;}
function changed(name){return experiment.transformRunner(canonical,variant(name));}
function between(source,start,end){assert.equal(source.split(start).length,2,'Unique start '+start);const from=source.indexOf(start),to=source.indexOf(end,from);assert.ok(to>from,'Ordered end '+end);return source.slice(from,to);}
function makeHarness(name){
  assert.equal(sha(priorFixture),'e7fb70eaddf0864cb8d29f172613c4617c6d83b7461c7ce81245089b912f55f6');
  const helpers=between(priorFixture,'function oneLineFunction(','\nasync function runEvents(');
  return vm.runInNewContext(helpers+'\neventHarness;',{assert,structuredClone,Math,Map,Set,JSON,media,index,between,changed,vm},{timeout:1000})(name);
}
function metric(label,failed=false){return{label,alphaMax:failed?64:0,compositedMax:0,compositedMeanForeground:0,compositedOver16:0,foregroundPixels:1000};}
function checkList(name,failed=false){return['initial','pen','eraser',variant(name).label,...(name==='A'?['zoom']:[])].map(label=>metric(label,label===variant(name).label&&failed));}
function failure(name){return'AssertionError [ERR_ASSERTION]: '+variant(name).label+': alpha deviation\n    at unchanged original quality loop';}
function record(trace,phase,label,n=0){const matches=trace.filter(x=>x.kind==='gesture-history'&&x.phase===phase&&x.label===label);assert.ok(matches[n],'Expected record '+phase+'/'+label+'/'+n);return matches[n];}
async function runReturn(name,fault={}){
  const h=makeHarness(name),s=h.sandbox,calls=h.calls;let terminal=false,downCount=0,moveCount=0,upCount=0;
  Object.assign(calls,{tailSaves:0,screenshots:0,cold:0,zoom:[]});h.committed=[];
  const dispatch=h.host.dispatchEvent.bind(h.host);h.host.dispatchEvent=event=>{
    if(event.type==='pointerdown')downCount++;if(event.type==='pointermove')moveCount++;if(event.type==='pointerup')upCount++;
    const omitted=(fault.noSecondStart&&event.type==='pointerdown'&&downCount===2)||(fault.noSecondMove&&event.type==='pointermove'&&moveCount===2);
    if(omitted){calls.actions.push([event.type,event.clientX,event.clientY,event.pointerId,event.pointerType]);return true;}
    if(fault.undoInstead&&event.type==='pointerup'&&upCount===2){calls.actions.push([event.type,event.clientX,event.clientY,event.pointerId,event.pointerType]);s.cancelMediaGesture();assert.equal(s.undoMedia(),true);s.mediaSelection=null;s.scheduleSave();return true;}
    const result=dispatch(event);if(event.type==='pointerup')h.committed.push({list:h.page.strokes,target:h.page.strokes[0],points:h.page.strokes[0].points,point:h.page.strokes[0].points[0]});return result;
  };
  const afterTerminal=what=>{if(terminal&&name==='R')throw Error('Unexpected post-terminal '+what);};
  s.checks=['initial','pen','eraser'].map(label=>metric(label));s.diagnoseInk=false;s.engine='vm';
  const draw=s.drawAll;s.drawAll=()=>{afterTerminal('draw');return draw();};
  s.paint=async()=>{afterTerminal('paint');calls.paints++;};s.save=async()=>{afterTerminal('save');calls.tailSaves++;};
  s.setViewZoom=value=>{afterTerminal('zoom');calls.zoom.push(value);};s.screenshot=async()=>{afterTerminal('screenshot');calls.screenshots++;return'mock-screenshot';};
  s.controlledInkRaster=()=>{calls.cold++;throw Error('Unexpected cold/replay diagnostic');};
  s.audit=async label=>{calls.audits.push(label);const measured=metric(label);s.checks.push(measured);if(label===variant(name).label)terminal=true;return measured;};
  const init=between(h.source,'await p.evaluate(()=>{window.__inkSurfaceTrace=[];',';await p.evaluate(traceInkFixture);');
  vm.runInContext('globalThis.initializeUnderTest=async()=>{'+init+';};',s,{timeout:1000});await s.initializeUnderTest();
  const pointer=between(h.source,'async function pointer(','\n// Desktop WebKit'),actions=between(h.source,"await p.evaluate(()=>{window.__recordInkSurface('before media open');",'    }finally{try{diagnostic.trace=');
  vm.runInContext(pointer+'\nglobalThis.returnUnderTest=async()=>{'+actions+'};',s,{timeout:1000});h.result=await s.returnUnderTest();h.records=plain(s.window.__inkSurfaceTrace);return h;
}

test('frozen handler fixture, canonical runner and endpoint control are explicitly pinned',()=>{
  assert.equal(sha(canonical),'f2cb459827c1d725d6df1f22c6ff12047a02d415a7d26b8eb65f3eaa769de8d0');
  assert.equal(sha(media),'f25586bc8d2aa2abd6bade5a5304ff31b72c8bc427a55f9afefae6ee2fb5af31');
  assert.equal(sha(fs.readFileSync(path.join(__dirname,'diagnose-ink-endpoint.cjs'))),'9967138fb5f4edf57047133189f4e8238d7748172d9cf2e515b0e7e55e3ddc0b');
  assert.deepEqual(experiment.VARIANTS.map(x=>x.name),names);
  for(const key of ['transformRunner','validateReturnEvidence','validateCaseOutcome','classifyComparisons'])assert.equal(typeof experiment[key],'function');
});
test('generated runners compile, unknown edits fail closed and A equals the complete frozen control',()=>{
  for(const name of names)assert.doesNotThrow(()=>new vm.Script(changed(name).source,{filename:'return-'+name+'.cjs'}));
  assert.equal(changed('A').source,endpoint.transformRunner(canonical,endpoint.VARIANTS.find(x=>x.name==='A')).source);
  assert.throws(()=>experiment.transformRunner(canonical+'\n',variant('R')));assert.throws(()=>experiment.transformRunner(canonical,{name:'unknown'}));assert.throws(()=>experiment.transformRunner(canonical,{...variant('R'),extra:true}));
});
test('every measured pixel operation and every original strict quality assertion remain byte-identical',()=>{
  const start="      window.__inkTracePhase='audit: '+label;",end='    },label);',body=between(canonical,start,end),gate=canonical.split('\n').find(line=>line.includes('for(const result of checks){assert.ok(result.foregroundPixels>0);'));
  assert.ok(gate);for(const name of names){const source=changed(name).source;assert.equal(between(source,start,end),body);assert.equal(source.split(gate).length-1,1);
    const good=metric(variant(name).label);vm.runInNewContext(gate,{assert,checks:[good]},{timeout:1000});
    for(const bad of [{foregroundPixels:0},{alphaMax:33},{compositedMax:33},{compositedMeanForeground:1.001},{compositedOver16:3}])assert.throws(()=>vm.runInNewContext(gate,{assert,checks:[{...good,...bad}]},{timeout:1000}));
  }
});
test('two actual committed gestures return exact raw content without undo or reference restoration',async()=>{
  const h=await runReturn('R'),s=h.sandbox;assert.deepEqual(plain(h.calls.actions.map(x=>x[0])),['pointerdown','pointermove','pointerup','pointerdown','pointermove','pointerup']);
  assert.deepEqual(plain(h.calls.clicks),['#mediaEdit']);assert.equal(h.calls.saves,2);assert.equal(s.editRevision,2);assert.equal(s.pageRevs.get(h.page),3);assert.equal(s.mediaUndo.get('p0').length,2);
  assert.deepEqual(plain(h.page.strokes),[plain(h.initialText)]);assert.deepEqual(plain(h.page.strokes[0].points),[{x:300,y:320}]);
  assert.equal(h.committed.length,2);const first=h.committed[0],last=h.committed[1];
  for(const [actual,old]of[[first.target,h.initialText],[first.points,h.initialText.points],[first.point,h.initialText.points[0]],[last.list,first.list],[last.target,first.target],[last.points,first.points],[last.point,first.point]])assert.notEqual(actual,old);
  assert.notEqual(last.target,h.initialText);assert.notEqual(last.points,h.initialText.points);assert.notEqual(last.point,h.initialText.points[0]);
  assert.deepEqual(plain(h.calls.actions[3].slice(1,3)),plain(h.calls.actions[2].slice(1,3)));assert.deepEqual(plain(h.calls.actions[5].slice(1,3)),plain(h.calls.actions[0].slice(1,3)));
  assert.equal(h.calls.close,1);assert.equal(h.calls.readbacks,0);assert.equal(h.captures.size,0);for(const key of ['mediaGesture','mediaSelection','mediaPending'])assert.equal(s[key],null);assert.equal(s.mediaSelecting,false);
  assert.doesNotThrow(()=>experiment.validateReturnEvidence(h.records,variant('R')));
});
test('A still performs actual undo and restores original stroke/point references',async()=>{
  const h=await runReturn('A');assert.deepEqual(plain(h.calls.clicks),['#mediaEdit','#layoutUndo']);assert.equal(h.calls.actions.length,3);assert.equal(h.calls.saves,2);assert.equal(h.sandbox.mediaUndo.get('p0')?.length||0,0);
  assert.equal(h.page.strokes[0],h.initialText);assert.equal(h.page.strokes[0].points,h.initialText.points);assert.notEqual(h.page.strokes,h.initialList);assert.deepEqual(plain(h.page.strokes[0].points),[{x:300,y:320}]);assert.doesNotThrow(()=>experiment.validateReturnEvidence(h.records,variant('A')));
});
test('missing second start, missing observed second preview, and real undo substituted for second commit fail closed',async()=>{
  for(const fault of [{noSecondStart:true},{noSecondMove:true},{undoInstead:true}]){let h;try{h=await runReturn('R',fault);}catch(error){assert.match(String(error),/assert|gesture|select|draft|target/i);continue;}assert.throws(()=>experiment.validateReturnEvidence(h.records,variant('R')));}
});
test('R has no post-terminal replay zoom save paint or screenshot, while A keeps the frozen tail',async()=>{
  for(const name of names){const h=await runReturn(name);assert.deepEqual(plain(h.calls.audits),name==='A'?['media undo','zoom']:['return closed']);assert.deepEqual(plain(h.result.checks.map(x=>x.label)),checkList(name).map(x=>x.label));assert.equal(h.calls.tailSaves,name==='A'?1:0);assert.equal(h.calls.screenshots,name==='A'?1:0);assert.deepEqual(plain(h.calls.zoom),name==='A'?[1.5]:[]);assert.equal(h.calls.cold,0);}
});
test('outer error handling retains the exact failure and teardown without an R failure screenshot',async()=>{
  for(const name of names){let read=0,pictures=0,finish=0;const report={results:[]},f={goto:async()=>{},finish:async()=>finish++,p:{evaluate:async()=>{read++;return{diagnostic:'untouched'};},screenshot:async()=>pictures++}};
    const scope={caseFilter:null,assert,console:{log(){},error(){}},fixture:async()=>f,report,path,out:'/not-written'},code=between(changed(name).source,'async function check(','\nfunction traceInkFixture(');vm.createContext(scope);vm.runInContext(code+'\nglobalThis.checkUnderTest=check;',scope,{timeout:1000});
    await scope.checkUnderTest({},'webkit','return',async()=>{throw Error('original-return-error');});assert.equal(read,1);assert.equal(finish,1);assert.equal(pictures,name==='A'?1:0);assert.equal(report.results.length,1);assert.equal(report.results[0].passed,false);assert.match(report.results[0].error,/original-return-error/);
  }
});
test('second-gesture identity, commit history, cleanup and exact raw return are independently guarded',async()=>{
  const h=await runReturn('R');
  for(const mutate of[
    t=>t.splice(t.indexOf(record(t,'after','pointerdown',1)),1),
    t=>{record(t,'after','pointermove',1).gestureMoved=false;},
    t=>{record(t,'after','pointerup',1).undoDepth=1;},
    t=>{record(t,'after','pointerup',1).revisionDelta=1;},
    t=>{record(t,'after','pointerup',1).editRevisionDelta=1;},
    t=>{record(t,'after','pointerup',1).targetSame=true;},
    t=>{record(t,'after','pointerup',1).returnHistory.commits=1;},
    t=>{record(t,'after','pointerup',1).returnHistory.firstTargetSame=true;},
    t=>{record(t,'after','pointerup',1).returnHistory.firstPointsArraySame=true;},
    t=>{record(t,'after','pointerup',1).returnHistory.firstPointSame=true;},
    t=>{record(t,'after','pointermove',1).returnHistory.gestureTargetSameAsFirst=false;},
    t=>{record(t,'after','pointerup',1).targetX+=5e-10;},
    t=>{record(t,'after','pointerup',1).targetY=NaN;},
    t=>{record(t,'before','pointermove',1).input.x=NaN;record(t,'after','pointermove',1).input.x=NaN;},
    t=>{record(t,'after','pointerup',1).refs[1].pointSame=0;},
    t=>{record(t,'surface','after media close sync').selectionPresent=true;},
    t=>{record(t,'surface','after media close sync').pending=true;},
    t=>t.push({kind:'gesture-history-error',message:'observer failed'}),
    t=>t.push({...structuredClone(record(t,'after','pointerup',1)),ordinal:999}),
  ]){const trace=structuredClone(h.records);mutate(trace);assert.throws(()=>experiment.validateReturnEvidence(trace,variant('R')));}
  const a=await runReturn('A');assert.throws(()=>experiment.validateReturnEvidence(a.records,variant('R')),'Real undo evidence cannot be relabelled as a second real commit');
});
test('case outcomes require the original terminal quality assertion and reject unrelated failures',()=>{
  for(const name of names){
    assert.equal(experiment.validateCaseOutcome({passed:true,error:null},checkList(name),variant(name)).terminalEnvelopeFailed,false);
    assert.equal(experiment.validateCaseOutcome({passed:false,error:failure(name)},checkList(name,true),variant(name)).terminalEnvelopeFailed,true);
    for(const [result,checks]of[
      [{passed:true,error:null},checkList(name,true)],
      [{passed:false,error:'Error: save failed'},checkList(name)],
      [{passed:false,error:'AssertionError [ERR_ASSERTION]: zoom: alpha deviation'},checkList(name)],
      [{passed:false,error:failure(name)},checkList(name,true).slice(1)],
      [{passed:true,error:'unexpected error'},checkList(name)],
      [{passed:false,error:'Error: '+variant(name).label+': alpha deviation'},checkList(name,true)],
    ])assert.throws(()=>experiment.validateCaseOutcome(result,checks,variant(name)));
    for(const label of ['initial','pen','eraser',...(name==='A'?['zoom']:[])]){const checks=checkList(name,true);checks.find(x=>x.label===label).alphaMax=64;assert.throws(()=>experiment.validateCaseOutcome({passed:false,error:failure(name)},checks,variant(name)));}
    if(name==='R'){const checks=checkList(name);checks.push(metric('zoom'));assert.throws(()=>experiment.validateCaseOutcome({passed:true,error:null},checks,variant(name)));}
  }
});
function normalize(h){
  const pages=[h.page,h.otherPage],rows=pages.map((p,i)=>({id:p.id,top:i*587,height:563}));
  return history.normalizeAudit({visibleInk:JSON.stringify(pages.map(p=>({id:p.id,strokes:p.strokes}))),
    stats:{rows,visible:rows.map(r=>r.id),activeId:'p0',scroll:0,x:0,zoom:1,totalHeight:1150,cachedImages:2,cachedInkTiles:12,inkPixels:2500000},
    surface:{width:1676,height:1318,cssWidth:838,cssHeight:659,dpr:2,transform:[2,0,0,2,0,0],rowTransforms:rows.map(r=>({id:r.id,transform:[1.676,0,0,1.676,0,r.top*1.676],revision:h.sandbox.pageRevs.get(pages.find(p=>p.id===r.id))||0}))}});
}
async function comparisonCases(){const rows=[];for(const name of names){const h=await runReturn(name),checks=checkList(name,name==='A');rows.push({variant:name,engine:'webkit',checks,terminalMetric:checks.find(x=>x.label===variant(name).label),casePassed:name!=='A',caseError:name==='A'?failure(name):null,endpoint:normalize(h),returnEvidence:experiment.validateReturnEvidence(h.records,variant(name))});}return rows;}
function rehash(e){e.normalizedInkSha256=sha(JSON.stringify(e.normalizedInk));e.geometrySha256=sha(JSON.stringify(e.geometry));}
test('only reproduced A with exact full visible ink and closed geometry permits a bounded return contrast',async()=>{
  const cases=await comparisonCases(),[a,r]=cases;assert.equal(a.endpoint.normalizedInkSha256,r.endpoint.normalizedInkSha256);assert.equal(a.endpoint.geometrySha256,r.endpoint.geometrySha256);
  const [result]=experiment.classifyComparisons(cases);assert.equal(result.status,'controlled-return-observation');assert.equal(result.interpretable,true);assert.equal(result.AReproduced,true);assert.equal(result.sameFinalInk,true);assert.equal(result.sameClosedGeometry,true);assert.equal(result.comparison.from,'A');assert.equal(result.comparison.to,'R');
  assert.equal(Object.hasOwn(result,'cause'),false);assert.equal(Object.hasOwn(result,'releaseEligible'),false);
  const clean=structuredClone(cases);clean[0].checks=checkList('A');clean[0].terminalMetric=clean[0].checks.find(x=>x.label==='media undo');clean[0].casePassed=true;clean[0].caseError=null;
  const noRepro=experiment.classifyComparisons(clean)[0];assert.equal(noRepro.status,'inconclusive-A-did-not-reproduce');assert.equal(noRepro.interpretable,false);
  for(const mutate of[
    e=>{e.normalizedInk[1].strokes[0].points[0].x++;},
    e=>{e.geometry.width++;},
  ]){const changedCases=structuredClone(cases);mutate(changedCases[1].endpoint);rehash(changedCases[1].endpoint);const mismatch=experiment.classifyComparisons(changedCases)[0];assert.equal(mismatch.status,'inconclusive-terminal-mismatch');assert.equal(mismatch.interpretable,false);}
});
test('forged return evidence, wrong outcomes, hashes and even tiny finite returned coordinate drift reject interpretation',async()=>{
  const cases=await comparisonCases();
  for(const mutate of[
    row=>{row.returnEvidence={...row.returnEvidence,valid:true,records:[]};},
    row=>{row.returnEvidence.mode='move-undo';},
    row=>{record(row.returnEvidence.records,'after','pointerup',1).returnHistory.commits=1;},
    row=>{row.casePassed=false;row.caseError='Error: unrelated save failure';},
    row=>{row.checks[0].alphaMax=64;},
    row=>{row.terminalMetric={...row.terminalMetric,alphaMax:1};},
    row=>{row.endpoint.normalizedInkSha256='0'.repeat(64);},
    row=>{row.endpoint.geometrySha256='0'.repeat(64);},
    row=>{row.endpoint.normalizedInk[0].strokes[0].points[0].x+=5e-10;rehash(row.endpoint);},
    row=>{row.endpoint.normalizedInk[0].strokes[0].points[0].y=NaN;rehash(row.endpoint);},
    row=>{row.endpoint.normalizedInk.reverse();rehash(row.endpoint);},
    row=>{row.endpoint={};},
  ]){const changedCases=structuredClone(cases);mutate(changedCases[1]);assert.throws(()=>experiment.classifyComparisons(changedCases));}
  assert.throws(()=>experiment.classifyComparisons(cases.slice(1)));const duplicate=structuredClone(cases);duplicate[1].variant='A';assert.throws(()=>experiment.classifyComparisons(duplicate));
});
