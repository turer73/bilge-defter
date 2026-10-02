'use strict';
// v71 asset writer. Images are stored apart by default: a new notebook and an existing inline one
// switch to keys by themselves; a save naming a deleted asset is refused and repeated with the image
// inline; cleanup removes only old assets that nothing names; the page path has the same guard; the
// published v70 opens what v71 wrote (rollback); the PDF cap counts the notebook's images. Synthetic.
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),{chromium,webkit}=require('playwright');
const root=path.resolve(process.env.BILGE_TEST_ROOT||path.join(__dirname,'bilge-defter-invited-v71'));
const prior=path.resolve(process.env.BILGE_PRIOR_ROOT||path.join(__dirname,'bilge-defter-invited-v70'));
const out=path.resolve(process.env.BILGE_TEST_OUTPUT||path.join(__dirname,'../outputs/v71-assets'));
const origin='http://127.0.0.1:49380';fs.mkdirSync(out,{recursive:true});
const results=[];const pass=s=>{results.push(s);console.log('PASS '+s)};
function serveFrom(dir){return r=>{const u=new URL(r.request().url());if(u.origin!==origin)return r.abort();const f=path.resolve(dir,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));return f.startsWith(dir+path.sep)&&fs.existsSync(f)?r.fulfill({path:f}):r.fulfill({status:404,body:'missing'})}}
async function session(browser,{noWorker=false}={}){
 const context=await browser.newContext({viewport:{width:1180,height:820},serviceWorkers:'block'}),errors=[];
 context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
 await context.addInitScript(o=>{if(location.origin===o){window.__accountRequired=false;localStorage.setItem('bilge_defter_onboarding_v1','true')}},origin);
 const handler=serveFrom(root);await context.route('**/*',handler);
 const p=await context.newPage();if(noWorker)await p.addInitScript(()=>{window.Worker=function(){throw new Error('blocked')}});
 await p.goto(origin);await p.waitForFunction(w=>typeof ready!=='undefined'&&ready&&(w?!saveWorker:!!saveWorker),noWorker,{timeout:20000});
 return {context,p,errors,handler};
}
const settled=(p,timeout=15000)=>p.waitForFunction(()=>!isDirty()&&!savePromise,null,{timeout});
const raw=(p,key='app')=>p.evaluate(key=>new Promise((ok,no)=>{const r=indexedDB.open(DB,1);r.onerror=()=>no(r.error);r.onsuccess=()=>{const q=r.result.transaction(STORE).objectStore(STORE).get(key);q.onsuccess=()=>{r.result.close();ok(q.result===undefined?null:q.result)};q.onerror=()=>no(q.error)}}),key);
const put=(p,key,value)=>p.evaluate(([key,value])=>new Promise(ok=>{const r=indexedDB.open(DB,1);r.onsuccess=()=>{const tx=r.result.transaction(STORE,'readwrite');value===null?tx.objectStore(STORE).delete(key):tx.objectStore(STORE).put(value,key);tx.oncomplete=()=>{r.result.close();ok()}}}),[key,value]);
const assetKeys=p=>p.evaluate(()=>new Promise((ok,no)=>{const r=indexedDB.open(DB,1);r.onsuccess=()=>{const q=r.result.transaction(STORE).objectStore(STORE).getAllKeys(IDBKeyRange.bound('asset:','asset;',false,true));q.onsuccess=()=>{r.result.close();ok(q.result)};q.onerror=()=>no(q.error)}}));
const inlineIn=async p=>JSON.stringify(await raw(p)).split('data:image/').length-1;
const keyed=async(p,n,timeout=15000)=>{const end=Date.now()+timeout;for(;;){if((await assetKeys(p)).length>=n&&await inlineIn(p)===0&&await p.evaluate(()=>!isDirty()&&!savePromise))return;if(Date.now()>end)throw new Error(`not keyed: ${(await assetKeys(p)).length} assets, ${await inlineIn(p)} inline`);await p.waitForTimeout(250)}};
const reopen=async p=>{await p.reload();await p.waitForFunction(()=>typeof ready!=='undefined'&&ready,null,{timeout:20000})};
const stroke=(p,x)=>p.locator('#canvas').evaluate((c,x)=>{const r=c.getBoundingClientRect();for(const [type,dx] of [['pointerdown',0],['pointermove',40],['pointerup',80]])c.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:7,pointerType:'pen',clientX:r.x+x+dx,clientY:r.y+200,pressure:.5}))},x);
const seed=p=>p.evaluate(()=>{
 const sheet=(w,h,fill)=>{const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,w,h);g.fillStyle=fill;for(let y=4;y<h;y+=9)for(let x=4;x<w;x+=11)if((x*7+y*13)%5<2)g.fillRect(x,y,6,5);return c.toDataURL('image/png')};
 const a=sheet(1000,1414,'#246'),b=sheet(1000,1414,'#642'),m=sheet(60,40,'#0a0');
 const nb=newPageId(),pdf=(image,number)=>({image,width:1000,height:1414,name:'ders.pdf',number,total:2});
 const p1={id:newPageId(),title:'PDF · Sayfa 1',strokes:[],viewY:0,notebookId:nb,pdf:pdf(a,1),updated:new Date().toISOString()};
 const p2={id:newPageId(),title:'PDF · Sayfa 2',strokes:[{tool:'image',image:m,imageWidth:60,imageHeight:40,width:120,points:[{x:20,y:20}]}],viewY:0,notebookId:nb,pdf:pdf(b,2),updated:new Date().toISOString()};
 state={...state,version:4,notebooks:[...(state.notebooks||[]),{id:nb,title:'Kardiyoloji – ş'}],pages:[...state.pages,p1,p2]};
 activeId=p2.id;activeNotebook=nb;state.active=activeId;state.activeNotebook=nb;renderPages();drawAll();scheduleSave();
 return {a,b,m};
});
const images=p=>p.evaluate(()=>{const pg=state.pages.filter(x=>x.pdf);return {a:pg[0].pdf.image,b:pg[1].pdf.image,m:pg[1].strokes[0].image}});

