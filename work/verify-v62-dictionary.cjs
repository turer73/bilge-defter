'use strict';
// v62 anatomy dictionary in the browser: 356 concepts, Wikidata provenance with editor edits and
// additions, library search counts, and "Kütüphanede ara" sending the term the library matches.
// No request leaves the test origin; links are checked, not followed. Synthetic, no iPad.
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),{chromium,webkit}=require('playwright');
const root=path.resolve(process.env.BILGE_TEST_ROOT||path.join(__dirname,'bilge-defter-invited-v62'));
const out=path.resolve(process.env.BILGE_TEST_OUTPUT||path.join(__dirname,'../outputs/v62-dictionary'));
const origin='http://127.0.0.1:49367';fs.mkdirSync(out,{recursive:true});
const results=[];const pass=s=>{results.push(s);console.log('PASS '+s)};
async function run(browser,name,width){
 const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'}),page=await context.newPage(),errors=[],external=[];
 page.on('pageerror',e=>errors.push(e.message));
 await context.addInitScript(()=>{window.__accountRequired=false;localStorage.setItem('bilge_defter_onboarding_v1','true');window.libraryOpens=[];window.open=(...args)=>{window.libraryOpens.push(args);return null}});
 await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==origin){external.push(u.href);return route.abort()}const file=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:'{}'});return route.fulfill({path:file})});
 await page.goto(origin);await page.waitForFunction(()=>typeof ready!=='undefined'&&ready&&window.BilgeTerminology);await page.evaluate(()=>flushSave());
 const before=await page.evaluate(()=>JSON.stringify(state));
 await page.evaluate(()=>openDictionary(''));await page.locator('#dictMode').selectOption('anatomy');
 await page.waitForFunction(()=>document.querySelector('#dictCount').textContent.startsWith('356 taslak kavram'));
 const note=await page.locator('#dictDialog .recovery-note:not(#dictCount)').textContent();
 assert.match(note,/^356 kavramlık çevrim dışı pilot/);assert.match(note,/Wikidata’dan \(CC0\)/);assert.match(note,/uzman kontrolü tamamlanmadı/);
 pass(`${name} ${width}: anatomy mode announces 356 draft concepts and the Wikidata (CC0) label source`);
 const card=async(q,id)=>{await page.locator('#dictQuery').fill(q);const c=page.locator(`[data-concept-id="anatomy.${id}"]`);await c.waitFor();return c};
 let c=await card('nöron','neuron');
 const link=c.locator('a.dict-reference',{hasText:'Wikidata'});
 assert.equal(await link.getAttribute('href'),'https://www.wikidata.org/wiki/Q43054');assert.equal(await link.getAttribute('target'),'_blank');assert.match(await link.getAttribute('rel'),/noopener/);
 assert.match(await link.textContent(),/^Etiket kaynağı: Wikidata Q43054 · TA98 A14\.0\.00\.002 \(CC0\)/);
 assert.match(await c.locator('.dict-library').textContent(),/^Kütüphane araması “neuron”: 5 kitapta \d+ sayfa eşleşiyor · en çok: .+ \(\d+\)\.$/);
 pass(`${name} ${width}: a Wikidata concept links its item and TA code and shows library search matches`);
 c=await card('şakak kası','temporalis');assert.match(await c.locator('a.dict-reference',{hasText:'Wikidata'}).textContent(),/editör düzeltmesi: Türkçe$/);
 c=await card('küçük göğüs kası','pectoralis-minor');const added=await c.locator('a.dict-reference',{hasText:'Wikidata'}).textContent();assert.match(added,/editör eklemesi: Türkçe$/);assert.doesNotMatch(added,/düzeltmesi/);
 pass(`${name} ${width}: corrected Turkish labels and Turkish labels Wikidata lacked are named differently`);
 c=await card('yemek borusu','oesophagus');
 assert.equal(await c.locator('a.dict-reference',{hasText:'Wikidata'}).count(),0);assert.equal(await c.locator('a.dict-reference',{hasText:'Kaynak adayı'}).count(),1);
 assert.match(await c.locator('.dict-library').textContent(),/^Kütüphane araması “esophagus”: /);
 assert.equal(await page.evaluate(()=>libraryOpens.length),0);
 await c.locator('button').click();await page.locator('#dictLibrary').click();
 const opened=await page.evaluate(()=>libraryOpens.pop());assert.equal(new URLSearchParams(new URL(opened[0]).hash.slice(1)).get('q'),'esophagus');
 pass(`${name} ${width}: pilot concepts keep their FIPAT candidate; Kütüphanede ara sends esophagus, the spelling the books use`);
 c=await card('platisma','platysma');assert.match(await c.locator('.dict-library').textContent(),/eşleşen sayfa yok\.$/);
 await page.locator('#dictQuery').fill('os');await page.locator('[data-concept-id="anatomy.bone"]').waitFor();
 assert.equal(await page.locator('[data-concept-id="anatomy.mouth"]').count(),1);
 await page.locator('#dictQuery').fill('kas');await page.locator('[data-concept-id="anatomy.muscle"]').waitFor();
 assert.equal(await page.locator('#dictResults .dict-entry').first().getAttribute('data-concept-id'),'anatomy.muscle');
 pass(`${name} ${width}: no-match wording, both meanings of Latin os, and exact kas ahead of kaş`);
 await page.locator('#dictQuery').fill('iki başlı');await page.locator('[data-concept-id="anatomy.biceps-femoris"]').waitFor();
 assert.equal(await page.locator('#dictDialog').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
 await page.screenshot({path:path.join(out,`dictionary-${name}-${width}.png`)});
 await page.locator('#dictClose').click();
 assert.equal(await page.evaluate(()=>JSON.stringify(state)),before);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 pass(`${name} ${width}: no horizontal overflow, notebook unchanged, no page errors, no external requests`);
 await context.close();
}
(async()=>{
 for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await engine.launch({headless:true});
  try{for(const width of [390,1180])await run(browser,name,width)}finally{await browser.close()}
 }
 fs.writeFileSync(path.join(out,'dictionary-tests.json'),JSON.stringify({passed:results.length,results,synthetic:true,realDevice:false},null,2));
 console.log(JSON.stringify({passed:results.length,failed:0}));
})().catch(e=>{console.error(e);process.exit(1)});
