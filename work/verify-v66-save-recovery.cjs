'use strict';
// v66 save recovery. A lost IndexedDB connection or a stopped/stalled save worker must not stop
// the notebook as a false "another tab" conflict: the save continues from this page's own last
// write (or its unanswered one). A notebook written by anyone else is still refused, and a
// failure that cannot be recovered shows its real reason with a retry. Synthetic, no iPad.
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),{chromium,webkit}=require('playwright');
const root=path.resolve(process.env.BILGE_TEST_ROOT||path.join(__dirname,'bilge-defter-invited-v66'));
const out=path.resolve(process.env.BILGE_TEST_OUTPUT||path.join(__dirname,'../outputs/v66-save-recovery'));
const origin='http://127.0.0.1:49377';fs.mkdirSync(out,{recursive:true});
const results=[];const pass=s=>{results.push(s);console.log('PASS '+s)};
async function session(browser){
 const context=await browser.newContext({viewport:{width:1180,height:820},serviceWorkers:'block'}),errors=[];
 context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
 await context.addInitScript(o=>{if(location.origin===o){window.__accountRequired=false;localStorage.setItem('bilge_defter_onboarding_v1','true')}},origin);
 await context.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!==origin)return r.abort();const f=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));return f.startsWith(root+path.sep)&&fs.existsSync(f)?r.fulfill({path:f}):r.fulfill({status:404,body:''})});
 const p=await context.newPage();await p.goto(origin);await p.waitForFunction(()=>typeof ready!=='undefined'&&ready&&saveWorker);
 return {context,p,errors};
}
const stroke=(p,x)=>p.locator('#canvas').evaluate((c,x)=>{const r=c.getBoundingClientRect();for(const [type,dx] of [['pointerdown',0],['pointermove',40],['pointerup',80]])c.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:7,pointerType:'pen',clientX:r.x+x+dx,clientY:r.y+200,buttons:type==='pointerup'?0:1,pressure:.5}))},x);
const settled=p=>p.waitForFunction(()=>!isDirty()&&!savePromise,null,{timeout:10000});
// Read the disk with a separate connection, as another tab would.
const disk=(p,key='app')=>p.evaluate(key=>new Promise((ok,no)=>{const r=indexedDB.open(DB,1);r.onerror=()=>no(r.error);r.onsuccess=()=>{const q=r.result.transaction(STORE).objectStore(STORE).get(key);q.onsuccess=()=>{r.result.close();ok(q.result===undefined?null:q.result)};q.onerror=()=>no(q.error)}}),key);
const view=p=>p.evaluate(()=>({status:document.querySelector('#saveState').textContent,conflict:saveConflict,failed:saveFailed,message:document.querySelector('#saveRecoveryMessage').textContent,strokes:page().strokes.length}));
async function savedAll(p,label){
 await settled(p);const v=await view(p),d=await disk(p);
 assert.equal(v.conflict,false,label+': conflict');assert.equal(v.failed,false,label+': failed');assert.equal(v.status,'Bu cihazda kaydedildi',label);
 assert.equal(d.pages.find(x=>x.id===d.active).strokes.length,v.strokes,label+': disk has every stroke');
 // typeof guard: against an older build the failure must be behavioural, not a missing name.
 if(await p.evaluate(()=>typeof saveMarker!=='undefined'))assert.deepEqual(await disk(p,'app-writer'),await p.evaluate(()=>saveMarker),label+': marker');
}
async function run(browser,name){
 {const {context,p,errors}=await session(browser);
  await stroke(p,100);await savedAll(p,'first save');
  const worker=p.workers().find(w=>w.url().endsWith('save-worker.js'));
  await p.evaluate(()=>{window.__w0=saveWorker});await worker.evaluate(()=>{db.close();return true});
  await stroke(p,200);await savedAll(p,'after connection loss');await stroke(p,300);await savedAll(p,'next save');
  assert.equal(await p.evaluate(()=>saveWorker===__w0),true,'same worker, connection reopened inside it');
  pass(`${name}: the worker's storage connection is lost; it reopens and every stroke is saved, no conflict`);

  await p.evaluate(()=>{window.__before=saveWorker;saveWorker.onerror(new Event('error'))});
  assert.equal(await p.evaluate(()=>saveWorker===null&&workerLost),true);
  await stroke(p,400);await savedAll(p,'after worker error');assert.equal(await p.evaluate(()=>saveWorker!==null&&saveWorker!==__before),true);
  pass(`${name}: a stopped worker is replaced by one that continues from this tab's own last write`);

  // Committed but never answered: the stall timer fires after the write reached the disk.
  await p.evaluate(()=>{window.__stalled=saveWorker;saveWorker.onmessage=()=>{}});
  const n=await p.evaluate(()=>page().strokes.length);
  await stroke(p,500);
  await p.waitForFunction(async n=>{const d=await new Promise(ok=>{const r=indexedDB.open(DB,1);r.onsuccess=()=>{const q=r.result.transaction(STORE).objectStore(STORE).get('app');q.onsuccess=()=>{r.result.close();ok(q.result)}}});return d.pages.find(x=>x.id===d.active).strokes.length===n+1},n,{timeout:10000});
  await p.evaluate(()=>saveWorkerFailed(__stalled));
  await savedAll(p,'after unanswered committed write');
  pass(`${name}: a write that reached the disk but was never answered is recognised as this tab's own`);

  // Stalled before writing.
  await p.evaluate(()=>{window.__stalled=saveWorker;saveWorker.terminate()});
  await stroke(p,600);await p.waitForTimeout(300);
  assert.equal(await p.evaluate(()=>isDirty()),true);
  await p.evaluate(()=>saveWorkerFailed(__stalled));
  await savedAll(p,'after stall before writing');
  pass(`${name}: a worker that stalls before writing is replaced and the pending stroke is saved`);

  // Main-thread connection loss: reads reopen.
  await p.evaluate(()=>db.close());
  assert.equal(typeof (await p.evaluate(async()=>(await dbGet('sync-state-v2'))??{})),'object');
  pass(`${name}: the page's own storage connection reopens after it is lost`);
  assert.deepEqual(errors,[]);await context.close();}

 {const {context,p,errors}=await session(browser);
  await stroke(p,100);await settled(p);
  await p.evaluate(()=>saveWorkerFailed(saveWorker));
  // Someone else writes the notebook while this tab has no worker.
  const other=await p.evaluate(()=>new Promise((ok,no)=>{const r=indexedDB.open(DB,1);r.onsuccess=()=>{const c=r.result,tx=c.transaction(STORE,'readwrite'),os=tx.objectStore(STORE),g=os.get('app');g.onsuccess=()=>{const v=g.result;v.pages.find(x=>x.id===v.active).title='OTHER_WRITER';os.put(v,'app');os.put({writer:'other-tab',seq:1,length:JSON.stringify(v).length},'app-writer')};tx.oncomplete=()=>{c.close();ok(JSON.stringify(g.result))};tx.onabort=()=>no(tx.error)}}));
  await stroke(p,200);await p.waitForFunction(()=>saveConflict,null,{timeout:10000});
  const v=await view(p);assert.equal(v.status,'Başka sekmede değişiklik var — yedek alın');
  assert.match(v.message,/Ayrıntı: Kayıtlı defter bu sekmenin son kaydı değil\.$/);
  assert.equal(JSON.stringify(await disk(p)),other);
  await stroke(p,300);assert.equal(JSON.stringify(await disk(p)),other);
  pass(`${name}: a notebook written by another tab meanwhile is still refused as a conflict, with the reason shown`);
  assert.deepEqual(errors,[]);await context.close();}

 {const {context,p,errors}=await session(browser);
  // A notebook saved before v66 has no marker.
  await stroke(p,100);await settled(p);
  await p.evaluate(()=>new Promise(ok=>{const r=indexedDB.open(DB,1);r.onsuccess=()=>{const tx=r.result.transaction(STORE,'readwrite');tx.objectStore(STORE).delete('app-writer');tx.oncomplete=()=>{r.result.close();ok()}}}));
  await p.reload();await p.waitForFunction(()=>ready&&saveWorker);
  assert.deepEqual(await p.evaluate(()=>({writer:saveMarker.writer,seq:saveMarker.seq})),{writer:null,seq:null});
  await p.evaluate(()=>saveWorkerFailed(saveWorker));await stroke(p,200);await savedAll(p,'unmarked notebook');
  pass(`${name}: a notebook saved by an older version (no marker) recovers from its known length`);

  // The worker cannot be restarted: a retryable failure with its code, not "another tab".
  await p.evaluate(()=>{window.__Worker=Worker;window.Worker=function(){throw new Error('blocked')};saveWorkerFailed(saveWorker)});
  await stroke(p,300);await p.waitForFunction(()=>saveFailed,null,{timeout:10000});
  let v=await view(p);assert.equal(v.conflict,false);assert.equal(v.status,'Kaydedilemedi — yedek alın');assert.match(v.message,/Ayrıntı: SaveWorkerLost\.$/);
  assert.equal(await p.evaluate(()=>document.querySelector('#retrySave').hidden),false);
  await p.evaluate(()=>{window.Worker=__Worker;document.querySelector('#retrySave').click()});
  await savedAll(p,'after retry');
  pass(`${name}: when no worker can start the stroke stays on screen, the reason is shown and Retry saves it`);
  assert.deepEqual(errors,[]);await context.close();}
}
(async()=>{
 for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){const browser=await engine.launch({headless:true});try{await run(browser,name)}finally{await browser.close()}}
 fs.writeFileSync(path.join(out,'save-recovery-tests.json'),JSON.stringify({passed:results.length,results,synthetic:true,realDevice:false},null,2));
 console.log(JSON.stringify({passed:results.length,failed:0}));
})().catch(e=>{console.error(e);process.exit(1)});
