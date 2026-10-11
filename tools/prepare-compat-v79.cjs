'use strict';
// Use the same fail-closed reconstruction contract; never copy the current
// working package and call it the published rollback baseline.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict');
let code=fs.readFileSync(path.join(__dirname,'prepare-compat-v78.cjs'),'utf8');
for(const [from,to]of[
 ['ee44150a3fdb3e500d573756cb29adae73cd152e','918aa5796110db12cb3950588fb17d521205dbf9'],
 ['915df1b7afdc14f91ba3937a591ab764def3a0ce1118691dd4fb78fb0f9d2862','d7bd2e689410e6e179b4f2335705a88281d210f2786b5cd172caf0a262f8aa87']
]){assert.equal(code.split(from).length,2,'Baseline reconstruction mapping moved');code=code.replace(from,to);}
code=code.replaceAll('v79','__CURRENT_RELEASE__').replaceAll('v78','v79').replaceAll('__CURRENT_RELEASE__','v80');
const loaded=new Module(__filename,module);loaded.filename=__filename;loaded.paths=Module._nodeModulePaths(__dirname);loaded._compile(code,__filename);
