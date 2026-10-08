'use strict';
// Bounded test-only 2x2 intervention. Never changes the application, canonical
// acceptance runner, its terminal raster oracle, or the release decision.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),assert=require('node:assert/strict');
const PINS=Object.freeze({
  runner:'f2cb459827c1d725d6df1f22c6ff12047a02d415a7d26b8eb65f3eaa769de8d0',
  renderer:'3b3fcdedfd40ba4656b7c8dca2ece1eeb605f54229326b3d91b03351cb11007e',
  index:'b82383e18daddf26b70d5b8949cbbe0a4989f0a9b9e033047ed84e492bd5b1d3',
  manifest:'6f172d47680d93b9d39e316a1f1512ee0e0c2e4645b95af9aab33890b34890f9'
});
const VARIANTS=Object.freeze([
  Object.freeze({name:'A',suppressEarlyReadbacks:false,omitMediaEdit:false}),
  Object.freeze({name:'B',suppressEarlyReadbacks:true,omitMediaEdit:false}),
  Object.freeze({name:'C',suppressEarlyReadbacks:false,omitMediaEdit:true}),
  Object.freeze({name:'D',suppressEarlyReadbacks:true,omitMediaEdit:true})
]);
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function replaceOne(source,before,after,label){assert.equal(source.split(before).length-1,1,'Unique pinned hook: '+label);return source.replace(before,()=>after);}
function sliceOne(source,start,end,label){assert.equal(source.split(start).length-1,1,'Unique start: '+label);assert.equal(source.split(end).length-1,1,'Unique end: '+label);const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(b>a,'Ordered hooks: '+label);return source.slice(a,b);}

