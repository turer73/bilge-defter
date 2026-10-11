'use strict';
// Three predeclared Linux pairs. This is an acceptance harness, not a retry loop.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),assert=require('node:assert/strict');
const REPO=path.resolve(__dirname,'..'),BASE='897a424d0d8249572ede087ee3f8426588fe9cb4';
const BASE_MANIFEST='6f172d47680d93b9d39e316a1f1512ee0e0c2e4645b95af9aab33890b34890f9',RUNNER_SHA='400b0ad42e2e9645f9e41d968b669d87aeffca5c23fef24d00b41b2080ea862d';
const PREVIOUS_RUNNER_REVISION='918aa5796110db12cb3950588fb17d521205dbf9',PREVIOUS_RUNNER_SHA='70b520033e42bed33131cfde055fd9863c7603d75f7611fa9e55812a7cd78d2d';
const PREVIOUS_PAINT='async function paint(p){await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));}';
const APPROVED_PAINT=`async function paint(p){
  // The viewport reader decodes serially. Wait for the actual requested visible
  // pages, not an assumed two-frame parallel Image load. Error pages still reach
  // the unchanged readiness/colour/ink assertions; none is counted as a pass here.
  await p.waitForFunction(()=>{const r=window.BilgeSlideFlow?.snapshot()?.reader;return !r||!r.scope||r.visible.every(id=>r.resident.some(x=>x.key===id)||r.errors.some(x=>x.key===id))});
  await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
}`;
// Re-run BOTH packages with the same approved runner; historical reports from
// the old runner are not interchangeable. Only the asynchronous reader readiness
// wait was added before the original two RAFs. No raster threshold, assertion or
// case changed. A reader error merely ends waiting; existing assertions decide.
const RUNNER_PROVENANCE=Object.freeze({
  contract:'visible-reader-readiness-v1',previousRevision:PREVIOUS_RUNNER_REVISION,
  previousSha256:PREVIOUS_RUNNER_SHA,currentSha256:RUNNER_SHA,
  allowedChange:'Only paint: await requested visible pages resident or errored before the unchanged two requestAnimationFrame callbacks.',
  rationale:'Serial viewport decoding cannot be assumed complete after two frames. Error pages still face the unchanged readiness, colour and ink assertions.',
  unchanged:'All 54 cases, raster thresholds and assertions; both variants execute the same updated runner.',
  comparisonBoundary:'Historical old-runner results cannot substitute for this pair; baseline reproduction is still required in the new three-pair run.',
  lineEndings:'Raw SHA256 pins are exact; the single approved source delta is compared after CRLF-to-LF normalization.'
});
// Older evidence stays historical: v4 declares the v80 package and its safety assets.
// Raster assertions and the complete case count remain the same for both contracts.
const SCHEMA='media-cache-pairs-v4',GESTURE_MODES=Object.freeze({baseline:'pinch',candidate:'scroll-only'});
const CASE='warm ink cache preserves bounded full replay quality after edits undo and zoom',ORDERS={1:['baseline','candidate'],2:['candidate','baseline'],3:['baseline','candidate']};
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function assertApprovedRunnerDelta(previous,current){
  const before=previous.toString().replace(/\r\n/g,'\n'),after=current.toString().replace(/\r\n/g,'\n');
  assert.equal(before.split(PREVIOUS_PAINT).length,2,'Exactly one historical paint function');
  assert.equal(after,before.replace(PREVIOUS_PAINT,APPROVED_PAINT),'Only the approved visible-reader readiness wait may change; all raster assertions stay byte-identical');
}
function assertRunnerProvenance(runner){
  const previous=run('git',['show',PREVIOUS_RUNNER_REVISION+':work/verify-slide-flow.cjs'],{encoding:'buffer'}),current=fs.readFileSync(runner);
  assert.equal(sha(previous),PREVIOUS_RUNNER_SHA,'Pinned historical runner bytes');
  assert.equal(sha(current),RUNNER_SHA,'Pinned visible-reader readiness runner bytes');
  assertApprovedRunnerDelta(previous,current);return {...RUNNER_PROVENANCE};
}
function fileMap(root,prefix=''){
  const result={};
  for(const entry of fs.readdirSync(root,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
    assert.ok(!entry.isSymbolicLink(),'No symlink in measured package');const name=prefix+entry.name,full=path.join(root,entry.name);
    if(entry.isDirectory())Object.assign(result,fileMap(full,name+'/'));else{assert.ok(entry.isFile(),'Only regular package files');result['/'+name]=sha(fs.readFileSync(full));}
  }
  return Object.fromEntries(Object.entries(result).sort(([a],[b])=>a.localeCompare(b)));
}
function packageMap(root,expectedManifest){
  assert.ok(fs.lstatSync(root).isDirectory()&&!fs.lstatSync(root).isSymbolicLink(),'Real package root');
  const sums=fs.readFileSync(path.join(root,'SHA256SUMS')),expected={'/SHA256SUMS':sha(sums)};
  if(expectedManifest)assert.equal(sha(sums),expectedManifest,'Pinned baseline manifest');
  for(const line of sums.toString().trim().split(/\r?\n/)){
    const m=/^([a-f0-9]{64})  ([^\\:]+)$/.exec(line);assert.ok(m,'Manifest format');const name=m[2];
    assert.ok(!path.isAbsolute(name)&&!name.split('/').some(x=>!x||x==='.'||x==='..'),'Safe package member');assert.ok(!Object.hasOwn(expected,'/'+name),'Unique manifest member');expected['/'+name]=m[1];
  }
  assert.equal(Object.keys(expected).length,expectedManifest?247:250,'Pinned baseline or v80 with navigator, viewport reader and import stage assets');
  const actual=fileMap(root);assert.deepEqual(actual,Object.fromEntries(Object.entries(expected).sort(([a],[b])=>a.localeCompare(b))),'Complete package bytes and file set match manifest');
  return actual;
}
function validateReport(result,exitCode,source,variant){
  assert.ok(result&&[0,1].includes(exitCode),'Runner completed with a report and ordinary exit');assert.equal(result.dpr,2);assert.equal(result.diagnoseInk,false);
  assert.ok(Object.hasOwn(GESTURE_MODES,variant),'Declared measurement variant');assert.equal(result.gestureMode,GESTURE_MODES[variant],'Explicit gesture contract matches variant');
  assert.equal(result.runnerSha256,RUNNER_SHA,'Same approved readiness runner for both variants');assert.deepEqual(result.source,source,'Complete served snapshot matches fixture');assert.deepEqual(result.drift,[]);
  assert.equal(result.results.length,54,'Unfiltered full suite');assert.equal(new Set(result.results.map(x=>x.engine+'\0'+x.name)).size,54,'Unique full cases');
  for(const engine of ['chromium','webkit'])assert.equal(result.results.filter(x=>x.engine===engine).length,27,'Both complete engines');
  assert.deepEqual(result.results.filter(x=>x.engine==='chromium').map(x=>x.name).sort(),result.results.filter(x=>x.engine==='webkit').map(x=>x.name).sort(),'Same complete case set in both engines');
  const failures=result.results.filter(x=>x.passed!==true),passed=result.results.filter(x=>x.passed===true).length;
  assert.equal(result.failed,failures.length);assert.equal(result.passed,passed);assert.equal(exitCode,failures.length?1:0,'Exit agrees with assertions');
  if(variant==='candidate')assert.equal(failures.length,0,'Candidate must pass all 54 cases');
  else{
    assert.equal(variant,'baseline');assert.ok(failures.length<=1,'Baseline has no new failure');
    for(const failure of failures){assert.equal(failure.engine,'webkit');assert.equal(failure.name,CASE);assert.match(failure.error,/media undo: (?:alpha deviation|composite maximum|foreground average|foreground outlier fraction)/,'Baseline reproduces the original media-undo raster gate, not another fault');}
  }
  return{gestureMode:result.gestureMode,passed,failed:failures.length,baselineReproduced:variant==='baseline'&&failures.length===1};
}
function run(command,args,options={}){return cp.execFileSync(command,args,{cwd:REPO,windowsHide:true,encoding:'utf8',maxBuffer:16*1024*1024,...options});}
function copyPackage(source,dest){fs.mkdirSync(dest,{recursive:true});for(const name of Object.keys(fileMap(source))){const target=path.join(dest,name.slice(1));fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(source,name.slice(1)),target);}}
function assertDifference(baseline,candidate){
  assert.deepEqual(Object.keys(candidate).sort(),[...Object.keys(baseline),'/page-navigation.js','/viewport-reader.js','/pptx/import-stage.js'].sort(),'Only declared navigator, viewport reader and import stage runtime assets added');
  const changed=Object.keys(baseline).filter(name=>baseline[name]!==candidate[name]);
  const allowed=new Set(['/media-workspace.js','/pdf-workspace.js','/index.html','/pptx-workspace.js','/sync-workspace.js','/ui-v2/bilge-defter-ui.js','/offline-assets.json','/SHA256SUMS','/sw.js','/release.json']);
  assert.ok(changed.includes('/media-workspace.js')&&changed.includes('/pdf-workspace.js'),'Both declared rendering changes must be present');
  assert.ok(changed.every(name=>allowed.has(name)),'Only declared rendering, import/recovery, gesture files and deterministic manifests change: '+changed.join(','));return changed;
}
function fresh(dir){assert.ok(!fs.existsSync(dir),'Never overwrite or silently retry evidence: '+dir);fs.mkdirSync(dir,{recursive:true});}
function prepareBaseline(out){
  const checkout=path.join(out,'baseline-source'),archive=path.join(out,'baseline-source.tar');fresh(checkout);
  run('git',['archive',BASE,'work/bilge-defter-test','work/build-invited.cjs','work/pptx-pilot','tools/prepare-pptx-pilot.cjs','-o',archive]);
  run('tar',['-xf',archive,'-C',checkout]);
  const log=run(process.execPath,[path.join(checkout,'work/build-invited.cjs')],{cwd:checkout});fs.writeFileSync(path.join(out,'baseline-build.log'),log);
  const built=path.join(checkout,'work/bilge-defter-invited-v78');packageMap(built,BASE_MANIFEST);const dest=path.join(out,'baseline','package');copyPackage(built,dest);return dest;
}
function executePair(pair,requestedOutput){
  assert.ok(Object.hasOwn(ORDERS,pair),'Pair is 1, 2 or 3');
  // Never reuse historical pairN directories or canonical runner tags. An explicit
  // --out names this pair's new directory, not a directory allowed to be emptied.
  const evidenceId=crypto.randomUUID(),outputs=path.join(REPO,'outputs');
  const output=path.resolve(requestedOutput||path.join(outputs,'media-cache-fix','v80-pair'+pair+'-'+evidenceId));
  assert.ok(output.startsWith(outputs+path.sep),'Evidence must stay inside repository outputs');
  for(let ancestor=output;ancestor!==REPO;ancestor=path.dirname(ancestor))if(fs.existsSync(ancestor))assert.ok(fs.lstatSync(ancestor).isDirectory()&&!fs.lstatSync(ancestor).isSymbolicLink(),'No symlink evidence ancestor');
  fresh(output);
  const runner=path.join(REPO,'work/verify-slide-flow.cjs'),candidate=path.resolve(process.env.BILGE_TEST_ROOT||path.join(REPO,'work/bilge-defter-invited-v80'));
  const report={schema:SCHEMA,pair:Number(pair),order:ORDERS[pair],gestureModes:GESTURE_MODES,baselineCommit:BASE,baselineManifestSha256:BASE_MANIFEST,canonicalRunnerSha256:RUNNER_SHA,startedAt:new Date().toISOString(),status:'inconclusive',variants:[],releaseEligible:false};
  try{
    report.runnerProvenance=assertRunnerProvenance(runner);report.sourceHead=run('git',['rev-parse','HEAD']).trim();report.sourceTree=run('git',['rev-parse','HEAD^{tree}']).trim();report.workingChanges=run('git',['status','--porcelain']).trim();
    const browserMetadata=JSON.parse(fs.readFileSync(path.join(path.dirname(require.resolve('playwright-core/package.json')),'browsers.json'))).browsers.filter(x=>['chromium','webkit'].includes(x.name));
    report.environment={platform:process.platform,node:process.version,playwright:require('playwright/package.json').version,browserMetadata,runId:process.env.GITHUB_RUN_ID||null,attempt:process.env.GITHUB_RUN_ATTEMPT||null,image:process.env.ImageOS||null,imageVersion:process.env.ImageVersion||null,runnerOS:process.env.RUNNER_OS||null};
    const roots={baseline:prepareBaseline(output),candidate:path.join(output,'candidate','package')};packageMap(candidate);copyPackage(candidate,roots.candidate);
    const snapshots={baseline:packageMap(roots.baseline,BASE_MANIFEST),candidate:packageMap(roots.candidate)};report.changedAssets=assertDifference(snapshots.baseline,snapshots.candidate);report.packages=snapshots;
    const oldSw=fs.readFileSync(path.join(roots.baseline,'sw.js'),'utf8'),newSw=fs.readFileSync(path.join(roots.candidate,'sw.js'),'utf8');
    assert.equal(oldSw.split("VERSION='v78'").length,2,'Unique old SW version');
    assert.equal(newSw,oldSw.replace("VERSION='v78'","VERSION='v80'"),'SW behavior unchanged; only v80 version');
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(roots.candidate,'release.json'))),{version:'v80'});
    report.versionContract='v78-to-v80-metadata-only';
    for(const variant of report.order){
      const dir=path.join(output,variant),tag='media-cache-v80-p'+pair+'-'+evidenceId+'-'+variant,evidence=path.join(REPO,'outputs/slide-flow','dpr-2-'+tag);
      const gestureMode=GESTURE_MODES[variant];
      assert.ok(!fs.existsSync(evidence),'Never overwrite canonical evidence');fs.writeFileSync(path.join(dir,'fixture.json'),JSON.stringify({variant,gestureMode,source:snapshots[variant],baselineCommit:BASE,runnerSha256:RUNNER_SHA,runnerProvenance:report.runnerProvenance},null,2));
      const child=cp.spawnSync(process.execPath,[runner,'--dpr=2','--gesture='+gestureMode,'--tag='+tag],{cwd:REPO,env:{...process.env,BILGE_TEST_ROOT:roots[variant]},windowsHide:true,encoding:'utf8',timeout:1800000,maxBuffer:16*1024*1024});
      fs.writeFileSync(path.join(dir,'runner.log'),(child.stdout||'')+(child.stderr||''));
      const file=path.join(evidence,'report.json'),summary=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):null;
      if(fs.existsSync(evidence))fs.cpSync(evidence,path.join(dir,'canonical-evidence'),{recursive:true,errorOnExist:true,force:false});
      const measured={variant,gestureMode,exitCode:child.status,signal:child.signal,error:child.error?String(child.error):null,reportSha256:summary?sha(fs.readFileSync(file)):null,report:variant+'/canonical-evidence/report.json'};report.variants.push(measured);
      try{assert.equal(child.signal,null);assert.ok(!child.error,'No runner timeout or transport error');Object.assign(measured,validateReport(summary,child.status,snapshots[variant],variant));assert.deepEqual(fileMap(roots[variant]),snapshots[variant],'Full measured file set remains unchanged');}
      catch(error){measured.validationError=String(error.stack||error);}
      console.log(JSON.stringify({pair:Number(pair),variant,gestureMode,passed:summary?.passed,failed:summary?.failed,error:measured.validationError||measured.error||null}));
    }
    for(const variant of report.order)assert.deepEqual(fileMap(roots[variant]),snapshots[variant],'Final exact '+variant+' source set');
    assert.equal(sha(fs.readFileSync(runner)),RUNNER_SHA,'Canonical runner remains unchanged');assert.equal(report.variants.length,2);
    assert.ok(report.variants.every(x=>!x.validationError),'Both measurements must be valid; candidate must pass all cases');
    report.status='pair-passed';report.baselineReproduced=report.variants.find(x=>x.variant==='baseline').baselineReproduced;
  }catch(error){report.error=String(error.stack||error);process.exitCode=1;}
  finally{report.completedAt=new Date().toISOString();fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({pair:report.pair,status:report.status,report:path.join(output,'results.json')}));}
  return report;
}
function validateAggregate(reports){
  assert.equal(reports.length,3,'All three predeclared pairs required');assert.deepEqual(reports.map(x=>x.pair).sort(),[1,2,3]);const first=reports[0];
  for(const report of reports){
    assert.equal(report.schema,SCHEMA);assert.equal(report.versionContract,'v78-to-v80-metadata-only');assert.equal(report.status,'pair-passed');assert.ok(!report.error);assert.equal(report.baselineCommit,BASE);assert.equal(report.baselineManifestSha256,BASE_MANIFEST);assert.equal(report.canonicalRunnerSha256,RUNNER_SHA);assert.deepEqual(report.order,ORDERS[report.pair]);assert.deepEqual(report.gestureModes,GESTURE_MODES,'Pair declares both gesture contracts');
    assert.deepEqual(report.runnerProvenance,RUNNER_PROVENANCE,'Exact approved runner change and historical comparison boundary are required');
    assert.equal(report.environment.platform,'linux','Linux evidence required');assert.equal(report.environment.playwright,'1.62.1');
    for(const field of ['runId','attempt','image','imageVersion','runnerOS','node']){assert.ok(typeof report.environment[field]==='string'&&report.environment[field].length>0,'Required CI provenance: '+field);assert.equal(report.environment[field],first.environment[field],'Same CI run and environment: '+field);}
    assert.match(report.environment.runId,/^\d+$/);assert.match(report.environment.attempt,/^[1-9]\d*$/);assert.deepEqual(report.environment.browserMetadata,first.environment.browserMetadata,'Same browser revisions');assert.equal(report.environment.browserMetadata.length,2);
    assert.equal(report.sourceHead,first.sourceHead);assert.equal(report.sourceTree,first.sourceTree);assert.deepEqual(report.packages,first.packages,'One byte-identical candidate and baseline across all runners');assert.equal(report.workingChanges,first.workingChanges);
    assert.deepEqual(report.variants.map(x=>x.variant),report.order);const baseline=report.variants.find(x=>x.variant==='baseline'),candidate=report.variants.find(x=>x.variant==='candidate');
    for(const item of report.variants){assert.ok(!item.validationError&&!item.error&&!item.signal);assert.match(item.reportSha256,/^[a-f0-9]{64}$/);assert.equal(item.gestureMode,GESTURE_MODES[item.variant],'Measured variant declares the required gesture contract');}
    assert.equal(candidate.exitCode,0);assert.equal(candidate.passed,54);assert.equal(candidate.failed,0);assert.ok([0,1].includes(baseline.failed));assert.equal(baseline.passed+baseline.failed,54);assert.equal(baseline.exitCode,baseline.failed?1:0);assert.equal(report.baselineReproduced,baseline.failed===1);
  }
  assert.ok(reports.some(x=>x.baselineReproduced),'No baseline reproduction: efficacy remains inconclusive; do not rerun until green');return{schema:SCHEMA,gestureModes:GESTURE_MODES,runnerProvenance:RUNNER_PROVENANCE,status:'three-pairs-passed',candidatePasses:3,baselineReproductions:reports.filter(x=>x.baselineReproduced).length,releaseEligible:false};
}
function aggregate(dir){
  const root=path.resolve(dir),found=[];function visit(current){for(const entry of fs.readdirSync(current,{withFileTypes:true})){assert.ok(!entry.isSymbolicLink());const full=path.join(current,entry.name);if(entry.isDirectory())visit(full);else if(entry.name==='results.json'){const data=JSON.parse(fs.readFileSync(full));if(typeof data.schema==='string'&&data.schema.startsWith('media-cache-pairs-')){assert.equal(data.schema,SCHEMA,'Historical pair evidence cannot satisfy this gesture contract');found.push({full,data});}}}}visit(root);
  for(const {full,data}of found)for(const variant of data.variants){const reportFile=path.resolve(path.dirname(full),variant.report);assert.ok(reportFile.startsWith(path.dirname(full)+path.sep));const bytes=fs.readFileSync(reportFile);assert.equal(sha(bytes),variant.reportSha256,'Downloaded canonical report hash');validateReport(JSON.parse(bytes),variant.exitCode,data.packages[variant.variant],variant.variant);}
  const result=validateAggregate(found.map(x=>x.data));console.log(JSON.stringify({...result,pairs:found.map(x=>({pair:x.data.pair,file:x.full}))},null,2));return result;
}
function selfTest(){
  const tests=[],check=(name,fn)=>{fn();tests.push(name);},clone=value=>JSON.parse(JSON.stringify(value)),source={'/index.html':'a'.repeat(64)},digest='b'.repeat(64);
  function fixture(failing=false,variant='candidate'){const results=[];for(const engine of ['chromium','webkit'])for(let i=0;i<27;i++)results.push({engine,name:i===26?CASE:'fixture '+i,passed:true});if(failing)Object.assign(results.at(-1),{passed:false,error:'AssertionError: media undo: alpha deviation'});return{dpr:2,diagnoseInk:false,gestureMode:GESTURE_MODES[variant],runnerSha256:RUNNER_SHA,source,results,passed:failing?53:54,failed:failing?1:0,drift:[]};}
  function pairs(){return[1,2,3].map(pair=>({schema:SCHEMA,versionContract:'v78-to-v80-metadata-only',pair,status:'pair-passed',order:ORDERS[pair],gestureModes:{...GESTURE_MODES},baselineCommit:BASE,baselineManifestSha256:BASE_MANIFEST,canonicalRunnerSha256:RUNNER_SHA,runnerProvenance:{...RUNNER_PROVENANCE},environment:{platform:'linux',node:'v22.23.3',playwright:'1.62.1',browserMetadata:[{name:'chromium',revision:'1'},{name:'webkit',revision:'2'}],runId:'123',attempt:'1',image:'ubuntu24',imageVersion:'fixture',runnerOS:'Linux'},sourceHead:'c'.repeat(40),sourceTree:'d'.repeat(40),workingChanges:'',packages:{baseline:source,candidate:source},baselineReproduced:pair===1,variants:ORDERS[pair].map(variant=>({variant,gestureMode:GESTURE_MODES[variant],reportSha256:digest,exitCode:variant==='baseline'&&pair===1?1:0,passed:variant==='baseline'&&pair===1?53:54,failed:variant==='baseline'&&pair===1?1:0}))}));}
  const historical='before\n'+PREVIOUS_PAINT+'\nafter',approved='before\n'+APPROVED_PAINT+'\nafter';
  check('only the exact approved paint change validates',()=>assertApprovedRunnerDelta(historical,approved));
  check('unchanged old runner does not meet the new contract',()=>assert.throws(()=>assertApprovedRunnerDelta(historical,historical),/Only the approved/));
  check('a second source edit outside paint is rejected',()=>assert.throws(()=>assertApprovedRunnerDelta(historical,approved+'\nextra assertion change'),/Only the approved/));
  check('a weakened readiness wait is rejected',()=>assert.throws(()=>assertApprovedRunnerDelta(historical,approved.replace('r.visible.every','r.visible.some')),/Only the approved/));
  check('duplicate historical paint functions are rejected',()=>assert.throws(()=>assertApprovedRunnerDelta(historical+'\n'+PREVIOUS_PAINT,approved),/Exactly one/));
  check('full candidate and expected baseline failure validate',()=>{assert.equal(validateReport(fixture(),0,source,'candidate').passed,54);assert.equal(validateReport(fixture(true,'baseline'),1,source,'baseline').baselineReproduced,true);});
  check('wrong candidate gesture contract is rejected',()=>{const x=fixture();x.gestureMode='pinch';assert.throws(()=>validateReport(x,0,source,'candidate'),/Explicit gesture contract/);});
  check('wrong baseline gesture contract is rejected',()=>{const x=fixture(true,'baseline');x.gestureMode='scroll-only';assert.throws(()=>validateReport(x,1,source,'baseline'),/Explicit gesture contract/);});
  check('missing gesture contract is rejected',()=>{const x=fixture();delete x.gestureMode;assert.throws(()=>validateReport(x,0,source,'candidate'),/Explicit gesture contract/);});
  check('candidate raster failure is rejected',()=>assert.throws(()=>validateReport(fixture(true),1,source,'candidate')));
  check('source snapshot drift is rejected',()=>assert.throws(()=>validateReport(fixture(),0,{'/index.html':'wrong'},'candidate')));
  check('missing case is rejected',()=>{const x=fixture();x.results.pop();assert.throws(()=>validateReport(x,0,source,'candidate'));});
  check('duplicate case is rejected',()=>{const x=fixture();x.results[0]=x.results[1];assert.throws(()=>validateReport(x,0,source,'candidate'));});
  check('unexpected baseline error is rejected',()=>{const x=fixture(true,'baseline');x.results.at(-1).error='Save failed';assert.throws(()=>validateReport(x,1,source,'baseline'),/Baseline reproduces the original media-undo raster gate, not another fault/);});
  check('wrong exit code is rejected',()=>assert.throws(()=>validateReport(fixture(),1,source,'candidate')));
  check('valid predetermined three pairs validate',()=>assert.equal(validateAggregate(pairs()).candidatePasses,3));
  check('historical runner reports are rejected',()=>{const x=fixture();x.runnerSha256=PREVIOUS_RUNNER_SHA;assert.throws(()=>validateReport(x,0,source,'candidate'),/Same approved readiness runner/);});
  check('missing runner provenance is rejected',()=>{const x=pairs();delete x[0].runnerProvenance;assert.throws(()=>validateAggregate(x),/Exact approved runner change/);});
  check('changed runner provenance is rejected',()=>{const x=pairs();x[0].runnerProvenance.previousSha256=RUNNER_SHA;assert.throws(()=>validateAggregate(x),/Exact approved runner change/);});
  check('historical v1 pair evidence is rejected',()=>{const x=pairs();for(const p of x)p.schema='media-cache-pairs-v1';assert.throws(()=>validateAggregate(x));});
  check('wrong pair gesture map is rejected',()=>{const x=pairs();x[1].gestureModes.baseline='scroll-only';assert.throws(()=>validateAggregate(x),/Pair declares/);});
  check('missing pair gesture map is rejected',()=>{const x=pairs();delete x[1].gestureModes;assert.throws(()=>validateAggregate(x),/Pair declares/);});
  check('wrong candidate variant mode is rejected',()=>{const x=pairs();x[1].variants.find(v=>v.variant==='candidate').gestureMode='pinch';assert.throws(()=>validateAggregate(x),/Measured variant/);});
  check('wrong baseline variant mode is rejected',()=>{const x=pairs();x[1].variants.find(v=>v.variant==='baseline').gestureMode='scroll-only';assert.throws(()=>validateAggregate(x),/Measured variant/);});
  check('missing variant gesture mode is rejected',()=>{const x=pairs();delete x[1].variants[0].gestureMode;assert.throws(()=>validateAggregate(x),/Measured variant/);});
  check('missing pair is rejected',()=>assert.throws(()=>validateAggregate(pairs().slice(0,2))));
  check('duplicate pair is rejected',()=>{const x=pairs();x[2]=clone(x[1]);assert.throws(()=>validateAggregate(x));});
  check('cross-run artifacts are rejected',()=>{const x=pairs();x[1].environment.runId='124';assert.throws(()=>validateAggregate(x));});
  check('cross-attempt artifacts are rejected',()=>{const x=pairs();x[1].environment.attempt='2';assert.throws(()=>validateAggregate(x));});
  check('missing CI provenance is rejected',()=>{const x=pairs();for(const p of x)p.environment.runId=null;assert.throws(()=>validateAggregate(x));});
  check('changed candidate snapshot is rejected',()=>{const x=clone(pairs());x[1].packages.candidate['/index.html']='different';assert.throws(()=>validateAggregate(x));});
  check('candidate aggregate failure is rejected',()=>{const x=pairs();x[1].variants.find(v=>v.variant==='candidate').failed=1;assert.throws(()=>validateAggregate(x));});
  check('no baseline reproduction stays inconclusive',()=>{const x=pairs();for(const p of x){p.baselineReproduced=false;Object.assign(p.variants.find(v=>v.variant==='baseline'),{failed:0,passed:54,exitCode:0});}assert.throws(()=>validateAggregate(x));});
  check('changed predetermined order is rejected',()=>{const x=pairs();x[1].order=['baseline','candidate'];assert.throws(()=>validateAggregate(x));});
  check('non-Linux evidence cannot aggregate',()=>{const x=pairs();for(const p of x)p.environment.platform='win32';assert.throws(()=>validateAggregate(x));});
  check('missing version contract is rejected',()=>{const x=pairs();delete x[0].versionContract;assert.throws(()=>validateAggregate(x));});
  check('historical v2 evidence is rejected',()=>{const x=pairs();x[0].schema='media-cache-pairs-v2';assert.throws(()=>validateAggregate(x));});
  check('historical v3 evidence is rejected',()=>{const x=pairs();x[0].schema='media-cache-pairs-v3';assert.throws(()=>validateAggregate(x));});
  check('historical version contract is rejected',()=>{const x=pairs();x[0].versionContract='v78-to-v79-metadata-only';assert.throws(()=>validateAggregate(x));});
  const oldFiles={'/media-workspace.js':'old','/pdf-workspace.js':'old','/sync-workspace.js':'old'},newFiles={'/media-workspace.js':'new','/pdf-workspace.js':'new','/sync-workspace.js':'new','/page-navigation.js':'new','/viewport-reader.js':'new','/pptx/import-stage.js':'new'};
  check('exact v80 runtime additions and sync recovery changes validate',()=>assert.deepEqual(assertDifference(oldFiles,newFiles),['/media-workspace.js','/pdf-workspace.js','/sync-workspace.js']));
  check('extra runtime file is rejected',()=>assert.throws(()=>assertDifference(oldFiles,{...newFiles,'/unexpected.js':'new'})));
  check('removed runtime file is rejected',()=>assert.throws(()=>assertDifference({...oldFiles,'/keep.js':'old'},newFiles)));
  check('missing viewport reader is rejected',()=>{const x={...newFiles};delete x['/viewport-reader.js'];assert.throws(()=>assertDifference(oldFiles,x));});
  check('missing import stage is rejected',()=>{const x={...newFiles};delete x['/pptx/import-stage.js'];assert.throws(()=>assertDifference(oldFiles,x));});
  console.log(JSON.stringify({selfTest:true,passed:tests.length,tests}));return tests;
}
module.exports={BASE,BASE_MANIFEST,RUNNER_SHA,PREVIOUS_RUNNER_REVISION,PREVIOUS_RUNNER_SHA,RUNNER_PROVENANCE,SCHEMA,GESTURE_MODES,CASE,ORDERS,sha,fileMap,packageMap,assertDifference,assertApprovedRunnerDelta,assertRunnerProvenance,validateReport,validateAggregate};
if(require.main===module){
  const args=process.argv.slice(2);
  if(args.length===1&&args[0]==='--self-test')selfTest();
  else if(args.length===1&&args[0].startsWith('--aggregate='))aggregate(args[0].slice(12));
  else if(args.length>=1&&args.length<=2&&/^--pair=[123]$/.test(args[0])){
    assert.ok(args.length===1||/^--out=.+$/.test(args[1]),'Pair accepts only one optional --out=NEW_DIRECTORY');
    executePair(args[0].slice(7),args[1]?.slice(6));
  }else throw Error('Use --pair=N [--out=NEW_DIRECTORY], --aggregate=DIR or --self-test');
}
