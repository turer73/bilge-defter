'use strict';
// Bounded copied-runner experiment. No application or acceptance-gate changes.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),assert=require('node:assert/strict');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const ENDPOINT_SHA='9967138fb5f4edf57047133189f4e8238d7748172d9cf2e515b0e7e55e3ddc0b';
const endpointFile=path.join(__dirname,'diagnose-ink-endpoint.cjs');
assert.equal(sha(fs.readFileSync(endpointFile)),ENDPOINT_SHA,'Frozen endpoint helper');
const endpoint=require('./diagnose-ink-endpoint.cjs'),history=require('./diagnose-ink-history.cjs');
const PINS=Object.freeze({...endpoint.PINS,endpoint:ENDPOINT_SHA});
const VARIANTS=Object.freeze([
  Object.freeze({name:'A',mode:'move-undo',label:'media undo'}),
  Object.freeze({name:'R',mode:'return-drag',label:'return closed'})
]);
const {replaceOne,normalizeAudit}=endpoint,{envelopeFailed}=history;
const near=(value,expected)=>Number.isFinite(value)&&Math.abs(value-expected)<1e-9;
function knownVariant(variant){const v=VARIANTS.find(x=>x.name===variant?.name);assert.ok(v,'Known return variant');assert.deepEqual(variant,v,'Exact return variant');return v;}
function sliceOne(source,start,end,label){assert.equal(source.split(start).length-1,1,'Unique start: '+label);assert.equal(source.split(end).length-1,1,'Unique end: '+label);const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(b>a);return source.slice(a,b);}

function transformRunner(canonical,variant){
  assert.equal(sha(canonical),PINS.runner);const v=knownVariant(variant),base=endpoint.transformRunner(canonical,endpoint.VARIANTS.find(x=>x.name===(v.name==='A'?'A':'M')));let source=base.source;
  if(v.name==='R'){
    const close="await p.evaluate(()=>{window.__recordInkSurface('before media close');";
    const reverse="await pointer(p,'pointerdown',370*g.scale,355*g.scale);await pointer(p,'pointermove',330*g.scale,330*g.scale);await pointer(p,'pointerup',330*g.scale,330*g.scale);";
    source=replaceOne(source,close,reverse+close,'second real reverse drag before the existing close');
    source=replaceOne(source,'const undo=await audit("commit closed");','const undo=await audit("return closed");','return endpoint audit label');
    source=replaceOne(source,'if(label==="commit closed"&&!diagnosticOnly)diagnostic.historyEndpoint=normalizeAudit(result);','if(label==="return closed"&&!diagnosticOnly)diagnostic.historyEndpoint=normalizeAudit(result);','existing Node endpoint slot');
    source=replaceOne(source,'let baseline=null,done=false,serial=0;','let baseline=null,done=false,serial=0,firstCommitted=null,returnCommitCount=0;','bounded first-commit identity metadata');
    const push="      window.__inkSurfaceTrace.push({kind:'gesture-history',ordinal:serial,phase,label,input:";
    const capture=`      if(phase==='after'&&label==='pointerup'){
        if(++returnCommitCount>2)throw Error('Only two observed commits are supported');
        if(!firstCommitted)firstCommitted={target,list:current.strokes,points:target?.points,point:target?.points?.[0]};
      }
      const returnHistory={commits:returnCommitCount,firstTargetSame:firstCommitted?target===firstCommitted.target:null,firstListSame:firstCommitted?current.strokes===firstCommitted.list:null,firstPointsArraySame:firstCommitted?target?.points===firstCommitted.points:null,firstPointSame:firstCommitted?target?.points?.[0]===firstCommitted.point:null,gestureTargetSameAsFirst:g&&firstCommitted?g.target===firstCommitted.target:null};
`;
    source=replaceOne(source,push,capture+push.replace('ordinal:serial,','ordinal:serial,returnHistory,'),'metadata only inside existing observer callback');
  }
  const begin="      window.__inkTracePhase='audit: '+label;",end='    },label);',body=sliceOne(canonical,begin,end,'canonical audit body'),quality=canonical.split('\n').find(line=>line.includes('for(const result of checks){assert.ok(result.foregroundPixels>0);'));
  assert.equal(sliceOne(source,begin,end,'copied audit body'),body);assert.ok(quality);assert.equal(source.split(quality).length-1,1,'Original quality loop remains byte-exact');
  if(v.name==='A')assert.equal(source,endpoint.transformRunner(canonical,endpoint.VARIANTS.find(x=>x.name==='A')).source,'A exact frozen reproducing control');
  return{source,provenance:{...base.provenance,variant:v,endpointHelperSha256:PINS.endpoint,copiedRunnerSha256:sha(source),inheritedHashBoundary:'Inherited observerSha256 identifies the ancestral gesture observer before R metadata additions; mediaActionsSha256 identifies ancestral canonical media actions, not R actions. The complete actually executed transformed runner is bound by copiedRunnerSha256.',canonicalAuditBodySha256:sha(body),finalQualityGateSha256:sha(quality),canonicalAuditBodyExact:true,AByteExact:v.name==='A',terminalLabel:v.label,terminalStopsContinuation:v.name==='R',outerFailureScreenshotOmitted:v.name==='R',coordinateToleranceScope:'Only transient drafts and first committed arithmetic may be within 1e-9; final returned coordinates and complete normalized ink/closed geometry must exactly equal A. No snapping or rounding.',observerExpectedRecords:v.name==='R'?15:11,firstCommitReferencesRetained:v.name==='R',browserCallsAdded:v.name==='R'?1:0,observerBrowserCallsAdded:0,reversePointerBrowserCalls:v.name==='R'?3:0,omittedUndoBrowserCalls:v.name==='R'?2:0,browserCallBoundary:'Hot media sequence relative to A: three real reverse pointer-event calls replace undo click and restored-x assertion calls, net one additional turn. No separate observer/layout/render/readback turn.',rasterReadsAdded:0,releaseEligible:false}};
}

