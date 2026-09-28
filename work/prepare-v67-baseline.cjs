'use strict';
const fs=require('fs'),path=require('path'),Module=require('module');
const file=path.join(__dirname,'prepare-v56-baseline.cjs');
const code=fs.readFileSync(file,'utf8').replaceAll('v56','v67')
 .replaceAll('9da998b81cbd402c1f4ea45a0cf28dae2b5f4b10','4953adba538e131527bd9fa0e124397ea23fdc6e')
 .replaceAll('1299aad3540395191cec3b43f2cbaf652b0c815f0f6f9a9814f2ce170b8dc25e','bdc4b8ebb20c3dfab1da32b72eaf1a723a75c1faa897f72631035134e140c608');
const loaded=new Module(file,module);loaded.filename=file;loaded.paths=Module._nodeModulePaths(__dirname);loaded._compile(code,file);
