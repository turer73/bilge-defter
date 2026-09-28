'use strict';
// v67 sync on a new device. A device nobody has written in on (one empty page, no receipt)
// takes the server copy without a conflict banner and without uploading; a device with ink
// still gets the banner, now with both dates, and "Yereldekini gönder" asks before it replaces
// the only server copy; a manual "Sunucuya yedekle" records its receipt so the next idle check
// does not raise a conflict against our own upload. In-memory CAS server, no iPad.
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),{chromium,webkit}=require('playwright');
const root=path.resolve(process.env.BILGE_TEST_ROOT||path.join(__dirname,'bilge-defter-invited-v67'));
const out=path.resolve(process.env.BILGE_TEST_OUTPUT||path.join(__dirname,'../outputs/v67-sync'));
const origin='http://127.0.0.1:49393';fs.mkdirSync(out,{recursive:true});
const results=[];const pass=s=>{results.push(s);console.log('PASS '+s)};
const PASS='sentetik-parola-123',enc=new TextEncoder(),dec=new TextDecoder();
const b64=b=>Buffer.from(b).toString('base64'),fromB64=s=>Uint8Array.from(Buffer.from(s,'base64'));
async function key(salt){const km=await crypto.subtle.importKey('raw',enc.encode(PASS),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:250000,hash:'SHA-256'},km,{name:'AES-GCM',length:256},false,['encrypt','decrypt'])}
async function encrypt(book,updatedAt){const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(salt),enc.encode(JSON.stringify(book)));return {ciphertext:b64(new Uint8Array(ct)),iv:b64(iv),salt:b64(salt),kdf:'pbkdf2-sha256-250000',updated_at:updatedAt}}
async function decrypt(data){return JSON.parse(dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:fromB64(data.iv)},await key(fromB64(data.salt)),fromB64(data.ciphertext))))}
const serverBook={version:1,pages:[{id:'srv-1',title:'Anatomi 1',strokes:[{tool:'pen',color:'#173b36',width:2,points:[{x:40,y:60},{x:120,y:64}]}],updated:'2026-09-20T09:00:00.000Z'},{id:'srv-2',title:'Anatomi 2',strokes:[],updated:'2026-09-20T09:30:00.000Z'}],active:'srv-1'};
async function session(browser,server){
 const context=await browser.newContext({viewport:{width:1180,height:820},serviceWorkers:'block'}),errors=[];
 context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
 await context.addInitScript(o=>{if(location.origin===o){window.__accountRequired=false;localStorage.setItem('bilge_defter_onboarding_v1','true')}},origin);
 await context.route('**/*',async r=>{
  const u=new URL(r.request().url());if(u.origin!==origin)return r.abort();
  if(u.pathname.endsWith('/api/v1/bilge-defter/backup')){
   const headers={'X-Bilge-Sync-Protocol':'cas-v1',...(server.tag?{ETag:server.tag}:{})};
   if(r.request().method()==='POST'){
    const h=r.request().headers();
    if(server.remote&&h['if-match']!==server.tag)return r.fulfill({status:412,headers,contentType:'application/json',body:'{}'});
    if(!server.remote&&h['if-none-match']!=='*')return r.fulfill({status:412,headers,contentType:'application/json',body:'{}'});
    server.posts++;server.remote=JSON.parse(r.request().postData());server.tag=`"${server.posts+1}"`;
    return r.fulfill({status:200,headers:{...headers,ETag:server.tag},contentType:'application/json',body:'{"status":"ok"}'});
   }
   server.gets++;
   if(!server.remote)return r.fulfill({status:404,headers,contentType:'application/json',body:'{}'});
   return r.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify(server.remote)});
  }
  const f=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));
  return f.startsWith(root+path.sep)&&fs.existsSync(f)?r.fulfill({path:f}):r.fulfill({status:404,body:''});
 });
 const p=await context.newPage();await p.goto(origin);await p.waitForFunction(()=>typeof ready!=='undefined'&&ready&&window.__v2UI);
 return {context,p,errors};
}
const stroke=(p,x)=>p.locator('#canvas').evaluate((c,x)=>{const r=c.getBoundingClientRect();for(const [type,dx] of [['pointerdown',0],['pointermove',40],['pointerup',80]])c.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:7,pointerType:'pen',clientX:r.x+x+dx,clientY:r.y+200,buttons:type==='pointerup'?0:1,pressure:.5}))},x);
const settled=p=>p.waitForFunction(()=>!isDirty()&&!savePromise,null,{timeout:10000});
const poll=async p=>{await p.evaluate(()=>{nextPollAt=0;document.dispatchEvent(new Event('visibilitychange'))});await p.waitForTimeout(700)};
async function unlock(p){
 await p.locator('bilge-defter-ui [data-panel="file"]').click();await p.locator('bilge-defter-ui [data-command="backup.status"]').click();await p.locator('#reliabilityDialog').waitFor();
 await p.evaluate(()=>{window.__syncInvited=true;renderSyncActions()});await p.locator('#syncUnlock').click();
 await p.locator('#syncPassInput').fill(PASS);await p.locator('#syncPassSubmit').click();
 await p.waitForFunction(()=>document.querySelector('#syncAutoStatus').textContent.includes('Eşitleme açık')||document.querySelector('#syncAutoStatus').textContent.includes('açılacak'));
 const status=await p.locator('#syncAutoStatus').textContent();await p.locator('#reliabilityClose').click();return status;
}
const bannerOpen=p=>p.evaluate(()=>document.querySelector('#syncConflictBanner').dataset.open==='1');
const stored=p=>p.evaluate(async()=>{const d=await dbGet();return {titles:d.pages.map(x=>x.title),strokes:d.pages.map(x=>x.strokes.length),receipt:await dbGet('sync-state-v2')}});
async function run(browser,name){
 {// S1: pristine new device, server has a notebook.
  const server={remote:await encrypt(serverBook,'2026-09-20T09:30:00.000Z'),tag:'"1"',posts:0,gets:0};
  const {context,p,errors}=await session(browser,server);
  const status=await unlock(p);
  // Behaviour first, wording second: on the previous build this stops at the banner assertion.
  await poll(p);await p.waitForFunction(()=>document.querySelector('#syncAutoStatus').textContent.includes('son:')||document.querySelector('#syncConflictBanner').dataset.open==='1',null,{timeout:10000});
  assert.equal(await bannerOpen(p),false,'a never-written device must not be asked to resolve a conflict');
  const s=await stored(p);assert.deepEqual(s.titles,['Anatomi 1','Anatomi 2']);assert.deepEqual(s.strokes,[1,0]);assert.equal(s.receipt?.tag,'"1"');
  assert.equal(server.posts,0);assert.match(status,/Sunucudaki yedek \(.+\) bu cihaza açılacak/);
  // The empty notebook it replaced is not kept as a recovery copy (restoring it would invite pushing an empty notebook).
  assert.equal(await p.evaluate(async()=>(await dbGet('before-import'))===undefined),true);assert.equal(await p.evaluate(()=>document.querySelector('#restorePrevious').disabled),true);
  assert.equal(await p.evaluate(()=>page().strokes.length),1);
  await p.screenshot({path:path.join(out,`${name}-new-device.png`)});
  pass(`${name}: a never-written device opens the server notebook without a conflict banner and uploads nothing`);
  // Later edits on this device sync normally.
  await stroke(p,300);await settled(p);await poll(p);await p.waitForFunction(()=>!document.querySelector('#syncAutoStatus').textContent.includes('değişiklikler var'),null,{timeout:10000});
  assert.equal(server.posts,1);assert.equal((await decrypt(server.remote)).pages[0].strokes.length,2);
  pass(`${name}: after taking the server copy, new ink on the device is uploaded as usual`);
  assert.deepEqual(errors,[]);await context.close();}
 {// S2: a device with its own ink still gets the banner; sending local asks first.
  const server={remote:await encrypt(serverBook,'2026-09-20T09:30:00.000Z'),tag:'"1"',posts:0,gets:0};
  const {context,p,errors}=await session(browser,server);
  await stroke(p,100);await settled(p);const localTitle=await p.evaluate(()=>page().title);
  const status=await unlock(p);assert.doesNotMatch(status,/açılacak/);
  await poll(p);await p.waitForFunction(()=>document.querySelector('#syncConflictBanner').dataset.open==='1',null,{timeout:10000});
  const detail=await p.locator('#syncConflictDetail').textContent();assert.match(detail,/^Sunucudaki kopya: .+ · Bu cihazdaki son değişiklik: .+\.$/);assert.doesNotMatch(detail,/tarih yok|bilinmiyor/);
  assert.equal(server.posts,0);assert.deepEqual((await stored(p)).titles,[localTitle]);
  await p.screenshot({path:path.join(out,`${name}-conflict.png`)});
  pass(`${name}: a device with its own ink still stops at the conflict banner, which shows both dates`);
  await p.evaluate(()=>{window.__confirms=[];window.confirm=t=>{window.__confirms.push(t);return false}});
  await p.locator('#syncConflictLocal').click();await p.waitForTimeout(600);
  assert.equal(server.posts,0);assert.equal(await bannerOpen(p),true);assert.match(await p.evaluate(()=>__confirms[0]),/geri alınamaz/);
  await p.evaluate(()=>{window.confirm=()=>true});await p.locator('#syncConflictLocal').click();
  await p.waitForFunction(()=>document.querySelector('#syncConflictBanner').dataset.open!=='1',null,{timeout:10000});await p.waitForFunction(()=>document.querySelector('#syncAutoStatus').textContent.includes('son:'),null,{timeout:10000});
  assert.equal(server.posts,1);const sent=await decrypt(server.remote);assert.deepEqual(sent.pages.map(x=>x.title),[localTitle]);assert.equal(sent.pages[0].strokes.length,1);
  pass(`${name}: "Yereldekini gönder" does nothing when declined and replaces the server copy only after confirmation`);
  assert.deepEqual(errors,[]);await context.close();}
 {// S3: a manual server backup with the sync passphrase is recorded; no conflict against ourselves.
  const server={remote:null,tag:null,posts:0,gets:0};
  const {context,p,errors}=await session(browser,server);
  await stroke(p,100);await settled(p);await unlock(p);await poll(p);await p.waitForFunction(()=>document.querySelector('#syncAutoStatus').textContent.includes('son:'),null,{timeout:10000});
  assert.equal(server.posts,1);
  await p.evaluate(()=>{page().title='Elle yedek';markChanged();return flushSave()});
  await p.locator('bilge-defter-ui [data-panel="file"]').click();await p.locator('bilge-defter-ui [data-command="backup.status"]').click();await p.locator('#reliabilityDialog').waitFor();
  await p.locator('#syncUpload').click();await p.locator('#syncPassInput').fill(PASS);await p.locator('#syncPassConfirm').fill(PASS);await p.locator('#syncPassSubmit').click();
  await p.waitForFunction(()=>document.querySelector('#syncStatus').textContent.includes('Sunucuda şifreli yedek var'));assert.equal(server.posts,2);
  await p.locator('#reliabilityClose').click();const seen=server.gets;await poll(p);await poll(p);
  assert.ok(server.gets>seen,'idle checks must actually have run');
  assert.equal(await bannerOpen(p),false);assert.equal(server.posts,2);assert.equal((await stored(p)).receipt?.tag,'"3"');
  assert.match(await p.locator('#syncAutoStatus').textContent(),/Eşitleme açık · son:/);assert.doesNotMatch(await p.locator('#syncAutoStatus').textContent(),/değişiklikler var/);
  pass(`${name}: a manual "Sunucuya yedekle" is acknowledged; the next idle checks neither re-upload nor raise a conflict`);
  assert.deepEqual(errors,[]);await context.close();}
 {// S3b: manual backup with a different passphrase while sync is on is NOT acknowledged.
  const server={remote:null,tag:null,posts:0,gets:0};
  const {context,p,errors}=await session(browser,server);
  await stroke(p,100);await settled(p);await unlock(p);await poll(p);await p.waitForFunction(()=>document.querySelector('#syncAutoStatus').textContent.includes('son:'),null,{timeout:10000});
  const tagBefore=(await stored(p)).receipt?.tag;assert.equal(server.posts,1);
  await p.evaluate(()=>{window.confirm=()=>true});
  await p.locator('bilge-defter-ui [data-panel="file"]').click();await p.locator('bilge-defter-ui [data-command="backup.status"]').click();await p.locator('#reliabilityDialog').waitFor();
  await p.locator('#syncUpload').click();await p.locator('#syncPassInput').fill('baska-parola-456');await p.locator('#syncPassConfirm').fill('baska-parola-456');await p.locator('#syncPassSubmit').click();
  await p.waitForFunction(()=>document.querySelector('#syncStatus').textContent.includes('Sunucuda şifreli yedek var'));assert.equal(server.posts,2);
  assert.match(await p.locator('#syncStatus').textContent(),/Otomatik eşitleme de artık bu parolayı kullanıyor/);
  assert.notEqual((await stored(p)).receipt?.tag,tagBefore);assert.equal((await stored(p)).receipt?.tag,'"3"');await p.locator('#reliabilityClose').click();
  // Sync keeps working under the new passphrase: later ink is uploaded and can be opened with it.
  await stroke(p,300);await settled(p);await poll(p);await p.waitForFunction(()=>!document.querySelector('#syncAutoStatus').textContent.includes('değişiklikler var')&&!document.querySelector('#syncAutoStatus').textContent.includes('bekliyor'),null,{timeout:10000});
  assert.equal(server.posts,3);assert.equal(await bannerOpen(p),false);
  const other=await crypto.subtle.deriveKey({name:'PBKDF2',salt:fromB64(server.remote.salt),iterations:250000,hash:'SHA-256'},await crypto.subtle.importKey('raw',enc.encode('baska-parola-456'),'PBKDF2',false,['deriveKey']),{name:'AES-GCM',length:256},false,['decrypt']);
  const opened=JSON.parse(dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:fromB64(server.remote.iv)},other,fromB64(server.remote.ciphertext))));assert.equal(opened.pages[0].strokes.length,2);
  pass(`${name}: a manual backup under a different passphrase switches automatic sync to it instead of leaving sync unable to open the server copy`);
  assert.deepEqual(errors,[]);await context.close();}
 {// S3c: manual backup with sync OFF is acknowledged; enabling sync afterwards neither re-uploads nor conflicts.
  const server={remote:null,tag:null,posts:0,gets:0};
  const {context,p,errors}=await session(browser,server);
  await stroke(p,100);await settled(p);
  await p.locator('bilge-defter-ui [data-panel="file"]').click();await p.locator('bilge-defter-ui [data-command="backup.status"]').click();await p.locator('#reliabilityDialog').waitFor();
  await p.evaluate(()=>{window.__syncInvited=true;renderSyncActions()});
  await p.locator('#syncUpload').click();await p.locator('#syncPassInput').fill(PASS);await p.locator('#syncPassConfirm').fill(PASS);await p.locator('#syncPassSubmit').click();
  await p.waitForFunction(()=>document.querySelector('#syncStatus').textContent.includes('Sunucuda şifreli yedek var'));assert.equal(server.posts,1);assert.equal((await stored(p)).receipt?.tag,'"2"');
  await p.locator('#syncUnlock').click();await p.locator('#syncPassInput').fill(PASS);await p.locator('#syncPassSubmit').click();
  await p.waitForFunction(()=>document.querySelector('#syncAutoStatus').textContent.includes('Eşitleme açık'));await p.locator('#reliabilityClose').click();
  const seen=server.gets;await poll(p);await poll(p);assert.ok(server.gets>seen);
  assert.equal(server.posts,1);assert.equal(await bannerOpen(p),false);assert.match(await p.locator('#syncAutoStatus').textContent(),/Eşitleme açık · son:/);
  pass(`${name}: a manual backup made while sync was off counts as synced once sync is enabled`);
  assert.deepEqual(errors,[]);await context.close();}
 {// S5: boundaries of "pristine": these one-page notebooks are NOT pristine and must still get the banner.
  const cases=[
   ['notebook list',()=>{state.notebooks=[{id:'nb-1',title:'Anatomi'}]}],
   ['trash entry',()=>{state.trash=[{page:{id:'t-1',title:'Silinen',strokes:[],updated:new Date().toISOString()},notebookTitle:'Genel',deletedAt:new Date().toISOString(),position:0}]}],
   ['earlier sync receipt',null],
  ];
  for(const [label,mutate] of cases){
   const server={remote:await encrypt(serverBook,'2026-09-20T09:30:00.000Z'),tag:'"1"',posts:0,gets:0};
   const {context,p,errors}=await session(browser,server);
   if(mutate){await p.evaluate(mutate);await p.evaluate(()=>{markChanged();return flushSave()});await settled(p)}
   else await p.evaluate(()=>new Promise((ok,no)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put({dirty:true,tag:'"old-device-tag"',ackHash:'0'.repeat(64)},'sync-state-v2');tx.oncomplete=()=>ok();tx.onabort=()=>no(tx.error)}));
   assert.equal(await p.evaluate(()=>state.pages.length===1&&state.pages[0].strokes.length===0),true);
   const status=await unlock(p);assert.doesNotMatch(status,/açılacak/,label);
   await poll(p);await p.waitForFunction(()=>document.querySelector('#syncConflictBanner').dataset.open==='1',null,{timeout:10000});
   assert.equal(server.posts,0,label);assert.equal(await p.evaluate(()=>page().title),'Sayfa 1',label);
   if(label==='notebook list'){// Resolving towards the server from the banner still keeps a before-import copy.
    await p.locator('#syncConflictServer').click();await p.waitForFunction(()=>page()?.title==='Anatomi 1',null,{timeout:10000});
    assert.equal(await p.evaluate(async()=>(await dbGet('before-import'))?.notebooks?.[0]?.title),'Anatomi');}
   await context.close();assert.deepEqual(errors,[],label);
  }
  pass(`${name}: a one-page empty notebook with a notebook list, a trash entry or an earlier sync receipt is not pristine and still stops at the banner`);}
 {// S4: pristine device, empty server: the blank notebook is pushed as before (no regression).
  const server={remote:null,tag:null,posts:0,gets:0};
  const {context,p,errors}=await session(browser,server);
  await unlock(p);await poll(p);await p.waitForFunction(()=>document.querySelector('#syncAutoStatus').textContent.includes('son:'),null,{timeout:10000});
  assert.equal(server.posts,1);assert.equal(await bannerOpen(p),false);
  pass(`${name}: with no server copy the first upload from a new device still happens`);
  assert.deepEqual(errors,[]);await context.close();}
}
(async()=>{
 for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){const browser=await engine.launch({headless:true});try{await run(browser,name)}finally{await browser.close()}}
 fs.writeFileSync(path.join(out,'sync-tests.json'),JSON.stringify({passed:results.length,results,synthetic:true,realDevice:false},null,2));
 console.log(JSON.stringify({passed:results.length,failed:0}));
})().catch(e=>{console.error(e);process.exit(1)});
