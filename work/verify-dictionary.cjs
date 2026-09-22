const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/sevdi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
let browser,server;const results=[],pass=s=>{results.push(s);console.log('PASS '+s)};
(async()=>{try{
 server=http.createServer(async(req,res)=>{try{const n=new URL(req.url,'http://local').pathname.slice(1)||'index.html',data=await fs.readFile(path.join(__dirname,'bilge-defter-invited-v45',n));res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm'})[path.extname(n)]||'application/octet-stream'});res.end(data)}catch{res.writeHead(404);res.end()}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin=process.env.BILGE_TEST_ORIGIN||`http://127.0.0.1:${server.address().port}`;browser=await chromium.launch({headless:true});const errors=[];
 async function openDict(p){await p.locator('#toolsToggle').click();await p.locator('#dictOpen').click();await p.locator('#dictDialog').waitFor({state:'visible'})}
 const dc=await browser.newContext({viewport:{width:1180,height:900}}),d=await dc.newPage();d.on('pageerror',e=>errors.push(e.message));await d.goto(origin);await d.waitForFunction(()=>ready);
 await openDict(d);assert.match(await d.locator('#dictCount').textContent(),/terim hazır/);await d.locator('#dictQuery').fill('astım');await d.waitForFunction(()=>document.querySelector('#dictResults').textContent.length>0);assert.match(await d.locator('#dictResults').textContent(),/nefes darlığı/);assert.match(await d.locator('#dictCount').textContent(),/cihazdaki alt küme/);await d.locator('#dictClose').click();await dc.close();pass('Private origin uses the embedded subset with the fallback label');
 const ic=await browser.newContext({viewport:{width:1180,height:900}});const p=await ic.newPage();p.on('pageerror',e=>errors.push(e.message));
 async function waitNode(cond,ms=20000){const end=Date.now()+ms;while(Date.now()<end){if(await cond())return true;await new Promise(r=>setTimeout(r,300))}return false}
 let searchCalls=0;
 await p.route('**/api/v1/bilge-defter/dictionaries**',async r=>{if(r.request().url().includes('/search')){searchCalls++;const q=new URL(r.request().url()).searchParams.get('q')||'';const hits=[{term:'astım',def:'Bronşların daralmasından ileri gelen nefes darlığı'},{term:'astımlı',def:'Astımı olan'}].filter(x=>x.term.includes(q));await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({results:hits})})}else{await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({dictionaries:[{id:'tdk-gts-v12',name:'TDK Güncel Türkçe Sözlük',source:'TDK',count:98995},{id:'sozluk-b',name:'Başka Sözlük',source:'x',count:120}]})})}});
 await p.goto(origin);await p.waitForFunction(()=>ready);await p.evaluate(()=>window.__syncInvited=true);
 await openDict(p);await p.waitForFunction(()=>document.querySelector('#dictCount').textContent.includes('sözlük hazır'));
 assert.equal(await p.locator('#dictSelect').isVisible(),true);
 const options=await p.locator('#dictSelect option').allTextContents();
 assert.deepEqual(options,['TDK Güncel Türkçe Sözlük (98995)','Başka Sözlük (120)']);
 pass('Invited origin lists every server dictionary with term counts');
 await p.locator('#dictQuery').fill('astım');assert.ok(await waitNode(()=>searchCalls>=1));await p.waitForFunction(()=>document.querySelector('#dictResults').textContent.includes('astımlı'));
 assert.match(await p.locator('#dictCount').textContent(),/TDK/);await p.waitForTimeout(500);const callsAfter=searchCalls;await p.waitForTimeout(600);assert.equal(searchCalls,callsAfter);pass('Search queries the server with debouncing and shows results with the dictionary name');
 await p.locator('#dictSelect').selectOption('sozluk-b');assert.ok(await waitNode(()=>searchCalls>=callsAfter+1));pass('Switching dictionaries re-runs the search against the selected one');
 await p.unroute('**/api/v1/bilge-defter/dictionaries');await p.route('**/api/v1/bilge-defter/dictionaries',async r=>r.fulfill({status:503,contentType:'application/json',body:'{}'}));await p.locator('#dictClose').click();await openDict(p);await p.locator('#dictQuery').fill('ülser');await p.waitForFunction(()=>document.querySelector('#dictResults').textContent.length>0);assert.match(await p.locator('#dictResults').textContent(),/Sindirim/);await p.locator('#dictClose').click();pass('A failed server dictionary falls back to the embedded subset without errors');
 await ic.close();
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:results.length,results,physicalDevice:'pending'},null,2));
 }finally{await browser?.close();if(server)await new Promise(r=>server.close(r))}})().catch(e=>{console.error(e);process.exitCode=1});