// Called in the copied runner's Node process AFTER the original terminal audit
// readback/encoding. Only existing results are consumed; no browser work is added.
function normalizeAudit(result){
  assert.ok(result&&result.measured!==false,'Measured terminal audit required');
  const ink=JSON.parse(result.visibleInk),s=result.stats,t=result.surface;
  assert.ok(Array.isArray(ink)&&ink.length>0&&Array.isArray(s?.rows)&&Array.isArray(s?.visible),'Visible audit data required');
  assert.equal(ink.length,s.visible.length);assert.equal(new Set(s.rows.map(r=>r.id)).size,s.rows.length);
  assert.deepEqual(ink.map(p=>p.id),s.visible,'Ink order follows measured visible rows');
  const index=id=>{const i=s.rows.findIndex(r=>r.id===id);assert.ok(i>=0,'Known row identity');return i;};
  for(const p of ink){assert.deepEqual(Object.keys(p).sort(),['id','strokes']);assert.ok(Array.isArray(p.strokes));}
  assert.ok(t&&Array.isArray(t.transform)&&t.transform.length===6&&Array.isArray(t.rowTransforms));
  assert.deepEqual(t.rowTransforms.map(r=>r.id),s.rows.filter(r=>s.visible.includes(r.id)).map(r=>r.id));
  const finite=n=>{assert.ok(Number.isFinite(n),'Finite measured geometry');return n;},matrix=m=>{assert.equal(m.length,6);return m.map(finite);};
  assert.ok(t.width>0&&t.height>0&&t.transform[0]>0&&t.rowTransforms.length>0);
  const geometry={width:finite(t.width),height:finite(t.height),cssWidth:finite(t.cssWidth),cssHeight:finite(t.cssHeight),dpr:finite(t.dpr),transform:matrix(t.transform),scroll:finite(s.scroll),x:finite(s.x),zoom:finite(s.zoom),scale:finite(t.rowTransforms[0].transform[0]/t.transform[0]),totalHeight:finite(s.totalHeight),activeRow:index(s.activeId),visibleRows:s.visible.map(index),rows:s.rows.map((r,i)=>({index:i,top:finite(r.top),height:finite(r.height),clip:[0,0,1000,finite(r.height)]})),rowTransforms:t.rowTransforms.map(r=>({index:index(r.id),transform:matrix(r.transform)}))};
  // Do not strip stroke IDs, points, text, styles, or any nested field.
  const normalizedInk=ink.map(p=>({strokes:p.strokes}));
  const mediators={pageRevisions:t.rowTransforms.map(r=>({index:index(r.id),revision:r.revision})),cachedImages:s.cachedImages,cachedInkTiles:s.cachedInkTiles,inkPixels:s.inkPixels};
  return{normalizedInk,normalizedInkSha256:sha(JSON.stringify(normalizedInk)),geometry,geometrySha256:sha(JSON.stringify(geometry)),mediators};
}
function envelopeFailed(metric){
  for(const key of ['alphaMax','compositedMax','compositedMeanForeground','compositedOver16','foregroundPixels'])assert.ok(Number.isFinite(metric?.[key]),'Original terminal metric: '+key);
  assert.ok(metric.foregroundPixels>0,'Nonempty measured ink required');
  return metric.alphaMax>32||metric.compositedMax>32||metric.compositedMeanForeground>1||metric.compositedOver16/metric.foregroundPixels>.002;
}
function classifyComparisons(cases){
  assert.ok(Array.isArray(cases)&&cases.length>0);const engines=[...new Set(cases.map(x=>x.engine))];
  return engines.map(engine=>{
    const group=cases.filter(x=>x.engine===engine);assert.deepEqual(group.map(x=>x.variant).sort(),['A','B','C','D'],'Exactly four variants per engine');
    for(const item of group){
      assert.ok(item.endpoint&&Array.isArray(item.endpoint.normalizedInk)&&item.endpoint.normalizedInk.length>0&&item.endpoint.geometry&&typeof item.endpoint.geometry==='object','Complete terminal endpoint required');
      for(const [field,value]of[['normalizedInkSha256',item.endpoint.normalizedInk],['geometrySha256',item.endpoint.geometry]]){assert.match(item.endpoint[field],/^[0-9a-f]{64}$/,'Terminal evidence hash');assert.equal(item.endpoint[field],sha(JSON.stringify(value)),'Terminal evidence matches its hash');}
    }
    const by=Object.fromEntries(group.map(x=>[x.variant,x])),control=by.A;
    const observations=group.map(item=>({variant:item.variant,envelopeFailed:envelopeFailed(item.originalMediaUndo),sameTerminalInk:item.endpoint.normalizedInkSha256===control.endpoint.normalizedInkSha256,sameTerminalGeometry:item.endpoint.geometrySha256===control.endpoint.geometrySha256}));
    const comparable=observations.every(x=>x.sameTerminalInk&&x.sameTerminalGeometry),reproduced=envelopeFailed(control.originalMediaUndo);
    const status=!comparable?'inconclusive-terminal-mismatch':!reproduced?'inconclusive-control-did-not-reproduce':'controlled-observation';
    return{engine,status,controlReproduced:reproduced,terminalComparable:comparable,observations,comparisons:[['A','B','early measurement history with edits'],['C','D','early measurement history without edits'],['A','C','media move and undo with early measurements'],['B','D','media move and undo without early measurements']].map(([from,to,factor])=>({from,to,factor,interpretable:comparable&&reproduced,fromEnvelopeFailed:envelopeFailed(by[from].originalMediaUndo),toEnvelopeFailed:envelopeFailed(by[to].originalMediaUndo)}))};
  });
}

