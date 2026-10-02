'use strict';
// v70 asset store. A record whose PDF page and inserted images live under 'asset:<sha-256>' keys
// opens with every image, saves keep the keys (small records), export and the before-import copy carry
// the images, a missing asset stops startup in recovery without deleting anything, sync acknowledgement
// stays clean, and the writer (off in v70, switched on here) stores each image once and only then uses
// its key. New PDF pages are JPEG only when clearly smaller. Synthetic, no iPad.
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),{chromium,webkit}=require('playwright');
const root=path.resolve(process.env.BILGE_TEST_ROOT||path.join(__dirname,'bilge-defter-invited-v70'));
const out=path.resolve(process.env.BILGE_TEST_OUTPUT||path.join(__dirname,'../outputs/v70-assets'));
const origin='http://127.0.0.1:49379';fs.mkdirSync(out,{recursive:true});
const results=[];const pass=s=>{results.push(s);console.log('PASS '+s)};
async function session(browser){
 const context=await browser.newContext({viewport:{width:1180,height:820},serviceWorkers:'block',acceptDownloads:true}),errors=[];
 context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
 await context.addInitScript(o=>{if(location.origin===o){window.__accountRequired=false;localStorage.setItem('bilge_defter_onboarding_v1','true')}},origin);
 await context.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!==origin)return r.abort();const f=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));return f.startsWith(root+path.sep)&&fs.existsSync(f)?r.fulfill({path:f}):r.fulfill({status:404,body:'missing'})});
 const p=await context.newPage();await p.goto(origin);await p.waitForFunction(()=>typeof ready!=='undefined'&&ready&&saveWorker);
 return {context,p,errors};
}
const settled=(p,timeout=15000)=>p.waitForFunction(()=>!isDirty()&&!savePromise,null,{timeout});
const raw=(p,key='app')=>p.evaluate(key=>new Promise((ok,no)=>{const r=indexedDB.open(DB,1);r.onerror=()=>no(r.error);r.onsuccess=()=>{const q=r.result.transaction(STORE).objectStore(STORE).get(key);q.onsuccess=()=>{r.result.close();ok(q.result===undefined?null:q.result)};q.onerror=()=>no(q.error)}}),key);
const assetKeys=p=>p.evaluate(()=>new Promise((ok,no)=>{const r=indexedDB.open(DB,1);r.onsuccess=()=>{const q=r.result.transaction(STORE).objectStore(STORE).getAllKeys(IDBKeyRange.bound('asset:','asset;',false,true));q.onsuccess=()=>{r.result.close();ok(q.result)};q.onerror=()=>no(q.error)}}));
const reopen=async p=>{await p.reload();await p.waitForFunction(()=>typeof ready!=='undefined'&&ready&&saveWorker,null,{timeout:20000})};
const stroke=(p,x)=>p.locator('#canvas').evaluate((c,x)=>{const r=c.getBoundingClientRect();for(const [type,dx] of [['pointerdown',0],['pointermove',40],['pointerup',80]])c.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:7,pointerType:'pen',clientX:r.x+x+dx,clientY:r.y+200,pressure:.5}))},x);
// A notebook with two PDF pages (one image shared by a trashed copy) and one inserted image.
const seed=p=>p.evaluate(async()=>{
 const sheet=(w,h,fill)=>{const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,w,h);g.fillStyle=fill;for(let y=4;y<h;y+=9)for(let x=4;x<w;x+=11)if((x*7+y*13)%5<2)g.fillRect(x,y,6,5);return c.toDataURL('image/png')};
 const a=sheet(1000,1414,'#246'),b=sheet(1000,1414,'#642'),m=sheet(60,40,'#0a0');
 const nb=newPageId(),pdf=(image,number)=>({image,width:1000,height:1414,name:'ders.pdf',number,total:2});
 const p1={id:newPageId(),title:'PDF · Sayfa 1',strokes:[],viewY:0,notebookId:nb,pdf:pdf(a,1),updated:new Date().toISOString()};
 const p2={id:newPageId(),title:'PDF · Sayfa 2',strokes:[{tool:'image',image:m,imageWidth:60,imageHeight:40,width:120,points:[{x:20,y:20}]}],viewY:0,notebookId:nb,pdf:pdf(b,2),updated:new Date().toISOString()};
 state={...state,version:4,notebooks:[...(state.notebooks||[]),{id:nb,title:'Kardiyoloji – ş'}],pages:[...state.pages,p1,p2],trash:[{page:{...p1,id:newPageId(),strokes:[]},notebookTitle:'Kardiyoloji – ş',deletedAt:new Date().toISOString(),position:0}]};
 activeId=p2.id;activeNotebook=nb;state.active=activeId;state.activeNotebook=nb;renderPages();drawAll();scheduleSave();
 return {a,b,m};
});