function validateReturnEvidence(trace,variant){
  const v=knownVariant(variant);
  if(v.name==='A')return endpoint.validateEndpointEvidence(trace,endpoint.VARIANTS.find(x=>x.name==='A'));
  assert.ok(Array.isArray(trace));assert.equal(trace.some(x=>x.kind==='gesture-history-error'),false,'Observer completed without bounded-state error');
  const records=trace.filter(x=>x.kind==='gesture-history'),events=['pointerdown','pointermove','pointerup','pointerdown','pointermove','pointerup'];
  assert.deepEqual(records.map(x=>x.phase+'|'+x.label),['surface|after media open sync',...events.flatMap(x=>['before|'+x,'after|'+x]),'surface|before media close','surface|after media close sync'],'Two actual gestures then close, no undo or invented events');
  const base=records[0],first=records[6],second=records[12];assert.ok(base.refs.length>0&&base.refs.length<=8);assert.ok(Number.isSafeInteger(base.activeRow)&&base.activeRow>=0&&base.activeRow<base.refs.length);
  assert.equal(base.baselineX,300);assert.equal(base.baselineY,320);assert.equal(base.baselineUndoDepth,0);assert.ok(near(first.targetX,340)&&near(first.targetY,345));assert.equal(second.targetX,300,'Returned model x must be exact, not rounded by the harness');assert.equal(second.targetY,320);
  const sameRefs=(record,count)=>{
    assert.equal(record.refs.length,base.refs.length);
    record.refs.forEach((row,i)=>{const old=base.refs[i],changed=count>0&&i===base.activeRow?1:0;assert.equal(row.index,i);assert.equal(row.pageSame,true);assert.equal(row.baselineStrokeCount,old.baselineStrokeCount);assert.equal(row.baselinePointCount,old.baselinePointCount);assert.equal(row.strokeCount,old.baselineStrokeCount);assert.equal(row.pointCount,old.baselinePointCount);assert.equal(row.strokeSame,old.baselineStrokeCount-changed);assert.equal(row.pointsArraySame,old.baselineStrokeCount-changed);assert.equal(row.pointSame,old.baselinePointCount-changed);assert.equal(row.listSame,!(count>0&&i===base.activeRow));});
  };
  for(let i=0;i<records.length;i++){
    const r=records[i],count=i>=12?2:i>=6?1:0,h=r.returnHistory,inGesture=[2,3,4,5,8,9,10,11].includes(i),moved=[4,5,10,11].includes(i),selected=i>=2&&i<=13;
    assert.equal(r.ordinal,i+1);assert.equal(r.activePageSame,true);assert.equal(r.activeRow,base.activeRow);assert.equal(r.baselineX,300);assert.equal(r.baselineY,320);assert.equal(r.baselineUndoDepth,0);sameRefs(r,count);
    for(const key of ['pending','placement','layoutMulti','drawing','pan'])assert.equal(r[key],false);assert.equal(r.layoutTouchCount,0);assert.equal(r.mediaSelecting,i!==14);
    assert.equal(r.targetSame,count===0,'Return is a new committed clone, not restoration of original target');assert.equal(r.undoDepth,count);assert.equal(r.revisionDelta,count);assert.equal(r.editRevisionDelta,count);if(count===0)assert.equal(r.updatedSame,true);
    assert.equal(r.targetX,count===1?first.targetX:300);assert.equal(r.targetY,count===1?first.targetY:320);
    assert.equal(r.gesture,inGesture);assert.equal(r.gestureMoved,moved);assert.equal(r.gestureTargetSame,inGesture?i<6:null);assert.equal(r.selectionPresent,selected);assert.equal(r.selectionTargetSame,selected?i<6:null);
    if(inGesture){const x=i<6?(moved?340:300):(moved?300:first.targetX),y=i<6?(moved?345:320):(moved?320:first.targetY);assert.ok(near(r.draftX,x)&&near(r.draftY,y),'Finite bounded live draft arithmetic');}else{assert.equal(r.draftX,null);assert.equal(r.draftY,null);}
    assert.ok(h&&typeof h==='object');assert.deepEqual(Object.keys(h).sort(),['commits','firstListSame','firstPointSame','firstPointsArraySame','firstTargetSame','gestureTargetSameAsFirst'].sort());assert.equal(h.commits,count);
    for(const key of ['firstTargetSame','firstListSame','firstPointsArraySame','firstPointSame'])assert.equal(h[key],count===0?null:count===1,'Second commit must replace first target/list/points identities');
    assert.equal(h.gestureTargetSameAsFirst,[8,9,10,11].includes(i)?true:null,'Second pointerdown really selects first committed clone');
    if(r.phase==='surface')assert.equal(r.input,null);else{assert.ok(r.input&&r.input.type===r.label&&r.input.pointerType==='pen');assert.ok(Number.isFinite(r.input.x)&&Number.isFinite(r.input.y)&&Number.isSafeInteger(r.input.id));assert.equal(r.input.id,records[2].input.id);if(r.phase==='after')assert.deepEqual(r.input,records[i-1].input);}
  }
  const [down,move,up,backDown,backMove,backUp]=records.filter(x=>x.phase==='after').map(x=>x.input);
  assert.ok(down.x>0);assert.equal(down.x,down.y);assert.ok(near(move.x,down.x*370/330)&&near(move.y,down.y*355/330));assert.deepEqual(up,{...move,type:'pointerup'});
  assert.deepEqual(backDown,{...up,type:'pointerdown'},'Reuse exact first endpoint client coordinates');assert.deepEqual(backMove,{...down,type:'pointermove'},'Return to exact first start client coordinates');assert.deepEqual(backUp,{...down,type:'pointerup'});
  return{valid:true,variant:v.name,mode:v.mode,label:v.label,records,observedEventTypes:events,terminal:{targetX:second.targetX,targetY:second.targetY,undoDepth:2,revisionDelta:2,editRevisionDelta:2,mediaSelecting:false,selectionPresent:false},referenceSemantics:'Two genuine commits leave two undo entries. Final text/list/points are different from both original and first committed references; all other stroke/point references remain original.'};
}