function transformRunner(source,variant){
  assert.equal(sha(source),PINS.runner,'Canonical acceptance runner pin');
  const v=VARIANTS.find(x=>x.name===variant?.name);assert.ok(v,'Known variant');assert.deepEqual(variant,v,'No unreviewed variant flags');
  const start="      window.__inkTracePhase='audit: '+label;",end='    },label);';
  const originalMeasuredBody=sliceOne(source,start,end,'audit measured body');
  const quality=source.split('\n').find(line=>line.includes('for(const result of checks){assert.ok(result.foregroundPixels>0);'));
  const undoGate=source.split('\n').find(line=>line.includes('const undoFailed=undo.alphaMax>32'));
  assert.ok(quality&&undoGate,'Original final gates present');
  const surfaceLine=source.split('\n').find(line=>line.startsWith('      const r=canvas.getBoundingClientRect(),t=ctx.getTransform(),surface='));
  const inkLine=source.split('\n').find(line=>line.startsWith('      const visibleInk=JSON.stringify(s.visible.map('));
  assert.ok(surfaceLine&&inkLine,'Pinned metadata statements');
  const inkExpression=inkLine.slice(0,inkLine.indexOf(',images='))+';';
  const skip=`      if(${v.suppressEarlyReadbacks}&&['initial','pen','eraser'].includes(label)){\n${surfaceLine}\n${inkExpression}\n        reference.width=reference.height=1;return{measured:false,reason:'early-readback-suppressed',warmCalls,stats:s,surface,visibleInk};\n      }\n`;
  let copied=replaceOne(source,"const repo=path.resolve(__dirname,'..'),root=", "const repo=path.resolve(process.env.BILGE_DIAGNOSTIC_REPO),root=",'copied runner repository');
  copied=replaceOne(copied,'const dpr=Number(process.argv.find',`const normalizeAudit=${normalizeAudit.toString()};\nconst dpr=Number(process.argv.find`,'Node post-audit metadata helper');
  copied=replaceOne(copied,"coldAfterMediaUndoFailure:null,trace:[]};", "coldAfterMediaUndoFailure:null,trace:[],skippedAudits:[],skippedRegions:[],historyEndpoint:null};",'separate unmeasured evidence');
  const branchHook='      const a=ctx.getImageData(0,0,canvas.width,canvas.height).data,b=target.getImageData';
  const branchedBody=replaceOne(originalMeasuredBody,branchHook,skip+branchHook,'early branch inside selected audit only');
  copied=replaceOne(copied,originalMeasuredBody,branchedBody,'selected audit body only');
  const post=`    },label);if(label==='media undo'&&!diagnosticOnly)diagnostic.historyEndpoint=normalizeAudit(result);if(result.measured===false){delete result.visibleInk;diagnostic.skippedAudits.push({label,...result});assert.equal(result.warmCalls,0,label+': warm viewport must not replay strokes');assert.ok(result.stats.inkPixels<=8000000,label+': bounded ink pixels');assert.ok(result.stats.cachedInkTiles>0,label+': cache exercised');return result;}for(const [kind,data] of Object.entries(result.images))`;
  copied=replaceOne(copied,'    },label);for(const [kind,data] of Object.entries(result.images))',post,'post-audit metadata and honest omitted result');
  const regionOriginal="    const region=()=>p.evaluate(()=>{const r=canvas.getBoundingClientRect(),d=canvas.width/r.width,data=ctx.getImageData(Math.round(156*d),Math.round(249*d),Math.round(8*d),Math.round(8*d)).data;let alpha=0;for(let i=3;i<data.length;i+=4)alpha+=data[i];return alpha;});";
  const regionModified=`    const region=()=>p.evaluate(()=>{const r=canvas.getBoundingClientRect(),d=canvas.width/r.width;if(${v.suppressEarlyReadbacks})return{measured:false,reason:'early-readback-suppressed'};const data=ctx.getImageData(Math.round(156*d),Math.round(249*d),Math.round(8*d),Math.round(8*d)).data;let alpha=0;for(let i=3;i<data.length;i+=4)alpha+=data[i];return alpha;});`;
  copied=replaceOne(copied,regionOriginal,regionModified,'ROI keeps browser boundary and geometry read');
  for(const [label,original,measured]of[
    ['initial',"assert.equal(await region(),0,'New-pen probe region starts empty');","assert.equal(value,0,'New-pen probe region starts empty');"],
    ['pen',"assert.ok(await region()>500,'New pen appears in its exact small region');","assert.ok(value>500,'New pen appears in its exact small region');"],
    ['eraser',"assert.equal(await region(),0,'Eraser clears the same exact small region');","assert.equal(value,0,'Eraser clears the same exact small region');"]
  ])copied=replaceOne(copied,original,`{const value=await region();if(value?.measured===false)diagnostic.skippedRegions.push({label:${JSON.stringify(label)},...value});else{${measured}}}`,label+' ROI records omission rather than a passing zero');
  const moveStart="await pointer(p,'pointerdown',330*g.scale,330*g.scale);",moveEnd="assert.equal(await p.evaluate(()=>page().strokes.find(s=>s.tool==='text').points[0].x),300);";
  const actions=sliceOne(source,moveStart,moveEnd,'media move and undo actions');
  copied=replaceOne(copied,actions,`if(!${v.omitMediaEdit}){${actions}}`,'retain open paint geometry close and final x assertion');
  // Verify the measured branch byte-for-byte, rather than only its thresholds.
  assert.equal(sliceOne(copied,start,end,'copied measured body').replace(skip,''),originalMeasuredBody,'All measured audit body bytes unchanged');
  assert.equal(copied.split(quality).length-1,1,'Final quality assertions unchanged');assert.equal(copied.split(undoGate).length-1,1,'Original failure decision unchanged');
  return{source:copied,provenance:{variant:v,canonicalRunnerSha256:PINS.runner,copiedRunnerSha256:sha(copied),preservedAuditMeasuredBodySha256:sha(originalMeasuredBody),finalQualityGateSha256:sha(quality),originalFailureDecisionSha256:sha(undoGate),omittedAuditLabels:v.suppressEarlyReadbacks?['initial','pen','eraser']:[],omittedRegionLabels:v.suppressEarlyReadbacks?['initial','pen','eraser']:[],mediaActionsOmitted:v.omitMediaEdit,mediaActionsSha256:sha(actions),releaseEligible:false}};
}

