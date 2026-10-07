'use strict';
const fs=require('fs'),path=require('path'),Module=require('module'),crypto=require('node:crypto'),assert=require('node:assert/strict');
// Preserve the full 26-suite matrix and all historical behavior assertions.
// Only the current version and the real previous release path are adapted.
const baseline=path.resolve(__dirname,'../outputs/pptx-v77-release/v76-baseline/package');
const baselineSums=fs.readFileSync(path.join(baseline,'SHA256SUMS'));
assert.equal(crypto.createHash('sha256').update(baselineSums).digest('hex'),
  'e81d8d6236fbda48cdeb02b8d1f216227cab39ab3fa91587e01f263d3b75688a','Published v76 baseline required');
for(const line of baselineSums.toString().trim().split('\n')){
  const [digest,name]=line.split('  ');
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(baseline,name))).digest('hex'),digest,'Published v76 byte mismatch: '+name);
}
let code=fs.readFileSync(path.join(__dirname,'verify-v72.cjs'),'utf8');
for(const [from,to]of[
  [".replaceAll('v64','v72')",".replaceAll('v64','v77')"],
  ['.replaceAll("\'v63\'","\'v71\'")','.replaceAll("\'v63\'","\'v76\'")'],
  ['v69To="assert.equal(report.app,\'v72\')"','v69To="assert.equal(report.app,\'v77\')"'],
  ['v71To="assert.equal(await p.evaluate(()=>APP_VERSION),\'v72\');"','v71To="assert.equal(await p.evaluate(()=>APP_VERSION),\'v77\');"'],
  // Same guarded inline-only fixture fix as v76. Asset writing remains exercised
  // independently by the unchanged v70/v71/v72 suites.
  ['const v61BlockFrom="const makePdf=eval(pdfPage),list=[];",v61BlockTo="ASSET_WRITE=false;const makePdf=eval(pdfPage),list=[];";',
   'const v61BlockFrom="const makePdf=eval(pdfPage)",v61BlockTo="ASSET_WRITE=false;const makePdf=eval(pdfPage)";']
]){assert.equal(code.split(from).length,2,'v77 mapping moved: '+from);code=code.replace(from,to);}
assert.equal(fs.readFileSync(path.join(__dirname,'verify-v61-save.cjs'),'utf8').split('const makePdf=eval(pdfPage)').length,3,'v77 inline fixture sites moved');
// These two SW suites previously constructed both roots under work/. Redirect
// only their previous version to the immutable reconstructed package. Do not
// rewrite manifests, storage assertions, fixture failures, or test outcomes.
const pathHook=String.raw`
const v77RootFrom="const root=v=>path.resolve(__dirname,'bilge-defter-invited-'+v);";
const v77RootTo="const root=v=>v==='v76'?path.resolve(__dirname,'../outputs/pptx-v77-release/v76-baseline/package'):path.resolve(__dirname,'bilge-defter-invited-'+v);";
for(const name of ['verify-v47-update.cjs','verify-v59-update.cjs'])if(fs.readFileSync(path.join(__dirname,name),'utf8').split(v77RootFrom).length!==2)throw Error('v77 previous-release root moved: '+name);
const v77Compile='const loaded=new Module(full,module);';
if(code.split(v77Compile).length!==2)throw Error('v77 child loader moved');
code=code.replace(v77Compile,"if(['verify-v47-update.cjs','verify-v59-update.cjs'].includes(file)){if(code.split("+JSON.stringify(v77RootFrom)+").length!==2)throw Error('v77 update root mapping moved');code=code.replace("+JSON.stringify(v77RootFrom)+","+JSON.stringify(v77RootTo)+");}\n"+v77Compile);
`;
const loader='const loaded=new Module(__filename,module);';assert.equal(code.split(loader).length,2,'v77 parent loader moved');
code=code.replace(loader,pathHook+'\n'+loader);
const loaded=new Module(__filename,module);loaded.filename=__filename;loaded.paths=Module._nodeModulePaths(__dirname);loaded._compile(code,__filename);
