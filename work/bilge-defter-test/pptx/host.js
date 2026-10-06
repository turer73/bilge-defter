import {openStore} from './store.js';
import {validateMeta, validateNotebook, normalizeStrokes, createBackup, parseBackup} from './model.js';
import {createRenderer} from './renderer-bridge.js';

// Trusted host owns all notes/storage. The opaque renderer receives only the
// chosen presentation, never a scope, account, callback, or storage command.
export async function mountPilot(container, {scope, guard = () => true, onClose = () => {}, notebook, mode: integrationMode = 'pilot'}) {
  const selectedNotebook = notebook === undefined ? null : Object.freeze(validateNotebook(notebook));
  if (integrationMode === 'app' && (!selectedNotebook || !scope.startsWith('bilge-defter-account-'))) throw Error('Doğrulanmış hesap ve defter gerekli.');
  const root = document.createElement('section');
  root.className = 'pptx-pilot';
  root.innerHTML = `<header><div><p class="eyebrow">DENEYSEL · DOĞRUDAN POWERPOINT</p><h1>Sunum üzerine not al</h1></div><button id="pptxExit" type="button">Deftere dön</button></header>
    <p class="pilot-warning">Yerel geliştirme adayı. Sunum bu cihazda açılır, PDF'e çevrilmez. Notlar bu tarayıcıda saklanır; eşitleme yoktur. Bu sunumların yedeği normal defter yedeğinden ayrıdır.</p>
    <div class="file-row"><label class="file-button">PowerPoint seç<input id="pptxSource" type="file" accept=".pptx"></label><span>20 MiB · en fazla 100 slayt · yalnız .pptx</span></div>
    <div class="file-row"><label>Kayıtlı sunum<select id="pptxSaved"><option value="">Henüz sunum yok</option></select></label><button id="pptxOpenSaved" type="button">Aç</button><button id="pptxBackup" type="button" disabled>Sunum ve not yedeği al</button><label class="file-button">Sunum yedeği yükle<input id="pptxRestoreInput" type="file" accept=".bdpptx"></label></div>
    <p id="pptxNotebook" class="pilot-help"></p><label id="pptxAllLabel" hidden><input id="pptxAll" type="checkbox">Bu hesaptaki diğer defterlerin sunumlarını da göster</label>
    <p id="pptxStatus" role="status" aria-live="polite">Depolama hazırlanıyor…</p>
    <div class="error-actions" hidden><button id="pptxSaveRetry" type="button">Kaydı yeniden dene</button><button id="pptxSaveCopy" type="button">Taslağı ayrı kopya kaydet</button></div>
    <nav aria-label="Slayt ve kalem araçları"><button id="pptxPrev" type="button">Önceki</button><output id="pptxPosition">0 / 0</output><button id="pptxNext" type="button">Sonraki</button><button id="pptxPen" type="button" aria-pressed="true">Kalem</button><button id="pptxEraser" type="button" aria-pressed="false">Çizgi sil</button><button id="pptxUndo" type="button">Geri al</button><label>Renk<input id="pptxColor" type="color" value="#c12439"></label><label>Kalınlık<input id="pptxWidth" type="range" min="1" max="16" value="3"></label></nav>
    <label class="touch-option"><input id="pptxTouch" type="checkbox">Parmak / uyumlu kalemle çiz (avuç içi de çizgi oluşturabilir)</label>
    <div id="pptxScroll" class="slide-scroll"><div id="pptxStage"><div id="pptxFrame" inert></div><canvas id="pptxInk" aria-label="Slayt üzerine çizim alanı"></canvas><canvas id="pptxDraft" aria-hidden="true"></canvas><div id="pptxCover">Bir sunum seçin veya kayıtlı sunumu açın.</div></div></div>
    <p class="pilot-help">Özgün slayt değişmez. Kalem ve silgi yalnız not katmanını değiştirir. İki parmakla kaydırabilirsiniz. Yazı tipleri ve bazı şekiller farklı görünebilir; önemli slaytları aslıyla karşılaştırın.</p>`;
  container.append(root);
  const q = id => root.querySelector('#' + id);
  if (integrationMode === 'app') root.querySelector('.pilot-warning').textContent = 'Deneysel doğrudan okuyucu. Sunum bu cihazda açılır, PDF’e çevrilmez ve sunucuya gönderilmez. Sunum ve kalem notları seçili deftere bağlı, yalnız bu tarayıcıda saklanır; eşitleme ve normal JSON defter yedeğine dahil değildir. Ayrıca “Sunum ve not yedeği al” düğmesini kullanın. Yedek yükleme seçili deftere yeni bir sunum ekler.';
  q('pptxAllLabel').hidden = !selectedNotebook;
  q('pptxNotebook').textContent = selectedNotebook ? `Eklenecek defter: ${selectedNotebook.title}` : '';
  const ink = q('pptxInk'), draft = q('pptxDraft'), stage = q('pptxStage');
  const ctx = ink.getContext('2d'), preview = draft.getContext('2d');
  let store, renderer, rendererBoot = null, record = null, notes = new Map(), history = new Map();
  let closed = false, locked = false, busy = false, phase = 'opening', epoch = 0;
  let slideIndex = 0, serial = 0, savedSerial = 0, saving = null, lastError = null;
  let active = null, mode = 'pen', raf = 0, touches = new Map(), pan = null, suppressTouch = false;
  const urls = new Set();
  const accessValid = () => { try { return guard() === true; } catch { return false; } };
  const allowed = () => !closed && !locked && accessValid();
  const dirty = () => serial !== savedSerial;
  const alive = token => allowed() && epoch === token;
  const snapshot = () => ({phase, dirty:dirty(), busy, documentId:record?.id || null,
    revision:record?.revision || null, slideIndex, lastError, locked, closed,
    notebook: record?.notebook || selectedNotebook,
    strokeCount:[...notes.values()].reduce((n, strokes) => n + strokes.length, 0)});
  const list = () => notes.get(slideIndex + 1) || [];
  const allNotes = () => [...notes].sort((a,b) => a[0] - b[0]).map(([slide, strokes]) => ({slide, strokes}));
  const notify = text => { q('pptxStatus').textContent = text; };
  function update() {
    const disabled = !allowed() || busy;
    q('pptxSource').disabled = disabled; q('pptxRestoreInput').disabled = disabled;
    q('pptxSaved').disabled = disabled;
    q('pptxAll').disabled = disabled;
    q('pptxOpenSaved').disabled = disabled || !q('pptxSaved').value;
    q('pptxPrev').disabled = disabled || !record || slideIndex === 0;
    q('pptxNext').disabled = disabled || !record || slideIndex >= record.meta.slideCount - 1;
    q('pptxBackup').disabled = !allowed() || !record || busy;
    q('pptxUndo').disabled = disabled || !record || !(history.get(slideIndex)?.length) || !!lastError;
    q('pptxSaveRetry').disabled = disabled || !dirty() || lastError === 'CONFLICT';
    q('pptxSaveCopy').disabled = disabled || !record;
    root.querySelector('.error-actions').hidden = !lastError || !allowed();
    q('pptxPosition').textContent = `${record ? slideIndex + 1 : 0} / ${record?.meta.slideCount || 0}`;
    ink.style.pointerEvents = !disabled && record && phase === 'ready' && !lastError ? 'auto' : 'none';
  }
  const errorText = error => ({CONFLICT:'Bu sunum başka bir pencerede değişti. Taslağınız korunuyor. Yedek alın veya ayrı kopya kaydedin.',
    QUOTA:'Depolama sınırına ulaşıldı. Son çizimler henüz kaydedilemedi. Pencereyi kapatmadan sunum yedeği alın.',
    QuotaExceededError:'Cihazda yeterli depolama alanı yok. Son çizimler henüz kaydedilemedi. Sunum yedeği alın.',
    CLOSED:'Depolama veya hesap kapandı. Kayıtlı sunumlar korunuyor.', CORRUPT:'Sunum veya yedek bütünlüğü doğrulanamadı. Mevcut kayıtlar değiştirilmedi.',
    INVALID:'Dosya veya not biçimi desteklenmiyor. Mevcut kayıtlar değiştirilmedi.', TIMEOUT:'Sunum zamanında hazırlanamadı. İşlem durduruldu; kayıtlı notlar korunuyor.',
    LIMIT:'Sunum güvenli boyut veya içerik sınırını aşıyor.', UNSUPPORTED:'Bu sunumun bazı içerikleri doğrudan okuyucuda desteklenmiyor.',
    RENDER:'Slayt eksiksiz çizilemedi. Kayıtlı notlarınız korunuyor.'}[error?.code || error?.name] || 'İşlem tamamlanamadı. Mevcut kayıtlar korunuyor; yeniden deneyin.');
  function fail(error) { if(closed || locked)return; lastError = error?.code || error?.name || 'ERROR'; notify(errorText(error)); update(); }
  function cover(text) { q('pptxCover').textContent = text; q('pptxCover').hidden = !text; }
  function drawLine(context, stroke) {
    context.strokeStyle = stroke.color; context.lineCap = context.lineJoin = 'round';
    const points = stroke.points;
    // A missing or zero mouse pressure has a stable usable width.
    for (let i = 0; i < Math.max(1, points.length - 1); i++) {
      const a = points[i], b = points[i + 1] || a;
      context.lineWidth = stroke.width * (a.pressure > 0 ? .35 + a.pressure * .9 : 1);
      context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x + (a === b ? .01 : 0), b.y); context.stroke();
    }
  }
  function clearCanvas(context, canvas) {
    context.setTransform(1,0,0,1,0,0); context.clearRect(0,0,canvas.width,canvas.height);
    const scale = canvas.width / 1000; context.setTransform(scale,0,0,scale,0,0);
  }
  function paintBase() { clearCanvas(ctx, ink); if(record) for (const stroke of list()) drawLine(ctx, stroke); }
  function paintDraft() {
    raf = 0; clearCanvas(preview, draft);
    if (active?.mode === 'pen') drawLine(preview, active.stroke);
    if (active?.mode === 'eraser') {clearCanvas(ctx, ink); for (const stroke of active.remaining) drawLine(ctx, stroke);}
  }
  function scheduleDraft() { if (!raf) raf = requestAnimationFrame(paintDraft); }
  function layout() {
    if (!record || closed) return;
    const ratio = record.meta.height / record.meta.width;
    // The renderer uses a fixed 1000px coordinate space, as do stored strokes.
    // Scale the iframe itself so slide content and the ink overlay stay aligned.
    if(renderer?.element) {
      renderer.element.style.transformOrigin = 'top left';
      renderer.element.style.transform = `scale(${stage.clientWidth / 1000})`;
    }
    let width = Math.max(1, Math.round(stage.clientWidth * Math.min(devicePixelRatio || 1, 2)));
    width = Math.min(width, 4096, Math.floor(4096 / ratio), Math.floor(Math.sqrt(8e6 / ratio)));
    for (const canvas of [ink,draft]) { canvas.width = width; canvas.height = Math.max(1, Math.round(width * ratio)); }
    paintBase(); paintDraft();
  }
  const resize = new ResizeObserver(layout); resize.observe(stage);
  function release(id) { try { if(ink.hasPointerCapture(id)) ink.releasePointerCapture(id); } catch {} }
  function cancelStroke() { const old = active; active = null; if(old) release(old.id); if(raf) cancelAnimationFrame(raf); raf=0; paintBase(); clearCanvas(preview,draft); }
  function point(event) {
    const rect = ink.getBoundingClientRect(), height = 1000 * record.meta.height / record.meta.width;
    return {x:Math.min(1000, Math.max(0,(event.clientX - rect.left)*1000/rect.width)),
      y:Math.min(height, Math.max(0,(event.clientY - rect.top)*height/rect.height)),
      pressure:event.pointerType==='pen' && Number.isFinite(event.pressure) ? Math.max(0,Math.min(1,event.pressure)) : 0};
  }
  function segmentDistance(p,a,b) {const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}
  function erase(p) {active.remaining = active.remaining.filter(stroke => !stroke.points.some((a,i)=>segmentDistance(p,a,stroke.points[i+1]||a)<18+stroke.width/2));}
  function commit(strokes, persist = true, remember = true) {
    const next = new Map(notes); next.set(slideIndex+1, strokes);
    try {normalizeStrokes([...next].map(([slide, strokes])=>({slide, strokes})), record.meta);} catch(error) {cancelStroke();fail(error);return false;}
    if(remember) {
      const stack = history.get(slideIndex) || []; stack.push(list()); if(stack.length > 20) stack.shift();
      history.set(slideIndex, stack);
    }
    notes = next; serial++; paintBase(); clearCanvas(preview,draft);update();
    if(persist)void flush().catch(()=>{});
    return true;
  }
  function appendPenPoint(point) {
    if(active.stroke.points.length>=5000) {
      const completed=active.stroke;
      if(!commit([...list(),completed],true,!active.chunked))return false;
      active.chunked=true;
      active.stroke={width:completed.width,color:completed.color,points:[completed.points.at(-1)]};
    }
    active.stroke.points.push(point);return true;
  }
  function sealDraftStroke() {
    if(!active)return true;
    const done=active;active=null;release(done.id);
    if(raf)cancelAnimationFrame(raf);raf=0;
    if(done.mode==='pen')return commit([...list(),done.stroke],false,!done.chunked);
    if(done.remaining.length!==list().length)return commit(done.remaining,false);
    paintBase();clearCanvas(preview,draft);return true;
  }
  function center() {const points=[...touches.values()];return {x:points.reduce((n,p)=>n+p.x,0)/points.length,y:points.reduce((n,p)=>n+p.y,0)/points.length};}
  ink.addEventListener('pointerdown',event => {
    if(!allowed()||busy||!record||phase!=='ready'||lastError)return;
    if(event.pointerType==='touch') {
      touches.set(event.pointerId,{x:event.clientX,y:event.clientY}); event.preventDefault();
      if(active?.type==='pen') return;
      if(touches.size>=2) {cancelStroke();suppressTouch=true;pan=center();try{ink.setPointerCapture(event.pointerId);}catch{}return;}
      if(!q('pptxTouch').checked||suppressTouch)return;
    }
    if(active||(!['pen','mouse','touch'].includes(event.pointerType))||event.button!==0)return;
    event.preventDefault(); const p=point(event);
    active={id:event.pointerId,type:event.pointerType,mode,stroke:{width:Number(q('pptxWidth').value),color:q('pptxColor').value,points:[p]},remaining:[...list()]};
    try{ink.setPointerCapture(event.pointerId);}catch{} if(mode==='eraser')erase(p);scheduleDraft();
  });
  ink.addEventListener('pointermove',event => {
    if(touches.has(event.pointerId)) {touches.set(event.pointerId,{x:event.clientX,y:event.clientY}); if(touches.size>=2&&pan&&!active){event.preventDefault();const next=center();q('pptxScroll').scrollTop-=next.y-pan.y;q('pptxScroll').scrollLeft-=next.x-pan.x;pan=next;return;}}
    if(!active||event.pointerId!==active.id||!allowed())return;
    event.preventDefault(); const events=event.getCoalescedEvents?.() || [event];
    for(const value of events.length?events:[event]) {const p=point(value);if(active.mode==='eraser')erase(p);else if(!appendPenPoint(p))return;}
    scheduleDraft();
  });
  function finish(event, cancelled=false) {
    touches.delete(event.pointerId); if(!touches.size){pan=null;suppressTouch=false;}
    if(!active||event.pointerId!==active.id)return;
    if(cancelled||!allowed()){cancelStroke();return;}
    event.preventDefault();
    if(active.mode==='pen'&&!appendPenPoint(point(event)))return;
    const done=active;active=null;release(done.id);
    if(done.mode==='pen')commit([...list(),done.stroke],true,!done.chunked);
    else if(done.remaining.length!==list().length)commit(done.remaining);else{paintBase();clearCanvas(preview,draft);}
  }
  ink.addEventListener('pointerup',event=>finish(event));
  ink.addEventListener('pointercancel',event=>finish(event,true));
  ink.addEventListener('lostpointercapture',event=>{if(active?.id===event.pointerId)cancelStroke();touches.delete(event.pointerId);if(!touches.size){pan=null;suppressTouch=false;}});
  ink.addEventListener('contextmenu',event=>event.preventDefault());
  function loadNotes(value) {notes=new Map(value.map(item=>[item.slide,item.strokes]));history=new Map();serial=savedSerial=0;lastError=null;}
  async function flush() {
    if(saving)return saving;
    if(!dirty()||!record)return true;
    if(!allowed())throw Object.assign(Error('closed'),{code:'CLOSED'});
    if(lastError==='CONFLICT')throw Object.assign(Error('conflict'),{code:'CONFLICT'});
    const own=epoch;
    saving=(async()=>{
      while(dirty()) {
        if(!alive(own))throw Object.assign(Error('closed'),{code:'CLOSED'});
        const value=structuredClone(allNotes()), revision=record.revision, observed=serial, id=record.id;
        notify('Notlar kaydediliyor…');
        const saved=await store.saveNotes(id,revision,value);
        if(!alive(own)||record.id!==id)throw Object.assign(Error('closed'),{code:'CLOSED'});
        record={...record,revision:saved.revision,updated:saved.updated};savedSerial=observed;
      }
      lastError=null;notify('Sunum ve notlar bu cihazda kaydedildi.');update();return true;
    })().catch(error=>{if(alive(own))fail(error);throw error;}).finally(()=>{saving=null;});
    return saving;
  }
  async function refreshList() {
    const own=epoch, all=await store.list(); if(!alive(own))return;
    const items=all.filter(item=>!selectedNotebook||q('pptxAll').checked||item.notebook?.id===selectedNotebook.id);
    const select=q('pptxSaved');select.replaceChildren();
    const empty=document.createElement('option');empty.value='';empty.textContent=items.length?'Sunum seçin':'Henüz sunum yok';select.append(empty);
    for(const item of items){const option=document.createElement('option');option.value=item.id;option.textContent=`${item.name} · ${item.meta.slideCount} slayt${q('pptxAll').checked ? ' · '+(item.notebook?.title || 'Deftere bağlanmamış') : ''}`;select.append(option);}
    if(record)select.value=record.id;update();
  }
  async function freshRenderer(bytes, own) {
    renderer?.dispose();renderer=null;
    rendererBoot?.abort();const boot=new AbortController();rendererBoot=boot;
    let next;
    try{next=await createRenderer(q('pptxFrame'),{timeoutMs:25000,signal:boot.signal});}
    finally{if(rendererBoot===boot)rendererBoot=null;}
    if(!alive(own)){next.dispose();throw Object.assign(Error('closed'),{code:'CLOSED'});}
    renderer=next;
    const loaded=await next.load(bytes);
    const meta=validateMeta({slideCount:loaded.slideCount,width:loaded.width,height:loaded.height});
    if(!alive(own))throw Object.assign(Error('closed'),{code:'CLOSED'});
    return meta;
  }
  async function replaceDocument(operation) {
    if(!allowed()||busy)return;
    busy=true;update();if(!sealDraftStroke()){busy=false;update();return;}
    try{await flush();}catch(error){busy=false;update();throw error;}
    if(!allowed()){busy=false;return;}
    const own=++epoch;phase='loading';lastError=null;cover('Sunum hazırlanıyor…');update();
    try {
      const next=await operation(own);if(!alive(own))return;
      record=next;slideIndex=0;loadNotes(next.notes);stage.style.aspectRatio=`${next.meta.width} / ${next.meta.height}`;stage.style.minHeight='0';
      q('pptxNotebook').textContent = selectedNotebook ? `Eklenecek defter: ${selectedNotebook.title}${next.notebook?.id !== selectedNotebook.id ? ' · Açık sunumun defteri: '+(next.notebook?.title || 'Deftere bağlanmamış') : ''}` : '';
      await renderer.show(0);if(!alive(own))return;
      phase='ready';cover('');layout();notify('Sunum ve notlar bu cihazda kaydedildi.');await refreshList();
    }catch(error){if(alive(own)){phase='error';renderer?.dispose();renderer=null;cover('Sunum açılamadı. Kayıtlı sunumlar listeden yeniden açılabilir.');fail(error);}}
    finally{if(alive(own)){busy=false;update();}}
  }
  async function choose(file, backup=false) {
    if(!file)return;
    return replaceDocument(async own=>{
      let source;
      if(backup) source=await parseBackup(file);
      else {
        if(!file.name.toLowerCase().endsWith('.pptx')||!file.size||file.size>20*1024*1024)throw Object.assign(Error('invalid file'),{code:'INVALID'});
        source={bytes:await file.arrayBuffer(),name:file.name,notes:[]};
      }
      if(!alive(own))throw Object.assign(Error('closed'),{code:'CLOSED'});
      const meta=await freshRenderer(source.bytes,own);
      if(source.meta&&(meta.slideCount!==source.meta.slideCount||meta.width!==source.meta.width||meta.height!==source.meta.height))throw Object.assign(Error('meta mismatch'),{code:'CORRUPT'});
      const notes=normalizeStrokes(source.notes,meta);
      return store.create({bytes:source.bytes,name:source.name,meta,notes,...(selectedNotebook ? {notebook:selectedNotebook} : {})});
    });
  }
  async function openSaved(id) {
    if(!id)return;
    return replaceDocument(async own=>{
      const next=await store.get(id);if(!alive(own))throw Object.assign(Error('closed'),{code:'CLOSED'});
      if(selectedNotebook && !q('pptxAll').checked && next.notebook?.id !== selectedNotebook.id) throw Object.assign(Error('notebook mismatch'),{code:'INVALID'});
      const meta=await freshRenderer(next.bytes,own);
      if(meta.slideCount!==next.meta.slideCount||meta.width!==next.meta.width||meta.height!==next.meta.height)throw Object.assign(Error('meta mismatch'),{code:'CORRUPT'});
      return next;
    });
  }
  async function showSlide(index) {
    if(!allowed()||busy||!record||index<0||index>=record.meta.slideCount)return;
    busy=true;update();if(!sealDraftStroke()){busy=false;update();return;}try{await flush();}catch{busy=false;update();return;}
    if(!allowed()){busy=false;return;}
    const own=epoch;phase='rendering';cover('Slayt hazırlanıyor…');update();
    try{await renderer.show(index);if(!alive(own))return;slideIndex=index;phase='ready';cover('');layout();notify('Sunum ve notlar bu cihazda kaydedildi.');}
    catch(error){if(alive(own)){phase='error';cover('Slayt gösterilemedi. Kayıtlı notlar korunuyor.');fail(error);}}
    finally{if(alive(own)){busy=false;update();}}
  }
  function download(blob,name) {const url=URL.createObjectURL(blob);urls.add(url);const a=document.createElement('a');a.href=url;a.download=name;root.append(a);a.click();a.remove();setTimeout(()=>{URL.revokeObjectURL(url);urls.delete(url);},60000);}
  q('pptxSource').onchange=()=>{const file=q('pptxSource').files?.[0];q('pptxSource').value='';void choose(file).catch(fail);};
  q('pptxRestoreInput').onchange=()=>{const file=q('pptxRestoreInput').files?.[0];q('pptxRestoreInput').value='';void choose(file,true).catch(fail);};
  q('pptxSaved').onchange=update;q('pptxOpenSaved').onclick=()=>void openSaved(q('pptxSaved').value).catch(fail);
  q('pptxAll').onchange=()=>void refreshList().catch(fail);
  q('pptxPrev').onclick=()=>void showSlide(slideIndex-1);q('pptxNext').onclick=()=>void showSlide(slideIndex+1);
  for(const tool of ['pen','eraser'])q(tool==='pen'?'pptxPen':'pptxEraser').onclick=()=>{cancelStroke();mode=tool;q('pptxPen').setAttribute('aria-pressed',String(tool==='pen'));q('pptxEraser').setAttribute('aria-pressed',String(tool==='eraser'));};
  q('pptxUndo').onclick=()=>{if(!allowed()||busy||lastError)return;cancelStroke();const previous=history.get(slideIndex)?.pop();if(previous){notes.set(slideIndex+1,previous);serial++;paintBase();update();void flush().catch(()=>{});}};
  q('pptxTouch').onchange=()=>{cancelStroke();touches.clear();pan=null;suppressTouch=false;};
  q('pptxSaveRetry').onclick=()=>{if(lastError==='CONFLICT')return;lastError=null;update();void flush().catch(()=>{});};
  q('pptxSaveCopy').onclick=async()=>{
    if(!allowed()||busy||!record)return;busy=true;update();const own=epoch;
    try{
      // Freeze visible ink before the asynchronous copy. The pointer may still
      // be held down when another pointer activates this recovery button.
      if(!sealDraftStroke())return;
      if(saving)await saving.catch(()=>{});
      if(!alive(own))return;
      const observed=serial, snapshot=structuredClone(allNotes());
      const next=await store.create({bytes:record.bytes,name:record.name,meta:record.meta,notes:snapshot,...(record.notebook ? {notebook:record.notebook} : {})});
      if(!alive(own))return;
      record=next;savedSerial=observed;lastError=null;
      notify(dirty()?'Kopya kaydedildi; son değişiklikler henüz kaydedilmedi.':'Taslak ayrı bir sunum olarak kaydedildi. Diğer kayıt değiştirilmedi.');
      await refreshList();
      if(dirty())await flush();
    }
    catch(error){if(alive(own))fail(error);}finally{if(alive(own)){busy=false;update();}}
  };
  q('pptxBackup').onclick=async()=>{
    if(!allowed()||!record||busy)return;if(!sealDraftStroke())return;const own=epoch;
    try{const pending=dirty();const blob=await createBackup({...record,notes:structuredClone(allNotes())});if(!alive(own))return;download(blob,`bilge-sunum-${pending?'taslak-':''}${Date.now()}.bdpptx`);notify('Sunum ve not yedeği hazırlandı. İndirilen dosyanın cihazda bulunduğunu kontrol edin.');}
    catch(error){if(alive(own))fail(error);}
  };
  async function prepareToLeave() {
    if(!allowed())return false;
    if(busy){notify('İşlem sürüyor. Sunum hazırlandıktan sonra tekrar deneyin.');return false;}
    // Freeze a held pen before flushing; navigation must not discard visible ink.
    busy=true;update();
    try{if(!sealDraftStroke())return false;await flush();return allowed()&&!dirty();}
    catch{return false;}
    finally{if(allowed()){busy=false;update();}}
  }
  async function exit() {if(!await prepareToLeave())return false;destroy();onClose();return true;}
  q('pptxExit').onclick=()=>void exit();
  const beforeUnload=event=>{if(active||dirty()||saving){event.preventDefault();event.returnValue='';}};
  const onHidden=()=>{if(document.visibilityState==='hidden'&&allowed()&&!busy){if(sealDraftStroke())void flush().catch(()=>{});}};
  const lock=()=>{if(closed)return;locked=true;epoch++;cancelStroke();rendererBoot?.abort();rendererBoot=null;renderer?.dispose();renderer=null;store?.close();record=null;notes.clear();history.clear();phase='locked';cover('Hesap erişimi değişti. Son başarılı kayıt korunuyor.');notify('Notlar gizlendi. Tamamlanmamış son çizimler kaydedilmemiş olabilir. Aynı hesapla yeniden giriş yaptıktan sonra kontrol edin.');update();};
  const guardTimer=setInterval(()=>{if(!closed&&!locked&&!accessValid())lock();},500);
  function destroy(){if(closed)return;closed=true;epoch++;cancelStroke();rendererBoot?.abort();rendererBoot=null;renderer?.dispose();renderer=null;store?.close();resize.disconnect();clearInterval(guardTimer);for(const url of urls)URL.revokeObjectURL(url);urls.clear();removeEventListener('beforeunload',beforeUnload);removeEventListener('bilge-account-locked',lock);document.removeEventListener('visibilitychange',onHidden);notes.clear();history.clear();record=null;root.remove();phase='closed';}
  addEventListener('beforeunload',beforeUnload);addEventListener('bilge-account-locked',lock);document.addEventListener('visibilitychange',onHidden);
  try{store=await openStore(scope,{guard:allowed});if(!allowed())throw Object.assign(Error('closed'),{code:'CLOSED'});await refreshList();phase='empty';notify('Bir sunum seçin. Sunum ve notlar bu cihazda saklanır.');update();}
  catch(error){fail(error);phase='error';cover(errorText(error));}
  return {flush,destroy,snapshot,openSaved,requestClose:exit,prepareToLeave};
}

// This entry point is deliberately local-only. Real integration must pass the
// verified BilgeAccount scope and guard; no email or query-string identity.
if(document.querySelector('[data-pptx-local-pilot]')) {
  const container=document.querySelector('[data-pptx-local-pilot]');
  if(!['127.0.0.1','localhost','[::1]'].includes(location.hostname))container.textContent='Bu sayfa yalnız yerel geliştirme denemesidir. Canlı hesap entegrasyonu henüz açılmadı.';
  else window.pptxPilot=await mountPilot(container,{scope:'local-fixture:local-pilot',onClose:()=>{container.textContent='Yerel okuyucu kapatıldı. Kayıtlar silinmedi; sayfayı yeniden açabilirsiniz.';}});
}
