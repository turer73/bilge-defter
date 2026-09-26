// Restore immutable deployed v52 bytes from the recorded Git object, not v53 sources.
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),crypto=require('crypto'),{spawnSync}=require('child_process');
const repo=path.resolve(__dirname,'..'),out=path.join(repo,'outputs/v53'),dest=path.join(__dirname,'bilge-defter-invited-v52');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
fs.mkdirSync(out,{recursive:true});const temp=fs.mkdtempSync(path.join(out,'v52-source-')),archive=path.join(temp,'baseline.tar');
function run(cmd,args,cwd=repo){const r=spawnSync(cmd,args,{cwd,stdio:'inherit',windowsHide:true});assert.equal(r.status,0,cmd+' failed; full Git history including d426df9 is required')}
run('git',['archive','--format=tar','--output='+archive,'d426df9cfbb8a97955183bdc606b586b191c3edf','work/bilge-defter-test','work/build-invited.cjs']);
run('tar',['-xf',archive,'-C',temp]);run(process.execPath,[path.join(temp,'work/build-invited.cjs')],temp);
const src=path.join(temp,'work/bilge-defter-invited-v52'),sums=fs.readFileSync(path.join(src,'SHA256SUMS'));
assert.equal(hash(sums),'ac4216857e0fa5a04c31e6d10394c28d68cb87e594b40870a6fbb67582b956f9');
for(const line of sums.toString().trim().split('\n')){
 const [digest,name]=line.split(/  /);assert.ok(!name.includes('..')&&!path.isAbsolute(name));const bytes=fs.readFileSync(path.join(src,name));assert.equal(hash(bytes),digest);
 const target=path.join(dest,name);if(fs.existsSync(target)){assert.equal(hash(fs.readFileSync(target)),digest,'Refuse overwrite '+name);continue}
 fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);
}
if(fs.existsSync(path.join(dest,'SHA256SUMS')))assert.equal(hash(fs.readFileSync(path.join(dest,'SHA256SUMS'))),hash(sums));
else fs.writeFileSync(path.join(dest,'SHA256SUMS'),sums);
console.log('PASS Exact deployed v52 reconstructed and verified');
