'use strict';
// Separate diagnostic only. No application, canonical runner or threshold edits.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),assert=require('node:assert/strict');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const HISTORY_SHA='6e89c84a5840dd0b4c6628987975d4e2c3cd47b432c7bad5548c85ed0dccfaa9';
const historyFile=path.join(__dirname,'diagnose-ink-history.cjs');
assert.equal(sha(fs.readFileSync(historyFile)),HISTORY_SHA,'Frozen history helper');
const history=require('./diagnose-ink-history.cjs');
const PINS=Object.freeze({...history.PINS,history:HISTORY_SHA});
const VARIANTS=Object.freeze([
  Object.freeze({name:'A',mode:'move-undo'}),Object.freeze({name:'C',mode:'open-close'}),
  Object.freeze({name:'S',mode:'selection-only'}),Object.freeze({name:'P',mode:'preview-cancel'})
]);
const {replaceOne,normalizeAudit,envelopeFailed}=history;

// Serialized into the existing fixture initialization evaluate. This observes
// references/scalars only. It never calls a renderer, layout API, or readback.
function installGestureObserver(){
  let baseline=null,done=false,serial=0;
  const fail=message=>{window.__inkSurfaceTrace.push({kind:'gesture-history-error',message});done=true;};
  function establish(){
    const rows=notebookPages();if(!rows.length||rows.length>8)throw Error('Unsupported notebook size');
    let strokeCount=0,pointCount=0;
    const refs=rows.map(item=>{
      const strokes=item.strokes.slice();strokeCount+=strokes.length;
      const pointLists=strokes.map(stroke=>stroke.points),points=pointLists.map(list=>{pointCount+=list.length;return list.slice();});
      return{page:item,list:item.strokes,strokes,pointLists,points,pointCount:points.reduce((n,list)=>n+list.length,0)};
    });
    if(strokeCount>2000||pointCount>10000)throw Error('Bounded synthetic reference limit');
    const active=rows.indexOf(page());if(active<0)throw Error('Unknown active row');
    const row=refs[active],targets=row.strokes.map((stroke,index)=>({stroke,index})).filter(x=>x.stroke.tool==='text');
    if(targets.length!==1||targets[0].stroke.points.length!==1)throw Error('Expected one synthetic text target');
    const target=targets[0].stroke;
    return{refs,active,page:page(),target,index:targets[0].index,x:target.points[0].x,y:target.points[0].y,revision:pageRevs.get(page())||0,editRevision,updated:page().updated,undoDepth:mediaUndo.get(activeId)?.length||0};
  }
  window.__inkGestureRecord=(phase,label,input=null)=>{
    if(done)return;
    if(!baseline){if(phase!=='surface'||label!=='after media open sync')return;try{baseline=establish();}catch(e){fail(String(e.message));return;}}
    if(++serial>32){fail('Gesture metadata limit');return;}
    try{
      const now=notebookPages(),current=page(),target=current?.strokes[baseline.index],g=mediaGesture;
      const refs=baseline.refs.map((old,index)=>{
        const item=now[index],list=item?.strokes||[];let strokeSame=0,pointsArraySame=0,pointSame=0,pointCount=0;
        for(let i=0;i<old.strokes.length;i++){const stroke=list[i];if(stroke===old.strokes[i])strokeSame++;if(stroke?.points===old.pointLists[i])pointsArraySame++;const points=stroke?.points||[];pointCount+=points.length;for(let j=0;j<old.points[i].length;j++)if(points[j]===old.points[i][j])pointSame++;}
        return{index,pageSame:item===old.page,listSame:list===old.list,strokeCount:list.length,baselineStrokeCount:old.strokes.length,pointCount,baselinePointCount:old.pointCount,strokeSame,pointsArraySame,pointSame};
      });
      window.__inkSurfaceTrace.push({kind:'gesture-history',ordinal:serial,phase,label,input:input?{type:input.type,id:input.id,pointerType:input.pointerType,x:input.x,y:input.y}:null,activeRow:baseline.active,activePageSame:current===baseline.page,refs,
        mediaSelecting,gesture:!!g,gestureMoved:!!g?.moved,gestureTargetSame:g?g.target===baseline.target:null,draftX:g?.draft?.points[0]?.x??null,draftY:g?.draft?.points[0]?.y??null,
        selectionPresent:!!mediaSelection,selectionTargetSame:mediaSelection?mediaSelection.target===baseline.target:null,targetSame:target===baseline.target,targetX:target?.points[0]?.x??null,targetY:target?.points[0]?.y??null,baselineX:baseline.x,baselineY:baseline.y,
        undoDepth:mediaUndo.get(activeId)?.length||0,baselineUndoDepth:baseline.undoDepth,revisionDelta:(pageRevs.get(current)||0)-baseline.revision,editRevisionDelta:editRevision-baseline.editRevision,updatedSame:current?.updated===baseline.updated,
        pending:!!mediaPending,placement:!!mediaPlacement,layoutMulti,layoutTouchCount:layoutTouches.size,drawing,pan:!!pan});
      if(phase==='surface'&&label==='after media close sync')done=true;
    }catch(e){fail(String(e.message));}
  };
}

