'use strict';
// UI-only synthetic authenticated responses. NOT evidence of a live user login.
const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const origin='https://defter.bilgearena.com',base=origin+'/library/';
const account='11111111-1111-1111-1111-111111111111';
const out=path.resolve(__dirname,'../../outputs/library-pilot-release');
fs.mkdirSync(out,{recursive:true});
(async()=>{
 const catalog=await (await fetch('http://127.0.0.1:8766/api/catalog')).json();
 const pageImage=Buffer.from(await (await fetch('http://127.0.0.1:8766/page/msu-neuroscience/14.png')).arrayBuffer());
 const results=[];
 for(const [name,engine,size] of [['chromium',chromium,{width:1280,height:900}],['webkit',webkit,{width:820,height:1180}],['mobile',webkit,{width:390,height:844}]]){
  const browser=await engine.launch({headless:true});
  try{
   const context=await browser.newContext({viewport:size,serviceWorkers:'block'}),page=await context.newPage();
   const errors=[],unexpected=[],saved=[];let denied=0;
   page.on('pageerror',e=>errors.push(e.message));
   await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(!req.url().startsWith(base)){unexpected.push(req.url());return route.abort();}
    const endpoint=url.pathname.slice('/library/'.length);
    const json=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
    if(['','app.js','style.css'].includes(endpoint))return route.fulfill({path:path.join(__dirname,endpoint||'index.html')});
    if(endpoint==='api/session')return json({id:account,hosted:true});
    assert.equal(req.headers()['x-library-account']||url.searchParams.get('account'),account);
    if(denied)return json({error:'Oturumu yeniden açın.'},denied);
    if(endpoint==='api/catalog')return json(catalog);
    if(endpoint==='api/saved'){
     if(req.method()==='POST'){assert.equal(req.headers()['x-library-pilot'],'1');const value=req.postDataJSON();if(!saved.some(s=>s.id===value.id&&s.page===value.page))saved.push(value);return json({saved:value,count:saved.length});}
     return json(saved);
    }
    if(endpoint==='api/search')return json({searched:'heart',results:[{id:'msu-neuroscience',page:14,snippet:'heart'}]});
    if(endpoint.startsWith('page/'))return route.fulfill({contentType:'image/png',body:pageImage});
    unexpected.push(endpoint);return route.abort();
   });
   await page.goto(base);await page.waitForFunction(()=>document.querySelectorAll('.card').length===5);
   assert.match(await page.locator('#status').innerText(),/sunucuda/);
   assert.match(await page.locator('#saveScope').textContent(),/hesabınıza özel/);
   assert.equal(await page.locator('.card a').last().evaluate(a=>new URL(a.href).pathname),'/library/pdf/wistech-anatomy.pdf');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.screenshot({path:path.join(out,`hosted-${name}.png`),clip:{x:0,y:0,width:size.width,height:Math.min(size.height,620)}});
   results.push(name+': nested route, hosted copy, account-bound URLs, responsive layout');
   await page.goto(base+'#q=heart');await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.card').length===1);
   assert.equal(await page.locator('#query').inputValue(),'heart');assert.equal(new URL(page.url()).hash,'');
   results.push(name+': incoming dictionary term searched after authentication, fragment cleared');
   await page.getByLabel('Kitapların içinde ara').fill('kalp');await page.getByRole('button',{name:'Ara',exact:true}).click();
   await page.waitForFunction(()=>document.querySelectorAll('.card').length===1);
   await page.locator('.card button').first().click();await page.locator('#pageImage').waitFor({state:'visible'});
   await page.getByRole('button',{name:'Sayfayı kaydet',exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('#pageStatus').textContent.includes('hesabınıza özel listeye'));
   await page.getByRole('button',{name:'Kapat',exact:true}).click();await page.reload();
   await page.waitForFunction(()=>document.querySelectorAll('.card').length===5);
   await page.getByRole('button',{name:'Kaydettiklerim',exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('1 sayfa yer imi'));
   results.push(name+': search, reader, save, persisted fixture after reload');
   for(const status of [401,403,409,503]){
    denied=status;await page.getByRole('button',{name:'Kaydettiklerim',exact:true}).click();
    await page.locator('#login').waitFor({state:'visible'});
    assert.equal(await page.locator('.card').count(),0);
    assert.equal(await page.locator('button:enabled').count(),0);
    assert.equal(await page.locator('#reader').evaluate(d=>d.open),false);
    denied=0;await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.card').length===5);
   }
   assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
   results.push(name+': 401/403/409/503 privacy lock, no external requests or JS errors');
   await context.close();
  }finally{await browser.close();}
 }
 const report={date:new Date().toISOString(),passed:results.length,results,syntheticAuthenticatedResponses:true,liveAccountAcceptance:false,physicalDeviceAcceptance:false};
 fs.writeFileSync(path.join(out,'hosted-ui-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exit(1);});
