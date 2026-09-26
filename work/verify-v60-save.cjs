'use strict';
// v60 off-thread save: same record, same full-JSON compare-and-swap, same JSON
// normalization; measured main-thread blocking. Synthetic notebooks, no physical iPad.
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),{chromium,webkit}=require('playwright');
const root=path.resolve(process.env.BILGE_TEST_ROOT||path.join(__dirname,'bilge-defter-invited-v60'));
const out=path.resolve(process.env.BILGE_TEST_OUTPUT||path.join(__dirname,'../outputs/v60-save'));
const origin='http://127.0.0.1:49362';fs.mkdirSync(out,{recursive:true});
const results=[],numbers=[];const pass=s=>{results.push(s);console.log('PASS '+s)};
async function context(browser,{noWorker=false}={}){
 const c=await browser.newContext({viewport:{width:1180,height:820},serviceWorkers:'block'}),errors=[];
 c.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
 await c.addInitScript(([noWorker,origin])=>{if(location.origin!==origin)return;localStorage.setItem('bilge_defter_onboarding_v1','true');if(noWorker)window.Worker=undefined},[noWorker,origin]);
 await c.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!==origin)return r.abort();const f=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));return f.startsWith(root+path.sep)&&fs.existsSync(f)?r.fulfill({path:f}):r.fulfill({status:404,body:'{}'})});
 return {c,errors};
}
async function open(c){const p=await c.newPage();await p.goto(origin);await p.waitForFunction(()=>typeof ready!=='undefined'&&ready);return p}
function stored(p,key='app'){return p.evaluate(key=>new Promise((ok,no)=>{const r=indexedDB.open(DB,1);r.onerror=()=>no(r.error);r.onsuccess=()=>{const q=r.result.transaction(STORE).objectStore(STORE).get(key);q.onsuccess=()=>{r.result.close();ok(q.result===undefined?null:JSON.stringify(q.result))};q.onerror=()=>no(q.error)}}),key)}
const edit=(p,title)=>p.evaluate(async title=>{page().title=title;markChanged(false);return flushSave()},title);
async function blocking(browser,noWorker){
 const {c}=await context(browser,{noWorker}),p=await open(c);
 const r=await p.evaluate(async()=>{
  const list=[];for(let pi=0;pi<30;pi++){const s=[];for(let k=0;k<300;k++){const pts=[];for(let i=0;i<60;i++)pts.push({x:100+Math.random()*600,y:100+Math.random()*800,p:Math.random()});s.push({tool:'pen',color:'#1d1d1f',width:2,points:pts})}list.push({id:'syn-'+pi+'-'+Math.random().toString(36).slice(2),title:'S'+pi,strokes:s,updated:new Date().toISOString()})}
  state.pages=list;activeId=list[0].id;state.active=activeId;markChanged(false);await flushSave();
  const runs=[];
  for(let n=0;n<3;n++){
   page().strokes[0].points[0].x+=1;markChanged(false);
   let maxGap=0,last=performance.now(),on=true;const tick=()=>{const now=performance.now();maxGap=Math.max(maxGap,now-last);last=now;if(on)setTimeout(tick,0)};setTimeout(tick,0);
   await new Promise(r=>setTimeout(r,30));last=performance.now();maxGap=0;
   const a=performance.now();const ok=await flushSave();const ms=performance.now()-a;on=false;runs.push({ok,ms,maxGap});
  }
  runs.sort((a,b)=>a.maxGap-b.maxGap);return {worker:!!saveWorker,ok:runs.every(x=>x.ok),maxGap:Math.round(runs[1].maxGap),ms:Math.round(runs[1].ms)};
 });
 await c.close();return r;
}
(async()=>{
 const shipped=fs.readFileSync(path.join(root,'sync-workspace.js'),'utf8');
 assert(!shipped.includes('pushManager.subscribe')&&!shipped.includes('bildirimler açık')&&shipped.includes('unsubscribe()'));
 pass('Sync no longer subscribes to or advertises server push; an old subscription is dropped');
 for(const [engine,name] of [[chromium,'chromium'],[webkit,'webkit']]){
  const browser=await engine.launch({headless:true});
  try{
   {const {c,errors}=await context(browser),p=await open(c);
    assert.equal(await p.evaluate(()=>!!saveWorker),true);
    await edit(p,'V60_WORKER_SAVE');
    assert.equal(await stored(p),await p.evaluate(()=>JSON.stringify({...state,active:activeId})));
    await p.reload();await p.waitForFunction(()=>ready);assert.equal(await p.evaluate(()=>page().title),'V60_WORKER_SAVE');
    pass(`${name}: worker save writes the same JSON-normalized record and survives reload`);
    const other=await open(c);await edit(p,'TAB_ONE');await edit(other,'TAB_TWO_STALE');
    assert.equal(await other.evaluate(()=>saveConflict),true);const disk=JSON.parse(await stored(p));assert.equal(disk.pages.find(x=>x.id===disk.active).title,'TAB_ONE');
    await other.close();pass(`${name}: a stale second tab is refused by the worker compare-and-swap; disk keeps the first tab`);
    const previous=await stored(p);
    await p.evaluate(async()=>{const imported=JSON.parse(JSON.stringify({...state,active:activeId}));imported.pages[0].title='V60_IMPORTED';await dbPut(imported,{preservePrevious:true})});
    assert.equal(await stored(p,'before-import'),previous);assert.equal(JSON.parse(await stored(p)).pages[0].title,'V60_IMPORTED');
    pass(`${name}: import keeps the previous notebook as the before-import recovery copy`);
    const before=await stored(p);
    await p.evaluate(()=>saveWorker.onerror(new Event('error')));assert.equal(await p.evaluate(()=>saveWorker),null);
    await edit(p,'AFTER_WORKER_FAILURE');assert.equal(await p.evaluate(()=>saveConflict),true);assert.equal(await stored(p),before);
    pass(`${name}: after a worker failure the next save stops as a conflict and leaves disk unchanged`);
    assert.deepEqual(errors,[]);await c.close();}
   {const {c,errors}=await context(browser,{noWorker:true}),p=await open(c);
    assert.equal(await p.evaluate(()=>saveWorker),null);await edit(p,'V60_FALLBACK');
    await p.reload();await p.waitForFunction(()=>ready);assert.equal(await p.evaluate(()=>page().title),'V60_FALLBACK');
    const other=await open(c);await edit(p,'FALLBACK_ONE');await edit(other,'FALLBACK_TWO_STALE');assert.equal(await other.evaluate(()=>saveConflict),true);
    assert.deepEqual(errors,[]);await c.close();pass(`${name}: without a worker the original main-thread save and conflict check still work`);}
   const worker=await blocking(browser,false),fallback=await blocking(browser,true);
   assert(worker.worker&&worker.ok&&fallback.ok&&!fallback.worker);numbers.push({engine:name,notebookMB:36,workerMaxGapMs:worker.maxGap,mainThreadMaxGapMs:fallback.maxGap,workerSaveMs:worker.ms,mainThreadSaveMs:fallback.ms});
   console.log(JSON.stringify(numbers.at(-1)));
   assert(worker.maxGap<=fallback.maxGap*0.6,`${name}: worker ${worker.maxGap}ms vs main ${fallback.maxGap}ms`);
   pass(`${name}: 36 MB notebook save blocks the page ${worker.maxGap} ms instead of ${fallback.maxGap} ms`);
  }finally{await browser.close()}
 }
 fs.writeFileSync(path.join(out,'save-tests.json'),JSON.stringify({passed:results.length,results,numbers,synthetic:true,realDevice:false},null,2));
 console.log(JSON.stringify({passed:results.length,failed:0}));
})().catch(e=>{console.error(e);process.exit(1)});
