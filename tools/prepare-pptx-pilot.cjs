'use strict';
// Reproducible, offline derivation of the exact reviewed npm browser artifact.
// No package scripts, converters, network requests, or npm installs are run.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const source=path.resolve(root,'outputs/direct-pptx-20261006/package');
const pilot=path.resolve(root,'work/pptx-pilot');
const expected='46b61afa1435de0c194f93324c9467ca392c891c6e07517727c8ffb5e51c376b';
const check=process.argv.includes('--check');
if(process.argv.slice(2).some(value=>value!=='--check'))throw Error('Only --check is supported.');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const sri=bytes=>'sha256-'+crypto.createHash('sha256').update(bytes).digest('base64');
const originalPath=path.join(source,'dist/aiden0z-pptx-renderer.browser.es.js');
const original=fs.readFileSync(fs.existsSync(originalPath)?originalPath:path.join(pilot,'vendor/renderer-source.es.js'));
if(hash(original)!==expected)throw Error('Reviewed renderer artifact SHA256 mismatch.');
const packagePath=path.join(source,'package.json');
const metadata=fs.existsSync(packagePath)?JSON.parse(fs.readFileSync(packagePath,'utf8')):{name:'@aiden0z/pptx-renderer',version:'1.3.0'};
if(metadata.name!=='@aiden0z/pptx-renderer'||metadata.version!=='1.3.0')throw Error('Unexpected renderer package.');
const text=original.toString('utf8');
const exportTail=/export \{\r?\n([\s\S]*?)\r?\n\};\s*$/;
const match=text.match(exportTail);
const expectedExports=['bT as DEFAULT_EMBEDDED_FONT_LIMITS','ZX as PptxRenderer','Qy as PptxViewer','VX as RECOMMENDED_ZIP_LIMITS','ad as buildPresentation','CT as buildTextIndex','YX as materializeAllSlideNodes','pf as materializeSlideNodes','G$ as parseZip','U$ as parseZipLazyMedia','Zv as renderSlide','XX as searchPresentation','AT as searchText','qX as serializePresentation'];
if(!match||JSON.stringify(match[1].split(',').map(value=>value.trim()))!==JSON.stringify(expectedExports))throw Error('Reviewed export tail changed.');
let body=text.slice(0,match.index).replace(/\r\n/g,'\n');
if(/^\s*(?:import|export)\s/m.test(body))throw Error('Unexpected static module dependency.');
// The only import.meta use resolves OPTIONAL PDF.js. This pilot always sets
// pdfjs:false; a classic script must not contain that module-only expression.
if(body.split('import.meta.resolve').length!==2)throw Error('Optional PDF resolver changed.');
body=body.replace('import.meta.resolve','undefined');
if(body.includes('import.meta'))throw Error('Unexpected import.meta remains.');
// The private JSZip binding is exposed only inside the opaque renderer. Its
// name is bound by the complete source hash and the exact export-tail check.
const runtime=Buffer.from("'use strict';\n// Derived from @aiden0z/pptx-renderer 1.3.0. See vendor notices.\n(()=>{\n"+body+"\nObject.defineProperty(globalThis,'BilgePptxRuntime',{value:Object.freeze({Viewer:Qy,parse:U$,build:ad,zip:t5}),writable:false,configurable:false});\n})();\n");
const frame=fs.readFileSync(path.join(pilot,'renderer-frame.js'));
if(/<\/script|<!--/i.test(runtime.toString())||/<\/script|<!--/i.test(frame.toString()))throw Error('Unsafe HTML raw-text boundary in trusted code.');
const runtimeIntegrity=sri(runtime),frameIntegrity=sri(frame);
const csp="default-src 'none'; script-src '"+runtimeIntegrity+"' '"+frameIntegrity+"'; style-src 'unsafe-inline'; connect-src 'none'; img-src data: blob:; font-src data: blob:; media-src 'none'; frame-src 'none'; object-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'";
const html=Buffer.from('<!doctype html>\n<html lang="tr"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="'+csp+'"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=1000, initial-scale=1"><title>Yalıtılmış PowerPoint zemini</title><style>html,body{margin:0;padding:0;width:1000px;overflow:hidden;background:transparent}#stage{position:relative;width:1000px;overflow:hidden;pointer-events:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}</style></head><body><div id="stage" inert aria-hidden="true"></div><script>'+runtime.toString()+'</script><script>'+frame.toString()+'</script></body></html>\n');
const outputs=new Map([['vendor/renderer-source.es.js',original],['vendor/renderer-runtime.js',runtime],['renderer-frame.html',html]]);
const bridge=fs.readFileSync(path.join(pilot,'renderer-bridge.js'),'utf8');
const pin=/const FRAME_HTML_SHA256='[a-f0-9]{64}';/g;
if([...bridge.matchAll(pin)].length!==1)throw Error('Expected exactly one frame HTML pin in bridge.');
outputs.set('renderer-bridge.js',Buffer.from(bridge.replace(pin,"const FRAME_HTML_SHA256='"+hash(html)+"';")));
// srcdoc inherits its parent's CSP. The local fixture permits only the same
// two pinned frame script bodies; no wildcard, eval or unsafe-inline scripts.
const entry=fs.readFileSync(path.join(pilot,'index.html'),'utf8');
const parentCsp="default-src 'none'; script-src 'self' '"+runtimeIntegrity+"' '"+frameIntegrity+"'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-src 'self'; img-src data: blob:; font-src 'self' data: blob:; object-src 'none'; base-uri 'none'; form-action 'none'";
const cspMeta=/<meta http-equiv="Content-Security-Policy" content="[^"]+">/g;
if([...entry.matchAll(cspMeta)].length!==1)throw Error('Expected one local fixture CSP.');
outputs.set('index.html',Buffer.from(entry.replace(cspMeta,'<meta http-equiv="Content-Security-Policy" content="'+parentCsp+'">')));
for(const name of ['LICENSE','THIRD_PARTY_NOTICES.md','licenses/mtx-decompressor-MPL-2.0.txt','licenses/ECMA-text-copyright-notice.txt']){
  const sourcePath=path.join(source,name);
  outputs.set('vendor/'+name,fs.readFileSync(fs.existsSync(sourcePath)?sourcePath:path.join(pilot,'vendor',name)));
}
const provenance={package:metadata.name,version:metadata.version,sourceSha256:expected,derivation:'hash-pinned browser ESM; exact final export block replaced by private frozen runtime in IIFE; sole optional PDF import.meta.resolve replaced by undefined for classic syntax; LF normalization; no other runtime edits',runtimeSha256:hash(runtime),runtimeIntegrity,frameSha256:hash(frame),frameIntegrity,frameHtmlSha256:hash(html),csp,requiredHeaders:{frame:{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':csp,'X-Content-Type-Options':'nosniff'}},source:'https://www.npmjs.com/package/@aiden0z/pptx-renderer/v/1.3.0',noticeFiles:[...outputs.keys()].filter(name=>name.startsWith('vendor/')&&!name.endsWith('.js'))};
outputs.set('vendor/PROVENANCE.json',Buffer.from(JSON.stringify(provenance,null,2)+'\n'));
for(const [relative,bytes] of outputs){
  const target=path.resolve(pilot,relative);
  if(!target.startsWith(pilot+path.sep))throw Error('Output path escaped pilot.');
  if(check){if(!fs.existsSync(target)||!fs.readFileSync(target).equals(bytes))throw Error('Stale generated file: '+relative);}
  else{fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);}
}
console.log(JSON.stringify({mode:check?'checked':'prepared',files:outputs.size,sourceSha256:expected,runtimeSha256:hash(runtime),frameSha256:hash(frame)}));
