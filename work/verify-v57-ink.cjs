'use strict';
// Synthetic regression/performance evidence, NOT physical iPad acceptance.
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),{chromium,webkit}=require('playwright');
const root=path.resolve(process.env.BILGE_TEST_ROOT||path.join(__dirname,'bilge-defter-invited-v57'));
const out=path.resolve(process.env.BILGE_TEST_OUTPUT||path.join(__dirname,'../outputs/v57-ink'));
const origin='http://127.0.0.1:49857';fs.mkdirSync(out,{recursive:true});
(async()=>{const results=[];for(const [engine,name] of [[chromium,'chromium'],[webkit,'webkit']]){
 const browser=await engine.launch({headless:true});try{
 const c=await browser.newContext({viewport:{width:1180,height:820},hasTouch:true,serviceWorkers:'block'}),p=await c.newPage(),errors=[];
 p.on('pageerror',e=>errors.push(e.message));await c.addInitScript(()=>localStorage.setItem('bilge_defter_onboarding_v1','true'));
 await c.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!==origin)return r.abort();const f=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':u.pathname));if(!f.startsWith(root+path.sep)||!fs.existsSync(f))return r.fulfill({status:404,body:'{}'});return r.fulfill({path:f});});
 await p.goto(origin);await p.waitForFunction(()=>typeof ready!=='undefined'&&ready&&window.__v2UI);await p.evaluate(()=>flushSave());
 const checks=await p.evaluate(async()=>{
  const checks=[];function check(ok,label){if(!ok)throw Error(label);checks.push(label)}
  function fire(type,id,kind='pen',x=120,y=160,target=canvas,pressure=.5){const r=canvas.getBoundingClientRect();target.dispatchEvent(new PointerEvent(type,{pointerId:id,pointerType:kind,clientX:r.left+x,clientY:r.top+y,pressure,button:0,buttons:type==='pointerup'?0:1,bubbles:true,cancelable:true}));}
  function stroke(id){fire('pointerdown',id);fire('pointermove',id,'pen',160,180);fire('pointerup',id,'pen',200,200);}
  stroke(1);check(page().strokes.length===1,'normal pen');
  fire('pointerdown',11,'touch');fire('pointerdown',12,'touch');fire('pointerup',11,'touch');stroke(2);
  check(page().strokes.length===2&&!drawing&&!pan&&!suppressTouch,'pen while one palm remains');
  fire('pointerup',12,'touch');fire('pointerdown',13,'touch');fire('pointerdown',14,'touch');stroke(3);
  check(page().strokes.length===3&&!pan,'pen interrupts two-touch pan');
  fire('pointerdown',20);fire('pointerdown',15,'touch');fire('pointerdown',16,'touch');fire('pointermove',15,'touch',400,450);
  check(activePointer===20&&drawing&&!pan,'palm cannot interrupt pen');fire('pointerup',20);fire('pointerup',15,'touch');fire('pointerup',16,'touch');
  fire('pointerdown',21);window.dispatchEvent(new Event('blur'));stroke(22);
  check(!drawing&&activePointer===null,'blur recovers missing end');
  fire('pointerdown',23);stroke(24);check(!drawing&&activePointer===null,'fresh pen recovers missing up without blur');
  fire('pointerdown',25);fire('pointerup',25,'pen',210,220,document.body);check(!drawing,'pointerup outside canvas without capture');
  fire('pointerdown',26);fire('pointercancel',26,'pen',210,220,document.body);check(!drawing,'cancel outside canvas');
  fire('pointerdown',27);fire('lostpointercapture',27);check(!drawing,'capture loss finishes stroke');
  fire('pointerdown',30,'touch',120,400);fire('pointerdown',31,'touch',160,400);fire('pointermove',30,'touch',120,300);fire('pointermove',31,'touch',160,300);
  check(viewY()>0,'two-finger scroll still works');fire('pointerup',30,'touch');fire('pointerup',31,'touch');check(!pan&&!suppressTouch,'scroll ends cleanly');
  page().viewY=0;page().strokes=[];drawAll();
  fire('pointerdown',41,'pen',120,160,canvas,1);fire('pointermove',41,'pen',160,180,canvas,.15);fire('pointerup',41,'pen',210,240,canvas,.5);
  const last=page().strokes[0].points.at(-1);check(Math.abs(last.x-210)<1&&Math.abs(last.y-240)<1,'last pointerup sample is drawn and stored');
  const before=ctx.getImageData(0,0,canvas.width,canvas.height).data;drawAll();const after=ctx.getImageData(0,0,canvas.width,canvas.height).data;
  check(before.every((v,i)=>v===after[i]),'incremental pen pixels match full redraw');
  let redraws=0,original=drawAll;drawAll=()=>{redraws++;return original()};resize();drawAll=original;check(redraws===0,'same-size resize does not redraw');
  selectTool('marker');stroke(42);selectTool('eraser');stroke(43);selectTool('pen');check(page().strokes.at(-1).tool==='eraser','marker and eraser still finish');
  await flushSave();check(!saveFailed&&!saveConflict,'persistence and CAS remain healthy');
  return checks;
 });
 if(name==='chromium'){const session=await c.newCDPSession(p);await session.send('Emulation.setCPUThrottlingRate',{rate:4});}
 const perf=[];for(const count of [750,2000])perf.push(await p.evaluate(async count=>{
  await flushSave();page().strokes=Array.from({length:count},(_,j)=>({tool:'pen',color:'#173b36',width:2,points:Array.from({length:100},(_,i)=>({x:40+i*2,y:30+(j%30)*10+Math.sin(i/8)*5,p:.5}))}));drawAll();
  const r=canvas.getBoundingClientRect(),fire=(type,x)=>canvas.dispatchEvent(new PointerEvent(type,{pointerId:99,pointerType:'pen',clientX:r.left+x,clientY:r.top+160,pressure:.5,buttons:type==='pointerup'?0:1,bubbles:true,cancelable:true}));
  let calls=0;const original=drawStroke;drawStroke=(...args)=>{calls++;return original(...args)};fire('pointerdown',120);fire('pointermove',130);const t=performance.now();fire('pointerup',140);const penLiftMs=performance.now()-t;drawStroke=original;
  if(calls!==0||page().strokes.length!==count+1)throw Error('Full redraw or missing stroke');await flushSave();if(saveConflict||saveFailed)throw Error('Save failure');
  return{count,pointsPerStroke:100,penLiftMs,penLiftDraws:calls};
 },count));
 assert.deepEqual(errors,[]);await p.screenshot({path:path.join(out,name+'.png')});results.push({engine:name,checks,perf,errors,physicalIPad:false,cpuThrottle:name==='chromium'?4:1});await c.close();
 }finally{await browser.close();}}
 fs.writeFileSync(path.join(out,'proof.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
