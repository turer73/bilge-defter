'use strict';
// Keep all 26 historical suites and evidence isolation. Only advance the release
// identifiers and the independently reconstructed, actually published baseline.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict');
let code=fs.readFileSync(path.join(__dirname,'verify-v79.cjs'),'utf8');
const old='915df1b7afdc14f91ba3937a591ab764def3a0ce1118691dd4fb78fb0f9d2862',current='d7bd2e689410e6e179b4f2335705a88281d210f2786b5cd172caf0a262f8aa87';
assert.equal(code.split(old).length,2,'Historical baseline mapping moved');
code=code.replace(old,current).replaceAll('v79','__CURRENT_RELEASE__').replaceAll('v78','v79').replaceAll('__CURRENT_RELEASE__','v80');
const loaded=new Module(__filename,module);loaded.filename=__filename;loaded.paths=Module._nodeModulePaths(__dirname);loaded._compile(code,__filename);
