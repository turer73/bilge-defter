// Run the actual current candidate. Historical suites are reused only where
// their UI contract still applies; no old release can silently count as v50.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),crypto=require('node:crypto'),vm=require('node:vm');
const repo=path.resolve(__dirname,'..'),root=path.join(__dirname,'bilge-defter-invited-v50'),out=path.join(repo,'outputs/v50');fs.mkdirSync(out,{recursive:true});
const python=path.join(repo,'server-candidate/v49/.venv/Scripts/python.exe'),env={...process.env,BILGE_TEST_ROOT:root},results=[];
async function run(name,cmd,args){
 console.log('START '+name);const started=Date.now();
 const r=await new Promise(resolve=>{const p=spawn(cmd,args,{cwd:repo,env,windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';const timer=setTimeout(()=>p.kill(),180000);p.stdout.on('data',b=>stdout+=b);p.stderr.on('data',b=>stderr+=b);p.on('error',e=>stderr+=e.message);p.on('close',code=>{clearTimeout(timer);resolve({code,stdout,stderr})})});
 fs.writeFileSync(path.join(out,name+'.log'),r.stdout+'\n'+r.stderr);results.push({name,exitCode:r.code,passed:name==='backend'?Number(r.stdout.match(/(\d+) passed/)?.[1]||0):(r.stdout.match(/^PASS /gm)||[]).length,durationMs:Date.now()-started});console.log((r.code===0?'PASS ':'FAIL ')+name+' '+results.at(-1).passed);if(r.code!==0)console.log((r.stdout+r.stderr).slice(-1800));
}
// Redirect only screenshot output paths, not assertions or runtime behavior.
function historical(name){const file=path.join(__dirname,name+'.cjs');const code=fs.readFileSync(file,'utf8').replaceAll('outputs/bilge-defter-v49-','outputs/v50/accounts-').replaceAll('outputs/bilge-defter-v48-','outputs/v50/ui-');return ['-e',`const Module=require('node:module');const m=new Module(${JSON.stringify(file)});m.filename=${JSON.stringify(file)};m.paths=Module._nodeModulePaths(${JSON.stringify(__dirname)});m._compile(${JSON.stringify(code)},${JSON.stringify(file)});`]}
(async()=>{
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'offline-assets.json')));let scripts=0;
 for(const a of manifest.files){assertHash(a);if(a.path.endsWith('.js')&&!a.path.startsWith('vendor/')){new vm.Script(fs.readFileSync(path.join(root,a.path),'utf8'),{filename:a.path});scripts++}}
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)){if(m[1].trim()){new vm.Script(m[1]);scripts++}}
 results.push({name:'integrity-syntax',exitCode:0,assets:manifest.files.length,scripts});
 await run('backend',python,['-m','pytest','server-candidate/v49/tests','-q']);
 await run('tablet',process.execPath,['work/verify-v50-tablet.cjs']);
 await run('safety',process.execPath,['work/verify-safety-repairs.cjs']);
 await run('accounts',process.execPath,historical('verify-accounts'));
 await run('roster',process.execPath,historical('verify-manual-roster'));
 // ZIP UI test already supports BILGE_TEST_ROOT; require v50 explicitly below.
 const uiFile=path.join(__dirname,'verify-zip-ui.cjs');let ui=fs.readFileSync(uiFile,'utf8').replaceAll('bilge-defter-invited-v48','bilge-defter-invited-v50').replaceAll('outputs/bilge-defter-v48-','outputs/v50/ui-');
 await run('ui-theme',process.execPath,['-e',`const Module=require('node:module');const m=new Module(${JSON.stringify(uiFile)});m.filename=${JSON.stringify(uiFile)};m.paths=Module._nodeModulePaths(${JSON.stringify(__dirname)});m._compile(${JSON.stringify(ui)},${JSON.stringify(uiFile)});`]);
 // Same lifecycle regression, now v49 -> v50. Only release identifiers/output path change.
 const swFile=path.join(__dirname,'verify-v47-update.cjs'),sw=fs.readFileSync(swFile,'utf8').replaceAll('v46','v49').replaceAll('v47','v50').replaceAll('V46','V49').replace('outputs/bilge-defter-v50-upgraded-offline.png','outputs/v50/upgraded-offline.png');
 await run('update-chain',process.execPath,['-e',`const Module=require('node:module');const m=new Module(${JSON.stringify(swFile)});m.filename=${JSON.stringify(swFile)};m.paths=Module._nodeModulePaths(${JSON.stringify(__dirname)});m._compile(${JSON.stringify(sw)},${JSON.stringify(swFile)});`]);
 fs.writeFileSync(path.join(out,'audit-results.json'),JSON.stringify({version:'v50',results,packageHash:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'SHA256SUMS'))).digest('hex'),liveDeployment:false,physicalDevice:false},null,2));
 process.exitCode=results.some(r=>r.exitCode!==0)?1:0;
})().catch(e=>{console.error(e);process.exitCode=1});
function assertHash(a){if(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,a.path))).digest('hex')!==a.sha256)throw Error('Hash mismatch: '+a.path)}
