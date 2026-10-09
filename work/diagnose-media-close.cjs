'use strict';
// Diagnostic package copies only. The application and original acceptance
// runner are immutable; completion of this script is never release approval.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),assert=require('node:assert/strict'),vm=require('node:vm');
const repo=path.resolve(__dirname,'..'),release=path.join(repo,'work/bilge-defter-invited-v78'),runner=path.join(__dirname,'verify-slide-flow.cjs');
const MEDIA_SHA='f25586bc8d2aa2abd6bade5a5304ff31b72c8bc427a55f9afefae6ee2fb5af31',RENDERER_SHA='3b3fcdedfd40ba4656b7c8dca2ece1eeb605f54229326b3d91b03351cb11007e',MANIFEST_SHA='6f172d47680d93b9d39e316a1f1512ee0e0c2e4645b95af9aab33890b34890f9',RUNNER_SHA='f2cb459827c1d725d6df1f22c6ff12047a02d415a7d26b8eb65f3eaa769de8d0';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');

// This exact helper is serialized into the ignored media-workspace.js copy and
// exercised by VM self-tests. It neither schedules nor postpones a drawing.
function redrawClosedMediaMode(){
  if(!window.BilgeSlideFlow?.enabled()){drawAll();return;}
  refreshMediaSelection();
  const workspace=document.querySelector('.workspace'),host=workspace.closest('bilge-defter-ui');
  // V2 normally mirrors this class in a MutationObserver. Mirror only this
  // workspace's actual owning host now, before resize reads the final layout.
  if(host)host.classList.toggle('layout-active',workspace.classList.contains('layout-active'));
  const width=canvas.width,height=canvas.height,scale=ctx.getTransform().a;
  resize();
  // resize already draws when its bitmap dimensions or DPR transform change.
  // Its no-op path still needs one draw to remove a cancelled draft/selection.
  if(canvas.width===width&&canvas.height===height&&ctx.getTransform().a===scale)drawAll();
}
function replaceOnce(source,before,after,label,patches){assert.equal(source.split(before).length-1,1,'Unique pinned candidate hook: '+label);patches.push({label,before,after});return source.replace(before,()=>after);}
function candidateSource(source){
  const patches=[];
  source=replaceOnce(source,'function cancelMediaMode(){',redrawClosedMediaMode.toString()+'\nfunction cancelMediaMode(){','PPTX-only synchronous layout helper',patches);
  source=replaceOnce(source,'mediaSelecting=false;mediaCancelMode.hidden=true;drawAll();if(creating)','mediaSelecting=false;mediaCancelMode.hidden=true;redrawClosedMediaMode();if(creating)','synchronize owning layout before the close redraw',patches);
  return{source,patches};
}
function selfTest(){
  const tests=[],check=(name,fn)=>{fn();tests.push(name);};
  function harness({flow=true,host=true,change=null,fit=false}={}){
    const events=[],bitmap={width:100,height:100};let scale=2,draws=0,workspaceActive=true,hostActive=true;
    const owner={classList:{toggle:(name,value)=>{assert.equal(name,'layout-active');events.push('host-sync');hostActive=value;}}};
    const workspace={classList:{contains:name=>{assert.equal(name,'layout-active');return workspaceActive;}},closest:name=>{assert.equal(name,'bilge-defter-ui');return host?owner:null;}};
    const environment={window:{BilgeSlideFlow:{enabled:()=>flow}},canvas:bitmap,ctx:{getTransform:()=>({a:scale})},document:{querySelector:selector=>{assert.equal(selector,'.workspace');return workspace;}},refreshMediaSelection:()=>{events.push('layout-sync');workspaceActive=false;},drawAll:()=>{events.push('draw');draws++;},resize:()=>{events.push('resize');assert.equal(workspaceActive,false);if(host)assert.equal(hostActive,false,'Owning host synchronized before geometry read');if(change){if(change.width)bitmap.width=change.width;if(change.height)bitmap.height=change.height;if(change.scale)scale=change.scale;if(fit)events.push('fitPageToWidth');environment.drawAll();}}};
    const call=vm.runInNewContext('('+redrawClosedMediaMode.toString()+')',environment);
    return{call,events,bitmap,environment,get draws(){return draws;},get hostActive(){return hostActive;}};
  }
  check('unchanged bitmap draws once after both synchronous layout mirrors',()=>{const h=harness();h.call();assert.deepEqual(h.events,['layout-sync','host-sync','resize','draw']);assert.equal(h.draws,1);});
  check('width resize uses the resize-owned draw exactly once',()=>{const h=harness({change:{width:101}});h.call();assert.equal(h.draws,1);assert.equal(h.bitmap.width,101);});
  check('height resize uses the resize-owned draw exactly once',()=>{const h=harness({change:{height:101}});h.call();assert.equal(h.draws,1);});
  check('DPR transform change also uses the resize-owned draw',()=>{const h=harness({change:{scale:1}});h.call();assert.equal(h.draws,1);});
  check('resize-owned fit redraw is not followed by a duplicate draw',()=>{const h=harness({change:{width:101},fit:true});h.call();assert.equal(h.draws,1);assert.ok(h.events.includes('fitPageToWidth'));});
  check('non-PPTX paths retain the original draw-only behavior',()=>{const h=harness({flow:false});h.call();assert.deepEqual(h.events,['draw']);assert.equal(h.hostActive,true);});
  check('absent flow API retains the original draw-only behavior',()=>{const h=harness();delete h.environment.window.BilgeSlideFlow;h.call();assert.deepEqual(h.events,['draw']);});
  check('old UI without owning V2 host still synchronizes local layout',()=>{const h=harness({host:false,change:{height:101}});h.call();assert.deepEqual(h.events,['layout-sync','resize','draw']);assert.equal(h.draws,1);});
  check('repeated close with stable dimensions still redraws once each',()=>{const h=harness();h.call();h.call();assert.equal(h.draws,2);assert.equal(h.events.filter(x=>x==='resize').length,2);});
  check('absent and duplicate replacement hooks reject',()=>{assert.throws(()=>replaceOnce('x','q','r','absent',[]));assert.throws(()=>replaceOnce('qq','q','r','duplicate',[]));});
  console.log(JSON.stringify({diagnosticOnly:true,releaseEligible:false,selfTest:true,passed:tests.length,tests}));
}
if(process.argv.includes('--self-test')){selfTest();return;}
const engine=process.argv.find(x=>x.startsWith('--engine='))?.slice(9),selectedCase=process.argv.find(x=>x.startsWith('--case='))?.slice(7),variant=process.argv.find(x=>x.startsWith('--variant='))?.slice(10)||'both',prepareOnly=process.argv.includes('--prepare-only'),runProbe=process.argv.includes('--probe');
assert.ok(!engine||['chromium','webkit'].includes(engine),'Supported engine');assert.ok(selectedCase===undefined||selectedCase.length>0,'Non-empty case filter');
assert.ok(['both','candidate'].includes(variant),'Supported variant filter');
assert.ok(!prepareOnly||!runProbe,'Preparation does not run a browser probe');
for(const arg of process.argv.slice(2))assert.ok(arg==='--prepare-only'||arg==='--probe'||arg.startsWith('--engine=')||arg.startsWith('--case=')||arg.startsWith('--variant='),'Unsupported argument: '+arg);
const stamp=new Date().toISOString().replace(/[-:.TZ]/g,''),out=path.join(repo,'outputs/media-close-candidate',stamp),report={diagnosticOnly:true,releaseEligible:false,status:'inconclusive',startedAt:new Date().toISOString(),baselineMediaSha256:MEDIA_SHA,rendererSha256:RENDERER_SHA,baselineManifestSha256:MANIFEST_SHA,runnerSha256:RUNNER_SHA,engine:engine||'both',case:selectedCase||'full',variant,prepareOnly,runProbe,dpr:2,variants:[],boundaries:[
  'Only ignored candidate media-workspace.js differs. No canonical app, renderer, runner, quality threshold, manifest, Git or live service changes.',
  'The candidate changes only continuous-PPTX media close: light-DOM layout and the actual owning V2 host are synchronized before synchronous resize.',
  'The V2 class mirror is deliberately coupled to the pinned bridge contract. Its later MutationObserver should be idempotent; a separate geometry probe must verify that.',
  'Plain/PDF close retains the original drawing path. Draft data, history, commit, scheduling, placing-to-dialog behavior and source rendering are not rewritten.',
  'No new RAF, timer, hold, canvas allocation or pixel read. Resize already draws when changed; the unchanged-size path explicitly draws once.',
  'This is an efficiency candidate, not proof of the Linux raster root cause. Passing a selected case or preparation is not acceptance, publication or physical iPad evidence.'
]};
fs.mkdirSync(out,{recursive:true});
try{
  const manifest=fs.readFileSync(path.join(release,'SHA256SUMS')),source=fs.readFileSync(path.join(release,'media-workspace.js'),'utf8');
  assert.equal(sha(manifest),MANIFEST_SHA,'Pinned release manifest');assert.equal(sha(source),MEDIA_SHA,'Pinned media source');assert.equal(sha(fs.readFileSync(path.join(release,'pdf-workspace.js'))),RENDERER_SHA,'Pinned renderer');assert.equal(sha(fs.readFileSync(runner)),RUNNER_SHA,'Pinned original runner');
  const assets=manifest.toString('utf8').trim().split(/\r?\n/).map(line=>{const m=/^([0-9a-f]{64})  (.+)$/.exec(line);assert.ok(m,'Manifest line');const absolute=path.resolve(release,m[2]);assert.ok(absolute.startsWith(release+path.sep),'Asset remains in package');assert.equal(sha(fs.readFileSync(absolute)),m[1],'Pinned asset '+m[2]);return{name:m[2],absolute,hash:m[1]};});assert.equal(assets.length,246,'All 246 exact assets');
  const candidate=candidateSource(source);fs.writeFileSync(path.join(out,'candidate-hooks.json'),JSON.stringify({baselineMediaSha256:MEDIA_SHA,candidateMediaSha256:sha(candidate.source),rendererSha256:RENDERER_SHA,patches:candidate.patches},null,2));
  for(const name of ['baseline','candidate']){
    const dir=path.join(out,name),packageRoot=path.join(dir,'package');fs.mkdirSync(packageRoot,{recursive:true});
    for(const asset of assets){const destination=path.join(packageRoot,asset.name);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.copyFileSync(asset.absolute,destination);}fs.writeFileSync(path.join(packageRoot,'SHA256SUMS'),manifest);
    const bytes=name==='candidate'?candidate.source:source;fs.writeFileSync(path.join(packageRoot,'media-workspace.js'),bytes);
    const fixture={name,diagnosticOnly:true,releaseEligible:false,packageRoot,mediaSha256:sha(bytes),baselineMediaSha256:MEDIA_SHA,rendererSha256:RENDERER_SHA,runnerSha256:RUNNER_SHA,manifestSha256:MANIFEST_SHA,manifestMatchesSource:name==='baseline',hooks:name==='candidate'?candidate.patches.map(p=>p.label):[]};fs.writeFileSync(path.join(dir,'fixture.json'),JSON.stringify(fixture,null,2));
    for(const asset of assets)assert.equal(sha(fs.readFileSync(path.join(packageRoot,asset.name))),asset.name==='media-workspace.js'?fixture.mediaSha256:asset.hash,'Only intended fixture asset differs: '+asset.name);
    const syntax=cp.spawnSync(process.execPath,['--check',path.join(packageRoot,'media-workspace.js')],{encoding:'utf8'});assert.equal(syntax.status,0,syntax.stderr||'Fixture source syntax');
    const result={...fixture,status:'prepared'};report.variants.push(result);if(prepareOnly||variant==='candidate'&&name==='baseline')continue;
    const tag=`media-close-${stamp}-${name}`,args=[runner,'--dpr=2',`--tag=${tag}`];if(engine)args.push('--engine='+engine);if(selectedCase)args.push('--case='+selectedCase);
    console.log('DIAGNOSTIC '+name+' '+fixture.mediaSha256);
    const child=cp.spawnSync(process.execPath,args,{cwd:repo,env:{...process.env,BILGE_TEST_ROOT:packageRoot},encoding:'utf8',timeout:1800000,maxBuffer:12*1024*1024});fs.writeFileSync(path.join(dir,'runner.log'),(child.stdout||'')+(child.stderr||''));
    const evidence=path.join(repo,'outputs/slide-flow','dpr-2-'+tag),filename=path.join(evidence,`report${engine?'-'+engine:''}${selectedCase?'-'+selectedCase.replace(/[^a-z0-9]+/gi,'-'):''}.json`),summary=fs.existsSync(filename)?JSON.parse(fs.readFileSync(filename)):null;
    Object.assign(result,{status:'measured',exitCode:child.status,signal:child.signal,error:child.error?String(child.error):null,report:filename,reportSha256:summary?sha(fs.readFileSync(filename)):null,passed:summary?.passed,failed:summary?.failed,drift:summary?.drift,failures:summary?.results.filter(r=>!r.passed).map(r=>({engine:r.engine,name:r.name,error:r.error}))});
    assert.ok(summary&&[0,1].includes(child.status),'Original runner completed');assert.deepEqual(summary.drift,[],'Fixture bytes did not change');assert.equal(summary.runnerSha256,RUNNER_SHA,'Original runner actually used');assert.equal(summary.source['/media-workspace.js'],fixture.mediaSha256,'Correct media variant served');assert.equal(summary.source['/pdf-workspace.js'],RENDERER_SHA,'Renderer unchanged in actual fixture');assert.ok(summary.passed+summary.failed>0,'At least one unmodified case selected');if(!selectedCase)assert.equal(summary.passed+summary.failed,engine?27:54,'Original full DPR2 suite size');
    console.log(JSON.stringify({name,passed:result.passed,failed:result.failed,drift:result.drift}));
  }
  if(runProbe){
    const probe=path.join(__dirname,'probe-media-close.cjs'),probeSha=sha(fs.readFileSync(probe)),probeOut=path.join(out,'probe'),filename=path.join(probeOut,'results.json');
    // The independent lifecycle probe always covers both engines, even when
    // the original acceptance invocation was deliberately filtered above.
    const child=cp.spawnSync(process.execPath,[probe,'--baseline='+report.variants[0].packageRoot,'--candidate='+report.variants[1].packageRoot,'--out='+probeOut],{cwd:repo,encoding:'utf8',timeout:600000,maxBuffer:12*1024*1024});
    fs.writeFileSync(path.join(out,'probe.log'),(child.stdout||'')+(child.stderr||''));const summary=fs.existsSync(filename)?JSON.parse(fs.readFileSync(filename)):null;
    report.probe={scriptSha256:probeSha,exitCode:child.status,signal:child.signal,error:child.error?String(child.error):null,report:filename,reportSha256:summary?sha(fs.readFileSync(filename)):null,result:summary};
    assert.equal(sha(fs.readFileSync(probe)),probeSha,'Probe script unchanged while running');assert.ok(summary&&[0,1].includes(child.status),'Independent lifecycle probe completed');assert.equal(summary.diagnosticOnly,true);assert.equal(summary.releaseEligible,false);assert.equal(summary.canonicalRunnerSha256,RUNNER_SHA);assert.ok(!summary.error,'Probe measurement error is inconclusive, not a product failure');assert.ok(['probe-failed','lifecycle-probe-passed'].includes(summary.status),'Expected completed probe status');assert.equal(child.status,summary.status==='probe-failed'?1:0,'Probe status and exit agree');
  }
  assert.equal(sha(fs.readFileSync(runner)),RUNNER_SHA,'Canonical runner unchanged');assert.equal(sha(fs.readFileSync(path.join(release,'SHA256SUMS'))),MANIFEST_SHA,'Canonical manifest unchanged');for(const asset of assets)assert.equal(sha(fs.readFileSync(asset.absolute)),asset.hash,'Original asset unchanged '+asset.name);
  const base=report.variants[0],candidateResult=report.variants[1];report.status=prepareOnly?'prepared':candidateResult.failed||report.probe?.result.status==='probe-failed'?'candidate-rejected':variant==='candidate'?'candidate-passed-without-baseline':base.failed?'candidate-passed-selected-scope':'no-failure-reproduced';if(report.status==='candidate-rejected')process.exitCode=1;
}catch(error){report.error={name:String(error.name||'Error'),message:String(error.message||error),stack:String(error.stack||'')};process.exitCode=1;}
finally{report.completedAt=new Date().toISOString();const filename=path.join(out,'results.json');fs.writeFileSync(filename,JSON.stringify(report,null,2));console.log(JSON.stringify({diagnosticOnly:true,releaseEligible:false,status:report.status,report:filename,error:report.error||null}));}
