'use strict';
const fs=require('fs'),path=require('path'),Module=require('module');
const file=path.join(__dirname,'prepare-v56-baseline.cjs');
const code=fs.readFileSync(file,'utf8').replaceAll('v56','v72')
 .replaceAll('9da998b81cbd402c1f4ea45a0cf28dae2b5f4b10','8ef7550118f81ee7ac7da96e3e9f82d024b0ae74')
 .replaceAll('1299aad3540395191cec3b43f2cbaf652b0c815f0f6f9a9814f2ce170b8dc25e','a602e5241d06aefa7b0f9aea2976bb81fb2ccc071fff5c816a01c812adcd93dc');
const loaded=new Module(file,module);loaded.filename=file;loaded.paths=Module._nodeModulePaths(__dirname);loaded._compile(code,file);
