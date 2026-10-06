'use strict';
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),{execFileSync}=require('child_process'),{chromium,webkit}=require('playwright');
const root=path.resolve(process.env.BILGE_TEST_ROOT||path.join(__dirname,'bilge-defter-invited-v55')),dev=process.env.BILGE_TEST_ROOT?root:path.join(__dirname,'bilge-defter-test'),lib=path.join(__dirname,'library-pilot'),origin='http://127.0.0.1:49358',out=path.join(__dirname,'../outputs/library-quote');
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',token='33333333-3333-4333-8333-333333333333',key='bilge-library-quote:'+token;
const bundledPython=path.join(process.env.USERPROFILE||'', '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
const python=process.env.PYTHON||(process.platform==='win32'?(fs.existsSync(bundledPython)?bundledPython:'python'):'python3');
const html=execFileSync(python,['-c',`from textview import render_text; print(render_text({'id':'test-book','title':'Anatomy Example','authors':'Example Author','publisher':'Example Publisher','license':'CC BY','url':'https://example.org/book','license_url':'https://example.org/license','page_data':[{'text':'Heart and circulation.\\nKalp ve dolaşım.','label':'iv'}]},1,'${A}'))`],{cwd:lib,encoding:'utf8',env:{...process.env,PYTHONIOENCODING:'utf-8'}});
fs.mkdirSync(out,{recursive:true});
(async()=>{const results=[];
for(const [engine,name] of [[chromium,'chromium'],[webkit,'webkit']]){
 const browser=await engine.launch({headless:true});
 try{for(const width of [390,820]){
  let who=A;const errors=[],dialogs=[];
  const c=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block'}),p=await c.newPage();
  p.on('pageerror',e=>errors.push(e.message));p.on('dialog',async d=>{dialogs.push(d.message());await d.accept();});
  await c.addInitScript(()=>{window.__accountRequired=true;if(location.protocol==='http:')localStorage.setItem('bilge_defter_onboarding_v1','true');});
  await c.route('**/*',r=>{
   const u=new URL(r.request().url());assert.equal(u.origin,origin,'No external requests');
   if(u.pathname==='/api/v1/bilge-defter/whoami')return r.fulfill({json:{account_protocol:'approval-v1',identity:{type:'access',id:who,status:'approved',role:'student',email:'fixture@example.org'}}});
   if(u.pathname==='/library/api/session')return r.fulfill({json:{id:who,hosted:true}});
   if(u.pathname==='/library/read/test-book/1')return r.fulfill({contentType:'text/html',body:html});
   if(u.pathname.startsWith('/library/'))return r.fulfill({path:path.join(lib,path.basename(u.pathname))});
   if(u.pathname==='/media-workspace.js')return r.fulfill({path:path.join(dev,'media-workspace.js')});
   const file=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':u.pathname));
   if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return r.fulfill({status:404,body:'{}'});
   return r.fulfill({path:file});
  });
  async function app(){await p.goto(origin);await p.waitForFunction(()=>typeof ready!=='undefined'&&ready);await p.evaluate(()=>flushSave());}
  async function source(){await p.goto(origin+'/library/read/test-book/1?account='+A);}
  async function seed(q={}){await p.evaluate(({key,A,...q})=>localStorage.setItem(key,JSON.stringify({version:1,account:A,expires:Date.now()+600000,text:'Alıntı\nKaynak: Example',...q})),{key,A,...q});await p.goto('about:blank');await p.goto(origin+'/#libraryQuote='+token);await p.waitForFunction(()=>typeof ready!=='undefined'&&ready);}
  await app();
  await p.evaluate(()=>{state.pages.push({id:'quote-target',title:'Alıntılar',strokes:[],updated:new Date().toISOString()});scheduleSave();return flushSave();});
  const original=await p.evaluate(()=>state.pages.map(p=>({id:p.id,strokes:p.strokes})));
  await source();await p.locator('#quoteSelection').click();assert.match(await p.locator('#quoteStatus').innerText(),/Önce/);
  await p.evaluate(()=>{const t=document.querySelector('#sourceText').firstChild,r=document.createRange();r.setStart(t,0);r.setEnd(t,5);getSelection().removeAllRanges();getSelection().addRange(r);document.dispatchEvent(new Event('selectionchange'));});
  await p.locator('#quoteSelection').click();await p.locator('#libraryQuoteDialog').waitFor({state:'visible'});
  const preview=await p.locator('#libraryQuotePreview').inputValue();assert(preview.startsWith('Heart\n\nKaynak:'));assert(preview.includes('PDF sayfası: 1'));assert(preview.includes('CC BY'));
  assert.deepEqual(await p.evaluate(()=>state.pages.map(p=>({id:p.id,strokes:p.strokes}))),original);
  await p.locator('#libraryQuoteTarget').selectOption('quote-target');await p.locator('#libraryQuotePlace').click();await p.locator('#layoutText').waitFor({state:'visible'});
  assert.equal(await p.evaluate(()=>page().strokes.length),0);assert.equal(await p.locator('#layoutText').inputValue(),preview);
  await p.locator('#layoutCancel').click();assert.equal(await p.evaluate(()=>page().strokes.length),0);
  results.push(`${name}/${width} selection, citation, target choice, no premature save, cancel`);
  await source();await p.evaluate(()=>document.querySelector('#sourceText').textContent='Kalp kanı pompalar.');
  await p.locator('#quotePage').click();await p.locator('#libraryQuoteDialog').waitFor({state:'visible'});
  await p.screenshot({path:path.join(out,`quote-${name}-${width}.png`)});
  assert.equal(await p.locator('#libraryQuoteDialog').evaluate(e=>e.scrollWidth>e.clientWidth+1),false);
  await p.locator('#libraryQuoteTarget').selectOption('quote-target');await p.locator('#libraryQuotePlace').click();await p.locator('#layoutDone').click();await p.evaluate(()=>flushSave());
  assert.equal(await p.evaluate(()=>page().strokes.length),1);assert((await p.evaluate(()=>page().strokes[0].text)).startsWith('Kalp kanı pompalar.'));
  await app();assert.equal(await p.evaluate(()=>state.pages.find(p=>p.id==='quote-target').strokes.length),1);
  results.push(`${name}/${width} visible translated page text, explicit save, reload persistence`);
  await seed();await p.locator('#libraryQuoteDialog').waitFor({state:'visible'});
  await p.goto('about:blank');await app();await p.locator('#libraryQuoteDialog').waitFor({state:'visible'});await p.locator('#libraryQuoteCancel').click();assert.equal(await p.evaluate(k=>localStorage.getItem(k),key),null);assert.equal(await p.evaluate(()=>sessionStorage.getItem('bilge-library-pending')),null);
  results.push(`${name}/${width} same-tab login return without fragment resumes after verified account`);
  for(const q of [{account:B},{expires:1},{text:'x'.repeat(10001)}]){const before=dialogs.length;await seed(q);await p.waitForFunction(()=>!location.hash);await p.waitForTimeout(100);assert(dialogs.length>before);assert.equal(await p.locator('#libraryQuoteDialog').count(),0);}
  results.push(`${name}/${width} wrong account, expired and oversized payload refused`);
  await seed();await p.locator('#libraryQuoteDialog').waitFor({state:'visible'});await p.evaluate(k=>localStorage.removeItem(k),key);await p.locator('#libraryQuotePlace').click();await p.waitForFunction(()=>document.querySelector('#libraryQuoteMessage').textContent.length>0);assert.equal(await p.evaluate(()=>!!mediaPending),false);
  results.push(`${name}/${width} already consumed handoff cannot be replayed`);
  await source();who=B;await p.locator('#quotePage').click();await p.waitForFunction(()=>document.querySelector('#quoteStatus').textContent.includes('Hesap değişti'));who=A;
  await p.evaluate(()=>document.querySelector('#sourceText').textContent='x'.repeat(10001));await p.locator('#quotePage').click();assert.match(await p.locator('#quoteStatus').innerText(),/kesilmedi/);
  results.push(`${name}/${width} sender account change and page length guard`);
  await source();await p.evaluate(()=>{const r=document.createRange();r.selectNodeContents(document.querySelector('h1'));getSelection().removeAllRanges();getSelection().addRange(r);document.dispatchEvent(new Event('selectionchange'));});await p.locator('#quoteSelection').click();assert.match(await p.locator('#quoteStatus').innerText(),/Önce/);
  await p.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('Full','QuotaExceededError');};});await p.locator('#quotePage').click();await p.waitForFunction(()=>document.querySelector('#quoteStatus').textContent.includes('yer ayrılamadı'));
  await app();await seed({text:'<img src=x onerror=alert(1)>\nKaynak: Example'});await p.locator('#libraryQuoteDialog').waitFor({state:'visible'});assert.equal(await p.locator('#libraryQuoteDialog img').count(),0);await p.locator('#libraryQuoteCancel').click();
  assert.deepEqual(errors,[]);results.push(`${name}/${width} outside selection rejected, storage full handled, literal HTML safe, no JS errors`);
  await c.close();
 }}finally{await browser.close();}
}
fs.writeFileSync(path.join(out,'proof.json'),JSON.stringify({passed:results.length,results,auth:'synthetic fixtures',physicalIPad:false,live:false},null,2));console.log(JSON.stringify({passed:results.length,results}));
})().catch(e=>{console.error(e);process.exit(1);});
