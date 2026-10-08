'use strict';
// Separate, non-release experiment. The canonical application/runner and all
// acceptance assertions remain pinned; only ignored copies are instrumented.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),assert=require('node:assert/strict');
const repo=path.resolve(__dirname,'..'),release=path.join(repo,'work/bilge-defter-invited-v78'),canonical=path.join(__dirname,'verify-slide-flow.cjs');
const SOURCE_SHA='3b3fcdedfd40ba4656b7c8dca2ece1eeb605f54229326b3d91b03351cb11007e';
const MANIFEST_SHA='6f172d47680d93b9d39e316a1f1512ee0e0c2e4645b95af9aab33890b34890f9';
const RUNNER_SHA='f2cb459827c1d725d6df1f22c6ff12047a02d415a7d26b8eb65f3eaa769de8d0';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const stamp=new Date().toISOString().replace(/[-:.TZ]/g,''),out=path.join(repo,'outputs/ink-stage-diagnostic',stamp);
const report={diagnosticOnly:true,releaseEligible:false,startedAt:new Date().toISOString(),baselineSourceSha256:SOURCE_SHA,baselineManifestSha256:MANIFEST_SHA,canonicalRunnerSha256:RUNNER_SHA,status:'inconclusive',limits:{retainedScratchPixels:100000000,trackedSurfaces:1024,copyRecords:4000},boundaries:[
  'The original mandatory acceptance outcome and thresholds are retained; diagnostic completion is not release success.',
  'Only ignored fixture copies change. The hold package deliberately retains an invalid publishing manifest.',
  'Hot-path additions record metadata and object references only: no new drawing, readback or canvas allocation.',
  'Stage readbacks occur after original audit arrays and PNGs are preserved, before cold invalidation. Readback-time equality does not prove copy-time backend behavior.',
  'Only four last-visible-row coordinates are supported. The first-row five pixels are unavailable because scratch is cleared and reused per row.',
  'Scratch retention is the existing bounded lifetime intervention, up to 100M pixels (400 MB raw RGBA) plus ordinary browser/tile memory; browser-context closure releases it.',
  'Synthetic account and notes only; no external model, network service, private presentation, production data or deployment.'
]};

// These exact pure rules are also serialized into the browser observer. The
// self-test exercises the production diagnostic guards, not a second model.
function stageRules(){
  const covers=(r,x,y)=>x>=r[0]&&y>=r[1]&&x<r[0]+r[2]&&y<r[1]+r[3];
  function rectangles(args,sw,sh,tw,th){
    if(args.length!==8||![...args,sw,sh,tw,th].every(Number.isInteger))return null;
    const [sx,sy,w,h,dx,dy,dw,dh]=args;
    if(Math.min(sw,sh,tw,th,w,h)<=0||sx<0||sy<0||dx<0||dy<0||w!==dw||h!==dh||sx+w>sw||sy+h>sh||dx+w>tw||dy+h>th)return null;
    return{source:[sx,sy,w,h],destination:[dx,dy,dw,dh]};
  }
  function mapPoint(rects,x,y){if(!rects||!Number.isInteger(x)||!Number.isInteger(y)||!covers(rects.destination,x,y))return null;return[rects.source[0]+x-rects.destination[0],rects.source[1]+y-rects.destination[1]];}
  const sameToken=(a,b)=>['id','generation','revision','width','height','lastWrite'].every(k=>a[k]===b[k]);
  const single=items=>items.length===1?items[0]:null;
  const matchesRow=(rows,id)=>rows.length===1&&rows[0].id===id;
  const originalFailed=m=>m.alphaMax>32||m.compositedMax>32||m.compositedMeanForeground>1||m.compositedOver16/m.foregroundPixels>.002;
  const sampleFailed=p=>Math.abs(p.actual[3]-p.reference[3])>32||p.actual.slice(0,3).some((v,i)=>Math.abs(v*p.actual[3]/255+255-p.actual[3]-(p.reference[i]*p.reference[3]/255+255-p.reference[3]))>32);
  const hasFailure=samples=>samples.some(sampleFailed);
  return{covers,rectangles,mapPoint,sameToken,single,matchesRow,originalFailed,hasFailure};
}

