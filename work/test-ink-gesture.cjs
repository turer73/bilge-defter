'use strict';
// Pure harness contracts: no browser/server/application bootstrap is executed.
// The root agent owns execution. These are not substitutes for the raster gate.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const gesture=require('./diagnose-ink-gesture.cjs'),history=require('./diagnose-ink-history.cjs');
const canonical=fs.readFileSync(path.join(__dirname,'verify-slide-flow.cjs'),'utf8');
const media=fs.readFileSync(path.join(__dirname,'bilge-defter-invited-v78/media-workspace.js'),'utf8');
const index=fs.readFileSync(path.join(__dirname,'bilge-defter-invited-v78/index.html'),'utf8');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex'),plain=value=>JSON.parse(JSON.stringify(value));
const names=['A','C','S','P'];
function variant(name){const found=gesture.VARIANTS.find(x=>x.name===name);assert.ok(found,'Declared variant '+name);return found;}
function changed(name){return gesture.transformRunner(canonical,variant(name));}
function between(source,start,end){assert.equal(source.split(start).length,2,'Unique start '+start);const from=source.indexOf(start),to=source.indexOf(end,from);assert.ok(to>from,'Ordered end '+end);return source.slice(from,to);}

test('gesture experiment pins the actual canonical runner and reuses the frozen history oracle',()=>{
  assert.equal(sha(canonical),'f2cb459827c1d725d6df1f22c6ff12047a02d415a7d26b8eb65f3eaa769de8d0');
  assert.equal(sha(media),'f25586bc8d2aa2abd6bade5a5304ff31b72c8bc427a55f9afefae6ee2fb5af31');
  assert.equal(sha(fs.readFileSync(path.join(__dirname,'diagnose-ink-history.cjs'))),'6e89c84a5840dd0b4c6628987975d4e2c3cd47b432c7bad5548c85ed0dccfaa9');
  assert.deepEqual(gesture.VARIANTS.map(x=>x.name),names);
  assert.equal(typeof gesture.transformRunner,'function');
});

test('unknown interventions and changed canonical event source fail closed',()=>{
  assert.throws(()=>gesture.transformRunner(canonical+'\n',variant('A')));
  assert.throws(()=>gesture.transformRunner(canonical,{name:'unknown'}));
  assert.throws(()=>gesture.transformRunner(canonical,{...variant('S'),unexpected:true}));
  assert.throws(()=>gesture.transformRunner(canonical.replace("await pointer(p,'pointerup',370*g.scale,355*g.scale);","await pointer(p,'pointercancel',370*g.scale,355*g.scale);"),variant('A')));
});

test('the complete measured audit body and strict final quality loop remain byte-identical in every variant',()=>{
  const bodyStart="      window.__inkTracePhase='audit: '+label;",bodyEnd='    },label);';
  const gateStart='for(const result of checks){assert.ok(result.foregroundPixels>0);',gateEnd='\n    return{checks,screenshot:';
  const body=between(canonical,bodyStart,bodyEnd),gate=between(canonical,gateStart,gateEnd);
  const good={label:'media undo',foregroundPixels:1000,alphaMax:0,compositedMax:0,compositedMeanForeground:0,compositedOver16:0};
  for(const name of names){
    const source=changed(name).source;assert.equal(between(source,bodyStart,bodyEnd),body);assert.equal(between(source,gateStart,gateEnd),gate);
    vm.runInNewContext(gate,{assert,checks:[good]},{timeout:1000});
    for(const bad of [{foregroundPixels:0},{alphaMax:33},{compositedMax:33},{compositedMeanForeground:1.001},{compositedOver16:3}])assert.throws(()=>vm.runInNewContext(gate,{assert,checks:[{...good,...bad}]},{timeout:1000}));
  }
});

