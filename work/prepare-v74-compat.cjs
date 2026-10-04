'use strict';
// Reproducible reader-only bridge. This does not change or deploy the v75 source.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const repo=path.resolve(__dirname,'..'),out=path.join(repo,'outputs/page-limit-20261005/v74-compat');
const source='d8cc025d9bcc43a08c12654a9aabc6958da9a051'; // Published v73 payload.
fs.mkdirSync(out,{recursive:true});
const temp=fs.mkdtempSync(path.join(out,'source-')),archive=path.join(temp,'source.tar');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function run(cmd,args,cwd=repo){const result=spawnSync(cmd,args,{cwd,stdio:'inherit',windowsHide:true});assert.equal(result.status,0,cmd)}
function replaceOnce(file,from,to){const text=fs.readFileSync(file,'utf8');assert.equal(text.split(from).length,2,'Pinned source changed: '+file);fs.writeFileSync(file,text.replace(from,to))}
run('git',['archive',source,'work/bilge-defter-test','work/build-invited.cjs','-o',archive]);
run('tar',['-xf',archive,'-C',temp]);
run(process.execPath,[path.join(temp,'work/build-invited.cjs')],temp);
const old=path.join(temp,'work/bilge-defter-invited-v73');
replaceOnce(path.join(temp,'work/bilge-defter-test/pdf-workspace.js'),'b.total>50','b.total>100');
replaceOnce(path.join(temp,'work/bilge-defter-test/sw.js'),"VERSION='v73'","VERSION='v74'");
run(process.execPath,[path.join(temp,'work/build-invited.cjs')],temp);
const root=path.join(temp,'work/bilge-defter-invited-v74'),dest=path.join(__dirname,'bilge-defter-invited-v74');
const sums=fs.readFileSync(path.join(root,'SHA256SUMS')),changed=[];
for(const line of sums.toString().trim().split('\n')){
  const [digest,name]=line.split('  ');assert(!name.includes('..')&&!path.isAbsolute(name));
  const bytes=fs.readFileSync(path.join(root,name));assert.equal(sha(bytes),digest);
  if(sha(fs.readFileSync(path.join(old,name)))!==digest)changed.push(name);
  const target=path.join(dest,name);
  if(fs.existsSync(target))assert.equal(sha(fs.readFileSync(target)),digest,'Refuse different bridge overwrite: '+name);
  else{fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes)}
}
assert.deepEqual(changed.sort(),['index.html','offline-assets.json','pdf-workspace.js','release.json','sw.js'].sort());
assert.equal(fs.readFileSync(path.join(root,'pdf-workspace.js'),'utf8'),fs.readFileSync(path.join(old,'pdf-workspace.js'),'utf8').replace('b.total>50','b.total>100'));
fs.writeFileSync(path.join(dest,'SHA256SUMS'),sums);
const proof={source,version:'v74',readerOnly:true,maxSavedPages:100,maxImportedPages:50,apiUnchanged:'v73',manifestSha256:sha(sums),changed,liveDeployment:false};
fs.writeFileSync(path.join(out,'build-proof.json'),JSON.stringify(proof,null,2)+'\n');
console.log(JSON.stringify(proof));
