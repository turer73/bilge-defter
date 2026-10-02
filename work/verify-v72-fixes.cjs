'use strict';
// v72 fixes for the v71 review (Codex findings 2053-2056). Sync's size preflight counts the images, not
// the now small record; a migration stopped by a full device still compacts what it stored and waits
// before retrying; cleanup runs when the notebook has no images left; PDF apply and backup restore
// schedule migration; the published v71 opens what v72 wrote. Synthetic, no iPad.
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),{chromium,webkit}=require('playwright');
const root=path.resolve(process.env.BILGE_TEST_ROOT||path.join(__dirname,'bilge-defter-invited-v72'));
const prior=path.resolve(process.env.BILGE_PRIOR_ROOT||path.join(__dirname,'bilge-defter-invited-v71'));
const out=path.resolve(process.env.BILGE_TEST_OUTPUT||path.join(__dirname,'../outputs/v72-fixes'));
const origin='http://127.0.0.1:49381';fs.mkdirSync(out,{recursive:true});
const results=[];const pass=s=>{results.push(s);console.log('PASS '+s)};
function serveFrom(dir){return r=>{const u=new URL(r.request().url());if(u.origin!==origin)return r.abort();const f=path.resolve(dir,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));return f.startsWith(dir+path.sep)&&fs.existsSync(f)?r.fulfill({path:f}):r.fulfill({status:404,body:'missing'})}}
async function session(browser){
 const context=await browser.newContext({viewport:{width:1180,height:820},serviceWorkers:'block'}),errors=[];
 context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
 await context.addInitScript(o=>{if(location.origin===o){window.__accountRequired=false;localStorage.setItem('bilge_defter_onboarding_v1','true')}},origin);
 await context.route('**/*',serveFrom(root));
 const p=await context.newPage();await p.goto(origin);await p.waitForFunction(()=>typeof ready!=='undefined'&&ready&&saveWorker,null,{timeout:20000});
 return {context,p,errors};
}
const settled=(p,timeout=15000)=>p.waitForFunction(()=>!isDirty()&&!savePromise,null,{timeout});
const raw=(p,key='app')=>p.evaluate(key=>new Promise((ok,no)=>{const r=indexedDB.open(DB,1);r.onerror=()=>no(r.error);r.onsuccess=()=>{const q=r.result.transaction(STORE).objectStore(STORE).get(key);q.onsuccess=()=>{r.result.close();ok(q.result===undefined?null:q.result)};q.onerror=()=>no(q.error)}}),key);
const put=(p,key,value)=>p.evaluate(([key,value])=>new Promise(ok=>{const r=indexedDB.open(DB,1);r.onsuccess=()=>{const tx=r.result.transaction(STORE,'readwrite');tx.objectStore(STORE).put(value,key);tx.oncomplete=()=>{r.result.close();ok()}}}),[key,value]);
const assetKeys=p=>p.evaluate(()=>new Promise((ok,no)=>{const r=indexedDB.open(DB,1);r.onsuccess=()=>{const q=r.result.transaction(STORE).objectStore(STORE).getAllKeys(IDBKeyRange.bound('asset:','asset;',false,true));q.onsuccess=()=>{r.result.close();ok(q.result)};q.onerror=()=>no(q.error)}}));
const inlineIn=async p=>JSON.stringify(await raw(p)).split('data:image/').length-1;
const keyed=async(p,n,timeout=15000)=>{const end=Date.now()+timeout;for(;;){if((await assetKeys(p)).length>=n&&await inlineIn(p)===0&&await p.evaluate(()=>!isDirty()&&!savePromise))return;if(Date.now()>end)throw new Error(`not keyed: ${(await assetKeys(p)).length} assets, ${await inlineIn(p)} inline`);await p.waitForTimeout(250)}};
// PDF pages with distinct images; noisy=true gives photo-like ~1.9 MB PNGs.
const seed=(p,{count=2,noisy=false}={})=>p.evaluate(([count,noisy])=>{
 const sheet=k=>{const c=document.createElement('canvas');c.width=1000;c.height=1414;const g=c.getContext('2d');
  if(noisy){const d=g.createImageData(1000,1414);for(let i=0;i<d.data.length;i+=4){const v=((i/4)%1000)/4+Math.random()*40;d.data[i]=v;d.data[i+1]=(v+k*30)%256;d.data[i+2]=v*.6;d.data[i+3]=255}g.putImageData(d,0,0)}
  else{g.fillStyle='#fff';g.fillRect(0,0,1000,1414);g.fillStyle='#'+(k*3+2)+'4'+(6-k);for(let y=4;y<1414;y+=9)for(let x=4;x<1000;x+=11)if((x*7+y*13+k)%5<2)g.fillRect(x,y,6,5)}return c.toDataURL('image/png')};
 const nb=newPageId(),pages=[];for(let k=0;k<count;k++)pages.push({id:newPageId(),title:'Slayt '+(k+1),strokes:[],viewY:0,notebookId:nb,pdf:{image:sheet(k),width:1000,height:1414,name:'ders.pdf',number:k+1,total:count},updated:new Date().toISOString()});
 state={...state,version:Math.max(2,state.version),notebooks:[...(state.notebooks||[]),{id:nb,title:'Fizyoloji – kalp'}],pages:[...state.pages,...pages]};
 activeId=pages[0].id;activeNotebook=nb;state.active=activeId;state.activeNotebook=nb;renderPages();drawAll();scheduleSave();
},[count,noisy]);

