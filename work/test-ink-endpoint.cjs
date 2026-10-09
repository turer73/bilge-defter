'use strict';
// Pure diagnostic contracts only. Root owns all execution; no browser/server runs.
// Reuse the pinned prior VM fixture without requiring/registering its test cases.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const endpoint=require('./diagnose-ink-endpoint.cjs'),history=require('./diagnose-ink-history.cjs');
const canonical=fs.readFileSync(path.join(__dirname,'verify-slide-flow.cjs'),'utf8');
const media=fs.readFileSync(path.join(__dirname,'bilge-defter-invited-v78/media-workspace.js'),'utf8');
const index=fs.readFileSync(path.join(__dirname,'bilge-defter-invited-v78/index.html'),'utf8');
const oldFixture=fs.readFileSync(path.join(__dirname,'test-ink-gesture.cjs'),'utf8');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex'),plain=value=>JSON.parse(JSON.stringify(value));
const names=['A','O','K','U','M'];
function variant(name){const found=endpoint.VARIANTS.find(x=>x.name===name);assert.ok(found,'Declared endpoint '+name);return found;}
function changed(name){return endpoint.transformRunner(canonical,variant(name));}
function between(source,start,end){assert.equal(source.split(start).length,2,'Unique start '+start);const from=source.indexOf(start),to=source.indexOf(end,from);assert.ok(to>from,'Ordered end '+end);return source.slice(from,to);}
function makeHarness(name,fault){
  assert.equal(sha(oldFixture),'e7fb70eaddf0864cb8d29f172613c4617c6d83b7461c7ce81245089b912f55f6','Prior pure VM fixture is frozen');
  const helper=between(oldFixture,'function oneLineFunction(','\nasync function runEvents(');
  return vm.runInNewContext(helper+'\neventHarness;',{assert,structuredClone,Math,Map,Set,JSON,media,index,between,changed,vm},{timeout:1000})(name,fault);
}

test('endpoint experiment pins unchanged renderer helpers, canonical source and prior behavioral fixture',()=>{
  assert.equal(sha(canonical),'f2cb459827c1d725d6df1f22c6ff12047a02d415a7d26b8eb65f3eaa769de8d0');
  assert.equal(sha(media),'f25586bc8d2aa2abd6bade5a5304ff31b72c8bc427a55f9afefae6ee2fb5af31');
  assert.equal(sha(oldFixture),'e7fb70eaddf0864cb8d29f172613c4617c6d83b7461c7ce81245089b912f55f6');
  assert.deepEqual(endpoint.VARIANTS.map(x=>x.name),names);
  for(const key of ['transformRunner','validateEndpointEvidence','validateCaseOutcome','classifyComparisons'])assert.equal(typeof endpoint[key],'function',key);
});

test('source drift, unknown endpoints and unreviewed flags cannot create a diagnostic copy',()=>{
  assert.throws(()=>endpoint.transformRunner(canonical+'\n',variant('A')));
  assert.throws(()=>endpoint.transformRunner(canonical,{name:'unknown'}));
  assert.throws(()=>endpoint.transformRunner(canonical,{...variant('K'),extra:true}));
  assert.throws(()=>endpoint.transformRunner(canonical.replace("await pointer(p,'pointerup',370*g.scale,355*g.scale);","await pointer(p,'pointercancel',370*g.scale,355*g.scale);"),variant('M')));
});

test('all complete generated runners compile and A is the exact frozen control, not a reconstructed approximation',()=>{
  for(const name of names)assert.doesNotThrow(()=>new vm.Script(changed(name).source,{filename:'copied-endpoint-'+name+'.cjs'}));
  const prior=require('./diagnose-ink-gesture.cjs');assert.equal(changed('A').source,prior.transformRunner(canonical,prior.VARIANTS.find(x=>x.name==='A')).source);
});

test('every endpoint retains the complete canonical pixel measurement and strict quality assertion loop',()=>{
  const start="      window.__inkTracePhase='audit: '+label;",end='    },label);',measured=between(canonical,start,end);
  const gate=canonical.split('\n').find(line=>line.includes('for(const result of checks){assert.ok(result.foregroundPixels>0);'));
  assert.ok(gate);const good={label:'endpoint',foregroundPixels:1000,alphaMax:0,compositedMax:0,compositedMeanForeground:0,compositedOver16:0};
  for(const name of names){const source=changed(name).source;assert.equal(between(source,start,end),measured);assert.equal(source.split(gate).length-1,1,'Original loop appears once');
    vm.runInNewContext(gate,{assert,checks:[good]},{timeout:1000});
    for(const bad of [{foregroundPixels:0},{alphaMax:33},{compositedMax:33},{compositedMeanForeground:1.001},{compositedOver16:3}])assert.throws(()=>vm.runInNewContext(gate,{assert,checks:[{...good,...bad}]},{timeout:1000}));
  }
});

