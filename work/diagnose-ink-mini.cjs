'use strict';
// An application-independent, finite raster experiment. No application package,
// acceptance runner, quality threshold, persistent state or live service changes.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const REPO=path.resolve(__dirname,'..'),sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const FILES={
  index:{path:'work/bilge-defter-invited-v78/index.html',sha256:'b82383e18daddf26b70d5b8949cbbe0a4989f0a9b9e033047ed84e492bd5b1d3'},
  media:{path:'work/bilge-defter-invited-v78/media-workspace.js',sha256:'f25586bc8d2aa2abd6bade5a5304ff31b72c8bc427a55f9afefae6ee2fb5af31'},
  renderer:{path:'work/bilge-defter-invited-v78/pdf-workspace.js',sha256:'3b3fcdedfd40ba4656b7c8dca2ece1eeb605f54229326b3d91b03351cb11007e'},
  runner:{path:'work/verify-slide-flow.cjs',sha256:'f2cb459827c1d725d6df1f22c6ff12047a02d415a7d26b8eb65f3eaa769de8d0'},
  manifest:{path:'work/bilge-defter-invited-v78/SHA256SUMS',sha256:'6f172d47680d93b9d39e316a1f1512ee0e0c2e4645b95af9aab33890b34890f9'}
};
const FRAGMENT_SHA={drawStroke:'386a6a801f03132f3b1d02f0bd0c7031b2443f72816db715455f471ab51fef62',validMarkerOpacity:'4e6ba3561831ad9a54a830284ea992afd15c0702b0052494ab6c48b75be59166',markerAlpha:'ba54da47d49b41e69a80b8a65c38f78b26e6e6b25d3d9b44d8120cb0a7c6788d',isMedia:'99421f3b5a99e71c25b8d3be9e67617fac3c60211b34cb4cc7f17ac5a1ab94ae'};
const OMITTED=[
  'No application, account, state, IndexedDB, service worker, PDF, PPTX, network or UI layout code executes.',
  'Text, media, original first-row added pen and eraser strokes, pointer events and media gestures are omitted.',
  'The original audit readbacks, warm-cache edits, revision logic, tile reuse across frames and asynchronous ResizeObserver schedule are omitted.',
  'Expanded200 preserves the original generated pen/marker data and order, not all operations of the original failing application.',
  'Variant D is a synchronous synthetic output-bitmap size history, not a replay of the real application history.',
  'A/B/C/D have fresh browser contexts. No repeated post-readback rendering, backing-store inference or performance/device acceptance is attempted.'
];
const VARIANTS={A:'Fresh attached main, direct row replay',B:'Fresh viewport scratch per row, integer tiles, composite to attached main',C:'One shared viewport scratch, clear and reuse between rows, integer tiles',D:'C after synchronous synthetic main final-to-old-to-final bitmap history'};
function fixtureStroke(i){return{tool:i%5?'pen':'marker',color:i%2?'#173b36':'#0000ff',width:3,points:[{x:40+i%40*19,y:40+Math.floor(i/40)*35,p:.5},{x:52+i%40*19,y:60+Math.floor(i/40)*35,p:.5}]};}
function fixtures(){const row=indices=>({indices,strokes:indices.map(fixtureStroke)});return{tiny3:{rows:[row([27,51,57]),row([27,51,57])]},expanded200:{rows:[row(Array.from({length:220},(_,i)=>i)),row(Array.from({length:200},(_,i)=>i))]}};}
function geometry(){
  const copies=(bands)=>bands.flatMap(([y,height,tileHeight])=>[[0,512],[512,512],[1024,512],[1536,140]].map(([x,width])=>({tile:[width,tileHeight],source:[x,y,width,height],target:[0,0,width,height],destination:[x,y,width,height]})));
  return{width:1676,height:1318,rows:[
    {matrix:[1.676,0,0,1.676,0,0],clip:[0,0,1000,563],copies:copies([[0,512,512],[512,432,432]])},
    {matrix:[1.676,0,0,1.676,0,983.812],clip:[0,0,1000,563],copies:copies([[983,335,512]])}
  ],old:{width:2260,height:1482,rows:[{matrix:[2.26,0,0,2.26,0,0],clip:[0,0,1000,563]},{matrix:[2.26,0,0,2.26,0,1326.62],clip:[0,0,1000,563]}]},context:{creation:'getContext(2d) without options, after bitmap dimensions',imageSmoothingEnabled:true,imageSmoothingQuality:'low'}};
}
function extractLine(source,name){const lines=source.split(/\r?\n/).filter(line=>line.startsWith('function '+name+'('));assert.equal(lines.length,1,'Unique exact function '+name);return lines[0];}
function buildPayload(root=REPO){
  const sources={};for(const [name,file]of Object.entries(FILES)){const bytes=fs.readFileSync(path.join(root,file.path));assert.equal(sha(bytes),file.sha256,'Frozen source '+file.path);sources[name]=bytes.toString('utf8');}
  const start='function drawStroke(',end='function drawStrokeSegment(';assert.equal(sources.index.split(start).length-1,1);assert.equal(sources.index.split(end).length-1,1);
  const bodies={drawStroke:sources.index.slice(sources.index.indexOf(start),sources.index.indexOf(end)),validMarkerOpacity:extractLine(sources.index,'validMarkerOpacity'),markerAlpha:extractLine(sources.index,'markerAlpha'),isMedia:extractLine(sources.media,'isMedia')};
  const payload={schema:1,diagnosticOnly:true,releaseEligible:false,files:structuredClone(FILES),fragments:Object.fromEntries(Object.entries(bodies).map(([name,source])=>[name,{source,sha256:sha(source)}])),geometry:geometry(),fixtures:fixtures(),omitted:[...OMITTED]};validatePayload(payload);return payload;
}
function validatePayload(payload){
  assert.ok(payload&&typeof payload==='object');assert.deepEqual(Object.keys(payload).sort(),['schema','diagnosticOnly','releaseEligible','files','fragments','geometry','fixtures','omitted'].sort());assert.equal(payload.schema,1);assert.equal(payload.diagnosticOnly,true);assert.equal(payload.releaseEligible,false);assert.deepEqual(payload.files,FILES,'Exact frozen file identities');
  assert.deepEqual(Object.keys(payload.fragments).sort(),Object.keys(FRAGMENT_SHA).sort());for(const [name,hash]of Object.entries(FRAGMENT_SHA)){const part=payload.fragments[name];assert.deepEqual(Object.keys(part).sort(),['sha256','source']);assert.equal(typeof part.source,'string');assert.equal(part.sha256,hash,'Pinned fragment '+name);assert.equal(sha(part.source),hash,'Exact fragment bytes '+name);}
  assert.deepEqual(payload.geometry,geometry(),'Exact bitmap, IEEE754 geometry and integer copies');assert.deepEqual(payload.fixtures,fixtures(),'Exact bounded fixture values and order');assert.deepEqual(payload.omitted,OMITTED,'Declared reductions are immutable');return true;
}
function compareRgba(actual,expected,width,height){
  assert.ok(Number.isSafeInteger(width)&&Number.isSafeInteger(height)&&width>0&&height>0&&width*height<=4000000,'Bounded positive bitmap');
  for(const [name,bytes]of [['actual',actual],['expected',expected]]){assert.ok(bytes instanceof Uint8Array||bytes instanceof Uint8ClampedArray,name+' byte buffer');assert.equal(bytes.length,width*height*4,name+' RGBA dimensions');}
  let unequalChannels=0,unequalPixels=0,alphaMax=0,whiteMax=0,foregroundPixels=0,actualForeground=0,expectedForeground=0,whiteSum=0,whiteOver16=0;const samples=[],actualBins=Array(256).fill(0),referenceBins=Array(256).fill(0);
  for(let i=0;i<actual.length;i+=4){let raw=false,white=0;const a=actual[i+3],b=expected[i+3];actualBins[a]++;referenceBins[b]++;if(a)actualForeground++;if(b)expectedForeground++;if(a||b)foregroundPixels++;alphaMax=Math.max(alphaMax,Math.abs(a-b));for(let c=0;c<4;c++)if(actual[i+c]!==expected[i+c]){unequalChannels++;raw=true;}
    for(let c=0;c<3;c++){const delta=Math.abs(actual[i+c]*a/255+255-a-(expected[i+c]*b/255+255-b));whiteSum+=delta;white=Math.max(white,delta);}whiteMax=Math.max(whiteMax,white);if(white>16)whiteOver16++;if(raw){unequalPixels++;if(samples.length<32)samples.push({x:(i/4)%width,y:Math.floor(i/4/width),actual:Array.from(actual.subarray(i,i+4)),expected:Array.from(expected.subarray(i,i+4))});}
  }
  assert.ok(actualForeground>0&&expectedForeground>0,'Both actual and reference must contain visible ink');const whiteMeanForeground=whiteSum/(3*foregroundPixels),whiteOutlierRatio=whiteOver16/foregroundPixels,originalEnvelopeExceeded=alphaMax>32||whiteMax>32||whiteMeanForeground>1||whiteOutlierRatio>.002;
  const sparse=bins=>Object.fromEntries(bins.flatMap((count,alpha)=>count?[[alpha,count]]:[]));
  return{pixels:width*height,unequalChannels,unequalPixels,rawDifferentPixels:unequalPixels,alphaMax,whiteMax,foregroundPixels,actualForeground,expectedForeground,whiteSum,whiteMeanForeground,whiteOver16,whiteOutlierRatio,originalEnvelopeExceeded,exceedsOriginalGate:originalEnvelopeExceeded,alphaHistograms:{actual:sparse(actualBins),reference:sparse(referenceBins)},samples};
}

