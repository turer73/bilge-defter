'use strict';
// v61 plain-page zoom: the footer − / %100 / + buttons work on plain pages, ink and paper
// lines follow the zoom, and the saved page never carries pdfZoom/viewX, which v60's
// validPdfView rejects on plain pages (zoom is session only). PDF zoom is still saved.
// Synthetic notebooks, no physical iPad.
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),{chromium,webkit}=require('playwright');
const root=path.resolve(process.env.BILGE_TEST_ROOT||path.join(__dirname,'bilge-defter-invited-v61'));
const out=path.resolve(process.env.BILGE_TEST_OUTPUT||path.join(__dirname,'../outputs/v61-zoom'));
const origin='http://127.0.0.1:49365';fs.mkdirSync(out,{recursive:true});
const results=[];const pass=s=>{results.push(s);console.log('PASS '+s)};
async function context(browser){
 const c=await browser.newContext({viewport:{width:1180,height:820},serviceWorkers:'block'}),errors=[];
 c.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
 await c.addInitScript(origin=>{if(location.origin===origin)localStorage.setItem('bilge_defter_onboarding_v1','true')},origin);
 await c.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!==origin)return r.abort();const f=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));return f.startsWith(root+path.sep)&&fs.existsSync(f)?r.fulfill({path:f}):r.fulfill({status:404,body:''})});
 return {c,errors};
}
async function open(c){const p=await c.newPage();await p.goto(origin);await p.waitForFunction(()=>typeof ready!=='undefined'&&ready&&window.__v2Bridge);return p}
const settle=p=>p.waitForFunction(()=>!savePromise&&!isDirty());
function stored(p){return p.evaluate(()=>new Promise((ok,no)=>{const r=indexedDB.open(DB,1);r.onerror=()=>no(r.error);r.onsuccess=()=>{const q=r.result.transaction(STORE).objectStore(STORE).get('app');q.onsuccess=()=>{r.result.close();ok(q.result===undefined?null:JSON.stringify(q.result))};q.onerror=()=>no(q.error)}}))}
const view=p=>p.evaluate(()=>({zoom:viewZoom(),scale:paperScale(),x:viewX(),max:maxViewX(),y:viewY(),ui:window.__v2Bridge.host.getState().zoom,label:window.__v2UI.ui.shadowRoot.querySelector('.zoom-value').textContent,
 out:window.__v2UI.ui.shadowRoot.querySelector('[data-zoom="out"]').disabled,in:window.__v2UI.ui.shadowRoot.querySelector('[data-zoom="in"]').disabled,size:document.querySelector('.paper').style.backgroundSize,width:canvas.getBoundingClientRect().width}));
