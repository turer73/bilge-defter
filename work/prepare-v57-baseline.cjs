'use strict';
// Reuse the byte-preserving baseline loader with explicit published provenance.
const fs=require('fs'),path=require('path'),Module=require('module');
const file=path.join(__dirname,'prepare-v56-baseline.cjs');
const code=fs.readFileSync(file,'utf8').replaceAll('v56','v57')
 .replaceAll('9da998b81cbd402c1f4ea45a0cf28dae2b5f4b10','11a9a725bad31f5495b244fba8b709bc02e181ad')
 .replaceAll('1299aad3540395191cec3b43f2cbaf652b0c815f0f6f9a9814f2ce170b8dc25e','e5db524782bea09f10ffcd917ec8be238c6dd5c9af826a8eabca0aeb3c7cd411');
const loaded=new Module(file,module);loaded.filename=file;loaded.paths=Module._nodeModulePaths(__dirname);loaded._compile(code,file);
