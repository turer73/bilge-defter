// Real Chromium service-worker lifecycle v58 -> v59: a library window never holds the
// explicit update, a second notebook window still does, and a failed library load
// offers the way back. Isolated loopback server, synthetic notes.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
let version='v58',libraryMode='ok',server,browser;const results=[];
const pass=s=>{results.push(s);console.log('PASS '+s)};
const root=v=>path.resolve(__dirname,'bilge-defter-invited-'+v);
const libraryHtml='<!doctype html><html lang="tr"><meta charset="utf-8"><title>Kütüphane</title><body><a class="notebook-return" href="/" target="_self">← Deftere dön</a><h1 id="library">Synthetic library</h1></body></html>';
const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.wasm':'application/wasm','.svg':'image/svg+xml'};
async function waitState(p,which){return p.evaluate(which=>new Promise(async(resolve,reject)=>{
  const reg=await navigator.serviceWorker.getRegistration();const end=Date.now()+30000;
  const timer=setInterval(()=>{if(reg?.[which]?.state===(which==='waiting'?'installed':'activated')){clearInterval(timer);resolve(true)}else if(Date.now()>end){clearInterval(timer);reject(Error('Lifecycle timeout: '+which))}},50);
}),which)}
async function ready(p){await p.waitForFunction(()=>typeof ready!=='undefined'&&ready)}
(async()=>{try{
  for(const v of ['v58','v59']){const manifest=JSON.parse(fs.readFileSync(path.join(root(v),'offline-assets.json'),'utf8'));for(const a of manifest.files)assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root(v),a.path))).digest('hex'),a.sha256,v+' '+a.path)}pass('Both on-disk release manifests match actual bytes');
  server=http.createServer((req,res)=>{try{
    const url=new URL(req.url,'http://local');
    if(url.pathname==='/library'||url.pathname.startsWith('/library/')){
      if(libraryMode==='reset'){req.socket.destroy();return}
      if(libraryMode==='down'){res.writeHead(502,{'Content-Type':'text/html'});res.end('<h1>502 Bad Gateway</h1>');return}
      if(libraryMode==='auth'){res.writeHead(401,{'Content-Type':'application/json'});res.end('{"error":"E-posta ile giriş gerekli."}');return}
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(libraryHtml);return;
    }
    const name=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1)),file=path.resolve(root(version),name);
    if(!file.startsWith(root(version)+path.sep))throw Error();
    res.writeHead(200,{'Cache-Control':'no-store','Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(fs.readFileSync(file));
  }catch{res.writeHead(404);res.end()}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({headless:true});const c=await browser.newContext({viewport:{width:1180,height:820}}),p=await c.newPage(),errors=[];
  c.on('page',page=>page.on('pageerror',e=>errors.push(e.message)));p.on('pageerror',e=>errors.push(e.message));
  await p.goto(origin);await ready(p);await waitState(p,'active');await p.reload();await ready(p);
  await p.evaluate(async()=>{page().title='V58_BEFORE_V59';scheduleSave();await flushSave()});
  const before=await p.evaluate(()=>JSON.stringify(state));
  const lib=await c.newPage();await lib.goto(origin+'/library/');await lib.locator('#library').waitFor();
  assert.ok(await lib.evaluate(()=>!!navigator.serviceWorker.controller));
  const second=await c.newPage();await second.goto(origin);await ready(second);
  version='v59';await p.evaluate(async()=>{const reg=await navigator.serviceWorker.getRegistration();await reg.update()});await waitState(p,'waiting');
  await p.evaluate(()=>{window.__updateDeferred=false;navigator.serviceWorker.addEventListener('message',event=>{if(event.data?.type==='UPDATE_DEFERRED')window.__updateDeferred=true});document.querySelector('#pwaCheck').click()});
  await p.waitForFunction(()=>window.__updateDeferred);assert.equal(await p.locator('.badge').textContent(),'v58');
  assert.equal(await p.evaluate(async()=>(await navigator.serviceWorker.getRegistration()).waiting?.state),'installed');pass('A second notebook window still defers the explicit update');
  await second.close();
  await p.evaluate(()=>{window.__updateDeferred=false;document.querySelector('#pwaCheck').click()});
  await p.waitForURL('**/*');await p.waitForFunction(()=>document.querySelector('.badge')?.textContent==='v59');await ready(p);
  assert.equal(await p.evaluate(()=>JSON.stringify(state)),before);assert.equal(await lib.locator('#library').isVisible(),true);
  pass('An open library window does not hold the update; the v58 notebook is intact in v59');
  libraryMode='down';let response=await lib.goto(origin+'/library/');assert.equal(response.status(),503);
  await lib.getByText('Kütüphane şu an açılamadı').waitFor();assert.equal(await lib.locator('a.notebook-return').getAttribute('href'),origin+'/');
  assert.equal(await lib.evaluate(async()=>(await fetch('/library/api/catalog')).status),502);
  pass('A failing library page is replaced by a return page; library API errors pass through unchanged');
  libraryMode='auth';response=await lib.goto(origin+'/library/');assert.equal(response.status(),401);
  await lib.getByText('oturum doğrulanamadı',{exact:false}).waitFor();pass('A rejected library session shows the return page instead of raw JSON');
  libraryMode='reset';response=await lib.goto(origin+'/library/');assert.equal(response.status(),503);
  await lib.locator('a.notebook-return').click();await lib.waitForURL(origin+'/');await ready(lib);
  assert.equal(await lib.evaluate(()=>JSON.stringify(state)),before);pass('Network failure on the way to the library still leads back to the saved notebook');
  libraryMode='ok';
  assert.deepEqual(errors,[]);await c.close();console.log(JSON.stringify({passed:results.length,failed:0,mode:'local real service worker; synthetic notes',physicalDevices:'not tested'}));
}catch(error){console.error(error);process.exitCode=1}finally{await browser?.close();if(server)await new Promise(r=>server.close(r))}})();
