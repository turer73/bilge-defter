'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('node:assert/strict'),{spawnSync}=require('child_process');
const repo=path.resolve(__dirname,'..'),out=path.join(repo,'outputs/v56-baseline');fs.mkdirSync(out,{recursive:true});
const temp=fs.mkdtempSync(path.join(out,'source-')),archive=path.join(temp,'source.tar');
function run(cmd,args,cwd=repo){const r=spawnSync(cmd,args,{cwd,stdio:'inherit',windowsHide:true});assert.equal(r.status,0,cmd);}
run('git',['archive','9da998b81cbd402c1f4ea45a0cf28dae2b5f4b10','work/bilge-defter-test','work/build-invited.cjs','-o',archive]);
run('tar',['-xf',archive,'-C',temp]);run(process.execPath,[path.join(temp,'work/build-invited.cjs')],temp);
const root=path.join(temp,'work/bilge-defter-invited-v56'),dest=path.join(__dirname,'bilge-defter-invited-v56'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const sums=fs.readFileSync(path.join(root,'SHA256SUMS'));assert.equal(sha(sums),'1299aad3540395191cec3b43f2cbaf652b0c815f0f6f9a9814f2ce170b8dc25e');
for(const line of sums.toString().trim().split('\n')){const [digest,name]=line.split('  ');assert(!name.includes('..'));const bytes=fs.readFileSync(path.join(root,name));assert.equal(sha(bytes),digest);const target=path.join(dest,name);if(fs.existsSync(target))assert.equal(sha(fs.readFileSync(target)),digest,'Refuse baseline overwrite: '+name);else{fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);}}
fs.writeFileSync(path.join(dest,'SHA256SUMS'),sums);console.log('PASS pinned published v56 baseline reconstructed from Git');
