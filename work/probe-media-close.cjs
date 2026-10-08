'use strict';
// Diagnostic only. Reuse the pinned canonical fixture, never its acceptance
// assertions or footer. The generated probe and both packages are non-release.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),assert=require('node:assert/strict');
const repo=path.resolve(__dirname,'..'),runner=path.join(__dirname,'verify-slide-flow.cjs');
const RUNNER_SHA='f2cb459827c1d725d6df1f22c6ff12047a02d415a7d26b8eb65f3eaa769de8d0',APP_SHA='3b3fcdedfd40ba4656b7c8dca2ece1eeb605f54229326b3d91b03351cb11007e',MANIFEST_SHA='6f172d47680d93b9d39e316a1f1512ee0e0c2e4645b95af9aab33890b34890f9';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const option=name=>process.argv.find(arg=>arg.startsWith('--'+name+'='))?.slice(name.length+3);
function once(source,before,after){assert.equal(source.split(before).length-1,1,'Unique fixture site: '+before);return source.replace(before,()=>after);}

// Serialized into the browser. Metadata only: no readback or drawing is added.
function installCloseCapture(){
  if(window.__mediaCloseCapture)throw Error('Capture already installed');
  const original=drawAll,entries=[];let active=false,synchronous=false;
  function geometry(){
    const workspace=canvas.closest('.workspace'),host=workspace?.closest('bilge-defter-ui'),r=canvas.getBoundingClientRect(),t=ctx.getTransform();
    return{workspace:!!workspace,host:!!host,workspaceLayout:workspace?.classList.contains('layout-active'),hostLayout:host?.classList.contains('layout-active'),barHidden:document.querySelector('#layoutBar').hidden,mediaSelecting,mediaPending:!!mediaPending,css:{x:r.x,y:r.y,width:r.width,height:r.height},bitmap:{width:canvas.width,height:canvas.height},transform:[t.a,t.b,t.c,t.d,t.e,t.f]};
  }
  drawAll=function(...args){if(active)entries.push({synchronous,geometry:geometry()});return original.apply(this,args);};
  window.__mediaCloseCapture={
    invoke(){entries.length=0;const before=geometry();active=true;synchronous=true;try{cancelMediaMode();}finally{synchronous=false;}return{before,after:geometry()};},
    finish(){const result={entries:entries.slice(),final:geometry()};active=false;drawAll=original;delete window.__mediaCloseCapture;return result;},
    restore(){active=false;drawAll=original;delete window.__mediaCloseCapture;}
  };
}

