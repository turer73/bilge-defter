'use strict';
const fs=require('fs'),path=require('path'),Module=require('module');
const file=path.join(__dirname,'prepare-v56-baseline.cjs');
const code=fs.readFileSync(file,'utf8').replaceAll('v56','v65')
 .replaceAll('9da998b81cbd402c1f4ea45a0cf28dae2b5f4b10','70775341c0a39f458326d8b48b03d6b6d98e8316')
 .replaceAll('1299aad3540395191cec3b43f2cbaf652b0c815f0f6f9a9814f2ce170b8dc25e','59fcbef4e3ef6594880192d483d545fabd1f2077484179178c3d3ce335fd3bfd');
const loaded=new Module(file,module);loaded.filename=file;loaded.paths=Module._nodeModulePaths(__dirname);loaded._compile(code,file);
