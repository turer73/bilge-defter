'use strict';
const fs=require('fs'),path=require('path'),Module=require('module');
// v69 published package (live since 2 Oct 2026; SHA256SUMS hash measured on klipper), rebuilt from Git.
const file=path.join(__dirname,'prepare-v56-baseline.cjs');
const code=fs.readFileSync(file,'utf8').replaceAll('v56','v69')
 .replaceAll('9da998b81cbd402c1f4ea45a0cf28dae2b5f4b10','cf06b8d8c72b79cf9e79f27e11d885446fa88e2a')
 .replaceAll('1299aad3540395191cec3b43f2cbaf652b0c815f0f6f9a9814f2ce170b8dc25e','95e9ca5103987fe0740e1119387be85a0955eee87e46fd9b482e6ab6e6b24e55');
const loaded=new Module(file,module);loaded.filename=file;loaded.paths=Module._nodeModulePaths(__dirname);loaded._compile(code,file);
