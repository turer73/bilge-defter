'use strict';
// v63: pen and highlighter colours are chosen separately. Switching tools shows each tool's own
// colour, strokes keep it, the eraser leaves both alone, and text boxes use the pen colour even
// while the highlighter is active. Synthetic, no iPad.
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),{chromium,webkit}=require('playwright');
const root=path.resolve(process.env.BILGE_TEST_ROOT||path.join(__dirname,'bilge-defter-invited-v63'));
const out=path.resolve(process.env.BILGE_TEST_OUTPUT||path.join(__dirname,'../outputs/v63-ink'));
const origin='http://127.0.0.1:49373';fs.mkdirSync(out,{recursive:true});
const results=[];const pass=s=>{results.push(s);console.log('PASS '+s)};
async function run(browser,name){
 const context=await browser.newContext({viewport:{width:1180,height:820},serviceWorkers:'block'}),errors=[];
 context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
 await context.addInitScript(o=>{if(location.origin===o){window.__accountRequired=false;localStorage.setItem('bilge_defter_onboarding_v1','true')}},origin);
 await context.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!==origin)return r.abort();const f=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));return f.startsWith(root+path.sep)&&fs.existsSync(f)?r.fulfill({path:f}):r.fulfill({status:404,body:''})});
 const p=await context.newPage();await p.goto(origin);await p.waitForFunction(()=>typeof ready!=='undefined'&&ready&&window.__v2UI);
 await p.evaluate(()=>{state.pages=[{id:'ink-a',title:'Renk',strokes:[],updated:new Date().toISOString()}];activeId='ink-a';state.active=activeId;renderPages();drawAll()});
 const tool=async id=>{await p.locator(`bilge-defter-ui [data-v2-tool="${id}"]`).click();await p.waitForFunction(id=>window.__v2Bridge.host.getState().tool===id,id)};
 const now=()=>p.evaluate(()=>({tool,input:document.querySelector('#color').value,bridge:window.__v2Bridge.host.getState().ink.color,pen:typeof penColor==='function'?penColor():null}));
 const draw=y=>p.locator('#canvas').evaluate((c,y)=>{const r=c.getBoundingClientRect(),before=page().strokes.length;for(const [type,dx] of [['pointerdown',0],['pointermove',50],['pointerup',100]])c.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:64,pointerType:'pen',clientX:r.x+120+dx,clientY:r.y+y,buttons:type==='pointerup'?0:1,pressure:.5}));const s=page().strokes[before];return {tool:s.tool,color:s.color}},y);
 let v=await now();assert.deepEqual([v.tool,v.input,v.bridge],['pen','#173b36','#173b36']);
 await tool('marker');v=await now();assert.deepEqual([v.tool,v.input,v.bridge,v.pen],['marker','#f5c400','#f5c400','#173b36']);
 pass(`${name}: the highlighter starts with its own colour (yellow) and the pen keeps its own`);
 await p.evaluate(()=>window.__v2Bridge.host.commands['ink.set']({color:'#7fd3ff'}));
 assert.deepEqual(await draw(100),{tool:'marker',color:'#7fd3ff'});
 await tool('pen');v=await now();assert.deepEqual([v.input,v.bridge],['#173b36','#173b36']);
 await p.evaluate(()=>window.__v2Bridge.host.commands['ink.set']({color:'#b00020'}));
 assert.deepEqual(await draw(180),{tool:'pen',color:'#b00020'});
 await tool('marker');v=await now();assert.deepEqual([v.input,v.pen],['#7fd3ff','#b00020']);
 assert.deepEqual(await draw(260),{tool:'marker',color:'#7fd3ff'});
 pass(`${name}: choosing a highlighter colour leaves the pen colour alone and vice versa; strokes keep their tool's colour`);
 await tool('eraser');await tool('pen');v=await now();assert.equal(v.input,'#b00020');
 await tool('marker');v=await now();assert.equal(v.input,'#7fd3ff');
 pass(`${name}: passing through the eraser keeps both colours`);
 await p.evaluate(()=>document.querySelector('#textAdd').click());
 const text=await p.evaluate(()=>{const m=typeof mediaPending!=='undefined'&&mediaPending&&typeof mediaPending==='object'?mediaPending:null;return m?.draft?.color??[...page().strokes].reverse().find(s=>s.tool==='text')?.color??null});
 assert.equal(text,'#b00020');
 pass(`${name}: a text box added while the highlighter is active uses the pen colour`);
 const strokes=await p.evaluate(()=>page().strokes.filter(s=>s.tool!=='text').map(s=>[s.tool,s.color]));
 assert.deepEqual(strokes,[['marker','#7fd3ff'],['pen','#b00020'],['marker','#7fd3ff']]);
 assert.deepEqual(errors,[]);await context.close();
}
(async()=>{
 for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){const browser=await engine.launch({headless:true});try{await run(browser,name)}finally{await browser.close()}}
 fs.writeFileSync(path.join(out,'ink-tests.json'),JSON.stringify({passed:results.length,results,synthetic:true,realDevice:false},null,2));
 console.log(JSON.stringify({passed:results.length,failed:0}));
})().catch(e=>{console.error(e);process.exit(1)});
