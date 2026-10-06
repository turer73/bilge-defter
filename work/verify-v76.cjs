'use strict';
const fs=require('fs'),path=require('path'),Module=require('module');
// Reuse historical behavior assertions with an immutable real v75 update baseline.
let code=fs.readFileSync(path.join(__dirname,'verify-v75.cjs'),'utf8');
code=code.replaceAll("'v75'","'v76'").replaceAll("\\'v75\\'","\\'v76\\'")
  .replaceAll("\\'v74\\'","\\'v75\\'");
const loaded=new Module(__filename,module);loaded.filename=__filename;loaded.paths=Module._nodeModulePaths(__dirname);loaded._compile(code,__filename);
