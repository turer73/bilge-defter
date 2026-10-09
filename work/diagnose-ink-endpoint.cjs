'use strict';
// Separate, bounded endpoint observation. Never a product patch or release gate.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),assert=require('node:assert/strict');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const GESTURE_SHA='582680a4822a03285c42004ed02b2dad157d1858f20d5cbaae9540c816d52a8e';
const gestureFile=path.join(__dirname,'diagnose-ink-gesture.cjs');
assert.equal(sha(fs.readFileSync(gestureFile)),GESTURE_SHA,'Frozen gesture helper');
const gesture=require('./diagnose-ink-gesture.cjs'),history=require('./diagnose-ink-history.cjs');
const PINS=Object.freeze({...gesture.PINS,gesture:GESTURE_SHA,media:'f25586bc8d2aa2abd6bade5a5304ff31b72c8bc427a55f9afefae6ee2fb5af31'});
const VARIANTS=Object.freeze([
  Object.freeze({name:'A',mode:'move-undo',label:'media undo'}),
  Object.freeze({name:'O',mode:'open-only',label:'open only'}),
  Object.freeze({name:'K',mode:'commit-open',label:'commit open'}),
  Object.freeze({name:'U',mode:'undo-open',label:'undo open'}),
  Object.freeze({name:'M',mode:'commit-close',label:'commit closed'})
]);
const {replaceOne,normalizeAudit,envelopeFailed}=history;
const coordinateNear=(value,expected)=>Number.isFinite(value)&&Math.abs(value-expected)<1e-9;
function knownVariant(variant){const v=VARIANTS.find(x=>x.name===variant?.name);assert.ok(v,'Known endpoint variant');assert.deepEqual(variant,v,'Exact endpoint flags');return v;}
function sliceOne(source,start,end,label){assert.equal(source.split(start).length-1,1,'Unique start: '+label);assert.equal(source.split(end).length-1,1,'Unique end: '+label);const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(b>a,'Ordered hooks: '+label);return source.slice(a,b);}

