'use strict';
// Reuse the byte-preserving baseline loader with explicit published provenance.
const fs=require('fs'),path=require('path'),Module=require('module');
const file=path.join(__dirname,'prepare-v56-baseline.cjs');
const code=fs.readFileSync(file,'utf8').replaceAll('v56','v60')
 .replaceAll('9da998b81cbd402c1f4ea45a0cf28dae2b5f4b10','9b6c8ce4efa78d47949b81ce2187a0587e1af0c5')
 .replaceAll('1299aad3540395191cec3b43f2cbaf652b0c815f0f6f9a9814f2ce170b8dc25e','d325132b704ab2790111a32a921cc2816b62164d9af172b1b8cf42bec9b679dd');
const loaded=new Module(file,module);loaded.filename=file;loaded.paths=Module._nodeModulePaths(__dirname);loaded._compile(code,file);
