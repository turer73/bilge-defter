'use strict';
// Same integration/rollback assertions, against the published v79 package.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict');
const kind=process.argv[2],files={integration:'verify-pptx-integration.cjs',compat:'verify-pptx-notebook-compat.cjs'};
assert.ok(Object.hasOwn(files,kind),'Use integration or compat');
const file=path.join(__dirname,files[kind]);let code=fs.readFileSync(file,'utf8');
function once(from,to){assert.equal(code.split(from).length,2,'v80 mapping moved: '+from);code=code.replace(from,to);}
once('faf16c238f8e390c1a87ce4358b3e1eca517fcf7db01614c5e439d8aa73de25e','d7bd2e689410e6e179b4f2335705a88281d210f2786b5cd172caf0a262f8aa87');
if(kind==='compat'){
 once('a441a2d3e1cb2fce7afcd592f7ca5d1480fe9e05','918aa5796110db12cb3950588fb17d521205dbf9');
 once("Math.abs(oldMarkerAlpha-64)<=1,'v77 keeps its legacy 0.25 marker appearance'","Math.abs(oldMarkerAlpha-102)<=1,'v77 respects the stored 0.4 marker appearance'");
}
code=code.replaceAll('v77','__PREVIOUS_RELEASE__').replaceAll('v78','v80').replaceAll('__PREVIOUS_RELEASE__','v79');
if(process.env.BILGE_TEST_OUTPUT){
 const out=path.resolve(process.env.BILGE_TEST_OUTPUT),outputs=path.resolve(__dirname,'../outputs');
 assert.ok(out.startsWith(outputs+path.sep)&&!fs.existsSync(out),'New evidence directory required');
 const from=kind==='compat'?"out=path.join(repo,'outputs/pptx-v80-release/notebook-compat')":"out=path.join(repo,'outputs/pptx-v80-release')";
 once(from,'out='+JSON.stringify(out));
}
code=code.replaceAll('fs.readFileSync(__filename)','fs.readFileSync('+JSON.stringify(__filename)+')');
const loaded=new Module(file,module);loaded.filename=file;loaded.paths=Module._nodeModulePaths(__dirname);loaded._compile(code,file);