function oneLineFunction(name){const start='function '+name+'(';assert.equal(media.split(start).length,2);const from=media.indexOf(start);return media.slice(from,media.indexOf('\n',from));}
function indexFunction(name){const start='function '+name+'(';assert.equal(index.split(start).length,2);const from=index.indexOf(start);return index.slice(from,index.indexOf('\n',from));}
const mediaFunctions=[
  ...['selectedMedia','mediaTargetExists','commitMediaTransform','cancelMediaGesture','undoMedia','cancelMediaMode'].map(oneLineFunction),
  ...['touchPage','markChanged'].map(indexFunction),
  between(media,'function startMediaGesture(','\nlayoutHandle.addEventListener')
].join('\n');

// The driver callback and pinned application's gesture/commit functions really
// execute. Only DOM/canvas/event delivery and unrelated geometry validation are
// mocked. All fixture coordinates are interior; this is not a crop/layout test.
function eventHarness(name,{noStart=false,noDraftMove=false}={}){
  const source=changed(name).source,calls={actions:[],clicks:[],saves:0,draws:0,close:0,audits:[],readbacks:0,paints:0};
  const scale=.838,initialText={tool:'text',text:'Cache note',fontSize:24,width:240,color:'#0000ff',points:[{x:300,y:320}]};
  const page={id:'p0',strokes:[initialText],pdf:{width:1000,height:563}},initialList=page.strokes,otherPage={id:'p1',strokes:[{tool:'pen',width:3,points:[{x:12,y:34,p:.5}]}]};
  const sandbox={assert,structuredClone,Math,Map,Set,JSON,document:null,window:{__inkSurfaceTrace:[]},state:{version:3,pages:[page,otherPage],active:page.id},activeId:page.id,editRevision:0,
    ready:true,saveConflict:false,importing:false,drawing:false,pan:false,mediaGesture:null,mediaSelection:null,mediaPending:null,mediaDraft:null,mediaPage:null,mediaPlacement:false,mediaSelecting:false,layoutMulti:false,
    layoutTouches:new Set(),mediaUndo:new Map(),mediaCancelMode:{hidden:true},page:()=>page,notebookPages:()=>[page,otherPage],pageRevs:new Map([[page,1]]),
    point:e=>({x:e.clientX/scale,y:e.clientY/scale}),paperScale:()=>scale,pdfBackgroundReady:()=>true,validMediaStroke:()=>true,constrainMedia:s=>s,
    scheduleSave(){calls.saves++;sandbox.markChanged();},renderSaveStatus(){},drawAll(){calls.draws++;},showMedia(){throw Error('Unexpected new-media dialog');},
    diagnostic:{gestureEvidence:null,historyEndpoint:null},geometry:async()=>({scale}),paint:async()=>calls.paints++,
    audit:async label=>{calls.audits.push(label);return{alphaMax:64,compositedMax:64,compositedMeanForeground:0,compositedOver16:1,foregroundPixels:1000};},
    PointerEvent:class{constructor(type,options){Object.assign(this,options);this.type=type;}},
  };
  const captures=new Set();
  const host={width:1676,height:1318,getBoundingClientRect:()=>({left:0,top:0,width:838,height:659}),setPointerCapture:id=>captures.add(id),hasPointerCapture:id=>captures.has(id),releasePointerCapture:id=>captures.delete(id),
    dispatchEvent(event){event.currentTarget=host;calls.actions.push([event.type,event.clientX,event.clientY,event.pointerId,event.pointerType]);
      if(event.type==='pointerdown'){if(!noStart)sandbox.startMediaGesture(event,page.strokes.find(s=>s.tool==='text'),false);}
      else if(event.type==='pointermove'){if(!noDraftMove)sandbox.moveMediaGesture(event);}
      else sandbox.endMediaGesture(event);
      return true;
    }};
  sandbox.canvas=host;
  sandbox.ctx={getImageData(){calls.readbacks++;throw Error('Gesture observation must not read pixels');},getTransform:()=>({a:2,b:0,c:0,d:2,e:0,f:0})};
  sandbox.document={querySelector(selector){
    if(selector==='#canvas')return host;
    if(selector==='#inputState')return{textContent:''};
    if(selector==='#mediaEdit')return{click(){calls.clicks.push(selector);sandbox.mediaSelecting=true;sandbox.drawAll();}};
    if(selector==='#layoutUndo')return{click(){calls.clicks.push(selector);if(sandbox.mediaGesture)return;if(sandbox.undoMedia()){sandbox.mediaSelection=null;sandbox.drawAll();sandbox.scheduleSave();}}};
    throw Error('Unexpected selector '+selector);
  }};
  sandbox.window.__recordInkSurface=label=>{sandbox.window.__inkSurfaceTrace.push({label,width:1676,height:1318});};
  sandbox.p={evaluate:async(fn,arg)=>structuredClone(await fn(arg)),locator(selector){assert.equal(selector,'#canvas');return{evaluate:async(fn,arg)=>structuredClone(await fn(host,arg))};}};
  vm.createContext(sandbox);vm.runInContext(mediaFunctions,sandbox,{timeout:1000});
  const cancel=sandbox.cancelMediaMode;sandbox.cancelMediaMode=function(){calls.close++;return cancel();};
  return{source,calls,sandbox,page,otherPage,initialText,initialList,host,captures};
}

