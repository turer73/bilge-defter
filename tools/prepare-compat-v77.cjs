'use strict';
// Reconstruct the actually published v77 bytes without overwriting a local candidate.
// Everything comes from a pinned Git commit; there is no download or live operation.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const repo=path.resolve(__dirname,'..'),out=path.join(repo,'outputs/pptx-v78-release/v77-baseline');
const source='a441a2d3e1cb2fce7afcd592f7ca5d1480fe9e05';
const expectedManifest='faf16c238f8e390c1a87ce4358b3e1eca517fcf7db01614c5e439d8aa73de25e';
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const run=(cmd,args,cwd=repo)=>execFileSync(cmd,args,{cwd,stdio:'inherit',windowsHide:true});
fs.mkdirSync(out,{recursive:true});
const temp=fs.mkdtempSync(path.join(out,'source-')),archive=path.join(temp,'source.tar');
run('git',['archive',source,'work/bilge-defter-test','work/build-invited.cjs','work/pptx-pilot','tools/prepare-pptx-pilot.cjs','-o',archive]);
run('tar',['-xf',archive,'-C',temp]);
run(process.execPath,[path.join(temp,'work/build-invited.cjs')],temp);
const built=path.join(temp,'work/bilge-defter-invited-v77'),dest=path.join(out,'package');
const sums=fs.readFileSync(path.join(built,'SHA256SUMS'));
assert.equal(sha(sums),expectedManifest,'Rebuilt baseline must exactly match published v77 SHA256SUMS');
assert.equal(JSON.parse(fs.readFileSync(path.join(built,'release.json'),'utf8')).version,'v77');
assert.equal(JSON.parse(fs.readFileSync(path.join(built,'offline-assets.json'),'utf8')).version,'v77');
const files=new Map([['SHA256SUMS',sums]]);
for(const line of sums.toString().trim().split('\n')){
  const match=/^([a-f0-9]{64})  ([^\\:]+)$/.exec(line);assert.ok(match,'Invalid manifest line');
  const [,digest,name]=match;assert.ok(!path.isAbsolute(name)&&!name.split('/').some(x=>!x||x==='.'||x==='..'));
  assert.ok(!files.has(name),'Duplicate manifest entry: '+name);
  const bytes=fs.readFileSync(path.join(built,name));assert.equal(sha(bytes),digest,name);files.set(name,bytes);
}
// Complete validation precedes any destination write. A different/extra existing
// baseline is an error, not an excuse to replace a user's directory.
if(fs.existsSync(dest)){
  assert.ok(fs.lstatSync(dest).isDirectory()&&!fs.lstatSync(dest).isSymbolicLink(),'Baseline root must be a real directory');
  const visit=(dir,prefix='')=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const name=prefix+entry.name,target=path.join(dir,entry.name);assert.ok(!entry.isSymbolicLink(),'Baseline symlink');
    if(entry.isDirectory())visit(target,name+'/');
    else{assert.ok(entry.isFile()&&files.has(name),'Unexpected baseline file: '+name);assert.equal(sha(fs.readFileSync(target)),sha(files.get(name)),'Refuse modified v77 baseline: '+name);}
  }};visit(dest);
}
for(const [name,bytes]of files){const target=path.join(dest,name);if(!fs.existsSync(target)){fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);}}
const proof={version:'v77',source,manifestSha256:sha(sums),files:files.size,package:path.relative(repo,dest).replaceAll(path.sep,'/'),liveDeployment:false};
fs.writeFileSync(path.join(out,'build-proof.json'),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
