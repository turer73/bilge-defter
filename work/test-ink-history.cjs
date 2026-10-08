'use strict';
// Pure diagnostic-harness contracts only. No browser, server or release gate runs.
// Root owns execution; these tests never load application bootstrap code.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const history=require('./diagnose-ink-history.cjs');
const original=fs.readFileSync(path.join(__dirname,'verify-slide-flow.cjs'),'utf8');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const PIN='f2cb459827c1d725d6df1f22c6ff12047a02d415a7d26b8eb65f3eaa769de8d0';
const variants=['A','B','C','D'];
function transformed(variant){return history.transformRunner(original,history.VARIANTS.find(x=>x.name===variant));}
function onceBetween(source,start,end){assert.equal(source.split(start).length,2,'Unique start '+start);const from=source.indexOf(start),to=source.indexOf(end,from);assert.ok(to>from,'End marker exists '+end);return source.slice(from,to);}
function auditSource(source){return onceBetween(source,'async function audit(label,diagnosticOnly=false)','\n    try{');}
function plain(value){return JSON.parse(JSON.stringify(value));}

// Mock the canvas boundary, not the transformed callback: p.evaluate invokes the
// actual serialized callback. Pixel values are deliberately unequal/nonempty so
// a fake successful measurement cannot satisfy the final-audit assertions.
function auditHarness(source,extra={}){
  const calls={paint:0,draw:0,primitive:0,read:[],png:[],writes:[],reference:[],events:[]};
  const page={id:'page-a',strokes:[{tool:'pen',color:'#123456',width:3,points:[{x:1,y:2,p:.5}]}]};
  const transform={a:2,b:0,c:0,d:2,e:0,f:0};
  const actual=new Uint8ClampedArray([0,0,0,255,0,0,0,0]);
  const expected=new Uint8ClampedArray([0,0,0,255,24,60,56,64]);
  const context=(name,data)=>({
    getTransform:()=>transform,getImageData(...args){calls.read.push([name,...args]);return{data};},
    save(){calls.events.push([name,'save']);},restore(){calls.events.push([name,'restore']);},
    setTransform(...args){calls.events.push([name,'setTransform',...args]);},beginPath(){},rect(...args){calls.events.push([name,'rect',...args]);},clip(){}
  });
  const target=context('reference',expected),ctx=context('actual',actual);
  const canvas={width:2,height:1,getBoundingClientRect:()=>({width:1,height:.5}),toDataURL(type){calls.png.push(['actual',type]);return'data:image/png;base64,AA==';}};
  const stats={x:0,scroll:0,zoom:1,totalHeight:563,activeId:page.id,rows:[{id:page.id,top:0,height:563}],visible:[page.id],inkPixels:2,cachedInkTiles:1,cachedImages:1};
  const sandbox={assert,Buffer,path,sha,checks:[],diagnostic:{skippedAudits:[],skippedRegions:[],historyEndpoint:null},normalizeAudit:history.normalizeAudit,engine:'spy',out:'/diagnostic-only',window:{},devicePixelRatio:2,canvas,ctx,state:{pages:[page]},pageRevs:new Map([[page,7]]),mediaImages:new Map(),
    BilgeSlideFlow:{snapshot:()=>stats,scale:()=>.5},drawAll(){calls.draw++;},drawStroke(){calls.primitive++;},
    document:{createElement(kind){assert.equal(kind,'canvas');const c={width:0,height:0,getContext(type){assert.equal(type,'2d');return target;},toDataURL(type){calls.png.push(['reference',type]);return'data:image/png;base64,AQ==';}};calls.reference.push(c);return c;}},
    paint:async()=>{calls.paint++;},p:{evaluate:async(fn,arg)=>structuredClone(await fn(arg))},fs:{writeFileSync(...args){calls.writes.push(args);}},...extra};
  vm.createContext(sandbox);vm.runInContext(auditSource(source)+'\nglobalThis.auditUnderTest=audit;',sandbox,{timeout:1000});
  return{calls,sandbox,stats,async run(label,diagnosticOnly=false){return sandbox.auditUnderTest(label,diagnosticOnly);}};
}

