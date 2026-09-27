'use strict';
// Prepare only. No deployment; never use the mixed development tree as a release.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('node:assert/strict');
const base=path.join(__dirname,'bilge-defter-invited-v55'),dest=path.join(__dirname,'bilge-defter-invited-v56'),out=path.join(__dirname,'../outputs/library-quote');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),read=(dir,name)=>fs.readFileSync(path.join(dir,name));
assert.equal(sha(read(base,'SHA256SUMS')),'aff91996f0b38aeccf2d3689ee5bbbe9602d767991ec3b0f33b209790f356c19');
const names=read(base,'SHA256SUMS').toString().trim().split('\n').map(line=>{const [hash,name]=line.split(/  /);assert(!name.includes('..')&&!path.isAbsolute(name));assert.equal(sha(read(base,name)),hash);return name;});
const media=read(path.join(__dirname,'bilge-defter-test'),'media-workspace.js');
assert(media.toString().replace(/\r/g,'').endsWith(read(base,'media-workspace.js').toString().replace(/\r/g,'').split('\n').slice(1).join('\n')),'Existing media runtime must remain unchanged');
for(const name of names){fs.mkdirSync(path.dirname(path.join(dest,name)),{recursive:true});fs.copyFileSync(path.join(base,name),path.join(dest,name));}
fs.writeFileSync(path.join(dest,'media-workspace.js'),media);
let html=read(base,'index.html').toString();assert(html.includes('badge">v55'));
html=html.replace('<span class="badge">v55</span>','<span class="badge">v56</span>').replace("appVersion:'v55'","appVersion:'v56'");fs.writeFileSync(path.join(dest,'index.html'),html);
const sw=read(base,'sw.js').toString();assert(sw.includes("VERSION='v55'"));fs.writeFileSync(path.join(dest,'sw.js'),sw.replace("VERSION='v55'","VERSION='v56'"));
fs.writeFileSync(path.join(dest,'release.json'),JSON.stringify({version:'v56'}));
const manifest=JSON.parse(read(base,'offline-assets.json'));manifest.version='v56';for(const f of manifest.files)f.sha256=sha(read(dest,f.path));fs.writeFileSync(path.join(dest,'offline-assets.json'),JSON.stringify(manifest));
const changed=['media-workspace.js','index.html','sw.js','release.json','offline-assets.json'];
for(const name of names)if(!changed.includes(name))assert.equal(sha(read(dest,name)),sha(read(base,name)));
fs.writeFileSync(path.join(dest,'SHA256SUMS'),names.map(name=>sha(read(dest,name))+'  '+name).join('\n')+'\n');
fs.mkdirSync(out,{recursive:true});const receipt={base:'v55',candidate:'v56',live:false,files:names.length,offlineAssets:manifest.files.length,changed,unchanged:names.length-changed.length,packageHash:sha(read(dest,'SHA256SUMS')),libraryCode:Object.fromEntries(['textview.py','quote.js','server.py','style.css','package.py'].map(n=>[n,sha(read(path.join(__dirname,'library-pilot'),n))]))};
fs.writeFileSync(path.join(out,'build-receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
