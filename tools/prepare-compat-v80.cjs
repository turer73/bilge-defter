'use strict';
// Reconstruct the actually published v80 bytes with the same fail-closed contract.
// Built directly on prepare-compat-v78 so that its v78 ids become v80 and v79 ids v81.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict');
let code=fs.readFileSync(path.join(__dirname,'prepare-compat-v78.cjs'),'utf8');
for(const [from,to]of[
 ['ee44150a3fdb3e500d573756cb29adae73cd152e','6b652fcc04e33f440cce6776a264eb00b91e00b8'],
 ['915df1b7afdc14f91ba3937a591ab764def3a0ce1118691dd4fb78fb0f9d2862','34c72e2d0f89527f835d07dbac09ed046eb39bd8b6ec788e4f9cfb6c924f1481']
]){assert.equal(code.split(from).length,2,'Baseline reconstruction mapping moved');code=code.replace(from,to);}
assert.equal(/v8[01]/.test(code),false,'prepare-compat-v78 must not already name v80/v81');
code=code.replaceAll('v79','__CURRENT_RELEASE__').replaceAll('v78','v80').replaceAll('__CURRENT_RELEASE__','v81');
const loaded=new Module(__filename,module);loaded.filename=__filename;loaded.paths=Module._nodeModulePaths(__dirname);loaded._compile(code,__filename);