function validateCaseOutcome(result,checks,variant){
  const v=knownVariant(variant);if(v.name==='A')return endpoint.validateCaseOutcome(result,checks,endpoint.VARIANTS.find(x=>x.name==='A'));
  assert.ok(result&&typeof result.passed==='boolean'&&Array.isArray(checks));assert.deepEqual(checks.map(x=>x.label),['initial','pen','eraser',v.label]);for(const metric of checks.slice(0,-1))assert.equal(envelopeFailed(metric),false,'Unrelated early raster failure');
  const terminal=checks.at(-1),failed=envelopeFailed(terminal);assert.equal(result.passed,!failed,'Unrelated cache/runtime/fixture failure is not a clean contrast');
  if(failed){const reason=terminal.alphaMax>32?'alpha deviation':terminal.compositedMax>32?'composite maximum':terminal.compositedMeanForeground>1?'foreground average':'foreground outlier fraction',first=String(result.error||'').split(/\r?\n/)[0];assert.ok(first===`AssertionError [ERR_ASSERTION]: ${v.label}: ${reason}`||first===`AssertionError: ${v.label}: ${reason}`,'Exact original quality assertion');}else assert.ok(!result.error);
  return{valid:true,terminalEnvelopeFailed:failed};
}

function classifyComparisons(cases){
  assert.ok(Array.isArray(cases)&&cases.length>0);return[...new Set(cases.map(x=>x.engine))].map(engine=>{
    const group=cases.filter(x=>x.engine===engine);assert.deepEqual(group.map(x=>x.variant).sort(),['A','R']);const by=Object.fromEntries(group.map(x=>[x.variant,x]));
    for(const item of group){const v=VARIANTS.find(x=>x.name===item.variant);assert.equal(item.returnEvidence?.valid,true);assert.equal(item.returnEvidence.variant,v.name);assert.equal(item.returnEvidence.mode,v.mode);validateReturnEvidence(item.returnEvidence.records,v);validateCaseOutcome({passed:item.casePassed,error:item.caseError},item.checks,v);assert.deepEqual(item.terminalMetric,item.checks.find(x=>x.label===v.label));const e=item.endpoint;assert.ok(e&&Array.isArray(e.normalizedInk)&&e.normalizedInk.length&&e.geometry);for(const [key,value]of[['normalizedInkSha256',e.normalizedInk],['geometrySha256',e.geometry]]){assert.match(e[key],/^[0-9a-f]{64}$/);assert.equal(e[key],sha(JSON.stringify(value)));}const active=e.geometry.visibleRows.indexOf(e.geometry.activeRow);assert.ok(active>=0);assert.equal(item.returnEvidence.records[0].activeRow,e.geometry.activeRow);const targets=e.normalizedInk[active].strokes.filter(x=>x.tool==='text');assert.equal(targets.length,1);assert.deepEqual(targets[0],{tool:'text',text:'Cache note',fontSize:24,width:240,color:'#0000ff',points:[{x:300,y:320}]},'Exact final synthetic text, with no normalization or rounding');const last=item.returnEvidence.records.at(-1);assert.deepEqual(targets[0].points[0],{x:last.targetX,y:last.targetY},'Observed and measured final coordinates agree exactly');}
    const sameInk=by.A.endpoint.normalizedInkSha256===by.R.endpoint.normalizedInkSha256,sameGeometry=by.A.endpoint.geometrySha256===by.R.endpoint.geometrySha256,reproduced=envelopeFailed(by.A.terminalMetric),interpretable=sameInk&&sameGeometry&&reproduced;
    return{engine,status:!sameInk||!sameGeometry?'inconclusive-terminal-mismatch':!reproduced?'inconclusive-A-did-not-reproduce':'controlled-return-observation',interpretable,AReproduced:reproduced,sameFinalInk:sameInk,sameClosedGeometry:sameGeometry,observations:group.map(x=>({variant:x.variant,label:x.terminalMetric.label,envelopeFailed:envelopeFailed(x.terminalMetric)})),comparison:{from:'A',to:'R',factor:'Move plus undo versus two committed drags returning to identical visible ink; undo depth, identity and gesture/paint history intentionally differ.',interpretable},boundary:'Not an isolated undo-only, reference-identity-only, immediate-frame or backend-cause proof. No pixel threshold changed and no product patch is tested.'};
  });
}

