'use strict';
// Disposable staged-static acceptance. Do not run until the root agent says the
// SSH forward is ready. No production login, tokens, account or notebook access.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm'),assert=require('node:assert/strict');
const repo=path.resolve(__dirname,'..');
const {chromium,webkit}=require(path.join(repo,'node_modules/playwright'));
const root=path.join(repo,'work/bilge-defter-invited-v78'),out=path.join(repo,'outputs/direct-pptx-release-v78/stage-browser');
fs.mkdirSync(out,{recursive:true});
const supplied=process.env.BILGE_STAGE_ORIGIN;
assert.equal(supplied,'http://127.0.0.1:18819','Explicit reviewed stage forward BILGE_STAGE_ORIGIN=http://127.0.0.1:18819 required');
const origin=new URL(supplied).origin,account='11111111-1111-4111-8111-111111111111';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const files=new Map();
for(const line of fs.readFileSync(path.join(root,'SHA256SUMS'),'utf8').trim().split(/\r?\n/)){
  const match=/^([a-f0-9]{64})  (.+)$/.exec(line);assert.ok(match);const [_,digest,name]=match;
  assert.ok(!name.includes('..')&&!name.includes('\\')&&!name.includes(':')&&!name.startsWith('/'));
  const body=fs.readFileSync(path.join(root,name));assert.equal(sha(body),digest,'Local candidate hash '+name);files.set('/'+name,{body,digest});
}
assert.deepEqual(JSON.parse(files.get('/release.json').body),{version:'v78'});
const frame=files.get('/pptx/renderer-frame.html'),csp=frame.body.toString().match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
assert.ok(csp.startsWith("default-src 'none'; script-src 'sha256-")&&csp.includes("connect-src 'none'")&&!csp.includes("script-src 'unsafe-inline'"));
// Extract ONLY the already reviewed pure fixture builder, not the runnable suite.
const fixturePath=path.join(repo,'work/verify-pptx-notebook.cjs'),fixtureSource=fs.readFileSync(fixturePath,'utf8');
const start=fixtureSource.indexOf('function syntheticDeck() {'),end=fixtureSource.indexOf('const deck = syntheticDeck();',start);
assert.ok(start>=0&&end>start);const fixtureFunction=fixtureSource.slice(start,end).trim();
assert.ok(fixtureFunction.endsWith('}'));
const deck=vm.runInNewContext('('+fixtureFunction+')()', {Buffer}, {timeout:3000});
assert.equal(sha(deck),'b8c926e001e7366db05c0db69483a9ce9bf3053c1e048a09d8b58b5ebfedf98d','Reviewed deterministic 2-slide fixture drift');
const report={startedAt:new Date().toISOString(),origin,runnerSha256:sha(fs.readFileSync(__filename)),candidateManifestSha256:sha(fs.readFileSync(path.join(root,'SHA256SUMS'))),frameHtmlSha256:frame.digest,fixtureSha256:sha(deck),results:[],boundaries:[
  'Verified proxy: route.fetch reads actual forwarded nginx bytes/headers before route.fulfill forwards them unchanged; no static asset is substituted from local files.',
  'Static requests use Accept-Encoding identity and disallow redirects. This avoids browser response-body retention races after renderer disposal.',
  'Only GET whoami is fulfilled in this ephemeral browser with a synthetic approved identity; this does not test real login.',
  'Every other account/API/library/auth path and every non-GET request is blocked before it can reach the forward.',
  'No private teacher file, credentials, real accounts or production notes are used; source and pen data are synthetic.',
  'Service-worker API is removed only in the top-level test page; SW requests are blocked. Playwright global SW injection is not used in opaque frames.',
  'This is not offline/update acceptance. Physical iPad/Pencil/palm are not tested.'
]};
async function settle(page){await page.evaluate(async()=>{if(!await flushSave())throw Error('Initial save failed');await ensureAssets();if(!await flushSave())throw Error('Post-asset save failed');});}
async function stage(browserType,engine){
  let browser,context,page;const errors=[],outside=[],blocked=[],staticProof=[],checks=[],requests=[],requestFailures=[],measurementFailures=[];
  const check=async(name,fn)=>{try{const detail=await fn();report.results.push({engine,name,passed:true,detail});console.log('PASS '+engine+': '+name);}catch(error){report.results.push({engine,name,passed:false,error:String(error.stack||error)});throw error;}};
  try{
    browser=await browserType.launch({headless:true});context=await browser.newContext({viewport:{width:1024,height:768},deviceScaleFactor:2,hasTouch:true,acceptDownloads:false});context.setDefaultTimeout(25000);
    await context.addInitScript(origin=>{
      if(window.top!==window||location.origin!==origin)return;
      window.__accountRequired=true;localStorage.setItem('bilge_defter_onboarding_v1','true');try{delete Navigator.prototype.serviceWorker;}catch{}
      // Observe the real iframe while it exists. Successful preparation disposes
      // it in finally, before the user's ready-state button becomes actionable.
      // Do not hold, replace, or instrument the renderer and do not copy its token.
      const frames=new Map(),events=[];window.__stageFrameLifecycle=events;
      // Reading contentDocument on WebKit emits a security pageerror even when
      // the getter returns null. The genuine child's message origin is the
      // passive opaque-origin proof; never probe its cross-origin document.
      const sample=(frame,event,extra={})=>events.push({id:frames.get(frame),event,sandbox:frame.getAttribute('sandbox'),srcdoc:!!frame.getAttribute('srcdoc'),connected:frame.isConnected,...extra});
      const visit=(node,fn)=>{if(node.nodeType!==1)return;if(node.tagName==='IFRAME')fn(node);for(const frame of node.querySelectorAll('iframe'))fn(frame);};
      new MutationObserver(records=>{for(const record of records){
        if(record.type==='attributes'){if(frames.has(record.target))sample(record.target,'attribute');continue;}
        for(const node of record.addedNodes)visit(node,frame=>{if(frames.has(frame))return;frames.set(frame,frames.size+1);sample(frame,'inserted');frame.addEventListener('load',()=>sample(frame,'loaded'),{once:true});});
        for(const node of record.removedNodes)visit(node,frame=>{if(frames.has(frame))sample(frame,'removed');});
      }}).observe(document,{childList:true,subtree:true,attributes:true,attributeFilter:['sandbox','srcdoc']});
      addEventListener('message',event=>{if(event.data?.type!=='bilge-pptx-ready')return;for(const frame of frames.keys())if(event.source===frame.contentWindow)sample(frame,'ready-message',{origin:event.origin,opaque:event.origin==='null'});});
    },origin);
    await context.route('**/*',async route=>{
      const req=route.request(),url=new URL(req.url());
      if(!['http:','https:'].includes(url.protocol))return route.continue();
      if(url.origin!==origin){outside.push({origin:url.origin,method:req.method()});return route.abort();}
      const entry={path:url.pathname,method:req.method()};requests.push(entry);
      if(req.method()!=='GET'){blocked.push({...entry,reason:'mutation'});return route.fulfill({status:403,contentType:'application/json',body:'{"detail":"Blocked by isolated smoke"}'});}
      if(url.pathname==='/api/v1/bilge-defter/whoami')return route.fulfill({status:200,contentType:'application/json',headers:{'cache-control':'no-store'},body:JSON.stringify({account_protocol:'approval-v1',identity:{type:'access',id:account,status:'approved',role:'student',email:'stage-fixture@example.test'}})});
      if(/^\/(?:api|library|cdn-cgi)(?:\/|$)/.test(url.pathname)){blocked.push({...entry,reason:'account-service'});return route.fulfill({status:403,contentType:'application/json',body:'{"detail":"Blocked by isolated smoke"}'});}
      if(url.pathname==='/sw.js'){blocked.push({...entry,reason:'service-worker'});return route.fulfill({status:403,contentType:'text/plain',body:'SW excluded from staged-static acceptance'});}
      const key=url.pathname==='/'?'/index.html':url.pathname;
      if(!files.has(key)){blocked.push({...entry,reason:'not-reviewed-static'});return route.fulfill({status:404,contentType:'text/plain',body:'Not in reviewed static package'});}
      // Read before fulfilling: the app aborts its already consumed frame fetch
      // during dispose(). Chromium then discards its DevTools response body.
      // This remains the actual nginx response, not a local fixture response.
      const measurement=(async()=>{let actual;try{
        actual=await route.fetch({maxRedirects:0,timeout:25000,headers:{...req.headers(),'accept-encoding':'identity'}});
        assert.equal(actual.status(),200,key);assert.equal(new URL(actual.url()).origin,origin,key+' redirected origin');
        const body=await actual.body(),headers=actual.headers();assert.equal(sha(body),files.get(key).digest,'Actual stage bytes '+key);
        assert.ok(!headers['content-encoding']||headers['content-encoding']==='identity',key+' unexpected content encoding');
        assert.ok(headers['cache-control']?.includes('no-store'),key+' cache guard');assert.equal(headers['x-content-type-options'],'nosniff',key+' nosniff');
        if(key==='/pptx/renderer-frame.html'){assert.equal(headers['content-security-policy'],csp,'Actual nginx frame CSP');assert.ok(headers['content-type']?.startsWith('text/html'));}
        staticProof.push({path:key,sha256:sha(body),transport:'verified-nginx-response-proxy',...(key==='/pptx/renderer-frame.html'?{csp:headers['content-security-policy']}: {})});
        await route.fulfill({status:actual.status(),headers,body});
      }finally{await actual?.dispose();}})();
      checks.push(measurement);
      try{await measurement;}catch(error){measurementFailures.push({path:key,error:String(error.stack||error)});try{await route.abort();}catch{}}
    });
    const observe=()=>{page.on('pageerror',error=>errors.push(error.message));page.on('requestfailed',req=>requestFailures.push({url:req.url(),error:req.failure()?.errorText}));};
    page=await context.newPage();observe();
    await page.goto(origin);await page.waitForFunction(()=>typeof ready!=='undefined'&&ready&&window.__v2UI&&canEdit());await settle(page);
    const initial=await page.evaluate(()=>JSON.stringify(state));let image,ink,active;
    await check('actual Ekle menu and forwarded package expose v78 PowerPoint import',async()=>{
      assert.equal(await page.evaluate(()=>APP_VERSION),'v78');assert.equal(await page.evaluate(()=>DB),'bilge-defter-account-'+account);assert.equal(await page.evaluate(()=>'serviceWorker' in navigator),false,'Only top-level SW API disabled');
      await page.locator('bilge-defter-ui [data-panel="insert"]').click();await page.locator('bilge-defter-ui [data-command="presentation.native"]').click();await page.locator('#pptxImportDialog[open]').waitFor();
      const chooserEvent=page.waitForEvent('filechooser');await page.locator('#pptxNotebookChoose').click();const chooser=await chooserEvent;await chooser.setFiles({name:'stage-sentetik-anatomi.pptx',mimeType:'application/vnd.openxmlformats-officedocument.presentationml.presentation',buffer:deck});
      await page.waitForFunction(()=>['ready','error','uncertain'].includes(BilgePptx.snapshot().import?.phase),null,{timeout:60000});
      const result=await page.evaluate(()=>({snapshot:BilgePptx.snapshot(),status:document.querySelector('#pptxNotebookStatus').textContent}));assert.equal(result.snapshot.import.phase,'ready',JSON.stringify(result));assert.equal(await page.evaluate(()=>JSON.stringify(state)),initial,'Preparing must not modify notebook');
      assert.ok((await page.locator('#pptxNotebookApply').textContent()).includes('2'));
      const lifecycle=await page.evaluate(()=>window.__stageFrameLifecycle);
      assert.equal(lifecycle.filter(e=>e.event==='inserted').length,1,'Exactly one real renderer inserted');
      assert.ok(lifecycle.length>0&&lifecycle.every(e=>e.sandbox==='allow-scripts'&&e.srcdoc===true),'Sandbox/srcdoc changed during actual renderer lifecycle');
      const readyFrames=lifecycle.filter(e=>e.event==='ready-message');assert.ok(readyFrames.length>=1,'Actual child ready message was observed');
      assert.ok(readyFrames.every(e=>e.origin==='null'&&e.opaque===true&&e.connected===true),'Executing renderer must retain its opaque origin');
      assert.equal(lifecycle.filter(e=>e.event==='removed'&&!e.connected).length,1,'Renderer disposed after snapshots completed');
      assert.equal(await page.locator('iframe').count(),0,'Ready preview must not retain renderer iframe');
      await Promise.all(checks);assert.ok(staticProof.some(p=>p.path==='/pptx/renderer-frame.html'));
      return{slideCount:2,frameLifecycle:lifecycle,actualFrameCsp:true,rendererRemovedAfterReady:true};
    });
    await check('tablet and mobile preparation keep commit action visible and reachable',async()=>{
      const layouts=[];for(const[device,width,height]of[['tablet',1024,768],['mobile',390,844]]){await page.setViewportSize({width,height});const button=page.locator('#pptxNotebookApply');await button.scrollIntoViewIfNeeded();const layout=await button.evaluate(button=>{const r=button.getBoundingClientRect(),dialog=button.closest('dialog');return{width:innerWidth,height:innerHeight,left:r.left,right:r.right,top:r.top,bottom:r.bottom,hit:document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)===button,scroll:dialog.scrollWidth,client:dialog.clientWidth};});assert.ok(layout.left>=0&&layout.right<=width&&layout.top>=0&&layout.bottom<=height,JSON.stringify(layout));assert.equal(layout.hit,true);assert.ok(layout.scroll<=layout.client+1);layouts.push({device,...layout});await page.screenshot({path:path.join(out,engine+'-'+device+'-ready.png')});}
      await page.setViewportSize({width:1024,height:768});return layouts;
    });
    await check('two synthetic slides commit to ordinary notebook without changing original page',async()=>{
      await page.locator('#pptxNotebookApply').click();await page.waitForFunction(()=>!document.querySelector('#pptxImportDialog')?.open&&canEdit()&&pdfBackgroundReady());await settle(page);
      const result=await page.evaluate(()=>({state,active:activeId,db:DB}));assert.equal(result.state.pages.length,3);assert.deepEqual(result.state.pages[0],JSON.parse(initial).pages[0]);assert.ok(result.state.pages.slice(1).every(p=>p.pdf?.name==='stage-sentetik-anatomi.pptx'));active=result.active;image=result.state.pages.find(p=>p.id===active).pdf.image;
      return{pages:3,slides:2,accountScope:result.db};
    });
    await check('normal pen drawing saves and survives closing the app page and reopening',async()=>{
      await page.locator('bilge-defter-ui [data-v2-tool="pen"]').click();const before=await page.evaluate(()=>page().strokes.length);
      await page.locator('#canvas').evaluate(canvas=>{const r=canvas.getBoundingClientRect();for(const[type,dx]of[['pointerdown',0],['pointermove',30],['pointerup',60]])canvas.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:73,pointerType:'pen',button:0,buttons:type==='pointerup'?0:1,isPrimary:true,pressure:.5,clientX:r.left+140+dx,clientY:r.top+130}));});
      await page.waitForFunction(n=>page().strokes.length===n+1,before);await settle(page);ink=await page.evaluate(()=>page().strokes);assert.ok(ink.length>0);await Promise.all(checks);
      // A real page close/reopen, same ephemeral context. Storage persists here,
      // while no disk-backed browser profile or user's context is touched.
      await page.close();page=await context.newPage();observe();await page.goto(origin);await page.waitForFunction(()=>typeof ready!=='undefined'&&ready&&canEdit()&&pdfBackgroundReady());await settle(page);
      const reopened=await page.evaluate(()=>({version:APP_VERSION,pages:state.pages.length,active:activeId,image:page().pdf.image,ink:page().strokes}));assert.equal(reopened.version,'v78');assert.equal(reopened.pages,3);assert.equal(reopened.active,active);assert.equal(reopened.image,image);assert.deepEqual(reopened.ink,ink);
      const refs=await page.evaluate(async()=>(await dbGet()).pages.filter(p=>p.pdf).map(p=>p.pdf.image));assert.ok(refs.every(v=>/^asset:[a-f0-9]{64}$/.test(v)));
      for(const[device,width,height]of[['tablet',1024,768],['mobile',390,844]]){await page.setViewportSize({width,height});await page.screenshot({path:path.join(out,engine+'-'+device+'-reopened.png')});}
      return{pages:3,strokes:ink.length,assetReferences:refs.length,imageSha256:sha(image)};
    });
    await check('v78 continuous slides, hidden extra bar, marker strength and themed icons are served',async()=>{
      await page.setViewportSize({width:1024,height:768});
      await page.evaluate(()=>{
        const flow=BilgeSlideFlow.snapshot(),owner=flow.rows.find(row=>row.id===activeId);
        const viewportHeight=canvas.getBoundingClientRect().height/paperScale();
        scrollPaper(flow.rows[1].top-viewportHeight/2-owner.top);drawAll();
      });
      await page.waitForFunction(()=>BilgeSlideFlow.snapshot()?.visible.length>=2);
      const proof=await page.evaluate(()=>{
        const ui=document.querySelector('bilge-defter-ui').shadowRoot,logo=ui.querySelector('.brand-wordmark');
        return {dpr:devicePixelRatio,flow:BilgeSlideFlow.snapshot(),barHidden:document.querySelector('#pdfNavigation').hidden,
          marker:NEW_MARKER_OPACITY,icons:[...ui.querySelectorAll('svg')].map(x=>x.dataset.iconSet),
          logoMask:getComputedStyle(logo,'::before').maskImage||getComputedStyle(logo,'::before').webkitMaskImage};
      });
      assert.equal(proof.dpr,2);assert.equal(proof.barHidden,true);assert.equal(proof.marker,.4);
      assert.ok(proof.icons.length>15&&proof.icons.every(x=>x==='tabler'));assert.ok(proof.logoMask.includes('brand-mono-v51.png'));
      assert.ok(proof.flow.inkPixels<=8000000);await settle(page);
      await page.screenshot({path:path.join(out,engine+'-v78-continuous.png')});return proof;
    });
    await check('all forwarded responses match reviewed static bytes and no service calls escape',async()=>{await Promise.all(checks);assert.deepEqual(measurementFailures,[]);assert.deepEqual(outside,[]);assert.deepEqual(errors,[]);assert.deepEqual(requestFailures,[]);assert.equal(blocked.some(r=>r.reason==='mutation'),false,'App attempted a server write');assert.equal(blocked.some(r=>r.reason==='not-reviewed-static'),false,'Unexpected static path');assert.equal(blocked.some(r=>r.reason==='service-worker'),false,'Unexpected service-worker request');return{staticResponses:staticProof.length,uniqueStaticPaths:new Set(staticProof.map(p=>p.path)).size,blockedServiceReads:blocked.filter(r=>r.reason==='account-service'),pageErrors:0,external:0,mutations:0,measurement:'verified-nginx-response-proxy'};});
    report[engine]={staticProof,requests,blocked,errors,outside,requestFailures,measurementFailures};
  }catch(error){console.error(engine+': '+String(error.stack||error));if(!report.results.some(r=>r.engine===engine&&!r.passed))report.results.push({engine,name:'setup',passed:false,error:String(error.stack||error)});report[engine]={staticProof,requests,blocked,errors,outside,requestFailures,measurementFailures};if(page)try{await page.screenshot({path:path.join(out,engine+'-failed.png')});}catch{}}
  finally{await context?.close();await browser?.close();}
}
(async()=>{for(const[name,type]of[['chromium',chromium],['webkit',webkit]])await stage(type,name);report.finishedAt=new Date().toISOString();report.passed=report.results.filter(r=>r.passed).length;report.failed=report.results.filter(r=>!r.passed).length;report.drift=[...files].filter(([name,f])=>sha(fs.readFileSync(path.join(root,name.slice(1))))!==f.digest).map(([name])=>name);fs.writeFileSync(path.join(out,'stage-browser-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,failed:report.failed,drift:report.drift}));if(report.failed||report.drift.length)process.exitCode=1;})().catch(error=>{console.error(error);process.exitCode=1;});
