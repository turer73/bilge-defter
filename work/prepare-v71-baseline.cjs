'use strict';
const fs=require('fs'),path=require('path'),Module=require('module');
// v71 published package (live since 2 Oct 2026, evening; SHA256SUMS hash measured on klipper), rebuilt from Git.
const file=path.join(__dirname,'prepare-v56-baseline.cjs');
const code=fs.readFileSync(file,'utf8').replaceAll('v56','v71')
 .replaceAll('9da998b81cbd402c1f4ea45a0cf28dae2b5f4b10','e065f969c63b3d4b5ef0110e6b2d65d684faf56e')
 .replaceAll('1299aad3540395191cec3b43f2cbaf652b0c815f0f6f9a9814f2ce170b8dc25e','4e921191a2d046256ba4866d229b37693b37204d06c501a5271d8c3216716f9a');
const loaded=new Module(file,module);loaded.filename=file;loaded.paths=Module._nodeModulePaths(__dirname);loaded._compile(code,file);
