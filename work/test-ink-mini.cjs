'use strict';
// Pure Node tests only: no browser, server, application bootstrap or DB access.
// Root owns execution. This file neither replaces nor changes the release gate.
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const {buildPayload,validatePayload,renderDocument,compareRgba}=require('./diagnose-ink-mini.cjs');
const repo=path.resolve(__dirname,'..'),sha=value=>crypto.createHash('sha256').update(value).digest('hex');
let frozenPayload;
function payload(){if(!frozenPayload)frozenPayload=buildPayload(repo);return structuredClone(frozenPayload);}
function primitive(p=payload()){
  const sandbox={};
  // A renderer that accidentally evaluates either implicit default must fail.
  for(const name of ['ctx','mediaImages'])Object.defineProperty(sandbox,name,{get(){throw Error('Implicit application dependency: '+name);}});
  const source=['isMedia','validMarkerOpacity','markerAlpha','drawStroke'].map(name=>p.fragments[name].source).join('\n')+'\ndrawStroke;';
  return vm.runInNewContext(source,sandbox,{timeout:1000});
}
function spy(){
  const events=[],state={},stack=[];
  const methods={
    save(){events.push(['save']);stack.push({...state});},
    restore(){events.push(['restore']);assert.ok(stack.length,'Balanced primitive restore');const previous=stack.pop();for(const key of Object.keys(state))delete state[key];Object.assign(state,previous);},
    beginPath(){events.push(['beginPath']);},arc(...args){events.push(['arc',...args]);},fill(...args){events.push(['fill',...args]);},
    moveTo(...args){events.push(['moveTo',...args]);},lineTo(...args){events.push(['lineTo',...args]);},stroke(...args){events.push(['stroke',...args]);}
  };
  const target=new Proxy(methods,{get(object,name){if(name in object)return object[name];if(name in state)return state[name];throw Error('Unexpected context read: '+String(name));},set(_object,name,value){assert.ok(['lineCap','lineJoin','globalCompositeOperation','globalAlpha','strokeStyle','fillStyle','lineWidth'].includes(name),'Only canonical primitive style writes');events.push(['set',name,value]);state[name]=value;return true;}});
  return{target,events,stack};
}
function rejection(change,label){const p=payload();change(p);assert.throws(()=>validatePayload(p),undefined,label);}
const rgba=(...values)=>new Uint8ClampedArray(values);

test('payload is pinned diagnostic-only data with the declared pure exports',()=>{
  for(const fn of [buildPayload,validatePayload,renderDocument,compareRgba])assert.equal(typeof fn,'function');
  const p=payload(),before=JSON.stringify(p);assert.doesNotThrow(()=>validatePayload(p));assert.equal(JSON.stringify(p),before,'Validation does not normalize or change the evidence');
  assert.equal(p.schema,1);assert.equal(p.diagnosticOnly,true);assert.equal(p.releaseEligible,false);
  for(const name of ['index','media','renderer','runner','manifest']){assert.equal(typeof p.files[name].path,'string');assert.match(p.files[name].sha256,/^[a-f0-9]{64}$/);}
  for(const name of ['drawStroke','validMarkerOpacity','markerAlpha','isMedia'])assert.equal(sha(p.fragments[name].source),p.fragments[name].sha256,'Exact extracted fragment '+name);
});

test('tiny fixture has three independently specified pen strokes in each row',()=>{
  const p=payload(),expected=[
    {tool:'pen',color:'#173b36',width:3,points:[{x:553,y:40,p:.5},{x:565,y:60,p:.5}]},
    {tool:'pen',color:'#173b36',width:3,points:[{x:249,y:75,p:.5},{x:261,y:95,p:.5}]},
    {tool:'pen',color:'#173b36',width:3,points:[{x:363,y:75,p:.5},{x:375,y:95,p:.5}]}
  ];
  assert.equal(p.fixtures.tiny3.rows.length,2);
  for(const row of p.fixtures.tiny3.rows){assert.deepEqual(row.indices,[27,51,57]);assert.deepEqual(row.strokes,expected);}
});

