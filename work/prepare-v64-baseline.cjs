'use strict';
const fs=require('fs'),path=require('path'),Module=require('module');
const file=path.join(__dirname,'prepare-v56-baseline.cjs');
const code=fs.readFileSync(file,'utf8').replaceAll('v56','v64')
 .replaceAll('9da998b81cbd402c1f4ea45a0cf28dae2b5f4b10','61b0eee7436de72608656277ae3660974adc0404')
 .replaceAll('1299aad3540395191cec3b43f2cbaf652b0c815f0f6f9a9814f2ce170b8dc25e','7db781b5391eddd2aba12dfafb13c3a3a572737c62643e84d653d50832cb0fff');
const loaded=new Module(file,module);loaded.filename=file;loaded.paths=Module._nodeModulePaths(__dirname);loaded._compile(code,file);
