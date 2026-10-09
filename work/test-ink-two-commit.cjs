'use strict';
// Pure diagnostic guards only; execution belongs to root. No browser/bootstrap.
// The reused VM runs pinned gesture/commit/undo handlers, but injects the text
// target instead of DOM hit testing and mocks constrainMedia for interior points.
// Actual browser evidence must separately validate hit testing and raw equality.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const experiment=require('./diagnose-ink-two-commit.cjs'),endpoint=require('./diagnose-ink-endpoint.cjs'),history=require('./diagnose-ink-history.cjs');
const canonical=fs.readFileSync(path.join(__dirname,'verify-slide-flow.cjs'),'utf8'),media=fs.readFileSync(path.join(__dirname,'bilge-defter-invited-v78/media-workspace.js'),'utf8'),index=fs.readFileSync(path.join(__dirname,'bilge-defter-invited-v78/index.html'),'utf8'),prior=fs.readFileSync(path.join(__dirname,'test-ink-gesture.cjs'),'utf8');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex'),plain=value=>JSON.parse(JSON.stringify(value)),names=['A','M','T'];
function variant(name){const found=experiment.VARIANTS.find(x=>x.name===name);assert.ok(found,'Known test variant');return found;}
function changed(name){return experiment.transformRunner(canonical,variant(name));}
function between(source,start,end){assert.equal(source.split(start).length,2,'Unique start '+start);const from=source.indexOf(start),to=source.indexOf(end,from);assert.ok(to>from,'Ordered end '+end);return source.slice(from,to);}
function makeHarness(name){assert.equal(sha(prior),'e7fb70eaddf0864cb8d29f172613c4617c6d83b7461c7ce81245089b912f55f6');return vm.runInNewContext(between(prior,'function oneLineFunction(','\nasync function runEvents(')+'\neventHarness;',{assert,structuredClone,Math,Map,Set,JSON,media,index,between,changed,vm},{timeout:1000})(name);}
function metric(label,failed=false){return{label,alphaMax:failed?64:0,compositedMax:0,compositedMeanForeground:0,compositedOver16:0,foregroundPixels:1000};}
function checkList(name,failed=false){return['initial','pen','eraser',variant(name).label,...(name==='A'?['zoom']:[])].map(label=>metric(label,label===variant(name).label&&failed));}
function failure(name){return'AssertionError [ERR_ASSERTION]: '+variant(name).label+': alpha deviation\n    at original quality loop';}
function record(trace,phase,label,n=0){const matches=trace.filter(x=>x.kind==='gesture-history'&&x.phase===phase&&x.label===label);assert.ok(matches[n],'Expected '+phase+'/'+label+'/'+n);return matches[n];}
async function runEvents(name,fault={}){
  const h=makeHarness(name),s=h.sandbox,calls=h.calls;let terminal=false,down=0,move=0,up=0;h.committed=[];
  Object.assign(calls,{tailSaves:0,screenshots:0,cold:0,zoom:[],realCommits:0});const commit=s.commitMediaTransform;s.commitMediaTransform=(...args)=>{const before=h.page.strokes,result=commit(...args);if(h.page.strokes!==before)calls.realCommits++;return result;};const dispatch=h.host.dispatchEvent.bind(h.host);
  h.host.dispatchEvent=event=>{
    if(event.type==='pointerdown')down++;if(event.type==='pointermove')move++;if(event.type==='pointerup')up++;
    const log=()=>calls.actions.push([event.type,event.clientX,event.clientY,event.pointerId,event.pointerType]);
    if((fault.noSecondStart&&event.type==='pointerdown'&&down===2)||(fault.noSecondMove&&event.type==='pointermove'&&move===2)){log();return true;}
    if(fault.wrongSecondTarget&&event.type==='pointerdown'&&down===2){log();event.currentTarget=h.host;s.startMediaGesture(event,h.initialText,false);return true;}
    if(fault.undoInstead&&event.type==='pointerup'&&up===2){log();s.cancelMediaGesture();assert.equal(s.undoMedia(),true);s.mediaSelection=null;s.scheduleSave();return true;}
    const result=dispatch(event);if(event.type==='pointerdown'&&down===2)h.secondGestureTarget=s.mediaGesture?.target;if(event.type==='pointerup')h.committed.push({list:h.page.strokes,target:h.page.strokes[0],points:h.page.strokes[0].points,point:h.page.strokes[0].points[0]});return result;
  };
  const afterTerminal=what=>{if(terminal&&name!=='A')throw Error('Unexpected post-terminal '+what);};s.checks=['initial','pen','eraser'].map(label=>metric(label));s.diagnoseInk=false;s.engine='vm';
  const draw=s.drawAll;s.drawAll=()=>{afterTerminal('draw');return draw();};s.paint=async()=>{afterTerminal('paint');calls.paints++;};s.save=async()=>{afterTerminal('save');calls.tailSaves++;};s.setViewZoom=value=>{afterTerminal('zoom');calls.zoom.push(value);};s.screenshot=async()=>{afterTerminal('screenshot');calls.screenshots++;return'mock-screenshot';};s.controlledInkRaster=()=>{calls.cold++;throw Error('Unexpected replay');};
  s.audit=async label=>{calls.audits.push(label);const result=metric(label);s.checks.push(result);if(label===variant(name).label)terminal=true;return result;};
  const init=between(h.source,'await p.evaluate(()=>{window.__inkSurfaceTrace=[];',';await p.evaluate(traceInkFixture);');vm.runInContext('globalThis.initUnderTest=async()=>{'+init+';};',s,{timeout:1000});await s.initUnderTest();
  const pointer=between(h.source,'async function pointer(','\n// Desktop WebKit'),actions=between(h.source,"await p.evaluate(()=>{window.__recordInkSurface('before media open');",'    }finally{try{diagnostic.trace=');
  vm.runInContext(pointer+'\nglobalThis.actionsUnderTest=async()=>{'+actions+'};',s,{timeout:1000});h.result=await s.actionsUnderTest();h.records=plain(s.window.__inkSurfaceTrace);return h;
}
function normalize(h){const pages=[h.page,h.otherPage],rows=pages.map((p,i)=>({id:p.id,top:i*587,height:563}));return history.normalizeAudit({visibleInk:JSON.stringify(pages.map(p=>({id:p.id,strokes:p.strokes}))),stats:{rows,visible:rows.map(r=>r.id),activeId:'p0',scroll:0,x:0,zoom:1,totalHeight:1150,cachedImages:2,cachedInkTiles:12,inkPixels:2500000},surface:{width:1676,height:1318,cssWidth:838,cssHeight:659,dpr:2,transform:[2,0,0,2,0,0],rowTransforms:rows.map(r=>({id:r.id,transform:[1.676,0,0,1.676,0,r.top*1.676],revision:h.sandbox.pageRevs.get(pages.find(p=>p.id===r.id))||0}))}});}
function rehash(e){e.normalizedInkSha256=sha(JSON.stringify(e.normalizedInk));e.geometrySha256=sha(JSON.stringify(e.geometry));}

