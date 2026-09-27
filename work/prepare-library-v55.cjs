'use strict';
// Immutable v54 baseline; never publish unrelated development/PDF v53 work.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('node:assert/strict');
const base=path.join(__dirname,'bilge-defter-invited-v54'),dest=path.join(__dirname,'bilge-defter-invited-v55'),src=path.join(__dirname,'bilge-defter-test'),out=path.join(__dirname,'../outputs/v55');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const baseline=fs.readFileSync(path.join(base,'SHA256SUMS'));
assert.equal(sha(baseline),'be5f789bc33c6d57c443c4c3d77642a31a15c4274212f589e37dfdacbb42b740');
fs.mkdirSync(dest,{recursive:true});fs.mkdirSync(out,{recursive:true});
const names=baseline.toString().trim().split('\n').map(line=>{const [digest,name]=line.split(/  /);assert(!name.includes('..')&&!path.isAbsolute(name));assert.equal(sha(fs.readFileSync(path.join(base,name))),digest);return name});
for(const name of names){fs.mkdirSync(path.dirname(path.join(dest,name)),{recursive:true});fs.copyFileSync(path.join(base,name),path.join(dest,name));}
const overlay=['dictionary-workspace.js','ui-v2/bilge-defter-ui.js','ui-v2/ui-v2-bridge.js'];
for(const name of overlay)fs.copyFileSync(path.join(src,name),path.join(dest,name));
let html=fs.readFileSync(path.join(dest,'index.html'),'utf8');assert(html.includes('badge">v54'));
html=html.replace('<span class="badge">v54</span>','<span class="badge">v55</span>').replace("appVersion:'v54'","appVersion:'v55'");fs.writeFileSync(path.join(dest,'index.html'),html);
const sw=fs.readFileSync(path.join(dest,'sw.js'),'utf8');assert(sw.includes("VERSION='v54'"));fs.writeFileSync(path.join(dest,'sw.js'),sw.replace("VERSION='v54'","VERSION='v55'"));
fs.writeFileSync(path.join(dest,'release.json'),JSON.stringify({version:'v55'}));
const manifest=JSON.parse(fs.readFileSync(path.join(dest,'offline-assets.json')));manifest.version='v55';
for(const f of manifest.files)f.sha256=sha(fs.readFileSync(path.join(dest,f.path)));
fs.writeFileSync(path.join(dest,'offline-assets.json'),JSON.stringify(manifest));
const changed=[...overlay,'index.html','sw.js','release.json','offline-assets.json'];
for(const name of names)if(!changed.includes(name))assert.equal(sha(fs.readFileSync(path.join(dest,name))),sha(fs.readFileSync(path.join(base,name))),name);
fs.writeFileSync(path.join(dest,'SHA256SUMS'),names.map(name=>sha(fs.readFileSync(path.join(dest,name)))+'  '+name).join('\n')+'\n');
assert.equal(names.length,237);assert.equal(manifest.files.length,234);
const receipt={version:'v55',base:'v54',packageHash:sha(fs.readFileSync(path.join(dest,'SHA256SUMS'))),changed,files:237,offlineAssets:234,unchanged:230,pdfFeatureAdded:false};
fs.writeFileSync(path.join(out,'build-receipt.json'),JSON.stringify(receipt,null,2));
const library=fs.readFileSync(path.join(__dirname,'library-pilot/app.js'));
fs.writeFileSync(path.join(out,'library-app.js'),library);fs.writeFileSync(path.join(out,'extra-receipt.json'),JSON.stringify({libraryHash:sha(library)},null,2));
console.log(JSON.stringify(receipt));