test('expanded fixture preserves the bounded original row order and marker positions',()=>{
  const rows=payload().fixtures.expanded200.rows;assert.equal(rows.length,2);
  for(const [rowIndex,count]of [[0,220],[1,200]]){
    assert.deepEqual(rows[rowIndex].indices,Array.from({length:count},(_,i)=>i));assert.equal(rows[rowIndex].strokes.length,count);
    for(const [i,s]of rows[rowIndex].strokes.entries()){
      assert.equal(s.tool,i%5?'pen':'marker');assert.equal(s.color,i%2?'#173b36':'#0000ff');assert.equal(s.width,3);assert.equal(s.points.length,2);
      assert.deepEqual(s.points[0],{x:40+(i%40)*19,y:40+Math.floor(i/40)*35,p:.5});
      assert.deepEqual(s.points[1],{x:52+(i%40)*19,y:60+Math.floor(i/40)*35,p:.5});
      assert.equal(Object.hasOwn(s,'markerOpacity'),false,'Legacy marker remains absent, not silently upgraded');
    }
  }
});

test('geometry retains exact recorded Float64 values, clipping and copy extents',()=>{
  const g=payload().geometry;assert.equal(g.width,1676);assert.equal(g.height,1318);assert.equal(g.rows.length,2);
  assert.deepEqual(g.rows[0].matrix,[1.676,0,0,1.676,0,0]);assert.deepEqual(g.rows[1].matrix,[1.676,0,0,1.676,0,983.812]);
  assert.equal(g.rows[1].matrix[0].toPrecision(17),'1.6759999999999999');assert.equal(g.rows[1].matrix[5].toPrecision(17),'983.81200000000001');
  assert.deepEqual(g.old,{width:2260,height:1482,rows:[{matrix:[2.26,0,0,2.26,0,0],clip:[0,0,1000,563]},{matrix:[2.26,0,0,2.26,0,1326.62],clip:[0,0,1000,563]}]});
  assert.equal(g.rows[0].copies.length,8);assert.equal(g.rows[1].copies.length,4);
  assert.deepEqual(g.rows[1].copies[0],{tile:[512,512],source:[0,983,512,335],target:[0,0,512,335],destination:[0,983,512,335]},'Partial bottom tile preserves the original 512px backing instead of shrinking it to the copied area');
  for(const row of g.rows){
    assert.deepEqual(row.clip,[0,0,1000,563]);
    for(const n of row.matrix)assert.ok(Object.is(n,Number(n.toPrecision(17))),'Recorded double roundtrips without precision loss');
    assert.ok(row.copies.length>0);
    for(const c of row.copies){
      assert.equal(c.tile.length,2);assert.equal(c.source.length,4);assert.equal(c.target.length,4);assert.equal(c.destination.length,4);
      for(const value of [...c.tile,...c.source,...c.target,...c.destination])assert.ok(Number.isSafeInteger(value)&&value>=0,'Integer copy geometry');
      const [x,y,w,h]=c.source;assert.ok(w>0&&h>0&&x+w<=g.width&&y+h<=g.height);assert.deepEqual(c.target,[0,0,w,h]);assert.deepEqual(c.destination,[x,y,w,h]);assert.equal(c.tile[0],w);assert.ok(c.tile[1]>=h);
    }
  }
});

test('payload mutations cannot be legitimized by changing a self-reported hash',()=>{
  rejection(p=>{p.fragments.drawStroke.source=p.fragments.drawStroke.source.replace('target.fill();','target.stroke();');p.fragments.drawStroke.sha256=sha(p.fragments.drawStroke.source);},'A different primitive with a consistent local hash must still be rejected');
  rejection(p=>{p.files.renderer.sha256='0'.repeat(64);},'Pinned source drift');
  rejection(p=>{p.fragments.drawStroke.sha256='0'.repeat(64);},'Fragment hash drift');
  rejection(p=>{p.releaseEligible=true;},'Cannot claim release acceptance');
});