test('the immutable canonical runner and diagnostic exports are explicit',()=>{
  assert.equal(sha(original),PIN);
  for(const name of ['sha','replaceOne','transformRunner','normalizeAudit','classifyComparisons'])assert.equal(typeof history[name],'function',name);
  assert.deepEqual(history.VARIANTS.map(x=>x.name),variants);
  assert.deepEqual(history.VARIANTS.map(x=>[x.suppressEarlyReadbacks,x.omitMediaEdit]),[[false,false],[true,false],[false,true],[true,true]]);
});

test('unique replacements fail closed on absent or duplicated sites',()=>{
  assert.equal(history.replaceOne('left NEEDLE right','NEEDLE','X','test hook'),'left X right');
  assert.throws(()=>history.replaceOne('left right','NEEDLE','X','missing hook'));
  assert.throws(()=>history.replaceOne('NEEDLE NEEDLE','NEEDLE','X','ambiguous hook'));
});

test('runner drift and unknown variants are rejected rather than normalized',()=>{
  assert.throws(()=>history.transformRunner(original+'\n',history.VARIANTS[0]));
  assert.throws(()=>history.transformRunner(original.replace("const undo=await audit('media undo');","const undo=await audit('initial');"),history.VARIANTS[1]));
  assert.throws(()=>history.transformRunner(original,{name:'unknown'}));
  assert.throws(()=>history.transformRunner(original,{...history.VARIANTS[1],suppressEarlyReadbacks:false}));
});

test('all four transformed audit functions execute the original final readback, including the cold label',async()=>{
  for(const variant of variants)for(const label of ['media undo','media undo cold diagnostic','zoom']){
    const h=auditHarness(transformed(variant).source),r=await h.run(label,label==='media undo cold diagnostic');
    assert.deepEqual(h.calls.read.map(x=>x[0]),['actual','reference'],variant+' '+label);
    assert.deepEqual(h.calls.png.map(x=>x[0]),['actual','reference']);assert.equal(h.calls.writes.length,2);
    assert.equal(h.calls.paint,1);assert.equal(h.calls.draw,4);assert.equal(h.calls.primitive,1);
    assert.equal(h.calls.reference[0].width,1);assert.equal(h.calls.reference[0].height,1,'Reference disposal is preserved');
    assert.equal(r.alphaMax,64,'The deliberately failing signal must not become a fabricated zero');
    assert.equal(r.foregroundPixels,2);assert.ok(r.compositedMax>32);assert.equal(r.warmCalls,0);
    assert.equal(h.sandbox.checks.length,label==='media undo cold diagnostic'?0:1);
    assert.equal(!!h.sandbox.diagnostic.historyEndpoint,label==='media undo','Endpoint is captured only at the original media undo audit');
  }
});

test('only the three early audit labels omit pixels in B and D while retaining drawings and reference disposal',async()=>{
  for(const variant of variants)for(const label of ['initial','pen','eraser']){
    const skipped=variant==='B'||variant==='D',h=auditHarness(transformed(variant).source),r=await h.run(label);
    assert.equal(h.calls.paint,1);assert.equal(h.calls.draw,4);assert.equal(h.calls.primitive,1);
    assert.equal(h.calls.reference.length,1);assert.equal(h.calls.reference[0].width,1);assert.equal(h.calls.reference[0].height,1);
    assert.equal(h.calls.read.length,skipped?0:2);assert.equal(h.calls.png.length,skipped?0:2);assert.equal(h.calls.writes.length,skipped?0:2);
    assert.equal(h.sandbox.checks.length,skipped?0:1);
    if(skipped){assert.equal(r.measured,false);for(const field of ['alphaMax','foregroundPixels','compositedMax','compositedMeanForeground','unequal','images'])assert.equal(Object.hasOwn(r,field),false,'Skipped metrics are absent, not zero: '+field);assert.equal(h.sandbox.diagnostic.skippedAudits.length,1);}
    else assert.equal(r.alphaMax,64);
  }
});

test('unmeasured early audit still rejects warm geometry replay and exhausted cache guards',async()=>{
  for(const variant of ['B','D']){
    const replay=auditHarness(transformed(variant).source);replay.sandbox.drawAll=()=>{replay.calls.draw++;replay.sandbox.drawStroke();};
    await assert.rejects(()=>replay.run('initial'),/warm viewport/);
    const oversized=auditHarness(transformed(variant).source);oversized.stats.inkPixels=8000001;await assert.rejects(()=>oversized.run('pen'),/bounded ink pixels/);
    const empty=auditHarness(transformed(variant).source);empty.stats.cachedInkTiles=0;await assert.rejects(()=>empty.run('eraser'),/cache exercised/);
  }
});