async function runEvents(name,fault){
  const h=eventHarness(name,fault),pointerBody=between(h.source,'async function pointer(','\n// Desktop WebKit');
  // Run the actual serialized initialization too: this tests the real callback
  // binding instead of supplying a friendlier observer closure manually.
  const init=between(h.source,'await p.evaluate(()=>{window.__inkSurfaceTrace=[];',';await p.evaluate(traceInkFixture);');
  vm.runInContext('globalThis.initializeUnderTest=async()=>{'+init+';};',h.sandbox,{timeout:1000});await h.sandbox.initializeUnderTest();
  const actions=between(h.source,"await p.evaluate(()=>{window.__recordInkSurface('before media open');",'    const undoFailed=');
  vm.runInContext(pointerBody+'\nglobalThis.actionsUnderTest=async()=>{'+actions+'return undo;};',h.sandbox,{timeout:1000});
  h.result=await h.sandbox.actionsUnderTest();h.records=plain(h.sandbox.window.__inkSurfaceTrace);return h;
}

test('serialized A/C/S/P events exercise the real pinned gesture functions and leave unchanged committed content',async()=>{
  const expected={A:['pointerdown','pointermove','pointerup'],C:[],S:['pointerdown','pointerup'],P:['pointerdown','pointermove','pointercancel']};
  for(const name of names){const h=await runEvents(name);
    assert.deepEqual(h.calls.actions.map(x=>x[0]),expected[name]);assert.deepEqual(h.calls.clicks,name==='A'?['#mediaEdit','#layoutUndo']:['#mediaEdit']);
    assert.equal(h.calls.close,1);assert.equal(h.calls.readbacks,0,'Observer has no added pixel read');assert.deepEqual(h.calls.audits,['media undo']);assert.equal(h.result.alphaMax,64,'Final failing signal is untouched');
    assert.equal(h.calls.saves,name==='A'?2:0,'Only committed move plus real undo schedule saves');
    assert.deepEqual(plain(h.page.strokes),[plain(h.initialText)]);assert.equal(h.page.strokes[0],h.initialText,'Undo preserves original text object; preview never replaces it');
    assert.equal(h.page.strokes===h.initialList,name!=='A','Move/undo intentionally changes array identity only in A');
    assert.equal(h.sandbox.mediaGesture,null);assert.equal(h.sandbox.mediaSelection,null);assert.equal(h.sandbox.mediaSelecting,false);assert.equal(h.sandbox.mediaPending,null);assert.equal(h.captures.size,0);assert.equal(h.sandbox.mediaUndo.get('p0')?.length||0,0);
    if(name==='S'){assert.equal(h.calls.actions[0][1],h.calls.actions[1][1]);assert.equal(h.calls.actions[0][2],h.calls.actions[1][2]);}
    if(name==='A'||name==='P'){assert.ok(h.calls.actions[1][1]>h.calls.actions[0][1]);assert.ok(h.calls.actions[1][2]>h.calls.actions[0][2]);}
    assert.doesNotThrow(()=>gesture.validateGestureEvidence(h.records,variant(name)));
  }
});