function validateGestureEvidence(trace,variant){
  const v=VARIANTS.find(x=>x.name===variant?.name);assert.ok(v,'Known gesture variant');assert.deepEqual(variant,v,'Exact gesture flags');
  assert.ok(Array.isArray(trace));assert.equal(trace.some(x=>x.kind==='gesture-history-error'),false,'Observer completed without bounds/state errors');
  const records=trace.filter(x=>x.kind==='gesture-history');assert.ok(records.length>=3&&records.length<=32);
  records.forEach((r,i)=>assert.equal(r.ordinal,i+1,'Ordered metadata'));
  const one=(phase,label)=>{const matches=records.filter(x=>x.phase===phase&&x.label===label);assert.equal(matches.length,1,`Exactly one ${phase} ${label}`);return matches[0];};
  const base=one('surface','after media open sync'),close=one('surface','after media close sync');
  assert.equal(records[0],base);assert.equal(records.at(-1),close,'Observer ends at original close, before terminal audit');
  assert.equal(base.mediaSelecting,true);assert.equal(base.gesture,false);assert.equal(base.selectionPresent,false);
  const expected={A:['pointerdown','pointermove','pointerup'],C:[],S:['pointerdown','pointerup'],P:['pointerdown','pointermove','pointercancel']}[v.name];
  const order=['surface|after media open sync',...expected.flatMap(type=>['before|'+type,'after|'+type]),...(v.name==='A'?['surface|before undo','surface|after undo sync']:[]),'surface|before media close','surface|after media close sync'];
  assert.deepEqual(records.map(r=>r.phase+'|'+r.label),order,'Exact phase/event interleaving');
  const after=records.filter(x=>x.phase==='after'),before=records.filter(x=>x.phase==='before');
  assert.deepEqual(after.map(x=>x.label),expected);assert.deepEqual(before.map(x=>x.label),expected);
  const sameRefs=(record,includeList=true)=>{for(const row of record.refs){assert.equal(row.pageSame,true);if(includeList)assert.equal(row.listSame,true);assert.equal(row.strokeCount,row.baselineStrokeCount);assert.equal(row.pointCount,row.baselinePointCount);assert.equal(row.strokeSame,row.baselineStrokeCount);assert.equal(row.pointsArraySame,row.baselineStrokeCount);assert.equal(row.pointSame,row.baselinePointCount);}};
  sameRefs(base);
  for(const r of records){
    assert.equal(r.activePageSame,true);assert.equal(r.refs.length,base.refs.length);assert.equal(r.activeRow,base.activeRow);
    assert.equal(r.pending,false);assert.equal(r.placement,false);assert.equal(r.layoutMulti,false);assert.equal(r.layoutTouchCount,0);assert.equal(r.drawing,false);assert.equal(r.pan,false);
    assert.ok(Number.isSafeInteger(r.revisionDelta)&&r.revisionDelta>=0);assert.ok(Number.isSafeInteger(r.editRevisionDelta)&&r.editRevisionDelta>=0);
    for(const row of r.refs.filter(x=>x.index!==base.activeRow))sameRefs({refs:[row]});
  }
  for(let i=0;i<after.length;i++){assert.deepEqual(before[i].input,after[i].input);assert.equal(after[i].input.type,expected[i]);assert.equal(after[i].input.pointerType,'pen');assert.ok(Number.isFinite(after[i].input.x)&&Number.isFinite(after[i].input.y));assert.ok(Number.isSafeInteger(after[i].input.id));assert.equal(after[i].input.id,after[0].input.id);assert.ok(before[i].ordinal<after[i].ordinal);}
  if(after.length){const down=after[0];assert.equal(down.gesture,true);assert.equal(down.gestureMoved,false);assert.equal(down.gestureTargetSame,true);assert.equal(down.selectionPresent,true);assert.equal(down.selectionTargetSame,true);sameRefs(down);assert.equal(down.revisionDelta,0);assert.equal(down.editRevisionDelta,0);}
  if(v.name==='A'||v.name==='P'){
    const move=after[1];assert.equal(move.gesture,true);assert.equal(move.gestureMoved,true);assert.equal(move.gestureTargetSame,true);assert.ok(move.draftX!==base.baselineX||move.draftY!==base.baselineY,'A real changed preview was observed');sameRefs(move);assert.equal(move.targetX,base.baselineX);assert.equal(move.targetY,base.baselineY);assert.equal(move.revisionDelta,0);assert.equal(move.editRevisionDelta,0);
    assert.deepEqual(after[2].input,{...after[1].input,type:expected[2]},'End event uses the last preview coordinates');
  }
  if(v.name==='S')assert.deepEqual(after[1].input,{...after[0].input,type:'pointerup'},'Selection-only has no movement');
  if(v.name==='A'){
    const committed=after[2],undo=one('surface','after undo sync');
    assert.equal(committed.gesture,false);assert.equal(committed.targetSame,false);assert.ok(committed.targetX!==base.baselineX||committed.targetY!==base.baselineY);assert.equal(committed.undoDepth,base.undoDepth+1);assert.ok(committed.revisionDelta>0&&committed.editRevisionDelta>0);
    assert.equal(committed.selectionPresent,true);assert.equal(committed.selectionTargetSame,false);const row=committed.refs[base.activeRow];assert.equal(row.listSame,false);assert.equal(row.strokeCount,row.baselineStrokeCount);assert.equal(row.pointCount,row.baselinePointCount);assert.equal(row.strokeSame,row.baselineStrokeCount-1);assert.equal(row.pointsArraySame,row.baselineStrokeCount-1);assert.equal(row.pointSame,row.baselinePointCount-1,'Only the one-point selected text is replaced');
    assert.equal(one('surface','before undo').ordinal>committed.ordinal,true);assert.equal(undo.ordinal>committed.ordinal,true);assert.equal(undo.gesture,false);
    assert.equal(undo.undoDepth,base.undoDepth);assert.equal(undo.targetSame,true);assert.equal(undo.targetX,base.baselineX);assert.equal(undo.targetY,base.baselineY);assert.equal(undo.selectionPresent,false);assert.ok(undo.revisionDelta>committed.revisionDelta&&undo.editRevisionDelta>committed.editRevisionDelta);sameRefs(undo,false);assert.equal(undo.refs[base.activeRow].listSame,false,'Undo restores a shallow before array, not the original list');
    sameRefs(close,false);assert.equal(close.refs[base.activeRow].listSame,false);assert.equal(close.revisionDelta,undo.revisionDelta);assert.equal(close.editRevisionDelta,undo.editRevisionDelta);
  }else{
    assert.equal(records.some(x=>x.label==='before undo'||x.label==='after undo sync'),false,'No undo was invoked');
    for(const r of records){sameRefs(r);assert.equal(r.undoDepth,base.undoDepth);assert.equal(r.revisionDelta,0);assert.equal(r.editRevisionDelta,0);assert.equal(r.updatedSame,true);assert.equal(r.targetSame,true);assert.equal(r.targetX,base.baselineX);assert.equal(r.targetY,base.baselineY);}
    if(after.length){const end=after.at(-1);assert.equal(end.gesture,false);assert.equal(end.selectionPresent,true);assert.equal(end.selectionTargetSame,true);}
  }
  assert.equal(close.mediaSelecting,false);assert.equal(close.gesture,false);assert.equal(close.selectionPresent,false);assert.equal(close.undoDepth,base.undoDepth);assert.equal(close.targetSame,true);assert.equal(close.targetX,base.baselineX);assert.equal(close.targetY,base.baselineY);
  return{valid:true,variant:v.name,mode:v.mode,records,observedEventTypes:after.map(x=>x.label),referenceSemantics:v.name==='A'?'Original stroke/points references restored inside a different shallow array.':'Original array, strokes and points references retained.',cleanup:'Gesture and selection closed; final target restored; original terminal audit follows separately.'};
}