function transformRunner(canonical,variant){
  assert.equal(sha(canonical),PINS.runner,'Frozen canonical runner');const v=knownVariant(variant);
  const original=gesture.transformRunner(canonical,gesture.VARIANTS.find(x=>x.name==='A'));let source=original.source;
  const start="      window.__inkTracePhase='audit: '+label;",end='    },label);';
  const auditBody=sliceOne(canonical,start,end,'canonical measured audit');
  const quality=canonical.split('\n').find(line=>line.includes('for(const result of checks){assert.ok(result.foregroundPixels>0);'));
  assert.ok(quality,'Exact quality loop');
  if(v.name!=='A'){
    const stop={O:"phase==='surface'&&label==='after media open sync'",K:"phase==='after'&&label==='pointerup'",U:"phase==='surface'&&label==='after undo sync'",M:"phase==='surface'&&label==='after media close sync'"}[v.name];
    if(v.name!=='M')source=replaceOne(source,"if(phase==='surface'&&label==='after media close sync')done=true;",`if(${stop})done=true;`,'freeze observer at real endpoint');
    const actionStart="    await p.evaluate(()=>{window.__recordInkSurface('before media open');",actionEnd="const undo=await audit('media undo');";
    const fullAction=sliceOne(source,actionStart,actionEnd,'media action sequence');
    // Gesture A retains history A's inert if(!false) wrapper around move/undo.
    // Cut the pinned canonical action bytes, not the middle of that wrapper.
    const plannedAction=sliceOne(canonical,actionStart,actionEnd,'canonical media action sequence');
    const down="await pointer(p,'pointerdown',330*g.scale,330*g.scale);",undoStart="await p.evaluate(()=>{window.__recordInkSurface('before undo');",closeStart="await p.evaluate(()=>{window.__recordInkSurface('before media close');";
    for(const hook of [down,undoStart,closeStart])assert.equal(plannedAction.split(hook).length-1,1,'One media phase hook');
    let actions;
    if(v.name==='O')actions=plannedAction.slice(0,plannedAction.indexOf(down));
    if(v.name==='K')actions=plannedAction.slice(0,plannedAction.indexOf(undoStart));
    if(v.name==='U')actions=plannedAction.slice(0,plannedAction.indexOf(closeStart));
    if(v.name==='M')actions=plannedAction.slice(0,plannedAction.indexOf(undoStart))+plannedAction.slice(plannedAction.indexOf(closeStart));
    source=replaceOne(source,fullAction+actionEnd,actions+`const undo=await audit(${JSON.stringify(v.label)});`,'real endpoint, without synthetic close or undo');
    source=replaceOne(source,"if(label==='media undo'&&!diagnosticOnly)diagnostic.historyEndpoint=normalizeAudit(result);",`if(label===${JSON.stringify(v.label)}&&!diagnosticOnly)diagnostic.historyEndpoint=normalizeAudit(result);`,'existing Node post-audit metadata slot');
    const tailStart='    const undoFailed=undo.alphaMax>32',tailEnd="    return{checks,screenshot:await screenshot(p,engine,'ink-cache')};";
    const tail=sliceOne(source,tailStart,tailEnd,'post-terminal cold replay zoom save and screenshot');
    assert.equal(tail.split(quality).length-1,1,'One original final quality loop in tail');
    source=replaceOne(source,tail+tailEnd,quality+'\n    return{checks};','end after terminal quality checks, before all continuation');
    const failureScreenshot="await f?.p.screenshot({path:path.join(out,`${engine}-FAIL-${name.replace(/[^a-z0-9]+/gi,'-')}.png`)});";
    source=replaceOne(source,failureScreenshot,'','omit outer failure screenshot in endpoint-only copy; retain failure metadata and teardown');
    assert.equal(source.includes(failureScreenshot),false,'No endpoint-only failure screenshot call remains');
  }
  assert.equal(sliceOne(source,start,end,'copied measured audit'),auditBody,'Entire original measured body is byte-exact');
  assert.equal(source.split(quality).length-1,1,'Entire final quality loop unchanged');
  if(v.name==='A')assert.equal(source,original.source,'A is the exact frozen gesture A control, including its full tail');
  return{source,provenance:{...original.provenance,variant:v,gestureHelperSha256:PINS.gesture,copiedRunnerSha256:sha(source),gestureAControlSha256:sha(original.source),canonicalAuditBodySha256:sha(auditBody),finalQualityGateSha256:sha(quality),canonicalAuditBodyExact:true,AByteExact:v.name==='A',terminalLabel:v.label,earlyAuditLabels:['initial','pen','eraser'],terminalStopsContinuation:v.name!=='A',outerFailureScreenshotOmitted:v.name!=='A',coordinateArithmeticTolerance:1e-9,coordinateToleranceScope:'Transient drafts and expected committed x/y only; raw K/M coordinates must match exactly. Original/restored points and all pixel gates remain exact/unchanged.',rasterReadsAdded:0,browserCallsAdded:0,releaseEligible:false}};
}

