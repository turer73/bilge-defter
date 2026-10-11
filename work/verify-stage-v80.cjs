'use strict';
// Advance the staged-static smoke without modifying the published v79 runner.
// This requires the explicit reviewed local SSH forward; it never deploys.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict');
let code=fs.readFileSync(path.join(__dirname,'verify-stage-v79.cjs'),'utf8').replaceAll('v79','v80');
function once(from,to){assert.equal(code.split(from).length,2,'v80 stage mapping moved: '+from);code=code.replace(from,to);}
once("fs.mkdirSync(out,{recursive:true});","assert.ok(!fs.existsSync(out),'Never overwrite staged acceptance evidence');fs.mkdirSync(out,{recursive:true});");
once("assert.ok(files.has('/page-navigation.js'),'Numbered navigation must belong to the reviewed candidate');","for(const name of ['/page-navigation.js','/viewport-reader.js','/pptx/import-stage.js'])assert.ok(files.has(name),'Required reviewed candidate asset: '+name);");
once("assert.ok(staticProof.some(r=>r.path==='/page-navigation.js'),'New navigation asset must be served by the actual nginx exact route');","for(const name of ['/page-navigation.js','/viewport-reader.js','/pptx/import-stage.js'])assert.ok(staticProof.some(r=>r.path===name),'Actual nginx exact route must serve '+name);");
code=code.replaceAll('fs.readFileSync(__filename)','fs.readFileSync('+JSON.stringify(__filename)+')');
const loaded=new Module(__filename,module);loaded.filename=__filename;loaded.paths=Module._nodeModulePaths(__dirname);loaded._compile(code,__filename);
