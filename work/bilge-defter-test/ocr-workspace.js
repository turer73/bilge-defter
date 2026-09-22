// Ink recognition: renders the page ink to a PNG and asks the server's local
// OCR (explicit user action only). The image is not stored server-side; the
// encrypted notebook itself is never sent through this endpoint.
(() => {
  const ocrDialog=document.createElement('dialog');ocrDialog.id='ocrDialog';ocrDialog.className='tools-dialog';ocrDialog.setAttribute('aria-labelledby','ocrTitle');
  ocrDialog.innerHTML='<div class="tools-heading"><h2 id="ocrTitle">Yazıyı tanı</h2><button class="btn" id="ocrClose">× Kapat</button></div><div class="tools-content"><p class="recovery-note">Bu sayfadaki kalem ve fosforlu çizimler görüntüye çevrilir ve tanıma için sunucuya gönderilir; görüntü sunucuda saklanmaz. Notların kendisi gönderilmez. Tanıma düzgün el yazısında daha başarılıdır; sonucu kontrol edin.</p><p id="ocrStatus" role="status" class="recovery-note"></p><textarea id="ocrResult" rows="5" maxlength="10000" placeholder="Tanınan metin burada görünür…"></textarea><div class="tool-actions"><button class="btn primary" id="ocrInsert">Metin olarak ekle</button><button class="btn" id="ocrRetry">Yeniden dene</button></div></div>';
  document.body.append(ocrDialog);
  const ocrStyle=document.createElement('style');ocrStyle.textContent='#ocrDialog{width:min(480px,calc(100% - 24px));max-height:calc(100dvh - 24px);padding:0;border:1px solid #d5e2dc;border-radius:18px;background:#fffdf8;color:#17312d;overflow:auto}#ocrDialog::backdrop{background:#173b3650}#ocrResult{box-sizing:border-box;width:100%;padding:12px;border:1px solid #b6ccc4;border-radius:8px;font-size:16px;background:white;color:#17312d;min-height:100px;resize:vertical}';document.head.append(ocrStyle);
  const ocrOpen=document.createElement('button');ocrOpen.id='ocrOpen';ocrOpen.className='btn';ocrOpen.textContent='Yazıyı tanı';document.querySelector('.tool-actions').prepend(ocrOpen);
  function invited(){return location.hostname==='defter.bilgearena.com'||window.__syncInvited===true}
  function renderInkPng(){
    const target=page();if(!target)return null;
    const ink=target.strokes.filter(s=>!isMedia(s)&&s.tool!=='eraser');
    if(!ink.length)return null;
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for(const s of ink)for(const pt of s.points){minX=Math.min(minX,pt.x);minY=Math.min(minY,pt.y);maxX=Math.max(maxX,pt.x);maxY=Math.max(maxY,pt.y)}
    const pad=16,scale=2,w=Math.ceil((maxX-minX)*scale+pad*2),h=Math.ceil((maxY-minY)*scale+pad*2);
    const surface=document.createElement('canvas');surface.width=Math.min(2000,w);surface.height=Math.min(2000,h);
    const x=surface.getContext('2d');x.fillStyle='#ffffff';x.fillRect(0,0,surface.width,surface.height);
    x.scale(scale,scale);x.translate(-minX+pad,-minY+pad);
    for(const s of ink){const c=surface.getContext('2d');if(s.points.length===1){c.beginPath();c.arc(s.points[0].x,s.points[0].y,s.width/2,0,Math.PI*2);c.fillStyle=s.color;c.fill()}else{c.strokeStyle=s.color;c.lineWidth=Math.max(2,s.width);c.lineCap='round';c.lineJoin='round';c.globalAlpha=s.tool==='marker'?.6:1;c.beginPath();c.moveTo(s.points[0].x,s.points[0].y);for(let i=1;i<s.points.length;i++)c.lineTo(s.points[i].x,s.points[i].y);c.stroke()}}
    return surface.toDataURL('image/png');
  }
  async function runOcr(){
    const status=document.querySelector('#ocrStatus');document.querySelector('#ocrResult').value='';
    const png=renderInkPng();
    if(!png){status.textContent='Bu sayfada tanınacak kalem çizimi yok. Önce yazın, sonra tanıyın.';return}
    status.textContent='Tanınıyor…';
    try{
      const res=await fetch('./api/v1/bilge-defter/ocr',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:png.split(',')[1]})});
      if(!res.ok){let detail='';try{detail=(await res.json()).detail||''}catch{}throw Error(detail||`Sunucu yanıtı ${res.status}`)}
      const text=(await res.json()).text||'';
      document.querySelector('#ocrResult').value=text;
      status.textContent=text?`Tanındı · ${text.length} karakter. Eklemek için kontrol edin.`:'Tanınan metin bulunamadı; daha düzgün yazıyla yeniden deneyin.';
    }catch(error){status.textContent=`Tanıma başarısız. ${error.message} Çizimler değişmedi.`}
  }
  ocrOpen.onclick=()=>{if(!canEdit()||drawing||pan||!page())return;closeTools();setSidebarOpen(false);document.querySelector('#ocrStatus').textContent='';document.querySelector('#ocrResult').value='';ocrDialog.showModal();ocrDialog.scrollTop=0;if(!invited()){document.querySelector('#ocrStatus').textContent='Tanıma yalnız defter.bilgearena.com adresinde kullanılabilir.';document.querySelector('#ocrInsert').disabled=true;document.querySelector('#ocrRetry').disabled=true;return}document.querySelector('#ocrInsert').disabled=false;document.querySelector('#ocrRetry').disabled=false;void runOcr()};
  document.querySelector('#ocrClose').onclick=()=>ocrDialog.close();
  document.querySelector('#ocrRetry').onclick=()=>void runOcr();
  document.querySelector('#ocrInsert').onclick=()=>{
    const text=document.querySelector('#ocrResult').value.trim();
    if(!text||!invited()||!mediaAvailable())return;
    ocrDialog.close();
    beginPendingMedia({tool:'text',text,fontSize:24,color:document.querySelector('#color').value,width:Math.max(80,Math.min(440,(canvas.getBoundingClientRect().width-60)/paperScale())),points:[{x:viewX()+24/paperScale(),y:viewY()+48/paperScale()}]});
  };
})();
