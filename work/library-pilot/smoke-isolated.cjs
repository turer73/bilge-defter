const {chromium,webkit}=require('playwright'),assert=require('node:assert/strict'),path=require('path');
const notebook='https://defter.bilgearena.com/';
(async()=>{let passed=0;
 for(const [engine,type] of Object.entries({chromium,webkit})){
  const browser=await type.launch({headless:true});try{
   for(const viewport of [{width:820,height:1180},{width:1180,height:820},{width:390,height:844}]){
    const context=await browser.newContext({viewport,hasTouch:true}),page=await context.newPage(),errors=[];
    // Never navigate a real user account. Only the destination is simulated.
    await context.route(notebook,r=>r.fulfill({contentType:'text/html',body:'<h1 id="notebook">Synthetic notebook destination</h1>'}));
    page.on('pageerror',e=>errors.push(e.message));
    async function checkReturn(selector){
     const link=page.locator(selector);await link.waitFor({state:'visible'});
     assert.equal(await link.getAttribute('href'),notebook);assert.equal(await link.getAttribute('target'),'_self');
     const box=await link.boundingBox();assert.ok(box.height>=46&&box.y>=0&&box.y+box.height<=viewport.height);
     assert.ok(await link.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}));
     await link.tap();await page.waitForURL(notebook);await page.locator('#notebook').waitFor();assert.equal(context.pages().length,1);passed++;
    }
    await page.goto(process.argv[2]);await page.locator('.card').first().waitFor();
    assert.ok((await page.locator('body').innerText()).length>100);await page.evaluate(()=>scrollTo(0,900));
    await page.screenshot({path:path.join(process.argv[3],`return-${engine}-${viewport.width}-catalog.png`)});
    await checkReturn('body > .notebook-return-bar .notebook-return');
    await page.goto(process.argv[2]);await page.locator('.card').first().getByRole('button',{name:'Kitabı aç',exact:true}).click();
    await page.locator('#pageImage').waitFor({state:'visible'});await page.locator('#reader').evaluate(el=>el.scrollTop=600);
    await page.screenshot({path:path.join(process.argv[3],`return-${engine}-${viewport.width}-pdf.png`)});
    await checkReturn('#reader .notebook-return');
    await page.goto(process.argv[2]+'/read/msu-neuroscience/14?account=local');await page.locator('#sourceText').waitFor();await page.evaluate(()=>scrollTo(0,900));
    await page.screenshot({path:path.join(process.argv[3],`return-${engine}-${viewport.width}-text.png`)});
    await checkReturn('.notebook-return');assert.deepEqual(errors,[]);await context.close();
   }
   const context=await browser.newContext({javaScriptEnabled:false}),page=await context.newPage();
   await context.route(notebook,r=>r.fulfill({contentType:'text/html',body:'<h1>Notebook</h1>'}));
   await page.goto(process.argv[2]);await page.locator('body > .notebook-return-bar a').click();await page.waitForURL(notebook);passed++;await context.close();
  }finally{await browser.close()}
 }
 console.log(`PASS ${passed} library return checks; same tab, sticky touch target, JavaScript-independent; no page errors`);
})().catch(e=>{console.error(e);process.exitCode=1});
