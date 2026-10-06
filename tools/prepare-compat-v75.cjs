'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const repo=path.resolve(__dirname,'..'),out=path.join(repo,'outputs/pptx-v76-release/v75-baseline');
const source='d4f64734bcb92f22024643a5c610cab94d80b568';
fs.mkdirSync(out,{recursive:true});
const temp=fs.mkdtempSync(path.join(out,'source-')),archive=path.join(temp,'source.tar');
const run=(cmd,args,cwd=repo)=>execFileSync(cmd,args,{cwd,stdio:'inherit',windowsHide:true});
run('git',['archive',source,'work/bilge-defter-test','work/build-invited.cjs','-o',archive]);
run('tar',['-xf',archive,'-C',temp]);
run(process.execPath,[path.join(temp,'work/build-invited.cjs')],temp);
const built=path.join(temp,'work/bilge-defter-invited-v75'),dest=path.join(repo,'work/bilge-defter-invited-v75');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const sums=fs.readFileSync(path.join(built,'SHA256SUMS'));
for(const line of sums.toString().trim().split('\n')){
  const [digest,name]=line.split('  ');assert(!name.includes('..')&&!path.isAbsolute(name));
  const bytes=fs.readFileSync(path.join(built,name));assert.equal(sha(bytes),digest);
  const target=path.join(dest,name);
  if(fs.existsSync(target))assert.equal(sha(fs.readFileSync(target)),digest,'Refuse modified v75 baseline: '+name);
  else{fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes)}
}
fs.writeFileSync(path.join(dest,'SHA256SUMS'),sums);
console.log(JSON.stringify({version:'v75',source,manifestSha256:sha(sums),liveDeployment:false}));