function verifyPackage(directory){
  const manifest=fs.readFileSync(path.join(directory,'SHA256SUMS'));assert.equal(sha(manifest),PINS.manifest);const names=new Set();for(const line of manifest.toString('utf8').trim().split(/\r?\n/)){const m=/^([0-9a-f]{64})  (.+)$/.exec(line);assert.ok(m);const file=path.resolve(directory,m[2]);assert.ok(file.startsWith(directory+path.sep));assert.equal(sha(fs.readFileSync(file)),m[1],m[2]);assert.equal(names.has(m[2]),false);names.add(m[2]);}assert.equal(names.size,246);for(const [file,key]of[['pdf-workspace.js','renderer'],['index.html','index'],['media-workspace.js','media']])assert.equal(sha(fs.readFileSync(path.join(directory,file))),PINS[key]);
}
const readJson=file=>JSON.parse(fs.readFileSync(file,'utf8'));
async function main(argv=process.argv.slice(2)){
  const repo=path.resolve(__dirname,'..'),release=path.join(repo,'work/bilge-defter-invited-v78'),canonicalFile=path.join(repo,'work/verify-slide-flow.cjs'),stamp=new Date().toISOString().replace(/[-:.TZ]/g,'');
  const helpers=[['diagnose-ink-endpoint.cjs','endpoint'],['diagnose-ink-gesture.cjs','gesture'],['diagnose-ink-history.cjs','history']];
  for(const arg of argv)assert.ok(arg.startsWith('--output-dir=')||arg.startsWith('--engines='));const engines=(argv.find(x=>x.startsWith('--engines='))?.slice(10)||'chromium,webkit').split(',');assert.ok(engines.length>=1&&engines.length<=2&&new Set(engines).size===engines.length&&engines.every(x=>['chromium','webkit'].includes(x)));
  const out=path.resolve(argv.find(x=>x.startsWith('--output-dir='))?.slice(13)||path.join(repo,'outputs/ink-return-diagnostic',stamp));assert.ok(out.startsWith(path.join(repo,'outputs')+path.sep));assert.ok(!fs.existsSync(out),'Never overwrite previous evidence');fs.mkdirSync(out,{recursive:true});
  const report={diagnosticOnly:true,releaseEligible:false,status:'incomplete',startedAt:new Date().toISOString(),pins:PINS,scriptSha256:sha(fs.readFileSync(__filename)),nodeVersion:process.version,playwrightVersion:require('playwright/package.json').version,engines,variants:[],cases:[],boundaries:[
    'Only copied runners differ. The 246 generated assets, canonical runner, helper files, measured audit body and quality thresholds remain pinned.',
    'A is byte-exact frozen endpoint/gesture A including its full tail. R retains early audits and uses a second real drag with the first client-coordinate pair reversed; no undo click, model assignment, coordinate snapping or rounding.',
    'R has three intentional extra pointer-event evaluate calls, replacing the omitted undo path. Observer metadata alone adds no browser turn, layout query, rendering, readback or screenshot; it adds bounded CPU/reference work inside existing callbacks.',
    'R retains one first-commit target/list/points/point reference until close. The second gesture must select that first clone; the second commit must replace it and also remain different from the original references. Two real undo entries/revisions must remain.',
    'Transient drafts and the first committed move allow only 1e-9 floating-point arithmetic error. The final raw model must be exactly (300,320), and the complete measured normalized visible ink and closed geometry must be byte-equivalent to A; any drift prevents interpretation.',
    'R stops after its original terminal audit and exact quality loop; cold replay, controlled replay, zoom, save and continuation/failure screenshots are omitted. Existing failure metadata, reports and teardown remain.',
    'The original audit waits two animation frames and performs four draws before readback. This is not an immediate native frame observation; references, undo history, gesture/paint schedule and revisions are mediators, not isolated single causes.',
    'Fresh A reproduction is mandatory for interpretation. Diagnostic completion is not acceptance, a product fix, a CPU/GPU/backend proof, physical tablet validation, or authority to publish.'
  ]};
  try{
    const canonical=fs.readFileSync(canonicalFile,'utf8');assert.equal(sha(canonical),PINS.runner);verifyPackage(release);
    for(const variant of VARIANTS){
      const directory=path.join(out,variant.name),file=path.join(directory,'runner.cjs');fs.mkdirSync(directory);const generated=transformRunner(canonical,variant);fs.writeFileSync(file,generated.source);
      const tag=`return-${stamp}-${variant.name.toLowerCase()}`,resultDirectory=path.join(repo,'outputs/slide-flow',`dpr-2-${tag}`),fixture={...generated.provenance,diagnosticOnly:true,releaseEligible:false,packageRoot:release,manifestSha256:PINS.manifest,assets:246,engines,tag,resultDirectory,applicationModified:false,canonicalRunnerModified:false};fs.writeFileSync(path.join(directory,'fixture.json'),JSON.stringify(fixture,null,2));
      const args=[file,'--dpr=2','--case=warm ink',`--tag=${tag}`];if(engines.length===1)args.push(`--engine=${engines[0]}`);console.log(`RETURN ${variant.name}: ${generated.provenance.copiedRunnerSha256}`);
      const child=cp.spawnSync(process.execPath,args,{cwd:repo,env:{...process.env,BILGE_TEST_ROOT:release,BILGE_DIAGNOSTIC_REPO:repo},encoding:'utf8',timeout:240000,maxBuffer:12*1024*1024});fs.writeFileSync(path.join(directory,'runner.log'),(child.stdout||'')+(child.stderr||''));
      const resultFile=path.join(resultDirectory,`report${engines.length===1?'-'+engines[0]:''}-warm-ink.json`),entry={...fixture,exitCode:child.status,signal:child.signal,error:child.error?String(child.error):null,report:resultFile};report.variants.push(entry);assert.ok(!child.error&&[0,1].includes(child.status));
      const summary=readJson(resultFile);assert.equal(summary.runnerSha256,generated.provenance.copiedRunnerSha256);assert.deepEqual(summary.drift,[]);assert.equal(summary.passed+summary.failed,engines.length);assert.deepEqual(summary.results.map(x=>x.engine).sort(),[...engines].sort());assert.ok(summary.results.every(x=>x.name==='warm ink cache preserves bounded full replay quality after edits undo and zoom'));assert.equal(summary.source['/pdf-workspace.js'],PINS.renderer);assert.equal(summary.source['/index.html'],PINS.index);Object.assign(entry,{reportSha256:sha(fs.readFileSync(resultFile)),passed:summary.passed,failed:summary.failed,drift:summary.drift});
      for(const engine of engines){
        const parityFile=path.join(resultDirectory,`${engine}-ink-parity.json`),diagnosticFile=path.join(resultDirectory,`${engine}-ink-surface-diagnostic.json`),checks=readJson(parityFile),diagnostic=readJson(diagnosticFile),caseResult=summary.results.find(x=>x.engine===engine);assert.deepEqual(diagnostic.skippedAudits,[]);assert.deepEqual(diagnostic.skippedRegions,[]);assert.ok(diagnostic.historyEndpoint);const evidence=validateReturnEvidence(diagnostic.trace,variant);validateCaseOutcome(caseResult,checks,variant);
        if(variant.name==='R'){assert.equal(diagnostic.coldAfterMediaUndoFailure,null);assert.equal(Object.hasOwn(diagnostic,'controlledRaster'),false);assert.equal(Object.hasOwn(caseResult.detail||{},'screenshot'),false);}
        report.cases.push({variant:variant.name,engine,casePassed:caseResult.passed,caseError:caseResult.error||null,checks,terminalMetric:checks.find(x=>x.label===variant.label),endpoint:diagnostic.historyEndpoint,returnEvidence:evidence,report:parityFile,paritySha256:sha(fs.readFileSync(parityFile)),diagnosticSha256:sha(fs.readFileSync(diagnosticFile))});
      }
      verifyPackage(release);assert.equal(sha(fs.readFileSync(canonicalFile)),PINS.runner);for(const [file,key]of helpers)assert.equal(sha(fs.readFileSync(path.join(__dirname,file))),PINS[key]);
    }
    assert.equal(report.cases.length,2*engines.length);report.comparisons=classifyComparisons(report.cases);report.status=report.comparisons.some(x=>x.interpretable)?'controlled-return-observations':'inconclusive';
  }catch(error){report.status='inconclusive-harness-error';report.error=String(error.stack||error);process.exitCode=1;}
  finally{
    report.completedAt=new Date().toISOString();report.originalSourceStillPinned=sha(fs.readFileSync(path.join(release,'pdf-workspace.js')))===PINS.renderer;report.originalRunnerStillPinned=sha(fs.readFileSync(canonicalFile))===PINS.runner;report.helpersStillPinned=helpers.every(([file,key])=>sha(fs.readFileSync(path.join(__dirname,file)))===PINS[key]);if(!report.originalSourceStillPinned||!report.originalRunnerStillPinned||!report.helpersStillPinned){report.status='inconclusive-drift';process.exitCode=1;}
    const file=path.join(out,'results.json');fs.writeFileSync(file,JSON.stringify(report,null,2));console.log(JSON.stringify({diagnosticOnly:true,releaseEligible:false,status:report.status,report:file,error:report.error||null}));return report;
  }
}
module.exports={PINS,VARIANTS,sha,replaceOne,normalizeAudit,transformRunner,validateReturnEvidence,validateCaseOutcome,classifyComparisons,main};
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
