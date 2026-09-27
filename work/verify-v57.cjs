'use strict';
const fs=require('fs'),path=require('path'),{spawnSync}=require('child_process'),Module=require('module'),assert=require('node:assert/strict');
const repo=path.resolve(__dirname,'..');
// Reuse historical assertions against the candidate; keep their original proofs intact.
const mapping={
 'verify-v52-performance.cjs':[['v52','v57']],
 'verify-v47-update.cjs':[['v46','v56'],['v47','v57']],
};
if(process.argv[2]){
 const file=process.argv[2],full=path.join(__dirname,file);let code=fs.readFileSync(full,'utf8');
 for(const [from,to] of mapping[file]||[])code=code.replaceAll(from,to);
 const m=new Module(full,module);m.filename=full;m.paths=Module._nodeModulePaths(__dirname);m._compile(code,full);
}else{
 for(const file of ['verify-v57-ink.cjs','verify-v52-performance.cjs','verify-v50-tablet.cjs','verify-v51-login.cjs','verify-library-quote.cjs','verify-terminology-ui.cjs','verify-dictionary-search.cjs','verify-v47-update.cjs']){
  console.log('SUITE '+file);const r=spawnSync(process.execPath,[__filename,file],{cwd:repo,windowsHide:true,stdio:'inherit',env:{...process.env,BILGE_TEST_ROOT:path.join(__dirname,'bilge-defter-invited-v57'),BILGE_TEST_OUTPUT:path.join(repo,'outputs/v57',file)}});assert.equal(r.status,0,file);
 }
 console.log('PASS v57 regression suites. Physical iPad and live acceptance remain pending.');
}
