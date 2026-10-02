'use strict';
// v69 save stability. Saves no longer read the whole notebook back (the marker is the
// compare-and-swap token) and carry one-byte text; another writer is still refused; a worker that
// is replaced after adopting keeps the adopted marker; a first transient failure retries quietly with
// backoff; a full device and a refused notebook show their reason at once; deadlines count visible
// time only; leaving does not rewrite a large notebook in full; a local diagnostic log can be
// exported without note content; JPEG PDF pages are readable; new PDFs are capped. Synthetic, no iPad.
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),{chromium,webkit}=require('playwright');
const root=path.resolve(process.env.BILGE_TEST_ROOT||path.join(__dirname,'bilge-defter-invited-v69'));
const out=path.resolve(process.env.BILGE_TEST_OUTPUT||path.join(__dirname,'../outputs/v69-save'));
const origin='http://127.0.0.1:49378';fs.mkdirSync(out,{recursive:true});
const results=[];const pass=s=>{results.push(s);console.log('PASS '+s)};
async function serve(context){
 await context.addInitScript(o=>{if(location.origin===o){window.__accountRequired=false;localStorage.setItem('bilge_defter_onboarding_v1','true')}},origin);
 await context.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!==origin)return r.abort();const f=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));return f.startsWith(root+path.sep)&&fs.existsSync(f)?r.fulfill({path:f}):r.fulfill({status:404,body:'missing'})});
}
async function open(context,{noWorker=false}={}){
 const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 if(noWorker)await p.addInitScript(()=>{window.Worker=function(){throw new Error('blocked')}});
 await p.goto(origin);await p.waitForFunction(w=>typeof ready!=='undefined'&&ready&&(w?!saveWorker:!!saveWorker),noWorker,{timeout:20000});
 return {p,errors};
}
async function session(browser){const context=await browser.newContext({viewport:{width:1180,height:820},serviceWorkers:'block',acceptDownloads:true});await serve(context);const {p,errors}=await open(context);return {context,p,errors}}
const stroke=(p,x)=>p.locator('#canvas').evaluate((c,x)=>{const r=c.getBoundingClientRect();for(const [type,dx] of [['pointerdown',0],['pointermove',40],['pointerup',80]])c.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:7,pointerType:'pen',clientX:r.x+x+dx,clientY:r.y+200,pressure:.5}))},x);
const settled=(p,timeout=10000)=>p.waitForFunction(()=>!isDirty()&&!savePromise,null,{timeout});
const disk=(p,key='app')=>p.evaluate(key=>new Promise((ok,no)=>{const r=indexedDB.open(DB,1);r.onerror=()=>no(r.error);r.onsuccess=()=>{const q=r.result.transaction(STORE).objectStore(STORE).get(key);q.onsuccess=()=>{r.result.close();ok(q.result===undefined?null:q.result)};q.onerror=()=>no(q.error)}}),key);
const view=p=>p.evaluate(()=>({status:document.querySelector('#saveState').textContent,conflict:saveConflict,failed:saveFailed,retrying:typeof saveRetrying!=='undefined'&&saveRetrying,message:document.querySelector('#saveRecoveryMessage').textContent,strokes:page().strokes.length}));
async function savedAll(p,label,timeout=15000){
 await settled(p,timeout);const v=await view(p),d=await disk(p);
 assert.equal(v.conflict,false,label+': conflict');assert.equal(v.failed,false,label+': failed');assert.equal(v.status,'Bu cihazda kaydedildi',label);
 assert.equal(d.pages.find(x=>x.id===d.active).strokes.length,v.strokes,label+': disk has every stroke');
 assert.deepEqual(await disk(p,'app-writer'),await p.evaluate(()=>saveMarker),label+': marker');
}
// A worker save fails with the given error names first, then works. Returns nothing; counts calls.
const failPuts=(p,names)=>p.evaluate(names=>{const orig=window.__origPut??=workerPut;window.__puts=0;const queue=[...names];workerPut=(...a)=>{__puts++;const name=queue.shift();return name?Promise.reject(Object.assign(new Error('test '+name),{name})):orig(...a)}},names);
const log=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('bilge-diag-v1')||'[]'));
const setVisibility=(p,state,dispatch=true)=>p.evaluate(([state,dispatch])=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>state});Object.defineProperty(document,'hidden',{configurable:true,get:()=>state==='hidden'});if(dispatch)document.dispatchEvent(new Event('visibilitychange'))},[state,dispatch]);
const restoreVisibility=p=>p.evaluate(()=>{delete document.visibilityState;delete document.hidden});