function sequenceHarness(source){
  const calls={reads:0,evaluate:0,rect:0,paint:0,geometry:0,strokes:[],pointer:[],clicks:[],audits:[],close:0,events:[]};
  let phase='initial';const text={tool:'text',text:'Cache note',points:[{x:300,y:320}]},page={strokes:[text]};
  const sandbox={assert,diagnostic:{skippedAudits:[],skippedRegions:[]},window:{__recordInkSurface:label=>calls.events.push(label)},page:()=>page,
    canvas:{width:1000,getBoundingClientRect(){calls.rect++;return{width:1000,height:563};}},
    ctx:{getImageData(){calls.reads++;return{data:new Uint8ClampedArray([0,0,0,phase==='pen'?255:0,0,0,0,phase==='pen'?255:0,0,0,0,phase==='pen'?255:0])};}},
    p:{evaluate:async(fn,arg)=>{calls.evaluate++;return fn(arg);}},paint:async()=>calls.paint++,geometry:async()=>{calls.geometry++;return{scale:1};},
    stroke:async(_p,tool,points)=>{calls.strokes.push([tool,points]);phase=tool;},pointer:async(_p,type,x,y)=>{calls.pointer.push([type,x,y]);if(type==='pointermove'){text.points[0]={x:340,y:345};}},
    document:{querySelector:selector=>({click(){calls.clicks.push(selector);if(selector==='#layoutUndo')text.points[0]={x:300,y:320};}})},
    cancelMediaMode(){calls.close++;},audit:async label=>{calls.audits.push(label);return{alphaMax:64,compositedMax:64,compositedMeanForeground:2,compositedOver16:1,foregroundPixels:2};}};
  vm.createContext(sandbox);const body=onceBetween(source,'const region=','    const undoFailed=');
  vm.runInContext('globalThis.sequenceUnderTest=async()=>{'+body+'return undo;};',sandbox,{timeout:1000});
  return{calls,sandbox,text,run:()=>sandbox.sequenceUnderTest()};
}

test('the actual serialized ROI and media action sequence implements all four interventions without masking the final label',async()=>{
  const observations={};
  for(const variant of variants){
    const h=sequenceHarness(transformed(variant).source),result=await h.run(),skip=variant==='B'||variant==='D',omit=variant==='C'||variant==='D';observations[variant]=h.calls;
    assert.deepEqual(h.calls.strokes.map(x=>x[0]),['pen','eraser']);assert.deepEqual(h.calls.audits,['initial','pen','eraser','media undo']);
    assert.equal(h.calls.rect,3,'All three awaited ROI geometry callbacks remain');assert.equal(h.calls.reads,skip?0:3);
    assert.deepEqual(h.calls.clicks,omit?['#mediaEdit']:['#mediaEdit','#layoutUndo']);assert.equal(h.calls.pointer.length,omit?0:3);assert.equal(h.calls.close,1);
    assert.deepEqual(plain(h.text.points[0]),{x:300,y:320});assert.equal(result.alphaMax,64);
    if(skip){assert.equal(h.sandbox.diagnostic.skippedRegions.length,3);for(const item of h.sandbox.diagnostic.skippedRegions){assert.equal(item.measured,false);assert.equal(Object.hasOwn(item,'alpha'),false);}}
  }
  assert.equal(observations.A.evaluate,observations.B.evaluate,'Readback intervention preserves p.evaluate rounds');
  assert.equal(observations.C.evaluate,observations.D.evaluate);
});

test('every transformed final quality loop is byte-identical and behaviorally rejects each original threshold',()=>{
  const start='for(const result of checks){assert.ok(result.foregroundPixels>0);',end='\n    return{checks,screenshot:',gate=onceBetween(original,start,end);
  const good={label:'control',foregroundPixels:1000,alphaMax:0,compositedMax:0,compositedMeanForeground:0,compositedOver16:0};
  for(const variant of variants){assert.equal(onceBetween(transformed(variant).source,start,end),gate);
    const execute=result=>vm.runInNewContext(gate,{assert,checks:[result]},{timeout:1000});execute(good);
    for(const bad of [{foregroundPixels:0},{alphaMax:33},{compositedMax:33},{compositedMeanForeground:1.001},{compositedOver16:3}])assert.throws(()=>execute({...good,...bad}));
  }
});

