'use strict';
// Isolated synthetic notebooks only; never connects to the public app or student data.
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict'),{chromium,webkit}=require('playwright');
const root=path.join(__dirname,'bilge-defter-test'),out=path.join(__dirname,'../outputs/reliability-1');fs.mkdirSync(out,{recursive:true});
const origin='http://127.0.0.1:49385',results=[];
const pass=s=>{results.push(s);console.log('PASS '+s)};
async function run(engine,name){
 const browser=await engine.launch({headless:true});let server;
 try{
 const context=await browser.newContext({viewport:{width:820,height:1180},serviceWorkers:'block',acceptDownloads:true});
 const errors=[];context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
 await context.addInitScript(origin=>{if(location.origin!==origin)return;window.__accountRequired=false;localStorage.setItem('bilge_defter_onboarding_v1','true');const original=setInterval;window.__polls=[];window.setInterval=(fn,ms,...args)=>{if(ms===5000)window.__polls.push(fn);return original(fn,ms,...args)}},origin);
 let remote=null,tag='"1"',posts=0,gets=0,notModified=0,ignoreConditional=false,bad304=false,conditions=[],delayStartup=true;
 // WebKit's interception API cannot fulfill a 304; use actual HTTP for API replies.
 server=http.createServer(async(req,res)=>{
  if(req.url.endsWith('/api/v1/bilge-defter/backup')){
   const headers={'content-type':'application/json','X-Bilge-Sync-Protocol':'cas-v1',ETag:tag};
   const send=(status,body='',extra={})=>{res.writeHead(status,{...headers,...extra});res.end(body)};
   if(req.method==='POST'){posts++;const condition=req.headers['if-match'];if(remote&&condition!==tag)return send(412,'{}');let body='';for await(const chunk of req)body+=chunk;remote=JSON.parse(body);tag='"'+(posts+1)+'"';return send(200,'{}',{ETag:tag})}
   gets++;const condition=req.headers['if-none-match'];conditions.push(condition);
   if(!remote)return send(404,'{}');
   if(!ignoreConditional&&condition===tag){notModified++;return send(304,'',bad304?{ETag:'"invalid-response"'}:{})}
   return send(200,JSON.stringify(remote));
  }
  res.writeHead(404);res.end();
 });await new Promise(resolve=>server.listen(49385,'127.0.0.1',resolve));
 await context.route('**/*',async r=>{const u=new URL(r.request().url());if(u.origin!==origin)return r.abort();
  if(u.pathname.endsWith('/api/v1/bilge-defter/backup'))return r.continue();
  const f=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':u.pathname));
  if(delayStartup&&path.basename(f)==='index.html'){delayStartup=false;const html=fs.readFileSync(f,'utf8').replace('new ResizeObserver(resize).observe(canvas.parentElement);',"const startupOriginal=refreshRecovery;refreshRecovery=async()=>{await new Promise(resolve=>window.__releaseStartup=resolve);refreshRecovery=startupOriginal;return startupOriginal()};new ResizeObserver(resize).observe(canvas.parentElement);");return r.fulfill({contentType:'text/html; charset=utf-8',body:html})}
  return f.startsWith(root+path.sep)&&fs.existsSync(f)?r.fulfill({path:f}):r.fulfill({status:404,body:''});
 });
 const p=await context.newPage();await p.goto(origin);await p.waitForFunction(()=>typeof window.__releaseStartup==='function');assert.equal(await p.evaluate(()=>ready),false);await p.evaluate(()=>window.__releaseStartup());await p.waitForFunction(()=>typeof ready!=='undefined'&&ready&&window.__v2UI);pass(name+': editing only starts after asynchronous startup recovery checks finish');
 await p.evaluate(()=>{selectTool('pen');document.querySelector('#color').value='#123456';document.querySelector('#width').value=7;updateWidthPreview();selectTool('marker');document.querySelector('#color').value='#abcdef';updateWidthPreview();selectTool('eraser');setEraserSize(32);document.querySelector('#penOnly').checked=true;document.querySelector('#penOnly').dispatchEvent(new Event('change'))});
 await p.reload();await p.waitForFunction(()=>ready&&window.__v2UI);
 assert.deepEqual(await p.evaluate(()=>({tool,colors:toolColors,widths:toolWidths,palm:document.querySelector('#penOnly').checked})),{tool:'pen',colors:{pen:'#123456',marker:'#abcdef'},widths:{pen:7,marker:4,eraser:32},palm:true});pass(name+': tool preferences survive restart; startup is pen, not eraser');
 assert.equal(await p.evaluate(()=>localDiagnostics.enabled),false);
 await p.evaluate(()=>window.__syncInvited=true);await p.locator('bilge-defter-ui [data-panel="file"]').click();await p.locator('bilge-defter-ui [data-command="backup.status"]').click();await p.locator('#reliabilityDialog').waitFor();assert.ok(await p.locator('#syncUpload').isVisible());assert.ok(await p.locator('#syncUnlock').isVisible());await p.locator('#diagnosticsEnabled').check();
 await p.screenshot({path:path.join(out,name+'-status.png')});await p.locator('#reliabilityClose').click();pass(name+': real file menu opens status and diagnostics without importing a file');
 await p.evaluate(()=>{document.querySelector('#diagnosticsEnabled').checked=true;document.querySelector('#diagnosticsEnabled').dispatchEvent(new Event('change'));for(let i=0;i<230;i++)drawAll()});
 assert.equal(await p.evaluate(()=>localDiagnostics.drawMs.length),200);
 const diagnosticDownload=p.waitForEvent('download');await p.evaluate(()=>document.querySelector('#diagnosticsExport').click());const dd=await diagnosticDownload;await dd.saveAs(path.join(out,name+'-timings.json'));
 const report=JSON.parse(fs.readFileSync(path.join(out,name+'-timings.json'),'utf8'));assert.deepEqual(Object.keys(report).sort(),['drawMs','format','penCancels','penStarts','saveMs'].sort());pass(name+': opt-in diagnostics are bounded and contain no notebook/identity/coordinates');
 await p.evaluate(()=>{window.__syncInvited=true;renderSyncActions();document.querySelector('#syncUnlock').click()});
 await p.locator('#syncPassInput').fill('synthetic-pass-123');await p.locator('#syncPassSubmit').click();await p.waitForFunction(()=>document.querySelector('#syncAutoStatus').textContent.includes('Eşitleme açık'));
 // Visibility wake forces an idle check without shortening production backoff.
 const poll=async()=>{await p.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await p.waitForTimeout(800)};
 await poll();await p.waitForFunction(()=>document.querySelector('#syncAutoStatus').textContent.includes('son:'));
 assert.equal(posts,1);assert.ok(remote.ciphertext);await poll();await poll();assert.ok(notModified>=1);assert.ok(conditions.includes(tag));assert.equal(posts,1);pass(name+': unchanged encrypted backup returns 304 without duplicate upload');
 ignoreConditional=true;await poll();assert.equal(posts,1);pass(name+': old backend ignoring If-None-Match remains compatible');ignoreConditional=false;
 const backedOff=gets;await p.evaluate(()=>{for(const fn of window.__polls)fn()});await p.waitForTimeout(100);assert.equal(gets,backedOff);pass(name+': idle polling backs off instead of requesting every interval');
 bad304=true;await poll();assert.match(await p.locator('#syncAutoStatus').textContent(),/sürüm koruması/);assert.equal(posts,1);bad304=false;await poll();assert.match(await p.locator('#syncAutoStatus').textContent(),/Eşitleme açık/);pass(name+': malformed 304 fails closed and a valid retry clears the temporary warning');
 const before=gets;await p.evaluate(()=>{drawing=true});await poll();assert.equal(gets,before);await p.evaluate(()=>{drawing=false});pass(name+': active ink suppresses sync requests');
 // Stale remote tag must not bypass conflict detection, even with conditional cache.
 tag='"remote-other"';await p.evaluate(()=>{page().title='local synthetic change';markChanged()});await p.evaluate(()=>flushSave());await poll();
 assert.equal(await p.locator('#syncConflictBanner').getAttribute('data-open'),'1');assert.equal(posts,1);await p.locator('#syncConflictHold').click();pass(name+': concurrent remote/local edits still stop for explicit conflict resolution');
 // Exact boundary uses encoded UTF-8 + 16-byte AES-GCM tag, before crypto/upload.
 await p.evaluate(()=>{state.pages[0].title='ö'.repeat(2700000);markChanged()});await p.evaluate(()=>flushSave());
 await p.evaluate(()=>document.querySelector('#syncUpload').click());await p.locator('#syncPassInput').fill('synthetic-pass-123');await p.locator('#syncPassConfirm').fill('synthetic-pass-123');await p.locator('#syncPassSubmit').click();
 await p.waitForFunction(()=>document.querySelector('#syncStatus').textContent.includes('5 MiB'));assert.equal(posts,1);pass(name+': oversize UTF-8 notebook blocked locally before encrypted upload');
 await p.evaluate(()=>{state.pages[0].title='Synthetic';markChanged()});await p.evaluate(()=>flushSave());
 // Seed unreadable schema; reload must not mutate or delete it.
 await p.evaluate(()=>new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put({broken:'synthetic sentinel'},'app');tx.oncomplete=resolve;tx.onabort=reject}));
 await p.reload();await p.locator('#startupRecovery').waitFor();assert.equal(await p.evaluate(()=>ready),false);
 assert.deepEqual(await p.evaluate(()=>dbGet()),{broken:'synthetic sentinel'});
 const recovered=p.waitForEvent('download');await p.locator('#rawRecoveryExport').click();const rd=await recovered;await rd.saveAs(path.join(out,name+'-recovery.json'));
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(out,name+'-recovery.json'),'utf8')).records.app,{broken:'synthetic sentinel'});
 assert.deepEqual(await p.evaluate(()=>dbGet()),{broken:'synthetic sentinel'});assert.equal(await p.getByText('Yeni defter başlat',{exact:true}).count(),0);
 await p.screenshot({path:path.join(out,name+'-recovery.png')});
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);pass(name+': invalid startup record exported without deletion or viewport overflow');
 await p.setViewportSize({width:390,height:844});await p.screenshot({path:path.join(out,name+'-recovery-mobile.png')});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.ok(await p.locator('#rawRecoveryExport').isVisible());pass(name+': recovery remains usable at 390 px');
 assert.deepEqual(errors,[]);await context.close();
 }finally{await browser.close();if(server)await new Promise(resolve=>server.close(resolve))}
}
(async()=>{for(const [name,engine] of [['chromium',chromium],['webkit',webkit]])await run(engine,name);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({passed:results.length,results,realDevice:false},null,2))})().catch(e=>{console.error(e);process.exitCode=1});
