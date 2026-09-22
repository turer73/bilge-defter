const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/sevdi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
let browser,server;const results=[],pass=s=>{results.push(s);console.log('PASS '+s)};
const PASS='test-parola-123';
const bookA={version:1,pages:[{id:'p1',title:'Birinci',strokes:[],updated:'2026-09-22T10:00:00Z'}],active:'p1'};
const bookB={version:1,pages:[{id:'p1',title:'Birinci',strokes:[],updated:'2026-09-22T10:00:00Z'},{id:'p2',title:'Sunucudan gelen',strokes:[],updated:'2026-09-22T11:00:00Z'}],active:'p1'};
async function encryptNode(obj,updatedAt){
  const enc=new TextEncoder();
  const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
  const km=await crypto.subtle.importKey('raw',enc.encode(PASS),'PBKDF2',false,['deriveKey']);
  const key=await crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:250000,hash:'SHA-256'},km,{name:'AES-GCM',length:256},false,['encrypt']);
  const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,enc.encode(JSON.stringify(obj)));
  const b64=b=>Buffer.from(b).toString('base64');
  return {ciphertext:b64(new Uint8Array(ct)),iv:b64(iv),salt:b64(salt),kdf:'pbkdf2-sha256-250000',updated_at:updatedAt};
}
(async()=>{try{
 server=http.createServer(async(req,res)=>{try{const n=new URL(req.url,'http://local').pathname.slice(1)||'index.html',data=await fs.readFile(path.join(__dirname,'bilge-defter-invited-v38',n));res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm'})[path.extname(n)]||'application/octet-stream'});res.end(data)}catch{res.writeHead(404);res.end()}});await new Promise(r=>server.listen(0,'0.0.0.0',r));
 const port=server.address().port;
 async function saved(p){await p.waitForFunction(()=>!isDirty()&&!savePromise&&!saveFailed&&!saveConflict)}
 async function waitNode(cond,ms=20000){const end=Date.now()+ms;while(Date.now()<end){if(await cond())return true;await new Promise(r=>setTimeout(r,400))}return false}
 async function draw(p){const r=await p.locator('#canvas').boundingBox();await p.mouse.move(r.x+80,r.y+90);await p.mouse.down();await p.mouse.move(r.x+220,r.y+110,{steps:6});await p.mouse.up();await saved(p)}
 async function unlock(p){await p.locator('#syncUnlock').click();await p.locator('#syncPassDialog').waitFor({state:'visible'});await p.locator('#syncPassInput').fill(PASS);await p.locator('#syncPassSubmit').click()}
 browser=await chromium.launch({headless:true});const errors=[];
 const dc=await browser.newContext({viewport:{width:1180,height:820}}),d=await dc.newPage();d.on('pageerror',e=>errors.push(e.message));await d.goto(`http://127.0.0.1:${port}/`);await d.waitForFunction(()=>ready);
 await d.locator('#importFile').setInputFiles({name:'b.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bookA))});await d.locator('#backupDialog').waitFor({state:'visible'});assert.equal(await d.locator('#syncUnlock').isVisible(),false);assert.match(await d.locator('#syncAutoStatus').textContent(),/yalnız defter\.bilgearena\.com/);await d.locator('#backupCancel').click();await dc.close();pass('Private origin hides the sync unlock and explains the invited-only rule');
 const ic=await browser.newContext({viewport:{width:1180,height:820}});const p=await ic.newPage();p.on('pageerror',e=>{errors.push(e.message);console.log('PAGEERR:',e.message)});p.on('framenavigated',f=>console.log('NAV:',f.url()));
 let serverState=null,uploads=0;
 await p.route('**/api/v1/bilge-defter/whoami',async r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({identity:{type:'access',email:'user@example.com'},sync:{status:'hazirlik',detail:'x'}})}));
 await p.route('**/api/v1/bilge-defter/backup',async r=>{if(r.request().method()==='POST'){uploads++;serverState=JSON.parse(r.request().postData());await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({status:'ok',bytes:1,stored_at:'x'})})}else{if(serverState){await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(serverState)})}else{await r.fulfill({status:404,contentType:'application/json',body:JSON.stringify({detail:'Sunucuda yedek yok'})})}}});
 await p.goto(`http://127.0.0.1:${port}/`);await p.waitForFunction(()=>ready);await p.evaluate(()=>window.__syncInvited=true);
 await p.locator('#importFile').setInputFiles({name:'b.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bookA))});await p.locator('#backupDialog').waitFor({state:'visible'});await p.locator('#syncUnlock').click();await p.locator('#syncPassDialog').waitFor({state:'visible'});await p.locator('#syncPassInput').fill(PASS);await p.locator('#syncPassSubmit').click();await p.waitForFunction(()=>document.querySelector('#syncAutoStatus').textContent.includes('Eşitleme açık'));await p.locator('#backupCancel').click();pass('Unlock enables session sync with the passphrase and a visible open state');
 await draw(p);assert.ok(await waitNode(()=>uploads>=1));assert.ok(serverState.ciphertext&&serverState.iv&&serverState.salt);assert.equal(JSON.stringify(serverState).includes('"pages"'),false);const meta=await p.evaluate(()=>JSON.parse(localStorage.getItem('bilge-defter-sync-meta-v1')));assert.ok(meta.lastSyncAt);pass('A saved edit is pushed automatically, encrypted, and the sync timestamp is persisted');
 serverState=await encryptNode(bookB,'2099-01-01T00:00:00Z');assert.ok(await waitNode(async()=> (await p.evaluate(async()=> (await dbGet()).pages.map(x=>x.title))).includes('Sunucudan gelen')));assert.deepEqual((await p.evaluate(()=>dbGet())).pages.map(x=>x.title),['Birinci','Sunucudan gelen']);pass('A newer server copy is pulled and applied automatically when the device is clean');
 serverState=await encryptNode(bookB,'2099-02-01T00:00:00Z');await p.waitForFunction(()=>!isDirty()&&!savePromise);await draw(p);assert.ok(await waitNode(async()=> !(await p.locator('#syncConflictBanner').evaluate(b=>b.hidden))));assert.match(await p.locator('#syncConflictBanner').textContent(),/çakışma/);await p.locator('#syncConflictLocal').click();assert.ok(await waitNode(()=>uploads>=2));assert.ok(serverState.updated_at!=='2099-02-01T00:00:00Z');assert.equal(await p.locator('#syncConflictBanner').evaluate(b=>b.hidden),true);pass('Concurrent edits raise a conflict banner and choosing local pushes this device over the server copy');
 serverState=await encryptNode(bookB,'2099-03-01T00:00:00Z');await p.waitForFunction(()=>!isDirty()&&!savePromise);await draw(p);assert.ok(await waitNode(async()=> !(await p.locator('#syncConflictBanner').evaluate(b=>b.hidden))));await p.locator('#syncConflictServer').click();assert.ok(await waitNode(async()=> (await p.locator('#saveState').textContent())==='Sunucudan eşitlendi'));assert.deepEqual((await p.evaluate(()=>dbGet())).pages.map(x=>x.title),['Birinci','Sunucudan gelen']);pass('Choosing the server copy applies it and replaces the local draft');
 await ic.close();
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:results.length,results,physicalDevice:'pending'},null,2));
 }finally{await browser?.close();if(server)await new Promise(r=>server.close(r))}})().catch(e=>{console.error(e);process.exitCode=1});