function metric(label,failed=false){return{label,alphaMax:failed?64:0,compositedMax:0,compositedMeanForeground:0,compositedOver16:0,foregroundPixels:1000};}
function checkList(name,failed=false){return['initial','pen','eraser',variant(name).label,...(name==='A'?['zoom']:[])].map(label=>metric(label,label===variant(name).label&&failed));}
async function runEndpoint(name,fault){
  const h=makeHarness(name,fault),s=h.sandbox,labels=variant(name),calls=h.calls;
  let terminalReached=false;Object.assign(calls,{zoom:[],tailSaves:0,screenshots:0,cold:0});
  const afterTerminal=what=>{if(terminalReached&&name!=='A')throw Error('Unexpected post-endpoint '+what);};
  s.checks=['initial','pen','eraser'].map(label=>metric(label));s.diagnoseInk=false;s.engine='vm';
  const draw=s.drawAll;s.drawAll=()=>{afterTerminal('draw');return draw();};
  s.paint=async()=>{afterTerminal('paint');calls.paints++;};
  s.save=async()=>{afterTerminal('save');calls.tailSaves++;};
  s.setViewZoom=value=>{afterTerminal('zoom');calls.zoom.push(value);};
  s.screenshot=async()=>{afterTerminal('screenshot');calls.screenshots++;return'mock-screenshot';};
  s.controlledInkRaster=()=>{calls.cold++;throw Error('No interventionist replay in endpoint fixture');};
  s.audit=async label=>{calls.audits.push(label);const result=metric(label);s.checks.push(result);if(label===labels.label)terminalReached=true;return result;};
  const init=between(h.source,'await p.evaluate(()=>{window.__inkSurfaceTrace=[];',';await p.evaluate(traceInkFixture);');
  vm.runInContext('globalThis.initializeUnderTest=async()=>{'+init+';};',s,{timeout:1000});await s.initializeUnderTest();
  const pointer=between(h.source,'async function pointer(','\n// Desktop WebKit');
  const actions=between(h.source,"await p.evaluate(()=>{window.__recordInkSurface('before media open');",'    }finally{try{diagnostic.trace=');
  vm.runInContext(pointer+'\nglobalThis.endpointUnderTest=async()=>{'+actions+'};',s,{timeout:1000});
  h.result=await s.endpointUnderTest();h.records=plain(s.window.__inkSurfaceTrace);return h;
}
function record(trace,phase,label){const found=trace.filter(x=>x.kind==='gesture-history'&&x.phase===phase&&x.label===label);assert.equal(found.length,1);return found[0];}

test('actual serialized endpoints stop at real open, commit, undo or close without manufacturing a close',async()=>{
  for(const name of names){const h=await runEndpoint(name),committed=name==='K'||name==='M',closed=name==='A'||name==='M';
    assert.deepEqual(plain(h.calls.actions.map(x=>x[0])),name==='O'?[]:['pointerdown','pointermove','pointerup']);
    assert.deepEqual(plain(h.calls.clicks),name==='A'||name==='U'?['#mediaEdit','#layoutUndo']:['#mediaEdit']);
    assert.equal(h.calls.close,closed?1:0);assert.equal(h.calls.saves,name==='O'?0:committed?1:2);assert.equal(h.sandbox.editRevision,h.calls.saves);
    assert.equal(h.calls.readbacks,0);assert.equal(h.sandbox.mediaGesture,null);assert.equal(h.captures.size,0);assert.equal(h.sandbox.mediaSelecting,!closed);
    assert.equal(!!h.sandbox.mediaSelection,name==='K');assert.equal(h.page.strokes===h.initialList,name==='O');assert.equal(h.page.strokes[0]===h.initialText,!committed);
    if(committed){
      const points=h.page.strokes[0].points,last=h.records.filter(x=>x.kind==='gesture-history').at(-1);assert.equal(points.length,1);
      assert.ok(Number.isFinite(points[0].x)&&Math.abs(points[0].x-340)<=1e-9);assert.ok(Number.isFinite(points[0].y)&&Math.abs(points[0].y-345)<=1e-9);
      assert.equal(points[0].x,last.targetX,'Raw committed x is the observer value, without rounding');assert.equal(points[0].y,last.targetY,'Raw committed y is the observer value, without rounding');
    }else assert.deepEqual(plain(h.page.strokes[0].points),[{x:300,y:320}]);
    assert.equal(h.sandbox.mediaUndo.get('p0')?.length||0,committed?1:0);
    assert.deepEqual(plain(h.calls.audits),name==='A'?['media undo','zoom']:[variant(name).label]);assert.deepEqual(plain(h.result.checks.map(x=>x.label)),checkList(name).map(x=>x.label));
    assert.equal(h.calls.tailSaves,name==='A'?1:0);assert.equal(h.calls.screenshots,name==='A'?1:0);assert.deepEqual(plain(h.calls.zoom),name==='A'?[1.5]:[]);assert.equal(h.calls.cold,0);
    assert.doesNotThrow(()=>endpoint.validateEndpointEvidence(h.records,variant(name)));
  }
});

