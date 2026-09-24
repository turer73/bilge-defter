// Reuse the v50 regression suite against v51 bytes, including v50 -> v51 update.
const fs=require('fs'),path=require('path'),Module=require('module');
const filename=path.join(__dirname,'audit-v50.cjs');
let code=fs.readFileSync(filename,'utf8').replaceAll('v50','v51').replaceAll(".replaceAll('v46','v49')",".replaceAll('v46','v50')").replaceAll(".replaceAll('V46','V49')",".replaceAll('V46','V50')").replaceAll('work/verify-v51-tablet.cjs','work/verify-v50-tablet.cjs');
const m=new Module(filename);m.filename=filename;m.paths=Module._nodeModulePaths(__dirname);m._compile(code,filename);
