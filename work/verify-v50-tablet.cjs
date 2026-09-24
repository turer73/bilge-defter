// Synthetic, isolated Chromium contexts only. No real notebooks or live requests.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(process.env.BILGE_TEST_ROOT||path.join(__dirname,'bilge-defter-invited-v50'));
const output=path.resolve(__dirname,'../outputs/v50');fs.mkdirSync(output,{recursive:true});
const origin='http://127.0.0.1:49230',results=[],errors=[];let browser;
const pass=name=>{results.push(name);console.log('PASS '+name)};
async function fixture(width,height){
 const c=await browser.newContext({viewport:{width,height},hasTouch:true,serviceWorkers:'block'}),calls=[];
 await c.addInitScript(()=>window.__syncInvited=true);
 await c.route('**/*',async r=>{const u=new URL(r.request().url());if(u.origin!==origin)return r.abort();
  if(u.pathname.endsWith('/ocr')){calls.push(r.request().postDataJSON());return r.fulfill({contentType:'application/json',body:JSON.stringify({text:'Sentetik sonuç; kalite ölçümü değildir.'})})}
  if(u.pathname.includes('/api/'))return r.fulfill({status:404,contentType:'application/json',body:'{}'});
  const file=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':decodeURIComponent(u.pathname)));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return r.fulfill({status:404,body:''});
  return r.fulfill({contentType:({'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.wasm':'application/wasm'})[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
 });
 const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(origin);await p.waitForFunction(()=>typeof ready!=='undefined'&&ready&&window.__v2Bridge);
 return {c,p,ui:p.locator('bilge-defter-ui'),calls};
}
async function rects(p,selector){return p.locator(selector).evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}}))}
function separate(a,b){return a.right<=b.x+.5||b.right<=a.x+.5||a.bottom<=b.y+.5||b.bottom<=a.y+.5}
(async()=>{try{
 browser=await chromium.launch({headless:true});
 for(const [w,h] of [[375,812],[768,1024],[820,1180],[1024,768],[1180,820],[1440,900]]){
  const {c,p,ui}=await fixture(w,h);
  await p.evaluate(()=>document.querySelector('bilge-defter-ui').buttonTheme.usePreset('bilge'));
  const toolbar=await ui.locator('.navrow .nav-button').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length).map(n=>{const r=n.getBoundingClientRect(),hit=n.getRootNode().elementFromPoint(r.right-3,r.y+r.height/2);return {name:n.textContent.trim(),right:r.right,left:r.left,hit:n===hit||n.contains(hit)}}));
  assert.ok(toolbar.every(n=>n.left>=0&&n.right<=w&&n.hit),JSON.stringify({w,toolbar}));
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await p.screenshot({path:path.join(output,`toolbar-${w}.png`)});
  await ui.locator('[data-panel="settings"]').tap();await ui.locator('dialog[data-panel="settings"][open]').waitFor();
  assert.equal(await ui.locator('#bdx-panel-title').evaluate(n=>getComputedStyle(n).outlineStyle),'none');
  await p.keyboard.press('Tab');assert.notEqual(await ui.evaluate(n=>getComputedStyle(n.shadowRoot.activeElement).outlineStyle),'none');
  await p.keyboard.press('Escape');pass(`${w}x${h}: navigation is uncut, settings opens; keyboard focus retained`);
  await p.evaluate(async()=>{document.querySelector('#newPage').click();document.querySelector('#newPage').click();await flushSave()});
  await ui.locator('button[data-panel="library"]').tap();const panel=ui.locator('dialog.panel');
  const space=await panel.evaluate(n=>{const b=n.querySelector('.panel-body');return {height:n.getBoundingClientRect().height,blank:b.clientHeight-b.firstElementChild.getBoundingClientRect().height}});
  assert.ok(space.blank<80,JSON.stringify(space));assert.ok(space.height<=h-20);
  await ui.locator('[data-return-editor]').click();await ui.locator('button[data-panel="library"]').tap();
  await p.screenshot({path:path.join(output,`library-${w}.png`)});await p.keyboard.press('Escape');pass(`${w}x${h}: library fits content with reachable footer`);
  await ui.locator('[data-panel="study"]').tap();await ui.locator('[data-command="study.planner"]').click();
  await p.locator('#plannerDay').scrollIntoViewIfNeeded();const [a,b]=await rects(p,'#plannerDay,#plannerNew');assert.ok(separate(a,b),JSON.stringify({w,a,b}));assert.ok(a.right<=w);
  await p.screenshot({path:path.join(output,`planner-${w}.png`)});
  await p.locator('#plannerDialog').evaluate(n=>n.scrollTop=0);
  if(w===1180)await p.screenshot({path:path.join(output,'planner-overview.png')});
  await p.locator('#plannerNew').click();await p.locator('#plannerName').fill('Sentetik ders');await p.locator('#plannerSubmit').click();
  await p.waitForFunction(()=>state.planner.items.some(x=>x.title==='Sentetik ders'));assert.equal(await p.evaluate(()=>flushSave()),true);
  await p.locator('#plannerClose').click();await p.reload();await p.waitForFunction(()=>ready);
  assert.equal(await p.evaluate(()=>state.planner.items.some(x=>x.title==='Sentetik ders')),true);pass(`${w}x${h}: calendar date does not overlap; lesson saves and reopens`);
  await c.close();
 }
 const {c,p,calls}=await fixture(1180,820);
 await p.evaluate(async()=>{page().title='<img src=x onerror="window.__injected=1">';scheduleSave();await flushSave()});
 await p.waitForFunction(()=>document.querySelector('bilge-defter-ui').shadowRoot.querySelector('.page-title').textContent.includes('<img'));
 assert.equal(await p.evaluate(()=>window.__injected),undefined);assert.equal(await p.locator('bilge-defter-ui .page-title img').count(),0);pass('Untrusted page title stays text, not executable HTML');
 await p.evaluate(async()=>{page().title='Sentetik denetim sayfası';scheduleSave();await flushSave()});
 await p.evaluate(async()=>{page().strokes=[100,450,1200].map(y=>({tool:'pen',color:'#ccddff',width:2,points:[{x:80,y,p:.5},{x:380,y:y+15,p:.5}]}));page().strokes.push({tool:'marker',color:'#ffff00',width:20,points:[{x:50,y:100},{x:400,y:100}]});scheduleSave();await flushSave();document.querySelector('#ocrOpen').click()});
 const before=await p.evaluate(()=>JSON.stringify(page().strokes));await p.locator('#ocrPreview').evaluate(n=>n.decode());
 assert.equal(calls.length,0);assert.equal(await p.locator('#ocrScope option').count(),4);
 const first=await p.locator('#ocrPreview').evaluate(n=>({w:n.naturalWidth,h:n.naturalHeight}));assert.ok(first.h<100);
 const colors=await p.locator('#ocrPreview').evaluate(n=>{const c=document.createElement('canvas');c.width=n.naturalWidth;c.height=n.naturalHeight;const x=c.getContext('2d');x.drawImage(n,0,0);const d=x.getImageData(0,0,c.width,c.height).data;let dark=0,colored=0;for(let i=0;i<d.length;i+=4){if(d[i]<60)dark++;if(d[i]!==d[i+1]||d[i]!==d[i+2])colored++}return {dark,colored}});
 assert.ok(colors.dark>0);assert.equal(colors.colored,0);assert.equal(await p.evaluate(()=>JSON.stringify(page().strokes)),before);
 pass('OCR: separated regions, black-on-white copy, original ink unchanged and no automatic upload');
 await p.locator('#ocrRetry').click();await p.waitForFunction(()=>!document.querySelector('#ocrInsert').disabled);assert.equal(calls.length,1);assert.deepEqual(Object.keys(calls[0]),['image']);
 await p.locator('#ocrScope').selectOption('1');assert.equal(await p.locator('#ocrResult').inputValue(),'');assert.equal(await p.locator('#ocrInsert').isDisabled(),true);assert.equal(calls.length,1);
 await p.screenshot({path:path.join(output,'ocr-region.png')});pass('OCR: explicit request only, scope change invalidates old result');
 await p.locator('#ocrClose').click();await p.evaluate(()=>{page().strokes=[{tool:'pen',color:'#ffccdd',width:2,points:[{x:50,y:50},{x:100,y:50}]},{tool:'eraser',color:'#000000',width:40,points:[{x:30,y:50},{x:120,y:50}]}];document.querySelector('#ocrOpen').click()});
 assert.equal(await p.locator('#ocrRetry').isDisabled(),true);assert.equal(await p.locator('#ocrPreview').isHidden(),true);assert.equal(calls.length,1);pass('OCR: erased ink cannot be uploaded or resurrected');
 await p.locator('#ocrClose').click();
 const ui=p.locator('bilge-defter-ui');
 await ui.locator('[data-focus]').first().click();assert.ok((await p.locator('#canvas').boundingBox()).height>300);await ui.locator('[data-focus]').first().click();pass('Focus mode can be entered and exited on tablet without hiding the paper');
 await ui.locator('button[data-panel="insert"]').click();await ui.locator('[data-command="insert.text"]').click();
 await p.locator('#layoutText').fill('Sentetik Türkçe not');await p.locator('#layoutFont').fill('32');await p.locator('#layoutAngle').fill('30');
 assert.equal(await p.evaluate(()=>page().strokes.some(s=>s.text==='Sentetik Türkçe not')),false);
 await p.locator('#layoutDone').click();assert.equal(await p.evaluate(()=>flushSave()),true);assert.deepEqual(await p.evaluate(()=>({text:page().strokes.at(-1).text,rotation:page().strokes.at(-1).rotation,font:page().strokes.at(-1).fontSize})),{text:'Sentetik Türkçe not',rotation:30,font:32});pass('Text font and rotation are applied during first placement and saved once');
 const png=await p.evaluate(()=>{const c=document.createElement('canvas');c.width=160;c.height=90;const x=c.getContext('2d');x.fillStyle='#2c6655';x.fillRect(0,0,160,90);return c.toDataURL().split(',')[1]});
 await ui.locator('button[data-panel="insert"]').click();const chooser=p.waitForEvent('filechooser');await ui.locator('[data-command="insert.image"]').click();await (await chooser).setFiles({name:'synthetic.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
 await p.waitForFunction(()=>mediaPending?.draft.tool==='image');await p.locator('#layoutWidth').fill('220');await p.locator('#layoutAngle').fill('90');await p.locator('#layoutDone').click();await p.evaluate(()=>flushSave());
 assert.equal(await p.evaluate(()=>page().strokes.at(-1).rotation),90);const note=await p.evaluate(()=>JSON.stringify(page().strokes));await p.reload();await p.waitForFunction(()=>ready);assert.equal(await p.evaluate(()=>JSON.stringify(page().strokes)),note);pass('Image file picker, initial sizing and rotation survive reload with text and ink');
 await ui.locator('button[data-panel="study"]').click();await ui.locator('[data-command="study.dictionary"]').click();await p.getByText(/Cihazdaki sınırlı sözlük/).waitFor();await p.locator('#dictQuery').fill('astım');await p.waitForFunction(()=>document.querySelector('#dictCount').textContent.includes('cihazdaki alt küme'));assert.ok(await p.locator('.dict-entry').count()>0);await p.locator('#dictClose').click();pass('Dictionary missing server route falls back visibly to the local subset');
 await c.route('**/dictionaries',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({dictionaries:[{id:'test',name:'Synthetic',count:1}]})}));
 let release,started;const pending=new Promise(r=>release=r),requested=new Promise(r=>started=r);
 await c.route('**/dictionaries/test/search?**',async r=>{started();await pending;await r.fulfill({contentType:'application/json',body:JSON.stringify({results:[{term:'OLD',def:'Must not reappear'}]})})});
 await ui.locator('button[data-panel="study"]').click();await ui.locator('[data-command="study.dictionary"]').click();await p.waitForFunction(()=>document.querySelector('#dictSelect').options.length===1);
 await p.locator('#dictQuery').fill('old');await requested;await p.locator('#dictQuery').fill('');release();await p.waitForResponse(r=>r.url().includes('/dictionaries/test/search'));await p.evaluate(()=>new Promise(r=>setTimeout(r,50)));assert.equal(await p.locator('.dict-entry').count(),0);await p.locator('#dictClose').click();pass('Dictionary ignores late response after the query is cleared');
 await ui.locator('button[data-panel="insert"]').click();await ui.locator('[data-command="pdf.open"]').click();
 const prior=await p.evaluate(()=>JSON.stringify(state));await p.locator('#pdfFile').setInputFiles({name:'bad.pdf',mimeType:'application/pdf',buffer:Buffer.from('invalid')});await p.waitForFunction(()=>!pdfBusy);assert.equal(await p.evaluate(()=>JSON.stringify(state)),prior);assert.equal(await p.locator('#pdfApply').isDisabled(),true);pass('Invalid PDF cannot alter the saved notebook');
 const pdf=await p.evaluate(async()=>{const c=document.createElement('canvas');c.width=160;c.height=200;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,160,200);x.fillStyle='black';x.fillText('SYNTHETIC PDF',10,30);const bytes=Uint8Array.from(atob(c.toDataURL('image/jpeg').split(',')[1]),s=>s.charCodeAt(0));const b=rasterPdfBuilder();b.page(bytes,160,200);return Array.from(new Uint8Array(await b.finish().arrayBuffer()))});
 await p.locator('#pdfFile').setInputFiles({name:'synthetic.pdf',mimeType:'application/pdf',buffer:Buffer.from(pdf)});await p.waitForFunction(()=>!!pdfPending&&!pdfBusy);await p.locator('#pdfApply').click();await p.waitForFunction(()=>!!page()?.pdf&&pdfBackgroundReady());
 assert.ok(await p.evaluate(()=>state.pages.some(p=>p.strokes.some(s=>s.text==='Sentetik Türkçe not'))));
 const area=await p.locator('#canvas').boundingBox();await p.mouse.move(area.x+80,area.y+80);await p.mouse.down();await p.mouse.move(area.x+180,area.y+100,{steps:8});await p.mouse.up();await p.evaluate(()=>flushSave());assert.ok(await p.evaluate(()=>page().strokes.length)>0);pass('PDF imports to a separate notebook and accepts annotation without replacing earlier notes');
 await ui.locator('button[data-panel="file"]').click();await ui.locator('[data-command="pdf.export"]').click();await p.locator('#pdfExportStart').click();await p.locator('#pdfExportDownload').waitFor({state:'visible'});
 const pages=await p.evaluate(async()=>{const bytes=await (await fetch(pdfExportUrl)).arrayBuffer();const task=pdfLibrary.getDocument({data:bytes,isEvalSupported:false});try{return (await task.promise).numPages}finally{await task.destroy()}});assert.equal(pages,1);await p.screenshot({path:path.join(output,'pdf-export.png')});pass('Annotated PDF export can be parsed back by the actual PDF reader');
 await c.close();assert.deepEqual(errors,[]);pass('No uncaught JavaScript errors across new regression scenarios');
}catch(e){console.error(e);process.exitCode=1}finally{await browser?.close();fs.writeFileSync(path.join(output,'tablet-results.json'),JSON.stringify({passed:results.length,failed:process.exitCode?1:0,results,errors,engine:'Chromium',physicalTablet:false},null,2))}})();
