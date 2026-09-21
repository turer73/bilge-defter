// Local raster PDF export. Separate ink layer preserves the document under eraser strokes.
const pdfExportDialog=document.createElement('dialog');pdfExportDialog.id='pdfExportDialog';pdfExportDialog.className='tools-dialog';pdfExportDialog.setAttribute('aria-labelledby','pdfExportTitle');
pdfExportDialog.innerHTML='<div class="tools-heading"><h2 id="pdfExportTitle">Notlu PDF indir</h2><button class="btn" id="pdfExportClose">× Kapat / iptal</button></div><div class="tools-content"><p class="recovery-note">PDF zemini, kalem, fosforlu, metin ve görseller birlikte aktarılır. İşlem tamamen bu cihazda yapılır.</p><label>Kapsam <select id="pdfExportScope"><option value="page">Açık PDF sayfası</option><option value="notebook">Bu defterdeki PDF sayfaları</option></select></label><p id="pdfExportSummary" class="recovery-note"></p><p class="recovery-note">Görüntü tabanlı çıktı: metin aranamaz veya seçilemez. Sayfa oranı korunur; özgün baskı ölçüsü korunmaz. PDF sınırları dışındaki notlar ve normal defter sayfaları dahil edilmez. Düzenlenebilir kopya için ayrıca JSON yedeği alın.</p><button class="btn primary" id="pdfExportStart">PDF hazırla</button><p id="pdfExportStatus" role="status">Kapsamı seçin.</p><a class="btn primary" id="pdfExportDownload" hidden>PDF indir</a></div>';
document.body.append(pdfExportDialog);
const pdfExportStyle=document.createElement('style');pdfExportStyle.textContent='#pdfExportDialog{width:min(520px,calc(100% - 24px));max-height:calc(100dvh - 24px);overflow:auto;padding:0;border:1px solid #d5e2dc;border-radius:18px;background:#fffdf8;color:#17312d}#pdfExportDialog::backdrop{background:#173b3650}#pdfExportDialog select{display:block;width:100%;min-height:44px;font:inherit;margin-top:8px}#pdfExportDownload{display:block;text-align:center;text-decoration:none}#pdfExportDownload[hidden]{display:none}#pdfExportStatus{line-height:1.5;overflow-wrap:anywhere}';document.head.append(pdfExportStyle);
const pdfExportOpen=document.createElement('button');pdfExportOpen.id='pdfExportOpen';pdfExportOpen.className='btn';pdfExportOpen.textContent='Notlu PDF indir';document.querySelector('.tool-actions').append(pdfExportOpen);
let pdfExportRequest=0,pdfExportUrl=null,pdfExportBusy=false;
const PDF_EXPORT_LIMIT=64*1024*1024;
function clearPdfDownload(){if(pdfExportUrl)URL.revokeObjectURL(pdfExportUrl);pdfExportUrl=null;const a=document.querySelector('#pdfExportDownload');a.hidden=true;a.removeAttribute('href')}
function pdfExportPages(){return document.querySelector('#pdfExportScope').value==='page'?(page()?.pdf?[page()]:[]):notebookPages().filter(p=>p.pdf)}
function describePdfExport(){const pages=pdfExportPages(),ignored=notebookPages().filter(p=>!p.pdf).length;document.querySelector('#pdfExportSummary').textContent=`${pages.length} PDF sayfası seçili (en fazla 50).`+(document.querySelector('#pdfExportScope').value==='notebook'&&ignored?` ${ignored} normal sayfa dahil edilmeyecek.`:'');document.querySelector('#pdfExportStart').disabled=pdfExportBusy||!pages.length||pages.length>50}
pdfExportOpen.onclick=()=>{if(!canEdit()||drawing||pan||!page())return;closeTools();clearPdfDownload();document.querySelector('#pdfExportScope').value=page().pdf?'page':'notebook';describePdfExport();document.querySelector('#pdfExportStatus').textContent='Kapsamı seçin. Çıktı JSON yedeğinin yerine geçmez.';pdfExportDialog.showModal()};
document.querySelector('#pdfExportScope').onchange=()=>{clearPdfDownload();describePdfExport();document.querySelector('#pdfExportStatus').textContent='Yeni kapsam için PDF hazırlayın.'};
document.querySelector('#pdfExportClose').onclick=()=>pdfExportDialog.close();
pdfExportDialog.addEventListener('close',()=>{pdfExportRequest++;clearPdfDownload();document.querySelector('#toolsToggle').focus({preventScroll:true})});
async function exportImage(src){const im=new Image();let timer;try{im.src=src;await Promise.race([im.decode(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Görüntü okuma zaman aşımı.')),10000)})]);return im}catch{im.src='';throw Error('Bir PDF zemini veya görsel okunamadı. Eksik çıktı oluşturulmadı.')}finally{clearTimeout(timer)}}
// Byte offsets and stream lengths use Uint8Array lengths, never UTF-16 string positions.
function rasterPdfBuilder(){
 const chunks=[],offsets=[0],pageIds=[];let size=0,nextId=3;
 const add=value=>{const b=typeof value==='string'?new TextEncoder().encode(value):value;size+=b.byteLength;if(size>PDF_EXPORT_LIMIT)throw Error('Çıktı 64 MB sınırını aşıyor. Tek sayfa olarak deneyin.');chunks.push(b)};
 const object=(id,head,bytes)=>{offsets[id]=size;add(`${id} 0 obj\n${head}`);if(bytes){add(`\nstream\n`);add(bytes);add('\nendstream')}add('\nendobj\n')};
 add('%PDF-1.4\n');
 return {page(jpeg,width,height){const imageId=nextId++,contentId=nextId++,pageId=nextId++,w=width>height?842:595,h=Number((w*height/width).toFixed(3));
  object(imageId,`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.byteLength} >>`,jpeg);
  const content=new TextEncoder().encode(`q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q\n`);object(contentId,`<< /Length ${content.byteLength} >>`,content);
  object(pageId,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`);pageIds.push(pageId);
 },finish(){object(1,'<< /Type /Catalog /Pages 2 0 R >>');object(2,`<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map(id=>id+' 0 R').join(' ')}] >>`);const start=size;add(`xref\n0 ${nextId}\n0000000000 65535 f \n`);for(let id=1;id<nextId;id++)add(String(offsets[id]).padStart(10,'0')+' 00000 n \n');add(`trailer\n<< /Size ${nextId} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`);return new Blob(chunks,{type:'application/pdf'})}};
}
document.querySelector('#pdfExportStart').onclick=async()=>{
 if(pdfExportBusy||!pdfExportDialog.open)return;const pages=pdfExportPages();if(!pages.length||pages.length>50)return;
 // Freeze only exported values; never switch the active page or write notebook data.
 const snapshot=pages.map(p=>({pdf:{...p.pdf},strokes:p.strokes.map(s=>({...s,points:s.points.map(p=>({...p}))}))}));
 const filename=(notebookTitle(activeNotebook)+'-notlu').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,120)+'.pdf';
 const request=++pdfExportRequest,alive=()=>request===pdfExportRequest&&pdfExportDialog.open;
 pdfExportBusy=true;clearPdfDownload();describePdfExport();document.querySelector('#pdfExportScope').disabled=true;
 const status=document.querySelector('#pdfExportStatus'),sheet=document.createElement('canvas'),ink=document.createElement('canvas'),builder=rasterPdfBuilder();
 try{
  for(let i=0;i<snapshot.length;i++){
   if(!alive())return;status.textContent=`Hazırlanıyor: ${i+1}/${snapshot.length}…`;const p=snapshot[i],images=new Map();let bg;
   try{
    bg=await exportImage(p.pdf.image);if(!alive())return;
    for(const s of p.strokes.filter(s=>s.tool==='image'))if(!images.has(s.image)){images.set(s.image,await exportImage(s.image));if(!alive())return}
    sheet.width=ink.width=p.pdf.width;sheet.height=ink.height=p.pdf.height;
    const base=sheet.getContext('2d'),overlay=ink.getContext('2d');base.fillStyle='#ffffff';base.fillRect(0,0,sheet.width,sheet.height);base.drawImage(bg,0,0,sheet.width,sheet.height);
    for(let n=0;n<p.strokes.length;n++){drawStroke(p.strokes[n],overlay,images);if(n%100===99){await new Promise(r=>setTimeout(r,0));if(!alive())return}}
    base.drawImage(ink,0,0);const jpeg=await new Promise((resolve,reject)=>sheet.toBlob(b=>b?resolve(b):reject(Error('PDF görüntüsü hazırlanamadı.')),'image/jpeg',.94));
    if(!alive())return;builder.page(new Uint8Array(await jpeg.arrayBuffer()),sheet.width,sheet.height);
   }finally{if(bg)bg.src='';for(const im of images.values())im.src='';sheet.width=ink.width=1;sheet.height=ink.height=1}
   await new Promise(r=>setTimeout(r,0));
  }
  if(!alive())return;const blob=builder.finish();pdfExportUrl=URL.createObjectURL(blob);const a=document.querySelector('#pdfExportDownload');a.href=pdfExportUrl;a.download=filename;a.hidden=false;status.textContent=`${snapshot.length} sayfa hazır · ${(blob.size/1048576).toFixed(1)} MB. Kaydetmek için PDF indir düğmesine basın.`;
 }catch(error){if(alive())status.textContent=`PDF hazırlanamadı. ${error.message} Notlar değişmedi.`}
 finally{pdfExportBusy=false;document.querySelector('#pdfExportScope').disabled=false;if(pdfExportDialog.open)describePdfExport()}
};
// PDF.js 6.3.289 is served locally. Documents never leave the browser.
const pdfDialog=document.createElement('dialog');pdfDialog.id='pdfDialog';pdfDialog.setAttribute('aria-labelledby','pdfTitle');
pdfDialog.innerHTML='<div class="tools-heading"><h2 id="pdfTitle">PDF üzerine çalış</h2><button class="btn" id="pdfClose">× Kapat</button></div><div class="tools-content"><p class="recovery-note">PDF cihazda işlenir, sunucuya gönderilmez. İlk sürüm: en fazla 20 MB / 50 sayfa. Sayfalar 1000 piksel genişlikte görüntü olarak saklanır; özgün PDF dosyanızı ayrıca koruyun.</p><p class="recovery-note">Metin seçimi, bağlantılar ve form doldurma yoktur. Notlu PDF çıktısı için Araçlar → Notlu PDF indir kullanın. PDF zemini silinmez; kalem, fosforlu ve silgi yalnız eklediğiniz notlara uygulanır.</p><button class="btn" id="pdfChoose">Cihazdan PDF seç</button><input id="pdfFile" type="file" accept="application/pdf,.pdf" hidden><p id="pdfProgress" role="status">Bir PDF seçin. Hazır olunca yeni deftere ekleyin.</p><button class="btn primary" id="pdfApply" disabled>Yeni deftere ekle</button><p class="recovery-note">PDF görüntüleri ve yazılar JSON yedeğine dahildir. İçe aktarma mevcut sayfaların yerine geçmez.</p></div>';
document.body.append(pdfDialog);
const pdfStyle=document.createElement('style');pdfStyle.textContent='#pdfDialog{width:min(500px,calc(100% - 24px));max-height:calc(100dvh - 24px);padding:0;border:1px solid #d5e2dc;border-radius:18px;background:#fffdf8;color:#17312d}#pdfDialog::backdrop{background:#173b3650}#pdfDialog .btn{min-height:44px}#pdfProgress{margin:0;line-height:1.5;overflow-wrap:anywhere}#pdfCanvas{position:absolute;inset:0;pointer-events:none}#pdfCanvas[hidden],#pdfNavigation[hidden],#pdfBackdropState[hidden]{display:none}#canvas{position:relative}#pdfBackdropState{position:absolute;inset:0;display:grid;place-content:center;text-align:center;padding:20px;background:#fffdf8;pointer-events:none}.workspace.has-pdf{grid-template-rows:auto minmax(0,1fr)}#pdfNavigation{display:flex;align-items:center;gap:8px;padding:5px 12px;min-width:0}#pdfNavigation .btn{min-width:44px;min-height:44px;flex:none}#pdfPageLabel{flex:1;min-width:0;font-size:12px;overflow-wrap:anywhere}#pdfOpen{grid-column:1/-1}';document.head.append(pdfStyle);
const pdfOpen=document.createElement('button');pdfOpen.id='pdfOpen';pdfOpen.className='btn';pdfOpen.textContent='PDF üzerine çalış';document.querySelector('.tool-actions').prepend(pdfOpen);
const pdfCanvas=document.createElement('canvas');pdfCanvas.id='pdfCanvas';pdfCanvas.hidden=true;pdfCanvas.setAttribute('aria-hidden','true');document.querySelector('.paper').prepend(pdfCanvas);
const pdfBackdropState=document.createElement('div');pdfBackdropState.id='pdfBackdropState';pdfBackdropState.hidden=true;pdfBackdropState.setAttribute('role','status');document.querySelector('.paper').append(pdfBackdropState);
const pdfNavigation=document.createElement('div');pdfNavigation.id='pdfNavigation';pdfNavigation.hidden=true;pdfNavigation.innerHTML='<button class="btn" id="pdfPrevious" aria-label="Önceki sayfa">←</button><span id="pdfPageLabel"></span><button class="btn" id="pdfNext" aria-label="Sonraki sayfa">→</button>';document.querySelector('.workspace').prepend(pdfNavigation);
const pdfZoomControls=document.createElement('div');pdfZoomControls.id='pdfZoomControls';pdfZoomControls.innerHTML='<button class="btn" id="pdfZoomOut" aria-label="PDF küçült">−</button><output id="pdfZoomValue" aria-live="polite">%100</output><button class="btn" id="pdfZoomIn" aria-label="PDF büyüt">+</button><button class="btn" id="pdfFit">Genişliğe sığdır</button>';pdfNavigation.append(pdfZoomControls);
pdfStyle.textContent+='#pdfNavigation{flex-wrap:wrap}#pdfZoomControls{display:flex;align-items:center;gap:6px}#pdfZoomControls .btn{min-width:44px}#pdfZoomValue{min-width:48px;text-align:center;font-size:13px}@media(max-width:650px){#pdfZoomControls{flex-basis:100%;justify-content:center}#pdfFit{font-size:13px}}';
let pdfBusy=false,pdfPending=null,pdfRequest=0,pdfTask=null,pdfLibrary=null,pdfImage=null,pdfImageSource=null,pdfImageFailed=false;
const PDF_FILE_LIMIT=20*1024*1024,PDF_IMAGE_LIMIT=24*1024*1024;
function validPdfBackground(b){
  if(!b||b.width!==1000||!Number.isSafeInteger(b.height)||b.height<100||b.height>3000||typeof b.name!=='string'||b.name.length>200||!Number.isSafeInteger(b.number)||!Number.isSafeInteger(b.total)||b.number<1||b.number>b.total||b.total>50||typeof b.image!=='string'||b.image.length>6*1024*1024||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(b.image))return false;
  try{const h=atob(b.image.slice(22,66));if(!h.startsWith('\x89PNG\r\n\x1a\n')||h.slice(12,16)!=='IHDR')return false;const n=i=>((h.charCodeAt(i)*16777216)+(h.charCodeAt(i+1)<<16)+(h.charCodeAt(i+2)<<8)+h.charCodeAt(i+3));return n(16)===b.width&&n(20)===b.height}catch{return false}
}
async function validatePdfImages(book){
  const images=new Set([...book.pages,...(book.trash||[]).map(t=>t.page)].filter(p=>p.pdf).map(p=>p.pdf.image));
  for(const src of images){const image=new Image();let timer;try{image.src=src;await Promise.race([image.decode(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error()),10000)})])}catch{throw new Error('Yedekteki PDF görüntüsü okunamadı. Mevcut notlar değiştirilmedi.')}finally{clearTimeout(timer);image.src=''}}
}
function validPdfView(p){return (p.pdfZoom===undefined||(!!p.pdf&&Number.isFinite(p.pdfZoom)&&p.pdfZoom>=1&&p.pdfZoom<=3))&&(p.viewX===undefined||(!!p.pdf&&Number.isFinite(p.viewX)&&p.viewX>=0&&p.viewX<=1000*(1-1/(p.pdfZoom??1))+1e-7))}
function pdfZoom(){return page()?.pdf?(page().pdfZoom??1):1}
function maxViewX(){return page()?.pdf?page().pdf.width*(1-1/pdfZoom()):0}
function viewX(){return Math.min(maxViewX(),Math.max(0,page()?.viewX||0))}
function paperScale(){return page()?.pdf?Math.max(1,canvas.getBoundingClientRect().width)/page().pdf.width*pdfZoom():1}
function updatePdfZoom(){const zoom=pdfZoom();document.querySelector('#pdfZoomValue').textContent=`%${Math.round(zoom*100)}`;document.querySelector('#pdfZoomOut').disabled=zoom<=1;document.querySelector('#pdfZoomIn').disabled=zoom>=3}
function setPdfZoom(value){
  if(!canEdit()||drawing||pan||!page()?.pdf||!Number.isFinite(value))return;
  const next=Math.max(1,Math.min(3,Math.round(value*4)/4));if(next===pdfZoom())return;
  const r=canvas.getBoundingClientRect(),oldScale=paperScale(),cx=viewX()+r.width/(2*oldScale),cy=viewY()+r.height/(2*oldScale);
  page().pdfZoom=next;const scale=paperScale();page().viewX=Math.max(0,Math.min(maxViewX(),cx-r.width/(2*scale)));page().viewY=Math.max(0,cy-r.height/(2*scale));
  updatePdfZoom();drawAll();scheduleSave();document.querySelector('#inputState').textContent=`PDF %${Math.round(next*100)} · iki parmakla her yöne kaydırın`;
}
document.querySelector('#pdfZoomOut').onclick=()=>setPdfZoom(pdfZoom()-.25);document.querySelector('#pdfZoomIn').onclick=()=>setPdfZoom(pdfZoom()+.25);document.querySelector('#pdfFit').onclick=()=>setPdfZoom(1);
function pdfBackgroundReady(){return !page()?.pdf||(pdfImageSource===page().pdf.image&&pdfImage?.complete&&pdfImage.naturalWidth>0&&!pdfImageFailed)}
function drawPdfBackground(){
  const bg=page()?.pdf;pdfCanvas.hidden=!bg;pdfBackdropState.hidden=!bg;if(!bg){pdfImage=null;pdfImageSource=null;pdfImageFailed=false;return}
  if(pdfImageSource!==bg.image){
    pdfImageSource=bg.image;pdfImageFailed=false;const image=new Image();pdfImage=image;
    image.onload=()=>{if(pdfImage===image)drawAll()};image.onerror=()=>{if(pdfImage===image){pdfImageFailed=true;pdfBackdropState.hidden=false;pdfBackdropState.textContent='PDF görüntüsü açılamadı. Bu sayfada yazı durduruldu; yedeğinizi koruyun.'}};image.src=bg.image;
  }
  if(!pdfBackgroundReady()){pdfBackdropState.hidden=false;pdfBackdropState.textContent=pdfImageFailed?'PDF görüntüsü açılamadı. Yedeğinizi koruyun.':'PDF sayfası açılıyor…';return}
  pdfBackdropState.hidden=true;
  if(pdfCanvas.width!==canvas.width||pdfCanvas.height!==canvas.height){pdfCanvas.width=canvas.width;pdfCanvas.height=canvas.height}
  const c=pdfCanvas.getContext('2d'),scale=paperScale(),d=canvas.width/Math.max(1,canvas.getBoundingClientRect().width);c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,pdfCanvas.width,pdfCanvas.height);c.setTransform(d*scale,0,0,d*scale,-viewX()*d*scale,-viewY()*d*scale);c.drawImage(pdfImage,0,0,bg.width,bg.height);
}
function updatePdfNavigation(){
  updatePdfZoom();
  const bg=page()?.pdf;pdfNavigation.hidden=!bg;document.querySelector('.workspace').classList.toggle('has-pdf',!!bg);if(!bg)return;
  const pages=notebookPages(),index=pages.findIndex(p=>p.id===activeId);document.querySelector('#pdfPageLabel').textContent=`${bg.name} · PDF ${bg.number}/${bg.total}`;
  document.querySelector('#pdfPrevious').disabled=index<=0||!pages[index-1]?.pdf;document.querySelector('#pdfNext').disabled=index>=pages.length-1||!pages[index+1]?.pdf;
}
function navigatePdf(delta){if(!canEdit()||drawing||pan)return;const pages=notebookPages(),index=pages.findIndex(p=>p.id===activeId),target=pages[index+delta];if(!target?.pdf)return;activeId=target.id;renderPages();drawAll();scheduleSave()}
document.querySelector('#pdfPrevious').onclick=()=>navigatePdf(-1);document.querySelector('#pdfNext').onclick=()=>navigatePdf(1);
function pdfMessage(text){document.querySelector('#pdfProgress').textContent=text}
function cancelPdf(){pdfRequest++;pdfPending=null;pdfBusy=false;const task=pdfTask;pdfTask=null;if(task)void task.destroy().catch(()=>{});document.querySelector('#pdfChoose').disabled=false;document.querySelector('#pdfApply').disabled=true}
pdfDialog.addEventListener('close',()=>{cancelPdf();document.querySelector('#toolsToggle').focus({preventScroll:true})});
document.querySelector('#pdfClose').onclick=()=>{if(document.querySelector('#pdfClose').disabled)return;pdfDialog.close()};
pdfDialog.addEventListener('cancel',e=>{if(document.querySelector('#pdfClose').disabled)e.preventDefault()});
pdfOpen.onclick=()=>{if(!canEdit()||drawing||pan)return;closeTools();cancelPdf();pdfMessage('Bir PDF seçin. Hazır olunca yeni deftere ekleyin.');pdfDialog.showModal()};
document.querySelector('#pdfChoose').onclick=()=>document.querySelector('#pdfFile').click();
document.querySelector('#pdfFile').onchange=async e=>{
  const file=e.target.files[0];e.target.value='';if(!file||!ready||saveConflict||pdfBusy||!pdfDialog.open)return;
  cancelPdf();const request=pdfRequest;pdfBusy=true;document.querySelector('#pdfChoose').disabled=true;let task,timeout;
  try{
    if(file.size>PDF_FILE_LIMIT)throw new Error('Bu ilk sürüm en fazla 20 MB PDF kabul eder. Daha küçük bir dosya seçin.');
    if(!await flushSave())throw new Error('Mevcut notlar kaydedilemedi. Önce pencereyi kapatıp kaydı düzeltin.');
    pdfMessage('PDF cihazda açılıyor…');
    pdfLibrary??=await import('./vendor/pdfjs/pdf.min.js');if(request!==pdfRequest)return;
    pdfLibrary.GlobalWorkerOptions.workerSrc='./vendor/pdfjs/pdf.worker.min.js';
    const data=new Uint8Array(await file.arrayBuffer());if(request!==pdfRequest)return;
    task=pdfLibrary.getDocument({data,isEvalSupported:false,enableXfa:false,stopAtErrors:true,cMapUrl:'./vendor/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'./vendor/pdfjs/standard_fonts/',wasmUrl:'./vendor/pdfjs/wasm/'});pdfTask=task;
    timeout=setTimeout(()=>{if(request===pdfRequest){cancelPdf();pdfMessage('PDF hazırlığı zaman aşımına uğradı. Daha küçük bir dosya deneyin.')}},60000);
    const doc=await task.promise;if(request!==pdfRequest)return;
    if(doc.numPages>50)throw new Error('Bu ilk sürüm en fazla 50 sayfa PDF kabul eder. Dosyayı bölerek deneyin.');
    const pages=[];let bytes=0;
    for(let number=1;number<=doc.numPages;number++){
      if(request!==pdfRequest)return;pdfMessage(`PDF sayfası hazırlanıyor: ${number}/${doc.numPages}`);
      const source=await doc.getPage(number),base=source.getViewport({scale:1}),viewport=source.getViewport({scale:1000/base.width});
      if(!Number.isFinite(viewport.height)||viewport.height<100||viewport.height>3000)throw new Error('PDF sayfa oranı bu ilk sürümde desteklenmiyor.');
      const surface=document.createElement('canvas');surface.width=1000;surface.height=Math.ceil(viewport.height);
      await source.render({canvasContext:surface.getContext('2d'),viewport,background:'#ffffff'}).promise;
      const image=surface.toDataURL('image/png');surface.width=surface.height=1;source.cleanup();bytes+=image.length;
      if(image.length>6*1024*1024||bytes>PDF_IMAGE_LIMIT)throw new Error('PDF görüntüleri tablet test sınırını aşıyor. Daha az sayfalı dosya deneyin.');
      pages.push({id:newPageId(),title:`PDF · Sayfa ${number}`,strokes:[],viewY:0,pdf:{image,width:1000,height:Math.ceil(viewport.height),name:file.name.slice(0,200),number,total:doc.numPages},updated:new Date().toISOString()});
    }
    if(request!==pdfRequest)return;pdfPending={title:file.name.replace(/\.pdf$/i,'').trim().slice(0,65)||'PDF',pages};pdfMessage(`${file.name} · ${pages.length} sayfa hazır. Yeni deftere ekleyin. Özgün PDF dosyanızı ayrıca koruyun.`);document.querySelector('#pdfApply').disabled=false;
  }catch(error){if(request===pdfRequest){pdfPending=null;pdfMessage(error?.name==='PasswordException'?'Şifreli PDF bu ilk sürümde desteklenmiyor. Şifresiz bir kopya seçin.':`PDF eklenmedi. ${error?.message||'Dosya okunamadı.'}`)}}
  finally{clearTimeout(timeout);if(task)await task.destroy().catch(()=>{});if(request===pdfRequest){pdfTask=null;pdfBusy=false;document.querySelector('#pdfChoose').disabled=false}}
};
document.querySelector('#pdfApply').onclick=async()=>{
  if(!pdfPending||pdfBusy||!ready||saveConflict)return;
  pdfBusy=true;document.querySelector('#pdfApply').disabled=true;document.querySelector('#pdfChoose').disabled=true;document.querySelector('#pdfClose').disabled=true;pdfMessage('PDF ve mevcut notlar birlikte kaydediliyor…');
  try{
    if(!await flushSave())throw new Error('Mevcut notlar kaydedilemedi; önce kayıt sorununu düzeltin.');
    const id=newPageId(),titles=new Set(notebooks().map(n=>n.title.toLocaleLowerCase('tr-TR')));let title=pdfPending.title,n=2;while(titles.has(title.toLocaleLowerCase('tr-TR')))title=`${pdfPending.title} (${n++})`;
    const added=pdfPending.pages.map(p=>({...p,notebookId:id})),next={...state,version:Math.max(2,state.version),notebooks:[...(state.notebooks||[]),{id,title}],pages:[...state.pages,...added],active:added[0].id,activeNotebook:id};
    if(!validState(next))throw new Error('PDF kayıt yapısı doğrulanamadı.');
    await dbPut(next,{preservePrevious:true});state=next;activeId=next.active;activeNotebook=id;editRevision++;savedRevision=editRevision;saveFailed=false;failureMessage='';pdfPending=null;pdfDialog.close();renderPages();resize();renderSaveStatus();await refreshRecovery();document.querySelector('#inputState').textContent='PDF eklendi · kalemle yazın, iki parmakla kaydırın';
  }catch(error){pdfMessage(`PDF eklenmedi; mevcut notlar korundu. ${error?.name==='NotebookConflict'?'Başka sekmede değişiklik var. Pencereyi kapatıp kayıtlı defteri yeniden açın.':error?.message||'Kaydı tekrar deneyin.'}`);if(error?.name==='NotebookConflict'){saveError(error);pdfDialog.close()}}
  finally{pdfBusy=false;document.querySelector('#pdfClose').disabled=false;document.querySelector('#pdfChoose').disabled=false;document.querySelector('#pdfApply').disabled=!pdfPending}
};