function verifyPackage(directory){
  const manifest=fs.readFileSync(path.join(directory,'SHA256SUMS'));assert.equal(sha(manifest),PINS.manifest,'Pinned generated manifest');
  const entries=manifest.toString('utf8').trim().split(/\r?\n/).map(line=>{const m=/^([0-9a-f]{64})  (.+)$/.exec(line);assert.ok(m,'Manifest line');const absolute=path.resolve(directory,m[2]);assert.ok(absolute.startsWith(directory+path.sep),'Bounded asset path');assert.equal(sha(fs.readFileSync(absolute)),m[1],'Pinned asset '+m[2]);return{name:m[2],sha256:m[1]};});
  assert.equal(entries.length,246);assert.equal(new Set(entries.map(x=>x.name)).size,246);
  assert.equal(sha(fs.readFileSync(path.join(directory,'pdf-workspace.js'))),PINS.renderer);assert.equal(sha(fs.readFileSync(path.join(directory,'index.html'))),PINS.index);return entries;
}
function readJson(file){return JSON.parse(fs.readFileSync(file,'utf8'));}
function validateChild(directory,variant,engines,summary,child){
  assert.ok(!child.error&&[0,1].includes(child.status),'Child finished normally, not timed out/crashed');assert.deepEqual(summary.drift,[],'Application fixture unchanged');
  assert.equal(summary.passed+summary.failed,engines.length);assert.equal(summary.results.length,engines.length);
  assert.deepEqual(summary.results.map(x=>x.engine).sort(),[...engines].sort());assert.ok(summary.results.every(x=>x.name==='warm ink cache preserves bounded full replay quality after edits undo and zoom'),'Exactly original selected case');
  assert.equal(summary.source['/pdf-workspace.js'],PINS.renderer);assert.equal(summary.source['/index.html'],PINS.index);
  return engines.map(engine=>{
    const parity=readJson(path.join(directory,`${engine}-ink-parity.json`)),diagnostic=readJson(path.join(directory,`${engine}-ink-surface-diagnostic.json`));
    assert.deepEqual(parity.map(x=>x.label),variant.suppressEarlyReadbacks?['media undo','zoom']:['initial','pen','eraser','media undo','zoom'],'Only intentionally omitted measurements absent');
    assert.deepEqual(diagnostic.skippedAudits.map(x=>x.label),variant.suppressEarlyReadbacks?['initial','pen','eraser']:[]);assert.deepEqual(diagnostic.skippedRegions.map(x=>x.label),variant.suppressEarlyReadbacks?['initial','pen','eraser']:[]);
    for(const omitted of [...diagnostic.skippedAudits,...diagnostic.skippedRegions]){assert.equal(omitted.measured,false);for(const key of ['alphaMax','compositedMax','foregroundPixels','unequal'])assert.equal(Object.hasOwn(omitted,key),false,'No invented raster metric');}
    const metric=parity.find(x=>x.label==='media undo');envelopeFailed(metric);assert.ok(diagnostic.historyEndpoint,'Original terminal metadata reached');
    const result=summary.results.find(x=>x.engine===engine);
    return{variant:variant.name,engine,casePassed:result.passed,caseError:result.error||null,originalMediaUndo:metric,endpoint:diagnostic.historyEndpoint,skippedAudits:diagnostic.skippedAudits,skippedRegions:diagnostic.skippedRegions,report:path.join(directory,`${engine}-ink-parity.json`),paritySha256:sha(fs.readFileSync(path.join(directory,`${engine}-ink-parity.json`))),diagnosticSha256:sha(fs.readFileSync(path.join(directory,`${engine}-ink-surface-diagnostic.json`)))};
  });
}
async function main(argv=process.argv.slice(2)){
  const repo=path.resolve(__dirname,'..'),release=path.join(repo,'work/bilge-defter-invited-v78'),runner=path.join(repo,'work/verify-slide-flow.cjs'),stamp=new Date().toISOString().replace(/[-:.TZ]/g,'');
  for(const arg of argv)assert.ok(arg.startsWith('--output-dir=')||arg.startsWith('--engines='),'Known argument only');
  const engines=(argv.find(x=>x.startsWith('--engines='))?.slice(10)||'chromium,webkit').split(',');assert.ok(engines.length>=1&&engines.length<=2&&engines.every(x=>['chromium','webkit'].includes(x))&&new Set(engines).size===engines.length);
  const out=path.resolve(argv.find(x=>x.startsWith('--output-dir='))?.slice(13)||path.join(repo,'outputs/ink-history-diagnostic',stamp));assert.ok(out.startsWith(path.join(repo,'outputs')+path.sep),'Diagnostic output stays below ignored outputs');assert.ok(!fs.existsSync(out),'Preserve prior evidence: new output directory required');fs.mkdirSync(out,{recursive:true});
  const report={diagnosticOnly:true,releaseEligible:false,startedAt:new Date().toISOString(),pins:PINS,engines,variants:[],cases:[],status:'incomplete',boundaries:[
    'This is a copied-runner intervention, not a product patch or a replacement for the mandatory full acceptance suite.',
    'B/D suppress six early full-canvas reads, three ROI reads, six PNG encodings and their CPU comparison/serialization. Browser turns, geometry reads, reference painting/disposal and four draws per audit remain. Timing cost changes are part of this intervention.',
    'C/D omit media move and undo only. Final normalized visible ink and geometry must match A. Revision, undo-history and cache differences are natural mediators, not equalized or erased.',
    'Endpoint evidence is derived only from the original terminal audit result, before cold invalidation, controlled replay or zoom. No new hot browser calls/readbacks are inserted.',
    'A must reproduce within each engine before any intervention contrast can be interpreted. A prior full-suite failure does not substitute for this fresh-process control.',
    'No backend, GPU/CPU, physical iPad, persistence or release correctness inference follows from these finite synthetic observations.'
  ]};
  try{
    const canonical=fs.readFileSync(runner,'utf8');assert.equal(sha(canonical),PINS.runner);const assets=verifyPackage(release);report.assets=assets;
    for(const variant of VARIANTS){
      const directory=path.join(out,variant.name),copiedFile=path.join(directory,'runner.cjs');fs.mkdirSync(directory);const generated=transformRunner(canonical,variant);fs.writeFileSync(copiedFile,generated.source);
      const tag=`history-${stamp}-${variant.name.toLowerCase()}`,resultDirectory=path.join(repo,'outputs/slide-flow',`dpr-2-${tag}`);
      const fixture={...generated.provenance,diagnosticOnly:true,releaseEligible:false,packageRoot:release,manifestSha256:PINS.manifest,assets:assets.length,engines,tag,resultDirectory,applicationModified:false,canonicalRunnerModified:false};fs.writeFileSync(path.join(directory,'fixture.json'),JSON.stringify(fixture,null,2));
      const args=[copiedFile,'--dpr=2','--case=warm ink',`--tag=${tag}`];if(engines.length===1)args.push(`--engine=${engines[0]}`);
      console.log(`HISTORY ${variant.name}: canonical application, copied runner ${generated.provenance.copiedRunnerSha256}`);
      const child=cp.spawnSync(process.execPath,args,{cwd:repo,env:{...process.env,BILGE_TEST_ROOT:release,BILGE_DIAGNOSTIC_REPO:repo},encoding:'utf8',timeout:240000,maxBuffer:12*1024*1024});fs.writeFileSync(path.join(directory,'runner.log'),(child.stdout||'')+(child.stderr||''));
      const resultFile=path.join(resultDirectory,`report${engines.length===1?'-'+engines[0]:''}-warm-ink.json`),entry={...fixture,exitCode:child.status,signal:child.signal,error:child.error?String(child.error):null,report:resultFile};report.variants.push(entry);
      assert.ok(fs.existsSync(resultFile),'Child produced its canonical result report');const summary=readJson(resultFile);assert.equal(summary.runnerSha256,generated.provenance.copiedRunnerSha256,'Actually executed copied runner');entry.reportSha256=sha(fs.readFileSync(resultFile));entry.passed=summary.passed;entry.failed=summary.failed;entry.drift=summary.drift;
      report.cases.push(...validateChild(resultDirectory,variant,engines,summary,child));assert.equal(sha(fs.readFileSync(runner)),PINS.runner);verifyPackage(release);
    }
    assert.equal(report.cases.length,4*engines.length);report.comparisons=classifyComparisons(report.cases);report.status=report.comparisons.some(x=>x.status==='controlled-observation')?'controlled-observations':'inconclusive';
  }catch(error){report.status='inconclusive-harness-error';report.error=String(error.stack||error);process.exitCode=1;}
  finally{
    report.completedAt=new Date().toISOString();report.originalSourceStillPinned=sha(fs.readFileSync(path.join(release,'pdf-workspace.js')))===PINS.renderer;report.originalRunnerStillPinned=sha(fs.readFileSync(runner))===PINS.runner;
    if(!report.originalSourceStillPinned||!report.originalRunnerStillPinned){report.status='inconclusive-drift';process.exitCode=1;}
    const file=path.join(out,'results.json');fs.writeFileSync(file,JSON.stringify(report,null,2));console.log(JSON.stringify({diagnosticOnly:true,releaseEligible:false,status:report.status,report:file,error:report.error||null}));return report;
  }
}
module.exports={PINS,VARIANTS,sha,replaceOne,transformRunner,normalizeAudit,envelopeFailed,classifyComparisons,main};
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
