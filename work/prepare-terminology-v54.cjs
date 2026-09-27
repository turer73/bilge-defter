// Reproducible dictionary-only release: never publish the PDF v53 development tree.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('node:assert/strict'),{spawnSync}=require('child_process');
const repo=path.resolve(__dirname,'..'),base=path.join(__dirname,'bilge-defter-invited-v52'),dest=path.join(__dirname,'bilge-defter-invited-v54'),out=path.join(repo,'outputs/v54'),src=path.join(__dirname,'bilge-defter-test');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function run(cmd,args){const r=spawnSync(cmd,args,{cwd:repo,stdio:'inherit',windowsHide:true});assert.equal(r.status,0,cmd)}
run(process.execPath,[path.join(__dirname,'prepare-v52-baseline.cjs')]);fs.mkdirSync(dest,{recursive:true});fs.mkdirSync(out,{recursive:true});
assert.equal(hash(fs.readFileSync(path.join(base,'SHA256SUMS'))),'ac4216857e0fa5a04c31e6d10394c28d68cb87e594b40870a6fbb67582b956f9');
const names=fs.readFileSync(path.join(base,'SHA256SUMS'),'utf8').trim().split('\n').map(line=>{const [digest,name]=line.split(/  /);assert.ok(!name.includes('..')&&!path.isAbsolute(name));assert.equal(hash(fs.readFileSync(path.join(base,name))),digest);return name});
const changed=new Set(['index.html','sw.js','release.json','offline-assets.json','dictionary-workspace.js']);
const additions=['terminology-data.js','terminology.js'];
// The generated destination is task-owned; every published path comes from verified receipts.
for(const name of names){const target=path.join(dest,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(base,name),target)}
for(const name of ['dictionary-workspace.js',...additions])fs.copyFileSync(path.join(src,name),path.join(dest,name));
let html=fs.readFileSync(path.join(dest,'index.html'),'utf8');assert.ok(!html.includes('pdfToolsOpen'));assert.ok(!html.includes('terminology.js'));
assert.ok(html.includes('<script src="dictionary-data.js"></script>'));
html=html.replace('<script src="dictionary-data.js"></script>','<script src="dictionary-data.js"></script>\n<script src="terminology-data.js"></script>\n<script src="terminology.js"></script>').replace('<span class="badge">v52</span>','<span class="badge">v54</span>').replace("appVersion:'v52'","appVersion:'v54'");
assert.ok(html.includes('badge">v54'));fs.writeFileSync(path.join(dest,'index.html'),html);
let sw=fs.readFileSync(path.join(dest,'sw.js'),'utf8');assert.ok(sw.includes("VERSION='v52'"));fs.writeFileSync(path.join(dest,'sw.js'),sw.replace("VERSION='v52'","VERSION='v54'"));
fs.writeFileSync(path.join(dest,'release.json'),JSON.stringify({version:'v54'}));
const manifest=JSON.parse(fs.readFileSync(path.join(dest,'offline-assets.json'),'utf8'));manifest.version='v54';
for(const name of additions){assert.ok(!manifest.files.some(f=>f.path===name));manifest.files.push({path:name})}
for(const f of manifest.files)f.sha256=hash(fs.readFileSync(path.join(dest,f.path)));
fs.writeFileSync(path.join(dest,'offline-assets.json'),JSON.stringify(manifest));
const all=[...names,...additions].sort();assert.equal(all.length,237);assert.equal(manifest.files.length,234);
for(const name of names)if(!changed.has(name))assert.equal(hash(fs.readFileSync(path.join(dest,name))),hash(fs.readFileSync(path.join(base,name))),name+' drifted');
assert.equal(hash(fs.readFileSync(path.join(dest,'pdf-workspace.js'))),hash(fs.readFileSync(path.join(base,'pdf-workspace.js'))));
fs.writeFileSync(path.join(dest,'SHA256SUMS'),all.map(name=>hash(fs.readFileSync(path.join(dest,name)))+'  '+name).join('\n')+'\n');
const configResult=spawnSync('git',['show','d426df9cfbb8a97955183bdc606b586b191c3edf:work/classroom-nginx.conf'],{cwd:repo,windowsHide:true});assert.equal(configResult.status,0);
let conf=configResult.stdout.toString('utf8');assert.equal(hash(Buffer.from(conf)),'505cd65af68387806b9a70121117e2bd71183e81d2952b403d5de58cbe55771a');
const marker='dictionary-data\\.js|';assert.ok(conf.includes(marker));conf=conf.replace(marker,marker+'terminology-data\\.js|terminology\\.js|');assert.ok(!conf.includes('pdf-tools/compress'));fs.writeFileSync(path.join(out,'classroom-nginx.conf'),conf);
const receipt={version:'v54',baseCommit:'d426df9cfbb8a97955183bdc606b586b191c3edf',baseVersion:'v52',baseManifestHash:hash(fs.readFileSync(path.join(base,'SHA256SUMS'))),packageHash:hash(fs.readFileSync(path.join(dest,'SHA256SUMS'))),configHash:hash(Buffer.from(conf)),changedExisting:[...changed],added:additions,unchangedFiles:names.length-changed.size,assets:manifest.files.length,files:all.length,pdfFeatureAdded:false,expertReviewed:0};
fs.writeFileSync(path.join(out,'build-receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));
