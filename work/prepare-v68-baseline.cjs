'use strict';
const fs=require('fs'),path=require('path'),Module=require('module');
// v68 published package (live since 28 Sep 2026; SHA256SUMS hash measured on klipper), rebuilt from Git.
const file=path.join(__dirname,'prepare-v56-baseline.cjs');
const code=fs.readFileSync(file,'utf8').replaceAll('v56','v68')
 .replaceAll('9da998b81cbd402c1f4ea45a0cf28dae2b5f4b10','728f5f8471fdb8f73016672931e2ee45662819c8')
 .replaceAll('1299aad3540395191cec3b43f2cbaf652b0c815f0f6f9a9814f2ce170b8dc25e','3d6264b25409cafd5b553b02d952f235f33cf3f9e314874a131ca108cdc48e08');
const loaded=new Module(file,module);loaded.filename=file;loaded.paths=Module._nodeModulePaths(__dirname);loaded._compile(code,file);
