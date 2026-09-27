'use strict';
const fs=require('fs'),path=require('path'),{spawnSync}=require('child_process'),Module=require('module'),assert=require('node:assert/strict');
const repo=path.resolve(__dirname,'..');
const mapping={'verify-v52-performance.cjs':[['v52','v62']],'verify-v47-update.cjs':[['v46','v61'],['v47','v62']],'verify-v59-update.cjs':[['v59','v62'],['v58','v61']]};
const suites=['verify-terminology.cjs','verify-v62-dictionary.cjs','verify-v61-save.cjs','verify-v61-zoom.cjs','verify-v60-save.cjs','verify-v59-library.cjs','verify-v59-update.cjs','verify-v58-scroll.cjs','verify-v57-ink.cjs','verify-v52-performance.cjs','verify-v50-tablet.cjs','verify-v51-login.cjs','verify-library-quote.cjs','verify-terminology-ui.cjs','verify-dictionary-search.cjs','verify-v47-update.cjs'];
if(process.argv[2]&&process.argv[3]!=='--child'){
 const result=spawnSync(process.execPath,[__filename,process.argv[2],'--child'],{cwd:repo,windowsHide:true,stdio:'inherit',env:childEnv(process.argv[2])});
 process.exit(result.status);
}else if(process.argv[2]){
 const file=process.argv[2],full=path.join(__dirname,file);let code=fs.readFileSync(full,'utf8');
 for(const [from,to] of mapping[file]||[])code=code.replaceAll(from,to);
 const loaded=new Module(full,module);loaded.filename=full;loaded.paths=Module._nodeModulePaths(__dirname);loaded._compile(code,full);
}else{
 for(const file of suites){
  console.log('SUITE '+file);const result=spawnSync(process.execPath,[__filename,file,'--child'],{cwd:repo,windowsHide:true,stdio:'inherit',env:childEnv(file)});assert.equal(result.status,0,file);
 }
 console.log('PASS v62 candidate regression suites; no publication or physical iPad claim.');
}
function childEnv(file){return {...process.env,BILGE_TEST_ROOT:path.join(__dirname,'bilge-defter-invited-v62'),BILGE_TEST_OUTPUT:path.join(repo,'outputs/v62',file)}}