// This function is inserted into the existing trace's browser closure. It is
// never run by this Node process and creates no drawing surfaces of its own.
function installInkStageObserver(identity,matrix,rules){
  const surfaces=new WeakMap(),copies=[],proto=CanvasRenderingContext2D.prototype,canvasProto=HTMLCanvasElement.prototype;
  const originals={},descriptors={},points=[[939,1066],[942,1071],[945,1076],[948,1081]],unavailable=[[810,149],[813,153],[813,154],[816,158],[816,159]];
  let serial=0,tracked=0,overflow=false,originalAudit=null,finished=false,observerError=null;
  const phase=()=>window.__inkTracePhase||'setup';
  function state(c){
    let s=surfaces.get(c);if(!s){if(++tracked>1024)overflow=true;s={id:identity(c),generation:0,revision:0,width:c.width,height:c.height,rows:new Map(),nonCopy:false,lastWrite:0};surfaces.set(c,s)}return s;
  }
  function reset(c,reason){const s=state(c);s.generation++;s.revision++;s.width=c.width;s.height=c.height;s.rows.clear();s.nonCopy=false;s.lastWrite=++serial;s.lastKind=reason;}
  function changed(c,kind){const s=state(c);if(s.width!==c.width||s.height!==c.height)reset(c,'observed resize');s.revision++;s.lastWrite=++serial;s.lastKind=kind;return s;}
  const token=c=>{const s=state(c);return{id:s.id,generation:s.generation,revision:s.revision,width:c.width,height:c.height,lastWrite:s.lastWrite,lastKind:s.lastKind,rows:[...s.rows.values()].map(x=>({...x}))};};
  const same=(c,t)=>rules.sameToken(token(c),t);
  const unit=c=>JSON.stringify(matrix(c))==='[1,0,0,1,0,0]'&&c.globalAlpha===1&&c.globalCompositeOperation==='source-over';
  function noteStroke(stroke,target,pair){
    if(!pair||pair[0]<0)return;const p=notebookPages()[pair[0]];if(!p||p.strokes[pair[1]]!==stroke){observerError='Synthetic stroke identity changed';return;}
    state(target.canvas).rows.set(p.id,{id:p.id,index:pair[0]});
  }
  // Cover every drawing operation used by the pinned app, including mutation
  // paths that would make the final surface unsuitable for stage localization.
  const names=['clearRect','fillRect','strokeRect','putImageData','drawImage','stroke','fill','fillText','strokeText'];
  for(const name of names){
    originals[name]=proto[name];
    proto[name]=function(...args){
      const c=this.canvas,source=name==='drawImage'&&args[0] instanceof HTMLCanvasElement?args[0]:null;
      const beforeSource=source?token(source):null,rects=source?rules.rectangles(args.slice(1),source.width,source.height,c.width,c.height):null,plain=unit(this),operationPhase=phase();
      const result=originals[name].apply(this,args);
      if(name==='clearRect'&&JSON.stringify(matrix(this))==='[1,0,0,1,0,0]'&&args[0]===0&&args[1]===0&&args[2]>=c.width&&args[3]>=c.height){reset(c,'full clear');return result;}
      const s=changed(c,name);
      if(name==='drawImage'&&source){
        if(copies.length<4000)copies.push({sequence:s.lastWrite,phase:operationPhase,source,target:c,sourceToken:beforeSource,targetToken:token(c),rects,plain});else overflow=true;
        if(!plain||!rects)s.nonCopy=true;
      }else s.nonCopy=true;
      return result;
    };
  }
  for(const name of ['width','height']){
    const descriptor=Object.getOwnPropertyDescriptor(canvasProto,name);descriptors[name]=descriptor;
    if(!descriptor?.configurable||!descriptor.set){observerError='Canvas bitmap setter cannot be observed';continue;}
    Object.defineProperty(canvasProto,name,{...descriptor,set(value){descriptor.set.call(this,value);reset(this,'bitmap '+name);}});
  }
  function captureAudit(a,b,snapshot,surface,metrics){
    const width=canvas.width,height=canvas.height,visible=snapshot.rows.filter(row=>snapshot.visible.includes(row.id));
    const samples=points.map(([x,y])=>{const i=(y*width+x)*4;return{x,y,inBounds:x>=0&&y>=0&&x<width&&y<height,actual:Array.from(a.slice(i,i+4)),reference:Array.from(b.slice(i,i+4))};});
    originalAudit={main:token(canvas),surface,visible,scroll:snapshot.scroll,scale:BilgeSlideFlow.scale(),samples,metrics,phase:phase(),sequence:serial};
    return{diagnosticOnly:true,samples,originalFailed:rules.originalFailed(metrics),main:originalAudit.main,phase:originalAudit.phase,firstRow:{status:'unavailable',reason:'The same scratch is cleared before each subsequent row.',coordinates:unavailable}};
  }
  function readStages(){
    const result={diagnosticOnly:true,releaseEligible:false,status:'inconclusive',readbackPerformed:false,scope:'Last visible row only; values are observed after the preserved original audit.',firstRow:{status:'unavailable',reason:'Scratch no longer contains the previous row.',coordinates:unavailable},limits:{tracked,copies:copies.length,overflow},samples:[]};
    const reject=reason=>({...result,reason});
    try{
      if(observerError)return reject(observerError);if(overflow)return reject('Metadata limit exceeded');if(!originalAudit)return reject('Original media undo audit was not captured');
      const audit=originalAudit;if(audit.phase!=='audit: media undo')return reject('Unsupported audit phase');
      if(!same(canvas,audit.main))return reject('Main canvas mutated since original audit');
      if(audit.visible.length!==2||audit.main.width!==1676||audit.main.height!==1318)return reject('Unsupported fixture geometry');
      const last=audit.visible[1],t=audit.surface.rowTransforms.find(r=>r.id===last.id)?.transform;
      if(!t||t[0]!==t[3]||t[1]!==0||t[2]!==0||!Number.isFinite(t[0])||t[0]<=0)return reject('Unsupported last-row transform');
      if(state(canvas).nonCopy)return reject('Main has a non-copy mutation in this bitmap generation');
      const plans=[];
      for(const sample of audit.samples){
        if(!sample.inBounds)return reject('Sample is outside original bitmap');
        const {x,y}=sample;if((y-t[5])/t[3]<0||(y-t[5])/t[3]>=last.height)return reject('Sample is outside last visible row');
        const outputs=copies.filter(c=>c.target===canvas&&c.targetToken.generation===audit.main.generation&&c.sequence<=audit.sequence&&c.plain&&c.rects&&rules.covers(c.rects.destination,x,y));
        const output=rules.single(outputs);if(!output)return reject('Missing or ambiguous main copy for sample');
        const tile=output.source,[tx,ty]=rules.mapPoint(output.rects,x,y);
        if(!same(tile,output.sourceToken))return reject('Tile mutated since main copy');
        const inputs=copies.filter(c=>c.target===tile&&c.targetToken.generation===output.sourceToken.generation&&c.sequence<=output.sequence&&c.plain&&c.rects&&rules.covers(c.rects.destination,tx,ty));
        const input=rules.single(inputs);if(!input)return reject('Missing or ambiguous scratch-to-tile copy');
        const scratch=input.source,[sx,sy]=rules.mapPoint(input.rects,tx,ty);
        if(!same(tile,input.targetToken))return reject('Tile has later writes after selected scratch copy');
        if(!same(scratch,input.sourceToken))return reject('Scratch was cleared, redrawn or resized after selected copy');
        if(!Array.isArray(window.__diagnosticHeldScratch)||!window.__diagnosticHeldScratch.includes(scratch))return reject('Source is not an explicitly held scratch');
        if(!rules.matchesRow(input.sourceToken.rows,last.id))return reject('Surviving scratch row identity does not match last visible row');
        if(!['after media close sync','audit: media undo'].includes(input.phase))return reject('Unsupported raster generation phase');
        if(scratch.width!==audit.main.width||scratch.height!==audit.main.height||sx!==x||sy!==y||tx<0||ty<0||tx>=tile.width||ty>=tile.height)return reject('Unsupported copy geometry or bitmap bounds');
        plans.push({sample,scratch,tile,sx,sy,tx,ty,input,output});
      }
      if(new Set(plans.map(p=>p.scratch)).size!==1)return reject('Samples refer to different scratch generations');
      result.chain=plans.map(p=>({x:p.sample.x,y:p.sample.y,row:last.id,scratch:p.input.sourceToken,tile:p.input.targetToken,main:audit.main,inputPhase:p.input.phase,inputSequence:p.input.sequence,outputSequence:p.output.sequence,inputRectangles:p.input.rects,outputRectangles:p.output.rects,tilePoint:[p.tx,p.ty]}));
      result.chainValidated=true;
      if(!rules.originalFailed(audit.metrics)||!rules.hasFailure(audit.samples))return reject('Original quality failure was not reproduced at the four supported coordinates');
      // The audit already preserved the original arrays and PNGs. These are the
      // first extra reads; no redraw, new canvas, context hint or reference draw.
      for(const p of plans){
        const scratch=Array.from(p.scratch.getContext('2d').getImageData(p.sx,p.sy,1,1).data),tile=Array.from(p.tile.getContext('2d').getImageData(p.tx,p.ty,1,1).data),main=Array.from(ctx.getImageData(p.sample.x,p.sample.y,1,1).data);
        const differs=(a,b)=>a.some((v,i)=>v!==b[i]);
        result.samples.push({...p.sample,scratch,tile,mainReadback:main,differences:{scratchVsReference:differs(scratch,p.sample.reference),tileVsScratch:differs(tile,scratch),mainVsTile:differs(main,tile),mainVsOriginalAudit:differs(main,p.sample.actual)}});
      }
      result.readbackPerformed=true;
      if(!same(canvas,audit.main)||plans.some(p=>!same(p.scratch,p.input.sourceToken)||!same(p.tile,p.input.targetToken)))return reject('Surface mutation detected during post-audit reads');
      if(result.samples.some(p=>p.differences.mainVsOriginalAudit))return reject('Post-audit main pixels changed; original discrepancy cannot be localized from these reads');
      result.status='localized-readback';result.reason='Only surviving last-row readback stages are compared; no engine/backend cause is inferred.';return result;
    }catch(error){return reject(String(error.stack||error));}
  }
  function finish(){if(finished)return;finished=true;for(const [name,fn]of Object.entries(originals))proto[name]=fn;for(const [name,descriptor]of Object.entries(descriptors))if(descriptor)Object.defineProperty(canvasProto,name,descriptor);}
  window.__captureInkStageAudit=captureAudit;window.__readInkStages=readStages;
  return{noteStroke,finish};
}

