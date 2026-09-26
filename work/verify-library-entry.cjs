'use strict';
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),{chromium,webkit}=require('playwright');
const root=path.join(__dirname,'bilge-defter-invited-v55'),origin='http://127.0.0.1:49354',out=path.join(__dirname,'../outputs/v55');
(async()=>{let passed=0;for(const [engine,name] of [[chromium,'chromium'],[webkit,'webkit']]){
const browser=await engine.launch({headless:true});try{for(const width of [390,820,1366]){
const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
await context.addInitScript(()=>{window.__accountRequired=false;localStorage.setItem('bilge_defter_onboarding_v1','true');window.libraryOpens=[];window.open=(...args)=>{window.libraryOpens.push(args);return null;};});
await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==origin)throw Error('Unexpected external request');const file=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':u.pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:'{}'});return route.fulfill({path:file});});
await page.goto(origin);await page.waitForFunction(()=>typeof ready!=='undefined'&&ready&&window.__v2UI);await page.evaluate(()=>flushSave());
const before=await page.evaluate(()=>JSON.stringify(state));
await page.locator('bilge-defter-ui [data-command="study.library"]').click();
assert.deepEqual(await page.evaluate(()=>libraryOpens.pop()),['https://defter.bilgearena.com/library/','_blank','noopener,noreferrer']);passed++;
await page.evaluate(()=>openDictionary('kalp'));await page.locator('#dictMode').selectOption('anatomy');await page.locator('[data-concept-id="anatomy.heart"]').waitFor();
assert.equal(await page.evaluate(()=>libraryOpens.length),0);await page.locator('[data-concept-id="anatomy.heart"] button').click();
await page.locator('#dictLibrary').click();const selected=await page.evaluate(()=>libraryOpens.pop());assert.equal(new URLSearchParams(new URL(selected[0]).hash.slice(1)).get('q'),'heart');passed++;
await page.locator('#dictQuery').fill('böbrek');await page.locator('#dictLibrary').click();const changed=await page.evaluate(()=>libraryOpens.pop());assert.equal(new URLSearchParams(new URL(changed[0]).hash.slice(1)).get('q'),'böbrek');passed++;
await page.locator('#dictQuery').fill('');assert(await page.locator('#dictLibrary').isDisabled());await page.locator('#dictQuery').fill('<img src=x>');await page.locator('#dictLibrary').click();assert.equal(new URL((await page.evaluate(()=>libraryOpens.pop()))[0]).origin,'https://defter.bilgearena.com');passed++;
await page.locator('#dictQuery').fill('kalp');await page.locator('[data-concept-id="anatomy.heart"]').waitFor();
assert.equal(await page.locator('#dictDialog').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
await page.screenshot({path:path.join(out,`entry-${name}-${width}.png`)});
await page.locator('#dictClose').click();assert.equal(await page.evaluate(()=>JSON.stringify(state)),before);assert.deepEqual(errors,[]);passed++;
await context.close();}}finally{await browser.close();}}
fs.writeFileSync(path.join(out,'entry-tests.json'),JSON.stringify({passed,synthetic:true,realDevice:false},null,2));console.log('PASS '+passed+' library entry checks');})().catch(e=>{console.error(e);process.exit(1)});