test('no actual gesture or no observed preview movement invalidates a nominally dispatched commit',async()=>{
  await assert.rejects(()=>runEndpoint('K',{noStart:true}));
  const h=await runEndpoint('K',{noDraftMove:true});assert.equal(record(h.records,'after','pointermove').gestureMoved,false);
  assert.throws(()=>endpoint.validateEndpointEvidence(h.records,variant('K')),'Pointerup may move/commit but cannot retroactively invent an observed preview');
});

test('missing, extra, non-finite or wrong-action metadata is rejected at the exact endpoint',async()=>{
  const h=await runEndpoint('K');
  for(const mutate of [
    t=>t.splice(t.indexOf(record(t,'after','pointerdown')),1),
    t=>{record(t,'after','pointerup').input.type='pointercancel';},
    t=>{record(t,'before','pointermove').input.x=NaN;record(t,'after','pointermove').input.x=NaN;},
    t=>t.push({...structuredClone(record(t,'after','pointerup')),ordinal:999,label:'pointermove'}),
    t=>t.push({kind:'gesture-history-error',message:'observer invalid'}),
    t=>{record(t,'after','pointerup').gesture=true;},
    t=>{record(t,'after','pointerup').targetSame=true;},
    t=>{record(t,'after','pointerup').undoDepth=0;},
    t=>{record(t,'after','pointerup').revisionDelta=0;},
    t=>{record(t,'after','pointerup').refs[1].pointSame=0;},
    t=>{record(t,'after','pointerup').targetX+=1e-8;},
    t=>{record(t,'after','pointerup').targetX=NaN;},
  ]){const trace=structuredClone(h.records);mutate(trace);assert.throws(()=>endpoint.validateEndpointEvidence(trace,variant('K')));}
  const u=await runEndpoint('U');assert.throws(()=>endpoint.validateEndpointEvidence(u.records,variant('K')),'A real undo is not a commit-open endpoint');
  const m=await runEndpoint('M');assert.throws(()=>endpoint.validateEndpointEvidence(m.records,variant('K')),'A later close cannot be hidden in a commit-open trace');
  const badDraft=structuredClone(h.records);record(badDraft,'after','pointermove').draftX+=1e-8;assert.throws(()=>endpoint.validateEndpointEvidence(badDraft,variant('K')),'Subpixel tolerance is not a broad draft-position allowance');
});

test('outer failure handling preserves the actual failure and teardown but does not take a non-A screenshot',async()=>{
  for(const name of names){let evaluated=0,screenshots=0,finished=0;const report={results:[]};
    const f={goto:async()=>{},finish:async()=>finished++,p:{evaluate:async()=>{evaluated++;return{diagnostic:'unchanged'};},screenshot:async()=>screenshots++}};
    const scope={caseFilter:null,assert,console:{log(){},error(){}},fixture:async()=>f,report,path,out:'/not-written'};
    const code=between(changed(name).source,'async function check(','\nfunction traceInkFixture(');vm.createContext(scope);vm.runInContext(code+'\nglobalThis.checkUnderTest=check;',scope,{timeout:1000});
    await scope.checkUnderTest({},'webkit','endpoint',async()=>{throw Error('original endpoint sentinel');});
    assert.equal(evaluated,1);assert.equal(screenshots,name==='A'?1:0);assert.equal(finished,1);assert.equal(report.results.length,1);assert.equal(report.results[0].passed,false);assert.match(report.results[0].error,/original endpoint sentinel/);
  }
});

