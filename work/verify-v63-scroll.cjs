'use strict';
// v63 two-finger scroll: swiping is a view change, not an edit. No save runs while the user keeps
// swiping (each save rebuilt the notebook text on the main thread and was the stutter between
// swipes); the final view is saved once it settles; ink written before a scroll is still saved
// while scrolling continues. Large synthetic notebook, no iPad.
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),{chromium,webkit}=require('playwright');
const root=path.resolve(process.env.BILGE_TEST_ROOT||path.join(__dirname,'bilge-defter-invited-v63'));
const out=path.resolve(process.env.BILGE_TEST_OUTPUT||path.join(__dirname,'../outputs/v63-scroll'));
const origin='http://127.0.0.1:49375';fs.mkdirSync(out,{recursive:true});
const results=[],numbers=[];const pass=s=>{results.push(s);console.log('PASS '+s)};
async function run(browser,name){
 const context=await browser.newContext({viewport:{width:1180,height:820},serviceWorkers:'block',hasTouch:true}),errors=[];
 context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
 await context.addInitScript(o=>{if(location.origin===o){window.__accountRequired=false;localStorage.setItem('bilge_defter_onboarding_v1','true')}},origin);
 await context.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!==origin)return r.abort();const f=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));return f.startsWith(root+path.sep)&&fs.existsSync(f)?r.fulfill({path:f}):r.fulfill({status:404,body:''})});
 const p=await context.newPage();await p.goto(origin);await p.waitForFunction(()=>typeof ready!=='undefined'&&ready);
 await p.evaluate(async()=>{
  const stroke=(y0,n)=>({tool:'pen',color:'#1d1d1f',width:2,points:Array.from({length:n},(_,i)=>({x:40+i*9,y:y0+Math.sin(i/3)*8,p:.5}))});
  const pages=[{id:'scroll-0',title:'Kaydırma',strokes:Array.from({length:1200},(_,i)=>stroke(30+i*22,60)),updated:'2026-09-01T00:00:00.000Z'}];
  for(let k=1;k<30;k++)pages.push({id:'scroll-'+k,title:'S'+k,strokes:Array.from({length:300},(_,i)=>stroke(30+i*22,60)),updated:new Date().toISOString()});
  state.pages=pages;activeId='scroll-0';state.active=activeId;renderPages();drawAll();scheduleSave();await flushSave();
  page().updated='2026-09-01T00:00:00.000Z';document.querySelector('#penOnly').checked=true;
  // Instrument: every save builds the notebook text first.
  window.__saves=[];const ser=serializeNotebook;window.serializeNotebook=(...a)=>{window.__saves.push(performance.now());return ser(...a)};
 });
 // Repeated two-finger swipes (1.5 s each) for 6 s, driven inside the page at ~60 Hz.
 const swipes=duration=>p.evaluate(ms=>new Promise(done=>{
  const rect=canvas.getBoundingClientRect(),fire=(type,id,x,y)=>canvas.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:id,pointerType:'touch',isPrimary:id===1,clientX:x,clientY:y,buttons:type==='pointerup'?0:1,pressure:.5}));
  const x1=rect.left+300,x2=rect.left+500;let y,step=0,down=false;const start=performance.now(),frames=[];let last=start;
  const frame=t=>{frames.push(t-last);last=t;if(t-start<ms)requestAnimationFrame(frame)};requestAnimationFrame(frame);
  const move=setInterval(()=>{
   if(!down){y=rect.top+700;fire('pointerdown',11,x1,y);fire('pointerdown',12,x2,y);down=true;step=0;return}
   y-=6;step++;fire('pointermove',11,x1,y);fire('pointermove',12,x2,y);
   if(step>=90){fire('pointerup',11,x1,y);fire('pointerup',12,x2,y);down=false}
  },16);
  setTimeout(()=>{clearInterval(move);if(down){fire('pointerup',11,x1,y);fire('pointerup',12,x2,y)}const g=[...frames].sort((a,b)=>a-b);done({start,end:performance.now(),p95:+g[Math.floor(.95*(g.length-1))].toFixed(1),max:+g.at(-1).toFixed(1)})},ms);
 }),duration);
 const before=await p.evaluate(()=>viewY());
 const r=await swipes(6000);
 const during=await p.evaluate(r=>window.__saves.filter(t=>t>=r.start&&t<=r.end).length,r);
 const after=await p.evaluate(()=>viewY());assert.ok(after>before+500,`scrolled ${before} -> ${after}`);
 assert.equal(during,0,'saves while swiping');numbers.push({engine:name,frameP95:r.p95,frameMax:r.max});
 pass(`${name}: 6 s of two-finger swipes on a 36 MB notebook run no save (frame p95 ${r.p95} ms, max ${r.max} ms)`);
 await p.waitForFunction(()=>!isDirty()&&!savePromise,null,{timeout:6000});
 const stored=await p.evaluate(async()=>{const d=await dbGet();const s=d.pages.find(x=>x.id===activeId);return {viewY:s.viewY,visible:viewY(),updated:s.updated,memoryUpdated:page().updated,saves:window.__saves.length}});
 assert.ok(Math.abs(stored.viewY-stored.visible)<1e-6,JSON.stringify(stored));assert.equal(stored.updated,'2026-09-01T00:00:00.000Z');assert.equal(stored.memoryUpdated,'2026-09-01T00:00:00.000Z');assert.equal(stored.saves,1);
 pass(`${name}: once the view settles it is saved exactly once; scrolling does not stamp the page as edited`);
 // Ink written right before scrolling is still saved while the swipes continue.
 await p.locator('#canvas').evaluate(c=>{const r=c.getBoundingClientRect();for(const [type,dx] of [['pointerdown',0],['pointermove',40],['pointerup',80]])c.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:21,pointerType:'pen',clientX:r.x+200+dx,clientY:r.y+200,buttons:type==='pointerup'?0:1,pressure:.5}))});
 const inkCount=await p.evaluate(()=>page().strokes.length);
 const r2=await swipes(6000);
 const inkSaved=await p.evaluate(async n=>(await dbGet()).pages.find(x=>x.id===activeId).strokes.length===n,inkCount);
 assert.equal(inkSaved,true,'ink saved during continued scrolling');
 pass(`${name}: a pen stroke made just before scrolling is saved while swiping continues`);
 await p.waitForFunction(()=>!isDirty()&&!savePromise,null,{timeout:6000});
 assert.equal(await p.evaluate(async()=>Math.abs((await dbGet()).pages.find(x=>x.id===activeId).viewY-viewY())<1e-6),true);
 assert.deepEqual(errors,[]);await context.close();
}
(async()=>{
 for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){const browser=await engine.launch({headless:true});try{await run(browser,name)}finally{await browser.close()}}
 fs.writeFileSync(path.join(out,'scroll-tests.json'),JSON.stringify({passed:results.length,results,numbers,synthetic:true,realDevice:false},null,2));
 console.log(JSON.stringify({passed:results.length,failed:0,numbers}));
})().catch(e=>{console.error(e);process.exit(1)});
