'use strict';
// Keep all historical suites and evidence isolation. Built directly on verify-v79
// (not on the v80 wrapper, whose own mapping literals would be rewritten): v79 ids
// become the current v81 and v78 ids become the actually published prior v80.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict');
let code=fs.readFileSync(path.join(__dirname,'verify-v79.cjs'),'utf8');
const old='915df1b7afdc14f91ba3937a591ab764def3a0ce1118691dd4fb78fb0f9d2862',current='34c72e2d0f89527f835d07dbac09ed046eb39bd8b6ec788e4f9cfb6c924f1481';
assert.equal(code.split(old).length,2,'Historical baseline mapping moved');
assert.equal(/v8[01]/.test(code),false,'verify-v79 must not already name v80/v81');
code=code.replace(old,current).replaceAll('v79','__CURRENT_RELEASE__').replaceAll('v78','v80').replaceAll('__CURRENT_RELEASE__','v81');
const loaded=new Module(__filename,module);loaded.filename=__filename;loaded.paths=Module._nodeModulePaths(__dirname);loaded._compile(code,__filename);
