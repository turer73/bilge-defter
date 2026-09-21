// Local-only text and raster images. No uploads, remote URLs, SVG or HTML rendering.
let mediaSelection=null,mediaGesture=null,mediaPending=null,layoutMulti=false;const layoutTouches=new Set();
const layoutPaper=document.querySelector('.paper'),layoutFrame=document.createElement('div'),layoutHandle=document.createElement('button'),layoutBar=document.createElement('div');
const layoutRotate=document.createElement('button');layoutRotate.id='layoutRotate';layoutRotate.hidden=true;layoutRotate.className='btn';layoutRotate.textContent='↻';layoutRotate.setAttribute('aria-label','Seçili öğeyi sürükleyerek döndür');
layoutFrame.id='layoutFrame';layoutFrame.hidden=true;layoutFrame.setAttribute('aria-hidden','true');
layoutHandle.id='layoutHandle';layoutHandle.hidden=true;layoutHandle.className='btn';layoutHandle.textContent='↘';layoutHandle.setAttribute('aria-label','Seçili öğeyi sürükleyerek boyutlandır');
layoutBar.id='layoutBar';layoutBar.hidden=true;layoutBar.innerHTML='<span id="layoutLabel" role="status">Metin veya görsele dokunun</span><div><button class="btn" id="layoutEdit">İçeriği düzenle</button><button class="btn" id="layoutUndo">Geri al</button><button class="btn primary" id="layoutDone">Bitti</button></div>';
layoutPaper.append(layoutFrame,layoutHandle,layoutRotate);document.querySelector('.paper-wrap').before(layoutBar);
for(const [id,label,angle] of [['layoutLeft','↶ 90°',-90],['layoutRight','↷ 90°',90],['layoutReset','Açıyı sıfırla',null]]){const b=document.createElement('button');b.id=id;b.className='btn';b.textContent=label;b.onclick=()=>rotateSelectedMedia(angle);layoutBar.querySelector('div').insertBefore(b,document.querySelector('#layoutEdit'))}
const layoutStyle=document.createElement('style');layoutStyle.textContent='#layoutFrame{position:absolute;z-index:6;border:2px solid #167bba;outline:1px solid white;pointer-events:none;box-sizing:border-box}#layoutHandle{position:absolute;z-index:9;width:44px;height:44px;min-width:44px;min-height:44px;padding:0;border:2px solid white;background:#167bba;color:white;font-size:27px;touch-action:none;cursor:nwse-resize;border-radius:12px;box-shadow:0 2px 8px #0005}#layoutBar{position:absolute;z-index:10;top:8px;left:8px;max-width:calc(100% - 96px);padding:8px;border:1px solid #b6ccc4;border-radius:12px;background:#fffdf8f5;box-shadow:0 2px 12px #0002;color:#17312d}#layoutBar>div{display:flex;gap:6px;flex-wrap:wrap}#layoutBar .btn{min-height:44px;font-size:13px}#layoutLabel{display:block;font-size:12px;margin-bottom:5px}#layoutFrame[hidden],#layoutHandle[hidden],#layoutBar[hidden]{display:none}.paper.layout-mode #canvas{cursor:move}';document.head.append(layoutStyle);
function selectedMedia(){if(mediaPending&&mediaPending.pageId===activeId)return mediaPending.draft;return mediaSelection?.pageId===activeId&&page()?.strokes.includes(mediaSelection.target)?mediaSelection.target:null}
layoutStyle.textContent+='#layoutBar{position:relative;top:auto;left:auto;margin:6px 12px 0;max-width:none}.workspace.layout-active{grid-template-rows:auto minmax(0,1fr)}.workspace.layout-active.has-pdf{grid-template-rows:auto auto minmax(0,1fr)}.workspace.layout-active .edge-actions{display:none}';
function mediaVisualStroke(s){return mediaGesture?.target===s?mediaGesture.draft:s}
layoutStyle.textContent+='#layoutRotate{position:absolute;z-index:9;width:44px;height:44px;min-width:44px;min-height:44px;padding:0;border:2px solid white;border-radius:50%;background:#167bba;color:white;font-size:27px;touch-action:none;cursor:grab;box-shadow:0 2px 8px #0005}#layoutRotate[hidden]{display:none}';
function mediaAngle(s){return (s.rotation||0)*Math.PI/180}
function mediaCenter(s){return {x:s.points[0].x+s.width/2,y:s.points[0].y+mediaHeight(s)/2}}
function mediaRotatedPoint(s,x,y){const c=mediaCenter(s),a=mediaAngle(s);return {x:c.x+x*Math.cos(a)-y*Math.sin(a),y:c.y+x*Math.sin(a)+y*Math.cos(a)}}
function mediaBounds(s){const c=mediaCenter(s),a=mediaAngle(s),w=s.width,h=mediaHeight(s),rx=(Math.abs(w*Math.cos(a))+Math.abs(h*Math.sin(a)))/2,ry=(Math.abs(w*Math.sin(a))+Math.abs(h*Math.cos(a)))/2;return {left:c.x-rx,right:c.x+rx,top:c.y-ry,bottom:c.y+ry}}
function mediaHit(s,p){const c=mediaCenter(s),a=mediaAngle(s),dx=p.x-c.x,dy=p.y-c.y;return Math.abs(dx*Math.cos(a)+dy*Math.sin(a))<=s.width/2&&Math.abs(-dx*Math.sin(a)+dy*Math.cos(a))<=mediaHeight(s)/2}
function normalizeMediaAngle(a){return Math.round(((a%360+360)%360)*1000)/1000%360}
function constrainMedia(s){const b=mediaBounds(s),p=s.points[0],bg=page()?.pdf;let dx=Math.max(0,-b.left,-p.x),dy=Math.max(0,-b.top,-p.y);if(bg){dx=Math.max(dx,Math.min(0,bg.width-b.right));dy=Math.max(dy,Math.min(0,bg.height-b.bottom));if(b.right-b.left<=bg.width)dx=Math.max(-p.x,Math.min(dx,bg.width-b.right));if(b.bottom-b.top<=bg.height)dy=Math.max(-p.y,Math.min(dy,bg.height-b.bottom))}s.points=[{x:p.x+dx,y:p.y+dy}];return s}
function validPendingMedia(s){return validMediaStroke(s?.tool==='text'&&!s.text?.trim()?{...s,text:'x'}:s)}
function mediaTargetExists(target){return mediaPending?mediaPending.pageId===activeId&&mediaPending.draft===target:page()?.strokes.includes(target)}
function commitMediaTransform(target,draft){if(!ready||saveConflict||importing||!mediaTargetExists(target)||!(mediaPending?validPendingMedia(draft):validMediaStroke(draft))||JSON.stringify(target)===JSON.stringify(draft))return;if(mediaPending){mediaPending.history.push(structuredClone(target));if(mediaPending.history.length>30)mediaPending.history.shift();mediaPending.draft=structuredClone(draft);return}const before=page().strokes.slice(),after=before.slice(),index=after.indexOf(target);after[index]=structuredClone(draft);const history=mediaUndo.get(activeId)||[];history.push({before,after:after.slice()});if(history.length>10)history.shift();mediaUndo.set(activeId,history);state.version=Math.max(state.version,draft.rotation===undefined?3:4);page().strokes=after;mediaSelection={pageId:activeId,target:after[index]};scheduleSave()}
function rotateSelectedMedia(delta){const target=selectedMedia();if(!target||mediaGesture||!mediaSelecting||!pdfBackgroundReady())return;const draft=structuredClone(target);draft.rotation=delta===null?0:normalizeMediaAngle((draft.rotation||0)+delta);commitMediaTransform(target,constrainMedia(draft));drawAll()}
function refreshMediaSelection(){
 layoutBar.hidden=!mediaSelecting;layoutPaper.classList.toggle('layout-mode',mediaSelecting);document.querySelector('.workspace').classList.toggle('layout-active',mediaSelecting);if(!mediaSelecting){layoutFrame.hidden=layoutHandle.hidden=layoutRotate.hidden=true;return}const target=selectedMedia(),s=target?mediaVisualStroke(target):null;
 layoutFrame.hidden=layoutHandle.hidden=layoutRotate.hidden=!mediaSelecting||!s;
 for(const id of ['layoutLeft','layoutRight','layoutReset'])document.querySelector('#'+id).disabled=!s||!!mediaGesture||saveConflict;
 document.querySelector('#layoutEdit').disabled=!s||!!mediaGesture||saveConflict;
 document.querySelector('#layoutEdit').hidden=!!mediaPending;document.querySelector('#layoutCancel').hidden=!mediaPending;document.querySelector('#layoutDraftControls').hidden=!mediaPending;document.querySelector('#layoutDone').disabled=!!mediaGesture||!!mediaPending&&(!ready||saveConflict||importing);refreshPendingControls(s);
 const history=mediaUndo.get(activeId),last=history?.at(-1);document.querySelector('#layoutUndo').disabled=!!mediaGesture||saveConflict||(mediaPending?!mediaPending.history.length:!last||JSON.stringify(page()?.strokes)!==JSON.stringify(last.after));
 document.querySelector('#layoutLabel').textContent=s?`${s.tool==='text'?'Metin':'Görsel'} · ${Math.round(s.width)} × ${Math.round(mediaHeight(s))} · ${Math.round(s.rotation||0)}° · ↘ boyut / ↻ döndür`:'Metin veya görsele dokunun';
 if(mediaPending)document.querySelector('#layoutLabel').textContent='İlk yerleşim · taşı / ↘ boyut / ↻ döndür · Bitti ile kaydet';
 if(!s)return;const scale=paperScale(),r=document.querySelector('#canvas').getBoundingClientRect(),x=(s.points[0].x-viewX())*scale,y=(s.points[0].y-viewY())*scale,w=s.width*scale,h=mediaHeight(s)*scale;
 Object.assign(layoutFrame.style,{left:x+'px',top:y+'px',width:w+'px',height:h+'px',transform:`rotate(${s.rotation||0}deg)`});
 const bounds=mediaBounds(s);layoutHandle.hidden=layoutRotate.hidden=(bounds.left-viewX())*scale>r.width||(bounds.top-viewY())*scale>r.height||(bounds.right-viewX())*scale<0||(bounds.bottom-viewY())*scale<0;
 for(const [el,pt] of [[layoutHandle,mediaRotatedPoint(s,s.width/2,mediaHeight(s)/2)],[layoutRotate,mediaRotatedPoint(s,0,-mediaHeight(s)/2-34/scale)]])Object.assign(el.style,{left:Math.max(0,Math.min(r.width-44,(pt.x-viewX())*scale-22))+'px',top:Math.max(0,Math.min(r.height-44,(pt.y-viewY())*scale-22))+'px'});
}
function cancelMediaGesture(){const g=mediaGesture;mediaGesture=null;if(g)try{if(g.host.hasPointerCapture(g.id))g.host.releasePointerCapture(g.id)}catch{}}
function startMediaGesture(e,target,resizing){
 if(!mediaSelecting||!ready||saveConflict||importing||!pdfBackgroundReady()||(e.pointerType==='mouse'&&e.button!==0))return;
 if(e.pointerType==='touch'){layoutTouches.add(e.pointerId);if(layoutTouches.size>1){if(mediaGesture?.type==='touch'){cancelMediaGesture();drawAll()}layoutMulti=true;return}}
 if(mediaGesture||layoutMulti)return;
 if(!target){mediaSelection=null;drawAll();return}
 mediaSelection={target,pageId:activeId};mediaGesture={target,pageId:activeId,id:e.pointerId,type:e.pointerType,host:e.currentTarget,start:point(e),before:structuredClone(target),draft:structuredClone(target),resizing,moved:false};
 try{e.currentTarget.setPointerCapture(e.pointerId)}catch{}drawAll();
}
function moveMediaGesture(e){
 const g=mediaGesture;if(!g||g.id!==e.pointerId)return;
 if(saveConflict||importing||g.pageId!==activeId||!mediaTargetExists(g.target)){cancelMediaGesture();drawAll();return}
 const pt=point(e),dx=pt.x-g.start.x,dy=pt.y-g.start.y;if(!g.moved&&Math.hypot(dx,dy)*paperScale()<3)return;g.moved=true;
 g.draft=structuredClone(g.before);
 if(g.resizing==='rotate'){const c=mediaCenter(g.before);let angle=(g.before.rotation||0)+(Math.atan2(pt.y-c.y,pt.x-c.x)-Math.atan2(g.start.y-c.y,g.start.x-c.x))*180/Math.PI;if(e.shiftKey)angle=Math.round(angle/15)*15;g.draft.rotation=normalizeMediaAngle(angle)}
 else if(g.resizing){const w=g.before.width,h=mediaHeight(g.before),a=mediaAngle(g.before),lx=dx*Math.cos(a)+dy*Math.sin(a),ly=-dx*Math.sin(a)+dy*Math.cos(a),raw=1+(lx*w+ly*h)/(w*w+h*h),min=Math.max(80/w,g.before.tool==='text'?12/g.before.fontSize:0),max=Math.min(1000/w,g.before.tool==='text'?72/g.before.fontSize:Infinity),ratio=Math.max(min,Math.min(max,raw));g.draft.width=w*ratio;if(g.before.tool==='text')g.draft.fontSize=g.before.fontSize*ratio;const dw=g.draft.width-w,dh=mediaHeight(g.draft)-h;g.draft.points=[{x:g.before.points[0].x+(dw*Math.cos(a)-dh*Math.sin(a)-dw)/2,y:g.before.points[0].y+(dw*Math.sin(a)+dh*Math.cos(a)-dh)/2}]}
 else g.draft.points=[{x:g.before.points[0].x+dx,y:g.before.points[0].y+dy}];
 constrainMedia(g.draft);
 drawAll();
}
function endMediaGesture(e){
 layoutTouches.delete(e.pointerId);if(!layoutTouches.size)layoutMulti=false;
 const g=mediaGesture;if(!g||g.id!==e.pointerId)return;
 if(e.type==='pointerup')moveMediaGesture(e);if(mediaGesture!==g)return;cancelMediaGesture();
 if(e.type==='pointerup'&&g.moved&&ready&&!saveConflict&&!importing&&g.pageId===activeId&&selectedMedia()===g.target&&(mediaPending?validPendingMedia(g.draft):validMediaStroke(g.draft))){
  commitMediaTransform(g.target,g.draft);
 }
 drawAll();
}
layoutHandle.addEventListener('pointerdown',e=>{e.preventDefault();e.stopImmediatePropagation();startMediaGesture(e,selectedMedia(),true)});
layoutRotate.addEventListener('pointerdown',e=>{e.preventDefault();e.stopImmediatePropagation();startMediaGesture(e,selectedMedia(),'rotate')});
for(const type of ['pointermove','pointerup','pointercancel','lostpointercapture'])layoutPaper.addEventListener(type,e=>{if(!mediaSelecting&&!mediaGesture)return;if(e.cancelable)e.preventDefault();e.stopImmediatePropagation();if(type==='pointermove')moveMediaGesture(e);else endMediaGesture(e)},{capture:true});
document.querySelector('#layoutDone').onclick=()=>{if(mediaPending)finishPendingMedia();else cancelMediaMode()};
document.querySelector('#layoutEdit').onclick=()=>{const target=selectedMedia();if(!target||mediaGesture||saveConflict)return;cancelMediaMode();beginMedia(target,target)};
document.querySelector('#layoutUndo').onclick=()=>{if(mediaGesture||!ready||saveConflict||importing)return;if(mediaPending){const previous=mediaPending.history.pop();if(previous)mediaPending.draft=previous;drawAll();return}if(undoMedia()){mediaSelection=null;drawAll();scheduleSave()}};
window.addEventListener('blur',()=>{if(mediaGesture){cancelMediaGesture();layoutTouches.clear();layoutMulti=false;drawAll()}});
window.addEventListener('resize',()=>{if(mediaGesture){cancelMediaGesture();layoutTouches.clear();layoutMulti=false;drawAll()}});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&mediaGesture){cancelMediaGesture();layoutTouches.clear();layoutMulti=false;drawAll()}});
const mediaImages=new Map(),mediaUndo=new Map();let mediaBusy=false,mediaDraft=null,mediaTarget=null,mediaPage=null,mediaPlacement=false,mediaSelecting=false,mediaRequest=0;
const MEDIA_IMAGE_LIMIT=2*1024*1024,MEDIA_TOTAL_LIMIT=24*1024*1024;
const mediaDialog=document.createElement('dialog');mediaDialog.id='mediaDialog';mediaDialog.className='tools-dialog';mediaDialog.setAttribute('aria-labelledby','mediaTitle');
mediaDialog.innerHTML='<div class="tools-heading"><h2 id="mediaTitle">Metin ekle</h2><button class="btn" id="mediaClose">× Kapat</button></div><form id="mediaForm" class="tools-content"><label id="mediaTextLabel">Metin<textarea id="mediaText" rows="5" maxlength="10000" placeholder="Notunuzu klavyeyle yazın…"></textarea></label><img id="mediaPreview" alt="Seçilen görselin önizlemesi" hidden><label id="mediaFontLabel">Yazı boyutu <input id="mediaFont" type="number" min="12" max="72" value="24" required></label><label id="mediaColorLabel">Yazı rengi <input id="mediaColor" type="color" value="#173b36"></label><label>Genişlik <input id="mediaWidth" type="number" step="any" min="80" max="1000" value="320" required></label><p class="recovery-note" id="mediaPosition"></p><button type="button" class="btn" id="mediaPlace">Sayfada yerini seç</button><p id="mediaMessage" role="status" class="recovery-note"></p><p class="recovery-note">Metin ve görseller cihazda saklanır ve yedeğe eklenir. Silgi üzerlerini silebilir; içeriği bütünüyle kaldırmak için Düzenle → Sil kullanın. Klavye: T metin, P kalem, E silgi, Ctrl/⌘+Z geri al. Metin kutusunda normal düzenleme kısayolları geçerlidir.</p><button type="submit" class="btn primary" id="mediaApply">Sayfaya ekle</button><button type="button" class="btn danger" id="mediaDelete" hidden>Bu öğeyi sil</button></form>';
document.body.append(mediaDialog);
document.querySelector('#mediaFont').step='any';
const mediaStyle=document.createElement('style');mediaStyle.textContent='#mediaForm label{display:grid;gap:6px;font-size:14px}#mediaForm textarea,#mediaForm input[type=number]{font:inherit;font-size:16px;width:100%;min-width:0;padding:10px;border:1px solid #b6ccc4;border-radius:9px}#mediaForm textarea{resize:vertical;min-height:100px;max-height:35dvh;touch-action:auto}#mediaForm input[type=color]{width:60px;height:44px}#mediaForm [hidden]{display:none}#mediaPreview{display:block;max-width:100%;max-height:160px;object-fit:contain;margin:auto}#mediaDialog{max-height:calc(100dvh - 24px);overflow:auto}#mediaCancelMode{position:absolute;left:12px;top:12px;z-index:8;max-width:calc(100% - 92px)}';document.head.append(mediaStyle);
const mediaActions=document.querySelector('.tool-actions');
const draftControls=document.createElement('div');draftControls.id='layoutDraftControls';draftControls.hidden=true;
draftControls.innerHTML='<label id="layoutTextLabel">Metin<textarea id="layoutText" rows="2" maxlength="10000" placeholder="Metninizi yazın…" aria-label="Eklenecek metin"></textarea></label><div class="draft-fields"><label id="layoutFontLabel">Yazı boyutu<input id="layoutFont" type="number" min="12" max="72" step="any" required></label><label>Genişlik<input id="layoutWidth" type="number" min="80" max="1000" step="any" required></label><label>Açı °<input id="layoutAngle" type="number" min="0" max="359.999" step="any" required></label><label id="layoutColorLabel">Yazı rengi<input id="layoutColor" type="color"></label></div><span id="layoutMessage" role="status"></span>';
layoutBar.querySelector('div').before(draftControls);
const layoutCancel=document.createElement('button');layoutCancel.id='layoutCancel';layoutCancel.className='btn';layoutCancel.hidden=true;layoutCancel.textContent='Vazgeç';layoutCancel.onclick=()=>cancelMediaMode();document.querySelector('#layoutDone').before(layoutCancel);
layoutStyle.textContent+='#layoutDraftControls{display:grid;gap:6px;margin-bottom:8px}#layoutDraftControls[hidden],#layoutBar [hidden]{display:none}#layoutDraftControls label{display:grid;gap:3px;font-size:12px;min-width:0}#layoutDraftControls .draft-fields{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}#layoutDraftControls input,#layoutDraftControls textarea{font:inherit;font-size:16px;width:100%;min-width:0;border:1px solid #b6ccc4;border-radius:8px;padding:6px;min-height:44px;background:white;color:#17312d}#layoutDraftControls textarea{resize:vertical;max-height:110px;touch-action:auto}#layoutMessage{font-size:12px;color:#8c372c}#layoutMessage:empty{display:none}';
layoutStyle.textContent+='#layoutBar>#layoutDraftControls{display:grid}#layoutBar>#layoutDraftControls[hidden]{display:none}';
function refreshPendingControls(s){if(!mediaPending||!s)return;const text=s.tool==='text';for(const id of ['layoutTextLabel','layoutFontLabel','layoutColorLabel'])document.querySelector('#'+id).hidden=!text;for(const [id,value] of [['layoutText',s.text||''],['layoutFont',s.fontSize||24],['layoutWidth',s.width],['layoutAngle',s.rotation||0],['layoutColor',s.color||'#173b36']]){const el=document.querySelector('#'+id);el.disabled=!!mediaGesture||saveConflict||!text&&['layoutText','layoutFont','layoutColor'].includes(id);if(document.activeElement!==el)el.value=value}}
for(const [id,key] of [['layoutText','text'],['layoutFont','fontSize'],['layoutWidth','width'],['layoutAngle','rotation'],['layoutColor','color']])document.querySelector('#'+id).addEventListener('input',e=>{if(!mediaPending||mediaGesture||saveConflict||!e.target.checkValidity())return;const target=mediaPending.draft,draft=structuredClone(target);draft[key]=['fontSize','width','rotation'].includes(key)?Number(e.target.value):e.target.value;commitMediaTransform(target,constrainMedia(draft));document.querySelector('#layoutMessage').textContent='';drawAll()});
function pendingCandidate(draft){return {...state,version:Math.max(state.version,draft.rotation===undefined?3:4),pages:state.pages.map(p=>p===page()?{...p,strokes:[...p.strokes,draft]}:p)}}
function beginPendingMedia(draft){if(!mediaAvailable())return;const check=draft.tool==='text'?{...draft,text:draft.text||'x'}:draft;if(!validState(pendingCandidate(check))){alert('Görsel sınırı: sayfada 12 adet, tüm defter ve Çöp Kutusunda toplam 24 MB. Mevcut notlar değişmedi.');return}closeTools();setSidebarOpen(false);mediaPending={pageId:activeId,draft:constrainMedia(structuredClone(draft)),history:[]};mediaSelecting=true;mediaSelection=null;document.querySelector('#layoutMessage').textContent='';drawAll();document.querySelector('#inputState').textContent='İlk yerleşim: taşıyın, boyutlandırın, döndürün. Bitti kaydeder; Vazgeç eklemeyi iptal eder.';if(draft.tool==='text')document.querySelector('#layoutText').focus({preventScroll:true})}
function drawPendingMedia(){if(!mediaPending||mediaPending.pageId!==activeId)return;const s=mediaVisualStroke(mediaPending.draft);drawMediaStroke(s.tool==='text'&&!s.text?{...s,text:'Metninizi yazın…'}:s)}
function finishPendingMedia(){if(!mediaPending||mediaGesture||!ready||saveConflict||importing||mediaPending.pageId!==activeId||!pdfBackgroundReady())return;for(const el of draftControls.querySelectorAll('input,textarea'))if(!el.disabled&&!el.reportValidity())return;const draft=structuredClone(mediaPending.draft);if(!validMediaStroke(draft)){document.querySelector('#layoutMessage').textContent='Metninizi yazın; boş metin eklenmez.';return}const candidate=pendingCandidate(draft);if(!validState(candidate)){document.querySelector('#layoutMessage').textContent='Öğe sınırları aşıldı; mevcut notlar değişmedi.';return}const before=page().strokes.slice(),after=[...before,draft],history=mediaUndo.get(activeId)||[];history.push({before,after:after.slice()});if(history.length>10)history.shift();mediaUndo.set(activeId,history);state.version=candidate.version;page().strokes=after;cancelMediaMode();scheduleSave()}
for(const [id,label] of [['textAdd','⌨ Metin ekle'],['imageAdd','▧ Görsel ekle'],['mediaEdit','Metin / görsel düzenle']]){const b=document.createElement('button');b.id=id;b.className='btn';b.textContent=label;mediaActions.prepend(b)}
const mediaFile=document.createElement('input');mediaFile.type='file';mediaFile.accept='image/png,image/jpeg,image/webp';mediaFile.id='imageFile';mediaFile.hidden=true;document.body.append(mediaFile);
const mediaCancelMode=document.createElement('button');mediaCancelMode.id='mediaCancelMode';mediaCancelMode.className='btn';mediaCancelMode.hidden=true;mediaCancelMode.textContent='Seçimi iptal et';document.querySelector('.workspace').append(mediaCancelMode);
function isMedia(s){return s?.tool==='text'||s?.tool==='image'}
function validMediaStroke(s){
 if(s.rotation!==undefined&&(!Number.isFinite(s.rotation)||s.rotation<0||s.rotation>=360))return false;
 if(!isMedia(s)||!Array.isArray(s.points)||s.points.length!==1||!Number.isFinite(s.points[0]?.x)||s.points[0].x<0||!Number.isFinite(s.points[0]?.y)||s.points[0].y<0||!Number.isFinite(s.width)||s.width<80||s.width>1000)return false;
 if(s.tool==='text')return typeof s.text==='string'&&s.text.trim().length>0&&s.text.length<=10000&&Number.isFinite(s.fontSize)&&s.fontSize>=12&&s.fontSize<=72&&/^#[0-9a-f]{6}$/i.test(s.color);
 if(typeof s.image!=='string'||s.image.length>MEDIA_IMAGE_LIMIT||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(s.image)||!Number.isSafeInteger(s.imageWidth)||s.imageWidth<1||s.imageWidth>1000||!Number.isSafeInteger(s.imageHeight)||s.imageHeight<1||s.imageHeight>1000)return false;
 try{const h=atob(s.image.slice(22,66)),n=i=>h.charCodeAt(i)*16777216+(h.charCodeAt(i+1)<<16)+(h.charCodeAt(i+2)<<8)+h.charCodeAt(i+3);return h.startsWith('\x89PNG\r\n\x1a\n')&&h.slice(12,16)==='IHDR'&&n(16)===s.imageWidth&&n(20)===s.imageHeight}catch{return false}
}
function validMediaBook(book){const pages=[...book.pages,...(book.trash||[]).map(t=>t.page)],items=pages.flatMap(p=>p.strokes.filter(isMedia));return (!items.length||[3,4,5].includes(book.version))&&(!items.some(s=>s.rotation!==undefined)||book.version>=4)&&pages.every(p=>p.strokes.filter(s=>s.tool==='image').length<=12)&&[...new Set(items.filter(s=>s.tool==='image').map(s=>s.image))].reduce((n,s)=>n+s.length,0)<=MEDIA_TOTAL_LIMIT}
async function validateMediaImages(book){for(const src of new Set([...book.pages,...(book.trash||[]).map(t=>t.page)].flatMap(p=>p.strokes.filter(s=>s.tool==='image').map(s=>s.image)))){const im=new Image();let timer;try{im.src=src;await Promise.race([im.decode(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error()),10000)})])}catch{throw Error('Yedekteki görsel okunamadı. Mevcut notlar değiştirilmedi.')}finally{clearTimeout(timer);im.src=''}}}
function mediaLines(s,target=ctx){target.font=`${s.fontSize}px system-ui, sans-serif`;const lines=[];for(const line of s.text.split('\n')){let row='';for(const c of line){if(row&&target.measureText(row+c).width>s.width){lines.push(row);row=c}else row+=c}lines.push(row)}return lines}
function mediaHeight(s){return s.tool==='image'?s.width*s.imageHeight/s.imageWidth:mediaLines(s).length*s.fontSize*1.35}
function drawMediaStroke(s,target=ctx,images=mediaImages){target.save();target.globalCompositeOperation='source-over';target.globalAlpha=1;const p=s.points[0],c=mediaCenter(s);target.translate(c.x,c.y);target.rotate(mediaAngle(s));target.translate(-c.x,-c.y);if(s.tool==='text'){target.fillStyle=s.color;target.textBaseline='top';const lines=mediaLines(s,target);for(let i=0;i<lines.length;i++)target.fillText(lines[i],p.x,p.y+i*s.fontSize*1.35)}else{let im=images.get(s.image);if(!im){im=new Image();images.set(s.image,im);im.onload=()=>drawAll();im.onerror=()=>{document.querySelector('#inputState').textContent='Bir görsel okunamadı; yedeğinizi koruyun.'};im.src=s.image}if(im.complete&&im.naturalWidth)target.drawImage(im,p.x,p.y,s.width,mediaHeight(s))}target.restore()}
function pruneMediaImages(){const used=new Set(page()?.strokes.filter(s=>s.tool==='image').map(s=>s.image));if(mediaPending?.draft.tool==='image')used.add(mediaPending.draft.image);for(const [src,im] of mediaImages)if(!used.has(src)){im.onload=im.onerror=null;im.src='';mediaImages.delete(src)}}
function mediaMessage(t){document.querySelector('#mediaMessage').textContent=t}
function mediaAvailable(){return canEdit()&&!drawing&&!pan&&!!page()&&pdfBackgroundReady()}
function syncMediaDraft(){if(!mediaDraft)return;mediaDraft.width=Number(document.querySelector('#mediaWidth').value);if(mediaDraft.tool==='text'){mediaDraft.text=document.querySelector('#mediaText').value;mediaDraft.fontSize=Number(document.querySelector('#mediaFont').value);mediaDraft.color=document.querySelector('#mediaColor').value}}
function showMedia(){
 const text=mediaDraft.tool==='text';document.querySelector('#mediaTitle').textContent=(mediaTarget?'Düzenle: ':'Ekle: ')+(text?'metin':'görsel');
 for(const id of ['mediaTextLabel','mediaFontLabel','mediaColorLabel'])document.querySelector('#'+id).hidden=!text;
 document.querySelector('#mediaText').value=mediaDraft.text||'';document.querySelector('#mediaFont').value=mediaDraft.fontSize||24;document.querySelector('#mediaColor').value=mediaDraft.color||'#173b36';document.querySelector('#mediaWidth').value=mediaDraft.width;
 const preview=document.querySelector('#mediaPreview');preview.hidden=text;if(!text)preview.src=mediaDraft.image;else preview.removeAttribute('src');
 document.querySelector('#mediaPosition').textContent=`Konum: ${Math.round(mediaDraft.points[0].x)}, ${Math.round(mediaDraft.points[0].y)} · boyutlar sayfa birimidir`;
 document.querySelector('#mediaDelete').hidden=!mediaTarget;document.querySelector('#mediaApply').textContent=mediaTarget?'Değişikliği kaydet':'Sayfaya ekle';mediaMessage('');closeTools();mediaDialog.showModal();mediaDialog.scrollTop=0;(text?document.querySelector('#mediaText'):document.querySelector('#mediaWidth')).focus({preventScroll:true});
}
function beginMedia(draft,target=null){mediaDraft=structuredClone(draft);mediaTarget=target;mediaPage=activeId;showMedia()}
function defaultMediaPoint(){return {x:viewX()+24/paperScale(),y:viewY()+48/paperScale()}}
document.querySelector('#textAdd').onclick=()=>{if(!mediaAvailable())return;beginPendingMedia({tool:'text',text:'',fontSize:24,color:document.querySelector('#color').value,width:Math.max(80,Math.min(440,(canvas.getBoundingClientRect().width-60)/paperScale())),points:[defaultMediaPoint()]})};
document.querySelector('#imageAdd').onclick=()=>{if(mediaAvailable())mediaFile.click()};
document.querySelector('#mediaClose').onclick=()=>mediaDialog.close();
mediaDialog.addEventListener('close',()=>{if(!mediaPlacement&&!mediaDialog.open){mediaDraft=null;mediaTarget=null;document.querySelector('#mediaPreview').removeAttribute('src')}});
mediaFile.onchange=async()=>{
 const file=mediaFile.files[0];mediaFile.value='';if(!file||!mediaAvailable())return;const id=activeId,request=++mediaRequest;mediaBusy=true;let bmp;
 try{if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>10*1024*1024)throw Error('En fazla 10 MB PNG, JPEG veya WebP seçin. HEIC fotoğrafı önce JPEG olarak dışa aktarın.');
  bmp=await createImageBitmap(file,{imageOrientation:'from-image'});if(bmp.width*bmp.height>40000000||!bmp.width||!bmp.height)throw Error('Görsel çok büyük veya okunamadı.');
  const ratio=Math.min(1,1000/Math.max(bmp.width,bmp.height)),surface=document.createElement('canvas');surface.width=Math.max(1,Math.round(bmp.width*ratio));surface.height=Math.max(1,Math.round(bmp.height*ratio));surface.getContext('2d').drawImage(bmp,0,0,surface.width,surface.height);
  const draft={tool:'image',image:surface.toDataURL('image/png'),imageWidth:surface.width,imageHeight:surface.height,width:Math.max(80,Math.min(480,(canvas.getBoundingClientRect().width-60)/paperScale())),color:'#173b36',points:[defaultMediaPoint()]};surface.width=surface.height=1;
  if(draft.image.length>MEDIA_IMAGE_LIMIT)throw Error('Küçültülmüş görsel 2 MB sınırını aşıyor. Daha sade/küçük bir görsel seçin.');
  mediaBusy=false;if(request!==mediaRequest||id!==activeId||!mediaAvailable())return;beginPendingMedia(draft);
 }catch(e){alert(e.message||'Görsel eklenemedi; mevcut notlar değiştirilmedi.')}finally{mediaBusy=false;if(bmp)bmp.close()}
};
function commitMedia(remove=false){
 if(!mediaAvailable()||activeId!==mediaPage||!mediaDraft)return;syncMediaDraft();if(!remove&&!validMediaStroke(mediaDraft)){mediaMessage('Metni ve boyutları kontrol edin. Metin boş bırakılamaz.');return}
 const target=page(),index=mediaTarget?target.strokes.indexOf(mediaTarget):-1;if(mediaTarget&&index<0){mediaMessage('Öğe değişti; yeniden açın.');return}
 const next=target.strokes.slice();if(remove){if(index<0)return;next.splice(index,1)}else if(index>=0)next[index]=structuredClone(mediaDraft);else next.push(structuredClone(mediaDraft));
 const candidate={...state,version:Math.max(3,state.version),pages:state.pages.map(p=>p===target?{...p,strokes:next}:p)};
 if(!validState(candidate)){mediaMessage('Görsel sınırı: sayfada 12 adet, tüm defter ve Çöp Kutusunda toplam 24 MB. Mevcut notlar değişmedi.');return}
 const history=mediaUndo.get(activeId)||[];history.push({before:target.strokes.slice(),after:next.slice()});if(history.length>10)history.shift();mediaUndo.set(activeId,history);
 state.version=candidate.version;target.strokes=next;mediaDialog.close();drawAll();scheduleSave();
}
document.querySelector('#mediaForm').onsubmit=e=>{e.preventDefault();commitMedia()};document.querySelector('#mediaDelete').onclick=()=>{if(confirm('Bu metin/görsel silinsin mi? Bu oturumda Geri al kullanılabilir.'))commitMedia(true)};
function undoMedia(){const h=mediaUndo.get(activeId),last=h?.at(-1);if(!last||JSON.stringify(page().strokes)!==JSON.stringify(last.after))return false;page().strokes=last.before;h.pop();return true}
function cancelMediaMode(){const placing=mediaPlacement,creating=!!mediaPending;cancelMediaGesture();mediaPending=null;mediaSelection=null;layoutTouches.clear();layoutMulti=false;mediaPlacement=false;mediaSelecting=false;mediaCancelMode.hidden=true;drawAll();if(creating)document.querySelector('#inputState').textContent='Kalemle yazın · iki parmakla yukarı/aşağı kaydırın';if(placing&&mediaDraft&&activeId===mediaPage)showMedia()}
mediaCancelMode.onclick=cancelMediaMode;
document.querySelector('#mediaPlace').onclick=()=>{syncMediaDraft();mediaPlacement=true;mediaDialog.close();mediaCancelMode.hidden=false;document.querySelector('#inputState').textContent='Metin/görselin sol üst köşesi için kalem veya fareyle sayfaya dokunun. Dokunma için avuç korumasını kapatın.'};
document.querySelector('#mediaEdit').onclick=()=>{if(!mediaAvailable())return;closeTools();setSidebarOpen(false);mediaSelecting=true;mediaCancelMode.hidden=true;drawAll();document.querySelector('#inputState').textContent='Öğeye dokunun ve sürükleyin. ↘ tutamacıyla boyutlandırın. Bu modda tek parmak, kalem veya fare kullanılabilir.'};
document.querySelector('#canvas').addEventListener('pointerdown',e=>{
 if(!mediaPlacement&&!mediaSelecting)return;e.preventDefault();e.stopImmediatePropagation();if(!ready||saveConflict||importing||!page()||(mediaPlacement&&!allowed(e))||(e.pointerType==='mouse'&&e.button!==0))return;
 const pt=point(e);if(mediaPlacement){if(activeId!==mediaPage)return;mediaDraft.points=[{x:Math.max(0,pt.x),y:Math.max(0,pt.y)}];mediaPlacement=false;mediaCancelMode.hidden=true;showMedia();return}
 const target=mediaPending?(mediaHit(mediaPending.draft,pt)?mediaPending.draft:null):[...page().strokes].reverse().find(s=>isMedia(s)&&mediaHit(s,pt));
 if(mediaSelecting)startMediaGesture(e,target,false);
},{capture:true});
document.addEventListener('keydown',e=>{
 if(e.isComposing)return;
 if(e.key==='Escape'&&(mediaPlacement||mediaSelecting)){e.preventDefault();cancelMediaMode();return}
 if(mediaSelecting&&(e.ctrlKey||e.metaKey)&&!e.shiftKey&&!e.altKey&&e.key.toLowerCase()==='z'&&!e.target.closest?.('input,textarea,select,[contenteditable=true]')){e.preventDefault();document.querySelector('#layoutUndo').click();return}
 if(e.isComposing||e.target.closest?.('input,textarea,select,[contenteditable=true]')||document.querySelector('dialog[open]')||!mediaAvailable())return;
 if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&!e.altKey&&e.key.toLowerCase()==='z'){e.preventDefault();document.querySelector('#undo').click();return}
 if(e.ctrlKey||e.metaKey||e.altKey)return;const key=e.key.toLowerCase();if(key==='t'){e.preventDefault();document.querySelector('#textAdd').click()}else if(key==='p'||key==='e'){e.preventDefault();selectTool(key==='p'?'pen':'eraser')}
});
