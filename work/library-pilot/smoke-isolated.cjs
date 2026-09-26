const {chromium}=require('playwright'),assert=require('node:assert/strict'),path=require('path');
(async()=>{const browser=await chromium.launch({headless:true});try{
 const page=await browser.newPage({viewport:{width:820,height:1180}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.goto(process.argv[2]);
 await page.waitForFunction(()=>document.body.innerText.includes('Anatom'));
 assert.ok((await page.locator('body').innerText()).length>100);
 assert.ok(await page.locator('input').count());
 await page.screenshot({path:path.join(process.argv[3],'library.png'),fullPage:true});assert.deepEqual(errors,[]);
 console.log('PASS isolated library UI loads, content/controls visible, no JS errors');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
