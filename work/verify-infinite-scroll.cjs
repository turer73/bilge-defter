const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {chromium}=require('C:/Users/sevdi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin=(process.env.BILGE_TEST_ORIGIN||'http://100.84.251.49:18788'),live=process.argv.includes('--live'),results=[],errors=[];let browser;
async function saved(p){await p.waitForFunction(()=>document.querySelector('#saveState').textContent==='Bu cihazda kaydedildi')}
async function data(p){return p.evaluate(()=>dbGet())}
async function pixels(p){return p.locator('#canvas').evaluate(c=>{const xs=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<xs.length;i+=4)if(xs[i])n++;return n})}
async function events(p,list){await p.locator('#canvas').evaluate((c,list)=>{const r=c.getBoundingClientRect();for(const e of list)c.dispatchEvent(new PointerEvent(e.type,{bubbles:true,cancelable:true,pointerId:e.id||60,pointerType:e.kind||'touch',clientX:r.x+(e.x||300),clientY:r.y+e.y,buttons:e.type==='pointerup'?0:1,pressure:.5}));},list)}
async function panBy(p,delta){await events(p,[{type:'pointerdown',id:70,y:450},{type:'pointerdown',id:71,x:430,y:450},{type:'pointermove',id:70,y:450-delta},{type:'pointermove',id:71,x:430,y:450-delta},{type:'pointerup',id:70,y:450-delta},{type:'pointerup',id:71,x:430,y:450-delta}]);await saved(p)}
async function write(p,x=100){await events(p,[{type:'pointerdown',kind:'pen',x,y:120},{type:'pointermove',kind:'pen',x:x+100,y:160},{type:'pointerup',kind:'pen',x:x+160,y:150}]);await saved(p)}
async function tool(p,id){await p.locator('#toolsToggle').tap();await p.locator(id).click();await p.locator('#toolsClose').click();}
(async()=>{browser=await chromium.launch({headless:true});const c=await browser.newContext({serviceWorkers: 'block',viewport:{width:1180,height:820},hasTouch:true});
if(!live)await c.route(origin+'/**',async r=>{const n=new URL(r.request().url()).pathname.split('/').pop()||'index.html',types={'index.html':'text/html','media-workspace.js':'application/javascript','planner-workspace.js':'application/javascript','ui-workspace.js':'application/javascript','ui.css':'text/css','pwa.js':'application/javascript','pdf-workspace.js':'application/javascript','sw.js':'application/javascript','manifest.webmanifest':'application/manifest+json'};if(!types[n])return r.abort();await r.fulfill({body:await fs.readFile(path.join(__dirname,'bilge-defter-test',n)),contentType:types[n]})});
const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(origin+'/?v=20');await saved(p);
const box=await p.locator('#canvas').boundingBox(),cdp=await c.newCDPSession(p);
await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+320,y:box.y+500,id:1},{x:box.x+440,y:box.y+500,id:2}]});
await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+320,y:box.y+200,id:1},{x:box.x+440,y:box.y+200,id:2}]});
await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await saved(p);
assert.equal((await data(p)).pages[0].viewY,300);assert.equal((await data(p)).pages[0].strokes.length,0);assert.equal(await pixels(p),0);
results.push('Actual browser two-finger touch stream scrolls 300px without leaving a stroke, even with touch-writing enabled');
await tool(p,'#scrollToTop');await saved(p);assert.equal((await data(p)).pages[0].viewY,0);await write(p);
const initial=await data(p),initialPixels=await pixels(p);await panBy(p,600);
assert.equal(await pixels(p),0);assert.deepEqual((await data(p)).pages[0].strokes,initial.pages[0].strokes);
await write(p,400);const lower=await data(p);assert.equal(lower.pages[0].strokes[1].points[0].y,720);
const lowerPixels=await pixels(p);await p.reload();await saved(p);assert.equal((await data(p)).pages[0].viewY,600);assert.equal(await pixels(p),lowerPixels);
await p.mouse.move(box.x+500,box.y+300);await p.mouse.wheel(0,100000);await p.waitForFunction(()=>viewY()===100600);await saved(p);
assert.deepEqual(await p.locator('#canvas').boundingBox(),box);assert.equal(await pixels(p),0);await write(p,250);
assert.equal((await data(p)).pages[0].strokes[2].points[0].y,100720);await p.reload();await saved(p);assert.equal((await data(p)).pages[0].viewY,100600);assert.ok(await pixels(p)>100);
await tool(p,'#scrollToTop');await saved(p);assert.equal(await pixels(p),initialPixels);assert.deepEqual((await data(p)).pages[0].strokes[0],initial.pages[0].strokes[0]);
results.push('Scroll beyond 100000px uses a viewport-sized canvas; ink uses world coordinates, survives reload and old notes stay unmoved');
await panBy(p,600);await p.locator('#sidebarToggle').tap();await p.locator('#newPage').tap();await saved(p);
assert.equal(await p.evaluate(()=>viewY()),0);await write(p,180);await p.locator('#sidebarToggle').tap();await p.getByRole('button',{name:'Sayfa 1',exact:true}).click();await saved(p);
assert.equal(await p.evaluate(()=>viewY()),600);assert.equal(await pixels(p),lowerPixels);
const beforePalm=await data(p);await events(p,[{type:'pointerdown',id:90,kind:'pen',x:200,y:100},{type:'pointerdown',id:91,y:480},{type:'pointerdown',id:92,x:420,y:480},{type:'pointermove',id:91,y:180},{type:'pointermove',id:92,x:420,y:180},{type:'pointermove',id:90,kind:'pen',x:250,y:130},{type:'pointerup',id:91,y:180},{type:'pointerup',id:92,x:420,y:180},{type:'pointerup',id:90,kind:'pen',x:280,y:120}]);await saved(p);
assert.equal((await data(p)).pages[0].viewY,600);assert.equal((await data(p)).pages[0].strokes.length,beforePalm.pages[0].strokes.length+1);
await p.locator('#toolsToggle').tap();await p.locator('#penOnly').check();await p.locator('#toolsClose').click();const guarded=await data(p);await panBy(p,300);
assert.equal((await data(p)).pages[0].viewY,900);assert.deepEqual((await data(p)).pages[0].strokes,guarded.pages[0].strokes);
results.push('Each page remembers its position; palms cannot scroll during pen input; deliberate two-finger scrolling works with palm protection on');
await p.locator('#toolsToggle').tap();await p.locator('#penOnly').uncheck();await p.locator('#toolsClose').click();const beforeLift=await data(p);
await events(p,[{type:'pointerdown',id:70,y:450},{type:'pointerdown',id:71,x:430,y:450},{type:'pointermove',id:70,y:400},{type:'pointermove',id:71,x:430,y:400},{type:'pointerup',id:70,y:400},{type:'pointermove',id:71,x:430,y:250},{type:'pointerup',id:71,x:430,y:250}]);await saved(p);
assert.equal((await data(p)).pages[0].viewY,950);assert.deepEqual((await data(p)).pages[0].strokes,beforeLift.pages[0].strokes);
await events(p,[{type:'pointerdown',id:70,y:400},{type:'pointerdown',id:71,x:430,y:400},{type:'pointermove',id:70,y:350},{type:'pointermove',id:71,x:430,y:350},{type:'pointercancel',id:70,y:350},{type:'lostpointercapture',id:71,x:430,y:350}]);await saved(p);
assert.equal((await data(p)).pages[0].viewY,1000);await write(p,350);assert.equal((await data(p)).pages[0].strokes.at(-1).points[0].y,1120);
await panBy(p,-3000);assert.equal((await data(p)).pages[0].viewY,0);
results.push('Lifting one finger or cancelling capture leaves no stray ink or stuck gesture; upward scrolling stops at the beginning');
await panBy(p,1000);await p.locator('#toolsToggle').tap();const dp=p.waitForEvent('download');await p.locator('#exportBtn').click();const backup=JSON.parse(await fs.readFile(await (await dp).path(),'utf8'));await p.locator('#toolsClose').click();
await tool(p,'#scrollToTop');await saved(p);await p.locator('#importFile').setInputFiles({name:'scroll-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});await p.locator('#backupApply').click();await p.waitForFunction(()=>document.querySelector('#saveState').textContent==='Yedek geri yüklendi');
assert.equal(await p.evaluate(()=>viewY()),1000);assert.deepEqual((await data(p)).pages,backup.pages);await p.reload();await saved(p);assert.equal(await p.evaluate(()=>viewY()),1000);
const invalid=JSON.parse(JSON.stringify(backup));invalid.pages[0].viewY=-20;const beforeBad=await data(p);p.once('dialog',d=>d.accept());await p.locator('#importFile').setInputFiles({name:'invalid-scroll.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(invalid))});await p.waitForFunction(()=>!document.querySelector('#importFile').value);assert.deepEqual(await data(p),beforeBad);
await p.screenshot({path:path.join(__dirname,live?'bilge-defter-v37-scrolled-live.png':'bilge-defter-v37-scrolled-local.png'),fullPage:true});
results.push('Backup restores page positions and world-coordinate ink; invalid negative scroll position cannot replace existing notes');
assert.deepEqual(errors,[]);await c.close();console.log(JSON.stringify({mode:live?'live':'local',passed:results.length,results,physicalTabletTest:'pending'},null,2));
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close()});