async function seed(p){
 await p.evaluate(()=>{
  const c=document.createElement('canvas');c.width=1000;c.height=1400;c.getContext('2d').fillRect(0,0,10,10);
  const stroke={tool:'pen',color:'#1d1d1f',width:2,points:[{x:40,y:40,p:.5},{x:90,y:60,p:.5}]},now=new Date().toISOString();
  state.version=Math.max(state.version,2);
  state.pages=[{id:'zoom-a',title:'Düz A',strokes:[stroke],updated:now},{id:'zoom-b',title:'Düz B',strokes:[],updated:now},
   {id:'zoom-pdf',title:'PDF',strokes:[],updated:now,pdf:{width:1000,height:1400,name:'z.pdf',number:1,total:1,image:c.toDataURL()}}];
  activeId='zoom-a';state.active=activeId;renderPages();drawAll();scheduleSave();window.__v2Bridge.publish();
 });
 await p.evaluate(()=>flushSave());await settle(p);
}
const click=async(p,mode)=>{await p.locator(`[data-zoom="${mode}"]`).click();await settle(p)};
async function run(p,name){
 await seed(p);const before=await stored(p);
 let v=await view(p);
 assert.deepEqual([v.zoom,v.scale,v.ui,v.label,v.out,v.in,v.size],[1,1,1,'%100',true,false,'100% 32px']);
 pass(`${name}: plain page starts at %100 with + enabled and − disabled`);

 await click(p,'in');await click(p,'in');await click(p,'in');await click(p,'in');
 v=await view(p);
 assert.deepEqual([v.zoom,v.scale,v.ui,v.label,v.out,v.in,v.size],[2,2,2,'%200',false,false,'100% 64px']);
 assert(Math.abs(v.max-v.width/2)<1e-6,`max ${v.max} width ${v.width}`);
 pass(`${name}: four + taps reach %200; ink scale and paper lines double, sideways range is half the page`);

 const ink=await p.locator('#canvas').evaluate(c=>{const r=c.getBoundingClientRect(),before=page().strokes.length;for(const [type,dx] of [['pointerdown',0],['pointermove',40],['pointerup',80]])c.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:62,pointerType:'pen',clientX:r.x+100+dx,clientY:r.y+100,buttons:type==='pointerup'?0:1,pressure:.5}));const s=page().strokes[before];return {count:page().strokes.length-before,first:s.points[0],width:s.width,expectedX:viewX()+50,expectedY:viewY()+50,selected:selectedWidth()}});
 assert.equal(ink.count,1);assert(Math.abs(ink.first.x-ink.expectedX)<1e-6&&Math.abs(ink.first.y-ink.expectedY)<1e-6,JSON.stringify(ink));assert.equal(ink.width,ink.selected/2);
 pass(`${name}: a pen stroke at %200 lands under the pen in page units with half the logical width`);

 await p.evaluate(()=>{scrollPaper(viewY(),100000);return flushSave()});await settle(p);
 v=await view(p);assert(Math.abs(v.x-v.max)<1e-6&&v.x>0,JSON.stringify(v));
 const rec=JSON.parse(await stored(p)),a=rec.pages.find(x=>x.id==='zoom-a');
 assert.equal(await stored(p),await p.evaluate(()=>JSON.stringify({...state,active:activeId})));
 assert.deepEqual(Object.keys(a).filter(k=>!['id','title','strokes','updated','viewY'].includes(k)),[]);
 assert.equal(await p.evaluate(()=>validState(JSON.parse(JSON.stringify({...state,active:activeId})))&&state.pages.every(validPdfView)),true);
 assert.notEqual(await stored(p),before);
 pass(`${name}: sideways pan reaches the right edge; the saved page has no zoom or sideways field, so v60 still reads it`);

 await p.evaluate(()=>window.__v2Bridge.host.commands['library.selectPage']({id:'zoom-b'}));
 v=await view(p);assert.deepEqual([v.zoom,v.x,v.label,v.size],[1,0,'%100','100% 32px']);
 await p.evaluate(()=>window.__v2Bridge.host.commands['library.selectPage']({id:'zoom-a'}));
 v=await view(p);assert.equal(v.zoom,2);assert(v.x>0);
 pass(`${name}: zoom belongs to the page; another page opens at %100 and the first keeps %200 in this session`);

 await click(p,'fit');v=await view(p);assert.deepEqual([v.zoom,v.x,v.label,v.out,v.size],[1,0,'%100',true,'100% 32px']);
 await click(p,'in');
 await p.reload();await p.waitForFunction(()=>typeof ready!=='undefined'&&ready&&window.__v2Bridge);
 v=await view(p);assert.deepEqual([v.zoom,v.scale,v.x,v.label],[1,1,0,'%100']);
 assert.equal(await p.evaluate(()=>page().strokes.length),2);
 pass(`${name}: %100 returns to the page width; after reload the plain page opens at %100 with its ink`);

 await p.evaluate(()=>window.__v2Bridge.host.commands['library.selectPage']({id:'zoom-pdf'}));await settle(p);
 await click(p,'in');
 const pdf=JSON.parse(await stored(p)).pages.find(x=>x.id==='zoom-pdf');assert.equal(pdf.pdfZoom,1.25);
 assert.equal(await p.evaluate(()=>{setPdfZoom(2);const z=pdfZoom();window.__v2Bridge.host.commands['library.selectPage']({id:'zoom-a'});setPdfZoom(3);return [z,viewZoom()]}).then(JSON.stringify),'[2,1]');
 pass(`${name}: PDF zoom is still saved; setPdfZoom still leaves plain pages alone`);
}
(async()=>{
 for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await engine.launch({headless:true});
  try{const {c,errors}=await context(browser),p=await open(c);await run(p,name);assert.deepEqual(errors,[]);await c.close()}
  finally{await browser.close()}
 }
 fs.writeFileSync(path.join(out,'zoom-tests.json'),JSON.stringify({passed:results.length,results,synthetic:true,realDevice:false},null,2));
 console.log(JSON.stringify({passed:results.length,failed:0}));
})().catch(e=>{console.error(e);process.exit(1)});