async function run(browser,name){
 {const {context,p,errors,handler}=await session(browser);
  assert.equal(await p.evaluate(()=>ASSET_WRITE),true);
  const imgs=await seed(p);await keyed(p,3);
  pass(`${name}: a new notebook's images are stored apart by themselves after the first save`);

  await reopen(p);assert.deepEqual(await images(p),imgs);assert.equal(await p.evaluate(()=>validState(state)),true);
  // Rollback: the published v70 opens what v71 wrote, with every image, and keeps the keys.
  await context.unroute('**/*',handler);await context.route('**/*',serveFrom(prior));
  await reopen(p);
  assert.equal(await p.evaluate(()=>APP_VERSION),'v70');assert.deepEqual(await images(p),imgs);assert.equal(await p.evaluate(()=>validState(state)),true);
  await stroke(p,200);await settled(p);assert.equal(await inlineIn(p),0,'v70 keeps the keys');
  await context.unroute('**/*');await context.route('**/*',serveFrom(root));await reopen(p);assert.equal(await p.evaluate(()=>APP_VERSION),'v71');
  pass(`${name}: the published v70 opens a notebook written by v71 with every image and keeps its keys (rollback is safe)`);

  // A save naming an asset that was deleted is refused by the worker and repeated with the image inline.
  const keys=await assetKeys(p),victim=(await raw(p)).pages.find(x=>x.pdf?.number===1).pdf.image;assert.ok(keys.includes(victim));
  await put(p,victim,null);await stroke(p,260);await settled(p);
  let v=await p.evaluate(()=>({failed:saveFailed,retrying:saveRetrying}));assert.deepEqual(v,{failed:false,retrying:false});
  assert.equal(await inlineIn(p),1,'the missing image is saved inline');
  assert.ok((await p.evaluate(()=>JSON.parse(localStorage.getItem('bilge-diag-v1')||'[]'))).some(x=>x.ev==='asset-missing'));
  await keyed(p,3);await reopen(p);assert.deepEqual(await images(p),imgs);
  pass(`${name}: a save naming a deleted asset is refused, repeated with the image inline, and the image is stored again`);

  // Cleanup: only old assets that neither the record nor the before-import copy names are removed.
  const fake=c=>'asset:'+c.repeat(64),old=Date.now()-8*864e5,recent=Date.now()-864e5;
  await put(p,fake('a'),{data:imgs.m,t:old});await put(p,fake('b'),{data:imgs.m,t:recent});await put(p,fake('c'),{data:imgs.m,t:old});
  const named=(await raw(p)).pages.find(x=>x.pdf?.number===2).pdf.image;await put(p,named,{data:imgs.b,t:old});
  await put(p,'before-import',{version:4,pages:[{id:'x',title:'eski',strokes:[],pdf:{image:fake('c'),width:1000,height:1414,name:'e.pdf',number:1,total:1}}],active:'x'});
  assert.equal(await p.evaluate(()=>gcAssets()),1);
  const left=await assetKeys(p);
  assert.equal(left.includes(fake('a')),false,'old and unnamed: removed');
  assert.ok(left.includes(fake('b'))&&left.includes(fake('c'))&&left.includes(named),'recent, named by before-import, and named by the record: kept');
  await reopen(p);assert.deepEqual(await images(p),imgs);
  pass(`${name}: cleanup removes only old assets that nothing names; the record, the before-import copy and recent assets are safe`);

  const msg=await p.evaluate(async()=>{notebookImageBytes=()=>NOTEBOOK_PDF_LIMIT-10;const c=document.createElement('canvas');c.width=1000;c.height=1414;
   pdfPending={title:'Büyük',pages:[{id:newPageId(),title:'PDF · Sayfa 1',strokes:[],viewY:0,pdf:{image:c.toDataURL('image/png'),width:1000,height:1414,name:'b.pdf',number:1,total:1},updated:new Date().toISOString()}]};
   pdfDialog.showModal();document.querySelector('#pdfApply').disabled=false;await document.querySelector('#pdfApply').onclick();return document.querySelector('#pdfProgress').textContent});
  assert.match(msg,/görseller/);assert.match(msg,/sınır 96 MB/);
  pass(`${name}: the PDF cap counts the notebook's images (96 MB), not the now small record`);
  assert.deepEqual(errors,[]);await context.close();}

 {const {context,p,errors}=await session(browser);
  // An inline notebook written before v71 (v70 never wrote assets) switches to keys after startup.
  await p.evaluate(()=>{ASSET_WRITE=false});await seed(p);await settled(p);assert.ok(await inlineIn(p)>=3);
  await reopen(p);await keyed(p,3);
  pass(`${name}: an existing inline notebook switches to stored images by itself after startup`);
  assert.deepEqual(errors,[]);await context.close();}

 {const {context,p,errors}=await session(browser,{noWorker:true});
  await seed(p);await keyed(p,3);
  const victim=(await raw(p)).pages.find(x=>x.pdf?.number===2).pdf.image;await put(p,victim,null);
  await stroke(p,300);await settled(p);
  assert.deepEqual(await p.evaluate(()=>({failed:saveFailed,worker:!!saveWorker})),{failed:false,worker:false});
  assert.equal(await inlineIn(p),1);
  pass(`${name}: without a worker the page path refuses a deleted key the same way and saves the image inline`);
  assert.deepEqual(errors,[]);await context.close();}
}
(async()=>{
 for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){const browser=await engine.launch({headless:true});try{await run(browser,name)}finally{await browser.close()}}
 fs.writeFileSync(path.join(out,'assets-v71-tests.json'),JSON.stringify({passed:results.length,results,synthetic:true,realDevice:false},null,2));
 console.log(JSON.stringify({passed:results.length,failed:0}));
})().catch(e=>{console.error(e);process.exit(1)});
