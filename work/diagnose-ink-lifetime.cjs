'use strict';
// Diagnostic only: preserve the release package and run the ORIGINAL acceptance
// runner against two ignored, explicitly non-release fixture copies.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),assert=require('node:assert/strict');
const repo=path.resolve(__dirname,'..'),release=path.join(repo,'work/bilge-defter-invited-v78'),runner=path.join(__dirname,'verify-slide-flow.cjs');
const SOURCE_SHA='3b3fcdedfd40ba4656b7c8dca2ece1eeb605f54229326b3d91b03351cb11007e';
const MANIFEST_SHA='6f172d47680d93b9d39e316a1f1512ee0e0c2e4645b95af9aab33890b34890f9';
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const stamp=new Date().toISOString().replace(/[-:.TZ]/g,''),out=path.join(repo,'outputs/ink-lifetime-diagnostic',stamp);
const report={diagnosticOnly:true,releaseEligible:false,startedAt:new Date().toISOString(),baselineSourceSha256:SOURCE_SHA,baselineManifestSha256:MANIFEST_SHA,runnerSha256:sha(fs.readFileSync(runner)),variants:[],limits:{retainedScratchPixels:100000000},boundaries:[
  'The original mandatory CI acceptance remains unchanged. Variant outcomes never replace it.',
  'Only the hold fixture changes source bytes. Its unchanged release manifest is deliberately invalid for publishing.',
  'No production data or private archive is opened. The existing runner uses synthetic accounts and blocks external network.',
  'Holding scratch canvases can use up to 400 MB raw RGBA plus ordinary browser memory. Test-context closure releases them; this is not a production solution.'
]};
fs.mkdirSync(out,{recursive:true});
try{
  const manifest=fs.readFileSync(path.join(release,'SHA256SUMS')),source=fs.readFileSync(path.join(release,'pdf-workspace.js'),'utf8');
  assert.equal(sha(manifest),MANIFEST_SHA,'Exact generated release manifest');assert.equal(sha(source),SOURCE_SHA,'Exact generated application source');
  const assets=manifest.toString('utf8').trim().split(/\r?\n/).map(line=>{
    const match=/^([0-9a-f]{64})  (.+)$/.exec(line);assert.ok(match,'Manifest line');const name=match[2],absolute=path.resolve(release,name);
    assert.ok(absolute.startsWith(release+path.sep),'Asset stays inside generated package');assert.equal(sha(fs.readFileSync(absolute)),match[1],'Unchanged asset '+name);return{name,absolute};
  });
  const before='}finally{if(scratch)scratch.width=scratch.height=1}';
  assert.equal(source.split(before).length-1,1,'Single guarded scratch disposal site');
  const hold='}finally{if(scratch){const pixels=scratch.width*scratch.height,total=(window.__diagnosticHeldScratchPixels||0)+pixels;if(total>100000000){scratch.width=scratch.height=1;throw Error("Diagnostic retained scratch limit exceeded")}window.__diagnosticHeldScratchPixels=total;(window.__diagnosticHeldScratch||(window.__diagnosticHeldScratch=[])).push(scratch)}}';
  for(const name of ['native','hold']){
    const directory=path.join(out,name),packageRoot=path.join(directory,'package');fs.mkdirSync(packageRoot,{recursive:true});
    for(const asset of assets){const destination=path.join(packageRoot,asset.name);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.copyFileSync(asset.absolute,destination);}
    fs.writeFileSync(path.join(packageRoot,'SHA256SUMS'),manifest);
    const variantSource=name==='hold'?source.replace(before,hold):source;fs.writeFileSync(path.join(packageRoot,'pdf-workspace.js'),variantSource);
    const tag=`lifetime-${stamp}-${name}`,metadata={name,diagnosticOnly:true,releaseEligible:false,sourceSha256:sha(variantSource),baselineSourceSha256:SOURCE_SHA,manifestSha256:MANIFEST_SHA,manifestMatchesSource:name==='native',soleSourceDifference:name==='hold'?'Do not resize scratch; retain in bounded diagnostic array until context closes.':'None',tag,packageRoot};
    fs.writeFileSync(path.join(directory,'fixture.json'),JSON.stringify(metadata,null,2));
    const args=[runner,'--engine=webkit','--dpr=2','--case=warm ink',`--tag=${tag}`];
    console.log(`DIAGNOSTIC ${name}: ${metadata.sourceSha256}`);
    const child=cp.spawnSync(process.execPath,args,{cwd:repo,env:{...process.env,BILGE_TEST_ROOT:packageRoot},encoding:'utf8',timeout:180000,maxBuffer:8*1024*1024});
    fs.writeFileSync(path.join(directory,'runner.log'),(child.stdout||'')+(child.stderr||''));
    const resultDirectory=path.join(repo,'outputs/slide-flow',`dpr-2-${tag}`),resultFile=path.join(resultDirectory,'report-webkit-warm-ink.json');
    const summary=fs.existsSync(resultFile)?JSON.parse(fs.readFileSync(resultFile)):null,parityFile=path.join(resultDirectory,'webkit-ink-parity.json');
    const parity=fs.existsSync(parityFile)?JSON.parse(fs.readFileSync(parityFile)):null;
    const result={...metadata,exitCode:child.status,signal:child.signal,error:child.error?String(child.error):null,report:resultFile,reportSha256:summary?sha(fs.readFileSync(resultFile)):null,passed:summary?.passed,failed:summary?.failed,drift:summary?.drift,originalMediaUndo:parity?.find(x=>x.label==='media undo')};
    report.variants.push(result);console.log(JSON.stringify({name,exitCode:child.status,passed:result.passed,failed:result.failed,alphaMax:result.originalMediaUndo?.alphaMax,drift:result.drift}));
    assert.ok(summary&&[0,1].includes(child.status),'Runner completed with a normal acceptance outcome');assert.deepEqual(summary.drift,[],'Diagnostic fixture bytes stay fixed while the runner executes');assert.equal(summary.source['/pdf-workspace.js'],metadata.sourceSha256,'Runner actually served this variant');
    assert.equal(summary.passed+summary.failed,1,'Exactly the original target case ran');
    assert.ok(result.originalMediaUndo&&Number.isFinite(result.originalMediaUndo.alphaMax),'Original media undo measurement was reached');
  }
}catch(error){report.error=String(error.stack||error);process.exitCode=1;}
finally{
  report.completedAt=new Date().toISOString();const filename=path.join(out,'results.json');fs.writeFileSync(filename,JSON.stringify(report,null,2));console.log(JSON.stringify({diagnosticOnly:true,releaseEligible:false,report:filename,error:report.error||null}));
}
