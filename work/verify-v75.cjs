'use strict';
const fs=require('fs'),path=require('path'),Module=require('module');
// Historical behavior suites target v75. Update baselines are the real v74 reader bridge.
let code=fs.readFileSync(path.join(__dirname,'verify-v72.cjs'),'utf8');
for(const [from,to] of [
 [".replaceAll('v64','v72')",".replaceAll('v64','v75')"],
 ['.replaceAll("\'v63\'","\'v71\'")','.replaceAll("\'v63\'","\'v74\'")'],
 ['v69To="assert.equal(report.app,\'v72\')"','v69To="assert.equal(report.app,\'v75\')"'],
 ['v71To="assert.equal(await p.evaluate(()=>APP_VERSION),\'v72\');"','v71To="assert.equal(await p.evaluate(()=>APP_VERSION),\'v75\');"']
]){
 if(code.split(from).length!==2)throw Error('v75 mapping moved: '+from);
 code=code.replace(from,to);
}
const loaded=new Module(__filename,module);loaded.filename=__filename;loaded.paths=Module._nodeModulePaths(__dirname);loaded._compile(code,__filename);
