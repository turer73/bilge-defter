'use strict';
const fs=require('fs'),path=require('path'),Module=require('module');
// v70 published package (live since 2 Oct 2026, evening; SHA256SUMS hash measured on klipper), rebuilt from Git.
const file=path.join(__dirname,'prepare-v56-baseline.cjs');
const code=fs.readFileSync(file,'utf8').replaceAll('v56','v70')
 .replaceAll('9da998b81cbd402c1f4ea45a0cf28dae2b5f4b10','7ba592ee3176931e3e3c64631f5c704698d93f17')
 .replaceAll('1299aad3540395191cec3b43f2cbaf652b0c815f0f6f9a9814f2ce170b8dc25e','0f9e4b5fb2bb07ddc8c1da3e62ecf01dbb84afc635f49da9a292a8967bb096ea');
const loaded=new Module(file,module);loaded.filename=file;loaded.paths=Module._nodeModulePaths(__dirname);loaded._compile(code,file);
