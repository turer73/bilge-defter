'use strict';
// Loopback-only acceptance for normal notebook raster imports. Identities and
// decks are synthetic; no conversion server, private deck, or production data.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const {chromium, webkit} = require('playwright');
const repo = path.resolve(__dirname, '..');
const root = path.resolve(process.env.BILGE_TEST_ROOT || path.join(__dirname, 'bilge-defter-test'));
const out = path.join(repo, 'outputs/pptx-notebook');
const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222';
const engineFilter = process.argv.find(arg => arg.startsWith('--engine='))?.slice(9);
const segment = process.argv.find(arg => arg.startsWith('--segment='))?.slice(10) || 'all';
const caseFilter = process.argv.find(arg => arg.startsWith('--case='))?.slice(7);
const negativeControl = process.argv.find(arg => arg.startsWith('--negative-control='))?.slice(19);
assert.ok(!engineFilter || ['chromium', 'webkit'].includes(engineFilter));
assert.ok(['all', 'helper', 'ui'].includes(segment));
assert.ok(!negativeControl || ['asset-drain','post-commit','lost-ack'].includes(negativeControl));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const report = {startedAt:new Date().toISOString(), root, segment, runnerSha256:sha(fs.readFileSync(__filename)), results:[], boundaries:[
  'Synthetic approved accounts and deterministic two-slide OOXML; no private document or server conversion.',
  'Storage quota/save/conflict failures are explicit fault injection, not a physically full device.',
  'The 96 MiB guard test injects the existing-image budget; it does not allocate a 96 MiB real notebook.',
  'Desktop Playwright WebKit is not physical iPad, Pencil, palm, memory-pressure, or font-fidelity acceptance.',
  'Service workers are disabled here; offline install/update remains a separate acceptance suite.'
]};
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.wasm':'application/wasm','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.txt':'text/plain; charset=utf-8'};
const files = new Map();
function snapshot(folder, prefix='') { for (const entry of fs.readdirSync(folder, {withFileTypes:true})) {
  if (entry.isDirectory()) snapshot(path.join(folder, entry.name), prefix + entry.name + '/');
  else files.set('/' + prefix + entry.name, fs.readFileSync(path.join(folder, entry.name)));
} }
snapshot(root);
const originalHashes=new Map([...files].map(([name,bytes])=>[name,sha(bytes)]));
// Explicit negative controls remove one newly added guard only in the served
// in-memory snapshot. Source files are never modified, and failures stay red.
if(negativeControl){
  const target=negativeControl==='lost-ack'?'/index.html':'/pdf-workspace.js';
  const pattern=negativeControl==='lost-ack'?/^[ \t]*if\(retryMarker&&saveMarker\?\.writer===retryMarker\.writer&&saveMarker\.seq===retryMarker\.seq&&saveMarker\.length===retryMarker\.length\)return;\r?\n/m:
    negativeControl==='post-commit'?/^[ \t]*if\(persisted\)throw Object\.assign\([^\r\n]+\r?\n/m:/^[ \t]*if\(assetSweep\)await assetSweep;\r?\n/m;
  const source=files.get(target).toString();assert.ok(pattern.test(source),'Negative control guard not found; review source drift');files.set(target,Buffer.from(source.replace(pattern,'')));
  report.negativeControl={name:negativeControl,target,sourceSha256:sha(Buffer.from(source)),servedSha256:sha(files.get(target))};
}

// Same minimal package structure as verify-pptx-integration.cjs. ZIP is stored,
// deterministic, and contains no media, macros, external links, or teacher text.
function syntheticDeck() {
  const P='http://schemas.openxmlformats.org/presentationml/2006/main', A='http://schemas.openxmlformats.org/drawingml/2006/main', R='http://schemas.openxmlformats.org/officeDocument/2006/relationships', REL='http://schemas.openxmlformats.org/package/2006/relationships';
  const parts = {
    '[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>'+[1,2].map(n=>`<Override PartName="/ppt/slides/slide${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('')+'</Types>',
    '_rels/.rels':`<Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${R}/officeDocument" Target="ppt/presentation.xml"/></Relationships>`,
    'ppt/presentation.xml':`<p:presentation xmlns:p="${P}" xmlns:r="${R}"><p:sldIdLst><p:sldId id="256" r:id="rId1"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst><p:sldSz cx="9144000" cy="5143500"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`,
    'ppt/_rels/presentation.xml.rels':`<Relationships xmlns="${REL}">`+[1,2].map(n=>`<Relationship Id="rId${n}" Type="${R}/slide" Target="slides/slide${n}.xml"/>`).join('')+'</Relationships>'
  };
  for (const n of [1,2]) parts[`ppt/slides/slide${n}.xml`] = `<p:sld xmlns:p="${P}" xmlns:a="${A}" xmlns:r="${R}"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="${n===1?'D9EAF7':'E2F0D9'}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
  const crc = bytes => { let c=0xffffffff; for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^(c&1?0xedb88320:0);} return(c^0xffffffff)>>>0; };
  const local=[], central=[]; let offset=0;
  for (const [name, text] of Object.entries(parts)) {
    const file=Buffer.from(name), body=Buffer.from(text), sum=crc(body), l=Buffer.alloc(30), c=Buffer.alloc(46);
    l.writeUInt32LE(0x04034b50);l.writeUInt16LE(20,4);l.writeUInt32LE(sum,14);l.writeUInt32LE(body.length,18);l.writeUInt32LE(body.length,22);l.writeUInt16LE(file.length,26);
    c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt32LE(sum,16);c.writeUInt32LE(body.length,20);c.writeUInt32LE(body.length,24);c.writeUInt16LE(file.length,28);c.writeUInt32LE(offset,42);
    local.push(l,file,body);central.push(c,file);offset+=l.length+file.length+body.length;
  }
  const directory=Buffer.concat(central), end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(Object.keys(parts).length,8);end.writeUInt16LE(Object.keys(parts).length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...local,directory,end]);
}
const deck = syntheticDeck();

async function fixture(browser, options={}) {
  let identity=A; const requests=[], external=[], errors=[];
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://loopback'), name=url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname);requests.push({method:req.method,path:name});
    if(req.method!=='GET'){res.writeHead(405);res.end('No uploads');return;}
    if(name==='/api/v1/bilge-defter/whoami'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({account_protocol:'approval-v1',identity:{type:'access',id:identity,status:'approved',role:'student',email:'fixture@example.test'}}));return;}
    const body=files.get(name);if(!body){res.writeHead(404,{'Content-Type':'application/json'});res.end('{}');return;}
    const headers={'Content-Type':types[path.extname(name)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
    if(name==='/pptx/renderer-frame.html'){const match=body.toString().match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/);assert.ok(match);headers['Content-Security-Policy']=match[1];}
    res.writeHead(200,headers);res.end(body);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const context=await browser.newContext({viewport:{width:1180,height:920},hasTouch:true,acceptDownloads:true});
  context.setDefaultTimeout(20000);
  await context.addInitScript(({origin,required})=>{if(window.top!==window||location.origin!==origin)return;window.__accountRequired=required;localStorage.setItem('bilge_defter_onboarding_v1','true');try{delete Navigator.prototype.serviceWorker;}catch{}},{origin,required:options.required!==false});
  await context.route('**/*',route=>{const u=new URL(route.request().url());if(['http:','https:'].includes(u.protocol)&&u.origin!==origin){external.push(u.origin);return route.abort();}return route.continue();});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  const goto=async()=>{
    await page.goto(origin);await page.waitForFunction(()=>typeof ready!=='undefined'&&ready&&window.__v2UI);
    await page.evaluate(async()=>{if(!await flushSave())throw Error('Fixture initial save failed');});
    await page.evaluate(()=>{
      window.__raster=(number=1,total=1,{width=1000,height=563,noise=false}={})=>{
        const surface=document.createElement('canvas');surface.width=width;surface.height=height;const ctx=surface.getContext('2d');
        if(noise){const data=ctx.createImageData(width,height);let n=0x12345678;for(let i=0;i<data.data.length;i+=4){for(let c=0;c<3;c++){n^=n<<13;n^=n>>>17;n^=n<<5;data.data[i+c]=n&255;}data.data[i+3]=255;}ctx.putImageData(data,0,0);}
        else{ctx.fillStyle=number%2?'#d9eaf7':'#e2f0d9';ctx.fillRect(0,0,width,height);ctx.fillStyle='#173b36';ctx.font='28px sans-serif';ctx.fillText('Synthetic slide '+number,40,60);}
        const image=surface.toDataURL('image/png');surface.width=surface.height=1;return {image,width,height,number,total};
      };
      window.__rasterInput=(count=2)=>({name:'Sentetik anatomi.pptx',newNotebook:false,pages:Array.from({length:count},(_,i)=>__raster(i+1,count))});
      window.__rasterAttempt=async(input,ctx=BilgeRasterImport.capture())=>{try{return {result:await BilgeRasterImport.commit(input,ctx),rejected:false};}catch(error){return {rejected:true,name:error.name,message:error.message};}};
      // WebKit may legitimately have no StorageManager on this loopback origin.
      // Fault tests provide only the optional estimate method, then restore the
      // actual absence/value; unrelated tests retain the real browser surface.
      window.__mockEstimate=fn=>{
        if(navigator.storage){const original=navigator.storage.estimate;navigator.storage.estimate=fn;return()=>{navigator.storage.estimate=original;};}
        const original=Object.getOwnPropertyDescriptor(navigator,'storage');Object.defineProperty(navigator,'storage',{configurable:true,value:{estimate:fn}});
        return()=>{if(original)Object.defineProperty(navigator,'storage',original);else delete navigator.storage;};
      };
    });
  };
  return {page,context,origin,requests,external,errors,goto,setIdentity:id=>{identity=id;},finish:async()=>{await context.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}
const memory = p=>p.evaluate(()=>JSON.stringify(state));
const stored = p=>p.evaluate(async()=>JSON.stringify(await dbGet()));
async function unchanged(p,before) { assert.equal(await memory(p),before.memory);assert.equal(await stored(p),before.stored); }
const before = async p=>({memory:await memory(p),stored:await stored(p)});
async function settle(p) { await p.evaluate(async()=>{if(!await flushSave())throw Error('Save failed');if(typeof ensureAssets==='function')await ensureAssets();if(!await flushSave())throw Error('Post-asset save failed');}); }
async function check(browser,engine,name,fn,options) {
  if(caseFilter&&!name.includes(caseFilter))return;
  console.log(`RUN ${engine}: ${name}`);let f;
  try{f=await fixture(browser,options);await f.goto();const detail=await fn(f);assert.deepEqual(f.external,[],'No external request');assert.equal(f.requests.some(r=>r.method!=='GET'||r.path.includes('pdf-tools')),false,'No upload/conversion');assert.deepEqual(f.errors,[],'No unhandled page error');report.results.push({engine,name,passed:true,detail});console.log(`PASS ${engine}: ${name}`);}
  catch(error){report.results.push({engine,name,passed:false,error:String(error.stack||error)});console.error(`FAIL ${engine}: ${name}: ${error.message}`);}
  finally{if(f)await f.finish();}
}
async function draw(p,tool,x=140) {
  await p.evaluate(tool=>document.querySelector(`[data-tool="${tool}"]`).click(),tool);
  await p.waitForFunction(()=>pdfBackgroundReady()&&canEdit());
  const old=await p.evaluate(()=>page().strokes.length);
  await p.locator('#canvas').evaluate((canvas,x)=>{const r=canvas.getBoundingClientRect();for(const[type,dx]of[['pointerdown',0],['pointermove',30],['pointerup',60]])canvas.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:73,pointerType:'pen',button:0,buttons:type==='pointerup'?0:1,isPrimary:true,pressure:.5,clientX:r.left+x+dx,clientY:r.top+130}));},x);
  await p.waitForFunction(n=>page().strokes.length===n+1,old);await settle(p);
}
async function prepared(p) {
  await p.waitForFunction(()=>['ready','error','uncertain'].includes(BilgePptx.snapshot().import?.phase),null,{timeout:60000});
  const status=await p.evaluate(()=>({snapshot:BilgePptx.snapshot(),status:document.querySelector('#pptxNotebookStatus')?.textContent}));
  assert.equal(status.snapshot.import.phase,'ready',JSON.stringify(status));
  assert.equal(await p.locator('#pptxNotebookApply').isEnabled(),true);
}
async function nativeMetadata(p) {
  return p.evaluate(async bytes=>{
    const {createRenderer}=await import('./pptx/renderer-bridge.js'),host=document.createElement('div');host.style.cssText='position:fixed;left:-10000px;width:1000px';document.body.append(host);let renderer;
    try{renderer=await createRenderer(host);const {slideCount,width,height}=await renderer.load(new Uint8Array(bytes).buffer);return{slideCount,width,height};}finally{renderer?.dispose();host.remove();}
  },Array.from(deck));
}

async function helperTests(browser,engine) {
  await check(browser,engine,'approved account capture is scoped and revocable',async({page:p})=>{
    const value=await p.evaluate(()=>{const c=BilgeRasterImport.capture();const valid=BilgeRasterImport.isCurrent(c);BilgeRasterImport.revoke(c);return{captured:!!c,valid,after:BilgeRasterImport.isCurrent(c),scope:DB};});
    assert.deepEqual(value,{captured:true,valid:true,after:false,scope:'bilge-defter-account-'+A});
  });
  await check(browser,engine,'unverified local account cannot capture or import',async({page:p})=>{
    const result=await p.evaluate(async()=>({context:BilgeRasterImport.capture(),attempt:await __rasterAttempt(__rasterInput())}));assert.equal(result.context,null);assert.equal(result.attempt.rejected,true);
  },{required:false});
  await check(browser,engine,'append preserves existing pages and commits recoverable prior copy',async({page:p})=>{
    const previous=await before(p);const result=await p.evaluate(()=>__rasterAttempt(__rasterInput()));assert.equal(result.rejected,false);assert.equal(result.result.ok,true);assert.equal(result.result.count,2);
    const resultState=await p.evaluate(async()=>({state,previous:await dbGet('before-import'),active:page(),editable:canEdit()}));
    assert.deepEqual(resultState.state.pages.slice(0,1),JSON.parse(previous.memory).pages);assert.equal(resultState.state.pages.length,3);assert.deepEqual(resultState.previous,JSON.parse(previous.stored));assert.equal(resultState.active.pdf.number,1);assert.equal(resultState.active.notebookId,'general');assert.equal(resultState.editable,true);assert.equal(resultState.state.version>=2,true);
  });
  await check(browser,engine,'new notebook adds rather than replacing current notebook',async({page:p})=>{
    const existing=JSON.parse(await memory(p));const result=await p.evaluate(()=>__rasterAttempt({...__rasterInput(),newNotebook:true}));assert.equal(result.rejected,false);
    const next=await p.evaluate(()=>({state,activeNotebook}));assert.notEqual(next.activeNotebook,'general');assert.deepEqual(next.state.pages[0],existing.pages[0]);assert.equal(next.state.notebooks.length,1);assert.ok(next.state.pages.slice(1).every(v=>v.notebookId===next.activeNotebook));
  });
  await check(browser,engine,'sequential imports of same dimensions load the second distinct raster',async({page:p})=>{
    assert.equal((await p.evaluate(()=>__rasterAttempt(__rasterInput(1)))).rejected,false);await p.waitForFunction(()=>pdfBackgroundReady());await settle(p);
    const first=await p.evaluate(()=>page().pdf.image);
    const result=await p.evaluate(()=>{const image=__raster(2,2);return __rasterAttempt({name:'second.pptx',newNotebook:false,pages:[{...image,number:1,total:1}]});});assert.equal(result.rejected,false);
    await p.waitForFunction(()=>pdfBackgroundReady());assert.notEqual(await p.evaluate(()=>page().pdf.image),first);assert.equal(await p.evaluate(()=>state.pages.length),3);assert.equal(await p.evaluate(()=>page().pdf.name),'second.pptx');
  });
  await check(browser,engine,'100 pages accepted and 101 pages rejected without partial append',async({page:p})=>{
    const ok=await p.evaluate(()=>__rasterAttempt(__rasterInput(100)));assert.equal(ok.rejected,false);assert.equal(ok.result.count,100);await settle(p);const current=await before(p);
    const bad=await p.evaluate(()=>__rasterAttempt(__rasterInput(101)));assert.equal(bad.rejected,true);await unchanged(p,current);assert.equal(JSON.parse(current.memory).pages.length,101);return{accepted:100,rejected:101};
  });
  await check(browser,engine,'invalid dimensions, numbering and duplicate pages fail closed',async({page:p})=>{
    const current=await before(p);
    const results=await p.evaluate(async()=>{const inputs=[{width:999},{height:99},{height:3001},{number:0},{total:101},{number:2,total:1}];const out=[];for(const override of inputs){const input=__rasterInput(1);Object.assign(input.pages[0],override);out.push(await __rasterAttempt(input));}const duplicate=__rasterInput(2);duplicate.pages[1].number=1;out.push(await __rasterAttempt(duplicate));return out;});
    assert.ok(results.every(x=>x.rejected),JSON.stringify(results));await unchanged(p,current);
  });
  await check(browser,engine,'broken second image never appends first page',async({page:p})=>{
    const current=await before(p);const result=await p.evaluate(()=>{const input=__rasterInput();input.pages[1].image='data:image/png;base64,AAAA';return __rasterAttempt(input);});assert.equal(result.rejected,true);await unchanged(p,current);
  });
  await check(browser,engine,'declared size must match decoded image dimensions',async({page:p})=>{
    const current=await before(p);const result=await p.evaluate(()=>{const input=__rasterInput(1);input.pages[0].height++;return __rasterAttempt(input);});assert.equal(result.rejected,true);await unchanged(p,current);
  });
  await check(browser,engine,'6 MiB single image budget rejects valid oversized raster',async({page:p})=>{
    const current=await before(p);const result=await p.evaluate(async()=>{const image=__raster(1,1,{height:1800,noise:true});return {bytes:image.image.length,attempt:await __rasterAttempt({name:'noise.pptx',newNotebook:false,pages:[image]})};});assert.ok(result.bytes>6*1024*1024);assert.equal(result.attempt.rejected,true);await unchanged(p,current);return{rasterCharacters:result.bytes};
  });
  await check(browser,engine,'24 MiB per import budget counts every incoming page',async({page:p})=>{
    const current=await before(p);const result=await p.evaluate(async()=>{const base=__raster(1,1,{height:900,noise:true}),count=Math.floor(24*1024*1024/base.image.length)+1;const input={name:'noise.pptx',newNotebook:false,pages:Array.from({length:count},(_,i)=>({...base,number:i+1,total:count}))};return {single:base.image.length,total:base.image.length*count,attempt:await __rasterAttempt(input)};});assert.ok(result.single<6*1024*1024);assert.ok(result.total>24*1024*1024);assert.equal(result.attempt.rejected,true);await unchanged(p,current);return{totalRasterCharacters:result.total};
  });
  await check(browser,engine,'96 MiB existing image budget is checked before save',async({page:p})=>{
    const current=await before(p);const result=await p.evaluate(async()=>{const original=notebookImageBytes;notebookImageBytes=()=>96*1024*1024;try{return await __rasterAttempt(__rasterInput(1));}finally{notebookImageBytes=original;}});assert.equal(result.rejected,true);await unchanged(p,current);
  });
  await check(browser,engine,'insufficient estimated quota leaves memory and disk unchanged',async({page:p})=>{
    const current=await before(p);const result=await p.evaluate(async()=>{const restore=__mockEstimate(async()=>({quota:1,usage:1}));try{return await __rasterAttempt(__rasterInput());}finally{restore();}});assert.equal(result.rejected,true);await unchanged(p,current);
  });
  for(const kind of ['QuotaExceededError','NotebookConflict'])await check(browser,engine,kind+' at final save leaves no imported pages',async({page:p})=>{
    const current=await before(p);const result=await p.evaluate(async kind=>{const original=dbPut;let calls=0;dbPut=async()=>{calls++;throw Object.assign(Error('Injected final save failure'),{name:kind});};try{return {attempt:await __rasterAttempt(__rasterInput()),calls};}finally{dbPut=original;}},kind);assert.equal(result.attempt.rejected,true);assert.equal(result.calls,1);await unchanged(p,current);
  });
  await check(browser,engine,'failed pre-import flush cannot discard existing notebook',async({page:p})=>{
    const current=await before(p);const result=await p.evaluate(async()=>{const ctx=BilgeRasterImport.capture(),original=flushSave;flushSave=async()=>false;try{return await __rasterAttempt(__rasterInput(),ctx);}finally{flushSave=original;}});assert.equal(result.rejected,true);await unchanged(p,current);
  });
  await check(browser,engine,'one missing-asset save retries once and succeeds atomically',async({page:p})=>{
    const result=await p.evaluate(async()=>{const original=dbPut;let calls=0;dbPut=async(...args)=>{if(++calls===1)throw Object.assign(Error('asset:'+'0'.repeat(64)),{name:'MissingAsset'});return original(...args);};try{return {attempt:await __rasterAttempt(__rasterInput()),calls};}finally{dbPut=original;}});assert.equal(result.attempt.rejected,false);assert.equal(result.calls,2);assert.equal(await p.evaluate(()=>state.pages.length),3);
  });
  for(const change of ['revision','notebook','revoke','guard'])await check(browser,engine,'stale '+change+' context cannot append',async({page:p})=>{
    const result=await p.evaluate(async change=>{let valid=true;const ctx=BilgeRasterImport.capture({guard:()=>valid});if(change==='revision')editRevision++;if(change==='notebook')activeNotebook='not-the-original-target';if(change==='revoke')BilgeRasterImport.revoke(ctx);if(change==='guard')valid=false;const before=JSON.stringify(state),disk=JSON.stringify(await dbGet());const attempt=await __rasterAttempt(__rasterInput(),ctx);return{attempt,sameMemory:JSON.stringify(state)===before,sameDisk:JSON.stringify(await dbGet())===disk};},change);assert.equal(result.attempt.rejected,true);assert.equal(result.sameMemory,true);assert.equal(result.sameDisk,true);
  });
  await check(browser,engine,'account lock while estimate is pending prevents final write',async f=>{
    const p=f.page,current=await before(p);await p.evaluate(()=>{window.__estimateReached=false;window.__restoreEstimate=__mockEstimate(()=>new Promise(resolve=>{window.__estimateReached=true;window.__releaseEstimate=()=>resolve({quota:2**30,usage:0});}));window.__pendingImport=__rasterAttempt(__rasterInput());});
    await p.waitForFunction(()=>window.__estimateReached);f.setIdentity(B);await p.evaluate(()=>BilgeAccount.check());await p.waitForFunction(()=>BilgeAccount.locked);const result=await p.evaluate(async()=>{__releaseEstimate();try{return await __pendingImport;}finally{__restoreEstimate();}});assert.equal(result.rejected,true);await unchanged(p,current);
  });
  await check(browser,engine,'worker restart adoption rechecks context before posting import',async f=>{
    const p=f.page,current=await before(p);await p.evaluate(()=>{
      window.__startOriginal=startSaveWorker;window.__adoptReached=false;
      startSaveWorker=async(...args)=>{const value=await __startOriginal(...args);if(args[0].type==='adopt')await new Promise(resolve=>{window.__adoptReached=true;window.__releaseAdopt=resolve;});return value;};
      if(saveWorker)saveWorker.terminate();saveWorker=null;workerLost=true;
      window.__pendingImport=__rasterAttempt(__rasterInput());
    });
    await p.waitForFunction(()=>window.__adoptReached);f.setIdentity(B);await p.evaluate(()=>BilgeAccount.check());const result=await p.evaluate(async()=>{__releaseAdopt();try{return await __pendingImport;}finally{startSaveWorker=__startOriginal;}});
    assert.equal(result.rejected,true);assert.equal(result.name,'ImportStale');await unchanged(p,current);
  });
  await check(browser,engine,'main-thread IndexedDB reopen rechecks context before write',async f=>{
    const p=f.page,current=await before(p);await p.evaluate(async()=>{
      if(saveWorker)saveWorker.terminate();saveWorker=null;workerLost=false;storedJSON=latin1JSON(JSON.stringify(await dbGet()));
      window.__withOriginal=withDB;window.__dbReached=false;let first=true;
      withDB=async run=>{if(first){first=false;await new Promise(resolve=>{window.__dbReached=true;window.__releaseDB=resolve;});}return __withOriginal(run);};
      window.__pendingImport=__rasterAttempt(__rasterInput());
    });
    await p.waitForFunction(()=>window.__dbReached);f.setIdentity(B);await p.evaluate(()=>BilgeAccount.check());const result=await p.evaluate(async()=>{__releaseDB();try{return await __pendingImport;}finally{withDB=__withOriginal;}});
    assert.equal(result.rejected,true);assert.equal(result.name,'ImportStale');await unchanged(p,current);
  });
  await check(browser,engine,'late context change after actual commit is reported as committed not retriable',async({page:p})=>{
    const previous=await memory(p);const result=await p.evaluate(async()=>{const lease=BilgeRasterImport.capture(),original=dbPut;let calls=0;dbPut=async(...args)=>{calls++;const result=await original(...args);BilgeRasterImport.revoke(lease);return result;};try{return{attempt:await __rasterAttempt(__rasterInput(),lease),calls};}finally{dbPut=original;}});
    assert.equal(result.attempt.rejected,true);assert.equal(result.attempt.name,'ImportCommitted');assert.equal(result.calls,1);assert.equal(await memory(p),previous);assert.equal(JSON.parse(await stored(p)).pages.length,3);
  });
  await check(browser,engine,'lost worker acknowledgement plus stale lease never sends duplicate import',async({page:p})=>{
    const previous=await memory(p);const result=await p.evaluate(async()=>{
      const lease=BilgeRasterImport.capture(),original=workerPut;let calls=0;
      workerPut=async(...args)=>{calls++;const result=await original(...args);if(calls===1){if(saveWorker)saveWorkerFailed(saveWorker);BilgeRasterImport.revoke(lease);throw Object.assign(Error('Injected acknowledgement loss after real commit'),{name:'SaveWorkerLost'});}return result;};
      try{return{attempt:await __rasterAttempt(__rasterInput(),lease),calls};}finally{workerPut=original;}
    });
    assert.equal(result.attempt.rejected,true);assert.equal(result.attempt.name,'ImportCommitUnknown');assert.equal(result.calls,1);assert.equal(await memory(p),previous);assert.equal(JSON.parse(await stored(p)).pages.length,3);
  });
  await check(browser,engine,'double commit of same context cannot duplicate pages',async({page:p})=>{
    const results=await p.evaluate(async()=>{const c=BilgeRasterImport.capture(),input=__rasterInput();return Promise.all([__rasterAttempt(input,c),__rasterAttempt(input,c)]);});assert.equal(results.filter(r=>!r.rejected).length,1);assert.equal(await p.evaluate(()=>state.pages.length),3);
  });
  await check(browser,engine,'in-flight real asset sweep is drained before import and cannot overwrite appended pages',async({page:p})=>{
    assert.equal((await p.evaluate(()=>__rasterAttempt(__rasterInput(1)))).rejected,false);
    await p.evaluate(()=>{
      window.__assetLease=BilgeRasterImport.capture();if(!__assetLease)throw Error('Expected clean capture before asset sweep');
      clearTimeout(assetTimer);assetTimer=null;window.__assetReached=false;window.__assetDB=withDB;let first=true;
      withDB=async run=>{if(first){first=false;await new Promise(resolve=>{window.__assetReached=true;window.__releaseAsset=resolve;});}return __assetDB(run);};
      window.__heldSweep=ensureAssets();
    });
    await p.waitForFunction(()=>window.__assetReached);
    const attempt=await p.evaluate(async()=>{
      const pending=__rasterAttempt(__rasterInput(),__assetLease);await new Promise(resolve=>setTimeout(resolve,100));
      __releaseAsset();try{await __heldSweep;return await pending;}finally{withDB=__assetDB;}
    });
    assert.equal(attempt.rejected,true);assert.equal(attempt.name,'ImportStale');await settle(p);
    assert.equal(await p.evaluate(()=>state.pages.length),2);assert.equal(JSON.parse(await stored(p)).pages.length,2);
    assert.equal(await p.evaluate(async()=>(await dbGet('before-import')).pages.length),1);
  });
  await check(browser,engine,'render failure after real write is explicitly already committed',async({page:p})=>{
    const previous=await stored(p),result=await p.evaluate(async()=>{
      const render=renderPages,write=dbPut;let calls=0;
      renderPages=()=>{throw Error('Injected post-commit rendering fault');};dbPut=async(...args)=>{calls++;return write(...args);};
      try{return{attempt:await __rasterAttempt(__rasterInput()),calls};}finally{renderPages=render;dbPut=write;}
    });
    assert.equal(result.attempt.rejected,true);assert.equal(result.attempt.name,'ImportCommitted');assert.equal(result.calls,1);
    assert.equal(JSON.parse(await stored(p)).pages.length,3);assert.equal(await p.evaluate(async()=>JSON.stringify(await dbGet('before-import'))),previous);
  });
  await check(browser,engine,'real worker commit with dropped reply is adopted once and retains original recovery copy',async({page:p})=>{
    const previous=await stored(p),result=await p.evaluate(async()=>{
      const worker=saveWorker,put=workerPut;let dropped=0,calls=0;if(!worker)throw Error('Real save worker required');
      workerPut=(...args)=>{calls++;return put(...args);};
      worker.onmessage=event=>{if(!dropped&&event.data.ok&&event.data.id===pendingMarker?.seq){dropped++;saveWorkerFailed(worker);return;}workerReply(event);};
      try{return{attempt:await __rasterAttempt(__rasterInput()),dropped,calls,restarted:saveWorker!==worker};}finally{workerPut=put;}
    });
    assert.equal(result.dropped,1);assert.equal(result.calls,1);assert.equal(result.restarted,true);assert.equal(result.attempt.rejected,false);
    assert.equal(JSON.parse(await stored(p)).pages.length,3);assert.equal(await p.evaluate(async()=>JSON.stringify(await dbGet('before-import'))),previous);
  });
  await check(browser,engine,'normal pen marker eraser undo, JSON restore and reopen retain raster and ink',async({page:p})=>{
    assert.equal((await p.evaluate(()=>__rasterAttempt(__rasterInput()))).rejected,false);await p.waitForFunction(()=>pdfBackgroundReady());
    const backdrop=await p.evaluate(()=>page().pdf.image);await draw(p,'pen');await draw(p,'marker',240);await draw(p,'eraser',340);
    assert.deepEqual(await p.evaluate(()=>page().strokes.map(s=>s.tool)),['pen','marker','eraser']);await p.evaluate(()=>document.querySelector('#undo').click());await settle(p);assert.deepEqual(await p.evaluate(()=>page().strokes.map(s=>s.tool)),['pen','marker']);assert.equal(await p.evaluate(()=>page().pdf.image),backdrop);
    const downloadEvent=p.waitForEvent('download');await p.evaluate(()=>exportNotebook());const download=await downloadEvent;const target=path.join(out,engine+'-normal-notebook.json');await download.saveAs(target);const backup=JSON.parse(fs.readFileSync(target,'utf8'));assert.equal(backup.pages.length,3);assert.ok(backup.pages.filter(x=>x.pdf).every(x=>x.pdf.image.startsWith('data:image/')));assert.equal(backup.pages.find(x=>x.id===backup.active).strokes.length,2);
    await p.evaluate(async backup=>{const parsed=parseBackup(backup);await validatePdfImages(parsed.book);if(!await replaceNotebook(blank(),'Synthetic blank'))throw Error('Blank replacement failed');if(!await replaceNotebook(parsed.book,'Synthetic restore'))throw Error('Backup restore failed');},backup);
    await settle(p);await p.reload();await p.waitForFunction(()=>ready&&pdfBackgroundReady());assert.equal(await p.evaluate(()=>page().pdf.image),backdrop);assert.deepEqual(await p.evaluate(()=>page().strokes.map(s=>s.tool)),['pen','marker']);assert.equal(await p.evaluate(()=>state.pages.length),3);assert.equal(await p.evaluate(()=>canEdit()),true);await p.screenshot({path:path.join(out,engine+'-normal-notebook.png')});
  });
}

async function importDialog(p) {
  await p.evaluate(()=>BilgePptx.importToNotebook());
  await p.locator('#pptxImportDialog[open]').waitFor();
  await p.waitForFunction(()=>BilgePptx.snapshot().import?.phase==='idle');
}
async function choosePresentation(p,name='sentetik-anatomi.pptx') {
  const event=p.waitForEvent('filechooser');await p.locator('#pptxNotebookChoose').click();
  const chooser=await event;assert.equal(chooser.isMultiple(),false);
  await chooser.setFiles({name,mimeType:'application/vnd.openxmlformats-officedocument.presentationml.presentation',buffer:deck});
}
async function importLayout(p) {
  const sizes=await p.locator('#pptxImportDialog').evaluate(dialog=>{
    const r=dialog.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight,client:dialog.clientWidth,scroll:dialog.scrollWidth,documentClient:document.documentElement.clientWidth,documentScroll:document.documentElement.scrollWidth};
  });
  assert.ok(sizes.left>=-1&&sizes.right<=sizes.width+1,JSON.stringify(sizes));
  assert.ok(sizes.top>=-1&&sizes.bottom<=sizes.height+1,JSON.stringify(sizes));
  assert.ok(sizes.scroll<=sizes.client+1&&sizes.documentScroll<=sizes.documentClient+1,JSON.stringify(sizes));
  return sizes;
}
async function uiTests(browser,engine) {
  await check(browser,engine,'simplified insert menu keeps five primary actions and collapses legacy choices',async({page:p})=>{
    const current=await before(p);await p.locator('bilge-defter-ui [data-panel="insert"]').click();
    for(const command of ['insert.text','insert.image','insert.camera','pdf.open','presentation.native'])assert.equal(await p.locator(`bilge-defter-ui [data-command="${command}"]`).isVisible(),true,command);
    const advanced=p.locator('bilge-defter-ui #pptxOtherOptions');assert.equal(await advanced.evaluate(n=>n.open),false);assert.match(await advanced.locator('summary').innerText(),/Diğer sunum seçenekleri/);
    for(const command of ['presentation.library','presentation.open'])assert.equal(await p.locator(`bilge-defter-ui [data-command="${command}"]`).isVisible(),false,command);
    await advanced.locator('summary').click();
    for(const command of ['presentation.library','presentation.open'])assert.equal(await p.locator(`bilge-defter-ui [data-command="${command}"]`).isVisible(),true,command);
    await unchanged(p,current);await p.screenshot({path:path.join(out,engine+'-insert-alternatives.png')});
  });
  await check(browser,engine,'idle import has one primary chooser, named status and closed optional details',async({page:p})=>{
    const current=await before(p);await importDialog(p);
    assert.match(await p.locator('#pptxNotebookChoose').innerText(),/Sunum seç/);assert.equal(await p.locator('#pptxNotebookChoose').isEnabled(),true);
    for(const id of ['pptxNotebookFile','pptxNotebookBackup','pptxNotebookChooseBackup','pptxNotebookSaved','pptxNotebookPrepare'])assert.equal(await p.locator('#'+id).isVisible(),false,id);
    for(const id of ['pptxNotebookLegacy','pptxNotebookInfo'])assert.equal(await p.locator('#'+id).evaluate(n=>n.open),false,id);
    assert.equal(await p.locator('#pptxNotebookApply').isEnabled(),false);assert.equal(await p.locator('#pptxImportDialog').getAttribute('aria-labelledby'),'pptxNotebookTitle');
    assert.equal(await p.locator('#pptxNotebookStatus').getAttribute('role'),'status');assert.equal(await p.locator('#pptxNotebookStatus').getAttribute('aria-live'),'polite');
    await p.screenshot({path:path.join(out,engine+'-import-idle.png')});await p.locator('#pptxNotebookCancel').click();await unchanged(p,current);
  });
  await check(browser,engine,'preparation exposes busy progress without a premature write or always-on retry',async({page:p})=>{
    const current=await before(p);await importDialog(p);let release;const hold=new Promise(r=>{release=r;});
    await p.route('**/pptx/renderer-frame.html',async route=>{await hold;await route.continue();});
    try{const requested=p.waitForRequest('**/pptx/renderer-frame.html');await choosePresentation(p);await requested;await p.waitForFunction(()=>BilgePptx.snapshot().import?.phase==='preparing');
      assert.equal(await p.locator('#pptxNotebookPreview').getAttribute('aria-busy'),'true');assert.notEqual(await p.locator('#pptxImportDialog').getAttribute('aria-busy'),'true','Live status must not be silenced by a busy ancestor');assert.equal(await p.locator('#pptxNotebookProgress').isVisible(),true);
      assert.ok((await p.locator('#pptxNotebookProgress').getAttribute('aria-label'))?.trim(),'Progress has an accessible name');assert.ok((await p.locator('#pptxNotebookStatus').innerText()).trim());
      assert.equal(await p.locator('#pptxNotebookApply').isEnabled(),false);assert.equal(await p.locator('#pptxNotebookCancel').isEnabled(),true);assert.equal(await p.locator('#pptxNotebookPrepare').isVisible(),false);await unchanged(p,current);
      release();await prepared(p);assert.equal(await p.locator('#pptxNotebookPrepare').isVisible(),false);await p.locator('#pptxNotebookCancel').click();await unchanged(p,current);
    }finally{release();}
  });
  await check(browser,engine,'ready import shows filename and page count and follows the new-notebook target',async({page:p})=>{
    const previous=JSON.parse(await memory(p)),name='hedef-kontrol.pptx';await importDialog(p);await choosePresentation(p,name);await prepared(p);
    assert.match(await p.locator('#pptxNotebookFilename').innerText(),/hedef-kontrol\.pptx/);assert.match(await p.locator('#pptxNotebookApply').innerText(),/2/);
    const originalTarget=await p.locator('#pptxNotebookTarget').innerText();assert.match(originalTarget,/Genel/);assert.equal(await p.locator('#pptxNotebookPrepare').isVisible(),false);await p.screenshot({path:path.join(out,engine+'-import-ready.png')});
    await p.locator('#pptxNotebookNew').check();const newTarget=await p.locator('#pptxNotebookTarget').innerText();assert.notEqual(newTarget,originalTarget);assert.match(newTarget,/yeni/i);
    await p.locator('#pptxNotebookNew').uncheck();assert.equal(await p.locator('#pptxNotebookTarget').innerText(),originalTarget);await p.locator('#pptxNotebookNew').check();
    await p.locator('#pptxNotebookApply').click();await p.waitForFunction(()=>canEdit()&&pdfBackgroundReady());const next=await p.evaluate(()=>state);assert.equal(next.pages.length,previous.pages.length+2);assert.deepEqual(next.pages.slice(0,previous.pages.length),previous.pages);assert.ok(next.pages.slice(-2).every(n=>n.notebookId!=='general'));assert.equal(new Set(next.pages.slice(-2).map(n=>n.notebookId)).size,1);
  });
  await check(browser,engine,'selected filename stays literal text and cannot create HTML',async({page:p})=>{
    const name='<img src=x onerror=window.__pptxNameExecuted=1>.pptx';await importDialog(p);await choosePresentation(p,name);await prepared(p);
    const rendered=await p.locator('#pptxNotebookFilename').innerText();assert.ok(rendered.includes('<img'),rendered);assert.equal(await p.locator('#pptxNotebookFilename img').count(),0);assert.equal(await p.evaluate(()=>window.__pptxNameExecuted),undefined);
    assert.equal(await p.locator('#pptxImportDialog img[src="x"]').count(),0);await p.locator('#pptxNotebookCancel').click();
  });
  await check(browser,engine,'390px short viewport keeps the primary CTA reachable without horizontal overflow',async({page:p})=>{
    await p.setViewportSize({width:390,height:480});await importDialog(p);const idle=await importLayout(p);await p.screenshot({path:path.join(out,engine+'-import-390-idle.png')});
    await choosePresentation(p,'anatomi-'+('uzun-dosya-adi-'.repeat(12))+'.pptx');await prepared(p);const ready=await importLayout(p);const button=p.locator('#pptxNotebookApply');await button.scrollIntoViewIfNeeded();
    const hit=await button.evaluate(n=>{const r=n.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return{height:r.height,visible:r.top>=0&&r.bottom<=innerHeight,hit:n===hit||n.contains(hit)};});assert.ok(hit.visible&&hit.hit&&hit.height>=44,JSON.stringify(hit));
    await p.screenshot({path:path.join(out,engine+'-import-390-ready.png')});await button.click();await p.waitForFunction(()=>canEdit()&&pdfBackgroundReady());assert.equal(await p.evaluate(()=>state.pages.length),3);return{idle,ready,button:hit};
  });
  await check(browser,engine,'failed preparation offers a working explicit retry while preserving the notebook',async({page:p})=>{
    const current=await before(p);await importDialog(p);let failed=false;
    await p.route('**/pptx/renderer-frame.html',async route=>{if(!failed){failed=true;return route.fulfill({status:503,contentType:'text/plain',body:'Synthetic one-shot failure'});}return route.continue();});
    await choosePresentation(p);await p.waitForFunction(()=>BilgePptx.snapshot().import?.phase==='error');assert.equal(failed,true);await unchanged(p,current);
    assert.equal(await p.locator('#pptxNotebookApply').isEnabled(),false);assert.equal(await p.locator('#pptxNotebookPrepare').isVisible(),true);assert.equal(await p.locator('#pptxNotebookPrepare').isEnabled(),true);
    await p.screenshot({path:path.join(out,engine+'-import-retry.png')});await p.locator('#pptxNotebookPrepare').click();await prepared(p);assert.equal(await p.locator('#pptxNotebookPrepare').isVisible(),false);await p.locator('#pptxNotebookApply').click();await p.waitForFunction(()=>canEdit()&&pdfBackgroundReady());assert.equal(await p.evaluate(()=>state.pages.length),3);
  });
  await check(browser,engine,'cancel during preparation ignores the late renderer and preserves both stores',async({page:p})=>{
    const current=await before(p);await importDialog(p);let release;const hold=new Promise(r=>{release=r;});
    await p.route('**/pptx/renderer-frame.html',async route=>{await hold;try{await route.continue();}catch{}});
    try{const requested=p.waitForRequest('**/pptx/renderer-frame.html');await choosePresentation(p);await requested;await p.waitForFunction(()=>BilgePptx.snapshot().import?.phase==='preparing');await p.locator('#pptxNotebookCancel').click();release();await p.waitForFunction(()=>!BilgePptx.active&&canEdit());
      // An event-loop drain after the held response ensures late completion cannot append.
      await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await unchanged(p,current);assert.equal(await p.locator('#pptxImportDialog').count(),0);
    }finally{release();}
  });
  await check(browser,engine,'actual Ekle menu imports synthetic PPTX into normal current notebook',async f=>{
    const p=f.page,initial=JSON.parse(await memory(p));await p.locator('bilge-defter-ui [data-panel="insert"]').click();await p.locator('bilge-defter-ui [data-command="presentation.native"]').click();await p.locator('#pptxImportDialog[open]').waitFor();
    assert.equal(await p.locator('#pptxWorkspace').count(),0);await p.waitForFunction(()=>!document.querySelector('#pptxNotebookFile').disabled);await p.locator('#pptxNotebookFile').setInputFiles({name:'sentetik-anatomi.pptx',mimeType:'application/vnd.openxmlformats-officedocument.presentationml.presentation',buffer:deck});
    await prepared(p);assert.deepEqual(JSON.parse(await memory(p)).pages,initial.pages);await p.locator('#pptxNotebookApply').click();await p.waitForFunction(()=>!document.querySelector('#pptxImportDialog')?.open&&canEdit()&&pdfBackgroundReady());
    const next=await p.evaluate(()=>state);assert.equal(next.pages.length,initial.pages.length+2);assert.deepEqual(next.pages.slice(0,initial.pages.length),initial.pages);assert.ok(next.pages.slice(-2).every(x=>x.pdf&&x.notebookId==='general'));await draw(p,'pen');await p.screenshot({path:path.join(out,engine+'-pptx-import-ui.png')});
    const ink=await p.evaluate(()=>JSON.stringify(page().strokes));await p.evaluate(()=>document.querySelector('#pdfExportOpen').click());await p.locator('#pdfExportScope').selectOption('notebook');await p.locator('#pdfExportStart').click();await p.locator('#pdfExportDownload').waitFor({state:'visible'});
    const downloadEvent=p.waitForEvent('download');await p.locator('#pdfExportDownload').click();const download=await downloadEvent,pdfFile=path.join(out,engine+'-imported-notebook.pdf');await download.saveAs(pdfFile);const pdf=fs.readFileSync(pdfFile);assert.equal(pdf.subarray(0,5).toString(),'%PDF-');assert.match(pdf.toString('latin1'),/\/Count\s+2\b/);assert.equal(await p.evaluate(()=>JSON.stringify(page().strokes)),ink);
    return{slides:2,sourceSha256:sha(deck),downloadedPdfBytes:pdf.length,pdfPages:2};
  });
  await check(browser,engine,'cancel prepared PPTX leaves normal notebook untouched',async({page:p})=>{
    const current=await before(p);await p.evaluate(()=>BilgePptx.importToNotebook());await p.locator('#pptxNotebookFile').setInputFiles({name:'cancel.pptx',mimeType:'application/vnd.openxmlformats-officedocument.presentationml.presentation',buffer:deck});await prepared(p);await p.locator('#pptxNotebookCancel').click();await unchanged(p,current);
  });
  await check(browser,engine,'legacy native record remains byte-identical after notebook import',async({page:p})=>{
    const meta=await nativeMetadata(p);
    const original=await p.evaluate(async({bytes,meta})=>{const{openStore}=await import('./pptx/store.js');const s=await openStore(DB,{guard:()=>true});try{const r=await s.create({bytes:new Uint8Array(bytes).buffer,name:'legacy.pptx',meta,notes:[{slide:1,strokes:[{width:2,color:'#173b36',points:[{x:40,y:40}]}]}],notebook:{id:'general',title:'Genel'}});const stored=await s.get(r.id);return{id:r.id,record:JSON.stringify({...stored,bytes:Array.from(new Uint8Array(stored.bytes))})};}finally{s.close();}},{bytes:Array.from(deck),meta});
    await p.evaluate(()=>BilgePptx.importToNotebook());await p.locator('#pptxNotebookLegacy > summary').click();await p.locator('#pptxNotebookSaved').selectOption(original.id);await p.locator('#pptxNotebookLoadSaved').click();await prepared(p);await p.locator('#pptxNotebookApply').click();await p.waitForFunction(()=>canEdit()&&pdfBackgroundReady());
    const result=await p.evaluate(async id=>{const{openStore}=await import('./pptx/store.js');const s=await openStore(DB,{guard:()=>true});try{const r=await s.get(id);return{record:JSON.stringify({...r,bytes:Array.from(new Uint8Array(r.bytes))}),notes:page().strokes};}finally{s.close();}},original.id);assert.equal(result.record,original.record);assert.equal(result.notes.length,1);assert.equal(result.notes[0].tool,'pen');
  });
  await check(browser,engine,'bdpptx upload appends normal pages and selected notes without storing a legacy copy',async({page:p})=>{
    const meta=await nativeMetadata(p);
    const backup=await p.evaluate(async({bytes,meta})=>{const model=await import('./pptx/model.js'),source=new Uint8Array(bytes).buffer;const blob=await model.createBackup({bytes:source,hash:await model.sha256(source),name:'synthetic-backup.pptx',meta,notes:[{slide:1,strokes:[{width:2,color:'#173b36',points:[{x:40,y:40,pressure:.6}]}]}],notebook:{id:'general',title:'Genel'}});return Array.from(new Uint8Array(await blob.arrayBuffer()));},{bytes:Array.from(deck),meta});
    const prior=JSON.parse(await memory(p));await p.evaluate(()=>BilgePptx.importToNotebook());await p.locator('#pptxNotebookLegacy > summary').click();const chooserEvent=p.waitForEvent('filechooser');await p.locator('#pptxNotebookChooseBackup').click();const chooser=await chooserEvent;await chooser.setFiles({name:'synthetic.bdpptx',mimeType:'application/x-bilge-defter-pptx',buffer:Buffer.from(backup)});await prepared(p);assert.equal(await p.locator('#pptxNotebookNotes').isChecked(),true);assert.deepEqual(JSON.parse(await memory(p)).pages,prior.pages);await p.locator('#pptxNotebookApply').click();await p.waitForFunction(()=>canEdit()&&pdfBackgroundReady());
    const result=await p.evaluate(async()=>{const {openStore}=await import('./pptx/store.js'),s=await openStore(DB,{guard:()=>true});try{return{records:(await s.list()).length,pages:state.pages,notes:page().strokes};}finally{s.close();}});assert.equal(result.records,0);assert.equal(result.pages.length,prior.pages.length+2);assert.deepEqual(result.pages.slice(0,prior.pages.length),prior.pages);assert.equal(result.notes.length,1);assert.equal(result.notes[0].tool,'pen');assert.equal(result.notes[0].points[0].p,.5);
  });
}

(async()=>{
  fs.mkdirSync(out,{recursive:true});
  try{for(const[name,engine]of[['chromium',chromium],['webkit',webkit]]){if(engineFilter&&name!==engineFilter)continue;const browser=await engine.launch({headless:true});try{
    const probe=await fixture(browser);try{await probe.goto();assert.equal(await probe.page.evaluate(()=>typeof window.BilgeRasterImport?.commit),'function','Missing BilgeRasterImport helper: run after root implementation/build');}finally{await probe.finish();}
    if(segment!=='ui')await helperTests(browser,name);if(segment!=='helper')await uiTests(browser,name);
  }finally{await browser.close();}}}
  catch(error){report.results.push({engine:'runner',name:'prerequisite/completion',passed:false,error:String(error.stack||error)});console.error(error);}
  finally{report.finishedAt=new Date().toISOString();report.passed=report.results.filter(x=>x.passed).length;report.failed=report.results.filter(x=>!x.passed).length;report.drift=[...originalHashes].filter(([name,hash])=>sha(fs.readFileSync(path.join(root,name)))!==hash).map(([name])=>name);fs.writeFileSync(path.join(out,`results-${segment}${engineFilter?'-'+engineFilter:''}${negativeControl?'-negative-'+negativeControl:''}${caseFilter&&!negativeControl?'-filtered':''}.json`),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,failed:report.failed,drift:report.drift,output:out}));process.exitCode=report.failed||report.drift.length?1:0;}
})();
