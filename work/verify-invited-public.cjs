const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium,request}=require('C:/Users/sevdi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const origin='https://defter.bilgearena.com';const api=await request.newContext({ignoreHTTPSErrors:false,timeout:30000});let browser;
 try{
  const results=[];
  for(const path of ['/','/index.html','/ui.css','/ui-workspace.js','/media-workspace.js','/planner-workspace.js','/release.json','/sw.js','/pwa.js','/offline-assets.json','/manifest.webmanifest','/vendor/pdfjs/pdf.min.js','/README.md','/?bypass=1']){
   const r=await api.get(origin+path,{maxRedirects:0});const location=r.headers().location||'';
   assert.equal(r.status(),302,`${path} must be gated`);assert.ok(location.startsWith('https://noisy-butterfly-321d.cloudflareaccess.com/cdn-cgi/access/login/'),`${path}: correct gate`);
   results.push(`${path}: unauthenticated request redirected to Access`);
  }
  const forged=await api.get(origin+'/',{maxRedirects:0,headers:{'Cf-Access-Jwt-Assertion':'invalid.fake.token','Cookie':'CF_Authorization=invalid.fake.token'}});
  assert.ok([302,401,403].includes(forged.status()));results.push('Forged Access token cannot retrieve app');
  browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:390,height:844}});const p=await context.newPage();
  await p.goto(origin,{waitUntil:'domcontentloaded',timeout:60000});
  assert.ok(p.url().startsWith('https://noisy-butterfly-321d.cloudflareaccess.com/'));
  await p.locator('input[type="email"]').waitFor();
  const text=await p.locator('body').innerText();assert.match(text,/Bilge Defter/);assert.match(text,/code|PIN/i);
  assert.equal(await p.locator('#canvas').count(),0);
  await p.screenshot({path:__dirname+'/bilge-defter-invited-login.png',fullPage:true});
  results.push('Real mobile-width browser shows Bilge Defter email-code login, not note canvas');
  const report={passed:results.length,results,emailSent:false,authorizedEmailLogin:'pending user verification',publicPwaInstallation:'pending user verification'};
  fs.writeFileSync(__dirname+'/invited-public-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await browser?.close();await api.dispose()}
})().catch(e=>{console.error(e.message);process.exitCode=1});