function validateEndpointEvidence(trace,variant){
  const v=knownVariant(variant);assert.ok(Array.isArray(trace));assert.equal(trace.some(x=>x.kind==='gesture-history-error'),false,'Observer must complete within bounds');
  if(v.name==='A')gesture.validateGestureEvidence(trace,gesture.VARIANTS.find(x=>x.name==='A'));
  const records=trace.filter(x=>x.kind==='gesture-history');
  const events=v.name==='O'?[]:['pointerdown','pointermove','pointerup'];
  const expected=['surface|after media open sync',...events.flatMap(x=>['before|'+x,'after|'+x]),...(['A','U'].includes(v.name)?['surface|before undo','surface|after undo sync']:[]),...(['A','M'].includes(v.name)?['surface|before media close','surface|after media close sync']:[])];
  assert.deepEqual(records.map(r=>r.phase+'|'+r.label),expected,'Exact real event prefix and endpoint; no invented close');
  const base=records[0],terminal=records.at(-1);assert.ok(base&&terminal);assert.ok(base.refs.length>0&&base.refs.length<=8);assert.ok(Number.isSafeInteger(base.activeRow)&&base.activeRow>=0&&base.activeRow<base.refs.length);
  assert.equal(base.baselineX,300);assert.equal(base.baselineY,320);assert.equal(base.baselineUndoDepth,0);assert.equal(base.undoDepth,0);assert.equal(base.mediaSelecting,true);assert.equal(base.selectionPresent,false);
  const sameRefs=(r,changedText=false,listSame=true)=>{
    assert.equal(r.refs.length,base.refs.length);
    r.refs.forEach((row,i)=>{const old=base.refs[i],changed=changedText&&i===base.activeRow?1:0;assert.equal(row.index,i);assert.equal(row.pageSame,true);assert.equal(row.baselineStrokeCount,old.baselineStrokeCount);assert.equal(row.baselinePointCount,old.baselinePointCount);assert.equal(row.strokeCount,old.baselineStrokeCount);assert.equal(row.pointCount,old.baselinePointCount);assert.equal(row.strokeSame,old.baselineStrokeCount-changed);assert.equal(row.pointsArraySame,old.baselineStrokeCount-changed);assert.equal(row.pointSame,old.baselinePointCount-changed);assert.equal(row.listSame,i===base.activeRow?listSame:true);});
  };
  const cleanModel=(r,stage)=>{
    const committed=stage==='committed',undone=stage==='undone',revision=committed?1:undone?2:0;
    sameRefs(r,committed,!committed&&!undone);assert.equal(r.targetSame,!committed);if(committed){assert.ok(coordinateNear(r.targetX,340)&&coordinateNear(r.targetY,345),'Finite committed pointer-arithmetic coordinates');}else{assert.equal(r.targetX,300);assert.equal(r.targetY,320);}assert.equal(r.undoDepth,committed?1:0);assert.equal(r.revisionDelta,revision);assert.equal(r.editRevisionDelta,revision);if(!revision)assert.equal(r.updatedSame,true);
  };
  let stage='original',committedPoint=null;
  for(let i=0;i<records.length;i++){
    const r=records[i];assert.equal(r.ordinal,i+1);assert.equal(r.activeRow,base.activeRow);assert.equal(r.activePageSame,true);assert.equal(r.baselineX,300);assert.equal(r.baselineY,320);assert.equal(r.baselineUndoDepth,0);
    for(const key of ['pending','placement','layoutMulti','drawing','pan'])assert.equal(r[key],false,key+' remains inactive');assert.equal(r.layoutTouchCount,0);
    assert.equal(r.mediaSelecting,r.label!=='after media close sync');
    if(r.phase==='after'&&r.label==='pointerup'){stage='committed';committedPoint={x:r.targetX,y:r.targetY};}if(r.phase==='surface'&&r.label==='after undo sync')stage='undone';cleanModel(r,stage);if(stage==='committed')assert.deepEqual({x:r.targetX,y:r.targetY},committedPoint,'Raw committed point is not subsequently changed');
    if(r.phase==='before'||r.phase==='after'){
      assert.ok(r.input&&r.input.type===r.label&&r.input.pointerType==='pen');assert.ok(Number.isSafeInteger(r.input.id));assert.ok(Number.isFinite(r.input.x)&&Number.isFinite(r.input.y));
      if(r.phase==='after')assert.deepEqual(r.input,records[i-1].input,'Before/after input identity');
    }else assert.equal(r.input,null);
    const inGesture=(r.phase==='after'&&['pointerdown','pointermove'].includes(r.label))||(r.phase==='before'&&['pointermove','pointerup'].includes(r.label));
    assert.equal(r.gesture,inGesture,'Real gesture lifetime');
    const moved=(r.phase==='after'&&r.label==='pointermove')||(r.phase==='before'&&r.label==='pointerup');assert.equal(r.gestureMoved,moved);
    // Pointer arithmetic can retain an IEEE-754 remainder in both the draft
    // and committed point. Never round stored data or relax raster thresholds.
    if(inGesture){assert.equal(r.gestureTargetSame,true);assert.ok(coordinateNear(r.draftX,moved?340:300));assert.ok(coordinateNear(r.draftY,moved?345:320));}else{assert.equal(r.gestureTargetSame,null);assert.equal(r.draftX,null);assert.equal(r.draftY,null);}
    const selected=inGesture||(stage==='committed'&&r.label!=='after media close sync');assert.equal(r.selectionPresent,selected);assert.equal(r.selectionTargetSame,selected?stage!=='committed':null);
  }
  if(events.length){const down=records.find(r=>r.phase==='after'&&r.label==='pointerdown'),move=records.find(r=>r.phase==='after'&&r.label==='pointermove'),up=records.find(r=>r.phase==='after'&&r.label==='pointerup');assert.ok(down.input.x>0);assert.equal(down.input.x,down.input.y);assert.equal(move.input.id,down.input.id);assert.deepEqual(up.input,{...move.input,type:'pointerup'});assert.ok(Math.abs(move.input.x-down.input.x*370/330)<1e-9);assert.ok(Math.abs(move.input.y-down.input.y*355/330)<1e-9);}
  assert.equal(terminal.gesture,false);assert.equal(terminal.pending,false);assert.equal(terminal.mediaSelecting,['O','K','U'].includes(v.name));
  return{valid:true,variant:v.name,mode:v.mode,label:v.label,records,observedEventTypes:records.filter(r=>r.phase==='after').map(r=>r.label),terminal:{mediaSelecting:terminal.mediaSelecting,selectionPresent:terminal.selectionPresent,targetX:terminal.targetX,targetY:terminal.targetY,undoDepth:terminal.undoDepth,revisionDelta:terminal.revisionDelta,editRevisionDelta:terminal.editRevisionDelta},referenceSemantics:['K','M'].includes(v.name)?'Only the one-point selected text is cloned; one undo entry remains.':v.name==='O'?'Original array, strokes and point references retained.':'Original stroke and point references restored inside a different shallow array.'};
}

