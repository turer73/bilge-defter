'use strict';
// v61 page-level serialization: every stored record equals JSON.stringify of the notebook,
// missed changes are repaired on leave and when idle, and blocking is measured.
// Synthetic notebooks, no physical iPad.
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),{chromium,webkit}=require('playwright');
const root=path.resolve(process.env.BILGE_TEST_ROOT||path.join(__dirname,'bilge-defter-invited-v61'));
const out=path.resolve(process.env.BILGE_TEST_OUTPUT||path.join(__dirname,'../outputs/v61-save'));
const origin='http://127.0.0.1:49364';fs.mkdirSync(out,{recursive:true});
const results=[],numbers=[];const pass=s=>{results.push(s);console.log('PASS '+s)};
async function context(browser){
 const c=await browser.newContext({viewport:{width:1180,height:820},serviceWorkers:'block'}),errors=[];
 c.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
 await c.addInitScript(origin=>{if(location.origin===origin)localStorage.setItem('bilge_defter_onboarding_v1','true')},origin);
 await c.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!==origin)return r.abort();const f=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));return f.startsWith(root+path.sep)&&fs.existsSync(f)?r.fulfill({path:f}):r.fulfill({status:404,body:'{}'})});
 return {c,errors};
}
async function open(c){const p=await c.newPage();await p.goto(origin);await p.waitForFunction(()=>typeof ready!=='undefined'&&ready);return p}
function stored(p){return p.evaluate(()=>new Promise((ok,no)=>{const r=indexedDB.open(DB,1);r.onerror=()=>no(r.error);r.onsuccess=()=>{const q=r.result.transaction(STORE).objectStore(STORE).get('app');q.onsuccess=()=>{r.result.close();ok(q.result===undefined?null:JSON.stringify(q.result))};q.onerror=()=>no(q.error)}}))}
const truth=p=>p.evaluate(()=>JSON.stringify({...state,active:activeId}));
const settle=p=>p.waitForFunction(()=>!savePromise&&!isDirty());
async function same(p,label){await settle(p);assert.equal(await stored(p),await truth(p),label)}
// Real PNG so the PDF background passes the application's own validation.
const pdfPage=`(id,noise)=>{const c=document.createElement('canvas');c.width=1000;c.height=1400;const g=c.getContext('2d'),img=g.createImageData(1000,noise);for(let i=0;i<img.data.length;i++)img.data[i]=(i%4===3)?255:Math.random()*255;g.putImageData(img,0,0);return {id,title:'PDF '+id,strokes:[],updated:new Date().toISOString(),pdf:{image:c.toDataURL('image/png'),width:1000,height:1400,name:'kaynak.pdf',number:1,total:3}}}`;
async function equivalence(p,name){
 await p.evaluate(pdfPage=>{
  const makePdf=eval(pdfPage),stroke=n=>({tool:'pen',color:'#1d1d1f',width:2,points:Array.from({length:n},(_,i)=>({x:50+i,y:60+i%7,p:.5}))});
  const pages=Array.from({length:6},(_,i)=>({id:'v61-'+i,title:'Sayfa '+(i+1),strokes:Array.from({length:20},()=>stroke(30)),updated:new Date().toISOString()}));
  pages.push(makePdf('v61-pdf',200));
  state.version=Math.max(state.version,2);state.pages=pages;activeId=pages[0].id;state.active=activeId;
  state.trash=[{page:{id:'v61-trash',title:'Silinen',strokes:[stroke(12)],updated:new Date().toISOString()},notebookTitle:'Genel',deletedAt:new Date().toISOString(),position:0}];
  scheduleSave();
 },pdfPage);
 await same(p,'seed');
 const steps=[
  ['pen stroke on the active page',async()=>{await p.locator('#canvas').evaluate(c=>{const r=c.getBoundingClientRect();for(const [type,dx] of [['pointerdown',0],['pointermove',30],['pointermove',60],['pointerup',90]])c.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:61,pointerType:'pen',clientX:r.x+120+dx,clientY:r.y+160,buttons:type==='pointerup'?0:1,pressure:.5}))});await p.evaluate(()=>flushSave())}],
  ['rename a page that is not active',()=>p.evaluate(()=>{state.pages[2].title='Yeniden adlandırıldı';scheduleSave()})],
  ['paper colour on another page',()=>p.evaluate(()=>{state.pages[3].paperColor='#fdf6e3';scheduleSave()})],
  ['PDF background replaced',()=>p.evaluate(()=>{const q=state.pages.find(x=>x.pdf);q.pdf={...q.pdf,number:2};scheduleSave()})],
  ['stroke removed from another page',()=>p.evaluate(()=>{state.pages[5].strokes.pop();scheduleSave()})],
  ['pages reordered',()=>p.evaluate(()=>{const [a]=state.pages.splice(1,1);state.pages.splice(4,0,a);scheduleSave()})],
  ['trashed page renamed',()=>p.evaluate(()=>{state.trash[0].page.title='Silinen 2';scheduleSave()})],
  ['another page becomes active and gets ink',()=>p.evaluate(()=>{activeId=state.pages[1].id;state.active=activeId;page().strokes.push({tool:'marker',color:'#ffd400',width:8,points:[{x:10,y:10,p:.5},{x:90,y:40,p:.5}]});scheduleSave()})]
 ];
 for(const [label,step] of steps){await step();await same(p,label)}
 assert.equal(await p.evaluate(()=>{const snap=notebookSnapshot();return serializeNotebook(snap)===JSON.stringify(snap)}),true);
 assert.equal(await p.evaluate(()=>pageCacheMisses),0);
 pass(`${name}: after ${steps.length} kinds of edits every stored record equals JSON.stringify of the notebook, sync text included`);
 // A change no signature sees: stroke colour on another page, edited in place.
 const miss=()=>p.evaluate(()=>{lastPageVerify=performance.now();const q=state.pages.find(x=>x.id!==activeId&&x.strokes.length);q.strokes[0].color=q.strokes[0].color==='#aa0000'?'#00aa00':'#aa0000';scheduleSave()});
 await miss();await settle(p);assert.notEqual(await stored(p),await truth(p));
 await p.evaluate(()=>window.dispatchEvent(new Event('pagehide')));await same(p,'leave repair');
 pass(`${name}: a change the cache misses is written in full when the page is left`);
 await miss();await settle(p);assert.notEqual(await stored(p),await truth(p));
 await p.evaluate(()=>{lastPageVerify=-Infinity;verifyPageCache()});await same(p,'idle repair');
 assert.ok(await p.evaluate(()=>pageCacheMisses)>=2);
 pass(`${name}: the idle comparison finds and writes a missed change`);
}
async function blocking(browser,kind){
 const {c,errors}=await context(browser),p=await open(c);
 const r=await p.evaluate(async([kind,pdfPage])=>{
  const makePdf=eval(pdfPage),list=[];
  if(kind==='ink'){for(let pi=0;pi<30;pi++){const s=[];for(let k=0;k<300;k++){const pts=[];for(let i=0;i<60;i++)pts.push({x:100+Math.random()*600,y:100+Math.random()*800,p:Math.random()});s.push({tool:'pen',color:'#1d1d1f',width:2,points:pts})}list.push({id:'syn-'+pi,title:'S'+pi,strokes:s,updated:new Date().toISOString()})}}
  else{state.version=Math.max(state.version,2);for(let pi=0;pi<20;pi++)list.push(makePdf('pdf-'+pi,400));list.unshift({id:'ink',title:'Not',strokes:[],updated:new Date().toISOString()})}
  state.pages=list;activeId=list[0].id;state.active=activeId;markChanged(false);await flushSave();
  const measure=async full=>{const runs=[];for(let n=0;n<3;n++){
    page().strokes.push({tool:'pen',color:'#1d1d1f',width:2,points:Array.from({length:40},(_,i)=>({x:200+i,y:300+n,p:.5}))});markChanged(false);saveFullNext=full;
    let maxGap=0,last=performance.now(),on=true;const tick=()=>{const now=performance.now();maxGap=Math.max(maxGap,now-last);last=now;if(on)setTimeout(tick,0)};setTimeout(tick,0);
    await new Promise(r=>setTimeout(r,30));last=performance.now();maxGap=0;
    const ok=await flushSave();on=false;runs.push({ok,maxGap})}
   runs.sort((a,b)=>a.maxGap-b.maxGap);return {ok:runs.every(x=>x.ok),maxGap:Math.round(runs[1].maxGap)}};
  const full=await measure(true),cached=await measure(false);
  return {mb:+(JSON.stringify(state).length/1048576).toFixed(1),full,cached,match:JSON.stringify({...state,active:activeId})};
 },[kind,pdfPage]);
 await settle(p);assert.equal(await stored(p),r.match);assert.deepEqual(errors,[]);await c.close();
 return {mb:r.mb,fullMaxGapMs:r.full.maxGap,cachedMaxGapMs:r.cached.maxGap,ok:r.full.ok&&r.cached.ok};
}
(async()=>{
 for(const [engine,name] of [[chromium,'chromium'],[webkit,'webkit']]){
  const browser=await engine.launch({headless:true});
  try{
   {const {c,errors}=await context(browser),p=await open(c);await equivalence(p,name);assert.deepEqual(errors,[]);await c.close()}
   for(const kind of ['ink','pdf']){
    const r=await blocking(browser,kind);numbers.push({engine:name,notebook:kind,...r});console.log(JSON.stringify(numbers.at(-1)));
    assert(r.ok&&r.cachedMaxGapMs<=r.fullMaxGapMs*(kind==='ink'?0.5:0.75),`${name} ${kind}: cached ${r.cachedMaxGapMs}ms vs full ${r.fullMaxGapMs}ms`);
    pass(`${name}: ${r.mb} MB ${kind} notebook, a page edit blocks ${r.cachedMaxGapMs} ms instead of ${r.fullMaxGapMs} ms; disk equals the notebook`);
   }
  }finally{await browser.close()}
 }
 fs.writeFileSync(path.join(out,'save-tests.json'),JSON.stringify({passed:results.length,results,numbers,synthetic:true,realDevice:false},null,2));
 console.log(JSON.stringify({passed:results.length,failed:0}));
})().catch(e=>{console.error(e);process.exit(1)});
