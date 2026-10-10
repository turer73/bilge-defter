'use strict';
// Keep the existing integration/rollback assertions; change only release IDs,
// the independently reconstructed previous release, and its marker contract.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict');
const kind=process.argv[2],files={integration:'verify-pptx-integration.cjs',compat:'verify-pptx-notebook-compat.cjs'};
assert.ok(Object.hasOwn(files,kind),'Use integration or compat');
const file=path.join(__dirname,files[kind]);let code=fs.readFileSync(file,'utf8');
function once(from,to){assert.equal(code.split(from).length,2,'v79 mapping moved: '+from);code=code.replace(from,to);}
once('faf16c238f8e390c1a87ce4358b3e1eca517fcf7db01614c5e439d8aa73de25e','915df1b7afdc14f91ba3937a591ab764def3a0ce1118691dd4fb78fb0f9d2862');
if(kind==='compat'){
  once('a441a2d3e1cb2fce7afcd592f7ca5d1480fe9e05','ee44150a3fdb3e500d573756cb29adae73cd152e');
  once("Math.abs(oldMarkerAlpha-64)<=1,'v77 keeps its legacy 0.25 marker appearance'","Math.abs(oldMarkerAlpha-102)<=1,'v77 respects the stored 0.4 marker appearance'");
}
code=code.replaceAll('v77','__PREVIOUS_RELEASE__').replaceAll('v78','v79').replaceAll('__PREVIOUS_RELEASE__','v78');
// The report's runner hash must identify this adapter, whose committed source
// also identifies the unchanged imported test, not pretend it ran standalone.
code=code.replaceAll('fs.readFileSync(__filename)','fs.readFileSync('+JSON.stringify(__filename)+')');
const loaded=new Module(file,module);loaded.filename=file;loaded.paths=Module._nodeModulePaths(__dirname);loaded._compile(code,file);