// These are separate lifecycle observations, NOT replacements for the original
// 54 cases. Functions below run in the generated canonical-fixture prefix.
async function probeMain(){
  const variant=process.env.MEDIA_CLOSE_VARIANT;
  assert.ok(['baseline','candidate'].includes(variant));
  Object.assign(report,{diagnosticOnly:true,releaseEligible:false,variant,canonicalRunnerSha256:process.env.MEDIA_CLOSE_CANONICAL_SHA,generatedProbeSha256:sha(fs.readFileSync(__filename))});
  report.boundaries=[
    'Separate synthetic lifecycle probe; the original 54-case runner and quality thresholds are unchanged and must run independently.',
    'Geometry is sampled at drawAll entry, forcing ordinary layout calculation equally in baseline and candidate. No pixel read, extra draw or cache mutation is performed by this capture.',
    'Synchronous close plus two animation frames are observed; zero later draws describes this bounded window, not every future browser event.',
    'Only synthetic approved identity and local imported PNG pages are used. Service workers disabled; external requests and account uploads blocked.',
    'No Linux raster-fix, physical iPad/Pencil, timing or production acceptance is claimed.'
  ];
  const notes=p=>p.evaluate(()=>state.pages.map(p=>({id:p.id,strokes:structuredClone(p.strokes)})));
  const diskNotes=p=>p.evaluate(async()=>(await dbGet()).pages.map(p=>({id:p.id,strokes:p.strokes})));
  async function setup(p,mode){
    const ids=await importSlides(p,3);
    await p.evaluate(mode=>{
      for(const [i,p]of notebookPages().entries()){p.strokes=[{tool:'pen',color:'#0000ff',width:3,points:[{x:30,y:40+i*5,p:.5},{x:180,y:60+i*5,p:.5}]}];touchPage(p);}
      if(mode==='plain')delete page().pdf;
      if(mode==='pdf'){page().pdf.name='Synthetic existing PDF.pdf';page().pdfZoom=1.25;page().viewX=20;page().viewY=20;}
      renderPages();resize();drawAll();scheduleSave();
    },mode);
    await save(p);await paint(p);await p.waitForFunction(()=>pdfBackgroundReady());
    assert.equal(await p.evaluate(()=>BilgeSlideFlow.enabled()),mode==='pptx');
    assert.equal(await p.evaluate(()=>document.querySelector('#pdfNavigation').hidden),mode!=='pdf');
    return ids;
  }
  async function captureClose(p){
    await p.evaluate(installCloseCapture);let immediate,result;
    try{immediate=await p.evaluate(()=>window.__mediaCloseCapture.invoke());await paint(p);result=await p.evaluate(()=>window.__mediaCloseCapture.finish());}
    finally{await p.evaluate(()=>window.__mediaCloseCapture?.restore());}
    return{...immediate,...result};
  }
  function equalGeometry(a,b){return JSON.stringify(a.css)===JSON.stringify(b.css)&&JSON.stringify(a.bitmap)===JSON.stringify(b.bitmap)&&JSON.stringify(a.transform)===JSON.stringify(b.transform)&&a.workspaceLayout===b.workspaceLayout&&a.hostLayout===b.hostLayout&&a.barHidden===b.barHidden;}
  function assertFinal(entry){
    assert.ok(entry.workspace&&entry.host,'Real owning V2 workspace/host exists');
    assert.equal(entry.workspaceLayout,false);assert.equal(entry.hostLayout,false);assert.equal(entry.barHidden,true);assert.equal(entry.mediaSelecting,false);
    assert.equal(entry.bitmap.width,Math.max(1,Math.round(entry.css.width*dpr)));assert.equal(entry.bitmap.height,Math.max(1,Math.round(entry.css.height*dpr)));assert.equal(entry.transform[0],dpr);
  }
  async function begin(p,text){
    await p.evaluate(text=>beginPendingMedia({tool:'text',text,fontSize:24,width:220,color:'#173b36',points:[{x:120,y:100}]}),text);await paint(p);
    assert.equal(await p.evaluate(()=>!!mediaPending&&mediaSelecting),true);
  }
  try{
    for(const [engine,type]of [['chromium',chromium],['webkit',webkit]]){
      const browser=await type.launch({headless:true});
      try{
        await check(browser,engine,'PPTX close draws at final owning-host geometry',async({p})=>{
          await setup(p,'pptx');const before=await notes(p);
          await p.evaluate(()=>document.querySelector('#mediaEdit').click());await paint(p);
          const changed=await captureClose(p),sync=changed.entries.filter(x=>x.synchronous),later=changed.entries.filter(x=>!x.synchronous);
          fs.writeFileSync(path.join(out,engine+'-close-geometry.json'),JSON.stringify(changed,null,2));
          assert.ok(changed.before.host&&changed.before.workspaceLayout&&changed.before.hostLayout&&!changed.before.barHidden,'Real media layout was open');
          assertFinal(changed.final);assert.deepEqual(await notes(p),before,'Closing existing selection does not modify ink');
          assert.ok(sync.length>=1,'Closing selection draws synchronously');
          if(variant==='candidate'){
            assert.equal(sync.length,1,'Exactly one synchronous final-geometry draw');assert.ok(equalGeometry(sync[0].geometry,changed.final),'First and only synchronous draw uses final geometry');assertFinal(sync[0].geometry);assert.equal(later.length,0,'No later resize redraw in the observed two-frame window');
          }else{
            assert.equal(equalGeometry(sync[0].geometry,changed.final),false,'Baseline demonstrates an old-geometry first draw');
          }
          const stable=await captureClose(p),stableSync=stable.entries.filter(x=>x.synchronous);
          assert.equal(stableSync.length,1,'Unchanged-size close still draws once');assert.equal(stable.entries.length,1,'Unchanged-size close has no deferred draw');assert.ok(equalGeometry(stable.before,stable.final));assert.ok(equalGeometry(stableSync[0].geometry,stable.final));assert.deepEqual(await notes(p),before);
          const image=await screenshot(p,engine,'closed-pptx');return{changed,stable,screenshot:image};
        });
        for(const mode of ['pptx','plain','pdf'])await check(browser,engine,mode+' draft cancel finish reload undo preserve notes',async({p})=>{
          const ids=await setup(p,mode),before=await notes(p),diskBefore=await diskNotes(p),active=await p.evaluate(()=>activeId);
          await begin(p,'Discard by Cancel');await p.evaluate(()=>document.querySelector('#layoutCancel').click());await paint(p);
          assert.equal(await p.evaluate(()=>mediaPending),null);assert.deepEqual(await notes(p),before);assert.deepEqual(await diskNotes(p),diskBefore,'Cancel makes no note write');
          await begin(p,'Discard by Escape');await p.keyboard.press('Escape');await paint(p);
          assert.equal(await p.evaluate(()=>mediaPending),null);assert.deepEqual(await notes(p),before);assert.deepEqual(await diskNotes(p),diskBefore,'Escape makes no note write');
          await begin(p,'Exactly once '+mode);const draft=await p.evaluate(()=>structuredClone(mediaPending.draft));
          await p.evaluate(()=>document.querySelector('#layoutDone').click());await paint(p);
          assert.equal(await p.evaluate(()=>mediaPending),null);assert.equal(await p.evaluate(()=>mediaUndo.get(activeId)?.length),1,'One placement creates one undo entry');
          const expected=before.map(p=>p.id===active?{...p,strokes:[...p.strokes,draft]}:p);
          assert.deepEqual(await notes(p),expected,'Done appends once and leaves every other page unchanged');assert.equal(await p.evaluate(()=>validState(state)),true);
          await save(p);assert.deepEqual(await diskNotes(p),expected,'The single addition is stored');
          const historyUndo=await p.evaluate(()=>{
            const original=undoMedia;let calls=0,result;
            undoMedia=function(...args){calls++;result=original.apply(this,args);return result;};
            try{document.querySelector('#undo').click();}finally{undoMedia=original;}
            return{calls,result,history:mediaUndo.get(activeId)?.length};
          });
          assert.deepEqual(historyUndo,{calls:1,result:true,history:0},'The real media history, not the generic pop fallback, undoes the placement');
          await save(p);await paint(p);assert.deepEqual(await notes(p),before);assert.deepEqual(await diskNotes(p),before);
          // Undo history is intentionally session-only. A separate addition then
          // tests persistence and the normal post-reload last-stroke undo path.
          await begin(p,'Exactly once after reload '+mode);const secondDraft=await p.evaluate(()=>structuredClone(mediaPending.draft));
          await p.evaluate(()=>document.querySelector('#layoutDone').click());await save(p);await paint(p);
          const stored=before.map(p=>p.id===active?{...p,strokes:[...p.strokes,secondDraft]}:p);
          assert.deepEqual(await notes(p),stored);assert.deepEqual(await diskNotes(p),stored);
          await p.reload();await p.waitForFunction(()=>typeof ready!=='undefined'&&ready&&window.__v2UI);await p.waitForFunction(()=>pdfBackgroundReady());await paint(p);
          assert.equal(await p.evaluate(()=>activeId),active);assert.deepEqual(await notes(p),stored,'Reload restores exactly one addition');assert.equal(await p.evaluate(()=>mediaUndo.get(activeId)?.length||0),0,'Session-only media history is not falsely claimed to persist');
          await p.evaluate(()=>document.querySelector('#undo').click());await save(p);await paint(p);
          assert.deepEqual(await notes(p),before,'One normal undo restores all original ink');assert.deepEqual(await diskNotes(p),before);assert.equal(await p.evaluate(()=>validState(state)),true);
          assert.equal(await p.evaluate(()=>BilgeSlideFlow.enabled()),mode==='pptx');assert.equal(await p.evaluate(()=>document.querySelector('#pdfNavigation').hidden),mode!=='pdf');
          return{mode,ids,active,unchangedOtherPages:ids.filter(id=>id!==active),singleCommit:true,mediaHistoryUndo:historyUndo,reload:true,postReloadNormalUndo:true};
        });
      }finally{await browser.close();}
    }
  }finally{
    report.completedAt=new Date().toISOString();report.passed=report.results.filter(x=>x.passed).length;report.failed=report.results.filter(x=>!x.passed).length;
    report.drift=[...hashes].filter(([name,hash])=>!fs.existsSync(path.join(root,name.slice(1)))||sha(fs.readFileSync(path.join(root,name.slice(1))))!==hash).map(([name])=>name);
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
  }
  assert.equal(report.results.length,8,'Exactly four lifecycle cases per engine');assert.deepEqual(report.drift,[]);assert.equal(report.failed,0,'Every separate lifecycle probe must pass');
}

