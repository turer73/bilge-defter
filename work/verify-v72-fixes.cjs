'use strict';
// v72 fixes for the v71 review (Codex findings 2053-2056, re-review 2058). Through the real sync path, a
// notebook whose image occurrences (copied pages, Trash) exceed 5 MiB is held without rebuilding,
// encoding or fetching after edits, although each image is stored once and the record is KB; a migration
// stopped by a full device compacts what it stored and retries by itself when the cooldown ends (virtual
// clock, no manual reset); cleanup runs with no images left; PDF apply and backup restore schedule
// migration, also while a sweep is running; the published v71 opens what v72 wrote. Synthetic, no iPad.
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),{chromium,webkit}=require('playwright');
const root=path.resolve(process.env.BILGE_TEST_ROOT||path.join(__dirname,'bilge-defter-invited-v72'));
const prior=path.resolve(process.env.BILGE_PRIOR_ROOT||path.join(__dirname,'bilge-defter-invited-v71'));
const out=path.resolve(process.env.BILGE_TEST_OUTPUT||path.join(__dirname,'../outputs/v72-fixes'));
const origin='http://127.0.0.1:49381';fs.mkdirSync(out,{recursive:true});
const results=[];const pass=s=>{results.push(s);console.log('PASS '+s)};
const PASS='sentetik-parola-123';
// ONLY=1,3 runs selected blocks (negative checks against an older build, one finding at a time).
const only=(process.env.ONLY||'').split(',').filter(Boolean).map(Number),want=n=>!only.length||only.includes(n);
function serveFrom(dir,server){return async r=>{const u=new URL(r.request().url());if(u.origin!==origin)return r.abort();
 if(server&&u.pathname.endsWith('/api/v1/bilge-defter/backup')){const headers={'X-Bilge-Sync-Protocol':'cas-v1',...(server.tag?{ETag:server.tag}:{})};
  if(r.request().method()==='POST'){server.posts++;server.remote=JSON.parse(r.request().postData());server.tag=`"${server.posts+1}"`;return r.fulfill({status:200,headers:{...headers,ETag:server.tag},contentType:'application/json',body:'{"status":"ok"}'})}
  server.gets++;return server.remote?r.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify(server.remote)}):r.fulfill({status:404,headers,contentType:'application/json',body:'{}'})}
 const f=path.resolve(dir,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));return f.startsWith(dir+path.sep)&&fs.existsSync(f)?r.fulfill({path:f}):r.fulfill({status:404,body:'missing'})}}