function validateCaseOutcome(result,checks){
  assert.ok(result&&typeof result.passed==='boolean'&&Array.isArray(checks),'Actual case result and all original checks required');
  assert.deepEqual(checks.map(x=>x.label),['initial','pen','eraser','media undo','zoom']);
  for(const metric of checks.filter(x=>x.label!=='media undo'))assert.equal(envelopeFailed(metric),false,'Unrelated phase failed: '+metric.label);
  const terminal=checks.find(x=>x.label==='media undo'),failed=envelopeFailed(terminal);
  assert.equal(result.passed,!failed,'No unrelated fixture, save, network or runtime failure may be called a clean contrast');
  if(failed){
    const label=terminal.alphaMax>32?'alpha deviation':terminal.compositedMax>32?'composite maximum':terminal.compositedMeanForeground>1?'foreground average':'foreground outlier fraction';
    const first=String(result.error||'').split(/\r?\n/)[0];
    assert.ok(first===`AssertionError [ERR_ASSERTION]: media undo: ${label}`||first===`AssertionError: media undo: ${label}`,'Failure must be the exact original terminal quality assertion');
  }else assert.ok(!result.error,'Clean case has no error');
  return{valid:true,terminalEnvelopeFailed:failed};
}

function classifyComparisons(cases){
  assert.ok(Array.isArray(cases)&&cases.length>0);
  return [...new Set(cases.map(x=>x.engine))].map(engine=>{
    const group=cases.filter(x=>x.engine===engine);assert.deepEqual(group.map(x=>x.variant).sort(),['A','C','P','S']);const by=Object.fromEntries(group.map(x=>[x.variant,x]));
    for(const item of group){assert.equal(item.gestureEvidence?.valid,true);assert.equal(item.gestureEvidence.variant,item.variant);const variant=VARIANTS.find(x=>x.name===item.variant);assert.equal(item.gestureEvidence.mode,variant.mode);validateGestureEvidence(item.gestureEvidence.records,variant);validateCaseOutcome({passed:item.casePassed,error:item.caseError},item.checks);assert.deepEqual(item.originalMediaUndo,item.checks.find(x=>x.label==='media undo'));assert.ok(item.endpoint&&Array.isArray(item.endpoint.normalizedInk)&&item.endpoint.normalizedInk.length&&item.endpoint.geometry);for(const [key,value]of[['normalizedInkSha256',item.endpoint.normalizedInk],['geometrySha256',item.endpoint.geometry]]){assert.match(item.endpoint[key],/^[0-9a-f]{64}$/);assert.equal(item.endpoint[key],sha(JSON.stringify(value)));}}
    const observations=group.map(item=>({variant:item.variant,envelopeFailed:envelopeFailed(item.originalMediaUndo),sameTerminalInk:item.endpoint.normalizedInkSha256===by.A.endpoint.normalizedInkSha256,sameTerminalGeometry:item.endpoint.geometrySha256===by.A.endpoint.geometrySha256}));
    const comparable=observations.every(x=>x.sameTerminalInk&&x.sameTerminalGeometry),a=envelopeFailed(by.A.originalMediaUndo),c=envelopeFailed(by.C.originalMediaUndo),interpretable=comparable&&a&&!c;
    return{engine,status:!comparable?'inconclusive-terminal-mismatch':!a?'inconclusive-A-did-not-reproduce':c?'inconclusive-C-background-failure':'controlled-observation',terminalComparable:comparable,AReproduced:a,CClean:!c,interpretable,observations,comparisons:[['C','S','selection gesture/direct-ink cache lifecycle'],['S','P','changed preview followed by cancellation'],['P','A','preview cancellation versus committed move and undo']].map(([from,to,factor])=>({from,to,factor,interpretable,fromEnvelopeFailed:envelopeFailed(by[from].originalMediaUndo),toEnvelopeFailed:envelopeFailed(by[to].originalMediaUndo)}))};
  });
}