test('a dispatched selection without an actual gesture start is not acceptable evidence',async()=>{
  const h=await runEvents('S',{noStart:true});assert.deepEqual(h.calls.actions.map(x=>x[0]),['pointerdown','pointerup']);
  assert.equal(h.page.strokes[0].points[0].x,300);assert.throws(()=>gesture.validateGestureEvidence(h.records,variant('S')));
});

test('preview cancel without any draft movement is rejected even though final notes match',async()=>{
  const h=await runEvents('P',{noDraftMove:true});assert.deepEqual(h.calls.actions.map(x=>x[0]),['pointerdown','pointermove','pointercancel']);
  assert.equal(h.page.strokes[0].points[0].x,300);assert.equal(h.calls.saves,0);assert.throws(()=>gesture.validateGestureEvidence(h.records,variant('P')));
});

function record(trace,phase,label){const matches=trace.filter(x=>x.kind==='gesture-history'&&x.phase===phase&&x.label===label);assert.equal(matches.length,1);return matches[0];}
test('missing, reordered or non-finite event evidence is rejected rather than inferred from dispatch alone',async()=>{
  const h=await runEvents('P');
  for(const mutate of [
    trace=>trace.splice(trace.indexOf(record(trace,'after','pointerdown')),1),
    trace=>trace.push({kind:'gesture-history-error',message:'bounded fixture failed'}),
    trace=>{record(trace,'after','pointercancel').input.type='pointerup';},
    trace=>{record(trace,'after','pointercancel').input.id=999;},
    trace=>{record(trace,'before','pointermove').input.x=NaN;record(trace,'after','pointermove').input.x=NaN;},
    trace=>{const before=record(trace,'before','pointermove'),after=record(trace,'after','pointerdown');trace.splice(trace.indexOf(before),1);trace.splice(trace.indexOf(after),0,before);let n=0;for(const r of trace)if(r.kind==='gesture-history')r.ordinal=++n;},
  ]){const trace=structuredClone(h.records);mutate(trace);assert.throws(()=>gesture.validateGestureEvidence(trace,variant('P')));}
  const s=await runEvents('S'),wrongEnd=structuredClone(s.records);for(const phase of ['before','after'])record(wrongEnd,phase,'pointerup').input.x+=1;
  assert.throws(()=>gesture.validateGestureEvidence(wrongEnd,variant('S')),'A changed endpoint is not a stationary selection');
});

test('commit, undo, preview and close cleanup have independent negative controls',async()=>{
  const samples={A:(await runEvents('A')).records,P:(await runEvents('P')).records,S:(await runEvents('S')).records};
  for(const [name,mutate]of[
    ['A',trace=>{record(trace,'after','pointerup').targetSame=true;}],
    ['A',trace=>{record(trace,'after','pointerup').undoDepth=0;}],
    ['A',trace=>{record(trace,'surface','after undo sync').revisionDelta=record(trace,'after','pointerup').revisionDelta;}],
    ['A',trace=>{record(trace,'surface','after undo sync').refs[0].listSame=true;}],
    ['P',trace=>{record(trace,'after','pointermove').gestureMoved=false;}],
    ['P',trace=>{const m=record(trace,'after','pointermove');m.draftX=m.baselineX;m.draftY=m.baselineY;}],
    ['P',trace=>{record(trace,'after','pointercancel').gesture=true;}],
    ['P',trace=>{record(trace,'after','pointercancel').revisionDelta=1;}],
    ['S',trace=>{record(trace,'surface','after media close sync').selectionPresent=true;}],
    ['S',trace=>{record(trace,'after','pointerdown').refs[1].pointSame=0;}],
    ['S',trace=>{record(trace,'surface','after media close sync').pending=true;}],
  ]){const trace=structuredClone(samples[name]);mutate(trace);assert.throws(()=>gesture.validateGestureEvidence(trace,variant(name)),name+' invalid transition');}
});