function failure(name){return'AssertionError [ERR_ASSERTION]: '+variant(name).label+': alpha deviation\n    at original quality loop';}
test('case validation requires the exact endpoint parity labels and allows no unrelated failure',()=>{
  for(const name of names){
    assert.equal(endpoint.validateCaseOutcome({passed:true,error:null},checkList(name),variant(name)).terminalEnvelopeFailed,false);
    assert.equal(endpoint.validateCaseOutcome({passed:false,error:failure(name)},checkList(name,true),variant(name)).terminalEnvelopeFailed,true);
    for(const [result,measurements]of[
      [{passed:false,error:'Error: save failed'},checkList(name)],
      [{passed:false,error:'AssertionError [ERR_ASSERTION]: zoom: alpha deviation'},checkList(name)],
      [{passed:true,error:null},checkList(name,true)],
      [{passed:true,error:'unexpected error'},checkList(name)],
      [{passed:false,error:'Error: '+variant(name).label+': alpha deviation'},checkList(name,true)],
      [{passed:false,error:failure(name)},checkList(name,true).slice(1)],
    ])assert.throws(()=>endpoint.validateCaseOutcome(result,measurements,variant(name)));
    for(const early of ['initial','pen','eraser']){const measurements=checkList(name,true);measurements.find(x=>x.label===early).alphaMax=64;assert.throws(()=>endpoint.validateCaseOutcome({passed:false,error:failure(name)},measurements,variant(name)));}
    if(name!=='A'){const extra=checkList(name);extra.push(metric('zoom'));assert.throws(()=>endpoint.validateCaseOutcome({passed:true,error:null},extra,variant(name)));}
  }
});

function normalizedFor(h,name){
  const open=['O','K','U'].includes(name),scale=open?1.13:.838,pages=[h.page,h.otherPage],rows=pages.map((p,i)=>({id:p.id,top:i*587,height:563}));
  return history.normalizeAudit({visibleInk:JSON.stringify(pages.map(p=>({id:p.id,strokes:p.strokes}))),
    stats:{rows,visible:rows.map(r=>r.id),activeId:'p0',scroll:0,x:0,zoom:1,totalHeight:1150,cachedImages:2,cachedInkTiles:12,inkPixels:2500000},
    surface:{width:open?2260:1676,height:open?1482:1318,cssWidth:open?1130:838,cssHeight:open?741:659,dpr:2,transform:[2,0,0,2,0,0],rowTransforms:rows.map(r=>({id:r.id,transform:[2*scale,0,0,2*scale,0,r.top*2*scale],revision:h.sandbox.pageRevs.get(pages.find(p=>p.id===r.id))||0}))}});
}
async function cases(){const result=[];for(const name of names){const h=await runEndpoint(name),checks=checkList(name,name==='A');result.push({variant:name,engine:'webkit',checks,terminalMetric:checks.find(x=>x.label===variant(name).label),casePassed:name!=='A',caseError:name==='A'?failure(name):null,endpoint:normalizedFor(h,name),endpointEvidence:endpoint.validateEndpointEvidence(h.records,variant(name))});}return result;}
function asMap(rows){return Object.fromEntries(rows.map(row=>[row.variant,row]));}
function hashEndpoint(value){value.normalizedInkSha256=sha(JSON.stringify(value.normalizedInk));value.geometrySha256=sha(JSON.stringify(value.geometry));}

test('only the selected committed text delta is permitted and open geometry is never forced equal to closed geometry',async()=>{
  const rows=await cases(),by=asMap(rows),model=endpoint.validateEndpointInk(by);assert.equal(model.valid,true);assert.equal(model.activeRow,0);assert.equal(model.selectedTextIndex,0);
  assert.equal(by.O.endpoint.geometrySha256,by.K.endpoint.geometrySha256);assert.equal(by.K.endpoint.geometrySha256,by.U.endpoint.geometrySha256);assert.equal(by.A.endpoint.geometrySha256,by.M.endpoint.geometrySha256);assert.notEqual(by.O.endpoint.geometrySha256,by.A.endpoint.geometrySha256);
  assert.equal(by.O.endpoint.normalizedInkSha256,by.U.endpoint.normalizedInkSha256);assert.equal(by.U.endpoint.normalizedInkSha256,by.A.endpoint.normalizedInkSha256);assert.equal(by.K.endpoint.normalizedInkSha256,by.M.endpoint.normalizedInkSha256);assert.notEqual(by.K.endpoint.normalizedInkSha256,by.A.endpoint.normalizedInkSha256);
  const [comparison]=endpoint.classifyComparisons(rows);assert.equal(comparison.status,'controlled-endpoint-observation');assert.equal(comparison.interpretable,true);assert.equal(comparison.AReproduced,true);assert.ok(comparison.geometryPairs.every(x=>x.equal));assert.deepEqual(comparison.comparisons.map(x=>[x.from,x.to]),[['O','K'],['K','U'],['M','A']]);assert.ok(comparison.crossGeometryPairs.every(x=>x.causalIsolation===false));
});

