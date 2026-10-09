// v74 must be installed as a read-compatible rollback target before this v75 writer.
const PDF_PAGE_LIMIT=100;
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
function describePdfExport(){const pages=pdfExportPages(),ignored=notebookPages().filter(p=>!p.pdf).length;document.querySelector('#pdfExportSummary').textContent=`${pages.length} PDF sayfası seçili (en fazla ${PDF_PAGE_LIMIT}).`+(document.querySelector('#pdfExportScope').value==='notebook'&&ignored?` ${ignored} normal sayfa dahil edilmeyecek.`:'');document.querySelector('#pdfExportStart').disabled=pdfExportBusy||!pages.length||pages.length>PDF_PAGE_LIMIT}
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
 if(pdfExportBusy||!pdfExportDialog.open)return;const pages=pdfExportPages();if(!pages.length||pages.length>PDF_PAGE_LIMIT)return;
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
// PDF.js renders locally. Device PDFs never leave the browser; PowerPoint conversion
// below requires separate explicit consent before uploading the selected deck.
const pdfDialog=document.createElement('dialog');pdfDialog.id='pdfDialog';pdfDialog.setAttribute('aria-labelledby','pdfTitle');
pdfDialog.innerHTML='<div class="tools-heading"><h2 id="pdfTitle">PDF üzerine çalış</h2><button class="btn" id="pdfClose">× Kapat</button></div><div class="tools-content"><p class="recovery-note">PDF cihazda işlenir, sunucuya gönderilmez. En fazla 20 MB / '+PDF_PAGE_LIMIT+' sayfa. Görsel yoğunluğuna göre cihazın güvenli görüntü bütçesi daha erken dolabilir. Sayfalar 1000 piksel genişlikte görüntü olarak saklanır; özgün PDF dosyanızı ayrıca koruyun.</p><p class="recovery-note">Metin seçimi, bağlantılar ve form doldurma yoktur. Notlu PDF çıktısı için Araçlar → Notlu PDF indir kullanın. PDF zemini silinmez; kalem, fosforlu ve silgi yalnız eklediğiniz notlara uygulanır.</p><button class="btn" id="pdfChoose">Cihazdan PDF seç</button><input id="pdfFile" type="file" accept="application/pdf,.pdf" hidden><p id="pdfProgress" role="status">Bir PDF seçin. Hazır olunca yeni deftere ekleyin.</p><button class="btn primary" id="pdfApply" disabled>Yeni deftere ekle</button><p class="recovery-note">PDF görüntüleri ve yazılar JSON yedeğine dahildir. İçe aktarma mevcut sayfaların yerine geçmez.</p></div>';
document.body.append(pdfDialog);
const pdfStyle=document.createElement('style');pdfStyle.textContent='#pdfDialog{width:min(500px,calc(100% - 24px));max-height:calc(100dvh - 24px);padding:0;border:1px solid #d5e2dc;border-radius:18px;background:#fffdf8;color:#17312d}#pdfDialog::backdrop{background:#173b3650}#pdfDialog .btn{min-height:44px}#pdfProgress{margin:0;line-height:1.5;overflow-wrap:anywhere}#pdfCanvas{position:absolute;inset:0;pointer-events:none}#pdfCanvas[hidden],#pdfNavigation[hidden],#pdfBackdropState[hidden]{display:none}#canvas{position:relative}#pdfBackdropState{position:absolute;inset:0;display:grid;place-content:center;text-align:center;padding:20px;background:#fffdf8;pointer-events:none}.workspace.has-pdf{grid-template-rows:auto minmax(0,1fr)}#pdfNavigation{display:flex;align-items:center;gap:8px;padding:5px 12px;min-width:0}#pdfNavigation .btn{min-width:44px;min-height:44px;flex:none}#pdfPageLabel{flex:1;min-width:0;font-size:12px;overflow-wrap:anywhere}#pdfOpen{grid-column:1/-1}';document.head.append(pdfStyle);
const pdfOpen=document.createElement('button');pdfOpen.id='pdfOpen';pdfOpen.className='btn';pdfOpen.textContent='PDF üzerine çalış';document.querySelector('.tool-actions').prepend(pdfOpen);
const pdfCanvas=document.createElement('canvas');pdfCanvas.id='pdfCanvas';pdfCanvas.hidden=true;pdfCanvas.setAttribute('aria-hidden','true');document.querySelector('.paper').prepend(pdfCanvas);
const pdfBackdropState=document.createElement('div');pdfBackdropState.id='pdfBackdropState';pdfBackdropState.hidden=true;pdfBackdropState.setAttribute('role','status');document.querySelector('.paper').append(pdfBackdropState);
const pdfNavigation=document.createElement('div');pdfNavigation.id='pdfNavigation';pdfNavigation.hidden=true;pdfNavigation.innerHTML='<button class="btn" id="pdfPrevious" aria-label="Önceki sayfa">←</button><span id="pdfPageLabel"></span><button class="btn" id="pdfNext" aria-label="Sonraki sayfa">→</button>';document.querySelector('.workspace').prepend(pdfNavigation);
const pdfZoomControls=document.createElement('div');pdfZoomControls.id='pdfZoomControls';pdfZoomControls.innerHTML='<button class="btn" id="pdfZoomOut" aria-label="PDF küçült">−</button><output id="pdfZoomValue" aria-live="polite">%100</output><button class="btn" id="pdfZoomIn" aria-label="PDF büyüt">+</button><button class="btn" id="pdfFit">Genişliğe sığdır</button>';pdfNavigation.append(pdfZoomControls);
pdfStyle.textContent+='#pdfNavigation{flex-wrap:wrap}#pdfZoomControls{display:flex;align-items:center;gap:6px}#pdfZoomControls .btn{min-width:44px}#pdfZoomValue{min-width:48px;text-align:center;font-size:13px}@media(max-width:650px){#pdfZoomControls{flex-basis:100%;justify-content:center}#pdfFit{font-size:13px}}';
let pdfBusy=false,pdfPending=null,pdfRequest=0,pdfTask=null,pdfLibrary=null,pdfImage=null,pdfImageSource=null,pdfImageFailed=false;
let cancelPresentation=()=>{},updatePresentationControls=()=>{};
const PDF_FILE_LIMIT=20*1024*1024,PDF_IMAGE_LIMIT=24*1024*1024;
// v71: images are stored apart, so a pen stroke no longer rewrites them; they are still all held in
// memory and checked at startup. New PDFs are refused when the notebook's images would exceed this.
// Notebooks already larger keep working.
const NOTEBOOK_PDF_LIMIT=96*1024*1024;
function notebookLimitError(total){return new Error(`Bu PDF ile defterdeki görseller ${Math.round(total/1048576)} MB olur; iPad'de güvenilir kayıt için sınır ${NOTEBOOK_PDF_LIMIT/1048576} MB. Önce JSON yedeği alın, sonra artık gerekmeyen PDF defterlerini silip Çöp Kutusundan da kaldırın.`)}
// v69 reads PNG and JPEG page images; it still writes PNG. Accepting JPEG now lets a later release
// store smaller JPEG pages and still roll back to this one.
// v70: a page that is mostly photo or slide art is stored as JPEG when that is clearly smaller
// (under 60% of the PNG); text pages stay PNG and sharp. v69 already reads JPEG pages.
function pdfPageImage(surface){const png=surface.toDataURL('image/png'),jpeg=surface.toDataURL('image/jpeg',.88);return jpeg.startsWith('data:image/jpeg;base64,')&&jpeg.length<png.length*.6?jpeg:png}
function pdfImageSize(src){
  const png=src.startsWith('data:image/png;base64,'),jpeg=!png&&src.startsWith('data:image/jpeg;base64,');if(!png&&!jpeg)return null;
  const b64=src.slice(png?22:23);if(!/^[A-Za-z0-9+/]+={0,2}$/.test(b64))return null;
  if(png){const h=atob(b64.slice(0,44));if(!h.startsWith('\x89PNG\r\n\x1a\n')||h.slice(12,16)!=='IHDR')return null;const n=i=>((h.charCodeAt(i)*16777216)+(h.charCodeAt(i+1)<<16)+(h.charCodeAt(i+2)<<8)+h.charCodeAt(i+3));return {width:n(16),height:n(20)}}
  // JPEG: walk the marker segments to the first start-of-frame, which holds the size.
  const h=atob(b64.length<=65536?b64:b64.slice(0,65536)),c=i=>h.charCodeAt(i);if(c(0)!==255||c(1)!==216)return null;
  for(let i=2;i+8<h.length;){if(c(i)!==255)return null;const m=c(i+1);if(m===255){i++;continue}
    if(m>=192&&m<=207&&m!==196&&m!==200&&m!==204)return {width:c(i+7)*256+c(i+8),height:c(i+5)*256+c(i+6)};
    if(m===216||m===1||(m>=208&&m<=215)){i+=2;continue}i+=2+c(i+2)*256+c(i+3)}
  return null;
}
function validPdfBackground(b){
  if(!b||b.width!==1000||!Number.isSafeInteger(b.height)||b.height<100||b.height>3000||typeof b.name!=='string'||b.name.length>200||!Number.isSafeInteger(b.number)||!Number.isSafeInteger(b.total)||b.number<1||b.number>b.total||b.total>PDF_PAGE_LIMIT||typeof b.image!=='string'||b.image.length>6*1024*1024)return false;
  try{const size=pdfImageSize(b.image);return !!size&&size.width===b.width&&size.height===b.height}catch{return false}
}
async function validatePdfImages(book){
  const images=new Set([...book.pages,...(book.trash||[]).map(t=>t.page)].filter(p=>p.pdf).map(p=>p.pdf.image));
  for(const src of images){const image=new Image();let timer;try{image.src=src;await Promise.race([image.decode(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error()),10000)})])}catch{throw new Error('Yedekteki PDF görüntüsü okunamadı. Mevcut notlar değiştirilmedi.')}finally{clearTimeout(timer);image.src=''}}
}
function validPdfView(p){return (p.fitScale===undefined||(!p.pdf&&Number.isFinite(p.fitScale)&&p.fitScale>=0.2&&p.fitScale<=1))&&(p.pdfZoom===undefined||(!!p.pdf&&Number.isFinite(p.pdfZoom)&&p.pdfZoom>=1&&p.pdfZoom<=3))&&(p.viewX===undefined||(!!p.pdf&&Number.isFinite(p.viewX)&&p.viewX>=0&&p.viewX<=1000*(1-1/(p.pdfZoom??1))+1e-7))}
function pdfZoom(){return window.BilgeSlideFlow?.enabled()?window.BilgeSlideFlow.zoom():page()?.pdf?(page().pdfZoom??1):1}
// Plain pages zoom for this session only: their saved shape stays the one v60 reads,
// so rollback and older copies keep working. PDF zoom and position are saved as before.
const plainViews=new WeakMap();
function viewZoom(){const p=page();return p?.pdf?pdfZoom():(plainViews.get(p)?.zoom??1)}
function maxViewX(){if(window.BilgeSlideFlow?.enabled())return window.BilgeSlideFlow.maxX();const p=page(),zoom=viewZoom();if(!p||zoom===1)return 0;return (p.pdf?p.pdf.width:Math.max(1,canvas.getBoundingClientRect().width)/(p.fitScale||1))*(1-1/zoom)}
function viewX(){if(window.BilgeSlideFlow?.enabled())return window.BilgeSlideFlow.x();const p=page();return Math.min(maxViewX(),Math.max(0,(p?.pdf?p.viewX:plainViews.get(p)?.x)||0))}
function setViewX(x){if(window.BilgeSlideFlow?.enabled()){window.BilgeSlideFlow.setX(x);return}const p=page();if(!p)return;if(p.pdf){p.viewX=x;return}const v=plainViews.get(p);if(v)v.x=x}
function paperScale(){if(window.BilgeSlideFlow?.enabled())return window.BilgeSlideFlow.scale();const p=page();return p?.pdf?Math.max(1,canvas.getBoundingClientRect().width)/p.pdf.width*pdfZoom():(p?.fitScale||1)*viewZoom()}
function updatePdfZoom(){const zoom=viewZoom();document.querySelector('#pdfZoomValue').textContent=`%${Math.round(zoom*100)}`;document.querySelector('#pdfZoomOut').disabled=zoom<=1;document.querySelector('#pdfZoomIn').disabled=zoom>=3}
function setViewZoom(value){
  if(window.BilgeSlideFlow?.enabled()){window.BilgeSlideFlow.setZoom(value);return}
  const p=page();if(!canEdit()||drawing||pan||!p||!Number.isFinite(value))return;
  const next=Math.max(1,Math.min(3,Math.round(value*4)/4));if(next===viewZoom())return;
  const r=canvas.getBoundingClientRect(),oldScale=paperScale(),cx=viewX()+r.width/(2*oldScale),cy=viewY()+r.height/(2*oldScale);
  if(p.pdf)p.pdfZoom=next;else{const v=plainViews.get(p)||{zoom:1,x:0};v.zoom=next;plainViews.set(p,v)}
  const scale=paperScale();setViewX(Math.max(0,Math.min(maxViewX(),cx-r.width/(2*scale))));p.viewY=Math.max(0,cy-r.height/(2*scale));
  updatePdfZoom();drawAll();scheduleSave();document.querySelector('#inputState').textContent=`${p.pdf?'PDF ':''}%${Math.round(next*100)} · iki parmakla her yöne kaydırın`;
}
function setPdfZoom(value){if(page()?.pdf)setViewZoom(value)}
document.querySelector('#pdfZoomOut').onclick=()=>setPdfZoom(pdfZoom()-.25);document.querySelector('#pdfZoomIn').onclick=()=>setPdfZoom(pdfZoom()+.25);document.querySelector('#pdfFit').onclick=()=>setPdfZoom(1);
function pdfBackgroundReady(){return window.BilgeSlideFlow?.enabled()?window.BilgeSlideFlow.ready():!page()?.pdf||(pdfImageSource===page().pdf.image&&pdfImage?.complete&&pdfImage.naturalWidth>0&&!pdfImageFailed)}
function drawPdfBackground(){
  if(window.BilgeSlideFlow?.enabled()){window.BilgeSlideFlow.drawBackground();return}
  pdfBackdropState.classList.remove('slide-flow-status');
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
  const bg=page()?.pdf;
  // A presentation uses the notebook controls, even during startup/account
  // locking or when an older slide size cannot enter continuous flow.
  const showNavigation=!!bg&&!/\.pptx$/i.test(bg.name||'');
  pdfNavigation.hidden=!showNavigation;document.querySelector('.workspace').classList.toggle('has-pdf',showNavigation);if(!showNavigation)return;
  const pages=notebookPages(),index=pages.findIndex(p=>p.id===activeId),kind=/\.pptx$/i.test(bg.name)?'Slayt':'PDF';document.querySelector('#pdfPageLabel').textContent=`${bg.name} · ${kind} ${bg.number}/${bg.total}`;
  document.querySelector('#pdfPrevious').disabled=index<=0||!pages[index-1]?.pdf;document.querySelector('#pdfNext').disabled=index>=pages.length-1||!pages[index+1]?.pdf;
}
function navigatePdf(delta){if(!canEdit()||drawing||pan)return;const pages=notebookPages(),index=pages.findIndex(p=>p.id===activeId),target=pages[index+delta];if(!target?.pdf)return;activeId=target.id;renderPages();drawAll();scheduleSave()}
document.querySelector('#pdfPrevious').onclick=()=>navigatePdf(-1);document.querySelector('#pdfNext').onclick=()=>navigatePdf(1);
function pdfMessage(text){document.querySelector('#pdfProgress').textContent=text}
function cancelPdf(){pdfRequest++;pdfPending=null;pdfBusy=false;const task=pdfTask;pdfTask=null;if(task)void task.destroy().catch(()=>{});cancelPresentation();document.querySelector('#pdfChoose').disabled=false;document.querySelector('#pdfApply').disabled=true;updatePresentationControls()}
pdfDialog.addEventListener('close',()=>{
  // A queued close event may belong to the previous opening of this dialog.
  if(pdfDialog.open)return;
  cancelPdf();document.querySelector('#toolsToggle').focus({preventScroll:true});
});
document.querySelector('#pdfClose').onclick=()=>{if(document.querySelector('#pdfClose').disabled)return;pdfDialog.close()};
pdfDialog.addEventListener('cancel',e=>{if(document.querySelector('#pdfClose').disabled)e.preventDefault()});
pdfOpen.onclick=()=>{if(!canEdit()||drawing||pan)return;closeTools();cancelPdf();pdfMessage('Bir PDF seçin. Hazır olunca yeni deftere ekleyin.');pdfDialog.showModal()};
document.querySelector('#pdfChoose').onclick=()=>document.querySelector('#pdfFile').click();
document.querySelector('#pdfFile').onchange=e=>{const file=e.target.files[0];e.target.value='';if(file)void importPdfFile(file)};
// Shared import preserves the v72 image budget, atomic save and asset migration.
async function importPdfFile(file,presentationName=null){
  if(!file||!ready||saveConflict||pdfBusy||!pdfDialog.open)return;
  cancelPdf();const request=pdfRequest;pdfBusy=true;document.querySelector('#pdfChoose').disabled=true;let task,timeout;
  updatePresentationControls();
  const sourceName=presentationName||file.name;
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
    if(doc.numPages>PDF_PAGE_LIMIT)throw new Error(`Bu belgede ${doc.numPages} sayfa var. En fazla ${PDF_PAGE_LIMIT} sayfa kabul edilir. Dosyayı bölerek deneyin.`);
    const pages=[];let bytes=0;const existingImages=notebookImageBytes();
    for(let number=1;number<=doc.numPages;number++){
      if(request!==pdfRequest)return;pdfMessage(`PDF sayfası hazırlanıyor: ${number}/${doc.numPages}`);
      const source=await doc.getPage(number),base=source.getViewport({scale:1}),viewport=source.getViewport({scale:1000/base.width});
      if(!Number.isFinite(viewport.height)||viewport.height<100||viewport.height>3000)throw new Error('PDF sayfa oranı bu ilk sürümde desteklenmiyor.');
      const surface=document.createElement('canvas');surface.width=1000;surface.height=Math.ceil(viewport.height);let image;
      try{await source.render({canvasContext:surface.getContext('2d'),viewport,background:'#ffffff'}).promise;if(request!==pdfRequest)return;image=pdfPageImage(surface)}
      finally{surface.width=surface.height=1;source.cleanup()}
      bytes+=image.length;
      if(image.length>6*1024*1024||bytes>PDF_IMAGE_LIMIT)throw new Error('PDF görüntüleri tablet test sınırını aşıyor. Daha az sayfalı dosya deneyin.');if(existingImages+bytes>NOTEBOOK_PDF_LIMIT)throw notebookLimitError(existingImages+bytes);
      pages.push({id:newPageId(),title:presentationName?`Sunum · Slayt ${number}`:`PDF · Sayfa ${number}`,strokes:[],viewY:0,pdf:{image,width:1000,height:Math.ceil(viewport.height),name:sourceName.slice(0,200),number,total:doc.numPages},updated:new Date().toISOString()});
      // Give input/close/progress a turn between pages; keep only one live render canvas.
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    if(request!==pdfRequest)return;pdfPending={title:sourceName.replace(/\.(pdf|pptx?)$/i,'').trim().slice(0,65)||'Belge',pages,presentation:!!presentationName};pdfMessage(`${sourceName} · ${pages.length} ${presentationName?'slayt':'sayfa'} hazır. Yeni deftere ekleyin. Özgün dosyanızı ayrıca koruyun.`);document.querySelector('#pdfApply').disabled=false;
  }catch(error){if(request===pdfRequest){pdfPending=null;pdfMessage(error?.name==='PasswordException'?'Şifreli PDF bu ilk sürümde desteklenmiyor. Şifresiz bir kopya seçin.':`PDF eklenmedi. ${error?.message||'Dosya okunamadı.'}`)}}
  finally{clearTimeout(timeout);if(task)await task.destroy().catch(()=>{});if(request===pdfRequest){pdfTask=null;pdfBusy=false;document.querySelector('#pdfChoose').disabled=false;updatePresentationControls()}}
}
document.querySelector('#pdfApply').onclick=async()=>{
  if(!pdfPending||pdfBusy||!ready||saveConflict)return;
  pdfBusy=true;document.querySelector('#pdfApply').disabled=true;document.querySelector('#pdfChoose').disabled=true;document.querySelector('#pdfClose').disabled=true;pdfMessage('PDF ve mevcut notlar birlikte kaydediliyor…');
  updatePresentationControls();
  try{
    if(!await flushSave())throw new Error('Mevcut notlar kaydedilemedi; önce kayıt sorununu düzeltin.');
    const adding=pdfPending.pages.reduce((n,p)=>n+p.pdf.image.length,0),current=notebookImageBytes();if(current+adding>NOTEBOOK_PDF_LIMIT)throw notebookLimitError(current+adding);
    const estimate=await navigator.storage?.estimate?.().catch(()=>null);
    if(estimate&&Number.isFinite(estimate.quota)&&Number.isFinite(estimate.usage)&&estimate.quota-estimate.usage<2*(current+adding))throw new Error('Cihazda bu PDF için yeterli boş alan yok. Mevcut notlar korundu; iPad Saklama Alanı’ndan yer açıp yeniden deneyin.');
    const id=newPageId(),titles=new Set(notebooks().map(n=>n.title.toLocaleLowerCase('tr-TR')));let title=pdfPending.title,n=2;while(titles.has(title.toLocaleLowerCase('tr-TR')))title=`${pdfPending.title} (${n++})`;
    const added=pdfPending.pages.map(p=>({...p,notebookId:id})),next={...state,version:Math.max(2,state.version),notebooks:[...(state.notebooks||[]),{id,title}],pages:[...state.pages,...added],active:added[0].id,activeNotebook:id};
    if(!validState(next))throw new Error('PDF kayıt yapısı doğrulanamadı.');
    await dbPut(next,{preservePrevious:true});scheduleAssetSweep();state=next;activeId=next.active;activeNotebook=id;editRevision++;savedRevision=editRevision;saveFailed=false;failureMessage='';pdfPending=null;pdfDialog.close();renderPages();resize();renderSaveStatus();await refreshRecovery();document.querySelector('#inputState').textContent='PDF eklendi · kalemle yazın, iki parmakla kaydırın';
  }catch(error){pdfMessage(`PDF eklenmedi; mevcut notlar korundu. ${error?.name==='NotebookConflict'?'Başka sekmede değişiklik var. Pencereyi kapatıp kayıtlı defteri yeniden açın.':error?.message||'Kaydı tekrar deneyin.'}`);if(error?.name==='NotebookConflict'){saveError(error);pdfDialog.close()}}
  finally{pdfBusy=false;document.querySelector('#pdfClose').disabled=false;document.querySelector('#pdfChoose').disabled=false;document.querySelector('#pdfApply').disabled=!pdfPending;updatePresentationControls()}
};