async function run(browser,name){
 {const {context,p,errors}=await session(browser);
  const worker=p.workers().find(w=>w.url().endsWith('save-worker.js'));
  await worker.evaluate(()=>{const get=IDBObjectStore.prototype.get;self.__gets=[];IDBObjectStore.prototype.get=function(k){self.__gets.push(String(k));return get.call(this,k)}});
  await p.evaluate(()=>{const post=Worker.prototype.postMessage;window.__wide=0;window.__puts=0;Worker.prototype.postMessage=function(m,...rest){if(m?.type==='put'){__puts++;for(let i=0;i<m.json.length;i++)if(m.json.charCodeAt(i)>255){__wide++;break}}return post.call(this,m,...rest)}});
  const title='Fizyoloji – kalp ş ğ ı İ';
  await p.evaluate(t=>{page().title=t;scheduleSave()},title);
  for(const x of [100,180,260,340])await stroke(p,x);
  await savedAll(p,'marker saves');
  assert.equal((await disk(p)).pages.find(x=>x.title===title)?.title,title,'wide characters stored as text');
  const gets=await worker.evaluate(()=>self.__gets);
  assert.equal(gets.includes('app'),false,'the worker never read the notebook back: '+gets.join(','));
  assert.ok(gets.includes('app-writer'));
  const sent=await p.evaluate(()=>({wide:__wide,puts:__puts}));assert.ok(sent.puts>=1);assert.equal(sent.wide,0,'save text is one-byte');
  pass(`${name}: saves check the marker, never read the notebook back, and send one-byte text; wide characters are stored unchanged`);

  // Another v69 tab writes; this tab's next save is refused and the other write survives.
  const {p:q}=await open(context);
  await q.evaluate(()=>{page().title='OTHER_TAB';scheduleSave()});await settled(q);
  const other=JSON.stringify(await disk(p));
  await stroke(p,420);await p.waitForFunction(()=>saveConflict,null,{timeout:10000});
  assert.equal(JSON.stringify(await disk(p)),other);
  pass(`${name}: a save after another tab wrote is still refused as a conflict and the other write survives`);
  await q.close();assert.deepEqual(errors,[]);await context.close();}

 {const {context,p,errors}=await session(browser);
  await stroke(p,100);await settled(p);
  // A tab without a worker saves on the page path; it moves the marker as well.
  const {p:q}=await open(context,{noWorker:true});
  await q.evaluate(()=>{page().title='PAGE_PATH_TAB';scheduleSave()});await settled(q);
  const other=JSON.stringify(await disk(p));assert.equal(JSON.parse(other).pages[0].title,'PAGE_PATH_TAB');
  assert.equal((await disk(p,'app-writer')).writer,await q.evaluate(()=>saveWriter));
  await stroke(p,200);await p.waitForFunction(()=>saveConflict,null,{timeout:10000});
  assert.equal(JSON.stringify(await disk(p)),other);
  pass(`${name}: the page save path also writes the marker, so a worker tab notices its write`);
  await q.close();assert.deepEqual(errors,[]);await context.close();}

 {const {context,p,errors}=await session(browser);
  await stroke(p,100);await settled(p);
  // A write commits but its answer is lost; the replacement worker adopts it and is then lost too
  // before its own write. The next worker must accept the adopted marker (v68 refused it).
  await p.evaluate(()=>{const orig=startSaveWorker;window.__kill=1;startSaveWorker=async(...a)=>{const r=await orig(...a);if(window.__kill-->0){const w=saveWorker;w.terminate();setTimeout(()=>saveWorkerFailed(w),100)}return r};window.__stalled=saveWorker;saveWorker.onmessage=()=>{}});
  const n=await p.evaluate(()=>page().strokes.length);
  await stroke(p,200);
  await p.waitForFunction(async n=>{const d=await new Promise(ok=>{const r=indexedDB.open(DB,1);r.onsuccess=()=>{const q=r.result.transaction(STORE).objectStore(STORE).get('app');q.onsuccess=()=>{r.result.close();ok(q.result)}}});return d.pages.find(x=>x.id===d.active).strokes.length===n+1},n,{timeout:10000});
  await p.evaluate(()=>saveWorkerFailed(__stalled));
  await savedAll(p,'after adopt and second loss');
  assert.equal(await p.evaluate(()=>__kill),-1,'the adopted worker was killed once');
  pass(`${name}: a worker lost right after adopting is replaced again without a false conflict`);
  assert.deepEqual(errors,[]);await context.close();}

 {const {context,p,errors}=await session(browser);
  await stroke(p,100);await settled(p);
  await failPuts(p,['UnknownError']);await stroke(p,200);
  await p.waitForFunction(()=>saveRetrying,null,{timeout:5000});
  let v=await view(p);assert.equal(v.failed,false);assert.equal(v.status,'Kayıt yeniden deneniyor…');
  assert.equal(await p.evaluate(()=>document.querySelector('#saveRecovery').hidden),true,'no banner on a first transient failure');
  await savedAll(p,'quiet retry');
  const events=(await log(p)).map(x=>x.ev);assert.ok(events.includes('save-fail')&&events.includes('save-recovered'),events.join(','));
  pass(`${name}: a first transient failure retries by itself after a short wait, with no banner, and is logged`);

  await failPuts(p,['UnknownError','UnknownError','UnknownError']);
  await stroke(p,300);await p.waitForFunction(()=>saveRetrying||saveFailed,null,{timeout:5000});
  for(const x of [340,380,420])await stroke(p,x);
  await p.waitForTimeout(500);
  assert.equal(await p.evaluate(()=>__puts),1,'edits during the backoff do not each attempt a save');
  await p.waitForFunction(()=>saveFailed,null,{timeout:8000});
  v=await view(p);assert.equal(v.status,'Kaydedilemedi — yedek alın');assert.match(v.message,/Ayrıntı: UnknownError\.$/);
  await savedAll(p,'backoff recovery',25000);
  assert.equal(await p.evaluate(()=>__puts),4,'retries back off: 1 + 3 attempts in total');
  pass(`${name}: repeated failures show the banner with the reason, back off without per-stroke attempts and recover by themselves`);

  await failPuts(p,['QuotaExceededError']);await stroke(p,460);
  await p.waitForFunction(()=>saveFailed,null,{timeout:5000});
  v=await view(p);assert.match(v.message,/Cihaz depolaması dolu/);assert.match(v.message,/Ayrıntı: QuotaExceededError\.$/);
  await savedAll(p,'after space was freed');
  pass(`${name}: a full device is named at once and the save is retried until it succeeds`);

  await p.evaluate(()=>{page().strokes.push({tool:'pen',color:'#000000',width:-1,points:[]});scheduleSave()});
  await p.waitForFunction(()=>saveFailed,null,{timeout:5000});
  assert.match((await view(p)).message,/Ayrıntı: InvalidNotebook\.$/);
  assert.equal(await p.evaluate(()=>retryTimer),null,'a refused notebook is not retried');
  await p.evaluate(()=>{page().strokes.pop();document.querySelector('#retrySave').click()});await savedAll(p,'after the invalid edit was removed');
  pass(`${name}: a notebook refused by validation shows its own code and is not retried blindly`);
  assert.deepEqual(errors,[]);await context.close();}

 {const {context,p,errors}=await session(browser);
  const timing=await p.evaluate(async()=>{let vis='hidden';Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>vis});
   let fired=0;visibleTimeout(()=>fired++,200);await new Promise(r=>setTimeout(r,450));const whileHidden=fired;
   vis='visible';lastShownAt=performance.now();await new Promise(r=>setTimeout(r,120));const justShown=fired;
   await new Promise(r=>setTimeout(r,350));const later=fired;delete document.visibilityState;return {whileHidden,justShown,later}});
  assert.deepEqual(timing,{whileHidden:0,justShown:0,later:1});
  pass(`${name}: save deadlines count visible time only; time spent hidden or suspended never trips them`);

  // Leaving: a small notebook keeps the full check; a large one saves only what changed; blur saves nothing.
  await p.evaluate(()=>{window.__stale=0;window.__full=[];const stale=pageCacheStale,ser=serializeNotebook;pageCacheStale=()=>{__stale++;return stale()};serializeNotebook=(s,full)=>{__full.push(!!full);return ser(s,full)}});
  await stroke(p,100);await settled(p);
  await setVisibility(p,'hidden');await settled(p);
  assert.equal(await p.evaluate(()=>__stale),1,'small notebook: idle cache check on leaving');
  await setVisibility(p,'visible');
  await p.evaluate(()=>{lastSaveBytes=9*1024*1024;__stale=0;__full=[]});
  await stroke(p,200);await p.evaluate(()=>{clearTimeout(inkSaveTimer);inkSaveTimer=null});
  await setVisibility(p,'hidden');await settled(p);
  assert.deepEqual(await p.evaluate(()=>({stale:__stale,full:__full,next:saveFullNext})),{stale:0,full:[false],next:false});
  await setVisibility(p,'visible');
  await stroke(p,300);await p.evaluate(()=>{clearTimeout(inkSaveTimer);inkSaveTimer=null;__full=[];window.dispatchEvent(new Event('blur'))});
  assert.deepEqual(await p.evaluate(()=>({full:__full,dirty:isDirty(),next:saveFullNext})),{full:[],dirty:true,next:false});
  await p.evaluate(()=>flushSave());await settled(p);
  await restoreVisibility(p);
  pass(`${name}: leaving saves a large notebook without a full rewrite, a small one keeps the full check, and focus loss alone does not save`);
  assert.deepEqual(errors,[]);await context.close();}

 {const {context,p,errors}=await session(browser);
  await p.evaluate(()=>{page().title='GIZLI_NOT_BASLIGI';scheduleSave()});await stroke(p,100);await settled(p);
  // The closing page would mark itself clean; stand in for a page that was ended while visible.
  await p.evaluate(()=>{lifeWrite=()=>{};localStorage.setItem('bilge-life-v1',JSON.stringify({session:'x',beat:Date.now()-5000,clean:false,version:'v69'}))});
  await p.reload();await p.waitForFunction(()=>ready&&saveWorker);
  const start=(await log(p)).filter(x=>x.ev==='start').pop();
  assert.equal(start.prevClean,false);assert.equal(start.trusted,true,'a v69 marker is trusted after reload');assert.ok(start.len>0);
  await p.evaluate(()=>window.openReliability());
  assert.match(await p.locator('#diagSummary').textContent(),/beklenmedik biçimde kapanmış/);
  const [download]=await Promise.all([p.waitForEvent('download'),p.locator('#diagExport').click()]);
  const file=path.join(out,name+'-tani.json');await download.saveAs(file);const text=fs.readFileSync(file,'utf8'),report=JSON.parse(text);
  assert.equal(report.format,'bilge-diagnostics-v1');assert.equal(report.app,'v69');assert.ok(report.log.some(x=>x.ev==='start'));
  assert.equal(text.includes('GIZLI_NOT_BASLIGI'),false,'no note content in the diagnostic file');
  assert.equal(report.notebookBytes,await p.evaluate(()=>lastSaveBytes));
  pass(`${name}: a page that ended while visible is recorded at the next start, and the diagnostic file has no note content`);
  assert.deepEqual(errors,[]);await context.close();}

 {const {context,p,errors}=await session(browser);
  const r=await p.evaluate(()=>{const c=document.createElement('canvas');c.width=1000;c.height=1414;const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,1000,1414);g.fillStyle='#123';g.fillRect(100,100,500,300);
   const jpeg=c.toDataURL('image/jpeg',.8),png=c.toDataURL('image/png'),bg=image=>({image,width:1000,height:1414,name:'a.pdf',number:1,total:1});
   return {jpeg:validPdfBackground(bg(jpeg)),jpegWrongSize:validPdfBackground({...bg(jpeg),height:1400}),png:validPdfBackground(bg(png)),junk:validPdfBackground(bg('data:image/jpeg;base64,AAAA')),gif:validPdfBackground(bg('data:image/gif;base64,R0lGODlh'))}});
  assert.deepEqual(r,{jpeg:true,jpegWrongSize:false,png:true,junk:false,gif:false});
  pass(`${name}: JPEG PDF page images are read and size-checked (for a later release); PNG unchanged; others refused`);

  const before=await p.evaluate(()=>state.pages.length);
  const msg=await p.evaluate(async()=>{lastSaveBytes=NOTEBOOK_PDF_LIMIT-10;const c=document.createElement('canvas');c.width=1000;c.height=1414;
   pdfPending={title:'Büyük',pages:[{id:newPageId(),title:'PDF · Sayfa 1',strokes:[],viewY:0,pdf:{image:c.toDataURL('image/png'),width:1000,height:1414,name:'b.pdf',number:1,total:1},updated:new Date().toISOString()}]};
   pdfDialog.showModal();document.querySelector('#pdfApply').disabled=false;await document.querySelector('#pdfApply').onclick();return document.querySelector('#pdfProgress').textContent});
  assert.match(msg,/sınır 48 MB/);assert.equal(await p.evaluate(()=>state.pages.length),before);
  pass(`${name}: a PDF that would take the notebook over 48 MB is refused with guidance and nothing changes`);

  await p.evaluate(()=>{window.__beforeImportReads=0;const get=dbGet;dbGet=(k,...r)=>{if(k==='before-import')__beforeImportReads++;return get(k,...r)}});
  await p.evaluate(()=>refreshRecovery());
  assert.deepEqual(await p.evaluate(()=>({reads:__beforeImportReads,disabled:document.querySelector('#restorePrevious').disabled})),{reads:0,disabled:true});
  pass(`${name}: the recovery button checks that a copy exists without decoding it`);
  assert.deepEqual(errors,[]);await context.close();}
}
(async()=>{
 for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){const browser=await engine.launch({headless:true});try{await run(browser,name)}finally{await browser.close()}}
 fs.writeFileSync(path.join(out,'save-v69-tests.json'),JSON.stringify({passed:results.length,results,synthetic:true,realDevice:false},null,2));
 console.log(JSON.stringify({passed:results.length,failed:0}));
})().catch(e=>{console.error(e);process.exit(1)});
