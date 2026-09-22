const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {chromium}=require('C:/Users/sevdi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin=(process.env.BILGE_TEST_ORIGIN||'http://100.84.251.49:18788'),live=process.argv.includes('--live'),results=[],errors=[];let browser;
async function saved(p){await p.waitForFunction(()=>document.querySelector('#saveState').textContent==='Bu cihazda kaydedildi')}
async function data(p,key='app'){return p.evaluate(key=>dbGet(key),key)}
async function stroke(p,x=100){await p.locator('#canvas').evaluate((c,x)=>{const r=c.getBoundingClientRect();for(const [type,dx] of [['pointerdown',0],['pointermove',80],['pointerup',140]])c.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:71,pointerType:'pen',clientX:r.x+x+dx,clientY:r.y+120,pressure:.5}));},x)}
async function tools(p){if(!await p.locator('#toolsDialog').evaluate(d=>d.open))await p.locator('#toolsToggle').tap()}
async function readDownload(p,selector){const next=p.waitForEvent('download');await p.locator(selector).click();const d=await next;return {name:d.suggestedFilename(),book:JSON.parse(await fs.readFile(await d.path(),'utf8'))}}
async function choose(p,book,name='ders-yedegi.json'){await p.locator('#importFile').setInputFiles({name,mimeType:'application/json',buffer:Buffer.from(typeof book==='string'?book:JSON.stringify(book))})}
async function preview(p,book,name){await choose(p,book,name);await p.locator('#backupDialog').waitFor({state:'visible'})}
async function restored(p){await p.waitForFunction(()=>document.querySelector('#saveState').textContent==='Yedek geri yüklendi')}
async function reject(p,book,pattern){const baseline=await data(p),history=await data(p,'before-import');const dialogP=p.waitForEvent('dialog');await choose(p,book);const d=await dialogP;assert.match(d.message(),pattern);await d.accept();assert.equal(await p.locator('#backupDialog').isVisible(),false);assert.deepEqual(await data(p),baseline);assert.deepEqual(await data(p,'before-import'),history)}
(async()=>{
  browser=await chromium.launch({headless:true});const c=await browser.newContext({serviceWorkers: 'block',viewport:{width:1180,height:820},hasTouch:true});
  c.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
  if(!live)await c.route(origin+'/**',async r=>{const n=new URL(r.request().url()).pathname.split('/').pop()||'index.html',types={'index.html':'text/html','media-workspace.js':'application/javascript','planner-workspace.js':'application/javascript','ui-workspace.js':'application/javascript','ui.css':'text/css','pwa.js':'application/javascript','dictionary-data.js':'application/javascript','dictionary-workspace.js':'application/javascript','ocr-workspace.js':'application/javascript','pdf-workspace.js':'application/javascript','sw.js':'application/javascript','manifest.webmanifest':'application/manifest+json'};if(!types[n])return r.fulfill({status:404,body:''});await r.fulfill({body:await fs.readFile(path.join(__dirname,'bilge-defter-test',n)),contentType:types[n]})});
  const p=await c.newPage();await p.goto(origin+'/?v=20');await saved(p);await stroke(p);await saved(p);
  await p.evaluate(()=>{scrollPaper(1900);return flushSave()});await tools(p);
  const first=await readDownload(p,'#exportBtn'),second=await readDownload(p,'#exportBtn');
  assert.equal(first.book.backupFormat,'bilge-defter');assert.equal(first.book.backupVersion,1);assert.equal(first.book.appVersion,'v40');assert.equal(first.book.version,1);
  assert.ok(Number.isFinite(Date.parse(first.book.exportedAt)));assert.notEqual(first.name,second.name);assert.match(first.name,/bilge-defter-yedek-\d{4}-\d\d-\d\dT.*Z\.json/);
  assert.deepEqual(first.book.pages,(await data(p)).pages);assert.equal(first.book.pages[0].viewY,1900);assert.match(await p.locator('#inputState').innerText(),/başlatıldı/);
  results.push('Versioned exports keep legacy top-level pages, include timestamp/app version and distinct filenames, preserving scroll position and ink');

  const legacy={version:1,pages:[{id:'legacy-page',title:'Anatomi <img src=x onerror=alert(1)>',strokes:first.book.pages[0].strokes,viewY:3000,updated:'2026-09-20T12:00:00.000Z'},{id:'second-page',title:'Fizyoloji',strokes:[],updated:'2026-09-20T12:00:00.000Z'}],active:'legacy-page'};
  const baseline=await data(p),history=await data(p,'before-import');
  const pickerP=p.waitForEvent('filechooser');await p.locator('#importBtn').click();const picker=await pickerP;
  await picker.setFiles({name:'eski-yedek.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(legacy))});await p.locator('#backupDialog').waitFor({state:'visible'});
  assert.match(await p.locator('#backupCounts').innerText(),/2 sayfa · 1 çizgi/);assert.equal(await p.locator('#backupDate').innerText(),'Tarih bilgisi yok');assert.match(await p.locator('#backupFormat').innerText(),/Eski yedek/);
  assert.match(await p.locator('#backupWarning').innerText(),/1 sayfa · 1 çizgi/);assert.match(await p.locator('#backupPages').innerText(),/<img/);assert.equal(await p.locator('#backupPages img').count(),0);
  assert.equal(await p.locator('#toolsDialog').isVisible(),false);assert.deepEqual(await data(p),baseline);assert.deepEqual(await data(p,'before-import'),history);
  await stroke(p,350);await p.evaluate(()=>document.querySelector('#newPage').click());assert.deepEqual(await data(p),baseline);
  await p.keyboard.press('Escape');assert.equal(await p.locator('#backupDialog').isVisible(),false);assert.deepEqual(await data(p),baseline);
  await preview(p,legacy);await p.locator('#backupCancel').click();await preview(p,legacy);await p.locator('#backupClose').click();assert.deepEqual(await data(p),baseline);
  results.push('Real file chooser shows legacy preview with computed counts and safe text; preview cannot edit notes; Escape, Cancel and Close do not change notebook/history');

  await preview(p,first.book);assert.match(await p.locator('#backupFormat').innerText(),/biçimi 1/);assert.notEqual(await p.locator('#backupDate').innerText(),'Tarih bilgisi yok');
  const protectedBackup=await readDownload(p,'#backupCurrent');assert.deepEqual(protectedBackup.book.pages,baseline.pages);assert.match(await p.locator('#backupDownloadStatus').innerText(),/İndirme başlatıldı/);assert.equal(await p.locator('#backupDialog').isVisible(),true);
  await p.setViewportSize({width:390,height:844});const narrow=await p.locator('#backupDialog').boundingBox();assert.ok(narrow.x>=0&&narrow.x+narrow.width<=390);assert.equal(await p.locator('#backupDialog').evaluate(d=>d.scrollWidth<=d.clientWidth),true);
  await p.screenshot({path:path.join(__dirname,`bilge-defter-v40-backup-${live?'live':'local'}.png`),fullPage:true});await p.locator('#backupCancel').tap();
  await p.setViewportSize({width:844,height:390});await preview(p,legacy);await p.locator('#backupCancel').tap();await p.setViewportSize({width:1180,height:820});
  results.push('Preview can download current notebook before replacement; 390px portrait and short landscape dialogs stay usable without horizontal overflow');

  await preview(p,legacy);await p.locator('#backupApply').click();await restored(p);assert.deepEqual(await data(p),legacy);assert.deepEqual(await data(p,'before-import'),baseline);assert.equal(await p.locator('#backupDialog').isVisible(),false);
  await p.reload();await saved(p);assert.deepEqual(await data(p),legacy);assert.equal(await p.evaluate(()=>viewY()),3000);
  await tools(p);p.once('dialog',d=>d.accept());await p.locator('#restorePrevious').click();await p.waitForFunction(()=>document.querySelector('#saveState').textContent==='Önceki defter geri getirildi');assert.deepEqual(await data(p),baseline);await p.locator('#toolsClose').click();
  await preview(p,first.book);await p.locator('#backupApply').click();await restored(p);assert.deepEqual((await data(p)).pages,first.book.pages);assert.equal(Object.hasOwn(await data(p),'backupVersion'),false);await p.reload();await saved(p);
  results.push('Legacy and versioned backups restore after explicit confirmation, survive reload, preserve world coordinates, and retain the pre-import recovery copy');

  await reject(p,{...first.book,backupVersion:99},/sürümü desteklenmiyor/);await reject(p,{...first.book,backupVersion:'1'},/sürümü desteklenmiyor/);await reject(p,{...first.book,backupFormat:'another-app'},/sürümü desteklenmiyor/);
  const missing={...first.book};delete missing.backupVersion;await reject(p,missing,/sürümü desteklenmiyor/);
  await reject(p,{...first.book,version:99},/Geçerli/);await reject(p,'{broken',/JSON/);await reject(p,null,/Geçerli/);
  await reject(p,{...legacy,pages:[legacy.pages[0],legacy.pages[0]]},/Geçerli/);await reject(p,{...legacy,pages:[{...legacy.pages[0],viewY:-1}]},/Geçerli/);
  results.push('Future/foreign/missing backup versions, malformed JSON, duplicate IDs and invalid positions are rejected without changing notebook or recovery data');

  const many={...legacy,pages:Array.from({length:25},(_,i)=>({...legacy.pages[1],id:`many-${i}`,title:`Ders ${i+1}`})),active:'many-0'};
  await preview(p,many);assert.equal(await p.locator('#backupPages li').count(),21);assert.match(await p.locator('#backupCounts').innerText(),/25 sayfa · 0 çizgi/);assert.match(await p.locator('#backupPages li').last().innerText(),/5 sayfa daha/);await p.locator('#backupCancel').click();
  await p.evaluate(()=>{const original=File.prototype.text;File.prototype.text=function(){const read=original.call(this);return this.name==='slow.json'?new Promise(resolve=>{window.__releaseRead=async()=>resolve(await read)}):read}});
  await choose(p,legacy,'slow.json');await p.waitForFunction(()=>typeof window.__releaseRead==='function');await preview(p,first.book,'fast.json');await p.evaluate(()=>window.__releaseRead());
  assert.equal(await p.locator('#backupFileName').innerText(),'fast.json');assert.match(await p.locator('#backupCounts').innerText(),/1 sayfa · 1 çizgi/);await p.locator('#backupCancel').click();
  results.push('Large page lists are summarized without truncating backup data; late file reads cannot replace a newer selected preview');

  const beforeFailure=await data(p),beforeHistory=await data(p,'before-import');
  await p.evaluate(()=>{window.__originalPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){const r=window.__originalPut.apply(this,args);if(args[1]==='app')this.transaction.abort();return r}});
  await preview(p,legacy);await p.locator('#backupApply').click();await p.waitForFunction(()=>document.querySelector('#saveState').textContent.includes('Kaydedilemedi'));assert.equal(await p.locator('#backupDialog').isVisible(),false);assert.deepEqual(await data(p),beforeFailure);assert.deepEqual(await data(p,'before-import'),beforeHistory);
  assert.deepEqual((await readDownload(p,'#emergencyExport')).book.pages,beforeFailure.pages);await p.evaluate(()=>{IDBObjectStore.prototype.put=window.__originalPut});await p.locator('#retrySave').click();await saved(p);
  results.push('Failed confirmed restore leaves screen and disk intact, closes modal, and exposes usable emergency export and retry controls');

  const other=await c.newPage();await other.goto(origin+'/?v=20');await saved(other);await preview(p,legacy);await stroke(other,480);await saved(other);const winner=await data(other);
  await p.locator('#backupApply').click();await p.waitForFunction(()=>document.querySelector('#saveState').textContent.includes('Başka sekmede'));
  assert.deepEqual(await data(p),winner);assert.deepEqual((await readDownload(p,'#emergencyExport')).book.pages,beforeFailure.pages);assert.equal(await p.locator('#backupDialog').isVisible(),false);
  results.push('A newer save in another tab while preview is open blocks replacement; both saved notes and this tab emergency export remain available');
  assert.deepEqual(errors,[]);await c.close();console.log(JSON.stringify({mode:live?'live':'local',passed:results.length,results,physicalTabletTest:'pending'},null,2));
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close()});
