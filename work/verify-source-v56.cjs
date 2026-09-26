'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const repo=path.resolve(__dirname,'..');
const r=spawnSync(process.execPath,[path.join(__dirname,'build-invited.cjs')],{cwd:repo,stdio:'inherit',windowsHide:true});
assert.equal(r.status,0);
const root=path.join(__dirname,'bilge-defter-invited-v56'),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
assert.equal(hash(fs.readFileSync(path.join(root,'SHA256SUMS'))),'1299aad3540395191cec3b43f2cbaf652b0c815f0f6f9a9814f2ce170b8dc25e');
for(const line of fs.readFileSync(path.join(root,'SHA256SUMS'),'utf8').trim().split('\n')){const [digest,name]=line.split('  ');assert.equal(hash(fs.readFileSync(path.join(root,name))),digest,name);}
console.log('PASS: clean v56 source reproduces all 237 published files; no PDF candidate mixed in.');
