const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/sevdi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
let browser,server,version='v22';
(async()=>{try{
server=http.createServer(async(req,res)=>{try{const name=new URL(req.url,'http://local').pathname.slice(1)||'index.html';const data=await fs.readFile(name==='icons/update-check-v2.html'?path.join(__dirname,'update-check-v2.html'):path.join(__dirname,'bilge-defter-invited-'+version,name));res.writeHead(200,{'Cache-Control':'no-store','Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm'})[path.extname(name)]||'application/octet-stream'});res.end(data)}catch{res.writeHead(404);res.end()}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
browser=await chromium.launch({headless:true});const c=await browser.newContext(),p=await c.newPage();const origin=`http://127.0.0.1:${server.address().port}`;await p.goto(origin);await p.evaluate(()=>navigator.serviceWorker.ready);await p.reload();await p.waitForFunction(()=>ready);assert.match(await p.locator('.badge').textContent(),/v22/);await p.locator('#toolsToggle').click();await p.locator('#pwaOpen').click();
for(version of ['v23','v24']){
 await p.evaluate(()=>{window.updateStates=[];navigator.serviceWorker.getRegistration().then(r=>r.addEventListener('updatefound',()=>{const w=r.installing;w.addEventListener('statechange',()=>window.updateStates.push(w.state))},{once:true}))});
 await p.locator('#pwaCheck').click();await p.waitForFunction(()=>window.updateStates.includes('installed')||window.updateStates.includes('redundant'));await p.waitForFunction(()=>!document.querySelector('#pwaCheck').disabled);
 console.log(JSON.stringify(await p.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();return {version:document.querySelector('#pwaVersion').textContent,message:document.querySelector('#pwaUpdate').textContent,active:r.active?.state,waiting:r.waiting?.state,installing:r.installing?.state,states:window.updateStates,caches:await caches.keys()}})));
}
await p.screenshot({path:path.join(__dirname,'update-chain-v22.png')});
await p.goto(origin+'/icons/update-check-v2.html');await p.locator('#run').click();await p.waitForFunction(()=>!document.querySelector('#run').disabled);const report=await p.locator('#result').textContent();assert.match(report,/v24 önbelleği: 212\/212/);assert.match(report,/bekleyen=installed/);console.log(report);
}finally{await browser?.close();if(server)await new Promise(r=>server.close(r))}})().catch(e=>{console.error(e);process.exitCode=1});