function validateCaseOutcome(result,checks,variant){
  const v=knownVariant(variant);if(v.name==='A')return gesture.validateCaseOutcome(result,checks);
  assert.ok(result&&typeof result.passed==='boolean'&&Array.isArray(checks));assert.deepEqual(checks.map(x=>x.label),['initial','pen','eraser',v.label]);
  for(const metric of checks.slice(0,-1))assert.equal(envelopeFailed(metric),false,'Unrelated early phase failed: '+metric.label);
  const terminal=checks.at(-1),failed=envelopeFailed(terminal);assert.equal(result.passed,!failed,'Unexpected runtime, cache, save or fixture failure is not an endpoint contrast');
  if(failed){const reason=terminal.alphaMax>32?'alpha deviation':terminal.compositedMax>32?'composite maximum':terminal.compositedMeanForeground>1?'foreground average':'foreground outlier fraction',first=String(result.error||'').split(/\r?\n/)[0];assert.ok(first===`AssertionError [ERR_ASSERTION]: ${v.label}: ${reason}`||first===`AssertionError: ${v.label}: ${reason}`,'Exact unchanged terminal quality assertion');}else assert.ok(!result.error);
  return{valid:true,terminalEnvelopeFailed:failed};
}

function validateEndpointInk(by){
  for(const v of VARIANTS){const e=by[v.name]?.endpoint;assert.ok(e&&Array.isArray(e.normalizedInk)&&e.normalizedInk.length>0&&e.geometry,'Complete endpoint');for(const [key,value]of[['normalizedInkSha256',e.normalizedInk],['geometrySha256',e.geometry]]){assert.match(e[key],/^[0-9a-f]{64}$/);assert.equal(e[key],sha(JSON.stringify(value)),'Endpoint data matches its recorded hash');}}
  const base=by.A.endpoint,active=base.geometry.visibleRows.indexOf(base.geometry.activeRow);assert.ok(active>=0,'Active row is visible');
  const texts=base.normalizedInk[active].strokes.map((s,i)=>({s,i})).filter(x=>x.s.tool==='text');assert.equal(texts.length,1,'Exactly one active synthetic text');
  assert.deepEqual(texts[0].s,{tool:'text',text:'Cache note',fontSize:24,width:240,color:'#0000ff',points:[{x:300,y:320}]},'Exact original synthetic text');
  const rawCommitted=by.K.endpoint.normalizedInk[active]?.strokes[texts[0].i]?.points?.[0];assert.ok(rawCommitted);assert.deepEqual(Object.keys(rawCommitted).sort(),['x','y']);assert.ok(coordinateNear(rawCommitted.x,340)&&coordinateNear(rawCommitted.y,345),'Only bounded pointer arithmetic at the selected committed point');
  const committed=structuredClone(base.normalizedInk);committed[active].strokes[texts[0].i].points[0]={x:rawCommitted.x,y:rawCommitted.y};
  for(const v of VARIANTS){const e=by[v.name].endpoint;assert.deepEqual(e.geometry.visibleRows,base.geometry.visibleRows,'Comparable visible row identities/order');assert.equal(e.geometry.activeRow,base.geometry.activeRow);assert.deepEqual(e.normalizedInk,['K','M'].includes(v.name)?committed:base.normalizedInk,'Only the bounded selected text delta is allowed; raw K/M points and all remaining fields are exact: '+v.name);const evidence=by[v.name].endpointEvidence;assert.equal(evidence.records[0].activeRow,e.geometry.activeRow,'Observed target matches measured active row');const final=evidence.records.at(-1),point=e.normalizedInk[active].strokes[texts[0].i].points[0];assert.deepEqual(point,{x:final.targetX,y:final.targetY},'Measured raw point matches the observed real endpoint');}
  return{valid:true,activeRow:base.geometry.activeRow,selectedTextIndex:texts[0].i,allowedDelta:{original:{x:300,y:320},nominalCommitted:{x:340,y:345},rawCommitted:{x:rawCommitted.x,y:rawCommitted.y},arithmeticTolerance:1e-9},sameInkPairs:[['O','U'],['U','A'],['K','M']]};
}

