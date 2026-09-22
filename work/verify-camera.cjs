const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/sevdi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
let browser,server;const results=[],pass=s=>{results.push(s);console.log('PASS '+s)};
(async()=>{try{
 server=http.createServer(async(req,res)=>{try{const n=new URL(req.url,'http://local').pathname.slice(1)||'index.html',data=await fs.readFile(path.join(__dirname,'bilge-defter-invited-v42',n));res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm'})[path.extname(n)]||'application/octet-stream'});res.end(data)}catch{res.writeHead(404);res.end()}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin=process.env.BILGE_TEST_ORIGIN||`http://127.0.0.1:${server.address().port}`;browser=await chromium.launch({headless:true});const c=await browser.newContext({viewport:{width:1180,height:900}}),p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(origin);await p.waitForFunction(()=>ready);
 async function saved(){await p.waitForFunction(()=>!isDirty()&&!savePromise&&!saveFailed&&!saveConflict)}
 await p.locator('#toolsToggle').click();
 assert.equal(await p.locator('#cameraFile').getAttribute('capture'),'environment');
 assert.equal(await p.locator('#cameraFile').getAttribute('accept'),'image/*');
 assert.equal(await p.locator('#cameraAdd').isVisible(),true);
 pass('The camera input uses the environment capture attribute and its button is in the add group');
 const png=await p.evaluate(()=>{const c=document.createElement('canvas');c.width=640;c.height=480;const x=c.getContext('2d');x.fillStyle='#2c6e49';x.fillRect(0,0,640,480);x.fillStyle='#ffffff';x.fillRect(200,120,240,200);return c.toDataURL('image/png')});
 await p.locator('#cameraFile').setInputFiles({name:'photo.jpg',mimeType:'image/jpeg',buffer:Buffer.from(png.split(',')[1],'base64')});
 await p.locator('#layoutBar').waitFor({state:'visible'});
 assert.match(await p.locator('#layoutLabel').textContent(),/İlk yerleşim/);
 await p.locator('#layoutDone').click();await saved();
 const state=await p.evaluate(()=>({tool:page().strokes[0]?.tool,kind:page().strokes[0]?.tool==='image'?'image':'other',count:page().strokes.length}));
 assert.equal(state.tool,'image');
 pass('A camera photo opens the first-placement flow and commits as an image stroke');
 const r=await p.locator('#canvas').boundingBox();await p.mouse.move(r.x+80,r.y+60);await p.mouse.down();await p.mouse.move(r.x+300,r.y+90,{steps:10});await p.mouse.up();await saved();
 assert.deepEqual(await p.evaluate(()=>page().strokes.map(s=>s.tool)),['image','pen']);
 assert.ok(await p.evaluate(()=>{const c=document.createElement('canvas');c.width=200;c.height=150;const x=c.getContext('2d');drawMediaStroke(page().strokes[0],x);return x.getImageData(100,75,1,1).data[3]>0}));
 pass('Pen ink annotates on top of the photo and both layers persist together');
 await p.locator('#toolsToggle').click();const dl=p.waitForEvent('download');await p.locator('#exportBtn').click();const backup=JSON.parse(await fs.readFile(await(await dl).path(),'utf8'));assert.equal(backup.pages[0].strokes[0].tool,'image');assert.ok(backup.pages[0].strokes[0].image.startsWith('data:image/png;base64,'));await p.locator('#toolsClose').click();
 await p.reload();await p.waitForFunction(()=>ready);assert.deepEqual(await p.evaluate(()=>page().strokes.map(s=>s.tool)),['image','pen']);
 pass('The photo and its ink survive reload and are embedded in the JSON backup');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:results.length,results,physicalCamera:'pending'},null,2));
 }finally{await browser?.close();if(server)await new Promise(r=>server.close(r))}})().catch(e=>{console.error(e);process.exitCode=1});