async function session(browser,{server=null,clock=false}={}){
 const context=await browser.newContext({viewport:{width:1180,height:820},serviceWorkers:'block'}),errors=[];
 context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
 await context.addInitScript(o=>{if(location.origin===o){window.__accountRequired=false;localStorage.setItem('bilge_defter_onboarding_v1','true')}},origin);
 await context.route('**/*',serveFrom(root,server));
 const p=await context.newPage();if(clock)await p.clock.install();
 await p.goto(origin);await p.waitForFunction(()=>typeof ready!=='undefined'&&ready&&saveWorker&&window.__v2UI,null,{timeout:20000});
 return {context,p,errors};
}
const settled=(p,timeout=15000)=>p.waitForFunction(()=>!isDirty()&&!savePromise,null,{timeout});
const raw=(p,key='app')=>p.evaluate(key=>new Promise((ok,no)=>{const r=indexedDB.open(DB,1);r.onerror=()=>no(r.error);r.onsuccess=()=>{const q=r.result.transaction(STORE).objectStore(STORE).get(key);q.onsuccess=()=>{r.result.close();ok(q.result===undefined?null:q.result)};q.onerror=()=>no(q.error)}}),key);
const put=(p,key,value)=>p.evaluate(([key,value])=>new Promise(ok=>{const r=indexedDB.open(DB,1);r.onsuccess=()=>{const tx=r.result.transaction(STORE,'readwrite');tx.objectStore(STORE).put(value,key);tx.oncomplete=()=>{r.result.close();ok()}}}),[key,value]);
const assetKeys=p=>p.evaluate(()=>new Promise((ok,no)=>{const r=indexedDB.open(DB,1);r.onsuccess=()=>{const q=r.result.transaction(STORE).objectStore(STORE).getAllKeys(IDBKeyRange.bound('asset:','asset;',false,true));q.onsuccess=()=>{r.result.close();ok(q.result)};q.onerror=()=>no(q.error)}}));
const inlineIn=async p=>JSON.stringify(await raw(p)).split('data:image/').length-1;
const keyed=async(p,n,timeout=15000)=>{const end=Date.now()+timeout;for(;;){if((await assetKeys(p)).length>=n&&await inlineIn(p)===0&&await p.evaluate(()=>!isDirty()&&!savePromise))return;if(Date.now()>end)throw new Error(`not keyed: ${(await assetKeys(p)).length} assets, ${await inlineIn(p)} inline`);await p.waitForTimeout(250)}};
const stroke=(p,x)=>p.locator('#canvas').evaluate((c,x)=>{const r=c.getBoundingClientRect();for(const [type,dx] of [['pointerdown',0],['pointermove',40],['pointerup',80]])c.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:7,pointerType:'pen',clientX:r.x+x+dx,clientY:r.y+200,buttons:type==='pointerup'?0:1,pressure:.5}))},x);
// PDF pages with distinct images; noisy=true gives photo-like ~1.9 MB PNGs. copies/trash repeat page 1's image.
const seed=(p,{count=2,noisy=false,copies=0,trash=0}={})=>p.evaluate(([count,noisy,copies,trash])=>{
 const sheet=k=>{const c=document.createElement('canvas');c.width=1000;c.height=1414;const g=c.getContext('2d');
  if(noisy){const d=g.createImageData(1000,1414);for(let i=0;i<d.data.length;i+=4){const v=((i/4)%1000)/4+Math.random()*40;d.data[i]=v;d.data[i+1]=(v+k*30)%256;d.data[i+2]=v*.6;d.data[i+3]=255}g.putImageData(d,0,0)}
  else{g.fillStyle='#fff';g.fillRect(0,0,1000,1414);g.fillStyle='#'+(k*3+2)+'4'+(6-k);for(let y=4;y<1414;y+=9)for(let x=4;x<1000;x+=11)if((x*7+y*13+k)%5<2)g.fillRect(x,y,6,5)}return c.toDataURL('image/png')};
 const nb=newPageId(),pages=[],page=(image,k)=>({id:newPageId(),title:'Slayt '+(k+1),strokes:[],viewY:0,notebookId:nb,pdf:{image,width:1000,height:1414,name:'ders.pdf',number:1,total:1},updated:new Date().toISOString()});
 for(let k=0;k<count;k++)pages.push(page(sheet(k),k));
 for(let k=0;k<copies;k++)pages.push(page(pages[0].pdf.image,count+k));
 const bin=Array.from({length:trash},(_,k)=>({page:page(pages[0].pdf.image,100+k),notebookTitle:'Fizyoloji – kalp',deletedAt:new Date().toISOString(),position:0}));
 state={...state,version:Math.max(2,state.version),notebooks:[...(state.notebooks||[]),{id:nb,title:'Fizyoloji – kalp'}],pages:[...state.pages,...pages],...(trash?{trash:[...(state.trash||[]),...bin]}:{})};
 activeId=pages[0].id;activeNotebook=nb;state.active=activeId;state.activeNotebook=nb;renderPages();drawAll();scheduleSave();
 return pages[0].pdf.image.length;
},[count,noisy,copies,trash]);
async function unlock(p){
 await p.locator('bilge-defter-ui [data-panel="file"]').click();await p.locator('bilge-defter-ui [data-command="backup.status"]').click();await p.locator('#reliabilityDialog').waitFor();
 await p.evaluate(()=>{window.__syncInvited=true;renderSyncActions()});await p.locator('#syncUnlock').click();
 await p.locator('#syncPassInput').fill(PASS);await p.locator('#syncPassSubmit').click();
 await p.waitForFunction(()=>document.querySelector('#syncAutoStatus').textContent.includes('Eşitleme açık'),null,{timeout:20000});
 await p.locator('#reliabilityClose').click();
}
const poll=async p=>{await p.evaluate(()=>{nextPollAt=0;document.dispatchEvent(new Event('visibilitychange'))});await p.waitForTimeout(1200)};

