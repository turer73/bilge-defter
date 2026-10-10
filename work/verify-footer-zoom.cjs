'use strict';
// Local-only UI contract: two fingers pan; the footer owns page zoom.
// Synthetic pointer + touch dispatch is not physical iPad/Pencil acceptance.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const repo=path.resolve(__dirname,'..'),root=path.resolve(process.env.BILGE_TEST_ROOT||path.join(__dirname,'bilge-defter-test'));
const args=process.argv.slice(2),option=name=>args.find(x=>x.startsWith('--'+name+'='))?.slice(name.length+3),engineFilter=option('engine'),caseFilter=option('case');
assert.ok(args.every(x=>/^--(?:engine|case|out)=.+/.test(x)),'Only --engine, --case and --out are supported');assert.ok(!engineFilter||['chromium','webkit'].includes(engineFilter));
const out=path.resolve(option('out')||process.env.BILGE_FOOTER_ZOOM_OUT||path.join(repo,'outputs/footer-zoom'));
assert.ok(out.startsWith(path.join(repo,'outputs')+path.sep),'Evidence stays in repository outputs');assert.ok(!fs.existsSync(out)||fs.readdirSync(out).length===0,'Never overwrite previous evidence');fs.mkdirSync(out,{recursive:true});
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),files=new Map(),account='11111111-1111-4111-8111-111111111111';
function snapshot(dir,prefix=''){const map=new Map();for(const entry of fs.readdirSync(dir,{withFileTypes:true})){assert.ok(!entry.isSymbolicLink(),'No redirected source');const full=path.join(dir,entry.name),name=prefix+entry.name;if(entry.isDirectory())for(const [key,bytes]of snapshot(full,name+'/'))map.set(key,bytes);else{assert.ok(entry.isFile());map.set('/'+name,fs.readFileSync(full));}}return map;}
for(const [name,bytes]of snapshot(root))files.set(name,bytes);
const source=Object.fromEntries([...files].map(([name,bytes])=>[name,sha(bytes)]).sort(([a],[b])=>a.localeCompare(b)));
const report={scope:'footer-zoom-v1',startedAt:new Date().toISOString(),root,runnerSha256:sha(fs.readFileSync(__filename)),source,engine:engineFilter||'both',case:caseFilter||'all',results:[],releaseEligible:false,boundaries:[
  'Synthetic approved account and generated PNG-backed PDF/PPTX pages; no real Office/PDF decoding or account mutation.',
  'PointerEvent and paired touch events exercise actual app event listeners; WebKit Touch construction is not available, so read-only touch lists are attached to real event names.',
  'Footer taps use Playwright touch input. Browser automation and responsive viewports do not establish physical iPad/Safari or palm acceptance.',
  'Local IndexedDB writes are synthetic fixtures. Service workers and external network are blocked; complete source bytes and file set are verified after execution.'
]};
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.wasm':'application/wasm'};
async function paint(p){await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function save(p){await p.evaluate(async()=>{if(!await flushSave())throw Error('Fixture save failed');if(typeof ensureAssets==='function')await ensureAssets();if(!await flushSave())throw Error('Post-asset fixture save failed');});}
async function fixture(browser,viewport={width:1180,height:920}){
  const requests=[],external=[],errors=[],server=http.createServer((req,res)=>{
    const route=decodeURIComponent(new URL(req.url,'http://loopback').pathname),name=route==='/'?'/index.html':route;requests.push({method:req.method,path:name});
    if(req.method!=='GET'){res.writeHead(405);res.end();return;}
    if(name==='/api/v1/bilge-defter/whoami'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({account_protocol:'approval-v1',identity:{type:'access',id:account,status:'approved',role:'student',email:'footer-fixture@example.test'}}));return;}
    const bytes=files.get(name);res.writeHead(bytes?200:404,{'Content-Type':types[path.extname(name)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(bytes||'');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
  const context=await browser.newContext({viewport,hasTouch:true,deviceScaleFactor:2,serviceWorkers:'block'});context.setDefaultTimeout(15000);
  await context.addInitScript(origin=>{if(window.top!==window||location.origin!==origin)return;window.__accountRequired=true;localStorage.setItem('bilge_defter_onboarding_v1','true');try{delete Navigator.prototype.serviceWorker;}catch{}},origin);
  await context.route('**/*',route=>{const u=new URL(route.request().url());if(['http:','https:'].includes(u.protocol)&&u.origin!==origin){external.push(u.origin);return route.abort();}return route.continue();});
  const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
  return{p,context,origin,requests,external,errors,async start(){await p.goto(origin);await p.waitForFunction(()=>typeof ready!=='undefined'&&ready&&window.__v2UI);await save(p);},async finish(){await context.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}
async function setup(p,mode){
  if(mode!=='plain'){
    const added=await p.evaluate(async mode=>{const pages=[];for(let n=0;n<(mode==='pptx'?5:1);n++){const c=document.createElement('canvas');c.width=1000;c.height=mode==='pptx'?563:1400;const cx=c.getContext('2d');cx.fillStyle=n%2?'#edf6ee':'#f3f1e8';cx.fillRect(0,0,c.width,c.height);pages.push({image:c.toDataURL('image/png'),width:c.width,height:c.height,number:n+1,total:mode==='pptx'?5:1});c.width=c.height=1;}const result=await BilgeRasterImport.commit({name:'Footer fixture.pptx',newNotebook:true,pages},BilgeRasterImport.capture());if(mode==='pdf')for(const item of notebookPages())item.pdf.name='Standalone fixture.pdf';renderPages();resize();drawAll();scheduleSave();return{ok:result.ok,count:notebookPages().length};},mode);
    assert.equal(added.ok,true);assert.equal(added.count,mode==='pptx'?5:1);await p.waitForFunction(()=>pdfBackgroundReady());
  }
  await p.evaluate(()=>{document.querySelector('#penOnly').checked=true;selectTool('pen');page().strokes.push({tool:'pen',color:'#173b36',width:3,points:[{x:40,y:60,p:.5},{x:180,y:80,p:.5}]});touchPage(page());drawAll();scheduleSave();});await save(p);await paint(p);
  assert.equal(await p.evaluate(()=>!!page().pdf),mode!=='plain');assert.equal(await p.evaluate(()=>BilgeSlideFlow.enabled()),mode==='pptx');assert.equal((await view(p)).zoom,1);
}
async function notes(p){return p.evaluate(()=>JSON.stringify(state.pages.map(item=>({id:item.id,strokes:item.strokes}))));}
async function view(p){return p.evaluate(()=>{const rect=canvas.getBoundingClientRect(),flow=BilgeSlideFlow.snapshot();return{zoom:viewZoom(),x:viewX(),y:flow?flow.scroll:viewY(),scale:paperScale(),maxX:maxViewX(),active:activeId,width:rect.width,height:rect.height,pan:!!pan,touches:touchPoints.size,suppress:suppressTouch,drawing,activePointer};});}
const footer=(p,mode)=>p.locator('bilge-defter-ui [data-zoom="'+mode+'"]');
async function tapZoom(p,mode,expected){await footer(p,mode).tap();await p.waitForFunction(expected=>viewZoom()===expected,expected);await paint(p);assert.equal((await view(p)).zoom,expected);}
async function pointer(p,type,x,y,id,pointerType='touch'){await p.locator('#canvas').evaluate((canvas,q)=>{const rect=canvas.getBoundingClientRect();canvas.dispatchEvent(new PointerEvent(q.type,{bubbles:true,cancelable:true,pointerId:q.id,pointerType:q.pointerType,isPrimary:q.id===11||q.pointerType==='pen',button:0,buttons:['pointerup','pointercancel'].includes(q.type)?0:1,pressure:.5,clientX:rect.left+q.x,clientY:rect.top+q.y}));},{type,x,y,id,pointerType});}
async function touch(p,type,points){await p.locator('#canvas').evaluate((canvas,{type,points})=>{const rect=canvas.getBoundingClientRect(),touches=points.map(([id,x,y])=>({identifier:id,target:canvas,clientX:rect.left+x,clientY:rect.top+y})),event=new Event(type,{bubbles:true,cancelable:true});for(const name of ['touches','targetTouches','changedTouches'])Object.defineProperty(event,name,{value:touches});canvas.dispatchEvent(event);},{type,points});}
async function startFingers(p,points){await pointer(p,'pointerdown',points[0][1],points[0][2],points[0][0]);await touch(p,'touchstart',[points[0]]);await pointer(p,'pointerdown',points[1][1],points[1][2],points[1][0]);await touch(p,'touchstart',points);assert.equal((await view(p)).pan,true,'Two real pointer contacts establish pan');}
async function moveFingers(p,points){for(const [id,x,y]of points)await pointer(p,'pointermove',x,y,id);const afterPointers=await view(p);await touch(p,'touchmove',points);await paint(p);return{afterPointers,afterTouch:await view(p)};}
async function endFingers(p,points,cancel=false){const event=cancel?'pointercancel':'pointerup',touchEvent=cancel?'touchcancel':'touchend';await pointer(p,event,points[0][1],points[0][2],points[0][0]);await touch(p,touchEvent,[points[1]]);await pointer(p,event,points[1][1],points[1][2],points[1][0]);await touch(p,touchEvent,[]);await paint(p);const state=await view(p);assert.equal(state.pan,false);assert.equal(state.touches,0);assert.equal(state.suppress,false);assert.equal(state.drawing,false);assert.equal(state.activePointer,null);return state;}
function near(actual,expected,message){assert.ok(Math.abs(actual-expected)<.02,message+': '+actual+' != '+expected);}
async function panContract(p){
  const before=await view(p),ink=await notes(p),cx=before.width/2,cy=Math.min(300,before.height*.65),start=[[11,cx-70,cy],[12,cx+70,cy]],micro=[[11,cx-91.5,cy-35],[12,cx+51.5,cy-35]],wide=[[11,cx-150,cy-65],[12,cx+80,cy-65]];
  await startFingers(p,start);const slight=await moveFingers(p,micro),spread=await moveFingers(p,wide);
  for(const [label,result,dx,dy]of [['three-pixel distance drift',slight,20,35],['large pinch-shaped distance change',spread,35,65]]){
    for(const state of [result.afterPointers,result.afterTouch]){assert.equal(state.zoom,before.zoom,label+' cannot zoom');near(state.x,Math.min(before.maxX,before.x+dx/before.scale),label+' horizontal midpoint pan');near(state.y,before.y+dy/before.scale,label+' vertical midpoint pan');}
    assert.deepEqual({x:result.afterTouch.x,y:result.afterTouch.y},{x:result.afterPointers.x,y:result.afterPointers.y},'Touch companion events do not apply the same pan twice');
  }
  const after=await endFingers(p,wide);assert.equal(after.zoom,before.zoom);assert.ok(after.y>before.y,'Vertical pan actually moved');if(before.maxX>before.x)assert.ok(after.x>before.x,'Horizontal pan moves when there is room');else near(after.x,before.x,'Width-fit horizontal position remains bounded');assert.equal(await notes(p),ink,'Two-finger motion creates, removes or changes no ink');return{before,slight,spread,after};
}
async function check(browser,engine,name,fn,viewport){
  if(caseFilter&&!name.includes(caseFilter))return;let f;console.log('RUN '+engine+': '+name);
  try{f=await fixture(browser,viewport);await f.start();const detail=await fn(f.p);assert.deepEqual(f.external,[],'No external network');assert.equal(f.requests.some(x=>x.method!=='GET'),false,'No upload/account mutation');assert.deepEqual(f.errors,[],'No uncaught app errors');assert.equal(f.context.serviceWorkers().length,0,'No service worker ran');report.results.push({engine,name,passed:true,detail});console.log('PASS '+engine+': '+name);}
  catch(error){let diagnostic;try{diagnostic=await view(f.p);await f.p.screenshot({path:path.join(out,engine+'-FAIL-'+name.replace(/[^a-z0-9]+/gi,'-')+'.png')});}catch{}report.results.push({engine,name,passed:false,error:String(error.stack||error),diagnostic});console.error('FAIL '+engine+': '+name+': '+error.message);}
  finally{if(f)await f.finish();}
}
async function run(browser,engine){
  for(const mode of ['plain','pdf','pptx']){
    await check(browser,engine,mode+' paired pointer and touch gestures pan without zoom',async p=>{await setup(p,mode);const widthFit=await panContract(p);for(let i=1;i<=4;i++)await tapZoom(p,'in',1+i*.25);const enlarged=await panContract(p);return{widthFit,enlarged};});
    await check(browser,engine,mode+' footer minus plus percent fit and bounds preserve ink',async p=>{
      await setup(p,mode);const ink=await notes(p);assert.equal(await footer(p,'out').isDisabled(),true);assert.equal(await footer(p,'fit').isEnabled(),true);await tapZoom(p,'in',1.25);await tapZoom(p,'out',1);
      for(let i=1;i<=8;i++)await tapZoom(p,'in',1+i*.25);assert.equal(await footer(p,'in').isDisabled(),true);assert.match(await footer(p,'fit').innerText(),/300/);await tapZoom(p,'fit',1);assert.equal((await view(p)).x,0);assert.match(await footer(p,'fit').innerText(),/100/);assert.equal(await footer(p,'out').isDisabled(),true);assert.equal(await notes(p),ink);return{minimum:1,maximum:3,step:.25,fit:1};
    });
    await check(browser,engine,mode+' canceled two finger gesture never traps the pen',async p=>{
      await setup(p,mode);for(let i=1;i<=4;i++)await tapZoom(p,'in',1+i*.25);const v=await view(p),start=[[11,v.width/2-60,160],[12,v.width/2+60,160]],moved=start.map(([id,x,y])=>[id,x-15,y-30]);await startFingers(p,start);await moveFingers(p,moved);const clean=await endFingers(p,moved,true),before=await notes(p),count=await p.evaluate(()=>state.pages.reduce((n,item)=>n+item.strokes.length,0));await p.waitForFunction(()=>pdfBackgroundReady());
      const point=await p.evaluate(()=>{const rect=canvas.getBoundingClientRect(),snapshot=BilgeSlideFlow.snapshot();if(!snapshot)return{x:Math.min(140,rect.width/2),y:Math.min(90,rect.height/2)};const row=snapshot.rows.find(item=>item.id===activeId),top=Math.max(0,(row.top-snapshot.scroll)*paperScale()),bottom=Math.min(rect.height,(row.top+row.height-snapshot.scroll)*paperScale());return{x:Math.min(140,rect.width/2),y:(top+bottom)/2};});
      await pointer(p,'pointerdown',point.x,point.y,73,'pen');assert.equal((await view(p)).drawing,true,'Fresh pen starts immediately after cancellation');await pointer(p,'pointermove',point.x+25,point.y+5,73,'pen');await pointer(p,'pointerup',point.x+35,point.y+8,73,'pen');await save(p);assert.equal((await view(p)).drawing,false);assert.equal(await p.evaluate(()=>state.pages.reduce((n,item)=>n+item.strokes.length,0)),count+1);assert.notEqual(await notes(p),before);return{clean,penRecovered:true};
    });
    if(mode!=='plain')await check(browser,engine,mode+' footer view contract and all notes survive save reload',async p=>{
      await setup(p,mode);for(let i=1;i<=4;i++)await tapZoom(p,'in',1+i*.25);await panContract(p);await save(p);const expected=await view(p),ink=await notes(p);
      const stored=await p.evaluate(async()=>{const saved=await dbGet(),item=saved.pages.find(item=>item.id===activeId);return{active:activeId,zoom:item.pdfZoom??1,x:item.viewX??0,localY:item.viewY??0};});assert.equal(stored.zoom,2,'Footer zoom is actually saved before reload');
      await p.reload();await p.waitForFunction(()=>typeof ready!=='undefined'&&ready&&window.__v2UI);await p.waitForFunction(()=>pdfBackgroundReady());await paint(p);const actual=await view(p);assert.equal(actual.active,expected.active);let restoredScroll=null;
      if(mode==='pdf'){assert.equal(actual.zoom,2);near(actual.x,expected.x,'Standalone PDF saved horizontal offset');near(actual.y,expected.y,'Standalone PDF saved vertical offset');}
      else{
        // Existing contract at ee44150, pdf-workspace.js ensure(): a NEW flow
        // opens width-fit (zoom 1, x 0), retains the selected page's local Y,
        // clamps it to the new viewport, then aligns to its physical pixel grid.
        // docs/SLIDE_FLOW.md also explicitly requires initial width-fit.
        assert.equal(actual.zoom,1,'Reopened continuous slides intentionally auto-fit width');assert.equal(actual.x,0);const layout=await p.evaluate(()=>BilgeSlideFlow.snapshot()),row=layout.rows.find(item=>item.id===stored.active);assert.ok(row);
        const requested=row.top+Math.min(row.height,Math.max(0,stored.localY)),limit=Math.max(0,layout.totalHeight-actual.height/actual.scale),pixels=actual.scale*2,bounded=Math.max(0,Math.min(limit,requested));restoredScroll=Math.max(0,Math.min(limit,Math.round(bounded*pixels)/pixels));near(actual.y,restoredScroll,'PPTX saved local position survives viewport clamp and DPR2 alignment');
      }
      assert.equal(await notes(p),ink);assert.equal(await p.evaluate(()=>validState(state)),true);return{expected,stored,actual,restoredScroll,contract:mode==='pdf'?'persisted PDF zoom and position':'initial PPTX width-fit with saved local position',notesRetained:true};
    });
    for(const viewport of [{width:844,height:390},{width:390,height:844}])await check(browser,engine,mode+' reachable footer '+viewport.width+'x'+viewport.height,async p=>{
      await setup(p,mode);const bounds=[];for(const name of ['out','fit','in']){const button=footer(p,name);assert.equal(await button.isVisible(),true,'Footer '+name+' remains visible');const b=await button.boundingBox();assert.ok(b&&b.width>=44&&b.height>=44,'Footer '+name+' target is at least 44 by 44 CSS pixels');assert.ok(b.x>=0&&b.y>=0&&b.x+b.width<=viewport.width+.5&&b.y+b.height<=viewport.height+.5,'Footer '+name+' stays inside viewport');bounds.push({name,...b});}
      const ink=await notes(p);await tapZoom(p,'in',1.25);await tapZoom(p,'fit',1);await tapZoom(p,'in',1.25);await tapZoom(p,'out',1);assert.equal(await notes(p),ink);const screenshot=path.join(out,engine+'-'+mode+'-'+viewport.width+'x'+viewport.height+'.png');await p.screenshot({path:screenshot});return{viewport,bounds,realTaps:true,screenshot};
    },viewport);
  }
}
(async()=>{
  try{for(const [name,type]of Object.entries({chromium,webkit})){if(engineFilter&&engineFilter!==name)continue;const browser=await type.launch({headless:true});try{await run(browser,name);}finally{await browser.close();}}assert.ok(report.results.length>0,'Case filter must select a real test');if(!caseFilter)assert.equal(report.results.length,engineFilter?17:34,'Complete declared coverage');}
  catch(error){report.harnessError=String(error.stack||error);process.exitCode=1;}
  finally{const after=Object.fromEntries([...snapshot(root)].map(([name,bytes])=>[name,sha(bytes)]).sort(([a],[b])=>a.localeCompare(b)));report.drift=[...new Set([...Object.keys(source),...Object.keys(after)])].filter(name=>source[name]!==after[name]);report.completedAt=new Date().toISOString();report.passed=report.results.filter(x=>x.passed).length;report.failed=report.results.filter(x=>!x.passed).length;if(report.failed||report.drift.length)process.exitCode=1;const file=path.join(out,'report.json');fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,failed:report.failed,drift:report.drift,harnessError:report.harnessError||null,report:file}));}
})();
