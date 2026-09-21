const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('C:/Users/sevdi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = (process.env.BILGE_TEST_ORIGIN||'http://100.84.251.49:18788');
const live = process.argv.includes('--live');
const results = [], errors = [];
let browser;
async function session() {
  const c = await browser.newContext({serviceWorkers: 'block',viewport:{width:1180,height:820},hasTouch:true});
  c.on('page', p => p.on('pageerror', e => errors.push(e.message)));
  if (!live) await c.route(origin+'/**', async r => {
    const name = new URL(r.request().url()).pathname.split('/').pop() || 'index.html';
    const types = {'index.html':'text/html','media-workspace.js':'application/javascript','planner-workspace.js':'application/javascript','ui-workspace.js':'application/javascript','ui.css':'text/css','pwa.js':'application/javascript','pdf-workspace.js':'application/javascript','sw.js':'application/javascript','manifest.webmanifest':'application/manifest+json'};
    if (!types[name]) return r.fulfill({status:404,body:''});
    await r.fulfill({body:await fs.readFile(path.join(__dirname,'bilge-defter-test',name)),contentType:types[name]});
  });
  const p=await c.newPage();await p.goto(origin+'/?v=20');await saved(p);return {c,p};
}
async function saved(p){await p.waitForFunction(()=>document.querySelector('#saveState').textContent==='Bu cihazda kaydedildi');}
async function data(p,key='app'){return p.evaluate(key=>new Promise((resolve,reject)=>{const r=indexedDB.open('bilge-defter-test-v1',1);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,q=db.transaction('state').objectStore('state').get(key);q.onsuccess=()=>{db.close();resolve(q.result)};q.onerror=()=>reject(q.error)};}),key);}
async function stroke(p,x=100,finish=true){await p.locator('#canvas').evaluate((c,{x,finish})=>{const r=c.getBoundingClientRect();const events=[['pointerdown',0],['pointermove',60]];if(finish)events.push(['pointerup',120]);for(const [type,dx] of events)c.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:51,pointerType:'pen',clientX:r.x+x+dx,clientY:r.y+100,buttons:type==='pointerup'?0:1,pressure:.5}));},{x,finish});}
async function tools(p){if(!await p.locator('#toolsDialog').evaluate(d=>d.open))await p.locator('#toolsToggle').tap();}
async function closeTools(p){if(await p.locator('#toolsDialog').evaluate(d=>d.open))await p.locator('#toolsClose').click();}
async function download(p,selector){const pending=p.waitForEvent('download');await p.locator(selector).click();const result=await pending;return JSON.parse(await fs.readFile(await result.path(),'utf8'));}
async function installGate(p){await p.evaluate(()=>{const original=dbPut;window.__writes=0;window.__concurrent=0;window.__maxConcurrent=0;dbPut=async(...args)=>{window.__writes++;window.__concurrent++;window.__maxConcurrent=Math.max(window.__maxConcurrent,window.__concurrent);try{await original(...args);if(window.__writes===1)await new Promise(resolve=>window.__release=resolve);}finally{window.__concurrent--;}};});}
async function abortWrites(p){await p.evaluate(()=>{window.__originalPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){const request=window.__originalPut.apply(this,args);if(args[1]==='app')this.transaction.abort();return request};});}
async function restoreWrites(p){await p.evaluate(()=>{IDBObjectStore.prototype.put=window.__originalPut;});}
const imported={version:1,pages:[{id:'import-test',title:'Yüklenen defter',strokes:[],updated:'2026-09-20T12:00:00.000Z'}],active:'import-test'};
async function importFile(p,book=imported){await p.locator('#importFile').setInputFiles({name:'safety-test.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(book))});await p.locator('#backupApply').click();}
(async()=>{
  browser=await chromium.launch({headless:true});
  const immediate=await session();
  const started=await immediate.p.evaluate(()=>{
    let writes=0;const original=IDBDatabase.prototype.transaction;IDBDatabase.prototype.transaction=function(...args){if(args[1]==='readwrite')writes++;return original.apply(this,args)};
    const c=document.querySelector('#canvas'),r=c.getBoundingClientRect();for(const type of ['pointerdown','pointerup'])c.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:91,pointerType:'pen',clientX:r.x+80,clientY:r.y+80}));return writes;
  });
  assert.equal(started,1);await saved(immediate.p);assert.equal((await data(immediate.p)).pages[0].strokes.length,1);
  results.push('Completed stroke starts its transaction in the same event, without the old 250ms delay');await immediate.c.close();

  const serial=await session(),s=serial.p;await installGate(s);await stroke(s);await s.waitForFunction(()=>typeof window.__release==='function');
  await s.locator('#sidebarToggle').tap();await s.locator('#newPage').tap();await stroke(s,300);
  assert.equal(await s.evaluate(()=>window.__writes),1);assert.equal((await data(s)).pages.length,1);
  assert.equal(await s.locator('#saveState').innerText(),'Kaydediliyor…');
  assert.equal(await s.evaluate(()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented}),true);
  await s.evaluate(()=>window.__release());await saved(s);
  const serialBook=await data(s);assert.equal(serialBook.pages.length,2);assert.equal(serialBook.active,serialBook.pages[1].id);
  assert.equal(serialBook.pages[0].strokes[0].points[0].x,100);assert.equal(serialBook.pages[1].strokes[0].points[0].x,300);
  assert.equal(await s.evaluate(()=>window.__maxConcurrent),1);
  await s.reload();await saved(s);assert.deepEqual(await data(s),serialBook);
  results.push('Slow commits serialize later strokes and page changes; old completion never reports newest edits saved; reload retains both pages');await serial.c.close();

  const failed=await session(),f=failed.p;const baseline=await data(f);await abortWrites(f);await stroke(f,150);
  await f.waitForFunction(()=>document.querySelector('#saveState').textContent.includes('Kaydedilemedi'));
  assert.deepEqual(await data(f),baseline);
  const emergency=await download(f,'#emergencyExport');assert.equal(emergency.pages[0].strokes[0].points[0].x,150);
  assert.equal(await f.evaluate(()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented}),true);
  await f.screenshot({path:path.join(__dirname,live?'bilge-defter-v30-save-error-live.png':'bilge-defter-v30-save-error-local.png'),fullPage:true});
  await restoreWrites(f);await f.locator('#retrySave').click();await saved(f);
  assert.equal(await f.locator('#saveRecovery').isVisible(),false);assert.equal((await data(f)).pages[0].strokes.length,1);
  assert.equal(await f.evaluate(()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented}),false);
  await f.reload();await saved(f);assert.equal((await data(f)).pages[0].strokes.length,1);
  results.push('Failed transaction preserves prior disk data; emergency backup includes unsaved ink; retry commits it and clears leave warning');await failed.c.close();

  const lifecycle=await session(),l=lifecycle.p;await stroke(l,180,false);
  await l.waitForFunction(async()=>{const x=await dbGet();return x.pages[0].strokes.length===1});
  assert.equal(await l.locator('#saveState').innerText(),'Kaydediliyor…');
  await l.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>'hidden'});document.dispatchEvent(new Event('visibilitychange'));});
  await saved(l);assert.equal(await l.evaluate(()=>drawing),false);const checkpoint=await data(l);assert.equal(checkpoint.pages[0].strokes[0].points.length,2);
  await l.evaluate(()=>{delete document.visibilityState});await l.reload();await saved(l);assert.deepEqual(await data(l),checkpoint);
  await stroke(l,350,false);await l.evaluate(()=>window.dispatchEvent(new Event('pagehide')));await saved(l);
  assert.equal((await data(l)).pages[0].strokes.length,2);
  results.push('Long stroke checkpoints before pen-up; simulated visibility/pagehide finalize and persist partial stroke without stuck drawing');await lifecycle.c.close();

  const atomic=await session(),a=atomic.p;await stroke(a,220);await saved(a);const original=await data(a);await abortWrites(a);await importFile(a);
  await a.waitForFunction(()=>document.querySelector('#saveState').textContent.includes('Kaydedilemedi'));
  assert.deepEqual(await data(a),original);assert.equal(await data(a,'before-import'),undefined);
  assert.equal(await a.locator('#pages .page-item button').first().innerText(),original.pages[0].title);
  assert.deepEqual((await download(a,'#emergencyExport')).pages,original.pages);
  assert.match(await a.locator('#saveRecoveryMessage').innerText(),/değiştirilmedi/);
  await restoreWrites(a);await a.locator('#retrySave').click();await saved(a);await importFile(a);
  await a.waitForFunction(()=>document.querySelector('#saveState').textContent==='Yedek geri yüklendi');
  assert.deepEqual(await data(a),imported);assert.deepEqual(await data(a,'before-import'),original);
  await a.reload();await saved(a);await tools(a);assert.equal(await a.locator('#restorePrevious').isEnabled(),true);
  a.once('dialog',d=>d.accept());await a.locator('#restorePrevious').click();
  await a.waitForFunction(()=>document.querySelector('#saveState').textContent==='Önceki defter geri getirildi');
  assert.deepEqual(await data(a),original);assert.deepEqual(await data(a,'before-import'),imported);
  await closeTools(a);await abortWrites(a);await tools(a);a.once('dialog',d=>d.accept());await a.locator('#restorePrevious').click();await closeTools(a);
  await a.waitForFunction(()=>document.querySelector('#saveState').textContent.includes('Kaydedilemedi'));
  assert.deepEqual(await data(a),original);assert.deepEqual(await data(a,'before-import'),imported);
  results.push('Failed import/recovery leaves screen and disk unchanged; successful import atomically saves prior notebook, which can be restored after reload');await atomic.c.close();

  const waiting=await session(),w=waiting.p;await installGate(w);await stroke(w,270);await w.waitForFunction(()=>typeof window.__release==='function');
  await importFile(w);await w.waitForFunction(()=>document.querySelector('#saveState').textContent==='Yedek kaydediliyor…');
  assert.equal(await w.locator('#pages .page-item button').first().innerText(),'Sayfa 1');
  await stroke(w,550);await w.evaluate(()=>window.__release());
  await w.waitForFunction(()=>document.querySelector('#saveState').textContent==='Yedek geri yüklendi');
  const pendingRecovery=await data(w,'before-import');assert.equal(pendingRecovery.pages[0].strokes.length,1);assert.equal(pendingRecovery.pages[0].strokes[0].points[0].x,270);
  assert.deepEqual(await data(w),imported);
  results.push('Import waits for pending edits, locks mutations while replacing, and includes the latest stroke in its recovery copy');await waiting.c.close();

  const tabs=await session(),left=tabs.p,right=await tabs.c.newPage();await right.goto(origin+'/?v=20');await saved(right);
  await stroke(left,100);await saved(left);const winning=await data(left);
  await stroke(right,350);await right.waitForFunction(()=>document.querySelector('#saveState').textContent.includes('Başka sekmede'));
  assert.deepEqual(await data(right),winning);assert.equal(await right.locator('#retrySave').isVisible(),false);
  const staleBackup=await download(right,'#emergencyExport');assert.equal(staleBackup.pages[0].strokes[0].points[0].x,350);
  await stroke(right,550);await right.evaluate(()=>document.querySelector('#newPage').click());
  const afterBlocked=await download(right,'#emergencyExport');assert.deepEqual(afterBlocked.pages,staleBackup.pages);
  right.once('dialog',d=>d.accept());await Promise.all([right.waitForNavigation({waitUntil:'domcontentloaded'}),right.locator('#reloadSaved').click()]);await saved(right);
  assert.deepEqual(await data(right),winning);assert.equal(await right.locator('#saveRecovery').isVisible(),false);
  await stroke(right,600);await saved(right);assert.equal((await data(right)).pages[0].strokes.length,2);
  results.push('Stale tab cannot overwrite newer saved strokes; its local changes remain exportable; explicit reload recovers the current notebook');await tabs.c.close();
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({mode:live?'live':'local',passed:results.length,results,limits:'Synthetic lifecycle checks are not OS crash or physical tablet proof'},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close()});
