'use strict';

// Synthetic timing regression: the real host is immutable for the duration of
// this run; only storage/renderer dependencies are replaced in HTTP responses.
// No account, presentation, production database or external network is used.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {chromium, webkit} = require('playwright');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const host = fs.readFileSync(path.join(__dirname, 'host.js'));
const model = fs.readFileSync(path.join(__dirname, 'model.js'));
const style = fs.readFileSync(path.join(__dirname, 'host.css'));
const storeFixture = `
export async function openStore() {
  let count = 0, first = true, rejectFirst;
  window.fixtureDisk = [];
  const pending = new Promise((_, reject) => { rejectFirst = reject; });
  window.fixtureFailSave = () => rejectFirst(Object.assign(Error('quota'), {code:'QUOTA'}));
  return {
    async list() { return structuredClone(window.fixtureDisk); },
    async create(value) {
      const item = {...structuredClone(value), id:String(++count), revision:1, updated:1, hash:'fixture'};
      if (count > 1) {
        window.fixtureCopyStarted = true;
        await new Promise(resolve => { window.fixtureFinishCopy = resolve; });
      }
      window.fixtureDisk.push(item);
      return structuredClone(item);
    },
    async saveNotes(id,revision,notes) {
      if(window.fixtureSuccessfulSaves) {
        const item=window.fixtureDisk.find(row=>row.id===id);
        if(!item||item.revision!==revision)throw Object.assign(Error('revision'),{code:'CONFLICT'});
        item.notes=structuredClone(notes);item.revision++;return structuredClone(item);
      }
      if (first) { first = false; await pending; }
      throw Object.assign(Error('quota'), {code:'QUOTA'});
    },
    close() {}
  };
}`;
const rendererFixture = `
export async function createRenderer(mount) {
  const element = document.createElement('div'); mount.append(element);
  return {element, load:async()=>{
      const meta=window.fixtureMeta||{slideCount:2,width:1000,height:562.5};
      element.style.width='1000px'; element.style.height=(1000*meta.height/meta.width)+'px';
      return meta;
    },
    show:async()=>({}), dispose(){element.remove();}};
}`;
const assets = new Map([
  ['/', {type:'text/html', body:'<!doctype html><link rel="stylesheet" href="/host.css"><main data-pptx-local-pilot></main><script type="module" src="/host.js"></script>'}],
  ['/host.js', {type:'text/javascript', body:host}],
  ['/model.js', {type:'text/javascript', body:model}],
  ['/host.css', {type:'text/css', body:style}],
  ['/store.js', {type:'text/javascript', body:storeFixture}],
  ['/renderer-bridge.js', {type:'text/javascript', body:rendererFixture}],
]);
const server = http.createServer((request, response) => {
  const item = request.method === 'GET' && assets.get(request.url);
  response.writeHead(item ? 200 : 404, {
    'Content-Type':item ? `${item.type}; charset=utf-8` : 'text/plain',
    'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff',
    'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'none'; img-src data: blob:; object-src 'none'; base-uri 'none'; form-action 'none'",
  });
  response.end(item ? item.body : 'Not found');
});