async function run(browser,name){
 {const {context,p,errors}=await session(browser);
  assert.equal(await p.evaluate(()=>ASSET_WRITE),false,'v70 does not create assets by default');
  const imgs=await seed(p);await settled(p);
  assert.deepEqual(await assetKeys(p),[],'no assets are written while writing is off');
  const inlineSize=JSON.stringify(await raw(p)).length;
  // Switch the writer on (as the next release will) and let it store the images.
  await p.evaluate(()=>{ASSET_WRITE=true});
  assert.equal(await p.evaluate(()=>ensureAssets()),3,'three distinct images become assets (the trashed copy shares one)');
  await settled(p);
  const keys=await assetKeys(p);assert.equal(keys.length,3);assert.ok(keys.every(k=>/^asset:[0-9a-f]{64}$/.test(k)));
  const rec=await raw(p),text=JSON.stringify(rec);
  assert.equal(text.includes('data:image/'),false,'the record names images by key only');
  assert.ok(text.length<inlineSize/4,`record shrank: ${inlineSize} -> ${text.length}`);
  const sent=await p.evaluate(()=>{window.__sizes=[];const post=Worker.prototype.postMessage;Worker.prototype.postMessage=function(m,...r){if(m?.type==='put')__sizes.push(m.json.length);return post.call(this,m,...r)};return true});
  await stroke(p,150);await settled(p);
  const sizes=await p.evaluate(()=>__sizes);assert.ok(sizes.length>=1&&Math.max(...sizes)<20000,`stroke saves carry no images: ${sizes}`);
  assert.equal(await p.evaluate(()=>serializeNotebook({...state,active:activeId},false)===storedText({...state,active:activeId})),true,'cached save text equals the full stored form');
  pass(`${name}: with writing on, each image is stored once, the record and every stroke save carry keys only (${inlineSize} -> ${text.length} bytes)`);

  // A fresh v70 page (writing off) reads the keyed record.
  await reopen(p);
  const back=await p.evaluate(()=>{const pg=state.pages.filter(x=>x.pdf),tp=state.trash[0].page;return {pdf:pg.map(x=>x.pdf.image.slice(0,22)),media:pg[1].strokes[0].image.slice(0,22),trash:tp.pdf.image.slice(0,22),valid:validState(state),write:ASSET_WRITE}});
  assert.deepEqual(back,{pdf:['data:image/png;base64,','data:image/png;base64,'],media:'data:image/png;base64,',trash:'data:image/png;base64,',valid:true,write:false});
  assert.equal(await p.evaluate(i=>state.pages.find(x=>x.pdf?.number===1).pdf.image===i.a&&state.pages.find(x=>x.pdf?.number===2).pdf.image===i.b&&state.pages.find(x=>x.pdf?.number===2).strokes[0].image===i.m,imgs),true,'images come back byte for byte');
  await p.waitForFunction(()=>pdfBackgroundReady(),null,{timeout:10000});
  await stroke(p,250);await settled(p);
  assert.equal(JSON.stringify(await raw(p)).includes('data:image/'),false,'saves after reopening keep the keys');
  const [download]=await Promise.all([p.waitForEvent('download'),p.evaluate(()=>exportNotebook())]);
  const file=path.join(out,name+'-yedek.json');await download.saveAs(file);const backup=fs.readFileSync(file,'utf8');
  assert.ok(backup.includes(imgs.a)&&backup.includes(imgs.b)&&backup.includes(imgs.m)&&!backup.includes('asset:'),'the JSON backup carries the images themselves');
  pass(`${name}: with writing off the keyed record opens with every image, renders, keeps its keys on save and exports full images`);

  // Sync acknowledgement compares against the stored form: a keyed record is not "changed".
  const dirty=await p.evaluate(async()=>{const expected=JSON.stringify({...state,active:activeId});return dbAcknowledgeSync(expected,(await dbGet('sync-state-v2'))||{})});
  assert.equal(dirty,false);
  pass(`${name}: sync acknowledgement of the current notebook is clean when its record uses keys`);

  // The before-import copy written from a keyed record is keyed too and restores with images.
  const restored=await p.evaluate(async()=>{const before=JSON.stringify(state.pages.map(x=>x.title));const other={...state,pages:state.pages.filter(x=>!x.pdf),active:state.pages.find(x=>!x.pdf).id,activeNotebook:undefined};delete other.activeNotebook;
   await replaceNotebook(other,'test');const copy=await dbGet('before-import');const keyed=!JSON.stringify(copy).includes('data:image/');
   window.confirm=()=>true;await document.querySelector('#restorePrevious').onclick();return {keyed,same:JSON.stringify(state.pages.map(x=>x.title))===before,pdfs:state.pages.filter(x=>x.pdf).map(x=>x.pdf.image.slice(0,22))}});
  assert.deepEqual(restored,{keyed:true,same:true,pdfs:['data:image/png;base64,','data:image/png;base64,']});
  pass(`${name}: the before-import copy keeps keys and restores the notebook with its images`);
  assert.deepEqual(errors,[]);await context.close();}

 {const {context,p,errors}=await session(browser);
  await seed(p);await settled(p);await p.evaluate(()=>{ASSET_WRITE=true});await p.evaluate(()=>ensureAssets());await settled(p);
  const keys=await assetKeys(p);
  await p.evaluate(k=>new Promise(ok=>{const r=indexedDB.open(DB,1);r.onsuccess=()=>{const tx=r.result.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(k);tx.oncomplete=()=>{r.result.close();ok()}}}),keys[0]);
  const before=JSON.stringify(await raw(p));
  await p.reload();await p.waitForSelector('#startupRecovery[open]',{timeout:20000});
  assert.equal(JSON.stringify(await raw(p)),before,'nothing was rewritten or deleted');
  const [download]=await Promise.all([p.waitForEvent('download'),p.locator('#rawRecoveryExport').click()]);
  const file=path.join(out,name+'-kurtarma.json');await download.saveAs(file);const rec=JSON.parse(fs.readFileSync(file,'utf8'));
  assert.equal(rec.format,'bilge-defter-recovery-v1');assert.ok(rec.records.app);assert.deepEqual(Object.keys(rec.records.assets).sort(),keys.slice(1).sort());
  pass(`${name}: a record naming a missing image stops in startup recovery, changes nothing, and the recovery file includes the stored images`);
  await context.close();}

 {const {context,p,errors}=await session(browser);
  const pick=await p.evaluate(()=>{const c=document.createElement('canvas');c.width=1000;c.height=1414;const g=c.getContext('2d');
   g.fillStyle='#fff';g.fillRect(0,0,1000,1414);g.fillStyle='#000';g.font='28px serif';for(let y=80;y<1380;y+=40)g.fillText('Kalp döngüsü: sistol ve diyastol evreleri, basınç–hacim ilişkisi',60,y);
   const text=pdfPageImage(c);
   const d=g.createImageData(1000,1414);for(let i=0;i<d.data.length;i+=4){const v=(i/4%1000)/4+Math.random()*60;d.data[i]=v;d.data[i+1]=v*.7;d.data[i+2]=200-v/2;d.data[i+3]=255}g.putImageData(d,0,0);
   const photo=pdfPageImage(c),bg=image=>({image,width:1000,height:1414,name:'a.pdf',number:1,total:1});
   return {text:text.slice(0,15),photo:photo.slice(0,15),photoValid:validPdfBackground(bg(photo)),textValid:validPdfBackground(bg(text))}});
  assert.deepEqual(pick,{text:'data:image/png;',photo:'data:image/jpeg',photoValid:true,textValid:true});
  pass(`${name}: a photo-like PDF page is stored as JPEG, a text page stays PNG, both valid`);
  assert.deepEqual(errors,[]);await context.close();}
}
(async()=>{
 for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){const browser=await engine.launch({headless:true});try{await run(browser,name)}finally{await browser.close()}}
 fs.writeFileSync(path.join(out,'assets-v70-tests.json'),JSON.stringify({passed:results.length,results,synthetic:true,realDevice:false},null,2));
 console.log(JSON.stringify({passed:results.length,failed:0}));
})().catch(e=>{console.error(e);process.exit(1)});
