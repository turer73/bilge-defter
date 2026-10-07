'use strict';
// Local-only raster contract tests. Synthetic OOXML by default; the approved
// private deck is opt-in and never served, uploaded, modified or committed.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright');
const repo=path.resolve(__dirname,'..'),pilot=path.join(__dirname,'pptx-pilot'),out=path.join(repo,'outputs/pptx-v76-release/raster-probe');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const engineArg=process.argv.find(x=>x.startsWith('--engine='))?.slice(9),sourceArg=process.argv.find(x=>x.startsWith('--source='))?.slice(9),all=process.argv.includes('--all-slides');
assert.ok(!engineArg||['chromium','webkit'].includes(engineArg));fs.mkdirSync(out,{recursive:true});
const crc=bytes=>{let c=0xffffffff;for(const byte of bytes){c^=byte;for(let i=0;i<8;i++)c=(c>>>1)^(c&1?0xedb88320:0);}return(c^0xffffffff)>>>0;};
function png(w,h){
 const raw=Buffer.alloc((w*4+1)*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const p=y*(w*4+1)+1+x*4;raw[p]=x<w/2?239:37;raw[p+1]=x<w/2?68:99;raw[p+2]=x<w/2?68:235;raw[p+3]=255;}
 const chunk=(name,data)=>{const n=Buffer.from(name),head=Buffer.alloc(4),tail=Buffer.alloc(4);head.writeUInt32BE(data.length);tail.writeUInt32BE(crc(Buffer.concat([n,data])));return Buffer.concat([head,n,data,tail]);};
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=6;return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
function zip(parts){
 const local=[],central=[];let offset=0;
 for(const[name,text]of Object.entries(parts)){const file=Buffer.from(name),body=Buffer.isBuffer(text)?text:Buffer.from(text),sum=crc(body),l=Buffer.alloc(30),c=Buffer.alloc(46);l.writeUInt32LE(0x04034b50);l.writeUInt16LE(20,4);l.writeUInt32LE(sum,14);l.writeUInt32LE(body.length,18);l.writeUInt32LE(body.length,22);l.writeUInt16LE(file.length,26);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt32LE(sum,16);c.writeUInt32LE(body.length,20);c.writeUInt32LE(body.length,24);c.writeUInt16LE(file.length,28);c.writeUInt32LE(offset,42);local.push(l,file,body);central.push(c,file);offset+=l.length+file.length+body.length;}
 const dir=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(Object.keys(parts).length,8);end.writeUInt16LE(Object.keys(parts).length,10);end.writeUInt32LE(dir.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...local,dir,end]);
}
function syntheticDeck(){
 const P='http://schemas.openxmlformats.org/presentationml/2006/main',A='http://schemas.openxmlformats.org/drawingml/2006/main',R='http://schemas.openxmlformats.org/officeDocument/2006/relationships',REL='http://schemas.openxmlformats.org/package/2006/relationships';
 const parts={
  '[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="png" ContentType="image/png"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>'+[1,2].map(n=>`<Override PartName="/ppt/slides/slide${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('')+'</Types>',
  '_rels/.rels':`<Relationships xmlns="${REL}"><Relationship Id="rId1" Type="${R}/officeDocument" Target="ppt/presentation.xml"/></Relationships>`,
  'ppt/presentation.xml':`<p:presentation xmlns:p="${P}" xmlns:r="${R}"><p:sldIdLst><p:sldId id="256" r:id="rId1"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst><p:sldSz cx="9144000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`,
  'ppt/_rels/presentation.xml.rels':`<Relationships xmlns="${REL}">`+[1,2].map(n=>`<Relationship Id="rId${n}" Type="${R}/slide" Target="slides/slide${n}.xml"/>`).join('')+'</Relationships>',
  'ppt/media/test.png':png(40,40)
 };
 for(const n of[1,2]){
  parts[`ppt/slides/_rels/slide${n}.xml.rels`]=`<Relationships xmlns="${REL}"><Relationship Id="image1" Type="${R}/image" Target="../media/test.png"/></Relationships>`;
  parts[`ppt/slides/slide${n}.xml`]=`<p:sld xmlns:p="${P}" xmlns:a="${A}" xmlns:r="${R}"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="${n===1?'D9EAF7':'E2F0D9'}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id="2" name="Text"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="914400" y="914400"/><a:ext cx="6400800" cy="914400"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="2800"><a:solidFill><a:srgbClr val="111827"/></a:solidFill><a:latin typeface="Arial"/></a:rPr><a:t>Raster Test ${n}</a:t></a:r></a:p></p:txBody></p:sp><p:pic><p:nvPicPr><p:cNvPr id="3" name="Fixture"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="image1"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="914400" y="2743200"/><a:ext cx="1828800" cy="1828800"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
 }
 return zip(parts);
}
const synthetic=syntheticDeck();let privateBytes;
if(sourceArg){privateBytes=fs.readFileSync(path.resolve(sourceArg));assert.equal(privateBytes.length,16184486);assert.equal(hash(privateBytes),'955170ca7d7ca2093bdbf6871a764c29d2717df345be12b75fa065c607329ca7');}
const report={startedAt:new Date().toISOString(),sourceSha256:hash(fs.readFileSync(path.join(pilot,'renderer-frame.js'))),frameHtmlSha256:hash(fs.readFileSync(path.join(pilot,'renderer-frame.html'))),bridgeSha256:hash(fs.readFileSync(path.join(pilot,'renderer-bridge.js'))),results:[],real:[],boundaries:['Synthetic default and optional read-only approved 69-slide deck. No source uploads, converter, account storage or live deployment.','Playwright WebKit is not physical iPad acceptance. Pixel matching measures the native renderer, not exact Microsoft PowerPoint fidelity.']};
const record=(engine,name,detail)=>{report.results.push({engine,name,passed:true,detail});console.log('PASS '+engine+': '+name);};
async function fixture(browser,fakeReply){
 const requests=[],external=[],errors=[],buffers=new Map();
 for(const name of['renderer-bridge.js','renderer-frame.html'])buffers.set('/'+name,fs.readFileSync(path.join(pilot,name)));
 if(fakeReply){
  const big=typeof fakeReply.image==='string'&&fakeReply.image.length>6*1024*1024;
  const reply=JSON.stringify(big?{...fakeReply,image:'__oversize__'}:fakeReply).replace(/</g,'\\u003c').replace('"__oversize__"','("data:image/png;base64,"+"A".repeat(6*1024*1024))');
  const body='<!doctype html><script>(()=>{const token=window.name.slice(11);parent.postMessage({type:"bilge-pptx-ready",token},"*");addEventListener("message",e=>{if(e.source!==parent||!e.ports[0])return;const port=e.ports[0];port.onmessage=e=>{const d=e.data;if(d.command==="load")port.postMessage({v:1,id:d.id,ok:true,value:{slideCount:2,width:1000,height:750,warnings:[]}});else '+(fakeReply==='timeout'?'{}':'port.postMessage({v:1,id:d.id,ok:true,value:'+reply+'})')+'};port.start();port.postMessage({v:1,id:0,type:"connected"});},{once:true});})()<\/script>';
  buffers.set('/renderer-frame.html',Buffer.from(body));buffers.set('/renderer-bridge.js',Buffer.from(buffers.get('/renderer-bridge.js').toString().replace(/const FRAME_HTML_SHA256='[a-f0-9]{64}';/,"const FRAME_HTML_SHA256='"+hash(body)+"';")));
 }
 const server=http.createServer((req,res)=>{requests.push({path:req.url,method:req.method});const bytes=buffers.get(req.url);res.writeHead(req.method==='GET'&&(req.url==='/'||bytes)?200:404,{'Content-Type':req.url.endsWith('.js')?'text/javascript':'text/html','Cache-Control':'no-store'});res.end(req.url==='/'?'<!doctype html><meta charset="utf-8"><div id="mount"></div>':bytes||'missing');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const context=await browser.newContext({viewport:{width:1100,height:900}});context.on('request',r=>{const u=new URL(r.url());if(['http:','https:'].includes(u.protocol)&&u.origin!==origin)external.push(r.url());});context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
 const page=await context.newPage();await page.goto(origin);
 await page.evaluate(async timeout=>{localStorage.setItem('sentinel','UNCHANGED');const{createRenderer}=await import('/renderer-bridge.js');window.raster=await createRenderer(document.querySelector('#mount'),{timeoutMs:timeout});},fakeReply==='timeout'?300:30000);
 return {page,context,requests,external,errors,load:bytes=>page.evaluate(async encoded=>{const raw=atob(encoded);window.meta=await raster.load(Uint8Array.from(raw,c=>c.charCodeAt(0)).buffer);return meta;},bytes.toString('base64')),close:async()=>{await context.close();server.closeAllConnections();await new Promise(r=>server.close(r));}};
}
async function rasterPixels(page,result){return page.evaluate(async result=>{
 const image=new Image();image.src=result.image;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const c=canvas.getContext('2d');c.drawImage(image,0,0);const bytes=c.getImageData(0,0,canvas.width,canvas.height).data;
 let dark=0;for(let y=80;y<210;y++)for(let x=80;x<800;x++){const p=(y*canvas.width+x)*4;if(bytes[p]<90&&bytes[p+1]<90&&bytes[p+2]<90&&bytes[p+3]>200)dark++;}
 const pixel=(x,y)=>Array.from(c.getImageData(x,y,1,1).data);return{width:canvas.width,height:canvas.height,background:pixel(900,700),red:pixel(130,350),blue:pixel(270,350),dark};
},result);}
async function comparePicturePixels(page,result,extra=[]){
 const frame=page.frames().find(f=>f!==page.mainFrame());
 const boxes=await frame.evaluate(()=>{const stage=document.querySelector('#stage'),base=stage.getBoundingClientRect();return [...stage.querySelectorAll('*')].filter(n=>n.localName==='img'||getComputedStyle(n).backgroundImage!=='none').map(n=>{const r=n.getBoundingClientRect();return{x:r.x-base.x,y:r.y-base.y,width:r.width,height:r.height};}).filter(r=>r.width>20&&r.height>20).slice(0,32);});
 boxes.push(...extra);const screenshot=await frame.locator('#stage').screenshot();
 const samples=await page.evaluate(async({actual,reference,boxes})=>{
  const load=async src=>{const i=new Image();i.src=src;await i.decode();const c=document.createElement('canvas');c.width=i.naturalWidth;c.height=i.naturalHeight;const x=c.getContext('2d');x.drawImage(i,0,0);return{width:c.width,height:c.height,bytes:x.getImageData(0,0,c.width,c.height).data};};
  const a=await load(actual),b=await load(reference),rows=[];
  for(const box of boxes){let delta=0,pixels=0,sourceColor=0,rasterColor=0,darkBoth=0,darkUnion=0;const x0=Math.max(0,Math.ceil(box.x+box.width*.1)),x1=Math.min(a.width,b.width,Math.floor(box.x+box.width*.9)),y0=Math.max(0,Math.ceil(box.y+box.height*.1)),y1=Math.min(a.height,b.height,Math.floor(box.y+box.height*.9));
   for(let y=y0;y<y1;y+=3)for(let x=x0;x<x1;x+=3){const pa=(y*a.width+x)*4,pb=(y*b.width+x)*4;let ca=0,cb=0;for(let n=0;n<3;n++){delta+=Math.abs(a.bytes[pa+n]-b.bytes[pb+n]);ca+=255-a.bytes[pa+n];cb+=255-b.bytes[pb+n];}if(ca>90)rasterColor++;if(cb>90)sourceColor++;if(ca>600&&cb>600)darkBoth++;if(ca>600||cb>600)darkUnion++;pixels++;}
   if(pixels)rows.push({box,pixels,meanChannelError:delta/(pixels*3),sourceColor,rasterColor,darkIou:darkUnion?darkBoth/darkUnion:1});
  }
  return rows;
 },{actual:result.image,reference:'data:image/png;base64,'+screenshot.toString('base64'),boxes});
 for(const row of samples){assert.ok(row.meanChannelError<28,'picture differs from DOM: '+JSON.stringify(row));if(row.sourceColor>5)assert.ok(row.rasterColor>row.sourceColor*.7,'picture disappeared: '+JSON.stringify(row));}
 return{samples,screenshot};
}
async function inject(page,kind){const frame=page.frames().find(f=>f!==page.mainFrame());assert.ok(frame);await frame.evaluate(kind=>{
 if(['geometry','fit','mixedcss'].includes(kind)){
  const original=BilgePptxRuntime.Viewer.prototype.renderThumbnailToContainer;
  BilgePptxRuntime.Viewer.prototype.renderThumbnailToContainer=function(...args){const handle=original.apply(this,args);return{element:handle.element,dispose:()=>handle.dispose(),ready:Promise.resolve(handle.ready).then(()=>{const image=handle.element.querySelector('img');if(!image)throw Error('Fixture image missing');if(kind==='fit')image.style.objectFit='contain';else if(kind==='mixedcss'){
   const box=document.createElement('div');box.id='raster-fixture-local';box.style.cssText='width:50px;height:50px';handle.element.appendChild(box);
   const mixed='url("#raster-fixture-local"),url("'+(image.currentSrc||image.getAttribute('src')||image.src)+'")',native=window.getComputedStyle;
   // Boundary fixture: exercise the CSS serializer, not the earlier browser
   // resource loader/CSP. An actual CSS URL(#HTML-id) can fail before snapshot.
   window.getComputedStyle=(node,pseudo)=>{const style=native(node,pseudo);return node===box&&!pseudo?new Proxy(style,{get(target,key){if(key==='getPropertyValue')return property=>property==='background-image'?mixed:target.getPropertyValue(property);const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}}):style;};window.fixtureBackground=mixed;
  }else{image.style.width='300px';image.style.height='300px';image.style.marginLeft='-35px';image.style.marginTop='-25px';image.parentElement.style.overflow='hidden';image.parentElement.style.transform+=' rotate(17deg) scaleX(-1)';}window.fixtureApplied={kind,fit:getComputedStyle(image).objectFit,width:getComputedStyle(image).width,transform:image.parentElement.style.transform};})};};return;
 }
 const stage=document.querySelector('#stage');let done=false;const observer=new MutationObserver(()=>{if(done||!stage.firstElementChild)return;done=true;observer.disconnect();const root=stage.firstElementChild;
  if(kind==='nodes'){for(let i=0;i<6100;i++)root.append(document.createElement('span'));}
  if(kind==='resource'){const d=document.createElement('div');d.style.cssText='width:50px;height:50px;background-image:url("blob:null/unknown-raster-resource")';root.append(d);}
  if(kind==='active'){const d=document.createElementNS('http://www.w3.org/2000/svg','foreignObject');root.append(d);}
 });observer.observe(stage,{childList:true});
},kind);}
(async()=>{
 for(const [name,engine]of[['chromium',chromium],['webkit',webkit]]){
  if(engineArg&&name!==engineArg)continue;const browser=await engine.launch({headless:true});
  try{
   const f=await fixture(browser);
   try{
    const meta=await f.load(synthetic);assert.equal(meta.slideCount,2);
    for(const index of[0,1]){
     const result=await f.page.evaluate(index=>raster.snapshot(index),index),pixels=await rasterPixels(f.page,result);
     assert.deepEqual(Object.keys(result).sort(),['height','image','index','warnings','width']);assert.equal(result.width,1000);assert.equal(result.height,750);assert.equal(result.index,index);assert.ok(result.image.length<6*1024*1024);assert.ok(pixels.dark>100,'actual text missing');
     assert.deepEqual(pixels.red,[239,68,68,255]);assert.deepEqual(pixels.blue,[37,99,235,255]);assert.deepEqual(pixels.background,index===0?[217,234,247,255]:[226,240,217,255]);
     fs.writeFileSync(path.join(out,name+'-synthetic-snapshot-'+index+'.png'),Buffer.from(result.image.split(',')[1],'base64'));
     const dims=await f.page.frames()[1].evaluate(()=>{const el=document.querySelector('[data-pptx-thumbnail]');const r=el.getBoundingClientRect();return{width:r.width,height:r.height,innerWidth:el.firstElementChild.getBoundingClientRect().width};});assert.equal(dims.width,1000);assert.equal(dims.height,750);
     record(name,'snapshot '+index+' embeds blob picture, text and background at native 1000px positions',{pixels,dims,bytes:result.image.length});
    }
    const boundary=await f.page.frames()[1].evaluate(()=>{let dom,storage;try{void parent.document;dom='ALLOWED';}catch(e){dom=e.name;}try{void localStorage.length;storage='ALLOWED';}catch(e){storage=e.name;}return{origin:location.origin,dom,storage};});assert.deepEqual(boundary,{origin:'null',dom:'SecurityError',storage:'SecurityError'});record(name,'snapshot keeps opaque origin and blocked parent DOM/storage',boundary);
    const bad=await f.page.evaluate(async()=>{const codes=[];for(const index of[-1,2,NaN,.5,'1'])try{await raster.snapshot(index);codes.push('accepted');}catch(e){codes.push(e.code);}return codes;});assert.deepEqual(bad,Array(5).fill('UNSUPPORTED'));await f.page.evaluate(()=>raster.snapshot(0));record(name,'invalid indices fail without killing the valid reader');
    const races=await f.page.evaluate(async()=>{const a=raster.snapshot(0),b=raster.snapshot(1);const rows=await Promise.allSettled([a,b]);return rows.map(x=>x.status==='fulfilled'?'ok':x.reason.code);});assert.deepEqual(races,['ok','RENDER']);record(name,'single pending RPC rejects concurrent raster request');
    const bundledFont=fs.readFileSync(path.join(__dirname,'bilge-defter-test/vendor/pdfjs/standard_fonts/LiberationSans-Regular.ttf'));
    await f.page.frames()[1].evaluate(async encoded=>{
     const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
     const a=new FontFace('RasterEvidence',bytes),b=new FontFace('RasterEvidenceSecond',bytes);document.fonts.add(a);document.fonts.add(b);await Promise.all([a.load(),b.load()]);
     const stage=document.querySelector('#stage');let done=false;const observer=new MutationObserver(()=>{if(done||!stage.firstElementChild)return;done=true;observer.disconnect();for(const [i,family]of ['RasterEvidence','RasterEvidenceSecond'].entries()){const node=document.createElement('div');node.textContent='WWMM iii Raster 123';node.style.cssText='position:absolute;left:400px;top:'+(300+i*70)+'px;width:500px;height:65px;color:#000;background:#fff;font:48px '+family;stage.firstElementChild.append(node);}});observer.observe(stage,{childList:true});
    },bundledFont.toString('base64'));
    const fontRaster=await f.page.evaluate(()=>raster.snapshot(0)),fontComparison=await comparePicturePixels(f.page,fontRaster,[{x:400,y:300,width:500,height:135,font:true}]);
    const fontRow=fontComparison.samples.find(x=>x.box.font);assert.ok(fontRow.darkIou>.85,'embedded font changed: '+JSON.stringify(fontRow));record(name,'two pending FontFace byte sources survive registration and preserve glyph pixels',fontRow);
    assert.deepEqual(f.external,[]);assert.ok(f.requests.every(r=>r.method==='GET'));assert.deepEqual(f.errors,[]);assert.equal(await f.page.evaluate(()=>localStorage.getItem('sentinel')),'UNCHANGED');record(name,'no uploads, outside network, parent writes or uncaught errors');
   }finally{await f.close();}
   {
    const f=await fixture(browser);try{await f.load(synthetic);await inject(f.page,'geometry');const result=await f.page.evaluate(()=>raster.snapshot(0)),comparison=await comparePicturePixels(f.page,result),applied=await f.page.frames()[1].evaluate(()=>fixtureApplied);assert.equal(applied.width,'300px');assert.match(applied.transform,/rotate\(17deg\).*scaleX\(-1\)/);assert.ok(comparison.samples.length);record(name,'picture crop margins, parent rotation and reflection preserve native DOM geometry',{pictures:comparison.samples,applied});}finally{await f.close();}
   }
   for(const kind of['nodes','resource','active','fit','mixedcss']){
    const f=await fixture(browser);try{await f.load(synthetic);await inject(f.page,kind);const code=await f.page.evaluate(async()=>{try{await raster.snapshot(0);return'accepted';}catch(e){return e.code;}});if(kind==='fit'){assert.equal(await f.page.frames()[1].evaluate(()=>fixtureApplied.fit),'contain');assert.equal(code,'UNSUPPORTED');}else if(kind==='mixedcss'){assert.match(await f.page.frames()[1].evaluate(()=>fixtureBackground),/#raster-fixture-local.*blob:/);assert.equal(code,'UNSUPPORTED');}else assert.ok(['LIMIT','UNSUPPORTED','RENDER'].includes(code),kind+' returned '+code);record(name,'child rejects '+kind+' before returning a partial raster',{code});}finally{await f.close();}
   }
   {
    const f=await fixture(browser);try{
     await f.load(synthetic);
     await f.page.frames()[1].evaluate(()=>{const original=XMLSerializer.prototype.serializeToString;XMLSerializer.prototype.serializeToString=function(node){const copy=node.cloneNode(true);for(const image of copy.querySelectorAll('img'))image.removeAttribute('src');return original.call(this,copy);};});
     const result=await f.page.evaluate(async()=>{const start=performance.now();try{await raster.snapshot(0);return{code:'accepted',ms:performance.now()-start};}catch(e){return{code:e.code,ms:performance.now()-start};}});
     assert.equal(result.code,'TIMEOUT');assert.ok(result.ms>=2800&&result.ms<10000,'pixel readiness must fail within its own bounded wait');record(name,'missing nested-image pixels fail closed instead of returning a blank slide',result);
    }finally{await f.close();}
   }
   const good={index:0,width:1000,height:750,image:'data:image/png;base64,'+png(1000,750).toString('base64'),warnings:[]};
   const forged=[['SVG',{...good,image:'data:image/svg+xml;base64,'+Buffer.from('<svg/>').toString('base64')}],['extra key',{...good,html:'<script>evil</script>'}],['wrong index',{...good,index:1}],['wrong height',{...good,height:749}],['fraction height',{...good,height:750.1}],['wrong MIME',{...good,image:good.image.replace('image/png','image/jpeg')}],['unknown warning',{...good,warnings:['unsafe']}],['truncated PNG',{...good,image:good.image.slice(0,-32)}],['oversized payload',{...good,image:'data:image/png;base64,'+'A'.repeat(6*1024*1024)}]];
   for(const [label,reply]of forged){const f=await fixture(browser,reply);try{await f.load(synthetic);const result=await f.page.evaluate(async()=>{try{await raster.snapshot(0);return{accepted:true};}catch(e){return{code:e.code,disposed:raster.disposed,frames:document.querySelectorAll('iframe').length};}});assert.deepEqual(result,{code:'RENDER',disposed:true,frames:0});record(name,'parent rejects forged '+label+' and disposes frame');}finally{await f.close();}}
   for(const cancel of[false,true]){const f=await fixture(browser,'timeout');try{await f.load(synthetic);const result=await f.page.evaluate(async cancel=>{const promise=raster.snapshot(0);if(cancel)raster.dispose();try{await promise;return'accepted';}catch(e){return e.code;}},cancel);assert.equal(result,cancel?'RENDER':'TIMEOUT');record(name,cancel?'dispose rejects in-flight raster':'raster timeout releases opaque frame');}finally{await f.close();}}
   if(privateBytes){
    const f=await fixture(browser);try{const start=Date.now(),meta=await f.load(privateBytes);assert.equal(meta.slideCount,69);const indices=all?Array.from({length:69},(_,i)=>i):[0,1,8,34,68];const rows=[];
     for(const index of indices){const begin=Date.now(),result=await f.page.evaluate(index=>raster.snapshot(index),index);assert.equal(result.index,index);assert.ok(result.image.length<6*1024*1024);const pixels=await rasterPixels(f.page,result);
      if([0,1,8,34,68].includes(index))fs.writeFileSync(path.join(out,name+'-real69-slide-'+(index+1)+(result.image.startsWith('data:image/jpeg')?'.jpg':'.png')),Buffer.from(result.image.split(',')[1],'base64'));
      let comparison;try{comparison=await comparePicturePixels(f.page,result);}catch(error){fs.writeFileSync(path.join(out,name+'-quality-failure-slide-'+(index+1)+'.png'),Buffer.from(result.image.split(',')[1],'base64'));await f.page.frames()[1].locator('#stage').screenshot({path:path.join(out,name+'-quality-failure-dom-'+(index+1)+'.png')});error.message='slide '+(index+1)+': '+error.message;throw error;}
      rows.push({index,ms:Date.now()-begin,bytes:result.image.length,mime:result.image.slice(0,22),pixels,pictures:comparison.samples});if([0,1,8,34,68].includes(index))fs.writeFileSync(path.join(out,name+'-real69-dom-'+(index+1)+'.png'),comparison.screenshot);
     }
     assert.deepEqual(f.external,[]);assert.deepEqual(f.errors,[]);report.real.push({engine:name,count:rows.length,totalMs:Date.now()-start,sourceSha256:hash(privateBytes),rows});record(name,'approved real69 deck snapshots '+rows.length+' slides locally without upload',{totalMs:Date.now()-start});
    }finally{await f.close();}
   }
  }finally{await browser.close();}
 }
 report.finishedAt=new Date().toISOString();report.passed=report.results.length;report.failed=0;fs.writeFileSync(path.join(out,'raster-contract'+(sourceArg?'-real69':'')+'.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,failed:0,real:report.real.map(x=>({engine:x.engine,count:x.count,totalMs:x.totalMs}))}));
})().catch(error=>{report.failed=1;report.error=String(error.stack||error);fs.writeFileSync(path.join(out,'raster-contract-failure.json'),JSON.stringify(report,null,2));console.error(error);process.exitCode=1});