test('reordered, missing, duplicated and numerically altered fixture commands reject',()=>{
  rejection(p=>{p.fixtures.tiny3.rows[1].indices.reverse();p.fixtures.tiny3.rows[1].strokes.reverse();},'Consistent but reordered input');
  rejection(p=>{p.fixtures.tiny3.rows[1].strokes.pop();},'Missing primitive');
  rejection(p=>{p.fixtures.tiny3.rows[1].strokes.push(structuredClone(p.fixtures.tiny3.rows[1].strokes[0]));p.fixtures.tiny3.rows[1].indices.push(27);},'Duplicated primitive');
  rejection(p=>{p.fixtures.tiny3.rows[1].strokes[0].points[0].x+=1;},'Coordinate mutation');
  rejection(p=>{p.fixtures.expanded200.rows[1].strokes[0].markerOpacity=.4;},'Unrequested marker rewrite');
});

test('geometry drift, non-finite values and wrong copy coverage reject before rendering',()=>{
  rejection(p=>{p.geometry.rows[1].matrix[5]=983.81;},'Rounded transform');
  rejection(p=>{p.geometry.rows[0].matrix[4]=-0;},'Negative zero is not silently normalized to the pinned positive zero');
  rejection(p=>{p.geometry.rows[1].matrix[0]=NaN;},'NaN transform');
  rejection(p=>{p.geometry.rows[1].clip[3]++;},'Changed clip');
  rejection(p=>{p.geometry.rows[1].copies[0].source[0]++;},'Shifted source copy');
  rejection(p=>{p.geometry.rows[1].copies.pop();},'Missing coverage');
  rejection(p=>{p.geometry.width++;},'Different backing dimensions');
});

test('actual canonical two-point pen executes dot fill followed by a separate round stroke',()=>{
  const render=primitive(),s=spy();render({tool:'pen',color:'#173b36',width:3,points:[{x:553,y:40,p:.5},{x:565,y:60,p:.5}]},s.target,{});
  assert.deepEqual(s.events,[
    ['save'],['set','lineCap','round'],['set','lineJoin','round'],['set','globalCompositeOperation','source-over'],['set','globalAlpha',1],['set','strokeStyle','#173b36'],['set','fillStyle','#173b36'],
    ['beginPath'],['arc',553,40,1.5,0,Math.PI*2],['fill'],['set','lineWidth',3],['beginPath'],['moveTo',553,40],['lineTo',565,60],['stroke'],['restore']
  ]);assert.equal(s.stack.length,0);
});

test('canonical single point, absent pressure and explicit zero pressure are distinguished',()=>{
  const render=primitive();
  for(const [point,radius]of [[{x:5,y:7},1.5],[{x:5,y:7,p:0},0.6000000000000001]]){
    const s=spy();render({tool:'pen',color:'#0000ff',width:3,points:[point]},s.target,{});
    assert.deepEqual(s.events.filter(x=>x[0]==='arc'),[['arc',5,7,radius,0,Math.PI*2]]);assert.equal(s.events.filter(x=>x[0]==='fill').length,1);assert.equal(s.events.filter(x=>x[0]==='stroke').length,0);assert.equal(s.stack.length,0);
  }
});

test('canonical legacy marker keeps .25 opacity and does not add a pen initial dot',()=>{
  const render=primitive();
  for(const [extra,alpha]of [[{},.25],[{markerOpacity:.4},.4]]){
    const s=spy();render({tool:'marker',color:'#0000ff',width:3,points:[{x:1,y:2,p:.5},{x:3,y:4,p:.5}],...extra},s.target,{});
    assert.deepEqual(s.events.filter(x=>x[0]==='set'&&x[1]==='globalAlpha'),[['set','globalAlpha',alpha]]);assert.equal(s.events.filter(x=>x[0]==='arc'||x[0]==='fill').length,0);assert.equal(s.events.filter(x=>x[0]==='stroke').length,1);assert.equal(s.stack.length,0);
  }
});

