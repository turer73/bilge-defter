'use strict';
// Same-window library round trip on the real invited origin name. Synthetic notes and
// routed network; service workers are blocked here and covered by verify-v59-update.
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),{chromium,webkit}=require('playwright');
const root=path.resolve(process.env.BILGE_TEST_ROOT||path.join(__dirname,'bilge-defter-invited-v59'));
const out=path.resolve(process.env.BILGE_TEST_OUTPUT||path.join(__dirname,'../outputs/v59-library'));
const origin='https://defter.bilgearena.com',notebook=origin+'/',library=origin+'/library/';
const libraryHtml='<!doctype html><html lang="tr"><meta charset="utf-8"><title>Kütüphane</title><body><nav class="notebook-return-bar"><a class="read-action notebook-return" href="https://defter.bilgearena.com/" target="_self">← Deftere dön</a></nav><h1 id="library">Synthetic library</h1></body></html>';
fs.mkdirSync(out,{recursive:true});
async function ready(page){await page.waitForFunction(()=>typeof ready!=='undefined'&&ready&&window.__v2UI)}
async function alertFrom(page,action){const seen=new Promise(resolve=>page.once('dialog',async d=>{const message=d.message();await d.accept();resolve(message)}));await action();return seen}
async function backToNotebook(page){await page.locator('.notebook-return').click();await page.waitForURL(notebook);await ready(page)}
(async()=>{let passed=0;
 for(const [engine,name] of [[chromium,'chromium'],[webkit,'webkit']]){
  const browser=await engine.launch({headless:true});
  try{for(const [width,height] of [[390,844],[820,1180]]){
   const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await context.addInitScript(()=>{localStorage.setItem('bilge_defter_onboarding_v1','true')});
   await context.route('**/*',route=>{
    const u=new URL(route.request().url());
    if(u.origin!==origin)return route.abort();
    if(u.pathname==='/api/v1/bilge-defter/whoami')return route.fulfill({json:{account_protocol:'approval-v1',identity:{type:'access',id:'00000000-0000-4000-8000-000000000059',status:'approved',role:'student',email:'fixture@example.org'}}});
    if(u.pathname==='/library'||u.pathname.startsWith('/library/'))return route.fulfill({contentType:'text/html; charset=utf-8',body:libraryHtml});
    const file=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,contentType:'application/json',body:'{}'});
    return route.fulfill({path:file});
   });
   await page.goto(notebook);await ready(page);
   // Menu entry waits for the pending pen-lift save, then leaves in the same window.
   await page.evaluate(()=>{page().title='V59_LIBRARY_ROUNDTRIP';scheduleInkSave()});
   assert.equal(await page.evaluate(()=>isDirty()),true);
   await page.locator('bilge-defter-ui [data-command="study.library"]').click();
   await page.waitForURL(library);await page.locator('#library').waitFor();assert.equal(context.pages().length,1);
   await backToNotebook(page);assert.equal(context.pages().length,1);
   assert.equal(await page.evaluate(()=>page().title),'V59_LIBRARY_ROUNDTRIP');passed++;
   // The dictionary term travels only in the fragment; still one window.
   await page.evaluate(()=>openDictionary('kalp'));await page.locator('#dictMode').selectOption('anatomy');
   await page.locator('[data-concept-id="anatomy.heart"]').waitFor();await page.locator('[data-concept-id="anatomy.heart"] button').click();
   await page.locator('#dictLibrary').click();await page.waitForURL(u=>u.href.startsWith(library));
   assert.equal(new URLSearchParams(new URL(page.url()).hash.slice(1)).get('q'),'heart');assert.equal(context.pages().length,1);passed++;
   await backToNotebook(page);
   // An unfinished text draft keeps the notebook open.
   await page.evaluate(()=>document.querySelector('#textAdd').click());assert.ok(await page.evaluate(()=>!!mediaPending));
   const blocked=await alertFrom(page,()=>page.evaluate(()=>{void window.openBilgeLibrary()}));
   assert.match(blocked,/açık düzenlemeyi bitirin/);assert.equal(page.url(),notebook);assert.ok(await page.evaluate(()=>!!mediaPending));
   await page.evaluate(()=>cancelMediaMode());passed++;
   // Offline: nothing is left, the reason is shown.
   await context.setOffline(true);
   const offline=await alertFrom(page,()=>page.evaluate(()=>{void window.openBilgeLibrary()}));
   assert.match(offline,/internet/);assert.equal(page.url(),notebook);await context.setOffline(false);passed++;
   // A save that cannot complete keeps the unsaved change in this window.
   await page.evaluate(()=>{page().title='V59_UNSAVED_CONFLICT';markChanged();saveConflict=true});
   const failed=await alertFrom(page,()=>page.evaluate(()=>{void window.openBilgeLibrary()}));
   assert.match(failed,/Kayıt tamamlanamadı/);assert.equal(page.url(),notebook);
   assert.equal(await page.evaluate(()=>page().title),'V59_UNSAVED_CONFLICT');await page.evaluate(()=>{saveConflict=false});passed++;
   assert.deepEqual(errors,[]);
   await page.screenshot({path:path.join(out,`library-${name}-${width}.png`)});
   await context.close();
  }}finally{await browser.close()}
 }
 fs.writeFileSync(path.join(out,'library-tests.json'),JSON.stringify({passed,synthetic:true,realDevice:false},null,2));
 console.log('PASS '+passed+' v59 same-window library checks');
})().catch(e=>{console.error(e);process.exit(1)});