function classifyComparisons(cases){
  assert.ok(Array.isArray(cases)&&cases.length>0);return[...new Set(cases.map(x=>x.engine))].map(engine=>{
    const group=cases.filter(x=>x.engine===engine);assert.deepEqual(group.map(x=>x.variant).sort(),['A','K','M','O','U']);const by=Object.fromEntries(group.map(x=>[x.variant,x]));
    for(const item of group){const v=VARIANTS.find(x=>x.name===item.variant);assert.equal(item.endpointEvidence?.valid,true);assert.equal(item.endpointEvidence.variant,v.name);assert.equal(item.endpointEvidence.mode,v.mode);validateEndpointEvidence(item.endpointEvidence.records,v);validateCaseOutcome({passed:item.casePassed,error:item.caseError},item.checks,v);assert.deepEqual(item.terminalMetric,item.checks.find(x=>x.label===v.label));}
    const ink=validateEndpointInk(by),geometryPairs=[['O','K'],['K','U'],['M','A']].map(([from,to])=>({from,to,equal:by[from].endpoint.geometrySha256===by[to].endpoint.geometrySha256}));
    const geometryComparable=geometryPairs.every(x=>x.equal),reproduced=envelopeFailed(by.A.terminalMetric),interpretable=geometryComparable&&reproduced;
    return{engine,status:!geometryComparable?'inconclusive-own-geometry-mismatch':!reproduced?'inconclusive-A-did-not-reproduce':'controlled-endpoint-observation',interpretable,AReproduced:reproduced,modelValidated:ink,geometryPairs,observations:group.map(x=>({variant:x.variant,label:x.terminalMetric.label,envelopeFailed:envelopeFailed(x.terminalMetric)})),comparisons:[['O','K','Open-only versus committed move; only selected text coordinates differ'],['K','U','Committed move versus undo while panel remains open; selected text restored'],['M','A','Committed-close versus undo-close; only selected text coordinates differ']].map(([from,to,factor])=>({from,to,factor,interpretable,fromEnvelopeFailed:envelopeFailed(by[from].terminalMetric),toEnvelopeFailed:envelopeFailed(by[to].terminalMetric)})),crossGeometryPairs:[['K','M'],['U','A']].map(([from,to])=>({from,to,sameInk:true,geometryMayDiffer:true,causalIsolation:false})),boundary:'Terminal audit waits two animation frames and performs the original four draws. This is not an immediate first-frame, undo-only, backend, or product-fix proof.'};
  });
}

