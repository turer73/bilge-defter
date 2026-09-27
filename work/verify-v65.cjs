'use strict';
const fs=require('fs'),path=require('path'),Module=require('module');
const file=path.join(__dirname,'verify-v64.cjs');
const code=fs.readFileSync(file,'utf8').replaceAll('v64','v65').replaceAll("'v63'","'v64'");
const loaded=new Module(__filename,module);loaded.filename=__filename;loaded.paths=Module._nodeModulePaths(__dirname);loaded._compile(code,__filename);
