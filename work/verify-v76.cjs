'use strict';
const fs=require('fs'),path=require('path'),Module=require('module');
// Reuse historical behavior assertions with an immutable real v75 update baseline.
let code=fs.readFileSync(path.join(__dirname,'verify-v75.cjs'),'utf8');
code=code.replaceAll("'v75'","'v76'").replaceAll("\\'v75\\'","\\'v76\\'")
  .replaceAll("\\'v74\\'","\\'v75\\'");
// The historical v61 equivalence and blocking fixtures both compare inline image JSON.
// v71+ moves images to separate assets after two seconds; that changes the storage
// representation and intentionally changes the leave-save path. Keep only these
// inline serialization fixtures inline; v70/v71/v72 suites still test asset writing.
// This hook runs inside the v75 adapter, where `code` contains the inherited v72 runner.
const inlineFixtureHook=String.raw`
const v61InlineFrom='const v61BlockFrom="const makePdf=eval(pdfPage),list=[];",v61BlockTo="ASSET_WRITE=false;const makePdf=eval(pdfPage),list=[];";';
const v61InlineTo='const v61BlockFrom="const makePdf=eval(pdfPage)",v61BlockTo="ASSET_WRITE=false;const makePdf=eval(pdfPage)";';
if(code.split(v61InlineFrom).length!==2)throw Error('v76 inline fixture adapter moved');
if(fs.readFileSync(path.join(__dirname,'verify-v61-save.cjs'),'utf8').split('const makePdf=eval(pdfPage)').length!==3)throw Error('v76 inline fixture sites moved');
code=code.replace(v61InlineFrom,v61InlineTo);
`;
const loaderMarker='const loaded=new Module(__filename,module);';
if(code.split(loaderMarker).length!==2)throw Error('v76 parent loader moved');
code=code.replace(loaderMarker,inlineFixtureHook+'\n'+loaderMarker);
const loaded=new Module(__filename,module);loaded.filename=__filename;loaded.paths=Module._nodeModulePaths(__dirname);loaded._compile(code,__filename);
