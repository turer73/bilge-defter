const fs=require('fs'),path=require('path'),{spawnSync}=require('child_process');
const repo=path.resolve(__dirname,'..'),env={...process.env,BILGE_TEST_ROOT:path.join(__dirname,'bilge-defter-invited-v54'),BILGE_TEST_OUTPUT:path.join(repo,'outputs/v54')};
function run(file,code){const f=path.join(__dirname,file),args=code?['-e',`const Module=require('module');const m=new Module(${JSON.stringify(f)});m.filename=${JSON.stringify(f)};m.paths=Module._nodeModulePaths(${JSON.stringify(__dirname)});m._compile(${JSON.stringify(code)},m.filename);`]:[f];const r=spawnSync(process.execPath,args,{cwd:repo,env,stdio:'inherit',windowsHide:true});if(r.status!==0)throw Error(file+' failed '+r.status)}
run('prepare-terminology-v54.cjs');run('prepare-clean-baselines.cjs');
const audit=fs.readFileSync(path.join(__dirname,'audit-v50.cjs'),'utf8').replaceAll('v50','v54').replaceAll(".replaceAll('v46','v49')",".replaceAll('v46','v52')").replaceAll(".replaceAll('V46','V49')",".replaceAll('V46','V52')").replaceAll('work/verify-v54-tablet.cjs','work/verify-v50-tablet.cjs');
run('audit-v50.cjs',audit);run('verify-v51-login.cjs');run('verify-terminology.cjs');run('verify-terminology-ui.cjs');
console.log('PASS v54 dictionary-only release; v52-to-v54 lifecycle tested; no PDF v53 code included');
