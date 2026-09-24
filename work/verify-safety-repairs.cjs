// Isolated browser regression checks. Only synthetic notes and a mocked API.
// No production origin, real account, passphrase or service is contacted.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {chromium}=require('playwright');
const root=path.resolve(process.env.BILGE_TEST_ROOT||path.join(__dirname,'bilge-defter-test'));
const origin='http://127.0.0.1:49201',password='synthetic-only-pass';
const results=[];let browser;
function pass(name){results.push(name);console.log('PASS '+name)}
function encrypted(book){
  const salt=crypto.randomBytes(16),iv=crypto.randomBytes(12),key=crypto.pbkdf2Sync(password,salt,250000,32,'sha256'),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
  const body=Buffer.concat([cipher.update(JSON.stringify(book)),cipher.final(),cipher.getAuthTag()]);
  return {ciphertext:body.toString('base64'),salt:salt.toString('base64'),iv:iv.toString('base64'),kdf:'pbkdf2-sha256-250000',updated_at:new Date().toISOString()};
}
async function fixture(options={}){
  const c=await browser.newContext({serviceWorkers:'block',viewport:{width:1280,height:900}});
  const errors=[],api={data:null,tag:'"one"',cas:true,status:null,posts:0,gets:0,ocrCalls:0,gate:null,ocrGate:null,rejectPost:false,delay:0};
  await c.addInitScript(({mockWorker})=>{
    window.__syncInvited=true;
    const interval=window.setInterval;window.setInterval=(fn,ms,...args)=>{if(ms===5000){window.__testTick=fn;return 999999}return interval(fn,ms,...args)};
    if(mockWorker){
      const worker=new EventTarget();worker.state='installed';worker.postMessage=()=>window.__skipCount=(window.__skipCount||0)+1;window.__testWorker=worker;
      const reg=new EventTarget();reg.waiting=worker;reg.active={state:'activated'};reg.update=async()=>{};
      navigator.serviceWorker.register=async()=>reg;
    }
  },{mockWorker:!!options.mockWorker});
  await c.route('**/*',async route=>{
    const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();
    if(url.pathname.endsWith('/backup')){
      const post=route.request().method()==='POST';if(post)api.posts++;else api.gets++;
      if(api.delay)await new Promise(r=>setTimeout(r,api.delay));
      if(post&&api.gate)await api.gate;
      const headers={'content-type':'application/json',...(api.cas?{'X-Bilge-Sync-Protocol':'cas-v1'}:{}),...(api.data?{ETag:api.tag}:{})};
      if(api.status)return route.fulfill({status:api.status,headers,body:'{}'});
      if(post){
        const h=route.request().headers();
        if(api.rejectPost||(api.data?h['if-match']!==api.tag:h['if-none-match']!=='*'))return route.fulfill({status:412,headers,body:'{}'});
        api.data=route.request().postDataJSON();api.tag='"'+crypto.randomUUID()+'"';
        return route.fulfill({status:200,headers:{...headers,ETag:api.tag},body:'{}'});
      }
      return route.fulfill({status:api.data?200:404,headers,body:JSON.stringify(api.data||{})});
    }
    if(url.pathname.endsWith('/ocr')){api.ocrCalls++;if(api.ocrGate)await api.ocrGate;return route.fulfill({contentType:'application/json',body:JSON.stringify({text:'Sentetik tanıma sonucu'})})}
    if(url.pathname.includes('/api/'))return route.fulfill({status:404,contentType:'application/json',body:'{}'});
    const file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
    const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.wasm':'application/wasm'}[path.extname(file)]||'application/octet-stream';
    return route.fulfill({contentType:mime,body:fs.readFileSync(file)});
  });
  const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto(origin);await p.waitForFunction(()=>typeof ready!=='undefined'&&ready&&window.__v2Bridge);
  return {c,p,api,errors};
}
async function edit(p,title){await p.evaluate(async title=>{page().title=title;scheduleSave();await flushSave()},title)}
async function unlock(p){
  await p.evaluate(()=>document.querySelector('#syncUnlock').click());
  await p.waitForFunction(()=>document.querySelector('#syncPassDialog').open);
  await p.locator('#syncPassInput').fill(password);await p.locator('#syncPassSubmit').click();
  await p.waitForFunction(()=>!document.querySelector('#syncPassDialog').open&&/Eşitleme açık|Eşitleme açılamadı/.test(document.querySelector('#syncAutoStatus').textContent));
}
const tick=p=>p.evaluate(()=>window.__testTick());
async function uiTests(){
  const {c,p,errors}=await fixture();
  const ui=p.locator('bilge-defter-ui');
  await ui.locator('[data-v2-tool="eraser"]').click();assert.equal(await p.evaluate(()=>tool),'eraser');
  await ui.locator('[data-panel="ink"]').click();assert.equal(await ui.locator('[data-width-range]').getAttribute('max'),'64');
  await p.keyboard.press('Escape');await ui.locator('[data-v2-tool="pen"]').click();
  const box=await p.locator('#canvas').boundingBox();await p.mouse.move(box.x+100,box.y+120);await p.mouse.down();await p.mouse.move(box.x+260,box.y+160,{steps:8});await p.mouse.up();
  await p.waitForFunction(()=>page().strokes.length===1);await ui.locator('[data-command="history.undo"]').click();await p.waitForFunction(()=>page().strokes.length===0);pass('Rendered UI: eraser/pen selection, 64px eraser control, drawing and undo work');
  await ui.locator('[data-panel="settings"]').click();assert.equal(await ui.locator('[data-input-pref="lockTouch"]').isDisabled(),true);assert.equal(await ui.locator('[data-input-pref="pressure"]').isDisabled(),true);assert.equal(await ui.locator('[data-input-pref="fingerDraw"]').isDisabled(),false);await p.keyboard.press('Escape');pass('Rendered UI: unavailable touch/pressure switches cannot imply a working setting');
  await ui.locator('[data-panel="insert"]').click();await ui.locator('[data-command="insert.text"]').click();assert.equal(await p.evaluate(()=>mediaPending?.draft.tool),'text');await p.evaluate(()=>cancelMediaMode());pass('Rendered UI: insertion panel closes and starts first placement in one flow');
  await p.evaluate(async()=>{document.querySelector('#newPage').click();await flushSave()});
  const ids=await p.evaluate(()=>state.pages.map(p=>p.id));
  await p.evaluate(id=>window.__v2Bridge.host.commands['library.selectPage']({id}),ids[0]);
  assert.equal(await p.evaluate(()=>activeId),ids[0]);assert.equal(await p.evaluate(()=>pageDialog.open),false);
  await p.evaluate(()=>window.__v2Bridge.host.commands['library.selectPage']({id:'missing'}));assert.equal(await p.evaluate(()=>activeId),ids[0]);pass('UI: page selection changes page, not action menu; invalid IDs rejected');
  await p.evaluate(()=>window.__v2Bridge.host.commands['insert.text']());assert.equal(await p.evaluate(()=>mediaPending?.draft.tool),'text');await p.evaluate(()=>cancelMediaMode());pass('UI: insert text enters first-placement draft');
  const clicks=await p.evaluate(()=>{const ids=['imageAdd','cameraAdd','pdfExportOpen','mediaEdit'];window.__clicks=[];for(const id of ids)document.getElementById(id).onclick=e=>{window.__clicks.push(id);e.preventDefault()};for(const command of ['insert.image','insert.camera','pdf.export','selection.edit'])window.__v2Bridge.host.commands[command]();return window.__clicks});
  assert.deepEqual(clicks,['imageAdd','cameraAdd','pdfExportOpen','mediaEdit']);pass('UI: image/camera/export/layout commands target existing controls');
  await p.evaluate(()=>window.__v2Bridge.host.commands['pdf.open']());assert.equal(await p.evaluate(()=>pdfDialog.open),true);await p.evaluate(()=>pdfDialog.close());pass('UI: PDF entry opens the required import dialog');
  await p.evaluate(async()=>{
    const image=document.createElement('canvas');image.width=1000;image.height=100;
    const book={version:2,pages:[{id:'pdf-fixture',title:'Synthetic PDF',strokes:[],updated:new Date().toISOString(),pdf:{width:1000,height:100,name:'fixture.pdf',number:1,total:1,image:image.toDataURL()},pdfZoom:3,viewX:500}],active:'pdf-fixture'};
    if(!await replaceNotebook(book,'fixture'))throw Error('Fixture import failed');
    window.__v2Bridge.host.commands['view.zoom']({mode:'fit'});await flushSave();
  });
  assert.equal(await p.evaluate(()=>validState(state)&&page().pdfZoom===1&&page().viewX===0),true);await p.reload();await p.waitForFunction(()=>ready);pass('PDF: fit clamps position, saves valid state and reloads successfully');
  assert.equal(await p.evaluate(()=>window.__v2Bridge.host.getState().recovery.available),true);pass('Recovery: bridge exposes the real IndexedDB previous copy');
  const invalid=await p.evaluate(async()=>{const before=JSON.stringify(await dbGet()),bad=structuredClone(state);bad.pages[0].pdfZoom=0;let rejected=false;try{await dbPut(bad)}catch{rejected=true}return rejected&&before===JSON.stringify(await dbGet())});assert.equal(invalid,true);pass('Storage: invalid state cannot replace last valid notebook');
  assert.deepEqual(errors,[]);await c.close();
}
async function syncTests(){
  {
    const {c,p,api,errors}=await fixture();api.cas=false;await unlock(p);await tick(p);assert.equal(api.posts,0);assert.match(await p.locator('#syncAutoStatus').textContent(),/sürüm koruması/);pass('Sync: legacy server cannot enable unsafe automatic or conditional uploads');assert.deepEqual(errors,[]);await c.close();
  }
  {
    const {c,p,api,errors}=await fixture();await edit(p,'LOCAL_OFFLINE');await p.reload();await p.waitForFunction(()=>ready);
    const remote=await p.evaluate(()=>notebookSnapshot());remote.pages[0].title='REMOTE_COPY';api.data=encrypted(remote);
    await unlock(p);await tick(p);assert.equal(await p.evaluate(()=>page().title),'LOCAL_OFFLINE');assert.equal(await p.locator('#syncConflictBanner').isVisible(),true);assert.equal(api.posts,0);pass('Sync: saved offline edits survive reload and remote conflict');assert.deepEqual(errors,[]);await c.close();
  }
  {
    const {c,p,api,errors}=await fixture();await edit(p,'INITIAL');await unlock(p);
    let release;api.gate=new Promise(r=>release=r);const first=tick(p);
    await p.waitForFunction(()=>document.querySelector('#syncUnlock').hidden);while(api.posts===0)await new Promise(r=>setTimeout(r,20));
    await edit(p,'EDIT_DURING_UPLOAD');release();await first;api.gate=null;
    assert.equal(await p.evaluate(async()=>(await dbGet('sync-state-v2')).dirty),true);pass('Sync: upload acknowledgement does not clear later edits');
    await tick(p);assert.equal(api.posts,2);assert.equal(await p.evaluate(async()=>(await dbGet('sync-state-v2')).dirty),false);pass('Sync: next protected upload acknowledges the actual latest notebook');
    await edit(p,'UNSENT');api.status=503;await tick(p);assert.equal(api.posts,2);assert.match(await p.locator('#syncAutoStatus').textContent(),/503/);pass('Sync: failed GET cannot fall through to upload');
    api.status=null;api.rejectPost=true;await tick(p);assert.equal(await p.evaluate(async()=>(await dbGet('sync-state-v2')).dirty),true);assert.match(await p.locator('#syncAutoStatus').textContent(),/412/);pass('Sync: stale conditional upload remains dirty and reports conflict');
    api.rejectPost=false;api.delay=100;const count=api.gets;await Promise.all([tick(p),tick(p),tick(p)]);assert.equal(api.gets-count,1);pass('Sync: overlapping timer ticks are serialized');
    api.delay=0;
    const remote=await p.evaluate(()=>notebookSnapshot());remote.pages[0].title='NEW_REMOTE';api.data=encrypted(remote);api.tag='"remote-two"';
    await p.evaluate(()=>{const decrypt=crypto.subtle.decrypt.bind(crypto.subtle);crypto.subtle.decrypt=async(...args)=>{window.__decryptStarted=true;await new Promise(r=>window.__releaseDecrypt=r);return decrypt(...args)}});
    const pulling=tick(p);await p.waitForFunction(()=>window.__decryptStarted);await edit(p,'EDIT_DURING_PULL');await p.evaluate(()=>window.__releaseDecrypt());await pulling;
    assert.equal(await p.evaluate(()=>page().title),'EDIT_DURING_PULL');assert.equal(await p.locator('#syncConflictBanner').isVisible(),true);pass('Sync: edit during remote decryption prevents replacing the notebook');
    assert.deepEqual(errors,[]);await c.close();
  }
}
async function ocrTests(){
  const {c,p,api,errors}=await fixture();
  await p.evaluate(async()=>{page().strokes=[{tool:'pen',color:'#000000',width:4,points:[{x:20,y:20},{x:20,y:5000}]}];scheduleSave();await flushSave();document.querySelector('#ocrOpen').click()});
  assert.equal(api.ocrCalls,0);const dimensions=await p.locator('#ocrPreview').evaluate(im=>({w:im.naturalWidth,h:im.naturalHeight}));assert.ok(dimensions.w>0&&dimensions.h<=2000);pass('OCR: local preview only; long strokes are fitted without cropping');
  await p.locator('#ocrRetry').click();await p.waitForFunction(()=>document.querySelector('#ocrResult').value==='Sentetik tanıma sonucu');assert.equal(api.ocrCalls,1);pass('OCR: explicit request alone sends synthetic preview to mocked endpoint');
  await p.locator('#ocrInsert').click();assert.equal(await p.evaluate(()=>mediaPending?.draft.text),'Sentetik tanıma sonucu');assert.equal(await p.evaluate(()=>page().strokes.length),1);await p.evaluate(()=>cancelMediaMode());pass('OCR: result enters editable first placement; original ink stays intact');
  await p.evaluate(async()=>{page().strokes=[{tool:'pen',color:'#000000',width:4,points:[{x:30,y:30},{x:100,y:30}]},{tool:'eraser',color:'#000000',width:30,points:[{x:30,y:30},{x:100,y:30}]}];scheduleSave();await flushSave();document.querySelector('#ocrOpen').click()});
  assert.equal(await p.locator('#ocrPreview').isVisible(),false);assert.equal(await p.locator('#ocrRetry').isDisabled(),true);pass('OCR: fully erased strokes are not resurrected or sent');
  await p.locator('#ocrClose').click();
  await p.evaluate(async()=>{page().strokes.pop();scheduleSave();await flushSave();document.querySelector('#ocrOpen').click()});
  let release;api.ocrGate=new Promise(r=>release=r);await p.locator('#ocrRetry').click();while(api.ocrCalls<2)await new Promise(r=>setTimeout(r,20));
  await p.locator('#ocrClose').click();await p.evaluate(()=>document.querySelector('#ocrOpen').click());release();await p.waitForTimeout(100);assert.equal(await p.locator('#ocrResult').inputValue(),'');pass('OCR: closing/reopening rejects a late response from the old request');
  assert.deepEqual(errors,[]);await c.close();
}
async function pwaTests(){
  const {c,p,errors}=await fixture({mockWorker:true});await p.waitForFunction(()=>!document.querySelector('#pwaCheck').disabled);
  await p.evaluate(()=>{document.querySelector('#textAdd').click();document.querySelector('#pwaCheck').click()});
  assert.equal(await p.evaluate(()=>window.__skipCount||0),0);assert.ok(await p.evaluate(()=>!!mediaPending));pass('PWA: uncommitted placement blocks update activation and keeps draft');
  await p.evaluate(()=>{cancelMediaMode();window.__unsafeUpdateRevision=editRevision;document.querySelector('#pwaCheck').click()});await p.waitForFunction(()=>window.__skipCount===1);
  await p.evaluate(()=>{page().title='EDIT_AFTER_UPDATE_CLICK';markChanged();window.__testWorker.state='activated';window.__testWorker.dispatchEvent(new Event('statechange'))});
  assert.equal(await p.evaluate(()=>page().title),'EDIT_AFTER_UPDATE_CLICK');assert.match(await p.locator('#pwaUpdate').textContent(),/Açık düzenleme korundu/);pass('PWA: edit made during activation prevents forced reload');
  assert.deepEqual(errors,[]);await c.close();
}
async function offlinePackageTest(){
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'offline-assets.json'),'utf8'));
  for(const asset of manifest.files)assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,asset.path))).digest('hex'),asset.sha256,asset.path);
  pass(`Package: all ${manifest.files.length} offline asset hashes match`);
  const server=require('node:http').createServer((req,res)=>{
    try{
      const url=new URL(req.url,'http://local'),file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
      if(!file.startsWith(root+path.sep))throw Error('path');
      const body=fs.readFileSync(file),type={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.wasm':'application/wasm'}[path.extname(file)]||'application/octet-stream';
      res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});res.end(body);
    }catch{res.writeHead(404);res.end()}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));let c;
  try{
    const url=`http://127.0.0.1:${server.address().port}`;c=await browser.newContext({viewport:{width:1180,height:820}});
    const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(url);await p.waitForFunction(()=>ready&&window.__v2Bridge);
    assert.equal(await p.locator('bilge-defter-ui .brand').isVisible(),true);await p.locator('bilge-defter-ui [data-panel="settings"]').click();await p.keyboard.press('Escape');
    const shot=path.resolve(__dirname,`../outputs/bilge-defter-${manifest.version}-local.png`);await p.screenshot({path:shot,fullPage:true});
    // Do not use an async polling predicate: a truthy Promise can finish the
    // poll while the worker is still installing. Await the lifecycle directly.
    await p.evaluate(async()=>{let timer;try{await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Worker activation timed out')),60000)})])}finally{clearTimeout(timer)}});
    const cacheState=await p.evaluate(async version=>{const keys=await caches.keys(),key=keys.find(k=>k.endsWith('-'+version)),reg=await navigator.serviceWorker.getRegistration();return {keys,active:reg?.active?.state,installing:reg?.installing?.state,files:(await(await caches.open(key)).keys()).map(r=>new URL(r.url).pathname.slice(1))}},manifest.version);
    if(cacheState.files.length!==manifest.files.length)console.log('CACHE_DIAGNOSTIC',JSON.stringify({...cacheState,files:undefined,missing:manifest.files.filter(f=>!cacheState.files.includes(f.path)).map(f=>f.path)}));
    assert.equal(cacheState.files.length,manifest.files.length);pass('Real PWA: local page renders, navigation works, all assets install in Chromium');
    await edit(p,'OFFLINE_SYNTHETIC_NOTE');await p.reload();await p.waitForFunction(()=>ready&&navigator.serviceWorker.controller);
    await c.setOffline(true);await p.reload();await p.waitForFunction(()=>ready);assert.equal(await p.evaluate(()=>page().title),'OFFLINE_SYNTHETIC_NOTE');assert.equal(await p.locator('bilge-defter-ui .brand').isVisible(),true);pass('Real PWA: installed package reloads offline with saved synthetic note');
    await p.setViewportSize({width:390,height:844});await p.locator('bilge-defter-ui [data-panel="settings"]').click();
    await p.screenshot({path:path.resolve(__dirname,`../outputs/bilge-defter-${manifest.version}-mobile-local.png`),fullPage:true});
    const box=await p.locator('bilge-defter-ui dialog[data-panel="settings"]').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=391);pass('Responsive UI: settings panel stays within 390px simulated viewport');
    assert.deepEqual(errors,[]);
  }finally{await c?.close();await new Promise(r=>server.close(r))}
}
(async()=>{try{browser=await chromium.launch({headless:true});await uiTests();await syncTests();await ocrTests();await pwaTests();if(process.env.BILGE_SKIP_OFFLINE!=='1')await offlinePackageTest();console.log(JSON.stringify({root,passed:results.length,failed:0,offlinePackageTest:process.env.BILGE_SKIP_OFFLINE==='1'?'not run':'passed',syntheticOnly:true}));}catch(error){console.error(error);process.exitCode=1}finally{await browser?.close()}})();
