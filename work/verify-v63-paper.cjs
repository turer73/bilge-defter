'use strict';
// v63 paper panel, ruled-line alignment and focus view. The v2 panel names lined paper "ruled" while the
// engine stores "lined": before v63 tapping Çizgili was rejected and never shown as selected.
// Ruled lines must also sit where ink on page line k (page y = 32k) is drawn, through scroll,
// fit-to-width and zoom; in v60 they drifted on fitted pages. In focus view the writing surface
// fills the whole editor area. Synthetic, no iPad.
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),{chromium,webkit}=require('playwright');
const root=path.resolve(process.env.BILGE_TEST_ROOT||path.join(__dirname,'bilge-defter-invited-v63'));
const out=path.resolve(process.env.BILGE_TEST_OUTPUT||path.join(__dirname,'../outputs/v63-paper'));
const origin='http://127.0.0.1:49370';fs.mkdirSync(out,{recursive:true});
const results=[];const pass=s=>{results.push(s);console.log('PASS '+s)};
async function open(context){const p=await context.newPage();await p.goto(origin);await p.waitForFunction(()=>typeof ready!=='undefined'&&ready&&window.__v2UI);return p}
const panel=p=>p.evaluate(()=>{const r=window.__v2UI.ui.shadowRoot;return {stored:page().paperPattern??null,engine:paperPattern(),bridge:window.__v2Bridge.host.getState().paper.pattern,pressed:[...r.querySelectorAll('[data-pattern]')].filter(b=>b.getAttribute('aria-pressed')==='true').map(b=>b.dataset.pattern),size:getComputedStyle(canvas.parentElement).backgroundSize.split(',')[0].trim()}});
const settle=p=>p.waitForFunction(()=>!savePromise&&!isDirty());
// Offset in CSS px between the ruled line nearest page line k and where ink on that line is drawn.
const offset=p=>p.evaluate(()=>{
 const paper=canvas.parentElement,cs=getComputedStyle(paper),pr=paper.getBoundingClientRect(),cr=canvas.getBoundingClientRect();
 const padTop=pr.top+parseFloat(cs.borderTopWidth),size=cs.backgroundSize.split(/\s+/),step=parseFloat(size[1]||size[0]),posY=parseFloat(cs.backgroundPosition.split(/\s+/)[1]);
 const scale=paperScale(),k=Math.ceil(viewY()/32)+3,ink=cr.top+(32*k-viewY())*scale,mod=(a,m)=>((a%m)+m)%m;
 let off=mod(padTop+posY-ink,step);if(off>step/2)off-=step;return {off,step,scale,expected:32*scale};
});
async function run(browser,name,width){
 const context=await browser.newContext({viewport:{width,height:820},serviceWorkers:'block'}),errors=[];
 context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
 await context.addInitScript(o=>{if(location.origin===o){window.__accountRequired=false;localStorage.setItem('bilge_defter_onboarding_v1','true')}},origin);
 await context.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!==origin)return r.abort();const f=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));return f.startsWith(root+path.sep)&&fs.existsSync(f)?r.fulfill({path:f}):r.fulfill({status:404,body:''})});
 let p=await open(context);
 await p.evaluate(()=>{state.pages=[{id:'paper-a',title:'Kâğıt',strokes:[],updated:new Date().toISOString()}];activeId='paper-a';state.active=activeId;renderPages();drawAll();scheduleSave()});await settle(p);
 await p.evaluate(()=>window.__v2UI.ui._openPaper());
 let v=await panel(p);assert.deepEqual([v.stored,v.engine,v.bridge,v.pressed],[null,'lined','ruled',['ruled']]);
 pass(`${name} ${width}: a page without a stored pattern shows Çizgili (ruled) as selected`);
 await p.locator('[data-pattern="grid"]').click();await settle(p);v=await panel(p);assert.deepEqual([v.stored,v.pressed,v.size],['grid',['grid'],'32px 32px']);
 await p.locator('[data-pattern="ruled"]').click();await settle(p);v=await panel(p);assert.deepEqual([v.stored,v.engine,v.bridge,v.pressed,v.size],['lined','lined','ruled',['ruled'],'100% 32px']);
 pass(`${name} ${width}: Kareli then Çizgili stores lined, marks Çizgili and draws ruled lines`);
 await p.evaluate(()=>window.__v2Bridge.host.commands['paper.set']({pattern:'dotted'}));v=await panel(p);assert.equal(v.stored,'dotted');
 await p.evaluate(()=>window.__v2Bridge.host.commands['paper.set']({pattern:'lined'}));await settle(p);v=await panel(p);assert.equal(v.stored,'lined');
 await p.reload();await p.waitForFunction(()=>typeof ready!=='undefined'&&ready&&window.__v2UI);await p.evaluate(()=>window.__v2UI.ui._openPaper());
 v=await panel(p);assert.deepEqual([v.stored,v.pressed],['lined',['ruled']]);
 pass(`${name} ${width}: engine names still work through the bridge; Çizgili survives a reload`);
 const checks=[];
 await p.evaluate(()=>{window.__v2UI.ui.close?.();scrollPaper(123.4);drawAll()});checks.push(['scroll',await offset(p)]);
 await p.evaluate(()=>{page().strokes.push({tool:'pen',color:'#000',width:2,points:[{x:10,y:40,p:.5},{x:2400,y:40,p:.5}]});fitPageToWidth();scrollPaper(517.7);drawAll()});checks.push(['fitted wide page + scroll',await offset(p)]);
 await p.evaluate(()=>{page().strokes=[];page().fitScale=1;drawAll();setViewZoom(2);scrollPaper(333.3,40);drawAll()});checks.push(['200% + scroll',await offset(p)]);
 for(const [label,o] of checks){assert.ok(Math.abs(o.off)<0.01,`${label}: ${JSON.stringify(o)}`);assert.ok(Math.abs(o.step-o.expected)<0.01,`${label}: ${JSON.stringify(o)}`)}
 assert.ok(checks[1][1].scale<1);
 pass(`${name} ${width}: ruled lines sit on page lines after scroll, on a fitted page and at 200% (${checks.map(([l,o])=>l+' '+o.step.toFixed(1)+'px').join(', ')})`);
 // Focus view: the paper covers the editor area edge to edge, and back again on exit.
 await p.evaluate(()=>{setViewZoom(1);page().strokes=[];page().fitScale=1;scrollPaper(0,0);drawAll()});
 const rects=()=>p.evaluate(()=>{const r=e=>{const x=e.getBoundingClientRect();return [x.left,x.top,x.width,x.height].map(n=>Math.round(n))};return {workspace:r(document.querySelector('.workspace')),paper:r(canvas.parentElement),canvas:r(canvas),pixels:[canvas.width,canvas.height],dpr:Math.min(devicePixelRatio||1,2),focus:document.documentElement.classList.contains('bd-focus')}});
 const toggle=()=>p.evaluate(()=>window.__v2UI.ui.shadowRoot.querySelector('[data-focus]').click());
 const normal=await rects();assert.equal(normal.focus,false);
 await toggle();await p.waitForFunction(()=>document.documentElement.classList.contains('bd-focus'));await p.waitForFunction(()=>{const r=canvas.getBoundingClientRect(),w=document.querySelector('.workspace').getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2);return Math.round(r.width)===Math.round(w.width)&&Math.round(r.height)===Math.round(w.height)&&canvas.width===Math.max(1,Math.round(r.width*d))&&canvas.height===Math.max(1,Math.round(r.height*d))},null,{timeout:5000});
 const focus=await rects();
 assert.deepEqual(focus.paper,focus.workspace);assert.deepEqual(focus.canvas,focus.workspace);assert.deepEqual(focus.pixels,focus.canvas.slice(2).map(n=>Math.round(n*focus.dpr)));
 const ink=await p.locator('#canvas').evaluate(c=>{const r=c.getBoundingClientRect(),before=page().strokes.length;for(const [type,dx] of [['pointerdown',0],['pointermove',60],['pointerup',120]])c.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:63,pointerType:'pen',clientX:r.right-150+dx,clientY:r.y+96,buttons:type==='pointerup'?0:1,pressure:.5}));const s=page().strokes[before];return {count:page().strokes.length-before,x:s.points[0].x,expected:r.width-150+viewX()}});
 assert.equal(ink.count,1);assert.ok(Math.abs(ink.x-ink.expected)<1e-6,JSON.stringify(ink));
 pass(`${name} ${width}: focus view fills the editor area (${focus.paper[2]}x${focus.paper[3]}); the pen lands under the tip at the far edge`);
 await toggle();await p.waitForFunction(()=>!document.documentElement.classList.contains('bd-focus'));await p.waitForFunction(w=>{const r=canvas.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2);return Math.round(r.width)===w&&canvas.width===Math.max(1,Math.round(r.width*d))&&canvas.height===Math.max(1,Math.round(r.height*d))},normal.canvas[2],{timeout:5000});
 const back=await rects();assert.deepEqual(back.paper,normal.paper);
 const fit=await p.evaluate(()=>({fitScale:page().fitScale||1,width:canvas.getBoundingClientRect().width,content:pageContentWidth(page())}));
 if(focus.paper[2]>normal.paper[2]+130){assert.ok(fit.fitScale<1&&fit.content*fit.fitScale<=fit.width,JSON.stringify(fit))}
 await toggle();await p.waitForFunction(()=>(page().fitScale||1)===1);
 pass(`${name} ${width}: leaving focus restores the page frame and fits wider ink; focus again shows it full size`);
 assert.deepEqual(errors,[]);await context.close();
}
(async()=>{
 for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await engine.launch({headless:true});
  try{for(const width of [390,1180])await run(browser,name,width)}finally{await browser.close()}
 }
 fs.writeFileSync(path.join(out,'paper-tests.json'),JSON.stringify({passed:results.length,results,synthetic:true,realDevice:false},null,2));
 console.log(JSON.stringify({passed:results.length,failed:0}));
})().catch(e=>{console.error(e);process.exit(1)});
