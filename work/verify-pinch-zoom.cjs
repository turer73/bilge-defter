const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/sevdi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
let browser,server;const results=[],pass=s=>{results.push(s);console.log('PASS '+s)};
(async()=>{try{
 server=http.createServer(async(req,res)=>{try{const n=new URL(req.url,'http://local').pathname.slice(1)||'index.html',data=await fs.readFile(path.join(__dirname,'bilge-defter-invited-v46',n));res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm'})[path.extname(n)]||'application/octet-stream'});res.end(data)}catch{res.writeHead(404);res.end()}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin=process.env.BILGE_TEST_ORIGIN||`http://127.0.0.1:${server.address().port}`;browser=await chromium.launch({headless:true});const c=await browser.newContext({viewport:{width:1180,height:900},hasTouch:true}),p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(origin);await p.waitForFunction(()=>ready);
 async function saved(){await p.waitForFunction(()=>!isDirty()&&!savePromise&&!saveFailed&&!saveConflict)}
 const fixture=await p.evaluate(()=>{const c=document.createElement('canvas');c.width=1000;c.height=1400;const x=c.getContext('2d');x.fillStyle='#ffffff';x.fillRect(0,0,1000,1400);return {version:2,pages:[{id:'p1',title:'PDF',strokes:[],viewY:0,pdf:{image:c.toDataURL(),width:1000,height:1400,name:'a.pdf',number:1,total:1}}],active:'p1'}});
 await p.locator('#importFile').setInputFiles({name:'b.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});await p.locator('#backupApply').click();await p.waitForFunction(()=>document.querySelector('#saveState').textContent==='Yedek geri yüklendi');await p.waitForFunction(()=>pdfBackgroundReady());
 async function pinch(from,to){
  const r=await p.locator('#canvas').boundingBox(),cx=r.x+r.width/2,cy=r.y+r.height/2,cdp=await c.newCDPSession(p);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cx-from,y:cy,id:1},{x:cx+from,y:cy,id:2}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx-to,y:cy,id:1},{x:cx+to,y:cy,id:2}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await saved();
 }
 assert.equal(await p.evaluate(()=>pdfZoom()),1);
 await pinch(60,110);
 const zoomAfter=await p.evaluate(()=>pdfZoom());
 assert.ok(zoomAfter>1.4,`zoom ${zoomAfter} beklenenden kucuk`);
 assert.ok(zoomAfter<3);
 assert.equal(await p.evaluate(()=>validState(state)),true);
 pass('A two-finger spread zooms the PDF in, clamps to the range and stays a valid book');
 await pinch(60,25);
 assert.equal(await p.evaluate(()=>pdfZoom()),1);
 pass('A two-finger pinch zooms back out to the minimum');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:results.length,results,physicalDevice:'pending'},null,2));
 }finally{await browser?.close();if(server)await new Promise(r=>server.close(r))}})().catch(e=>{console.error(e);process.exitCode=1});
