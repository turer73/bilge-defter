const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('C:/Users/sevdi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = 'http://100.84.251.49:18788';
async function saved(p) { await p.waitForFunction(() => document.querySelector('#saveState').textContent === 'Bu cihazda kaydedildi'); }
async function stroke(p, x) { await p.locator('#canvas').evaluate((c,x) => { const r=c.getBoundingClientRect(); for (const [type,dx] of [['pointerdown',0],['pointermove',50],['pointerup',100]]) c.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:30,pointerType:'pen',clientX:r.left+x+dx,clientY:r.top+100,buttons:type==='pointerup'?0:1})); },x); }
async function data(p) { return p.evaluate(() => new Promise(resolve => { const r=indexedDB.open('bilge-defter-test-v1',1);r.onsuccess=()=>{const db=r.result,q=db.transaction('state').objectStore('state').get('app');q.onsuccess=()=>{db.close();resolve(q.result)}}; })); }
(async()=>{
 const browser=await chromium.launch({headless:true});
 try {
  const c=await browser.newContext();
  await c.route(origin+'/**',async r=>{ const name=new URL(r.request().url()).pathname.split('/').pop()||'index.html'; if(!['index.html','manifest.webmanifest','sw.js'].includes(name))return r.abort(); await r.fulfill({body:await fs.readFile(path.join(__dirname,'bilge-defter-test',name)),contentType:name.endsWith('html')?'text/html':'application/json'}); });
  const a=await c.newPage();await a.goto(origin);await saved(a);
  const b=await c.newPage();await b.goto(origin);await saved(b);
  await stroke(a,100);await saved(a);const first=await data(a);
  await stroke(b,350);await saved(b);const second=await data(b);
  assert.equal(first.pages[0].strokes[0].points[0].x,100);
  assert.equal(second.pages[0].strokes[0].points[0].x,350);
  assert.equal(second.pages[0].strokes.length,1);
  console.log('REPRODUCED: second stale tab overwrites first tab stroke without warning.');
  await b.evaluate(()=>{ const original=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){const r=original.apply(this,args);this.transaction.abort();return r}; });
  const imported={version:1,pages:[{id:'imported-test',title:'Failed import visible',strokes:[]}],active:'imported-test'};
  b.once('dialog',d=>d.accept());
  await b.locator('#importFile').setInputFiles({name:'test.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(imported))});
  await b.waitForFunction(()=>document.querySelector('#saveState').textContent.includes('Kaydedilemedi'));
  assert.equal(await b.locator('#pages .page-item button').first().textContent(),'Failed import visible');
  assert.deepEqual(await data(b),second);
  console.log('REPRODUCED: failed import replaces visible notebook while IndexedDB still holds the old notebook.');
  await c.close();
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
