const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/sevdi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
let browser,server;const results=[],pass=s=>{results.push(s);console.log('PASS '+s)};
(async()=>{try{
 server=http.createServer(async(req,res)=>{try{const n=new URL(req.url,'http://local').pathname.slice(1)||'index.html',data=await fs.readFile(path.join(__dirname,'bilge-defter-test',n));res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm'})[path.extname(n)]||'application/octet-stream'});res.end(data)}catch{res.writeHead(404);res.end()}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin=process.env.BILGE_TEST_ORIGIN||`http://127.0.0.1:${server.address().port}`;browser=await chromium.launch({headless:true});const errors=[];
 const c=await browser.newContext({viewport:{width:1180,height:900}});const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));
 async function toolsOpen(){if(!await p.locator('#toolsDialog').evaluate(x=>x.open))await p.locator('#toolsToggle').click()}
 async function toolsClose(){if(await p.locator('#toolsDialog').evaluate(x=>x.open))await p.locator('#toolsDone').click()}
 const KEY='bilge-defter-button-theme-v1';
 await p.goto(origin);await p.waitForFunction(()=>ready);
 await toolsOpen();await p.locator('#buttonThemeSection').waitFor({state:'attached'});
 assert.equal(await p.locator('#buttonThemeSection [data-bdt-preset]').count(),6);
 assert.equal(await p.evaluate(()=>document.querySelector('#toolsDone').getAttribute('data-bd-button-role')),'primary');
 assert.equal(await p.evaluate(()=>getComputedStyle(document.querySelector('#toolsDone')).backgroundColor),'rgb(37, 95, 80)');
 pass('Theme section mounts before the tools done button with 6 presets and decorates the primary button with the default Orman theme');
 await p.locator('button[data-bdt-preset="gece"]').click();
 assert.equal(await p.evaluate(()=>document.documentElement.style.getPropertyValue('--bd-btn-primary-bg')),'#243b6b');
 assert.equal(await p.evaluate(()=>getComputedStyle(document.querySelector('#toolsDone')).backgroundColor),'rgb(36, 59, 107)');
 assert.equal(await p.evaluate(k=>JSON.parse(localStorage.getItem(k)).primary.bg,KEY),'#243b6b');
 await toolsClose();
 pass('Selecting the Gece preset recolors decorated buttons, saves the preference and persists it');
 await p.reload();await p.waitForFunction(()=>ready);await toolsOpen();
 assert.equal(await p.locator('button[data-bdt-preset="gece"]').getAttribute('aria-pressed'),'true');
 assert.equal(await p.evaluate(()=>document.documentElement.style.getPropertyValue('--bd-btn-primary-bg')),'#243b6b');
 await toolsClose();
 pass('After reload the saved preset is restored and marked pressed');
 const units=await p.evaluate(()=>{
   const T=window.BilgeButtonTheme;
   const out={};
   out.contrastBW=T.contrast('#000000','#ffffff').toFixed(1);
   out.invalidTheme=false;try{T.validateTheme({version:1,autoText:true,primary:{bg:'red',text:'#ffffff'},secondary:{bg:'#edf4f0',text:'#173b36'},danger:{bg:'#fcece8',text:'#9b272d'}})}catch{out.invalidTheme=true}
   out.setColorBad=window.BilgeButtonThemeInstallation.controller.setColor('primary','bg','red');
   const auto=T.autoInk('#ffcf70');out.kehribarAutoText=auto;
   out.presetCount=T.PRESETS.length;
   return out;
 });
 assert.equal(units.contrastBW,'21.0');assert.equal(units.invalidTheme,true);assert.equal(units.setColorBad,false);assert.equal(units.kehribarAutoText,'#000000');assert.equal(units.presetCount,6);
 pass('Contrast math (21:1), #RRGGBB validation, invalid color rejection and auto ink choice behave as specified');
 await p.evaluate(k=>localStorage.setItem(k,'###bozuk'),KEY);await p.reload();await p.waitForFunction(()=>ready);await toolsOpen();
 assert.equal(await p.evaluate(()=>document.documentElement.style.getPropertyValue('--bd-btn-primary-bg')),'#255f50');
 assert.match(await p.locator('#buttonThemeSection [data-bdt-storage]').textContent(),/okunamadı/);
 await toolsClose();
 pass('A corrupt saved theme falls back to safe defaults with an explanatory status');
 await toolsOpen();await p.locator('#buttonThemeSection [data-bdt-reset]').click();
 assert.equal(await p.evaluate(()=>document.documentElement.style.getPropertyValue('--bd-btn-primary-bg')),'#255f50');
 assert.equal(await p.evaluate(k=>JSON.parse(localStorage.getItem(k)).primary.bg,KEY),'#255f50');
 await toolsClose();
 pass('The reset button restores default colors and stores them');
 await p.locator('#canvas').boundingBox().then(async r=>{await p.mouse.move(r.x+80,r.y+120);await p.mouse.down();await p.mouse.move(r.x+220,r.y+130,{steps:6});await p.mouse.up()});
 await p.waitForFunction(()=>document.querySelector('#saveState').textContent==='Bu cihazda kaydedildi');
 const before=await p.evaluate(()=>dbGet());await toolsOpen();await p.locator('button[data-bdt-preset="murdum"]').click();await toolsClose();assert.deepEqual(await p.evaluate(()=>dbGet()),before);
 pass('Theme changes never touch notebook data');
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({passed:results.length,results,physicalDevice:'pending'},null,2));
 }finally{await browser?.close();if(server)await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exitCode=1});