test('source pins and actual handler fixture are fixed before any generated experiment',()=>{
  assert.equal(sha(canonical),'f2cb459827c1d725d6df1f22c6ff12047a02d415a7d26b8eb65f3eaa769de8d0');assert.equal(sha(media),'f25586bc8d2aa2abd6bade5a5304ff31b72c8bc427a55f9afefae6ee2fb5af31');assert.equal(sha(fs.readFileSync(path.join(__dirname,'diagnose-ink-endpoint.cjs'))),'9967138fb5f4edf57047133189f4e8238d7748172d9cf2e515b0e7e55e3ddc0b');assert.deepEqual(experiment.VARIANTS.map(x=>x.name),names);
});
test('all generated runners compile and both A and M are complete byte-exact frozen controls',()=>{
  for(const name of names)assert.doesNotThrow(()=>new vm.Script(changed(name).source,{filename:'two-commit-'+name+'.cjs'}));
  for(const name of ['A','M'])assert.equal(changed(name).source,endpoint.transformRunner(canonical,endpoint.VARIANTS.find(x=>x.name===name)).source);
  assert.throws(()=>experiment.transformRunner(canonical+'\n',variant('T')));assert.throws(()=>experiment.transformRunner(canonical,{name:'unknown'}));assert.throws(()=>experiment.transformRunner(canonical,{...variant('T'),extra:true}));
});
test('complete audit readbacks and all original quality assertions remain unchanged',()=>{
  const start="      window.__inkTracePhase='audit: '+label;",end='    },label);',body=between(canonical,start,end),gate=canonical.split('\n').find(line=>line.includes('for(const result of checks){assert.ok(result.foregroundPixels>0);'));assert.ok(gate);
  for(const name of names){const source=changed(name).source;assert.equal(between(source,start,end),body);assert.equal(source.split(gate).length-1,1);const good=metric(variant(name).label);vm.runInNewContext(gate,{assert,checks:[good]},{timeout:1000});for(const bad of [{foregroundPixels:0},{alphaMax:33},{compositedMax:33},{compositedMeanForeground:1.001},{compositedOver16:3}])assert.throws(()=>vm.runInNewContext(gate,{assert,checks:[{...good,...bad}]},{timeout:1000}));}
});
test('T performs two real commits selecting the first clone and ends in the exact raw M model',async()=>{
  const h=await runEvents('T'),m=await runEvents('M'),s=h.sandbox;assert.deepEqual(plain(h.calls.actions.map(x=>x[0])),['pointerdown','pointermove','pointerup','pointerdown','pointermove','pointerup']);assert.deepEqual(plain(h.calls.clicks),['#mediaEdit']);
  assert.equal(h.calls.realCommits,2);assert.equal(h.calls.saves,2);assert.equal(s.editRevision,2);assert.equal(s.pageRevs.get(h.page),3);assert.equal(s.mediaUndo.get('p0').length,2);assert.equal(h.committed.length,2);
  const [first,last]=h.committed;assert.equal(h.secondGestureTarget,first.target);for(const [actual,old]of[[first.target,h.initialText],[first.points,h.initialText.points],[first.point,h.initialText.points[0]],[last.list,first.list],[last.target,first.target],[last.points,first.points],[last.point,first.point]])assert.notEqual(actual,old);
  assert.notEqual(last.target,h.initialText);assert.notEqual(last.points,h.initialText.points);assert.notEqual(last.point,h.initialText.points[0]);assert.ok(Math.abs(first.point.x-320)<1e-9);assert.ok(Math.abs(first.point.y-330)<1e-9);
  assert.deepEqual(plain(h.page.strokes),plain(m.page.strokes),'Raw model equality, never rounding/snapping');assert.equal(last.point.x,m.page.strokes[0].points[0].x);assert.equal(last.point.y,m.page.strokes[0].points[0].y);assert.notDeepEqual(plain(last.point),{x:300,y:320});
  assert.deepEqual(plain(h.calls.actions[3].slice(1,3)),plain(h.calls.actions[2].slice(1,3)));assert.deepEqual(plain(h.calls.actions[5].slice(1,3)),plain(m.calls.actions[2].slice(1,3)));
  assert.equal(h.calls.readbacks,0);assert.equal(h.calls.close,1);assert.equal(h.captures.size,0);assert.equal(s.mediaSelecting,false);for(const key of ['mediaGesture','mediaSelection','mediaPending'])assert.equal(s[key],null);
  assert.doesNotThrow(()=>experiment.validateTwoCommitEvidence(h.records,variant('T')));
});
test('A actual undo restores original references while M has just one committed clone and undo entry',async()=>{
  for(const name of ['A','M']){const h=await runEvents(name);assert.equal(h.calls.actions.length,3);assert.equal(h.calls.realCommits,1);assert.deepEqual(plain(h.calls.clicks),name==='A'?['#mediaEdit','#layoutUndo']:['#mediaEdit']);assert.equal(h.calls.saves,name==='A'?2:1);assert.equal(h.sandbox.mediaUndo.get('p0')?.length||0,name==='A'?0:1);assert.equal(h.page.strokes[0]===h.initialText,name==='A');assert.equal(h.page.strokes[0].points===h.initialText.points,name==='A');assert.doesNotThrow(()=>experiment.validateTwoCommitEvidence(h.records,variant(name)));}
});
test('missing second gesture, unobserved second preview, wrong second target and actual undo substitution reject evidence',async()=>{
  for(const fault of [{noSecondStart:true},{noSecondMove:true},{wrongSecondTarget:true},{undoInstead:true}]){let h;try{h=await runEvents('T',fault);}catch(error){assert.match(String(error),/assert|gesture|select|draft|target/i);continue;}assert.throws(()=>experiment.validateTwoCommitEvidence(h.records,variant('T')));}
});
test('second gesture commit identities, input sequence and cleanup are independently guarded',async()=>{
  const h=await runEvents('T');for(const mutate of[
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
    t=>{record(t,'before','pointermove',1).input.x=NaN;record(t,'after','pointermove',1).input.x=NaN;},
    t=>{record(t,'after','pointerup',1).targetY=NaN;},
    t=>{record(t,'after','pointerup',1).refs[1].pointSame=0;},
    t=>{record(t,'surface','after media close sync').selectionPresent=true;},
    t=>{record(t,'surface','after media close sync').pending=true;},
    t=>t.push({kind:'gesture-history-error',message:'bounded observer failure'}),
    t=>t.push({...structuredClone(record(t,'after','pointerup',1)),ordinal:999}),
  ]){const trace=structuredClone(h.records);mutate(trace);assert.throws(()=>experiment.validateTwoCommitEvidence(trace,variant('T')));}
  for(const name of ['A','M']){const control=await runEvents(name);assert.throws(()=>experiment.validateTwoCommitEvidence(control.records,variant('T')));}
});
test('M and T stop after terminal audit; A retains its full tail and failure screenshot behavior',async()=>{
  for(const name of names){const h=await runEvents(name);assert.deepEqual(plain(h.calls.audits),name==='A'?['media undo','zoom']:[variant(name).label]);assert.deepEqual(plain(h.result.checks.map(x=>x.label)),checkList(name).map(x=>x.label));assert.equal(h.calls.tailSaves,name==='A'?1:0);assert.equal(h.calls.screenshots,name==='A'?1:0);assert.deepEqual(plain(h.calls.zoom),name==='A'?[1.5]:[]);assert.equal(h.calls.cold,0);
    let reads=0,pictures=0,finished=0;const report={results:[]},f={goto:async()=>{},finish:async()=>finished++,p:{evaluate:async()=>{reads++;return{diagnostic:'retained'};},screenshot:async()=>pictures++}},scope={caseFilter:null,assert,console:{log(){},error(){}},fixture:async()=>f,report,path,out:'/not-written'};
    vm.createContext(scope);vm.runInContext(between(changed(name).source,'async function check(','\nfunction traceInkFixture(')+'\nglobalThis.checkUnderTest=check;',scope,{timeout:1000});await scope.checkUnderTest({},'webkit','two-commit',async()=>{throw Error('original-error-preserved');});assert.equal(reads,1);assert.equal(finished,1);assert.equal(pictures,name==='A'?1:0);assert.equal(report.results[0].passed,false);assert.match(report.results[0].error,/original-error-preserved/);
  }
});
test('case outcome guards preserve original terminal failure and reject unrelated failures',()=>{
  for(const name of names){assert.equal(experiment.validateCaseOutcome({passed:true,error:null},checkList(name),variant(name)).terminalEnvelopeFailed,false);assert.equal(experiment.validateCaseOutcome({passed:false,error:failure(name)},checkList(name,true),variant(name)).terminalEnvelopeFailed,true);
    for(const [result,checks]of[[{passed:true,error:null},checkList(name,true)],[{passed:false,error:'Error: save failed'},checkList(name)],[{passed:true,error:'unexpected error'},checkList(name)],[{passed:false,error:failure(name)},checkList(name,true).slice(1)],[{passed:false,error:'Error: '+variant(name).label+': alpha deviation'},checkList(name,true)]])assert.throws(()=>experiment.validateCaseOutcome(result,checks,variant(name)));
    for(const label of ['initial','pen','eraser',...(name==='A'?['zoom']:[])]){const checks=checkList(name,true);checks.find(x=>x.label===label).alphaMax=64;assert.throws(()=>experiment.validateCaseOutcome({passed:false,error:failure(name)},checks,variant(name)));}
  }
});
async function comparisonCases(){const cases=[];for(const name of names){const h=await runEvents(name),checks=checkList(name,name==='A');cases.push({variant:name,engine:'webkit',checks,terminalMetric:checks.find(x=>x.label===variant(name).label),casePassed:name!=='A',caseError:name==='A'?failure(name):null,endpoint:normalize(h),commitEvidence:experiment.validateTwoCommitEvidence(h.records,variant(name))});}return cases;}
test('a bounded interpretation requires reproduced A, clean M and exact M/T model plus closed geometry',async()=>{
  const cases=await comparisonCases(),[a,m,t]=cases;assert.equal(m.endpoint.normalizedInkSha256,t.endpoint.normalizedInkSha256);assert.equal(m.endpoint.geometrySha256,t.endpoint.geometrySha256);assert.notEqual(a.endpoint.normalizedInkSha256,m.endpoint.normalizedInkSha256);
  const [result]=experiment.classifyComparisons(cases);assert.equal(result.status,'controlled-two-commit-observation');for(const key of ['interpretable','AReproduced','MClean','sameFinalInk','sameClosedGeometry','controlGeometryMatches'])assert.equal(result[key],true);assert.equal(result.comparison.from,'M');assert.equal(result.comparison.to,'T');assert.equal(Object.hasOwn(result,'cause'),false);assert.equal(Object.hasOwn(result,'releaseEligible'),false);
  for(const [name,failed,status]of[['A',false,'inconclusive-A-did-not-reproduce'],['M',true,'inconclusive-M-no-longer-clean']]){const changedCases=structuredClone(cases),row=changedCases.find(x=>x.variant===name);row.checks=checkList(name,failed);row.terminalMetric=row.checks.find(x=>x.label===variant(name).label);row.casePassed=!failed;row.caseError=failed?failure(name):null;const result=experiment.classifyComparisons(changedCases)[0];assert.equal(result.status,status);assert.equal(result.interpretable,false);}
});
test('even coherent tiny raw final-coordinate drift or changed terminal geometry cannot be interpreted',async()=>{
  const cases=await comparisonCases(),changedCases=structuredClone(cases),t=changedCases.find(x=>x.variant==='T'),point=t.endpoint.normalizedInk[0].strokes[0].points[0],oldX=point.x;point.x+=5e-10;assert.notEqual(point.x,oldX);assert.ok(Math.abs(point.x-oldX)<1e-9);
  // Keep the altered T internally coherent so this isolates exact M/T equality,
  // not a hash mismatch or measured-versus-observer mismatch elsewhere.
  let secondCommit=false;for(const r of t.commitEvidence.records){if(r.phase==='after'&&r.label==='pointerup'&&r.returnHistory.commits===2)secondCommit=true;if(secondCommit)r.targetX=point.x;}
  t.commitEvidence=experiment.validateTwoCommitEvidence(t.commitEvidence.records,variant('T'));rehash(t.endpoint);const mismatch=experiment.classifyComparisons(changedCases)[0];assert.equal(mismatch.sameFinalInk,false);assert.equal(mismatch.interpretable,false);assert.equal(mismatch.status,'inconclusive-terminal-mismatch');
  for(const [name,mutate]of[['T',e=>{e.geometry.width++;}],['A',e=>{e.geometry.cssWidth++;}],['T',e=>{e.normalizedInk[1].strokes[0].points[0].x++;}]]){const rows=structuredClone(cases),row=rows.find(x=>x.variant===name);mutate(row.endpoint);rehash(row.endpoint);const result=experiment.classifyComparisons(rows)[0];assert.equal(result.interpretable,false);assert.equal(result.status,'inconclusive-terminal-mismatch');}
});
test('forged evidence, model-observer mismatch, unrelated errors and hashes fail closed',async()=>{
  const cases=await comparisonCases();for(const mutate of[
    row=>{row.commitEvidence={...row.commitEvidence,valid:true,records:[]};},
    row=>{row.commitEvidence.mode='commit-close';},
    row=>{record(row.commitEvidence.records,'after','pointerup',1).returnHistory.commits=1;},
    row=>{row.casePassed=false;row.caseError='Error: unrelated save failure';},
    row=>{row.checks[0].alphaMax=64;},
    row=>{row.terminalMetric={...row.terminalMetric,alphaMax:1};},
    row=>{row.endpoint.normalizedInkSha256='0'.repeat(64);},
    row=>{row.endpoint.geometrySha256='0'.repeat(64);},
    row=>{row.endpoint.normalizedInk[0].strokes[0].points[0].x+=5e-10;rehash(row.endpoint);},
    row=>{row.endpoint.normalizedInk[0].strokes[0].points[0].y=NaN;rehash(row.endpoint);},
    row=>{row.endpoint.normalizedInk.reverse();rehash(row.endpoint);},
    row=>{row.endpoint={};},
  ]){const rows=structuredClone(cases);mutate(rows.find(x=>x.variant==='T'));assert.throws(()=>experiment.classifyComparisons(rows));}
  const otherM=structuredClone(cases),m=otherM.find(x=>x.variant==='M');m.endpoint.normalizedInk[1].strokes[0].points[0].x++;rehash(m.endpoint);assert.throws(()=>experiment.classifyComparisons(otherM),'A/M must differ only at the selected text point');
  assert.throws(()=>experiment.classifyComparisons(cases.slice(1)));const duplicate=structuredClone(cases);duplicate[2].variant='M';assert.throws(()=>experiment.classifyComparisons(duplicate));
});