function main(){
  for(const arg of process.argv.slice(2))assert.ok(['--baseline=','--candidate=','--out='].some(prefix=>arg.startsWith(prefix)),'Unsupported probe argument: '+arg);
  const roots=Object.fromEntries(['baseline','candidate'].map(name=>{const value=option(name);assert.ok(value&&path.isAbsolute(value),'Required absolute --'+name+' package path');const absolute=fs.realpathSync(value);assert.ok(absolute.startsWith(path.join(repo,'outputs')+path.sep),'Only ignored output-package fixtures are accepted');return[name,absolute];}));
  assert.notEqual(roots.baseline,roots.candidate);
  const canonical=fs.readFileSync(runner,'utf8');assert.equal(sha(canonical),RUNNER_SHA,'Immutable canonical runner');
  const manifest=fs.readFileSync(path.join(roots.baseline,'SHA256SUMS'));assert.equal(sha(manifest),MANIFEST_SHA);assert.deepEqual(fs.readFileSync(path.join(roots.candidate,'SHA256SUMS')),manifest,'Candidate keeps the deliberately non-release old manifest');
  const assets=manifest.toString().trim().split(/\r?\n/).map(line=>{const m=/^([0-9a-f]{64})  (.+)$/.exec(line);assert.ok(m,'Manifest format');const absolute=path.resolve(roots.baseline,m[2]);assert.ok(absolute.startsWith(roots.baseline+path.sep));assert.equal(sha(fs.readFileSync(absolute)),m[1],'Pinned baseline asset '+m[2]);return{name:m[2],hash:m[1]};});
  assert.equal(assets.length,246,'Complete pinned package');
  function listFiles(dir,prefix=''){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{assert.equal(entry.isSymbolicLink(),false,'No redirected fixture entries');return entry.isDirectory()?listFiles(path.join(dir,entry.name),prefix+entry.name+'/'):[prefix+entry.name];}).sort();}
  for(const dir of Object.values(roots))assert.deepEqual(listFiles(dir),[...assets.map(a=>a.name),'SHA256SUMS'].sort(),'Only pinned fixture files are served');
  const differing=assets.filter(a=>sha(fs.readFileSync(path.join(roots.candidate,a.name)))!==a.hash).map(a=>a.name);assert.deepEqual(differing,['media-workspace.js'],'Only the candidate close function file may differ');
  for(const dir of Object.values(roots))assert.equal(sha(fs.readFileSync(path.join(dir,'pdf-workspace.js'))),APP_SHA,'Raster implementation remains unchanged');
  const stamp=new Date().toISOString().replace(/[-:.TZ]/g,''),requestedOut=option('out');
  if(requestedOut)assert.ok(path.isAbsolute(requestedOut),'--out must be absolute');
  const output=requestedOut?path.resolve(requestedOut):path.join(repo,'outputs/media-close-probe',stamp);
  assert.ok(output.startsWith(path.join(repo,'outputs')+path.sep),'Probe output remains under ignored outputs');
  assert.ok(!fs.existsSync(output)||fs.readdirSync(output).length===0,'Never overwrite earlier probe evidence');fs.mkdirSync(output,{recursive:true});
  const summary={diagnosticOnly:true,releaseEligible:false,startedAt:new Date().toISOString(),canonicalRunnerSha256:RUNNER_SHA,baselineManifestSha256:MANIFEST_SHA,probeSha256:sha(fs.readFileSync(__filename)),soleDifferentAsset:'media-workspace.js',variants:[],boundaries:['Original 54 scenarios are not run or replaced by this lifecycle probe.','No physical device, Linux pixel-fix, live account or deployment acceptance.']};
  let prefix=canonical.slice(0,canonical.indexOf('function traceInkFixture(){'));assert.ok(prefix.endsWith('}\n')||prefix.endsWith('}\r\n'),'Pinned helper prefix ends at function boundary');
  prefix=once(prefix,"const repo=path.resolve(__dirname,'..'),root=path.resolve(process.env.BILGE_TEST_ROOT||path.join(__dirname,'bilge-defter-test'));",'const repo='+JSON.stringify(repo)+',root=path.resolve(process.env.BILGE_TEST_ROOT);');
  prefix=once(prefix,"const out=path.join(repo,'outputs/slide-flow',`dpr-${dpr}${tag?'-'+tag:''}`)","const out=process.env.MEDIA_CLOSE_PROBE_OUT");
  const generated=prefix+'\n'+installCloseCapture.toString()+'\n('+probeMain.toString()+')().catch(error=>{console.error(error.stack||error);process.exitCode=1});\n';
  const generatedFile=path.join(output,'generated-lifecycle-probe.cjs');new(require('node:vm').Script)(generated,{filename:generatedFile});fs.writeFileSync(generatedFile,generated);
  try{
    for(const [variant,packageRoot]of Object.entries(roots)){
      const dir=path.join(output,variant);fs.mkdirSync(dir,{recursive:true});
      const before=Object.fromEntries(assets.map(a=>[a.name,sha(fs.readFileSync(path.join(packageRoot,a.name)))]));
      const child=cp.spawnSync(process.execPath,[generatedFile,'--dpr=2'],{cwd:repo,env:{...process.env,BILGE_TEST_ROOT:packageRoot,MEDIA_CLOSE_PROBE_OUT:dir,MEDIA_CLOSE_VARIANT:variant,MEDIA_CLOSE_CANONICAL_SHA:RUNNER_SHA},encoding:'utf8',timeout:240000,maxBuffer:8*1024*1024});
      fs.writeFileSync(path.join(dir,'runner.log'),(child.stdout||'')+(child.stderr||''));const file=path.join(dir,'report.json'),result=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):null;
      summary.variants.push({variant,packageRoot,exitCode:child.status,signal:child.signal,error:child.error?String(child.error):null,source:before,report:file,reportSha256:result?sha(fs.readFileSync(file)):null,passed:result?.passed,failed:result?.failed,drift:result?.drift,failures:result?.results.filter(x=>!x.passed)});
      console.log(JSON.stringify({variant,passed:result?.passed,failed:result?.failed,exitCode:child.status,report:file}));
      assert.ok(result&&[0,1].includes(child.status),'Lifecycle probe completed normally');assert.equal(result.results.length,8);assert.deepEqual(result.drift,[]);assert.equal(result.canonicalRunnerSha256,RUNNER_SHA);assert.equal(result.generatedProbeSha256,sha(generated));
      for(const [name,hash]of Object.entries(before)){assert.equal(result.source['/'+name],hash,'Actually served '+variant+' '+name);assert.equal(sha(fs.readFileSync(path.join(packageRoot,name))),hash,'Fixture bytes unchanged '+variant+' '+name);}
    }
    summary.status=summary.variants.some(x=>x.failed)?'probe-failed':'lifecycle-probe-passed';if(summary.status==='probe-failed')process.exitCode=1;
  }catch(error){summary.status='inconclusive';summary.error=String(error.stack||error);process.exitCode=1;}
  finally{assert.equal(sha(fs.readFileSync(runner)),RUNNER_SHA,'Canonical runner unchanged after probe');summary.completedAt=new Date().toISOString();fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify({diagnosticOnly:true,status:summary.status,report:path.join(output,'results.json')}));}
}
if(require.main===module)main();