test('observer stops after close and fails closed on an unsupported reference fixture',async()=>{
  const h=await runEvents('S'),before=JSON.stringify(h.sandbox.window.__inkSurfaceTrace);
  h.sandbox.window.__inkGestureRecord('after','pointermove',{type:'pointermove',id:73,pointerType:'pen',x:10,y:20});assert.equal(JSON.stringify(h.sandbox.window.__inkSurfaceTrace),before);
  const bad=eventHarness('S');bad.page.strokes.push(structuredClone(bad.initialText));
  vm.runInContext('('+gesture.installGestureObserver.toString()+')();',bad.sandbox,{timeout:1000});bad.sandbox.mediaSelecting=true;bad.sandbox.window.__inkGestureRecord('surface','after media open sync');
  assert.ok(bad.sandbox.window.__inkSurfaceTrace.some(x=>x.kind==='gesture-history-error'));assert.throws(()=>gesture.validateGestureEvidence(plain(bad.sandbox.window.__inkSurfaceTrace),variant('S')));
});

function metric(label,failed=false){return{label,alphaMax:failed?64:0,compositedMax:0,compositedMeanForeground:0,compositedOver16:0,foregroundPixels:1000};}
function checks(failed=false){return['initial','pen','eraser','media undo','zoom'].map(label=>metric(label,label==='media undo'&&failed));}
const originalError='AssertionError [ERR_ASSERTION]: media undo: alpha deviation\n    at canonical assertion';

test('case outcome accepts only a clean case or the exact original terminal assertion',()=>{
  assert.equal(gesture.validateCaseOutcome({passed:true,error:null},checks()).terminalEnvelopeFailed,false);
  assert.equal(gesture.validateCaseOutcome({passed:false,error:originalError},checks(true)).terminalEnvelopeFailed,true);
  for(const [result,measurements]of[
    [{passed:false,error:'Error: save failed'},checks()],
    [{passed:false,error:'AssertionError [ERR_ASSERTION]: zoom: alpha deviation'},checks()],
    [{passed:false,error:'AssertionError [ERR_ASSERTION]: initial: alpha deviation'},checks()],
    [{passed:false,error:'Error: media undo: alpha deviation'},checks(true)],
    [{passed:false,error:'AssertionError [ERR_ASSERTION]: media undo: composite maximum'},checks(true)],
    [{passed:true,error:null},checks(true)],
    [{passed:true,error:'unexpected runtime error'},checks()],
    [{passed:false,error:originalError},checks(true).slice(1)],
  ])assert.throws(()=>gesture.validateCaseOutcome(result,measurements));
  for(const label of ['initial','pen','eraser','zoom']){const measurements=checks(true);measurements.find(x=>x.label===label).alphaMax=64;assert.throws(()=>gesture.validateCaseOutcome({passed:false,error:originalError},measurements));}
});

function endpointFor(h){
  const pages=[h.page,h.otherPage],rows=pages.map((p,i)=>({id:p.id,top:i*587,height:563}));
  return history.normalizeAudit({visibleInk:JSON.stringify(pages.map(p=>({id:p.id,strokes:p.strokes}))),
    stats:{rows,visible:rows.map(r=>r.id),activeId:'p0',scroll:0,x:0,zoom:1,totalHeight:1150,cachedImages:2,cachedInkTiles:12,inkPixels:2500000},
    surface:{width:1676,height:1318,cssWidth:838,cssHeight:659,dpr:2,transform:[2,0,0,2,0,0],rowTransforms:rows.map(r=>({id:r.id,transform:[1.676,0,0,1.676,0,r.top*1.676],revision:h.sandbox.pageRevs.get(pages.find(p=>p.id===r.id))||0}))}});
}
async function comparisonCases(){
  const rows=[];for(const name of names){const h=await runEvents(name),measurements=checks(name==='A');rows.push({variant:name,engine:'webkit',checks:measurements,originalMediaUndo:measurements.find(x=>x.label==='media undo'),casePassed:name!=='A',caseError:name==='A'?originalError:null,endpoint:endpointFor(h),gestureEvidence:gesture.validateGestureEvidence(h.records,variant(name))});}return rows;
}
function changeOutcome(row,failed){row.checks=checks(failed);row.originalMediaUndo=row.checks.find(x=>x.label==='media undo');row.casePassed=!failed;row.caseError=failed?originalError:null;}

