const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const readJson=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const src=path.join(__dirname,'bilge-defter-test'),version=fs.readFileSync(path.join(src,'sw.js'),'utf8').replace(/^\uFEFF/,'').match(/VERSION='(v\d+)'/)[1],dest=path.join(__dirname,'bilge-defter-invited-'+version);
// Derive the small, closed runtime allowlist, never ship test/source fixtures.
const nativeSource=path.join(__dirname,'pptx-pilot'),nativeAssets=['host.js','host.css','model.js','store.js','renderer-bridge.js','renderer-frame.html'];
const {execFileSync}=require('node:child_process');
execFileSync(process.execPath,[path.join(__dirname,'../tools/prepare-pptx-pilot.cjs'),'--check'],{stdio:'inherit',windowsHide:true});
fs.mkdirSync(path.join(src,'pptx'),{recursive:true});
for(const name of nativeAssets)fs.copyFileSync(path.join(nativeSource,name),path.join(src,'pptx',name));
const notices=['LICENSE','THIRD_PARTY_NOTICES.md','licenses/mtx-decompressor-MPL-2.0.txt','licenses/ECMA-text-copyright-notice.txt'];
fs.writeFileSync(path.join(src,'pptx/NOTICES.txt'),notices.map(name=>`\n===== ${name} =====\n`+fs.readFileSync(path.join(nativeSource,'vendor',name),'utf8').replace(/\r\n/g,'\n')).join('\n'));
fs.mkdirSync(dest,{recursive:true});
const indexFile=path.join(src,'index.html');
let html=fs.readFileSync(indexFile,'utf8').replace(/^\uFEFF/,'');
const prevBadge=html.match(/<span class="badge">(v\d+)<\/span>/)?.[1],prevApp=html.match(/APP_VERSION='(v\d+)'/)?.[1]??html.match(/appVersion:'(v\d+)'/)?.[1];
if(prevBadge!==version)html=html.replace(/<span class="badge">v\d+<\/span>/,`<span class="badge">${version}</span>`);
if(prevApp!==version)html=html.replace(/appVersion:'v\d+'/,`appVersion:'${version}'`).replace(/APP_VERSION='v\d+'/,`APP_VERSION='${version}'`);
if(html!==fs.readFileSync(indexFile,'utf8').replace(/^\uFEFF/,''))fs.writeFileSync(indexFile,html);
if(prevBadge!==version||prevApp!==version)console.log(`index.html surum esitlendi: badge ${prevBadge}->${version}, appVersion ${prevApp}->${version}`);
// release.json must be current before hashing, otherwise the offline manifest would
// certify the previous version's bytes and every install would fail integrity checks.
fs.writeFileSync(path.join(src,'release.json'),JSON.stringify({version}));
const manifest=readJson(path.join(src,'offline-assets.json'));manifest.version=version;
for(const name of ['pptx-workspace.js',...nativeAssets.map(name=>'pptx/'+name),'pptx/NOTICES.txt'])if(!manifest.files.some(f=>f.path===name))manifest.files.push({path:name});
for(const name of ['icons/brand-horizontal-v51.png','icons/brand-stacked-v51.png','icons/brand-app-v51.png','icons/brand-mono-v51.png'])if(!manifest.files.some(f=>f.path===name))manifest.files.push({path:name});
// Auth return files must be deployed and hashed, but never installed offline.
manifest.files=manifest.files.filter(f=>!['auth-continue.html','auth-continue.js'].includes(f.path));
for(const name of ['account-workspace.js','account.css'])if(!manifest.files.some(f=>f.path===name))manifest.files.push({path:name});
for(const name of ['media-workspace.js','planner-workspace.js','ui-workspace.js','ui.css','sync-workspace.js','dictionary-data.js','dictionary-workspace.js','ocr-workspace.js','button-theme.css','button-theme.js','button-theme-workspace.js','ui-v2/bilge-defter-ui.js','ui-v2/mount.js','ui-v2/ui-v2-bridge.js'])if(!manifest.files.some(f=>f.path===name))manifest.files.push({path:name});
const hash=(dir,file)=>crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,file))).digest('hex');
for(const name of ['terminology-data.js','terminology.js','save-worker.js'])if(!manifest.files.some(f=>f.path===name))manifest.files.push({path:name});
for(const f of manifest.files)f.sha256=hash(src,f.path);
fs.writeFileSync(path.join(src,'offline-assets.json'),JSON.stringify(manifest));
function walk(dir,prefix=''){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name),prefix+e.name+'/'):[prefix+e.name])}
fs.writeFileSync(path.join(src,'SHA256SUMS'),walk(src).filter(f=>f!=='SHA256SUMS').sort().map(f=>hash(src,f)+'  '+f).join('\n')+'\n');
const files=[...manifest.files.map(x=>x.path),'sw.js','release.json','offline-assets.json','THIRD_PARTY.md','auth-continue.html','auth-continue.js'];
for(const file of files){if(file.includes('..')||path.isAbsolute(file))throw Error('Unsafe path');const out=path.join(dest,file);fs.mkdirSync(path.dirname(out),{recursive:true});fs.copyFileSync(path.join(src,file),out)}
fs.writeFileSync(path.join(dest,'SHA256SUMS'),[...new Set(files)].sort().map(f=>`${hash(dest,f)}  ${f}`).join('\n')+'\n');
console.log(JSON.stringify({version,assets:manifest.files.length,manifestHash:hash(dest,'SHA256SUMS'),liveDeployment:false}));