// Local PPTX snapshots use the existing raster page contract, not a second ink or
// storage engine. Keep the original PDF importer stable; the new entry point has
// an explicit account/revision lease and does not mutate the book before commit.
window.BilgeRasterImport=(()=>{
  const leases=new WeakMap();let epoch=0,busy=false;
  addEventListener('bilge-account-locked',()=>{epoch++});
  function capture({guard=()=>true}={}){
    const account=window.BilgeAccount,identity=account?.identity;
    if(!ready||!state||isDirty()||assetSweep||savePromise||saveConflict||saveFailed||!account?.required||account.locked||
      identity?.type!=='access'||identity.status!=='approved'||typeof identity.id!=='string'||
      DB!=='bilge-defter-account-'+identity.id||!notebooks().some(n=>n.id===activeNotebook)||
      typeof guard!=='function'||!guard())return null;
    const lease=Object.freeze({scope:DB,notebook:Object.freeze({id:activeNotebook,title:notebookTitle(activeNotebook)})});
    leases.set(lease,{account,id:identity.id,db:DB,book:state,revision:editRevision,epoch,guard});return lease;
  }
  function isCurrent(lease){
    const c=leases.get(lease),a=window.BilgeAccount;
    try{return !!c&&ready&&!saveConflict&&!saveFailed&&c.epoch===epoch&&c.account===a&&a.required===true&&!a.locked&&
      a.identity?.type==='access'&&a.identity.status==='approved'&&a.identity.id===c.id&&
      DB===c.db&&state===c.book&&editRevision===c.revision&&activeNotebook===lease.notebook.id&&
      notebooks().some(n=>n.id===lease.notebook.id)&&c.guard()===true}catch{return false}
  }
  const stale=()=>Object.assign(new Error('Hesap, defter veya kayıt değişti. Sunum eklenmedi; pencereyi yeniden açın.'),{name:'ImportStale'});
  function check(lease){if(!isCurrent(lease))throw stale()}
  async function commit(candidate,lease){
    check(lease);
    if(busy||importing||pdfBusy||pdfExportBusy||drawing||pan||mediaBusy||mediaPlacement||mediaSelecting||
      backupDialog.open||pdfDialog.open||pdfExportDialog.open||plannerDialog.open)throw Error('Önce açık işlemi tamamlayın.');
    if(!candidate||typeof candidate.name!=='string'||!candidate.name.trim()||candidate.name.length>200||
      typeof candidate.newNotebook!=='boolean'||!Array.isArray(candidate.pages)||candidate.pages.length<1||
      candidate.pages.length>PDF_PAGE_LIMIT)throw Error('Sunum en fazla 100 geçerli slayt içermeli.');
    const name=candidate.name.trim(),count=candidate.pages.length,createNotebook=candidate.newNotebook;
    // Clone only the accepted primitive shape before any await. A caller cannot
    // substitute mutable image/note objects while validation is suspended.
    let bytes=0,pointCount=0,strokeCount=0;
    const added=candidate.pages.map((p,i)=>{
      if(!p||p.number!==i+1||p.total!==count)throw Error('Slayt sırası doğrulanamadı.');
      const pdf={image:p.image,width:p.width,height:p.height,name,number:i+1,total:count};
      if(!validPdfBackground(pdf))throw Error('Slayt görüntüsü veya boyutu desteklenmiyor.');
      bytes+=pdf.image.length;if(bytes>PDF_IMAGE_LIMIT)throw Error('Sunum görüntüleri 24 MB aktarım sınırını aşıyor. Sunumu bölerek deneyin.');
      if(p.strokes!==undefined&&!Array.isArray(p.strokes))throw Error('Sunum notları doğrulanamadı.');
      const strokes=(p.strokes||[]).map(s=>{
        if(++strokeCount>500000||s?.tool!=='pen'||typeof s.color!=='string'||!/^#[0-9a-f]{6}$/i.test(s.color)||
          !Number.isFinite(s.width)||s.width<=0||s.width>100||!Array.isArray(s.points)||!s.points.length||s.points.length>5000)
          throw Error('Sunum notları güvenli aktarım sınırını aşıyor.');
        return {tool:'pen',color:s.color,width:s.width,points:s.points.map(pt=>{
          if(++pointCount>1000000||!Number.isFinite(pt?.x)||!Number.isFinite(pt?.y)||pt.x<0||pt.x>1000||
            pt.y<0||pt.y>pdf.height||(pt.p!==undefined&&(!Number.isFinite(pt.p)||pt.p<0||pt.p>1)))throw Error('Sunum kalem noktaları doğrulanamadı.');
          return {x:pt.x,y:pt.y,...(pt.p===undefined?{}:{p:pt.p})};
        })};
      });
      return {id:newPageId(),title:`Sunum · Slayt ${i+1}`,strokes,viewY:0,pdf,updated:new Date().toISOString()};
    });
    // Include notes too: a tiny image must not smuggle an unbounded ink payload.
    if(JSON.stringify(added.map(p=>p.strokes)).length>16*1024*1024)throw Error('Sunum notları 16 MB aktarım sınırını aşıyor.');
    busy=true;importing=true;let persisted=false;
    try{
      renderSaveStatus();
      if(assetSweep)await assetSweep;
      if(!await flushSave())throw Error('Mevcut notlar kaydedilemedi; sunum eklenmedi.');check(lease);
      for(const p of added){
        const im=await exportImage(p.pdf.image);
        try{check(lease);if(im.naturalWidth!==p.pdf.width||im.naturalHeight!==p.pdf.height)throw Error('Slayt görüntüsünün gerçek boyutu farklı.')}finally{im.src=''}
      }
      const current=notebookImageBytes();
      if(current+bytes>NOTEBOOK_PDF_LIMIT)throw Error('Bu hesaptaki toplam görseller 96 MB sınırını aşıyor. Mevcut notlar değiştirilmedi.');
      const estimate=await navigator.storage?.estimate?.().catch(()=>null);check(lease);
      if(estimate&&Number.isFinite(estimate.quota)&&Number.isFinite(estimate.usage)&&estimate.quota-estimate.usage<2*(current+bytes))
        throw Error('Cihazda sunumu güvenle kaydetmek için yeterli boş alan yok. Mevcut notlar korundu.');
      let id=lease.notebook.id,newBooks=state.notebooks;
      if(createNotebook){
        id=newPageId();const base=name.replace(/\.(pptx|bdpptx)$/i,'').trim().slice(0,65)||'Sunum';
        const titles=new Set(notebooks().map(n=>n.title.toLocaleLowerCase('tr-TR')));let title=base,n=2;
        while(titles.has(title.toLocaleLowerCase('tr-TR')))title=`${base} (${n++})`;
        newBooks=[...(state.notebooks||[]),{id,title}];
      }
      const pages=added.map(p=>({...p,notebookId:id}));
      const next={...state,version:Math.max(2,state.version),...(newBooks?{notebooks:newBooks}:{}),
        pages:[...state.pages,...pages],active:pages[0].id,activeNotebook:id};
      if(!validState(next))throw Error('Sunum kayıt yapısı doğrulanamadı.');
      check(lease);
      try{await dbPut(next,{preservePrevious:true,guard:()=>isCurrent(lease)})}catch(error){
        // Match ordinary save recovery if another tab collected an old asset.
        if(error?.name!=='MissingAsset')throw error;
        check(lease);for(const ref of String(error.message).split(','))storedAssets.delete(ref);assetEpoch++;
        await dbPut(next,{preservePrevious:true,guard:()=>isCurrent(lease)});
      }
      persisted=true;
      // An already submitted IDB transaction cannot be recalled. Never install
      // its result into a different/locked UI, or invite a duplicate retry.
      if(!isCurrent(lease))throw Object.assign(new Error('Sunum önceki hesabın defterine kaydedildi. Hesabı yeniden açıp kontrol edin; tekrar eklemeyin.'),{name:'ImportCommitted'});
      leases.delete(lease);state=next;activeId=next.active;activeNotebook=id;editRevision++;savedRevision=editRevision;
      saveFailed=false;failureMessage='';failureCode='';scheduleAssetSweep();
      if(typeof window.markSyncDirty==='function')window.markSyncDirty();
      renderPages();resize();drawAll();renderSaveStatus();void refreshRecovery();
      document.querySelector('#inputState').textContent=`${count} slayt deftere eklendi · normal kalem araçlarıyla yazın`;
      return {ok:true,count,notebookId:id};
    }catch(error){
      if(persisted)throw Object.assign(new Error('Sunum kaydedildi ancak ekran yenilenemedi. Defteri yeniden açıp kontrol edin; tekrar eklemeyin.'),{name:'ImportCommitted'});
      if(error?.name==='NotebookConflict')saveError(error);
      if(error?.name==='SaveWorkerLost')throw Object.assign(new Error('Kayıt işlemcisinden kesin sonuç alınamadı. Defteri yeniden açıp sunumun eklenip eklenmediğini kontrol edin; hemen tekrar eklemeyin.'),{name:'ImportCommitUnknown'});
      throw error;
    }
    finally{busy=false;importing=false;try{renderSaveStatus()}catch{/* Persisted outcome must not be hidden by a failed UI repaint. */}}
  }
  async function settle(){if(assetSweep)await assetSweep;return flushSave()}
  return Object.freeze({capture,isCurrent,commit,settle,revoke:lease=>leases.delete(lease),get busy(){return busy}});
})();