async function run(browser,name){
 for(const [label,shape] of [['copied pages',{copies:3}],['Trash copies',{copies:1,trash:2}]]){if(!want(1))break;
  const server={remote:null,tag:null,posts:0,gets:0};const {context,p,errors}=await session(browser,{server});
  await unlock(p);
  const one=await seed(p,{count:1,noisy:true,...shape});await keyed(p,1,30000);
  const occurrences=1+shape.copies+(shape.trash||0);
  assert.ok(one*occurrences>5*1048576&&one<5*1048576,`one image ${one} B, ${occurrences} occurrences`);
  assert.ok(await p.evaluate(()=>lastSaveBytes)<100000,'the record is small');
  // Count large encodes (the upload text) and server traffic from here on.
  await p.evaluate(()=>{const e=TextEncoder.prototype.encode;window.__bigEncodes=0;TextEncoder.prototype.encode=function(t){if(typeof t==='string'&&t.length>1048576)__bigEncodes++;return e.call(this,t)}});
  const before={gets:server.gets,posts:server.posts};
  for(const x of [200,260,320]){await stroke(p,x);await settled(p);await poll(p)}
  const status=await p.locator('#syncAutoStatus').textContent();
  assert.equal(await p.evaluate(()=>__bigEncodes),0,'no upload text was built and encoded');
  assert.deepEqual({gets:server.gets-before.gets,posts:server.posts-before.posts},{gets:0,posts:0},'held before fetching or uploading');
  assert.match(status,/5 MiB/);
  pass(`${name}: sync holds a notebook whose ${label} take the upload over 5 MiB (${occurrences}x${(one/1048576).toFixed(1)} MB), stored once and with a KB record, without encoding or fetching after edits (finding 2053)`);
  assert.deepEqual(errors,[]);await context.close();}

 if(want(2)){const {context,p,errors}=await session(browser,{clock:true});
  await p.evaluate(()=>{ASSET_WRITE=false});await seed(p,{count:3});await settled(p);assert.equal(await inlineIn(p),3);
  // The device fills up after the first stored image; migration then starts by itself from a save.
  await p.evaluate(()=>{const put=IDBObjectStore.prototype.put;let n=0;window.__restorePut=()=>{IDBObjectStore.prototype.put=put};IDBObjectStore.prototype.put=function(v,k){if(typeof k==='string'&&k.startsWith('asset:')&&++n>1)throw new DOMException('Kota doldu (test)','QuotaExceededError');return put.call(this,v,k)};ASSET_WRITE=true});
  await stroke(p,150);await settled(p);
  await p.waitForFunction(()=>JSON.parse(localStorage.getItem('bilge-diag-v1')||'[]').some(x=>x.ev==='asset-fail'),null,{timeout:15000});await settled(p);
  assert.equal(await inlineIn(p),2,'the stored image is used at once; the record shrinks');
  assert.equal(await p.evaluate(()=>saveFailed),false);
  const log=await p.evaluate(()=>JSON.parse(localStorage.getItem('bilge-diag-v1')||'[]').filter(x=>x.ev==='asset-fail').pop());
  assert.equal(log.name,'QuotaExceededError');assert.equal(log.added,1);
  // Space is freed; nobody edits or calls anything. The cooldown ends and the rest migrates.
  await p.evaluate(()=>__restorePut());await p.clock.fastForward('04:00');await p.waitForTimeout(1500);
  assert.equal(await inlineIn(p),2,'nothing before the cooldown ends');
  await p.clock.fastForward('01:30');await keyed(p,3,15000);
  pass(`${name}: a migration stopped by a full device compacts what it stored and finishes by itself when the cooldown ends, with no edit (findings 2054, 2058)`);
  assert.deepEqual(errors,[]);await context.close();}

 if(want(3)){const {context,p,errors}=await session(browser);
  assert.equal(await p.evaluate(()=>storedAssets.size),0);
  await put(p,'asset:'+'d'.repeat(64),{data:'data:image/png;base64,AAAA',t:Date.now()-8*864e5});await put(p,'asset:'+'e'.repeat(64),{data:'data:image/png;base64,AAAA',t:Date.now()-864e5});
  assert.equal(await p.evaluate(()=>gcAssets()),1);assert.deepEqual(await assetKeys(p),['asset:'+'e'.repeat(64)]);
  pass(`${name}: cleanup runs when the notebook has no images left (finding 2055)`);
  assert.deepEqual(errors,[]);await context.close();}

 if(want(4)){const {context,p,errors}=await session(browser);
  await seed(p,{count:1});await keyed(p,1);await p.waitForTimeout(2500);
  const pdfImage=()=>{const c=document.createElement('canvas');c.width=1000;c.height=1414;const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,1000,1414);g.fillStyle='#'+Math.floor(Math.random()*900+100);for(let y=6;y<1414;y+=10)for(let x=6;x<1000;x+=9)if((x+y+Math.floor(Math.random()*3))%7<3)g.fillRect(x,y,5,6);return c.toDataURL('image/png')};
  const apply=src=>p.evaluate(async src=>{const image=(0,eval)('('+src+')')();pdfPending={title:'Yeni ders '+Math.random(),pages:[{id:newPageId(),title:'PDF · Sayfa 1',strokes:[],viewY:0,pdf:{image,width:1000,height:1414,name:'yeni.pdf',number:1,total:1},updated:new Date().toISOString()}]};
   pdfDialog.showModal();document.querySelector('#pdfApply').disabled=false;await document.querySelector('#pdfApply').onclick()},src);
  // Real PDF apply: no edit follows; the new page's image must still be stored apart.
  await apply(pdfImage.toString());assert.equal(await inlineIn(p),1,'just applied: inline');await keyed(p,2,10000);
  // Backup restore: a candidate with a new image.
  const restored=await p.evaluate(async src=>{const image=(0,eval)('('+src+')')();const pg={id:newPageId(),title:'Yedekten',strokes:[],viewY:0,pdf:{image,width:1000,height:1414,name:'y.pdf',number:1,total:1},updated:new Date().toISOString()};return replaceNotebook({version:2,pages:[pg],active:pg.id},'test')},pdfImage.toString());
  assert.equal(restored,true);await keyed(p,3,10000);
  // Race: a sweep is hashing PDF A when PDF B is applied and the scheduled timer fires; B must not wait
  // for another edit.
  await p.evaluate(()=>{const hash=sha256Hex;window.__gate=new Promise(r=>{window.__openGate=r});sha256Hex=async t=>{await __gate;return hash(t)}});
  await apply(pdfImage.toString());await p.evaluate(()=>{window.__running=ensureAssets()});
  await apply(pdfImage.toString());await p.waitForTimeout(2600);
  assert.equal(await p.evaluate(()=>assetAgain),true,'requests made during the sweep are remembered');
  await p.evaluate(async()=>{__openGate();await __running});await keyed(p,5,10000);
  pass(`${name}: PDF apply and backup restore move their new images apart without a further edit, also while a sweep is running (finding 2056)`);

  // The published v71 opens what v72 wrote.
  const imgs=await p.evaluate(()=>state.pages.filter(x=>x.pdf).map(x=>x.pdf.image));
  await context.unroute('**/*');await context.route('**/*',serveFrom(prior));await p.reload();await p.waitForFunction(()=>typeof ready!=='undefined'&&ready,null,{timeout:20000});
  assert.equal(await p.evaluate(()=>APP_VERSION),'v71');assert.deepEqual(await p.evaluate(()=>state.pages.filter(x=>x.pdf).map(x=>x.pdf.image)),imgs);assert.equal(await p.evaluate(()=>validState(state)),true);
  pass(`${name}: the published v71 opens a notebook written by v72 with every image (rollback is safe)`);
  assert.deepEqual(errors,[]);await context.close();}
}
(async()=>{
 for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){const browser=await engine.launch({headless:true});try{await run(browser,name)}finally{await browser.close()}}
 fs.writeFileSync(path.join(out,'fixes-v72-tests.json'),JSON.stringify({passed:results.length,results,synthetic:true,realDevice:false},null,2));
 console.log(JSON.stringify({passed:results.length,failed:0}));
})().catch(e=>{console.error(e);process.exit(1)});
