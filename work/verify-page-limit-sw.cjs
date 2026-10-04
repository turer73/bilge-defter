'use strict';
// Actual service-worker install/update/downgrade with synthetic 100-page saved data.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const out=path.join(__dirname,'../outputs/page-limit-sw');fs.mkdirSync(out,{recursive:true});
let version='v74',server,browser,completed=false;const results=[];
const root=()=>path.join(__dirname,'bilge-defter-invited-'+version);
const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.wasm':'application/wasm','.svg':'image/svg+xml'};
const pass=text=>{results.push(text);console.log('PASS '+text)};
const ready=p=>p.waitForFunction(()=>typeof ready!=='undefined'&&ready);
const snapshot=p=>p.evaluate(()=>JSON.stringify(state.pages.filter(x=>x.pdf).map(({id,title,pdf,strokes})=>({id,title,pdf,strokes}))));
// Poll inside the page: waitForFunction treats a Promise as a truthy result,
// even when the eventual boolean is false, so an async predicate is not a gate.
const waitState=(p,which)=>p.evaluate(which=>new Promise(async(resolve,reject)=>{
  const reg=await navigator.serviceWorker.getRegistration(),end=Date.now()+30000;
  const timer=setInterval(()=>{if(reg?.[which]?.state===(which==='waiting'?'installed':'activated')){clearInterval(timer);resolve(true)}else if(Date.now()>end){clearInterval(timer);reject(Error('Lifecycle timeout: '+which))}},50);
}),which);
async function transition(p,target){
  version=target;
  await p.evaluate(async()=>{await (await navigator.serviceWorker.getRegistration()).update()});
  await waitState(p,'waiting');
  assert.equal(await p.evaluate(()=>!!navigator.serviceWorker.controller),true,'Only test a controlled application');
  await p.evaluate(()=>document.querySelector('#pwaCheck').click());
  await p.waitForFunction(v=>typeof APP_VERSION!=='undefined'&&APP_VERSION===v,target,{timeout:45000});
  await ready(p);
}
(async()=>{
 try{
  server=http.createServer((req,res)=>{
   try{const u=new URL(req.url,'http://local'),file=path.resolve(root(),'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));
    assert(file.startsWith(root()+path.sep));res.writeHead(200,{'Cache-Control':'no-store','Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(fs.readFileSync(file));
   }catch{res.writeHead(404);res.end()}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true});const c=await browser.newContext(),p=await c.newPage();
  await c.addInitScript(()=>{window.__accountRequired=false;localStorage.setItem('bilge_defter_onboarding_v1','true')});
  const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(origin);await ready(p);
  await waitState(p,'active');
  await p.reload();await ready(p);
  assert.equal(await p.evaluate(()=>!!navigator.serviceWorker.controller),true);
  assert.equal(await p.evaluate(()=>APP_VERSION),'v74');
  await p.evaluate(async()=>{page().title='BEFORE_100_PAGES';scheduleSave();await flushSave()});
  await transition(p,'v75');pass('Real v74 service worker updates to v75 with the original notebook retained');
  assert.equal(await p.evaluate(()=>page().title),'BEFORE_100_PAGES');
  await p.evaluate(async()=>{
   const surface=document.createElement('canvas');surface.width=1000;surface.height=500;const ctx=surface.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,1000,500);ctx.fillStyle='#173b36';ctx.fillRect(50,50,300,100);const image=surface.toDataURL();surface.width=surface.height=1;
   const pages=Array.from({length:100},(_,i)=>({id:'sw-page-'+i,title:'Slayt '+(i+1),notebookId:'sw-book',strokes:[],pdf:{width:1000,height:500,number:i+1,total:100,name:'synthetic.pdf',image}}));
   const next={...state,version:Math.max(2,state.version),notebooks:[...(state.notebooks||[]),{id:'sw-book',title:'100 pages'}],pages:[...state.pages,...pages],active:pages[99].id,activeNotebook:'sw-book'};
   if(!validState(next))throw Error('Invalid test data');await dbPut(next,{preservePrevious:true});state=next;activeId=next.active;activeNotebook=next.activeNotebook;editRevision++;savedRevision=editRevision;renderPages();resize();scheduleAssetSweep();
  });
  await p.waitForFunction(()=>!savePromise&&!isDirty());
  const hundred=await snapshot(p);assert.equal(JSON.parse(hundred).length,100);
  await transition(p,'v74');assert.equal(await snapshot(p),hundred);pass('Real v75 -> v74 service-worker rollback preserves all 100 pages and images');
  await p.evaluate(async()=>{page().title='V74_LAST_PAGE_EDIT';scheduleSave();if(!await flushSave())throw Error('Save failed')});
  await p.reload();await ready(p);assert.equal(await p.evaluate(()=>page().title),'V74_LAST_PAGE_EDIT');
  assert.equal(await p.evaluate(()=>page().pdf.number),100);pass('v74 saves and reopens the last page of a v75 hundred-page notebook');
  const amended=await snapshot(p);await transition(p,'v75');assert.equal(await snapshot(p),amended);pass('Forward update to v75 preserves the compatibility-reader edit');
  assert.deepEqual(errors,[]);pass('No JavaScript errors during the real service-worker cycle');
  completed=true;
 }finally{
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({passed:results.length,failed:completed?0:1,results,physicalIPad:false,liveDeployment:false},null,2));
  await browser?.close();if(server)await new Promise(r=>server.close(r));
 }
})().catch(e=>{console.error(e);process.exitCode=1});
