'use strict';
// Reuse the byte-preserving baseline loader with explicit published provenance.
const fs=require('fs'),path=require('path'),Module=require('module');
const file=path.join(__dirname,'prepare-v56-baseline.cjs');
const code=fs.readFileSync(file,'utf8').replaceAll('v56','v62')
 .replaceAll('9da998b81cbd402c1f4ea45a0cf28dae2b5f4b10','5240bf008413bb54a2907807b6b0d8dade5c6de7')
 .replaceAll('1299aad3540395191cec3b43f2cbaf652b0c815f0f6f9a9814f2ce170b8dc25e','3592843ad931fae4eef005a37fe8424fb989c72143419d90b88f3fa4a93471f4');
const loaded=new Module(file,module);loaded.filename=file;loaded.paths=Module._nodeModulePaths(__dirname);loaded._compile(code,file);
