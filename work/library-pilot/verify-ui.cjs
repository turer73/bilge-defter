'use strict';
const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const out=path.resolve(__dirname,'../../outputs/library-pilot');
const origin='http://127.0.0.1:8766';
const results=[];
(async()=>{
 for(const [name,engine,size] of [['chromium',chromium,{width:1280,height:900}],['webkit',webkit,{width:820,height:1180}]]){
  const browser=await engine.launch({headless:true});
  try{
   const context=await browser.newContext({viewport:size,serviceWorkers:'block'}),page=await context.newPage(),errors=[],external=[];
   page.on('pageerror',e=>errors.push(e.message));
   await context.route('**/*',route=>{if(!route.request().url().startsWith(origin+'/')){external.push(route.request().url());return route.abort();}return route.continue();});
   await page.goto(origin);await page.waitForFunction(()=>document.querySelectorAll('.card').length===5);
   assert.equal(await page.title(),'Bilge Defter · Kaynak kütüphanesi pilotu');
   await page.screenshot({path:path.join(out,`catalog-${name}.png`),fullPage:true});results.push(`${name}: catalog, attribution and 5 cards`);
   await page.getByLabel('Kitapların içinde ara').fill('kalp');await page.getByRole('button',{name:'Ara',exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('“heart”'));
   const button=page.locator('.card button').first(),label=await button.innerText(),n=Number(label.match(/\d+/)[0]);
   assert(n>0);await button.click();await page.locator('#pageImage').waitFor({state:'visible',timeout:45000});
   assert.equal(await page.locator('#page').inputValue(),String(n));assert(await page.locator('#pageImage').evaluate(img=>img.naturalWidth>500));
   await page.screenshot({path:path.join(out,`reader-${name}.jpg`),type:'jpeg',quality:65,fullPage:true});results.push(`${name}: Turkish lookup -> real matching PDF page image`);
   await page.getByRole('button',{name:'Sayfayı kaydet',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#pageStatus').textContent.includes('kaydedildi'));
   const before=await (await page.request.get(origin+'/api/saved')).json();
   await page.getByRole('button',{name:'Sayfayı kaydet',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#pageStatus').textContent.includes('kaydedildi')&&!document.querySelector('#bookmark').disabled);
   assert.equal((await (await page.request.get(origin+'/api/saved')).json()).length,before.length);results.push(`${name}: persistent save and duplicate protection`);
   await page.locator('#page').fill('0');await page.getByRole('button',{name:'Git',exact:true}).click();assert.match(await page.locator('#pageStatus').innerText(),/Geçerli/);
   await page.locator('#page').fill('2');await page.getByRole('button',{name:'Git',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#pageImage').hidden&&document.querySelector('#pageStatus').textContent.startsWith('PDF sayfası 2 /'));
   await page.getByRole('button',{name:'Kapat',exact:true}).click();await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.card').length===5);
   await page.getByRole('button',{name:'Kaydettiklerim',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('sayfa yer imi'));
   assert((await page.locator('.card').count())>0);results.push(`${name}: reopen saved page after reload; invalid page rejected`);
   await page.getByLabel('Kitapların içinde ara').fill('zzzzunfindablezzzz');await page.getByRole('button',{name:'Ara',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('0 sayfa sonucu'));
   await page.getByLabel('Kitapların içinde ara').fill('<img src=x onerror=alert(1)>');await page.getByRole('button',{name:'Ara',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Aranan özgün terim:'));
   assert.equal(await page.locator('main img').count(),0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   assert.deepEqual(errors,[]);assert.deepEqual(external,[]);results.push(`${name}: empty/XSS-shaped queries, no external requests, no JS errors, no horizontal overflow`);
   await context.close();
  }finally{await browser.close();}
 }
 fs.writeFileSync(path.join(out,'ui-test-results.json'),JSON.stringify({date:new Date().toISOString(),results,physicalDeviceAcceptance:false},null,2));
 console.log(JSON.stringify({passed:results.length,results},null,2));
})().catch(e=>{console.error(e);process.exit(1);});