// ONLY=1,3 runs selected blocks (negative checks against an older build, one finding at a time).
const only=(process.env.ONLY||'').split(',').filter(Boolean).map(Number),want=n=>!only.length||only.includes(n);
// Against v71 the preflight is the record-based one; typeof keeps that failure behavioural.
const hold=p=>p.evaluate(()=>typeof syncCertainlyTooLarge==='function'?syncCertainlyTooLarge(5*1048576):typeof lastSaveBytes==='number'&&lastSaveBytes>3*5*1048576);
async function run(browser,name){
 if(want(1)){const {context,p,errors}=await session(browser);
  assert.equal(await hold(p),false,'an empty notebook is not too large');
  await seed(p,{count:4,noisy:true});await keyed(p,4,30000);
  const r={...await p.evaluate(()=>({record:lastSaveBytes,images:notebookImageBytes()})),hold:await hold(p)};
  assert.ok(r.record<100000&&r.images>5*1048576,JSON.stringify(r));assert.equal(r.hold,true,'images over 5 MiB hold sync although the record is small');
  pass(`${name}: sync's size preflight counts the images (${(r.images/1048576).toFixed(1)} MB) instead of the ${(r.record/1024).toFixed(0)} KB record (finding 2053)`);
  assert.deepEqual(errors,[]);await context.close();}

 if(want(2)){const {context,p,errors}=await session(browser);
  await p.evaluate(()=>{ASSET_WRITE=false});await seed(p,{count:3});await settled(p);assert.equal(await inlineIn(p),3);
  // The device fills up after the first stored image.
  await p.evaluate(()=>{const put=IDBObjectStore.prototype.put;let n=0;window.__restorePut=()=>{IDBObjectStore.prototype.put=put};IDBObjectStore.prototype.put=function(v,k){if(typeof k==='string'&&k.startsWith('asset:')&&++n>1)throw new DOMException('Kota doldu (test)','QuotaExceededError');return put.call(this,v,k)};ASSET_WRITE=true});
  assert.equal(await p.evaluate(()=>ensureAssets()),1);await settled(p);
  assert.equal(await inlineIn(p),2,'the stored image is used at once; the record shrinks');
  assert.deepEqual(await p.evaluate(()=>({failed:saveFailed,hold:typeof assetRetryAt!=='undefined'&&assetRetryAt>Date.now()})),{failed:false,hold:true});
  assert.equal(await p.evaluate(()=>ensureAssets()),0,'no retry before the wait');
  const log=await p.evaluate(()=>JSON.parse(localStorage.getItem('bilge-diag-v1')||'[]').filter(x=>x.ev==='asset-fail').pop());
  assert.equal(log.name,'QuotaExceededError');assert.equal(log.added,1);
  await p.evaluate(()=>{__restorePut();assetRetryAt=0});assert.equal(await p.evaluate(()=>ensureAssets()),2);await keyed(p,3);
  pass(`${name}: a migration stopped by a full device compacts what it stored, logs it, waits, then finishes (finding 2054)`);
  assert.deepEqual(errors,[]);await context.close();}

 if(want(3)){const {context,p,errors}=await session(browser);
  assert.equal(await p.evaluate(()=>storedAssets.size),0);
  await put(p,'asset:'+'d'.repeat(64),{data:'data:image/png;base64,AAAA',t:Date.now()-8*864e5});await put(p,'asset:'+'e'.repeat(64),{data:'data:image/png;base64,AAAA',t:Date.now()-864e5});
  assert.equal(await p.evaluate(()=>gcAssets()),1);assert.deepEqual(await assetKeys(p),['asset:'+'e'.repeat(64)]);
  pass(`${name}: cleanup runs when the notebook has no images left (finding 2055)`);
  assert.deepEqual(errors,[]);await context.close();}

 if(want(4)){const {context,p,errors}=await session(browser);
  await seed(p,{count:1});await keyed(p,1);await p.waitForTimeout(2500);
  // Real PDF apply: no edit follows; the new page's image must still be stored apart.
  await p.evaluate(async()=>{const c=document.createElement('canvas');c.width=1000;c.height=1414;const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,1000,1414);g.fillStyle='#702';for(let y=6;y<1414;y+=10)for(let x=6;x<1000;x+=9)if((x+y)%7<3)g.fillRect(x,y,5,6);
   pdfPending={title:'Yeni ders',pages:[{id:newPageId(),title:'PDF · Sayfa 1',strokes:[],viewY:0,pdf:{image:c.toDataURL('image/png'),width:1000,height:1414,name:'yeni.pdf',number:1,total:1},updated:new Date().toISOString()}]};
   pdfDialog.showModal();document.querySelector('#pdfApply').disabled=false;await document.querySelector('#pdfApply').onclick()});
  assert.equal(await inlineIn(p),1,'just applied: inline');await keyed(p,2,10000);
  // Backup restore: a candidate with a new image.
  const restored=await p.evaluate(async()=>{const c=document.createElement('canvas');c.width=1000;c.height=1414;const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,1000,1414);g.fillStyle='#062';for(let y=3;y<1414;y+=8)for(let x=3;x<1000;x+=8)if((x*3+y)%5<2)g.fillRect(x,y,4,4);
   const pg={id:newPageId(),title:'Yedekten',strokes:[],viewY:0,pdf:{image:c.toDataURL('image/png'),width:1000,height:1414,name:'y.pdf',number:1,total:1},updated:new Date().toISOString()};
   return replaceNotebook({version:2,pages:[pg],active:pg.id},'test')});
  assert.equal(restored,true);await keyed(p,3,10000);
  pass(`${name}: PDF apply and backup restore move their new images apart without a further edit (finding 2056)`);

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
