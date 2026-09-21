const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const readJson=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const src=path.join(__dirname,'bilge-defter-test'),version=fs.readFileSync(path.join(src,'sw.js'),'utf8').replace(/^\uFEFF/,'').match(/VERSION='(v\d+)'/)[1],dest=path.join(__dirname,'bilge-defter-invited-'+version);
fs.mkdirSync(dest,{recursive:true});
const indexFile=path.join(src,'index.html');
let html=fs.readFileSync(indexFile,'utf8').replace(/^\uFEFF/,'');
const prevBadge=html.match(/<span class="badge">(v\d+)<\/span>/)?.[1],prevApp=html.match(/appVersion:'(v\d+)'/)?.[1];
if(prevBadge!==version)html=html.replace(/<span class="badge">v\d+<\/span>/,`<span class="badge">${version}</span>`);
if(prevApp!==version)html=html.replace(/appVersion:'v\d+'/,`appVersion:'${version}'`);
if(html!==fs.readFileSync(indexFile,'utf8').replace(/^\uFEFF/,''))fs.writeFileSync(indexFile,html);
if(prevBadge!==version||prevApp!==version)console.log(`index.html surum esitlendi: badge ${prevBadge}->${version}, appVersion ${prevApp}->${version}`);
const manifest=readJson(path.join(src,'offline-assets.json'));manifest.version=version;
for(const name of ['media-workspace.js','planner-workspace.js','ui-workspace.js','ui.css'])if(!manifest.files.some(f=>f.path===name))manifest.files.push({path:name});
const hash=(dir,file)=>crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,file))).digest('hex');
for(const f of manifest.files)f.sha256=hash(src,f.path);
fs.writeFileSync(path.join(src,'offline-assets.json'),JSON.stringify(manifest));
fs.writeFileSync(path.join(src,'release.json'),JSON.stringify({version}));
function walk(dir,prefix=''){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name),prefix+e.name+'/'):[prefix+e.name])}
fs.writeFileSync(path.join(src,'SHA256SUMS'),walk(src).filter(f=>f!=='SHA256SUMS').sort().map(f=>hash(src,f)+'  '+f).join('\n')+'\n');
const files=[...manifest.files.map(x=>x.path),'sw.js','release.json','offline-assets.json','THIRD_PARTY.md'];
for(const file of files){if(file.includes('..')||path.isAbsolute(file))throw Error('Unsafe path');const out=path.join(dest,file);fs.mkdirSync(path.dirname(out),{recursive:true});fs.copyFileSync(path.join(src,file),out)}
fs.writeFileSync(path.join(dest,'SHA256SUMS'),[...new Set(files)].sort().map(f=>`${hash(dest,f)}  ${f}`).join('\n')+'\n');
console.log(JSON.stringify({version,assets:manifest.files.length,manifestHash:hash(dest,'SHA256SUMS'),sameRuntimeForBothAddresses:true}));
