'use strict';
// Real published v76 reads a v77-written normal notebook on the SAME origin,
// account and IndexedDB. No transformed old source and no private document.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const repo=path.resolve(__dirname,'..'),out=path.join(repo,'outputs/pptx-v77-release/notebook-compat');
const candidate=path.resolve(process.env.BILGE_TEST_ROOT||path.join(__dirname,'bilge-defter-invited-v77'));
const oldRoot=path.join(repo,'outputs/pptx-v77-release/v76-baseline/package');
const oldCommit='811d089044df8fe4fcad2698bd0532047f2acc31';
const oldManifest='e81d8d6236fbda48cdeb02b8d1f216227cab39ab3fa91587e01f263d3b75688a';
const account='11111111-1111-4111-8111-111111111111',sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const engine=process.argv.find(s=>s.startsWith('--engine='))?.slice(9);assert.ok(!engine||['chromium','webkit'].includes(engine));
const report={startedAt:new Date().toISOString(),runnerSha256:sha(fs.readFileSync(__filename)),results:[],snapshots:[],boundaries:[
  'Loopback HTTP with synthetic approved whoami; not real Cloudflare Access login.',
  'Two-slide deterministic PPTX uses actual v77 main import UI; no private document, upload, PDF or external network.',
  'Published v76 bytes are unmodified; app server switches packages without changing browser origin, account or IndexedDB.',
  'Service workers are disabled. This is persisted-data rollback compatibility, not service-worker downgrade/update acceptance.',
  'Desktop WebKit is not physical iPad, Apple Pencil, palm or memory-pressure acceptance.'
]};
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.wasm':'application/wasm','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.txt':'text/plain; charset=utf-8'};
function snapshot(dir,version){
  const files=new Map();function walk(folder,prefix=''){for(const e of fs.readdirSync(folder,{withFileTypes:true}))e.isDirectory()?walk(path.join(folder,e.name),prefix+e.name+'/'):files.set('/'+prefix+e.name,fs.readFileSync(path.join(folder,e.name)));}walk(dir);
  const manifest=JSON.parse(files.get('/offline-assets.json'));assert.equal(manifest.version,version);
  for(const f of manifest.files)assert.equal(sha(files.get('/'+f.path)),f.sha256,version+': '+f.path);
  if(version==='v76')assert.equal(sha(files.get('/SHA256SUMS')),oldManifest,'Actual published v76 manifest required; do not regenerate from candidate');
  report.snapshots.push({root:dir,version,commit:version==='v76'?oldCommit:undefined,manifestSha256:sha(files.get('/SHA256SUMS')),offlineSha256:sha(files.get('/offline-assets.json')),assets:manifest.files.length});
  return{dir,files,version};
}
function deck(){
  const P='http://schemas.openxmlformats.org/presentationml/2006/main',A='http://schemas.openxmlformats.org/drawingml/2006/main',R='http://schemas.openxmlformats.org/officeDocument/2006/relationships',REL='http://schemas.openxmlformats.org/package/2006/relationships';
  const parts={
    '_rels/.rels':`<Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${R}/officeDocument" Target="ppt/presentation.xml"/></Relationships>`,
    'ppt/presentation.xml':`<p:presentation xmlns:p="${P}" xmlns:r="${R}"><p:sldIdLst><p:sldId id="256" r:id="rId1"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst><p:sldSz cx="9144000" cy="5143500"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`,
    'ppt/_rels/presentation.xml.rels':`<Relationships xmlns="${REL}">`+[1,2].map(n=>`<Relationship Id="rId${n}" Type="${R}/slide" Target="slides/slide${n}.xml"/>`).join('')+'</Relationships>'
  };
  parts['[Content_Types].xml']='<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>'+[1,2].map(n=>`<Override PartName="/ppt/slides/slide${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('')+'</Types>';
  for(const n of[1,2])parts[`ppt/slides/slide${n}.xml`]=`<p:sld xmlns:p="${P}" xmlns:a="${A}" xmlns:r="${R}"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="${n===1?'D9EAF7':'E2F0D9'}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
  const crc=bytes=>{let n=0xffffffff;for(const b of bytes){n^=b;for(let i=0;i<8;i++)n=(n>>>1)^(n&1?0xedb88320:0);}return(n^0xffffffff)>>>0;};
  const local=[],central=[];let offset=0;for(const[name,text]of Object.entries(parts)){const filename=Buffer.from(name),body=Buffer.from(text),sum=crc(body),l=Buffer.alloc(30),c=Buffer.alloc(46);l.writeUInt32LE(0x04034b50);l.writeUInt16LE(20,4);l.writeUInt32LE(sum,14);l.writeUInt32LE(body.length,18);l.writeUInt32LE(body.length,22);l.writeUInt16LE(filename.length,26);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt32LE(sum,16);c.writeUInt32LE(body.length,20);c.writeUInt32LE(body.length,24);c.writeUInt16LE(filename.length,28);c.writeUInt32LE(offset,42);local.push(l,filename,body);central.push(c,filename);offset+=l.length+filename.length+body.length;}
  const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(Object.keys(parts).length,8);end.writeUInt16LE(Object.keys(parts).length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...local,directory,end]);
}
async function settle(p){await p.evaluate(async()=>{if(!await flushSave())throw Error('Pre-asset save failed');await ensureAssets();if(!await flushSave())throw Error('Post-asset save failed');});}
async function draw(p,which='pen',x=140){
  await p.evaluate(which=>document.querySelector(`[data-tool="${which}"]`).click(),which);
  await p.waitForFunction(()=>canEdit()&&(!page().pdf||pdfBackgroundReady()));const count=await p.evaluate(()=>page().strokes.length);
  await p.locator('#canvas').evaluate((canvas,x)=>{const r=canvas.getBoundingClientRect();for(const[type,dx]of[['pointerdown',0],['pointermove',30],['pointerup',60]])canvas.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:73,pointerType:'pen',button:0,buttons:type==='pointerup'?0:1,isPrimary:true,pressure:.5,clientX:r.left+x+dx,clientY:r.top+130}));},x);
  await p.waitForFunction(n=>page().strokes.length===n+1,count);await settle(p);
}
async function summary(p){return p.evaluate(async()=>({version:APP_VERSION,db:DB,schema:state.version,active:activeId,book:activeNotebook,notebooks:state.notebooks,pages:state.pages.map(({updated,...p})=>p),previous:JSON.stringify(await dbGet('before-import')),editable:canEdit(),valid:validState(state)}));}
function sameBook(actual,expected){for(const k of['db','schema','active','book','notebooks','pages'])assert.deepEqual(actual[k],expected[k],k);assert.equal(actual.valid,true);assert.equal(actual.editable,true);}
async function run(browserType,name,current,old){
  let live=current,browser,context,server;const errors=[],external=[],requests=[];
  const stage=async(label,fn)=>{try{const detail=await fn();report.results.push({engine:name,name:label,passed:true,detail});console.log('PASS '+name+': '+label);}catch(error){report.results.push({engine:name,name:label,passed:false,error:String(error.stack||error)});console.error('FAIL '+name+': '+label+' '+error.message);throw error;}};
  try{
    server=http.createServer((req,res)=>{const u=new URL(req.url,'http://loopback'),key=u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname);requests.push({method:req.method,path:key,package:live.version});if(req.method!=='GET'){res.writeHead(405);res.end('No uploads');return;}if(key==='/api/v1/bilge-defter/whoami'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({account_protocol:'approval-v1',identity:{type:'access',id:account,status:'approved',role:'student',email:'fixture@example.test'}}));return;}const body=live.files.get(key);if(!body){res.writeHead(404,{'Content-Type':'application/json'});res.end('{}');return;}const headers={'Content-Type':types[path.extname(key)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};if(key==='/pptx/renderer-frame.html'){const csp=body.toString().match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/);assert.ok(csp);headers['Content-Security-Policy']=csp[1];}res.writeHead(200,headers);res.end(body);});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
    browser=await browserType.launch({headless:true});context=await browser.newContext({viewport:{width:1180,height:920},hasTouch:true,acceptDownloads:true});context.setDefaultTimeout(20000);
    await context.addInitScript(origin=>{if(window.top!==window||location.origin!==origin)return;window.__accountRequired=true;localStorage.setItem('bilge_defter_onboarding_v1','true');try{delete Navigator.prototype.serviceWorker;}catch{}},origin);
    await context.route('**/*',route=>{const u=new URL(route.request().url());if(['http:','https:'].includes(u.protocol)&&u.origin!==origin){external.push(u.origin);return route.abort();}return route.continue();});
    let p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
    const goto=async version=>{await p.goto(origin+'/?compat='+version);await p.waitForFunction(()=>typeof ready!=='undefined'&&ready&&window.__v2UI&&canEdit());assert.equal(await p.evaluate(()=>APP_VERSION),version);assert.equal(await p.evaluate(()=>DB),'bilge-defter-account-'+account);};
    await goto('v77');await settle(p);await draw(p);const initial=await summary(p),initialStored=await p.evaluate(async()=>JSON.stringify(await dbGet()));let backup,expected;
    await stage('v77 actual PPTX import appends two normal pages and keeps original page',async()=>{
      const bytes=deck();await p.evaluate(()=>BilgePptx.importToNotebook());await p.locator('#pptxImportDialog[open]').waitFor();await p.locator('#pptxNotebookFile').setInputFiles({name:'rollback-anatomi.pptx',mimeType:'application/vnd.openxmlformats-officedocument.presentationml.presentation',buffer:bytes});
      await p.waitForFunction(()=>['ready','error','uncertain'].includes(BilgePptx.snapshot().import?.phase),null,{timeout:60000});assert.equal(await p.evaluate(()=>BilgePptx.snapshot().import.phase),'ready');
      await p.locator('#pptxNotebookApply').click();await p.waitForFunction(()=>!document.querySelector('#pptxImportDialog')?.open&&canEdit()&&pdfBackgroundReady());
      const book=await summary(p);assert.equal(book.pages.length,3);assert.deepEqual(book.pages[0],initial.pages[0]);assert.ok(book.pages.slice(1).every(v=>v.pdf.name==='rollback-anatomi.pptx'));return{slides:2,pages:3,sourceSha256:sha(bytes)};
    });
    await stage('v77 normal pen and marker persist with migrated assets and JSON backup',async()=>{
      await draw(p,'pen');await draw(p,'marker',240);await settle(p);expected=await summary(p);
      const saved=await p.evaluate(async()=>({record:await dbGet(),previous:await inflateRecord(await dbGet('before-import'))}));
      assert.equal(expected.previous,initialStored,'Exact pre-import record must survive asset migration');
      assert.equal(saved.previous.pages.length,1);assert.deepEqual(saved.previous.pages[0].strokes,initial.pages[0].strokes);
      const refs=saved.record.pages.filter(v=>v.pdf).map(v=>v.pdf.image);assert.equal(new Set(refs).size,2);assert.ok(refs.every(v=>/^asset:[0-9a-f]{64}$/.test(v)));
      const download=p.waitForEvent('download');await p.evaluate(()=>exportNotebook());const file=await download;const target=path.join(out,name+'-v77.json');await file.saveAs(target);backup=JSON.parse(fs.readFileSync(target,'utf8'));
      assert.equal(backup.appVersion,'v77');assert.equal(backup.pages.length,3);assert.ok(backup.pages.filter(v=>v.pdf).every(v=>v.pdf.image.startsWith('data:image/png;base64,')));assert.deepEqual(backup.pages.find(v=>v.id===backup.active).strokes.map(v=>v.tool),['pen','marker']);return{schema:expected.schema,assetCount:refs.length,backupVersion:backup.backupVersion,backupSha256:sha(fs.readFileSync(target))};
    });
    await stage('published v76 opens same account IndexedDB including PPTX-named backgrounds and ink',async()=>{
      live=old;await goto('v76');await p.waitForFunction(()=>pdfBackgroundReady());await settle(p);const actual=await summary(p);sameBook(actual,expected);assert.equal(actual.previous,expected.previous);
      await p.screenshot({path:path.join(out,name+'-v76-rollback.png')});return{origin,db:actual.db,pages:actual.pages.length,manifest:oldManifest};
    });
    await stage('v76 can add normal ink without losing backgrounds or before-import recovery copy',async()=>{
      await draw(p,'pen',340);const updated=await summary(p);assert.equal(updated.pages.find(v=>v.id===updated.active).strokes.length,3);assert.deepEqual(updated.pages.map(v=>v.pdf),expected.pages.map(v=>v.pdf));assert.equal(updated.previous,expected.previous);expected=updated;
      await p.reload();await p.waitForFunction(()=>ready&&canEdit()&&pdfBackgroundReady());sameBook(await summary(p),expected);return{activeStrokeCount:3};
    });
    await stage('v76 accepts and restores v77 JSON backup after a deliberate blank replacement',async()=>{
      await p.evaluate(async backup=>{const parsed=parseBackup(backup);await validatePdfImages(parsed.book);if(!await replaceNotebook(blank(),'Fixture blank'))throw Error('Blank replacement rejected');if(!await replaceNotebook(parsed.book,'Fixture v77 restore'))throw Error('v77 backup rejected');},backup);
      await settle(p);const actual=await summary(p);assert.deepEqual(actual.pages,backup.pages.map(({updated,...v})=>v));assert.equal(actual.active,backup.active);assert.equal(actual.schema,backup.version);assert.equal(actual.editable,true);expected=actual;return{backupVersion:backup.backupVersion,pages:actual.pages.length};
    });
    await stage('restored v76 notebook reopens and remains readable when upgraded to v77 again',async()=>{
      await draw(p,'pen',340);expected=await summary(p);await p.reload();await p.waitForFunction(()=>ready&&canEdit()&&pdfBackgroundReady());sameBook(await summary(p),expected);
      live=current;await goto('v77');await p.waitForFunction(()=>pdfBackgroundReady());await settle(p);sameBook(await summary(p),expected);return{pages:expected.pages.length,finalActiveStrokeCount:expected.pages.find(v=>v.id===expected.active).strokes.length};
    });
    await stage('rollback run has no outside requests, uploads or unhandled page errors',async()=>{assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.ok(requests.every(r=>r.method==='GET'));assert.equal(requests.some(r=>r.path.includes('pdf-tools')),false);return{requests:requests.length};});
  }catch(error){if(!report.results.some(r=>r.engine===name&&!r.passed))report.results.push({engine:name,name:'setup',passed:false,error:String(error.stack||error)});}
  finally{await context?.close();await browser?.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
}
(async()=>{
  fs.mkdirSync(out,{recursive:true});const current=snapshot(candidate,'v77'),old=snapshot(oldRoot,'v76');
  for(const[name,type]of[['chromium',chromium],['webkit',webkit]])if(!engine||engine===name)await run(type,name,current,old);
  report.drift=[];for(const snap of[current,old])for(const[name,bytes]of snap.files){const file=path.join(snap.dir,name.slice(1));if(!fs.existsSync(file)||sha(fs.readFileSync(file))!==sha(bytes))report.drift.push({version:snap.version,path:name});}
  report.finishedAt=new Date().toISOString();report.passed=report.results.filter(r=>r.passed).length;report.failed=report.results.filter(r=>!r.passed).length;
  fs.writeFileSync(path.join(out,'results'+(engine?'-'+engine:'')+'.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,failed:report.failed,drift:report.drift}));if(report.failed||report.drift.length)process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
