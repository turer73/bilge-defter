'use strict';
const fs=require('fs'),path=require('path'),Module=require('module'),crypto=require('node:crypto'),assert=require('node:assert/strict');
// Preserve the full 26-suite matrix and all historical behavior assertions.
// Adapt the current version, real previous release, and the v78 logo wrapper.
const baseline=path.resolve(__dirname,'../outputs/pptx-v78-release/v77-baseline/package');
const baselineSums=fs.readFileSync(path.join(baseline,'SHA256SUMS'));
assert.equal(crypto.createHash('sha256').update(baselineSums).digest('hex'),
  'faf16c238f8e390c1a87ce4358b3e1eca517fcf7db01614c5e439d8aa73de25e','Published v77 baseline required');
for(const line of baselineSums.toString().trim().split('\n')){
  const [digest,name]=line.split('  ');
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(baseline,name))).digest('hex'),digest,'Published v77 byte mismatch: '+name);
}
let code=fs.readFileSync(path.join(__dirname,'verify-v72.cjs'),'utf8');
for(const [from,to]of[
  [".replaceAll('v64','v72')",".replaceAll('v64','v78')"],
  ['.replaceAll("\'v63\'","\'v71\'")','.replaceAll("\'v63\'","\'v77\'")'],
  ['v69To="assert.equal(report.app,\'v72\')"','v69To="assert.equal(report.app,\'v78\')"'],
  ['v71To="assert.equal(await p.evaluate(()=>APP_VERSION),\'v72\');"','v71To="assert.equal(await p.evaluate(()=>APP_VERSION),\'v78\');"'],
  // Same guarded inline-only fixture fix as v77. Asset writing remains exercised
  // independently by the unchanged v70/v71/v72 suites.
  ['const v61BlockFrom="const makePdf=eval(pdfPage),list=[];",v61BlockTo="ASSET_WRITE=false;const makePdf=eval(pdfPage),list=[];";',
   'const v61BlockFrom="const makePdf=eval(pdfPage)",v61BlockTo="ASSET_WRITE=false;const makePdf=eval(pdfPage)";']
]){assert.equal(code.split(from).length,2,'v78 mapping moved: '+from);code=code.replace(from,to);}
assert.equal(fs.readFileSync(path.join(__dirname,'verify-v61-save.cjs'),'utf8').split('const makePdf=eval(pdfPage)').length,3,'v78 inline fixture sites moved');
// These two SW suites previously constructed both roots under work/. Redirect
// only their previous version to the immutable reconstructed package. Do not
// rewrite manifests, storage assertions, fixture failures, or test outcomes.
const pathHook=String.raw`
const v78RootFrom="const root=v=>path.resolve(__dirname,'bilge-defter-invited-'+v);";
const v78RootTo="const root=v=>v==='v77'?path.resolve(__dirname,'../outputs/pptx-v78-release/v77-baseline/package'):path.resolve(__dirname,'bilge-defter-invited-'+v);";
for(const name of ['verify-v47-update.cjs','verify-v59-update.cjs'])if(fs.readFileSync(path.join(__dirname,name),'utf8').split(v78RootFrom).length!==2)throw Error('v78 previous-release root moved: '+name);
const v78Compile='const loaded=new Module(full,module);';
if(code.split(v78Compile).length!==2)throw Error('v78 child loader moved');
code=code.replace(v78Compile,"if(['verify-v47-update.cjs','verify-v59-update.cjs'].includes(file)){if(code.split("+JSON.stringify(v78RootFrom)+").length!==2)throw Error('v78 update root mapping moved');code=code.replace("+JSON.stringify(v78RootFrom)+","+JSON.stringify(v78RootTo)+");}\n"+v78Compile);
`;
// v51 used an IMG as the visible wordmark. v78 uses a theme-colored mask on
// an accessible wrapper, keeping that original decoded PNG as its fallback.
// Replace exactly that assertion, not the PNG hashes, auth or SW checks.
const logoFrom="assert.equal(await p.locator('bilge-defter-ui .brand-wordmark').evaluate(img=>img.complete&&img.naturalWidth>0),true);";
const logoTo=String.raw`{
 const headerLogo=p.locator('bilge-defter-ui .brand-wordmark');
 assert.equal(await headerLogo.isVisible(),true,'v78 header logo must remain visible');
 const logo=await headerLogo.evaluate(node=>{
  const style=getComputedStyle(node),pseudo=getComputedStyle(node,'::before'),img=node.querySelector('img'),rect=node.getBoundingClientRect();
  return {tag:node.tagName,role:node.getAttribute('role'),label:node.getAttribute('aria-label'),
   visible:style.visibility,opacity:Number(style.opacity),width:rect.width,height:rect.height,
   maskSupported:CSS.supports('mask-image','url("icons/brand-mono-v51.png")')||CSS.supports('-webkit-mask-image','url("icons/brand-mono-v51.png")'),
   mask:pseudo.maskImage||pseudo.webkitMaskImage,content:pseudo.content,display:pseudo.display,pseudoVisible:pseudo.visibility,pseudoOpacity:Number(pseudo.opacity),
   fallback:img?{src:img.getAttribute('src'),complete:img.complete,width:img.naturalWidth,height:img.naturalHeight,alt:img.alt,hidden:img.getAttribute('aria-hidden'),visibility:getComputedStyle(img).visibility}:null};
 });
 assert.equal(logo.tag,'SPAN');assert.equal(logo.role,'img');assert.equal(logo.label,'Bilge Defter');
 assert.equal(logo.visible,'visible');assert.ok(logo.opacity>0&&logo.width>0&&logo.height>0);
 assert.equal(logo.maskSupported,true,'This Chromium must exercise the actual CSS mask');
 assert.match(logo.mask,/^url\(["']?[^"']*\/icons\/brand-mono-v51\.png["']?\)$/);
 assert.notEqual(logo.content,'none');assert.notEqual(logo.content,'normal');assert.notEqual(logo.display,'none');
 assert.equal(logo.pseudoVisible,'visible');assert.ok(logo.pseudoOpacity>0);
 assert.ok(logo.fallback,'Original PNG fallback must not be removed');
 assert.equal(logo.fallback.src,'icons/brand-mono-v51.png');assert.equal(logo.fallback.complete,true);
 assert.ok(logo.fallback.width>0&&logo.fallback.height>0);assert.equal(logo.fallback.alt,'');assert.equal(logo.fallback.hidden,'true');
 assert.equal(logo.fallback.visibility,'hidden','Mask replaces the decoded fallback visually, not its asset');
}`;
assert.equal(fs.readFileSync(path.join(__dirname,'verify-v51-login.cjs'),'utf8').split(logoFrom).length,2,'v78 historical logo assertion moved');
const logoHook=`
const v78LogoFrom=${JSON.stringify(logoFrom)},v78LogoTo=${JSON.stringify(logoTo)};
const v78LogoCompile='const loaded=new Module(full,module);';
if(code.split(v78LogoCompile).length!==2)throw Error('v78 logo child loader moved');
code=code.replace(v78LogoCompile,"if(file==='verify-v51-login.cjs'){if(code.split("+JSON.stringify(v78LogoFrom)+").length!==2)throw Error('v78 logo assertion mapping moved');code=code.replace("+JSON.stringify(v78LogoFrom)+","+JSON.stringify(v78LogoTo)+");}\\n"+v78LogoCompile);
`;
const loader='const loaded=new Module(__filename,module);';assert.equal(code.split(loader).length,2,'v78 parent loader moved');
code=code.replace(loader,pathHook+'\n'+logoHook+'\n'+loader);
const loaded=new Module(__filename,module);loaded.filename=__filename;loaded.paths=Module._nodeModulePaths(__dirname);loaded._compile(code,__filename);