// Never display raw server errors or an unbounded body in a notebook window.
async function presentationErrorMessage(response){
  const fallback=({429:'Sunucu meşgul. Biraz sonra yeniden deneyin.',413:'Sunum boyut sınırını aşıyor.',415:'Sunum türü veya içeriği desteklenmiyor.',422:'Sunum açılamadı. Dosya bozuk, şifreli ya da güvenlik nedeniyle reddedilmiş olabilir.',503:'Sunum hizmeti şu anda kullanılamıyor; yöneticinize bildirin.',504:'Dönüştürme zaman aşımına uğradı. Yeniden göndermeden önce yöneticinin hizmeti denetlemesi gerekiyor.'})[response.status]||'İşlem tamamlanamadı. Hesabınızı ve bağlantınızı denetleyin.';
  if(response.status!==422||!(response.headers.get('content-type')||'').toLowerCase().startsWith('application/json')||!response.body){void response.body?.cancel().catch(()=>{});return fallback}
  const reader=response.body.getReader();let size=0,text='',timer;const decoder=new TextDecoder();
  // Some engines buffer a partial error body until EOF. A byte cap alone cannot
  // release the editor then; bound this optional explanation separately from conversion.
  const deadline=new Promise(resolve=>{timer=setTimeout(()=>resolve(null),5000)});
  try{
    for(;;){const part=await Promise.race([reader.read(),deadline]);if(!part){void reader.cancel().catch(()=>{});return fallback}const {value,done}=part;if(done)break;size+=value.byteLength;if(size>4096){void reader.cancel().catch(()=>{});return fallback}text+=decoder.decode(value,{stream:true})}
    text+=decoder.decode();const detail=JSON.parse(text)?.detail;
    if(detail?.code==='presentation_slide_limit'&&detail.max_slides===PDF_PAGE_LIMIT&&Number.isSafeInteger(detail.actual_slides)&&detail.actual_slides>PDF_PAGE_LIMIT&&detail.actual_slides<=1000000)return `Bu sunumda ${detail.actual_slides} slayt var. En fazla ${PDF_PAGE_LIMIT} slayt kabul edilir. Sunumu bölerek deneyin.`;
  }catch{/* Only the specific safe numeric contract is user-visible. */}finally{clearTimeout(timer);reader.releaseLock()}
  return fallback;
}
// Adapted from b03bb10's opt-in import, integrated with v72's save/asset safeguards.
// Closing/offline/account lock invalidates both the upload and any delayed response.
(() => {
  'use strict';
  const base='./api/v1/bilge-defter/pdf-tools/',types={pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation'};
  const section=document.createElement('section');section.id='pdfPresentationSection';
  section.innerHTML='<button class="btn" id="pdfPresentationChoose">PowerPoint seç (.pptx)</button><input id="pdfPresentationFile" type="file" accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation" hidden><p class="recovery-note">Eski .ppt dosyalarını PowerPoint’ten PDF olarak dışa aktarıp Cihazdan PDF seç ile açın.</p><div id="pdfPresentationConsent" hidden><p class="recovery-note">Yalnız seçtiğiniz sunum, onayınızla Bilge Defter sunucusunda PDF’e çevrilir. Mevcut defteriniz gönderilmez. Dönüşüm internet ve onaylı hesap gerektirir. Slaytlar sabit görüntü olur; animasyon, video ve konuşmacı notları aktarılmaz. Yazı tipi ve yerleşim değişebilir; eklemeden önce slaytları kontrol edin. En fazla 20 MB / '+PDF_PAGE_LIMIT+' slayt. Görsel yoğunluğu cihazın güvenli görüntü bütçesini aşabilir. Makro, gömülü nesne ve dış bağlantı içeren dosyalar güvenlik nedeniyle reddedilebilir.</p><label class="presentation-consent"><input id="pdfPresentationAgree" type="checkbox"> Seçtiğim sunumun sunucuda dönüştürülmesini onaylıyorum.</label><button class="btn primary" id="pdfPresentationSend" disabled>Sunumu gönder ve dönüştür</button></div>';
  document.querySelector('#pdfProgress').before(section);
  const preview=document.createElement('div');preview.id='presentationPreview';preview.hidden=true;
  preview.innerHTML='<p class="recovery-note">Dönüşüm önizlemesi: yerleşimi kontrol edin. Henüz deftere eklenmedi.</p><img id="presentationPreviewImage" alt="Dönüştürülen slayt önizlemesi"><div class="presentation-preview-controls"><button class="btn" id="presentationPreviewPrevious" aria-label="Önceki slayt önizlemesi">←</button><output id="presentationPreviewCount" aria-live="polite"></output><button class="btn" id="presentationPreviewNext" aria-label="Sonraki slayt önizlemesi">→</button></div>';
  section.append(preview);
  pdfStyle.textContent+='#pdfDialog{overflow:auto}#pdfPresentationSection{margin:12px 0}#pdfPresentationConsent[hidden]{display:none}#pdfPresentationSection .presentation-consent{display:flex;gap:10px;align-items:flex-start;line-height:1.5;margin:12px 0}#pdfPresentationAgree{flex:none;width:22px;height:22px}#pdfPresentationSection .btn{max-width:100%;white-space:normal}';
  pdfStyle.textContent+='#presentationPreview[hidden]{display:none}#presentationPreviewImage{display:block;width:100%;height:auto;border:1px solid #d5e2dc}#presentationPreview .presentation-preview-controls{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:8px}';
  const choose=section.querySelector('#pdfPresentationChoose'),input=section.querySelector('#pdfPresentationFile'),block=section.querySelector('#pdfPresentationConsent'),agree=section.querySelector('#pdfPresentationAgree'),send=section.querySelector('#pdfPresentationSend');
  const open=document.createElement('button');open.id='presentationOpen';open.className='btn';open.textContent='PowerPoint aç';pdfOpen.after(open);
  open.onclick=()=>{pdfOpen.click();if(pdfDialog.open)choose.focus({preventScroll:true})};
  let selected=null,busy=false,epoch=0,controller=null,previewPending=null,previewIndex=0;
  function allowed(){const a=window.BilgeAccount;return !!(a?.required&&!a.locked&&a.identity?.status==='approved'&&navigator.onLine)}
  function controls(){
    choose.disabled=pdfBusy||busy;agree.disabled=pdfBusy||busy;send.disabled=pdfBusy||busy||!selected||!agree.checked||!allowed();block.hidden=!selected;
    if(previewPending!==pdfPending){previewPending=pdfPending;previewIndex=0}
    preview.hidden=!pdfPending?.presentation;
    const image=preview.querySelector('img');
    if(preview.hidden){image.removeAttribute('src');return}
    const pages=pdfPending.pages;image.src=pages[previewIndex].pdf.image;
    preview.querySelector('output').textContent=`Slayt ${previewIndex+1} / ${pages.length}`;
    preview.querySelector('#presentationPreviewPrevious').disabled=pdfBusy||previewIndex===0;
    preview.querySelector('#presentationPreviewNext').disabled=pdfBusy||previewIndex>=pages.length-1;
  }
  preview.querySelector('#presentationPreviewPrevious').onclick=()=>{if(!pdfBusy&&previewIndex>0){previewIndex--;controls()}};
  preview.querySelector('#presentationPreviewNext').onclick=()=>{if(!pdfBusy&&previewIndex<(pdfPending?.pages.length||0)-1){previewIndex++;controls()}};
  function reset(){epoch++;controller?.abort();controller=null;selected=null;busy=false;input.value='';agree.checked=false;controls()}
  cancelPresentation=reset;updatePresentationControls=controls;
  choose.onclick=()=>{if(!choose.disabled&&pdfDialog.open)input.click()};
  input.onchange=async()=>{
    const file=input.files[0];if(!file||pdfBusy||!pdfDialog.open)return;
    cancelPdf();const token=epoch;
    if(!allowed()){pdfMessage('PowerPoint aktarımı internet ve onaylı hesap gerektirir. Hiçbir dosya gönderilmedi. Sunumu PDF olarak dışa aktarıp cihazdan açabilirsiniz.');return}
    const ext=(file.name.match(/\.(pptx?)$/i)||[])[1]?.toLowerCase(),media=types[ext];
    if(!media){pdfMessage('Bu sürüm yalnız .pptx sunumlarını destekler. Eski .ppt dosyasını PowerPoint’ten PDF olarak dışa aktarıp açın. Hiçbir dosya gönderilmedi.');return}
    if(file.size<8||file.size>PDF_FILE_LIMIT){pdfMessage('Boş olmayan, en fazla 20 MB sunum seçin. Hiçbir dosya gönderilmedi.');return}
    try{
      const bytes=new Uint8Array(await file.slice(0,8).arrayBuffer()),magic=ext==='pptx'?[0x50,0x4b,0x03,0x04]:[0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1];
      if(!magic.every((b,i)=>bytes[i]===b))throw Error('Sunum dosyası doğrulanamadı.');
      if(token!==epoch||!pdfDialog.open)return;
      selected={file,media};pdfMessage(`${file.name} seçildi. Henüz gönderilmedi; dönüştürmek için aşağıdaki onayı işaretleyin.`);controls();
    }catch{if(token===epoch)pdfMessage('Sunum dosyası okunamadı veya doğrulanamadı. Hiçbir dosya gönderilmedi.')}
  };
  agree.onchange=controls;
  send.onclick=async()=>{
    controls();if(send.disabled||!ready||saveConflict)return;
    const token=++epoch,account=window.BilgeAccount.identity.id,{file,media}=selected,abort=new AbortController();controller=abort;busy=true;pdfBusy=true;document.querySelector('#pdfChoose').disabled=true;controls();
    const alive=()=>token===epoch&&pdfDialog.open&&allowed()&&window.BilgeAccount.identity.id===account;
    const timer=setTimeout(()=>abort.abort(),100000);
    try{
      if(!await flushSave())throw Error('Mevcut notlar kaydedilemedi; sunum gönderilmedi.');
      if(!alive())return;
      pdfMessage('Sunum hizmeti denetleniyor… Henüz dosya gönderilmedi.');
      const status=await window.BilgeAccount.fetch(base+'status',{signal:abort.signal});if(!alive())return;
      const info=status.ok&&(status.headers.get('content-type')||'').includes('application/json')?await status.json():null;if(!alive())return;
      if(info?.worker_state==='unknown')throw Error('Önceki dönüştürme işleminin sonucu belirsiz. Yöneticinin sunum hizmetini denetlemesi gerekiyor; yeni dosya gönderilmedi.');
      if(!(info?.configured===true&&info.consent_required===true&&info.operations?.includes('convert')))throw Error('Sunucuda PowerPoint aktarımı henüz açılmadı. Sunumu PDF olarak dışa aktarıp cihazdan açabilirsiniz.');
      pdfMessage('Sunum PDF’e dönüştürülüyor… Pencereyi kapatarak beklemeyi iptal edebilirsiniz.');
      const response=await window.BilgeAccount.fetch(base+'convert',{method:'POST',headers:{'Content-Type':media,'X-Bilge-Pdf-Consent':'1'},body:file,signal:abort.signal});
      if(!alive())return;
      if(!response.ok)throw Error(await presentationErrorMessage(response));
      if((response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase()!=='application/pdf'||Number(response.headers.get('content-length')||0)>PDF_FILE_LIMIT||!response.body)throw Error('Sunucudan geçerli PDF alınamadı.');
      const reader=response.body.getReader(),chunks=[];let size=0;
      try{for(;;){const {value,done}=await reader.read();if(!alive()){await reader.cancel();return}if(done)break;size+=value.length;if(size>PDF_FILE_LIMIT)throw Error('Dönüşüm sonucu 20 MB sınırını aşıyor.');chunks.push(value)}}catch(e){await reader.cancel().catch(()=>{});throw e}finally{reader.releaseLock()}
      const blob=new Blob(chunks,{type:'application/pdf'});
      if(!new TextDecoder().decode(await blob.slice(0,5).arrayBuffer()).startsWith('%PDF-')||!new TextDecoder().decode(await blob.slice(-1024).arrayBuffer()).includes('%%EOF'))throw Error('Sunucu eksik PDF döndürdü.');
      if(!alive())return;
      // End the upload before handing over; cancelPdf inside import revokes this epoch.
      clearTimeout(timer);controller=null;busy=false;pdfBusy=false;selected=null;agree.checked=false;controls();
      await importPdfFile(new File([blob],file.name.replace(/\.pptx?$/i,'')+'.pdf',{type:'application/pdf'}),file.name);
    }catch(e){if(token===epoch&&pdfDialog.open)pdfMessage(e.name==='AbortError'?'Dönüştürme zaman aşımına uğradı veya iptal edildi. Notlar değişmedi.':`Sunum eklenmedi. ${e.message==='Failed to fetch'?'Bağlantı kurulamadı.':e.message||'İşlem tamamlanamadı.'}`)}
    finally{clearTimeout(timer);abort.abort();if(token===epoch){controller=null;busy=false;pdfBusy=false;agree.checked=false;document.querySelector('#pdfChoose').disabled=false;controls()}}
  };
  // Network loss does not imply an already-uploaded file was never sent.
  addEventListener('offline',()=>{if(selected||busy){cancelPdf();if(pdfDialog.open)pdfMessage('Bağlantı kesildi; aktarım tamamlanmadı. Notlar değişmedi. Sunucuya ulaşan işlem bir süre daha çalışabilir.')}});
  addEventListener('bilge-account-locked',()=>{cancelPdf();if(pdfDialog.open)pdfMessage('Hesap erişimi değişti. Aktarım durduruldu; notlar değişmedi.')});
  addEventListener('pagehide',()=>cancelPdf());
})();

// Main-notebook PPTX pages retain the existing PDF-background/ink storage shape.
// Only the viewport is continuous: one background canvas, one editable ink canvas,
// and a bounded set of decoded pictures. The separate PPTX reader is unaffected.
window.BilgeSlideFlow=(()=>{
  const WIDTH=1000,GAP=24,PREFETCH_PIXEL_BUDGET=12000000,INK_PIXEL_BUDGET=8000000;
  const pictures=new Map(),heights=new WeakMap(),inkTiles=new Map(),inkStamps=new WeakMap(),inkBounds=new WeakMap(),inkPressures=new WeakMap();
  let inkPixels=0;
  let flow=null;
  pdfStyle.textContent+='#pdfBackdropState.slide-flow-status{inset:auto;width:1px;height:1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap}';

  function initialized(){
    // This script is loaded before the main inline script declares its globals.
    try{return !!ready&&!!state&&!window.BilgeAccount?.locked}catch{return false}
  }
  function isSlide(p){return !!p?.pdf&&p.pdf.width===WIDTH&&/\.pptx$/i.test(p.pdf.name||'')}
  function frozen(){return drawing||!!mediaGesture}
  function selectionBusy(){return drawing||!!pan||!!mediaGesture||!!mediaPending||!!mediaPlacement}
  function disposePicture(entry){entry.image.onload=entry.image.onerror=null;entry.image.src=''}
  function dropInk(key){const tile=inkTiles.get(key);if(!tile)return;inkPixels-=tile.pixels;tile.canvas.width=tile.canvas.height=1;inkTiles.delete(key)}
  function clearInk(){for(const key of inkTiles.keys())dropInk(key)}
  function reset(){for(const entry of pictures.values())disposePicture(entry);pictures.clear();clearInk();flow=null}
  function rect(){return canvas.getBoundingClientRect()}
  function rawScale(){return Math.max(1,rect().width)/WIDTH*flow.zoom}
  function scale(){
    if(!ensure())return 1;
    if(frozen()){if(!flow.frozenScale)flow.frozenScale=rawScale();return flow.frozenScale}
    flow.frozenScale=null;return rawScale();
  }
  function rowFor(id=activeId){return flow?.byId.get(id)}
  function maxX(){return ensure()?WIDTH*(1-1/flow.zoom):0}
  function maxScroll(){return Math.max(0,flow.total-rect().height/rawScale())}
  function aligned(value,limit){
    const pixels=rawScale()*Math.min(devicePixelRatio||1,2),bounded=Math.max(0,Math.min(limit,value));
    return Math.max(0,Math.min(limit,Math.round(bounded*pixels)/pixels));
  }
  // Subpixel movement cannot show more than the physical display pixels. Keep
  // pan offsets on that grid so cached ink retains the exact rasterization phase.
  function clampScroll(value){return aligned(value,maxScroll())}
  function clampX(value){return aligned(value,WIDTH*(1-1/flow.zoom))}
  function pixelPhase(value){return (Math.round((value-Math.floor(value))*1e8)/1e8)%1}
  function pageHeight(p){
    const list=p.strokes,last=list.at(-1),revision=pageRevs.get(p)||0,memo=heights.get(p);
    if(memo&&memo.list===list&&memo.count===list.length&&memo.revision===revision&&memo.updated===p.updated&&memo.last===last&&memo.points===last?.points?.length&&memo.background===p.pdf)return memo.height;
    let height=p.pdf.height;
    for(const stroke of list){
      if(isMedia(stroke)){height=Math.max(height,mediaBounds(stroke).bottom);continue}
      let bottom=0;for(const point of stroke.points)bottom=Math.max(bottom,point.y);
      height=Math.max(height,bottom+(stroke.width||2));
    }
    // Old pages could contain handwriting below the picture; never truncate it.
    height=Math.max(p.pdf.height,Number.isFinite(height)?height:p.pdf.height);
    heights.set(p,{list,count:list.length,revision,updated:p.updated,last,points:last?.points?.length,background:p.pdf,height});
    return height;
  }
  function ensure(){
    if(!initialized()){if(flow)reset();return false}
    // Coalesced pen samples call these coordinate helpers repeatedly. The
    // gesture owns its page/geometry; do not scan a notebook per pen sample.
    if(flow&&flow.state===state&&flow.db===DB&&flow.notebook===activeNotebook&&flow.activeId===activeId&&(frozen()||pan))return true;
    const currentPage=page();
    if(!isSlide(currentPage)){if(flow)reset();return false}
    const all=notebookPages(),at=all.indexOf(currentPage);
    if(at<0){reset();return false}
    let first=at,last=at;
    while(first>0&&isSlide(all[first-1]))first--;
    while(last+1<all.length&&isSlide(all[last+1]))last++;
    const pages=all.slice(first,last+1);
    const same=flow&&flow.state===state&&flow.db===DB&&flow.notebook===activeNotebook&&pages.length===flow.rows.length&&pages.every((p,i)=>flow.rows[i].page===p);
    if(!same){
      reset();let top=0;
      const rows=pages.map(p=>{const row={page:p,top,height:pageHeight(p)};top+=row.height+GAP;return row});
      flow={state,db:DB,notebook:activeNotebook,rows,byId:new Map(rows.map(row=>[row.page.id,row])),total:top-GAP,scroll:0,x:0,zoom:1,activeId,frozenScale:null};
      const row=rowFor();flow.scroll=clampScroll(row.top+Math.min(row.height,Math.max(0,currentPage.viewY||0)));
    }else if(!frozen()){
      const oldRow=rowFor(flow.activeId),local=oldRow?flow.scroll-oldRow.top:0;
      let top=0,changed=false;
      for(const row of flow.rows){const height=pageHeight(row.page);if(row.height!==height||row.top!==top)changed=true;row.top=top;row.height=height;top+=height+GAP}
      flow.total=top-GAP;
      if(changed&&oldRow)flow.scroll=clampScroll(oldRow.top+local);
      if(flow.activeId!==activeId){
        // Sidebar/page actions selected a page, not a scroll-driven hand-off.
        flow.activeId=activeId;const row=rowFor();
        const saved=Math.max(0,currentPage.viewY||0);
        flow.scroll=clampScroll(row.top+(saved<row.height?saved:0));
      }
    }
    if(!frozen()&&!pan)flow.scroll=clampScroll(flow.scroll);
    return true;
  }
  function visibleRows(){
    if(!ensure())return [];
    const bottom=flow.scroll+rect().height/scale();
    return flow.rows.filter(row=>row.top+row.height>flow.scroll&&row.top<bottom);
  }
  function persist(){
    const row=rowFor();if(!row)return false;
    // While a pan crosses several pages its owner remains fixed. Do not store a
    // later page's global offset in that old page; settle saves the new owner.
    const beforeY=row.page.viewY,beforeZoom=row.page.pdfZoom,beforeX=row.page.viewX,local=flow.scroll-row.top;
    if(local>=0&&local<row.height&&(row.page.viewY!==undefined||local!==0))row.page.viewY=local;
    // Merely opening/leaving the new viewer must not materialize optional
    // default fields in a previously unchanged, backwards-readable notebook.
    const nextX=Math.max(0,Math.min(WIDTH*(1-1/flow.zoom),flow.x));
    if(row.page.pdfZoom!==undefined||flow.zoom!==1)row.page.pdfZoom=flow.zoom;
    if(row.page.viewX!==undefined||nextX!==0)row.page.viewX=nextX;
    return beforeY!==row.page.viewY||beforeZoom!==row.page.pdfZoom||beforeX!==row.page.viewX;
  }
  function changed(){persist();markViewChanged();scheduleViewSave();queueViewportRender()}
  function desiredRows(){
    const viewport=rect();if(viewport.width<60||viewport.height<60)return [];
    const visible=visibleRows(),wanted=[];
    let pixels=0;
    const add=(row,prefetch=false)=>{if(row&&!wanted.includes(row)){const size=row.page.pdf.width*row.page.pdf.height;if(prefetch&&pixels+size>PREFETCH_PIXEL_BUDGET)return;wanted.push(row);pixels+=size}};
    const active=rowFor();if(visible.includes(active))add(active);
    for(const row of visible)add(row);
    // Every visible short slide must be paintable, even on a tall viewport.
    // Only the two optional neighbors are constrained by the decode budget.
    if(visible.length){add(flow.rows[flow.rows.indexOf(visible[0])-1],true);add(flow.rows[flow.rows.indexOf(visible.at(-1))+1],true)}
    return wanted;
  }
  function warm(){
    if(!ensure())return;
    const owner=flow,wanted=desiredRows(),ids=new Set(wanted.map(row=>row.page.id));
    for(const [id,entry] of pictures)if(!ids.has(id)||entry.source!==rowFor(id)?.page.pdf.image){disposePicture(entry);pictures.delete(id)}
    for(const row of wanted){
      if(pictures.has(row.page.id))continue;
      const image=new Image(),entry={source:row.page.pdf.image,image,status:'loading'};
      pictures.set(row.page.id,entry);
      const finish=status=>{
        if(flow!==owner||pictures.get(row.page.id)!==entry)return;
        entry.status=status;
        if(!initialized()||state!==owner.state||DB!==owner.db){reset();return}
        queueViewportRender();
      };
      image.onload=()=>finish(image.naturalWidth>0?'ready':'error');
      image.onerror=()=>finish('error');image.src=entry.source;
    }
  }
  function imageReady(row){const entry=row&&pictures.get(row.page.id);return !!entry&&entry.source===row.page.pdf.image&&entry.status==='ready'&&entry.image.complete&&entry.image.naturalWidth>0}
  function imageReadyForActive(){if(!ensure())return false;warm();return imageReady(rowFor())}
  function select(row){
    if(!row||row.page.id===activeId)return false;
    activeId=row.page.id;state.active=activeId;flow.activeId=activeId;
    persist();markViewChanged();scheduleViewSave();refreshChrome();updatePdfNavigation();return true;
  }
  function settle(){
    if(!ensure()||!canEdit()||selectionBusy()||pinchT||saveConflict||importing)return false;
    const row=flow.rows.find(item=>item.top+item.height>flow.scroll)||flow.rows.at(-1);
    const selected=select(row),viewChanged=persist();if(viewChanged&&!selected){markViewChanged();scheduleViewSave()}if(selected)queueViewportRender();return selected;
  }
  function preparePointer(event){
    if(!ensure()||saveConflict||importing||window.BilgePptx?.active||selectionBusy())return false;
    const r=rect(),s=scale(),x=(event.clientX-r.left)/s+flow.x,y=(event.clientY-r.top)/s+flow.scroll;
    if(x<0||x>WIDTH)return false;
    const row=flow.rows.find(item=>y>=item.top&&y<=item.top+item.height);
    if(!row)return false;
    warm();if(!imageReady(row))return false;
    if(select(row)){drawAll();warm()}
    return true;
  }
  function point(event){
    if(!ensure())return null;
    const r=rect(),s=scale(),row=rowFor();
    let x=(event.clientX-r.left)/s+flow.x,y=(event.clientY-r.top)/s+flow.scroll-row.top;
    // Media already has its own rotation/size constraints. Only a live ink
    // stroke is clamped to its pinned page rather than spilling onto a neighbor.
    if(drawing){
      const margin=Math.max(0,current?.width||selectedWidth()/s);
      x=Math.max(0,Math.min(WIDTH,x));y=Math.max(0,Math.min(Math.max(0,row.height-margin),y));
    }
    return {x,y,p:event.pressure||.5};
  }
  function clip(target){if(!ensure())return;const row=rowFor();target.beginPath();target.rect(0,0,WIDTH,row.height);target.clip()}
  function scroll(nextLocal,nextX=flow?.x||0){
    if(!ensure()||!canEdit()||drawing||mediaGesture||!Number.isFinite(nextLocal)||!Number.isFinite(nextX))return false;
    const next=clampScroll(rowFor().top+nextLocal),x=clampX(nextX);
    if(next===flow.scroll&&x===flow.x)return false;
    flow.scroll=next;flow.x=x;changed();
    const status=document.querySelector('#inputState');if(status)status.textContent='Slaytlar · iki parmakla aşağı/yukarı kaydırın';return true;
  }
  function applyZoom(value,mx,my){
    if(!ensure()||!Number.isFinite(value)||drawing||mediaGesture||mediaPending||!canEdit())return false;
    const next=Math.max(1,Math.min(3,value));if(next===flow.zoom)return false;
    const previous=scale(),anchorX=flow.x+mx/previous,anchorY=flow.scroll+my/previous;
    flow.zoom=next;flow.frozenScale=null;const after=scale();
    flow.x=clampX(anchorX-mx/after);flow.scroll=clampScroll(anchorY-my/after);
    changed();updatePdfZoom();return true;
  }
  function setZoom(value){
    if(!ensure()||pan||pinchT||!Number.isFinite(value))return false;
    const r=rect(),result=applyZoom(Math.round(value*4)/4,r.width/2,r.height/2);
    if(result){settle();drawAll();refreshChrome()}return result;
  }
  function pinch(value,mx,my){
    const result=applyZoom(value,mx,my);
    if(result&&pan){
      const a=touchPoints.get(pan.ids[0]),b=touchPoints.get(pan.ids[1]);
      if(a&&b){pan.startY=(a.y+b.y)/2;pan.startX=(a.x+b.x)/2;pan.startOffset=flow.scroll-rowFor().top;pan.startOffsetX=flow.x;pan.pageId=activeId}
    }
    return result;
  }
  function drawBackground(){
    if(!ensure())return;
    // Release the old single-page decoder when entering the continuous view.
    if(pdfImage){pdfImage.onload=pdfImage.onerror=null;pdfImage.src='';pdfImage=null;pdfImageSource=null;pdfImageFailed=false}
    warm();pdfCanvas.hidden=false;
    if(pdfCanvas.width!==canvas.width||pdfCanvas.height!==canvas.height){pdfCanvas.width=canvas.width;pdfCanvas.height=canvas.height}
    const c=pdfCanvas.getContext('2d'),s=scale(),d=ctx.getTransform().a;
    c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,pdfCanvas.width,pdfCanvas.height);c.fillStyle='#e5ebe7';c.fillRect(0,0,pdfCanvas.width,pdfCanvas.height);
    for(const row of visibleRows()){
      c.save();c.setTransform(d*s,0,0,d*s,-flow.x*d*s,(row.top-flow.scroll)*d*s);
      c.beginPath();c.rect(0,0,WIDTH,row.height);c.clip();c.fillStyle=row.page.paperColor||'#fffdf8';c.fillRect(0,0,WIDTH,row.height);
      const entry=pictures.get(row.page.id);
      if(imageReady(row))c.drawImage(entry.image,0,0,WIDTH,row.page.pdf.height);
      else{c.fillStyle='#46645b';c.font='24px sans-serif';c.textAlign='center';c.fillText(entry?.status==='error'?'Slayt açılamadı — notlar korunuyor':'Slayt hazırlanıyor…',WIDTH/2,Math.min(row.page.pdf.height/2,120))}
      c.restore();
    }
    const active=rowFor(),entry=pictures.get(active.page.id);
    pdfBackdropState.classList.add('slide-flow-status');pdfBackdropState.hidden=imageReady(active);
    const message=entry?.status==='error'?'Bu slayt görüntüsü açılamadı. Notlar korunuyor; bu sayfada yazı durduruldu.':'Slayt görüntüsü hazırlanıyor.';
    if(pdfBackdropState.textContent!==message)pdfBackdropState.textContent=message;
  }
  function drawInk(){
    if(!ensure())return;
    pruneMediaImages();
    const s=scale(),r=rect(),rows=visibleRows(),bottom=flow.scroll+r.height/s,d=ctx.getTransform().a,pixelScale=s*d;
    const edge=Math.min(512,Math.max(1,Math.floor(512*pixelScale)))/pixelScale,plans=[],wanted=new Set();
    let scratch=null,raster=null,rasterFailed=canvas.width*canvas.height>INK_PIXEL_BUDGET;
    for(const row of rows){
      const phaseX=pixelPhase(-flow.x*pixelScale),phaseY=pixelPhase((row.top-flow.scroll)*pixelScale);
      // Media commits/undo replace the stroke list while this layout is temporary.
      // Replay the active page until selection closes instead of rebuilding its
      // tiles after each edit; idle selection redraws trade that replay for no
      // throwaway cache. Neighbor pages keep their normal bounded tile reuse.
      const direct=rasterFailed||row.page.id===activeId&&(drawing||mediaGesture||mediaPending||mediaSelecting),stamp=direct?null:inkStamp(row.page,pixelScale,phaseX,phaseY);
      const left=Math.max(0,flow.x),right=Math.min(WIDTH,flow.x+r.width/s),top=Math.max(0,flow.scroll-row.top),end=Math.min(row.height,bottom-row.top),tiles=[];
      if(!direct&&stamp.cacheable&&right>left&&end>top){
        for(let iy=Math.floor(top/edge);iy<Math.ceil(end/edge);iy++)for(let ix=Math.floor(left/edge);ix<Math.ceil(right/edge);ix++){
          const key=`${row.page.id}:${ix}:${iy}`,x=ix*edge,y=iy*edge,w=Math.min(edge,WIDTH-x),h=Math.min(edge,row.height-y);
          const bw=x+w>=WIDTH-1e-7?Math.ceil(w*pixelScale+phaseX):Math.round(w*pixelScale),bh=y+h>=row.height-1e-7?Math.ceil(h*pixelScale+phaseY):Math.round(h*pixelScale);
          const bx=Math.round((x-flow.x)*pixelScale-phaseX),by=Math.round((row.top-flow.scroll+y)*pixelScale-phaseY);
          const dx=Math.max(0,bx),dy=Math.max(0,by),dw=Math.min(canvas.width,bx+bw)-dx,dh=Math.min(canvas.height,by+bh)-dy;
          if(dw>0&&dh>0){tiles.push({key,x,y,w,h,bx,by,bw,bh,dx,dy,dw,dh,cropX:dx-bx,cropY:dy-by});wanted.add(key)}
        }
      }
      plans.push({row,direct,stamp,tiles,top,end});
    }
    for(const key of inkTiles.keys())if(!wanted.has(key))dropInk(key);
    // A fresh independent viewport-sized surface avoids the visible canvas's
    // resize/readback raster history. Allocate only on a miss, never read pixels,
    // and keep its extra area bounded independently of the existing tile budget.
    try{
    for(const {row,stamp,tiles} of plans){
      const jobs=[],updates=[];
      for(const box of tiles){
        let tile=inkTiles.get(box.key);
        if(tile&&(tile.stamp!==stamp||tile.w!==box.bw||tile.h!==box.bh)){dropInk(box.key);tile=null}
        if(!tile&&inkPixels+box.bw*box.bh<=INK_PIXEL_BUDGET){
          const surface=document.createElement('canvas');surface.width=box.bw;surface.height=box.bh;
          tile={canvas:surface,pixels:box.bw*box.bh,stamp,w:box.bw,h:box.bh,coverage:null};inkTiles.set(box.key,tile);inkPixels+=tile.pixels;
        }
        if(tile){
          const required={x:box.cropX,y:box.cropY,w:box.dw,h:box.dh};
          const edges={x:stamp.edgeX-box.bx,y:stamp.edgeY-box.by,w:canvas.width-2*stamp.edgeX,h:canvas.height-2*stamp.edgeY};
          // Pixels rasterized against an old viewport edge are not reusable in
          // its interior. Only changed axes need old and new edge repair.
          let have=tile.coverage;
          if(have&&(tile.viewX!==flow.x||tile.viewW!==canvas.width)){for(const edge of [tile.edges,edges])have=inkIntersection(have,{x:edge.x,y:0,w:edge.w,h:tile.h})}
          if(have&&(tile.viewY!==flow.scroll||tile.viewH!==canvas.height)){for(const edge of [tile.edges,edges])have=inkIntersection(have,{x:0,y:edge.y,w:tile.w,h:edge.h})}
          const missing=uncoveredInk(required,have);
          for(const area of missing)jobs.push({tile,area,x:box.bx+area.x,y:box.by+area.y});
          updates.push({tile,coverage:required,edges,viewX:flow.x,viewY:flow.scroll,viewW:canvas.width,viewH:canvas.height});
        }
      }
      if(jobs.length){
        if(!scratch){
          try{scratch=document.createElement('canvas');scratch.width=canvas.width;scratch.height=canvas.height;raster=scratch.getContext('2d')}catch{raster=null}
          if(!raster){rasterFailed=true;clearInk();break}
        }
        const boxes=jobs.map(({x,y,area})=>({x:flow.x+x/pixelScale,y:flow.scroll-row.top+y/pixelScale,w:area.w/pixelScale,h:area.h/pixelScale}));
        raster.setTransform(1,0,0,1,0,0);raster.clearRect(0,0,scratch.width,scratch.height);raster.save();raster.setTransform(d*s,0,0,d*s,-flow.x*d*s,(row.top-flow.scroll)*d*s);
        raster.beginPath();raster.rect(0,0,WIDTH,row.height);raster.clip();paintTile(row.page,stamp,boxes,raster,2/pixelScale);raster.restore();
        for(const {tile,area,x,y} of jobs){const target=tile.canvas.getContext('2d');target.clearRect(area.x,area.y,area.w,area.h);target.drawImage(scratch,x,y,area.w,area.h,area.x,area.y,area.w,area.h)}
      }
      for(const {tile,...update} of updates)Object.assign(tile,update);
    }
    clearInkViewport();
    for(const {row,direct,stamp,tiles,top,end} of plans){
      const fallback=rasterFailed||(direct?row.page.strokes.some(stroke=>!nativePressure(stroke)):!stamp.cacheable||tiles.some(box=>!inkTiles.has(box.key)));
      if(direct||fallback){
        ctx.save();ctx.setTransform(d*s,0,0,d*s,-flow.x*d*s,(row.top-flow.scroll)*d*s);
        ctx.beginPath();ctx.rect(0,0,WIDTH,row.height);ctx.clip();
        // Selection replays the full active row: visibleStroke's half-width
        // margin can omit high-pressure pen caps that still touch the viewport.
        for(const original of row.page.strokes){const stroke=mediaVisualStroke(original);if(fallback||row.page.id===activeId&&mediaSelecting||visibleStroke(stroke,top,end))drawStroke(stroke)}
        if(row.page.id===activeId)drawPendingMedia();ctx.restore();
      }else for(const box of tiles){
        const tile=inkTiles.get(box.key);
        if(tile){ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(tile.canvas,box.cropX,box.cropY,box.dw,box.dh,box.dx,box.dy,box.dw,box.dh);ctx.restore()}
      }
    }
    }finally{if(scratch)scratch.width=scratch.height=1}
  }
  function uncoveredInk(want,have){
    if(!have)return [want];
    const left=Math.max(want.x,have.x),top=Math.max(want.y,have.y),right=Math.min(want.x+want.w,have.x+have.w),bottom=Math.min(want.y+want.h,have.y+have.h);
    if(right<=left||bottom<=top)return [want];
    return [{x:want.x,y:want.y,w:want.w,h:top-want.y},{x:want.x,y:bottom,w:want.w,h:want.y+want.h-bottom},{x:want.x,y:top,w:left-want.x,h:bottom-top},{x:right,y:top,w:want.x+want.w-right,h:bottom-top}].filter(r=>r.w>0&&r.h>0);
  }
  function inkIntersection(a,b){
    if(!a||!b||a.w<=0||a.h<=0||b.w<=0||b.h<=0)return null;
    const x=Math.max(a.x,b.x),y=Math.max(a.y,b.y),right=Math.min(a.x+a.w,b.x+b.w),bottom=Math.min(a.y+a.h,b.y+b.h);
    return right>x&&bottom>y?{x,y,w:right-x,h:bottom-y}:null;
  }
  function clearInkViewport(){ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.restore()}
  function nativePressure(stroke){
    if(stroke.tool!=='pen')return true;
    const points=stroke.points,old=inkPressures.get(stroke);
    // Finished ink is immutable; a live stroke appends points. Reuse the check
    // for finished strokes instead of rescanning every old point while drawing.
    if(old&&old.points===points&&old.count===points.length)return old.native;
    const native=points.every(point=>point.p==null||(Number.isFinite(point.p)&&point.p>=0&&point.p<=1));
    inkPressures.set(stroke,{points,count:points.length,native});return native;
  }
  function inkStamp(p,pixelScale,phaseX,phaseY){
    const strokes=p.strokes,last=strokes.at(-1),revision=pageRevs.get(p)||0;
    const media=[];let radius=0;for(const stroke of strokes){if(stroke.tool==='image'){const image=mediaImages.get(stroke.image);media.push(stroke.image,image,!!image?.complete,image?.naturalWidth||0)}else if(!isMedia(stroke))radius=Math.max(radius,(stroke.width||2)*(stroke.tool==='pen'?.8:.5))}
    const old=inkStamps.get(p);
    // Raster coverage can change when the actual canvas bitmap is resized even
    // if CSS scale and phase return unchanged after closing a media panel.
    if(old&&old.surfaceWidth===canvas.width&&old.surfaceHeight===canvas.height&&old.strokes===strokes&&old.count===strokes.length&&old.last===last&&old.points===last?.points?.length&&old.revision===revision&&old.updated===p.updated&&old.scale===pixelScale&&old.phaseX===phaseX&&old.phaseY===phaseY&&old.media.length===media.length&&old.media.every((value,i)=>value===media[i]))return old;
    // A clipped segment can change its cap coverage beyond the centerline's
    // radius. Keep its entire axis span plus full pressure width untrusted at
    // moving viewport edges; very long segments safely require more replay.
    let spanX=0,spanY=0,cacheable=true;for(const stroke of strokes)if(!isMedia(stroke)){
      // Old JSON readers accepted pressures outside the device's 0..1 range.
      // Preserve their direct-rendered shape; do not normalize or cull it with
      // bounds calculated for a native stylus.
      if(!nativePressure(stroke))cacheable=false;
      for(let i=1;i<stroke.points.length;i++){const point=stroke.points[i];spanX=Math.max(spanX,Math.abs(point.x-stroke.points[i-1].x));spanY=Math.max(spanY,Math.abs(point.y-stroke.points[i-1].y))}
    }
    const stamp={strokes,count:strokes.length,last,points:last?.points?.length,revision,updated:p.updated,scale:pixelScale,phaseX,phaseY,media,cacheable,surfaceWidth:canvas.width,surfaceHeight:canvas.height,edgeX:Math.ceil((spanX+2*radius)*pixelScale)+4,edgeY:Math.ceil((spanY+2*radius)*pixelScale)+4};inkStamps.set(p,stamp);return stamp;
  }
  function paintTile(p,stamp,box,target,bleed){
    const boxes=Array.isArray(box)?box:[box];
    for(const stroke of p.strokes){
      let bound=inkBounds.get(stroke);
      if(!bound||bound.stamp!==stamp){
        if(isMedia(stroke))bound={...mediaBounds(stroke),stamp};
        else{
          let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
          for(const point of stroke.points){left=Math.min(left,point.x);right=Math.max(right,point.x);top=Math.min(top,point.y);bottom=Math.max(bottom,point.y)}
          const margin=Math.max(.5,stroke.width||2);bound={left:left-margin,right:right+margin,top:top-margin,bottom:bottom+margin,stamp};
        }
        inkBounds.set(stroke,bound);
      }
      if(boxes.some(box=>bound.right>=box.x-bleed&&bound.left<=box.x+box.w+bleed&&bound.bottom>=box.y-bleed&&bound.top<=box.y+box.h+bleed))drawStroke(stroke,target);
    }
  }
  addEventListener('bilge-account-locked',reset);
  // The main pagehide handler still has to finish/settle its active gesture and
  // save it. Release decoders without resetting that viewport or its owner.
  addEventListener('pagehide',()=>{for(const entry of pictures.values())disposePicture(entry);pictures.clear();clearInk()});
  return Object.freeze({
    enabled:ensure,scale,ready:imageReadyForActive,preparePointer,point,clip,scroll,settle,setZoom,pinch,drawBackground,drawInk,
    y:()=>ensure()?flow.scroll-rowFor().top:0,x:()=>ensure()?flow.x:0,zoom:()=>ensure()?flow.zoom:1,maxX,
    setX:value=>{if(ensure()&&Number.isFinite(value)){const next=clampX(value);if(next!==flow.x){flow.x=next;changed()}else if(persist()){markViewChanged();scheduleViewSave()}}},
    visiblePages:()=>visibleRows().map(row=>row.page),
    snapshot:()=>ensure()?{scroll:flow.scroll,x:flow.x,zoom:flow.zoom,activeId,totalHeight:flow.total,rows:flow.rows.map(row=>({id:row.page.id,top:row.top,height:row.height})),visible:visibleRows().map(row=>row.page.id),cachedImages:pictures.size,cachedInkTiles:inkTiles.size,inkPixels}:null
  });
})();