function replaceOnce(text,before,after,label){assert.equal(text.split(before).length-1,1,'Unique pinned runner hook: '+label);return text.replace(before,()=>after);}
function selfTest(){
  const r=stageRules(),tests=[];const check=(name,fn)=>{fn();tests.push(name);};
  check('hash mismatch rejects',()=>assert.throws(()=>assert.equal(sha('altered'),SOURCE_SHA)));
  check('zero and duplicate hooks reject',()=>{assert.throws(()=>replaceOnce('x','q','r','absent'));assert.throws(()=>replaceOnce('qq','q','r','duplicate'));assert.equal(replaceOnce('q','q','r','one'),'r');});
  const args=[512,983,512,335,0,0,512,335],rect=r.rectangles(args,1676,1318,512,512);
  check('integer 1:1 mapping',()=>assert.deepEqual(r.mapPoint(rect,427,83),[939,1066]));
  check('scaled copy rejects',()=>assert.equal(r.rectangles([512,983,512,335,0,0,511,335],1676,1318,512,512),null));
  check('fractional copy rejects',()=>assert.equal(r.rectangles([512.5,983,512,335,0,0,512,335],1676,1318,512,512),null));
  check('out-of-bounds rejects',()=>{assert.equal(r.rectangles(args,1000,1318,512,512),null);assert.equal(r.mapPoint(rect,512,83),null);});
  check('ambiguous/missing identity rejects',()=>{assert.equal(r.single([]),null);assert.equal(r.single([1,2]),null);assert.equal(r.single([1]),1);});
  const t={id:'scratch',generation:3,revision:40,width:1676,height:1318,lastWrite:80};
  check('generation, dimensions and writes reject drift',()=>{assert.ok(r.sameToken(t,{...t}));for(const k of ['generation','revision','width','height','lastWrite'])assert.equal(r.sameToken(t,{...t,[k]:t[k]+1}),false);assert.equal(r.sameToken(t,{...t,id:'other'}),false);});
  check('wrong/multiple row rejects',()=>{assert.ok(r.matchesRow([{id:'last'}],'last'));assert.equal(r.matchesRow([{id:'first'}],'last'),false);assert.equal(r.matchesRow([{id:'first'},{id:'last'}],'last'),false);});
  check('unchanged and benign samples stay inconclusive without mutation',()=>{const samples=[{actual:[0,0,0,0],reference:[0,0,0,0]}],before=JSON.stringify(samples);assert.equal(r.hasFailure(samples),false);assert.equal(JSON.stringify(samples),before);assert.equal(r.hasFailure([{actual:[22,60,56,64],reference:[24,60,56,64]}]),false);assert.equal(r.hasFailure([{actual:[0,0,0,0],reference:[24,60,56,64]}]),true);assert.equal(r.originalFailed({alphaMax:0,compositedMax:0,compositedMeanForeground:0,compositedOver16:0,foregroundPixels:10}),false);assert.equal(r.originalFailed({alphaMax:64}),true);});
  console.log(JSON.stringify({diagnosticOnly:true,releaseEligible:false,selfTest:true,passed:tests.length,tests}));
}
if(process.argv.includes('--self-test')){selfTest();return;}
fs.mkdirSync(out,{recursive:true});
try{
  const manifest=fs.readFileSync(path.join(release,'SHA256SUMS')),source=fs.readFileSync(path.join(release,'pdf-workspace.js'),'utf8'),originalRunner=fs.readFileSync(canonical,'utf8');
  assert.equal(sha(manifest),MANIFEST_SHA,'Exact release manifest');assert.equal(sha(source),SOURCE_SHA,'Exact application source');assert.equal(sha(originalRunner),RUNNER_SHA,'Exact canonical runner');
  const assets=manifest.toString('utf8').trim().split(/\r?\n/).map(line=>{const m=/^([0-9a-f]{64})  (.+)$/.exec(line);assert.ok(m,'Manifest line');const absolute=path.resolve(release,m[2]);assert.ok(absolute.startsWith(release+path.sep),'Asset remains in package');assert.equal(sha(fs.readFileSync(absolute)),m[1],'Unchanged asset '+m[2]);return{name:m[2],absolute,hash:m[1]};});
  const packageRoot=path.join(out,'hold-package');fs.mkdirSync(packageRoot,{recursive:true});
  for(const asset of assets){const dest=path.join(packageRoot,asset.name);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(asset.absolute,dest);}fs.writeFileSync(path.join(packageRoot,'SHA256SUMS'),manifest);
  const disposal='}finally{if(scratch)scratch.width=scratch.height=1}',hold='}finally{if(scratch){const pixels=scratch.width*scratch.height,total=(window.__diagnosticHeldScratchPixels||0)+pixels;if(total>100000000){scratch.width=scratch.height=1;throw Error("Diagnostic retained scratch limit exceeded")}window.__diagnosticHeldScratchPixels=total;(window.__diagnosticHeldScratch||(window.__diagnosticHeldScratch=[])).push(scratch)}}';
  const heldSource=replaceOnce(source,disposal,hold,'existing lifetime hold');fs.writeFileSync(path.join(packageRoot,'pdf-workspace.js'),heldSource);
  let copied=replaceOnce(originalRunner,"const repo=path.resolve(__dirname,'..'),root=", "const repo=path.resolve(process.env.BILGE_DIAGNOSTIC_REPO),root=",'copied runner repository');
  copied=replaceOnce(copied,'  window.__inkCallGroups=callGroups;window.__captureInkCalls=true;',`  const stages=(${installInkStageObserver.toString()})(id,matrix,(${stageRules.toString()})());\n  window.__inkCallGroups=callGroups;window.__captureInkCalls=true;`,'metadata observer');
  copied=replaceOnce(copied,'    const info=selected.get(stroke),before=current;','    stages.noteStroke(stroke,target,allStrokes.get(stroke));\n    const info=selected.get(stroke),before=current;','synthetic row identity');
  copied=replaceOnce(copied,'for(const name of Object.keys(native))proto[name]=native[name];return{limit,dropped,entries,callGroups,callCount,droppedCalls,provenance:', 'for(const name of Object.keys(native))proto[name]=native[name];stages.finish();return{limit,dropped,entries,callGroups,callCount,droppedCalls,provenance:','restore observers');
  copied=replaceOnce(copied,'      const visibleInk=JSON.stringify(s.visible.map',"      const stageAudit=label==='media undo'?window.__captureInkStageAudit(a,b,s,surface,{alphaMax,compositedMax,compositedMeanForeground:compositedSum/(3*foregroundPixels),compositedOver16,foregroundPixels}):undefined;\n      const visibleInk=JSON.stringify(s.visible.map",'existing audit readback samples');
  copied=replaceOnce(copied,'reference.width=reference.height=1;return{warmCalls,unequal,','reference.width=reference.height=1;return{stageAudit,warmCalls,unequal,','attach original samples');
  copied=replaceOnce(copied,"const undo=await audit('media undo');","const undo=await audit('media undo');\n    diagnostic.stages=await p.evaluate(()=>window.__readInkStages());",'post-audit pre-cold localization');
  const runnerCopy=path.join(out,'runner.cjs');fs.writeFileSync(runnerCopy,copied);
  const fixture={diagnosticOnly:true,releaseEligible:false,packageRoot,runnerCopy,canonicalRunnerSha256:RUNNER_SHA,copiedRunnerSha256:sha(copied),baselineSourceSha256:SOURCE_SHA,heldSourceSha256:sha(heldSource),manifestSha256:MANIFEST_SHA,manifestMatchesSource:false,sourceDifference:'Only the existing bounded scratch-hold intervention.',runnerDifferences:['Repository path for ignored copy','Metadata-only mutation/copy references and row identities','Samples from existing audit arrays','Post-PNG/pre-cold stage reads','Observer restoration'],limits:report.limits};
  fs.writeFileSync(path.join(out,'fixture.json'),JSON.stringify(fixture,null,2));report.fixture=fixture;
  const syntax=cp.spawnSync(process.execPath,['--check',runnerCopy],{encoding:'utf8'});assert.equal(syntax.status,0,syntax.stderr||'Copied runner syntax');
  const tag='stages-'+stamp,args=[runnerCopy,'--engine=webkit','--dpr=2','--case=warm ink',`--tag=${tag}`];
  const child=cp.spawnSync(process.execPath,args,{cwd:repo,env:{...process.env,BILGE_TEST_ROOT:packageRoot,BILGE_DIAGNOSTIC_REPO:repo},encoding:'utf8',timeout:180000,maxBuffer:8*1024*1024});
  fs.writeFileSync(path.join(out,'runner.log'),(child.stdout||'')+(child.stderr||''));
  const evidence=path.join(repo,'outputs/slide-flow','dpr-2-'+tag),summaryFile=path.join(evidence,'report-webkit-warm-ink.json'),parityFile=path.join(evidence,'webkit-ink-parity.json'),diagnosticFile=path.join(evidence,'webkit-ink-surface-diagnostic.json');
  const summary=fs.existsSync(summaryFile)?JSON.parse(fs.readFileSync(summaryFile)):null,parity=fs.existsSync(parityFile)?JSON.parse(fs.readFileSync(parityFile)):null,diagnostic=fs.existsSync(diagnosticFile)?JSON.parse(fs.readFileSync(diagnosticFile)):null;
  report.originalOutcome={exitCode:child.status,signal:child.signal,error:child.error?String(child.error):null,passed:summary?.passed,failed:summary?.failed,drift:summary?.drift,originalMediaUndo:parity?.find(x=>x.label==='media undo')};
  report.evidence={summaryFile,parityFile,diagnosticFile,summarySha256:summary?sha(fs.readFileSync(summaryFile)):null,diagnosticSha256:diagnostic?sha(fs.readFileSync(diagnosticFile)):null};
  report.stages=diagnostic?.stages;
  assert.ok(summary&&[0,1].includes(child.status),'Original target runner completed');assert.equal(summary.passed+summary.failed,1,'Exactly one original case');assert.deepEqual(summary.drift,[],'Hold package unchanged during experiment');assert.equal(summary.source['/pdf-workspace.js'],fixture.heldSourceSha256,'Served exact held source');
  assert.ok(report.originalOutcome.originalMediaUndo&&Number.isFinite(report.originalOutcome.originalMediaUndo.alphaMax),'Original audit reached');assert.ok(report.stages,'Post-audit localization reached');
  assert.equal(sha(fs.readFileSync(canonical)),RUNNER_SHA,'Canonical runner unchanged');assert.equal(sha(fs.readFileSync(path.join(release,'SHA256SUMS'))),MANIFEST_SHA,'Canonical manifest unchanged');
  for(const asset of assets)assert.equal(sha(fs.readFileSync(asset.absolute)),asset.hash,'Original release asset unchanged '+asset.name);
  report.status=report.stages.status;
}catch(error){report.error=String(error.stack||error);process.exitCode=1;}
finally{report.completedAt=new Date().toISOString();const filename=path.join(out,'results.json');fs.writeFileSync(filename,JSON.stringify(report,null,2));console.log(JSON.stringify({diagnosticOnly:true,releaseEligible:false,status:report.status,report:filename,error:report.error||null}));}