// Serialized into an offline HTML file. All drawing and disposal finishes in
// this synchronous call before any readback or PNG serialization takes place.
function browserExperiment(payload,variant,fixtureName){
  const g=payload.geometry,fixture=payload.fixtures[fixtureName],main=document.querySelector('#actual'),images=new Map(),scratchSurfaces=[],tiles=[],operations=[],identities=new WeakMap();
  let hotFinished=false,reads=0,serial=0;const fail=message=>{throw Error(message);};identities.set(main,{id:'main',generation:0});
  const identity=c=>({...identities.get(c),width:c.width,height:c.height});
  function assign(c,key,value){c[key]=value;identities.get(c).generation++;operations.push({op:'bitmap-assignment',property:key,value,surface:identity(c),stage:hotFinished?'post-read':'hot'});}
  function surface(width,height,kind){const c=document.createElement('canvas');identities.set(c,{id:kind+'-'+(++serial),generation:0});assign(c,'width',width);assign(c,'height',height);const target=c.getContext('2d');if(!target)fail('Canvas2D unavailable');return{canvas:c,context:target};}
  function sizeMain(width,height){assign(main,'width',width);assign(main,'height',height);return main.getContext('2d')||fail('Main Canvas2D unavailable');}
  function clear(target){target.setTransform(1,0,0,1,0,0);target.clearRect(0,0,target.canvas.width,target.canvas.height);}
  function row(target,index,shape){target.save();target.setTransform(...shape.matrix);target.beginPath();target.rect(...shape.clip);target.clip();for(const stroke of fixture.rows[index].strokes){if(!['pen','marker'].includes(stroke.tool)||isMedia(stroke))fail('Unsupported synthetic stroke');drawStroke(stroke,target,images);}target.restore();operations.push({op:'row',surface:identity(target.canvas),index,matrix:shape.matrix,clip:shape.clip,count:fixture.rows[index].strokes.length});}
  let target=sizeMain(g.width,g.height);
  if(variant==='D'){
    clear(target);g.rows.forEach((item,index)=>row(target,index,item));operations.push({op:'synthetic-main-history',width:g.width,height:g.height});
    target=sizeMain(g.old.width,g.old.height);clear(target);g.old.rows.forEach((item,index)=>row(target,index,item));operations.push({op:'synthetic-main-history',width:g.old.width,height:g.old.height});
    target=sizeMain(g.width,g.height);
  }
  if(variant==='A'){clear(target);g.rows.forEach((shape,index)=>row(target,index,shape));}
  else{
    let shared=null;
    for(let index=0;index<g.rows.length;index++){
      const scratch=variant==='B'?surface(g.width,g.height,'scratch'):(shared||(shared=surface(g.width,g.height,'scratch')));if(!scratchSurfaces.includes(scratch))scratchSurfaces.push(scratch);
      clear(scratch.context);row(scratch.context,index,g.rows[index]);
      for(const copy of g.rows[index].copies){const tile=surface(...copy.tile,'tile');tile.context.clearRect(...copy.target);tile.context.drawImage(scratch.canvas,...copy.source,...copy.target);tiles.push({canvas:tile.canvas,copy});operations.push({op:'scratch-to-tile',row:index,sourceSurface:identity(scratch.canvas),targetSurface:identity(tile.canvas),tile:copy.tile,source:copy.source,target:copy.target});}
    }
    // Like the frozen renderer: finish every row-to-tile batch first, then
    // clear/composite main. No row is composited before another row is copied.
    clear(target);for(const {canvas:tile,copy}of tiles){target.save();target.setTransform(1,0,0,1,0,0);target.drawImage(tile,...copy.target,...copy.destination);target.restore();operations.push({op:'tile-to-main',sourceSurface:identity(tile),targetSurface:identity(main),source:copy.target,target:copy.destination});}
    for(const scratch of scratchSurfaces){assign(scratch.canvas,'height',1);assign(scratch.canvas,'width',1);}
  }
  const reference=surface(g.width,g.height,'reference');clear(reference.context);g.rows.forEach((shape,index)=>row(reference.context,index,shape));
  hotFinished=true;
  const read=target=>{if(!hotFinished)fail('Early readback');reads++;return target.getImageData(0,0,g.width,g.height).data;};
  const toBase64=bytes=>{let text='';for(let start=0;start<bytes.length;start+=32768)text+=String.fromCharCode(...bytes.subarray(start,start+32768));return btoa(text);};
  const actual=read(target),expected=read(reference.context);
  const result={variant,fixture:fixtureName,width:g.width,height:g.height,actualRgba:toBase64(actual),referenceRgba:toBase64(expected),actualPng:main.toDataURL('image/png'),referencePng:reference.canvas.toDataURL('image/png'),operations,readbacks:reads,scratchCount:scratchSurfaces.length,scratchDisposed:scratchSurfaces.every(item=>item.canvas.width===1&&item.canvas.height===1),tiles:tiles.length,metadata:{userAgent:navigator.userAgent,devicePixelRatio,mainConnected:main.isConnected,mainBitmap:[main.width,main.height],mainCss:{width:main.getBoundingClientRect().width,height:main.getBoundingClientRect().height},context:{alpha:target.globalAlpha,composite:target.globalCompositeOperation,imageSmoothingEnabled:target.imageSmoothingEnabled,imageSmoothingQuality:target.imageSmoothingQuality},networkResources:performance.getEntriesByType('resource').map(entry=>entry.name)}};
  for(const {canvas:tile}of tiles){assign(tile,'height',1);assign(tile,'width',1);}assign(reference.canvas,'height',1);assign(reference.canvas,'width',1);
  window.__inkMiniResult=result;document.querySelector('#status').textContent='Diagnostic rendering complete; no release or engine-cause conclusion.';
}
function renderDocument(payload,variant,fixture){
  validatePayload(payload);assert.ok(Object.hasOwn(VARIANTS,variant),'Known bounded variant');assert.ok(Object.hasOwn(payload.fixtures,fixture),'Known bounded fixture');
  const safeJSON=value=>JSON.stringify(value).replace(/</g,'\\u003c'),fragments=['validMarkerOpacity','markerAlpha','isMedia','drawStroke'].map(name=>payload.fragments[name].source).join('\n');
  const script=`'use strict';\n${fragments}\nfunction drawMediaStroke(){throw Error('Media is excluded from this diagnostic');}\ntry{(${browserExperiment.toString()})(${safeJSON(payload)},${safeJSON(variant)},${safeJSON(fixture)});}catch(error){window.__inkMiniError={name:String(error.name||'Error'),message:String(error.message||error),stack:String(error.stack||'')};document.querySelector('#status').textContent='Diagnostic error: '+String(error.message||error);}`.replace(/\r\n?/g,'\n');
  // HTML parsing normalizes literal CRLF/CR in script text before CSP hashing,
  // just as in the original index.html. The pinned fragment bytes stay intact.
  const csp="default-src 'none'; script-src 'sha256-"+crypto.createHash('sha256').update(script).digest('base64')+"'; style-src 'unsafe-inline'; connect-src 'none'; img-src data:; base-uri 'none'; form-action 'none'";
  return'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="'+csp+'"><title>Independent ink diagnostic '+variant+' '+fixture+'</title><style>body{margin:0;background:white}canvas{display:block;width:838px;height:659px}#status{font:12px system-ui}</style></head><body><canvas id="actual"></canvas><p id="status">Rendering diagnostic only.</p><script>'+script+'</script></body></html>';
}
function playwright(){try{return require('playwright');}catch(error){try{return require(require.resolve('playwright',{paths:[REPO]}));}catch{throw error;}}}
async function main(){
  const option=name=>process.argv.find(arg=>arg.startsWith('--'+name+'='))?.slice(name.length+3),engines=(option('engines')||'chromium,webkit').split(',');assert.ok(engines.length>0&&new Set(engines).size===engines.length&&engines.every(name=>['chromium','webkit'].includes(name)),'Supported unique engine list');for(const arg of process.argv.slice(2))assert.ok(arg.startsWith('--output-dir=')||arg.startsWith('--engines='),'Unsupported argument: '+arg);
  const output=path.resolve(option('output-dir')||path.join(REPO,'outputs/ink-mini-diagnostic',new Date().toISOString().replace(/[-:.TZ]/g,'')));if(fs.existsSync(output))assert.deepEqual(fs.readdirSync(output),[],'Output directory must be new or empty');fs.mkdirSync(output,{recursive:true});
  const report={diagnosticOnly:true,releaseEligible:false,status:'inconclusive',startedAt:new Date().toISOString(),scriptSha256:sha(fs.readFileSync(__filename)),nodeVersion:process.version,isolation:'One browser process per engine; a fresh context per fixture/variant, not a fresh process.',engines,results:[],omitted:[...OMITTED],interpretation:'Raw RGBA variation and original-envelope exceedance are observations only, never a product pass or proof of engine/backing causation.'};
  let payload;
  try{
    payload=buildPayload(REPO);fs.writeFileSync(path.join(output,'payload.json'),JSON.stringify(payload,null,2));report.payloadSha256=sha(JSON.stringify(payload));const pw=playwright();report.playwrightVersion=JSON.parse(fs.readFileSync(require.resolve('playwright/package.json',{paths:[REPO]}),'utf8')).version;
    for(const engine of engines){const browser=await pw[engine].launch({headless:true});try{
      for(const fixture of Object.keys(payload.fixtures))for(const variant of Object.keys(VARIANTS)){
        const directory=path.join(output,engine,fixture,variant);fs.mkdirSync(directory,{recursive:true});const html=renderDocument(payload,variant,fixture);fs.writeFileSync(path.join(directory,'reproducer.html'),html);
        const provenance={diagnosticOnly:true,releaseEligible:false,engine,browserVersion:browser.version(),nodeVersion:report.nodeVersion,playwrightVersion:report.playwrightVersion,isolation:report.isolation,fixture,variant,description:VARIANTS[variant],htmlSha256:sha(html),htmlNormalization:'Literal source CRLF/CR normalized to LF for HTML parsing and CSP; raw pinned fragment hashes are separate.',scriptSha256:report.scriptSha256,payloadSha256:report.payloadSha256,files:payload.files,fragmentHashes:Object.fromEntries(Object.entries(payload.fragments).map(([name,part])=>[name,part.sha256])),fixtureSha256:sha(JSON.stringify(payload.fixtures[fixture])),geometry:payload.geometry,matrixPrecision17:payload.geometry.rows.map(row=>row.matrix.map(value=>value.toPrecision(17))),matrixFloat64LE:payload.geometry.rows.map(row=>row.matrix.map(value=>{const buffer=Buffer.alloc(8);buffer.writeDoubleLE(value);return buffer.toString('hex');})),omitted:payload.omitted};
        const context=await browser.newContext({viewport:{width:1180,height:920},deviceScaleFactor:2,serviceWorkers:'block'}),requests=[],errors=[];
        try{
          await context.route('**/*',route=>{requests.push(route.request().url());return route.abort();});const page=await context.newPage();page.on('pageerror',error=>errors.push(String(error.message)));
          await page.setContent(html,{waitUntil:'load',timeout:30000});await page.waitForFunction(()=>window.__inkMiniResult||window.__inkMiniError,{},{timeout:30000});const failure=await page.evaluate(()=>window.__inkMiniError||null);assert.equal(failure,null,JSON.stringify(failure));const actual=await page.evaluate(()=>window.__inkMiniResult);assert.deepEqual(errors,[],'No browser script errors');assert.deepEqual(requests,[],'No network requests');assert.deepEqual(actual.metadata.networkResources,[],'No external resource entries');assert.equal(actual.variant,variant);assert.equal(actual.fixture,fixture);assert.equal(actual.width,payload.geometry.width);assert.equal(actual.height,payload.geometry.height);assert.equal(actual.readbacks,2);assert.equal(actual.scratchDisposed,true);assert.equal(actual.scratchCount,variant==='A'?0:variant==='B'?2:1);assert.equal(actual.tiles,variant==='A'?0:12);assert.equal(actual.metadata.devicePixelRatio,2);
          const rgba=Buffer.from(actual.actualRgba,'base64'),expected=Buffer.from(actual.referenceRgba,'base64'),metrics=compareRgba(rgba,expected,actual.width,actual.height);const pngs={actual:Buffer.from(actual.actualPng.split(',')[1],'base64'),reference:Buffer.from(actual.referencePng.split(',')[1],'base64')};for(const [name,bytes]of Object.entries(pngs)){assert.ok(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'Browser PNG');fs.writeFileSync(path.join(directory,name+'.png'),bytes);}
          const result={engine,fixture,variant,status:metrics.unequalPixels?'reduced-observation':'no-repro',variation:metrics.originalEnvelopeExceeded?'original-envelope-exceeded':metrics.unequalPixels?'bounded-rgba-variation':'identical-rgba',metrics,actualRgbaSha256:sha(rgba),referenceRgbaSha256:sha(expected),actualPngSha256:sha(pngs.actual),referencePngSha256:sha(pngs.reference),provenance:path.join(directory,'provenance.json')};Object.assign(provenance,{runtime:actual.metadata,operations:actual.operations,readbacks:actual.readbacks,scratchCount:actual.scratchCount,scratchDisposed:actual.scratchDisposed,tiles:actual.tiles,result});report.results.push(result);fs.writeFileSync(path.join(directory,'provenance.json'),JSON.stringify(provenance,null,2));console.log(JSON.stringify({engine,fixture,variant,status:result.status,variation:result.variation,rawDifferentPixels:metrics.rawDifferentPixels,alphaMax:metrics.alphaMax}));
        }catch(error){provenance.error={name:String(error.name||'Error'),message:String(error.message||error),stack:String(error.stack||'')};fs.writeFileSync(path.join(directory,'provenance.json'),JSON.stringify(provenance,null,2));throw error;}finally{await context.close();}
      }
    }finally{await browser.close();}}
    assert.equal(report.results.length,engines.length*8,'Every requested fixture/variant completed');for(const file of Object.values(FILES))assert.equal(sha(fs.readFileSync(path.join(REPO,file.path))),file.sha256,'Frozen source unchanged');report.status=report.results.some(result=>result.metrics.unequalPixels)?'reduced-observation':'no-repro';report.originalEnvelopeExceeded=report.results.some(result=>result.metrics.originalEnvelopeExceeded);
  }catch(error){report.error={name:String(error.name||'Error'),message:String(error.message||error),stack:String(error.stack||'')};process.exitCode=1;}
  finally{report.completedAt=new Date().toISOString();fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({diagnosticOnly:true,releaseEligible:false,status:report.status,cases:report.results.length,report:path.join(output,'results.json'),error:report.error||null}));}
}
module.exports={buildPayload,validatePayload,renderDocument,compareRgba,main};
if(require.main===module)main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
