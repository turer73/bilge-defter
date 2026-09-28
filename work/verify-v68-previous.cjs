'use strict';
// v68: the server keeps the encrypted copy the latest upload replaced. "Önceki sunucu kopyası"
// opens it through the normal backup preview; nothing changes until the student applies it.
// With sync on, the restored notebook is uploaded and the copy it replaced becomes the new
// previous copy, so a restore can itself be undone. In-memory CAS server with one previous
// generation (same rule as server-candidate/v49 bilge_defter_store.write). No iPad.
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),{chromium,webkit}=require('playwright');
const root=path.resolve(process.env.BILGE_TEST_ROOT||path.join(__dirname,'bilge-defter-invited-v68'));
const out=path.resolve(process.env.BILGE_TEST_OUTPUT||path.join(__dirname,'../outputs/v68-previous'));
const origin='http://127.0.0.1:49395';fs.mkdirSync(out,{recursive:true});
const results=[];const pass=s=>{results.push(s);console.log('PASS '+s)};
const PASS='sentetik-parola-123',enc=new TextEncoder(),dec=new TextDecoder();
const b64=b=>Buffer.from(b).toString('base64'),fromB64=s=>Uint8Array.from(Buffer.from(s,'base64'));
async function key(salt,p=PASS){const km=await crypto.subtle.importKey('raw',enc.encode(p),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:250000,hash:'SHA-256'},km,{name:'AES-GCM',length:256},false,['encrypt','decrypt'])}
async function encrypt(book,updatedAt){const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(salt),enc.encode(JSON.stringify(book)));return {ciphertext:b64(new Uint8Array(ct)),iv:b64(iv),salt:b64(salt),kdf:'pbkdf2-sha256-250000',updated_at:updatedAt}}
async function decrypt(data){return JSON.parse(dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:fromB64(data.iv)},await key(fromB64(data.salt)),fromB64(data.ciphertext))))}
const book=(title,strokes)=>({version:1,pages:[{id:'p-'+title,title,strokes:Array.from({length:strokes},(_,i)=>({tool:'pen',color:'#173b36',width:2,points:[{x:40+i,y:60},{x:120,y:64+i}]})),updated:'2026-09-20T09:00:00.000Z'}],active:'p-'+title});
async function session(browser,server){
 const context=await browser.newContext({viewport:{width:1180,height:820},serviceWorkers:'block'}),errors=[];
 context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
 await context.addInitScript(o=>{if(location.origin===o){window.__accountRequired=false;localStorage.setItem('bilge_defter_onboarding_v1','true')}},origin);
 await context.route('**/*',async r=>{
  const u=new URL(r.request().url());if(u.origin!==origin)return r.abort();
  const headers={'X-Bilge-Sync-Protocol':'cas-v1',...(server.tag?{ETag:server.tag}:{})};
  const json=(status,body,extra={})=>r.fulfill({status,headers:{...headers,...extra},contentType:'application/json',body:JSON.stringify(body)});
  if(u.pathname.endsWith('/api/v1/bilge-defter/backup/previous')){server.previousGets++;return server.previous?json(200,server.previous):json(404,{detail:'Sunucuda onceki yedek yok'})}
  if(u.pathname.endsWith('/api/v1/bilge-defter/backup')){
   if(r.request().method()==='POST'){
    const h=r.request().headers();
    if(server.remote&&h['if-match']!==server.tag)return json(412,{});
    if(!server.remote&&h['if-none-match']!=='*')return json(412,{});
    if(server.remote)server.previous={...server.remote,replaced_at:'2026-09-28T12:00:00'};
    server.posts++;server.remote=JSON.parse(r.request().postData());server.tag=`"${server.posts+10}"`;
    return json(200,{status:'ok'},{ETag:server.tag});
   }
   return server.remote?json(200,server.remote):json(404,{});
  }
  const f=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));
  return f.startsWith(root+path.sep)&&fs.existsSync(f)?r.fulfill({path:f}):r.fulfill({status:404,body:''});
 });
 const p=await context.newPage();await p.goto(origin);await p.waitForFunction(()=>typeof ready!=='undefined'&&ready&&window.__v2UI);
 await p.evaluate(()=>{window.__syncInvited=true});
 return {context,p,errors};
}
const stroke=(p,x)=>p.locator('#canvas').evaluate((c,x)=>{const r=c.getBoundingClientRect();for(const [type,dx] of [['pointerdown',0],['pointermove',40],['pointerup',80]])c.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:7,pointerType:'pen',clientX:r.x+x+dx,clientY:r.y+200,buttons:type==='pointerup'?0:1,pressure:.5}))},x);
const settled=p=>p.waitForFunction(()=>!isDirty()&&!savePromise,null,{timeout:10000});
async function openStatus(p){await p.locator('bilge-defter-ui [data-panel="file"]').click();await p.locator('bilge-defter-ui [data-command="backup.status"]').click();await p.locator('#reliabilityDialog').waitFor();await p.evaluate(()=>renderSyncActions())}
async function askPrevious(p,pass=PASS){await p.locator('#syncPrevious').click();await p.locator('#syncPassInput').fill(pass);await p.locator('#syncPassSubmit').click()}
const disk=p=>p.evaluate(async()=>{const d=await dbGet();return d.pages.map(x=>`${x.title}:${x.strokes.length}`)});
async function run(browser,name){
 {// S1: previous copy exists; preview, then apply; sync off -> nothing is uploaded.
  const server={remote:await encrypt(book('Yeni',1),'2026-09-28T11:00:00.000Z'),previous:{...await encrypt(book('Eski',3),'2026-09-27T10:00:00.000Z'),replaced_at:'2026-09-28T11:00:05'},tag:'"1"',posts:0,previousGets:0};
  const {context,p,errors}=await session(browser,server);
  await stroke(p,100);await settled(p);const before=await disk(p);
  await openStatus(p);assert.equal(await p.locator('#syncPrevious').isVisible(),true);
  await askPrevious(p);await p.locator('#backupDialog').waitFor({state:'visible'});
  assert.match(await p.locator('#backupFileName').textContent(),/^Önceki sunucu kopyası \(2026-09-27T10:00:00\.000Z; yerine yenisi 2026-09-28T11:00:05 tarihinde yazıldı\)$/);
  assert.match(await p.locator('#backupPages').textContent(),/Eski — 3 çizgi/);
  assert.deepEqual(await disk(p),before,'preview must not change the notebook');
  await p.screenshot({path:path.join(out,`${name}-preview.png`)});
  await p.evaluate(()=>{window.confirm=()=>true});await p.locator('#backupApply').click();
  await p.waitForFunction(()=>page()?.title==='Eski',null,{timeout:10000});await settled(p);
  assert.deepEqual(await disk(p),['Eski:3']);assert.equal(server.posts,0);assert.equal(server.previousGets,1);
  pass(`${name}: the previous server copy opens in the backup preview and replaces the notebook only after Apply`);
  assert.deepEqual(errors,[]);await context.close();}
 {// S2: no previous copy, S3: wrong passphrase -> clear message, notebook unchanged.
  const server={remote:await encrypt(book('Yeni',1),'2026-09-28T11:00:00.000Z'),previous:null,tag:'"1"',posts:0,previousGets:0};
  const {context,p,errors}=await session(browser,server);
  await stroke(p,100);await settled(p);const before=await disk(p);
  await openStatus(p);await askPrevious(p);
  await p.waitForFunction(()=>document.querySelector('#syncStatus').textContent.includes('Sunucuda önceki kopya yok'));
  assert.equal(await p.locator('#backupDialog').isVisible(),false);assert.deepEqual(await disk(p),before);
  server.previous={...await encrypt(book('Eski',3),'2026-09-27T10:00:00.000Z'),replaced_at:'2026-09-28T11:00:05'};
  await askPrevious(p,'yanlis-parola-999');
  await p.waitForFunction(()=>document.querySelector('#syncStatus').textContent.includes('Parola yanlış'));
  assert.equal(await p.locator('#backupDialog').isVisible(),false);assert.deepEqual(await disk(p),before);assert.equal(server.posts,0);
  pass(`${name}: with no previous copy or a wrong passphrase the student gets a clear message and the notebook is unchanged`);
  assert.deepEqual(errors,[]);await context.close();}
 {// S4: sync on; restoring the previous copy uploads it and the copy it replaced becomes the new previous.
  const server={remote:null,previous:null,tag:null,posts:0,previousGets:0};
  const {context,p,errors}=await session(browser,server);
  await stroke(p,100);await settled(p);
  await openStatus(p);await p.locator('#syncUnlock').click();await p.locator('#syncPassInput').fill(PASS);await p.locator('#syncPassSubmit').click();
  await p.waitForFunction(()=>document.querySelector('#syncAutoStatus').textContent.includes('Eşitleme açık'));await p.locator('#reliabilityClose').click();
  const poll=async()=>{await p.evaluate(()=>{nextPollAt=0;document.dispatchEvent(new Event('visibilitychange'))});await p.waitForTimeout(700)};
  await poll();await p.waitForFunction(()=>document.querySelector('#syncAutoStatus').textContent.includes('son:'),null,{timeout:10000});
  assert.equal(server.posts,1);
  await stroke(p,300);await settled(p);await poll();await p.waitForFunction(()=>!document.querySelector('#syncAutoStatus').textContent.includes('değişiklikler var'),null,{timeout:10000});
  assert.equal(server.posts,2);assert.equal((await decrypt(server.previous)).pages[0].strokes.length,1);
  // The second upload was a mistake: restore the previous copy (1 stroke).
  await openStatus(p);await askPrevious(p);await p.locator('#backupDialog').waitFor({state:'visible'});
  await p.evaluate(()=>{window.confirm=()=>true});await p.locator('#backupApply').click();
  await p.waitForFunction(()=>page()?.strokes.length===1,null,{timeout:10000});await settled(p);
  // Sync never acts while a dialog is open; the status window is still open behind the preview.
  const held=server.posts;await poll();assert.equal(server.posts,held,'no upload while the status window is open');
  if(await p.locator('#reliabilityDialog').isVisible())await p.locator('#reliabilityClose').click();
  await poll();await p.waitForFunction(()=>!document.querySelector('#syncAutoStatus').textContent.includes('değişiklikler var'),null,{timeout:10000});
  assert.equal(server.posts,3);assert.equal((await decrypt(server.remote)).pages[0].strokes.length,1);assert.equal((await decrypt(server.previous)).pages[0].strokes.length,2);
  assert.equal(await p.evaluate(()=>document.querySelector('#syncConflictBanner').dataset.open==='1'),false);
  pass(`${name}: with sync on, a restored previous copy is uploaded and the copy it replaced becomes the previous copy`);
  assert.deepEqual(errors,[]);await context.close();}
}
(async()=>{
 for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){const browser=await engine.launch({headless:true});try{await run(browser,name)}finally{await browser.close()}}
 fs.writeFileSync(path.join(out,'previous-tests.json'),JSON.stringify({passed:results.length,results,synthetic:true,realDevice:false},null,2));
 console.log(JSON.stringify({passed:results.length,failed:0}));
})().catch(e=>{console.error(e);process.exit(1)});
