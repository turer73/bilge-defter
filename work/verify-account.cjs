const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/sevdi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
let browser,server;const results=[],pass=s=>{results.push(s);console.log('PASS '+s)};
(async()=>{try{
 server=http.createServer(async(req,res)=>{try{const n=new URL(req.url,'http://local').pathname.slice(1)||'index.html',data=await fs.readFile(path.join(__dirname,'bilge-defter-invited-v43',n));res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm'})[path.extname(n)]||'application/octet-stream'});res.end(data)}catch{res.writeHead(404);res.end()}});await new Promise(r=>server.listen(0,'0.0.0.0',r));
 const port=server.address().port,origin=process.env.BILGE_TEST_ORIGIN||`http://127.0.0.1:${port}`;
 async function openAccount(p){await p.locator('#toolsToggle').click();await p.locator('#pwaOpen').click();await p.locator('#pwaDialog').waitFor()}
 let calls=0;
 const mockWhoami=(p,status,body)=>p.route('**/api/v1/bilge-defter/whoami',async route=>{calls++;await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)})});
 browser=await chromium.launch({headless:true});const errors=[];const c=await browser.newContext({viewport:{width:1180,height:820}}),p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(origin);await p.waitForFunction(()=>ready);
 await openAccount(p);assert.match(await p.locator('#pwaAccount').textContent(),/Özel adres/);assert.equal(calls,0);await p.locator('#pwaClose').click();pass('Private origin shows the device identity without any whoami request');
 await c.close();
 const invitedBrowser=await chromium.launch({headless:true,args:['--host-resolver-rules=MAP defter.bilgearena.com 127.0.0.1']});const ic=await invitedBrowser.newContext({viewport:{width:1180,height:820}});const q=await ic.newPage();q.on('pageerror',e=>errors.push(e.message));
 await mockWhoami(q,200,{identity:{type:'access',email:'user@example.com'},sync:{status:'hazirlik',detail:'Eşitleme sonraki dilimde; notlar sunucuya gönderilmez.'}});
 await q.goto(`http://defter.bilgearena.com:${port}/`);await q.waitForFunction(()=>ready);
 await openAccount(q);assert.match(await q.locator('#pwaAccount').textContent(),/user@example\.com/);assert.match(await q.locator('#pwaAccount').textContent(),/Cloudflare Access/);assert.match(await q.locator('#pwaAccount').textContent(),/sonraki dilim/);await q.locator('#pwaClose').click();pass('Invited origin verifies the Access email and shows it with the sync status');
 await q.unroute('**/api/v1/bilge-defter/whoami');calls=0;console.log('t3 route kuruldu');await mockWhoami(q,401,{detail:'no'});console.log('t3 open hesap');await openAccount(q);await q.waitForFunction(()=>document.querySelector('#pwaAccount').textContent.includes('denetlenemedi'));assert.match(await q.locator('#pwaAccount').textContent(),/denetlenemedi/);await q.locator('#pwaClose').click();pass('A rejected whoami shows the honest fallback and never claims a server identity');
 await q.unroute('**/api/v1/bilge-defter/whoami');await mockWhoami(q,200,{identity:{type:'device',name:'ozel-adres'},sync:{status:'devre-disi',detail:'x'}});await openAccount(q);await q.waitForFunction(()=>document.querySelector('#pwaAccount').textContent.includes('Kimlik alınamadı'));assert.match(await q.locator('#pwaAccount').textContent(),/Kimlik alınamadı/);await q.locator('#pwaClose').click();pass('A device-typed response on the invited origin is reported as missing identity');
 await invitedBrowser.close();
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:results.length,results,physicalDeviceLogin:'pending'},null,2));
 }finally{await browser?.close();if(server)await new Promise(r=>server.close(r))}})().catch(e=>{console.error(e);process.exitCode=1});
