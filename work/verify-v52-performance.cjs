// Isolated synthetic notebooks only. Desktop timings are not an iPad benchmark.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const out=path.resolve(__dirname,'../outputs/v52');fs.mkdirSync(out,{recursive:true});
const results=[],measurements=[],origin='http://127.0.0.1:49232';let browser;
function pass(name){results.push(name);console.log('PASS '+name)}
async function fixture(version='v52'){
 const root=path.resolve(__dirname,'bilge-defter-invited-'+version),errors=[];
 const c=await browser.newContext({viewport:{width:1180,height:820},hasTouch:true,serviceWorkers:'block'});
 await c.addInitScript(()=>localStorage.setItem('bilge_defter_onboarding_v1','true'));
 await c.route('**/*',async r=>{const u=new URL(r.request().url());if(u.origin!==origin)return r.abort();if(u.pathname.includes('/api/'))return r.fulfill({status:404,body:'{}'});const file=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return r.fulfill({status:404,body:''});return r.fulfill({contentType:({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)})});
 const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(origin);await p.waitForFunction(()=>typeof ready!=='undefined'&&ready&&window.__v2UI);await p.evaluate(()=>flushSave());
 await p.evaluate(()=>{
  window.inkStats={refresh:0,refreshMs:0,writes:0,status:0,segments:0};
  const ui=document.querySelector('bilge-defter-ui'),refresh=ui.refresh;
  ui.refresh=function(...args){inkStats.refresh++;const t=performance.now();try{return refresh.apply(this,args)}finally{inkStats.refreshMs+=performance.now()-t}};
  window.originalDbPut=dbPut;window.dbPut=function(...args){inkStats.writes++;return originalDbPut.apply(this,args)};
  const status=renderSaveStatus;window.renderSaveStatus=function(...args){inkStats.status++;return status.apply(this,args)};
  const segment=drawStrokeSegment;window.drawStrokeSegment=function(...args){inkStats.segments++;return segment.apply(this,args)};
  window.sendInk=(type,i=0,pressure=.5)=>{const r=canvas.getBoundingClientRect();canvas.dispatchEvent(new PointerEvent(type,{pointerId:7,pointerType:'pen',clientX:r.x+70+i*2,clientY:r.y+80+Math.sin(i/8)*20,pressure,buttons:type==='pointerup'?0:1,bubbles:true,cancelable:true}))};
 });
 return {c,p,errors};
}
async function clean(p){await p.waitForFunction(()=>!isDirty()&&!savePromise&&!drawing);assert.equal(await p.evaluate(()=>saveFailed),false)}
(async()=>{try{
 browser=await chromium.launch({headless:true});
 for(const version of ['v51','v52']){
  const {c,p,errors}=await fixture(version),cdp=await c.newCDPSession(p);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  const m=await p.evaluate(async()=>{const before=editRevision;sendInk('pointerdown');for(let i=1;i<=120;i++){sendInk('pointermove',i);await new Promise(r=>setTimeout(r,8))}const during={...inkStats,points:current.points.length,revisions:editRevision-before};sendInk('pointerup',121,.7);return during});
  await clean(p);assert.equal(m.points,121);assert.equal(m.revisions,121);assert.equal(m.segments,121);assert.equal(errors.length,0);measurements.push({version,cpuThrottle:4,...m});await c.close();
 }
 assert.ok(measurements[0].refresh>=100);assert.ok(measurements[1].refresh<=3);assert.ok(measurements[1].status<=2);pass('120 pen moves preserve all samples/revisions and reduce toolbar refresh to at most 3');
 {
  const {c,p}=await fixture();const m=await p.evaluate(async()=>{for(let j=0;j<8;j++){sendInk('pointerdown');sendInk('pointermove',j+5);sendInk('pointerup',j+7);await new Promise(r=>setTimeout(r,35))}return {writes:inkStats.writes,dirty:isDirty(),message:saveEl.textContent}});
  assert.equal(m.writes,0);assert.equal(m.dirty,true);assert.match(m.message,/Kaydediliyor/);await clean(p);assert.equal(await p.evaluate(()=>inkStats.writes),1);await p.reload();await p.waitForFunction(()=>ready);assert.equal(await p.evaluate(()=>page().strokes.length),8);pass('8 rapid strokes use one durable write; pending is honest and all 8 reopen');await c.close();
 }
 {
  const {c,p}=await fixture();await p.evaluate(()=>{sendInk('pointerdown');sendInk('pointermove',10)});
  await p.waitForFunction(()=>inkStats.writes>=1,{},{timeout:7500});assert.equal(await p.evaluate(()=>drawing),true);
  await p.evaluate(()=>{sendInk('pointermove',20,.8);sendInk('pointerup',25,.7)});await clean(p);
  assert.ok(await p.evaluate(()=>inkStats.writes)>=2);await p.reload();await p.waitForFunction(()=>ready);assert.equal(await p.evaluate(()=>page().strokes[0].points.length),4);assert.ok(Math.abs(await p.evaluate(()=>page().strokes[0].points[2].p)-.8)<1e-6);pass('Long stroke checkpoints within 5 seconds, then persists later samples and pressure');await c.close();
 }
 {
  const {c,p}=await fixture();await p.evaluate(()=>{sendInk('pointerdown');sendInk('pointermove',20);window.dispatchEvent(new Event('pagehide'))});await clean(p);assert.equal(await p.evaluate(()=>inkStats.writes),1);await p.reload();await p.waitForFunction(()=>ready);assert.equal(await p.evaluate(()=>page().strokes[0].points.length),2);pass('Page hide ends active ink and flushes immediately, without waiting for idle');await c.close();
 }
 {
  const {c,p}=await fixture();await p.evaluate(()=>{window.dbPut=()=>Promise.reject(new DOMException('Synthetic quota','QuotaExceededError'));sendInk('pointerdown');sendInk('pointerup',10)});
  await p.waitForFunction(()=>saveFailed);assert.equal(await p.evaluate(()=>isDirty()),true);assert.match(await p.locator('#saveState').textContent(),/Kaydedilemedi/);
  await p.evaluate(()=>{window.dbPut=originalDbPut;return flushSave()});await clean(p);await p.reload();await p.waitForFunction(()=>ready);assert.equal(await p.evaluate(()=>page().strokes.length),1);pass('Failed deferred save stays dirty, exposes recovery, and retries without losing ink');await c.close();
 }
 {
  const {c,p}=await fixture();const second=await c.newPage();await second.goto(origin);await second.waitForFunction(()=>ready);
  await second.evaluate(async()=>{page().title='Second tab owns saved state';scheduleSave();await flushSave()});
  await p.evaluate(()=>{sendInk('pointerdown');sendInk('pointerup',20)});await p.waitForFunction(()=>saveConflict);assert.equal(await p.evaluate(()=>canEdit()),false);
  await second.reload();await second.waitForFunction(()=>ready);assert.equal(await second.evaluate(()=>page().title),'Second tab owns saved state');assert.equal(await second.evaluate(()=>page().strokes.length),0);pass('Deferred save retains compare-and-swap conflict blocking; other tab not overwritten');await c.close();
 }
 {
  const {c,p}=await fixture();await p.evaluate(async()=>{sendInk('pointerdown');sendInk('pointerup',15);await flushSave()});assert.equal(await p.evaluate(()=>isDirty()),false);assert.equal(await p.evaluate(()=>inkStats.writes),1);pass('Explicit save bypasses idle delay');
  await p.evaluate(()=>{sendInk('pointerdown');sendInk('pointermove',30);sendInk('pointercancel',30)});await clean(p);assert.equal(await p.evaluate(()=>page().strokes.length),2);pass('Pointer cancellation preserves the partial stroke and releases drawing state');
  await p.screenshot({path:path.join(out,'ink-after-save.png')});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);pass('Tablet-sized UI remains within viewport');await c.close();
 }
 console.log(JSON.stringify(measurements));
}finally{if(browser)await browser.close();fs.writeFileSync(path.join(out,'performance-results.json'),JSON.stringify({results,measurements,physicalIPad:false},null,2))}})().catch(e=>{console.error(e);process.exitCode=1});