test('three-point pen retains one initial dot and two pressure-specific segment widths',()=>{
  const render=primitive(),s=spy();render({tool:'pen',color:'#173b36',width:3,points:[{x:1,y:2,p:.5},{x:3,y:4,p:.5},{x:5,y:6,p:0}]},s.target,{});
  assert.deepEqual(s.events.filter(x=>x[0]==='arc'),[['arc',1,2,1.5,0,Math.PI*2]]);
  assert.deepEqual(s.events.filter(x=>x[0]==='set'&&x[1]==='lineWidth'),[['set','lineWidth',3],['set','lineWidth',2.0999999999999996]]);
  assert.deepEqual(s.events.filter(x=>['moveTo','lineTo'].includes(x[0])),[['moveTo',1,2],['lineTo',3,4],['moveTo',3,4],['lineTo',5,6]]);
  assert.equal(s.events.filter(x=>x[0]==='fill').length,1);assert.equal(s.events.filter(x=>x[0]==='stroke').length,2);assert.equal(s.stack.length,0);
});

test('canonical eraser uses destination-out with full alpha and no initial pen dot',()=>{
  const render=primitive(),s=spy();render({tool:'eraser',color:'#000000',width:12,points:[{x:1,y:2,p:.5},{x:3,y:4,p:.5}]},s.target,{});
  assert.deepEqual(s.events.filter(x=>x[0]==='set'&&x[1]==='globalCompositeOperation'),[['set','globalCompositeOperation','destination-out']]);
  assert.deepEqual(s.events.filter(x=>x[0]==='set'&&x[1]==='globalAlpha'),[['set','globalAlpha',1]]);
  assert.deepEqual(s.events.filter(x=>x[0]==='set'&&x[1]==='lineWidth'),[['set','lineWidth',12]]);
  assert.equal(s.events.filter(x=>x[0]==='arc'||x[0]==='fill').length,0);assert.equal(s.events.filter(x=>x[0]==='stroke').length,1);assert.equal(s.stack.length,0);
});

test('comparator reports an identical nonempty bitmap without inventing a pass claim',()=>{
  const r=compareRgba(rgba(24,60,56,255),rgba(24,60,56,255),1,1);
  assert.equal(r.pixels,1);assert.equal(r.unequalChannels,0);assert.equal(r.unequalPixels,0);assert.equal(r.alphaMax,0);assert.equal(r.whiteMax,0);assert.equal(r.foregroundPixels,1);assert.equal(r.exceedsOriginalGate,false);
});

test('comparator finds a single RGB byte and distinguishes raw inequality from envelope breach',()=>{
  const r=compareRgba(rgba(1,0,0,255),rgba(0,0,0,255),1,1);
  assert.equal(r.unequalChannels,1);assert.equal(r.unequalPixels,1);assert.equal(r.alphaMax,0);assert.equal(r.whiteMax,1);assert.equal(r.whiteSum,1);assert.equal(r.whiteMeanForeground,1/3);assert.equal(r.whiteOver16,0);assert.equal(r.exceedsOriginalGate,false);
});

test('comparator handles a 255-byte difference without wrapping subtraction',()=>{
  const r=compareRgba(rgba(255,0,0,255),rgba(0,0,0,255),1,1);
  assert.equal(r.unequalChannels,1);assert.equal(r.unequalPixels,1);assert.equal(r.alphaMax,0);assert.equal(r.whiteMax,255);assert.equal(r.whiteSum,255);assert.equal(r.whiteMeanForeground,85);assert.equal(r.whiteOutlierRatio,1);assert.equal(r.exceedsOriginalGate,true);
});

