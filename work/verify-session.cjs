const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/sevdi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.join(__dirname,'bilge-defter-test');const mime={'.html':'text/html','.css':'text/css','.js':'application/javascript','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml','.wasm':'application/wasm','.bcmap':'application/octet-stream','.ttf':'font/ttf','.pfb':'application/octet-stream'};
let mode='login';
async function fulfill(route){
  const url=new URL(route.request().url());
  if(url.pathname==='/api/v1/bilge-defter/whoami'){
    if(mode==='login'){await route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Cloudflare Access</title>sign in'});return}
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({identity:{type:'access',email:'user@example.com'},sync:{detail:''}})});return;
  }
  try{
    const name=decodeURIComponent(url.pathname).replace(/^\//,'')||'index.html';
    if(name.split('/').includes('..'))throw Error();
    const data=await fs.readFile(path.join(root,name));
    await route.fulfill({body:data,contentType:mime[path.extname(name)]||'application/octet-stream'});
  }catch{await route.fulfill({status:404,body:''})}
}
(async()=>{
 const browser=await chromium.launch({headless:true});const results=[],pass=s=>{results.push(s);console.log('PASS '+s)};const errors=[];
 try{
  const c=await browser.newContext({viewport:{width:1180,height:900},serviceWorkers:'block'});
  await c.route('https://defter.bilgearena.com/**',fulfill);
  const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto('https://defter.bilgearena.com/');await p.waitForFunction(()=>ready);
  await p.waitForFunction(()=>!document.querySelector('#accessSession').hidden);
  assert.match(await p.locator('#accessSession').textContent(),/Oturum kapandı/);
  assert.equal(await p.locator('#accessLoginBtn').isVisible(),true);
  pass('An expired session shows a visible Giriş yap warning without opening any dialog');
  const [popup]=await Promise.all([c.waitForEvent('page'),p.locator('#accessLoginBtn').click()]);
  assert.ok(popup.url().includes('access-login'));await popup.close();
  pass('The warning button opens the non-cached login path in a new tab');
  mode='ok';await p.evaluate(()=>window.__checkSession());await p.waitForTimeout(400);
  assert.equal(await p.locator('#accessSession').isHidden(),true);
  pass('A restored session hides the warning again');
  await p.locator('#canvas').boundingBox().then(async r=>{await p.mouse.move(r.x+80,r.y+120);await p.mouse.down();await p.mouse.move(r.x+200,r.y+130,{steps:6});await p.mouse.up()});
  await p.waitForFunction(()=>document.querySelector('#saveState').textContent.includes('kaydedildi'));
  const strokes=await p.evaluate(()=>page().strokes.length);assert.equal(strokes,1);
  pass('Notes keep working while the session warning is active');
  await c.close();
  const priv=await browser.newContext({viewport:{width:1180,height:900},serviceWorkers:'block'});
  const q=await priv.newPage();q.on('pageerror',e=>errors.push(e.message));
  const server=require('node:http').createServer(async(req,res)=>{try{const n=new URL(req.url,'http://x').pathname.slice(1)||'index.html',data=await fs.readFile(path.join(root,n));res.writeHead(200,{'Content-Type':mime[path.extname(n)]||'application/octet-stream'});res.end(data)}catch{res.writeHead(404);res.end()}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));await q.goto(`http://127.0.0.1:${server.address().port}/`);await q.waitForFunction(()=>ready);await q.waitForTimeout(500);
  assert.equal(await q.locator('#accessSession').isHidden(),true);await priv.close();server.close();
  pass('The private address never shows the session warning');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:results.length,results,physicalDevice:'pending'},null,2));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