function transformRunner(canonical,variant){
  assert.equal(sha(canonical),PINS.runner);const v=VARIANTS.find(x=>x.name===variant?.name);assert.ok(v,'Known gesture variant');assert.deepEqual(variant,v,'Exact gesture variant');
  const base=history.transformRunner(canonical,history.VARIANTS.find(x=>x.name===(v.name==='A'?'A':'C')));let source=base.source;
  if(v.name==='S'||v.name==='P'){
    const a=canonical.indexOf("await pointer(p,'pointerdown',330*g.scale,330*g.scale);"),b=canonical.indexOf("assert.equal(await p.evaluate(()=>page().strokes.find(s=>s.tool==='text').points[0].x),300);",a);assert.ok(a>=0&&b>a);
    const actions=canonical.slice(a,b),replacement=v.name==='S'?"await pointer(p,'pointerdown',330*g.scale,330*g.scale);await pointer(p,'pointerup',330*g.scale,330*g.scale);":"await pointer(p,'pointerdown',330*g.scale,330*g.scale);await pointer(p,'pointermove',370*g.scale,355*g.scale);await pointer(p,'pointercancel',370*g.scale,355*g.scale);";
    source=replaceOne(source,`if(!true){${actions}}`,replacement,'selection or changed preview without commit/undo');
  }
  source=replaceOne(source,'window.__inkSurfaceTrace=[];window.__recordInkSurface=',`window.__inkSurfaceTrace=[];(${installGestureObserver.toString()})();window.__recordInkSurface=`,'observer inside existing initialization');
  source=replaceOne(source,"mediaSelecting,mediaGesture:!!mediaGesture,drawing});};window.__recordInkSurface('before audits');", "mediaSelecting,mediaGesture:!!mediaGesture,drawing});window.__inkGestureRecord('surface',label);};window.__recordInkSurface('before audits');",'existing surface callback only');
  const pointer=canonical.split('\n').find(line=>line.startsWith('async function pointer(p,type,'));assert.ok(pointer);
  let observed=replaceOne(pointer,'el.dispatchEvent(new PointerEvent(q.type,',"window.__inkGestureRecord?.('before',q.type,q);el.dispatchEvent(new PointerEvent(q.type,",'before existing pointer dispatch');
  observed=replaceOne(observed,'clientY:r.top+q.y}));},{type,x,y,id,pointerType});}',"clientY:r.top+q.y}));window.__inkGestureRecord?.('after',q.type,q);},{type,x,y,id,pointerType});}",'after existing pointer dispatch');
  source=replaceOne(source,pointer,observed,'original pointer evaluate boundary preserved');
  const begin="      window.__inkTracePhase='audit: '+label;",end='    },label);';
  const body=text=>text.slice(text.indexOf(begin),text.indexOf(end,text.indexOf(begin)));
  assert.equal(body(source),body(base.source),'No gesture patch touched the inherited audit');
  // A/C never suppress early reads. Remove the inherited, proven-dead branch
  // by restoring the entire exact canonical body, not by relaxing its hash gate.
  source=replaceOne(source,body(base.source),body(canonical),'restore exact canonical audit body');
  assert.equal(body(source),body(canonical),'Canonical measured audit body byte-for-byte');
  for(const line of canonical.split('\n').filter(line=>line.includes('const undoFailed=undo.alphaMax>32')||line.includes('for(const result of checks){assert.ok(result.foregroundPixels>0);')))assert.equal(source.split(line).length-1,1,'Original quality/failure expression unchanged');
  return{source,provenance:{...base.provenance,variant:v,historyHelperSha256:PINS.history,copiedRunnerSha256:sha(source),observerSha256:sha(installGestureObserver.toString()),observerMaxRecords:32,referenceBounds:{pages:8,strokes:2000,points:10000},rasterReadsAdded:0,browserCallsAdded:0,restoredCanonicalAuditBodySha256:sha(body(canonical)),canonicalAuditBodyExact:true,releaseEligible:false}};
}

