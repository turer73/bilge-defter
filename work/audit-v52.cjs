// Original regression assertions against v52, including actual v51 -> v52 SW update.
const fs=require('fs'),path=require('path'),Module=require('module');
const filename=path.join(__dirname,'audit-v50.cjs');
let code=fs.readFileSync(filename,'utf8').replaceAll('v50','v52').replaceAll(".replaceAll('v46','v49')",".replaceAll('v46','v51')").replaceAll(".replaceAll('V46','V49')",".replaceAll('V46','V51')").replaceAll('work/verify-v52-tablet.cjs','work/verify-v50-tablet.cjs');
const m=new Module(filename);m.filename=filename;m.paths=Module._nodeModulePaths(__dirname);m._compile(code,filename);
