'use strict';
// Component regression tests: actual source, synthetic dictionary API, no external network.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const root=path.join(__dirname,'bilge-defter-test');
const results=[];
async function fixture(browser){
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',r=>r.request().url()==='http://127.0.0.1:49354/'?r.fulfill({contentType:'text/html',body:'<!doctype html><html><head></head><body><div class="tool-actions"></div></body></html>'}):r.abort());
  await page.goto('http://127.0.0.1:49354/');
  await page.evaluate(()=>{
    window.closeTools=()=>{};window.setSidebarOpen=()=>{};window.canEdit=()=>true;window.drawing=false;window.pan=false;
    window.BILGE_SOZLUK=[{term:'astım',def:'Yerel sentetik kayıt'},{term:'kalp',def:'Yerel sentetik kayıt'}];
    window.__syncInvited=true;window.testFail=false;window.testDelay=0;window.testCalls=[];
    window.BilgeAccount={fetch:async url=>{
      window.testCalls.push(url);
      if(url.includes('/search')){
        if(window.testFail)throw Error('synthetic failure');
        if(window.testDelay)await new Promise(r=>setTimeout(r,window.testDelay));
        return new Response(JSON.stringify({results:[{term:'Sunucu kaydı',def:'Sentetik sunucu açıklaması'}]}),{status:200});
      }
      return new Response(JSON.stringify({dictionaries:[{id:'fixture',name:'Sentetik sözlük',count:1}]}),{status:200});
    }};
    window.fetch=()=>{throw Error('Unexpected network call')};
  });
  for(const f of ['terminology-data.js','terminology.js','dictionary-workspace.js'])await page.addScriptTag({content:fs.readFileSync(path.join(root,f),'utf8')});
  return {context,page,errors};
}
async function check(browser,name,fn){
  const f=await fixture(browser);
  try{await fn(f.page);assert.deepEqual(f.errors,[]);results.push({name,passed:true});console.log('PASS '+name);}
  catch(e){results.push({name,passed:false,error:e.message});console.log('FAIL '+name+': '+e.message);}
  finally{await f.context.close();}
}
async function anatomy(page){
  await page.evaluate(()=>openDictionary('kalp'));
  await page.locator('#dictMode').selectOption('anatomy');
  await page.locator('[data-concept-id="anatomy.heart"] button').waitFor();
}
async function run(type,name){
  const browser=await type.launch({headless:true});
  try{
    await check(browser,name+' clears old results immediately on input',async page=>{
      await anatomy(page);
      const state=await page.evaluate(()=>{
        const input=document.querySelector('#dictQuery');input.value='akciğer';input.dispatchEvent(new Event('input',{bubbles:true}));
        return {cards:document.querySelectorAll('#dictResults .dict-entry').length,status:document.querySelector('#dictCount').textContent};
      });
      assert.equal(state.cards,0);assert.match(state.status,/Aranıyor/);
      await page.locator('[data-concept-id="anatomy.lung"]').waitFor();
    });
    await check(browser,name+' rejects stale selection callback',async page=>{
      await anatomy(page);
      const hidden=await page.evaluate(()=>{
        const old=document.querySelector('[data-concept-id="anatomy.heart"] button');
        const input=document.querySelector('#dictQuery');input.value='akciğer';input.dispatchEvent(new Event('input',{bubbles:true}));old.click();
        return document.querySelector('#dictQueryDraft').hidden;
      });
      assert.equal(hidden,true);
    });
    await check(browser,name+' rejects callbacks from a previous dialog session',async page=>{
      await anatomy(page);
      const hidden=await page.evaluate(()=>{
        const old=document.querySelector('[data-concept-id="anatomy.heart"] button');
        document.querySelector('#dictDialog').close();openDictionary('kalp');old.click();
        return document.querySelector('#dictQueryDraft').hidden;
      });
      assert.equal(hidden,true);
    });
    await check(browser,name+' current selection stays local and web uses original input',async page=>{
      await anatomy(page);
      await page.locator('#dictQuery').fill('kallp');
      await page.locator('[data-concept-id="anatomy.heart"] button').waitFor();
      const before=await page.evaluate(()=>{window.testOpened=[];window.open=(...args)=>{window.testOpened.push(args)};return window.testCalls.length});
      await page.locator('[data-concept-id="anatomy.heart"] button').click();
      assert.match(await page.locator('#dictQueryDraft').innerText(),/Özgün sorgu: kallp/);
      assert.match(await page.locator('#dictQueryDraft').innerText(),/henüz gönderilmedi/);
      assert.equal(await page.locator('#dictQuery').inputValue(),'kallp');
      assert.equal(await page.evaluate(()=>window.testCalls.length),before);
      assert.deepEqual(await page.evaluate(()=>window.testOpened),[]);
      await page.locator('#dictWeb').click();
      assert.deepEqual(await page.evaluate(()=>window.testOpened),[['https://www.google.com/search?q=kallp','_blank','noopener,noreferrer']]);
    });
    await check(browser,name+' restores server source description after recovery',async page=>{
      await page.evaluate(()=>openDictionary('astım'));
      await page.waitForFunction(()=>document.querySelector('#dictCount').textContent.includes('Sentetik sözlük'));
      await page.evaluate(()=>{window.testFail=true});await page.locator('#dictQuery').fill('kalp');
      await page.waitForFunction(()=>document.querySelector('#dictCount').textContent.includes('cihazdaki alt küme'));
      assert.match(await page.locator('#dictDialog .recovery-note').first().innerText(),/Cihazdaki/);
      await page.evaluate(()=>{window.testFail=false});await page.locator('#dictQuery').fill('astım');
      await page.waitForFunction(()=>document.querySelector('#dictCount').textContent.includes('Sentetik sözlük'));
      assert.match(await page.locator('#dictDialog .recovery-note').first().innerText(),/Sunucudaki seçili sözlük/);
    });
    await check(browser,name+' late server reply cannot replace an empty query',async page=>{
      await page.evaluate(()=>openDictionary('astım'));
      await page.waitForFunction(()=>document.querySelector('#dictCount').textContent.includes('Sentetik sözlük'));
      await page.evaluate(()=>{window.testDelay=500;window.testCalls=[]});await page.locator('#dictQuery').fill('kalp');
      await page.waitForFunction(()=>window.testCalls.some(c=>c.includes('/search')));
      await page.locator('#dictQuery').fill('');await page.waitForTimeout(650);
      assert.equal(await page.locator('#dictResults .dict-entry').count(),0);
      assert.equal(await page.locator('#dictWeb').isDisabled(),true);
    });
  }finally{await browser.close();}
}
(async()=>{
  await run(chromium,'chromium');await run(webkit,'webkit');
  console.log(JSON.stringify({passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,realDevice:false,server:'synthetic'}));
  if(results.some(r=>!r.passed))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
