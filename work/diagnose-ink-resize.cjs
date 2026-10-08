'use strict';
// A rejected candidate is useful evidence, never permission to alter a gate.
// Only ignored package copies differ; the original acceptance runner is used.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),assert=require('node:assert/strict');
const repo=path.resolve(__dirname,'..'),release=path.join(repo,'work/bilge-defter-invited-v78'),runner=path.join(__dirname,'verify-slide-flow.cjs');
const SOURCE_SHA='3b3fcdedfd40ba4656b7c8dca2ece1eeb605f54229326b3d91b03351cb11007e',MANIFEST_SHA='6f172d47680d93b9d39e316a1f1512ee0e0c2e4645b95af9aab33890b34890f9',RUNNER_SHA='f2cb459827c1d725d6df1f22c6ff12047a02d415a7d26b8eb65f3eaa769de8d0';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');

// The same pure controller is serialized into the candidate and self-tested.
// Its only clock is the provided RAF scheduler; no timers, canvases or reads.
function resizeController({request,cancel,current,redraw}){
  let adopted=null,pending=null,handle=null,generation=0;
  function reset(){if(handle!==null)cancel(handle);handle=null;pending=null;adopted=null;generation++;}
  function observe(width,height,owner){
    if(!owner||!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1){reset();return false;}
    if(!adopted||adopted.owner!==owner){reset();adopted={width,height,owner};return false;}
    if(adopted.width===width&&adopted.height===height)return pending!==null;
    if(handle!==null)cancel(handle);
    adopted={width,height,owner};const ticket={...adopted,generation:++generation};pending=ticket;
    handle=request(()=>{
      if(pending!==ticket||generation!==ticket.generation)return;
      pending=null;handle=null;
      const live=current();
      if(!live||live.owner!==ticket.owner||live.width!==ticket.width||live.height!==ticket.height||!live.allowed)return;
      redraw();
    });
    return true;
  }
  return{observe,reset};
}
function replaceOnce(source,before,after,label,patches){assert.equal(source.split(before).length-1,1,'Unique pinned candidate hook: '+label);patches.push({label,before,after});return source.replace(before,()=>after);}
function candidateSource(source){
  const patches=[];
  const controller=`  const resizeInk=(${resizeController.toString()})({
    request:callback=>requestAnimationFrame(callback),cancel:handle=>cancelAnimationFrame(handle),
    current:()=>({owner:flow,width:canvas.width,height:canvas.height,allowed:initialized()&&flow?.state===state&&flow?.db===DB&&flow?.notebook===activeNotebook&&flow?.activeId===activeId&&document.visibilityState==='visible'&&!drawing&&!pan&&!pinchT&&!mediaGesture&&!mediaPending&&!mediaPlacement&&!importing}),
    redraw:()=>drawAll({viewportOnly:true})
  });`;
  source=replaceOnce(source,'  let flow=null;','  let flow=null;\n'+controller,'transient pixel-resize controller',patches);
  source=replaceOnce(source,'function reset(){for(const entry of pictures.values())disposePicture(entry);','function reset(){resizeInk.reset();for(const entry of pictures.values())disposePicture(entry);','flow/account reset cancels deferred redraw',patches);
  source=replaceOnce(source,'    pruneMediaImages();','    pruneMediaImages();\n    const resizeDirect=resizeInk.observe(canvas.width,canvas.height,flow);','observe actual bitmap dimensions',patches);
  source=replaceOnce(source,'let scratch=null,raster=null,rasterFailed=canvas.width*canvas.height>INK_PIXEL_BUDGET;','let scratch=null,raster=null,rasterFailed=canvas.width*canvas.height>INK_PIXEL_BUDGET||resizeDirect;','all visible rows use existing full direct fallback while latched',patches);
  source=replaceOnce(source,"addEventListener('pagehide',()=>{for(const entry of pictures.values())disposePicture(entry);pictures.clear();clearInk()});","addEventListener('pagehide',()=>{resizeInk.reset();for(const entry of pictures.values())disposePicture(entry);pictures.clear();clearInk()});",'pagehide cancels deferred redraw',patches);
  return{source,patches};
}
function selfTest(){
  const tests=[],check=(name,fn)=>{fn();tests.push(name);};
  function harness(){
    const owner={},jobs=new Map(),cancelled=[];let id=0,draws=0,live={owner,width:100,height:100,allowed:true};
    const control=resizeController({request:fn=>{jobs.set(++id,fn);return id;},cancel:key=>{cancelled.push(key);jobs.delete(key);},current:()=>live,redraw:()=>{draws++;}});
    return{control,owner,jobs,cancelled,set:q=>{live={...live,...q};},get draws(){return draws;},fire:key=>{const fn=jobs.get(key);jobs.delete(key);fn();}};
  }
  check('first draw adopts size without deferral',()=>{const h=harness();assert.equal(h.control.observe(100,100,h.owner),false);assert.equal(h.jobs.size,0);});
  check('real resize and repeated same-frame draws remain direct with one RAF',()=>{const h=harness();h.control.observe(100,100,h.owner);h.set({width:101});assert.equal(h.control.observe(101,100,h.owner),true);assert.equal(h.control.observe(101,100,h.owner),true);assert.equal(h.jobs.size,1);h.fire(1);assert.equal(h.draws,1);assert.equal(h.control.observe(101,100,h.owner),false);});
  check('new size replaces pending generation and stale callback cannot draw',()=>{const h=harness();h.control.observe(100,100,h.owner);h.control.observe(101,100,h.owner);const stale=h.jobs.get(1);h.set({width:102});h.control.observe(102,100,h.owner);assert.deepEqual(h.cancelled,[1]);stale();assert.equal(h.draws,0);assert.equal(h.jobs.size,1);h.fire(2);assert.equal(h.draws,1);});
  check('reset/pagehide cancels and invalidates callback',()=>{const h=harness();h.control.observe(100,100,h.owner);h.control.observe(101,100,h.owner);const stale=h.jobs.get(1);h.control.reset();stale();assert.equal(h.draws,0);assert.equal(h.jobs.size,0);assert.equal(h.control.observe(101,100,h.owner),false);});
  check('changed owner skips stale redraw',()=>{const h=harness();h.control.observe(100,100,h.owner);h.control.observe(101,100,h.owner);h.set({width:101,owner:{}});h.fire(1);assert.equal(h.draws,0);});
  check('changed physical dimensions skip stale redraw',()=>{const h=harness();h.control.observe(100,100,h.owner);h.control.observe(101,100,h.owner);h.set({width:102});h.fire(1);assert.equal(h.draws,0);});
  check('account/hidden/gesture denial clears latch without forced redraw',()=>{const h=harness();h.control.observe(100,100,h.owner);h.control.observe(101,100,h.owner);h.set({width:101,allowed:false});h.fire(1);assert.equal(h.draws,0);assert.equal(h.control.observe(101,100,h.owner),false);});
  check('owner adoption and invalid dimensions discard old schedule',()=>{const h=harness();h.control.observe(100,100,h.owner);h.control.observe(101,100,h.owner);assert.equal(h.control.observe(101,100,{}),false);assert.equal(h.jobs.size,0);assert.equal(h.control.observe(NaN,100,h.owner),false);});
  check('duplicate/absent patch hooks reject',()=>{assert.throws(()=>replaceOnce('x','q','r','absent',[]));assert.throws(()=>replaceOnce('qq','q','r','duplicate',[]));});
  check('serialized controller has the same first-draw/latch contract',()=>{const factory=require('node:vm').runInNewContext('('+resizeController.toString()+')'),owner={},jobs=[];let n=0;const c=factory({request:f=>(jobs.push(f),jobs.length),cancel:()=>{},current:()=>({owner,width:101,height:100,allowed:true}),redraw:()=>n++});assert.equal(c.observe(100,100,owner),false);assert.equal(c.observe(101,100,owner),true);assert.equal(c.observe(101,100,owner),true);jobs[0]();assert.equal(n,1);assert.equal(c.observe(101,100,owner),false);});
  console.log(JSON.stringify({diagnosticOnly:true,releaseEligible:false,selfTest:true,passed:tests.length,tests}));
}
if(process.argv.includes('--self-test')){selfTest();return;}
const engine=process.argv.find(x=>x.startsWith('--engine='))?.slice(9),selectedCase=process.argv.find(x=>x.startsWith('--case='))?.slice(7);
assert.ok(!engine||['chromium','webkit'].includes(engine),'Supported engine');assert.ok(selectedCase===undefined||selectedCase.length>0,'Non-empty case filter');
const stamp=new Date().toISOString().replace(/[-:.TZ]/g,''),out=path.join(repo,'outputs/ink-resize-candidate',stamp),report={diagnosticOnly:true,releaseEligible:false,status:'inconclusive',startedAt:new Date().toISOString(),baselineSourceSha256:SOURCE_SHA,baselineManifestSha256:MANIFEST_SHA,runnerSha256:RUNNER_SHA,engine:engine||'both',case:selectedCase||'full',dpr:2,variants:[],boundaries:[
  'No canonical application, runner, threshold, manifest, storage, source drawing geometry or production deployment is changed.',
  'The ignored candidate keeps the original scratch disposal; no hold, extra canvas or pixel read is added.',
  'Initial size adopts immediately. After a changed bitmap size, all same-frame draws use complete visible-row replay until the next guarded RAF.',
  'This intentionally conflicts with the existing immediate second-call warm-cache contract. Failure rejects the candidate; assertions must not be relaxed.',
  'A candidate passing only a selected case is not release acceptance. Physical iPad/Pencil, memory pressure and full-suite acceptance remain separate.',
  'Pure controller tests verify lifecycle decisions, not browser raster behavior or device performance.'
]};
fs.mkdirSync(out,{recursive:true});
try{
  const manifest=fs.readFileSync(path.join(release,'SHA256SUMS')),source=fs.readFileSync(path.join(release,'pdf-workspace.js'),'utf8');
  assert.equal(sha(manifest),MANIFEST_SHA,'Pinned release manifest');assert.equal(sha(source),SOURCE_SHA,'Pinned app');assert.equal(sha(fs.readFileSync(runner)),RUNNER_SHA,'Pinned original runner');
  const assets=manifest.toString('utf8').trim().split(/\r?\n/).map(line=>{const m=/^([0-9a-f]{64})  (.+)$/.exec(line);assert.ok(m,'Manifest line');const absolute=path.resolve(release,m[2]);assert.ok(absolute.startsWith(release+path.sep),'Asset remains in package');assert.equal(sha(fs.readFileSync(absolute)),m[1],'Pinned asset '+m[2]);return{name:m[2],absolute,hash:m[1]};});assert.equal(assets.length,246,'All 246 exact assets');
  const candidate=candidateSource(source);fs.writeFileSync(path.join(out,'candidate-hooks.json'),JSON.stringify({baselineSourceSha256:SOURCE_SHA,candidateSourceSha256:sha(candidate.source),patches:candidate.patches},null,2));
  for(const name of ['baseline','candidate']){
    const dir=path.join(out,name),packageRoot=path.join(dir,'package');fs.mkdirSync(packageRoot,{recursive:true});
    for(const asset of assets){const destination=path.join(packageRoot,asset.name);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.copyFileSync(asset.absolute,destination);}fs.writeFileSync(path.join(packageRoot,'SHA256SUMS'),manifest);
    const bytes=name==='candidate'?candidate.source:source;fs.writeFileSync(path.join(packageRoot,'pdf-workspace.js'),bytes);
    const fixture={name,diagnosticOnly:true,releaseEligible:false,packageRoot,sourceSha256:sha(bytes),baselineSourceSha256:SOURCE_SHA,runnerSha256:RUNNER_SHA,manifestSha256:MANIFEST_SHA,manifestMatchesSource:name==='baseline',hooks:name==='candidate'?candidate.patches.map(p=>p.label):[],holdScratch:false};fs.writeFileSync(path.join(dir,'fixture.json'),JSON.stringify(fixture,null,2));
    const syntax=cp.spawnSync(process.execPath,['--check',path.join(packageRoot,'pdf-workspace.js')],{encoding:'utf8'});assert.equal(syntax.status,0,syntax.stderr||'Package source syntax');
    const tag=`resize-${stamp}-${name}`,args=[runner,'--dpr=2',`--tag=${tag}`];if(engine)args.push('--engine='+engine);if(selectedCase)args.push('--case='+selectedCase);
    console.log('DIAGNOSTIC '+name+' '+fixture.sourceSha256);
    const child=cp.spawnSync(process.execPath,args,{cwd:repo,env:{...process.env,BILGE_TEST_ROOT:packageRoot},encoding:'utf8',timeout:1800000,maxBuffer:12*1024*1024});fs.writeFileSync(path.join(dir,'runner.log'),(child.stdout||'')+(child.stderr||''));
    const evidence=path.join(repo,'outputs/slide-flow','dpr-2-'+tag),filename=path.join(evidence,`report${engine?'-'+engine:''}${selectedCase?'-'+selectedCase.replace(/[^a-z0-9]+/gi,'-'):''}.json`),summary=fs.existsSync(filename)?JSON.parse(fs.readFileSync(filename)):null;
    const result={...fixture,exitCode:child.status,signal:child.signal,error:child.error?String(child.error):null,report:filename,reportSha256:summary?sha(fs.readFileSync(filename)):null,passed:summary?.passed,failed:summary?.failed,drift:summary?.drift,failures:summary?.results.filter(r=>!r.passed).map(r=>({engine:r.engine,name:r.name,error:r.error}))};report.variants.push(result);
    assert.ok(summary&&[0,1].includes(child.status),'Original runner completed');assert.deepEqual(summary.drift,[],'Fixture bytes did not change');assert.equal(summary.runnerSha256,RUNNER_SHA,'Original runner actually used');assert.equal(summary.source['/pdf-workspace.js'],fixture.sourceSha256,'Correct variant served');assert.ok(summary.passed+summary.failed>0,'At least one unmodified case selected');if(!selectedCase)assert.equal(summary.passed+summary.failed,engine?27:54,'Original full DPR2 suite size');
    console.log(JSON.stringify({name,passed:result.passed,failed:result.failed,drift:result.drift}));
  }
  assert.equal(sha(fs.readFileSync(runner)),RUNNER_SHA,'Canonical runner unchanged');assert.equal(sha(fs.readFileSync(path.join(release,'SHA256SUMS'))),MANIFEST_SHA,'Canonical manifest unchanged');for(const asset of assets)assert.equal(sha(fs.readFileSync(asset.absolute)),asset.hash,'Original asset unchanged '+asset.name);
  const base=report.variants[0],candidateResult=report.variants[1];report.status=candidateResult.failed?'candidate-rejected':base.failed?'candidate-passed-selected-scope':'no-failure-reproduced';
}catch(error){report.error={name:String(error.name||'Error'),message:String(error.message||error),stack:String(error.stack||'')};process.exitCode=1;}
finally{report.completedAt=new Date().toISOString();const filename=path.join(out,'results.json');fs.writeFileSync(filename,JSON.stringify(report,null,2));console.log(JSON.stringify({diagnosticOnly:true,releaseEligible:false,status:report.status,report:filename,error:report.error||null}));}