function verifyPackage(directory){
  const manifest=fs.readFileSync(path.join(directory,'SHA256SUMS'));assert.equal(sha(manifest),PINS.manifest);const names=new Set();
  for(const line of manifest.toString('utf8').trim().split(/\r?\n/)){const match=/^([0-9a-f]{64})  (.+)$/.exec(line);assert.ok(match);const file=path.resolve(directory,match[2]);assert.ok(file.startsWith(directory+path.sep));assert.equal(sha(fs.readFileSync(file)),match[1],match[2]);assert.equal(names.has(match[2]),false);names.add(match[2]);}assert.equal(names.size,246);
  for(const [file,key]of[['pdf-workspace.js','renderer'],['index.html','index'],['media-workspace.js','media']])assert.equal(sha(fs.readFileSync(path.join(directory,file))),PINS[key]);
}
const readJson=file=>JSON.parse(fs.readFileSync(file,'utf8'));
async function main(argv=process.argv.slice(2)){
  const repo=path.resolve(__dirname,'..'),release=path.join(repo,'work/bilge-defter-invited-v78'),canonicalFile=path.join(repo,'work/verify-slide-flow.cjs'),historyFile=path.join(__dirname,'diagnose-ink-history.cjs'),stamp=new Date().toISOString().replace(/[-:.TZ]/g,'');
  for(const arg of argv)assert.ok(arg.startsWith('--output-dir=')||arg.startsWith('--engines='));const engines=(argv.find(x=>x.startsWith('--engines='))?.slice(10)||'chromium,webkit').split(',');assert.ok(engines.length>=1&&engines.length<=2&&new Set(engines).size===engines.length&&engines.every(x=>['chromium','webkit'].includes(x)));
  const out=path.resolve(argv.find(x=>x.startsWith('--output-dir='))?.slice(13)||path.join(repo,'outputs/ink-endpoint-diagnostic',stamp));assert.ok(out.startsWith(path.join(repo,'outputs')+path.sep));assert.ok(!fs.existsSync(out),'Preserve previous evidence');fs.mkdirSync(out,{recursive:true});
  const report={diagnosticOnly:true,releaseEligible:false,status:'incomplete',startedAt:new Date().toISOString(),pins:PINS,scriptSha256:sha(fs.readFileSync(__filename)),nodeVersion:process.version,playwrightVersion:require('playwright/package.json').version,engines,variants:[],cases:[],boundaries:[
    'Only copied runners differ. The application, canonical runner, dependencies and original measured raster body and quality thresholds remain pinned.',
    'A is byte-exact frozen gesture A, with its complete original tail. O/K/U/M retain all early measurements and stop after their own terminal audit and unchanged quality loop; finally metadata, failure metadata/report and teardown remain, but the outer failure screenshot is also omitted.',
    'The original terminal audit waits two animation frames, draws once and three warm times, paints its independent full reference, then reads pixels and writes PNGs. It does not measure the first native frame immediately after commit or undo.',
    'Bounded reference arrays and scalar comparisons add CPU work/timing inside existing browser callbacks. No additional hot evaluate, renderer, layout, pixel read, screenshot or model/undo mutation is added.',
    'The observer freezes at each real endpoint, without fabricated close records. K/M retain one real undo entry; O/K/U intentionally keep the panel open. Selection decoration is DOM, not ink.',
    'Only active Cache note coordinates (300,320) versus nominal committed (340,345), within 1e-9 pointer-arithmetic error, may differ. Raw K/M committed coordinates must match each other and their observed endpoints exactly; original/restored coordinates and all remaining ink are exact. No pixel threshold changes. Geometry is compared within O/K/U and M/A, not across open/closed panels; revisions/cache counts remain separately reported mediators.',
    'A must reproduce in this same fresh instrumented run before endpoint contrasts are interpreted. An open-only failure is reported as observed, not silently called clean.',
    'No result replaces the mandatory full acceptance suite or proves a production correction, a CPU/GPU cause, physical tablet acceptance, or permission to publish.'
  ]};
  try{
    const canonical=fs.readFileSync(canonicalFile,'utf8');assert.equal(sha(canonical),PINS.runner);verifyPackage(release);
    for(const variant of VARIANTS){
      const directory=path.join(out,variant.name),file=path.join(directory,'runner.cjs');fs.mkdirSync(directory);const generated=transformRunner(canonical,variant);fs.writeFileSync(file,generated.source);
      const tag=`endpoint-${stamp}-${variant.name.toLowerCase()}`,resultDirectory=path.join(repo,'outputs/slide-flow',`dpr-2-${tag}`),fixture={...generated.provenance,diagnosticOnly:true,releaseEligible:false,packageRoot:release,manifestSha256:PINS.manifest,assets:246,engines,tag,resultDirectory,applicationModified:false,canonicalRunnerModified:false};fs.writeFileSync(path.join(directory,'fixture.json'),JSON.stringify(fixture,null,2));
      const args=[file,'--dpr=2','--case=warm ink',`--tag=${tag}`];if(engines.length===1)args.push(`--engine=${engines[0]}`);console.log(`ENDPOINT ${variant.name}: ${generated.provenance.copiedRunnerSha256}`);
      const child=cp.spawnSync(process.execPath,args,{cwd:repo,env:{...process.env,BILGE_TEST_ROOT:release,BILGE_DIAGNOSTIC_REPO:repo},encoding:'utf8',timeout:240000,maxBuffer:12*1024*1024});fs.writeFileSync(path.join(directory,'runner.log'),(child.stdout||'')+(child.stderr||''));
      const resultFile=path.join(resultDirectory,`report${engines.length===1?'-'+engines[0]:''}-warm-ink.json`),entry={...fixture,exitCode:child.status,signal:child.signal,error:child.error?String(child.error):null,report:resultFile};report.variants.push(entry);
      assert.ok(!child.error&&[0,1].includes(child.status),'Normal child outcome');const summary=readJson(resultFile);assert.equal(summary.runnerSha256,generated.provenance.copiedRunnerSha256);assert.deepEqual(summary.drift,[]);assert.equal(summary.passed+summary.failed,engines.length);assert.deepEqual(summary.results.map(x=>x.engine).sort(),[...engines].sort());assert.ok(summary.results.every(x=>x.name==='warm ink cache preserves bounded full replay quality after edits undo and zoom'));assert.equal(summary.source['/pdf-workspace.js'],PINS.renderer);assert.equal(summary.source['/index.html'],PINS.index);Object.assign(entry,{reportSha256:sha(fs.readFileSync(resultFile)),passed:summary.passed,failed:summary.failed,drift:summary.drift});
      for(const engine of engines){
        const parityFile=path.join(resultDirectory,`${engine}-ink-parity.json`),diagnosticFile=path.join(resultDirectory,`${engine}-ink-surface-diagnostic.json`),checks=readJson(parityFile),diagnostic=readJson(diagnosticFile),caseResult=summary.results.find(x=>x.engine===engine);
        assert.deepEqual(diagnostic.skippedAudits,[]);assert.deepEqual(diagnostic.skippedRegions,[]);assert.ok(diagnostic.historyEndpoint);const evidence=validateEndpointEvidence(diagnostic.trace,variant);validateCaseOutcome(caseResult,checks,variant);
        if(variant.name!=='A'){assert.equal(diagnostic.coldAfterMediaUndoFailure,null);assert.equal(Object.hasOwn(diagnostic,'controlledRaster'),false);assert.equal(Object.hasOwn(caseResult.detail||{},'screenshot'),false,'No terminal continuation screenshot');}
        report.cases.push({variant:variant.name,engine,casePassed:caseResult.passed,caseError:caseResult.error||null,checks,terminalMetric:checks.find(x=>x.label===variant.label),endpoint:diagnostic.historyEndpoint,endpointEvidence:evidence,report:parityFile,paritySha256:sha(fs.readFileSync(parityFile)),diagnosticSha256:sha(fs.readFileSync(diagnosticFile))});
      }
      verifyPackage(release);assert.equal(sha(fs.readFileSync(canonicalFile)),PINS.runner);assert.equal(sha(fs.readFileSync(historyFile)),PINS.history);assert.equal(sha(fs.readFileSync(gestureFile)),PINS.gesture);
    }
    assert.equal(report.cases.length,engines.length*5);report.comparisons=classifyComparisons(report.cases);report.status=report.comparisons.some(x=>x.interpretable)?'controlled-endpoint-observations':'inconclusive';
  }catch(error){report.status='inconclusive-harness-error';report.error=String(error.stack||error);process.exitCode=1;}
  finally{
    report.completedAt=new Date().toISOString();report.originalSourceStillPinned=sha(fs.readFileSync(path.join(release,'pdf-workspace.js')))===PINS.renderer;report.originalRunnerStillPinned=sha(fs.readFileSync(canonicalFile))===PINS.runner;report.historyStillPinned=sha(fs.readFileSync(historyFile))===PINS.history;report.gestureStillPinned=sha(fs.readFileSync(gestureFile))===PINS.gesture;if(!report.originalSourceStillPinned||!report.originalRunnerStillPinned||!report.historyStillPinned||!report.gestureStillPinned){report.status='inconclusive-drift';process.exitCode=1;}
    const file=path.join(out,'results.json');fs.writeFileSync(file,JSON.stringify(report,null,2));console.log(JSON.stringify({diagnosticOnly:true,releaseEligible:false,status:report.status,report:file,error:report.error||null}));return report;
  }
}
module.exports={PINS,VARIANTS,sha,replaceOne,normalizeAudit,transformRunner,validateEndpointEvidence,validateEndpointLifecycle:validateEndpointEvidence,validateEndpointInk,validateCaseOutcome,classifyComparisons,main};
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
