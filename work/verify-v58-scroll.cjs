'use strict';
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),{chromium,webkit}=require('playwright');
const root=path.resolve(process.env.BILGE_TEST_ROOT||path.join(__dirname,'bilge-defter-invited-v58'));
const origin='http://127.0.0.1:49858';
(async()=>{for(const [name,type] of Object.entries({chromium,webkit})){
 const browser=await type.launch({headless:true});try{
  const context=await browser.newContext({viewport:{width:1180,height:820},hasTouch:true,serviceWorkers:'block'}),p=await context.newPage(),errors=[];
  p.on('pageerror',e=>errors.push(e.message));await context.addInitScript(()=>localStorage.setItem('bilge_defter_onboarding_v1','true'));
  await context.route('**/*',r=>{const u=new URL(r.request().url()),file=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':u.pathname));if(u.origin!==origin||!file.startsWith(root+path.sep)||!fs.existsSync(file))return r.abort();return r.fulfill({path:file});});
  await p.goto(origin);await p.waitForFunction(()=>typeof ready!=='undefined'&&ready&&window.__v2UI);
  const proof=await p.evaluate(async()=>{
   await flushSave();document.querySelector('#penOnly').checked=true;const checks=[];function check(ok,label){if(!ok)throw Error(label);checks.push(label)}
   const fire=(type,id,y,kind='touch')=>{const r=canvas.getBoundingClientRect();canvas.dispatchEvent(new PointerEvent(type,{pointerId:id,pointerType:kind,clientX:r.left+120+id,clientY:r.top+y,buttons:type==='pointerup'?0:1,pressure:.5,bubbles:true,cancelable:true}));};
   page().viewY=100;drawAll();const start=viewY(),scale=paperScale();let paints=0,chrome=0,prunes=0;
   const original=drawAll,oldChrome=refreshChrome,oldPrune=pruneMediaImages;
   drawAll=(...args)=>{paints++;return original(...args)};refreshChrome=(...args)=>{chrome++;return oldChrome(...args)};pruneMediaImages=(...args)=>{prunes++;return oldPrune(...args)};
   fire('pointerdown',1,450);fire('pointerdown',2,450);
   paints=0;chrome=0;prunes=0; // Exclude tentative first-finger stroke cancellation.
   for(let i=1;i<=40;i++){fire('pointermove',1,450-i);fire('pointermove',2,450-i);}
   check(paints===0,'80 pointer moves defer raster work to the display frame');
   check(Math.abs(viewY()-(start+40/scale))<.001,'two-finger centroid keeps exact scroll distance');
   await new Promise(requestAnimationFrame);check(paints===1,'one raster pass per animation frame');
   check(chrome<=1&&prunes===0,`at most one dirty-status refresh and no image scan (chrome=${chrome}, images=${prunes})`);
   fire('pointermove',1,390);fire('pointermove',2,390);
   fire('pointerdown',9,200,'pen');const y=page().strokes.at(-1).points[0].y;
   check(Math.abs(y-(viewY()+200/scale))<.001,'fresh pen uses final viewport coordinates');
   fire('pointerup',9,210,'pen');check(!pan&&!drawing,'pen interrupts pending scroll safely');
   const pending=paints;await new Promise(requestAnimationFrame);check(paints===pending,'no stale scroll redraw after pen');
   fire('pointerup',1,390);fire('pointerup',2,390);
   fire('pointerdown',3,420);fire('pointerdown',4,420);fire('pointermove',3,400);fire('pointermove',4,400);fire('pointerup',3,400);fire('pointerup',4,400);
   await flushSave();check(!isDirty()&&!saveConflict&&!saveFailed,'scroll end persists final view with CAS');
   check(Math.abs((await dbGet()).pages.find(x=>x.id===activeId).viewY-viewY())<.001,'persisted offset matches visible page');
   drawAll=original;refreshChrome=oldChrome;pruneMediaImages=oldPrune;
   return {checks,physicalIPad:false};
  });assert.deepEqual(errors,[]);console.log(name,JSON.stringify(proof));await context.close();
 }finally{await browser.close()}
}})().catch(e=>{console.error(e);process.exitCode=1});
