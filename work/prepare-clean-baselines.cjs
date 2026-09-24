// Reconstruct the actual historical v51 from its small byte-exact delta.
// Shared assets come from the committed current source; every byte is verified.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('node:assert/strict');
const src=path.join(__dirname,'bilge-defter-invited-v52'),dest=path.join(__dirname,'bilge-defter-invited-v51'),delta=path.resolve(__dirname,'../fixtures/v51-delta');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const sums=fs.readFileSync(path.join(delta,'SHA256SUMS'));
assert.equal(hash(sums),'d8dced929378581fa199786342ee21dcb3a7e26dd9454083c8564ccda8386fb4');
for(const line of sums.toString().trim().split('\n')){
 const [digest,name]=line.split(/  /);assert.ok(!name.includes('..')&&!path.isAbsolute(name));
 const file=fs.existsSync(path.join(delta,name))?path.join(delta,name):path.join(src,name),bytes=fs.readFileSync(file);assert.equal(hash(bytes),digest,name);
 const target=path.join(dest,name);if(fs.existsSync(target)){assert.equal(hash(fs.readFileSync(target)),digest,'Refuse overwrite '+name);continue}
 fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);
}
fs.writeFileSync(path.join(dest,'SHA256SUMS'),sums);console.log('PASS Exact historical v51 reconstructed and verified');
