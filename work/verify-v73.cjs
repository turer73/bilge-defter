'use strict';
const fs=require('fs'),path=require('path'),Module=require('module');
// Preserve historical suite filenames; exercise them against the v73 build.
// Update tests start from the published v72 package, not a relabelled candidate.
let code=fs.readFileSync(path.join(__dirname,'verify-v72.cjs'),'utf8');
for(const [from,to] of [
 [".replaceAll('v64','v72')",".replaceAll('v64','v73')"],
 ['.replaceAll("\'v63\'","\'v71\'")','.replaceAll("\'v63\'","\'v72\'")'],
 ['v69To="assert.equal(report.app,\'v72\')"','v69To="assert.equal(report.app,\'v73\')"'],
 ['v71To="assert.equal(await p.evaluate(()=>APP_VERSION),\'v72\');"','v71To="assert.equal(await p.evaluate(()=>APP_VERSION),\'v73\');"']
]){
 if(code.split(from).length!==2)throw Error('v73 mapping moved: '+from);
 code=code.replace(from,to);
}
const loaded=new Module(__filename,module);loaded.filename=__filename;loaded.paths=Module._nodeModulePaths(__dirname);loaded._compile(code,__filename);