test('a reproduced A and clean C with matching terminal data permits only bounded gesture contrasts',async()=>{
  const [result]=gesture.classifyComparisons(await comparisonCases());assert.equal(result.status,'controlled-observation');assert.equal(result.interpretable,true);assert.equal(result.AReproduced,true);assert.equal(result.CClean,true);assert.equal(result.terminalComparable,true);
  assert.deepEqual(result.comparisons.map(x=>[x.from,x.to]),[['C','S'],['S','P'],['P','A']]);assert.ok(result.comparisons.every(x=>x.interpretable));assert.equal(Object.hasOwn(result,'cause'),false);assert.equal(Object.hasOwn(result,'releaseEligible'),false);
});

test('a nonreproducing A, failing C, or changed terminal inputs cannot produce an interpretable contrast',async()=>{
  const baseline=await comparisonCases();
  const clean=structuredClone(baseline);changeOutcome(clean.find(x=>x.variant==='A'),false);assert.equal(gesture.classifyComparisons(clean)[0].status,'inconclusive-A-did-not-reproduce');
  const background=structuredClone(baseline);changeOutcome(background.find(x=>x.variant==='C'),true);assert.equal(gesture.classifyComparisons(background)[0].status,'inconclusive-C-background-failure');
  for(const kind of ['ink','geometry']){const changed=structuredClone(baseline),endpoint=changed.find(x=>x.variant==='S').endpoint;if(kind==='ink'){endpoint.normalizedInk[0].strokes[0].points[0].x++;endpoint.normalizedInkSha256=sha(JSON.stringify(endpoint.normalizedInk));}else{endpoint.geometry.scroll=1;endpoint.geometrySha256=sha(JSON.stringify(endpoint.geometry));}
    const [result]=gesture.classifyComparisons(changed);assert.equal(result.status,'inconclusive-terminal-mismatch');assert.equal(result.interpretable,false);assert.ok(result.comparisons.every(x=>x.interpretable===false));}
});

test('classification revalidates raw gesture records and all phase outcomes instead of trusting a valid flag',async()=>{
  const baseline=await comparisonCases();
  for(const mutate of [
    item=>{item.gestureEvidence={valid:true,variant:item.variant,mode:variant(item.variant).mode,records:[]};},
    item=>{record(item.gestureEvidence.records,'surface','after media close sync').selectionPresent=true;},
    item=>{item.gestureEvidence.mode='move-undo';},
    item=>{item.casePassed=false;item.caseError='Error: IndexedDB save failed';},
    item=>{item.casePassed=false;item.caseError='AssertionError [ERR_ASSERTION]: zoom: alpha deviation';},
    item=>{item.checks.find(x=>x.label==='zoom').alphaMax=64;},
    item=>{item.originalMediaUndo={...item.originalMediaUndo,alphaMax:1};},
    item=>{item.endpoint={};},
    item=>{item.endpoint.geometrySha256='0'.repeat(64);},
  ]){const changed=structuredClone(baseline);mutate(changed.find(x=>x.variant==='S'));assert.throws(()=>gesture.classifyComparisons(changed));}
  assert.throws(()=>gesture.classifyComparisons(baseline.slice(1)));const duplicates=structuredClone(baseline);duplicates[1].variant='A';assert.throws(()=>gesture.classifyComparisons(duplicates));
});