test('wrong model content, target delta, order or hash cannot masquerade as an equivalent endpoint',async()=>{
  const baseline=await cases();
  for(const mutate of [
    by=>{by.K.endpoint.normalizedInk[0].strokes[0].points[0].x+=1e-8;hashEndpoint(by.K.endpoint);},
    by=>{by.K.endpoint.normalizedInk[0].strokes[0].points[0].x=NaN;hashEndpoint(by.K.endpoint);},
    by=>{const p=by.M.endpoint.normalizedInk[0].strokes[0].points[0];p.x+=5e-10;assert.ok(Math.abs(p.x-340)<1e-9);assert.notEqual(p.x,by.K.endpoint.normalizedInk[0].strokes[0].points[0].x);
      const trace=by.M.endpointEvidence.records;let committed=false;for(const r of trace){if(r.phase==='after'&&r.label==='pointerup')committed=true;if(committed)r.targetX=p.x;}
      by.M.endpointEvidence=endpoint.validateEndpointEvidence(trace,variant('M'));hashEndpoint(by.M.endpoint);},
    by=>{by.M.endpoint.normalizedInk[1].strokes[0].points[0].x++;hashEndpoint(by.M.endpoint);},
    by=>{by.U.endpoint.normalizedInk[0].strokes[0].color='#ff0000';hashEndpoint(by.U.endpoint);},
    by=>{by.O.endpoint.normalizedInk.reverse();hashEndpoint(by.O.endpoint);},
    by=>{by.A.endpoint.normalizedInkSha256='0'.repeat(64);},
    by=>{by.K.endpoint={};},
  ]){const rows=structuredClone(baseline);mutate(asMap(rows));assert.throws(()=>endpoint.validateEndpointInk(asMap(rows)));assert.throws(()=>endpoint.classifyComparisons(rows));}
});

test('classification rejects forged metadata and nonterminal errors, and requires a reproduced A and comparable own geometry',async()=>{
  const baseline=await cases();
  for(const mutate of [
    row=>{row.endpointEvidence={...row.endpointEvidence,valid:true,records:[]};},
    row=>{record(row.endpointEvidence.records,'after','pointerup').gesture=true;},
    row=>{row.endpointEvidence.mode='undo-open';},
    row=>{row.casePassed=false;row.caseError='Error: save failed';},
    row=>{row.checks[0].alphaMax=64;},
    row=>{row.terminalMetric={...row.terminalMetric,alphaMax:1};},
    row=>{row.endpoint.geometrySha256='0'.repeat(64);},
  ]){const rows=structuredClone(baseline);mutate(rows.find(x=>x.variant==='K'));assert.throws(()=>endpoint.classifyComparisons(rows));}
  assert.throws(()=>endpoint.classifyComparisons(baseline.slice(1)));const duplicate=structuredClone(baseline);duplicate[1].variant='A';assert.throws(()=>endpoint.classifyComparisons(duplicate));
  const clean=structuredClone(baseline),a=clean.find(x=>x.variant==='A');a.checks=checkList('A');a.terminalMetric=a.checks.find(x=>x.label==='media undo');a.casePassed=true;a.caseError=null;
  const noRepro=endpoint.classifyComparisons(clean)[0];assert.equal(noRepro.status,'inconclusive-A-did-not-reproduce');assert.equal(noRepro.interpretable,false);
  const geometry=structuredClone(baseline),k=geometry.find(x=>x.variant==='K');k.endpoint.geometry.width++;hashEndpoint(k.endpoint);const mismatch=endpoint.classifyComparisons(geometry)[0];assert.equal(mismatch.status,'inconclusive-own-geometry-mismatch');assert.equal(mismatch.interpretable,false);
});