function verifyPackage(directory){
  const manifest=fs.readFileSync(path.join(directory,'SHA256SUMS'));assert.equal(sha(manifest),PINS.manifest);const names=new Set();
  for(const line of manifest.toString('utf8').trim().split(/\r?\n/)){const match=/^([0-9a-f]{64})  (.+)$/.exec(line);assert.ok(match);const file=path.resolve(directory,match[2]);assert.ok(file.startsWith(directory+path.sep));assert.equal(sha(fs.readFileSync(file)),match[1],match[2]);assert.equal(names.has(match[2]),false);names.add(match[2]);}
  assert.equal(names.size,246);assert.equal(sha(fs.readFileSync(path.join(directory,'pdf-workspace.js'))),PINS.renderer);assert.equal(sha(fs.readFileSync(path.join(directory,'index.html'))),PINS.index);
}
const readJson=file=>JSON.parse(fs.readFileSync(file,'utf8'));
async function main(argv=process.argv.slice(2)){
  const repo=path.resolve(__dirname,'..'),release=path.join(repo,'work/bilge-defter-invited-v78'),canonicalFile=path.join(repo,'work/verify-slide-flow.cjs'),stamp=new Date().toISOString().replace(/[-:.TZ]/g,'');
  for(const arg of argv)assert.ok(arg.startsWith('--output-dir=')||arg.startsWith('--engines='));const engines=(argv.find(x=>x.startsWith('--engines='))?.slice(10)||'chromium,webkit').split(',');assert.ok(engines.length>=1&&engines.length<=2&&new Set(engines).size===engines.length&&engines.every(x=>['chromium','webkit'].includes(x)));
  const out=path.resolve(argv.find(x=>x.startsWith('--output-dir='))?.slice(13)||path.join(repo,'outputs/ink-gesture-diagnostic',stamp));assert.ok(out.startsWith(path.join(repo,'outputs')+path.sep));assert.ok(!fs.existsSync(out),'Preserve existing evidence');fs.mkdirSync(out,{recursive:true});
  const report={diagnosticOnly:true,releaseEligible:false,status:'incomplete',startedAt:new Date().toISOString(),pins:PINS,scriptSha256:sha(fs.readFileSync(__filename)),nodeVersion:process.version,playwrightVersion:require('playwright/package.json').version,engines,variants:[],cases:[],boundaries:[
    'Only copied synthetic fixture runners change. The application, canonical runner and final raster oracle remain pinned and unchanged.',
    'Reference arrays and scalar comparisons add bounded CPU work and change timing. An instrumented A failure and C pass in the same engine are required before interpreting any contrast.',
    'The existing pointer evaluate and surface trace callbacks collect metadata. No additional browser turn, layout query, renderer call, pixel read or screenshot is added.',
    'S exercises a selection gesture and its direct-ink/cache lifecycle; it is not an inert click. P exercises changed preview followed by pointercancel, not a completed move.',
    'Pointercancel skips the native pointerup final moveMediaGesture call and commit, so its paint schedule also differs. This is not an isolated undo-only or backend-cause proof.',
    'Gesture records freeze when the original cancelMediaMode returns. They are serialized through the existing finally trace after the original terminal audit/PNGs; normalized terminal ink/geometry are measured separately by that original audit.',
    'No model/undo mutation is performed by the observer. Runtime reference identity, revisions and cache mediation are not part of terminal JSON equality.',
    'Diagnostic completion or a clean variant is never release acceptance, physical-device validation, or permission to publish.'
  ]};
  try{
    const canonical=fs.readFileSync(canonicalFile,'utf8');assert.equal(sha(canonical),PINS.runner);verifyPackage(release);
    for(const variant of VARIANTS){
      const directory=path.join(out,variant.name),file=path.join(directory,'runner.cjs');fs.mkdirSync(directory);const generated=transformRunner(canonical,variant);fs.writeFileSync(file,generated.source);
      const tag=`gesture-${stamp}-${variant.name.toLowerCase()}`,resultDirectory=path.join(repo,'outputs/slide-flow',`dpr-2-${tag}`),fixture={...generated.provenance,diagnosticOnly:true,releaseEligible:false,packageRoot:release,manifestSha256:PINS.manifest,assets:246,engines,tag,resultDirectory,applicationModified:false,canonicalRunnerModified:false};fs.writeFileSync(path.join(directory,'fixture.json'),JSON.stringify(fixture,null,2));
      const args=[file,'--dpr=2','--case=warm ink',`--tag=${tag}`];if(engines.length===1)args.push(`--engine=${engines[0]}`);console.log(`GESTURE ${variant.name}: ${generated.provenance.copiedRunnerSha256}`);
      const child=cp.spawnSync(process.execPath,args,{cwd:repo,env:{...process.env,BILGE_TEST_ROOT:release,BILGE_DIAGNOSTIC_REPO:repo},encoding:'utf8',timeout:240000,maxBuffer:12*1024*1024});fs.writeFileSync(path.join(directory,'runner.log'),(child.stdout||'')+(child.stderr||''));
      const resultFile=path.join(resultDirectory,`report${engines.length===1?'-'+engines[0]:''}-warm-ink.json`),entry={...fixture,exitCode:child.status,signal:child.signal,error:child.error?String(child.error):null,report:resultFile};report.variants.push(entry);
      assert.ok(!child.error&&[0,1].includes(child.status),'Normal child outcome');const summary=readJson(resultFile);assert.equal(summary.runnerSha256,generated.provenance.copiedRunnerSha256);assert.deepEqual(summary.drift,[]);assert.equal(summary.passed+summary.failed,engines.length);assert.deepEqual(summary.results.map(x=>x.engine).sort(),[...engines].sort());assert.ok(summary.results.every(x=>x.name==='warm ink cache preserves bounded full replay quality after edits undo and zoom'));assert.equal(summary.source['/pdf-workspace.js'],PINS.renderer);assert.equal(summary.source['/index.html'],PINS.index);Object.assign(entry,{reportSha256:sha(fs.readFileSync(resultFile)),passed:summary.passed,failed:summary.failed,drift:summary.drift});
      for(const engine of engines){
        const parityFile=path.join(resultDirectory,`${engine}-ink-parity.json`),diagnosticFile=path.join(resultDirectory,`${engine}-ink-surface-diagnostic.json`),parity=readJson(parityFile),diagnostic=readJson(diagnosticFile);
        assert.deepEqual(parity.map(x=>x.label),['initial','pen','eraser','media undo','zoom']);assert.deepEqual(diagnostic.skippedAudits,[]);assert.deepEqual(diagnostic.skippedRegions,[]);const metric=parity.find(x=>x.label==='media undo');envelopeFailed(metric);assert.ok(diagnostic.historyEndpoint);
        const caseResult=summary.results.find(x=>x.engine===engine),evidence=validateGestureEvidence(diagnostic.trace,variant);validateCaseOutcome(caseResult,parity);
        report.cases.push({variant:variant.name,engine,casePassed:caseResult.passed,caseError:caseResult.error||null,checks:parity,originalMediaUndo:metric,endpoint:diagnostic.historyEndpoint,gestureEvidence:evidence,report:parityFile,paritySha256:sha(fs.readFileSync(parityFile)),diagnosticSha256:sha(fs.readFileSync(diagnosticFile))});
      }
      verifyPackage(release);assert.equal(sha(fs.readFileSync(canonicalFile)),PINS.runner);assert.equal(sha(fs.readFileSync(historyFile)),PINS.history);
    }
    assert.equal(report.cases.length,engines.length*4);report.comparisons=classifyComparisons(report.cases);report.status=report.comparisons.some(x=>x.interpretable)?'controlled-observations':'inconclusive';
  }catch(error){report.status='inconclusive-harness-error';report.error=String(error.stack||error);process.exitCode=1;}
  finally{
    report.completedAt=new Date().toISOString();report.originalSourceStillPinned=sha(fs.readFileSync(path.join(release,'pdf-workspace.js')))===PINS.renderer;report.originalRunnerStillPinned=sha(fs.readFileSync(canonicalFile))===PINS.runner;report.historyStillPinned=sha(fs.readFileSync(historyFile))===PINS.history;if(!report.originalSourceStillPinned||!report.originalRunnerStillPinned||!report.historyStillPinned){report.status='inconclusive-drift';process.exitCode=1;}
    const file=path.join(out,'results.json');fs.writeFileSync(file,JSON.stringify(report,null,2));console.log(JSON.stringify({diagnosticOnly:true,releaseEligible:false,status:report.status,report:file,error:report.error||null}));return report;
  }
}
module.exports={PINS,VARIANTS,sha,replaceOne,normalizeAudit,installGestureObserver,validateGestureEvidence,validateCaseOutcome,classifyComparisons,transformRunner,main};
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
