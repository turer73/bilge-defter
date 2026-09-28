'use strict';
const fs=require('fs'),path=require('path'),Module=require('module');
const file=path.join(__dirname,'prepare-v56-baseline.cjs');
const code=fs.readFileSync(file,'utf8').replaceAll('v56','v66')
 .replaceAll('9da998b81cbd402c1f4ea45a0cf28dae2b5f4b10','d05c8636ca090690c480d78c394c7b49cc4dc2a9')
 .replaceAll('1299aad3540395191cec3b43f2cbaf652b0c815f0f6f9a9814f2ce170b8dc25e','fe5f594822e28c53cbe8fbd7d1741f4d436de0ec30d18e6bc8d100d4386ead92');
const loaded=new Module(file,module);loaded.filename=file;loaded.paths=Module._nodeModulePaths(__dirname);loaded._compile(code,file);