const labels = {copy:'copy while failed save has active stylus',narrow:'narrow 10:1 slide ink alignment',long:'long stroke retains tail geometry and single undo'};
async function check(engineName, engine, origin, scenario) {
  const narrow=scenario==='narrow';
  const browser = await engine.launch({headless:true});
  const context = await browser.newContext({serviceWorkers:'block',viewport:narrow?{width:320,height:800}:{width:1200,height:900}});
  if (narrow) await context.addInitScript(() => { window.fixtureMeta={slideCount:2,width:1000,height:100}; });
  if (scenario==='long') await context.addInitScript(() => { window.fixtureSuccessfulSaves=true; });
  const unexpectedRequests = [], errors = [];
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    unexpectedRequests.push(url.origin); return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(origin);
    await page.waitForFunction(() => !!window.pptxPilot);
    await page.locator('#pptxSource').setInputFiles({name:'synthetic.pptx',mimeType:'application/octet-stream',buffer:Buffer.from('PKXX')});
    await page.waitForFunction(() => window.pptxPilot.snapshot().phase === 'ready');
    if (narrow) {
      const bounds = await page.evaluate(() => {
        const ink=document.querySelector('#pptxInk').getBoundingClientRect();
        const slide=document.querySelector('#pptxFrame').firstElementChild.getBoundingClientRect();
        return {ink:{width:ink.width,height:ink.height},slide:{width:slide.width,height:slide.height}};
      });
      assert.ok(Math.abs(bounds.ink.width-bounds.slide.width)<1,`ink/slide width mismatch ${JSON.stringify(bounds)}`);
      assert.ok(Math.abs(bounds.ink.height-bounds.slide.height)<1,`ink/slide height mismatch ${JSON.stringify(bounds)}`);
      assert.deepEqual(unexpectedRequests,[]); assert.deepEqual(errors,[]);
      return {engine:engineName,test:'narrow 10:1 slide ink alignment',passed:true,hostSha256:sha(host),bounds};
    }
    if(scenario==='long') {
      const result=await page.evaluate(async()=>{
        const canvas=document.querySelector('#pptxInk'),rect=canvas.getBoundingClientRect();
        const point=(type,x,y)=>canvas.dispatchEvent(new PointerEvent(type,{
          bubbles:true,cancelable:true,pointerType:'pen',pointerId:51,button:0,
          buttons:type==='pointerup'?0:1,pressure:.5,
          clientX:rect.left+x*rect.width/1000,clientY:rect.top+y*rect.height/562.5,
        }));
        point('pointerdown',20,100);
        for(let i=1;i<=5105;i++){
          // The return-shaped tail occurs AFTER the old 5000-point cutoff;
          // preserving only pointerup cannot preserve its peak at (777.5,400).
          const y=i<4995?100:100+300*Math.max(0,1-Math.abs(i-5050)/55);
          point('pointermove',20+i*.15,y);
        }
        point('pointerup',790,100);
        await window.pptxPilot.flush();
        const strokes=fixtureDisk[0].notes.flatMap(row=>row.strokes),points=strokes.flatMap(stroke=>stroke.points);
        const drawn={chunks:strokes.length,points:points.length,
          largestChunk:Math.max(...strokes.map(stroke=>stroke.points.length)),
          peakRetained:points.some(p=>Math.abs(p.x-777.5)<.01&&Math.abs(p.y-400)<.01),
          state:window.pptxPilot.snapshot()};
        document.querySelector('#pptxUndo').click();await window.pptxPilot.flush();
        return {drawn,afterUndo:{state:window.pptxPilot.snapshot(),
          storedStrokes:fixtureDisk[0].notes.reduce((n,row)=>n+row.strokes.length,0)}};
      });
      assert.equal(result.drawn.peakRetained,true,'long stroke lost the return-shaped tail beyond point 5000');
      assert.ok(result.drawn.points>=5107,'one or more input coordinates were silently omitted');
      assert.ok(result.drawn.chunks>=2&&result.drawn.largestChunk<=5000,'segments must respect model point limits');
      assert.equal(result.drawn.state.dirty,false);
      assert.equal(result.afterUndo.state.strokeCount,0,'one pointer session must require only one undo');
      assert.equal(result.afterUndo.storedStrokes,0);
      assert.equal(result.afterUndo.state.dirty,false);
      assert.deepEqual(unexpectedRequests,[]);assert.deepEqual(errors,[]);
      return{engine:engineName,test:labels.long,passed:true,hostSha256:sha(host),...result};
    }
    await page.evaluate(async () => {
      const canvas = document.querySelector('#pptxInk'), rect = canvas.getBoundingClientRect();
      window.fixturePointer = (type, id, x) => canvas.dispatchEvent(new PointerEvent(type, {
        bubbles:true,cancelable:true,pointerType:'pen',pointerId:id,button:0,
        buttons:type === 'pointerup' ? 0 : 1,pressure:.5,clientX:rect.left+x,clientY:rect.top+10,
      }));
      fixturePointer('pointerdown',1,10); fixturePointer('pointerup',1,20);
      // A second stroke begins while the first save is still pending. Its
      // captured pointer can finish even after an asynchronous error disables
      // ordinary hit testing on the canvas.
      fixturePointer('pointerdown',2,30);
      fixtureFailSave();
    });
    await page.waitForFunction(() => window.pptxPilot.snapshot().lastError === 'QUOTA');
    const before = await page.evaluate(() => window.pptxPilot.snapshot());
    assert.equal(before.strokeCount,1); assert.equal(before.dirty,true);
    await page.locator('#pptxSaveCopy').click();
    await page.waitForFunction(() => window.fixtureCopyStarted === true);
    await page.evaluate(() => fixturePointer('pointerup',2,40));
    await page.evaluate(() => fixtureFinishCopy());
    await page.waitForFunction(() => !window.pptxPilot.snapshot().busy);
    const result = await page.evaluate(() => ({
      state:window.pptxPilot.snapshot(),
      storedCopyStrokes:fixtureDisk[1].notes.reduce((n,row)=>n+row.strokes.length,0),
      originalStrokes:fixtureDisk[0].notes.reduce((n,row)=>n+row.strokes.length,0),
    }));
    assert.equal(result.state.documentId,'2');
    assert.equal(result.state.dirty,false);
    assert.equal(result.state.lastError,null);
    assert.equal(result.originalStrokes,0,'failed original save must not become a write');
    assert.equal(result.state.strokeCount,result.storedCopyStrokes,
      `host incorrectly reports saved: UI=${result.state.strokeCount}, copied=${result.storedCopyStrokes}`);
    assert.equal(result.storedCopyStrokes,2,'recovery must preserve both the completed and visible in-progress stroke');
    assert.deepEqual(unexpectedRequests,[]); assert.deepEqual(errors,[]);
    return {engine:engineName,test:'copy while failed save has active stylus',passed:true,hostSha256:sha(host),...result};
  } finally { await context.close(); await browser.close(); }
}

(async () => {
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const results = [];
  try {
    for (const [name,engine] of [['chromium',chromium],['webkit',webkit]]) {
      for (const scenario of ['copy','narrow','long']) {
        try { results.push(await check(name,engine,origin,scenario)); }
        catch(error) { results.push({engine:name,test:labels[scenario],passed:false,hostSha256:sha(host),error:String(error.message).slice(0,1000)}); }
      }
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
  for (const result of results) console.log(JSON.stringify(result));
  const failed = results.filter(result => !result.passed).length;
  console.log(JSON.stringify({passed:results.length-failed,failed,
    sourceChangedDuringRun:sha(host)!==sha(fs.readFileSync(path.join(__dirname,'host.js'))),
    boundary:'Synthetic pointers and injected storage timing; not physical Apple Pencil acceptance.'}));
  process.exitCode = failed ? 1 : 0;
})().catch(error => { console.error(error.stack); server.close(); process.exitCode=1; });
