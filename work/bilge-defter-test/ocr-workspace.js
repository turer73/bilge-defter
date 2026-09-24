// Local preview first. Only an explicit second action sends the preview to the
// existing private OCR endpoint. No provider keys or new cloud integration here.
(() => {
  const dialog=document.createElement('dialog');dialog.id='ocrDialog';dialog.className='tools-dialog';dialog.setAttribute('aria-labelledby','ocrTitle');
  dialog.innerHTML='<div class="tools-heading"><h2 id="ocrTitle">Yazıyı tanı</h2><button class="btn" id="ocrClose">× Kapat</button></div><div class="tools-content"><p class="recovery-note">Önizleme yalnız bu cihazda hazırlanır. “Tanımayı başlat” düğmesi aşağıdaki el yazısı görüntüsünü mevcut Bilge Defter sunucusuna gönderir. Resimler, PDF ve klavye metni dahil edilmez. Sonucun doğruluğu garanti değildir; eklemeden önce düzeltin. Asıl çizimler korunur.</p><img id="ocrPreview" alt="Tanıma için hazırlanmış el yazısı önizlemesi" hidden><p id="ocrStatus" role="status" class="recovery-note"></p><textarea id="ocrResult" rows="5" maxlength="10000" placeholder="Tanınan metni kontrol edip düzeltin…"></textarea><div class="tool-actions"><button class="btn primary" id="ocrRetry">Tanımayı başlat</button><button class="btn" id="ocrInsert" disabled>Metin olarak ekle</button></div></div>';
  document.body.append(dialog);
  const scopeLabel=document.createElement('label');scopeLabel.textContent='Tanınacak yazı bölümü';
  const scope=document.createElement('select');scope.id='ocrScope';scopeLabel.append(scope);
  dialog.querySelector('#ocrPreview').before(scopeLabel);
  const warning=document.createElement('p');warning.className='recovery-note';warning.textContent='Deneysel tanıma: El yazısında yanlış veya eksik sonuç çıkabilir. Bölümler yukarıdan aşağıya sıralanır. Açık renkli kalem yazısı yalnız önizlemede koyulaştırılır; fosforlu işaretler dahil edilmez. Asıl not değişmez.';
  scopeLabel.before(warning);
  const style=document.createElement('style');style.textContent='#ocrDialog{width:min(520px,calc(100% - 24px));max-height:calc(100dvh - 24px);padding:0;border:1px solid #d5e2dc;border-radius:18px;background:#fffdf8;color:#17312d;overflow:auto}#ocrDialog::backdrop{background:#173b3650}#ocrResult{box-sizing:border-box;width:100%;padding:12px;border:1px solid #b6ccc4;border-radius:8px;font-size:16px;background:white;color:#17312d;min-height:100px;resize:vertical}#ocrPreview{display:block;width:100%;max-height:240px;object-fit:contain;background:white;border:1px solid #b6ccc4}#ocrPreview[hidden]{display:none}';document.head.append(style);
  const open=document.createElement('button');open.id='ocrOpen';open.className='btn';open.textContent='Yazıyı tanı';document.querySelector('.tool-actions').prepend(open);
  const status=dialog.querySelector('#ocrStatus'),preview=dialog.querySelector('#ocrPreview'),result=dialog.querySelector('#ocrResult'),run=dialog.querySelector('#ocrRetry'),insert=dialog.querySelector('#ocrInsert');
  const invited=()=>location.hostname==='defter.bilgearena.com'||window.__syncInvited===true;
  let prepared=null,controller=null,generation=0,regions=[];
  const scopeStyle=document.createElement('style');scopeStyle.textContent='#ocrScope{display:block;box-sizing:border-box;width:100%;max-width:100%;min-height:44px;font:inherit;border:1px solid #b6ccc4;border-radius:8px;padding:8px;background:white;color:#17312d}#ocrDialog label{display:grid;gap:6px}';document.head.append(scopeStyle);
  function bounds(stroke){
    let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
    for(const point of stroke.points){const margin=stroke.width+8;left=Math.min(left,point.x-margin);top=Math.min(top,point.y-margin);right=Math.max(right,point.x+margin);bottom=Math.max(bottom,point.y+margin)}
    return {left,top,right,bottom};
  }
  function inkRegions(target){
    const boxes=target.strokes.filter(s=>s.tool==='pen'&&s.points.length).map(bounds).sort((a,b)=>a.top-b.top),groups=[];
    for(const box of boxes){const last=groups.at(-1);if(last&&box.top<=last.bottom+28){last.left=Math.min(last.left,box.left);last.right=Math.max(last.right,box.right);last.bottom=Math.max(last.bottom,box.bottom)}else groups.push({...box})}
    return groups;
  }
  function renderInk(target,region){
    // Exclude highlighter bands, but replay all erasers in the original order.
    const strokes=target.strokes.filter(s=>s.tool==='pen'||s.tool==='eraser'),ink=strokes.filter(s=>s.tool==='pen');
    if(!ink.length)return null;
    let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
    for(const stroke of ink)for(const p of stroke.points){const margin=stroke.width+8;left=Math.min(left,p.x-margin);top=Math.min(top,p.y-margin);right=Math.max(right,p.x+margin);bottom=Math.max(bottom,p.y+margin)}
    if(region)({left,top,right,bottom}=region);
    const width=right-left,height=bottom-top,scale=Math.min(2,2000/width,2000/height);
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.ceil(width*scale));canvas.height=Math.max(1,Math.ceil(height*scale));
    const context=canvas.getContext('2d');context.scale(scale,scale);context.translate(-left,-top);
    // Same painter as the notebook: order, pressure, markers and erasers match.
    for(const stroke of strokes)drawStroke(stroke,context);
    context.setTransform(1,0,0,1,0,0);
    const image=context.getImageData(0,0,canvas.width,canvas.height),pixels=image.data;
    let visible=false;
    for(let i=0;i<pixels.length;i+=4){
      // Contrast belongs to this disposable OCR copy, never to stored strokes.
      pixels[i]=pixels[i+1]=pixels[i+2]=0;
      if(pixels[i+3]){visible=true;pixels[i+3]=Math.min(255,pixels[i+3]*3)}
    }
    if(!visible)return null;
    context.putImageData(image,0,0);
    context.globalCompositeOperation='destination-over';context.globalAlpha=1;context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);
    return {png:canvas.toDataURL('image/png'),reduced:scale<1,width:canvas.width,height:canvas.height};
  }
  function current(){return prepared&&prepared.pageId===activeId&&prepared.revision===editRevision&&JSON.stringify(page()?.strokes)===prepared.strokes}
  function cancel(){generation++;controller?.abort();controller=null;prepared=null;preview.removeAttribute('src');preview.hidden=true;insert.disabled=true;run.disabled=true}
  function prepare(){
    cancel();result.value='';
    const rendered=renderInk(page(),regions[Number(scope.value)]);
    if(rendered){prepared={...rendered,pageId:activeId,revision:editRevision,strokes:JSON.stringify(page().strokes)};preview.src=rendered.png;preview.hidden=false;status.textContent='Önizleme hazır; henüz gönderilmedi.'+(rendered.reduced?' Bu bölüm küçültüldü; tanıma kalitesi düşebilir.':'');run.disabled=!invited()}
    else status.textContent='Görünür kalem çizimi yok. Silinen çizimler tanımaya gönderilmez.';
    if(!invited())status.textContent+=' Sunucu tanıması yalnız davetli adreste kullanılabilir.';
  }
  scope.onchange=()=>{if(!page())return;prepare()};
  open.onclick=()=>{
    if(!canEdit()||drawing||pan||!page())return;
    cancel();closeTools();setSidebarOpen(false);result.value='';
    regions=inkRegions(page());scope.replaceChildren();
    regions.forEach((_,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent=`Yazı bölümü ${i+1} / ${regions.length}`;scope.append(option)});
    const all=document.createElement('option');all.value='all';all.textContent='Tüm el yazısı (uzun sayfalarda küçülebilir)';scope.append(all);
    scope.value=regions.length?'0':'all';prepare();
    dialog.showModal();dialog.scrollTop=0;
  };
  run.onclick=async()=>{
    if(controller||!invited()||!current()){status.textContent='Sayfa değişti. Pencereyi kapatıp yeni önizleme hazırlayın.';return}
    const token=++generation,request=new AbortController();controller=request;
    const timer=setTimeout(()=>request.abort(),30000);run.disabled=true;insert.disabled=true;result.value='';status.textContent='Tanınıyor…';
    try{
        const response=await (window.BilgeAccount?.fetch||fetch)('./api/v1/bilge-defter/ocr',{method:'POST',signal:request.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({image:prepared.png.split(',')[1]})});
      if(!response.ok){const explanation={429:'Sunucu şu anda meşgul. Biraz sonra tekrar deneyin.',413:'Görüntü çok büyük. Daha küçük bir yazı bölümü seçin.',422:'Bu bölüm tanınamadı. Daha küçük bir bölüm seçip tekrar deneyin.',503:'Tanıma hizmeti şu anda kullanılamıyor.'};throw Error(explanation[response.status]||'Sunucuya erişim veya giriş denetlenemedi.')}
      if(response.redirected||(response.headers.get('content-type')||'').includes('text/html'))throw Error('Sunucuya erişim veya giriş denetlenemedi.');
      const body=await response.json();if(typeof body.text!=='string'||body.text.length>10000)throw Error('Tanıma yanıtı geçersiz.');
      if(token!==generation||!dialog.open)return;
      if(!current()){status.textContent='Sayfa değişti; eski sonuç kullanılmadı. Yeni önizleme hazırlayın.';return}
      result.value=body.text;insert.disabled=!body.text.trim();status.textContent=body.text?'Sonucu kontrol edip düzeltin; özgün çizimler korunacak.':'Metin bulunamadı. Çizimler korundu.';
    }catch(error){if(token===generation&&dialog.open)status.textContent=error.name==='AbortError'?'İstek iptal edildi veya süre doldu. Çizimler korundu.':`Tanıma başarısız. ${error.message}`}
    finally{clearTimeout(timer);if(token===generation){controller=null;run.disabled=!current()}}
  };
  result.addEventListener('input',()=>{insert.disabled=!current()||!result.value.trim()||!!controller});
  document.querySelector('#ocrClose').onclick=()=>dialog.close();dialog.addEventListener('close',cancel);
  insert.onclick=()=>{
    const text=result.value.trim();if(!text||!invited()||!current()||!mediaAvailable())return;
    dialog.close();
    beginPendingMedia({tool:'text',text,fontSize:24,color:document.querySelector('#color').value,width:Math.max(80,Math.min(440,(canvas.getBoundingClientRect().width-60)/paperScale())),points:[{x:viewX()+24/paperScale(),y:viewY()+48/paperScale()}]});
  };
})();
