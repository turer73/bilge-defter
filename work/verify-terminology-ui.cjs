// Actual application in browser; network responses are intercepted with synthetic fixtures.
// No production data, remote service calls or installed user profiles are used.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const root=path.resolve(process.env.BILGE_TEST_ROOT||path.join(__dirname,'bilge-defter-invited-v53')),out=path.resolve(process.env.BILGE_TEST_OUTPUT||path.join(__dirname,'../outputs/terminology-pilot'));
// Test a source-only fix on an immutable release baseline without rebuilding that release.
const dictionaryOverride=process.env.BILGE_TEST_DICTIONARY_SOURCE?path.resolve(process.env.BILGE_TEST_DICTIONARY_SOURCE):null;
const origin='http://127.0.0.1:49354';fs.mkdirSync(out,{recursive:true});let passed=0;
const pass=name=>{passed++;console.log('PASS '+name)};
async function run(browserType,name){
 const browser=await browserType.launch({headless:true});
 try{
  for(const [layout,viewport] of [['tablet',{width:820,height:1180}],['phone',{width:390,height:844}]]){
   const context=await browser.newContext({viewport,hasTouch:true,serviceWorkers:'block'}),page=await context.newPage();
   const errors=[],calls=[];let delaySearch=false,delayList=false;
   page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('404'))errors.push(m.text())});
   await context.addInitScript(()=>{window.__accountRequired=false;localStorage.setItem('bilge_defter_onboarding_v1','true')});
   await context.route('**/*',async route=>{
    const u=new URL(route.request().url());if(u.origin!==origin){calls.push('EXTERNAL '+u.origin);return route.abort()}
    if(u.pathname.includes('/dictionaries')){
     calls.push(u.pathname+u.search);
     if(u.pathname.endsWith('/search')){if(delaySearch)await new Promise(r=>setTimeout(r,600));return route.fulfill({json:{results:[{term:'gecikmiş sunucu cevabı',def:'Yalnız genel sözlükte görünmeli'}]}}).catch(()=>{})}
     if(delayList)await new Promise(r=>setTimeout(r,600));return route.fulfill({json:{dictionaries:[{id:'fixture',name:'Test sözlüğü',count:1}]}}).catch(()=>{});
    }
    if(u.pathname.includes('/api/'))return route.fulfill({status:404,body:'{}'});
    const file=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
    if(dictionaryOverride&&u.pathname==='/dictionary-workspace.js')return route.fulfill({contentType:'application/javascript',body:fs.readFileSync(dictionaryOverride)});
    return route.fulfill({contentType:({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
   });
   await page.goto(origin);await page.waitForFunction(()=>typeof ready!=='undefined'&&ready&&window.__v2UI);await page.evaluate(()=>flushSave());
   const before=await page.evaluate(()=>JSON.stringify(state));
   await page.evaluate(()=>openDictionary('astım'));
   await page.waitForFunction(()=>document.querySelector('#dictResults').textContent.includes('astım'));
   assert.match(await page.locator('#dictCount').innerText(),/cihazdaki alt küme/);pass(name+' '+layout+' existing Turkish lookup preserved');
   await page.locator('#dictMode').selectOption('anatomy');
   assert.equal(await page.locator('#dictSelect').isVisible(),false);
   for(const q of ['kalp','HEART','COR']){await page.locator('#dictQuery').fill(q);await page.locator('[data-concept-id="anatomy.heart"]').waitFor();assert.match(await page.locator('#dictResults').innerText(),/Taslak eşleştirme/);}
   pass(name+' '+layout+' three-language results and draft status');
   await page.locator('#dictQuery').fill('on capraz bag');await page.locator('[data-concept-id="anatomy.acl"]').waitFor();
   assert.equal(await page.locator('#dictQuery').inputValue(),'on capraz bag');pass(name+' '+layout+' diacritic-free lookup preserves input');
   await page.locator('#dictQuery').fill('kallp');await page.waitForFunction(()=>document.querySelector('#dictResults').textContent.includes('Bunu mu demek'));
   await page.locator('[data-concept-id="anatomy.heart"] button').click();assert.match(await page.locator('#dictQueryDraft').innerText(),/Özgün sorgu: kallp/);assert.match(await page.locator('#dictQueryDraft').innerText(),/henüz gönderilmedi/);
   assert.equal(calls.length,0);pass(name+' '+layout+' suggestion selection produces a local draft without transmission');
   await page.locator('#dictQuery').fill('femur');assert.equal(await page.locator('#dictQueryDraft').isHidden(),true);
   await page.locator('[data-concept-id="anatomy.femur"]').waitFor();await page.locator('[data-concept-id="anatomy.thigh"]').waitFor();pass(name+' '+layout+' ambiguous term retains both meanings and clears old selection');
   await page.locator('#dictQuery').fill('kalp');await page.locator('[data-concept-id="anatomy.heart"]').waitFor();
   const box=await page.locator('#dictDialog').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=viewport.width+1);assert.ok(box.y>=0&&box.y+box.height<=viewport.height+1);
   assert.equal(await page.locator('#dictDialog').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
   await page.screenshot({path:path.join(out,name+'-'+layout+'.png'),fullPage:true});pass(name+' '+layout+' visible modal fits viewport without horizontal overflow');
   await page.locator('#dictQuery').fill('<img src=x onerror=alert(1)>');await page.waitForFunction(()=>document.querySelector('#dictResults').textContent.includes('bulunamadı'));assert.equal(await page.locator('#dictResults img').count(),0);pass(name+' '+layout+' unknown input is not rendered as HTML');
   await page.evaluate(()=>{window.__syncInvited=true});
   await page.locator('#dictMode').selectOption('general');await page.waitForFunction(()=>document.querySelector('#dictSelect').options.length===1);
   delaySearch=true;const count=calls.length;await page.locator('#dictQuery').fill('kalp');await page.waitForFunction(()=>document.querySelector('#dictQuery').value==='kalp');
   const deadline=Date.now()+5000;while(calls.length<=count&&Date.now()<deadline)await page.waitForTimeout(30);assert.ok(calls.length>count);
   await page.locator('#dictMode').selectOption('anatomy');await page.waitForTimeout(750);
   assert.ok(!(await page.locator('#dictResults').innerText()).includes('gecikmiş'));assert.match(await page.locator('#dictCount').innerText(),/anatomi pilotu/);pass(name+' '+layout+' stale server search cannot overwrite pilot');
   delayList=true;await page.locator('#dictMode').selectOption('general');await page.locator('#dictMode').selectOption('anatomy');await page.waitForTimeout(750);assert.match(await page.locator('#dictDialog .recovery-note').first().innerText(),/taslaktır/);pass(name+' '+layout+' stale catalog cannot overwrite pilot mode');
   await page.locator('[data-concept-id="anatomy.heart"] button').click();await page.locator('#dictClose').click();assert.equal(await page.locator('#dictQueryDraft').isHidden(),true);
   assert.equal(await page.evaluate(()=>JSON.stringify(state)),before);assert.deepEqual(errors,[]);assert.ok(!calls.some(c=>c.startsWith('EXTERNAL')));pass(name+' '+layout+' no note mutation, page errors or automatic external requests');
   await context.close();
  }
 }finally{await browser.close()}
}
(async()=>{await run(chromium,'chromium');await run(webkit,'webkit');console.log(JSON.stringify({passed,realDevice:false,server:'mocked',screenshots:out,dictionaryOverride}));})().catch(e=>{console.error(e);process.exitCode=1});