function measuredInput(){
  const rows=[{id:'random-a',top:0,height:563},{id:'random-b',top:587,height:563}];
  return{visibleInk:JSON.stringify(rows.map((r,i)=>({id:r.id,strokes:[{tool:'pen',width:3,color:'#173b36',id:'stroke-'+i,points:[{x:553+i,y:40,p:.5}]},{tool:'text',text:'Cache note',points:[{x:300,y:320}]}]}))),
    stats:{rows,visible:rows.map(r=>r.id),activeId:rows[0].id,scroll:0,x:0,zoom:1,totalHeight:1150,cachedImages:2,cachedInkTiles:12,inkPixels:2500000},
    surface:{width:1676,height:1318,cssWidth:838,cssHeight:659,dpr:2,transform:[2,0,0,2,0,0],rowTransforms:rows.map((r,i)=>({id:r.id,transform:[1.676,0,0,1.676,0,r.top*1.676],revision:7+i}))}};
}
function changeInk(input,change){const ink=JSON.parse(input.visibleInk);change(ink);input.visibleInk=JSON.stringify(ink);}
function metric(failed=false){return{label:'media undo',alphaMax:failed?64:0,compositedMax:failed?64:0,compositedMeanForeground:0,compositedOver16:0,foregroundPixels:1000};}
function cases(){const endpoint=history.normalizeAudit(measuredInput());return variants.map(variant=>({variant,engine:'webkit',originalMediaUndo:metric(variant==='A'||variant==='C'),endpoint:structuredClone(endpoint)}));}

test('normalization removes only top-level page identity and preserves exact final rendering inputs',()=>{
  const a=measuredInput(),b=structuredClone(a),before=JSON.stringify(a),replace=id=>'new-'+id;
  changeInk(b,ink=>{for(const p of ink)p.id=replace(p.id);});
  b.stats.rows.forEach(r=>r.id=replace(r.id));b.stats.visible=b.stats.visible.map(replace);b.stats.activeId=replace(b.stats.activeId);b.surface.rowTransforms.forEach(r=>r.id=replace(r.id));
  const left=history.normalizeAudit(a),right=history.normalizeAudit(b);
  assert.equal(left.normalizedInkSha256,right.normalizedInkSha256);assert.equal(left.geometrySha256,right.geometrySha256);assert.equal(JSON.stringify(a),before);
  assert.equal(left.geometry.scale,.838);assert.deepEqual(left.geometry.visibleRows,[0,1]);assert.equal(left.normalizedInk[0].strokes[0].id,'stroke-0');
  for(const mutate of [p=>{p[0].strokes[0].points[0].x+=.0000000001;},p=>{p[0].strokes[0].points[0].p=.4;},p=>{p[0].strokes[1].text='Different';},p=>{p[0].strokes[0].id='different-nested-id';},p=>{p[0].strokes.reverse();}]){
    const changed=measuredInput();changeInk(changed,mutate);assert.notEqual(history.normalizeAudit(changed).normalizedInkSha256,left.normalizedInkSha256);
  }
});

test('geometry comparison retains bitmap, CSS, transform, view and row geometry but reports revisions separately',()=>{
  const first=history.normalizeAudit(measuredInput());
  for(const mutate of [p=>p.surface.width++,p=>p.surface.cssWidth++,p=>p.surface.dpr=1,p=>p.surface.transform[0]=1,p=>p.stats.scroll=.25,p=>p.stats.x=.25,p=>p.stats.zoom=1.5,p=>p.stats.rows[1].top++,p=>p.surface.rowTransforms[1].transform[5]+=.00000001,p=>p.stats.activeId='random-b']){
    const changed=measuredInput();mutate(changed);const next=history.normalizeAudit(changed);assert.notEqual(next.geometrySha256,first.geometrySha256);assert.equal(next.normalizedInkSha256,first.normalizedInkSha256);
  }
  const changed=measuredInput();changed.surface.rowTransforms[0].revision=999;changed.stats.cachedInkTiles=2;changed.stats.inkPixels=123;changed.stats.cachedImages=1;
  const next=history.normalizeAudit(changed);assert.equal(next.geometrySha256,first.geometrySha256);assert.equal(next.normalizedInkSha256,first.normalizedInkSha256);assert.notDeepEqual(next.mediators,first.mediators);assert.equal(next.mediators.pageRevisions[0].revision,999);
});

