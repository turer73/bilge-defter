// Actual Chromium service-worker lifecycle, isolated loopback server and synthetic notes.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
let version='v46',broken=false,server,browser;const results=[];
const pass=s=>{results.push(s);console.log('PASS '+s)};
const root=v=>path.resolve(__dirname,'bilge-defter-invited-'+v);
async function state(p,which){return p.evaluate(which=>new Promise(async(resolve,reject)=>{
  const reg=await navigator.serviceWorker.getRegistration();const end=Date.now()+30000;
  const timer=setInterval(()=>{if(reg?.[which]?.state===(which==='waiting'?'installed':'activated')){clearInterval(timer);resolve(true)}else if(Date.now()>end){clearInterval(timer);reject(Error('Lifecycle timeout: '+which))}},50);
}),which)}
async function ready(p){await p.waitForFunction(()=>typeof ready!=='undefined'&&ready)}
async function update(p){await p.evaluate(async()=>{const reg=await navigator.serviceWorker.getRegistration();await reg.update()});await state(p,'waiting')}
async function activate(p){await p.evaluate(()=>document.querySelector('#pwaCheck').click());await p.waitForURL('**/*');await p.waitForFunction(()=>document.querySelector('.badge')?.textContent==='v47');await ready(p)}
(async()=>{try{
  for(const v of ['v46','v47']){const manifest=JSON.parse(fs.readFileSync(path.join(root(v),'offline-assets.json'),'utf8'));for(const a of manifest.files)assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root(v),a.path))).digest('hex'),a.sha256,v+' '+a.path)}pass('Both on-disk release manifests match actual bytes');
  server=http.createServer((req,res)=>{try{const url=new URL(req.url,'http://local'),name=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1)),file=path.resolve(root(version),name);if(!file.startsWith(root(version)+path.sep))throw Error();let body=fs.readFileSync(file);if(broken&&version==='v47'&&name==='pwa.js')body=Buffer.concat([body,Buffer.from('\n// deliberate synthetic corruption')]);res.writeHead(200,{'Cache-Control':'no-store','Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.wasm':'application/wasm','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream'});res.end(body)}catch{res.writeHead(404);res.end()}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({headless:true});const c=await browser.newContext({viewport:{width:1180,height:820}}),p=await c.newPage(),errors=[];
  c.on('page',page=>page.on('pageerror',e=>errors.push(e.message)));p.on('pageerror',e=>errors.push(e.message));
  await p.goto(origin);await ready(p);await state(p,'active');await p.reload();await ready(p);
  assert.equal(await p.locator('bilge-defter-ui .brand').isVisible(),true);
  await p.evaluate(async()=>{page().title='V46_SAVED_NOTE';scheduleSave();await flushSave()});
  const before=await p.evaluate(()=>JSON.stringify(state));const q=await c.newPage();await q.goto(origin);await ready(q);
  await q.evaluate(()=>document.querySelector('#textAdd').click());assert.ok(await q.evaluate(()=>!!mediaPending));
  broken=true;version='v47';
  await p.evaluate(async()=>{window.__installResult=null;const reg=await navigator.serviceWorker.getRegistration();reg.addEventListener('updatefound',()=>{const worker=reg.installing;worker.addEventListener('statechange',()=>{if(['redundant','installed'].includes(worker.state))window.__installResult=worker.state})},{once:true});await reg.update()});
  await p.waitForFunction(()=>window.__installResult!==null);assert.equal(await p.evaluate(()=>window.__installResult),'redundant');assert.equal(await p.evaluate(()=>JSON.stringify(state)),before);assert.equal(await p.evaluate(async()=>(await caches.keys()).includes('bilge-defter-test-v47')),false);pass('Corrupt v47 asset rejects update and removes partial cache; v46 note remains');
  broken=false;await update(p);assert.equal(await p.locator('.badge').textContent(),'v46');assert.ok(await q.evaluate(()=>!!mediaPending));pass('Complete v47 waits without reloading either v46 window or discarding its draft');
  await p.evaluate(()=>{window.__updateDeferred=false;navigator.serviceWorker.addEventListener('message',event=>{if(event.data?.type==='UPDATE_DEFERRED')window.__updateDeferred=true});document.querySelector('#pwaCheck').click()});
  await p.waitForFunction(()=>window.__updateDeferred);assert.equal(await p.locator('.badge').textContent(),'v46');assert.ok(await q.evaluate(()=>!!mediaPending));assert.equal(await p.evaluate(async()=>(await navigator.serviceWorker.getRegistration()).waiting?.state),'installed');pass('Explicit update is deferred while a second window holds an unfinished draft');
  await q.evaluate(()=>{document.querySelector('#layoutText').value='SECOND_WINDOW_DRAFT';document.querySelector('#layoutText').dispatchEvent(new Event('input',{bubbles:true}))});
  // The draft is intentionally cancelled in this synthetic fixture before closing.
  await q.evaluate(()=>cancelMediaMode());await q.close();
  await activate(p);assert.equal(await p.evaluate(()=>JSON.stringify(state)),before);pass('After other window closes, v46 to v47 activation preserves the complete saved notebook');
  await c.setOffline(true);await p.reload();await ready(p);assert.equal(await p.evaluate(()=>JSON.stringify(state)),before);assert.equal(await p.locator('bilge-defter-ui .brand').isVisible(),true);pass('Upgraded v47 reloads offline with the v46 notebook intact');
  await p.screenshot({path:path.resolve(__dirname,'../outputs/bilge-defter-v47-upgraded-offline.png'),fullPage:true});
  assert.deepEqual(errors,[]);await c.close();console.log(JSON.stringify({passed:results.length,failed:0,mode:'local real service worker; synthetic notes',physicalDevices:'not tested'}));
}catch(error){console.error(error);process.exitCode=1}finally{await browser?.close();if(server)await new Promise(r=>server.close(r))}})();
