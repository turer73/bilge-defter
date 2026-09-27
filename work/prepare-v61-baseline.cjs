'use strict';
// Reuse the byte-preserving baseline loader with explicit published provenance.
const fs=require('fs'),path=require('path'),Module=require('module');
const file=path.join(__dirname,'prepare-v56-baseline.cjs');
const code=fs.readFileSync(file,'utf8').replaceAll('v56','v61')
 .replaceAll('9da998b81cbd402c1f4ea45a0cf28dae2b5f4b10','060119169da070aa6ef8415798b98b2b9c492148')
 .replaceAll('1299aad3540395191cec3b43f2cbaf652b0c815f0f6f9a9814f2ce170b8dc25e','20bcf1367c24c603da86be59f3814d9eca8e051ba20e0de5f99612240f2eefd4');
const loaded=new Module(file,module);loaded.filename=file;loaded.paths=Module._nodeModulePaths(__dirname);loaded._compile(code,file);