test('invalid or ambiguous measured endpoints cannot be normalized',()=>{
  for(const mutate of [p=>p.measured=false,p=>p.visibleInk='[]',p=>p.stats.rows[1].id=p.stats.rows[0].id,p=>p.stats.activeId='missing',p=>p.stats.visible.reverse(),p=>p.surface.width=NaN,p=>p.surface.rowTransforms.reverse(),p=>p.surface.transform.pop(),p=>{changeInk(p,ink=>{ink[0].extra='discard-me';});}]){
    const changed=measuredInput();mutate(changed);assert.throws(()=>history.normalizeAudit(changed));
  }
});

test('a reproducing control permits bounded contrasts, never a release or causal verdict',()=>{
  const [result]=history.classifyComparisons(cases());assert.equal(result.status,'controlled-observation');assert.equal(result.controlReproduced,true);assert.equal(result.terminalComparable,true);assert.equal(result.comparisons.length,4);
  assert.ok(result.comparisons.every(x=>x.interpretable));assert.deepEqual(result.observations.map(x=>x.envelopeFailed),[true,false,true,false]);
  assert.equal(Object.hasOwn(result,'releaseEligible'),false);assert.equal(Object.hasOwn(result,'cause'),false);
});

test('an all-passing fresh control remains inconclusive, including an intervention that alone fails',()=>{
  for(const interventionFailure of [false,true]){const rows=cases();for(const row of rows)row.originalMediaUndo=metric(false);if(interventionFailure)rows[1].originalMediaUndo=metric(true);
    const [result]=history.classifyComparisons(rows);assert.equal(result.status,'inconclusive-control-did-not-reproduce');assert.equal(result.controlReproduced,false);assert.ok(result.comparisons.every(x=>x.interpretable===false));}
});

test('changed terminal ink or geometry makes even a passing intervention incomparable',()=>{
  for(const kind of ['ink','geometry']){const rows=cases(),changed=measuredInput();if(kind==='ink')changeInk(changed,ink=>ink[0].strokes.pop());else changed.stats.scroll=1;rows[1].endpoint=history.normalizeAudit(changed);
    const [result]=history.classifyComparisons(rows);assert.equal(result.status,'inconclusive-terminal-mismatch');assert.equal(result.terminalComparable,false);assert.ok(result.comparisons.every(x=>x.interpretable===false));}
});

test('missing, duplicate, non-finite or corrupted terminal evidence is rejected rather than compared as equal',()=>{
  assert.throws(()=>history.classifyComparisons(cases().slice(1)));
  const duplicated=cases();duplicated[1].variant='A';assert.throws(()=>history.classifyComparisons(duplicated));
  for(const mutate of [row=>row.endpoint={},row=>delete row.endpoint.geometrySha256,row=>row.endpoint.normalizedInkSha256='0'.repeat(64),row=>row.endpoint.normalizedInk[0].strokes.pop(),row=>row.endpoint.geometry.scroll++,row=>row.originalMediaUndo.foregroundPixels=0,row=>row.originalMediaUndo.alphaMax=NaN]){
    const rows=cases();mutate(rows[1]);assert.throws(()=>history.classifyComparisons(rows));
  }
});

test('terminal metric validation uses the same strict envelope boundaries as the canonical gate',()=>{
  assert.equal(history.envelopeFailed({...metric(),alphaMax:32,compositedMax:32,compositedMeanForeground:1,compositedOver16:2}),false);
  for(const mutation of [{alphaMax:33},{compositedMax:33},{compositedMeanForeground:1.001},{compositedOver16:3}])assert.equal(history.envelopeFailed({...metric(),...mutation}),true);
  assert.throws(()=>history.envelopeFailed({...metric(),foregroundPixels:0}));assert.throws(()=>history.envelopeFailed({...metric(),alphaMax:Infinity}));
});