test('comparator detects alpha loss while each input still contains real ink',()=>{
  const r=compareRgba(rgba(0,0,0,0,0,0,0,255),rgba(0,0,0,255,0,0,0,255),2,1);
  assert.equal(r.unequalChannels,1);assert.equal(r.unequalPixels,1);assert.equal(r.alphaMax,255);assert.equal(r.whiteMax,255);assert.equal(r.whiteSum,765);assert.equal(r.foregroundPixels,2);assert.equal(r.whiteMeanForeground,127.5);assert.equal(r.whiteOutlierRatio,.5);assert.equal(r.exceedsOriginalGate,true);
});

test('invalid dimensions, buffer lengths and either-empty bitmap reject rather than pass vacuously',()=>{
  const ink=rgba(0,0,0,255),blank=rgba(0,0,0,0);
  for(const dims of [[0,1],[-1,1],[1.5,1],[1,0],[NaN,1],[1,Infinity]])assert.throws(()=>compareRgba(ink,ink,...dims));
  assert.throws(()=>compareRgba(ink,ink,2,1));assert.throws(()=>compareRgba(rgba(0,0,0),ink,1,1));assert.throws(()=>compareRgba(ink,rgba(0,0,0),1,1));
  assert.throws(()=>compareRgba(blank,blank,1,1));assert.throws(()=>compareRgba(blank,ink,1,1));assert.throws(()=>compareRgba(ink,blank,1,1));
});

test('all bounded documents validate and unknown variant/fixture or altered payload reject',()=>{
  const p=payload();
  for(const variant of ['A','B','C','D'])for(const fixture of ['tiny3','expanded200']){
    const html=renderDocument(p,variant,fixture);assert.equal(typeof html,'string');assert.ok(html.includes('<canvas')||html.includes('createElement'),'Standalone canvas document');assert.doesNotMatch(html,/<script\b[^>]*\bsrc\s*=/i,'No external application/bootstrap script');assert.doesNotMatch(html,/(?:https?:)?\/\/[^\s'"<>]+\.(?:js|css)(?:[?'"\s>]|$)/i,'No remote code assets');
  }
  assert.throws(()=>renderDocument(p,'E','tiny3'));assert.throws(()=>renderDocument(p,'A','missing'));
  const changed=payload();changed.geometry.rows[1].matrix[5]++;assert.throws(()=>renderDocument(changed,'A','tiny3'),'Validate geometry before producing executable document');
});

test('inline CSP hashes the exact script after browser CRLF normalization',()=>{
  const p=payload();
  for(const variant of ['A','B','C','D'])for(const fixture of ['tiny3','expanded200']){
    const html=renderDocument(p,variant,fixture),scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    assert.equal(scripts.length,1,'Exactly one inline executable script');
    const policy=/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1];assert.ok(policy,'Real CSP metadata');
    const hashes=[...policy.matchAll(/'sha256-([A-Za-z0-9+/=]+)'/g)];assert.equal(hashes.length,1,'One exact hash, not unsafe-inline or an extra bypass');assert.doesNotMatch(policy,/script-src[^;]*(?:unsafe-inline|unsafe-eval)/);
    // HTML input preprocessing converts CRLF and lone CR to LF before script
    // text is checked by CSP. Node hashing the original CRLF bytes is wrong.
    const script=scripts[0][1],browserText=script.replace(/\r\n?/g,'\n'),digest=crypto.createHash('sha256').update(browserText).digest('base64');
    assert.equal(hashes[0][1],digest,'CSP authorizes precisely the browser-normalized script');assert.doesNotMatch(script,/\r/,'Generator emits normalized script rather than relying on differing byte representations');
    const altered=browserText.replace("'use strict'","'use changed'");assert.notEqual(altered,browserText);assert.notEqual(crypto.createHash('sha256').update(altered).digest('base64'),hashes[0][1],'A one-site script change is not authorized by the old digest');
  }
});
